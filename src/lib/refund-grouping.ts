/**
 * Refund grouping (visualização consolidada de notas de reembolso).
 *
 * Função PURA: dado um array de transactions e um mapa transactionId → noteSummary,
 * devolve uma lista de "render items" heterogénea preservando a ordem original
 * (a primeira ocorrência de uma tx ligada a uma nota é substituída por um header
 * sintético seguido das suas filhas; ocorrências subsequentes da mesma nota
 * desaparecem porque já foram emitidas como filhas).
 *
 * Não toca a DB. Não faz I/O. Pode ser usada em qualquer um dos grupos
 * (overdue, periodo, sem data, liquidadas) sem efeitos colaterais.
 */

export interface RefundNoteSummary {
  noteId: string;
  code: string | null;
  employeeName: string | null;
  status: string | null;
}

export type RefundRenderItem<T> =
  | { kind: "tx"; tx: T }
  | {
      kind: "group-header";
      noteId: string;
      code: string | null;
      employeeName: string | null;
      status: string | null;
      childCount: number;
      total: number;
      childIds: string[];
    }
  | { kind: "group-child"; tx: T; noteId: string };

export interface GroupOptions<T> {
  getId: (tx: T) => string;
  /** Devolve o noteId associado a esta tx, ou null se não pertencer a nota. */
  getNoteId: (tx: T) => string | null;
  /** Soma o que conta como "valor" da linha (ex.: amount c/IVA ou paid_amount). */
  getAmount: (tx: T) => number;
  /** Map noteId → summary (code, employee, status). Notas sem entrada no mapa caem para fallback. */
  notes: Map<string, RefundNoteSummary>;
  /**
   * Identifica a transação de pagamento/liquidação da nota (saída de caixa para o funcionário).
   * Quando devolve true, a tx é mostrada como filha do grupo MAS o seu valor é EXCLUÍDO do
   * total agregado para evitar duplicação (a saída espelha a soma das despesas originais).
   */
  isPaymentTx?: (tx: T) => boolean;
}

/**
 * Agrupa transações por nota de reembolso preservando a ordem original.
 * Notas com 0 filhas (ausentes do array de input) NÃO são renderizadas.
 */
export function groupTransactionsByRefund<T>(transactions: T[], opts: GroupOptions<T>): RefundRenderItem<T>[] {
  const { getId, getNoteId, getAmount, notes, isPaymentTx } = opts;

  // Pré-cálculo: para cada noteId presente, lista de tx pela ordem original.
  const childrenByNote = new Map<string, T[]>();
  for (const tx of transactions) {
    const noteId = getNoteId(tx);
    if (!noteId) continue;
    const arr = childrenByNote.get(noteId) ?? [];
    arr.push(tx);
    childrenByNote.set(noteId, arr);
  }

  const emittedNotes = new Set<string>();
  const out: RefundRenderItem<T>[] = [];

  for (const tx of transactions) {
    const noteId = getNoteId(tx);
    if (!noteId) {
      out.push({ kind: "tx", tx });
      continue;
    }
    if (emittedNotes.has(noteId)) {
      // Já emitida — não duplicar (filha já foi colocada após o header).
      continue;
    }
    emittedNotes.add(noteId);
    const children = childrenByNote.get(noteId) ?? [];
    if (children.length === 0) continue; // defensivo

    const summary = notes.get(noteId) ?? {
      noteId,
      code: null,
      employeeName: null,
      status: null,
    };
    // Total: soma só despesas originais — exclui a tx de pagamento (espelho da soma)
    // para não duplicar visualmente o valor da nota.
    const total = children.reduce((s, c) => (isPaymentTx?.(c) ? s : s + getAmount(c)), 0);
    out.push({
      kind: "group-header",
      noteId,
      code: summary.code,
      employeeName: summary.employeeName,
      status: summary.status,
      childCount: children.length,
      total,
      childIds: children.map(getId),
    });
    for (const child of children) {
      out.push({ kind: "group-child", tx: child, noteId });
    }
  }

  return out;
}
