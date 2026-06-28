// cache-buster: 2026-06-28-loop
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

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

type CapiResult =
  | { ok: true }
  | { ok: false; final: boolean; detail: string };

async function callCapi(pixelId: string, payload: Record<string, any>): Promise<CapiResult> {
  const body = {
    pixel_id: pixelId,
    event_name: payload.event_name,
    event_id: payload.event_id,
    event_time: payload.event_time,
    event_source_url: payload.event_source_url,
    user_data: payload.user_data,
    custom_data: payload.custom_data,
  };
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/capi-meta-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "apikey": SERVICE_ROLE_KEY,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* não-JSON */ }

    const metaStatus: number | undefined = parsed?.meta_status;
    const metaErr = parsed?.meta_response?.error;

    if (r.ok && typeof metaStatus === "number" && metaStatus >= 200 && metaStatus < 300) {
      return { ok: true };
    }

    if (metaStatus === 400 && metaErr?.error_subcode === 2804050) {
      return { ok: false, final: true, detail: "insufficient_customer_data" };
    }

    return {
      ok: false,
      final: false,
      detail: `edge_http=${r.status} meta_status=${metaStatus ?? "?"} ${metaErr?.message ?? ""}`.trim(),
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

      const res = await callCapi(String(pixelId), payload);

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
    stop_reason,
    wall_ms: Date.now() - t0,
  });
});
