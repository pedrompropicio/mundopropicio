/**
 * #240 — Porta 2: o amount de uma linha viva do BP só se grava por
 * `batch_update_event_forecasts` (ou `reduce_forecast_budget`), nunca por
 * `.update` directo. O trigger `trg_enforce_forecast_amount_floor` é a regra:
 *  - linha aprovada de despesa nunca desce abaixo do realizado;
 *  - reduzir linha com realizado exige observação (`mp.bp_change_observation`);
 *  - toda a redução fica em `forecast_audit_log` ('Redução de verba').
 * Este helper antecipa a regra para a UI poder pedir a observação / explicar.
 */
import { supabase } from "@/integrations/supabase/client";

export class ForecastBelowRealizedError extends Error {
  constructor(public requested: number, public realized: number) {
    super(
      `A verba da linha não pode ficar abaixo do realizado: pedido ${fmt(requested)}, realizado ${fmt(realized)}.`,
    );
    this.name = "ForecastBelowRealizedError";
  }
}
export class ForecastObservationCancelled extends Error {
  constructor() {
    super("Redução cancelada: a observação é obrigatória numa linha com realizado.");
    this.name = "ForecastObservationCancelled";
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
}

export type ReductionPromptInfo = {
  description: string | null;
  oldAmount: number;
  newAmount: number;
  realized: number;
};
type Prompter = (info: ReductionPromptInfo) => Promise<string | null>;
let prompter: Prompter | null = null;
/** Registado por <ReductionObservationHost /> (montado em App). */
export function setReductionObservationPrompter(fn: Prompter | null) {
  prompter = fn;
}

/** Realizado da linha — mesmo predicado de reduce_forecast_budget e do trigger. */
export async function fetchForecastRealized(forecastId: string): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("transactions")
    .select("amount, is_transitory, exclude_from_result, reversed_at, is_hidden")
    .eq("forecast_id", forecastId)
    .eq("type", "expense")
    .in("status", ["approved", "paid", "partially_paid"]);
  if (error) throw error;
  return (data ?? [])
    .filter((t: any) => !t.is_transitory && !t.exclude_from_result && !t.reversed_at && !t.is_hidden)
    .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
}

type WriteOpts = {
  forecastId: string;
  newAmount: number;
  /** Observação já conhecida (ex.: modal de edição, sync do cachê). */
  observation?: string | null;
  /** Se falta observação e a linha tem realizado, pede-a num diálogo. */
  interactive?: boolean;
};

/**
 * Grava o amount de uma linha do BP. Lança ForecastBelowRealizedError quando a
 * redução fica abaixo do realizado e ForecastObservationCancelled quando o
 * utilizador cancela a observação.
 */
export async function writeForecastAmount({ forecastId, newAmount, observation, interactive }: WriteOpts) {
  const { data: row, error } = await (supabase as any)
    .from("event_forecasts")
    .select("id, event_id, version_id, amount, status, type, description, is_overhead, exclude_from_result, master_forecast_id, is_retroactive_override")
    .eq("id", forecastId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Linha de BP não encontrada.");

  const oldAmount = Number(row.amount || 0);
  if (Math.abs(oldAmount - newAmount) < 0.005) return;

  let obs = observation?.trim() || null;
  const guarded = !row.version_id && row.status === "approved" && row.type === "expense" && newAmount < oldAmount;
  if (guarded) {
    const realized = await fetchForecastRealized(forecastId);
    if (newAmount < realized - 0.005) throw new ForecastBelowRealizedError(newAmount, realized);
    if (realized > 0 && !obs) {
      if (!interactive || !prompter) {
        throw new Error("Observação obrigatória para reduzir uma linha de BP com realizado.");
      }
      obs = (await prompter({ description: row.description, oldAmount, newAmount, realized }))?.trim() || null;
      if (!obs) throw new ForecastObservationCancelled();
    }
  }

  // batch_update_event_forecasts recusa amount em overhead/excluídas/adoptadas/retroactivas —
  // essas linhas são geridas por outros módulos; o trigger continua a guardá-las.
  const batchRefuses = row.is_overhead || row.exclude_from_result || row.master_forecast_id || row.is_retroactive_override;
  if (batchRefuses) {
    const { error: upErr } = await (supabase as any)
      .from("event_forecasts")
      .update({ amount: newAmount })
      .eq("id", forecastId);
    if (upErr) throw upErr;
    return;
  }

  const edit: Record<string, any> = { id: forecastId, amount: newAmount };
  if (obs) edit.observation = obs;
  const { error: rpcErr } = await (supabase as any).rpc("batch_update_event_forecasts", {
    _event_id: row.event_id,
    _version_id: row.version_id ?? null,
    _edits: [edit],
  });
  if (rpcErr) throw rpcErr;
}

/**
 * #240 — para gravações em lote (grelha, Planilha): antes de chamar
 * batch_update_event_forecasts, valida o chão e pede a observação a cada
 * redução de linha com realizado, acrescentando `observation` ao edit.
 */
export async function prepareBatchEditsForReductions<T extends { id: string; amount?: any }>(
  edits: T[],
): Promise<(T & { observation?: string })[]> {
  const withAmount = edits.filter((e) => e.amount !== undefined && e.amount !== null);
  if (withAmount.length === 0) return edits;
  const { data, error } = await (supabase as any)
    .from("event_forecasts")
    .select("id, amount, status, type, version_id, description")
    .in("id", withAmount.map((e) => e.id));
  if (error) throw error;
  const byId = new Map<string, any>((data ?? []).map((r: any) => [r.id, r]));
  const out: (T & { observation?: string })[] = [];
  for (const e of edits) {
    const row = byId.get(e.id);
    const newAmount = Number(e.amount);
    if (row && e.amount != null && !row.version_id && row.status === "approved" && row.type === "expense"
        && newAmount < Number(row.amount || 0) - 0.005) {
      const realized = await fetchForecastRealized(e.id);
      if (newAmount < realized - 0.005) {
        const err = new ForecastBelowRealizedError(newAmount, realized);
        err.message = `${row.description ?? "Linha"}: ${err.message}`;
        throw err;
      }
      if (realized > 0) {
        if (!prompter) throw new Error("Observação obrigatória para reduzir uma linha de BP com realizado.");
        const obs = (await prompter({ description: row.description, oldAmount: Number(row.amount || 0), newAmount, realized }))?.trim();
        if (!obs) throw new ForecastObservationCancelled();
        out.push({ ...e, observation: obs });
        continue;
      }
    }
    out.push(e);
  }
  return out;
}
