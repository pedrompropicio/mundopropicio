import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolvePercentageFromTiers } from "@/lib/cache-pl-helper";

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

/**
 * Calculates cache values based on REAL (actual) revenue from ticket_sales
 * and REAL expenses from transactions, instead of forecasted values.
 */
export function useRealCacheCalculation(
  eventId: string,
  childEventIds: string[],
  cacheConfigs: any[],
  deductions: any[],
  categories: any[],
  enabled: boolean
) {
  const allEventIds = useMemo(
    () => [eventId, ...childEventIds],
    [eventId, childEventIds]
  );

  // Fetch real ticket sales revenue
  const { data: salesData } = useQuery({
    queryKey: ["real-ticket-sales", allEventIds.join(",")],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id, total_capacity")
        .in("event_id", allEventIds);
      const zoneIds = (zones ?? []).map((z) => z.id);
      if (zoneIds.length === 0) return { zones: zones ?? [], sales: [], lots: [] };

      const [salesRes, lotsRes] = await Promise.all([
        supabase.from("ticket_sales" as any).select("*").in("zone_id", zoneIds),
        supabase.from("event_ticket_lots").select("*").in("zone_id", zoneIds),
      ]);

      return {
        zones: zones ?? [],
        sales: (salesRes.data ?? []) as any[],
        lots: (lotsRes.data ?? []) as any[],
      };
    },
    enabled: enabled && allEventIds.length > 0,
  });

  // Fetch real expense transactions
  // Só paid + approved entram nas deduções reais — alinha com a regra geral
  // de "Real" em todos os módulos de resultado (Cards, DRE, P&L, Fecho, Acerto).
  const { data: realExpenses = [] } = useQuery({
    queryKey: ["real-expense-transactions-v2", allEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, category_id, amount, iva_rate, status, is_transitory, exclude_from_result, parent_transaction_id, split_percentage")
        .in("event_id", allEventIds)
        .eq("type", "expense")
        .eq("is_hidden", false)
        .in("status", ["approved", "paid"]);
      if (error) throw error;
      return (data ?? []).filter(
        (t: any) =>
          !(t.parent_transaction_id && t.split_percentage !== null) &&
          !t.is_transitory &&
          !t.exclude_from_result
      );
    },
    enabled: enabled && allEventIds.length > 0,
  });

  // Category lookup map
  const categoryMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const cat of categories) {
      map.set(cat.id, { code: cat.code, name: cat.name });
    }
    return map;
  }, [categories]);

  // Calculate real revenue and occupancy
  const { realRevenue, occupancyPct } = useMemo(() => {
    if (!salesData) return { realRevenue: { gross: 0, net: 0 }, occupancyPct: 0 };
    const { sales, lots, zones } = salesData;

    // Total capacity from zones
    const totalCapacity = (zones as any[]).reduce((s: number, z: any) => s + Number(z.total_capacity || 0), 0);

    const lotIvaMap = new Map<string, number>();
    for (const lot of lots) {
      lotIvaMap.set(lot.id, Number(lot.iva_rate ?? 6));
    }

    let gross = 0;
    let net = 0;
    let totalSold = 0;
    for (const sale of sales) {
      const qty = Number(sale.quantity);
      const price = Number(sale.unit_price);
      const ivaRate = lotIvaMap.get(sale.lot_id) ?? 6;
      gross += qty * price;
      net += qty * (price / (1 + ivaRate / 100));
      totalSold += qty;
    }
    const occ = totalCapacity > 0 ? (totalSold / totalCapacity) * 100 : 100;
    return { realRevenue: { gross, net }, occupancyPct: occ };
  }, [salesData]);

  // Calculate per-config results with detailed breakdowns
  const results: RealCacheResult[] = useMemo(() => {
    return cacheConfigs.map((config: any) => {
      if (config.cache_type === "fixed") {
        return {
          configId: config.id,
          artistName: config.artist_name,
          cacheType: "fixed",
          realRevenueGross: realRevenue.gross,
          realRevenueNet: realRevenue.net,
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
      const basis = basisIsGross ? realRevenue.gross : realRevenue.net;
      const basisLabel = basisIsGross ? "Bruta (c/ IVA)" : "Líquida (s/ IVA)";

      const configDeductions = deductions.filter(
        (d: any) => d.cache_config_id === config.id
      );
      const deductionCategoryIds = configDeductions.map((d: any) => d.category_id);
      const deductionBasisGross = (config.cache_deduction_basis || "net") === "gross";

      // Build per-category deduction details
      const deductionDetails: DeductionDetail[] = deductionCategoryIds.map((catId: string) => {
        const catInfo = categoryMap.get(catId);
        const matchingExpenses = realExpenses.filter(
          (t: any) => t.category_id === catId
        );
        const amount = matchingExpenses.reduce((s: number, t: any) => {
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
          hasTransaction: matchingExpenses.length > 0,
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

      const missingDeductionCategories = deductionDetails.filter((d) => !d.hasTransaction);

      return {
        configId: config.id,
        artistName: config.artist_name,
        cacheType: "variable",
        realRevenueGross: realRevenue.gross,
        realRevenueNet: realRevenue.net,
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
        missingDeductionCategories,
      };
    });
  }, [cacheConfigs, deductions, realRevenue, occupancyPct, realExpenses, categoryMap]);

  // Per-city results (for tour events) — calculate real values per child event id
  const resultsByCity = useMemo(() => {
    const map: Record<string, RealCacheResult[]> = {};
    if (!salesData || childEventIds.length === 0) return map;

    const { sales, lots, zones } = salesData;
    const lotIvaMap = new Map<string, number>();
    for (const lot of lots) lotIvaMap.set(lot.id, Number(lot.iva_rate ?? 6));
    const zoneToEvent = new Map<string, string>();
    const capacityByEvent = new Map<string, number>();
    for (const z of zones as any[]) {
      zoneToEvent.set(z.id, z.event_id);
      capacityByEvent.set(z.event_id, (capacityByEvent.get(z.event_id) ?? 0) + Number(z.total_capacity ?? 0));
    }

    for (const childId of childEventIds) {
      let gross = 0;
      let net = 0;
      let sold = 0;
      for (const sale of sales) {
        const eid = zoneToEvent.get(sale.zone_id);
        if (eid !== childId) continue;
        const qty = Number(sale.quantity);
        const price = Number(sale.unit_price);
        const ivaRate = lotIvaMap.get(sale.lot_id) ?? 6;
        gross += qty * price;
        net += qty * (price / (1 + ivaRate / 100));
        sold += qty;
      }
      const cap = capacityByEvent.get(childId) ?? 0;
      const occ = cap > 0 ? (sold / cap) * 100 : 100;
      const childExpenses = realExpenses.filter((t: any) => t.event_id === childId);

      const cityResults: RealCacheResult[] = cacheConfigs.map((config: any) => {
        if (config.cache_type === "fixed") {
          return {
            configId: config.id,
            artistName: config.artist_name,
            cacheType: "fixed",
            realRevenueGross: gross,
            realRevenueNet: net,
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
        const basis = basisIsGross ? gross : net;
        const basisLabel = basisIsGross ? "Bruta (c/ IVA)" : "Líquida (s/ IVA)";
        const configDeductions = deductions.filter((d: any) => d.cache_config_id === config.id);
        const deductionCategoryIds = configDeductions.map((d: any) => d.category_id);
        const deductionBasisGross = (config.cache_deduction_basis || "net") === "gross";
        const deductionDetails: DeductionDetail[] = deductionCategoryIds.map((catId: string) => {
          const catInfo = categoryMap.get(catId);
          const matching = childExpenses.filter((t: any) => t.category_id === catId);
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
        const pct = resolvePercentageFromTiers(config, occ);
        const calculated = Math.max(0, baseForCalc * (pct / 100));
        const minGuaranteed = Number(config.minimum_guaranteed) || 0;
        const finalAmount = Math.round(Math.max(minGuaranteed, calculated) * 100) / 100;
        return {
          configId: config.id,
          artistName: config.artist_name,
          cacheType: "variable",
          realRevenueGross: gross,
          realRevenueNet: net,
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

      map[childId] = cityResults;
    }
    return map;
  }, [cacheConfigs, deductions, salesData, realExpenses, categoryMap, childEventIds]);

  return {
    results,
    resultsByCity,
    realRevenue,
    realExpenses,
    occupancyPct,
    isLoading: !salesData,
  };
}
