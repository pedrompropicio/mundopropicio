// Sends WhatsApp reminders for due system_reminders rows.
// Triggered daily by pg_cron at 09:00 Lisbon (08:00 UTC summer / 09:00 UTC winter).
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWhatsApp } from "../_shared/twilio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function todayLisbon(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = todayLisbon();
  const log: Array<Record<string, unknown>> = [];

  try {
    const { data: settings } = await supabase
      .from("system_reminder_settings").select("*").eq("id", 1).maybeSingle();

    const { data: reminders, error } = await supabase
      .from("system_reminders")
      .select("*")
      .eq("is_active", true)
      .is("completed_at", null)
      .lte("due_date", today);

    if (error) throw error;

    for (const r of reminders ?? []) {
      // Frequency gate: only send daily if not already sent today
      if (r.frequency === "daily" && r.last_sent_at) {
        const lastDay = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(r.last_sent_at));
        if (lastDay === today) { log.push({ key: r.key, skipped: "already_sent_today" }); continue; }
      }
      if (r.frequency === "once" && r.send_count > 0) {
        log.push({ key: r.key, skipped: "once_already_sent" }); continue;
      }
      if (r.frequency === "weekly" && r.last_sent_at) {
        const diffDays = (Date.now() - new Date(r.last_sent_at).getTime()) / 86400000;
        if (diffDays < 7) { log.push({ key: r.key, skipped: "weekly_not_due" }); continue; }
      }

      const to = r.whatsapp_recipient || settings?.default_whatsapp_recipient;
      const fromOverride = r.twilio_from || settings?.default_twilio_from || undefined;
      if (!to) {
        log.push({ key: r.key, skipped: "no_recipient_configured" });
        continue;
      }

      const body = `🔔 *${r.title}*\n\n${r.message}${r.link_url ? `\n\n${r.link_url}` : ""}`;

      try {
        const { sid } = await sendWhatsApp(to, body, fromOverride);
        await supabase.from("system_reminders").update({
          last_sent_at: new Date().toISOString(),
          send_count: (r.send_count ?? 0) + 1,
        }).eq("id", r.id);
        log.push({ key: r.key, sent: true, sid });
      } catch (err) {
        log.push({ key: r.key, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ today, processed: log }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
