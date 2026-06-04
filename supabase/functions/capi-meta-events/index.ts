// cache-buster: 2026-06-04g
// capi-meta-events — wrapper da Meta Conversions API (CAPI) v25.0.
// Chamada internamente (HTTP) pelos processadores process-lead-capture e
// process-redirect-log. NÃO faz hashing: o user_data já chega hashed/pronto
// de quem chama. Lê o token do Vault via RPC get_vault_secret (Deno.env não
// acede a secrets META_* neste projeto — mesmo padrão do whatsapp-dispatcher).
//
// verify_jwt = false (config.toml): invocada internamente sem JWT do gateway.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAPH_API_VERSION = "v25.0";

const _CAPI_TOKEN_BOOT = Deno.env.get("META_CAPI_ACCESS_TOKEN");
console.log("[capi-meta-events boot] env_token_present:", !!_CAPI_TOKEN_BOOT,
            "env_token_len:", _CAPI_TOKEN_BOOT?.length ?? 0);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Token CAPI: ler do Vault (Deno.env não acede a secrets META_* neste projeto).
  // supabase.rpc() retorna [] silenciosamente neste projeto (PostgREST + sb_secret_* key)
  // → usar fetch directo para receber scalar text puro.
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  let accessToken: string | null = Deno.env.get("META_CAPI_ACCESS_TOKEN") ?? null;
  let diag_rpc_http_status = 0;
  let diag_rpc_body_len = 0;
  let diag_rpc_body_preview = "";

  if (!accessToken) {
    try {
      const rpcUrl = `${supabaseUrl}/rest/v1/rpc/get_vault_secret`;
      const rpcResp = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "apikey": srk,
          "Authorization": `Bearer ${srk}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ _name: "META_CAPI_ACCESS_TOKEN" }),
      });
      diag_rpc_http_status = rpcResp.status;
      const rawText = await rpcResp.text();
      diag_rpc_body_len = rawText.length;
      diag_rpc_body_preview = rawText.slice(0, 80);

      if (rpcResp.ok && rawText) {
        let parsed: any = rawText;
        try { parsed = JSON.parse(rawText); } catch { /* raw text */ }
        if (Array.isArray(parsed) && parsed.length > 0) {
          accessToken = String(parsed[0]);
        } else if (typeof parsed === "string") {
          accessToken = parsed;
        } else if (parsed && typeof parsed === "object" && "get_vault_secret" in parsed) {
          accessToken = String((parsed as any).get_vault_secret);
        }
      }
    } catch (e) {
      diag_rpc_body_preview = `fetch_exception: ${String(e)}`;
    }

    if (!accessToken) {
      return json({
        error: "missing_capi_token",
        diag: {
          srk_present: !!srk,
          srk_len: srk.length,
          srk_prefix: srk.slice(0, 12),
          supabase_url_present: !!supabaseUrl,
          env_token_present: !!Deno.env.get("META_CAPI_ACCESS_TOKEN"),
          rpc_http_status: diag_rpc_http_status,
          rpc_body_len: diag_rpc_body_len,
          rpc_body_preview: diag_rpc_body_preview,
        },
      }, 500);
    }
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
