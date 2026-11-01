export interface ReviewCounts {
  conferidas: number;
  pendentes: number;
  encerradas: number;
  porConferir: number;
}

/** Conta o estado de conferência sobre a lista de transacções recebida (client-side). */
export function computeReviewCounts(
  txs: ReadonlyArray<{ id: string }>,
  reviewMap: Readonly<Record<string, { status?: string | null } | undefined>>,
): ReviewCounts {
  const out: ReviewCounts = { conferidas: 0, pendentes: 0, encerradas: 0, porConferir: 0 };
  for (const t of txs) {
    const st = reviewMap[t.id]?.status;
    if (st === "conferido") out.conferidas++;
    else if (st === "pendente") out.pendentes++;
    else if (st === "encerrada") out.encerradas++;
    else out.porConferir++;
  }
  return out;
}
