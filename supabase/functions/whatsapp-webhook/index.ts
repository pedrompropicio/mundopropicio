// whatsapp-webhook — recebe statuses (sent/delivered/read/failed) e mensagens
// inbound (para deteção de opt-out STOP/PARAR/SAIR/CANCELAR) da Meta Cloud API.
//
// GET — handshake de verificação Meta.
// POST — eventos. Responde sempre 200 rápido (Meta dá timeout em 20s).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPT_OUT_KEYWORDS = ["STOP", "PARAR", "SAIR", "CANCELAR"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // GET handshake Meta
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    // TEMP: hardcoded verify token — secrets META_WA_* não acessíveis via env (a investigar). Reverter para Deno.env.get quando resolvido.
    const expected = Deno.env.get("META_WA_WEBHOOK_VERIFY_TOKEN") ?? "mpgestao2026webhook";
    console.log("[wh-debug] GET", { mode, hasToken: !!token, hasExpected: !!expected, match: token === expected });
    if (mode === "subscribe" && token && expected && token === expected) {
      return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // ── HMAC-SHA256 signature verification (Meta App Secret)
  // Meta sends X-Hub-Signature-256: sha256=<hex>
  const rawBody = await req.text();
  const appSecret = Deno.env.get("META_APP_SECRET") ?? Deno.env.get("META_WA_APP_SECRET");
  if (!appSecret) {
    console.error("[wh] META_APP_SECRET missing — rejecting unsigned payload");
    return new Response("server misconfigured", { status: 500 });
  }
  const sigHeader = req.headers.get("x-hub-signature-256") ?? "";
  const provided = sigHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!provided || provided.length !== 64) {
    return new Response("forbidden", { status: 403 });
  }
  // Compute expected
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  if (diff !== 0) {
    console.warn("[wh] HMAC mismatch");
    return new Response("forbidden", { status: 403 });
  }

  let body: any = {};
  try { body = JSON.parse(rawBody); } catch (_) { /* fall through */ }

  // Processa de forma defensiva — Meta espera 200 sempre.
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value ?? {};

        // ── STATUSES (delivery receipts)
        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const s of statuses) {
          const metaId = s?.id;
          const status = s?.status; // sent | delivered | read | failed
          if (!metaId || !status) continue;
          const ts = s?.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();
          const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
          if (status === "sent") patch.sent_at = ts;
          if (status === "delivered") patch.delivered_at = ts;
          if (status === "read") patch.read_at = ts;
          if (status === "failed") {
            patch.failed_at = ts;
            patch.last_error = s?.errors?.[0]?.title ?? s?.errors?.[0]?.message ?? "failed";
          }
          const { data: rows } = await supabase
            .from("notification_queue")
            .update(patch)
            .eq("meta_message_id", metaId)
            .select("id");
          const queueId = rows?.[0]?.id ?? null;
          await supabase.from("notification_log").insert({
            queue_id: queueId, event_type: `status_${status}`, payload: s,
          });
        }

        // ── MESSAGES (inbound — opt-out detection)
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const m of messages) {
          const from = m?.from; // E.164 sem '+'
          const text = (m?.text?.body ?? "").trim();
          if (!from || !text) continue;
          const upper = text.toUpperCase();
          const isOptOut = OPT_OUT_KEYWORDS.some((k) => upper.includes(k));
          if (isOptOut) {
            const candidates = ["+" + from, from];
            const { data: matched } = await supabase
              .from("notification_optin")
              .update({ opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .in("phone_number", candidates)
              .select("id");
            await supabase.from("notification_log").insert({
              queue_id: null, event_type: "opt_out_received",
              payload: { from, text, matched_rows: matched?.length ?? 0 },
            });
          } else {
            await supabase.from("notification_log").insert({
              queue_id: null, event_type: "inbound_message", payload: { from, text },
            });
          }
        }
      }
    }
  } catch (e) {
    // Loga mas devolve sempre 200 para a Meta não dar retry agressivo.
    console.error("webhook error", (e as Error).message);
  }

  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
});
