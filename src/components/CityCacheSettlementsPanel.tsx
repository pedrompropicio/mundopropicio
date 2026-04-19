import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CacheSettlementPanel } from "@/components/CacheSettlementPanel";
import { CacheExtrasPanel } from "@/components/CacheExtrasPanel";
import type { RealCacheResult } from "@/hooks/useRealCacheCalculation";
import { MapPin } from "lucide-react";

interface Props {
  config: any;
  eventId: string; // master id
  childEventIds: string[];
  resultsByCity: Record<string, RealCacheResult[]>;
  canEdit: boolean;
  eventStatus?: string;
}

export function CityCacheSettlementsPanel({
  config,
  eventId,
  childEventIds,
  resultsByCity,
  canEdit,
  eventStatus,
}: Props) {
  const { data: childEvents = [] } = useQuery({
    queryKey: ["child-events-for-cache", eventId, childEventIds],
    queryFn: async () => {
      if (childEventIds.length === 0) return [];
      const { data } = await supabase
        .from("events")
        .select("id, name, date, location, city_id, cities(name)")
        .in("id", childEventIds)
        .order("date");
      return data ?? [];
    },
    enabled: childEventIds.length > 0,
  });

  const { data: citySettlements = [] } = useQuery({
    queryKey: ["event_cache_city_settlements", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cache_city_settlements" as any)
        .select("*")
        .eq("cache_config_id", config.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (eventStatus !== "active" && eventStatus !== "completed") return null;
  if (childEventIds.length === 0) return null;

  return (
    <div className="border-t border-border bg-muted/10 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Fecho por Cidade
        </span>
      </div>

      <div className="space-y-3">
        {childEvents.map((child: any) => {
          const cityResults = resultsByCity[child.id] ?? [];
          const realResult = cityResults.find((r) => r.configId === config.id);
          const settlement = citySettlements.find((s) => s.event_id === child.id) ?? null;
          const cityLabel = child.cities?.name || child.location || child.name;
          const projectedValue = realResult?.finalAmount ?? 0;

          return (
            <div key={child.id} className="rounded-lg border border-border bg-background overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <p className="text-xs font-semibold">{child.name}</p>
                {cityLabel && cityLabel !== child.name && (
                  <p className="text-[10px] text-muted-foreground">{cityLabel}</p>
                )}
              </div>

              <div className="px-3 pt-2">
                <CacheExtrasPanel
                  cacheConfigId={config.id}
                  artistName={`${config.artist_name} (variações locais)`}
                  eventId={child.id}
                  canEdit={canEdit}
                />
              </div>

              <CacheSettlementPanel
                config={config}
                realResult={realResult}
                projectedValue={projectedValue}
                eventId={eventId}
                canEdit={canEdit}
                eventStatus={eventStatus}
                cityEventId={child.id}
                citySettlement={settlement}
                cityLabel={cityLabel}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
