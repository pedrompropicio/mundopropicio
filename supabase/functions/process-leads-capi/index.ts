// process-leads-capi — consumidor ViewContent dos leads (Issue #320 / D-ERP281).
//
// Ordem obrigatória:
//  0) Interruptor persistente public.capi_dispatch_control: suspenso → 423, sem ler token
//     nem tocar na fila. Cobre também invocação directa (verify_jwt=false).
//  1) Recuperação de 'processing' antigo via RPC capi_recover_processing: passa pelas mesmas
//     regras (tipo, prazo, consentimento); nunca reabre às cegas.
//  2) RPC process_leads_capi_batch: já exclui redirect_click, expirados e sem consentimento.
//  3) Imediatamente antes de cada POST: interruptor + regras locais + capi_lead_block_reason
//     no servidor. Qualquer bloqueio → classificação terminal, sem POST.
//  4) Resposta Meta: ok → sent; 100/33 → terminal + alerta persistente (capi_alerts);
//     2804050 → error_insufficient_data; resto → retry.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  classifyMetaResponse,
  consentProof,
  dispatchAllowed,
  localBlockReason,
  suspendedResponse,
  type RpcFn,
} from "../_shared/capi-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_LIMIT = 25;
const THROTTLE_MS = 25;
const MAX_WALL_MS = 27_000;
const MAX_BATCHES = 40;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH_API_VERSION = "v25.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    try { parsed = JSON.parse(raw); } catch { /* raw */ }
    if (Array.isArray(parsed) && parsed.length) return String(parsed[0]);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object" && "get_vault_secret" in parsed) return String(parsed.get_vault_secret);
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rpc: RpcFn = (fn, args) => supabase.rpc(fn, args ?? {}) as any;

  // 0) Suspensão — antes de qualquer outra coisa.
  if (!(await dispatchAllowed(rpc))) return suspendedResponse(corsHeaders);

  // 1) Recuperação sujeita às mesmas regras.
  const { data: recovered, error: recErr } = await rpc("capi_recover_processing", { p_older_than_minutes: 30 });
  if (recErr) console.warn("[process-leads-capi] recover falhou", recErr.message);

  const accessToken = await loadCapiToken();
  if (!accessToken) return json({ error: "missing_capi_token" }, 500);

  const t0 = Date.now();
  let batches = 0, processed = 0, sent = 0, retried = 0, failed_final = 0, blocked = 0, access_errors = 0;
  let stop_reason = "drained";

  while (true) {
    if (batches >= MAX_BATCHES) { stop_reason = "max_batches"; break; }
    if (Date.now() - t0 >= MAX_WALL_MS) { stop_reason = "wall_time"; break; }

    const { data, error } = await rpc("process_leads_capi_batch", { p_batch_size: BATCH_LIMIT });
    if (error) return json({ error: "rpc_failed", detail: error.message }, 500);

    const items: any[] = Array.isArray(data) ? data : [];
    batches++;
    if (items.length === 0) break;

    for (const item of items) {
      processed++;
      const leadId = item?.lead_id;
      const pixelId = item?.pixel_id;
      const payload = item?.payload;
      if (!leadId || !pixelId || !payload) continue;

      // 3) Guardas imediatamente antes do POST.
      const local = localBlockReason({ kind: item.kind, created_at: item.created_at, event_name: payload.event_name });
      const allowed = await dispatchAllowed(rpc);
      const consent = await consentProof(rpc, String(leadId), String(payload.event_name));
      const { data: serverReason } = await rpc("capi_lead_block_reason", { p_lead_id: leadId });
      if (!allowed || local || !consent || serverReason) {
        blocked++;
        await rpc("_capi_classify_lead", { p_lead_id: leadId });
        if (!allowed) { stop_reason = "suspended_mid_run"; break; }
        continue;
      }

      let outcome;
      try {
        const r = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: [{
              event_name: payload.event_name,
              event_time: payload.event_time,
              event_id: payload.event_id ?? undefined,
              event_source_url: payload.event_source_url ?? undefined,
              action_source: "website",
              user_data: payload.user_data ?? {},
              custom_data: payload.custom_data ?? {},
            }],
            access_token: accessToken,
          }),
        });
        const text = await r.text();
        let parsed: unknown = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { /* não-JSON */ }
        outcome = classifyMetaResponse(r.status, parsed);
      } catch (e) {
        outcome = { kind: "transient" as const, detail: String(e) };
      }

      if (outcome.kind === "ok") {
        sent++;
        await supabase.from("leads").update({ capi_status: "sent" }).eq("id", leadId);
      } else if (outcome.kind === "access_100_33") {
        access_errors++;
        await rpc("capi_record_meta_error", {
          p_lead_id: leadId, p_code: 100, p_subcode: 33, p_detail: outcome.detail, p_source: "process-leads-capi",
        });
      } else if (outcome.kind === "insufficient_data") {
        failed_final++;
        await supabase.from("leads").update({ capi_status: "error_insufficient_data" }).eq("id", leadId);
      } else {
        retried++;
        await supabase.from("leads").update({ capi_status: "retry", capi_sent_at: null }).eq("id", leadId);
      }
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
    if (stop_reason === "suspended_mid_run") break;
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  return json({ batches, processed, sent, retried, failed_final, blocked, access_errors, recovered, stop_reason, wall_ms: Date.now() - t0 });
});
