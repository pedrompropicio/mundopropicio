// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-sync-insights
// POST { connection_id, ad_account_id, days_back?, levels? }
// levels?: ("campaign"|"adset"|"ad")[]   default ["campaign"] (back-compat)
// Pulls per-day per-{level} insights from Meta Graph and upserts into the
// matching crm.meta_{level}_insights_daily table.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import {
  reportMetaSyncFailure,
  reportMetaSyncSuccess,
} from "../_shared/meta-connection-health.ts";
import {
  finishSyncRun,
  resolveStatus,
  startSyncRun,
} from "../_shared/sync-run.ts";

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

// NB: `actions` fica só em COMMON_FIELDS — repetido aqui a Meta rejeita o pedido
// ("Field actions specified more than once").
const VIDEO_FIELDS =
  "video_play_actions,video_thruplay_watched_actions,video_p25_watched_actions," +
  "video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions," +
  "video_avg_time_watched_actions";

const COMMON_FIELDS =
  "impressions,reach,frequency,clicks,unique_clicks,spend,cpc,cpm,cpp,ctr,unique_ctr,actions,action_values,account_currency," +
  VIDEO_FIELDS;

/**
 * Campos de vídeo do Graph vêm como [{action_type, value}].
 * Ausência de dados ⇒ null (nunca 0): um anúncio de imagem não tem hook rate.
 */
function videoNum(arr: ActionItem[] | undefined, actionType = "video_view"): number | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const hit = arr.find((a) => a.action_type === actionType) ?? arr[0];
  if (!hit) return null;
  const n = parseFloat(hit.value);
  return Number.isFinite(n) ? n : null;
}

/** Visualizações de 3 segundos vêm em `actions` como video_view / omni_video_view. */
function video3sViews(actions: ActionItem[] | undefined): number | null {
  if (!Array.isArray(actions)) return null;
  const hit = actions.find(
    (a) => a.action_type === "video_view" || a.action_type === "omni_video_view",
  );
  if (!hit) return null;
  const n = parseInt(hit.value, 10);
  return Number.isFinite(n) ? n : null;
}


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
    video_plays: videoNum(it.video_play_actions),
    video_3s_views: video3sViews(it.actions),
    video_thruplays: videoNum(it.video_thruplay_watched_actions),
    video_p25_watched: videoNum(it.video_p25_watched_actions),
    video_p50_watched: videoNum(it.video_p50_watched_actions),
    video_p75_watched: videoNum(it.video_p75_watched_actions),
    video_p100_watched: videoNum(it.video_p100_watched_actions),
    video_avg_time_watched_sec: videoNum(it.video_avg_time_watched_actions),

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

// ---------------------------------------------------------------------------
// MODO BREAKDOWNS (D-ERP103) — só corre quando o corpo traz {"breakdowns":true}.
// Alimenta crm.ads_insights_breakdown_daily para ligações de ARTISTA Meta.
// O caminho normal (sem `breakdowns`) não passa por aqui.
// ---------------------------------------------------------------------------

/** Grupos de breakdown aceites pela Graph API em chamadas separadas. */
const BREAKDOWN_GROUPS: Array<{ key: string; params: string[] }> = [
  { key: "region", params: ["region"] },
  { key: "age_gender", params: ["age", "gender"] },
  { key: "publisher_platform", params: ["publisher_platform"] },
  { key: "country", params: ["country"] },
];

const BREAKDOWN_FIELDS =
  "campaign_id,campaign_name,impressions,reach,clicks,spend,actions,account_currency," +
  "video_thruplay_watched_actions";

interface BreakdownRow {
  company_id: string;
  connection_id: string;
  platform: string;
  level: string;
  external_campaign_id: string;
  external_adset_id: string;
  external_ad_id: string;
  campaign_name: string | null;
  date_start: string;
  breakdown: string;
  breakdown_value: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend_cents: number;
  video_thruplays: number | null;
  conversions: number;
  currency: string;
  source: string;
  raw: unknown;
  last_synced_at: string;
}

const BREAKDOWN_CONFLICT =
  "connection_id,platform,level,external_campaign_id,external_adset_id,external_ad_id,date_start,breakdown,breakdown_value";

function num(v: unknown): number {
  const n = parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Constrói as linhas de um grupo de breakdown (inclui derivadas age/gender). */
function breakdownRowsFromItems(
  items: any[],
  groupKey: string,
  ctx: { companyId: string; connectionId: string },
  nowIso: string,
): BreakdownRow[] {
  const out: BreakdownRow[] = [];
  // Para age_gender somamos também 'age' e 'gender' isolados.
  const derived = new Map<string, BreakdownRow>();

  for (const it of items) {
    let breakdown = groupKey;
    let value: string;
    if (groupKey === "age_gender") {
      value = `${it.age ?? "unknown"}|${it.gender ?? "unknown"}`;
    } else if (groupKey === "region") {
      value = String(it.region ?? "unknown");
    } else if (groupKey === "country") {
      value = String(it.country ?? "unknown");
    } else {
      value = String(it.publisher_platform ?? "unknown");
    }

    const row: BreakdownRow = {
      company_id: ctx.companyId,
      connection_id: ctx.connectionId,
      platform: "meta",
      level: "campaign",
      external_campaign_id: String(it.campaign_id ?? ""),
      external_adset_id: "",
      external_ad_id: "",
      campaign_name: it.campaign_name ?? null,
      date_start: it.date_start,
      breakdown,
      breakdown_value: value,
      impressions: num(it.impressions),
      reach: num(it.reach),
      clicks: num(it.clicks),
      spend_cents: Math.round((parseFloat(it.spend) || 0) * 100),
      video_thruplays: videoNum(it.video_thruplay_watched_actions),
      conversions: sumPurchaseActions(it.actions),
      currency: it.account_currency || "EUR",
      source: "platform_api",
      raw: it,
      last_synced_at: nowIso,
    };
    out.push(row);

    if (groupKey === "age_gender") {
      for (const [dim, dimValue] of [
        ["age", String(it.age ?? "unknown")],
        ["gender", String(it.gender ?? "unknown")],
      ] as const) {
        const k = `${dim}|${dimValue}|${row.external_campaign_id}|${row.date_start}`;
        const prev = derived.get(k);
        if (prev) {
          prev.impressions += row.impressions;
          prev.reach += row.reach;
          prev.clicks += row.clicks;
          prev.spend_cents += row.spend_cents;
          prev.conversions += row.conversions;
          if (row.video_thruplays !== null) {
            prev.video_thruplays = (prev.video_thruplays ?? 0) + row.video_thruplays;
          }
        } else {
          derived.set(k, {
            ...row,
            breakdown: dim,
            breakdown_value: dimValue,
            raw: { derived_from: "age_gender", dimension: dim, value: dimValue },
          });
        }
      }
    }
  }
  return [...out, ...derived.values()];
}

async function runBreakdowns(
  supabase: any,
  opts: { days: number; connectionId?: string },
): Promise<Response> {
  const notes: string[] = [];
  const nowIso = new Date().toISOString();
  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - opts.days);
  const timeRange = JSON.stringify({ since: ymd(since), until: ymd(today) });

  let q = supabase
    .schema("crm")
    .from("ad_platform_connections")
    .select("id, company_id, artist_id, selected_ad_account_id")
    .eq("platform", "meta")
    .eq("connection_scope", "artist")
    .eq("status", "active")
    .not("selected_ad_account_id", "is", null);
  if (opts.connectionId) q = q.eq("id", opts.connectionId);

  const { data: conns, error: connErr } = await q;
  if (connErr) return json({ error: "connections_query_failed", detail: connErr.message }, 500);

  const startedMs = Date.now();
  const runId = await startSyncRun(supabase, {
    function_name: "crm-meta-sync-insights:breakdowns",
    trigger_source: "api",
    dry_run: false,
    company_id: (conns ?? [])[0]?.company_id ?? null,
    artist_id: (conns ?? [])[0]?.artist_id ?? null,
  });

  let rowsWritten = 0;
  let apiCalls = 0;
  let errorCount = 0;
  const perConnection: Record<string, Record<string, number | string>> = {};

  for (const c of conns ?? []) {
    const perGroup: Record<string, number | string> = {};
    const { data: tokenRows, error: tokenErr } = await supabase.rpc(
      "crm_get_meta_decrypted_token",
      { p_connection_id: c.id, p_master_key: ENCRYPTION_MASTER_KEY },
    );
    if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
      errorCount++;
      notes.push(`ligação ${c.id}: token indecifrável (${tokenErr?.message ?? "sem linhas"})`);
      perConnection[c.id] = { error: "token" };
      continue;
    }
    const accessToken = (tokenRows[0] as { access_token: string }).access_token;
    const adAccountId = normalizeAdAccountId(String(c.selected_ad_account_id));

    for (const group of BREAKDOWN_GROUPS) {
      try {
        const url = new URL(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`,
        );
        url.searchParams.set("level", "campaign");
        url.searchParams.set("fields", BREAKDOWN_FIELDS);
        url.searchParams.set("breakdowns", group.params.join(","));
        url.searchParams.set("time_range", timeRange);
        url.searchParams.set("time_increment", "1");
        url.searchParams.set("limit", "500");
        url.searchParams.set("access_token", accessToken);

        apiCalls++;
        const items = await fetchAllInsightsPages(url);
        const rows = breakdownRowsFromItems(items, group.key, {
          companyId: c.company_id,
          connectionId: c.id,
        }, nowIso);

        if (rows.length === 0) {
          notes.push(`ligação ${c.id}: breakdown ${group.key} sem resultados`);
          perGroup[group.key] = 0;
          continue;
        }
        const { error: upErr } = await supabase
          .schema("crm")
          .from("ads_insights_breakdown_daily")
          .upsert(rows, { onConflict: BREAKDOWN_CONFLICT });
        if (upErr) {
          errorCount++;
          notes.push(`ligação ${c.id}: upsert ${group.key} falhou (${upErr.message})`);
          perGroup[group.key] = `erro: ${upErr.message}`;
          continue;
        }
        rowsWritten += rows.length;
        perGroup[group.key] = rows.length;
      } catch (e) {
        // Breakdown recusado pela API (combinação inválida, rate limit, etc.):
        // fica em notes e os restantes grupos continuam.
        errorCount++;
        const msg = e instanceof Error ? e.message : String(e);
        notes.push(`ligação ${c.id}: breakdown ${group.key} recusado (${msg})`);
        perGroup[group.key] = `erro: ${msg}`;
      }
    }
    perConnection[c.id] = perGroup;
  }

  await finishSyncRun(supabase, runId, startedMs, {
    status: resolveStatus(rowsWritten, errorCount),
    api_calls: apiCalls,
    rows_written: rowsWritten,
    details: { params: { breakdowns: true, days: opts.days, connection_id: opts.connectionId ?? null }, per_connection: perConnection, notes },
  });

  return json({
    mode: "breakdowns",
    days: opts.days,
    connections: (conns ?? []).length,
    rows_written: rowsWritten,
    api_calls: apiCalls,
    per_connection: perConnection,
    notes,
  });
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
  // Issue #36: saúde da ligação. Só marcamos sucesso se nenhum nível falhou.
  let levelErrors = 0;
  let levelsOk = 0;

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
          levelErrors++;
          await reportMetaSyncFailure(connectionId, `insights_${level}`, { thrown: upErr.message });
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
      levelsOk++;
    } catch (e) {
      console.error(`[crm-meta-sync-insights] level=${level} threw:`, e);
      perLevel[level] = { fetched: 0, persisted: 0, error: String(e) };
      await supabase.schema("crm").from("meta_sync_state").upsert({
        company_id: companyId, connection_id: connectionId, ad_account_id: adAccountId,
        level: `insights_${level}`,
        last_error: String(e), last_error_at: new Date().toISOString(),
      }, { onConflict: "company_id,connection_id,ad_account_id,level" });
      levelErrors++;
      await reportMetaSyncFailure(connectionId, `insights_${level}`, { thrown: e });
    }
  }

  if (levelErrors === 0 && levelsOk > 0) {
    await reportMetaSyncSuccess(connectionId, "insights");
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
