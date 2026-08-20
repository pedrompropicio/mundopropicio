import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeTotals,
  type ABMode,
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
 * v2: suporta ab_mode_bebidas e ab_mode_alimentos independentes
 * (terceirizacao | exploracao_propria). Os novos campos de custo
 * são lidos de event_ab_config e event_ab_zones e passados para computeTotals().
 *
 * Fonte canónica de "participantes" por zona (denominador do per capita):
 *  → useEventAttendance: público por dia × zona, somado por zona, incluindo:
 *     - Bilhetes Simples no seu dia
 *     - Bilhetes Combo em CADA dia do evento
 *     - Cortesias (event_courtesies) por dia/zona/cenário
 *
 * O caller pode ainda passar um override (participants) por zone_label para os
 * cenários BE/Forecast quando o solver do Simulador já calculou um valor próprio.
 * O override manual em event_ab_zones.participants_manual continua a vencer.
 * Edge case: em exploracao_propria, participants_manual é o mesmo denominador
 * para receita e custo (comportamento confirmado na decisão 4.4).
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
  const real      = useEventAttendance(eventId, "real");
  const breakeven = useEventAttendance(eventId, "breakeven");
  const forecast  = useEventAttendance(eventId, "forecast");

  return useMemo<UseEventABResult>(() => {
    if (!eventId || zones.length === 0) {
      return { hasConfig: false, totals: null };
    }

    // Modos de operação (default terceirizacao para backward compat)
    const modeBebidas: ABMode   = (config?.ab_mode_bebidas   as ABMode) ?? "terceirizacao";
    const modeAlimentos: ABMode = (config?.ab_mode_alimentos as ABMode) ?? "terceirizacao";

    const baseFood: ABFoodConfig = {
      fee_alimentos:               Number(config?.fee_alimentos               || 0),
      repasse_alimentos_pct:       Number(config?.repasse_alimentos_pct       || 0),
      per_capita_alimentos:        Number(config?.per_capita_alimentos        || 0),
      per_capita_custo_alimentos:  Number(config?.per_capita_custo_alimentos  || 0),
      custo_fixo_alimentos:        Number(config?.custo_fixo_alimentos        || 0),
      operador_nome:               config?.operador_nome_alimentos ?? undefined,
    };

    // A facturação real do operador só entra no cenário Real.
    // BE/Forecast continuam projecções puras por per capita.
    const buildFood = (scen: "real" | "breakeven" | "forecast"): ABFoodConfig => ({
      ...baseFood,
      faturacao_real_alimentos:
        scen === "real" && (config as any)?.faturacao_real_alimentos != null
          ? Number((config as any).faturacao_real_alimentos)
          : null,
    });


    const attendanceByScen = { real, breakeven, forecast } as const;

    const buildInputs = (scen: "real" | "breakeven" | "forecast"): ABZoneInput[] => {
      const att = attendanceByScen[scen];
      const totalsByZoneId = att.totalsByZone;

      return zones.map((z: any) => {
        let participantsCount = 0;
        const labelKey = z.zone_label?.toLowerCase?.() ?? "";
        const externalMap = participants[scen] || {};
        const externalVal = labelKey ? externalMap[labelKey] : undefined;
        const canonicalVal =
          z.source_ticket_zone_id && totalsByZoneId[z.source_ticket_zone_id] != null
            ? totalsByZoneId[z.source_ticket_zone_id]
            : undefined;

        // 1) override manual sempre vence
        if (z.participants_manual != null) {
          participantsCount = Number(z.participants_manual);
        } else if (scen === "real") {
          // Real: canónico (vendas reais) > override do caller
          if (canonicalVal != null) participantsCount = canonicalVal;
          else if (externalVal != null) participantsCount = externalVal;
        } else {
          // BE/Forecast: override do Simulador > canónico (planeado dos lotes)
          // — assim A&B escala com o público projectado pelos sliders.
          if (externalVal != null) participantsCount = externalVal;
          else if (canonicalVal != null) participantsCount = canonicalVal;
        }
        return {
          id: z.id,
          zone_label: z.zone_label,
          participants: participantsCount,
          open_bar: !!z.open_bar,
          open_food: !!z.open_food,
          per_capita_bebidas:       Number(z.per_capita_bebidas      || 0),
          repasse_bebidas_pct:      Number(z.repasse_bebidas_pct     || 0),
          per_capita_custo_bebidas: Number(z.per_capita_custo_bebidas || 0),
          custo_fixo_bebidas:       Number(z.custo_fixo_bebidas      || 0),
          operador_nome:            z.operador_nome ?? undefined,
        };
      });
    };

    return {
      hasConfig: true,
      totals: {
        real:      computeTotals(buildInputs("real"),      food, modeBebidas, modeAlimentos),
        breakeven: computeTotals(buildInputs("breakeven"), food, modeBebidas, modeAlimentos),
        forecast:  computeTotals(buildInputs("forecast"),  food, modeBebidas, modeAlimentos),
      },
    };
  }, [eventId, zones, config, real, breakeven, forecast, participants]);
}
