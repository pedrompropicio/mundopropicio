/**
 * #265 — única forma de o cliente remover ficheiros dos 7 buckets contabilísticos.
 * Chama a edge `storage-delete`, que valida permissões, grava `storage_deletion_log`
 * e MOVE o objeto para `_trash/<AAAA-MM-DD>/…`. O DELETE directo em storage.objects
 * foi retirado a `authenticated` nestes buckets.
 *
 * Lança Error com a mensagem do servidor à primeira falha (nunca engole).
 */
import { supabase } from "@/integrations/supabase/client";
import { extractFnError } from "@/lib/edge-fn-error";

export const ACCOUNTING_BUCKETS = new Set<string>([
  "transaction-documents",
  "camarim-documents",
  "card-documents",
  "closing-cost-documents",
  "standalone-invoices",
  "supplier-documents",
  "ticket-office-settlements",
  // #268
  "bank-statements",
  "event-forecast-attachments",
  "event-ab-attachments",
]);

export interface StorageDeleteMeta {
  reason: string;
  related_table?: string | null;
  related_id?: string | null;
}

export type StorageDeleteStatus = "trashed" | "kept_referenced" | "not_found";

export async function deleteStorageObject(
  bucket: string,
  path: string,
  meta: StorageDeleteMeta,
): Promise<StorageDeleteStatus> {
  const { data, error } = await supabase.functions.invoke("storage-delete", {
    body: { bucket, path, ...meta },
  });
  if (error) throw new Error(await extractFnError(error, "Falha ao remover o ficheiro."));
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao remover o ficheiro.");
  return data.status as StorageDeleteStatus;
}

export async function deleteStorageObjects(
  bucket: string,
  paths: string[],
  meta: StorageDeleteMeta,
): Promise<StorageDeleteStatus[]> {
  const out: StorageDeleteStatus[] = [];
  for (const p of [...new Set(paths.filter(Boolean))]) out.push(await deleteStorageObject(bucket, p, meta));
  return out;
}
