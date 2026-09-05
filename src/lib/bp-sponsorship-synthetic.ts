/**
 * Linha SINTÉTICA de patrocínios do BP — 1.2.01 (DR-2026-09-05-D22).
 *
 * Só existe quando o evento tem verbas por segmento (`event_sponsorship_targets`).
 * Sem verbas, o BP mostra exactamente o que mostrava antes: as linhas 1.2.01
 * persistidas, com os mesmos totais.
 *
 * Três colunas de valor (s/IVA, como as restantes sintéticas):
 *   - previsto original  = Σ baseline_amount das verbas (fixado na criação)
 *   - previsto corrente  = fechados + Σ max(0, verba − fechados do segmento),
 *                          enquanto `events.sponsorship_closed_at` for null;
 *                          depois dessa data = só fechados
 *   - real               = Σ confirmed_amount dos cards `closed` não-permuta
 *
 * Não persiste nada e não altera nenhum card, linha de BP ou transação.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SponsorshipSegmentBreakdown {
  segmentId: string | null;
  name: string;
  target: number;
  closed: number;
  /** por captar = max(0, verba − fechado); 0 depois do encerramento */
  remaining: number;
}

export interface SponsorshipSyntheticResult {
  hasTargets: boolean;
  closedAt: string | null;
  baselineNet: number | null;
  currentNet: number | null;
  realNet: number;
  segments: SponsorshipSegmentBreakdown[];
  /** ids das linhas 1.2.01 persistidas que a sintética passa a representar */
  excludedForecastIds: string[];
}

const EMPTY: SponsorshipSyntheticResult = {
  hasTargets: false,
  closedAt: null,
  baselineNet: null,
  currentNet: null,
  realNet: 0,
  segments: [],
  excludedForecastIds: [],
};

export async function computeSponsorshipSynthetic(
  eventId: string,
  eventIds: string[] = [eventId],
): Promise<SponsorshipSyntheticResult> {
  const ids = Array.from(new Set([eventId, ...eventIds])).filter(Boolean);
  if (ids.length === 0) return EMPTY;

  const [{ data: targets }, { data: cards }, { data: evt }] = await Promise.all([
    supabase
      .from("event_sponsorship_targets" as never)
      .select("id, event_id, segment_id, amount, baseline_amount, sponsorship_segments(name, sort_order)")
      .in("event_id", ids),
    supabase
      .from("sponsorship_pipeline" as never)
      .select("id, stage, is_barter, confirmed_amount, segment_id, linked_forecast_id")
      .in("event_id", ids),
    supabase.from("events").select("sponsorship_closed_at").eq("id", eventId).maybeSingle(),
  ]);

  const targetRows = (targets ?? []) as any[];
  const closedAt = ((evt as any)?.sponsorship_closed_at as string | null) ?? null;

  if (targetRows.length === 0) return { ...EMPTY, closedAt };

  const closedCards = ((cards ?? []) as any[]).filter(
    (c) => c.stage === "closed" && !c.is_barter,
  );
  const closedBySegment = new Map<string, number>();
  for (const c of closedCards) {
    const key = (c.segment_id as string | null) ?? "__none__";
    closedBySegment.set(key, (closedBySegment.get(key) ?? 0) + Number(c.confirmed_amount || 0));
  }
  const realNet = closedCards.reduce((s, c) => s + Number(c.confirmed_amount || 0), 0);

  // Agrega verbas por segmento (um Master + splits pode ter uma verba por evento).
  const targetsBySegment = new Map<string, { target: number; baseline: number; name: string; order: number }>();
  for (const t of targetRows) {
    const key = t.segment_id as string;
    const prev = targetsBySegment.get(key);
    targetsBySegment.set(key, {
      target: (prev?.target ?? 0) + Number(t.amount || 0),
      baseline: (prev?.baseline ?? 0) + Number(t.baseline_amount ?? t.amount ?? 0),
      name: prev?.name ?? (t.sponsorship_segments?.name as string) ?? "Segmento",
      order: prev?.order ?? Number(t.sponsorship_segments?.sort_order ?? 0),
    });
  }

  const isClosed = !!closedAt;
  const segments: SponsorshipSegmentBreakdown[] = [];
  let remainingTotal = 0;
  let baselineNet = 0;

  for (const [segmentId, v] of targetsBySegment) {
    const closed = closedBySegment.get(segmentId) ?? 0;
    const remaining = isClosed ? 0 : Math.max(0, v.target - closed);
    remainingTotal += remaining;
    baselineNet += v.baseline;
    segments.push({ segmentId, name: v.name, target: v.target, closed, remaining });
  }
  segments.sort((a, b) => {
    const oa = targetsBySegment.get(a.segmentId!)?.order ?? 0;
    const ob = targetsBySegment.get(b.segmentId!)?.order ?? 0;
    return oa - ob || a.name.localeCompare(b.name, "pt");
  });

  // Fechados sem segmento aparecem numa linha própria (sem verba).
  const noSegClosed = closedBySegment.get("__none__") ?? 0;
  if (noSegClosed > 0) {
    segments.push({ segmentId: null, name: "Sem segmento", target: 0, closed: noSegClosed, remaining: 0 });
  }
  // Fechados de segmentos sem verba definida.
  for (const [key, closed] of closedBySegment) {
    if (key === "__none__" || targetsBySegment.has(key)) continue;
    segments.push({ segmentId: key, name: "Segmento sem verba", target: 0, closed, remaining: 0 });
  }

  // Só as linhas geradas por cards fechados (é o que o "real" da sintética já conta).
  const excludedForecastIds = closedCards
    .map((c) => c.linked_forecast_id as string | null)
    .filter((x): x is string => !!x);

  return {
    hasTargets: true,
    closedAt,
    baselineNet,
    currentNet: realNet + remainingTotal,
    realNet,
    segments,
    excludedForecastIds,
  };
}
