import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateEventFinancials } from "@/lib/invalidate-event-financials";
import { realtimeIdFilter, useRealtimeInvalidation, type RealtimeSub } from "@/hooks/useRealtimeInvalidation";

/** Subscrição do detalhe do evento: evento + Master + subeventos (D-ERP266). */
export function eventFinancialSubs(eventIds: (string | null | undefined)[]): RealtimeSub[] {
  const f = realtimeIdFilter("event_id", eventIds);
  if (!f) return [];
  return [
    { table: "transactions", filter: f },
    { table: "event_forecasts", filter: f },
    { table: "event_cache_configs", filter: f },
    { table: "event_cache_city_settlements", filter: f },
    // sem event_id nestas tabelas: o RLS limita à empresa
    { table: "event_cache_deductions" },
    { table: "event_cache_tiers" },
    { table: "ticket_sales" },
  ];
}

export function useEventFinancialsRealtime(eventIds: (string | null | undefined)[]) {
  const qc = useQueryClient();
  const key = [...new Set(eventIds.filter(Boolean))].sort().join(",");
  const subs = useMemo(() => eventFinancialSubs(key ? key.split(",") : []), [key]);
  useRealtimeInvalidation(`event-fin-${key}`, subs, () => invalidateEventFinancials(qc), { enabled: !!key });
}
