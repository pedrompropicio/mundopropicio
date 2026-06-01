// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-sync-ads
// POST { connection_id, ad_account_id, campaign_external_ids?: string[] }
// Sync ads from Meta Graph into crm.meta_ad_snapshot.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeAdAccountId(raw: string): string {
  const c = raw.trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

const AD_FIELDS = [
  "id", "name", "adset_id", "campaign_id", "status", "effective_status",
  "creative", "tracking_specs", "conversion_specs",
  "recommendations", "issues_info", "created_time", "updated_time",
].join(",");

interface GraphAd {
  id: string;
  name?: string;
  adset_id?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  creative?: { id?: string };
  tracking_specs?: any;
  conversion_specs?: any;
  recommendations?: any;
  issues_info?: any;
  created_time?: string;
  updated_time?: string;
}

async function fetchAllPages(initialUrl: URL): Promise<GraphAd[]> {
  const out: GraphAd[] = [];
  let nextUrl: string | null = initialUrl.toString();
  let safety = 0;
  while (nextUrl && safety < 50) {
    safety++;
    const r = await fetch(nextUrl);
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
    if (Array.isArray(j.data)) out.push(...j.data);
    nextUrl = j.paging?.next ?? null;
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; ad_account_id?: string; campaign_external_ids?: string[]; mode?: "incremental" | "full" };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const connectionId = body.connection_id;
  const rawAcct = body.ad_account_id;
  if (!connectionId || !rawAcct) return json({ error: "missing_params" }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);
  const campaignFilter = Array.isArray(body.campaign_external_ids) && body.campaign_external_ids.length > 0
    ? body.campaign_external_ids
    : null;
  const mode: "incremental" | "full" = body?.mode === "full" ? "full" : "incremental";

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[crm-meta-sync-ads] decrypt failed:", tokenErr);
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as {
    access_token: string;
    company_id: string;
  };

  // Read incremental cursor
  let lastSyncAt: string | null = null;
  if (mode === "incremental") {
    const { data: stateRow } = await supabase
      .schema("crm")
      .from("meta_sync_state")
      .select("last_sync_at")
      .eq("company_id", companyId)
      .eq("connection_id", connectionId)
      .eq("ad_account_id", adAccountId)
      .eq("level", "ads")
      .maybeSingle();
    lastSyncAt = stateRow?.last_sync_at ?? null;
  }

  let ads: GraphAd[] = [];
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/ads`);
    url.searchParams.set("fields", AD_FIELDS);
    url.searchParams.set("limit", "100");
    // Nota: `ad.updated_time` é filtrável no endpoint /act_X/ads (operator GREATER_THAN, value=unix-ts em segundos).
    const filtering: any[] = [
      { field: "ad.effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
      { field: "campaign.effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ];
    if (campaignFilter) {
      filtering.push({ field: "campaign.id", operator: "IN", value: campaignFilter });
    }
    if (lastSyncAt) {
      filtering.push({
        field: "ad.updated_time",
        operator: "GREATER_THAN",
        value: Math.floor(new Date(lastSyncAt).getTime() / 1000),
      });
    }
    url.searchParams.set("filtering", JSON.stringify(filtering));
    url.searchParams.set("access_token", accessToken);
    ads = await fetchAllPages(url);
    console.log(`[crm-meta-sync-ads] mode=${mode} cursor=${lastSyncAt ?? "—"} fetched=${ads.length}`);
  } catch (e) {
    console.error("[crm-meta-sync-ads] fetch threw:", e);
    await supabase.schema("crm").from("meta_sync_state").upsert({
      company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "ads",
      last_error: String(e), last_error_at: new Date().toISOString(),
    }, { onConflict: "company_id,connection_id,ad_account_id,level" });
    return json({ error: "graph_api_error", message: String(e) }, 502);
  }

  const rows = ads.map((a) => ({
    company_id: companyId,
    connection_id: connectionId,
    ad_account_id: adAccountId,
    external_ad_id: a.id,
    external_adset_id: a.adset_id ?? "",
    external_campaign_id: a.campaign_id ?? "",
    name: a.name ?? null,
    status: a.status ?? null,
    effective_status: a.effective_status ?? null,
    meta_creative_id: a.creative?.id ?? null,
    tracking_specs: a.tracking_specs ?? null,
    conversion_specs: a.conversion_specs ?? null,
    recommendations: a.recommendations ?? null,
    issues_info: a.issues_info ?? null,
    created_time: a.created_time ?? null,
    updated_time: a.updated_time ?? null,
    raw: a,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const CHUNK = 500;
    const total = rows.length;
    const chunks = Math.ceil(total / CHUNK);
    for (let i = 0; i < total; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const idx = Math.floor(i / CHUNK) + 1;
      const { error: upErr } = await supabase
        .schema("crm")
        .from("meta_ad_snapshot")
        .upsert(slice, { onConflict: "company_id,external_ad_id" });
      if (upErr) {
        console.error(`[crm-meta-sync-ads] upsert chunk ${idx}/${chunks} failed:`, upErr);
        await supabase.schema("crm").from("meta_sync_state").upsert({
          company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "ads",
          last_error: upErr.message, last_error_at: new Date().toISOString(),
        }, { onConflict: "company_id,connection_id,ad_account_id,level" });
        return json({ error: "persist_failed", detail: upErr.message, chunk: idx, total_chunks: chunks }, 500);
      }
      console.log(`[crm-meta-sync-ads] chunk ${idx}/${chunks}: ${slice.length} rows upserted`);
    }
  }

  const nowIso = new Date().toISOString();
  const stateUpd: Record<string, unknown> = {
    company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "ads",
    last_sync_at: nowIso, last_synced_rows_count: rows.length,
    last_error: null, last_error_at: null,
  };
  if (mode === "full") stateUpd.last_full_sync_at = nowIso;
  await supabase.schema("crm").from("meta_sync_state").upsert(stateUpd, {
    onConflict: "company_id,connection_id,ad_account_id,level",
  });

  return json({ synced_count: rows.length, ad_account_id: adAccountId, mode, incremental_cursor: lastSyncAt });
});
