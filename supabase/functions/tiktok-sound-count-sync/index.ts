// tiktok-sound-count-sync — UGC do TikTok por SOM (music_id), via Apify (D-ERP125).
//
// POST {
//   song_id?: string    (opcional — limita a uma música)
//   dry_run?: boolean   (omissão false — grava)
// }
//
// Lê os sons com status='validated' em public.artist_song_tiktok_sounds das
// músicas is_launch OR is_reference, pede a contagem de vídeos ao ator do Apify
// e grava:
//   - 1 linha por som em public.artist_song_tiktok_sound_daily
//   - a soma por música em public.artist_song_metrics_daily
//     (platform='tiktok', metric='ugc_videos_sounds', source='apify')
//
// Guardas (D-ERP166): a soma grava-se com os sons que responderam HOJE — nunca
// se reutiliza o último valor de um som em falta. source_ref diz quantos entraram
// e quais ficaram de fora (precisão: completa|parcial). Som validated sem resposta
// → corrida 'partial' com error_text a nomear os sons. Queda > 10% → aviso.
//
// Fronteira: não lê artist_channel_connections nem ad_platform_connections.

import { adminClient, authorize, corsHeaders, json } from "../_shared/soundcharts.ts";
import { invokeInternal } from "../_shared/internal-call.ts";
import {
  deduceTriggerSource,
  finishSyncRun,
  resolveStatus,
  startSyncRun,
} from "../_shared/sync-run.ts";

const FUNCTION_NAME = "tiktok-sound-count-sync";
const ROLES = ["admin", "platform_admin", "manager", "editor"];

// ---------------------------------------------------------------------------
// Configuração do ator do Apify — toda aqui, nada espalhado pelo ficheiro.
// ---------------------------------------------------------------------------
const APIFY_ACTOR_NAME = "funny_ground/tiktok-sound-scraper";
const APIFY_ACTOR_ID = "dzN8Pp8yxmp9Jzzyd";
const APIFY_RUN_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items`;
const APIFY_INPUT_DEFAULTS = {
  resultsPerSound: 1,
  maxVideosToScanPerSound: 30,
};
const SOUND_URL_PREFIX = "https://www.tiktok.com/music/som-";
const APIFY_TIMEOUT_MS = 240_000;
const METRIC = "ugc_videos_sounds";
const DROP_ALERT_RATIO = 0.10;
// D-ERP166 (adenda): segunda passagem um a um para os sons que faltam no lote.
const APIFY_SINGLE_TIMEOUT_MS = 45_000;
const FUNCTION_BUDGET_MS = 330_000; // abaixo do limite de parede da função
const PANEL_SOURCE = "tiktok_artists";

type Json = Record<string, unknown>;

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();
  const caller = await authorize(req, admin, ROLES);
  if (!caller.allowed) return json({ ok: false, error: "Unauthorized" }, 401);

  const apifyToken = Deno.env.get("APIFY_TOKEN");
  if (!apifyToken || apifyToken.trim() === "") {
    return json({ ok: false, motivo: "APIFY_TOKEN em falta" }, 428);
  }

  const body = (await req.json().catch(() => ({}))) as Json;
  const songFilter = typeof body.song_id === "string" && body.song_id ? body.song_id : null;
  const dryRun = body.dry_run === true;

  const startedMs = Date.now();
  const runRecordId = await startSyncRun(admin, {
    function_name: FUNCTION_NAME,
    trigger_source: deduceTriggerSource(req),
    dry_run: dryRun,
  });

  const notes: string[] = [];

  // 1. Sons validados das músicas acompanhadas (lançamento ou referência).
  let q = admin
    .from("artist_song_tiktok_sounds")
    .select(
      "music_id, song_id, artist_id, company_id, artist_songs!inner(id, title, is_launch, is_reference)",
    )
    .eq("status", "validated");
  if (songFilter) q = q.eq("song_id", songFilter);
  const { data: sounds, error: soundsError } = await q;

  if (soundsError) {
    await finishSyncRun(admin, runRecordId, startedMs, {
      status: "error",
      api_calls: 0,
      rows_written: 0,
      error_text: `artist_song_tiktok_sounds: ${soundsError.message}`,
    });
    return json({
      ok: false,
      motivo: "tabela_indisponivel",
      detalhe: soundsError.message,
    }, 424);
  }

  type SoundRow = {
    music_id: string;
    song_id: string;
    artist_id: string;
    company_id: string;
    title: string | null;
  };
  const alvos: SoundRow[] = [];
  for (const raw of (sounds ?? []) as Json[]) {
    const song = raw.artist_songs as Json | null;
    if (!song) continue;
    if (song.is_launch !== true && song.is_reference !== true) continue;
    alvos.push({
      music_id: String(raw.music_id),
      song_id: String(raw.song_id),
      artist_id: String(raw.artist_id),
      company_id: String(raw.company_id),
      title: typeof song.title === "string" ? song.title : null,
    });
  }

  if (alvos.length === 0) {
    notes.push("nenhum som validated em músicas is_launch/is_reference");
    await finishSyncRun(admin, runRecordId, startedMs, {
      status: "no_data",
      api_calls: 0,
      rows_written: 0,
      details: { notes },
    });
    return json({ ok: true, dry_run: dryRun, sons: 0, notes });
  }

  const musicIds = [...new Set(alvos.map((a) => a.music_id))];
  const soundUrls = musicIds.map((id) => `${SOUND_URL_PREFIX}${id}`);

  // 2. Uma chamada ao ator com todos os sons.
  const input = { soundUrls, ...APIFY_INPUT_DEFAULTS };
  let res: Response;
  try {
    res = await fetch(`${APIFY_RUN_URL}?token=${encodeURIComponent(apifyToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
    });
  } catch (e) {
    const detalhe = (e as Error)?.name === "TimeoutError" ? "timeout" : ((e as Error)?.message ?? String(e));
    await finishSyncRun(admin, runRecordId, startedMs, {
      status: "error",
      api_calls: 1,
      rows_written: 0,
      details: { sons_pedidos: musicIds.length },
      error_text: `apify rede — ${detalhe}`,
    });
    return json({ ok: false, motivo: "rede", detalhe });
  }

  const text = await res.text();
  if (!res.ok) {
    await finishSyncRun(admin, runRecordId, startedMs, {
      status: "error",
      api_calls: 1,
      rows_written: 0,
      details: { sons_pedidos: musicIds.length, http_status: res.status },
      error_text: `apify HTTP ${res.status} — ${text.slice(0, 300)}`,
    });
    return json({ ok: false, http_status: res.status, excerto: text.slice(0, 300) }, 200);
  }

  let items: Json[];
  try {
    const parsed = JSON.parse(text);
    items = Array.isArray(parsed) ? parsed as Json[] : [];
  } catch (_e) {
    await finishSyncRun(admin, runRecordId, startedMs, {
      status: "error",
      api_calls: 1,
      rows_written: 0,
      error_text: `apify resposta não-JSON — ${text.slice(0, 300)}`,
    });
    return json({ ok: false, motivo: "resposta_nao_json", excerto: text.slice(0, 300) });
  }

  const apifyRunId = res.headers.get("x-apify-run-id") ??
    res.headers.get("x-apify-actor-run-id") ?? "run-sync";

  // 3. Contagens por som.
  const contagens = new Map<string, number>();
  const origem = new Map<string, { source: string; ref: string }>();
  const lerItens = (lista: Json[], ref: string) => {
    for (const item of lista) {
      const sound = (item.sound ?? item) as Json;
      const id = sound.id != null ? String(sound.id) : null;
      const count = numOrNull(sound.videoCount);
      if (!id || count === null || contagens.has(id)) continue;
      contagens.set(id, count);
      origem.set(id, { source: "apify", ref });
    }
  };
  lerItens(items, `${APIFY_ACTOR_ID}:${apifyRunId}`);
  const respLote = contagens.size;
  let apiCalls = 1;

  // 3b. Segunda passagem: um pedido ao ator por som em falta (timeout curto).
  const segundaPassagem: Json[] = [];
  for (const id of musicIds) {
    if (contagens.has(id)) continue;
    if (Date.now() - startedMs > FUNCTION_BUDGET_MS - APIFY_SINGLE_TIMEOUT_MS) {
      segundaPassagem.push({ music_id: id, resultado: "sem_orcamento" });
      continue;
    }
    apiCalls++;
    try {
      const r = await fetch(`${APIFY_RUN_URL}?token=${encodeURIComponent(apifyToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ soundUrls: [`${SOUND_URL_PREFIX}${id}`], ...APIFY_INPUT_DEFAULTS }),
        signal: AbortSignal.timeout(APIFY_SINGLE_TIMEOUT_MS),
      });
      const t = await r.text();
      if (!r.ok) {
        segundaPassagem.push({ music_id: id, resultado: `HTTP ${r.status}` });
        continue;
      }
      const lista = (() => {
        try {
          const j = JSON.parse(t);
          return Array.isArray(j) ? j as Json[] : [];
        } catch {
          return [];
        }
      })();
      const rid = r.headers.get("x-apify-run-id") ?? r.headers.get("x-apify-actor-run-id") ?? "run-sync";
      lerItens(lista, `${APIFY_ACTOR_ID}:${rid}:individual`);
      segundaPassagem.push({
        music_id: id,
        resultado: contagens.has(id) ? "respondeu" : `sem item (${lista.length} itens)`,
      });
    } catch (e) {
      segundaPassagem.push({
        music_id: id,
        resultado: (e as Error)?.name === "TimeoutError" ? "timeout" : "rede",
      });
    }
  }

  // 3c. Fonte oficial: contagem do painel TikTok for Artists de HOJE
  // (tiktok-artists-sync grava source 'tiktok_artists'). Nunca dias anteriores.
  const metricDateHoje = todayUTC();
  const faltamPainel = () => musicIds.filter((id) => !contagens.has(id));
  const painel: Json = { usado: false };
  const lerPainel = async () => {
    const f = faltamPainel();
    if (f.length === 0) return 0;
    const { data } = await admin
      .from("artist_song_tiktok_sound_daily")
      .select("music_id, video_count, source_ref")
      .eq("metric_date", metricDateHoje)
      .eq("source", PANEL_SOURCE)
      .in("music_id", f);
    let n = 0;
    for (const r of (data ?? []) as Json[]) {
      const c = numOrNull(r.video_count);
      if (c === null) continue;
      contagens.set(String(r.music_id), c);
      origem.set(String(r.music_id), { source: PANEL_SOURCE, ref: String(r.source_ref ?? "") });
      n++;
    }
    return n;
  };
  if (faltamPainel().length > 0) {
    painel.usado = true;
    let n = await lerPainel();
    if (faltamPainel().length > 0 && !dryRun && Date.now() - startedMs < FUNCTION_BUDGET_MS - 60_000) {
      // Painel de hoje ainda não lido (o cron dele corre depois): encadear.
      const r = await invokeInternal("tiktok-artists-sync", { dry_run: false }, { timeoutMs: 90_000 });
      apiCalls++;
      painel.encadeado = r.ok ? "ok" : (r.error ?? `HTTP ${r.status}`).slice(0, 200);
      n += await lerPainel();
    }
    painel.sons = n;
  }

  const metricDate = todayUTC();
  const linhasSom: Json[] = [];
  const porMusica = new Map<string, { song: SoundRow; soma: number; total: number; vistos: number }>();

  for (const alvo of alvos) {
    const agg = porMusica.get(alvo.song_id) ??
      { song: alvo, soma: 0, total: 0, vistos: 0 };
    agg.total++;
    const count = contagens.get(alvo.music_id);
    if (count !== undefined) {
      agg.vistos++;
      agg.soma += count;
      linhasSom.push({
        company_id: alvo.company_id,
        song_id: alvo.song_id,
        music_id: alvo.music_id,
        metric_date: metricDate,
        video_count: count,
        source: origem.get(alvo.music_id)?.source ?? "apify",
        source_ref: origem.get(alvo.music_id)?.ref ?? "",
        captured_at: new Date().toISOString(),
      });
    }
    porMusica.set(alvo.song_id, agg);
  }

  const semResposta = alvos
    .filter((a) => !contagens.has(a.music_id))
    .map((a) => ({ song_id: a.song_id, music_id: a.music_id }));
  // Último dia em que cada som em falta respondeu (diagnóstico de persistência).
  const ultimaResposta = new Map<string, string | null>();
  for (const s of semResposta) {
    const { data: u } = await admin
      .from("artist_song_tiktok_sound_daily")
      .select("metric_date")
      .eq("music_id", s.music_id)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    ultimaResposta.set(s.music_id, (u?.metric_date as string | undefined) ?? null);
  }
  const semRespostaTxt = semResposta.map((s) =>
    `${s.music_id} (última resposta ${ultimaResposta.get(s.music_id) ?? "nunca"})`
  );
  if (semResposta.length > 0) {
    notes.push(
      `${semResposta.length} som(ns) validated sem resposta do ator — fora da soma de hoje: ${semRespostaTxt.join(", ")}`,
    );
  }

  // 4. Soma por música com os sons que responderam hoje.
  const linhasMusica: Json[] = [];
  const avisos: string[] = [];
  for (const [songId, agg] of porMusica) {
    if (agg.vistos === 0) continue;
    const foraDaSoma = semResposta.filter((x) => x.song_id === songId).map((x) => x.music_id);

    const { data: ultimo } = await admin
      .from("artist_song_metrics_daily")
      .select("value, metric_date")
      .eq("song_id", songId)
      .eq("platform", "tiktok")
      .eq("metric", METRIC)
      .eq("source", "apify")
      .lt("metric_date", metricDate)
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const anterior = numOrNull(ultimo?.value);
    if (anterior !== null && anterior > 0 && agg.soma < anterior * (1 - DROP_ALERT_RATIO)) {
      const queda = ((1 - agg.soma / anterior) * 100).toFixed(1);
      avisos.push(
        `${agg.song.title ?? songId}: queda de ${queda}% (${anterior} → ${agg.soma}) — gravado com aviso`,
      );
    }

    linhasMusica.push({
      company_id: agg.song.company_id,
      artist_id: agg.song.artist_id,
      song_id: songId,
      platform: "tiktok",
      metric: METRIC,
      metric_date: metricDate,
      value: agg.soma,
      source: "apify",
      source_ref: (() => {
        const ids = alvos.filter((a) => a.song_id === songId && contagens.has(a.music_id));
        const lote = ids.filter((a) => origem.get(a.music_id)?.ref.endsWith(apifyRunId)).length;
        const indiv = ids.filter((a) => origem.get(a.music_id)?.ref.endsWith(":individual")).length;
        const pnl = ids.filter((a) => origem.get(a.music_id)?.source === PANEL_SOURCE);
        return `${apifyRunId}:${agg.vistos}/${agg.total} sons (apify lote ${lote}, apify individual ${indiv}, painel ${pnl.length}${
          pnl.length ? ` [${pnl.map((a) => `${a.music_id}=${contagens.get(a.music_id)}`).join(",")}]` : ""
        }); precisão: ${foraDaSoma.length === 0 ? "completa" : `parcial ${agg.vistos}/${agg.total}`}${
          foraDaSoma.length ? `; fora: ${foraDaSoma.join(",")}` : ""
        }`;
      })(),
      captured_at: new Date().toISOString(),
    });
  }
  notes.push(...avisos);

  // 5. Escrita.
  let rowsWritten = 0;
  let errorCount = 0;
  if (!dryRun) {
    if (linhasSom.length > 0) {
      const { error } = await admin
        .from("artist_song_tiktok_sound_daily")
        .upsert(linhasSom, { onConflict: "music_id,metric_date" });
      if (error) {
        errorCount++;
        notes.push(`upsert sound_daily falhou: ${error.message}`);
      } else {
        rowsWritten += linhasSom.length;
      }
    }
    if (linhasMusica.length > 0) {
      const { error } = await admin
        .from("artist_song_metrics_daily")
        .upsert(linhasMusica, { onConflict: "song_id,platform,metric,metric_date,source" });
      if (error) {
        errorCount++;
        notes.push(`upsert metrics_daily falhou: ${error.message}`);
      } else {
        rowsWritten += linhasMusica.length;
      }
    }
    const afetadas = [...new Set(linhasSom.map((l) => String(l.song_id)))];
    if (afetadas.length > 0) {
      const { error } = await admin
        .from("artist_songs")
        .update({ report_stale_at: new Date().toISOString() })
        .in("id", afetadas);
      if (error) notes.push(`report_stale_at falhou: ${error.message}`);
    }
  }

  // Som validated sem resposta conta como erro: a corrida nunca fecha 'success'.
  const errosSom = semResposta.length > 0 ? 1 : 0;
  const errorText = errorCount > 0
    ? notes.find((n) => n.includes("falhou")) ?? notes[notes.length - 1]
    : errosSom > 0
    ? `sons validated sem resposta do ator: ${semRespostaTxt.join(", ")}`
    : null;

  await finishSyncRun(admin, runRecordId, startedMs, {
    status: resolveStatus(rowsWritten, errorCount + errosSom),
    api_calls: apiCalls,
    rows_written: rowsWritten,
    details: {
      ator: APIFY_ACTOR_NAME,
      apify_run_id: apifyRunId,
      sons_pedidos: musicIds.length,
      sons_respondidos: contagens.size,
      respondidos_lote: respLote,
      segunda_passagem: segundaPassagem,
      painel,
      musicas: porMusica.size,
      somas_gravadas: linhasMusica.length,
      sem_resposta: semResposta.map((x) => ({ ...x, ultima_resposta: ultimaResposta.get(x.music_id) ?? null })),
      notes,
    },
    error_text: errorText,
  });

  return json({
    ok: errorCount === 0,
    dry_run: dryRun,
    ator: APIFY_ACTOR_NAME,
    apify_run_id: apifyRunId,
    metric_date: metricDate,
    sons_pedidos: musicIds.length,
    sons_respondidos: contagens.size,
    respondidos_lote: respLote,
    segunda_passagem: segundaPassagem,
    painel,
    linhas_som: linhasSom.length,
    somas_por_musica: linhasMusica.length,
    sem_resposta: semResposta,
    rows_written: rowsWritten,
    notes,
  });
});
