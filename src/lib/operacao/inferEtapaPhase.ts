// Heuristic: infer which operational phase a given etapa belongs to,
// based on its planned_start relative to the event start date.
//
// Phases:
//  - "setup"     : sem data planeada OU >14 dias antes
//  - "planning"  : entre 14 e 2 dias antes
//  - "montagem"  : 1 dia antes até início
//  - "evento"    : durante o evento (entre event.date e event.endDate, se houver)
//
// Quando o evento não tem data definida, tudo cai em "setup".

export type EtapaPhase = "setup" | "planning" | "montagem" | "evento";

export const PHASE_LABELS: Record<EtapaPhase, string> = {
  setup: "Setup",
  planning: "Planeamento",
  montagem: "Montagem",
  evento: "Evento",
};

export const PHASE_ORDER: EtapaPhase[] = ["setup", "planning", "montagem", "evento"];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDays(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.floor((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS);
}

export function inferEtapaPhase(
  etapa: { planned_start?: string | null; planned_end?: string | null },
  event: { date?: string | null; end_date?: string | null }
): EtapaPhase {
  if (!event.date) return "setup";
  if (!etapa.planned_start) return "setup";

  const start = new Date(etapa.planned_start);
  const eventStart = new Date(event.date);
  const eventEnd = event.end_date ? new Date(event.end_date) : eventStart;

  // Durante o evento
  if (startOfDay(start) >= startOfDay(eventStart) && startOfDay(start) <= startOfDay(eventEnd)) {
    return "evento";
  }

  // Antes do evento
  const daysBefore = diffDays(eventStart, start);

  if (daysBefore < 0) {
    // Após o evento — trata como "evento" (pós-fecho operacional ainda dentro do escopo do show)
    return "evento";
  }
  if (daysBefore <= 1) return "montagem";
  if (daysBefore <= 14) return "planning";
  return "setup";
}
