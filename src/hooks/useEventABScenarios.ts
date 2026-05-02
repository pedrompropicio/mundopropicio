import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeTotals,
  type ABFoodConfig,
  type ABZoneInput,
  type ABTotals,
} from "@/lib/event-ab-calc";

export interface ABScenarioParticipants {
  /** map zone_label (lowercase) → participantes */
  real: Record<string, number>;
  breakeven: Record<string, number>;
  forecast: Record<string, number>;
}

export interface UseEventABResult {
  hasConfig: boolean;
  totals: { real: ABTotals; breakeven: ABTotals; forecast: ABTotals } | null;
}

/**
 * Calcula os totais A&B nos 3 cenários a partir do módulo A&B do evento.
 * Pode ser usado em qualquer view (Simulador, DRE, etc.) sem expor os parâmetros
 * de negociação ao utilizador final.
 *
 * Os participantes por zona são fornecidos pelo caller (idealmente a partir
 * da fonte canónica do contexto — ticket_sales para Real, solver BE/forecast
 * do Simulador para os outros).
 */
export function useEventABScenarios(
  eventId: string | undefined,
  participants: ABScenarioParticipants,
): UseEventABResult {
  const { data: zones = [] } = useQuery({
    queryKey: ["ab_zones_simulator", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ab_zones")
        .select("*")
        .eq("event_id", eventId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });

  const { data: config = null } = useQuery({
    queryKey: ["ab_config_simulator", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ab_config")
        .select("*")
        .eq("event_id", eventId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const { data: ticketZones = [] } = useQuery({
    queryKey: ["ab_ticket_zones_sim", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, name")
        .eq("event_id", eventId!)
        .is("version_id", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!eventId,
  });

  const { data: realParticipantsDb = {} } = useQuery({
    queryKey: ["ab_real_simulator", eventId, ticketZones.map((z) => z.id).join(",")],
    queryFn: async () => {
      const ids = ticketZones.map((z) => z.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("zone_id, quantity")
        .in("zone_id", ids);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        if (!r.zone_id) continue;
        map[r.zone_id] = (map[r.zone_id] ?? 0) + Number(r.quantity || 0);
      }
      return map;
    },
    enabled: !!eventId && ticketZones.length > 0,
  });

  return useMemo<UseEventABResult>(() => {
    if (!eventId || zones.length === 0) {
      return { hasConfig: false, totals: null };
    }
    const food: ABFoodConfig = {
      fee_alimentos: Number(config?.fee_alimentos || 0),
      repasse_alimentos_pct: Number(config?.repasse_alimentos_pct || 0),
      per_capita_alimentos: Number(config?.per_capita_alimentos || 0),
    };

    const ticketZoneById = new Map(ticketZones.map((z) => [z.id, z.name.toLowerCase()]));

    const buildInputs = (scen: "real" | "breakeven" | "forecast"): ABZoneInput[] =>
      zones.map((z: any) => {
        let participantsCount = 0;
        // 1) override manual sempre vence
        if (z.participants_manual != null) {
          participantsCount = Number(z.participants_manual);
        } else {
          const labelKey = z.zone_label?.toLowerCase?.() ?? "";
          const externalMap = participants[scen] || {};
          if (labelKey && externalMap[labelKey] != null) {
            participantsCount = externalMap[labelKey];
          } else if (scen === "real" && z.source_ticket_zone_id) {
            participantsCount = realParticipantsDb[z.source_ticket_zone_id] ?? 0;
          }
          // BE/forecast sem dados externos → 0
        }
        return {
          id: z.id,
          zone_label: z.zone_label,
          participants: participantsCount,
          open_bar: !!z.open_bar,
          open_food: !!z.open_food,
          per_capita_bebidas: Number(z.per_capita_bebidas || 0),
          repasse_bebidas_pct: Number(z.repasse_bebidas_pct || 0),
        };
      });

    return {
      hasConfig: true,
      totals: {
        real: computeTotals(buildInputs("real"), food),
        breakeven: computeTotals(buildInputs("breakeven"), food),
        forecast: computeTotals(buildInputs("forecast"), food),
      },
    };
  }, [eventId, zones, config, ticketZones, realParticipantsDb, participants]);
}
