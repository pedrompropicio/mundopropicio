// cache-buster: 2026-06-04c
// process-lead-capture — wrapper HTTP que invoca a RPC SECURITY DEFINER
// public.process_lead_captures_batch e dispara CAPI 'Lead' por cada payload
// retornado. Toda a lógica de bypass-RLS está na RPC; supabase-js só precisa
// de uma chave válida (mesmo que SUPABASE_SERVICE_ROLE_KEY esteja mapeada
// como anon — a SECURITY DEFINER eleva privilégios in-DB).
//
// verify_jwt = false (config.toml): cron-only.

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

async function callCapi(payload: Record<string, any>): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/capi-meta-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "apikey": SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`capi-meta-events HTTP ${r.status}`);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("process_lead_captures_batch", {
    p_batch_size: BATCH_LIMIT,
  });

  if (error) {
    console.error("[process-lead-capture] rpc falhou", error.message);
    return json({ error: "rpc_failed", detail: error.message }, 500);
  }

  const items: any[] = Array.isArray(data) ? data : [];
  let processed = 0;
  let errors = 0;
  let capi_failures = 0;

  for (const item of items) {
    processed++;
    if (item?.skip) {
      if (item.reason === "error") errors++;
      continue;
    }
    try {
      await callCapi(item);
    } catch (e) {
      capi_failures++;
      console.warn("[process-lead-capture] CAPI falhou (não-bloqueante)", String(e));
    }
  }

  return json({ processed, errors, capi_failures });
});
