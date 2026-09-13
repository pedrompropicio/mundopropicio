/**
 * (g17) GERADOR ÚNICO DA PRESTAÇÃO DE CONTAS DE UM SÓCIO.
 *
 * Corre no servidor (edge function `partner-statement`, com service_role) e no
 * ERP (mesmo módulo, cliente do browser). Não existe segundo cálculo: o Portal
 * do Sócio deixou de calcular o fecho e passou a consumir o resultado daqui.
 *
 * Duas metades:
 *  • `loadStatementBundle(client, eventId)` — carrega EXACTAMENTE os mesmos
 *    dados que o Encontro de Contas (`PartnerSettlementTab` + `useEventSettlementEngine`),
 *    incluindo o critério de custo gravado no evento (`cost_expense_source`,
 *    `cost_include_overhead`) — nunca uma preferência de ecrã.
 *  • `buildPartnerStatement(bundle, supplierId)` — puro: corre o motor, apura a
 *    linha do sócio (g5), monta a cascata (g13/g13-b) e devolve o
 *    `PartnerStatementDocInput` que os exportadores (PDF/XLSX) já usam, mais o bloco
 *    "O seu fechamento" do Portal e os números do fecho para os cards.
 *
 * Limitação registada: operações de terceiros com `source = 'ab_module'` usam os
 * valores gravados (`gross_amount`, `operator_result`) — o servidor não recalcula
 * o cenário do módulo A&B ao vivo.
 */
import { calcIvaAmount, calcTotalWithIva, roundCents } from "./iva.ts";
import { HOUSE_PARTNER_NAME } from "./house.ts";
import { isTicketingRevenueTx, isValidFechoTransaction } from "./fecho-filters.ts";
import {
  getPartnerRevenueBase,
  ignoresOperationalExpenses,
  normalizePartnerCalcBasis,
  partnerUsesGrossExpenses,
} from "./partner-calc-basis.ts";
import { computeOutsideBpExcess, sumLines } from "./event-cost-basis.ts";
import { expandOverheadToSplits } from "./overhead-proration.ts";
import { expandMasterAdoptedExpensesToSplits } from "./master-adopted-expense-proration.ts";
import { computeEventSettlementTotals, collectSettlementExpenseDocLines } from "./event-settlement-inputs.ts";
import { computeSettlementEngine, type EngineParticipant, type EngineResult } from "./event-settlement-engine.ts";
import { keepRootPerimeter } from "./settlement-perimeter.ts";
import {
  collectBpPaidLines,
  collectDisbursementAdjustments,
  collectRevenuesHeld,
  partnerAdvancedTotal,
  partnerDisbursement,
  partnerFinancingToReturn,
  sumLineAmounts,
  type RevenueHeldRow,
} from "./partner-disbursement.ts";
import {
  buildPartnerStatementDoc,
  statementTerms,
  type DocLocale,
  type PartnerStatementDocInput,
} from "./partner-statement-doc.ts";

const TRANSFER_IVA_RATE = 23;

/** Cliente mínimo (supabase-js) — o browser e o Deno passam o seu. */
export interface StatementDbClient {
  from: (table: string) => any;
}

export interface StatementBundle {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  eventLocation: string | null;
  basis: { withVat: boolean; includeOverhead: boolean; expenseSource: "realized" | "committed" };
  calcBasis: string;
  events: any[];
  transactions: any[];
  forecasts: any[];
  categories: any[];
  settlements: any[];
  participants: any[];
  paidExpenses: any[];
  extras: any[];
  revenuesHeldRaw: RevenueHeldRow[];
  grossDisbursementSupplierIds: string[];
  ticketSales: Array<{ gross: number; net: number }>;
  ticketBreakdown: Array<{ label: string; net: number }>;
  operations: any[];
  participations: any[];
  localeBySupplier: Record<string, DocLocale>;
}

const EVENT_SETTLEMENTS_SELECT =
  "id, name, parent_id, position, notes, parent_share_pct, parent_share_basis, returns_parent_deductible_vat, is_sealed";

/**
 * Select tolerante: `suppliers.doc_locale` não tem GRANT de leitura a
 * `authenticated` (só o servidor, com service_role, o lê). No browser a lista
 * volta vazia e o documento assume pt-PT.
 */
async function softSelect(client: StatementDbClient, table: string, columns: string): Promise<any[]> {
  const { data, error } = await client.from(table).select(columns);
  if (error) return [];
  return (data ?? []) as any[];
}

async function must<T>(p: any): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw new Error(error.message ?? String(error));
  return (data ?? []) as T[];
}

export async function loadStatementBundle(
  client: StatementDbClient,
  eventId: string,
): Promise<StatementBundle> {
  const events = await must<any>(
    client
      .from("events")
      .select(
        "id, name, date, parent_event_id, partner_calc_basis, cost_expense_source, cost_include_overhead, cities(name)",
      )
      .or(`id.eq.${eventId},parent_event_id.eq.${eventId}`),
  );
  const master = events.find((e: any) => e.id === eventId) ?? { id: eventId };
  const allEventIds = events.length ? events.map((e: any) => e.id) : [eventId];
  const calcBasis = normalizePartnerCalcBasis(master.partner_calc_basis);

  const [
    transactions,
    forecasts,
    categories,
    settlements,
    rawParticipants,
    paidExpenses,
    advances,
    manualExtras,
    operations,
    participations,
    suppliers,
  ] = await Promise.all([
    must<any>(
      client
        .from("transactions")
        .select(
          "id, description, amount, iva_rate, type, date, status, event_id, is_transitory, exclude_from_result, reversed_at, is_hidden, category_id, event_settlement_id, held_by_supplier_id, account_id, account_categories(id, name, code, parent_id)",
        )
        .in("event_id", allEventIds),
    ),
    must<any>(
      client
        .from("event_forecasts")
        .select(
          "id, event_id, description, type, amount, iva_rate, status, is_overhead, is_transitory, exclude_from_result, master_forecast_id, transaction_id, paying_partner_id, category_id, event_settlement_id, addback_settlement_id, addback_reason, vat_non_recoverable, account_categories(name, code)",
        )
        .in("event_id", allEventIds)
        .eq("status", "approved")
        .is("version_id", null),
    ),
    must<any>(client.from("account_categories").select("id, name, code, parent_id")),
    must<any>(
      client.from("event_settlements").select(EVENT_SETTLEMENTS_SELECT).eq("event_id", eventId).order("position"),
    ),
    must<any>(
      client
        .from("event_settlement_participants")
        .select(
          "id, event_id, settlement_id, event_partner_id, supplier_id, participant_kind, mode, profit_pct, loss_pct, expense_includes_iva, transfer_with_vat, visible_in_docs, suppliers(name), event_settlements(name, parent_id, position)",
        )
        .in("event_id", allEventIds)
        .order("created_at"),
    ),
    must<any>(
      client
        .from("partner_paid_expenses")
        .select(
          "id, partner_id, event_id, transaction_id, transactions(description, amount, iva_rate, date, type, is_transitory, status, event_id, category_id, account_categories(id, name, code, parent_id))",
        )
        .in("event_id", allEventIds)
        .eq("status", "approved")
        .order("created_at"),
    ),
    must<any>(
      client
        .from("partner_advance_expenses")
        .select(
          "id, partner_id, event_id, transaction_id, created_at, transactions(description, amount, iva_rate, date, event_id, account_categories(name))",
        )
        .in("event_id", allEventIds)
        .order("created_at"),
    ),
    must<any>(
      client
        .from("event_partner_extras")
        .select("id, partner_id, event_id, description, amount, notes, kind, created_at")
        .in("event_id", allEventIds)
        .order("created_at"),
    ),
    must<any>(
      client
        .from("event_third_party_operations")
        .select("id, kind, name, source, gross_amount, operator_result, held_by_supplier_id, event_id")
        .eq("event_id", eventId)
        .order("created_at"),
    ),
    must<any>(
      client
        .from("event_operation_participations")
        .select("id, operation_id, settlement_id, mode, pct, amount")
        .eq("event_id", eventId),
    ),
    softSelect(client, "suppliers", "id, doc_locale"),
  ]);

  // Bilheteira — mesmas queries do Encontro de Contas.
  const zones = await must<any>(
    client.from("event_ticket_zones").select("id, name, event_id, session_id").in("event_id", allEventIds),
  );
  let ticketSales: Array<{ gross: number; net: number }> = [];
  let ticketBreakdown: Array<{ label: string; net: number }> = [];
  if (zones.length) {
    const lots = await must<any>(
      client
        .from("event_ticket_lots")
        .select("id, name, price, iva_rate, zone_id")
        .in("zone_id", zones.map((z: any) => z.id)),
    );
    if (lots.length) {
      const sales = await must<any>(
        client
          .from("ticket_sales")
          .select("lot_id, quantity, unit_price, total_value")
          .in("lot_id", lots.map((l: any) => l.id)),
      );
      const lotById = new Map(lots.map((l: any) => [l.id, l]));
      const byLot: Record<string, number> = {};
      for (const s of sales) {
        const lot: any = lotById.get(s.lot_id);
        const rate = Number(lot?.iva_rate || 0);
        const gross = s.total_value != null ? Number(s.total_value) : Number(s.quantity) * Number(s.unit_price);
        ticketSales.push({ gross, net: gross / (1 + rate / 100) });
        byLot[s.lot_id] = (byLot[s.lot_id] ?? 0) + gross / (1 + rate / 100);
      }
      const zoneById = new Map(zones.map((z: any) => [z.id, z]));
      const eventById = new Map(events.map((e: any) => [e.id, e]));
      ticketBreakdown = lots
        .filter((l: any) => (byLot[l.id] ?? 0) !== 0)
        .map((l: any) => {
          const z: any = zoneById.get(l.zone_id);
          const ev: any = z ? eventById.get(z.event_id) : null;
          const city = ev?.cities?.name || ev?.name || "";
          return { label: [city, z?.name, l.name].filter(Boolean).join(" · "), net: byLot[l.id] ?? 0 };
        });
    }
  }

  // (g5·C) Receitas em poder do sócio — três fontes, iguais às do ERP.
  const partnerAccounts = await must<any>(
    client.from("financial_accounts").select("id, name, partner_id, type").not("partner_id", "is", null),
  );
  const revenuesHeldRaw: RevenueHeldRow[] = [];
  if (partnerAccounts.length) {
    const accById = new Map(partnerAccounts.map((a: any) => [a.id, a]));
    for (const t of transactions) {
      if (t.type !== "income" || !t.account_id || !accById.has(t.account_id)) continue;
      if (t.reversed_at || !(t.status === "paid" || t.status === "approved")) continue;
      const acc: any = accById.get(t.account_id);
      revenuesHeldRaw.push({
        id: t.id,
        partnerId: acc?.partner_id as string,
        source: acc?.partner_id ? "settlement_account" : "partner_account",
        accountName: acc?.name || "—",
        description: t.description || "—",
        amount: Number(t.amount) || 0,
        date: t.date || "",
        eventId: t.event_id ?? null,
      });
    }
  }
  for (const op of operations) {
    if (!op.held_by_supplier_id) continue;
    revenuesHeldRaw.push({
      id: op.id,
      partnerId: `supplier:${op.held_by_supplier_id}`,
      source: "third_party",
      accountName: op.name || "Operação de terceiros",
      description: "Resultado do operador",
      amount: Number(op.operator_result) || 0,
      date: "",
      eventId: op.event_id ?? null,
    });
  }
  for (const t of transactions) {
    if (t.type !== "income" || !t.held_by_supplier_id) continue;
    if (t.reversed_at || !(t.status === "paid" || t.status === "approved")) continue;
    revenuesHeldRaw.push({
      id: t.id,
      partnerId: `supplier:${t.held_by_supplier_id}`,
      source: "compensation",
      accountName: t.description || "Encontro de contas",
      description: t.description || "—",
      amount: Number(t.amount) || 0,
      date: t.date || "",
      eventId: t.event_id ?? null,
    });
  }

  const extras = [
    ...advances.map((row: any) => ({
      id: row.id,
      origem: "transacao" as const,
      partner_id: row.partner_id,
      event_id: row.transactions?.event_id || row.event_id,
      description: row.transactions?.description || "—",
      amount: Number(row.transactions?.amount || 0),
      data: row.transactions?.date || row.created_at || "",
      iva_rate: Number(row.transactions?.iva_rate || 0),
      category: row.transactions?.account_categories?.name ?? null,
      kind: "extra" as const,
    })),
    ...manualExtras.map((row: any) => ({
      id: row.id,
      origem: "manual" as const,
      partner_id: row.partner_id,
      event_id: row.event_id,
      description: row.description || "—",
      amount: Number(row.amount || 0),
      data: row.created_at || "",
      iva_rate: 0,
      category: null,
      kind: row.kind === "disbursement_adjustment" ? ("disbursement_adjustment" as const) : ("extra" as const),
    })),
  ];

  const participants = rawParticipants.map((row: any) => ({
    id: row.event_partner_id ?? row.id,
    participantId: row.id,
    settlement_id: row.settlement_id,
    settlementName: row.event_settlements?.name || "Fechamento do evento",
    supplier_id: row.supplier_id ?? null,
    isHouse: row.participant_kind === "house",
    mode: row.mode,
    percentage: Number(row.profit_pct || 0),
    loss_percentage: row.loss_pct == null ? null : Number(row.loss_pct),
    expense_includes_iva: row.expense_includes_iva ?? null,
    transfer_with_vat: row.transfer_with_vat === true,
    name: row.suppliers?.name || (row.participant_kind === "house" ? HOUSE_PARTNER_NAME : "—"),
  }));

  const localeBySupplier: Record<string, DocLocale> = {};
  for (const s of suppliers) localeBySupplier[s.id] = (s.doc_locale as DocLocale) ?? "pt-PT";

  return {
    eventId,
    eventName: master.name ?? "",
    eventDate: master.date ?? null,
    eventLocation: master.cities?.name ?? null,
    basis: {
      withVat: calcBasis === "net_result_gross_expenses",
      includeOverhead: master.cost_include_overhead ?? true,
      expenseSource: (master.cost_expense_source ?? "committed") as "realized" | "committed",
    },
    calcBasis,
    events,
    transactions,
    forecasts,
    categories,
    settlements,
    participants,
    paidExpenses,
    extras,
    revenuesHeldRaw,
    grossDisbursementSupplierIds: suppliers
      .filter((r: any) => r.doc_locale === "pt-BR")
      .map((r: any) => r.id as string),
    ticketSales,
    ticketBreakdown,
    operations,
    participations,
    localeBySupplier,
  };
}

/** Linha final do sócio (g5) — os mesmos números do Encontro de Contas. */
export interface PartnerAccountLine {
  share: number;
  disbursement: number;
  adjustments: number;
  revenuesHeld: Array<{ label: string; value: number }>;
  totalRevenuesHeld: number;
  extrasTotal: number;
  financingToReturn: number;
  transferBase: number;
  transferVat: number;
  transferTotal: number;
  transferWithVat: boolean;
}

export interface PartnerStatementResult {
  /** Input completo do documento — mesmo objecto que o ERP passa aos exportadores. */
  doc: PartnerStatementDocInput;
  /** Bloco "O seu fechamento" do Portal. */
  block: {
    partnerName: string;
    partnerPct: number;
    othersLabel: string;
    othersPct: number;
    cascade: Array<{ label: string; value: number; kind: "base" | "deduction" | "quota" | "term" | "result" }>;
    account: PartnerAccountLine;
  };
  /** Números do fecho para os cards do Portal (perímetro da raiz). */
  cards: { revenueNet: number; expenses: number; result: number; expensesWithVat: boolean };
}

const REVENUE_HELD_SOURCE_LABEL: Record<string, string> = {
  settlement_account: "Conta de acerto",
  partner_account: "Conta do sócio",
  third_party: "Operação de terceiros",
  compensation: "Encontro de contas",
};

export function buildPartnerStatement(
  bundle: StatementBundle,
  supplierId: string,
  opts: { logoDataUrl?: string | null } = {},
): PartnerStatementResult | null {
  const {
    transactions,
    forecasts,
    events,
    ticketSales,
    basis,
    calcBasis,
    settlements,
    participants,
    paidExpenses,
    extras,
  } = bundle;

  const me = participants.find((p) => p.supplier_id === supplierId && p.mode === "settles");
  if (!me) return null;

  const rootSettlementIds = new Set(settlements.filter((s: any) => !s.parent_id).map((s: any) => s.id as string));

  // ── Motor (mesma montagem do hook do ERP) ─────────────────────────────
  const totals = computeEventSettlementTotals({
    events: events.length ? events : [{ id: bundle.eventId, parent_event_id: null }],
    transactions,
    forecasts,
    ticketSales,
    basis: { includeOverhead: basis.includeOverhead, expenseSource: basis.expenseSource },
  });

  const expenseKind = basis.expenseSource === "committed" ? "bp" : "tx";
  const markedLines = [
    ...transactions
      .filter((t: any) => t.event_settlement_id && isValidFechoTransaction(t))
      .filter((t: any) => t.type === "income" || expenseKind === "tx")
      .map((t: any) => ({
        event_settlement_id: t.event_settlement_id,
        kind: "tx" as const,
        type: t.type as "income" | "expense",
        amount: t.amount,
        iva_rate: t.iva_rate,
      })),
    ...forecasts
      .filter((f: any) => f.event_settlement_id && !f.is_overhead && !f.exclude_from_result && !f.is_transitory)
      .filter((f: any) => f.type === "expense" && expenseKind === "bp")
      .map((f: any) => ({
        event_settlement_id: f.event_settlement_id,
        kind: "bp" as const,
        type: "expense" as const,
        amount: f.amount,
        iva_rate: f.iva_rate,
      })),
  ];

  const addbackLines = forecasts
    .filter((f: any) => f.addback_settlement_id && f.type === "expense" && !f.exclude_from_result && !f.is_transitory)
    .map((f: any) => ({
      addback_settlement_id: f.addback_settlement_id as string,
      label: String(f.description || "Linha do BP"),
      amount: f.amount,
      iva_rate: f.iva_rate,
    }));

  const vatExclusionLines = forecasts
    .filter(
      (f: any) =>
        f.vat_non_recoverable &&
        f.type === "expense" &&
        !f.exclude_from_result &&
        !f.is_transitory &&
        Number(f.iva_rate || 0) > 0,
    )
    .map((f: any) => ({
      event_settlement_id: (f.event_settlement_id ?? null) as string | null,
      label: String(f.description || "Linha do BP"),
      amount: f.amount,
      iva_rate: f.iva_rate,
    }));

  const moneyByPartner: Record<string, any> = {};
  const bump = (key: string) => {
    moneyByPartner[key] = moneyByPartner[key] ?? {
      paidByPartner: 0,
      paidByPartnerGross: 0,
      extras: 0,
      extrasGross: 0,
    };
    return moneyByPartner[key];
  };
  for (const pe of paidExpenses) {
    if (!pe.partner_id || pe.transactions?.is_transitory) continue;
    const m = bump(pe.partner_id);
    const net = Number(pe.transactions?.amount || 0);
    m.paidByPartner += net;
    m.paidByPartnerGross += calcTotalWithIva(net, Number(pe.transactions?.iva_rate || 0));
  }
  for (const ex of extras) {
    const m = bump(ex.partner_id);
    const net = Number(ex.amount || 0);
    m.extras += net;
    m.extrasGross += ex.origem === "transacao" ? calcTotalWithIva(net, Number(ex.iva_rate || 0)) : net;
  }

  const engineParticipants: EngineParticipant[] = participants.map((p) => ({
    id: p.participantId,
    settlement_id: p.settlement_id,
    participant_kind: p.isHouse ? "house" : "partner",
    name: p.name,
    supplier_id: p.supplier_id,
    event_partner_id: p.id,
    mode: p.mode as "settles" | "nominal",
    profit_pct: p.percentage,
    loss_pct: p.loss_percentage,
    expense_includes_iva: p.expense_includes_iva,
  }));

  const engine: EngineResult = computeSettlementEngine({
    eventBasis: calcBasis as any,
    eventTotals: {
      revenueNet: totals.revenueNet,
      expensesNet: totals.expensesNet,
      expensesGross: totals.expensesGross,
    },
    settlements: settlements as any,
    participants: engineParticipants,
    markedLines,
    addbackLines,
    vatExclusionLines,
    moneyByPartner,
    operations: bundle.operations.map((o: any) => ({
      id: o.id,
      kind: o.kind,
      name: o.name,
      source: o.source,
      grossAmount: Number(o.gross_amount || 0),
      operatorResult: Number(o.operator_result || 0),
      attendance: 0,
    })),
    participations: bundle.participations as any,
  });

  const nodes = engine.nodes ?? [];
  const activeNode = nodes.find((n) => n.id === me.settlement_id) ?? null;
  if (!activeNode) return null;

  // ── Totais do fecho no nó do sócio (paridade com o Encontro de Contas) ──
  const hasTicketSales = ticketSales.length > 0;
  const validTx = transactions.filter((t: any) => isValidFechoTransaction(t));
  const incomeTransactions = validTx.filter((t: any) => t.type === "income");
  const adoptedSlices = expandMasterAdoptedExpensesToSplits({
    events: events as any,
    forecasts: forecasts as any,
    transactions: validTx.filter((t: any) => t.type === "expense") as any,
  });
  const adoptedIds = new Set(adoptedSlices.map((s: any) => s._master_transaction_id).filter(Boolean));
  const expenseTransactions = [
    ...validTx.filter((t: any) => t.type === "expense" && !adoptedIds.has(t.id)),
    ...adoptedSlices,
  ];
  const revenueTxForTotals = hasTicketSales
    ? incomeTransactions.filter((t: any) => !isTicketingRevenueTx(t))
    : incomeTransactions;
  const eventRevenueNet =
    (hasTicketSales ? ticketSales.reduce((s, t) => s + t.net, 0) : 0) +
    revenueTxForTotals.reduce((s: number, t: any) => s + Number(t.amount), 0);

  const overheads = expandOverheadToSplits(
    forecasts.filter((f: any) => f.is_overhead) as any,
    events as any,
  );
  const operationalForecasts = forecasts.filter(
    (f: any) =>
      f.type === "expense" &&
      f.status === "approved" &&
      !f.is_transitory &&
      !f.is_overhead &&
      !f.exclude_from_result,
  );
  const expenseSourceLines = basis.expenseSource === "committed" ? operationalForecasts : expenseTransactions;
  const overheadNet = basis.includeOverhead
    ? overheads.reduce((s: number, o: any) => s + Number(o.amount), 0)
    : 0;
  const overheadGross = basis.includeOverhead
    ? overheads.reduce((s: number, o: any) => s + calcTotalWithIva(Number(o.amount), Number(o.iva_rate)), 0)
    : 0;
  const outsideNet =
    basis.expenseSource === "committed" ? computeOutsideBpExcess(operationalForecasts, expenseTransactions, false) : 0;
  const outsideGross =
    basis.expenseSource === "committed" ? computeOutsideBpExcess(operationalForecasts, expenseTransactions, true) : 0;
  const eventExpensesNet = sumLines(expenseSourceLines, false) + overheadNet + outsideNet;
  const eventExpensesGross = sumLines(expenseSourceLines, true) + overheadGross + outsideGross;

  const useNodeTotals = settlements.length > 1;
  const totalRevenueNet = useNodeTotals
    ? activeNode.perimeter.revenueNet +
      activeNode.additionalActiveTotal +
      (activeNode.parentQuota ?? 0) +
      activeNode.vatReturnedIn
    : eventRevenueNet;
  const totalExpensesNet = useNodeTotals ? activeNode.perimeter.expensesNet : eventExpensesNet;
  const totalExpensesGross = useNodeTotals ? activeNode.perimeter.expensesGross : eventExpensesGross;

  const revenueBase = getPartnerRevenueBase(totalRevenueNet);
  const usesGrossExpenses = partnerUsesGrossExpenses(
    calcBasis as any,
    me.expense_includes_iva == null ? null : !!me.expense_includes_iva,
  );
  const expenses = ignoresOperationalExpenses(calcBasis as any)
    ? 0
    : usesGrossExpenses
      ? totalExpensesGross
      : totalExpensesNet;
  const result = ignoresOperationalExpenses(calcBasis as any) ? revenueBase : revenueBase - expenses;
  const effectivePct = result < 0 && me.loss_percentage != null ? me.loss_percentage : me.percentage;
  const partnerShare = result * (effectivePct / 100);

  // ── Linha g5 do sócio ─────────────────────────────────────────────────
  const paidForMe = paidExpenses.filter(
    (pe: any) => pe.partner_id === me.id && !pe.transactions?.is_transitory,
  );
  const totalPaidByPartner = paidForMe.reduce(
    (s: number, pe: any) =>
      s +
      (usesGrossExpenses
        ? calcTotalWithIva(Number(pe.transactions?.amount || 0), Number(pe.transactions?.iva_rate || 0))
        : Number(pe.transactions?.amount || 0)),
    0,
  );
  const disbursementGross = bundle.grossDisbursementSupplierIds.includes(supplierId);
  const paidTxIds = new Set(
    paidExpenses.filter((pe: any) => pe.partner_id === me.id && pe.transaction_id).map((pe: any) => pe.transaction_id),
  );
  const bpPaidLines = collectBpPaidLines(forecasts as any, me.id, disbursementGross, {}, Array.from(paidTxIds) as string[]);
  const disbursement = partnerDisbursement(totalPaidByPartner, sumLineAmounts(bpPaidLines));
  const adjustments = sumLineAmounts(collectDisbursementAdjustments(extras as any, me.id, {}));

  const heldRows = bundle.revenuesHeldRaw.map((r) =>
    r.partnerId === `supplier:${supplierId}` ? { ...r, partnerId: me.id } : r,
  );
  const revenuesHeldRows = collectRevenuesHeld(heldRows, me.id);
  const totalRevenuesHeld = sumLineAmounts(revenuesHeldRows);
  const financingToReturn = partnerFinancingToReturn(disbursement, adjustments, totalRevenuesHeld);

  const extrasForMe = extras.filter((e: any) => e.partner_id === me.id && e.kind !== "disbursement_adjustment");
  const extrasTotal = extrasForMe.reduce(
    (s: number, e: any) =>
      s + (usesGrossExpenses && e.origem === "transacao" ? calcTotalWithIva(Number(e.amount), Number(e.iva_rate || 0)) : Number(e.amount)),
    0,
  );
  const totalAdvanced = partnerAdvancedTotal(extrasTotal);

  const transferBase = roundCents(partnerShare + financingToReturn - totalAdvanced);
  const transferWithVat = me.transfer_with_vat === true;
  const transferVat = transferWithVat && transferBase > 0 ? calcIvaAmount(transferBase, TRANSFER_IVA_RATE) : 0;
  const transferTotal = roundCents(transferBase + transferVat);

  const account: PartnerAccountLine = {
    share: partnerShare,
    disbursement,
    adjustments,
    revenuesHeld: revenuesHeldRows.map((r: any) => ({
      label: `${REVENUE_HELD_SOURCE_LABEL[r.source] ?? r.source} · ${r.accountName}`,
      value: r.amount,
    })),
    totalRevenuesHeld,
    extrasTotal: totalAdvanced,
    financingToReturn,
    transferBase,
    transferVat,
    transferTotal,
    transferWithVat,
  };

  // ── Documento (mesmas regras g13/g13-b do ERP) ─────────────────────────
  const locale: DocLocale = bundle.localeBySupplier[supplierId] ?? "pt-PT";
  const t = statementTerms(locale);

  const expenseLines = keepRootPerimeter(
    collectSettlementExpenseDocLines({
      events: events as any,
      transactions: transactions as any,
      forecasts: forecasts as any,
      ticketSales: ticketSales as any,
      basis: { includeOverhead: basis.includeOverhead, expenseSource: basis.expenseSource },
    }),
    rootSettlementIds,
  ).map((l: any) => ({
    categoryId: l.categoryId,
    description: l.description,
    base: l.base,
    ivaRate: l.ivaRate,
  }));

  const revenues = [
    ...bundle.ticketBreakdown.map((r) => ({ origin: t.ticketing, description: r.label, net: r.net })),
    ...keepRootPerimeter(revenueTxForTotals as any, rootSettlementIds).map((tx: any) => ({
      origin: tx.account_categories?.name || "Outras receitas",
      description: tx.description || "—",
      net: Number(tx.amount) || 0,
    })),
  ];

  const chain: typeof nodes = [];
  for (let cur = activeNode; cur?.parentId; cur = nodes.find((n) => n.id === cur!.parentId) ?? null) {
    chain.unshift(cur);
  }
  const cascade =
    chain.length > 0
      ? {
          levels: chain.map((node) => {
            const parent = nodes.find((n) => n.id === node.parentId) ?? null;
            const baseValue =
              node.parentQuotaBasis === "net_result_gross_expenses" ? parent?.resultGross ?? 0 : parent?.resultNet ?? 0;
            return {
              baseValue,
              quotaPct: Number(node.parentSharePct ?? 0),
              quota: Number(node.parentQuota ?? 0),
              deductions: (parent?.participants ?? [])
                .filter((p) => p.kind !== "house" && p.name !== me.name)
                .map((p) => ({ name: p.name, percentage: p.effectivePct, value: p.share })),
            };
          }),
        }
      : null;

  const exclusiveRevenues = incomeTransactions
    .filter((tx: any) => tx.event_settlement_id && tx.event_settlement_id === activeNode.id)
    .map((tx: any) => ({ label: tx.description || tx.account_categories?.name || "—", value: Number(tx.amount) || 0 }));

  const docExtras: Array<{ label: string; value: number; items?: Array<{ label: string; value: number }> }> = [];
  if (activeNode.vatReturnedIn) docExtras.push({ label: "IVA dedutível recuperado", value: activeNode.vatReturnedIn });
  if (cascade && activeNode.perimeter.revenueNet)
    docExtras.push({
      label: "Receitas exclusivas da sociedade",
      value: activeNode.perimeter.revenueNet,
      items: exclusiveRevenues,
    });
  if (activeNode.addbackIn)
    docExtras.push({ label: "Custos internos da sociedade", value: activeNode.addbackIn });
  if (activeNode.additionalActiveTotal)
    docExtras.push({
      label: "Operações de terceiros — resultado adicional",
      value: activeNode.additionalActiveTotal,
      items: (activeNode.operations ?? [])
        .filter((o: any) => Math.abs(o.additionalActive) > 0.004)
        .map((o: any) => ({ label: o.name, value: o.additionalActive })),
    });

  const nodeParticipants = participants.filter((p) => p.settlement_id === me.settlement_id);
  const othersPct = Math.round((100 - Number(me.percentage || 0)) * 10000) / 10000;
  const onlyHouseLeft = nodeParticipants.filter((p) => !p.isHouse && p.supplier_id !== supplierId).length === 0;

  const doc: PartnerStatementDocInput = {
    locale,
    eventName: bundle.eventName,
    eventDate: bundle.eventDate,
    eventLocation: bundle.eventLocation,
    logoDataUrl: opts.logoDataUrl ?? null,
    recipientName: me.name,
    paidByPartner: disbursement,
    disbursementAdjustments: adjustments,
    revenuesHeld: account.revenuesHeld,
    partnerExtras: totalAdvanced,
    partnerAdvances: 0,
    transferWithVat,
    participants: nodeParticipants
      .filter((p) => Number(p.percentage || 0) > 0.0001 || !p.isHouse)
      .map((p) => ({ name: p.name, percentage: p.percentage, isHouse: p.isHouse })),
    categories: bundle.categories as any,
    usesGrossExpenses: activeNode.nodeUsesGrossExpenses ?? usesGrossExpenses,
    returnsDeductibleVat: activeNode.returnsParentDeductibleVat ?? false,
    expenseLines,
    revenues,
    extras: docExtras,
    cascade,
    resultOverride: result,
    recipientShareOverride: partnerShare,
    totalRevenuesHeldOverride: totalRevenuesHeld,
    financingToReturnOverride: financingToReturn,
    transferBaseOverride: transferBase,
    transferVatOverride: transferVat,
    transferTotalOverride: transferTotal,
  } as PartnerStatementDocInput;

  // Bloco resumido do Portal — cascata pelos mesmos números do motor.
  const blockCascade: PartnerStatementResult["block"]["cascade"] = [];
  if (cascade) {
    const first = cascade.levels[0];
    blockCascade.push({ label: `Resultado do evento`, value: first.baseValue, kind: "base" });
    for (const lvl of cascade.levels) {
      for (const d of lvl.deductions)
        blockCascade.push({ label: `${d.name} — ${d.percentage}%`, value: -d.value, kind: "deduction" });
      blockCascade.push({ label: `Parte da sociedade — ${lvl.quotaPct}%`, value: lvl.quota, kind: "quota" });
    }
  } else {
    blockCascade.push({ label: "Resultado do evento", value: result, kind: "base" });
  }
  for (const e of docExtras) blockCascade.push({ label: e.label, value: e.value, kind: "term" });
  blockCascade.push({ label: "Resultado", value: result, kind: "result" });
  blockCascade.push({ label: `A sua parte — ${effectivePct}%`, value: partnerShare, kind: "result" });

  return {
    doc,
    block: {
      partnerName: me.name,
      partnerPct: Number(me.percentage || 0),
      othersLabel: onlyHouseLeft ? HOUSE_PARTNER_NAME : "Sócios locais",
      othersPct,
      cascade: blockCascade,
      account,
    },
    cards: {
      revenueNet: revenueBase,
      expenses,
      result,
      expensesWithVat: usesGrossExpenses,
    },
  };
}
