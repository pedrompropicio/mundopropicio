import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateEventFinancials } from "@/lib/invalidate-event-financials";
import { realtimeIdFilter, useRealtimeInvalidation, type RealtimeSub } from "@/hooks/useRealtimeInvalidation";

/**
 * Subscrição do detalhe do evento: evento + Master + subeventos (D-ERP266).
 * ticket_sales não tem event_id: filtra-se por zone_id das zonas do evento; deduções e escalões
 * do cachê por cache_config_id. Assim um import de outro evento (ex.: re-import Fever de
 * milhares de linhas) não chega a este ecrã. DELETE não aceita filtro no Realtime e só traz o id:
 * - deduções/escalões: DELETE sem filtro (raros e pequenos);
 * - ticket_sales: sem DELETE — um re-import apaga e volta a inserir (os INSERT filtrados chegam);
 *   quem apaga à mão já invalida pela ligação geral (mutação).
 */
export function eventFinancialSubs(
  eventIds: (string | null | undefined)[],
  zoneIds: string[] = [],
  cacheConfigIds: string[] = [],
): RealtimeSub[] {
  const f = realtimeIdFilter("event_id", eventIds);
  if (!f) return [];
  const subs: RealtimeSub[] = [
    { table: "transactions", filter: f },
    { table: "event_forecasts", filter: f },
    { table: "event_cache_configs", filter: f },
    { table: "event_cache_city_settlements", filter: f },
  ];
  const cf = realtimeIdFilter("cache_config_id", cacheConfigIds);
  if (cf) {
    for (const table of ["event_cache_deductions", "event_cache_tiers"]) {
      subs.push({ table, filter: cf, event: "INSERT" }, { table, filter: cf, event: "UPDATE" }, { table, event: "DELETE" });
    }
  }
  // Filtro Realtime aceita até 100 valores; acima disso fica sem filtro (o RLS limita à empresa).
  const zf = new Set(zoneIds).size > 100 ? undefined : realtimeIdFilter("zone_id", zoneIds);
  if (zf === undefined) subs.push({ table: "ticket_sales", event: "INSERT" }, { table: "ticket_sales", event: "UPDATE" });
  else if (zf) subs.push({ table: "ticket_sales", filter: zf, event: "INSERT" }, { table: "ticket_sales", filter: zf, event: "UPDATE" });
  return subs;
}

export function useEventFinancialsRealtime(eventIds: (string | null | undefined)[]) {
  const qc = useQueryClient();
  const key = [...new Set(eventIds.filter(Boolean))].sort().join(",");
  const ids = useMemo(() => (key ? key.split(",") : []), [key]);
  const { data: scope } = useQuery({
    queryKey: ["event_cache_rt_scope", key], // prefixo event_cache_: refaz-se com a invalidação (zonas/configs novas)
    enabled: !!key,
    staleTime: 60_000,
    queryFn: async () => {
      const [z, c] = await Promise.all([
        supabase.from("event_ticket_zones").select("id").in("event_id", ids),
        supabase.from("event_cache_configs").select("id").in("event_id", ids),
      ]);
      return { zones: (z.data ?? []).map((r: any) => r.id as string), configs: (c.data ?? []).map((r: any) => r.id as string) };
    },
  });
  const subs = useMemo(() => eventFinancialSubs(ids, scope?.zones ?? [], scope?.configs ?? []), [ids, scope]);
  useRealtimeInvalidation(`event-fin-${key}`, subs, () => invalidateEventFinancials(qc), { enabled: !!key });
}
