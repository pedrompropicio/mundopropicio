export const STRATEGY_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  generated: "Gerada",
  approved: "Aprovada",
  in_progress: "Em curso",
  completed: "Concluída",
  archived: "Arquivada",
};

export const STRATEGY_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "Rascunho" },
  { value: "generated", label: "Gerada" },
  { value: "approved", label: "Aprovada" },
  { value: "in_progress", label: "Em curso" },
  { value: "completed", label: "Concluída" },
  { value: "archived", label: "Arquivada" },
];

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STRATEGY_STATUS_LABELS[status] ?? status;
}
