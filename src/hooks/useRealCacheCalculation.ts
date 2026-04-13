import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CacheConfig {
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
}

interface RealCacheResult {
  configId: string;
  artistName: string;
  cacheType: string;
  realRevenueGross: number;
  realRevenueNet: number;
  realDeductionAmount: number;
  fixedPctDeduction: number;
  totalDeduction: number;
  baseForCalc: number;
  percentage: number;
  calculatedAmount: number;
  minimumGuaranteed: number;
  finalAmount: number;
  isUsingMinimum: boolean;
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
      // Get zones for all events
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id")
        .in("event_id", allEventIds);
      const zoneIds = (zones ?? []).map((z) => z.id);
      if (zoneIds.length === 0) return { zones: [], sales: [], lots: [] };

      // Get sales and lots in parallel
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
  const { data: realExpenses = [] } = useQuery({
    queryKey: ["real-expense-transactions", allEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, category_id, amount, iva_rate, is_transitory, exclude_from_result, parent_transaction_id")
        .in("event_id", allEventIds)
        .eq("type", "expense")
        .eq("is_hidden", false);
      if (error) throw error;
      // Exclude child splits (they're already counted via parent) and transitory
      return (data ?? []).filter(
        (t: any) => !t.parent_transaction_id && !t.is_transitory && !t.exclude_from_result
      );
    },
    enabled: enabled && allEventIds.length > 0,
  });

  // Calculate real revenue per event
  const realRevenue = useMemo(() => {
    if (!salesData) return { gross: 0, net: 0 };
    const { sales, lots, zones } = salesData;

    // Build lot IVA rate map
    const lotIvaMap = new Map<string, number>();
    for (const lot of lots) {
      lotIvaMap.set(lot.id, Number(lot.iva_rate ?? 6));
    }

    let gross = 0;
    let net = 0;
    for (const sale of sales) {
      const qty = Number(sale.quantity);
      const price = Number(sale.unit_price);
      const ivaRate = lotIvaMap.get(sale.lot_id) ?? 6;
      gross += qty * price;
      net += qty * (price / (1 + ivaRate / 100));
    }
    return { gross, net };
  }, [salesData]);

  // Calculate per-config results
  const results: RealCacheResult[] = useMemo(() => {
    return cacheConfigs.map((config: any) => {
      if (config.cache_type === "fixed") {
        return {
          configId: config.id,
          artistName: config.artist_name,
          cacheType: "fixed",
          realRevenueGross: realRevenue.gross,
          realRevenueNet: realRevenue.net,
          realDeductionAmount: 0,
          fixedPctDeduction: 0,
          totalDeduction: 0,
          baseForCalc: 0,
          percentage: 0,
          calculatedAmount: Number(config.fixed_amount),
          minimumGuaranteed: 0,
          finalAmount: Number(config.fixed_amount),
          isUsingMinimum: false,
        };
      }

      // Variable: use real data
      const basis =
        config.cache_revenue_basis === "gross"
          ? realRevenue.gross
          : realRevenue.net;

      const configDeductions = deductions.filter(
        (d: any) => d.cache_config_id === config.id
      );
      const deductionCategoryIds = new Set(
        configDeductions.map((d: any) => d.category_id)
      );
      const deductionBasisGross =
        (config.cache_deduction_basis || "net") === "gross";

      const realDeductionAmount = realExpenses
        .filter(
          (t: any) =>
            deductionCategoryIds.has(t.category_id ?? "")
        )
        .reduce((s: number, t: any) => {
          const base = Number(t.amount);
          if (deductionBasisGross) {
            const rate = Number(t.iva_rate ?? 0);
            return s + base * (1 + rate / 100);
          }
          return s + base;
        }, 0);

      const fixedPctDeduction =
        basis * ((Number(config.fixed_deduction_percentage) || 0) / 100);
      const totalDeduction = realDeductionAmount + fixedPctDeduction;
      const baseForCalc = basis - totalDeduction;
      const pct = Number(config.percentage) || 0;
      const calculated = Math.max(0, baseForCalc * (pct / 100));
      const minGuaranteed = Number(config.minimum_guaranteed) || 0;
      const finalAmount = Math.round(Math.max(minGuaranteed, calculated));

      return {
        configId: config.id,
        artistName: config.artist_name,
        cacheType: "variable",
        realRevenueGross: realRevenue.gross,
        realRevenueNet: realRevenue.net,
        realDeductionAmount,
        fixedPctDeduction,
        totalDeduction,
        baseForCalc,
        percentage: pct,
        calculatedAmount: calculated,
        minimumGuaranteed: minGuaranteed,
        finalAmount,
        isUsingMinimum: minGuaranteed > 0 && finalAmount === Math.round(minGuaranteed),
      };
    });
  }, [cacheConfigs, deductions, realRevenue, realExpenses]);

  return {
    results,
    realRevenue,
    realExpenses,
    isLoading: !salesData,
  };
}
