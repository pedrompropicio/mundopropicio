/**
 * #335 fase 3b — leituras para o modal "Encontro de contas".
 * Todas paginadas (barreira dos 1.000 do PostgREST) com ordenação total; se o limite de
 * segurança for atingido, LANÇA erro — nunca se monta prévia com lista truncada.
 * Só leitura; nenhuma escrita.
 */
import type { QueryClient } from "@tanstack/react-query";
import { invalidateEventFinancials } from "@/lib/invalidate-event-financials";
import { checkOffsetEligibility, type OffsetEligibilityResult, type OffsetEligibilitySnapshot } from "./eligibility";
import type { OffsetDocumentInput } from "./index";

const PAGE = 1000;
const MAX_ROWS = 20000;
const ID_CHUNK = 200;

export class TruncatedReadError extends Error {
  constructor(what: string) {
    super(`Leitura incompleta de ${what}: demasiadas linhas. Prévia não montada.`);
  }
}

/** Paginação completa; lança se o limite for atingido. `build` tem de ordenar por id. */
export async function readAllPages<T>(
  what: string,
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) return all;
    if (all.length >= MAX_ROWS) throw new TruncatedReadError(what);
  }
}

function chunks<T>(arr: T[], n = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Cêntimos a partir de numeric(…,2) sem floats acumulados. */
export function toCents(v: unknown): number {
  return Math.round(Number(v ?? 0) * 100);
}

/** round(base*(1+iva/100),2) em cêntimos, com iva inteiro (igual ao núcleo). */
export function grossCents(baseCents: number, ivaRate: number): number {
  const iva = Math.round(Number(ivaRate ?? 0));
  const q = baseCents * (100 + iva);
  return q >= 0 ? Math.floor((q + 50) / 100) : -Math.floor((-q + 50) / 100);
}

export interface OffsetCandidate {
  id: string;
  kind: "transaction" | "forecast";
  sign: "income" | "expense";
  label: string;
  invoice_ref: string | null;
  event_name: string | null;
  gross_cents: number;
  paid_cents: number;
  open_cents: number;
  eligibility: OffsetEligibilityResult;
}

export function candidateToPlanInput(c: OffsetCandidate): OffsetDocumentInput {
  return { id: c.id, kind: c.kind, sign: c.sign, open_cents: c.open_cents, expected_open_cents: c.open_cents };
}

const TX_COLS =
  "id, type, description, invoice_ref, amount, iva_rate, paid_amount, status, currency, fx_rate, original_amount," +
  " account_id, installment_group_id, installment_number, installment_total, card_session_id, held_by_supplier_id," +
  " settlement_id, is_transitory, supplier_credit_id, parent_transaction_id, is_reimbursement, cache_contract_id," +
  " shared_cost_account_id, declared_withholding_amount, declared_withholding_rate, event_settlement_id," +
  " events:events!transactions_event_id_fkey(name, status)";

const PAY_COLS =
  "id, transaction_id, status, reversed_at, amount, credit_amount, withholding_amount, currency, fx_rate," +
  " payment_method, account_id, offset_group_id, reversal_kind";

/** Snapshot de elegibilidade de uma transação a partir das linhas lidas (pura). */
export function transactionSnapshot(t: any, pays: any[], sealed: Set<string>): {
  snap: OffsetEligibilitySnapshot;
  gross_cents: number;
  paid_cents: number;
} {
  const base = toCents(t.amount);
  const gross = grossCents(base, Number(t.iva_rate ?? 0));
  const live = pays.filter((p) => p.status === "paid" && !p.reversed_at);
  const paid = live.reduce((a, p) => a + toCents(p.amount), 0);
  const leg: OffsetEligibilitySnapshot["leg_type"] = t.card_session_id
    ? "card"
    : t.is_reimbursement || t.parent_transaction_id
      ? "reimbursement"
      : t.shared_cost_account_id
        ? "shared_cost"
        : t.is_transitory
          ? "transitory"
          : "normal";
  const inconsistent = live.some((p) =>
    p.payment_method !== "compensation"
      ? !p.account_id || p.account_id !== t.account_id
      : !!t.account_id || !!p.account_id,
  );
  const snap: OffsetEligibilitySnapshot = {
    id: t.id,
    kind: "transaction",
    open_amount: (gross - paid) / 100,
    amount: Number(t.amount),
    currency: t.currency ?? "EUR",
    has_fx: t.fx_rate != null || t.original_amount != null || live.some((p) => (p.currency ?? "EUR") !== "EUR" || p.fx_rate != null),
    has_installments: !!(t.installment_group_id || t.installment_number || t.installment_total),
    has_credit: !!t.supplier_credit_id || live.some((p) => Number(p.credit_amount ?? 0) !== 0 || p.reversal_kind === "supplier_credit"),
    has_withholding:
      Number(t.declared_withholding_amount ?? 0) !== 0 ||
      Number(t.declared_withholding_rate ?? 0) !== 0 ||
      live.some((p) => Number(p.withholding_amount ?? 0) !== 0),
    has_planned_payments: pays.some((p) => p.status === "planned") || live.some((p) => !!p.offset_group_id),
    unsupported_other: !!(t.held_by_supplier_id || t.settlement_id || t.cache_contract_id),
    leg_type: leg,
    cash_account_inconsistent: inconsistent,
    event_closed: ["completed", "cancelled"].includes(t.events?.status),
    settlement_sealed: !!t.event_settlement_id && sealed.has(t.event_settlement_id),
  };
  return { snap, gross_cents: gross, paid_cents: paid };
}

/** Documentos em aberto da entidade (receitas e despesas). */
export async function loadSupplierDocuments(db: any, supplierId: string): Promise<OffsetCandidate[]> {
  const txs = await readAllPages<any>("transações", (from, to) =>
    db
      .from("transactions")
      .select(TX_COLS)
      .eq("supplier_id", supplierId)
      .in("type", ["income", "expense"])
      .in("status", ["approved", "partially_paid"])
      .is("reversed_at", null)
      .eq("is_hidden", false)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const ids = txs.map((t) => t.id);
  const pays: any[] = [];
  for (const part of chunks(ids)) {
    pays.push(
      ...(await readAllPages<any>("pagamentos", (from, to) =>
        db.from("transaction_payments").select(PAY_COLS).in("transaction_id", part).order("id", { ascending: true }).range(from, to),
      )),
    );
  }
  const settlementIds = [...new Set(txs.map((t) => t.event_settlement_id).filter(Boolean))] as string[];
  const sealed = new Set<string>();
  for (const part of chunks(settlementIds)) {
    const rows = await readAllPages<any>("acertos", (from, to) =>
      db.from("event_settlements").select("id, is_sealed").in("id", part).order("id", { ascending: true }).range(from, to),
    );
    rows.filter((r) => r.is_sealed).forEach((r) => sealed.add(r.id));
  }
  const byTx = new Map<string, any[]>();
  pays.forEach((p) => byTx.set(p.transaction_id, [...(byTx.get(p.transaction_id) ?? []), p]));
  return txs.map((t) => {
    const { snap, gross_cents, paid_cents } = transactionSnapshot(t, byTx.get(t.id) ?? [], sealed);
    return {
      id: t.id,
      kind: "transaction" as const,
      sign: t.type,
      label: t.description ?? "(sem descrição)",
      invoice_ref: t.invoice_ref ?? null,
      event_name: t.events?.name ?? null,
      gross_cents,
      paid_cents,
      open_cents: gross_cents - paid_cents,
      eligibility: checkOffsetEligibility(snap),
    };
  });
}

/** Linhas de BP aprovadas e activas de um evento, sem nenhuma transação ligada. */
export async function loadForecastCandidates(db: any, eventId: string): Promise<OffsetCandidate[]> {
  const rows = await readAllPages<any>("linhas de BP", (from, to) =>
    db
      .from("event_forecasts")
      .select(
        "id, type, description, amount, iva_rate, currency, fx_rate, cache_config_id, master_forecast_id, formula_type, approved_at, version_id, transaction_id, events:events!event_forecasts_event_id_fkey(name, status)",
      )
      .eq("event_id", eventId)
      .not("approved_at", "is", null)
      .is("version_id", null)
      .in("type", ["income", "expense"])
      .order("id", { ascending: true })
      .range(from, to),
  );
  const ids = rows.map((r) => r.id);
  const linked = new Set<string>();
  for (const part of chunks(ids)) {
    const tx = await readAllPages<any>("vínculos BP", (from, to) =>
      db.from("transactions").select("id, forecast_id").in("forecast_id", part).order("id", { ascending: true }).range(from, to),
    );
    tx.forEach((t) => linked.add(t.forecast_id));
  }
  return rows.map((f) => {
    const gross = grossCents(toCents(f.amount), Number(f.iva_rate ?? 0));
    const snap: OffsetEligibilitySnapshot = {
      id: f.id,
      kind: "forecast",
      open_amount: gross / 100,
      amount: Number(f.amount),
      currency: f.currency ?? "EUR",
      has_fx: f.fx_rate != null,
      unsupported_other: !!f.cache_config_id || !!f.master_forecast_id || (f.formula_type ?? "fixed") !== "fixed",
      event_closed: ["completed", "cancelled"].includes(f.events?.status),
      forecast_shared: !!f.transaction_id || linked.has(f.id),
    };
    return {
      id: f.id,
      kind: "forecast" as const,
      sign: f.type,
      label: `BP · ${f.description ?? "(sem descrição)"}`,
      invoice_ref: null,
      event_name: f.events?.name ?? null,
      gross_cents: gross,
      paid_cents: 0,
      open_cents: gross,
      eligibility: checkOffsetEligibility(snap),
    };
  });
}

/** Depois de um encontro (aplicado ou estornado): transações, pagamentos, BP, grupos, conciliação e saldos. */
export function invalidateAfterOffset(qc: QueryClient) {
  invalidateEventFinancials(qc);
  qc.invalidateQueries({
    predicate: (q) => {
      const head = q.queryKey?.[0];
      if (typeof head !== "string") return false;
      const h = head.toLowerCase();
      return (
        h.startsWith("bank-recon") ||
        h.startsWith("bank_line") ||
        h.includes("offset") ||
        h.includes("balance") ||
        h.includes("account")
      );
    },
  });
}
