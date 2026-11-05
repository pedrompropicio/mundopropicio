import { cents } from "../../supabase/functions/_shared/ticketing/planning-forecast";

export const DEFAULT_BP_HORIZON_DAYS = 30;

export function effectiveBpHorizon(value: number | null | undefined): number {
  return value ?? DEFAULT_BP_HORIZON_DAYS;
}

function utcDay(value: string): number {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

export function withinBpHorizon(ref: string, firstDay: string | null, days: number): boolean {
  if (days <= 0 || firstDay === null) return false;
  const reference = utcDay(ref);
  const first = utcDay(firstDay);
  return Number.isFinite(reference) && Number.isFinite(first) && reference >= first - days * 86_400_000;
}

interface BpHorizonEvent {
  event_id: string;
  nome: string;
  first_day: string | null;
  bp_por_lancar: number;
}

/** Planeamento de fluxo informativo; não altera o a pagar lançado nem a necessidade. */
export function bpCommitmentUntilEvent(eventos: readonly BpHorizonEvent[], horizons: Record<string, number | null>, ref: string) {
  const selected = eventos.flatMap(event => {
    const dias = effectiveBpHorizon(horizons[event.event_id]);
    return withinBpHorizon(ref, event.first_day, dias)
      ? [{ event_id: event.event_id, nome: event.nome, dias, valor: event.bp_por_lancar }]
      : [];
  });
  return { total: cents(selected.reduce((sum, event) => sum + event.valor, 0)), eventos: selected };
}
