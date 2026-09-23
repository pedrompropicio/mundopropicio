// tiktok-artists-sync — leitor das métricas UGC do TikTok for Artists (D-ERP124).
//
// POST {
//   artist_user_id?: string   (omissão 6812764850029970437 — Litto Lins)
//   dry_run?: boolean         (omissão false — grava)
// }
//
// Endpoint único (o mesmo da sonda tiktok-artists-probe):
//   POST https://artists.tiktok.com/tiktok/artist_api/ttfa/song_data/list/v1
// Autorização externa: cookie de sessão em TIKTOK_ARTISTS_COOKIE. A função
// NUNCA faz login, nunca segue redirect de login e nunca renova o cookie —
// sessão caída é relatada (motivo sessao_invalida) e a execução termina.
//
// Escreve em public.artist_song_metrics_daily (platform='tiktok',
// source='tiktok_artists', source_ref=group_id) as métricas ugc_videos,
// ugc_creators e ugc_views. Nunca toca em linhas source='manual'.
//
// Fronteira: não lê artist_channel_connections nem ad_platform_connections.

import { adminClient, authorize, corsHeaders, json } from "../_shared/soundcharts.ts";
import {
  deduceTriggerSource,
  finishSyncRun,
  resolveStatus,
  startSyncRun,
} from "../_shared/sync-run.ts";

const FUNCTION_NAME = "tiktok-artists-sync";
const ROLES = ["admin", "platform_admin", "manager", "editor"];
const API_URL = "https://artists.tiktok.com/tiktok/artist_api/ttfa/song_data/list/v1";
// D-ERP125 (A3-bis) — lista de clips (sons) de cada música do painel.
const CLIP_API_URL = "https://artists.tiktok.com/tiktok/artist_api/ttfa/song_data/clip_data_list/v1";
const DEFAULT_ARTIST_USER_ID = "6812764850029970437";
const PAGE_SIZE = 60;
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 20_000;

// Campos onde a API pode trazer a "Última atualização" dos dados.
const DATE_FIELDS = [
  "data_update_time",
  "update_time",
  "last_update_time",
  "updated_at",
  "stat_update_time",
  "music_data_update_time",
  "date",
  "stat_date",
];

const METRICS: Array<{ metric: string; field: string }> = [
  { metric: "ugc_videos", field: "music_cv_cnt" },
  { metric: "ugc_creators", field: "music_creator_cnt" },
  { metric: "ugc_views", field: "music_vv_cnt" },
];

type Json = Record<string, unknown>;

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function dayOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Converte epoch (s/ms), YYYYMMDD ou ISO numa data YYYY-MM-DD. */
function toDate(v: unknown): string | null {
  if (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) {
    const n = Number(v);
    if (n > 19000101 && n < 21001231 && String(n).length === 8) {
      const s = String(n);
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
    const ms = n > 1e12 ? n : n * 1000;
    if (ms > 1_000_000_000_000 && ms < 4_000_000_000_000) {
      return new Date(ms).toISOString().slice(0, 10);
    }
    return null;
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

function resolveMetricDate(envelope: Json, item: Json): { date: string; field: string | null } {
  for (const f of DATE_FIELDS) {
    const d = toDate(item[f]) ?? toDate(envelope[f]);
    if (d) return { date: d, field: f };
  }
  return { date: dayOffset(-3), field: null };
}

function isLoginRedirect(status: number, headers: Headers): boolean {
  if (status >= 300 && status < 400) {
    const loc = (headers.get("Location") || "").toLowerCase();
    return loc.includes("login") || loc.includes("signin");
  }
  return false;
}

type PageResult =
  | { ok: true; envelope: Json; songs: Json[]; total: number | null }
  | { ok: false; motivo: "sessao_invalida" | "rede" | "http"; http_status: number; detalhe: string };

async function fetchPage(cookie: string, artistUserId: string, from: number): Promise<PageResult> {
  const payload = {
    from,
    size: PAGE_SIZE,
    filter: { artist_user_id: String(artistUserId) },
    sort_type: 0,
    sort_order: 1,
  };
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const detalhe = (e as Error)?.name === "TimeoutError" ? "timeout" : ((e as Error)?.message ?? String(e));
    return { ok: false, motivo: "rede", http_status: 0, detalhe };
  }

  const text = await res.text();
  if (res.status === 401 || res.status === 403 || isLoginRedirect(res.status, res.headers)) {
    return { ok: false, motivo: "sessao_invalida", http_status: res.status, detalhe: text.slice(0, 300) };
  }
  let data: Json;
  try {
    data = JSON.parse(text) as Json;
  } catch (_e) {
    return { ok: false, motivo: "sessao_invalida", http_status: res.status, detalhe: text.slice(0, 300) };
  }
  if (!res.ok) {
    return { ok: false, motivo: "http", http_status: res.status, detalhe: text.slice(0, 300) };
  }
  const songs = (Array.isArray(data.song_data_list) ? data.song_data_list : []) as Json[];
  const total = numOrNull(data.total) ?? numOrNull(data.total_count) ?? numOrNull(data.song_total);
  return { ok: true, envelope: data, songs, total };
}

type PanelClip = { music_id: string; clip_name: string | null; is_pgc: boolean };

type ClipResult =
  | { ok: true; items: PanelClip[]; topKeys: string[]; arrayPaths: string[] }
  | { ok: false; motivo: "sessao_invalida" | "rede" | "http" };

/**
 * Sons (clips) de uma música do painel. A resposta traz listas cujos nomes
 * começam por 'pgc' (som oficial) ou 'ugc' (som do utilizador); aceitamos
 * ambas as formas (listas separadas ou lista única com o tipo no item).
 */
async function fetchClips(cookie: string, groupId: string): Promise<ClipResult> {
  let res: Response;
  try {
    res = await fetch(CLIP_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ group_id: groupId }),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (_e) {
    return { ok: false, motivo: "rede" };
  }
  const text = await res.text();
  if (res.status === 401 || res.status === 403 || isLoginRedirect(res.status, res.headers)) {
    return { ok: false, motivo: "sessao_invalida" };
  }
  let data: Json;
  try {
    data = JSON.parse(text) as Json;
  } catch (_e) {
    return { ok: false, motivo: "sessao_invalida" };
  }
  if (!res.ok) return { ok: false, motivo: "http" };

  const items: PanelClip[] = [];
  const push = (raw: Json, pgcHint: boolean | null) => {
    const id = raw.music_id ?? raw.clip_id ?? raw.id;
    if (id == null) return;
    const tipo = String(raw.clip_type ?? raw.type ?? "").toLowerCase();
    const isPgc = pgcHint ?? (tipo.startsWith("pgc") || raw.is_official === true);
    items.push({
      music_id: String(id),
      clip_name: typeof raw.clip_name === "string" ? raw.clip_name : null,
      is_pgc: isPgc,
    });
  };
  for (const [key, value] of Object.entries(data)) {
    const k = key.toLowerCase();
    if (!Array.isArray(value)) continue;
    if (k.startsWith("pgc")) {
      for (const v of value) push(v as Json, true);
    } else if (k.startsWith("ugc")) {
      for (const v of value) push(v as Json, false);
    } else if (k.includes("clip")) {
      for (const v of value) push(v as Json, null);
    }
  }
  return { ok: true, items };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();
  const caller = await authorize(req, admin, ROLES);
  if (!caller.allowed) return json({ ok: false, error: "Unauthorized" }, 401);

  const cookie = Deno.env.get("TIKTOK_ARTISTS_COOKIE");
  if (!cookie || cookie.trim() === "") {
    return json({ ok: false, motivo: "TIKTOK_ARTISTS_COOKIE em falta" }, 428);
  }

  const body = (await req.json().catch(() => ({}))) as Json;
  const artistUserId = typeof body.artist_user_id === "string" && body.artist_user_id
    ? body.artist_user_id
    : DEFAULT_ARTIST_USER_ID;
  const dryRun = body.dry_run === true;

  const startedMs = Date.now();
  const runId = await startSyncRun(admin, {
    function_name: FUNCTION_NAME,
    trigger_source: deduceTriggerSource(req),
    dry_run: dryRun,
  });


  let apiCalls = 0;
  const songs: Json[] = [];
  let envelope: Json = {};
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await fetchPage(cookie, artistUserId, from);
    apiCalls++;
    if (!r.ok) {
      const motivo = r.motivo === "sessao_invalida" ? "sessao_invalida" : r.motivo;
      await finishSyncRun(admin, runId, startedMs, {
        status: "error",
        api_calls: apiCalls,
        rows_written: 0,
        details: { motivo, http_status: r.http_status, paginas: page },
        error_text: `${motivo} (HTTP ${r.http_status}) — ${r.detalhe}`,
      });
      return json({
        ok: false,
        http_status: r.http_status,
        motivo,
        detalhe: r.detalhe,
        notes: ["sem retries — sessão do TikTok Artists tem de ser renovada à mão"],
      });
    }
    envelope = r.envelope;
    songs.push(...r.songs);
    const total = r.total;
    if (r.songs.length < PAGE_SIZE) break;
    if (total !== null && songs.length >= total) break;
    from += PAGE_SIZE;
  }

  // Mapa group_id → música (depois da leitura da API, para que a resposta possa
  // relatar os campos devolvidos mesmo antes da tabela existir em Live).
  const { data: sounds, error: soundsError } = await admin
    .from("artist_song_tiktok_groups")
    .select("group_id, song_id, artist_id, company_id");
  if (soundsError) {
    await finishSyncRun(admin, runId, startedMs, {
      status: "error",
      api_calls: apiCalls,
      rows_written: 0,
      error_text: `artist_song_tiktok_groups: ${soundsError.message}`,
    });
    return json({
      ok: false,
      motivo: "tabela_mapa_indisponivel",
      detalhe: soundsError.message,
      musicas_api: songs.length,
      campos_item: songs.length > 0 ? Object.keys(songs[0]) : [],
      campos_envelope: Object.keys(envelope),
    }, 424);
  }
  const mapa = new Map<string, { song_id: string; artist_id: string; company_id: string }>();
  for (const s of (sounds ?? []) as Json[]) {
    mapa.set(String(s.group_id), {
      song_id: String(s.song_id),
      artist_id: String(s.artist_id),
      company_id: String(s.company_id),
    });
  }

  // ------------------------------------------------------------------------
  // D-ERP125 (A3-bis) — descoberta automática dos SONS de cada música mapeada.
  // Para cada group_id conhecido pedimos a lista de clips do painel e fazemos
  // upsert em public.artist_song_tiktok_sounds (discovered_via='panel',
  // status='validated'). Nunca apaga nada.
  // ------------------------------------------------------------------------
  const clipNotes: string[] = [];
  let clipsUpserted = 0;
  for (const [groupId, alvo] of mapa) {
    const clips = await fetchClips(cookie, groupId);
    apiCalls++;
    if (!clips.ok) {
      clipNotes.push(`clips de ${groupId}: ${clips.motivo}`);
      if (clips.motivo === "sessao_invalida") break;
      continue;
    }
    if (clips.items.length === 0) continue;
    const rows = clips.items.map((c) => ({
      company_id: alvo.company_id,
      artist_id: alvo.artist_id,
      song_id: alvo.song_id,
      music_id: c.music_id,
      title: c.clip_name,
      is_official: c.is_pgc,
      is_original_sound: !c.is_pgc,
      status: "validated",
      discovered_via: "panel",
      validated_at: new Date().toISOString(),
    }));
    if (dryRun) {
      clipNotes.push(`${rows.length} som(ns) do painel em ${groupId} (dry-run, não gravado)`);
      continue;
    }
    const { error } = await admin
      .from("artist_song_tiktok_sounds")
      .upsert(rows, { onConflict: "song_id,music_id", ignoreDuplicates: false });
    if (error) {
      clipNotes.push(`upsert de sons do painel (${groupId}) falhou: ${error.message}`);
    } else {
      clipsUpserted += rows.length;
    }
  }
  if (clipsUpserted > 0) clipNotes.push(`${clipsUpserted} som(ns) do painel gravados`);





  const notes: string[] = [];
  notes.push(...clipNotes);
  const semCorrespondencia: Array<{ group_id: string; song_name: string | null }> = [];
  const linhas: Json[] = [];
  let dateFieldUsado: string | null = null;
  let semCampoData = 0;

  for (const item of songs) {
    const groupId = item.group_id != null ? String(item.group_id) : "";
    if (!groupId) continue;
    const alvo = mapa.get(groupId);
    if (!alvo) {
      semCorrespondencia.push({
        group_id: groupId,
        song_name: typeof item.song_name === "string" ? item.song_name : null,
      });
      continue;
    }
    const { date, field } = resolveMetricDate(envelope, item);
    if (field) dateFieldUsado = dateFieldUsado ?? field;
    else semCampoData++;

    for (const { metric, field: src } of METRICS) {
      const value = numOrNull(item[src]);
      if (value === null) continue;
      linhas.push({
        company_id: alvo.company_id,
        artist_id: alvo.artist_id,
        song_id: alvo.song_id,
        platform: "tiktok",
        metric,
        metric_date: date,
        value,
        source: "tiktok_artists",
        source_ref: groupId,
        captured_at: new Date().toISOString(),
      });
    }
  }

  if (semCampoData > 0) {
    notes.push(
      `${semCampoData} música(s) sem campo de data na resposta — usada current_date - 3`,
    );
  }
  if (dateFieldUsado) notes.push(`data de actualização lida do campo '${dateFieldUsado}'`);
  notes.push(`${semCorrespondencia.length} sound(s) do TikTok sem música mapeada`);

  let rowsWritten = 0;
  let errorCount = 0;
  if (!dryRun && linhas.length > 0) {
    // A chave única inclui source: linhas source='manual' nunca são tocadas.
    const { error } = await admin
      .from("artist_song_metrics_daily")
      .upsert(linhas, { onConflict: "song_id,platform,metric,metric_date,source" });
    if (error) {
      errorCount++;
      notes.push(`upsert falhou: ${error.message}`);
    } else {
      rowsWritten = linhas.length;
    }
  }

  await finishSyncRun(admin, runId, startedMs, {
    status: resolveStatus(rowsWritten, errorCount),
    api_calls: apiCalls,
    rows_written: rowsWritten,
    details: {
      artist_user_id: artistUserId,
      musicas_api: songs.length,
      mapeadas: songs.length - semCorrespondencia.length,
      sem_correspondencia: semCorrespondencia.length,
      campo_data: dateFieldUsado,
      notes,
    },
    error_text: errorCount > 0 ? notes[notes.length - 1] : null,
  });

  return json({
    ok: errorCount === 0,
    dry_run: dryRun,
    api_calls: apiCalls,
    musicas_api: songs.length,
    linhas_preparadas: linhas.length,
    rows_written: rowsWritten,
    campo_data: dateFieldUsado,
    campos_item: songs.length > 0 ? Object.keys(songs[0]) : [],
    campos_envelope: Object.keys(envelope),
    sem_correspondencia: semCorrespondencia,
    notes,
  });
});
