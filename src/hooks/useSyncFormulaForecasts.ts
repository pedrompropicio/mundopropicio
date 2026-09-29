import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paging";
import { computeBpFormula, describeBpFormula, isFormulaType, type BpFormulaResult } from "@/lib/bp-formula";
import { computeLiveTicketForecast } from "@/lib/event-simulator-forecast-live";
import { fetchEventRealized } from "@/lib/event-revenue-basis";
import { writeForecastAmount, ForecastBelowRealizedError } from "@/lib/forecast-amount";
import { toast } from "@/hooks/use-toast";

/**
 * #263 / D-ERP149 — recálculo das linhas de BP com fórmula (padrão useSyncCacheForecasts).
 * Só em eventos simples ou sub-eventos (cidade). No Master não recalcula.
 * Subir: UPDATE normal. Descer: regra #240 — nunca abaixo do realizado; se bater no chão grava o chão.
 * baseline_amount nunca é tocado (D3).
 */
export interface FormulaEvaluation {
  forecastId: string;
  result: BpFormulaResult;
  text: string;
}

async function loadInputs(eventId: string) {
  const { data: zones, error: zErr } = await supabase
    .from("event_ticket_zones").select("id").eq("event_id", eventId).is("version_id", null);
  if (zErr) throw zErr;
  const zoneIds = (zones ?? []).map((z: any) => z.id);
  let sales: any[] = [];
  if (zoneIds.length) {
    const { data: lots, error: lErr } = await supabase.from("event_ticket_lots").select("id, iva_rate").in("zone_id", zoneIds);
    if (lErr) throw lErr;
    const iva = new Map((lots ?? []).map((l: any) => [l.id, Number(l.iva_rate ?? 0)]));
    const rows = await fetchAllPaged<any>((from, to) =>
      supabase.from("ticket_sales").select("id, zone_id, lot_id, quantity, unit_price, total_value")
        .in("zone_id", zoneIds).order("id", { ascending: true }).range(from, to),
    );
    sales = (rows ?? []).map((s: any) => ({ ...s, iva_rate: iva.get(s.lot_id) ?? 0 }));
  }
  const { data: courtesies, error: cErr } = await supabase
    .from("event_courtesies").select("zone_id, event_date_id, scenario, quantity").eq("event_id", eventId);
  if (cErr) throw cErr;
  return { sales, courtesies: courtesies ?? [] };
}

export async function evaluateEventFormulas(eventId: string, lines: any[]): Promise<FormulaEvaluation[]> {
  if (lines.length === 0) return [];
  const [{ sales, courtesies }, realized] = await Promise.all([loadInputs(eventId), fetchEventRealized(eventId)]);
  const needsSim = !realized && lines.some((l) => !(l.formula_params?.zone_ids?.length));
  const live = needsSim ? await computeLiveTicketForecast(eventId).catch(() => null) : null;
  return lines.map((l) => {
    const result = computeBpFormula({
      formulaType: l.formula_type, params: l.formula_params ?? {}, sales, courtesies: courtesies as any,
      realized, liveForecast: live,
    });
    return { forecastId: l.id, result, text: describeBpFormula(result) };
  });
}

export function useSyncFormulaForecasts({ eventId, isMaster, enabled = true }: { eventId: string | null | undefined; isMaster: boolean; enabled?: boolean }) {
  const qc = useQueryClient();
  const running = useRef(false);
  const q = useQuery({
    queryKey: ["bp-formula-sync", eventId],
    enabled: !!eventId && enabled,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("event_forecasts")
        .select("id, description, amount, formula_type, formula_params, formula_value, version_id")
        .eq("event_id", eventId).is("version_id", null).in("formula_type", ["pct_ticket_revenue", "per_head"]);
      if (error) throw error;
      const lines = (data ?? []).filter((l: any) => isFormulaType(l.formula_type));
      if (isMaster) return { lines, evals: [] as FormulaEvaluation[], masterBlocked: lines.length > 0 };
      return { lines, evals: await evaluateEventFormulas(eventId!, lines), masterBlocked: false };
    },
  });

  useEffect(() => {
    const d = q.data;
    if (!d || running.current || d.masterBlocked) return;
    const byId = new Map(d.lines.map((l: any) => [l.id, l]));
    const todo = d.evals.filter((e) => {
      const l: any = byId.get(e.forecastId);
      return l && (Math.abs(Number(l.amount) - e.result.amount) >= 0.005 || l.formula_params?.last_text !== e.text);
    });
    if (!todo.length) return;
    running.current = true;
    (async () => {
      for (const e of todo) {
        const l: any = byId.get(e.forecastId);
        let written = e.result.amount;
        let floorHit = false;
        try {
          await writeForecastAmount({ forecastId: e.forecastId, newAmount: e.result.amount, observation: "[fórmula] recálculo" });
        } catch (err) {
          if (err instanceof ForecastBelowRealizedError) {
            written = Math.round(err.realized * 100) / 100;
            floorHit = true;
            try {
              await writeForecastAmount({ forecastId: e.forecastId, newAmount: written, observation: "[fórmula] recálculo (chão do realizado)" });
            } catch (e2) { console.error("[fórmula] chão", e2); continue; }
            toast({ title: `Fórmula — ${l.description}`, description: "O recálculo ficou abaixo do já realizado; gravado o realizado.", variant: "destructive" });
          } else { console.error("[useSyncFormulaForecasts]", err); continue; }
        }
        const params = { ...(l.formula_params ?? {}), last_text: e.text, last_recalc_at: new Date().toISOString(), last_calculated: e.result.amount, floor_hit: floorHit };
        const { error } = await (supabase as any).from("event_forecasts").update({ formula_value: written, formula_params: params }).eq("id", e.forecastId);
        if (error) console.error("[fórmula] params", error);
      }
      running.current = false;
      qc.invalidateQueries({ queryKey: ["event_forecasts"] });
      qc.invalidateQueries({ queryKey: ["bp-formula-sync", eventId] });
    })();
  }, [q.data, eventId, qc]);

  return q;
}
