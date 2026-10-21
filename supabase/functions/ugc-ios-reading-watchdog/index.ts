// ugc-ios-reading-watchdog — cron 14:00 e 20:00 UTC
// Verifica se existe a leitura UGC TikTok do atalho iOS para hoje (data de Lisboa).
// Se faltar, enfileira alerta WhatsApp em notification_queue (máx. 2 avisos/dia/música).
// dry_run=true (default): devolve as decisões sem escrever log nem enfileirar.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";
import { dailySourceAlerts } from "./freshness.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function lisbonToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Só service_role (cron) — mesmo padrão do whatsapp-dispatcher.
  if (!(await isServiceRoleRequest(req))) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let dryRun = true;
  try {
    const body = await req.json();
    if (body && body.dry_run === false) dryRun = false;
  } catch { /* body vazio → dry_run */ }

  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "configuração em falta" }), { status: 500, headers: corsHeaders });
  const supabase = createClient(
    url,
    key,
    { auth: { persistSession: false } },
  );

  const today = lisbonToday();
  let sourceAlerts: unknown;
  try { sourceAlerts = { ...await dailySourceAlerts(supabase, true), email_enabled: false }; }
  catch (e) { sourceAlerts = { error: String(e) }; }

  const { data: configs, error: cfgErr } = await supabase
    .from("ugc_watchdog_config")
    .select("song_id, label, recipient_phone, recipient_profile_id, company_id")
    .eq("active", true);
  if (cfgErr) {
    return new Response(JSON.stringify({ error: cfgErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Template tem de existir (mesmo pending) para enfileirar.
  const { data: tpl, error: tplErr } = await supabase
    .from("notification_templates")
    .select("id, status")
    .eq("template_name", "ugc_leitura_em_falta")
    .maybeSingle();
  if (tplErr || !tpl) {
    return new Response(JSON.stringify({ error: "template ugc_leitura_em_falta em falta", detail: tplErr?.message ?? null }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const decisions: Array<Record<string, unknown>> = [];

  for (const cfg of configs ?? []) {
    // Leitura de hoje (data Lisboa)?
    const { data: todayRows, error: tErr } = await supabase
      .from("artist_song_metrics_daily")
      .select("value")
      .eq("song_id", cfg.song_id)
      .eq("platform", "tiktok")
      .eq("metric", "ugc_videos")
      .eq("source", "ios_shortcut")
      .eq("metric_date", today)
      .limit(1);
    if (tErr) {
      decisions.push({ song_id: cfg.song_id, label: cfg.label, decision: "error", error: tErr.message });
      continue;
    }

    if ((todayRows ?? []).length > 0) {
      const decision = { song_id: cfg.song_id, label: cfg.label, decision: "ok", today_value: todayRows?.[0]?.value };
      if (!dryRun) {
        await supabase.from("ugc_watchdog_log").upsert(
          { song_id: cfg.song_id, check_date: today, status: "ok" },
          { onConflict: "song_id,check_date,status", ignoreDuplicates: true },
        );
      }
      decisions.push(decision);
      continue;
    }

    // Em falta: última leitura conhecida para o texto do alerta.
    const { data: lastRows } = await supabase
      .from("artist_song_metrics_daily")
      .select("metric_date, value")
      .eq("song_id", cfg.song_id)
      .eq("platform", "tiktok")
      .eq("metric", "ugc_videos")
      .eq("source", "ios_shortcut")
      .order("metric_date", { ascending: false })
      .limit(1);
    const last = (lastRows ?? [])[0];
    const lastLabel = last
      ? `${String(last.metric_date).split("-").reverse().join("/")} = ${Number(last.value).toLocaleString("pt-PT")}`
      : "—";

    // Quantos avisos já houve hoje?
    const { count } = await supabase
      .from("ugc_watchdog_log")
      .select("id", { count: "exact", head: true })
      .eq("song_id", cfg.song_id)
      .eq("check_date", today)
      .in("status", ["missing_alerted", "still_missing_alerted"]);
    const alertsToday = count ?? 0;

    if (alertsToday >= 2) {
      decisions.push({ song_id: cfg.song_id, label: cfg.label, decision: "skipped_max_alerts", alerts_today: alertsToday, last_reading: lastLabel });
      continue;
    }

    const status = alertsToday === 0 ? "missing_alerted" : "still_missing_alerted";
    const decision: Record<string, unknown> = {
      song_id: cfg.song_id,
      label: cfg.label,
      decision: status,
      alerts_today: alertsToday,
      last_reading: lastLabel,
      template_status: tpl.status,
    };

    if (!dryRun) {
      const { error: logErr } = await supabase.from("ugc_watchdog_log").insert({
        song_id: cfg.song_id,
        check_date: today,
        status,
        sent_at: new Date().toISOString(),
      });
      if (logErr) {
        decision.decision = "error";
        decision.error = logErr.message;
        decisions.push(decision);
        continue;
      }
      const { error: qErr } = await supabase.from("notification_queue").insert({
        template_id: tpl.id,
        recipient_phone: cfg.recipient_phone,
        recipient_profile_id: cfg.recipient_profile_id,
        company_id: cfg.company_id,
        params: [cfg.label, lastLabel],
        status: "queued",
        scheduled_at: new Date().toISOString(),
        context_type: "ugc_watchdog",
        context_id: cfg.song_id,
      });
      if (qErr) {
        decision.decision = "error";
        decision.error = qErr.message;
      }
    }

    decisions.push(decision);
  }

  return new Response(JSON.stringify({ dry_run: dryRun, date: today, decisions, source_alerts: sourceAlerts }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
