// crm-meta-audience-upload
//
// POST { name: string, source_label: string, members: [{ email?: string, phone_e164?: string }] }
//
// FASE 2/A: cria a audiência LOCAL em public.meta_custom_audiences (sem audience_id_meta)
// e grava os membros em public.meta_audience_upload_members (hashes SHA256 GENERATED pela BD).
//
// NÃO escreve no Meta. NÃO chama crm-meta-audience-create nem crm-meta-audience-sync.
// Fase 3 liga isto ao Meta.
//
// Auth: exige JWT do utilizador (dados pessoais). Valida role admin/platform_admin/marketing_manager
// e usa RLS (via userClient) para descobrir company_id + connection_id (link primário Meta).
// Escrita final via service_role para evitar surpresas de policy em INSERTs em lote.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_MEMBERS = 200_000;
const BATCH_SIZE = 1_000;

type MemberIn = { email?: unknown; phone_e164?: unknown };
type MemberClean = { email: string | null; phone_e164: string | null };

const ALLOWED_ROLES = new Set(["admin", "platform_admin", "marketing_manager"]);

function normalize(members: MemberIn[]): MemberClean[] {
  const out: MemberClean[] = [];
  for (const m of members) {
    const email = typeof m?.email === "string" ? m.email.trim().toLowerCase() : "";
    const phone = typeof m?.phone_e164 === "string" ? m.phone_e164.trim() : "";
    if (!email && !phone) continue;
    out.push({ email: email || null, phone_e164: phone || null });
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { name?: string; source_label?: string; members?: MemberIn[] };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sourceLabel = typeof body.source_label === "string" ? body.source_label.trim() : "";
  const rawMembers = Array.isArray(body.members) ? body.members : null;

  if (!name || name.length > 255) return json({ error: "invalid_name" }, 400);
  if (!sourceLabel || sourceLabel.length > 255) return json({ error: "invalid_source_label" }, 400);
  if (!rawMembers || rawMembers.length === 0) return json({ error: "missing_members" }, 400);
  if (rawMembers.length > MAX_MEMBERS) {
    return json({ error: "too_many_members", max: MAX_MEMBERS, received: rawMembers.length }, 400);
  }

  const members = normalize(rawMembers);
  if (members.length === 0) return json({ error: "no_valid_members" }, 400);

  // 1) Auth: valida user + role
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "invalid_jwt", detail: userErr?.message }, 401);
  const userId = userData.user.id;

  const { data: roleRows, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roleErr) return json({ error: "role_lookup_failed", detail: roleErr.message }, 500);
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r) => ALLOWED_ROLES.has(r))) return json({ error: "insufficient_role" }, 403);

  // 2) Resolver company_id + connection_id (link primário Meta da empresa activa via RLS)
  //    meta_custom_audiences.connection_id refere crm.ad_platform_account_links.id
  //    (mesmo padrão de crm-meta-audience-create).
  const { data: link, error: linkErr } = await (userClient as any)
    .schema("crm")
    .from("ad_platform_account_links")
    .select("id, company_id, enabled, is_primary")
    .eq("enabled", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkErr) return json({ error: "connection_lookup_failed", detail: linkErr.message }, 500);
  if (!link) return json({ error: "no_meta_connection", detail: "empresa sem conexão Meta activa" }, 400);

  const companyId = link.company_id as string;
  const connectionId = link.id as string;

  // 3) Criar row local em meta_custom_audiences (service_role — user já validado)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: audRow, error: audErr } = await admin
    .from("meta_custom_audiences")
    .insert({
      company_id: companyId,
      connection_id: connectionId,
      name,
      description: `Lista carregada: ${sourceLabel}`,
      audience_id_meta: null, // Fase 3 liga isto ao Meta
      enabled: true,
      filters: { mode: "upload", source_label: sourceLabel, subtype: "CUSTOM" },
      created_by: userId,
    })
    .select("id")
    .single();
  if (audErr || !audRow) return json({ error: "audience_create_failed", detail: audErr?.message }, 500);
  const audienceLocalId = audRow.id as string;

  // 4) Inserir membros em lotes. Dedupe via contagem (índices UNIQUE parciais existem, mas
  //    ON CONFLICT com índices parciais não cobre os dois ao mesmo tempo — vamos inserir
  //    lote a lote e contar diff. Nunca falha o pedido inteiro por conflito.
  let totalInserido = 0;
  const rowsBase = members.map((m) => ({
    company_id: companyId,
    audience_local_id: audienceLocalId,
    email: m.email,
    phone_e164: m.phone_e164,
    source_label: sourceLabel,
  }));

  for (let i = 0; i < rowsBase.length; i += BATCH_SIZE) {
    const chunk = rowsBase.slice(i, i + BATCH_SIZE);
    // Tenta lote inteiro
    const { data: ins, error: insErr } = await admin
      .from("meta_audience_upload_members")
      .insert(chunk)
      .select("id");
    if (!insErr && ins) {
      totalInserido += ins.length;
      continue;
    }
    // Conflito no lote → inserir 1-a-1 ignorando duplicados
    for (const row of chunk) {
      const { data: one, error: oneErr } = await admin
        .from("meta_audience_upload_members")
        .insert(row)
        .select("id")
        .maybeSingle();
      if (!oneErr && one) totalInserido += 1;
      // duplicados (23505) e falhas isoladas são silenciosamente ignorados
    }
  }

  // 5) Contar quantos ficaram e actualizar total_records_local
  const { count: totalNaAudiencia } = await admin
    .from("meta_audience_upload_members")
    .select("id", { count: "exact", head: true })
    .eq("audience_local_id", audienceLocalId);

  await admin
    .from("meta_custom_audiences")
    .update({ total_records_local: totalNaAudiencia ?? totalInserido })
    .eq("id", audienceLocalId);

  const totalRecebido = members.length;
  const totalNa = totalNaAudiencia ?? totalInserido;
  const duplicadosIgnorados = Math.max(0, totalRecebido - totalNa);

  return json({
    ok: true,
    audience_local_id: audienceLocalId,
    total_recebido: totalRecebido,
    total_inserido: totalInserido,
    duplicados_ignorados: duplicadosIgnorados,
    total_na_audiencia: totalNa,
  });
});
