// storage-delete — #265. Única porta para utilizadores removerem ficheiros dos
// 7 buckets contabilísticos (o DELETE directo em storage.objects foi retirado).
// POST { bucket, path, reason?, related_table?, related_id? }
// 1) valida o JWT do chamador; 2) can_delete_storage_object(bucket, path) com o
// JWT dele (mesmas regras das antigas políticas: papel + empresa/sessão);
// 3) service_role: referências → registo → move para _trash.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ACCOUNTING_BUCKETS, trashStorageObject, validatePath } from "../_shared/storage-trash.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sem sessão" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return json({ error: "Sessão inválida" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const bucket = typeof body?.bucket === "string" ? body.bucket : "";
  const path = validatePath(body?.path);
  if (!ACCOUNTING_BUCKETS.has(bucket)) return json({ error: `Bucket não suportado: ${bucket}` }, 400);
  if (!path) return json({ error: "Caminho inválido — tem de ser um ficheiro exacto." }, 400);
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
  const related_table = typeof body?.related_table === "string" ? body.related_table.slice(0, 100) : null;
  const related_id = typeof body?.related_id === "string" ? body.related_id : null;

  const { data: allowed, error: pErr } = await userClient.rpc("can_delete_storage_object", {
    p_bucket: bucket, p_name: path,
  });
  if (pErr) return json({ error: `Verificação de permissão falhou: ${pErr.message}` }, 500);
  if (allowed !== true) return json({ error: "Sem permissão para remover este ficheiro." }, 403);

  const { data: companyId } = await userClient.rpc("current_company_id");
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const r = await trashStorageObject(admin, {
    bucket, path, reason, related_table, related_id,
    deleted_by: u.user.id, deleted_by_email: u.user.email ?? null,
    company_id: bucket === "card-documents" ? (companyId as string | null) ?? null : null,
  });
  if (!r.ok) return json({ error: r.error }, 500);
  return json(r);
});
