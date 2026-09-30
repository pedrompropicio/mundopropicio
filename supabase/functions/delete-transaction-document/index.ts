// delete-transaction-document — remoção de anexos de transação sem depender de RLS.
// Um upload pode servir N linhas (mesmo file_url), por isso o ficheiro só sai do
// bucket quando NENHUMA linha de transaction_documents lhe aponta, em TODAS as
// empresas — contagem feita com service_role.
//
// POST
//   { documentId, includeShared? }                        — anexo de transação (includeShared = grupo de fatura, mesmo file_url na empresa dona)
//   { fileUrl, scope: "payment_list", paymentListId }     — comprovativo de lista + réplicas nas transações
//   { fileUrl, scope: "orphan" }                          — linhas já apagadas (ex.: cascata da despesa de cartão); só limpa o ficheiro
//
// Ordem: (a) permissão pela empresa dona; (b) apagar linhas (service_role);
// (c) contar referências em todas as empresas; (d) só com zero, mover o objeto
// para _trash (#265, com storage_deletion_log). Esquemas bank:/ref:/camarim:/card:
// e URLs externas nunca tocam no storage. Falha no storage = sucesso com aviso.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCallerContext, canAccessCompany, type CallerContext } from "../_shared/caller-context.ts";
import { trashStorageObject } from "../_shared/storage-trash.ts";

const BUCKET = "transaction-documents";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function bucketPath(fileUrl: string): string | null {
  if (!fileUrl) return null;
  if (/^(bank|ref|camarim|card):/i.test(fileUrl)) return null;
  if (/^https?:\/\//i.test(fileUrl)) return null;
  return fileUrl.replace(/^\/+/, "");
}

/** Mesma regra da política de DELETE em transaction_documents: admin/manager da empresa dona. */
function canDeleteIn(ctx: CallerContext, companyId: string | null) {
  if (!canAccessCompany(ctx, companyId)) return false;
  if (ctx.isPlatformAdmin) return true;
  return ctx.roleRows.some(
    (r) => (r.role === "admin" || r.role === "manager") && (r.company_id === companyId || r.company_id === null),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sem sessão" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return json({ error: "Sessão inválida" }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ctx = await getCallerContext(admin, u.user.id);

  let fileUrl: string;
  let ownerCompanyId: string | null = null;
  let relatedTable = "transaction_documents";
  let relatedId: string | null = null;
  let deletedTx = 0;
  let deletedList = 0;

  if (typeof body?.documentId === "string") {
    if (!UUID.test(body.documentId)) return json({ error: "documentId inválido" }, 400);
    const { data: doc, error } = await admin
      .from("transaction_documents").select("id, file_url, company_id, transaction_id")
      .eq("id", body.documentId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!doc) return json({ error: "Documento não encontrado." }, 404);
    ownerCompanyId = doc.company_id;
    if (!ownerCompanyId && doc.transaction_id) {
      const { data: tx } = await admin.from("transactions").select("company_id").eq("id", doc.transaction_id).maybeSingle();
      ownerCompanyId = tx?.company_id ?? null;
    }
    // (a)
    if (!canDeleteIn(ctx, ownerCompanyId)) return json({ error: "Sem permissão para remover este documento." }, 403);
    fileUrl = doc.file_url;
    relatedId = doc.id;
    // (b)
    let q = admin.from("transaction_documents").delete();
    q = body.includeShared === true && fileUrl
      ? q.eq("file_url", fileUrl).eq("company_id", ownerCompanyId)
      : q.eq("id", doc.id);
    const { data: del, error: dErr } = await q.select("id");
    if (dErr) return json({ error: dErr.message }, 500);
    deletedTx = (del ?? []).length;
  } else if (body?.scope === "payment_list") {
    if (typeof body.fileUrl !== "string" || !body.fileUrl) return json({ error: "fileUrl em falta" }, 400);
    if (typeof body.paymentListId !== "string" || !UUID.test(body.paymentListId)) return json({ error: "paymentListId inválido" }, 400);
    fileUrl = body.fileUrl;
    const { data: list, error } = await admin.from("payment_lists").select("id, company_id").eq("id", body.paymentListId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!list) return json({ error: "Lista de pagamento não encontrada." }, 404);
    ownerCompanyId = list.company_id;
    if (!canDeleteIn(ctx, ownerCompanyId)) return json({ error: "Sem permissão para remover este comprovativo." }, 403);
    const { data: delList, error: lErr } = await admin
      .from("payment_list_documents").delete()
      .eq("payment_list_id", list.id).eq("file_url", fileUrl).select("id");
    if (lErr) return json({ error: lErr.message }, 500);
    deletedList = (delList ?? []).length;
    if (deletedList === 0) return json({ error: "Comprovativo não encontrado nesta lista." }, 404);
    const { data: delTx, error: tErr } = await admin
      .from("transaction_documents").delete()
      .eq("file_url", fileUrl).eq("company_id", ownerCompanyId).select("id");
    if (tErr) return json({ error: tErr.message }, 500);
    deletedTx = (delTx ?? []).length;
    relatedTable = "payment_list_documents";
    relatedId = list.id;
  } else if (body?.scope === "orphan") {
    if (typeof body.fileUrl !== "string" || !body.fileUrl) return json({ error: "fileUrl em falta" }, 400);
    fileUrl = body.fileUrl;
    const first = (bucketPath(fileUrl) ?? "").split("/")[0];
    ownerCompanyId = UUID.test(first) ? first : null;
    if (!canAccessCompany(ctx, ownerCompanyId)) return json({ error: "Sem permissão para este ficheiro." }, 403);
  } else {
    return json({ error: "Pedido inválido: documentId ou fileUrl+scope." }, 400);
  }

  const path = bucketPath(fileUrl);
  if (!path) return json({ ok: true, deleted_rows: deletedTx, deleted_list_rows: deletedList, storage: "esquema_proprio" });

  // (c)
  const { count, error: cErr } = await admin
    .from("transaction_documents").select("id", { count: "exact", head: true }).eq("file_url", fileUrl);
  if (cErr) return json({ ok: true, deleted_rows: deletedTx, deleted_list_rows: deletedList, storage: "mantido", warning: `contagem falhou: ${cErr.message}` });
  if ((count ?? 0) > 0) return json({ ok: true, deleted_rows: deletedTx, deleted_list_rows: deletedList, storage: "partilhado", remaining_refs: count });

  // (d)
  const r = await trashStorageObject(admin, {
    bucket: BUCKET, path, reason: `delete-transaction-document (${body?.scope ?? "documento"})`,
    related_table: relatedTable, related_id: relatedId,
    deleted_by: u.user.id, deleted_by_email: u.user.email ?? null, company_id: ownerCompanyId,
  });
  if (!r.ok) {
    console.error("[delete-transaction-document] storage", path, r.error);
    return json({ ok: true, deleted_rows: deletedTx, deleted_list_rows: deletedList, storage: "falhou", warning: r.error });
  }
  return json({ ok: true, deleted_rows: deletedTx, deleted_list_rows: deletedList, storage: r.status });
});
