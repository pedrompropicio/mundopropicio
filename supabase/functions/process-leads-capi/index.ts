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
import { classifyMetaResponse, interpretAlertRecorded, interpretDispatchAllowed, interpretGuard, type MetaOutcome } from "../_shared/capi-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_LIMIT = 25;
const THROTTLE_MS = 25;
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

/** POST directo ao Graph. Só chamado após guarda servidor (capi_guard_lead_dispatch). */
async function callCapi(pixelId: string, payload: Record<string, any>, eventTime: number, accessToken: string): Promise<MetaOutcome> {
  const metaBody = {
    data: [{
      event_name: "ViewContent",
      event_time: eventTime,
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
    return classifyMetaResponse(r.status, parsed, text.slice(0, 200));
  } catch (e) {
    return { kind: "transient", detail: String(e) };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // #320: interruptor persistente — também trava invocação directa.
  {
    const { data, error } = await supabase.rpc("capi_dispatch_allowed");
    if (!interpretDispatchAllowed(data, error)) {
      return json({ suspended: true, reason: error ? "dispatch_check_failed" : "capi_dispatch_control" }, 423);
    }
  }

  // Recuperação de 'processing' via RPC (reaplica tipo/prazo/consentimento; nunca contorna).
  const rec = await supabase.rpc("capi_recover_processing", { p_older_than_minutes: 30 });
  if (rec.error) return json({ error: "recover_processing_failed", detail: rec.error.message }, 500);

  const accessToken = await loadCapiToken();
  if (!accessToken) return json({ error: "missing_capi_token" }, 500);

  const t0 = Date.now();
  let batches = 0, processed = 0, sent = 0, retried = 0, failed_final = 0, blocked = 0;
  let meta_access_alerts = 0, alert_failures = 0, status_update_failures = 0;
  let stop_reason: "drained" | "wall_time" | "max_batches" = "drained";

  const setStatus = async (leadId: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("leads").update(patch).eq("id", leadId).eq("capi_status", "processing");
    if (error) { status_update_failures++; console.error("[process-leads-capi] update falhou", leadId, error.message); }
  };

  while (true) {
    if (batches >= MAX_BATCHES) { stop_reason = "max_batches"; break; }
    if (Date.now() - t0 >= MAX_WALL_MS) { stop_reason = "wall_time"; break; }

    const { data, error } = await supabase.rpc("process_leads_capi_batch", { p_batch_size: BATCH_LIMIT });
    if (error) return json({ error: "rpc_failed", detail: error.message, batches, processed, sent }, 500);

    const items: any[] = Array.isArray(data) ? data : [];
    batches++;
    if (items.length === 0) { stop_reason = "drained"; break; }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      processed++;
      const leadId = item?.lead_id;
      const pixelId = item?.pixel_id;
      const payload = item?.payload;
      if (!leadId || !pixelId || !payload) { blocked++; continue; }

      // Guarda servidor imediatamente antes do POST: tipo, prazo, consentimento, suspensão.
      const g = await supabase.rpc("capi_guard_lead_dispatch", { p_lead_id: leadId, p_event_name: "ViewContent" });
      const guard = interpretGuard(g.data, g.error);
      if (!guard.allowed) {
        blocked++;
        await setStatus(leadId, { capi_status: "retry", capi_block_reason: `guard:${guard.reason}` });
        if (guard.reason === "suspended") break;
        continue;
      }

      const res = await callCapi(String(pixelId), payload, guard.event_time!, accessToken);
      if (res.kind === "ok") {
        sent++;
        await setStatus(leadId, { capi_status: "sent" });
      } else if (res.kind === "meta_access") {
        failed_final++;
        const a = await supabase.rpc("capi_record_meta_error", {
          p_lead_id: leadId, p_code: 100, p_subcode: 33, p_detail: res.detail, p_source: "process-leads-capi",
        });
        if (interpretAlertRecorded(a.data, a.error)) meta_access_alerts++;
        else {
          alert_failures++;
          console.error("[process-leads-capi] alerta 100/33 NÃO registado", leadId, a.error?.message ?? "resposta inesperada");
          await setStatus(leadId, { capi_status: "error_meta_access", capi_block_reason: "Meta 100/33 (alerta não registado)" });
        }
      } else if (res.kind === "insufficient") {
        failed_final++;
        await setStatus(leadId, { capi_status: "error_insufficient_data" });
      } else {
        retried++;
        await setStatus(leadId, { capi_status: "retry", capi_sent_at: null });
      }
      if (i < items.length - 1) await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  const body = { batches, processed, sent, retried, failed_final, blocked, meta_access_alerts,
    alert_failures, status_update_failures, recovered: rec.data, stop_reason, wall_ms: Date.now() - t0 };
  return json(body, alert_failures > 0 || status_update_failures > 0 ? 500 : 200);
});
