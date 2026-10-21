export const STALE_MS = 48 * 3600_000;
const DAY_MS = 24 * 3600_000;
export function isStale(capturedAt: string, now: number): boolean {
  const time = Date.parse(capturedAt);
  return Number.isFinite(time) && now - time > STALE_MS;
}
export function followed(song: any, artist: any): boolean {
  return artist?.status === "ativo" && artist?.roster_type === "elenco" &&
    song?.tracking_status === "ativo" && song?.is_reference === false && song.artist_id === artist.id;
}
export function realCapture(row: any): boolean {
  return row.source !== "manual" && !/backfill|historical|hist[oó]rico|import/i.test(row.source_ref ?? "") &&
    Number.isFinite(Date.parse(row.captured_at));
}
export function regularDays(rows: any[], latest: string): number {
  const end = Date.parse(latest); const lastDay = latest.slice(0, 10);
  // Capture days, not metric_date: a historical batch cannot manufacture cadence.
  return new Set(rows.filter((r) => realCapture(r) && Date.parse(r.captured_at) >= end - 14 * DAY_MS &&
    Date.parse(r.captured_at) < end && r.captured_at.slice(0, 10) !== lastDay)
    .map((r) => r.captured_at.slice(0, 10))).size;
}
export function selectSources(rows: any[], songs: any[], artists: any[], now: number) {
  const sm = new Map(songs.map((s) => [s.id, s])); const am = new Map(artists.map((a) => [a.id, a]));
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const song = sm.get(row.song_id); const artist = am.get(row.artist_id);
    if (!followed(song, artist) || !realCapture(row) || row.company_id !== song.company_id) continue;
    const key = JSON.stringify([row.artist_id, row.song_id, row.platform, row.source]);
    const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    const last = group.reduce((a, b) => Date.parse(a.captured_at) > Date.parse(b.captured_at) ? a : b);
    return { ...last, key, capture_days: regularDays(group, last.captured_at),
      artist_name: am.get(last.artist_id)?.name, song_title: sm.get(last.song_id)?.title };
  }).filter((r) => r.capture_days >= 5 && isStale(r.captured_at, now));
}
export function alreadyOpen(row: any, history: any[]): boolean {
  // Old 11-alert run is retained as delivery proof, including the legitimate Litto alert.
  return history.some((h) => (h.details?.keys ?? []).includes(row.key) &&
    ["success", "running", "unknown"].includes(h.status) &&
    Date.parse(h.started_at) >= Date.parse(row.captured_at));
}