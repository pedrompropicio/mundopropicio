// crm-meta-create-lookalike
// Cria uma Lookalike Audience na conta Meta a partir de uma audiência-origem existente.
//
// Input: { company_id, source_audience_id_meta, country?="PT", ratio?=0.01, name? }
// Auth: header Authorization obrigatório (verify_jwt=true no gateway), sem getUser().
// Espelha o padrão de crm-meta-upload-creative-v2 / crm-meta-list-audiences.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const BUILD_VERSION = "create-lookalike-v1 2026-06-24";
const GRAPH_API_VERSION = "v21.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const KEY = Deno.env.get("ENCRYPTION_MASTER_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const bizErr = (payload: { error: string; detail?: unknown; fb_error?: unknown }) => {
  console.log("[create-lookalike] FAIL", JSON.stringify(payload));
  return json({ ok: false, ...payload }, 200);
};

function normalizeAdAccountId(raw: string): string {
  const v = String(raw || "").trim();
  return v.startsWith("act_") ? v.slice(4) : v;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 200);

  console.log(`[crm-meta-create-lookalike] BUILD_VERSION=${BUILD_VERSION} env url=${!!SUPABASE_URL} srk=${!!SRK} anon=${!!ANON} key=${!!KEY}`);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, error: "missing_authorization" }, 200);
  }

  const admin = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sbCrm = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });

  try {
    let body: {
      company_id?: string;
      source_audience_id_meta?: string;
      country?: string;
      ratio?: number;
      name?: string;
    } = {};
    try { body = await req.json(); } catch {}

    const companyId = body.company_id;
    const sourceId = body.source_audience_id_meta ? String(body.source_audience_id_meta) : "";
    if (!companyId) return bizErr({ error: "missing_params", detail: "company_id" });
    if (!sourceId) return bizErr({ error: "missing_params", detail: "source_audience_id_meta" });

    const country = (body.country ?? "PT").toString().toUpperCase().slice(0, 2);
    if (!/^[A-Z]{2}$/.test(country)) return bizErr({ error: "invalid_country", detail: country });

    const ratio = typeof body.ratio === "number" ? body.ratio : 0.01;
    if (!(ratio >= 0.01 && ratio <= 0.10)) {
      return bizErr({ error: "invalid_ratio", detail: `ratio=${ratio} (esperado 0.01..0.10)` });
    }

    // Buscar nome da origem
    const { data: srcRow } = await admin
      .from("meta_custom_audiences")
      .select("name")
      .eq("company_id", companyId)
      .eq("audience_id_meta", sourceId)
      .maybeSingle();
    const srcName = srcRow?.name ?? sourceId;

    const finalName = (body.name && body.name.trim().length > 0)
      ? body.name.trim()
      : `Semelhante (${Math.round(ratio * 100)}%) - ${srcName}`;

    // 1) Conexão Meta ativa
    const { data: conn, error: connErr } = await sbCrm
      .from("ad_platform_connections")
      .select("id")
      .eq("company_id", companyId).eq("platform", "meta").eq("status", "active")
      .maybeSingle();
    if (connErr || !conn?.id) return bizErr({ error: "connection_not_found", detail: connErr?.message });

    // 2) Ad account primário
    const { data: linkRows, error: linkErr } = await (sbCrm as any)
      .from("ad_platform_account_links")
      .select("id, connection_id, ad_account_id, is_primary, enabled")
      .eq("connection_id", conn.id)
      .eq("enabled", true)
      .order("is_primary", { ascending: false });
    if (linkErr) return bizErr({ error: "ad_account_query_failed", detail: linkErr.message });
    const linkRow = (linkRows ?? [])[0];
    if (!linkRow?.ad_account_id) return bizErr({ error: "sem_ad_account" });
    const adAccountId = normalizeAdAccountId(linkRow.ad_account_id as string);
    const linkId = linkRow.id as string;

    // 3) IDEMPOTÊNCIA: já existe um LOOKALIKE com este nome?
    const { data: existRows, error: existErr } = await admin
      .from("meta_custom_audiences")
      .select("audience_id_meta, name, filters")
      .eq("company_id", companyId)
      .eq("name", finalName);
    if (existErr) return bizErr({ error: "idempotency_check_failed", detail: existErr.message });
    const existing = (existRows ?? []).find(
      (r: any) => (r?.filters?.subtype ?? "").toString().toUpperCase() === "LOOKALIKE"
    );
    if (existing?.audience_id_meta) {
      return json({
        ok: true,
        already_exists: true,
        audience_id_meta: existing.audience_id_meta,
        name: existing.name,
      });
    }

    // 4) Token desencriptado
    const { data: tokRows, error: tokErr } = await admin.rpc("crm_get_meta_decrypted_token", {
      p_connection_id: conn.id, p_master_key: KEY,
    });
    if (tokErr || !Array.isArray(tokRows) || tokRows.length === 0) {
      return bizErr({ error: "token_decrypt_failed", detail: tokErr?.message });
    }
    const token = (tokRows[0] as { access_token: string }).access_token;

    // 5) Cria lookalike no Meta
    const lookalikeSpec = { type: "similarity", ratio, country };
    const form = new URLSearchParams();
    form.set("name", finalName);
    form.set("subtype", "LOOKALIKE");
    form.set("origin_audience_id", sourceId);
    form.set("lookalike_spec", JSON.stringify(lookalikeSpec));
    form.set("access_token", token);

    const createUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/act_${adAccountId}/customaudiences`;
    const resp = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const fbJson: any = await resp.json().catch(() => ({}));
    if (!resp.ok || fbJson?.error || !fbJson?.id) {
      console.log("[create-lookalike] fb_error", JSON.stringify({ http_status: resp.status, fb: fbJson }));
      return bizErr({
        error: "lookalike_falhou",
        detail: fbJson?.error?.message ?? `http_${resp.status}`,
        fb_error: fbJson?.error ?? fbJson ?? null,
      });
    }
    const newIdMeta = String(fbJson.id);

    // 6) Upsert da nova audiência
    const nowIso = new Date().toISOString();
    const filters = {
      subtype: "LOOKALIKE",
      origin_audience_id: sourceId,
      origin_name: srcName,
      ratio,
      country,
      lookalike_spec: lookalikeSpec,
      source: "create_lookalike",
    };
    const row = {
      company_id: companyId,
      connection_id: linkId,
      audience_id_meta: newIdMeta,
      name: finalName,
      description: null,
      filters,
      enabled: true,
      last_synced_at: nowIso,
      last_sync_status: "ok",
      last_sync_error: null,
      total_records_meta: null,
      updated_at: nowIso,
    };
    const { error: upErr } = await admin
      .from("meta_custom_audiences")
      .upsert(row, { onConflict: "company_id,audience_id_meta" });
    if (upErr) {
      // Criada no Meta mas falhou guardar — devolve sucesso com warning
      console.log("[create-lookalike] upsert_failed", newIdMeta, upErr.message);
      return json({
        ok: true,
        created: true,
        audience_id_meta: newIdMeta,
        name: finalName,
        warning: "upsert_failed",
        detail: upErr.message,
      });
    }

    return json({
      ok: true,
      created: true,
      audience_id_meta: newIdMeta,
      name: finalName,
      ratio,
      country,
      origin_audience_id: sourceId,
    });
  } catch (e) {
    return bizErr({ error: "threw", detail: (e as Error).message });
  }
});
