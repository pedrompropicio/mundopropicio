// artist-song-youtube-public-sync — estatísticas PÚBLICAS do YouTube (Data API v3,
// chave de API YOUTUBE_PUBLIC_API_KEY, sem OAuth). D-ERP150.
//
// Body (tudo opcional): { artist_id, videos:[{video_id, song_id}], channel_id, dry_run }
//  - vídeos → public.artist_song_metrics_daily (song_id obrigatório no schema):
//      platform 'youtube', source 'youtube_public', source_ref = video_id,
//      metric 'youtube_views' / 'youtube_likes', metric_date = hoje UTC.
//  - canal → public.artist_metrics_daily (nível artista, channel_id = artist_channels.id):
//      metric 'youtube_subscribers' (+ 'youtube_channel_views', 'youtube_video_count').
// Nunca grava 0 quando a API não devolve o campo. dry_run por omissão TRUE.
// Auth: service_role (cron) ou admin/manager/marketing_manager/platform_admin.

import { adminClient } from "../_shared/artist-meta.ts";
import { deduceTriggerSource, finishSyncRun, resolveStatus, startSyncRun } from "../_shared/sync-run.ts";

const FN = "artist-song-youtube-public-sync";
const API = "https://www.googleapis.com/youtube/v3";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VID_RE = /^[A-Za-z0-9_-]{11}$/;
const CH_RE = /^UC[A-Za-z0-9_-]{22}$/;
const ROLES = new Set(["admin", "manager", "marketing_manager"]);

// Omissão: Litto Lins — vídeo oficial "ROUPA DE SOLTEIRA" → lançamento "Roupa De Solteira - Ao Vivo".
const DEFAULT_ARTIST = "b1a53be0-e8a8-45c0-bc32-5eea23f477ed";
const DEFAULT_VIDEOS: Record<string, { video_id: string; song_id: string }[]> = {
  [DEFAULT_ARTIST]: [{ video_id: "-QYQprJcAgU", song_id: "74c40d7b-357b-4311-acbe-eb9bfa7ba7c7" }],
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function isServiceRole(bearer: string): boolean {
  try {
    if (JSON.parse(atob(bearer.split(".")[1] ?? ""))?.role === "service_role") return true;
  } catch (_e) { /* não-JWT */ }
  return bearer === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "\u0000");
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "método" }, 405);
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "sem sessão" }, 401);
  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => ({}));
  const artistId = body?.artist_id ?? DEFAULT_ARTIST;
  if (typeof artistId !== "string" || !UUID_RE.test(artistId)) return json({ ok: false, error: "artist_id inválido" }, 400);
  const dryRun = body?.dry_run !== false;
  const key = Deno.env.get("YOUTUBE_PUBLIC_API_KEY");
  if (!key) return json({ ok: false, error: "YOUTUBE_PUBLIC_API_KEY não configurada" }, 500);

  const admin = adminClient();
  const { data: artist, error: aErr } = await admin.from("artists").select("id, company_id").eq("id", artistId).maybeSingle();
  if (aErr || !artist) return json({ ok: false, error: "artista não encontrado" }, 404);

  if (!isServiceRole(bearer)) {
    const { data: u, error } = await admin.auth.getUser(bearer);
    if (error || !u?.user) return json({ ok: false, error: "sessão inválida" }, 401);
    const { data: roles } = await admin.from("user_roles").select("role, company_id").eq("user_id", u.user.id);
    // deno-lint-ignore no-explicit-any
    const ok = (roles ?? []).some((r: any) => r.role === "platform_admin" || (ROLES.has(r.role) && r.company_id === artist.company_id));
    if (!ok) return json({ ok: false, error: "sem permissão" }, 403);
  }

  // Vídeos
  let videos: { video_id: string; song_id: string }[] = Array.isArray(body?.videos) ? body.videos : (DEFAULT_VIDEOS[artistId] ?? []);
  videos = videos.filter((v) => v && VID_RE.test(String(v.video_id)) && UUID_RE.test(String(v.song_id)));
  if (videos.length > 50) return json({ ok: false, error: "máximo 50 vídeos por chamada" }, 400);
  if (videos.length) {
    const { data: songs } = await admin.from("artist_songs").select("id").eq("artist_id", artistId).in("id", videos.map((v) => v.song_id));
    const valid = new Set((songs ?? []).map((s: { id: string }) => s.id));
    videos = videos.filter((v) => valid.has(v.song_id));
  }

  // Canal
  const { data: ch } = await admin.from("artist_channels").select("id, external_id")
    .eq("artist_id", artistId).eq("platform", "youtube").is("revoked_at", null).limit(1).maybeSingle();
  const channelExt: string | null = body?.channel_id ?? ch?.external_id ?? null;
  if (channelExt !== null && !CH_RE.test(channelExt)) return json({ ok: false, error: "channel_id inválido" }, 400);

  const started = Date.now();
  const runId = await startSyncRun(admin, {
    function_name: FN, trigger_source: deduceTriggerSource(req), dry_run: dryRun,
    company_id: artist.company_id, artist_id: artistId,
  });
  const notes: string[] = [];
  let apiCalls = 0, errors = 0, written = 0;
  const now = new Date();
  const hoje = now.toISOString().slice(0, 10);
  // deno-lint-ignore no-explicit-any
  const songRows: any[] = [], artistRows: any[] = [];

  try {
    if (videos.length) {
      apiCalls++;
      const q = new URLSearchParams({ part: "statistics,snippet", id: videos.map((v) => v.video_id).join(","), key });
      const r = await fetch(`${API}/videos?${q}`, { signal: AbortSignal.timeout(20_000) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { errors++; notes.push(`videos.list HTTP ${r.status}: ${j?.error?.message ?? ""}`.trim()); }
      else {
        // deno-lint-ignore no-explicit-any
        const byId = new Map<string, any>((j?.items ?? []).map((i: any) => [i.id, i]));
        for (const v of videos) {
          const it = byId.get(v.video_id);
          if (!it) { notes.push(`vídeo ${v.video_id} não devolvido pela API`); continue; }
          const base = {
            company_id: artist.company_id, artist_id: artistId, song_id: v.song_id,
            platform: "youtube", source: "youtube_public", source_ref: v.video_id,
            metric_date: hoje, captured_at: now.toISOString(),
          };
          const views = num(it.statistics?.viewCount), likes = num(it.statistics?.likeCount);
          if (views !== null) songRows.push({ ...base, metric: "youtube_views", value: views });
          else notes.push(`vídeo ${v.video_id} sem viewCount`);
          if (likes !== null) songRows.push({ ...base, metric: "youtube_likes", value: likes });
          else notes.push(`vídeo ${v.video_id} sem likeCount (ocultos?)`);
        }
      }
    } else notes.push("sem vídeos configurados");

    if (channelExt) {
      apiCalls++;
      const q = new URLSearchParams({ part: "statistics", id: channelExt, key });
      const r = await fetch(`${API}/channels?${q}`, { signal: AbortSignal.timeout(20_000) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { errors++; notes.push(`channels.list HTTP ${r.status}: ${j?.error?.message ?? ""}`.trim()); }
      else {
        const st = j?.items?.[0]?.statistics;
        if (!st) notes.push("canal não devolvido pela API");
        else {
          const base = {
            company_id: artist.company_id, artist_id: artistId, channel_id: ch?.external_id === channelExt ? ch.id : null,
            platform: "youtube", source: "youtube_public", source_ref: channelExt,
            metric_date: hoje, captured_at: now.toISOString(),
          };
          const subs = st.hiddenSubscriberCount ? null : num(st.subscriberCount);
          if (subs !== null) artistRows.push({ ...base, metric: "youtube_subscribers", value: subs });
          else notes.push("subscritores ocultos/ausentes — não gravado");
          const cv = num(st.viewCount), vc = num(st.videoCount);
          if (cv !== null) artistRows.push({ ...base, metric: "youtube_channel_views", value: cv });
          if (vc !== null) artistRows.push({ ...base, metric: "youtube_video_count", value: vc });
        }
      }
    } else notes.push("sem channel_id do YouTube");

    if (!dryRun) {
      if (songRows.length) {
        const { error } = await admin.from("artist_song_metrics_daily")
          .upsert(songRows, { onConflict: "song_id,platform,metric,metric_date,source" });
        if (error) { errors++; notes.push(`upsert vídeos: ${error.message}`); } else written += songRows.length;
      }
      if (artistRows.length) {
        const { error } = await admin.from("artist_metrics_daily")
          .upsert(artistRows, { onConflict: "artist_id,platform,metric,metric_date,source" });
        if (error) { errors++; notes.push(`upsert canal: ${error.message}`); } else written += artistRows.length;
      }
    }
    const status = resolveStatus(written, errors);
    const details = { hoje, videos: videos.map((v) => v.video_id), channel: channelExt, notes };
    await finishSyncRun(admin, runId, started, { status, api_calls: apiCalls, rows_written: written, details, error_text: errors ? notes.join(" | ") : null });
    return json({
      ok: errors === 0, dry_run: dryRun, status, api_calls: apiCalls, written,
      amostra: [...songRows, ...artistRows].map(({ metric, source_ref, value }) => ({ metric, source_ref, value })), notes,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await finishSyncRun(admin, runId, started, { status: "error", api_calls: apiCalls, rows_written: written, error_text: msg });
    return json({ ok: false, error: msg }, 500);
  }
});
