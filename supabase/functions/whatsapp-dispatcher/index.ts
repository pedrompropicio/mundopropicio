// whatsapp-dispatcher — cron 1/min
// Lê notification_queue (status='queued') e envia via Meta WhatsApp Cloud API.
// Atualiza status para sent/failed e regista em notification_log.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_API_VERSION = "v21.0";
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;

interface QueueRow {
  id: string;
  template_id: string;
  recipient_phone: string;
  params: any[];
  attempts: number;
  template?: { meta_template_name: string; language_code: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const phoneNumberId = Deno.env.get("META_WA_PHONE_NUMBER_ID");
  const token = Deno.env.get("META_WA_SYSTEM_TOKEN");
  if (!phoneNumberId || !token) {
    return new Response(JSON.stringify({ error: "Meta WA secrets missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: items, error: selErr } = await supabase
    .from("notification_queue")
    .select("id, template_id, recipient_phone, params, attempts, template:notification_templates(meta_template_name, language_code)")
    .eq("status", "queued")
    .lte("scheduled_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (selErr) {
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of (items ?? []) as QueueRow[]) {
    // Lock: marca sending + incrementa attempts
    const newAttempts = (item.attempts ?? 0) + 1;
    const { error: lockErr } = await supabase
      .from("notification_queue")
      .update({ status: "sending", attempts: newAttempts, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("status", "queued"); // só se ainda estiver queued (idempotência)
    if (lockErr) {
      results.push({ id: item.id, ok: false, error: lockErr.message });
      continue;
    }

    const to = (item.recipient_phone || "").replace(/^\+/, "").replace(/\s+/g, "");
    const parameters = (item.params ?? []).map((p) => ({ type: "text", text: String(p ?? "") }));
    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: item.template?.meta_template_name,
        language: { code: item.template?.language_code || "pt_PT" },
        components: [{ type: "body", parameters }],
      },
    };

    try {
      const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const metaMsgId = data?.messages?.[0]?.id ?? null;
        await supabase.from("notification_queue").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          meta_message_id: metaMsgId,
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        await supabase.from("notification_log").insert({
          queue_id: item.id, event_type: "sent", payload: { meta_message_id: metaMsgId, response: data },
        });
        results.push({ id: item.id, ok: true });
      } else {
        const errMsg = data?.error?.message ?? `HTTP ${res.status}`;
        const finalFail = newAttempts >= MAX_ATTEMPTS;
        await supabase.from("notification_queue").update({
          status: finalFail ? "failed" : "queued",
          last_error: errMsg,
          failed_at: finalFail ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        await supabase.from("notification_log").insert({
          queue_id: item.id, event_type: "send_error", payload: { http_status: res.status, error: data },
        });
        results.push({ id: item.id, ok: false, error: errMsg });
      }
    } catch (e) {
      const errMsg = (e as Error).message || "fetch failed";
      const finalFail = newAttempts >= MAX_ATTEMPTS;
      await supabase.from("notification_queue").update({
        status: finalFail ? "failed" : "queued",
        last_error: errMsg,
        failed_at: finalFail ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      await supabase.from("notification_log").insert({
        queue_id: item.id, event_type: "exception", payload: { error: errMsg },
      });
      results.push({ id: item.id, ok: false, error: errMsg });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
