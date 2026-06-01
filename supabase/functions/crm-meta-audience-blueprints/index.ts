// cold-start trigger: 2026-06-01-v2 secret rotation
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizeAdAccountId(raw: string): string {
  const c = raw.trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumPurchaseActions(arr: any[] | undefined): number {
  if (!Array.isArray(arr)) return 0;
  const omni = arr.find((a) => a.action_type === "omni_purchase");
  if (omni) return parseInt(omni.value, 10) || 0;
  const std = arr.find((a) => a.action_type === "purchase");
  return std ? parseInt(std.value, 10) || 0 : 0;
}
function sumPurchaseValues(arr: any[] | undefined): number {
  if (!Array.isArray(arr)) return 0;
  const omni = arr.find((a) => a.action_type === "omni_purchase");
  if (omni) return parseFloat(omni.value) || 0;
  const std = arr.find((a) => a.action_type === "purchase");
  return std ? parseFloat(std.value) || 0 : 0;
}

function summarizeTargeting(t: any) {
  if (!t) return {};
  const genders = (() => {
    const g = t.genders;
    if (!Array.isArray(g) || g.length === 0) return ["all"];
    const map: any = { 1: "male", 2: "female" };
    return g.map((x: any) => map[x] || String(x));
  })();
  const ageMin = t.age_min ?? null;
  const ageMax = t.age_max ?? null;
  const geo = t.geo_locations || {};
  return {
    age: ageMin && ageMax ? `${ageMin}-${ageMax}` : ageMin ? `${ageMin}+` : "—",
    age_min: ageMin,
    age_max: ageMax,
    genders,
    countries: geo.countries || [],
    cities: (geo.cities || []).map((c: any) => ({ name: c.name, region: c.region, key: c.key })),
    regions: (geo.regions || []).map((r: any) => ({ name: r.name, key: r.key })),
    interests: (t.interests || []).map((i: any) => ({ id: i.id, name: i.name })),
    behaviors: (t.behaviors || []).map((b: any) => ({ id: b.id, name: b.name })),
    custom_audiences: (t.custom_audiences || []).map((c: any) => ({ id: c.id, name: c.name })),
    excluded_custom_audiences: (t.excluded_custom_audiences || []).map((c: any) => ({ id: c.id, name: c.name })),
    flexible_spec: t.flexible_spec || [],
    publisher_platforms: t.publisher_platforms || [],
    device_platforms: t.device_platforms || [],
    advantage_audience: t.targeting_optimization === "expansion_all" || !!t.targeting_automation?.advantage_audience,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; ad_account_id?: string; min_roas?: number; days_back?: number; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const connectionId = body.connection_id;
  const rawAcct = body.ad_account_id;
  if (!connectionId || !rawAcct) return json({ error: "missing_params" }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);
  const minRoas = body.min_roas ?? 3;
  const daysBack = Math.min(Math.max(body.days_back ?? 90, 1), 180);
  const limit = Math.min(Math.max(body.limit ?? 10, 1), 30);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken } = tokenRows[0] as { access_token: string };

  const today = new Date();
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - daysBack);

  // 1. Insights agregados por campanha
  let insights: any[] = [];
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`);
    url.searchParams.set("level", "campaign");
    url.searchParams.set("fields", "campaign_id,campaign_name,spend,actions,action_values,clicks,impressions,reach,frequency,ctr,cpc");
    url.searchParams.set("time_range", JSON.stringify({ since: ymd(since), until: ymd(today) }));
    url.searchParams.set("limit", "500");
    url.searchParams.set("access_token", accessToken);
    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok || j.error) {
      console.error("[blueprints] insights err:", r.status, j.error);
      return json({ error: "graph_api_error", message: j.error?.message ?? `HTTP ${r.status}` }, 502);
    }
    insights = j.data ?? [];
  } catch (e) {
    console.error("[blueprints] insights threw:", e);
    return json({ error: "graph_api_unreachable" }, 502);
  }

  const scored = insights.map((it) => {
    const spend = parseFloat(it.spend) || 0;
    const purchases = sumPurchaseActions(it.actions);
    const revenue = sumPurchaseValues(it.action_values);
    const roas = spend > 0 ? revenue / spend : 0;
    return {
      campaign_id: it.campaign_id,
      campaign_name: it.campaign_name,
      spend_eur: spend,
      revenue_eur: revenue,
      purchases,
      roas,
      ctr: it.ctr ? parseFloat(it.ctr) / 100 : null,
      cpc_eur: it.cpc ? parseFloat(it.cpc) : null,
      frequency: it.frequency ? parseFloat(it.frequency) : null,
    };
  });

  const top = scored
    .filter((c) => c.roas >= minRoas)
    .sort((a, b) => b.roas - a.roas)
    .slice(0, limit);

  // 2. Adsets de cada top campaign
  const blueprints = await Promise.all(top.map(async (c) => {
    let adsets: any[] = [];
    try {
      const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${c.campaign_id}/adsets`);
      u.searchParams.set("fields", "id,name,targeting,daily_budget,lifetime_budget,optimization_goal,billing_event,effective_status");
      u.searchParams.set("limit", "20");
      u.searchParams.set("access_token", accessToken);
      const r = await fetch(u);
      const j = await r.json();
      if (r.ok && !j.error) adsets = j.data ?? [];
    } catch (e) {
      console.error("[blueprints] adsets fetch err campaign", c.campaign_id, e);
    }

    const adsetSummaries = adsets.map((a: any) => ({
      id: a.id,
      name: a.name,
      effective_status: a.effective_status,
      optimization_goal: a.optimization_goal,
      billing_event: a.billing_event,
      daily_budget_eur: a.daily_budget ? parseFloat(a.daily_budget) / 100 : null,
      lifetime_budget_eur: a.lifetime_budget ? parseFloat(a.lifetime_budget) / 100 : null,
      targeting: summarizeTargeting(a.targeting),
      raw_targeting: a.targeting || null,
    }));

    return { ...c, adsets: adsetSummaries };
  }));

  return json({
    blueprints,
    count: blueprints.length,
    period_days: daysBack,
    min_roas: minRoas,
    fetched_at: new Date().toISOString(),
  });
});
