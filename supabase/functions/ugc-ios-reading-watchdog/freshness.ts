import { alreadyOpen, selectSources } from "./eligibility.ts";
export { STALE_MS, isStale } from "./eligibility.ts";

async function allRows(admin: any, table: string, columns: string, filter?: (q: any) => any) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = admin.from(table).select(columns).order("id").range(offset, offset + 999);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? [])); if ((data ?? []).length < 1000) return rows;
  }
}
async function claimId(sources: any[]) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    sources.map((s) => `${s.key}:${s.captured_at}`).sort().join("\n"))));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes.slice(0, 16)].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export async function dailySourceAlerts(admin: any, dryRun: boolean) {
  const [rows, songs, artists, history] = await Promise.all([
    allRows(admin, "artist_song_metrics_daily", "id,company_id,artist_id,song_id,platform,source,source_ref,metric_date,captured_at"),
    allRows(admin, "artist_songs", "id,company_id,artist_id,title,tracking_status,is_reference"),
    allRows(admin, "artists", "id,name,status,roster_type"),
    allRows(admin, "sync_runs", "id,started_at,status,details", (q) => q.eq("function_name", "artist-song-source-alerts")),
  ]);
  const stale = selectSources(rows, songs, artists, Date.now());
  const pending = stale.filter((r) => !alreadyOpen(r, history));
  if (dryRun || pending.length === 0) return { stale, pending, queued: 0, dry_run: dryRun };
  const { data: unsubscribe, error: unsubError } = await admin.from("email_unsubscribe_tokens")
    .select("token").eq("email", "pedroneto@mundopropicio.com").order("created_at").limit(1).maybeSingle();
  if (unsubError || !unsubscribe?.token) throw new Error("canal de alertas sem referência de unsubscribe");
  const id = await claimId(pending);
  // Existing PK is the atomic claim; uncertain delivery stays open, not retried blindly.
  const { data: claim, error: claimError } = await admin.from("sync_runs").upsert({
    id, function_name: "artist-song-source-alerts", trigger_source: "cron", dry_run: false,
    status: "running", rows_written: 0, details: { keys: pending.map((r) => r.key), rule_version: 2 },
  }, { onConflict: "id", ignoreDuplicates: true }).select("id");
  if (claimError) throw new Error(claimError.message);
  if (!claim?.length) return { stale, pending, queued: 0, claimed: true, dry_run: false };
  const text = pending.map((r) => `${r.artist_name} — ${r.song_title}: ${r.platform}/${r.source}; última captura ${r.captured_at} (UTC); ${r.capture_days} dias regulares anteriores.`).join("\n");
  const { data: queueId, error } = await admin.rpc("enqueue_email", {
    queue_name: "transactional_emails", company_id: pending[0].company_id,
    payload: { message_id: `song-source-summary-${id}`, idempotency_key: `song-source-summary-${id}`,
      to: "pedroneto@mundopropicio.com", from: "MP Gestão Eventos <noreply@mpgestaoeventos.com>",
      sender_domain: "notify.mpgestaoeventos.com", subject: `[ALERTA FONTES] ${pending.length} fonte(s) sem captura há mais de 48 h`,
      text, html: `<pre>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
      purpose: "transactional", label: "artist_song_source_alert", unsubscribe_token: unsubscribe.token,
      queued_at: new Date().toISOString() },
  });
  const { error: logError } = await admin.from("sync_runs").update({
    status: error ? "error" : "success", rows_written: error ? 0 : 1, finished_at: new Date().toISOString(),
    details: { keys: pending.map((r) => r.key), rule_version: 2, queue_id: queueId }, error_text: error?.message ?? null,
  }).eq("id", id);
  if (logError) throw new Error(`registo resumo: ${logError.message}`);
  if (error) throw new Error(error.message);
  return { stale, pending, queued: 1, dry_run: false };
}
