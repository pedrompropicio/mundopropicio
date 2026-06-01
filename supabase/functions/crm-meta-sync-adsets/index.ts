// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-sync-adsets
// POST { connection_id, ad_account_id, campaign_external_ids?: string[] }
// Sync adsets from Meta Graph into crm.meta_adset_snapshot.
// If campaign_external_ids omitted, syncs adsets for all active-ish campaigns
// (effective_status in ACTIVE/PAUSED/IN_PROCESS/WITH_ISSUES) of that ad account.

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

function parseCents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) ? n : null;
}

const ADSET_FIELDS = [
  "id", "name", "campaign_id", "status", "effective_status",
  "optimization_goal", "billing_event", "bid_strategy", "bid_amount",
  "daily_budget", "lifetime_budget", "budget_remaining",
  "start_time", "end_time",
  "targeting", "attribution_spec", "pacing_type", "learning_stage_info",
  "promoted_object",
].join(",");

interface GraphAdset {
  id: string;
  name?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  bid_amount?: string | number;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  start_time?: string;
  end_time?: string;
  targeting?: any;
  attribution_spec?: any;
  pacing_type?: string[];
  learning_stage_info?: any;
}

async function fetchAllPages(initialUrl: URL, accessToken: string): Promise<GraphAdset[]> {
  const out: GraphAdset[] = [];
  let nextUrl: string | null = initialUrl.toString();
  let safety = 0;
  while (nextUrl && safety < 50) {
    safety++;
    const r = await fetch(nextUrl);
    const j = await r.json();
    if (!r.ok || j.error) {
      throw new Error(j.error?.message ?? `HTTP ${r.status}`);
    }
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
    console.error("[crm-meta-sync-adsets] decrypt failed:", tokenErr);
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as {
    access_token: string;
    company_id: string;
  };

  // Connection currency (cosmetic)
  let currency = "EUR";
  const { data: connRow } = await supabase
    .schema("crm")
    .from("ad_platform_connections")
    .select("selected_ad_account_currency")
    .eq("id", connectionId)
    .maybeSingle();
  if (connRow?.selected_ad_account_currency) currency = connRow.selected_ad_account_currency;

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
      .eq("level", "adsets")
      .maybeSingle();
    lastSyncAt = stateRow?.last_sync_at ?? null;
  }

  // Pull all adsets at the ad account level (Meta filters by parent campaign filter via filtering param).
  // Nota: `adset.updated_time` é filtrável no endpoint /act_X/adsets.
  let adsets: GraphAdset[] = [];
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/adsets`);
    url.searchParams.set("fields", ADSET_FIELDS);
    url.searchParams.set("limit", "100");
    const filtering: any[] = [
      { field: "adset.effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
      { field: "campaign.effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ];
    if (campaignFilter) {
      filtering.push({ field: "campaign.id", operator: "IN", value: campaignFilter });
    }
    if (lastSyncAt) {
      filtering.push({
        field: "adset.updated_time",
        operator: "GREATER_THAN",
        value: Math.floor(new Date(lastSyncAt).getTime() / 1000),
      });
    }
    url.searchParams.set("filtering", JSON.stringify(filtering));
    url.searchParams.set("access_token", accessToken);
    adsets = await fetchAllPages(url, accessToken);
    console.log(`[crm-meta-sync-adsets] mode=${mode} cursor=${lastSyncAt ?? "—"} fetched=${adsets.length}`);
  } catch (e) {
    console.error("[crm-meta-sync-adsets] fetch threw:", e);
    await supabase.schema("crm").from("meta_sync_state").upsert({
      company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "adsets",
      last_error: String(e), last_error_at: new Date().toISOString(),
    }, { onConflict: "company_id,connection_id,ad_account_id,level" });
    return json({ error: "graph_api_error", message: String(e) }, 502);
  }

  const rows = adsets.map((a) => ({
    company_id: companyId,
    connection_id: connectionId,
    ad_account_id: adAccountId,
    external_adset_id: a.id,
    external_campaign_id: a.campaign_id ?? "",
    name: a.name ?? null,
    status: a.status ?? null,
    effective_status: a.effective_status ?? null,
    optimization_goal: a.optimization_goal ?? null,
    billing_event: a.billing_event ?? null,
    bid_strategy: a.bid_strategy ?? null,
    bid_amount_cents: parseCents(a.bid_amount),
    daily_budget_cents: parseCents(a.daily_budget),
    lifetime_budget_cents: parseCents(a.lifetime_budget),
    budget_remaining_cents: parseCents(a.budget_remaining),
    start_time: a.start_time ?? null,
    end_time: a.end_time ?? null,
    targeting: a.targeting ?? null,
    attribution_spec: a.attribution_spec ?? null,
    pacing_type: Array.isArray(a.pacing_type) ? a.pacing_type : null,
    learning_stage_info: a.learning_stage_info ?? null,
    currency,
    raw: a,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error: upErr } = await supabase
      .schema("crm")
      .from("meta_adset_snapshot")
      .upsert(rows, { onConflict: "company_id,external_adset_id" });
    if (upErr) {
      console.error("[crm-meta-sync-adsets] upsert failed:", upErr);
      await supabase.schema("crm").from("meta_sync_state").upsert({
        company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "adsets",
        last_error: upErr.message, last_error_at: new Date().toISOString(),
      }, { onConflict: "company_id,connection_id,ad_account_id,level" });
      return json({ error: "persist_failed", detail: upErr.message }, 500);
    }
  }

  const nowIso = new Date().toISOString();
  const stateUpd: Record<string, unknown> = {
    company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId, level: "adsets",
    last_sync_at: nowIso, last_synced_rows_count: rows.length,
    last_error: null, last_error_at: null,
  };
  if (mode === "full") stateUpd.last_full_sync_at = nowIso;
  await supabase.schema("crm").from("meta_sync_state").upsert(stateUpd, {
    onConflict: "company_id,connection_id,ad_account_id,level",
  });

  return json({ synced_count: rows.length, ad_account_id: adAccountId, mode, incremental_cursor: lastSyncAt });
});
