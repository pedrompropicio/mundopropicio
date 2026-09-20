/**
 * NÚCLEO PURO do cálculo do cachê REAL (sem React, sem queries).
 *
 * Extraído de `useRealCacheCalculation` / `useEventCacheImpact` para que a
 * GRELHA de eventos (/eventos) possa calcular o mesmo cachê em lote, sem uma
 * cascata de queries por evento, e sem uma segunda implementação da regra.
 *
 * Fonte de verdade da regra: aqui. O hook passou a ser um wrapper de fetch.
 */
import { resolvePercentageFromTiers, getCacheEffectiveAmount } from "@/lib/cache-pl-helper";

export interface DeductionDetail {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  amount: number;
  hasTransaction: boolean;
}

export interface RealCacheResult {
  configId: string;
  artistName: string;
  cacheType: string;
  realRevenueGross: number;
  realRevenueNet: number;
  revenueBasis: number;
  revenueBasisLabel: string;
  deductionDetails: DeductionDetail[];
  realDeductionAmount: number;
  fixedPctDeduction: number;
  fixedPctRate: number;
  totalDeduction: number;
  baseForCalc: number;
  percentage: number;
  calculatedAmount: number;
  minimumGuaranteed: number;
  finalAmount: number;
  isUsingMinimum: boolean;
  missingDeductionCategories: DeductionDetail[];
}

export interface RealCacheInput {
  /** configs já enriquecidos com `tiers`. */
  configs: any[];
  deductions: any[];
  categoryMap: Map<string, { code: string; name: string }>;
  /** despesas reais já filtradas (approved/paid, sem splits/transitórias/excluídas). */
  expenses: any[];
  revenue: { gross: number; net: number };
  occupancyPct: number;
}

/** Receita e ocupação a partir de `ticket_sales` (+ lotes e zonas). */
export function computeTicketRevenueAndOccupancy(
  sales: any[],
  lots: any[],
  zones: any[],
  onlyEventId?: string,
): { revenue: { gross: number; net: number }; occupancyPct: number; quantity: number } {
  const lotIva = new Map<string, number>();
  for (const lot of lots) lotIva.set(lot.id, Number(lot.iva_rate ?? 6));

  const zoneToEvent = new Map<string, string>();
  let capacity = 0;
  for (const z of zones as any[]) {
    zoneToEvent.set(z.id, z.event_id);
    if (!onlyEventId || z.event_id === onlyEventId) capacity += Number(z.total_capacity ?? 0);
  }

  let gross = 0;
  let net = 0;
  let sold = 0;
  for (const sale of sales) {
    if (onlyEventId && zoneToEvent.get(sale.zone_id) !== onlyEventId) continue;
    const qty = Number(sale.quantity);
    const price = Number(sale.unit_price);
    const ivaRate = lotIva.get(sale.lot_id) ?? 6;
    gross += qty * price;
    net += qty * (price / (1 + ivaRate / 100));
    sold += qty;
  }
  return {
    revenue: { gross, net },
    occupancyPct: capacity > 0 ? (sold / capacity) * 100 : 100,
    quantity: sold,
  };
}

export function computeRealCacheResults(input: RealCacheInput): RealCacheResult[] {
  const { configs, deductions, categoryMap, expenses, revenue, occupancyPct } = input;

  return configs.map((config: any) => {
    if (config.cache_type === "fixed") {
      return {
        configId: config.id,
        artistName: config.artist_name,
        cacheType: "fixed",
        realRevenueGross: revenue.gross,
        realRevenueNet: revenue.net,
        revenueBasis: 0,
        revenueBasisLabel: "",
        deductionDetails: [],
        realDeductionAmount: 0,
        fixedPctDeduction: 0,
        fixedPctRate: 0,
        totalDeduction: 0,
        baseForCalc: 0,
        percentage: 0,
        calculatedAmount: Number(config.fixed_amount),
        minimumGuaranteed: 0,
        finalAmount: Number(config.fixed_amount),
        isUsingMinimum: false,
        missingDeductionCategories: [],
      };
    }

    const basisIsGross = config.cache_revenue_basis === "gross";
    const basis = basisIsGross ? revenue.gross : revenue.net;
    const basisLabel = basisIsGross ? "Bruta (c/ IVA)" : "Líquida (s/ IVA)";

    const configDeductions = deductions.filter((d: any) => d.cache_config_id === config.id);
    const deductionCategoryIds = configDeductions.map((d: any) => d.category_id);
    const deductionBasisGross = (config.cache_deduction_basis || "net") === "gross";

    const deductionDetails: DeductionDetail[] = deductionCategoryIds.map((catId: string) => {
      const catInfo = categoryMap.get(catId);
      const matching = expenses.filter((t: any) => t.category_id === catId);
      const amount = matching.reduce((s: number, t: any) => {
        const base = Number(t.amount);
        if (deductionBasisGross) {
          const rate = Number(t.iva_rate ?? 0);
          return s + base * (1 + rate / 100);
        }
        return s + base;
      }, 0);
      return {
        categoryId: catId,
        categoryCode: catInfo?.code ?? "",
        categoryName: catInfo?.name ?? "Categoria desconhecida",
        amount,
        hasTransaction: matching.length > 0,
      };
    });

    const realDeductionAmount = deductionDetails.reduce((s, d) => s + d.amount, 0);
    const fixedPctRate = Number(config.fixed_deduction_percentage) || 0;
    const fixedPctDeduction = basis * (fixedPctRate / 100);
    const totalDeduction = realDeductionAmount + fixedPctDeduction;
    const baseForCalc = basis - totalDeduction;
    const pct = resolvePercentageFromTiers(config, occupancyPct);
    const calculated = Math.max(0, baseForCalc * (pct / 100));
    const minGuaranteed = Number(config.minimum_guaranteed) || 0;
    const finalAmount = Math.round(Math.max(minGuaranteed, calculated) * 100) / 100;

    return {
      configId: config.id,
      artistName: config.artist_name,
      cacheType: "variable",
      realRevenueGross: revenue.gross,
      realRevenueNet: revenue.net,
      revenueBasis: basis,
      revenueBasisLabel: basisLabel,
      deductionDetails,
      realDeductionAmount,
      fixedPctDeduction,
      fixedPctRate,
      totalDeduction,
      baseForCalc,
      percentage: pct,
      calculatedAmount: calculated,
      minimumGuaranteed: minGuaranteed,
      finalAmount,
      isUsingMinimum: minGuaranteed > 0 && finalAmount === Math.round(minGuaranteed * 100) / 100,
      missingDeductionCategories: deductionDetails.filter((d) => !d.hasTransaction),
    };
  });
}

/** Filtro canónico das despesas reais que servem de dedução ao cachê. */
export function filterRealCacheExpenses(rows: any[]): any[] {
  return rows.filter(
    (t: any) =>
      t.type === "expense" &&
      t.is_hidden !== true &&
      (t.status === "approved" || t.status === "paid") &&
      !(t.parent_transaction_id && t.split_percentage !== null) &&
      !t.is_transitory &&
      !t.exclude_from_result,
  );
}

/** Enriquecer configs com os tiers ordenados (mesma ordenação do hook). */
export function enrichCacheConfigs(configs: any[], tiers: any[]): any[] {
  return configs.map((c: any) => ({
    ...c,
    tiers: tiers
      .filter((t: any) => t.cache_config_id === c.id)
      .sort((a: any, b: any) => Number(a.occupancy_threshold) - Number(b.occupancy_threshold))
      .map((t: any) => ({
        occupancy_threshold: Number(t.occupancy_threshold),
        percentage: Number(t.percentage),
      })),
  }));
}

export { getCacheEffectiveAmount };
