/**
 * #89 movimento 2 — semear o Simulador com o histórico colhido de outro evento.
 *
 * A colheita (collect_event_benchmarks, D-ERP222) grava a curva D-180…D0 em
 * `event_simulator_sales_curve_buckets` (cumulative_pct 0–100 = % das vendas
 * finais já vendidas a N dias do evento). Aqui:
 *  - `priorCurveFractionAt` dá a fracção vendida a `daysToEvent` dias;
 *    null quando não há curva, o dia está fora da janela (>180) ou a % é 0
 *    → o motor usa a curva por defeito (ritmo + reta final).
 *  - `projectWithPriorCurve` = vendas reais / fracção − vendas reais.
 * Só sugere: o piso manual continua a ganhar (solveForecast).
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paging";

export const PRIOR_CURVE_MODE = "prior_editions" as const;
export const PRIOR_CURVE_WINDOW_DAYS = 180;

export interface PriorCurvePoint {
  days_before: number;
  cumulative_pct: number;
}

export function priorCurveFractionAt(
  curve: PriorCurvePoint[] | null | undefined,
  daysToEvent: number,
): number | null {
  if (!curve || curve.length === 0) return null;
  const d = Math.max(0, Math.round(daysToEvent));
  if (d > PRIOR_CURVE_WINDOW_DAYS) return null;
  const pt = curve.find((p) => Number(p.days_before) === d);
  const pct = Number(pt?.cumulative_pct ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return Math.min(1, pct / 100);
}

/** Quantidade ADICIONAL até D0 pela curva histórica; null = usar a curva por defeito. */
export function projectWithPriorCurve(
  realQty: number,
  curve: PriorCurvePoint[] | null | undefined,
  daysToEvent: number,
): number | null {
  const frac = priorCurveFractionAt(curve, daysToEvent);
  if (frac === null || !(realQty > 0)) return null;
  return Math.max(0, Math.round(realQty / frac) - realQty);
}

export interface PriorCurveData {
  points: PriorCurvePoint[];
  collectedAt: string | null;
}

export async function fetchPriorCurve(eventId: string): Promise<PriorCurveData> {
  const rows = await fetchAllPaged<any>((from, to) =>
    supabase
      .from("event_simulator_sales_curve_buckets")
      .select("days_before, cumulative_pct, updated_at")
      .eq("event_id", eventId)
      .order("days_before")
      .range(from, to),
  );
  const collectedAt = rows.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);
  return {
    points: rows.map((r) => ({ days_before: Number(r.days_before), cumulative_pct: Number(r.cumulative_pct) })),
    collectedAt,
  };
}

export interface BenchmarkSourceEvent {
  id: string;
  name: string;
  date: string | null;
  collectedAt: string | null;
  sameArtist: boolean;
}

/** Eventos da empresa com curva colhida (uma linha D0 por evento); mesmo artista primeiro. */
/** Série/artista: nome sem ano, datas nem sufixo de cidade ("Anitta EDA 2026" → "anitta eda"). */
export function seriesKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s[-–—|·]\s/)[0]
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function listBenchmarkSourceEvents(
  currentEventId: string,
  currentEventName: string | null,
): Promise<BenchmarkSourceEvent[]> {
  const d0 = await fetchAllPaged<any>((from, to) =>
    supabase
      .from("event_simulator_sales_curve_buckets")
      .select("event_id, updated_at")
      .eq("days_before", 0)
      .neq("event_id", currentEventId)
      .order("event_id")
      .range(from, to),
  );
  const ids = ((d0 ?? []) as any[]).map((r) => r.event_id as string);
  if (ids.length === 0) return [];
  const at = new Map(((d0 ?? []) as any[]).map((r) => [r.event_id, r.updated_at]));
  const out: BenchmarkSourceEvent[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data: evs } = await supabase
      .from("events")
      .select("id, name, date")
      .in("id", ids.slice(i, i + 100))
      .limit(100);
    for (const e of (evs ?? []) as any[]) {
      out.push({
        id: e.id,
        name: e.name,
        date: e.date ?? null,
        collectedAt: (at.get(e.id) as string) ?? null,
        sameArtist: !!seriesKey(currentEventName) && seriesKey(e.name) === seriesKey(currentEventName),
      });
    }
  }
  return sortBenchmarkSources(out);
}

export function sortBenchmarkSources(list: BenchmarkSourceEvent[]): BenchmarkSourceEvent[] {
  return list.slice().sort((a, b) =>
    a.sameArtist !== b.sameArtist ? (a.sameArtist ? -1 : 1) : (b.date ?? "").localeCompare(a.date ?? ""),
  );
}

/** Per capita A&B (1.1.02) global da empresa — só sugestão. */
export async function fetchAbPerCapitaBenchmark(companyId: string) {
  const { data } = await supabase
    .from("event_simulator_pax_benchmarks")
    .select("avg_ticket_per_pax, sample_size, last_calculated_at")
    .eq("company_id", companyId)
    .eq("scope", "global")
    .eq("category_code", "1.1.02")
    .limit(1)
    .maybeSingle();
  return data as { avg_ticket_per_pax: number; sample_size: number; last_calculated_at: string } | null;
}
