import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged, fetchAllPagedQuery } from "@/lib/supabase-paging";
import { computeBpFormula, describeBpFormula, isFormulaType, type BpFormulaResult } from "@/lib/bp-formula";
import { computeLiveTicketForecast } from "@/lib/event-simulator-forecast-live";
import { fetchEventRealized } from "@/lib/event-revenue-basis";
import { writeForecastAmount, ForecastBelowRealizedError } from "@/lib/forecast-amount";
import { toast } from "@/hooks/use-toast";
import { mustWrite } from "@/lib/must-write";
import { invalidateEventFinancials } from "@/lib/invalidate-event-financials";
import {
  applyRevenueFloor, buildFormulaRecalcPatch, canRecalculateFormulas, formulaForbiddenReason, incomeRealizedFromTx,
} from "@/lib/bp-formula-line-rules";

/**
 * #263 / D-ERP149 — recálculo das linhas de BP com fórmula (padrão useSyncCacheForecasts).
 * Só em eventos simples ou sub-eventos (cidade). No Master não recalcula.
 * Subir: UPDATE normal. Descer: regra #240 — nunca abaixo do realizado; se bater no chão grava o chão.
 * baseline_amount nunca é tocado (D3).
 * #339 A1: também em linhas de RECEITA (exceto 1.1.01/1.1.03); chão em receita pelo
 * realizado income da linha; eventos concluídos ou selados não recalculam; o recálculo
 * só escreve amount + formula_value/formula_params.
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
      const { data, error } = await fetchAllPagedQuery((supabase as any).from("event_forecasts")
        .select("id, type, description, amount, formula_type, formula_params, formula_value, version_id, account_categories(code)")
        .eq("event_id", eventId).is("version_id", null).in("formula_type", ["pct_ticket_revenue", "per_head"]));
      if (error) throw error;
      const all = (data ?? []).filter((l: any) => isFormulaType(l.formula_type));
      const forbidden = all
        .map((l: any) => ({ id: l.id, description: l.description, reason: formulaForbiddenReason(l.type, l.account_categories?.code) }))
        .filter((f) => f.reason) as { id: string; description: string; reason: string }[];
      const forbiddenIds = new Set(forbidden.map((f) => f.id));
      const lines = all.filter((l: any) => !forbiddenIds.has(l.id));
      if (isMaster) return { lines, forbidden, evals: [] as FormulaEvaluation[], masterBlocked: lines.length > 0, frozen: false };
      const [{ data: ev, error: evErr }, { data: seals, error: sErr }] = await Promise.all([
        supabase.from("events").select("status").eq("id", eventId!).maybeSingle(),
        (supabase as any).from("event_settlements").select("id").eq("event_id", eventId!).not("sealed_at", "is", null).limit(1),
      ]);
      if (evErr) throw evErr;
      if (sErr) throw sErr;
      const frozen = !canRecalculateFormulas({ status: (ev as any)?.status, hasSealedSettlement: (seals ?? []).length > 0 });
      if (frozen) return { lines, forbidden, evals: [] as FormulaEvaluation[], masterBlocked: false, frozen };
      return { lines, forbidden, evals: await evaluateEventFormulas(eventId!, lines), masterBlocked: false, frozen };
    },
  });

  useEffect(() => {
    const d = q.data;
    if (!d || running.current || d.masterBlocked || d.frozen) return;
    const byId = new Map(d.lines.map((l: any) => [l.id, l]));
    const todo = d.evals.filter((e) => {
      const l: any = byId.get(e.forecastId);
      if (!l) return false;
      const p = l.formula_params ?? {};
      // Já tratado só se o valor da linha bate com o calculado (ou ficou no chão).
      // Antes bastava last_text: a escrita do overhead falhava em silêncio e nunca se repetia.
      const same = p.last_text === e.text && Number(p.last_calculated) === e.result.amount;
      if (same && (p.floor_hit || Math.abs(Number(l.amount || 0) - e.result.amount) < 0.005)) return false;
      return true;
    });
    if (!todo.length) return;
    running.current = true;
    (async () => {
      for (const e of todo) {
        const l: any = byId.get(e.forecastId);
        let written = e.result.amount;
        let floorHit = false;
        if (l.type === "income") {
          // Chão #240 em receita: nunca abaixo do realizado (income válidas ligadas à linha).
          try {
            const { data: txs, error: tErr } = await fetchAllPagedQuery((supabase as any).from("transactions")
              .select("type, status, amount, is_transitory, exclude_from_result, reversed_at, is_hidden")
              .eq("forecast_id", e.forecastId).eq("type", "income"));
            if (tErr) throw tErr;
            const f = applyRevenueFloor(e.result.amount, incomeRealizedFromTx(txs ?? []));
            written = f.amount;
            floorHit = f.floorHit;
          } catch (rErr: any) {
            toast({ title: `Fórmula — ${l.description}: não gravado`, description: rErr?.message ?? String(rErr), variant: "destructive" });
            continue;
          }
          if (floorHit) toast({ title: `Fórmula — ${l.description}`, description: "O recálculo ficou abaixo do já realizado; gravado o realizado.", variant: "destructive" });
        }
        try {
          await writeForecastAmount({ forecastId: e.forecastId, newAmount: written, observation: floorHit ? "[fórmula] recálculo (chão do realizado)" : "[fórmula] recálculo" });
        } catch (err) {
          if (err instanceof ForecastBelowRealizedError) {
            written = Math.round(err.realized * 100) / 100;
            floorHit = true;
            try {
              await writeForecastAmount({ forecastId: e.forecastId, newAmount: written, observation: "[fórmula] recálculo (chão do realizado)" });
            } catch (e2: any) {
              toast({ title: `Fórmula — ${l.description}: não gravado`, description: e2?.message ?? String(e2), variant: "destructive" });
              continue;
            }
            toast({ title: `Fórmula — ${l.description}`, description: "O recálculo ficou abaixo do já realizado; gravado o realizado.", variant: "destructive" });
          } else {
            toast({ title: `Fórmula — ${l.description}: não gravado`, description: (err as any)?.message ?? String(err), variant: "destructive" });
            continue;
          }
        }
        const patch = buildFormulaRecalcPatch(l.formula_params, { text: e.text, amount: e.result.amount }, written, floorHit, new Date().toISOString());
        try {
          await mustWrite((supabase as any).from("event_forecasts").update(patch).eq("id", e.forecastId).select("id"), "Fórmula: parâmetros", { expectRows: true });
        } catch (pErr: any) {
          toast({ title: `Fórmula — ${l.description}`, description: pErr.message, variant: "destructive" });
        }
      }
      running.current = false;
      qc.invalidateQueries({ queryKey: ["event_forecasts"] });
      qc.invalidateQueries({ queryKey: ["bp-formula-sync", eventId] });
      invalidateEventFinancials(qc, [eventId]);
    })();
  }, [q.data, eventId, qc]);

  return q;
}
