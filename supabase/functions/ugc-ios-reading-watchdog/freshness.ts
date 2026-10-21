export const STALE_MS = 48 * 3600_000;
export function isStale(capturedAt: string, now: number): boolean {
  const time = Date.parse(capturedAt);
  return Number.isFinite(time) && now - time > STALE_MS;
}

/** All observed daily sources, per song; manual entries are not daily collectors. */
export async function dailySourceAlerts(admin: any, dryRun: boolean) {
  const now = Date.now(); const day = new Date(now).toISOString().slice(0, 10);
  const latest = new Map<string, any>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from("artist_song_metrics_daily")
      .select("id,company_id,artist_id,song_id,platform,source,captured_at")
      .neq("source", "manual").order("id").range(offset, offset + 999);
    if (error) throw new Error(`fontes diárias: ${error.message}`);
    for (const row of data ?? []) {
      const key = JSON.stringify([row.artist_id, row.song_id, row.platform, row.source]);
      if (!latest.has(key) || Date.parse(row.captured_at) > Date.parse(latest.get(key).captured_at)) latest.set(key, row);
    }
    if ((data ?? []).length < 1000) break;
  }
  const stale = [...latest.values()].filter((r) => isStale(r.captured_at, now));
  if (dryRun) return { stale, queued: 0, dry_run: true };
  const { data: prior, error: priorError } = await admin.from("sync_runs").select("details")
    .eq("function_name", "artist-song-source-alerts").eq("status", "success").gte("started_at", `${day}T00:00:00Z`);
  if (priorError) throw new Error(priorError.message);
  const sent = new Set((prior ?? []).flatMap((x: any) => x.details?.keys ?? []));
  let { data: unsubscribe, error: unsubError } = await admin.from("email_unsubscribe_tokens")
    .select("token").eq("email", "pedroneto@mundopropicio.com").maybeSingle();
  if (!unsubError && !unsubscribe && stale[0]?.company_id) {
    const { error } = await admin.from("email_unsubscribe_tokens").upsert({
      token: crypto.randomUUID() + crypto.randomUUID(), email: "pedroneto@mundopropicio.com", company_id: stale[0].company_id,
    }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw new Error(`referência unsubscribe: ${error.message}`);
    const result = await admin.from("email_unsubscribe_tokens").select("token").eq("email", "pedroneto@mundopropicio.com").maybeSingle();
    unsubscribe = result.data; unsubError = result.error;
  }
  if (unsubError || !unsubscribe?.token) throw new Error("canal de alertas email sem referência de unsubscribe");
  const { data: artists } = await admin.from("artists").select("id,name");
  const { data: songs } = await admin.from("artist_songs").select("id,title");
  const names = new Map((artists ?? []).map((x: any) => [x.id, x.name]));
  const titles = new Map((songs ?? []).map((x: any) => [x.id, x.title]));
  const keys: string[] = []; const errors: string[] = [];
  for (const row of stale) {
    const key = JSON.stringify([row.artist_id, row.song_id, row.platform, row.source]);
    if (sent.has(key)) continue;
    const messageId = `song-source-stale-${day}-${row.artist_id}-${row.song_id}-${row.platform}-${row.source}`;
    const text = `${names.get(row.artist_id) ?? "Artista"} — ${titles.get(row.song_id) ?? "Música"}: fonte diária ${row.platform}/${row.source} sem captura há mais de 48 h. Última captura: ${row.captured_at} (UTC).`;
    const { error } = await admin.rpc("enqueue_email", { queue_name: "transactional_emails", company_id: row.company_id,
      payload: { message_id: messageId, idempotency_key: messageId, to: "pedroneto@mundopropicio.com",
        from: "MP Gestão Eventos <noreply@mpgestaoeventos.com>", sender_domain: "notify.mpgestaoeventos.com",
        subject: `[ALERTA FONTES] ${names.get(row.artist_id) ?? "Artista"} · ${row.platform}/${row.source}`,
        text, html: `<pre>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
        purpose: "transactional", label: "artist_song_source_alert", unsubscribe_token: unsubscribe.token,
        queued_at: new Date(now).toISOString() } });
    if (error) errors.push(`${key}: ${error.message}`); else keys.push(key);
  }
  if (keys.length || errors.length) {
    const { error } = await admin.from("sync_runs").insert({ function_name: "artist-song-source-alerts", trigger_source: "cron",
      dry_run: false, status: keys.length ? "success" : "error", rows_written: keys.length,
      finished_at: new Date().toISOString(), details: { keys, errors, stale: stale.length }, error_text: errors.join("; ") || null });
    if (error) throw new Error(`registo alertas: ${error.message}`);
  }
  return { stale, queued: keys.length, errors, dry_run: false };
}