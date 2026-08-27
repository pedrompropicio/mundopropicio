/**
 * `events.format` é APENAS um rótulo de apresentação ("festival" | "residencia").
 * Nenhuma lógica, query, cálculo, fecho ou bilheteira depende dele —
 * `event_type` continua a mandar em toda a mecânica.
 */

export type EventFormat = "festival" | "residencia";

/** Rótulo humano para o formato de um evento do tipo festival. */
export function eventFormatLabel(
  event: { event_type?: string | null; format?: string | null } | null | undefined,
  fallback = "Festival",
): string {
  if (!event) return fallback;
  if ((event.event_type ?? "") !== "festival") return fallback;
  return event.format === "residencia" ? "Residência" : "Festival";
}
