export type BPPlanilhaVersionFilter =
  | { method: "is"; column: "version_id"; value: null }
  | { method: "eq"; column: "version_id"; value: string };

/** Contrato único da Planilha: null = BP ativo; UUID = cenário selecionado. */
export function getBPPlanilhaVersionFilter(selectedVersionId: string | null): BPPlanilhaVersionFilter {
  return selectedVersionId
    ? { method: "eq", column: "version_id", value: selectedVersionId }
    : { method: "is", column: "version_id", value: null };
}

/** O mesmo valor viaja para as RPCs batch de update e insert. */
export function getBPPlanilhaRpcVersionId(selectedVersionId: string | null): string | null {
  return selectedVersionId;
}