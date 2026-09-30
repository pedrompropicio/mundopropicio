/**
 * #265 — regra única para tirar objetos do bucket `transaction-documents`.
 *
 * O objeto só sai do bucket DEPOIS de a linha sair da BD e quando nenhuma linha
 * de `transaction_documents` o referencia (grupos de fatura e a ingestão por API
 * partilham o mesmo file_url entre N linhas). Nunca lança: erros vêm no retorno.
 */
import { supabase } from "@/integrations/supabase/client";

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
  errors: string[];
}

export async function removeTransactionDocumentObjects(fileUrls: string[]): Promise<RemoveObjectsResult> {
  const out: RemoveObjectsResult = { removed: [], kept: [], errors: [] };
  const unique = [...new Set((fileUrls ?? []).filter(Boolean))];
  for (const url of unique) {
    const path = toBucketPath(url);
    if (!path) continue;
    try {
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("id")
        .eq("file_url", url)
        .limit(1);
      if (error) {
        out.errors.push(`${path}: ${error.message}`);
        continue;
      }
      if ((data ?? []).length > 0) {
        out.kept.push(path);
        continue;
      }
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
      if (rmErr) out.errors.push(`${path}: ${rmErr.message}`);
      else out.removed.push(path);
    } catch (e: any) {
      out.errors.push(`${path}: ${e?.message ?? String(e)}`);
    }
  }
  if (out.errors.length) console.warn("[removeTransactionDocumentObjects]", out.errors);
  return out;
}
