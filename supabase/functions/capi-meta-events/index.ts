// capi-meta-events — wrapper da Meta Conversions API (CAPI) v25.0.
// Chamada internamente (HTTP) pelos processadores process-lead-capture e
// process-redirect-log. NÃO faz hashing: o user_data já chega hashed/pronto
// de quem chama. Lê o token do Vault via env META_CAPI_ACCESS_TOKEN.
//
// verify_jwt = false (config.toml): invocada internamente sem JWT do gateway.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAPH_API_VERSION = "v25.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN");
  if (!accessToken) {
    console.error("[capi-meta-events] META_CAPI_ACCESS_TOKEN ausente no env");
    return json({ error: "missing_capi_token" }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const {
    pixel_id,
    event_name,
    event_id,
    event_source_url,
    user_data,
    custom_data,
    event_time,
  } = body ?? {};

  if (!pixel_id || !event_name) {
    return json({ error: "missing_params", detail: "pixel_id e event_name são obrigatórios" }, 400);
  }

  const metaBody = {
    data: [
      {
        event_name,
        event_time: typeof event_time === "number" ? event_time : Math.floor(Date.now() / 1000),
        event_id: event_id ?? undefined,
        event_source_url: event_source_url ?? undefined,
        action_source: "website",
        user_data: user_data ?? {},
        custom_data: custom_data ?? {},
      },
    ],
    access_token: accessToken,
  };

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixel_id}/events`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metaBody),
    });
    const text = await r.text();
    let metaResponse: any = text;
    try { metaResponse = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }

    console.log("[capi-meta-events]", JSON.stringify({
      pixel_id,
      event_name,
      event_id: event_id ?? null,
      http_status: r.status,
      meta_response: metaResponse,
    }));

    return json({ meta_status: r.status, meta_response: metaResponse }, r.ok ? 200 : 502);
  } catch (e) {
    console.error("[capi-meta-events] fetch threw", String(e));
    return json({ error: "capi_unreachable", detail: String(e) }, 502);
  }
});
