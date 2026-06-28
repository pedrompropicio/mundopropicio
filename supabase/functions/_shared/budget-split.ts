// Helper puro para repartir o daily_budget de uma campanha pelos seus adsets.
//
// Filosofia (P0):
// - O número final é SEMPRE decidido pelo código. O LLM apenas sugere proporção
//   via `budget_weight` (0..1) em cada adset.
// - Soma exacta == totalCents sempre que possível (largest-remainder).
// - Mínimo da Meta (100 cents) é hard floor: se o budget total não der para
//   garantir o mínimo a todos os adsets, aceitamos exceder o total (warning).
// - Retrocompatível: planos antigos sem `budget_weight` caem em divisão igual.
//
// Importado por:
//  - supabase/functions/crm-meta-strategy-deploy/index.ts (uso real)
//  - supabase/functions/_shared/budget-split.test.ts (testes)
// Alterar aqui implica re-deploy do strategy-deploy.

export interface AdsetLike {
  budget_weight?: unknown;
  adset_name?: string | null;
  name?: string | null;
  [k: string]: unknown;
}

export interface PlanCampaignLike {
  campaign_name?: string | null;
  daily_budget_eur?: number | null;
  adsets?: AdsetLike[];
  [k: string]: unknown;
}

export interface BudgetSplitResult {
  perAdsetCents: number[];
  mode: "weighted" | "equal" | "empty";
  totalCents: number;
  sumFinal: number;
  warnings: string[];
}

const MIN_CENTS = 100;
const DEFAULT_DAILY_EUR = 10;

export function computePerAdsetCents(planCampaign: PlanCampaignLike | null | undefined): BudgetSplitResult {
  const adsets = Array.isArray(planCampaign?.adsets) ? (planCampaign!.adsets as AdsetLike[]) : [];
  const N = adsets.length;
  const warnings: string[] = [];
  if (N === 0) {
    return { perAdsetCents: [], mode: "empty", totalCents: 0, sumFinal: 0, warnings };
  }

  const totalEurRaw = Number(planCampaign?.daily_budget_eur);
  const totalEur = Number.isFinite(totalEurRaw) && totalEurRaw > 0 ? totalEurRaw : DEFAULT_DAILY_EUR;
  const totalCents = Math.max(MIN_CENTS, Math.round(totalEur * 100));

  // 1) extrair pesos sugeridos pelo LLM
  const raw: number[] = adsets.map((a) => Number((a as any)?.budget_weight));
  const validFlags: boolean[] = raw.map((v) => Number.isFinite(v) && v > 0);
  const anyValid = validFlags.some(Boolean);
  const sumValid = raw.reduce((s, v, i) => s + (validFlags[i] ? v : 0), 0);

  // 2) decidir modo
  let mode: "weighted" | "equal";
  let weights: number[];
  if (!anyValid || sumValid <= 0) {
    mode = "equal";
    weights = new Array(N).fill(1 / N);
  } else {
    mode = "weighted";
    weights = raw.map((v, i) => (validFlags[i] ? v / sumValid : 0));
    const missing = validFlags.filter((f) => !f).length;
    if (missing > 0) {
      warnings.push(
        `pesos parciais: ${missing}/${N} adset(s) sem budget_weight válido — recebem 0 inicial, sobem ao mínimo (${MIN_CENTS}c) depois`
      );
    }
  }

  // 3) repartição inicial com largest-remainder
  const exact = weights.map((w) => totalCents * w);
  const cents = exact.map((x) => Math.floor(x));
  const remainder = totalCents - cents.reduce((s, v) => s + v, 0);
  const fracOrder = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (let k = 0; k < remainder; k++) {
    cents[fracOrder[k % N].i] += 1;
  }

  // 4) clamp ao mínimo da Meta
  for (let i = 0; i < N; i++) {
    if (cents[i] < MIN_CENTS) cents[i] = MIN_CENTS;
  }

  // 5) tentar compensar excedente tirando dos adsets acima do mínimo
  //    (cêntimo a cêntimo do maior doador), sem nunca descer abaixo do mínimo.
  let sum = cents.reduce((s, v) => s + v, 0);
  let excess = sum - totalCents;
  while (excess > 0) {
    let bestI = -1;
    let bestSurplus = 0;
    for (let i = 0; i < N; i++) {
      const surplus = cents[i] - MIN_CENTS;
      if (surplus > bestSurplus) {
        bestSurplus = surplus;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    cents[bestI] -= 1;
    excess -= 1;
  }
  sum = cents.reduce((s, v) => s + v, 0);
  if (sum > totalCents) {
    warnings.push(
      `budget pequeno demais: soma final ${sum}c excede total ${totalCents}c (todos os adsets travados no mínimo ${MIN_CENTS}c)`
    );
  }

  return { perAdsetCents: cents, mode, totalCents, sumFinal: sum, warnings };
}
