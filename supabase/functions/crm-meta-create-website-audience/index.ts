// crm-meta-create-website-audience
// Cria uma Custom Audience de SITE/PIXEL (subtype=WEBSITE) baseada em regra
// de evento do pixel (ViewContent [+ opcional content_category]).
//
// Input: { company_id, name, pixel_id, retention_days?=180, content_category?=null }
// Auth: header Authorization obrigatório (verify_jwt=true), sem getUser().
// Espelha o padrão de crm-meta-create-lookalike (token via RPC + ENCRYPTION_MASTER_KEY,
// ad account via crm.ad_platform_connections->ad_platform_account_links,
// persistência em public.meta_custom_audiences com regra dentro de filters jsonb).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const BUILD_VERSION = "create-website-audience-v1 2026-06-25";
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
  console.log("[create-website-audience] FAIL", JSON.stringify(payload));
  return json({ ok: false, ...payload }, 200);
};

function normalizeAdAccountId(raw: string): string {
  const v = String(raw || "").trim();
  return v.startsWith("act_") ? v.slice(4) : v;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 200);

  console.log(`[crm-meta-create-website-audience] BUILD_VERSION=${BUILD_VERSION} env url=${!!SUPABASE_URL} srk=${!!SRK} anon=${!!ANON} key=${!!KEY}`);

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
      name?: string;
      pixel_id?: string;
      retention_days?: number;
      content_category?: string | null;
    } = {};
    try { body = await req.json(); } catch {}

    const companyId = body.company_id;
    const finalName = (body.name ?? "").trim();
    const pixelId = (body.pixel_id ?? "").toString().trim();
    const retentionDays = Number.isFinite(body.retention_days as number)
      ? Math.max(1, Math.min(180, Math.trunc(body.retention_days as number)))
      : 180;
    const contentCategory = body.content_category && String(body.content_category).trim().length > 0
      ? String(body.content_category).trim()
      : null;

    if (!companyId) return bizErr({ error: "missing_params", detail: "company_id" });
    if (!finalName) return bizErr({ error: "missing_params", detail: "name" });
    if (!pixelId || !/^\d+$/.test(pixelId)) {
      return bizErr({ error: "invalid_pixel_id", detail: pixelId });
    }

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

    // 3) IDEMPOTÊNCIA: já existe WEBSITE com este nome?
    const { data: existRows, error: existErr } = await admin
      .from("meta_custom_audiences")
      .select("audience_id_meta, name, filters")
      .eq("company_id", companyId)
      .eq("name", finalName);
    if (existErr) return bizErr({ error: "idempotency_check_failed", detail: existErr.message });
    const existing = (existRows ?? []).find(
      (r: any) => (r?.filters?.subtype ?? "").toString().toUpperCase() === "WEBSITE"
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

    // 5) Monta rule (formato Graph API v21.0 — flexible rule, inclusions/exclusions)
    //    Referência: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences#website
    const filters: any[] = [
      { field: "event", operator: "eq", value: "ViewContent" },
    ];
    if (contentCategory) {
      filters.push({ field: "content_category", operator: "eq", value: contentCategory });
    }
    const rule = {
      inclusions: {
        operator: "or",
        rules: [
          {
            event_sources: [{ type: "pixel", id: pixelId }],
            retention_seconds: retentionDays * 86400,
            filter: {
              operator: "and",
              filters,
            },
          },
        ],
      },
    };

    // 6) Cria a audiência no Meta
    const form = new URLSearchParams();
    form.set("name", finalName);
    form.set("subtype", "WEBSITE");
    form.set("retention_days", String(retentionDays));
    form.set("prefill", "1");
    form.set("rule", JSON.stringify(rule));
    form.set("access_token", token);

    const createUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/act_${adAccountId}/customaudiences`;
    const resp = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const fbJson: any = await resp.json().catch(() => ({}));
    if (!resp.ok || fbJson?.error || !fbJson?.id) {
      console.log("[create-website-audience] fb_error", JSON.stringify({ http_status: resp.status, fb: fbJson }));
      return bizErr({
        error: "website_audience_falhou",
        detail: fbJson?.error?.message ?? `http_${resp.status}`,
        fb_error: fbJson?.error ?? fbJson ?? null,
      });
    }
    const newIdMeta = String(fbJson.id);

    // 7) Persistência em public.meta_custom_audiences
    const nowIso = new Date().toISOString();
    const filtersJson = {
      subtype: "WEBSITE",
      pixel_id: pixelId,
      retention_days: retentionDays,
      content_category: contentCategory,
      rule,
      prefill: true,
      source: "create_website_audience",
    };
    const row = {
      company_id: companyId,
      connection_id: linkId,
      audience_id_meta: newIdMeta,
      name: finalName,
      description: null,
      filters: filtersJson,
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
      console.log("[create-website-audience] upsert_failed", newIdMeta, upErr.message);
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
      pixel_id: pixelId,
      retention_days: retentionDays,
      content_category: contentCategory,
    });
  } catch (e) {
    return bizErr({ error: "threw", detail: (e as Error).message });
  }
});
