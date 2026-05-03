import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeTotals,
  type ABFoodConfig,
  type ABZoneInput,
  type ABTotals,
} from "@/lib/event-ab-calc";
import { useEventAttendance } from "@/hooks/useEventAttendance";

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
 *
 * Fonte canónica de "participantes" por zona (denominador do per capita):
 *  → useEventAttendance: público por dia × zona, somado por zona, incluindo:
 *     - Bilhetes Simples no seu dia
 *     - Bilhetes Combo em CADA dia do evento (não duplica dentro do mesmo evento mas conta em cada dia)
 *     - Cortesias (event_courtesies) por dia/zona/cenário
 *
 * O caller pode ainda passar um override (`participants`) por zone_label para os
 * cenários BE/Forecast quando o solver do Simulador já calculou um valor próprio.
 * O override manual em event_ab_zones.participants_manual continua a vencer.
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

  // Público por dia/zona — fonte canónica para o per capita (real, BE, forecast)
  const real = useEventAttendance(eventId, "real");
  const breakeven = useEventAttendance(eventId, "breakeven");
  const forecast = useEventAttendance(eventId, "forecast");

  return useMemo<UseEventABResult>(() => {
    if (!eventId || zones.length === 0) {
      return { hasConfig: false, totals: null };
    }
    const food: ABFoodConfig = {
      fee_alimentos: Number(config?.fee_alimentos || 0),
      repasse_alimentos_pct: Number(config?.repasse_alimentos_pct || 0),
      per_capita_alimentos: Number(config?.per_capita_alimentos || 0),
    };

    const attendanceByScen = { real, breakeven, forecast } as const;

    const buildInputs = (scen: "real" | "breakeven" | "forecast"): ABZoneInput[] => {
      const att = attendanceByScen[scen];
      // map: zone_id → público total (Σ dias) já com cortesias
      const totalsByZoneId = att.totalsByZone;

      return zones.map((z: any) => {
        let participantsCount = 0;
        // 1) override manual sempre vence (configurado em event_ab_zones)
        if (z.participants_manual != null) {
          participantsCount = Number(z.participants_manual);
        } else if (z.source_ticket_zone_id && totalsByZoneId[z.source_ticket_zone_id] != null) {
          // 2) Fonte canónica: público por dia da zona vinculada (Σ dias, com combos e cortesias)
          participantsCount = totalsByZoneId[z.source_ticket_zone_id];
        } else {
          // 3) override pelo caller via zone_label (Simulador BE/forecast)
          const labelKey = z.zone_label?.toLowerCase?.() ?? "";
          const externalMap = participants[scen] || {};
          if (labelKey && externalMap[labelKey] != null) {
            participantsCount = externalMap[labelKey];
          }
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
    };

    return {
      hasConfig: true,
      totals: {
        real: computeTotals(buildInputs("real"), food),
        breakeven: computeTotals(buildInputs("breakeven"), food),
        forecast: computeTotals(buildInputs("forecast"), food),
      },
    };
  }, [eventId, zones, config, real, breakeven, forecast, participants]);
}
