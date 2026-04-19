/**
 * Shared helper to calculate cachê values for BP integration.
 */

export interface CacheTier {
  occupancy_threshold: number;
  percentage: number;
}

export interface CacheConfig {
  id: string;
  event_id: string;
  artist_name: string;
  cache_type: string;
  fixed_amount: number;
  percentage: number;
  fixed_deduction_percentage: number;
  cache_revenue_basis?: string;
  cache_deduction_basis?: string;
  minimum_guaranteed?: number;
  is_finalized?: boolean;
  /** Snapshot do valor calculado no momento do fecho. Consumido quando is_finalized=true e adjusted_amount é null. */
  real_amount?: number | null;
  /** Valor negociado/acordado que sobrepõe qualquer cálculo. Tem prioridade máxima. */
  adjusted_amount?: number | null;
  tiers?: CacheTier[];
}

/**
 * Settlement de cidade (uma row de event_cache_city_settlements).
 * Quando presente, sobrepõe os campos legacy de event_cache_configs.
 */
export interface CityCacheSettlement {
  is_finalized?: boolean;
  real_amount?: number | null;
  adjusted_amount?: number | null;
}

/**
 * Single source of truth para o valor "efetivo" do cachê de um artista.
 *
 * Prioridade:
 *   1. citySettlement.adjusted_amount  → ajuste por cidade (turnê)
 *   2. citySettlement.real_amount      → snapshot da cidade (se finalizada)
 *   3. config.adjusted_amount          → ajuste no Master (eventos simples)
 *   4. config.real_amount              → snapshot do Master (se finalizado)
 *   5. calculatedAmount                → cálculo dinâmico em tempo real
 *
 * Adiantamentos (event_cache_payments) NÃO entram aqui — são abatidos só na
 * geração da transação final de pagamento, não alteram o valor do cachê em si.
 */
export function getCacheEffectiveAmount(
  config: Pick<CacheConfig, "is_finalized" | "real_amount" | "adjusted_amount">,
  calculatedAmount: number,
  citySettlement?: CityCacheSettlement | null,
): number {
  if (citySettlement) {
    if (citySettlement.adjusted_amount != null) return Number(citySettlement.adjusted_amount);
    if (citySettlement.is_finalized && citySettlement.real_amount != null) {
      return Number(citySettlement.real_amount);
    }
  }
  if (config.adjusted_amount != null) return Number(config.adjusted_amount);
  if (config.is_finalized && config.real_amount != null) return Number(config.real_amount);
  return calculatedAmount;
}

/**
 * Resolve the applicable percentage for a variable cache.
 * If tiers exist, uses the highest tier whose threshold is <= occupancy.
 * Falls back to config.percentage if no tiers.
 */
export function resolvePercentageFromTiers(
  config: CacheConfig,
  occupancyPct: number
): number {
  const tiers = config.tiers;
  if (!tiers || tiers.length === 0) return Number(config.percentage) || 0;

  // Sort tiers by threshold ascending
  const sorted = [...tiers].sort((a, b) => a.occupancy_threshold - b.occupancy_threshold);
  let applicable = sorted[0]?.percentage ?? (Number(config.percentage) || 0);
  for (const tier of sorted) {
    if (occupancyPct >= tier.occupancy_threshold) {
      applicable = tier.percentage;
    } else {
      break;
    }
  }
  return applicable;
}

export interface CacheDeduction {
  id: string;
  cache_config_id: string;
  category_id: string;
}

export interface CachePLLine {
  artistName: string;
  cacheType: string;
  amount: number; // net amount (sem IVA)
}

/**
 * Calculate cachê lines for a given event to inject into BP as expenses.
 * Returns individual artist lines + total.
 */
export function calculateCacheLinesForPL(
  configs: CacheConfig[],
  deductions: CacheDeduction[],
  ticketRevenueNet: number,
  forecasts: { type: string; category_id: string | null; amount: number; iva_rate?: number }[],
  ticketRevenueGross?: number,
  occupancyPct?: number
): CachePLLine[] {
  return configs.map((config) => {
    let calculated: number;
    let cacheType: string;

    if (config.cache_type === "fixed") {
      calculated = Number(config.fixed_amount);
      cacheType = "fixed";
    } else {
      // Variable: percentage over (revenue - deduction expenses)
      const basis = config.cache_revenue_basis === "gross" ? (ticketRevenueGross ?? ticketRevenueNet) : ticketRevenueNet;
      const configDeductions = deductions.filter(
        (d) => d.cache_config_id === config.id
      );
      const deductionCategoryIds = new Set(
        configDeductions.map((d) => d.category_id)
      );

      const deductionBasisGross = config.cache_deduction_basis === "gross";

      const categoryDeductionAmount = forecasts
        .filter(
          (f) =>
            f.type === "expense" && deductionCategoryIds.has(f.category_id ?? "")
        )
        .reduce((s, f) => {
          const base = Number(f.amount);
          if (deductionBasisGross) {
            const rate = Number(f.iva_rate ?? 0);
            return s + base * (1 + rate / 100);
          }
          return s + base;
        }, 0);

      const fixedPctDeduction = basis * ((Number(config.fixed_deduction_percentage) || 0) / 100);
      const totalDeduction = categoryDeductionAmount + fixedPctDeduction;
      const baseForCalc = basis - totalDeduction;
      const pct = resolvePercentageFromTiers(config, occupancyPct ?? 100);
      const calcRaw = Math.max(0, baseForCalc * (pct / 100));
      const minGuaranteed = Number(config.minimum_guaranteed) || 0;
      calculated = Math.round(Math.max(minGuaranteed, calcRaw));
      cacheType = "variable";
    }

    // Apply override priority (adjusted_amount → real_amount if finalized → calculated)
    const amount = getCacheEffectiveAmount(config, calculated);

    return {
      artistName: config.artist_name,
      cacheType,
      amount,
    };
  });
}
