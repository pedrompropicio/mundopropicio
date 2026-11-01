/**
 * #397 — Fatura do fornecedor nas deduções do fecho de bilheteira.
 * Lógica pura (sem Supabase): um ficheiro serve N transações → 1 objecto no
 * storage e N registos em transaction_documents (is_accounting = true), um por
 * transação. Quem já tem documento não é duplicado.
 */

export interface DeductionDocRow {
  transaction_id: string;
  name: string;
  file_url: string;
  doc_type: string;
  uploaded_by: string;
  is_accounting: true;
}

export function getDocType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png"].includes(ext ?? "")) return "imagem";
  if (["doc", "docx"].includes(ext ?? "")) return "word";
  if (["xls", "xlsx"].includes(ext ?? "")) return "excel";
  return "outro";
}

/** N registos com o MESMO caminho; salta quem já tem documento e ids repetidos. */
export function buildDeductionDocumentRows(args: {
  filePath: string;
  fileName: string;
  uploadedBy: string;
  transactionIds: string[];
  alreadyDocumented: ReadonlySet<string>;
}): DeductionDocRow[] {
  const seen = new Set<string>();
  const rows: DeductionDocRow[] = [];
  for (const id of args.transactionIds) {
    if (seen.has(id) || args.alreadyDocumented.has(id)) continue;
    seen.add(id);
    rows.push({
      transaction_id: id,
      name: args.fileName,
      file_url: args.filePath,
      doc_type: getDocType(args.fileName),
      uploaded_by: args.uploadedBy,
      is_accounting: true,
    });
  }
  return rows;
}

/** Agrupa transações por ficheiro escolhido (um upload por ficheiro distinto). */
export function groupTransactionsByFile<F>(
  assignments: ReadonlyMap<string, F>,
  alreadyDocumented: ReadonlySet<string>,
): Array<{ file: F; transactionIds: string[] }> {
  const groups = new Map<F, string[]>();
  for (const [txId, file] of assignments) {
    if (alreadyDocumented.has(txId)) continue;
    const list = groups.get(file);
    if (list) list.push(txId);
    else groups.set(file, [txId]);
  }
  return [...groups].map(([file, transactionIds]) => ({ file, transactionIds }));
}

export interface DeductionLine {
  id: string;
  description?: string | null;
  supplierName?: string | null;
  gross: number;
}

/** Deduções seleccionadas sem documento (nem gravado, nem escolhido para anexar agora). */
export function listDeductionsWithoutDocument<T extends DeductionLine>(
  deductions: readonly T[],
  selectedIds: ReadonlySet<string>,
  documented: ReadonlySet<string>,
  pendingAttach: ReadonlySet<string>,
): T[] {
  return deductions.filter(
    (d) => selectedIds.has(d.id) && !documented.has(d.id) && !pendingAttach.has(d.id),
  );
}
