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
  tiers?: CacheTier[];
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
    if (config.cache_type === "fixed") {
      return {
        artistName: config.artist_name,
        cacheType: "fixed",
        amount: Number(config.fixed_amount),
      };
    }

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
    const calculated = Math.max(0, baseForCalc * (pct / 100));
    const minGuaranteed = Number(config.minimum_guaranteed) || 0;
    const amount = Math.round(Math.max(minGuaranteed, calculated));

    return {
      artistName: config.artist_name,
      cacheType: "variable",
      amount,
    };
  });
}
