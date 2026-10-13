/**
 * Total do separador Cachê (decisão do Pedro, 13/10/2026 — adenda D-ERP265/#301).
 * SEMPRE sobre vendas reais (ticket_sales):
 *  - Master de turnê: Σ cidades de getCacheEffectiveAmount(config, cálculo real da cidade,
 *    settlement da cidade). O mínimo garantido aplica-se cidade a cidade (dentro do
 *    cálculo de cada cidade) — o mesmo valor que as linhas de BP cache_module.
 *  - Evento simples: getCacheEffectiveAmount(config, cálculo real do evento).
 * A projeção com lotação esgotada nunca entra aqui.
 */
import { getCacheEffectiveAmount, type CityCacheSettlement } from "@/lib/cache-pl-helper";
import type { RealCacheResult } from "@/lib/real-cache-calc";

export function computeCacheTabAmount(args: {
  config: any;
  /** Resultado real do evento (só eventos simples). */
  realResult?: RealCacheResult | null;
  /** Resultados reais por cidade (Master de turnê). */
  resultsByCity?: Record<string, RealCacheResult[]>;
  childEventIds?: string[];
  citySettlements?: Array<CityCacheSettlement & { cache_config_id: string; event_id: string }>;
}): number {
  const { config } = args;
  if (config.cache_type === "fixed") return getCacheEffectiveAmount(config, Number(config.fixed_amount) || 0);
  const children = args.childEventIds ?? [];
  if (children.length > 0) {
    let total = 0;
    for (const cityId of children) {
      const r = args.resultsByCity?.[cityId]?.find((x) => x.configId === config.id);
      const st = (args.citySettlements ?? []).find((s) => s.cache_config_id === config.id && s.event_id === cityId) ?? null;
      total += getCacheEffectiveAmount(config, r?.finalAmount ?? 0, st);
    }
    return Math.round(total * 100) / 100;
  }
  return getCacheEffectiveAmount(config, args.realResult?.finalAmount ?? 0);
}

/** Receita real usada no cabeçalho (Σ cidades no Master de turnê). */
export function cacheTabRevenue(
  config: any,
  realResult: RealCacheResult | null | undefined,
  resultsByCity: Record<string, RealCacheResult[]> | undefined,
  childEventIds: string[] | undefined,
): { revenue: number; deductions: number } {
  const children = childEventIds ?? [];
  const rows = children.length > 0
    ? children.map((c) => resultsByCity?.[c]?.find((x) => x.configId === config.id)).filter(Boolean) as RealCacheResult[]
    : realResult ? [realResult] : [];
  return {
    revenue: rows.reduce((s, r) => s + r.revenueBasis, 0),
    deductions: rows.reduce((s, r) => s + r.totalDeduction, 0),
  };
}

export interface CityDeductionRow {
  cityId: string;
  categoryDeduction: number;
  fixedPctDeduction: number;
  totalDeduction: number;
}

/**
 * Descontos mostrados no detalhe da atração (adenda D-ERP265, 13/10/2026).
 * Master de turnê: Σ dos descontos usados no cálculo de cada cidade
 * (BP da cidade + 1/N do Master — os mesmos RealCacheResult do total).
 * Evento simples: descontos do cálculo real do evento.
 */
export function cacheTabDeductionBreakdown(
  config: any,
  realResult: RealCacheResult | null | undefined,
  resultsByCity: Record<string, RealCacheResult[]> | undefined,
  childEventIds: string[] | undefined,
): { cities: CityDeductionRow[]; byCategory: Record<string, number>; categoryDeduction: number; fixedPctDeduction: number; totalDeduction: number } {
  const children = childEventIds ?? [];
  const pairs: Array<[string, RealCacheResult | undefined]> = children.length > 0
    ? children.map((c) => [c, resultsByCity?.[c]?.find((x) => x.configId === config.id)])
    : [["", realResult ?? undefined]];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byCategory: Record<string, number> = {};
  const cities: CityDeductionRow[] = pairs.map(([cityId, r]) => {
    for (const d of r?.deductionDetails ?? []) byCategory[d.categoryId] = r2((byCategory[d.categoryId] ?? 0) + d.amount);
    return {
      cityId,
      categoryDeduction: r2(r?.realDeductionAmount ?? 0),
      fixedPctDeduction: r2(r?.fixedPctDeduction ?? 0),
      totalDeduction: r2(r?.totalDeduction ?? 0),
    };
  });
  const sum = (k: keyof CityDeductionRow) => r2(cities.reduce((s, c) => s + (c[k] as number), 0));
  return { cities, byCategory, categoryDeduction: sum("categoryDeduction"), fixedPctDeduction: sum("fixedPctDeduction"), totalDeduction: sum("totalDeduction") };
}
