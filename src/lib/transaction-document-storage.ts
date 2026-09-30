/**
 * #265 — regra única para tirar objetos do bucket `transaction-documents`.
 *
 * O objeto só sai do bucket DEPOIS de a linha sair da BD e quando nenhuma linha
 * de `transaction_documents` o referencia (a verificação é feita no servidor,
 * na edge `storage-delete`, que regista e move para `_trash`).
 * Falhas agora LANÇAM (antes só console.warn e ninguém lia o retorno).
 */
import { deleteStorageObject } from "@/lib/storage-delete";

const BUCKET = "transaction-documents";

/** Caminho no bucket, como o resolveStorageRef do TransactionDocumentsModal; null = não é deste bucket. */
function toBucketPath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  if (/^(ref|camarim|card|bank):\/\//i.test(fileUrl)) return null;
  if (/^https?:\/\//i.test(fileUrl)) return null;
  return fileUrl;
}

export interface RemoveObjectsResult {
  removed: string[];
  kept: string[];
}

export async function removeTransactionDocumentObjects(
  fileUrls: string[],
  meta: { reason?: string; related_table?: string; related_id?: string | null } = {},
): Promise<RemoveObjectsResult> {
  const out: RemoveObjectsResult = { removed: [], kept: [] };
  const unique = [...new Set((fileUrls ?? []).filter(Boolean))];
  const errors: string[] = [];
  for (const url of unique) {
    const path = toBucketPath(url);
    if (!path) continue;
    try {
      const status = await deleteStorageObject(BUCKET, path, {
        reason: meta.reason ?? "remover anexo de transação",
        related_table: meta.related_table ?? "transaction_documents",
        related_id: meta.related_id ?? null,
      });
      if (status === "kept_referenced") out.kept.push(path);
      else out.removed.push(path);
    } catch (e: any) {
      errors.push(`${path}: ${e?.message ?? String(e)}`);
    }
  }
  if (errors.length) {
    throw new Error(`O registo foi removido, mas o ficheiro não saiu do armazenamento: ${errors.join("; ")}`);
  }
  return out;
}
