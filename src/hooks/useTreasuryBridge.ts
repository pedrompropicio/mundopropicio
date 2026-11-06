import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { useEventStages } from "@/hooks/useEventStages";
import { useBusinessLines } from "@/hooks/useBusinessLines";
import { supabase } from "@/integrations/supabase/client";
import { FINANCIAL_POSITION_PERMISSION } from "@/lib/financial-position";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { computeTicketOfficeBalance } from "@/lib/ticket-office-balance";
import { residualHousePct } from "@/lib/settlement-participants";
import { buildPartnerStatement, computeStatementEngine, loadStatementBundle, type StatementDbClient } from "@shared/settlement/statement-service.ts";
import { computeSettlementRevenue } from "@shared/settlement/settlement-revenue.ts";
import { isValidFechoTransaction } from "@shared/settlement/fecho-filters.ts";
import { parseFinancialPosition } from "@/lib/financial-position";
import { partnerDirection } from "@shared/financial-position/assemble.ts";
import {
  buildTreasuryBridge, resolveTreasuryResult, treasuryNumber, TREASURY_STAGES,
  type TreasuryRetainedOffice, type TreasuryCashRow, type TreasuryEvent, type TreasuryEventResult, type TreasuryPeriod,
} from "@/lib/treasury-bridge";

type TreasuryClient = StatementDbClient & { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };
const db = supabase as unknown as TreasuryClient;
async function checked<T>(request: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const response = await request;
  if (response.error) throw response.error;
  if (response.data === null) throw new Error("Leitura indisponível na Tesouraria.");
  return response.data;
}

/** Uma fila partilhada por todas as queryFns do ecrã, incluindo tentativas de atualização. */
export function createTreasuryQueue() {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(work: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const start = () => { active++; resolve(); };
      if (active < 4) start(); else waiting.push(start);
    });
    try { return await work(); }
    finally { active--; waiting.shift()?.(); }
  };
}

/** Mesmo contrato pago da P5: só o saldo de contratos ativos, sem transações revertidas. */
async function paidTreasuryContracts(client: TreasuryClient, companyId: string, eventId: string): Promise<Record<string, number>> {
  const contracts = await checked<any[]>(fetchAllPagedQuery(client.from("partner_payment_contracts")
    .select("event_id, beneficiary_supplier_id, balance_tx_id").eq("company_id", companyId).eq("event_id", eventId).is("cancelled_at", null)));
  const ids = [...new Set<string>(contracts.map((c) => c.balance_tx_id).filter(Boolean))];
  const paid = new Map<string, number>();
  for (let index = 0; index < ids.length; index += 200) {
    const transactions = await checked<any[]>(client.from("transactions").select("id, paid_amount")
      .eq("company_id", companyId).in("id", ids.slice(index, index + 200)).is("reversed_at", null).limit(200));
    for (const transaction of transactions) paid.set(transaction.id, treasuryNumber(transaction.paid_amount ?? 0));
  }
  const totals: Record<string, number> = {};
  for (const contract of contracts) totals[contract.beneficiary_supplier_id] = (totals[contract.beneficiary_supplier_id] ?? 0) + (paid.get(contract.balance_tx_id) ?? 0);
  return totals;
}

export async function loadTreasuryEvent(client: TreasuryClient, companyId: string, eventId: string, stage: string): Promise<TreasuryEventResult> {
  const [loadedBundle, seals, paid, budgetMode] = await Promise.all([
    loadStatementBundle(client, eventId),
    stage === "fechado" ? checked<any[]>(fetchAllPagedQuery(client.from("event_settlements")
      .select("id, parent_id, is_sealed, sealed_snapshot").eq("event_id", eventId))) : Promise.resolve([]),
    paidTreasuryContracts(client, companyId, eventId),
    checked<string>(client.rpc("event_budget_mode", { _event_id: eventId })),
  ]);
  if (!["with_bp", "without_bp"].includes(budgetMode)) throw new Error("Modo orçamental indisponível.");
  // #644a: a base efetiva sem BP é realizado, como useEventCostBasis; o cálculo continua no motor único.
  const bundle = budgetMode === "without_bp" ? { ...loadedBundle, basis: { ...loadedBundle.basis, expenseSource: "realized" as const } } : loadedBundle;
  const result = resolveTreasuryResult(stage, seals, () => {
    const engine = computeStatementEngine(bundle);
    if (engine.errors.length || !engine.c1.ok || !engine.c2.ok) throw new Error(`Motor incompleto: ${bundle.eventName}`);
    return engine.eventNetResult;
  });
  const seen = new Set<string>();
  let partnersDue = 0;
  for (const participant of bundle.participants) {
    if (participant.isHouse || participant.mode !== "settles" || !participant.supplier_id || seen.has(participant.supplier_id)) continue;
    seen.add(participant.supplier_id);
    const statement = buildPartnerStatement(bundle, participant.supplier_id);
    if (!statement) throw new Error(`Conta do sócio indisponível: ${participant.name}`);
    const account = statement.block.account;
    treasuryNumber(account.transferBase); treasuryNumber(account.transferTotal);
    const direction = partnerDirection(account, paid[participant.supplier_id] ?? 0);
    if (direction.sentido === "por_liquidar") partnersDue += direction.valor;
  }
  // O mesmo núcleo de computeStatementEngine, com o mesmo bundle já carregado.
  // Os snapshots antigos não contêm esta composição.
  const revenue = result.source === "base corrente" && Array.isArray(bundle.transactions) && Array.isArray(bundle.forecasts) && Array.isArray(bundle.ticketSales)
    ? computeSettlementRevenue({ ticketSales: bundle.ticketSales, incomeTransactions: bundle.transactions.filter(isValidFechoTransaction), incomeForecasts: bundle.forecasts }) : null;
  const ticketingNet = revenue ? revenue.buckets.bilheteira.net + revenue.houseOnlyLines.filter((line) => line.bucket === "bilheteira").reduce((sum, line) => sum + line.net, 0) : 0;
  return { ...result, partnersDue, housePct: residualHousePct(bundle.participants), ...(revenue ? { revenue: {
    net: revenue.eventRevenueNet, ticketingNet, ticketingSource: revenue.buckets.bilheteira.source,
    ticketingRecognized: [...revenue.lines, ...revenue.houseOnlyLines].some((line) => line.bucket === "bilheteira" && line.net !== 0), expenseSource: bundle.basis.expenseSource,
  } } : {}) };

}

/** As quatro leituras de movimentos são da empresa inteira; por conta só a RPC de vendas. */
export async function loadTreasuryRetained(client: TreasuryClient, companyId: string): Promise<Record<string, number>> {
  return (await loadTreasuryRetainedDetails(client, companyId)).byEvent;
}

export async function loadTreasuryRetainedDetails(client: TreasuryClient, companyId: string): Promise<{ byEvent: Record<string, number>; offices: TreasuryRetainedOffice[] }> {
  const accounts = await checked<any[]>(fetchAllPagedQuery(client.from("financial_accounts").select("id, name")
    .eq("company_id", companyId).eq("type", "ticket_office")));
  if (!accounts.length) return { byEvent: {}, offices: [] };
  const officeIds = accounts.map((a) => a.id);
  const [balances, assignments, transactions, advances] = await Promise.all([
    checked<any[]>(client.rpc("ticket_office_balances", { _account_ids: officeIds })),
    checked<any[]>(fetchAllPagedQuery(client.from("event_ticket_office_assignments").select("id, event_id, financial_account_id").in("financial_account_id", officeIds))),
    checked<any[]>(fetchAllPagedQuery(client.from("transactions")
      .select("id, account_id, type, paid_amount, status, event_id, reversed_at, is_hidden").eq("company_id", companyId).in("account_id", officeIds), { maxRows: Number.POSITIVE_INFINITY })),
    checked<any[]>(fetchAllPagedQuery(client.from("event_ticket_office_advances")
      .select("id, financial_account_id, event_id, amount, transaction_id, settlement_id").in("financial_account_id", officeIds))),
  ]);
  // NULL é o portão canónico de saldos: nunca contorná-lo calculando o valor escondido.
  for (const id of officeIds) {
    const balance = balances.find((b) => b.account_id === id);
    if (!balance || balance.balance == null) throw new Error("Saldo de bilheteira indisponível para o seu perfil ou sem controlo de saldo.");
    treasuryNumber(balance.balance);
  }
  const run = createTreasuryQueue();
  const officeBalances = await Promise.all(officeIds.map((officeId) => run(async () => {
    const sales = await checked<any[]>(client.rpc("get_ticket_office_sales", { p_account_id: officeId }));
    return computeTicketOfficeBalance({
      officeId,
      assignedEventIds: assignments.filter((a) => a.financial_account_id === officeId).map((a) => a.event_id),
      sales: sales.map((s) => ({ event_id: s.event_id, financial_account_id: officeId, quantity: treasuryNumber(s.quantity), unit_price: 0, total_value: treasuryNumber(s.revenue) })),
      transactions, advances: advances.filter((a) => a.financial_account_id === officeId),
    });
  })));
  const retained: Record<string, number> = {};
  for (const office of officeBalances) for (const [eventId, amount] of Object.entries(office.byEvent)) retained[eventId] = (retained[eventId] ?? 0) + amount;
  return { byEvent: retained, offices: officeBalances.map((balance, index) => ({
    accountId: officeIds[index], name: accounts[index].name ?? officeIds[index], ...balance,
  })) };
}

export interface TreasuryConferenceTransaction {
  id: string; event_id: string | null; account_id: string | null; type: string; status: string;
  amount: number; paid_amount: number; date: string; payment_date: string | null; due_date: string | null;
  reversed_at: string | null; is_hidden: boolean; is_transitory: boolean; exclude_from_result: boolean;
  event_settlement_id: string | null;
}
export interface TreasuryConferencePayment {
  id: string; transaction_id: string; account_id: string | null; amount: number;
  withholding_amount: number; credit_amount: number; payment_date: string;
  status: string; reversed_at: string | null;
}
export async function loadTreasuryConference(client: TreasuryClient, companyId: string) {
  const [accounts, transactions, payments, position] = await Promise.all([
    checked<{ id: string; name: string; type: string; skip_balance_check: boolean }[]>(fetchAllPagedQuery(client.from("financial_accounts")
      .select("id, name, type, skip_balance_check").eq("company_id", companyId))),
    checked<TreasuryConferenceTransaction[]>(fetchAllPagedQuery(client.from("transactions")
      .select("id, event_id, account_id, type, status, amount, paid_amount, date, payment_date, due_date, reversed_at, is_hidden, is_transitory, exclude_from_result, event_settlement_id")
      .eq("company_id", companyId), { maxRows: Number.POSITIVE_INFINITY })),
    checked<TreasuryConferencePayment[]>(fetchAllPagedQuery(client.from("transaction_payments")
      .select("id, transaction_id, account_id, amount, withholding_amount, credit_amount, payment_date, status, reversed_at")
      .eq("company_id", companyId), { maxRows: Number.POSITIVE_INFINITY })),
    checked<unknown>(client.rpc("get_financial_position_base", { p_company_id: companyId, p_year: null })),
  ]);
  // Detalhes individuais, sem recriar os agregados do RPC ou da DRE no cliente.
  return { accounts, transactions: transactions.map((transaction) => ({
    ...transaction, amount: treasuryNumber(transaction.amount), paid_amount: treasuryNumber(transaction.paid_amount ?? 0),
  })), payments: payments.map((payment) => ({
    ...payment, amount: treasuryNumber(payment.amount), withholding_amount: treasuryNumber(payment.withholding_amount ?? 0), credit_amount: treasuryNumber(payment.credit_amount ?? 0),
  })), position: parseFinancialPosition(position) };
}

export function useTreasuryBridge(period: TreasuryPeriod, validPeriod = true, showConference = false) {
  const { user, hasPermission, permissions, loading: authLoading } = useAuth();
  const { companyId, isLoading: companyLoading, isError: companyError } = useCompany();
  const stages = useEventStages();
  const businessLines = useBusinessLines();
  const queryClient = useQueryClient();
  const enabled = !authLoading && !!user && hasPermission(FINANCIAL_POSITION_PERMISSION) && !!companyId && !companyLoading && !companyError;
  const scope = [companyId, user?.id, permissions];
  const run = useMemo(() => createTreasuryQueue(), []);
  const events = useQuery({
    queryKey: ["treasury-bridge-events", ...scope], enabled, retry: false, staleTime: 30_000,
    queryFn: () => checked<TreasuryEvent[]>(fetchAllPagedQuery(db.from("events").select("*").eq("company_id", companyId))),
  });
  const retained = useQuery({
    queryKey: ["treasury-bridge-retained", ...scope], enabled, retry: false, staleTime: 30_000,
    queryFn: () => loadTreasuryRetainedDetails(db, companyId!),
  });
  const cash = useQuery({
    queryKey: ["treasury-bridge-cash", ...scope, period.from, period.to], enabled: enabled && validPeriod, retry: false, staleTime: 30_000,
    queryFn: async () => {
      const rows = await checked<any[]>(db.rpc("get_event_cash_position", { p_company_id: companyId, p_date_from: period.from, p_date_to: period.to }));
      return rows.map((r): TreasuryCashRow => {
        if (!["event", "common"].includes(r.level) || (r.level === "event" && !r.event_id)) throw new Error("Posição no pool inválida.");
        return { ...r, committed: treasuryNumber(r.committed), realized: treasuryNumber(r.realized), pending: treasuryNumber(r.pending) };
      });
    },
  });
  const conference = useQuery({
    queryKey: ["treasury-bridge-conference", ...scope], enabled: enabled && showConference, retry: false, staleTime: 30_000,
    queryFn: () => loadTreasuryConference(db, companyId!),
  });
  const masters = (events.data ?? []).filter((e) => !e.parent_event_id && stages.data && TREASURY_STAGES.has(stages.data[e.id]));
  const results = useQueries({ queries: masters.map((e) => ({
    queryKey: ["treasury-bridge-event-result", ...scope, e.id, stages.data?.[e.id]],
    enabled, retry: false, staleTime: 60_000,
    queryFn: () => run(() => loadTreasuryEvent(db, companyId!, e.id, stages.data![e.id])),
  })) });
  const errors = [companyError && new Error("Não foi possível identificar a empresa."), events.error, stages.error, businessLines.error, cash.error, retained.error, ...results.map((r) => r.error)].filter(Boolean);
  const loaded = results.filter((r) => r.isSuccess).length;
  const loading = !enabled || !events.isSuccess || !stages.isSuccess || !businessLines.isSuccess || !retained.isSuccess || !cash.isSuccess || loaded !== masters.length;
  let bridge = null;
  if (enabled && validPeriod && !loading && !errors.length) {
    try {
      bridge = buildTreasuryBridge({ events: events.data!, stages: stages.data!, businessLines: businessLines.data!, cash: cash.data!, retained: retained.data!.byEvent, retainedOffices: retained.data!.offices,
        results: Object.fromEntries(masters.map((e, i) => [e.id, results[i].data!])) });
    } catch (error) { errors.push(error); }
  }
  return {
    conference: showConference ? conference : undefined, bridge, loading, error: errors[0], loaded, total: masters.length,
    refreshing: [events, stages, businessLines, cash, retained, conference, ...results].some((q) => q.isFetching),
    refresh: () => Promise.all([
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("treasury-bridge-") }),
      stages.refetch(), businessLines.refetch(),
    ]),
  };
}
