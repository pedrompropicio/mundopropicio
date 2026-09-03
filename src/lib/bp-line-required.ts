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
 *    obrigação é do pai (e o master de rateio não tem event_id).
 */
import { supabase } from "@/integrations/supabase/client";

export type BpLineCandidate = {
  id: string;
  type?: string | null;
  event_id?: string | null;
  forecast_id?: string | null;
  parent_transaction_id?: string | null;
};

/** Verificação estrutural (sem ir à BD): candidata a precisar de linha de BP. */
export function structurallyNeedsBpLine(tx: BpLineCandidate): boolean {
  return (
    tx.type === "expense" &&
    !!tx.event_id &&
    !tx.forecast_id &&
    !tx.parent_transaction_id
  );
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
  const candidates = txs.filter(structurallyNeedsBpLine);
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
  const withBp = await fetchWithBpEventIds([tx.event_id as string]);
  return withBp.has(tx.event_id as string);
}
