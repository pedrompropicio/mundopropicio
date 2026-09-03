/**
 * Linhas SINTÉTICAS de receita do BP (DR-2026-09-03-D21, issue #103 — D10 + D20).
 *
 * Não são persistidas em event_forecasts: são renderizadas a partir dos módulos.
 * Cada linha tem TRÊS colunas de valor:
 *   - Previsto original  → carga inicial × preço de planeamento, FIXADO na 1ª vez
 *                          (events.ticketing_baseline_net / ab_baseline_net)
 *   - Previsto corrente  → projecção ao vivo (Simulador / cenário A&B)
 *   - Real               → ao vivo (ticket_sales / transações A&B)
 *
 * A bilheteira usa o mesmo critério de arredondamento do cabeçalho do evento
 * (DR-D11: linha a linha, valor exacto de total_value quando existe).
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeTicketSynthetic } from "@/lib/bp-income-synthetic";
import { useEventABScenarios, type ABScenarioParticipants } from "@/hooks/useEventABScenarios";
import { useEventABRealized } from "@/hooks/useEventABRealized";

export interface SyntheticIncomeLine {
  key: "bilheteira" | "ab";
  label: string;
  source: string;
  categoryLabel: string;
  ivaPct: number | null;
  /** previsto original (s/IVA) — null quando não há base para o calcular */
  baselineNet: number | null;
  /** previsto corrente (s/IVA) — null quando não há projecção */
  currentNet: number | null;
  /** IVA (€) do previsto corrente */
  currentIva: number;
  /** real (s/IVA) ao vivo */
  realNet: number;
  missingNote?: string;
  meta?: string;
}

const EMPTY_PARTICIPANTS: ABScenarioParticipants = { real: {}, breakeven: {}, forecast: {} };

const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-PT");
const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }) : "";

export function useBPIncomeSynthetic(eventId: string, extraEventIds: string[] = []) {
  const queryClient = useQueryClient();
  const idsKey = Array.from(new Set([eventId, ...(extraEventIds ?? [])])).filter(Boolean).join(",");

  const { data: ticket } = useQuery({
    queryKey: ["bp_income_ticket_synthetic", idsKey],
    queryFn: () => computeTicketSynthetic(eventId, idsKey.split(",")),
    enabled: !!eventId,
  });

  const { data: eventRow } = useQuery({
    queryKey: ["bp_income_baselines", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, ticketing_baseline_net, ticketing_baseline_at, ab_baseline_net, ab_baseline_at")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!eventId,
  });

  const abScenarios = useEventABScenarios(eventId, EMPTY_PARTICIPANTS);
  const abRealized = useEventABRealized(eventId);

  return useMemo(() => {
    const lines: SyntheticIncomeLine[] = [];

    // ── BILHETEIRA (1.1.01) ──────────────────────────────────────────
    if (ticket && (ticket.initialLoad > 0 || ticket.realNet > 0 || ticket.currentNet != null)) {
      // fixa o previsto original na 1ª vez que é calculável
      if (
        eventRow &&
        eventRow.ticketing_baseline_net == null &&
        ticket.computedBaselineNet != null &&
        ticket.computedBaselineNet > 0
      ) {
        void supabase
          .from("events")
          .update({
            ticketing_baseline_net: ticket.computedBaselineNet,
            ticketing_baseline_at: new Date().toISOString(),
          } as never)
          .eq("id", eventId)
          .then(() => queryClient.invalidateQueries({ queryKey: ["bp_income_baselines", eventId] }));
      }

      const meta: string[] = [];
      if (ticket.initialLoad > 0) meta.push(`Carga inicial ${fmtInt(ticket.initialLoad)}`);
      if (ticket.currentLoad != null) {
        const d = fmtDate(ticket.currentLoadOn);
        meta.push(`Carga corrente ${fmtInt(ticket.currentLoad)}${d ? ` (${d})` : ""}`);
      } else {
        meta.push("sem retrato de carga");
      }
      if (ticket.soldQty > 0) {
        const pcts: string[] = [];
        if (ticket.initialLoad > 0) pcts.push(`${Math.round((ticket.soldQty / ticket.initialLoad) * 100)}% da inicial`);
        if (ticket.currentLoad) pcts.push(`${Math.round((ticket.soldQty / ticket.currentLoad) * 100)}% da corrente`);
        meta.push(`Vendidos ${fmtInt(ticket.soldQty)}${pcts.length ? ` — ${pcts.join(" · ")}` : ""}`);
      }

      lines.push({
        key: "bilheteira",
        label: "Venda de Bilhetes",
        source: "Módulo Bilheteira (não editável)",
        categoryLabel: "1.1.01 Venda de Bilhetes",
        ivaPct: ticket.ivaPct,
        baselineNet: ticket.baselineNet,
        currentNet: ticket.currentNet,
        currentIva: ticket.currentNet != null ? (ticket.currentNet * ticket.ivaPct) / 100 : 0,
        realNet: ticket.realNet,
        missingNote: ticket.currentNet == null ? "Sem previsão — configura o Simulador" : undefined,
        meta: meta.join(" · "),
      });
    }

    // ── A&B (1.1.03) ─────────────────────────────────────────────────
    const abCurrent = abScenarios.totals ? abScenarios.totals.forecast.receitaTotal : null;
    const abStored = eventRow?.ab_baseline_net != null ? Number(eventRow.ab_baseline_net) : null;
    if (abStored == null && abCurrent != null && abCurrent > 0 && eventRow) {
      void supabase
        .from("events")
        .update({ ab_baseline_net: abCurrent, ab_baseline_at: new Date().toISOString() } as never)
        .eq("id", eventId)
        .then(() => queryClient.invalidateQueries({ queryKey: ["bp_income_baselines", eventId] }));
    }
    const abReal = Number(abRealized?.receita || 0);
    if (abScenarios.hasConfig || abReal > 0) {
      lines.push({
        key: "ab",
        label: "Alimentos & Bebidas",
        source: "Módulo A&B (não editável)",
        categoryLabel: "1.1.03 A&B",
        ivaPct: null,
        baselineNet: abStored ?? abCurrent,
        currentNet: abCurrent,
        currentIva: 0,
        realNet: abReal,
        missingNote: abCurrent == null ? "Sem previsão" : undefined,
      });
    }

    return {
      lines,
      totals: {
        baselineNet: lines.reduce((s, l) => s + (l.baselineNet ?? 0), 0),
        currentNet: lines.reduce((s, l) => s + (l.currentNet ?? 0), 0),
        currentIva: lines.reduce((s, l) => s + l.currentIva, 0),
        realNet: lines.reduce((s, l) => s + l.realNet, 0),
      },
      ticketRealNet: ticket?.realNet ?? 0,
    };
  }, [ticket, eventRow, abScenarios, abRealized, eventId, queryClient]);
}
