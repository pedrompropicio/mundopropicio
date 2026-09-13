// soundcharts-reference-songs — músicas recentes dos artistas de referência
// (comparáveis) para benchmark de UGC.
//
// POST { company_id?, artist_id?, days?=120, max_songs?=3, dry_run?=true }
//
// Para cada artista com roster_type='referencia' (e UUID Soundcharts em
// artist_channels platform='aggregator'):
//   GET /api/v2.21/artist/{uuid}/songs?sortBy=releaseDate&sortOrder=desc&limit=100
// escolhe até max_songs músicas lançadas nos últimos `days` dias, faz upsert em
// artist_songs (is_reference=true, tracking_status='ativo', is_launch=false) e
// chama o song-soundcharts-sync para cada uma com start_date = release_date.

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

const FUNCTION_NAME = "soundcharts-reference-songs";
const ROLES = ["admin", "platform_admin", "manager", "editor"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function dateOnly(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
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
      company_id?: string;
      artist_id?: string;
      days?: number;
      max_songs?: number;
      dry_run?: boolean;
    } = {};
    try {
      p = await req.json();
    } catch {
      p = {};
    }

    const dryRun = p.dry_run !== false; // default true
    const days = Number.isFinite(p.days) && (p.days as number) > 0 ? Math.floor(p.days as number) : 120;
    const maxSongs = Number.isFinite(p.max_songs) && (p.max_songs as number) > 0
      ? Math.floor(p.max_songs as number)
      : 3;
    const cutoff = daysAgo(days);

    let aq = admin
      .from("artists")
      .select("id, company_id, name, roster_type")
      .eq("roster_type", "referencia");
    if (p.company_id) aq = aq.eq("company_id", p.company_id);
    if (p.artist_id) aq = aq.eq("id", p.artist_id);
    const { data: artists, error: aErr } = await aq;
    if (aErr) throw new Error(`artists: ${aErr.message}`);

    runId = await startSyncRun(admin, {
      function_name: FUNCTION_NAME,
      trigger_source: deduceTriggerSource(req),
      dry_run: dryRun,
      artist_id: p.artist_id ?? null,
      company_id: p.company_id ?? artists?.[0]?.company_id ?? null,
    });

    if (!artists?.length) {
      const empty = { artists_processed: 0, soundcharts_calls: 0, notes: ["Sem artistas de referência para os filtros dados."] };
      await finishSyncRun(admin, runId, startedMs, { status: "no_data", details: empty });
      return json(empty);
    }

    const { data: channels } = await admin
      .from("artist_channels")
      .select("artist_id, external_id")
      .eq("platform", "aggregator")
      .in("artist_id", artists.map((a) => a.id));
    const uuidByArtist = new Map<string, string>();
    for (const c of channels ?? []) {
      if (c.external_id) uuidByArtist.set(c.artist_id as string, c.external_id as string);
    }

    const client = await ScClient.create();
    const notes: string[] = [];
    const errors: Array<{ artist_id: string; error: string }> = [];
    const perArtist: Array<Record<string, unknown>> = [];
    const syncTargets: Array<{ song_id: string; title: string; start_date: string | null }> = [];
    let songsUpserted = 0;

    for (const artist of artists) {
      const uuid = uuidByArtist.get(artist.id as string);
      if (!uuid) {
        notes.push(`${artist.name}: sem UUID Soundcharts (artist_channels aggregator).`);
        continue;
      }

      let items: any[] = [];
      try {
        const body = await client.get(
          `/api/v2.21/artist/${uuid}/songs?offset=0&limit=100&sortBy=releaseDate&sortOrder=desc`,
        );
        items = Array.isArray(body?.items) ? body.items : [];
      } catch (e) {
        errors.push({ artist_id: artist.id as string, error: (e as Error)?.message ?? String(e) });
        continue;
      }

      const candidates = items
        .map((it: any) => {
          const song = it?.song ?? it;
          return {
            uuid: String(song?.uuid ?? ""),
            title: song?.name ?? song?.title ?? null,
            release_date: dateOnly(song?.releaseDate ?? song?.release_date ?? it?.releaseDate),
            credit_name: song?.creditName ?? null,
          };
        })
        .filter((c) => c.uuid && c.title)
        .sort((a, b) => String(b.release_date ?? "").localeCompare(String(a.release_date ?? "")))
        .filter((c) => c.release_date && c.release_date >= cutoff && c.release_date <= today())
        .slice(0, maxSongs);

      if (!candidates.length) {
        notes.push(`${artist.name}: sem lançamentos nos últimos ${days} dias.`);
      }

      const chosen: Array<Record<string, unknown>> = [];
      for (const c of candidates) {
        if (dryRun) {
          chosen.push({ ...c, song_id: null });
          continue;
        }
        // O UUID é único por empresa e a mesma obra pode já existir como
        // lançamento do elenco (feats). NUNCA reatribuir nem reescrever essas
        // linhas: só se insere o que ainda não existe.
        const { data: existing, error: exErr } = await admin
          .from("artist_songs")
          .select("id, artist_id, is_reference")
          .eq("company_id", artist.company_id)
          .eq("soundcharts_uuid", c.uuid)
          .maybeSingle();
        if (exErr) {
          errors.push({ artist_id: artist.id as string, error: `lookup ${c.title}: ${exErr.message}` });
          continue;
        }
        if (existing) {
          notes.push(`${artist.name}: "${c.title}" já existe no sistema — mantida como está.`);
          chosen.push({ ...c, song_id: existing.id, already_existed: true });
          continue;
        }
        const { data: up, error: uErr } = await admin
          .from("artist_songs")
          .insert({
            company_id: artist.company_id,
            artist_id: artist.id,
            title: c.title,
            soundcharts_uuid: c.uuid,
            release_date: c.release_date,
            tracking_status: "ativo",
            is_launch: false,
            is_reference: true,
          })
          .select("id")
          .maybeSingle();
        if (uErr) {
          errors.push({ artist_id: artist.id as string, error: `insert ${c.title}: ${uErr.message}` });
          continue;
        }

        songsUpserted++;
        chosen.push({ ...c, song_id: up?.id ?? null });
        if (up?.id) {
          syncTargets.push({ song_id: up.id as string, title: String(c.title), start_date: c.release_date });
        }
      }

      perArtist.push({
        artist_id: artist.id,
        artist_name: artist.name,
        songs_found: items.length,
        songs_selected: chosen.length,
        songs: chosen,
      });
    }

    // ---- métricas: reutiliza o song-soundcharts-sync (todas as plataformas)
    // Sempre com service role (nunca o Authorization do caller, que pode ser
    // um utilizador sem permissão na função interna).
    const syncResults: Array<Record<string, unknown>> = [];
    if (!dryRun && syncTargets.length) {
      for (const t of syncTargets) {
        const call = await invokeInternal(
          "song-soundcharts-sync",
          { song_id: t.song_id, start_date: t.start_date ?? undefined, dry_run: false },
          { timeoutMs: 240_000 },
        );
        const body = (call.body ?? {}) as Record<string, unknown>;
        calls += Number(body?.soundcharts_calls ?? 0);
        if (!call.ok) {
          errors.push({ artist_id: "-", error: `sync ${t.title}: ${call.error ?? "erro"}` });
        }
        syncResults.push({
          song_id: t.song_id,
          title: t.title,
          http: call.status,
          rows_written: body?.rows_written ?? null,
          soundcharts_calls: body?.soundcharts_calls ?? null,
          notes: body?.notes ?? null,
        });
      }
    }

    calls += client.calls;
    const summary = {
      dry_run: dryRun,
      window_days: days,
      max_songs: maxSongs,
      cutoff,
      artists_processed: perArtist.length,
      songs_upserted: songsUpserted,
      soundcharts_calls: calls,
      artists: perArtist,
      song_sync: syncResults,
      notes,
      errors,
    };

    await finishSyncRun(admin, runId, startedMs, {
      status: dryRun ? (errors.length ? "partial" : "success") : resolveStatus(songsUpserted, errors.length),
      api_calls: calls,
      rows_written: songsUpserted,
      details: summary,
    });

    return json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${FUNCTION_NAME}]`, msg);
    await finishSyncRun(admin, runId, startedMs, { status: "error", api_calls: calls, error_text: msg });
    return json({ error: msg }, 500);
  }
});
