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
