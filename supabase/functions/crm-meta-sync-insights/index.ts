// crm-meta-sync-insights
// POST { connection_id: string, ad_account_id: string, days_back?: number }
// Pulls per-day per-campaign insights from Meta Graph and upserts into
// crm.meta_campaign_insights_daily.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeAdAccountId(raw: string): string {
  const c = raw.trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PURCHASE_TYPES = new Set([
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
]);
const LEAD_TYPES = new Set(["lead", "omni_lead"]);
const ATC_TYPES = new Set(["add_to_cart", "omni_add_to_cart"]);
const IC_TYPES = new Set(["initiate_checkout", "omni_initiated_checkout"]);
const VC_TYPES = new Set(["view_content", "omni_view_content"]);

interface ActionItem {
  action_type: string;
  value: string;
}

function sumActions(arr: ActionItem[] | undefined, set: Set<string>): number {
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (const a of arr) {
    if (set.has(a.action_type)) s += parseInt(a.value, 10) || 0;
  }
  return s;
}
function sumActionValues(arr: ActionItem[] | undefined, set: Set<string>): number {
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (const a of arr) {
    if (set.has(a.action_type)) s += parseFloat(a.value) || 0;
  }
  return s;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; ad_account_id?: string; days_back?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const connectionId = body.connection_id;
  const rawAcct = body.ad_account_id;
  const daysBack = Math.min(Math.max(body.days_back ?? 30, 1), 90);
  if (!connectionId || !rawAcct) return json({ error: "missing_params" }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[crm-meta-sync-insights] decrypt failed:", tokenErr);
    return json(
      { error: "connection_not_found_or_unauthorised", detail: tokenErr?.message },
      403,
    );
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as {
    access_token: string;
    company_id: string;
  };

  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - daysBack);

  let graphJson: any;
  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`,
    );
    url.searchParams.set("level", "campaign");
    url.searchParams.set(
      "fields",
      "campaign_id,campaign_name,impressions,reach,frequency,clicks,unique_clicks,spend,cpc,cpm,cpp,ctr,unique_ctr,actions,action_values,account_currency",
    );
    url.searchParams.set(
      "time_range",
      JSON.stringify({ since: ymd(since), until: ymd(today) }),
    );
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("limit", "500");
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url);
    graphJson = await res.json();
    if (!res.ok || graphJson.error) {
      console.error(
        "[crm-meta-sync-insights] graph error:",
        res.status,
        graphJson.error,
      );
      return json(
        { error: "graph_api_error", message: graphJson.error?.message ?? `HTTP ${res.status}` },
        502,
      );
    }
  } catch (e) {
    console.error("[crm-meta-sync-insights] fetch threw:", e);
    return json({ error: "graph_api_unreachable" }, 502);
  }

  const items: any[] = graphJson.data ?? [];
  // TODO: pagination via graphJson.paging.next when >500 rows.

  const rows = items.map((it) => {
    const purchasesCount = sumActions(it.actions, PURCHASE_TYPES);
    const purchasesValue = sumActionValues(it.action_values, PURCHASE_TYPES);
    const purchasesValueCents = Math.round(purchasesValue * 100);
    const spendCents = Math.round((parseFloat(it.spend) || 0) * 100);
    const ctrPct = parseFloat(it.ctr);
    const uctrPct = parseFloat(it.unique_ctr);
    const roas =
      purchasesValueCents > 0 && spendCents > 0
        ? purchasesValueCents / spendCents
        : null;
    return {
      company_id: companyId,
      connection_id: connectionId,
      ad_account_id: adAccountId,
      external_campaign_id: it.campaign_id,
      date_start: it.date_start,
      impressions: it.impressions ? parseInt(it.impressions, 10) : null,
      reach: it.reach ? parseInt(it.reach, 10) : null,
      frequency: it.frequency ? parseFloat(it.frequency) : null,
      clicks: it.clicks ? parseInt(it.clicks, 10) : null,
      unique_clicks: it.unique_clicks ? parseInt(it.unique_clicks, 10) : null,
      spend_cents: spendCents,
      cpc_cents: it.cpc ? parseFloat(it.cpc) * 100 : null,
      cpm_cents: it.cpm ? parseFloat(it.cpm) * 100 : null,
      cpp_cents: it.cpp ? parseFloat(it.cpp) * 100 : null,
      ctr: Number.isFinite(ctrPct) ? ctrPct / 100 : null,
      unique_ctr: Number.isFinite(uctrPct) ? uctrPct / 100 : null,
      purchases_count: purchasesCount,
      purchases_value_cents: purchasesValueCents,
      leads_count: sumActions(it.actions, LEAD_TYPES),
      add_to_cart_count: sumActions(it.actions, ATC_TYPES),
      initiate_checkout_count: sumActions(it.actions, IC_TYPES),
      view_content_count: sumActions(it.actions, VC_TYPES),
      roas,
      currency: it.account_currency || "EUR",
      raw: it,
      last_synced_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error: upErr } = await supabase
      .schema("crm")
      .from("meta_campaign_insights_daily")
      .upsert(rows, { onConflict: "connection_id,external_campaign_id,date_start" });
    if (upErr) {
      console.error("[crm-meta-sync-insights] upsert failed:", upErr);
      return json({ error: "persist_failed", detail: upErr.message }, 500);
    }
  }

  return json({
    synced_rows: rows.length,
    days_back: daysBack,
    ad_account_id: adAccountId,
  });
});
