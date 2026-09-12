// artist-song-manage — gere as músicas (obras) acompanhadas de um artista.
//
// POST {
//   action: 'add' | 'update' | 'archive',
//   artist_id: uuid,
//   soundcharts_uuid?: string,   // add
//   song_id?: uuid,              // update | archive
//   is_launch?: boolean,         // add | update
//   tracking_status?: 'ativo'|'pausado'|'arquivado',
//   featuring?: string[]
// }
//
// 'add'     → metadados em GET /api/v2/song/{uuid} + identificadores em
//             GET /api/v2/song/{uuid}/identifiers; cria artist_songs e invoca
//             song-soundcharts-sync (service role) para importar o histórico.
// 'update'  → is_launch / tracking_status / featuring.
// 'archive' → tracking_status = 'arquivado'.

import {
  adminClient,
  auditLog,
  authorize,
  callerCompanyIds,
  corsHeaders,
  json,
  ScClient,
} from "../_shared/soundcharts.ts";

const FUNCTION_NAME = "artist-song-manage";
const ROLES = ["admin", "platform_admin", "manager", "editor"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();

  try {
    const caller = await authorize(req, admin, ROLES);
    if (!caller.allowed) return json({ error: "Forbidden" }, 403);
    const changedBy = caller.isServiceRole ? "service_role" : (caller.userId ?? "desconhecido");

    let p: {
      action?: string;
      artist_id?: string;
      soundcharts_uuid?: string;
      song_id?: string;
      is_launch?: boolean;
      tracking_status?: string;
      featuring?: string[];
    } = {};
    try {
      p = await req.json();
    } catch {
      p = {};
    }

    const action = String(p.action ?? "");
    if (!["add", "update", "archive"].includes(action)) {
      return json({ error: "action inválida ('add' | 'update' | 'archive')" }, 400);
    }
    const artistId = typeof p.artist_id === "string" ? p.artist_id : "";
    if (!artistId) return json({ error: "artist_id obrigatório" }, 400);

    const { data: artist, error: aErr } = await admin
      .from("artists")
      .select("id, name, company_id")
      .eq("id", artistId)
      .maybeSingle();
    if (aErr) throw new Error(`artists: ${aErr.message}`);
    if (!artist) return json({ error: "artista não encontrado" }, 404);

    if (!caller.isServiceRole) {
      const companyIds = await callerCompanyIds(admin, caller.userId!);
      if (companyIds !== "all" && !companyIds.includes(artist.company_id)) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    // ----------------------------------------------------------- update/archive
    if (action === "update" || action === "archive") {
      const songId = typeof p.song_id === "string" ? p.song_id : "";
      if (!songId) return json({ error: "song_id obrigatório" }, 400);

      const { data: song, error: sErr } = await admin
        .from("artist_songs")
        .select("id, artist_id, is_launch, launch_started_at, tracking_status")
        .eq("id", songId)
        .maybeSingle();
      if (sErr) throw new Error(`artist_songs: ${sErr.message}`);
      if (!song || song.artist_id !== artistId) {
        return json({ error: "música não encontrada neste artista" }, 404);
      }

      const patch: Record<string, unknown> = {};
      if (action === "archive") {
        patch.tracking_status = "arquivado";
      } else {
        if (typeof p.is_launch === "boolean") {
          patch.is_launch = p.is_launch;
          if (p.is_launch && !song.launch_started_at) patch.launch_started_at = today();
        }
        if (p.tracking_status != null) {
          const ts = String(p.tracking_status);
          if (!["ativo", "pausado", "arquivado"].includes(ts)) {
            return json({ error: "tracking_status inválido" }, 400);
          }
          patch.tracking_status = ts;
        }
        if (Array.isArray(p.featuring)) {
          patch.featuring = p.featuring.map((f) => String(f)).filter(Boolean);
        }
        if (!Object.keys(patch).length) return json({ error: "nada para alterar" }, 400);
      }

      const { data: updated, error: uErr } = await admin
        .from("artist_songs")
        .update(patch)
        .eq("id", songId)
        .select("id, title, tracking_status, is_launch, launch_started_at, featuring")
        .single();
      if (uErr) throw new Error(`update: ${uErr.message}`);

      await auditLog(admin, {
        entity_type: "artist_songs",
        entity_id: songId,
        action,
        changed_by: changedBy,
        company_id: artist.company_id,
        metadata: { artist_id: artistId, patch },
      });
      return json({ action, song: updated });
    }

    // ------------------------------------------------------------------- add
    const scUuid = typeof p.soundcharts_uuid === "string" ? p.soundcharts_uuid.trim() : "";
    if (!scUuid) return json({ error: "soundcharts_uuid obrigatório" }, 400);

    const { data: dup } = await admin
      .from("artist_songs")
      .select("id, title")
      .eq("company_id", artist.company_id)
      .eq("soundcharts_uuid", scUuid)
      .maybeSingle();
    if (dup) return json({ error: "música já acompanhada", song_id: dup.id }, 409);

    const sc = await ScClient.create();
    const metaRaw = await sc.get(`/api/v2/song/${scUuid}`);
    const obj = metaRaw?.object ?? metaRaw;
    const title = obj?.name ?? obj?.title ?? null;
    if (!title) return json({ error: "Soundcharts não devolveu o título da música" }, 502);

    const scArtists: Array<{ name?: string; uuid?: string }> = Array.isArray(obj?.artists)
      ? obj.artists
      : [];
    const { data: ownChannel } = await admin
      .from("artist_channels")
      .select("external_id")
      .eq("artist_id", artistId)
      .eq("platform", "aggregator")
      .not("external_id", "is", null)
      .maybeSingle();
    const ownUuid = (ownChannel?.external_id as string) ?? null;

    const featuring = Array.isArray(p.featuring) && p.featuring.length
      ? p.featuring.map((f) => String(f)).filter(Boolean)
      : scArtists
        .filter((a) =>
          ownUuid
            ? a?.uuid !== ownUuid
            : String(a?.name ?? "").toLowerCase() !== String(artist.name).toLowerCase()
        )
        .map((a) => a?.name)
        .filter(Boolean) as string[];

    const releaseDate = obj?.releaseDate ? String(obj.releaseDate).slice(0, 10) : null;
    const isrc = obj?.isrc?.value ?? (typeof obj?.isrc === "string" ? obj.isrc : null);
    const isLaunch = p.is_launch === true;

    const { data: song, error: iErr } = await admin
      .from("artist_songs")
      .insert({
        company_id: artist.company_id,
        artist_id: artistId,
        title,
        featuring,
        soundcharts_uuid: scUuid,
        isrc,
        release_date: releaseDate,
        cover_url: obj?.imageUrl ?? obj?.image_url ?? null,
        is_launch: isLaunch,
        launch_started_at: isLaunch ? today() : null,
      })
      .select("id, title, featuring, isrc, release_date, cover_url, is_launch")
      .single();
    if (iErr) throw new Error(`criar música: ${iErr.message}`);

    // identificadores por plataforma (não é bloqueante)
    let identifiers = 0;
    try {
      const idsBody = await sc.get(`/api/v2/song/${scUuid}/identifiers`);
      const items = Array.isArray(idsBody?.items) ? idsBody.items : [];
      const rows = items
        .map((it: any) => ({
          song_id: song.id,
          platform: String(it?.platformCode ?? it?.platform ?? "").toLowerCase(),
          external_id: String(it?.identifier ?? it?.id ?? ""),
          url: it?.url ?? null,
        }))
        .filter((r: any) => r.platform && r.external_id);
      if (rows.length) {
        const { error } = await admin
          .from("artist_song_identifiers")
          .upsert(rows, { onConflict: "song_id,platform,external_id" });
        if (!error) identifiers = rows.length;
      }
    } catch (e) {
      console.error("identifiers:", (e as Error)?.message ?? e);
    }

    // histórico: release_date, ou hoje − 365 se o lançamento for mais antigo
    const floor = daysAgo(365);
    const startDate = releaseDate && releaseDate > floor ? releaseDate : floor;

    let syncSummary: unknown = null;
    let syncError: string | null = null;
    try {
      const { data, error } = await admin.functions.invoke("song-soundcharts-sync", {
        body: { song_id: song.id, start_date: startDate, dry_run: false },
      });
      if (error) syncError = error.message;
      else syncSummary = data;
    } catch (e) {
      syncError = (e as Error)?.message ?? String(e);
    }

    await auditLog(admin, {
      entity_type: "artist_songs",
      entity_id: song.id as string,
      action: "add",
      changed_by: changedBy,
      company_id: artist.company_id,
      metadata: {
        artist_id: artistId,
        soundcharts_uuid: scUuid,
        title,
        identifiers,
        start_date: startDate,
      },
    });

    return json({
      action,
      artist_id: artistId,
      song,
      identifiers,
      soundcharts_calls: sc.calls,
      history: { start_date: startDate, summary: syncSummary, error: syncError },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${FUNCTION_NAME}]`, msg);
    return json({ error: msg }, 500);
  }
});
