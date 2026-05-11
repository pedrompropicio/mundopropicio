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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { connection_id?: string; ad_account_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const connectionId = body.connection_id;
  const rawAcct = body.ad_account_id;
  if (!connectionId || !rawAcct) return json({ error: "missing_params" }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: connectionId,
    p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken } = tokenRows[0] as { access_token: string };

  let pixelsList: any[] = [];
  try {
    const pixUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/adspixels`);
    pixUrl.searchParams.set("fields", "id,name,code,creation_time,last_fired_time,can_proxy,is_unavailable,is_created_by_business");
    pixUrl.searchParams.set("access_token", accessToken);
    const r = await fetch(pixUrl);
    const j = await r.json();
    if (!r.ok || j.error) {
      console.error("[pixel-health] pixels list err:", r.status, j.error);
      return json({ error: "graph_api_error", message: j.error?.message ?? `HTTP ${r.status}` }, 502);
    }
    pixelsList = j.data ?? [];
  } catch (e) {
    console.error("[pixel-health] fetch threw:", e);
    return json({ error: "graph_api_unreachable" }, 502);
  }

  const pixelsWithStats = await Promise.all(pixelsList.map(async (pix: any) => {
    let stats: any[] = [];
    let statsError: string | null = null;
    try {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - 7);
      const statsUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pix.id}/stats`);
      statsUrl.searchParams.set("aggregation", "event");
      statsUrl.searchParams.set("start_time", String(Math.floor(since.getTime() / 1000)));
      statsUrl.searchParams.set("end_time", String(Math.floor(Date.now() / 1000)));
      statsUrl.searchParams.set("access_token", accessToken);
      const r = await fetch(statsUrl);
      const j = await r.json();
      if (r.ok && !j.error) {
        stats = j.data ?? [];
      } else {
        statsError = j.error?.message ?? `HTTP ${r.status}`;
      }
    } catch (e: any) {
      statsError = e?.message ?? "fetch_threw";
    }

    const totalEvents = stats.reduce((a, s) => a + (s.count ?? 0), 0);
    const uniqueEvents = stats.reduce((a, s) => a + (s.unique_count ?? 0), 0);
    const eventTypes = stats.map((s: any) => ({
      event: s.event,
      count: s.count ?? 0,
      unique_count: s.unique_count ?? 0,
    })).sort((a: any, b: any) => b.count - a.count);

    const lastFiredAt = pix.last_fired_time ? new Date(pix.last_fired_time) : null;
    const hoursSinceLastFire = lastFiredAt ? (Date.now() - lastFiredAt.getTime()) / (1000 * 60 * 60) : null;

    let healthStatus: "healthy" | "warning" | "critical" | "unknown" = "unknown";
    let healthMessage = "";
    if (pix.is_unavailable) {
      healthStatus = "critical";
      healthMessage = "Pixel marcado como indisponível pela Meta";
    } else if (hoursSinceLastFire === null) {
      healthStatus = "critical";
      healthMessage = "Pixel nunca disparou eventos";
    } else if (hoursSinceLastFire > 24) {
      healthStatus = "critical";
      healthMessage = `Sem eventos há ${Math.round(hoursSinceLastFire)}h`;
    } else if (hoursSinceLastFire > 2) {
      healthStatus = "warning";
      healthMessage = `Último evento há ${Math.round(hoursSinceLastFire)}h`;
    } else if (totalEvents === 0) {
      healthStatus = "warning";
      healthMessage = "Sem eventos nos últimos 7 dias";
    } else {
      healthStatus = "healthy";
      healthMessage = `Pixel ativo · ${totalEvents.toLocaleString("pt-PT")} eventos em 7d`;
    }

    const standardEvents = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase", "Lead", "Search", "CompleteRegistration"];
    const presentEvents = new Set(eventTypes.map((e: any) => e.event));
    const missingStandardEvents = standardEvents.filter(se => !presentEvents.has(se));
    const hasPurchase = presentEvents.has("Purchase");
    const hasFunnel = presentEvents.has("ViewContent") && presentEvents.has("AddToCart") && presentEvents.has("InitiateCheckout") && presentEvents.has("Purchase");

    return {
      id: pix.id,
      name: pix.name,
      is_unavailable: !!pix.is_unavailable,
      can_proxy: !!pix.can_proxy,
      last_fired_time: pix.last_fired_time ?? null,
      hours_since_last_fire: hoursSinceLastFire,
      stats_7d: {
        total_events: totalEvents,
        unique_events: uniqueEvents,
        events_per_day_avg: Math.round(totalEvents / 7),
        event_types: eventTypes,
      },
      health: { status: healthStatus, message: healthMessage },
      coverage: {
        has_purchase: hasPurchase,
        has_full_funnel: hasFunnel,
        missing_standard_events: missingStandardEvents,
        present_events: Array.from(presentEvents),
      },
      stats_error: statsError,
    };
  }));

  return json({
    ad_account_id: adAccountId,
    pixels: pixelsWithStats,
    count: pixelsWithStats.length,
    fetched_at: new Date().toISOString(),
  });
});
