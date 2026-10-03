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