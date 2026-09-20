/**
 * "O evento já aconteceu?" — regra do #227 (20/09/2026).
 *
 * Depois da data do evento, as sintéticas de bilheteira e de A&B deixam de ser
 * previsão e passam a ser o REAL: um previsto acima das vendas reais num evento
 * já realizado não é "excedido", é uma previsão que não se cumpriu.
 *
 * Realizado = `events.status === 'completed'` OU a última data já passou.
 * A última data é a maior entre a própria `events.date` e as datas dos
 * sub-eventos (num Master, a turnê só está realizada depois da última cidade).
 * Comparação POR DIA, em data local (nunca timestamps).
 */

/** yyyy-MM-dd local (sem UTC, nunca `toISOString`). */
function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface EventRealizedInput {
  status?: string | null;
  /** `events.date` (yyyy-MM-dd). */
  date?: string | null;
  /** datas dos sub-eventos / `event_dates` (yyyy-MM-dd). */
  childDates?: (string | null | undefined)[];
}

export function isEventRealized(ev: EventRealizedInput, today: Date = new Date()): boolean {
  if ((ev.status ?? "") === "completed") return true;
  const dates = [ev.date, ...(ev.childDates ?? [])]
    .filter((d): d is string => typeof d === "string" && d.length >= 10)
    .map((d) => d.slice(0, 10));
  if (dates.length === 0) return false;
  const last = dates.reduce((max, d) => (d > max ? d : max));
  return last < localISODate(today);
}
