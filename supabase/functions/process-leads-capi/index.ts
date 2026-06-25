// cache-buster: 2026-06-25a
// process-leads-capi — wrapper HTTP que invoca a RPC SECURITY DEFINER
// public.process_leads_capi_batch e dispara CAPI 'ViewContent' por cada
// payload retornado. Espelha process-lead-capture: a RPC marca optimisticamente
// (capi_sent_at + capi_status='sent') antes de retornar; esta edge apenas
// faz o POST e loga falhas (não-bloqueante, sem retry — mesmo trade-off).
//
// verify_jwt = false (default Lovable, igual a process-lead-capture): cron-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_LIMIT = 50;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callCapi(pixelId: string, payload: Record<string, any>): Promise<void> {
  const body = {
    pixel_id: pixelId,
    event_name: payload.event_name,
    event_id: payload.event_id,
    event_time: payload.event_time,
    event_source_url: payload.event_source_url,
    user_data: payload.user_data,
    custom_data: payload.custom_data,
  };
  const r = await fetch(`${SUPABASE_URL}/functions/v1/capi-meta-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "apikey": SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`capi-meta-events HTTP ${r.status}`);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("process_leads_capi_batch", {
    p_batch_size: BATCH_LIMIT,
  });

  if (error) {
    console.error("[process-leads-capi] rpc falhou", error.message);
    return json({ error: "rpc_failed", detail: error.message }, 500);
  }

  const items: any[] = Array.isArray(data) ? data : [];
  let processed = 0;
  let capi_failures = 0;

  for (const item of items) {
    processed++;
    const pixelId = item?.pixel_id;
    const payload = item?.payload;
    if (!pixelId || !payload) continue;
    try {
      await callCapi(String(pixelId), payload);
    } catch (e) {
      capi_failures++;
      console.warn(
        "[process-leads-capi] CAPI falhou (não-bloqueante)",
        "lead_id=", item?.lead_id, String(e),
      );
    }
  }

  return json({ processed, capi_failures });
});
