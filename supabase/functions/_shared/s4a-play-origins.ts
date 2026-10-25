// Browser/Deno-safe, no I/O. Source categories remain unavailable until observed.
export const SOURCE_ORIGIN_CAPTURE_ENABLED = false;
export const dateOffset = (day: string, offset: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
export function responseShape(value: unknown, depth = 0): unknown {
  if (depth > 6) return "…";
  if (Array.isArray(value)) return value.length ? [responseShape(value[0], depth + 1)] : [];
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, responseShape(v, depth + 1)]));
  return value === null ? "null" : typeof value;
}
export type PlaylistItem = { uri?: unknown; playlistUri?: unknown; spotifyUri?: unknown; title?: unknown; author?: unknown; isAlgorithmic?: unknown; isAlgotorial?: unknown; streams?: unknown; dateAdded?: unknown };
export type PlaylistRow = { snapshot_date: string; period_days: 1 | 28; rank: number; playlist_name: string; playlist_uri: string | null; made_by: string; streams: number | null; date_added: string | null; source: string };
export function playlistRows(items: PlaylistItem[], day: string, period: 1 | 28): { rows: PlaylistRow[]; notes: string[] } {
  const byKey = new Map<string, PlaylistRow>();
  const notes: string[] = [];
  items.slice(0, 100).forEach((p, index) => {
    const title = String(p.title ?? "").trim();
    if (!title) return;
    const uri = String(p.uri ?? p.playlistUri ?? p.spotifyUri ?? "").trim().slice(0, 200) || null;
    const value = p.streams == null || p.streams === "" ? NaN : Number(p.streams);
    const added = String(p.dateAdded ?? "").slice(0, 10);
    const row: PlaylistRow = { snapshot_date: day, period_days: period, rank: index + 1, playlist_name: title, playlist_uri: uri,
      made_by: p.author === "Spotify" || p.isAlgorithmic === true || p.isAlgotorial === true ? "spotify" : "user",
      streams: Number.isFinite(value) && value >= 0 ? Math.round(value) : null,
      date_added: /^\d{4}-\d{2}-\d{2}$/.test(added) ? added : null, source: "s4a_api" };
    const key = uri ?? `name:${title}`;
    const previous = byKey.get(key);
    if (!previous) byKey.set(key, row);
    else {
      const keep = (row.streams ?? 0) > (previous.streams ?? 0) ? row : previous;
      byKey.set(key, keep);
      notes.push(`playlist repetida "${title}" (${uri ?? "sem uri"}) — fica #${keep.rank} (${keep.streams})`);
    }
  });
  const rows = [...byKey.values()];
  const missing = rows.filter(r => !r.playlist_uri).length;
  if (missing) notes.push(`${missing} playlists sem uri — chave pelo título`);
  return { rows, notes };
}
export function playlistCategory(row: Pick<PlaylistRow, "playlist_uri" | "playlist_name" | "made_by">) {
  if (row.made_by !== "spotify") return "listener_playlists";
  if (row.playlist_uri === "spotify:playlist:radio" || row.playlist_name.trim().toLowerCase() === "radio") return "radio";
  if (row.playlist_name.trim().toLowerCase() === "mixes") return "mixes";
  return "other_spotify";
}
/** Missing rows and unknown D-28 seeds stay null. No interpolation or clamping. */
export function estimateDaily(windows: ReadonlyMap<string, number | null>, release: string, from: string, to: string, observed: ReadonlyMap<string, number | null> = new Map()) {
  const cache = new Map<string, number | null>();
  function daily(day: string): number | null {
    if (day < release) { cache.set(day, 0); return 0; }
    if (cache.has(day)) return cache.get(day) ?? null;
    const real = observed.get(day);
    if (real != null) { cache.set(day, real); return real; }
    const current = windows.get(day);
    const previousDay = dateOffset(day, -1);
    const previous = previousDay < release ? 0 : windows.get(previousDay);
    if (current == null || previous == null) { cache.set(day, null); return null; }
    const removed = daily(dateOffset(day, -28));
    const value = removed == null ? null : current - previous + removed;
    // Revised/truncated windows can contradict a nonnegative daily count.
    const result = value != null && value >= 0 ? value : null;
    cache.set(day, result);
    return result;
  }
  for (let d = from; d <= to; d = dateOffset(d, 1)) daily(d);
  return new Map([...cache].filter(([d]) => d >= from && d <= to).sort(([a], [b]) => a.localeCompare(b)));
}
export type SoundDay = { metric_date: string; music_id: string; video_count: number; source: string };
export function soundDailySummary(rows: SoundDay[], from: string, to: string) {
  const days = new Map<string, Map<string, SoundDay>>();
  for (const row of rows) {
    if (!Number.isFinite(row.video_count) || row.video_count < 0) continue;
    const sounds = days.get(row.metric_date) ?? new Map<string, SoundDay>();
    if (sounds.has(row.music_id)) throw new Error("duplicate_sound_day");
    sounds.set(row.music_id, row); days.set(row.metric_date, sounds);
  }
  const sum = (sounds: Map<string, SoundDay>) => [...sounds.values()].reduce((v, r) => v + r.video_count, 0);
  const result = [];
  for (let day = from; day <= to; day = dateOffset(day, 1)) {
    const current = days.get(day), previous = days.get(dateOffset(day, -1));
    const total = current ? sum(current) : null;
    const delta = current && previous ? sum(current) - sum(previous) : null;
    const sameSounds = current && previous ? current.size === previous.size && [...current.keys()].every(id => previous.has(id)) : null;
    const sameSources = current && previous && sameSounds ? [...current].every(([id, r]) => previous.get(id)?.source === r.source) : null;
    result.push({ day, total, new_videos: delta, sounds: current?.size ?? null, drop: delta != null && delta < 0, same_sounds: sameSounds, same_sources: sameSources });
  }
  return result;
}