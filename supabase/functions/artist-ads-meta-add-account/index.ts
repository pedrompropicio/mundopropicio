// artist-ads-meta-add-account — acrescenta uma SEGUNDA (ou n-ésima) conta de
// anúncios Meta a um artista, reutilizando o token de uma ligação existente
// (D-ERP143). Uma ligação por conta de anúncios; o token é partilhado.
//
// POST { source_connection_id, ad_account_id }
// JWT obrigatório (verify_jwt = true). Papel: admin na empresa do artista
// (user_roles.company_id) ou platform_admin — padrão D-ERP128. service_role aceite.
// Nunca devolve nem regista tokens. Não altera a ligação de origem.

import { adminClient, auditLog, corsHeaders, json } from "../_shared/artist-meta.ts";
import { META_GRAPH_VERSION } from "../_shared/artist-ads.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();

  // --- autenticação (JWT explícito, D-ERP128)
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "missing token" }, 401);
  let isServiceRole = false;
  try {
    isServiceRole = JSON.parse(atob(bearer.split(".")[1] ?? ""))?.role === "service_role";
  } catch (_e) { /* segue */ }
  let userId: string | null = null;
  if (!isServiceRole) {
    const { data, error } = await admin.auth.getUser(bearer);
    if (error || !data?.user) return json({ error: "invalid token" }, 401);
    userId = data.user.id;
  }

  let body: { source_connection_id?: string; ad_account_id?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "body inválido" }, 400);
  }
  const sourceId = (body.source_connection_id ?? "").trim();
  const rawAcc = (body.ad_account_id ?? "").trim();
  if (!UUID_RE.test(sourceId)) return json({ error: "source_connection_id inválido" }, 400);
  const digits = rawAcc.replace(/^act_/i, "");
  if (!/^\d{5,30}$/.test(digits)) return json({ error: "ad_account_id inválido" }, 400);
  const adAccountId = `act_${digits}`;

  // --- ligação de origem
  const { data: src, error: sErr } = await (admin as any)
    .schema("crm").from("ad_platform_connections")
    .select("id, company_id, artist_id, platform, connection_scope, status, access_token_encrypted, token_type, expires_at, external_business_id, external_business_name, available_ad_accounts, selected_page_id, selected_instagram_id, connected_by")
    .eq("id", sourceId).maybeSingle();
  if (sErr) return json({ error: sErr.message }, 500);
  if (!src) return json({ error: "ligação de origem não encontrada" }, 404);
  if (src.platform !== "meta" || src.connection_scope !== "artist" || !src.artist_id) {
    return json({ error: "a origem não é uma ligação Meta de artista" }, 400);
  }
  if (src.status !== "active") return json({ error: `ligação de origem não está activa (${src.status})` }, 400);

  // --- papel na empresa do artista (user_roles; nunca empresa activa)
  if (!isServiceRole) {
    const { data: roles } = await admin.from("user_roles")
      .select("role, company_id").eq("user_id", userId!);
    const ok = (roles ?? []).some((r: { role: string; company_id: string | null }) =>
      r.role === "platform_admin" || (r.role === "admin" && r.company_id === src.company_id)
    );
    if (!ok) return json({ error: "sem permissão (admin da empresa do artista ou platform_admin)" }, 403);
  }

  // --- idempotente: já existe ligação do artista para esta conta?
  const { data: existing } = await (admin as any)
    .schema("crm").from("ad_platform_connections")
    .select("id, selected_ad_account_name, selected_ad_account_currency")
    .eq("company_id", src.company_id).eq("artist_id", src.artist_id)
    .eq("platform", "meta").eq("selected_ad_account_id", adAccountId)
    .maybeSingle();
  if (existing) {
    return json({
      ok: true,
      connection_id: existing.id,
      account_name: existing.selected_ad_account_name,
      currency: existing.selected_ad_account_currency,
      already_existed: true,
    });
  }

  // --- confirmar a conta na Meta com o token da origem
  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKey) return json({ error: "ENCRYPTION_MASTER_KEY não configurado" }, 500);
  const { data: tokRows, error: tErr } = await admin.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: sourceId, p_master_key: masterKey,
  });
  const token = (Array.isArray(tokRows) ? tokRows[0] : tokRows)?.access_token as string | undefined;
  if (tErr || !token) return json({ error: "não foi possível ler o token da origem" }, 500);

  const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}`);
  u.searchParams.set("fields", "name,currency,account_status,timezone_name");
  u.searchParams.set("access_token", token);
  let acc: any = null;
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
    acc = await res.json().catch(() => null);
    if (!res.ok || acc?.error) {
      return json({ error: acc?.error?.message ?? `Meta respondeu ${res.status}`, meta_code: acc?.error?.code ?? null }, 400);
    }
  } catch (e) {
    return json({ error: `falha a contactar a Meta: ${(e as Error).message}` }, 502);
  }
  if (Number(acc?.account_status) !== 1) {
    return json({ error: `conta não está activa na Meta (account_status=${acc?.account_status})` }, 400);
  }

  // --- nova ligação (mesma cifra, sem decifrar para gravar)
  const { data: created, error: iErr } = await (admin as any)
    .schema("crm").from("ad_platform_connections")
    .insert({
      company_id: src.company_id,
      platform: "meta",
      connection_scope: "artist",
      artist_id: src.artist_id,
      access_token_encrypted: src.access_token_encrypted,
      token_type: src.token_type,
      expires_at: src.expires_at,
      external_business_id: src.external_business_id,
      external_business_name: src.external_business_name,
      available_ad_accounts: src.available_ad_accounts,
      selected_page_id: src.selected_page_id,
      selected_instagram_id: src.selected_instagram_id,
      connected_by: src.connected_by,
      connected_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      selected_ad_account_id: adAccountId,
      selected_ad_account_name: acc?.name ?? null,
      selected_ad_account_currency: acc?.currency ?? null,
      status: "active",
    })
    .select("id").single();
  if (iErr) return json({ error: iErr.message }, 500);

  await auditLog(admin, {
    entity_type: "artist",
    entity_id: src.artist_id,
    action: "artist_ads_meta_account_added",
    changed_by: userId ?? "service_role",
    company_id: src.company_id,
    metadata: {
      source_connection_id: sourceId,
      connection_id: created.id,
      ad_account_id: adAccountId,
      currency: acc?.currency ?? null,
      timezone_name: acc?.timezone_name ?? null,
    },
  });

  return json({
    ok: true,
    connection_id: created.id,
    account_name: acc?.name ?? null,
    currency: acc?.currency ?? null,
  });
});
