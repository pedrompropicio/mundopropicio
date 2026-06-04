// cache-buster: 2026-06-04
// process-redirect-log — consumidor de public.redirect_log (invocado por cron 1min).
// redirect_click é ANÓNIMO (sem email): só INSERT em public.leads e CAPI
// 'InitiateCheckout' (não-bloqueante). Sem contacts.
//
// Schema real (verificado em Live ukpuhoynrqobqtzdbysp):
//   redirect_log: event_slug(NOT NULL), utm_source/medium/campaign/content,
//     mp_click_id, ip_inet(inet), user_agent, referrer, fbc, fbp,
//     processed, processed_at, created_at
//   leads: company_id(NOT NULL), contact_id, event_id, kind(NOT NULL), source,
//     utm_source/medium/campaign/content, mp_click_id, ip_inet, user_agent, fbc, fbp,
//     meta(jsonb), created_at
//
// verify_jwt = false (config.toml): cron-only, usa SERVICE_ROLE internamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MP_COMPANY_ID = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const BATCH_LIMIT = 50;
const PORTAL_EVENT_URL_BASE = "https://www.mundopropicio.com/eventos/";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function compact<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out as Partial<T>;
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

  const { data: rows, error: selErr } = await supabase
    .from("redirect_log")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (selErr) {
    console.error("[process-redirect-log] select falhou", selErr.message);
    return json({ error: "select_failed", detail: selErr.message }, 500);
  }

  let processed = 0;
  let errors = 0;
  let capi_failures = 0;

  for (const rl of rows ?? []) {
    const nowIso = new Date().toISOString();
    try {
      // a) resolver event_id + pixel via slug (escopado a MP).
      let eventId: string | null = null;
      let pixelId: string | null = null;
      if (rl.event_slug) {
        const { data: ev } = await supabase
          .from("events").select("id, meta_pixel_id")
          .eq("company_id", MP_COMPANY_ID).eq("slug", rl.event_slug).limit(1).maybeSingle();
        if (ev) {
          eventId = ev.id ?? null;
          pixelId = ev.meta_pixel_id ?? null;
        }
      }

      // b) insert lead anónimo kind=redirect_click.
      const leadRow: Record<string, any> = {
        company_id: MP_COMPANY_ID,
        contact_id: null,
        event_id: eventId,
        kind: "redirect_click",
        source: "portal_redirect",
        utm_source: rl.utm_source ?? null,
        utm_medium: rl.utm_medium ?? null,
        utm_campaign: rl.utm_campaign ?? null,
        utm_content: rl.utm_content ?? null,
        mp_click_id: rl.mp_click_id ?? null,
        ip_inet: rl.ip_inet ?? null,
        user_agent: rl.user_agent ?? null,
        fbc: rl.fbc ?? null,
        fbp: rl.fbp ?? null,
      };
      const { data: insertedLead, error: leadErr } = await supabase
        .from("leads").insert(leadRow).select("id").single();
      if (leadErr || !insertedLead) throw new Error(`leads insert: ${leadErr?.message}`);
      const leadId = insertedLead.id;

      // c/d) CAPI 'InitiateCheckout' — só se houver pixel. NÃO bloqueia.
      if (pixelId) {
        const user_data = compact({
          fbc: rl.fbc ?? undefined,
          fbp: rl.fbp ?? undefined,
          client_ip_address: rl.ip_inet ?? undefined,
          client_user_agent: rl.user_agent ?? undefined,
        });
        const capiPayload = {
          pixel_id: pixelId,
          event_name: "InitiateCheckout",
          event_id: leadId,
          event_source_url: PORTAL_EVENT_URL_BASE + rl.event_slug,
          user_data,
          custom_data: {
            content_ids: eventId ? [eventId] : [],
            content_name: "redirect_click",
            content_category: "event",
          },
        };
        try {
          await callCapi(capiPayload);
        } catch (e) {
          capi_failures++;
          console.warn("[process-redirect-log] CAPI falhou (não-bloqueante)", rl.id, String(e));
        }
      }

      // e) marcar processado.
      const { error: markErr } = await supabase
        .from("redirect_log")
        .update({ processed: true, processed_at: nowIso })
        .eq("id", rl.id);
      if (markErr) console.warn("[process-redirect-log] mark processed falhou", rl.id, markErr.message);
      processed++;
    } catch (e) {
      errors++;
      console.error("[process-redirect-log] row falhou", rl.id, String(e));
      // redirect_log não tem processing_error — deixamos processed=false (retry).
    }
  }

  return json({ processed, errors, capi_failures });
});
