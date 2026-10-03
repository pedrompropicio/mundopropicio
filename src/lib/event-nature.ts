export const EVENT_NATURES = [
  {
    value: "producao_propria",
    label: "Produção própria",
    description: "A MP produz o evento e assume o risco.",
  },
  {
    value: "intermediacao",
    label: "Intermediação",
    description: "A MP vende o evento e recebe comissão.",
  },
  {
    value: "coproducao",
    label: "Coprodução",
    description: "O risco e o resultado são partilhados com um sócio.",
  },
  {
    value: "parceiro_local",
    label: "Parceiro local",
    description: "A MP é o parceiro local de um promotor externo.",
  },
  {
    value: "temporada",
    label: "Temporada",
    description: "Residência ou temporada longa.",
  },
] as const;

export type EventNature = (typeof EVENT_NATURES)[number]["value"];

export function eventNatureLabel(value: string | null | undefined): string {
  return EVENT_NATURES.find((nature) => nature.value === value)?.label ?? "— por definir —";
}
/**
 * Restringe um conjunto de eventos às naturezas escolhidas (#256 fase 2).
 * Lista vazia ou com todas as naturezas = devolve o mesmo array (resultado idêntico ao de antes).
 * Não altera nenhum cálculo: só decide que eventos entram.
 */
export function filterEventsByNature<T extends { event_nature?: string | null }>(
  events: T[],
  selected: readonly string[],
): T[] {
  if (selected.length === 0 || selected.length >= EVENT_NATURES.length) return events;
  const set = new Set(selected);
  return events.filter((e) => !!e.event_nature && set.has(e.event_nature));
}
