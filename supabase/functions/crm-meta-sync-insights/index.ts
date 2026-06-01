// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-sync-insights
// POST { connection_id, ad_account_id, days_back?, levels? }
// levels?: ("campaign"|"adset"|"ad")[]   default ["campaign"] (back-compat)
// Pulls per-day per-{level} insights from Meta Graph and upserts into the
// matching crm.meta_{level}_insights_daily table.

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

// Apenas omni_purchase: já desduplicado entre Pixel + CAPI + offline + WhatsApp + etc.
// Fallback a "purchase" se omni_purchase não existir. Nunca somar ambos.
function sumPurchaseActions(arr: ActionItem[] | undefined): number {
  if (!Array.isArray(arr)) return 0;
  const omni = arr.find((a) => a.action_type === "omni_purchase");
  if (omni) return parseInt(omni.value, 10) || 0;
  const std = arr.find((a) => a.action_type === "purchase");
  return std ? parseInt(std.value, 10) || 0 : 0;
}
function sumPurchaseValues(arr: ActionItem[] | undefined): number {
  if (!Array.isArray(arr)) return 0;
  const omni = arr.find((a) => a.action_type === "omni_purchase");
  if (omni) return parseFloat(omni.value) || 0;
  const std = arr.find((a) => a.action_type === "purchase");
  return std ? parseFloat(std.value) || 0 : 0;
}
const LEAD_TYPES = new Set(["lead", "omni_lead"]);
const ATC_TYPES = new Set(["add_to_cart", "omni_add_to_cart"]);
const IC_TYPES = new Set(["initiate_checkout", "omni_initiated_checkout"]);
const VC_TYPES = new Set(["view_content", "omni_view_content"]);

interface ActionItem { action_type: string; value: string; }

function sumActions(arr: ActionItem[] | undefined, set: Set<string>): number {
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (const a of arr) if (set.has(a.action_type)) s += parseInt(a.value, 10) || 0;
  return s;
}

async function fetchAllInsightsPages(initialUrl: URL): Promise<any[]> {
  const out: any[] = [];
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

type Level = "campaign" | "adset" | "ad";

const COMMON_FIELDS =
  "impressions,reach,frequency,clicks,unique_clicks,spend,cpc,cpm,cpp,ctr,unique_ctr,actions,action_values,account_currency";

function fieldsForLevel(level: Level): string {
  switch (level) {
    case "campaign":
      return `campaign_id,campaign_name,${COMMON_FIELDS}`;
    case "adset":
      return `adset_id,adset_name,campaign_id,campaign_name,${COMMON_FIELDS}`;
    case "ad":
      return `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${COMMON_FIELDS}`;
  }
}

function tableForLevel(level: Level): string {
  return level === "campaign"
    ? "meta_campaign_insights_daily"
    : level === "adset"
    ? "meta_adset_insights_daily"
    : "meta_ad_insights_daily";
}

function conflictForLevel(level: Level): string {
  return level === "campaign"
    ? "connection_id,external_campaign_id,date_start"
    : level === "adset"
    ? "company_id,external_adset_id,date_start"
    : "company_id,external_ad_id,date_start";
}

function rowFromItem(it: any, level: Level, ctx: { companyId: string; connectionId: string; adAccountId: string }) {
  const purchasesCount = sumPurchaseActions(it.actions);
  const purchasesValue = sumPurchaseValues(it.action_values);
  const purchasesValueCents = Math.round(purchasesValue * 100);
  const spendCents = Math.round((parseFloat(it.spend) || 0) * 100);
  const ctrPct = parseFloat(it.ctr);
  const uctrPct = parseFloat(it.unique_ctr);
  const roas = purchasesValueCents > 0 && spendCents > 0 ? purchasesValueCents / spendCents : null;
  const base: Record<string, unknown> = {
    company_id: ctx.companyId,
    connection_id: ctx.connectionId,
    ad_account_id: ctx.adAccountId,
    date_start: it.date_start,
    date_stop: it.date_stop || it.date_start,
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
  if (level === "campaign") {
    base.external_campaign_id = it.campaign_id;
    base.campaign_name = it.campaign_name || null;
  } else if (level === "adset") {
    base.external_adset_id = it.adset_id;
    base.external_campaign_id = it.campaign_id || null;
    base.adset_name = it.adset_name || null;
    base.campaign_name = it.campaign_name || null;
    base.updated_at = new Date().toISOString();
  } else {
    base.external_ad_id = it.ad_id;
    base.external_adset_id = it.adset_id || null;
    base.external_campaign_id = it.campaign_id || null;
    base.ad_name = it.ad_name || null;
    base.adset_name = it.adset_name || null;
    base.campaign_name = it.campaign_name || null;
    base.updated_at = new Date().toISOString();
  }
  return base;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; ad_account_id?: string; days_back?: number; levels?: Level[]; mode?: "incremental" | "full" };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const connectionId = body.connection_id;
  const rawAcct = body.ad_account_id;
  const mode: "incremental" | "full" = body?.mode === "full" ? "full" : "incremental";
  // Em incremental, força janela curta (Meta só reconcilia retroactivamente até ~72h).
  const requestedDaysBack = Math.min(Math.max(body.days_back ?? 30, 1), 90);
  const daysBack = mode === "incremental" ? Math.min(requestedDaysBack, 3) : requestedDaysBack;
  if (!connectionId || !rawAcct) return json({ error: "missing_params" }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);
  const validLevels: Level[] = ["campaign", "adset", "ad"];
  const levels: Level[] = (Array.isArray(body.levels) && body.levels.length > 0
    ? body.levels.filter((l): l is Level => validLevels.includes(l as Level))
    : ["campaign"]);

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
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as {
    access_token: string;
    company_id: string;
  };

  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - daysBack);
  const timeRange = JSON.stringify({ since: ymd(since), until: ymd(today) });
  const ctx = { companyId, connectionId, adAccountId };

  const perLevel: Record<string, { fetched: number; persisted: number; error?: string }> = {};
  let totalRows = 0;

  for (const level of levels) {
    try {
      const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`);
      url.searchParams.set("level", level);
      url.searchParams.set("fields", fieldsForLevel(level));
      url.searchParams.set("time_range", timeRange);
      url.searchParams.set("time_increment", "1");
      url.searchParams.set("limit", "500");
      url.searchParams.set("access_token", accessToken);

      const items = await fetchAllInsightsPages(url);
      console.log(`[crm-meta-sync-insights] level=${level} fetched=${items.length}`);
      const rows = items.map((it) => rowFromItem(it, level, ctx));

      let persisted = 0;
      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .schema("crm")
          .from(tableForLevel(level))
          .upsert(rows, { onConflict: conflictForLevel(level) });
        if (upErr) {
          console.error(`[crm-meta-sync-insights] upsert ${level} failed:`, upErr);
          perLevel[level] = { fetched: items.length, persisted: 0, error: upErr.message };
          await supabase.schema("crm").from("meta_sync_state").upsert({
            company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId,
            level: `insights_${level}`,
            last_error: upErr.message, last_error_at: new Date().toISOString(),
          }, { onConflict: "company_id,connection_id,ad_account_id,level" });
          continue;
        }
        persisted = rows.length;
        totalRows += rows.length;
      }
      perLevel[level] = { fetched: items.length, persisted };

      // Update sync_state for this insights level
      const nowIso = new Date().toISOString();
      const stateUpd: Record<string, unknown> = {
        company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId,
        level: `insights_${level}`,
        last_sync_at: nowIso, last_synced_rows_count: persisted,
        last_cursor_value: ymd(since),
        last_error: null, last_error_at: null,
      };
      if (mode === "full") stateUpd.last_full_sync_at = nowIso;
      await supabase.schema("crm").from("meta_sync_state").upsert(stateUpd, {
        onConflict: "company_id,connection_id,ad_account_id,level",
      });
    } catch (e) {
      console.error(`[crm-meta-sync-insights] level=${level} threw:`, e);
      perLevel[level] = { fetched: 0, persisted: 0, error: String(e) };
      await supabase.schema("crm").from("meta_sync_state").upsert({
        company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId,
        level: `insights_${level}`,
        last_error: String(e), last_error_at: new Date().toISOString(),
      }, { onConflict: "company_id,connection_id,ad_account_id,level" });
    }
  }

  return json({
    synced_rows: totalRows,
    days_back: daysBack,
    requested_days_back: requestedDaysBack,
    mode,
    levels,
    per_level: perLevel,
    ad_account_id: adAccountId,
  });
});
