// crm-meta-list-audiences
// Lê o inventário de Custom Audiences da conta Meta e faz upsert em public.meta_custom_audiences.
//
// Input: { company_id }
// Auth: header Authorization obrigatório (verify_jwt=true no gateway), sem getUser().
//
// Espelha o padrão de auth da função crm-meta-upload-creative-v2 (que funciona):
// não chama getUser(); opera via service_role com checagem explícita de company_id.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const BUILD_VERSION = "list-audiences-v2 2026-08-27 (delivery_estimate)";
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
  console.log("[list-audiences] FAIL", JSON.stringify(payload));
  return json({ ok: false, ...payload }, 200);
};

function normalizeAdAccountId(raw: string): string {
  const v = String(raw || "").trim();
  return v.startsWith("act_") ? v.slice(4) : v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Estimativa de alcance mensal (MAU) de uma custom audience via delivery_estimate.
// Os campos approximate_count_* já não são reportados pela Meta para públicos de site/pixel.
async function fetchDeliveryEstimate(adAccountId: string, token: string, audienceId: string) {
  const checkedAt = new Date().toISOString();
  try {
    const targeting = {
      geo_locations: { countries: ["PT"] },
      custom_audiences: [{ id: audienceId }],
    };
    const url =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/act_${adAccountId}/delivery_estimate` +
      `?optimization_goal=REACH&targeting_spec=${encodeURIComponent(JSON.stringify(targeting))}` +
      `&access_token=${encodeURIComponent(token)}`;
    const resp = await fetch(url);
    const j: any = await resp.json().catch(() => ({}));
    if (!resp.ok || j?.error) {
      const msg = j?.error?.message ?? `http_${resp.status}`;
      console.log("[list-audiences] delivery_estimate_error", audienceId, msg);
      return { lower: null, upper: null, checked_at: checkedAt, error: String(msg).slice(0, 300) };
    }
    const d = Array.isArray(j?.data) ? j.data[0] : null;
    const rawLower = d?.estimate_mau_lower_bound ?? d?.estimate_mau ?? null;
    const rawUpper = d?.estimate_mau_upper_bound ?? d?.estimate_mau ?? null;
    const norm = (v: unknown) => {
      const n = typeof v === "number" ? v : (v == null ? NaN : Number(v));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    return { lower: norm(rawLower), upper: norm(rawUpper), checked_at: checkedAt, error: null };
  } catch (e) {
    return { lower: null, upper: null, checked_at: checkedAt, error: (e as Error).message.slice(0, 300) };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 200);

  console.log(`[crm-meta-list-audiences] BUILD_VERSION=${BUILD_VERSION} env url=${!!SUPABASE_URL} srk=${!!SRK} anon=${!!ANON} key=${!!KEY}`);

  // Auth: exige Authorization header presente (gateway já validou JWT com verify_jwt=true).
  // Não chama getUser() — alinhado com crm-meta-upload-creative-v2.
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
    let body: { company_id?: string; only_audience_ids?: string[]; skip_estimates?: boolean } = {};
    try { body = await req.json(); } catch {}
    const companyId = body.company_id;
    const onlyIds = Array.isArray(body.only_audience_ids) ? body.only_audience_ids.map(String) : null;
    const skipEstimates = body.skip_estimates === true;
    const startedAt = Date.now();
    const TIME_BUDGET_MS = 50_000;
    if (!companyId) return bizErr({ error: "missing_params", detail: "company_id" });

    // 1) Conexão Meta ativa
    const { data: conn, error: connErr } = await sbCrm
      .from("ad_platform_connections")
      .select("id")
      .eq("company_id", companyId).eq("platform", "meta").eq("status", "active")
      .maybeSingle();
    if (connErr || !conn?.id) return bizErr({ error: "connection_not_found", detail: connErr?.message });

    // 2) Ad account primário (enabled, ordenado por is_primary desc)
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
    const linkId = linkRow.id as string; // FK alvo de meta_custom_audiences.connection_id

    // 3) Token desencriptado
    const { data: tokRows, error: tokErr } = await admin.rpc("crm_get_meta_decrypted_token", {
      p_connection_id: conn.id, p_master_key: KEY,
    });
    if (tokErr || !Array.isArray(tokRows) || tokRows.length === 0) {
      return bizErr({ error: "token_decrypt_failed", detail: tokErr?.message });
    }
    const token = (tokRows[0] as { access_token: string }).access_token;

    // 4) Graph API: lista custom audiences (paginado, até 5 páginas)
    const fields = [
      "id", "name", "description", "subtype",
      "approximate_count_lower_bound", "approximate_count_upper_bound",
      "delivery_status", "operation_status",
      "retention_days", "data_source", "time_created", "time_updated",
    ].join(",");
    let url: string | null =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/act_${adAccountId}/customaudiences` +
      `?fields=${fields}&limit=200&access_token=${encodeURIComponent(token)}`;

    const all: any[] = [];
    for (let page = 0; page < 5 && url; page++) {
      const resp = await fetch(url);
      const j: any = await resp.json().catch(() => ({}));
      if (!resp.ok || j?.error) {
        console.log("[list-audiences] fb_error", JSON.stringify({ http_status: resp.status, fb: j }));
        return bizErr({
          error: "customaudiences_falhou",
          detail: j?.error?.message ?? `http_${resp.status}`,
          fb_error: j?.error ?? null,
        });
      }
      if (Array.isArray(j?.data)) all.push(...j.data);
      url = j?.paging?.next ?? null;
    }

    // 4b) Filters já existentes em BD (para preservar delivery_estimate quando não re-estimamos)
    const prevFilters = new Map<string, any>();
    {
      const { data: prevRows } = await admin
        .from("meta_custom_audiences")
        .select("audience_id_meta, filters")
        .eq("company_id", companyId);
      for (const r of (prevRows ?? []) as any[]) {
        if (r?.audience_id_meta) prevFilters.set(String(r.audience_id_meta), r.filters ?? null);
      }
    }

    // 5) Upsert por audiência (chave: company_id, audience_id_meta)
    const nowIso = new Date().toISOString();
    const out: any[] = [];
    let estimated = 0;
    let estimateErrors = 0;
    let pendingEstimates = 0;

    for (const a of all) {
      const idMeta = a?.id ? String(a.id) : null;
      if (!idMeta) continue;
      const upper = a?.approximate_count_upper_bound;
      const lower = a?.approximate_count_lower_bound;
      const total = (upper ?? lower ?? null) as number | null;

      const prev = prevFilters.get(idMeta);
      let deliveryEstimate: any = (prev && typeof prev === "object") ? (prev.delivery_estimate ?? null) : null;

      const wantEstimate = !skipEstimates && (!onlyIds || onlyIds.includes(idMeta));
      if (wantEstimate) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) {
          pendingEstimates++;
        } else {
          const est = await fetchDeliveryEstimate(adAccountId, token, idMeta);
          deliveryEstimate = est;
          if (est.error) estimateErrors++; else estimated++;
          await sleep(120);
        }
      }

      const filters = {
        subtype: a?.subtype ?? null,
        delivery_status: a?.delivery_status ?? null,
        operation_status: a?.operation_status ?? null,
        retention_days: a?.retention_days ?? null,
        data_source: a?.data_source ?? null,
        time_created: a?.time_created ?? null,
        time_updated: a?.time_updated ?? null,
        approximate_count_lower_bound: lower ?? null,
        approximate_count_upper_bound: upper ?? null,
        delivery_estimate: deliveryEstimate,
        source: "meta_list",
      };

      const row: Record<string, unknown> = {
        company_id: companyId,
        connection_id: linkId,
        audience_id_meta: idMeta,
        name: a?.name ?? "(sem nome)",
        description: a?.description ?? null,
        filters,
        enabled: true,
        last_synced_at: nowIso,
        last_sync_status: "ok",
        last_sync_error: null,
        total_records_meta: total,
        updated_at: nowIso,
      };

      const { error: upErr } = await admin
        .from("meta_custom_audiences")
        .upsert(row, { onConflict: "company_id,audience_id_meta" });
      if (upErr) {
        console.log("[list-audiences] upsert_failed", idMeta, upErr.message);
        return bizErr({ error: "upsert_falhou", detail: upErr.message });
      }

      out.push({
        id_meta: idMeta,
        name: a?.name ?? null,
        subtype: a?.subtype ?? null,
        total_records_meta: total,
        delivery_status: a?.delivery_status ?? null,
        delivery_estimate: deliveryEstimate,
      });
    }

    return json({ ok: true, count: out.length, estimated, estimate_errors: estimateErrors, pending_estimates: pendingEstimates, audiences: out });
  } catch (e) {
    return bizErr({ error: "threw", detail: (e as Error).message });
  }
});
