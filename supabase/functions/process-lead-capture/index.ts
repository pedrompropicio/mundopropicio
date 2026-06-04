// cache-buster: 2026-06-04
// process-lead-capture — consumidor de public.lead_capture (invocado por cron 1min).
// Para cada row não processado: match-or-insert em public.contacts, INSERT em
// public.leads, e dispara CAPI 'Lead' (não-bloqueante) via capi-meta-events.
//
// Schema real (verificado em Live ukpuhoynrqobqtzdbysp):
//   lead_capture: email, phone, name, nationality, consent_email, consent_whatsapp,
//     event_slug, source, utm_source/medium/campaign/content, fbc, fbp, ip_inet(inet),
//     user_agent, raw(jsonb), processed, processed_at, processing_error, created_at
//   contacts: company_id(NOT NULL), email, phone_e164, name, nationality,
//     email_hash_sha256, phone_hash_sha256, consent_email, consent_whatsapp,
//     consent_email_at, consent_whatsapp_at, is_active, source, first_seen_at,
//     last_activity_at, created_at, updated_at
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

// Constante MP (Mundo Propício) — company_id explícito nas tabelas multi-tenant.
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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Remove chaves undefined/null/'' de um objeto raso (para user_data Meta).
function compact<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

// Dispara CAPI via capi-meta-events (HTTP). Lança em falha (caller trata como não-bloqueante).
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
    .from("lead_capture")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);


  if (selErr) {
    console.error("[process-lead-capture] select falhou", selErr.message);
    return json({ error: "select_failed", detail: selErr.message }, 500);
  }

  let processed = 0;
  let errors = 0;
  let capi_failures = 0;

  for (const lc of rows ?? []) {
    const nowIso = new Date().toISOString();
    const email = typeof lc.email === "string" && lc.email.trim() ? lc.email.trim().toLowerCase() : null;
    const phone = typeof lc.phone === "string" && lc.phone.trim() ? lc.phone.trim() : null;
    const emailHash = email ? await sha256Hex(email) : null;
    // Hash do telefone para Meta: só dígitos (remove +, espaços, símbolos).
    const phoneDigits = phone ? phone.replace(/[^0-9]/g, "") : "";
    const phoneHash = phoneDigits ? await sha256Hex(phoneDigits) : null;

    try {
      // a/b) match contact: 1º por email, depois por phone_e164.
      let contact: any = null;
      if (email) {
        const { data } = await supabase
          .from("contacts").select("*")
          .eq("company_id", MP_COMPANY_ID).eq("email", email).limit(1).maybeSingle();
        contact = data ?? null;
      }
      if (!contact && phone) {
        const { data } = await supabase
          .from("contacts").select("*")
          .eq("company_id", MP_COMPANY_ID).eq("phone_e164", phone).limit(1).maybeSingle();
        contact = data ?? null;
      }

      let contactId: string;
      if (contact) {
        // c) merge: preencher NULLs, consent OR, consent_at na transição false->true.
        const upd: Record<string, any> = {
          email: contact.email ?? email,
          phone_e164: contact.phone_e164 ?? phone,
          name: contact.name ?? (lc.name ?? null),
          nationality: contact.nationality ?? (lc.nationality ?? null),
          email_hash_sha256: contact.email_hash_sha256 ?? emailHash,
          phone_hash_sha256: contact.phone_hash_sha256 ?? phoneHash,
          source: contact.source ?? (lc.source ?? "portal_newsletter"),
          consent_email: contact.consent_email || !!lc.consent_email,
          consent_whatsapp: contact.consent_whatsapp || !!lc.consent_whatsapp,
          consent_email_at: (contact.consent_email || lc.consent_email)
            ? (contact.consent_email_at ?? nowIso)
            : null,
          consent_whatsapp_at: (contact.consent_whatsapp || lc.consent_whatsapp)
            ? (contact.consent_whatsapp_at ?? nowIso)
            : null,
          last_activity_at: nowIso,
          updated_at: nowIso,
        };
        const { error: updErr } = await supabase
          .from("contacts").update(upd).eq("id", contact.id);
        if (updErr) throw new Error(`contacts update: ${updErr.message}`);
        contactId = contact.id;
      } else {
        // d) insert novo contact com company_id MP explícito.
        const ins: Record<string, any> = {
          company_id: MP_COMPANY_ID,
          email,
          phone_e164: phone,
          name: lc.name ?? null,
          nationality: lc.nationality ?? null,
          email_hash_sha256: emailHash,
          phone_hash_sha256: phoneHash,
          consent_email: !!lc.consent_email,
          consent_whatsapp: !!lc.consent_whatsapp,
          consent_email_at: lc.consent_email ? nowIso : null,
          consent_whatsapp_at: lc.consent_whatsapp ? nowIso : null,
          source: lc.source ?? "portal_newsletter",
          last_activity_at: nowIso,
        };
        const { data: insertedContact, error: insErr } = await supabase
          .from("contacts").insert(ins).select("id").single();
        if (insErr || !insertedContact) throw new Error(`contacts insert: ${insErr?.message}`);
        contactId = insertedContact.id;
      }

      // resolver event_id + pixel via slug (escopado a MP).
      let eventId: string | null = null;
      let pixelId: string | null = null;
      if (lc.event_slug) {
        const { data: ev } = await supabase
          .from("events").select("id, meta_pixel_id")
          .eq("company_id", MP_COMPANY_ID).eq("slug", lc.event_slug).limit(1).maybeSingle();
        if (ev) {
          eventId = ev.id ?? null;
          pixelId = ev.meta_pixel_id ?? null;
        }
      }

      // e) insert lead.
      const leadRow: Record<string, any> = {
        company_id: MP_COMPANY_ID,
        contact_id: contactId,
        event_id: eventId,
        kind: lc.event_slug ? "event_interest" : "newsletter_signup",
        source: lc.source ?? null,
        utm_source: lc.utm_source ?? null,
        utm_medium: lc.utm_medium ?? null,
        utm_campaign: lc.utm_campaign ?? null,
        utm_content: lc.utm_content ?? null,
        ip_inet: lc.ip_inet ?? null,
        user_agent: lc.user_agent ?? null,
        fbc: lc.fbc ?? null,
        fbp: lc.fbp ?? null,
      };
      const { data: insertedLead, error: leadErr } = await supabase
        .from("leads").insert(leadRow).select("id").single();
      if (leadErr || !insertedLead) throw new Error(`leads insert: ${leadErr?.message}`);
      const leadId = insertedLead.id;

      // f/g) CAPI 'Lead' — só se houver pixel. NÃO bloqueia o processamento.
      if (pixelId) {
        const user_data = compact({
          em: emailHash ? [emailHash] : undefined,
          ph: phoneHash ? [phoneHash] : undefined,
          fbc: lc.fbc ?? undefined,
          fbp: lc.fbp ?? undefined,
          client_ip_address: lc.ip_inet ?? undefined,
          client_user_agent: lc.user_agent ?? undefined,
        });
        const capiPayload = {
          pixel_id: pixelId,
          event_name: "Lead",
          event_id: leadId,
          event_source_url: PORTAL_EVENT_URL_BASE + lc.event_slug,
          user_data,
          custom_data: {
            content_ids: eventId ? [eventId] : [],
            content_name: "event_interest",
            content_category: "event",
          },
        };
        try {
          await callCapi(capiPayload);
        } catch (e) {
          capi_failures++;
          console.warn("[process-lead-capture] CAPI falhou (não-bloqueante)", lc.id, String(e));
        }
      }

      // h) marcar processado (sucesso de b-e). CAPI failure NÃO marca error.
      const { error: markErr } = await supabase
        .from("lead_capture")
        .update({ processed: true, processed_at: nowIso, processing_error: null })
        .eq("id", lc.id);
      if (markErr) console.warn("[process-lead-capture] mark processed falhou", lc.id, markErr.message);
      processed++;
    } catch (e) {
      // Falha em b-e: regista processing_error e DEIXA processed=false (retry no próximo cron).
      errors++;
      console.error("[process-lead-capture] row falhou", lc.id, String(e));
      await supabase
        .from("lead_capture")
        .update({ processing_error: String(e).slice(0, 500) })
        .eq("id", lc.id);
    }
  }

  return json({ processed, errors, capi_failures, debug, selectDebug });
});
