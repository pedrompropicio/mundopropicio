/**
 * Helper para calcular a última data efetiva de um evento.
 *
 * Multi-dia vive em dois sítios distintos no schema:
 *   - Festivais → tabela `event_dates` (várias datas para o mesmo evento).
 *   - Turnês    → sub-eventos via `parent_event_id` (1 evento Master + N Splits).
 *
 * Eventos single-day usam apenas `events.date`.
 *
 * Esta lib é PURA (sem queries). O caller carrega `event_dates` / sub-eventos
 * e passa-os já filtrados. Para um exemplo de queries, ver
 * `src/components/ResultsAnalysis.tsx` (prior art que já trata festivais bem).
 */

type DateLike = string | { date?: string | null } | null | undefined;

/** Devolve a maior data ISO (YYYY-MM-DD) entre `eventDate`, `event_dates` e sub-eventos. */
export function computeEventLastDate(opts: {
  eventDate?: string | null;
  /** linhas de event_dates filtradas pelo event_id (ou array de strings). */
  extraDates?: DateLike[];
  /** sub-eventos do mesmo evento (filtrados por parent_event_id). */
  subEvents?: DateLike[];
}): string | null {
  const collect: string[] = [];
  const push = (d: DateLike) => {
    const s = typeof d === "string" ? d : d?.date;
    if (s && typeof s === "string") collect.push(s.slice(0, 10));
  };
  push(opts.eventDate ?? null);
  (opts.extraDates ?? []).forEach(push);
  (opts.subEvents ?? []).forEach(push);
  if (collect.length === 0) return null;
  return collect.reduce((max, d) => (d > max ? d : max));
}

/**
 * Builder para datasets de Dashboard: indexa `event_dates` e sub-eventos por
 * event_id e devolve uma função `(event) => lastDate ISO`.
 */
export function makeLastDateResolver(opts: {
  eventDates?: Array<{ event_id: string; date: string }>;
  allEvents?: Array<{ id: string; date?: string | null; parent_event_id?: string | null }>;
}) {
  const datesByEvent = new Map<string, string[]>();
  for (const ed of opts.eventDates ?? []) {
    if (!ed?.event_id || !ed?.date) continue;
    const arr = datesByEvent.get(ed.event_id) ?? [];
    arr.push(ed.date.slice(0, 10));
    datesByEvent.set(ed.event_id, arr);
  }
  const childrenByParent = new Map<string, string[]>();
  for (const e of opts.allEvents ?? []) {
    if (e.parent_event_id && e.date) {
      const arr = childrenByParent.get(e.parent_event_id) ?? [];
      arr.push(e.date.slice(0, 10));
      childrenByParent.set(e.parent_event_id, arr);
    }
  }
  return (event: { id: string; date?: string | null }): string | null =>
    computeEventLastDate({
      eventDate: event.date ?? null,
      extraDates: datesByEvent.get(event.id) ?? [],
      subEvents: childrenByParent.get(event.id) ?? [],
    });
}
