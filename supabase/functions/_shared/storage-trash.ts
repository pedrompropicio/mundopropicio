// #265 — ÚNICO caminho para tirar objetos dos 7 buckets contabilísticos.
// Nunca apaga: MOVE para `_trash/<AAAA-MM-DD>/<caminho original>` e grava
// `storage_deletion_log` ANTES de mover. Se o registo falhar, não mexe no
// storage; se o move falhar, desfaz o registo e devolve o erro.
// Chamado pela edge `storage-delete` (utilizadores) e directamente pelas edges
// com service_role (ads-invoice-apply, ingest-transaction-document,
// ingest-standalone-invoice).

export const ACCOUNTING_BUCKETS = new Set([
  "transaction-documents",
  "camarim-documents",
  "card-documents",
  "closing-cost-documents",
  "standalone-invoices",
  "supplier-documents",
  "ticket-office-settlements",
]);

export interface TrashInput {
  bucket: string;
  path: string;
  reason?: string | null;
  related_table?: string | null;
  related_id?: string | null;
  deleted_by?: string | null;
  deleted_by_email?: string | null;
  company_id?: string | null;
}

export type TrashResult =
  | { ok: true; status: "trashed"; trashed_to: string; log_id: string }
  | { ok: true; status: "kept_referenced" | "not_found" }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validatePath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const p = path.trim();
  if (!p || p.startsWith("/") || p.endsWith("/") || p.includes("..") || p.includes("*")) return null;
  if (p.startsWith("_trash/")) return null;
  return p;
}

/** Há alguma linha que ainda aponta para este objeto? */
// deno-lint-ignore no-explicit-any
async function isReferenced(admin: any, bucket: string, path: string): Promise<boolean> {
  const checks: Array<[string, string, string]> = [];
  if (bucket === "transaction-documents") checks.push(["transaction_documents", "file_url", path]);
  if (bucket === "card-documents") {
    checks.push(["card_item_documents", "file_path", path]);
    checks.push(["transaction_documents", "file_url", `card://${path}`]);
  }
  if (bucket === "camarim-documents") checks.push(["transaction_documents", "file_url", `camarim://${path}`]);
  if (bucket === "standalone-invoices") checks.push(["standalone_invoices", "storage_path", path]);
  for (const [table, col, val] of checks) {
    const { data, error } = await admin.from(table).select("id").eq(col, val).limit(1);
    if (error) throw new Error(`verificação de referências em ${table}: ${error.message}`);
    if ((data ?? []).length > 0) return true;
  }
  return false;
}

// deno-lint-ignore no-explicit-any
export async function trashStorageObject(admin: any, input: TrashInput): Promise<TrashResult> {
  if (!ACCOUNTING_BUCKETS.has(input.bucket)) return { ok: false, error: `Bucket não suportado: ${input.bucket}` };
  const path = validatePath(input.path);
  if (!path) return { ok: false, error: "Caminho inválido — tem de ser um ficheiro exacto." };

  try {
    if (await isReferenced(admin, input.bucket, path)) return { ok: true, status: "kept_referenced" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const today = new Date().toISOString().slice(0, 10);
  const trashedTo = `_trash/${today}/${path}`;
  const companyId = input.company_id ?? (UUID.test(path.split("/")[0]) ? path.split("/")[0] : null);

  const { data: log, error: logErr } = await admin
    .from("storage_deletion_log")
    .insert({
      bucket: input.bucket,
      object_path: path,
      deleted_by: input.deleted_by ?? null,
      deleted_by_email: input.deleted_by_email ?? null,
      company_id: companyId,
      reason: input.reason ?? null,
      related_table: input.related_table ?? null,
      related_id: input.related_id && UUID.test(input.related_id) ? input.related_id : null,
      trashed_to: trashedTo,
    })
    .select("id")
    .single();
  if (logErr || !log) return { ok: false, error: `Registo da remoção falhou; ficheiro mantido: ${logErr?.message ?? "sem id"}` };

  const { error: mvErr } = await admin.storage.from(input.bucket).move(path, trashedTo);
  if (mvErr) {
    const msg = String(mvErr.message ?? mvErr);
    await admin.from("storage_deletion_log").delete().eq("id", log.id);
    if (/not.?found|does not exist/i.test(msg)) return { ok: true, status: "not_found" };
    return { ok: false, error: `Mover para o lixo falhou; ficheiro mantido: ${msg}` };
  }
  return { ok: true, status: "trashed", trashed_to: trashedTo, log_id: log.id };
}
