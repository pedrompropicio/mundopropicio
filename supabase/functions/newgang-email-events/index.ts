// Webhook Resend (Clube Newgang): grava só aberturas/cliques, sem email nem URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseResendEvent, verifySvix } from "./svix.ts";

const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET_NEWGANG");
  if (!secret) return json({ error: "not_configured" }, 503);
  const body = await req.text();
  const id = req.headers.get("svix-id");
  const ok = await verifySvix(secret, id, req.headers.get("svix-timestamp"), req.headers.get("svix-signature"), body);
  if (!ok) return json({ error: "invalid_signature" }, 401);
  let parsed;
  try { parsed = parseResendEvent(JSON.parse(body)); } catch { return json({ error: "invalid_json" }, 400); }
  if (!parsed) return json({ ignored: true });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await sb.from("club_email_events")
    .upsert({ provider_event_id: id, ...parsed }, { onConflict: "provider_event_id", ignoreDuplicates: true });
  if (error) { console.error("insert_failed", error.code); return json({ error: "insert_failed" }, 500); }
  return json({ ok: true });
});
