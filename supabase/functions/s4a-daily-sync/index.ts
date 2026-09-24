// s4a-daily-sync (D-ERP140) — sync diário do Spotify for Artists.
// verify_jwt=true; service_role (cron) ou admin/platform_admin da empresa do
// artista (D-ERP128). dry_run por omissão TRUE. Nunca regista tokens.
// Contrato: janelas acabam em D = meta/latest-date (nunca "hoje").
//  (1) catalog-view songs 28day → só filtra (nada gravado)
//  (2) song-stats-view stats: (a) F=max(release,D−27) (b) F=release
//  (3) top-playlists 28day → artist_song_playlist_streams + derivadas
//  (4) geografia: fora desta fase
//  (5) artist-home-metrics: só em dry_run, sem gravar
//  prova: { artist_id, prova:{track_id,from,to} } → só (2), sem gravar

import { adminClient, corsHeaders, json } from "../_shared/artist-meta.ts";
import { authorizeArtistAdmin, getS4aAccessToken, S4aError } from "../_shared/s4a.ts";
import { deduceTriggerSource, finishSyncRun, resolveStatus, startSyncRun } from "../_shared/sync-run.ts";

const FN = "s4a-daily-sync";
const BASE = "https://generic.wg.spotify.com";
const HOME = "https://s4x-home-service.spotify.com/v1/artist-home-metrics";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRACK_RE = /^[A-Za-z0-9]{22}$/;
const PAUSE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class StopArtist extends Error {
  constructor(public status: number, public path: string) { super(`S4A HTTP ${status}`); }
}

// deno-lint-ignore no-explicit-any
type Admin = any;

function addDays(d: string, n: number): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Estrutura de chaves sem valores. */
// deno-lint-ignore no-explicit-any
function shape(v: any, depth = 0): unknown {
  if (depth > 6) return "…";
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1)] : [];
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v)) o[k] = shape(v[k], depth + 1);
    return o;
  }
  return v === null ? "null" : typeof v;
}

/** Cliente S4A por artista: pausa, contagem, 401 → nova leitura/rotação e repete 1×. */
function s4aClient(admin: Admin, artistId: string) {
  let token: string | null = null;
  let calls = 0;
  let first = true;
  async function get(url: string, stopOnError = true): Promise<{ status: number; body: any }> {
    if (!first) await sleep(PAUSE_MS);
    first = false;
    if (!token) token = (await getS4aAccessToken(admin, artistId)).accessToken;
    for (let attempt = 0; attempt < 2; attempt++) {
      calls++;
      let status = 0;
      let body: any = null;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(25_000),
        });
        status = res.status;
        body = await res.json().catch(() => null);
      } catch (_e) { status = 0; }
      if (status === 401 && attempt === 0) {
        token = (await getS4aAccessToken(admin, artistId)).accessToken;
        await sleep(PAUSE_MS);
        continue;
      }
      if (status === 200) return { status, body };
      const path = new URL(url).pathname;
      if (stopOnError && (status === 429 || status >= 500 || status === 0 || status === 401)) {
        throw new StopArtist(status, path);
      }
      return { status, body };
    }
    throw new StopArtist(401, new URL(url).pathname);
  }
  return { get, calls: () => calls };
}

// deno-lint-ignore no-explicit-any
function agg(block: any): number | null {
  const v = block?.current_period_agg;
  const n = typeof v === "object" && v !== null ? Number(v.value ?? v.y ?? NaN) : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function songStats(c: ReturnType<typeof s4aClient>, artistExt: string, track: string, from: string, to: string) {
  const url = `${BASE}/song-stats-view/v1/artist/${artistExt}/recording/${track}/stats?fromDate=${from}&toDate=${to}`;
  return await c.get(url);
}

const METRICS = [
  ["streams", "streams"],
  ["listeners", "listeners"],
  ["saves", "saves"],
  ["playlist_adds", "playlist_adds"],
] as const;

// deno-lint-ignore no-explicit-any
async function syncArtist(admin: Admin, artist: any, dryRun: boolean, triggerSource: "cron" | "manual" | "api") {
  const started = Date.now();
  const runId = await startSyncRun(admin, {
    function_name: FN, trigger_source: triggerSource, dry_run: dryRun,
    company_id: artist.company_id, artist_id: artist.id,
  });
  const notes: string[] = [];
  const counts: Record<string, number> = {};
  const samples: Record<string, unknown[]> = { artist_song_metrics_daily: [], artist_song_playlist_streams: [] };
  const formas: Record<string, unknown> = {};
  let written = 0;
  let errors = 0;
  let D: string | null = null;
  const c = s4aClient(admin, artist.id);

  const metricRows: any[] = [];
  const playlistRows: any[] = [];

  try {
    const { data: ch } = await admin.from("artist_channels").select("external_id")
      .eq("artist_id", artist.id).eq("platform", "spotify").limit(1).maybeSingle();
    const artistExt = ch?.external_id;
    if (!artistExt) throw new S4aError("sem_external_id_spotify");

    // (0) D
    const ld = await c.get(`${BASE}/s4x-insights-api/v1/meta/latest-date`);
    D = ld.body?.latestDate ?? ld.body?.latest_date ?? ld.body?.date ?? null;
    if (!D || !DATE_RE.test(String(D))) throw new S4aError("latest_date_invalida");

    if (!dryRun) {
      const { data: last } = await admin.from("sync_runs").select("details")
        .eq("function_name", FN).eq("artist_id", artist.id).eq("dry_run", false)
        .in("status", ["success", "partial"]).order("started_at", { ascending: false })
        .limit(1).maybeSingle();
      if (last?.details?.D === D) {
        notes.push("S4A sem dia novo");
        await finishSyncRun(admin, runId, started, {
          status: "no_data", api_calls: c.calls(), rows_written: 0, details: { D, notes },
        });
        return { artist_id: artist.id, D, status: "no_data", notes };
      }
    }

    // (1) catálogo
    const cat = await c.get(`${BASE}/catalog-view/v1/artist/${artistExt}/songs?time-filter=28day`);
    const catIds = new Set<string>(((cat.body?.songs ?? []) as any[]).map((s) => String(s?.id ?? "")).filter(Boolean));
    const { data: songs } = await admin.from("artist_songs").select("id, title, release_date")
      .eq("artist_id", artist.id).eq("tracking_status", "ativo");
    const songIds = (songs ?? []).map((s: any) => s.id);
    const { data: idents } = songIds.length
      ? await admin.from("artist_song_identifiers").select("song_id, external_id")
        .eq("platform", "spotify").in("song_id", songIds)
      : { data: [] };
    const targets: { song: any; track: string }[] = [];
    for (const s of songs ?? []) {
      const ids = (idents ?? []).filter((i: any) => i.song_id === s.id).map((i: any) => String(i.external_id));
      const hit = ids.find((x: string) => catIds.has(x));
      for (const x of ids) if (x !== hit) notes.push(`"${s.title}": id spotify ${x} não está no catálogo S4A`);
      if (hit) targets.push({ song: s, track: hit });
    }

    const capturedAt = new Date().toISOString();
    const base = (song: any) => ({ company_id: artist.company_id, artist_id: artist.id, song_id: song.id, platform: "spotify", source: "s4a_api", captured_at: capturedAt });

    for (const { song, track } of targets) {
      const rel: string | null = song.release_date ?? null;
      if (!rel) notes.push(`"${song.title}": sem release_date — janelas usam D−27`);
      const d27 = addDays(D, -27);
      const F28 = rel && rel > d27 ? rel : d27;

      // (2a)
      const a = await songStats(c, artistExt, track, F28, D);
      if (a.status !== 200) { errors++; notes.push(`"${song.title}": stats 28d HTTP ${a.status}`); }
      else {
        const ref = `s4a ${F28}–${D}`;
        for (const [k, m] of METRICS) {
          const v = agg(a.body?.[k]);
          if (v !== null) metricRows.push({ ...base(song), metric: `s4a_${m}_28d`, metric_date: D, value: v, source_ref: ref });
          const ts: any[] = a.body?.[k]?.current_period_timeseries ?? [];
          for (const p of ts.slice(-28)) {
            const x = String(p?.x ?? "").slice(0, 10);
            const y = Number(p?.y);
            if (DATE_RE.test(x) && Number.isFinite(y)) {
              metricRows.push({ ...base(song), metric: `s4a_${m}_day`, metric_date: x, value: y, source_ref: ref });
            }
          }
        }
      }

      // (2b)
      if (rel) {
        const b = await songStats(c, artistExt, track, rel, D);
        if (b.status !== 200) { errors++; notes.push(`"${song.title}": stats desde lançamento HTTP ${b.status}`); }
        else {
          const ref = `s4a ${rel}–${D}`;
          for (const [k, m] of METRICS) {
            const v = agg(b.body?.[k]);
            if (v !== null) metricRows.push({ ...base(song), metric: `s4a_${m}_since_release`, metric_date: D, value: v, source_ref: ref });
          }
        }
      } else {
        await sleep(PAUSE_MS);
      }

      // (3)
      const pl = await c.get(`${BASE}/song-stats-view/v2/artist/${artistExt}/recording/${track}/top-playlists?time-filter=28day`);
      if (pl.status !== 200) { errors++; notes.push(`"${song.title}": top-playlists HTTP ${pl.status}`); }
      else {
        if (!formas.playlistOverall && pl.body?.playlistOverall !== undefined) formas.playlistOverall = shape(pl.body.playlistOverall);
        const list: any[] = (pl.body?.data ?? []).slice(0, 100);
        const byTitle = new Map<string, any>();
        list.forEach((p, i) => {
          const title = String(p?.title ?? "").trim();
          if (!title) return;
          const row = {
            company_id: artist.company_id, artist_id: artist.id, song_id: song.id,
            snapshot_date: D, period_days: 28, rank: i + 1, playlist_name: title,
            made_by: p?.author === "Spotify" || p?.isAlgorithmic === true || p?.isAlgotorial === true ? "spotify" : "user",
            streams: Number.isFinite(Number(p?.streams)) ? Math.round(Number(p.streams)) : null,
            date_added: DATE_RE.test(String(p?.dateAdded ?? "").slice(0, 10)) ? String(p.dateAdded).slice(0, 10) : null,
            source: "s4a_api",
          };
          const prev = byTitle.get(title);
          if (!prev) byTitle.set(title, row);
          else {
            const keep = (row.streams ?? 0) > (prev.streams ?? 0) ? row : prev;
            const drop = keep === row ? prev : row;
            byTitle.set(title, keep);
            notes.push(`"${song.title}": playlist repetida "${title}" — fica #${keep.rank} (${keep.streams}), fora #${drop.rank} (${drop.streams})`);
          }
        });
        const rows = [...byTitle.values()];
        playlistRows.push(...rows);
        const sumAll = list.reduce((s, p) => s + (Number(p?.streams) || 0), 0);
        const sumSp = rows.filter((r) => r.made_by === "spotify").reduce((s, r) => s + (r.streams ?? 0), 0);
        metricRows.push({ ...base(song), metric: "s4a_top100_playlist_streams_28d", metric_date: D, value: sumAll, source_ref: `s4a top-playlists 28day ${D}` });
        metricRows.push({ ...base(song), metric: "s4a_spotify_owned_playlist_streams_28d", metric_date: D, value: sumSp, source_ref: `s4a top-playlists 28day ${D}` });
      }
    }

    // (5) só dry_run, sem gravar
    if (dryRun) {
      for (const dr of ["28day", "last28days"]) {
        const h = await c.get(`${HOME}?artistId=${artistExt}&dateRange=${dr}`, false);
        if (h.status === 200) { formas.artist_home_metrics = { dateRange: dr, forma: shape(h.body) }; break; }
        notes.push(`artist-home-metrics dateRange=${dr}: HTTP ${h.status}`);
      }
    }

    for (const r of metricRows) counts[r.metric] = (counts[r.metric] ?? 0) + 1;
    counts["artist_song_playlist_streams"] = playlistRows.length;
    samples.artist_song_metrics_daily = metricRows.slice(0, 3);
    samples.artist_song_playlist_streams = playlistRows.slice(0, 3);

    if (!dryRun) {
      for (let i = 0; i < metricRows.length; i += 500) {
        const chunk = metricRows.slice(i, i + 500);
        const { error } = await admin.from("artist_song_metrics_daily")
          .upsert(chunk, { onConflict: "song_id,platform,metric,metric_date,source" });
        if (error) { errors++; notes.push(`gravação métricas falhou: ${error.message}`); } else written += chunk.length;
      }
      if (playlistRows.length) {
        const { error } = await admin.from("artist_song_playlist_streams")
          .upsert(playlistRows, { onConflict: "song_id,snapshot_date,period_days,playlist_name" });
        if (error) { errors++; notes.push(`gravação playlists falhou: ${error.message}`); } else written += playlistRows.length;
      }
    }
  } catch (e) {
    errors++;
    if (e instanceof StopArtist) notes.push(`S4A HTTP ${e.status} em ${e.path} — artista parado`);
    else if (e instanceof S4aError) notes.push(`S4A: ${e.code}`);
    else notes.push(`erro: ${(e as Error)?.message ?? "desconhecido"}`);
  }

  const status = resolveStatus(written, errors);
  await finishSyncRun(admin, runId, started, {
    status, api_calls: c.calls(), rows_written: written,
    details: { D, counts, notes }, error_text: errors ? notes[notes.length - 1] ?? null : null,
  });
  return {
    artist_id: artist.id, D, dry_run: dryRun, status: dryRun ? "dry_run" : status, api_calls: c.calls(),
    counts, ...(dryRun ? { amostra: samples, formas } : { rows_written: written }), notes,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const artistId = body?.artist_id;
  const dryRun = body?.dry_run !== false;
  if (artistId !== undefined && (typeof artistId !== "string" || !UUID_RE.test(artistId))) {
    return json({ ok: false, error: "artist_id inválido" }, 400);
  }
  const admin = adminClient();

  // Modo prova: só (2), sem gravar.
  if (body?.prova) {
    const p = body.prova;
    if (!artistId) return json({ ok: false, error: "prova exige artist_id" }, 400);
    if (typeof p.track_id !== "string" || !TRACK_RE.test(p.track_id) || !DATE_RE.test(p.from ?? "") || !DATE_RE.test(p.to ?? "")) {
      return json({ ok: false, error: "prova inválida (track_id, from, to)" }, 400);
    }
    const auth = await authorizeArtistAdmin(req, admin, artistId, true);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const { data: ch } = await admin.from("artist_channels").select("external_id")
      .eq("artist_id", artistId).eq("platform", "spotify").limit(1).maybeSingle();
    if (!ch?.external_id) return json({ ok: false, error: "sem canal spotify" }, 400);
    try {
      const c = s4aClient(admin, artistId);
      const r = await songStats(c, ch.external_id, p.track_id, p.from, p.to);
      const out: Record<string, number | null> = {};
      for (const [k] of METRICS) out[k] = agg(r.body?.[k]);
      out.streams_per_listener = agg(r.body?.streams_per_listener);
      return json({ ok: r.status === 200, status_http: r.status, from: p.from, to: p.to, track_id: p.track_id, agregados: out });
    } catch (e) {
      const code = e instanceof StopArtist ? `HTTP ${e.status}` : e instanceof S4aError ? e.code : "erro";
      return json({ ok: false, error: code }, 502);
    }
  }

  let artists: any[] = [];
  if (artistId) {
    const auth = await authorizeArtistAdmin(req, admin, artistId, true);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const { data } = await admin.from("artists").select("id, company_id").eq("id", artistId).maybeSingle();
    if (data) artists = [data];
  } else {
    // Sem artist_id: todos os artistas com ligação spotify activa (só service_role).
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    let isSr = bearer === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "\u0000");
    try { isSr = isSr || JSON.parse(atob(bearer.split(".")[1] ?? ""))?.role === "service_role"; } catch (_e) { /* */ }
    const { data: conns } = await admin.from("artist_channel_connections")
      .select("artist_id, company_id").eq("provider", "spotify").eq("status", "active");
    const uniq = [...new Map((conns ?? []).map((c: any) => [c.artist_id, c])).values()] as any[];
    if (!isSr) {
      // utilizador: só artistas das empresas onde é admin/platform_admin
      const allowed: any[] = [];
      for (const a of uniq) {
        const auth = await authorizeArtistAdmin(req, admin, a.artist_id, false);
        if (auth.ok) allowed.push(a);
      }
      if (!allowed.length) return json({ ok: false, error: "papel insuficiente" }, 403);
      artists = allowed.map((a) => ({ id: a.artist_id, company_id: a.company_id }));
    } else {
      artists = uniq.map((a) => ({ id: a.artist_id, company_id: a.company_id }));
    }
  }

  const trigger = deduceTriggerSource(req);
  const results = [];
  for (const a of artists) results.push(await syncArtist(admin, a, dryRun, trigger));
  return json({ ok: true, dry_run: dryRun, artistas: results.length, resultados: results });
});
