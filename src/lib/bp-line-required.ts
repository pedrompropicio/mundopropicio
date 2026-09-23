/**
 * D1 + D8 — linha de BP obrigatória na APROVAÇÃO (nunca no lançamento).
 *
 * Uma despesa de um evento gerido `with_bp` não pode ser aprovada sem
 * `transactions.forecast_id`. A regra vive no servidor (trigger
 * `enforce_transaction_approval_permission`); estes helpers existem para a UI
 * poder oferecer a resolução em vez de um beco sem saída.
 *
 * Isenções (iguais às do trigger):
 *  - operações sem identidade de utilizador (service_role, crons, edge fns);
 *  - `parent_transaction_id IS NOT NULL` — filha de rateio ou parcela: a
 *    obrigação é do pai (e o master de rateio não tem event_id);
 *  - transações que não consomem verba do BP: `is_transitory`,
 *    `exclude_from_result`, `reversed_at` preenchido, `is_hidden` e
 *    `shared_cost_account_id` preenchido (custo partilhado com terceiros —
 *    dinheiro de terceiros, nunca consome verba; D-ERP69, 16/09/2026);
 *  - rubrica 10.3 "Transferências Internas" (ou descendente) — movimento de
 *    tesouraria/bilheteira, o BP nunca tem linha para ele, com ou sem evento
 *    (#111, 20/09/2026).
 */
import { supabase } from "@/integrations/supabase/client";

export type BpLineCandidate = {
  id: string;
  type?: string | null;
  event_id?: string | null;
  forecast_id?: string | null;
  parent_transaction_id?: string | null;
  is_transitory?: boolean | null;
  exclude_from_result?: boolean | null;
  reversed_at?: string | null;
  is_hidden?: boolean | null;
  shared_cost_account_id?: string | null;
  category_id?: string | null;
  /** Código da rubrica, quando já é conhecido (evita a ida à BD). */
  category_code?: string | null;
};

/** #111 — 10.3 "Transferências Internas" (e descendentes) nunca exige linha de BP. */
export function isInternalTransferCategoryCode(code?: string | null): boolean {
  return !!code && code.trim().startsWith("10.3");
}

/** Verificação estrutural (sem ir à BD): candidata a precisar de linha de BP. */
export function structurallyNeedsBpLine(tx: BpLineCandidate): boolean {
  if (isInternalTransferCategoryCode(tx.category_code)) return false;
  return (
    tx.type === "expense" &&
    !!tx.event_id &&
    !tx.forecast_id &&
    !tx.parent_transaction_id &&
    !tx.is_transitory &&
    !tx.exclude_from_result &&
    !tx.reversed_at &&
    !tx.is_hidden &&
    !tx.shared_cost_account_id
  );
}

/** Ids de rubricas 10.3* de entre as pedidas (uma leitura, sem paginação necessária). */
export async function fetchInternalTransferCategoryIds(
  categoryIds: (string | null | undefined)[],
): Promise<Set<string>> {
  const unique = [...new Set(categoryIds.filter(Boolean) as string[])];
  if (unique.length === 0) return new Set();
  const { data, error } = await supabase
    .from("account_categories")
    .select("id, code")
    .in("id", unique);
  if (error) throw error;
  const out = new Set<string>();
  for (const c of (data ?? []) as any[]) {
    if (isInternalTransferCategoryCode(c.code)) out.add(c.id);
  }
  return out;
}

/** Conjunto dos eventos (de entre os pedidos) que são geridos `with_bp`. */
export async function fetchWithBpEventIds(eventIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(eventIds.filter(Boolean))];
  if (unique.length === 0) return new Set();

  const { data: events, error } = await supabase
    .from("events")
    .select("id, budget_mode, company_id")
    .in("id", unique);
  if (error) throw error;

  const companyIds = [...new Set((events ?? []).map((e: any) => e.company_id).filter(Boolean))];
  const defaults = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies, error: cErr } = await supabase
      .from("companies")
      .select("id, default_budget_mode")
      .in("id", companyIds);
    if (cErr) throw cErr;
    for (const c of (companies ?? []) as any[]) {
      defaults.set(c.id, c.default_budget_mode ?? "with_bp");
    }
  }

  const out = new Set<string>();
  for (const e of (events ?? []) as any[]) {
    const mode = e.budget_mode ?? defaults.get(e.company_id) ?? "with_bp";
    if (mode === "with_bp") out.add(e.id);
  }
  return out;
}

/** Separa as transações que podem ser aprovadas das que precisam de linha de BP. */
export async function partitionByBpLineRequirement<T extends BpLineCandidate>(
  txs: T[],
): Promise<{ approvable: T[]; blocked: T[] }> {
  let candidates = txs.filter(structurallyNeedsBpLine);
  if (candidates.length === 0) return { approvable: [...txs], blocked: [] };

  // #111: 10.3* (Transferências Internas) nunca exige linha de BP.
  const unknownCodes = candidates.filter((t) => !t.category_code && t.category_id);
  if (unknownCodes.length > 0) {
    const internal = await fetchInternalTransferCategoryIds(unknownCodes.map((t) => t.category_id));
    if (internal.size > 0) {
      candidates = candidates.filter((t) => !(t.category_id && internal.has(t.category_id)));
    }
  }
  if (candidates.length === 0) return { approvable: [...txs], blocked: [] };

  const withBp = await fetchWithBpEventIds(candidates.map((t) => t.event_id as string));
  const blockedIds = new Set(
    candidates.filter((t) => withBp.has(t.event_id as string)).map((t) => t.id),
  );

  return {
    approvable: txs.filter((t) => !blockedIds.has(t.id)),
    blocked: txs.filter((t) => blockedIds.has(t.id)),
  };
}

/** Uma transação isolada precisa de linha de BP antes de ser aprovada? */
export async function needsBpLineBeforeApproval(tx: BpLineCandidate): Promise<boolean> {
  if (!structurallyNeedsBpLine(tx)) return false;
  // #111: sem `category_code` conhecido, resolve o código da rubrica antes de decidir.
  if (!tx.category_code && tx.category_id) {
    const internal = await fetchInternalTransferCategoryIds([tx.category_id]);
    if (internal.has(tx.category_id)) return false;
  }
  const withBp = await fetchWithBpEventIds([tx.event_id as string]);
  return withBp.has(tx.event_id as string);
}

/**
 * #240 Porta 1 — espelho cliente de `public.bp_tx_link_allowed` (mesma empresa
 * assumida): transação sem evento, mesmo evento, ou Master↔cidade por
 * `parent_event_id`. O trigger `trg_enforce_tx_forecast_same_event` é a regra.
 */
export async function isBpLinkAllowedForEvent(
  txEventId: string | null | undefined,
  fcEventId: string | null | undefined,
): Promise<boolean> {
  if (!txEventId || !fcEventId || txEventId === fcEventId) return true;
  const { data, error } = await supabase
    .from("events")
    .select("id, parent_event_id")
    .in("id", [txEventId, fcEventId]);
  if (error) throw error;
  return (data ?? []).some(
    (e: any) =>
      (e.id === txEventId && e.parent_event_id === fcEventId) ||
      (e.id === fcEventId && e.parent_event_id === txEventId),
  );
}
