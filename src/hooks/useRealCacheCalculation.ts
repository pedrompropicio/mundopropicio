import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import {
  computeRealCacheResults,
  computeTicketRevenueAndOccupancy,
  cityDeductionSources,
  filterRealCacheExpenses,
  type DeductionDetail,
  type RealCacheResult,
} from "@/lib/real-cache-calc";

export type { DeductionDetail, RealCacheResult };

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
      const { data: zones, error: qErr1 } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id, total_capacity")
        .in("event_id", allEventIds);
      if (qErr1) throw qErr1;
      const zoneIds = (zones ?? []).map((z) => z.id);
      if (zoneIds.length === 0) return { zones: zones ?? [], sales: [], lots: [] };

      const [salesRes, lotsRes] = await Promise.all([
        fetchAllPagedQuery(supabase.from("ticket_sales" as any).select("*").in("zone_id", zoneIds)),
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
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("transactions")
        .select("id, event_id, type, category_id, amount, iva_rate, status, is_transitory, exclude_from_result, parent_transaction_id, split_percentage")
        .in("event_id", allEventIds)
        .eq("type", "expense")
        .eq("is_hidden", false)
        .in("status", ["approved", "paid"]));
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

  // BP aprovado (fonte primária das deduções — decisão 29/09/2026).
  const { data: bpForecasts = [] } = useQuery({
    queryKey: ["real-cache-bp-forecasts", allEventIds.join(",")],
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("event_forecasts")
        .select("id, event_id, type, category_id, amount, iva_rate, status, is_transitory, is_overhead, exclude_from_result, version_id")
        .in("event_id", allEventIds)
        .eq("type", "expense")
        .is("version_id", null));
      if (error) throw error;
      return (data ?? []) as any[];
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

  // Receita real e ocupação — núcleo puro partilhado com a grelha de eventos.
  const { realRevenue, occupancyPct } = useMemo(() => {
    if (!salesData) return { realRevenue: { gross: 0, net: 0 }, occupancyPct: 0 };
    const r = computeTicketRevenueAndOccupancy(salesData.sales, salesData.lots, salesData.zones);
    return { realRevenue: r.revenue, occupancyPct: r.occupancyPct };
  }, [salesData]);

  // Resultados por config (regra em `src/lib/real-cache-calc.ts`).
  const results: RealCacheResult[] = useMemo(
    () =>
      computeRealCacheResults({
        configs: cacheConfigs,
        deductions,
        categoryMap,
        expenses: realExpenses,
        // Cada evento (Master + cidades) com o seu BP e excesso, peso 1 — soma = Σ cidades.
        sources: allEventIds.map((id) => ({
          forecasts: bpForecasts.filter((f: any) => f.event_id === id),
          expenses: realExpenses.filter((t: any) => t.event_id === id),
          weight: 1,
        })),
        revenue: realRevenue,
        occupancyPct,
      }),
    [cacheConfigs, deductions, categoryMap, realExpenses, bpForecasts, allEventIds, realRevenue, occupancyPct],
  );

  // Por cidade (turnês): mesma regra, receita/ocupação/despesas da cidade.
  const resultsByCity = useMemo(() => {
    const map: Record<string, RealCacheResult[]> = {};
    if (!salesData || childEventIds.length === 0) return map;
    for (const childId of childEventIds) {
      const r = computeTicketRevenueAndOccupancy(
        salesData.sales, salesData.lots, salesData.zones, childId,
      );
      map[childId] = computeRealCacheResults({
        configs: cacheConfigs,
        deductions,
        categoryMap,
        expenses: realExpenses.filter((t: any) => t.event_id === childId),
        sources: cityDeductionSources({
          cityForecasts: bpForecasts.filter((f: any) => f.event_id === childId),
          cityExpenses: realExpenses.filter((t: any) => t.event_id === childId),
          masterForecasts: bpForecasts.filter((f: any) => f.event_id === eventId),
          masterExpenses: realExpenses.filter((t: any) => t.event_id === eventId),
          cityCount: childEventIds.length,
        }),
        revenue: r.revenue,
        occupancyPct: r.occupancyPct,
      });
    }
    return map;
  }, [cacheConfigs, deductions, salesData, realExpenses, bpForecasts, categoryMap, childEventIds, eventId]);

  return {
    results,
    resultsByCity,
    realRevenue,
    realExpenses,
    occupancyPct,
    isLoading: !salesData,
  };
}
