// crm-meta-create-purchase-audience
// Cria uma Website Custom Audience baseada em regra de PIXEL para event=Purchase
// e LIGA-A DETERMINISTICAMENTE ao evento via meta_custom_audiences.event_id.
//
// Irmã de crm-meta-create-website-audience (que faz o mesmo para ViewContent).
// Segue o mesmo molde: mesma versão Graph API, mesmo mecanismo de token
// (RPC crm_get_meta_decrypted_token + ENCRYPTION_MASTER_KEY), mesmo subtype/rule.
//
// Input: { event_id (uuid, obrigatório), retention_days?=180, is_primary?=false }
// Auth: header Authorization obrigatório (verify_jwt=true), sem getUser().

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const BUILD_VERSION = "create-purchase-audience-v1 2026-06-28";
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
  console.log("[create-purchase-audience] FAIL", JSON.stringify(payload));
  return json({ ok: false, ...payload }, 200);
};

function normalizeAdAccountId(raw: string): string {
  const v = String(raw || "").trim();
  return v.startsWith("act_") ? v.slice(4) : v;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 200);

  console.log(`[crm-meta-create-purchase-audience] BUILD_VERSION=${BUILD_VERSION} env url=${!!SUPABASE_URL} srk=${!!SRK} anon=${!!ANON} key=${!!KEY}`);

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
      event_id?: string;
      retention_days?: number;
      is_primary?: boolean;
    } = {};
    try { body = await req.json(); } catch {}

    const eventId = (body.event_id ?? "").toString().trim();
    const retentionDays = Number.isFinite(body.retention_days as number)
      ? Math.max(1, Math.min(180, Math.trunc(body.retention_days as number)))
      : 180;
    const isPrimary = Boolean(body.is_primary);

    if (!eventId) return bizErr({ error: "missing_params", detail: "event_id" });

    // 1) Resolve evento (pixel obrigatório + company_id + nome)
    const { data: ev, error: evErr } = await admin
      .from("events")
      .select("id, name, slug, company_id, meta_pixel_id")
      .eq("id", eventId)
      .maybeSingle();
    if (evErr) return bizErr({ error: "event_lookup_failed", detail: evErr.message });
    if (!ev) return bizErr({ error: "event_not_found", detail: eventId });

    const companyId = (ev as any).company_id as string | null;
    const pixelId = String((ev as any).meta_pixel_id ?? "").trim();
    if (!companyId) return bizErr({ error: "event_no_company", detail: eventId });
    if (!pixelId || !/^\d+$/.test(pixelId)) {
      return bizErr({
        error: "event_no_pixel",
        detail: `O evento ${eventId} não tem meta_pixel_id configurado. Preenche em Admin → Eventos → Pixel Meta antes de criar a audiência de compradores.`,
      });
    }

    const eventName = String((ev as any).name ?? "").trim() || (ev as any).slug || eventId;
    const finalName = `[MP][PURCHASE ${retentionDays}D] ${eventName}`;

    // 2) Conexão Meta ativa (mesmo padrão do molde)
    const { data: conn, error: connErr } = await sbCrm
      .from("ad_platform_connections")
      .select("id")
      .eq("company_id", companyId).eq("platform", "meta").eq("status", "active")
      .maybeSingle();
    if (connErr || !conn?.id) return bizErr({ error: "connection_not_found", detail: connErr?.message });

    // 3) Ad account primário
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

    // 4) IDEMPOTÊNCIA: já existe audiência PURCHASE com este nome para o evento?
    const { data: existRows, error: existErr } = await admin
      .from("meta_custom_audiences")
      .select("id, audience_id_meta, name, filters, event_id, is_primary_purchase")
      .eq("company_id", companyId)
      .eq("name", finalName);
    if (existErr) return bizErr({ error: "idempotency_check_failed", detail: existErr.message });
    const existing = (existRows ?? []).find(
      (r: any) =>
        (r?.filters?.subtype ?? "").toString().toUpperCase() === "WEBSITE" &&
        (r?.filters?.event ?? "").toString().toUpperCase() === "PURCHASE",
    );
    if (existing?.audience_id_meta) {
      // Se pediram is_primary, aplica também no caso idempotente
      if (isPrimary && !existing.is_primary_purchase) {
        await unsetPrimaryForEvent(admin, eventId, existing.id);
        const { error: setErr } = await admin
          .from("meta_custom_audiences")
          .update({ is_primary_purchase: true, event_id: eventId })
          .eq("id", existing.id);
        if (setErr) {
          return json({
            ok: true, already_exists: true, audience_id_meta: existing.audience_id_meta,
            name: existing.name, warning: "set_primary_failed", detail: setErr.message,
          });
        }
      }
      return json({
        ok: true,
        already_exists: true,
        audience_id_meta: existing.audience_id_meta,
        name: existing.name,
        event_id: eventId,
        is_primary_purchase: isPrimary || !!existing.is_primary_purchase,
      });
    }

    // 5) Token desencriptado
    const { data: tokRows, error: tokErr } = await admin.rpc("crm_get_meta_decrypted_token", {
      p_connection_id: conn.id, p_master_key: KEY,
    });
    if (tokErr || !Array.isArray(tokRows) || tokRows.length === 0) {
      return bizErr({ error: "token_decrypt_failed", detail: tokErr?.message });
    }
    const token = (tokRows[0] as { access_token: string }).access_token;

    // 6) Rule (formato Graph v21.0 — flexible rule). Idêntica ao molde
    //     ViewContent, mas com event=Purchase.
    const rule = {
      inclusions: {
        operator: "or",
        rules: [
          {
            event_sources: [{ type: "pixel", id: pixelId }],
            retention_seconds: retentionDays * 86400,
            filter: {
              operator: "and",
              filters: [
                { field: "event", operator: "eq", value: "Purchase" },
              ],
            },
          },
        ],
      },
    };

    // 7) Cria a audiência no Meta (mesmo endpoint/parâmetros do molde)
    const form = new URLSearchParams();
    form.set("name", finalName);
    // Sem subtype — Meta v21.0 infere WEBSITE a partir da rule (event_sources=pixel)
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
      console.log("[create-purchase-audience] fb_error", JSON.stringify({ http_status: resp.status, fb: fbJson }));
      return bizErr({
        error: "purchase_audience_falhou",
        detail: fbJson?.error?.message ?? `http_${resp.status}`,
        fb_error: fbJson?.error ?? fbJson ?? null,
      });
    }
    const newIdMeta = String(fbJson.id);

    // 8) Se pediram principal, desmarca anterior do mesmo evento ANTES do upsert
    //     (evita violar uq_meta_custom_audiences_primary_purchase_per_event)
    if (isPrimary) {
      const { error: unsetErr } = await unsetPrimaryForEvent(admin, eventId, null);
      if (unsetErr) {
        // Não bloqueia — só loga; o upsert seguinte pode falhar e devolvemos warning
        console.log("[create-purchase-audience] unset_primary_warning", unsetErr.message);
      }
    }

    // 9) Persistência em public.meta_custom_audiences (com event_id — ponto desta peça)
    const nowIso = new Date().toISOString();
    const filtersJson = {
      subtype: "WEBSITE",
      event: "Purchase",
      pixel_id: pixelId,
      retention_days: retentionDays,
      rule,
      prefill: true,
      source: "mp-purchase",
      origin: "create_purchase_audience",
    };
    const row: any = {
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
      event_id: eventId,
      is_primary_purchase: isPrimary,
    };
    const { error: upErr } = await admin
      .from("meta_custom_audiences")
      .upsert(row, { onConflict: "company_id,audience_id_meta" });
    if (upErr) {
      console.log("[create-purchase-audience] upsert_failed", newIdMeta, upErr.message);
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
      event_id: eventId,
      pixel_id: pixelId,
      retention_days: retentionDays,
      is_primary_purchase: isPrimary,
    });
  } catch (e) {
    return bizErr({ error: "threw", detail: (e as Error).message });
  }
});

// Desmarca a principal anterior do mesmo evento. Se exceptId vier preenchido,
// desmarca todas EXCETO essa (usado no caminho idempotente).
async function unsetPrimaryForEvent(
  admin: ReturnType<typeof createClient>,
  eventId: string,
  exceptId: string | null,
): Promise<{ error: { message: string } | null }> {
  let q = admin
    .from("meta_custom_audiences")
    .update({ is_primary_purchase: false })
    .eq("event_id", eventId)
    .eq("is_primary_purchase", true);
  if (exceptId) q = q.neq("id", exceptId);
  const { error } = await q;
  return { error: error ? { message: error.message } : null };
}
