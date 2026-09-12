// artist-shorts-sync — vídeos curtos (TikTok / YouTube Shorts / Reels) do
// próprio artista, via Soundcharts, ligados à obra (artist_songs).
//
// POST {
//   artist_id?: uuid,
//   platforms?: string[]   (default ['tiktok','youtube','instagram'])
//   dry_run?: boolean      (default true)
//   max_videos?: number    (default 200, por plataforma e por artista)
// }
//
// Endpoint: GET /api/v2/artist/{uuid}/shorts/{platform}/videos?offset&limit=100
//
// Regras: nunca inventar valores (métrica ausente não se grava); 403/404 por
// plataforma vai para notes e NÃO conta como erro; chamadas contadas em
// sync_runs.api_calls.
//
// Instagram: os Reels oficiais já entram por artist-instagram-sync com
// source='platform_api' e external_id do Graph. Aqui NÃO se duplica: se já
// existir conteúdo com o mesmo permalink, apenas se completa song_id /
// sound_name / sound_external_id no registo oficial.

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

const FUNCTION_NAME = "artist-shorts-sync";
const ROLES = ["admin", "platform_admin", "manager", "editor"];
const DEFAULT_PLATFORMS = ["tiktok", "youtube", "instagram"];
const PAGE_LIMIT = 100;
const SOURCE = "aggregator";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Um vídeo da Soundcharts na forma que gravamos. Só o que a API mandar. */
interface MappedVideo {
  external_id: string;
  permalink: string | null;
  title: string | null;
  caption_excerpt: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  author_handle: string | null;
  song_uuid: string | null;
  sound_name: string | null;
  sound_external_id: string | null;
  metrics: Record<string, number>;
}

function mapVideo(raw: any): MappedVideo | null {
  const external_id = str(
    raw?.identifier ?? raw?.videoId ?? raw?.id ?? raw?.uuid ?? raw?.url,
  );
  if (!external_id) return null;

  const audience = raw?.audience ?? raw?.metrics ?? raw ?? {};
  const metrics: Record<string, number> = {};
  const pick = (metric: string, ...candidates: unknown[]) => {
    for (const c of candidates) {
      const n = numOrNull(c);
      if (n !== null) {
        metrics[metric] = n;
        return;
      }
    }
  };
  pick("views", audience?.viewCount, audience?.views, audience?.playCount, raw?.viewCount);
  pick("likes", audience?.likeCount, audience?.likes, raw?.likeCount);
  pick("comments", audience?.commentCount, audience?.comments, raw?.commentCount);
  pick("shares", audience?.shareCount, audience?.shares, raw?.shareCount);

  const song = raw?.song ?? raw?.track ?? null;
  const sound = raw?.sound ?? raw?.music ?? null;
  const publishedRaw = raw?.postDate ?? raw?.publishedAt ?? raw?.publishDate ??
    raw?.createdAt ?? raw?.date ?? null;
  let published_at: string | null = null;
  if (publishedRaw) {
    const d = new Date(String(publishedRaw));
    if (!Number.isNaN(d.getTime())) published_at = d.toISOString();
  }

  const caption = str(raw?.description ?? raw?.caption ?? raw?.text);

  return {
    external_id,
    permalink: str(raw?.url ?? raw?.permalink ?? raw?.link),
    title: str(raw?.title ?? raw?.name) ?? (caption ? caption.slice(0, 120) : null),
    caption_excerpt: caption ? caption.slice(0, 500) : null,
    thumbnail_url: str(raw?.thumbnailUrl ?? raw?.imageUrl ?? raw?.thumbnail),
    published_at,
    duration_seconds: numOrNull(raw?.duration ?? raw?.durationSeconds ?? raw?.lengthSeconds),
    author_handle: str(raw?.authorHandle ?? raw?.author?.handle ?? raw?.author?.name ?? raw?.creator?.name),
    song_uuid: str(song?.uuid ?? song?.songUUID ?? raw?.songUUID),
    sound_name: str(sound?.name ?? sound?.title ?? song?.name ?? song?.title),
    sound_external_id: str(sound?.identifier ?? sound?.id ?? sound?.uuid),
    metrics,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();
  const startedMs = Date.now();
  let runId: string | null = null;
  let calls = 0;

  try {
    const caller = await authorize(req, admin, ROLES);
    if (!caller.allowed) return json({ error: "Forbidden" }, 403);

    let p: {
      artist_id?: string;
      platforms?: string[];
      dry_run?: boolean;
      max_videos?: number;
    } = {};
    try {
      p = await req.json();
    } catch {
      p = {};
    }

    const dryRun = p.dry_run !== false; // default true
    const platforms = Array.isArray(p.platforms) && p.platforms.length
      ? p.platforms.map((x) => String(x))
      : DEFAULT_PLATFORMS;
    const maxVideos = Math.max(1, Math.min(2000, Number(p.max_videos) || 200));

    // Artistas de elenco com canal aggregator (uuid Soundcharts em external_id).
    let aq = admin
      .from("artists")
      .select("id, company_id, name, roster_type")
      .eq("roster_type", "elenco");
    if (p.artist_id) aq = aq.eq("id", p.artist_id);
    const { data: artistRows, error: aErr } = await aq;
    if (aErr) throw new Error(`artists: ${aErr.message}`);

    const ids = (artistRows ?? []).map((a: any) => a.id);
    const uuidByArtist = new Map<string, string>();
    if (ids.length) {
      const { data: chans, error: cErr } = await admin
        .from("artist_channels")
        .select("artist_id, external_id")
        .eq("platform", "aggregator")
        .in("artist_id", ids)
        .not("external_id", "is", null);
      if (cErr) throw new Error(`artist_channels: ${cErr.message}`);
      for (const c of chans ?? []) uuidByArtist.set(c.artist_id as string, c.external_id as string);
    }
    const artists = (artistRows ?? []).filter((a: any) => uuidByArtist.has(a.id));

    runId = await startSyncRun(admin, {
      function_name: FUNCTION_NAME,
      trigger_source: deduceTriggerSource(req),
      dry_run: dryRun,
      artist_id: p.artist_id ?? artists[0]?.id ?? null,
      company_id: artists[0]?.company_id ?? null,
    });

    if (!artists.length) {
      const empty = {
        artists_processed: 0,
        soundcharts_calls: 0,
        rows_written: 0,
        notes: ["Nenhum artista de elenco com canal aggregator para os filtros dados."],
      };
      await finishSyncRun(admin, runId, startedMs, { status: "no_data", details: empty });
      return json(empty);
    }

    const client = await ScClient.create();
    const metricDate = today();
    const notes: string[] = [];
    const errors: Array<{ artist_id: string; platform: string; error: string }> = [];
    const rawSamples: Record<string, unknown> = {};
    const perArtist: Array<Record<string, unknown>> = [];
    let totalRows = 0;

    for (const artist of artists) {
      const scUuid = uuidByArtist.get(artist.id)!;

      // uuid Soundcharts da música → id interno, para ligar o vídeo à obra.
      const { data: songRows } = await admin
        .from("artist_songs")
        .select("id, title, soundcharts_uuid")
        .eq("artist_id", artist.id)
        .not("soundcharts_uuid", "is", null);
      const songByUuid = new Map<string, { id: string; title: string }>();
      for (const s of songRows ?? []) {
        songByUuid.set(s.soundcharts_uuid as string, { id: s.id as string, title: s.title as string });
      }

      const seenByPlatform: Record<string, number> = {};
      const newByPlatform: Record<string, number> = {};
      const linkedByPlatform: Record<string, number> = {};
      const topByPlatform: Record<string, unknown[]> = {};
      let artistRowsWritten = 0;

      for (const platform of platforms) {
        try {
          const videos: MappedVideo[] = [];
          let offset = 0;
          while (videos.length < maxVideos) {
            const qs = new URLSearchParams({
              offset: String(offset),
              limit: String(PAGE_LIMIT),
            });
            const body = await client.get(
              `/api/v2/artist/${scUuid}/shorts/${platform}/videos?${qs.toString()}`,
            );
            const items = Array.isArray(body?.items) ? body.items : [];
            if (!rawSamples[platform] && items.length) rawSamples[platform] = items[0];
            for (const it of items) {
              const m = mapVideo(it);
              if (m) videos.push(m);
              if (videos.length >= maxVideos) break;
            }
            if (items.length < PAGE_LIMIT) break;
            offset += PAGE_LIMIT;
          }
          seenByPlatform[platform] = videos.length;
          if (!videos.length) continue;

          // Conteúdo já existente: por external_id (mesma origem) e por
          // permalink (o Reel oficial do Instagram tem outro external_id).
          const { data: existing } = await admin
            .from("artist_content")
            .select("id, external_id, permalink, source, song_id")
            .eq("artist_id", artist.id)
            .eq("platform", platform);
          const byExternal = new Map<string, any>();
          const byPermalink = new Map<string, any>();
          for (const e of existing ?? []) {
            byExternal.set(e.external_id as string, e);
            if (e.permalink) byPermalink.set(String(e.permalink), e);
          }

          const toUpsert: Array<Record<string, unknown>> = [];
          const enrichOnly: Array<{ id: string; patch: Record<string, unknown> }> = [];
          // external_id do nosso registo → métricas do dia
          const metricsByExternal: Array<{ key: string; metrics: Record<string, number> }> = [];

          for (const v of videos) {
            const song = v.song_uuid ? songByUuid.get(v.song_uuid) ?? null : null;
            if (song) linkedByPlatform[platform] = (linkedByPlatform[platform] ?? 0) + 1;

            const official = platform === "instagram" && v.permalink
              ? byPermalink.get(v.permalink)
              : undefined;
            if (official && official.source === "platform_api") {
              // Não duplicar o Reel oficial: só completar a ligação à obra.
              const patch: Record<string, unknown> = {};
              if (song && !official.song_id) patch.song_id = song.id;
              if (v.sound_name) patch.sound_name = v.sound_name;
              if (v.sound_external_id) patch.sound_external_id = v.sound_external_id;
              if (Object.keys(patch).length) enrichOnly.push({ id: official.id, patch });
              continue;
            }

            if (!byExternal.has(v.external_id)) {
              newByPlatform[platform] = (newByPlatform[platform] ?? 0) + 1;
            }
            toUpsert.push({
              company_id: artist.company_id,
              artist_id: artist.id,
              platform,
              external_id: v.external_id,
              content_type: platform === "instagram" ? "reel" : "short",
              permalink: v.permalink,
              title: v.title,
              caption_excerpt: v.caption_excerpt,
              thumbnail_url: v.thumbnail_url,
              published_at: v.published_at,
              duration_seconds: v.duration_seconds,
              author_handle: v.author_handle,
              song_id: song?.id ?? null,
              sound_name: v.sound_name,
              sound_external_id: v.sound_external_id,
              source: SOURCE,
              updated_at: new Date().toISOString(),
            });
            if (Object.keys(v.metrics).length) {
              metricsByExternal.push({ key: v.external_id, metrics: v.metrics });
            }
          }

          if (!dryRun) {
            for (let i = 0; i < toUpsert.length; i += 300) {
              const { error } = await admin
                .from("artist_content")
                .upsert(toUpsert.slice(i, i + 300), {
                  onConflict: "artist_id,platform,external_id",
                });
              if (error) {
                errors.push({ artist_id: artist.id, platform, error: error.message });
                break;
              }
            }
            for (const e of enrichOnly) {
              const { error } = await admin
                .from("artist_content")
                .update({ ...e.patch, updated_at: new Date().toISOString() })
                .eq("id", e.id);
              if (error) errors.push({ artist_id: artist.id, platform, error: error.message });
            }

            // ids internos para as métricas do dia
            const { data: saved } = await admin
              .from("artist_content")
              .select("id, external_id")
              .eq("artist_id", artist.id)
              .eq("platform", platform);
            const idByExternal = new Map<string, string>();
            for (const s of saved ?? []) idByExternal.set(s.external_id as string, s.id as string);

            const metricRows: Array<Record<string, unknown>> = [];
            for (const m of metricsByExternal) {
              const contentId = idByExternal.get(m.key);
              if (!contentId) continue;
              for (const [metric, value] of Object.entries(m.metrics)) {
                metricRows.push({
                  company_id: artist.company_id,
                  content_id: contentId,
                  artist_id: artist.id,
                  platform,
                  metric,
                  metric_date: metricDate,
                  value,
                  source: SOURCE,
                  captured_at: new Date().toISOString(),
                });
              }
            }
            for (let i = 0; i < metricRows.length; i += 500) {
              const { error } = await admin
                .from("artist_content_metrics_daily")
                .upsert(metricRows.slice(i, i + 500), {
                  onConflict: "content_id,metric,metric_date,source",
                });
              if (error) {
                errors.push({ artist_id: artist.id, platform, error: error.message });
                break;
              }
            }
            artistRowsWritten += toUpsert.length + metricRows.length;
          }

          topByPlatform[platform] = [...videos]
            .sort((a, b) => (b.metrics.views ?? 0) - (a.metrics.views ?? 0))
            .slice(0, 5)
            .map((v) => ({
              title: v.title,
              published_at: v.published_at,
              views: v.metrics.views ?? null,
              likes: v.metrics.likes ?? null,
              sound_name: v.sound_name,
              song_ligada: v.song_uuid ? songByUuid.get(v.song_uuid)?.title ?? null : null,
            }));
        } catch (e) {
          const status = (e as { status?: number })?.status;
          if (status === 403 || status === 404) {
            notes.push(`${artist.name}: ${platform} sem acesso/sem dados (HTTP ${status})`);
            seenByPlatform[platform] = 0;
          } else {
            errors.push({
              artist_id: artist.id,
              platform,
              error: (e as Error)?.message ?? String(e),
            });
          }
        }
      }

      totalRows += artistRowsWritten;
      perArtist.push({
        artist_id: artist.id,
        name: artist.name,
        videos_by_platform: seenByPlatform,
        new_by_platform: newByPlatform,
        linked_to_song_by_platform: linkedByPlatform,
        rows_written: artistRowsWritten,
        top5_by_views: topByPlatform,
      });
    }

    calls = client.calls;
    const summary = {
      dry_run: dryRun,
      metric_date: metricDate,
      platforms,
      max_videos: maxVideos,
      artists_processed: artists.length,
      soundcharts_calls: calls,
      rows_written: totalRows,
      artists: perArtist,
      raw_sample_por_plataforma: rawSamples,
      notes,
      errors,
    };

    await finishSyncRun(admin, runId, startedMs, {
      status: dryRun
        ? (errors.length ? "partial" : "success")
        : resolveStatus(totalRows, errors.length),
      api_calls: calls,
      rows_written: totalRows,
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
