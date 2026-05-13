// crm-meta-extract-landing-urls
// Extrai URLs de landing a partir de uma campanha Meta ou evento.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

function digFromAdRaw(raw: any): string[] {
  const out: string[] = [];
  if (!raw || typeof raw !== "object") return out;
  const cs = raw.creative ?? {};
  const oss = cs.object_story_spec ?? {};
  const candidates = [
    oss?.link_data?.link,
    oss?.video_data?.call_to_action?.value?.link,
    oss?.template_data?.link,
    cs?.link_url,
    cs?.url_tags,
  ];
  for (const c of candidates) if (isHttpUrl(c)) out.push(c);
  // tracking_specs: array of { uri }
  const ts = raw.tracking_specs;
  if (Array.isArray(ts)) {
    for (const t of ts) if (isHttpUrl(t?.uri)) out.push(t.uri);
  }
  return out;
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

  // EVENT path — sem coluna URL na tabela events
  if (eventId) {
    const { data: ev, error } = await supabase
      .from("events")
      .select("id, name")
      .eq("id", eventId)
      .maybeSingle();
    if (error) return json({ error: "fetch_failed", detail: error.message }, 500);
    if (!ev) return json({ error: "not_found" }, 404);
    return json({
      urls: [],
      primary: null,
      source: "event",
      reason: "events não tem coluna landing_url; cole manualmente",
    });
  }

  // CAMPAIGN path
  // 1) ads activos da campanha
  const { data: ads, error: adsErr } = await (supabase as any)
    .schema("crm")
    .from("meta_ad_snapshot")
    .select("external_ad_id, meta_creative_id, effective_status, status, tracking_specs, raw")
    .eq("external_campaign_id", campaignId);

  if (adsErr) return json({ error: "ads_query_failed", detail: adsErr.message }, 500);

  const collected: string[] = [];
  const creativeIds = new Set<string>();
  for (const ad of ads ?? []) {
    if (ad.meta_creative_id) creativeIds.add(ad.meta_creative_id);
    // fallback raw + tracking_specs
    collected.push(...digFromAdRaw({ creative: ad.raw?.creative, tracking_specs: ad.tracking_specs ?? ad.raw?.tracking_specs }));
  }

  // 2) JOIN com meta_creatives para link_url
  if (creativeIds.size > 0) {
    const { data: creatives } = await (supabase as any)
      .schema("crm")
      .from("meta_creatives")
      .select("meta_creative_id, link_url")
      .in("meta_creative_id", [...creativeIds]);
    for (const c of creatives ?? []) {
      if (isHttpUrl(c.link_url)) collected.push(c.link_url);
    }
  }

  const unique = [...new Set(collected)];
  return json({
    urls: unique,
    primary: rankPrimary(collected),
    source: "campaign",
    counts: { ads: ads?.length ?? 0, creatives_resolved: creativeIds.size },
  });
});
