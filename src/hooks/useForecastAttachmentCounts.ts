/**
 * #269 — contagem de anexos (event_forecast_attachments) de TODAS as linhas do
 * BP de um evento (e dos seus sub-eventos) numa só leitura, em vez de uma por
 * linha. Devolve um mapa forecast_id → nº de anexos.
 *
 * A queryKey começa por "event_forecast_attachments_counts", por isso a
 * invalidação por prefixo feita no BPNotesAttachmentsModal continua a valer.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";

const EMPTY_COUNTS: Record<string, number> = {};

export const forecastAttachmentCountsKey = (eventId: string | null | undefined) => [
  "event_forecast_attachments_counts",
  eventId ?? null,
];

export async function fetchForecastAttachmentCounts(eventId: string): Promise<Record<string, number>> {
  const { data: evs, error: evErr } = await supabase
    .from("events")
    .select("id")
    .or(`id.eq.${eventId},parent_event_id.eq.${eventId}`);
  if (evErr) throw evErr;
  const ids = Array.from(new Set([eventId, ...((evs ?? []) as any[]).map((e) => e.id)]));
  const { data, error } = await fetchAllPagedQuery(
    supabase
      .from("event_forecast_attachments" as any)
      .select("id, forecast_id, event_forecasts!inner(event_id)")
      .in("event_forecasts.event_id", ids),
  );
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as any[]) out[r.forecast_id] = (out[r.forecast_id] ?? 0) + 1;
  return out;
}

export function useForecastAttachmentCounts(eventId: string | null | undefined): Record<string, number> {
  const { data } = useQuery({
    queryKey: forecastAttachmentCountsKey(eventId),
    queryFn: () => fetchForecastAttachmentCounts(eventId!),
    enabled: !!eventId,
    staleTime: 60_000,
  });
  return data ?? EMPTY_COUNTS;
}
