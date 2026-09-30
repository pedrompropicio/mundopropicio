/**
 * Remoção de anexos do bucket `transaction-documents` — SÓ pela edge
 * `delete-transaction-document` (service_role). Um ficheiro serve N linhas
 * (mesmo file_url); a contagem de referências corre no servidor, em todas as
 * empresas, sem RLS. O frontend nunca chama storage.from("transaction-documents").remove
 * (guarda: src/lib/__tests__/no-direct-transaction-document-remove.test.ts).
 */
import { supabase } from "@/integrations/supabase/client";
import { extractFnError } from "@/lib/edge-fn-error";

export type DeleteTransactionDocumentRequest =
  | { documentId: string; includeShared?: boolean }
  | { fileUrl: string; scope: "payment_list"; paymentListId: string }
  | { fileUrl: string; scope: "orphan" };

export interface DeleteTransactionDocumentResult {
  ok: true;
  deleted_rows: number;
  deleted_list_rows: number;
  storage: "trashed" | "not_found" | "kept_referenced" | "partilhado" | "esquema_proprio" | "mantido" | "falhou";
  warning?: string;
}

export async function deleteTransactionDocument(
  req: DeleteTransactionDocumentRequest,
): Promise<DeleteTransactionDocumentResult> {
  const { data, error } = await supabase.functions.invoke("delete-transaction-document", { body: req });
  if (error) throw new Error(await extractFnError(error, "Falha ao remover o documento."));
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao remover o documento.");
  if (data.warning) console.warn("[delete-transaction-document]", data.warning);
  return data as DeleteTransactionDocumentResult;
}
