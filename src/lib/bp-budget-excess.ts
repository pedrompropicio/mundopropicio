/**
 * DR-2026-09-02-D2 (revista 03/09) — excesso de verba na linha de BP.
 *
 * Aprovar uma despesa que faça o realizado da linha ultrapassar a verba implica
 * ELEVAR A LINHA no mesmo acto. Não existe "assumir o excesso": a linha nunca
 * fica abaixo do realizado.
 *
 * Regras de cálculo (D11 — base LÍQUIDA):
 *  - `transactions.amount` contra `event_forecasts.amount` (ambos líquidos);
 *  - realizado da linha = soma de `amount` das transações com esse `forecast_id`
 *    em `approved` ou `paid`, excluindo as que `hasResultBlockingFlags` apanha;
 *  - N:1 — agrega por linha (uma pergunta por linha, nunca despesa a despesa);
 *  - excesso = realizado + a aprovar − verba, só quando > 0;
 *  - verba sugerida = realizado + a aprovar.
 */
import { supabase } from "@/integrations/supabase/client";
import { hasResultBlockingFlags } from "@/lib/fecho-filters";

/** Uma despesa a aprovar (ou a inserir) já vinculada a uma linha de BP. */
export type BudgetExcessEntry = {
  forecast_id: string;
  /** Valor LÍQUIDO (sem IVA) — o mesmo domínio de `event_forecasts.amount`. */
  amount: number;
  /**
   * Id da transação, quando já existe. Serve para não contar duas vezes uma
   * transação que já esteja em `approved`/`paid` no realizado da linha.
   */
  transaction_id?: string | null;
};

export type BudgetExcessLine = {
  forecast_id: string;
  description: string;
  line_amount: number;
  baseline_amount: number | null;
  realized: number;
  to_approve: number;
  excess: number;
  suggested_amount: number;
};

export type BudgetRaise = {
  forecast_id: string;
  new_amount: number;
  observation: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Devolve, por linha de BP, o retrato do excesso. Só devolve as linhas em
 * excesso (`excess > 0`); as restantes não geram pergunta nenhuma.
 */
export async function computeBudgetExcess(
  entries: BudgetExcessEntry[],
): Promise<BudgetExcessLine[]> {
  const valid = entries.filter((e) => !!e.forecast_id && Number.isFinite(Number(e.amount)));
  if (valid.length === 0) return [];

  const forecastIds = [...new Set(valid.map((e) => e.forecast_id))];

  const { data: forecasts, error: fErr } = await supabase
    .from("event_forecasts")
    .select("id, description, specification, amount, baseline_amount")
    .in("id", forecastIds);
  if (fErr) throw fErr;

  const { data: txs, error: tErr } = await supabase
    .from("transactions")
    .select("id, forecast_id, amount, status, is_transitory, exclude_from_result, reversed_at, is_hidden")
    .in("forecast_id", forecastIds)
    .in("status", ["approved", "paid"]);
  if (tErr) throw tErr;

  // Transações que estão no lote a aprovar não devem entrar no realizado
  // (evita dupla contagem quando já estão approved e se re-aprova/reprocessa).
  const inBatch = new Set(valid.map((e) => e.transaction_id).filter(Boolean) as string[]);

  const realizedByLine = new Map<string, number>();
  for (const t of (txs ?? []) as any[]) {
    if (inBatch.has(t.id)) continue;
    if (hasResultBlockingFlags(t)) continue;
    const key = t.forecast_id as string;
    realizedByLine.set(key, (realizedByLine.get(key) ?? 0) + Number(t.amount ?? 0));
  }

  const toApproveByLine = new Map<string, number>();
  for (const e of valid) {
    toApproveByLine.set(e.forecast_id, (toApproveByLine.get(e.forecast_id) ?? 0) + Number(e.amount));
  }

  const out: BudgetExcessLine[] = [];
  for (const f of (forecasts ?? []) as any[]) {
    const lineAmount = round2(Number(f.amount ?? 0));
    const realized = round2(realizedByLine.get(f.id) ?? 0);
    const toApprove = round2(toApproveByLine.get(f.id) ?? 0);
    const excess = round2(realized + toApprove - lineAmount);
    if (excess <= 0) continue;
    out.push({
      forecast_id: f.id,
      description: [f.description, f.specification].filter(Boolean).join(" · ") || "(sem descrição)",
      line_amount: lineAmount,
      baseline_amount: f.baseline_amount == null ? null : round2(Number(f.baseline_amount)),
      realized,
      to_approve: toApprove,
      excess,
      suggested_amount: round2(realized + toApprove),
    });
  }
  return out;
}

/**
 * Excesso ≤ 5 € ou ≤ 1% da verba: provável arredondamento de IVA linha a linha
 * (Art.º 18 CIVA), não um desvio de planeamento.
 */
export function isLikelyIvaRounding(line: BudgetExcessLine): boolean {
  return line.excess <= 5 || (line.line_amount > 0 && line.excess <= line.line_amount * 0.01);
}
