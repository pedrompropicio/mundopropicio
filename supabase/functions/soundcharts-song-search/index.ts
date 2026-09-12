// soundcharts-song-search — pesquisa de músicas (obras) na Soundcharts.
//
// POST { q: string, artist_id?: uuid, limit?: number (<=10) }
// GET /api/v2/song/search/{q}?limit=...
//
// Só leitura. Conta as chamadas à API em sync_runs.api_calls.
// Se artist_id vier, os resultados cujo artista principal coincide com o UUID
// Soundcharts desse artista vêm primeiro.

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

const FUNCTION_NAME = "soundcharts-song-search";
const ROLES = ["admin", "platform_admin", "manager", "editor"];

interface SongResult {
  soundcharts_uuid: string;
  title: string | null;
  artists: string[];
  credit_name: string | null;
  image_url: string | null;
  release_date: string | null;
  isrc: string | null;
  ja_existe: string | null;
}

function artistUuids(raw: any): string[] {
  const list = Array.isArray(raw?.artists) ? raw.artists : [];
  return list.map((a: any) => a?.uuid).filter(Boolean);
}

export function mapScSong(raw: any): Omit<SongResult, "ja_existe"> {
  const list = Array.isArray(raw?.artists) ? raw.artists : [];
  return {
    soundcharts_uuid: String(raw?.uuid ?? ""),
    title: raw?.name ?? raw?.title ?? null,
    // A pesquisa devolve muitas vezes artists[] vazio e o crédito em creditName;
    // os artistas completos só vêm no GET /api/v2/song/{uuid} (usado no 'add').
    artists: list.map((a: any) => a?.name).filter(Boolean),
    credit_name: raw?.creditName ?? null,
    image_url: raw?.imageUrl ?? raw?.image_url ?? null,
    release_date: raw?.releaseDate ? String(raw.releaseDate).slice(0, 10) : null,
    isrc: raw?.isrc?.value ?? (typeof raw?.isrc === "string" ? raw.isrc : null),
  };
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

    let payload: { q?: string; artist_id?: string; limit?: number } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const q = typeof payload.q === "string" ? payload.q.trim() : "";
    if (q.length < 2) return json({ error: "q obrigatório (mínimo 2 caracteres)" }, 400);
    const limit = Math.min(Math.max(Number(payload.limit ?? 10) || 10, 1), 10);
    const artistId = typeof payload.artist_id === "string" ? payload.artist_id : null;

    // UUID Soundcharts do artista pedido (para ordenar os resultados)
    let artistScUuid: string | null = null;
    let artistNameForRank: string | null = null;
    if (artistId) {
      const { data: art } = await admin
        .from("artists")
        .select("name")
        .eq("id", artistId)
        .maybeSingle();
      artistNameForRank = (art?.name as string) ?? null;
      const { data: ch } = await admin
        .from("artist_channels")
        .select("external_id")
        .eq("artist_id", artistId)
        .eq("platform", "aggregator")
        .not("external_id", "is", null)
        .maybeSingle();
      artistScUuid = (ch?.external_id as string) ?? null;
    }

    runId = await startSyncRun(admin, {
      function_name: FUNCTION_NAME,
      trigger_source: deduceTriggerSource(req),
      dry_run: true, // só leitura
      artist_id: artistId,
    });

    const client = await ScClient.create();
    const body = await client.get(
      `/api/v2/song/search/${encodeURIComponent(q)}?limit=${limit}`,
    );
    calls = client.calls;

    const raw = Array.isArray(body?.items) ? body.items : [];
    const mapped = raw
      .map((r: any) => ({ ...mapScSong(r), _artistUuids: artistUuids(r) }))
      .filter((s: any) => s.soundcharts_uuid);

    // já existe na plataforma?
    const uuids = mapped.map((m: any) => m.soundcharts_uuid);
    const bySc = new Map<string, string>();
    if (uuids.length) {
      const { data: songs } = await admin
        .from("artist_songs")
        .select("id, soundcharts_uuid")
        .in("soundcharts_uuid", uuids);
      for (const s of songs ?? []) bySc.set(s.soundcharts_uuid as string, s.id as string);
    }

    let results: SongResult[] = mapped.map((m: any) => ({
      soundcharts_uuid: m.soundcharts_uuid,
      title: m.title,
      artists: m.artists,
      credit_name: m.credit_name,
      image_url: m.image_url,
      release_date: m.release_date,
      isrc: m.isrc,
      ja_existe: bySc.get(m.soundcharts_uuid) ?? null,
    }));

    if (artistScUuid || artistNameForRank) {
      // 1º: artista principal é o pedido; 2º: aparece nos créditos; 3º: resto.
      // Quando a pesquisa não devolve artists[], usa-se o creditName por nome.
      const artistName = String(artistNameForRank ?? "").toLowerCase();
      const matchFirst = (i: number) => {
        const uuids: string[] = mapped[i]._artistUuids ?? [];
        if (uuids[0] === artistScUuid) return 0;
        if (uuids.includes(artistScUuid)) return 1;
        const credit = String(mapped[i].credit_name ?? "").toLowerCase();
        if (artistName && credit.includes(artistName)) return 1;
        return 2;
      };
      results = results
        .map((r, i) => ({ r, rank: matchFirst(i), i }))
        .sort((a, b) => a.rank - b.rank || a.i - b.i)
        .map((x) => x.r);
    }

    await finishSyncRun(admin, runId, startedMs, {
      status: resolveStatus(results.length, 0),
      api_calls: calls,
      rows_written: 0,
      details: { query: q, limit, results: results.length, artist_id: artistId },
    });

    return json({
      query: q,
      limit,
      artist_id: artistId,
      artist_soundcharts_uuid: artistScUuid,
      soundcharts_calls: calls,
      results,
    });
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
