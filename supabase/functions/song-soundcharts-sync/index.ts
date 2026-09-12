// song-soundcharts-sync — métricas diárias e playlists por música (obra).
//
// POST {
//   song_id?: uuid, artist_id?: uuid,
//   start_date?: YYYY-MM-DD, end_date?: YYYY-MM-DD,
//   dry_run?: boolean (default true),
//   only_launch?: boolean
// }
//
// Endpoints:
//   GET /api/v2/song/{uuid}/audience/{platform}?startDate&endDate&limit=100
//   GET /api/v2.20/song/{uuid}/playlist/current/{platform}?currentOnly=0
//
// Regras: métrica ausente não se grava; 403/404 por plataforma vai para notes e
// NÃO conta como erro (plano de teste não cobre todas as plataformas).

import {
  adminClient,
  authorize,
  corsHeaders,
  json,
  ScClient,
} from "../_shared/soundcharts.ts";
import {
  deduceTriggerSource,
  finishSyncRun,
  resolveStatus,
  startSyncRun,
} from "../_shared/sync-run.ts";

const FUNCTION_NAME = "song-soundcharts-sync";
const ROLES = ["admin", "platform_admin", "manager", "editor"];
const MAX_BLOCK_DAYS = 90; // limit máx. 100 pontos por pedido

/** plataforma → métrica gravada em artist_song_metrics_daily */
const SONG_METRIC: Record<string, string> = {
  spotify: "streams",
  youtube: "views",
  deezer: "streams",
  shazam: "shazams",
  tiktok: "videos",
  instagram: "reels",
  youtube_shorts: "videos",
  soundcloud: "plays",
};
const PLATFORMS = Object.keys(SONG_METRIC);
const PLAYLIST_PLATFORMS = ["spotify", "deezer", "youtube"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function addDays(d: string, n: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function buildWindows(startDate: string | null, endDate: string) {
  if (!startDate) return [{ start: null as string | null, end: endDate }];
  const out: Array<{ start: string | null; end: string }> = [];
  let cur = startDate;
  while (cur <= endDate) {
    const blockEnd = addDays(cur, MAX_BLOCK_DAYS - 1);
    const end = blockEnd < endDate ? blockEnd : endDate;
    out.push({ start: cur, end });
    cur = addDays(end, 1);
  }
  return out;
}
function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();
  const startedMs = Date.now();
  let runId: string | null = null;
  let calls = 0;

  try {
    const caller = await authorize(req, admin, ROLES);
    if (!caller.allowed) return json({ error: "Forbidden" }, 403);

    let p: {
      song_id?: string;
      artist_id?: string;
      start_date?: string;
      end_date?: string;
      dry_run?: boolean;
      only_launch?: boolean;
    } = {};
    try {
      p = await req.json();
    } catch {
      p = {};
    }

    const dryRun = p.dry_run !== false; // default true
    if (p.start_date != null && !isDate(p.start_date)) {
      return json({ error: "start_date inválido (YYYY-MM-DD)" }, 400);
    }
    if (p.end_date != null && !isDate(p.end_date)) {
      return json({ error: "end_date inválido (YYYY-MM-DD)" }, 400);
    }
    const endDate = isDate(p.end_date) ? p.end_date : today();
    const startDate = isDate(p.start_date) ? p.start_date : null;
    if (startDate && startDate > endDate) {
      return json({ error: "start_date depois de end_date" }, 400);
    }

    let q = admin
      .from("artist_songs")
      .select("id, company_id, artist_id, title, soundcharts_uuid, is_launch")
      .eq("tracking_status", "ativo")
      .not("soundcharts_uuid", "is", null);
    if (p.song_id) q = q.eq("id", p.song_id);
    if (p.artist_id) q = q.eq("artist_id", p.artist_id);
    if (p.only_launch === true) q = q.eq("is_launch", true);
    const { data: songs, error: sErr } = await q;
    if (sErr) throw new Error(`artist_songs: ${sErr.message}`);

    runId = await startSyncRun(admin, {
      function_name: FUNCTION_NAME,
      trigger_source: deduceTriggerSource(req),
      dry_run: dryRun,
      artist_id: p.artist_id ?? songs?.[0]?.artist_id ?? null,
      company_id: songs?.[0]?.company_id ?? null,
    });

    if (!songs?.length) {
      const empty = {
        songs_processed: 0,
        soundcharts_calls: 0,
        rows_written: 0,
        notes: ["Nenhuma música ativa com UUID Soundcharts para os filtros dados."],
      };
      await finishSyncRun(admin, runId, startedMs, { status: "no_data", details: empty });
      return json(empty);
    }

    const windows = buildWindows(startDate, endDate);
    const client = await ScClient.create();

    // Modo de diagnóstico: devolve as respostas BRUTAS da Soundcharts para uma
    // música, sem escrever nada. Serve para confirmar nomes de campos antes de
    // mapear (nunca inventar campos).
    if ((p as any).debug === true) {
      const scUuid = songs[0].soundcharts_uuid as string;
      const probe = async (path: string) => {
        try {
          return await client.get(path);
        } catch (e) {
          return { __error: (e as Error)?.message ?? String(e) };
        }
      };
      const candidates: string[] = Array.isArray((p as any).probe_platforms)
        ? (p as any).probe_platforms
        : [];
      const probes: Record<string, unknown> = {};
      for (const plat of candidates) {
        const r = await probe(
          `/api/v2/song/${scUuid}/audience/${plat}?endDate=${endDate}&limit=2`,
        );
        probes[plat] = (r as any)?.__error
          ? { error: (r as any).__error }
          : { total: (r as any)?.page?.total ?? null, first: (r as any)?.items?.[0] ?? null };
      }
      const out = {
        debug: true,
        song: { id: songs[0].id, title: songs[0].title, soundcharts_uuid: scUuid },
        platform_probes: probes,
        soundcharts_calls: client.calls,
      };
      await finishSyncRun(admin, runId, startedMs, {
        status: "success",
        api_calls: client.calls,
        details: { debug: true },
      });
      return json(out);
    }
    const errors: Array<{ song_id: string; platform: string; error: string }> = [];
    const notes: string[] = [];
    const perSong: Array<Record<string, unknown>> = [];
    let totalRows = 0;
    let totalPlaylists = 0;

    for (const song of songs) {
      const scUuid = song.soundcharts_uuid as string;
      const metricsBySong: Record<string, number> = {};
      const rows: Array<Record<string, unknown>> = [];

      // ---------------- métricas de audiência por plataforma
      for (const platform of PLATFORMS) {
        try {
          const seen = new Set<string>();
          for (const w of windows) {
            const qs = new URLSearchParams({ endDate: w.end, limit: "100", sort: "asc" });
            if (w.start) qs.set("startDate", w.start);
            const body = await client.get(
              `/api/v2/song/${scUuid}/audience/${platform}?${qs.toString()}`,
            );
            for (const it of body?.items ?? []) {
              const d = it?.date ? String(it.date).slice(0, 10) : null;
              if (!d || seen.has(d)) continue;
              const value = numOrNull(
                it?.value ?? it?.plays ?? it?.streams ?? it?.videoCount ?? it?.playCount,
              );
              if (value === null) continue; // métrica ausente não se grava
              seen.add(d);
              rows.push({
                company_id: song.company_id,
                song_id: song.id,
                artist_id: song.artist_id,
                platform,
                metric: SONG_METRIC[platform],
                metric_date: d,
                value,
                source: "aggregator",
                source_ref: "soundcharts",
                captured_at: new Date().toISOString(),
              });
            }
          }
          metricsBySong[platform] = seen.size;
        } catch (e) {
          const status = (e as { status?: number })?.status;
          if (status === 403 || status === 404) {
            notes.push(`${song.title}: ${platform} sem acesso/sem dados (HTTP ${status})`);
            metricsBySong[platform] = 0;
          } else {
            errors.push({
              song_id: song.id as string,
              platform,
              error: (e as Error)?.message ?? String(e),
            });
          }
        }
      }

      if (!dryRun && rows.length) {
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await admin
            .from("artist_song_metrics_daily")
            .upsert(rows.slice(i, i + 500), {
              onConflict: "song_id,platform,metric,metric_date,source",
            });
          if (error) {
            errors.push({ song_id: song.id as string, platform: "-", error: error.message });
            break;
          }
        }
      }
      totalRows += dryRun ? 0 : rows.length;

      // ---------------- playlists atuais
      let playlistCount = 0;
      for (const platform of PLAYLIST_PLATFORMS) {
        try {
          const body = await client.get(
            `/api/v2.20/song/${scUuid}/playlist/current/${platform}?currentOnly=0&limit=100&sortBy=position&sortOrder=asc`,
          );
          const items = Array.isArray(body?.items) ? body.items : [];
          const upserts = items.map((it: any) => {
            const pl = it?.playlist ?? it;
            return {
              company_id: song.company_id,
              song_id: song.id,
              platform,
              playlist_uuid: String(pl?.uuid ?? pl?.identifier ?? ""),
              playlist_name: pl?.name ?? null,
              playlist_type: pl?.type ?? null,
              owner_name: pl?.curator?.name ?? pl?.owner?.name ?? null,
              subscriber_count: numOrNull(pl?.subscriberCount ?? pl?.followerCount),
              position: numOrNull(it?.position),
              peak_position: numOrNull(it?.peakPosition),
              entry_date: it?.entryDate ? String(it.entryDate).slice(0, 10) : null,
              exit_date: it?.exitDate ? String(it.exitDate).slice(0, 10) : null,
              last_seen_at: new Date().toISOString(),
            };
          }).filter((r: any) => r.playlist_uuid);

          playlistCount += upserts.length;
          if (!dryRun && upserts.length) {
            const { error } = await admin
              .from("artist_song_playlists")
              .upsert(upserts, { onConflict: "song_id,platform,playlist_uuid" });
            if (error) {
              errors.push({ song_id: song.id as string, platform, error: error.message });
            }
          }
        } catch (e) {
          const status = (e as { status?: number })?.status;
          if (status === 403 || status === 404) {
            notes.push(`${song.title}: playlists ${platform} sem acesso/sem dados (HTTP ${status})`);
          } else {
            errors.push({
              song_id: song.id as string,
              platform: `playlist:${platform}`,
              error: (e as Error)?.message ?? String(e),
            });
          }
        }
      }
      totalPlaylists += dryRun ? 0 : playlistCount;

      perSong.push({
        song_id: song.id,
        title: song.title,
        is_launch: song.is_launch,
        points_by_platform: metricsBySong,
        metric_rows: rows.length,
        playlists: playlistCount,
      });
    }

    calls = client.calls;
    const summary = {
      dry_run: dryRun,
      songs_processed: songs.length,
      soundcharts_calls: calls,
      rows_written: totalRows,
      playlists_written: totalPlaylists,
      window: { start_date: startDate, end_date: endDate },
      songs: perSong,
      notes,
      errors,
    };

    await finishSyncRun(admin, runId, startedMs, {
      status: dryRun
        ? (errors.length ? "partial" : "success")
        : resolveStatus(totalRows + totalPlaylists, errors.length),
      api_calls: calls,
      rows_written: totalRows + totalPlaylists,
      details: summary,
    });

    return json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${FUNCTION_NAME}]`, msg);
    await finishSyncRun(admin, runId, startedMs, {
      status: "error",
      api_calls: calls,
      error_text: msg,
    });
    return json({ error: msg }, 500);
  }
});
