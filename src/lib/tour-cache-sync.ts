/**
 * #301 — Valor da linha de cachê de UMA cidade de turnê no BP.
 * Usa o mesmo núcleo do cálculo real (computeRealCacheResults + cityDeductionSources):
 * cidade peso 1 + Master 1/N, BP aprovado + excedido por evento, ocupação real da cidade
 * para o escalão. Prioridade: settlement da cidade > config ajustada/finalizada > calculado.
 */
import { computeRealCacheResults, cityDeductionSources } from "@/lib/real-cache-calc";
import { getCacheEffectiveAmount, type CityCacheSettlement } from "@/lib/cache-pl-helper";

export function computeTourCityCacheAmount(args: {
  /** config já enriquecido com `tiers`. */
  config: any;
  deductions: { cache_config_id: string; category_id: string }[];
  revenue: { gross: number; net: number };
  occupancyPct: number;
  cityForecasts: any[];
  cityExpenses: any[];
  masterForecasts: any[];
  masterExpenses: any[];
  cityCount: number;
  citySettlement?: CityCacheSettlement | null;
}): number {
  const [r] = computeRealCacheResults({
    configs: [args.config],
    deductions: args.deductions,
    categoryMap: new Map(),
    expenses: args.cityExpenses,
    sources: cityDeductionSources({
      cityForecasts: args.cityForecasts,
      cityExpenses: args.cityExpenses,
      masterForecasts: args.masterForecasts,
      masterExpenses: args.masterExpenses,
      cityCount: args.cityCount,
    }),
    revenue: args.revenue,
    occupancyPct: args.occupancyPct,
  });
  return getCacheEffectiveAmount(args.config, r.finalAmount, args.citySettlement ?? null);
}

/**
 * #301 (opção A) — impressão digital do Master para a deteção de alterações do recálculo.
 * Só entram linhas do BP e transações do Master em rubricas de DEDUÇÃO do cachê;
 * qualquer mudança de valor, IVA, estado, estorno, escondida/transitória/excluída muda a string.
 */
export function masterDeductionFingerprint(
  forecasts: any[],
  transactions: any[],
  deductionCategoryIds: string[],
): string {
  const cats = new Set(deductionCategoryIds);
  const f = forecasts
    .filter((r) => r.category_id && cats.has(r.category_id))
    .map((r) => `f:${r.id}:${r.category_id}:${Math.round(Number(r.amount || 0) * 100)}:${r.iva_rate ?? ""}:${r.status ?? ""}:${!!r.is_overhead}:${!!r.is_transitory}:${!!r.exclude_from_result}`);
  const t = transactions
    .filter((r) => r.category_id && cats.has(r.category_id))
    .map((r) => `t:${r.id}:${r.category_id}:${Math.round(Number(r.amount || 0) * 100)}:${r.iva_rate ?? ""}:${r.status ?? ""}:${r.reversed_at ?? ""}:${!!r.is_hidden}:${!!r.is_transitory}:${!!r.exclude_from_result}:${r.parent_transaction_id ?? ""}:${r.split_percentage ?? ""}`);
  return [...f, ...t].sort().join("|");
}
