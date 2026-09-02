import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealCacheCalculation } from "@/hooks/useRealCacheCalculation";
import { getCacheEffectiveAmount } from "@/lib/cache-pl-helper";

/**
 * Calcula o impacto do cachê (calculado/efetivo) nos Cards de Despesas do evento.
 *
 * Regras:
 *  - Soma o `finalAmount` efetivo de cada config (com prioridade adjusted/snapshot/cidade)
 *  - Em modo turnê (childEventIds preenchido) e SEM sub selecionado, soma o efetivo por cidade
 *  - Em modo turnê com sub selecionado, devolve apenas o efetivo da cidade
 *  - Em evento simples, devolve o efetivo dos configs do próprio evento
 *
 * Para evitar dupla contagem, devolve também `paidCacheTransactionsTotal`:
 * a soma das transações de categoria 2.1.01 (Cachês) já existentes nos eventos relevantes.
 * O consumidor deve fazer:  totalExpenses += max(0, calculatedCacheTotal - paidCacheTransactionsTotal)
 */
export function useEventCacheImpact(params: {
  eventId: string;
  /** IDs dos sub-eventos quando o evento é Master/multi_day. */
  childEventIds?: string[];
  /** Sub selecionado (cidade da turnê) — quando preenchido, usa só esse contexto. */
  selectedSubEventId?: string | null;
  eventStatus?: string;
}) {
  const { eventId, childEventIds = [], selectedSubEventId, eventStatus } = params;

  // O cálculo Real só faz sentido quando o evento já está active/completed
  const enabled = eventStatus === "active" || eventStatus === "completed";

  // 1) Buscar configs do evento "raiz" (em turnês os configs vivem no Master)
  const configsEventId = eventId;
  const { data: cacheConfigs = [] } = useQuery({
    queryKey: ["event_cache_configs_impact", configsEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cache_configs" as any)
        .select("*")
        .eq("event_id", configsEventId);
      if (error) throw error;
      return data as any[];
    },
    enabled: enabled && !!configsEventId,
  });

  const configIds = cacheConfigs.map((c: any) => c.id);

  const { data: deductions = [] } = useQuery({
    queryKey: ["event_cache_deductions_impact", configIds.join(",")],
    queryFn: async () => {
      if (configIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_cache_deductions" as any)
        .select("*")
        .in("cache_config_id", configIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: enabled && configIds.length > 0,
  });

  const { data: tiers = [] } = useQuery({
    queryKey: ["event_cache_tiers_impact", configIds.join(",")],
    queryFn: async () => {
      if (configIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_cache_tiers")
        .select("*")
        .in("cache_config_id", configIds)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && configIds.length > 0,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account_categories_impact"],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, code, name, type, parent_id, is_active")
        .eq("is_active", true);
      return data ?? [];
    },
    enabled: enabled && configIds.length > 0,
  });

  const { data: citySettlements = [] } = useQuery({
    queryKey: [
      "event_cache_city_settlements_impact",
      configIds.join(","),
      childEventIds.join(","),
    ],
    queryFn: async () => {
      if (configIds.length === 0 || childEventIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_cache_city_settlements" as any)
        .select("*")
        .in("cache_config_id", configIds)
        .in("event_id", childEventIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: enabled && configIds.length > 0 && childEventIds.length > 0,
  });

  const enrichedConfigs = useMemo(
    () =>
      cacheConfigs.map((c: any) => ({
        ...c,
        tiers: tiers
          .filter((t: any) => t.cache_config_id === c.id)
          .sort(
            (a: any, b: any) =>
              Number(a.occupancy_threshold) - Number(b.occupancy_threshold),
          )
          .map((t: any) => ({
            occupancy_threshold: Number(t.occupancy_threshold),
            percentage: Number(t.percentage),
          })),
      })),
    [cacheConfigs, tiers],
  );

  const { results, resultsByCity } = useRealCacheCalculation(
    configsEventId,
    childEventIds,
    enrichedConfigs,
    deductions,
    categories as any[],
    enabled && enrichedConfigs.length > 0,
  );

  // 2) Calcular total efetivo conforme contexto
  const calculatedCacheTotal = useMemo(() => {
    if (!enabled || enrichedConfigs.length === 0) return 0;
    const isTour = childEventIds.length > 0;

    if (isTour && selectedSubEventId) {
      // Cidade específica
      const cityResults = resultsByCity[selectedSubEventId] ?? [];
      return enrichedConfigs.reduce((sum, config: any) => {
        const r = cityResults.find((x) => x.configId === config.id);
        const calc = r?.finalAmount ?? 0;
        const cs =
          (citySettlements as any[]).find(
            (s) => s.cache_config_id === config.id && s.event_id === selectedSubEventId,
          ) ?? null;
        return sum + getCacheEffectiveAmount(config, calc, cs);
      }, 0);
    }

    if (isTour) {
      // Turnê inteira: somar todas as cidades
      let total = 0;
      for (const childId of childEventIds) {
        const cityResults = resultsByCity[childId] ?? [];
        for (const config of enrichedConfigs as any[]) {
          const r = cityResults.find((x) => x.configId === config.id);
          const calc = r?.finalAmount ?? 0;
          const cs =
            (citySettlements as any[]).find(
              (s) => s.cache_config_id === config.id && s.event_id === childId,
            ) ?? null;
          total += getCacheEffectiveAmount(config, calc, cs);
        }
      }
      return total;
    }

    // Evento simples
    return enrichedConfigs.reduce((sum, config: any) => {
      const r = results.find((x) => x.configId === config.id);
      const calc = r?.finalAmount ?? 0;
      return sum + getCacheEffectiveAmount(config, calc, null);
    }, 0);
  }, [
    enabled,
    enrichedConfigs,
    childEventIds,
    selectedSubEventId,
    resultsByCity,
    results,
    citySettlements,
  ]);

  // 3) Buscar transações já existentes de categoria Cachês (2.1.01) nos eventos relevantes,
  //    para evitar dupla contagem quando o pagamento real já foi lançado.
  const cacheCategoryId = useMemo(() => {
    const cat = (categories as any[]).find(
      (c) => c.code === "2.1.01" && c.type === "expense",
    );
    return cat?.id ?? null;
  }, [categories]);

  const txEventIds = useMemo(() => {
    const isTour = childEventIds.length > 0;
    if (isTour && selectedSubEventId) return [selectedSubEventId];
    if (isTour) return [eventId, ...childEventIds];
    return [eventId];
  }, [eventId, childEventIds, selectedSubEventId]);

  const { data: paidCacheTransactionsTotal = 0 } = useQuery({
    queryKey: [
      "cache_tx_already_booked",
      cacheCategoryId,
      txEventIds.join(","),
    ],
    queryFn: async () => {
      if (!cacheCategoryId) return 0;
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, status, is_transitory, parent_transaction_id, split_percentage, is_hidden")
        .in("event_id", txEventIds)
        .eq("type", "expense")
        .eq("category_id", cacheCategoryId)
        .in("status", ["approved", "paid"]);
      if (error) throw error;
      return (data ?? [])
        .filter(
          (t: any) =>
            !t.is_transitory &&
            !t.is_hidden &&
            !(t.parent_transaction_id && t.split_percentage !== null),
        )
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    },
    enabled: enabled && !!cacheCategoryId && txEventIds.length > 0,
  });

  // Impacto líquido a somar aos Cards: cachê calculado − cachê já lançado em transações.
  const cacheImpact = Math.max(
    0,
    calculatedCacheTotal - Number(paidCacheTransactionsTotal || 0),
  );

  return {
    calculatedCacheTotal,
    paidCacheTransactionsTotal: Number(paidCacheTransactionsTotal || 0),
    cacheImpact,
    hasCacheConfigured: enrichedConfigs.length > 0,
  };
}
