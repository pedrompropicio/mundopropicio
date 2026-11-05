import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { useBusinessLines } from "@/hooks/useBusinessLines";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { computeTicketOfficeBalance } from "@/lib/ticket-office-balance";
import { residualHousePct } from "@/lib/settlement-participants";
import { stageMapFromRows } from "@/lib/event-stage";
import { buildTreasuryBridge, treasuryEventResult, type TreasuryCashRow, type TreasuryMaster } from "@/lib/treasury-bridge";
import { loadStatementBundle, computeStatementEngine, buildPartnerStatement } from "@shared/settlement/statement-service";
import { partnerDirection } from "@shared/financial-position/assemble";

const db = supabase as any;
const numeric = (v: unknown): number => {
  if ((typeof v !== "number" && typeof v !== "string") || v === "" || !Number.isFinite(Number(v))) throw new Error("Valor financeiro indisponível.");
  return Number(v);
};
async function fetchAllPagedTreasuryRows<T = any>(query: any): Promise<T[]> {
  // The shared pager stops at maxRows. Reject at that boundary instead of presenting a partial bridge.
  const { data, error } = await fetchAllPagedQuery<T>(query);
  if (error) throw error;
  if ((data?.length ?? 0) >= 50_000) throw new Error("Leitura incompleta: limite de paginação atingido.");
  return data ?? [];
}
async function rpc(name: string, args?: object): Promise<any[]> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(`Resposta inválida: ${name}`);
  return data;
}

/** Worker pool also used around cached fetchQuery calls: at most four bundles in flight. */
export async function loadTreasuryMasters<T, R>(items: T[], load: (item: T) => Promise<R>, progress: (done: number) => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await load(items[i]);
      progress(++done);
    }
  }));
  return out;
}

export async function loadTreasuryMaster(event: { id: string; name: string; business_line_id: string | null }, stage: string) {
  const seals = stage === "fechado" ? await fetchAllPagedTreasuryRows(db.from("event_settlements")
    .select("id, sealed_snapshot").eq("event_id", event.id).is("parent_id", null).eq("is_sealed", true)) : [];
  const bundle = await loadStatementBundle(db, event.id);
  const result = treasuryEventResult(stage, seals.map(s => s.sealed_snapshot), () => computeStatementEngine(bundle).eventNetResult);
  const rootIds = new Set(bundle.settlements.filter(s => !s.parent_id).map(s => s.id));
  const suppliers = [...new Set<string>(bundle.participants.filter(p => !p.isHouse && p.mode === "settles" && p.supplier_id).map(p => p.supplier_id))];
  const partners = suppliers.map(id => {
    const statement = buildPartnerStatement(bundle, id);
    if (!statement) throw new Error(`Conta do sócio indisponível no evento ${event.name}.`);
    return { supplierId: id, ...statement.block.account };
  });
  return {
    id: event.id, name: event.name, businessLineId: event.business_line_id,
    ...result, participation: residualHousePct(bundle.participants.filter(p => rootIds.has(p.settlement_id))), partners,
  };
}

export async function loadTreasuryPaidContracts(companyId: string): Promise<Record<string, number>> {
  const contracts = await fetchAllPagedTreasuryRows(db.from("partner_payment_contracts").select("id, event_id, beneficiary_supplier_id, balance_tx_id")
    .eq("company_id", companyId).is("cancelled_at", null));
  const ids = [...new Set(contracts.map(c => c.balance_tx_id).filter(Boolean))];
  const paid = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const txs = await fetchAllPagedTreasuryRows(db.from("transactions").select("id, paid_amount").eq("company_id", companyId)
      .in("id", ids.slice(i, i + 200)).is("reversed_at", null));
    txs.forEach(t => paid.set(t.id, numeric(t.paid_amount ?? 0)));
  }
  const out: Record<string, number> = {};
  contracts.forEach(c => {
    const key = `${c.event_id}:${c.beneficiary_supplier_id}`;
    out[key] = (out[key] ?? 0) + (paid.get(c.balance_tx_id) ?? 0);
  });
  return out;
}

export async function loadTreasuryRetained(companyId: string) {
  const offices = await fetchAllPagedTreasuryRows(db.from("financial_accounts").select("id").eq("company_id", companyId).eq("type", "ticket_office"));
  const byEvent: Record<string, number> = {};
  let residual = 0;
  if (!offices.length) return { byEvent, residual };
  const balances = await rpc("ticket_office_balances", { _account_ids: offices.map(a => a.id) });
  // Respect the balance RPC's visibility/skip gate before reading the composition.
  for (const office of offices) {
    numeric(balances.find(b => b.account_id === office.id)?.balance);
  }
  await loadTreasuryMasters(offices, async office => {
    const [assignments, sales, txs, advances] = await Promise.all([
      fetchAllPagedTreasuryRows(db.from("event_ticket_office_assignments").select("id, event_id").eq("financial_account_id", office.id)),
      rpc("get_ticket_office_sales", { p_account_id: office.id }),
      fetchAllPagedTreasuryRows(db.from("transactions").select("id, account_id, type, paid_amount, status, event_id, reversed_at, is_hidden").eq("account_id", office.id)),
      fetchAllPagedTreasuryRows(db.from("event_ticket_office_advances").select("id, event_id, amount, transaction_id, settlement_id").eq("financial_account_id", office.id).is("settlement_id", null)),
    ]);
    const balance = computeTicketOfficeBalance({
      officeId: office.id, assignedEventIds: assignments.map(a => a.event_id), transactions: txs, advances,
      sales: sales.map(s => ({ event_id: s.event_id, financial_account_id: office.id, quantity: numeric(s.quantity), unit_price: 0, total_value: numeric(s.revenue) })),
    });
    Object.entries(balance.byEvent).forEach(([id, value]) => { byEvent[id] = (byEvent[id] ?? 0) + value; });
    residual += numeric(balances.find(b => b.account_id === office.id)?.balance) - Object.values(balance.byEvent).reduce((a, b) => a + b, 0);
  }, () => {});
  return { byEvent, residual };
}

export function useTreasuryBridge(from: string | null, to: string | null, validPeriod = true) {
  const { user, loading, hasPermission } = useAuth();
  const company = useCompany();
  const lines = useBusinessLines();
  const client = useQueryClient();
  const allowed = !loading && hasPermission("view_financial_position");
  const enabled = allowed && !!user && !!company.companyId && !company.isLoading && !company.isError;
  const scope = [company.companyId, user?.id, allowed] as const;
  const [progress, setProgress] = useState({ key: "", done: 0 });
  const catalog = useQuery({
    queryKey: ["treasury-bridge-catalog", ...scope], enabled, staleTime: 30_000, retry: false,
    queryFn: async () => {
      const [events, stages] = await Promise.all([
        fetchAllPagedTreasuryRows(db.from("events").select("id, name, parent_event_id, business_line_id").eq("company_id", company.companyId)),
        rpc("event_stage_list"),
      ]);
      const map = stageMapFromRows(stages);
      const roots = events.filter(e => !e.parent_event_id);
      if (roots.some(e => !map[e.id])) throw new Error("Estágio de evento indisponível.");
      const masters = roots.filter(e => ["em_curso", "em_fecho", "fechado", "planeamento"].includes(map[e.id]));
      return { events, masters, stages: map };
    },
  });
  const masterKey = JSON.stringify([scope, catalog.data?.masters.map(e => [e.id, e.business_line_id, catalog.data?.stages[e.id]])]);
  const masters = useQuery({
    queryKey: ["treasury-bridge-masters", ...scope, masterKey], enabled: enabled && !!catalog.data,
    staleTime: 30_000, retry: false,
    queryFn: async ({ signal }) => {
      setProgress({ key: masterKey, done: 0 });
      return loadTreasuryMasters(catalog.data!.masters, e => client.fetchQuery({
        queryKey: ["treasury-bridge-event", ...scope, e.id, e.business_line_id, catalog.data!.stages[e.id]],
        queryFn: () => loadTreasuryMaster(e, catalog.data!.stages[e.id]), staleTime: 30_000,
      }), done => { if (!signal.aborted) setProgress({ key: masterKey, done }); });
    },
  });
  const cash = useQuery({
    queryKey: ["treasury-bridge-cash", ...scope, from, to], enabled: enabled && validPeriod,
    staleTime: 30_000, retry: false,
    queryFn: async (): Promise<TreasuryCashRow[]> => (await rpc("get_event_cash_position", {
      p_company_id: company.companyId, p_date_from: from, p_date_to: to,
    })).map(r => {
      if (!["event", "common"].includes(r.level) || (r.level === "event" && !r.event_id)) throw new Error("Posição de caixa inválida.");
      return { ...r, committed: numeric(r.committed), realized: numeric(r.realized), pending: numeric(r.pending) };
    }),
  });
  const retained = useQuery({ queryKey: ["treasury-bridge-retained", ...scope], enabled, staleTime: 30_000, retry: false, queryFn: () => loadTreasuryRetained(company.companyId!) });
  const paid = useQuery({ queryKey: ["treasury-bridge-paid-contracts", ...scope], enabled, staleTime: 30_000, retry: false, queryFn: () => loadTreasuryPaidContracts(company.companyId!) });
  const queries = [catalog, masters, cash, retained, paid, lines];
  const error = company.error ?? queries.find(q => q.error)?.error;
  const ready = enabled && validPeriod && !error && catalog.data && masters.data && cash.data && retained.data && paid.data && lines.data;
  const data = ready ? buildTreasuryBridge({
    masters: masters.data!.map((m): TreasuryMaster => ({ ...m, partners: m.partners.reduce((sum, p) => {
      const direction = partnerDirection(p, paid.data![`${m.id}:${p.supplierId}`] ?? 0);
      return sum + (direction.sentido === "por_liquidar" ? direction.valor : 0);
    }, 0) })),
    cash: cash.data!, retained: retained.data!.byEvent, events: catalog.data!.events, businessLines: lines.data!,
  }) : null;
  const includedIds = new Set(data?.company.children.flatMap(l => l.children.flatMap(m => m.children.map(e => e.id))) ?? []);
  const retainedOutside = retained.data ? retained.data.residual + Object.entries(retained.data.byEvent).filter(([id]) => !includedIds.has(id)).reduce((sum, [, value]) => sum + value, 0) : null;
  return {
    data, error, companyId: company.companyId, companyMissing: !company.isLoading && !company.companyId,
    isLoading: company.isLoading || queries.some(q => q.isLoading), isFetching: queries.some(q => q.isFetching),
    progress: { done: progress.key === masterKey ? progress.done : 0, total: catalog.data?.masters.length ?? 0 }, retainedOutside,
    refresh: async () => {
      await client.invalidateQueries({ queryKey: ["treasury-bridge-event"], refetchType: "none" });
      await Promise.all(["treasury-bridge-catalog", "treasury-bridge-masters", "treasury-bridge-cash", "treasury-bridge-retained", "treasury-bridge-paid-contracts", "business-lines"].map(key => client.invalidateQueries({ queryKey: [key] })));
    },
  };
}
