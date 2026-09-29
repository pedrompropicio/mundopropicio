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
import {
  computeOutsideBpExcess,
  isApprovedOperationalForecast,
  isApprovedOverheadForecast,
  sumLines,
} from "@/lib/event-cost-basis";

/** Origem do valor de uma dedução (decisão do Pedro, 29/09/2026). */
export type DeductionOrigin = "bp" | "transaction" | "bp_excess" | "none";

export interface DeductionDetail {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  amount: number;
  hasTransaction: boolean;
  /** Parte que vem do BP aprovado (já pesada pela quota). */
  bpAmount: number;
  /** Excedido das transações sobre o BP (Previsto + excedido), já pesado. */
  excessAmount: number;
  origin: DeductionOrigin;
}

/**
 * Fonte de deduções: um evento (cidade ou Master) com o seu BP e transações,
 * e o peso com que entra (1 = própria cidade; 1/N = quota igual do Master).
 * O excesso calcula-se POR EVENTO (nunca em pool — ver #217).
 */
export interface DeductionSource {
  forecasts: any[];
  expenses: any[];
  weight: number;
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
  /** Fontes BP + transações. Se ausente, usa só `expenses` (peso 1, sem BP). */
  sources?: DeductionSource[];
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

    const sources: DeductionSource[] = input.sources ?? [{ forecasts: [], expenses, weight: 1 }];
    const deductionDetails: DeductionDetail[] = deductionCategoryIds.map((catId: string) => {
      const catInfo = categoryMap.get(catId);
      let bpAmount = 0;
      let excessAmount = 0;
      let hasTransaction = false;
      for (const src of sources) {
        const fc = (src.forecasts ?? []).filter(
          (f: any) =>
            f.category_id === catId &&
            (f.type ?? "expense") === "expense" &&
            (isApprovedOperationalForecast(f) || isApprovedOverheadForecast(f)),
        );
        const tx = (src.expenses ?? []).filter((t: any) => t.category_id === catId);
        if (tx.length > 0) hasTransaction = true;
        // Previsto + excedido: BP + max(realizado − previsto, 0). Nunca BP + TX.
        bpAmount += sumLines(fc, deductionBasisGross) * src.weight;
        excessAmount += computeOutsideBpExcess(fc, tx, deductionBasisGross) * src.weight;
      }
      bpAmount = roundCents(bpAmount);
      excessAmount = roundCents(excessAmount);
      const origin: DeductionOrigin =
        bpAmount > 0 && excessAmount > 0 ? "bp_excess"
          : bpAmount > 0 ? "bp"
          : excessAmount > 0 ? "transaction"
          : "none";
      return {
        categoryId: catId,
        categoryCode: catInfo?.code ?? "",
        categoryName: catInfo?.name ?? "Categoria desconhecida",
        amount: roundCents(bpAmount + excessAmount),
        hasTransaction,
        bpAmount,
        excessAmount,
        origin,
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
      missingDeductionCategories: deductionDetails.filter((d) => d.origin === "none"),
    };
  });
}

function roundCents(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Fontes de dedução de uma CIDADE de turnê: o BP/TX da própria cidade (peso 1)
 * mais a quota igual 1/N do BP/TX do Master (N = nº de cidades), independente
 * das vendas de cada cidade.
 */
export function cityDeductionSources(args: {
  cityForecasts: any[];
  cityExpenses: any[];
  masterForecasts: any[];
  masterExpenses: any[];
  cityCount: number;
}): DeductionSource[] {
  const n = Math.max(1, Math.trunc(args.cityCount || 0));
  return [
    { forecasts: args.cityForecasts, expenses: args.cityExpenses, weight: 1 },
    { forecasts: args.masterForecasts, expenses: args.masterExpenses, weight: 1 / n },
  ];
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
