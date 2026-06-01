// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-extract-landing-urls
// Extrai landing URLs de uma campanha Meta (ou retorna vazio se for evento).
// Camada 1 — DB local (meta_creatives.link_url + raw/tracking_specs)
// Camada 2 — Graph API directa (fallback robusto, pede object_story_spec)

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isHttpUrl(s: unknown): s is string {
  if (typeof s !== "string") return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

function pushIfUrl(out: string[], v: unknown) {
  if (isHttpUrl(v)) out.push(v);
}

function digCreative(creative: any, out: string[]) {
  if (!creative || typeof creative !== "object") return;
  pushIfUrl(out, creative.link_url);
  pushIfUrl(out, creative.instagram_permalink_url);
  pushIfUrl(out, creative.link_destination_display_url);
  const oss = creative.object_story_spec ?? {};
  pushIfUrl(out, oss?.link_data?.link);
  pushIfUrl(out, oss?.video_data?.call_to_action?.value?.link);
  pushIfUrl(out, oss?.template_data?.link);
  pushIfUrl(out, oss?.template_data?.call_to_action?.value?.link);
  const attachments = oss?.link_data?.child_attachments;
  if (Array.isArray(attachments)) for (const a of attachments) pushIfUrl(out, a?.link);
  // asset_feed_spec.link_urls: [{ website_url }]
  const lus = creative?.asset_feed_spec?.link_urls;
  if (Array.isArray(lus)) for (const l of lus) pushIfUrl(out, l?.website_url);
}

function digFromAdRow(raw: any, tracking: any, out: string[]) {
  if (raw && typeof raw === "object") digCreative(raw.creative, out);
  const ts = tracking ?? raw?.tracking_specs;
  if (Array.isArray(ts)) for (const t of ts) pushIfUrl(out, t?.uri);
}

function rankPrimary(urls: string[]): string | null {
  if (urls.length === 0) return null;
  const counts = new Map<string, number>();
  for (const u of urls) counts.set(u, (counts.get(u) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { campaign_id?: string; event_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const campaignId = body.campaign_id?.trim();
  const eventId = body.event_id?.trim();
  if (!campaignId && !eventId) return json({ error: "missing_input" }, 400);
  if (campaignId && eventId) return json({ error: "provide_only_one" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ─── EVENT path ─────────────────────────────────────────────
  if (eventId) {
    const { data: ev, error } = await supabase
      .from("events").select("id, name").eq("id", eventId).maybeSingle();
    if (error) return json({ error: "fetch_failed", detail: error.message }, 500);
    if (!ev) return json({ error: "not_found" }, 404);
    return json({
      urls: [], primary: null, source: "event",
      reason: "events não tem coluna landing_url; cole manualmente",
    });
  }

  // ─── CAMPAIGN path ──────────────────────────────────────────
  const { data: campaignRow } = await (supabase as any)
    .schema("crm")
    .from("meta_campaign_snapshot")
    .select("connection_id, company_id")
    .eq("external_campaign_id", campaignId)
    .maybeSingle();

  // Camada 1 — DB local
  const { data: ads, error: adsErr } = await (supabase as any)
    .schema("crm")
    .from("meta_ad_snapshot")
    .select("external_ad_id, meta_creative_id, effective_status, tracking_specs, raw, connection_id")
    .eq("external_campaign_id", campaignId);

  if (adsErr) return json({ error: "ads_query_failed", detail: adsErr.message }, 500);

  const dbUrls: string[] = [];
  const creativeIds = new Set<string>();
  let connectionId: string | null = campaignRow?.connection_id ?? null;

  for (const ad of ads ?? []) {
    if (!connectionId && ad.connection_id) connectionId = ad.connection_id;
    if (ad.meta_creative_id) creativeIds.add(ad.meta_creative_id);
    digFromAdRow(ad.raw, ad.tracking_specs, dbUrls);
  }

  if (creativeIds.size > 0) {
    const { data: creatives } = await (supabase as any)
      .schema("crm")
      .from("meta_creatives")
      .select("meta_creative_id, link_url")
      .in("meta_creative_id", [...creativeIds]);
    for (const c of creatives ?? []) pushIfUrl(dbUrls, c.link_url);
  }

  const dbUnique = [...new Set(dbUrls)];
  console.log(`[extract-urls] camada=DB ads=${ads?.length ?? 0} creatives=${creativeIds.size} urls=${dbUnique.length}`);

  if (dbUnique.length > 0) {
    return json({
      urls: dbUnique,
      primary: rankPrimary(dbUrls),
      source: "campaign",
      layer: "db",
      counts: { ads: ads?.length ?? 0, creatives_resolved: creativeIds.size },
    });
  }

  // Camada 2 — Graph API fallback
  if (!connectionId) {
    const companyId = campaignRow?.company_id ?? (await supabase.rpc("current_company_id")).data;
    if (companyId) {
      const { data: fallbackConn, error: fallbackErr } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select("id")
        .eq("company_id", companyId)
        .eq("platform", "meta")
        .eq("status", "active")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackErr) console.error("[extract-urls] fallback connection erro:", fallbackErr);
      connectionId = fallbackConn?.id ?? null;
    }
    if (!connectionId) {
      console.log("[extract-urls] camada=GraphAPI skip (sem connection_id)");
      return json({ urls: [], primary: null, source: "campaign", layer: "db", reason: "no_connection_id" });
    }
  }

  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[extract-urls] decrypt token falhou:", tokenErr);
    return json({ urls: [], primary: null, source: "campaign", layer: "graph_api", error: "token_decrypt_failed" });
  }
  const accessToken = (tokenRows[0] as any).access_token as string;

  const graphUrls: string[] = [];
  let graphAdsCount = 0;
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${campaignId}/ads`);
    url.searchParams.set(
      "fields",
      "effective_status,creative{link_url,instagram_permalink_url,link_destination_display_url,object_story_spec{link_data{link,child_attachments{link}},video_data{call_to_action{value{link}}},template_data{link,call_to_action{value{link}}}},asset_feed_spec{link_urls{website_url}}}",
    );
    url.searchParams.set(
      "filtering",
      JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] }]),
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url);
    const j = await res.json();
    if (!res.ok || j?.error) {
      console.error("[extract-urls] graph error:", res.status, j?.error);
      return json({ urls: [], primary: null, source: "campaign", layer: "graph_api", error: j?.error?.message ?? `HTTP ${res.status}` });
    }
    const data = (j?.data ?? []) as any[];
    graphAdsCount = data.length;
    for (const ad of data) digCreative(ad.creative, graphUrls);
  } catch (e) {
    console.error("[extract-urls] graph fetch threw:", e);
    return json({ urls: [], primary: null, source: "campaign", layer: "graph_api", error: "fetch_threw" });
  }

  const graphUnique = [...new Set(graphUrls)];
  console.log(`[extract-urls] camada=GraphAPI ads=${graphAdsCount} urls=${graphUnique.length}`);

  return json({
    urls: graphUnique,
    primary: rankPrimary(graphUrls),
    source: "campaign",
    layer: "graph_api",
    counts: { ads_db: ads?.length ?? 0, ads_graph: graphAdsCount },
  });
});
