// artist-song-youtube-public-sync — estatísticas PÚBLICAS do YouTube (Data API v3,
// chave de API YOUTUBE_PUBLIC_API_KEY, sem OAuth). D-ERP150.
//
// Body (tudo opcional): { artist_id, videos:[{video_id, song_id}], channel_id, dry_run }
//  - vídeos → public.artist_song_metrics_daily (song_id obrigatório no schema):
//      platform 'youtube', source 'youtube_public', source_ref = video_id,
//      metric 'youtube_views' / 'youtube_likes', metric_date = hoje UTC.
//  - canal → public.artist_metrics_daily (nível artista, channel_id = artist_channels.id):
//      metric 'youtube_subscribers' (+ 'youtube_channel_views', 'youtube_video_count').
// D-ERP169: descobre uploads do canal (≤200) + vídeos youtube_public já rastreados
//   (collabs por id) → artist_content (video >180 s / short) e artist_content_metrics_daily.
// Nunca grava 0 quando a API não devolve o campo. dry_run por omissão TRUE.
// Auth: service_role (cron) ou admin/manager/marketing_manager/platform_admin.

import { adminClient } from "../_shared/artist-meta.ts";
import { deduceTriggerSource, finishSyncRun, resolveStatus, startSyncRun } from "../_shared/sync-run.ts";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";

import { fetchAllPagedQuery } from "../_shared/paging.ts";
const FN = "artist-song-youtube-public-sync";
const API = "https://www.googleapis.com/youtube/v3";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VID_RE = /^[A-Za-z0-9_-]{11}$/;
const CH_RE = /^UC[A-Za-z0-9_-]{22}$/;
const MAX_UPLOADS = 200;
const ROLES = new Set(["admin", "manager", "marketing_manager"]);

// Omissão: Litto Lins — vídeo oficial "ROUPA DE SOLTEIRA" → lançamento "Roupa De Solteira - Ao Vivo".
const DEFAULT_ARTIST = "b1a53be0-e8a8-45c0-bc32-5eea23f477ed";
const DEFAULT_VIDEOS: Record<string, { video_id: string; song_id: string }[]> = {
  [DEFAULT_ARTIST]: [{ video_id: "-QYQprJcAgU", song_id: "74c40d7b-357b-4311-acbe-eb9bfa7ba7c7" }],
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// #283 resto (D-ERP229): service role verificada no Auth (isServiceRoleRequest), nunca pelo payload.
function isServiceRole(req: Request): Promise<boolean> {
  return isServiceRoleRequest(req);
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** ISO-8601 (PT#H#M#S / P#DT…) → segundos; null se ausente/ilegível. */
function isoDuration(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "método" }, 405);
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "sem sessão" }, 401);
  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => ({}));
  // D-ERP169 adenda: modo "todos" (sem artist_id ou all:true) → uma invocação por artista.
  if (body?.all === true || body?.artist_id === undefined) {
    if (!(await isServiceRole(req))) return json({ ok: false, error: "modo todos só para service_role" }, 403);
    const admin0 = adminClient();
    const { data: chs } = await admin0.from("artist_channels").select("artist_id, artists!inner(id, name, status, roster_type)")
      .eq("platform", "youtube").is("revoked_at", null).eq("artists.roster_type", "elenco").neq("artists.status", "inativo");
    const ids = [...new Set((chs ?? []).map((c: { artist_id: string }) => c.artist_id))];
    const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${FN}`;
    const results = [];
    for (const id of ids) {
      const r = await fetch(self, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ artist_id: id, dry_run: body?.dry_run === false ? false : body?.dry_run ?? false }),
      });
      results.push({ artist_id: id, http: r.status, resultado: await r.json().catch(() => null) });
    }
    return json({ ok: results.every((r) => r.http === 200), modo: "todos", artistas: ids.length, results });
  }
  const artistId = body?.artist_id;
  if (typeof artistId !== "string" || !UUID_RE.test(artistId)) return json({ ok: false, error: "artist_id inválido" }, 400);
  const dryRun = body?.dry_run !== false;
  const key = Deno.env.get("YOUTUBE_PUBLIC_API_KEY");
  if (!key) return json({ ok: false, error: "YOUTUBE_PUBLIC_API_KEY não configurada" }, 500);

  const admin = adminClient();
  const { data: artist, error: aErr } = await admin.from("artists").select("id, company_id").eq("id", artistId).maybeSingle();
  if (aErr || !artist) return json({ ok: false, error: "artista não encontrado" }, 404);

  if (!(await isServiceRole(req))) {
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
  // deno-lint-ignore no-explicit-any
  let discovery: Record<string, any> = {};

  try {
    // D-ERP169 — descoberta: uploads do canal + vídeos já rastreados (youtube_public) + configurados.
    let uploadsPlaylist: string | null = null;
    if (channelExt) {
      apiCalls++;
      const q = new URLSearchParams({ part: "statistics,contentDetails", id: channelExt, key });
      const r = await fetch(`${API}/channels?${q}`, { signal: AbortSignal.timeout(20_000) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { errors++; notes.push(`channels.list HTTP ${r.status}: ${j?.error?.message ?? ""}`.trim()); }
      else {
        const it = j?.items?.[0];
        uploadsPlaylist = it?.contentDetails?.relatedPlaylists?.uploads ?? null;
        const st = it?.statistics;
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

    const uploadIds: string[] = [];
    if (uploadsPlaylist) {
      let pageToken = "";
      while (uploadIds.length < MAX_UPLOADS) {
        apiCalls++;
        const q = new URLSearchParams({ part: "contentDetails", playlistId: uploadsPlaylist, maxResults: "50", key });
        if (pageToken) q.set("pageToken", pageToken);
        const r = await fetch(`${API}/playlistItems?${q}`, { signal: AbortSignal.timeout(20_000) });
        const j = await r.json().catch(() => null);
        if (!r.ok) { errors++; notes.push(`playlistItems.list HTTP ${r.status}: ${j?.error?.message ?? ""}`.trim()); break; }
        // deno-lint-ignore no-explicit-any
        for (const i of (j?.items ?? []) as any[]) {
          const vid = i?.contentDetails?.videoId;
          if (vid && VID_RE.test(vid) && uploadIds.length < MAX_UPLOADS) uploadIds.push(vid);
        }
        pageToken = j?.nextPageToken ?? "";
        if (!pageToken) break;
      }
    }

    const { data: tracked } = await fetchAllPagedQuery(admin.from("artist_content").select("external_id")
      .eq("artist_id", artistId).eq("platform", "youtube").eq("source", "youtube_public"));
    const uploadSet = new Set(uploadIds);
    const trackedIds = (tracked ?? []).map((t: { external_id: string }) => t.external_id).filter((x: string) => VID_RE.test(x));
    const allIds = [...new Set([...uploadIds, ...trackedIds, ...videos.map((v) => v.video_id)])];

    // deno-lint-ignore no-explicit-any
    const byId = new Map<string, any>();
    for (let i = 0; i < allIds.length; i += 50) {
      apiCalls++;
      const q = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: allIds.slice(i, i + 50).join(","), key });
      const r = await fetch(`${API}/videos?${q}`, { signal: AbortSignal.timeout(20_000) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { errors++; notes.push(`videos.list HTTP ${r.status}: ${j?.error?.message ?? ""}`.trim()); continue; }
      // deno-lint-ignore no-explicit-any
      for (const it of (j?.items ?? []) as any[]) byId.set(it.id, it);
    }

    // Escrita legada em artist_song_metrics_daily (mantida).
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

    // artist_content + artist_content_metrics_daily
    const { data: existing } = allIds.length
      ? await fetchAllPagedQuery(admin.from("artist_content").select("id, external_id, source, duration_seconds")
        .eq("artist_id", artistId).eq("platform", "youtube").in("external_id", allIds))
      : { data: [] };
    // deno-lint-ignore no-explicit-any
    const exByExt = new Map<string, any>((existing ?? []).map((e: any) => [e.external_id, e]));
    // deno-lint-ignore no-explicit-any
    const inserts: any[] = [], updates: any[] = [], durOnly: { id: string; d: number }[] = [];
    let novos = 0, longos = 0, collabs = 0;
    const via = { aggregator: 0, head_shorts: 0, head_watch: 0, duracao: 0 };
    // (b) HEAD a /shorts/<id> sem seguir redirects, em lotes de 20.
    const headType = new Map<string, "short" | "video">();
    const needHead = allIds.filter((id) => byId.has(id) && (exByExt.get(id)?.source ?? "youtube_public") === "youtube_public");
    for (let i = 0; i < needHead.length; i += 20) {
      await Promise.all(needHead.slice(i, i + 20).map(async (id) => {
        try {
          const r = await fetch(`https://www.youtube.com/shorts/${id}`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(6_000) });
          if (r.status === 200) headType.set(id, "short");
          else if (r.status >= 300 && r.status < 400 && /\/watch/.test(r.headers.get("location") ?? "")) headType.set(id, "video");
        } catch (_e) { /* ambíguo → duração */ }
      }));
    }
    // deno-lint-ignore no-explicit-any
    const novosLista: any[] = [];
    const classify = (id: string, dur: number | null): "short" | "video" => {
      const h = headType.get(id);
      if (h === "short") { via.head_shorts++; return "short"; }
      if (h === "video") { via.head_watch++; return "video"; }
      via.duracao++;
      return dur !== null && dur <= 60 ? "short" : "video";
    };
    for (const id of allIds) {
      const it = byId.get(id);
      if (!it) continue;
      const exA = exByExt.get(id);
      if (exA && exA.source !== "youtube_public") {
        // (a) já existe como linha aggregator (shorts Soundcharts) → short; não se toca.
        via.aggregator++;
        if (exA.duration_seconds === null) { const d0 = isoDuration(it.contentDetails?.duration); if (d0 !== null) durOnly.push({ id: exA.id, d: d0 }); }
        if (it.snippet?.channelId && it.snippet.channelId !== channelExt) collabs++;
        continue;
      }
      const sn = it.snippet ?? {};
      const dur = isoDuration(it.contentDetails?.duration);
      if (sn.channelId && sn.channelId !== channelExt) collabs++;
      const row = {
        company_id: artist.company_id, artist_id: artistId, platform: "youtube", external_id: id,
        content_type: classify(id, dur),
        source: "youtube_public", title: sn.title ?? null,
        permalink: `https://www.youtube.com/watch?v=${id}`,
        published_at: sn.publishedAt ?? null, duration_seconds: dur,
        thumbnail_url: sn.thumbnails?.high?.url ?? sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url ?? null,
        author_handle: sn.channelTitle ?? null, updated_at: now.toISOString(),
      };
      const ex = exByExt.get(id);
      if (!ex) {
        inserts.push(row); novos++;
        if (row.content_type === "video") longos++;
        novosLista.push({ id, tipo: row.content_type, titulo: row.title, views: num(it.statistics?.viewCount) });
      } else if (ex.source === "youtube_public") updates.push(row);

    }

    let contentWritten = 0;
    if (!dryRun) {
      if (inserts.length) {
        const { error } = await admin.from("artist_content").insert(inserts);
        if (error) { errors++; notes.push(`insert artist_content: ${error.message}`); } else contentWritten += inserts.length;
      }
      if (updates.length) {
        // upsert só com metadados — nunca song_id/song_link_status (D-ERP53)
        const { error } = await admin.from("artist_content").upsert(updates, { onConflict: "artist_id,platform,external_id" });
        if (error) { errors++; notes.push(`update artist_content: ${error.message}`); } else contentWritten += updates.length;
      }
      for (const d of durOnly) {
        const { error } = await admin.from("artist_content").update({ duration_seconds: d.d }).eq("id", d.id).is("duration_seconds", null);
        if (error) { errors++; notes.push(`duração ${d.id}: ${error.message}`); } else contentWritten++;
      }
      // Métricas só para linhas youtube_public (as shorts da Soundcharts têm as suas — evita contar a dobrar).
      const { data: pub } = allIds.length
        ? await fetchAllPagedQuery(admin.from("artist_content").select("id, external_id")
          .eq("artist_id", artistId).eq("platform", "youtube").eq("source", "youtube_public").in("external_id", allIds))
        : { data: [] };
      // deno-lint-ignore no-explicit-any
      const mRows: any[] = [];
      for (const p of (pub ?? []) as { id: string; external_id: string }[]) {
        const st = byId.get(p.external_id)?.statistics;
        if (!st) continue;
        for (const [metric, f] of [["views", "viewCount"], ["likes", "likeCount"], ["comments", "commentCount"]]) {
          const v = num(st[f]);
          if (v !== null) mRows.push({
            company_id: artist.company_id, content_id: p.id, artist_id: artistId, platform: "youtube",
            metric, metric_date: hoje, value: v, source: "youtube_public", captured_at: now.toISOString(),
          });
        }
      }
      for (let i = 0; i < mRows.length; i += 500) {
        const { error } = await admin.from("artist_content_metrics_daily")
          .upsert(mRows.slice(i, i + 500), { onConflict: "content_id,metric,metric_date,source" });
        if (error) { errors++; notes.push(`métricas conteúdo: ${error.message}`); break; }
      }
      contentWritten += mRows.length;
      if (inserts.length) {
        const { error } = await admin.rpc("artist_content_link_songs", { p_artist_id: artistId, p_dry_run: false });
        if (error) notes.push(`ligação vídeo→música falhou: ${error.message}`);
      }
    }
    written += contentWritten;
    discovery = {
      uploads_vistos: uploadIds.length, rastreados: trackedIds.length,
      fora_dos_uploads: allIds.filter((x) => !uploadSet.has(x)).length,
      devolvidos_api: byId.size, novos, longos, collabs_por_id: collabs, classificacao_via: via,
      novos_top: novosLista.sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5),
    };

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
    const details = { hoje, videos: videos.map((v) => v.video_id), channel: channelExt, ...discovery, notes };
    await finishSyncRun(admin, runId, started, { status, api_calls: apiCalls, rows_written: written, details, error_text: errors ? notes.join(" | ") : null });
    return json({
      ok: errors === 0, dry_run: dryRun, status, api_calls: apiCalls, written, ...discovery,
      amostra: [...songRows, ...artistRows].map(({ metric, source_ref, value }) => ({ metric, source_ref, value })), notes,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await finishSyncRun(admin, runId, started, { status: "error", api_calls: apiCalls, rows_written: written, error_text: msg });
    return json({ ok: false, error: msg }, 500);
  }
});
