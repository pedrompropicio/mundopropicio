/**
 * Shared helper to calculate cachê values for P&L integration.
 */

export interface CacheConfig {
  id: string;
  event_id: string;
  artist_name: string;
  cache_type: string;
  fixed_amount: number;
  percentage: number;
  fixed_deduction_percentage: number;
  cache_revenue_basis?: string;
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
 * Calculate cachê lines for a given event to inject into P&L as expenses.
 * Returns individual artist lines + total.
 */
export function calculateCacheLinesForPL(
  configs: CacheConfig[],
  deductions: CacheDeduction[],
  ticketRevenueNet: number,
  forecasts: { type: string; category_id: string | null; amount: number }[],
  ticketRevenueGross?: number
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

    const categoryDeductionAmount = forecasts
      .filter(
        (f) =>
          f.type === "expense" && deductionCategoryIds.has(f.category_id ?? "")
      )
      .reduce((s, f) => s + Number(f.amount), 0);

    const fixedPctDeduction = basis * ((Number(config.fixed_deduction_percentage) || 0) / 100);
    const totalDeduction = categoryDeductionAmount + fixedPctDeduction;
    const baseForCalc = basis - totalDeduction;
    const pct = Number(config.percentage) || 0;
    const amount = Math.max(0, baseForCalc * (pct / 100));

    return {
      artistName: config.artist_name,
      cacheType: "variable",
      amount,
    };
  });
}
