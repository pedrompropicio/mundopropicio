// cache-buster: 2026-08-23-npm-specifier
// process-leads-capi — wrapper HTTP que invoca a RPC SECURITY DEFINER
// public.process_leads_capi_batch e dispara CAPI 'ViewContent' por cada
// payload retornado.
//
// Fluxo em 2 fases (idempotente):
//  1) RPC marca capi_status='processing' (capi_sent_at=now() serve de lock
//     temporal; filtro de seleção é status IN (NULL,'retry') → 'processing'
//     nunca é reapanhado).
//  2) Edge faz POST. Sucesso → status='sent'. Falha transitória → status='retry',
//     capi_sent_at=NULL (volta a ser elegível). Erro definitivo do Meta
//     (subcode 2804050, "dados insuficientes") → status='error_insufficient_data'
//     (final, não retenta).
//
// Throttle: 80ms entre POSTs para não saturar o gateway edge (RateLimitError).
// Loop por invocação com 3 tetos de segurança:
//   (a) batch devolve 0 itens (fila drenada)
//   (b) wall-time ≥ MAX_WALL_MS
//   (c) iterações ≥ MAX_BATCHES
//
// verify_jwt = false (default Lovable): cron-only.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_LIMIT = 25;
const THROTTLE_MS = 80;
const MAX_WALL_MS = 27_000;   // teto de tempo (~27s, bem dentro do limite da edge)
const MAX_BATCHES = 40;       // teto de iterações (40 * 25 = 1000 leads/invocação)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const GRAPH_API_VERSION = "v25.0";

type CapiResult =
  | { ok: true }
  | { ok: false; final: boolean; detail: string };

/** Token CAPI: env primeiro, senão vault via RPC (fetch directo devolve scalar). */
async function loadCapiToken(): Promise<string | null> {
  const envTok = Deno.env.get("META_CAPI_ACCESS_TOKEN");
  if (envTok) return envTok;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_vault_secret`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ _name: "META_CAPI_ACCESS_TOKEN" }),
    });
    const raw = await r.text();
    if (!r.ok || !raw) return null;
    let parsed: any = raw;
    try { parsed = JSON.parse(raw); } catch { /* raw text */ }
    if (Array.isArray(parsed) && parsed.length) return String(parsed[0]);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object" && "get_vault_secret" in parsed) {
      return String(parsed.get_vault_secret);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * POST directo ao Graph da Meta. Antes passava por capi-meta-events
 * (function-to-function), o que batia no rate limit do gateway edge
 * (RateLimitError) e marcava tudo como retry. Padrão igual ao portal_tick_*.
 */
async function callCapi(pixelId: string, payload: Record<string, any>, accessToken: string): Promise<CapiResult> {
  const metaBody = {
    data: [{
      event_name: payload.event_name,
      event_time: payload.event_time ?? Math.floor(Date.now() / 1000),
      event_id: payload.event_id ?? undefined,
      event_source_url: payload.event_source_url ?? undefined,
      action_source: "website",
      user_data: payload.user_data ?? {},
      custom_data: payload.custom_data ?? {},
    }],
    access_token: accessToken,
  };
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metaBody),
    });
    const text = await r.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* não-JSON */ }

    if (r.ok) return { ok: true };

    const metaErr = parsed?.error;
    if (r.status === 400 && metaErr?.error_subcode === 2804050) {
      return { ok: false, final: true, detail: "insufficient_customer_data" };
    }
    return {
      ok: false,
      final: false,
      detail: `meta_status=${r.status} ${metaErr?.message ?? text.slice(0, 200)}`.trim(),
    };
  } catch (e) {
    return { ok: false, final: false, detail: String(e) };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Recuperação de estados intermédios: 'processing' é um lock temporal.
  // Se ficou preso (edge morreu a meio), passados 30 min volta a 'retry'.
  const accessToken = await loadCapiToken();
  if (!accessToken) return json({ error: "missing_capi_token" }, 500);

  let recovered_stale = 0;
  {
    const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: stale, error: staleErr } = await supabase
      .from("leads")
      .update({ capi_status: "retry", capi_sent_at: null })
      .eq("capi_status", "processing")
      .lt("capi_sent_at", cutoff)
      .select("id");
    if (staleErr) console.warn("[process-leads-capi] recover stale falhou", staleErr.message);
    else recovered_stale = stale?.length ?? 0;
    if (recovered_stale > 0) console.log("[process-leads-capi] recuperados de processing:", recovered_stale);
  }

  const t0 = Date.now();
  let batches = 0;
  let processed = 0;
  let sent = 0;
  let retried = 0;
  let failed_final = 0;
  let stop_reason: "drained" | "wall_time" | "max_batches" | "rpc_error" = "drained";

  while (true) {
    if (batches >= MAX_BATCHES) { stop_reason = "max_batches"; break; }
    if (Date.now() - t0 >= MAX_WALL_MS) { stop_reason = "wall_time"; break; }

    const { data, error } = await supabase.rpc("process_leads_capi_batch", {
      p_batch_size: BATCH_LIMIT,
    });

    if (error) {
      console.error("[process-leads-capi] rpc falhou", error.message);
      stop_reason = "rpc_error";
      return json({
        error: "rpc_failed",
        detail: error.message,
        batches, processed, sent, retried, failed_final,
        wall_ms: Date.now() - t0,
      }, 500);
    }

    const items: any[] = Array.isArray(data) ? data : [];
    batches++;

    if (items.length === 0) { stop_reason = "drained"; break; }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      processed++;
      const leadId = item?.lead_id;
      const pixelId = item?.pixel_id;
      const payload = item?.payload;
      if (!leadId || !pixelId || !payload) continue;

      const res = await callCapi(String(pixelId), payload, accessToken);

      if (res.ok) {
        sent++;
        const { error: upErr } = await supabase
          .from("leads")
          .update({ capi_status: "sent" })
          .eq("id", leadId);
        if (upErr) console.warn("[process-leads-capi] update sent falhou", leadId, upErr.message);
      } else if (res.final) {
        failed_final++;
        const { error: upErr } = await supabase
          .from("leads")
          .update({ capi_status: "error_insufficient_data" })
          .eq("id", leadId);
        if (upErr) console.warn("[process-leads-capi] update error_insufficient_data falhou", leadId, upErr.message);
        console.warn("[process-leads-capi] Meta rejeitou definitivamente", leadId, res.detail);
      } else {
        retried++;
        const { error: upErr } = await supabase
          .from("leads")
          .update({ capi_status: "retry", capi_sent_at: null })
          .eq("id", leadId);
        if (upErr) console.warn("[process-leads-capi] update retry falhou", leadId, upErr.message);
        console.warn("[process-leads-capi] CAPI falhou (retry)", leadId, res.detail);
      }

      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }

    // Throttle pequeno entre batches também
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  return json({
    batches,
    processed,
    sent,
    retried,
    failed_final,
    recovered_stale,
    stop_reason,
    wall_ms: Date.now() - t0,
  });
});
