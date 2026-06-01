// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-funnel-breakdown (Fase 5)
// POST { connection_id, level: 'campaign'|'adset'|'ad', external_id, days_back?, breakdown_by: 'placement'|'device'|'platform' }
// Devolve agregação on-demand do funnel por placement/device/platform via Meta Graph API.

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

const ACTION_KEYS = {
  link_click: ["link_click"],
  lpv: ["landing_page_view", "omni_landing_page_view"],
  atc: ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart"],
  ic: ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout"],
  purchase: ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"],
};

function sumActions(actions: any[] | undefined, keys: string[]): number {
  if (!Array.isArray(actions)) return 0;
  let s = 0;
  for (const a of actions) {
    if (keys.includes(a.action_type)) s += Number(a.value ?? 0);
  }
  return s;
}

function sumActionValues(values: any[] | undefined, keys: string[]): number {
  return sumActions(values, keys);
}

function pct(num: number, den: number): number | null {
  if (!den) return null;
  return Number(((num / den) * 100).toFixed(2));
}

function rowKeyAndLabel(r: any, breakdown: string): { key: string; label: string } {
  if (breakdown === "placement") {
    const k = `${r.publisher_platform ?? "?"}::${r.platform_position ?? "?"}`;
    return { key: k, label: `${r.publisher_platform ?? "?"} / ${r.platform_position ?? "?"}` };
  }
  if (breakdown === "device") {
    return { key: r.impression_device ?? "?", label: r.impression_device ?? "desconhecido" };
  }
  return { key: r.publisher_platform ?? "?", label: r.publisher_platform ?? "desconhecido" };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; level?: string; external_id?: string; days_back?: number; breakdown_by?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { connection_id, level, external_id, breakdown_by } = body;
  if (!connection_id || !level || !external_id || !breakdown_by) return json({ error: "missing_params" }, 400);
  if (!["campaign", "adset", "ad"].includes(level)) return json({ error: "invalid_level" }, 400);
  if (!["placement", "device", "platform"].includes(breakdown_by)) return json({ error: "invalid_breakdown" }, 400);
  const daysBack = Math.min(Math.max(body.days_back ?? 30, 1), 90);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: connection_id, p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const accessToken = (tokenRows[0] as any).access_token as string;

  const breakdownsParam =
    breakdown_by === "placement" ? "publisher_platform,platform_position" :
    breakdown_by === "device" ? "impression_device" :
    "publisher_platform";

  const today = new Date();
  const since = new Date(today); since.setUTCDate(since.getUTCDate() - (daysBack - 1));
  const timeRange = JSON.stringify({ since: since.toISOString().slice(0, 10), until: today.toISOString().slice(0, 10) });

  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${external_id}/insights`);
  url.searchParams.set("fields", "impressions,clicks,inline_link_clicks,spend,actions,action_values");
  url.searchParams.set("breakdowns", breakdownsParam);
  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("level", level);
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  const resp = await fetch(url);
  const j = await resp.json();
  if (!resp.ok || j.error) {
    console.error("[funnel-breakdown] meta err", resp.status, j.error);
    return json({ error: "meta_failed", detail: j.error?.message ?? "unknown" }, 502);
  }

  const rows = (j.data ?? []).map((r: any) => {
    const { key, label } = rowKeyAndLabel(r, breakdown_by);
    const spend = Number(r.spend ?? 0);
    const linkClicks = Number(r.inline_link_clicks ?? 0) || sumActions(r.actions, ACTION_KEYS.link_click);
    const lpv = sumActions(r.actions, ACTION_KEYS.lpv);
    const atc = sumActions(r.actions, ACTION_KEYS.atc);
    const ic = sumActions(r.actions, ACTION_KEYS.ic);
    const purchases = sumActions(r.actions, ACTION_KEYS.purchase);
    const revenue = sumActionValues(r.action_values, ACTION_KEYS.purchase);
    return {
      key,
      label,
      spend_eur: Number(spend.toFixed(2)),
      revenue_eur: Number(revenue.toFixed(2)),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      link_clicks: linkClicks,
      lpv,
      atc,
      ic,
      purchases,
      rates: {
        lpv_per_click_pct: pct(lpv, linkClicks),
        atc_per_lpv_pct: pct(atc, lpv),
        ic_per_atc_pct: pct(ic, atc),
        purchase_per_ic_pct: pct(purchases, ic),
        overall_funnel_conversion_pct: pct(purchases, linkClicks),
        roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : null,
      },
    };
  }).sort((a: any, b: any) => b.spend_eur - a.spend_eur);

  return json({
    level,
    external_id,
    breakdown_by,
    days_back: daysBack,
    period: { from: since.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) },
    rows,
  });
});
