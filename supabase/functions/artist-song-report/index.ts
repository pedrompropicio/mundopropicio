// artist-song-report — relatório de lançamento de uma música, gerado por LLM.
//
// POST { song_id: uuid, days?: number (30), dry_run?: boolean (false) }
//
// Regra absoluta (D-ERP54): o modelo só pode usar números do snapshot que lhe
// enviamos. Nada é estimado. Quando um dado não existe, o snapshot diz-o em
// `lacunas` e o modelo tem de responder "sem dados".
//
// dry_run = true  → devolve só o snapshot, sem chamar o LLM e sem gravar.
// dry_run = false → chama o LLM, grava uma linha nova em artist_song_reports
//                   (histórico: regenerar nunca substitui) e devolve o relatório.
//
// Limite: no máximo 1 geração automática (trigger 'cron') por música por dia.

import {
  adminClient,
  authorize,
  callerCompanyIds,
  corsHeaders,
  json,
} from "../_shared/soundcharts.ts";
import { deduceTriggerSource, finishSyncRun, startSyncRun } from "../_shared/sync-run.ts";

const FUNCTION_NAME = "artist-song-report";
const ROLES = ["admin", "platform_admin", "manager", "editor"];
const MODEL = "google/gemini-2.5-flash";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// deno-lint-ignore no-explicit-any
type Admin = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const iso = (d: Date) => d.toISOString().slice(0, 10);
function daysAgoFrom(base: string, n: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
}
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Soma de valores por dia; nunca inventa dias que não existem. */
function seriesFrom(rows: Row[]): { date: string; cumulative: number; daily_gain: number | null }[] {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.metric_date, num(r.value));
  const dates = [...byDate.keys()].sort();
  return dates.map((d, i) => ({
    date: d,
    cumulative: byDate.get(d)!,
    daily_gain: i === 0 ? null : round2(byDate.get(d)! - byDate.get(dates[i - 1])!),
  }));
}

function avgGain(serie: { daily_gain: number | null }[], from: number, to: number): number | null {
  const slice = serie.slice(serie.length - from, serie.length - to).filter((p) => p.daily_gain != null);
  if (slice.length === 0) return null;
  return round2(slice.reduce((s, p) => s + (p.daily_gain ?? 0), 0) / slice.length);
}

// ---------------------------------------------------------------- snapshot
async function buildSnapshot(admin: Admin, songId: string, days: number) {
  const lacunas: string[] = [];
  const periodEnd = iso(new Date());
  const periodStart = daysAgoFrom(periodEnd, days);

  const { data: song, error: sErr } = await admin
    .from("artist_songs")
    .select(
      "id, artist_id, company_id, title, featuring, release_date, is_launch, launch_started_at, tracking_status, isrc",
    )
    .eq("id", songId)
    .maybeSingle();
  if (sErr) throw new Error(`artist_songs: ${sErr.message}`);
  if (!song) return { notFound: true as const };

  const { data: artist } = await admin
    .from("artists")
    .select("id, name, genre, city, roster_type")
    .eq("id", song.artist_id)
    .maybeSingle();

  const launchRef: string | null = song.launch_started_at ?? song.release_date ?? null;
  if (!launchRef) lacunas.push("sem data de lançamento nem launch_started_at na música");

  const musica = {
    titulo: song.title,
    featuring: song.featuring ?? [],
    isrc: song.isrc ?? null,
    release_date: song.release_date ?? null,
    is_launch: song.is_launch,
    launch_started_at: song.launch_started_at ?? null,
    dias_desde_lancamento: launchRef ? daysBetween(launchRef, periodEnd) : null,
    artista: artist ? { nome: artist.name, genero: artist.genre, cidade: artist.city } : null,
  };

  // ---- streams por plataforma
  const { data: smRows, error: smErr } = await admin
    .from("artist_song_metrics_daily")
    .select("platform, metric, metric_date, value")
    .eq("song_id", songId)
    .gte("metric_date", periodStart)
    .lte("metric_date", periodEnd)
    .order("metric_date", { ascending: true });
  if (smErr) throw new Error(`artist_song_metrics_daily: ${smErr.message}`);

  const streamsPorPlataforma: Row[] = [];
  const groups = new Map<string, Row[]>();
  for (const r of smRows ?? []) {
    const k = `${r.platform}|${r.metric}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  for (const [k, rows] of groups) {
    const [platform, metric] = k.split("|");
    const serie = seriesFrom(rows);
    const gains = serie.filter((p) => p.daily_gain != null);
    const melhor = gains.length
      ? gains.reduce((a, b) => ((b.daily_gain ?? 0) > (a.daily_gain ?? 0) ? b : a))
      : null;
    streamsPorPlataforma.push({
      plataforma: platform,
      metrica: metric,
      pontos: serie.length,
      serie_diaria: serie,
      total_acumulado: serie.length ? serie[serie.length - 1].cumulative : null,
      ganho_no_periodo: serie.length > 1
        ? round2(serie[serie.length - 1].cumulative - serie[0].cumulative)
        : null,
      media_diaria_ultimos_7: avgGain(serie, 7, 0),
      media_diaria_7_anteriores: avgGain(serie, 14, 7),
      melhor_dia: melhor ? { data: melhor.date, ganho: melhor.daily_gain } : null,
    });
  }
  if (streamsPorPlataforma.length === 0) lacunas.push("sem qualquer série de streams desta música");
  for (const p of ["spotify", "youtube", "deezer", "tiktok", "shazam"]) {
    if (!streamsPorPlataforma.some((s) => s.plataforma === p)) {
      lacunas.push(`sem série ${p} da música`);
    }
  }

  // ---- playlists
  const { data: plRows, error: plErr } = await admin
    .from("artist_song_playlists")
    .select(
      "platform, playlist_name, playlist_type, owner_name, subscriber_count, position, peak_position, entry_date, exit_date, last_seen_at",
    )
    .eq("song_id", songId);
  if (plErr) throw new Error(`artist_song_playlists: ${plErr.message}`);
  const all = plRows ?? [];
  const activas = all.filter((p: Row) => !p.exit_date);
  const d7 = daysAgoFrom(periodEnd, 7);
  const porTipo: Record<string, number> = {};
  for (const p of activas) {
    const t = p.playlist_type ?? "sem tipo";
    porTipo[t] = (porTipo[t] ?? 0) + 1;
  }
  const playlists = {
    activas: activas.length,
    total_historico: all.length,
    por_tipo: porTipo,
    soma_seguidores_activas: activas.reduce((s: number, p: Row) => s + num(p.subscriber_count), 0),
    sem_seguidores_conhecidos: activas.filter((p: Row) => p.subscriber_count == null).length,
    top_10: [...activas]
      .sort((a: Row, b: Row) => num(b.subscriber_count) - num(a.subscriber_count))
      .slice(0, 10)
      .map((p: Row) => ({
        nome: p.playlist_name,
        tipo: p.playlist_type,
        plataforma: p.platform,
        seguidores: p.subscriber_count,
        posicao: p.position,
        pico: p.peak_position,
        entrada: p.entry_date,
      })),
    entradas_ultimos_7d: all.filter((p: Row) => p.entry_date && p.entry_date >= d7).length,
    saidas_ultimos_7d: all.filter((p: Row) => p.exit_date && p.exit_date >= d7).length,
  };
  if (all.length === 0) lacunas.push("sem dados de playlists desta música");

  // ---- vídeos ligados à música
  const { data: linked, error: lcErr } = await admin
    .from("artist_content")
    .select("id, platform, caption_excerpt, title, published_at, permalink, song_link_status")
    .eq("song_id", songId)
    .in("song_link_status", ["estimated", "confirmed"]);
  if (lcErr) throw new Error(`artist_content: ${lcErr.message}`);
  const linkedIds = (linked ?? []).map((c: Row) => c.id);

  const metricsByContent = new Map<string, Row>();
  if (linkedIds.length > 0) {
    const { data: cm } = await admin
      .from("artist_content_metrics_daily")
      .select("content_id, metric, metric_date, value")
      .in("content_id", linkedIds)
      .order("metric_date", { ascending: true });
    for (const r of cm ?? []) {
      const cur = metricsByContent.get(r.content_id) ?? { views: null, likes: null, views_7d_ago: null };
      if (r.metric === "views") {
        cur.views = num(r.value);
        if (r.metric_date <= d7) cur.views_7d_ago = num(r.value);
      }
      if (r.metric === "likes") cur.likes = num(r.value);
      metricsByContent.set(r.content_id, cur);
    }
  }

  const videosPorPlataforma: Row[] = [];
  const byPlat = new Map<string, Row[]>();
  for (const c of linked ?? []) {
    if (!byPlat.has(c.platform)) byPlat.set(c.platform, []);
    byPlat.get(c.platform)!.push(c);
  }

  // média de views dos vídeos do artista NÃO ligados a esta música (60 dias)
  const d60 = daysAgoFrom(periodEnd, 60);
  const { data: others } = await admin
    .from("artist_content")
    .select("id, platform, published_at, song_id")
    .eq("artist_id", song.artist_id)
    .gte("published_at", `${d60}T00:00:00Z`);
  const othersFiltered = (others ?? []).filter((c: Row) => c.song_id !== songId);
  const otherViews = new Map<string, number[]>();
  if (othersFiltered.length > 0) {
    const { data: om } = await admin
      .from("artist_content_metrics_daily")
      .select("content_id, metric, value")
      .in("content_id", othersFiltered.map((c: Row) => c.id))
      .eq("metric", "views");
    const latest = new Map<string, number>();
    for (const r of om ?? []) latest.set(r.content_id, num(r.value));
    for (const c of othersFiltered) {
      const v = latest.get(c.id);
      if (v == null) continue;
      if (!otherViews.has(c.platform)) otherViews.set(c.platform, []);
      otherViews.get(c.platform)!.push(v);
    }
  }

  for (const [plat, items] of byPlat) {
    const withMetrics = items.map((c: Row) => ({
      legenda: (c.title ?? c.caption_excerpt ?? "").slice(0, 120),
      plataforma: c.platform,
      data: c.published_at,
      ligacao: c.song_link_status,
      views: metricsByContent.get(c.id)?.views ?? null,
      likes: metricsByContent.get(c.id)?.likes ?? null,
      delta_views_7d: (() => {
        const m = metricsByContent.get(c.id);
        if (!m || m.views == null || m.views_7d_ago == null) return null;
        return round2(m.views - m.views_7d_ago);
      })(),
    }));
    const baseline = otherViews.get(plat) ?? [];
    videosPorPlataforma.push({
      plataforma: plat,
      numero_de_videos: items.length,
      views_totais: withMetrics.reduce((s, v) => s + (v.views ?? 0), 0),
      videos_sem_metricas: withMetrics.filter((v) => v.views == null).length,
      top_5: [...withMetrics].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5),
      media_views_videos_da_musica: withMetrics.filter((v) => v.views != null).length
        ? round2(
          withMetrics.reduce((s, v) => s + (v.views ?? 0), 0) /
            withMetrics.filter((v) => v.views != null).length,
        )
        : null,
      media_views_videos_sem_esta_musica_60d: baseline.length
        ? round2(baseline.reduce((s, v) => s + v, 0) / baseline.length)
        : null,
      videos_na_comparacao: baseline.length,
    });
  }
  if ((linked ?? []).length === 0) lacunas.push("sem vídeos ligados a esta música");

  // ---- artista: seguidores/ouvintes, aceleração no lançamento
  const artistFrom = launchRef ? daysAgoFrom(launchRef, 30) : periodStart;
  const { data: amRows, error: amErr } = await admin
    .from("artist_metrics_daily")
    .select("platform, metric, metric_date, value, source")
    .eq("artist_id", song.artist_id)
    .gte("metric_date", artistFrom)
    .order("metric_date", { ascending: true });
  if (amErr) throw new Error(`artist_metrics_daily: ${amErr.message}`);

  const artistaPorPlataforma: Row[] = [];
  const amGroups = new Map<string, Row[]>();
  for (const r of amRows ?? []) {
    const k = `${r.platform}|${r.metric}`;
    if (!amGroups.has(k)) amGroups.set(k, []);
    amGroups.get(k)!.push(r);
  }
  const valueAt = (rows: Row[], date: string): number | null => {
    const before = rows.filter((r) => r.metric_date <= date);
    return before.length ? num(before[before.length - 1].value) : null;
  };
  for (const [k, rows] of amGroups) {
    const [platform, metric] = k.split("|");
    if (!["monthly_listeners", "followers", "subscribers"].includes(metric)) continue;
    const actual = num(rows[rows.length - 1].value);
    const atLaunch = launchRef ? valueAt(rows, launchRef) : null;
    const pre = launchRef ? valueAt(rows, daysAgoFrom(launchRef, 30)) : null;
    artistaPorPlataforma.push({
      plataforma: platform,
      metrica: metric,
      valor_actual: actual,
      data_actual: rows[rows.length - 1].metric_date,
      fonte: rows[rows.length - 1].source,
      valor_no_lancamento: atLaunch,
      delta_desde_lancamento: atLaunch != null ? round2(actual - atLaunch) : null,
      delta_30d_antes_do_lancamento: atLaunch != null && pre != null ? round2(atLaunch - pre) : null,
    });
  }
  if (artistaPorPlataforma.length === 0) lacunas.push("sem métricas de audiência do artista no período");

  // Instagram oficial: reach e accounts_engaged, 7 vs 7
  const sum = (rows: Row[], from: string, to: string) =>
    rows.filter((r) => r.metric_date > from && r.metric_date <= to)
      .reduce((s, r) => s + num(r.value), 0);
  const igRows = (amRows ?? []).filter((r: Row) =>
    r.platform === "instagram" && ["reach", "accounts_engaged"].includes(r.metric)
  );
  const d14 = daysAgoFrom(periodEnd, 14);
  const instagramOficial = igRows.length === 0 ? null : {
    reach_ultimos_7d: sum(igRows.filter((r: Row) => r.metric === "reach"), d7, periodEnd),
    reach_7_anteriores: sum(igRows.filter((r: Row) => r.metric === "reach"), d14, d7),
    accounts_engaged_ultimos_7d: sum(
      igRows.filter((r: Row) => r.metric === "accounts_engaged"),
      d7,
      periodEnd,
    ),
    accounts_engaged_7_anteriores: sum(
      igRows.filter((r: Row) => r.metric === "accounts_engaged"),
      d14,
      d7,
    ),
  };
  if (!instagramOficial) lacunas.push("sem métricas oficiais de Instagram (reach / accounts_engaged)");

  // demografia
  const { data: demoRows } = await admin
    .from("artist_audience_demographics")
    .select("platform, dimension, dim_key, value, snapshot_date")
    .eq("artist_id", song.artist_id)
    .order("snapshot_date", { ascending: false })
    .limit(500);
  const lastSnap = demoRows?.[0]?.snapshot_date ?? null;
  const demoLatest = (demoRows ?? []).filter((r: Row) => r.snapshot_date === lastSnap);
  const topDim = (dim: string) =>
    demoLatest.filter((r: Row) => r.dimension === dim)
      .sort((a: Row, b: Row) => num(b.value) - num(a.value))
      .slice(0, 5)
      .map((r: Row) => ({ chave: r.dim_key, valor: num(r.value) }));
  const demografia = lastSnap
    ? { snapshot: lastSnap, top_cidades: topDim("city"), top_faixas_etarias: topDim("age") }
    : null;
  if (!demografia) lacunas.push("sem demografia de audiência do artista");

  // ---- comparáveis
  const { data: comps } = await admin
    .from("artist_comparables")
    .select("position, reason, comparable_artist_id, artists!artist_comparables_comparable_artist_id_fkey(name)")
    .eq("artist_id", song.artist_id)
    .order("position", { ascending: true });
  const compIds = (comps ?? []).map((c: Row) => c.comparable_artist_id);
  let momentum: Row[] = [];
  if (compIds.length > 0) {
    const { data: mom } = await admin
      .from("v_artist_momentum")
      .select("artist_id, artist_name, platform, metric, latest_date, latest_value, d7_pct, d30_pct, momentum_index")
      .in("artist_id", [...compIds, song.artist_id])
      .in("platform", ["spotify", "instagram"]);
    momentum = mom ?? [];
  }
  const comparaveis = (comps ?? []).map((c: Row) => ({
    posicao: c.position,
    nome: c.artists?.name ?? null,
    razao: c.reason,
    momentum: momentum.filter((m) => m.artist_id === c.comparable_artist_id).map((m) => ({
      plataforma: m.platform,
      metrica: m.metric,
      valor: num(m.latest_value),
      data: m.latest_date,
      delta_7d_pct: m.d7_pct,
      delta_30d_pct: m.d30_pct,
      indice: m.momentum_index,
    })),
  }));
  const momentumDoArtista = momentum.filter((m) => m.artist_id === song.artist_id).map((m) => ({
    plataforma: m.platform,
    metrica: m.metric,
    valor: num(m.latest_value),
    delta_7d_pct: m.d7_pct,
    delta_30d_pct: m.d30_pct,
    indice: m.momentum_index,
  }));
  if (comparaveis.length === 0) lacunas.push("sem artistas comparáveis definidos");

  return {
    notFound: false as const,
    song,
    periodStart,
    periodEnd,
    snapshot: {
      periodo: { inicio: periodStart, fim: periodEnd, dias: days },
      musica,
      streams: streamsPorPlataforma,
      playlists,
      videos: videosPorPlataforma,
      artista: {
        por_plataforma: artistaPorPlataforma,
        momentum: momentumDoArtista,
        instagram_oficial: instagramOficial,
        demografia,
      },
      comparaveis,
      lacunas,
    },
  };
}

// ---------------------------------------------------------------- LLM
const SYSTEM_PROMPT =
  `Você é analista de marketing musical especializado em artistas de forró e piseiro no Nordeste do Brasil.
Seu leitor é empresarial (produtoras e casas de evento) e olha número: fale com dado na mão, sem enfeite.

REGRAS ABSOLUTAS:
1. Você só pode citar números que estão no JSON do snapshot. É PROIBIDO estimar, arredondar para valores "bonitos", inferir números ausentes ou trazer benchmarks de fora.
2. Toda recomendação precisa citar em "porque" o número exato do snapshot que a justifica.
3. Se o dado não existe no snapshot, escreva "sem dados" e liste isso em lacunas_de_dados. Nunca preencha com suposição.
4. Recomendações práticas e mensuráveis: ação concreta, plataforma, esforço, métrica de sucesso e prazo.
5. Português do Brasil.`;

const REPORT_TOOL = {
  type: "function",
  function: {
    name: "gerar_relatorio",
    description: "Devolve o relatório de lançamento estruturado.",
    parameters: {
      type: "object",
      properties: {
        resumo_executivo: { type: "string", description: "3 a 5 frases." },
        diagnostico_por_plataforma: {
          type: "array",
          items: {
            type: "object",
            properties: {
              plataforma: { type: "string" },
              leitura: { type: "string" },
              numeros_citados: { type: "array", items: { type: "string" } },
            },
            required: ["plataforma", "leitura", "numeros_citados"],
          },
        },
        o_que_esta_puxando: { type: "array", items: { type: "string" } },
        sinais_de_alerta: { type: "array", items: { type: "string" } },
        recomendacoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              prioridade: { type: "integer", description: "1 (maior) a 5." },
              acao: { type: "string" },
              porque: { type: "string", description: "Cita o número do snapshot." },
              plataforma: { type: "string" },
              esforco: { type: "string", enum: ["baixo", "médio", "alto"] },
              metrica_de_sucesso: { type: "string" },
              prazo_dias: { type: "integer" },
            },
            required: [
              "prioridade",
              "acao",
              "porque",
              "plataforma",
              "esforco",
              "metrica_de_sucesso",
              "prazo_dias",
            ],
          },
        },
        plano_7_dias: {
          type: "array",
          items: {
            type: "object",
            properties: { dia: { type: "integer" }, acao: { type: "string" } },
            required: ["dia", "acao"],
          },
        },
        lacunas_de_dados: { type: "array", items: { type: "string" } },
      },
      required: [
        "resumo_executivo",
        "diagnostico_por_plataforma",
        "o_que_esta_puxando",
        "sinais_de_alerta",
        "recomendacoes",
        "plano_7_dias",
        "lacunas_de_dados",
      ],
      additionalProperties: false,
    },
  },
};

async function callLlm(snapshot: unknown) {
  const body = {
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Snapshot da base (única fonte de números permitida):\n\n${JSON.stringify(snapshot)}`,
      },
    ],
    tools: [REPORT_TOOL],
    tool_choice: { type: "function", function: { name: "gerar_relatorio" } },
  };
  const call = () =>
    fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let resp = await call();
  if (resp.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    resp = await call();
  }
  if (resp.status === 429) {
    return { fail: { status: 429, error: "rate_limited", message: "Lovable AI com limite de pedidos; tenta outra vez daqui a pouco." } };
  }
  if (resp.status === 402) {
    return { fail: { status: 402, error: "credits_exhausted", message: "Sem créditos no Lovable AI." } };
  }
  if (!resp.ok) {
    const t = await resp.text();
    return { fail: { status: 502, error: "ai_gateway_error", message: `HTTP ${resp.status} — ${t.slice(0, 500)}` } };
  }
  const data = await resp.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) {
    return { fail: { status: 502, error: "ai_invalid_response", message: "Modelo não devolveu a ferramenta." } };
  }
  let report: unknown;
  try {
    report = JSON.parse(args);
  } catch {
    return { fail: { status: 502, error: "ai_invalid_json", message: String(args).slice(0, 500) } };
  }
  return {
    report,
    tokens_in: data?.usage?.prompt_tokens ?? null,
    tokens_out: data?.usage?.completion_tokens ?? null,
  };
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();
  const startedMs = Date.now();
  const triggerSource = deduceTriggerSource(req);
  let runId: string | null = null;

  try {
    const caller = await authorize(req, admin, ROLES);
    if (!caller.allowed) return json({ error: "Forbidden" }, 403);
    const generatedBy = caller.isServiceRole ? "service_role" : (caller.userId ?? "desconhecido");

    let p: { song_id?: string; days?: number; dry_run?: boolean } = {};
    try {
      p = await req.json();
    } catch {
      p = {};
    }
    const songId = typeof p.song_id === "string" ? p.song_id : "";
    if (!songId) return json({ error: "song_id obrigatório" }, 400);
    const days = Number.isFinite(p.days) ? Math.max(7, Math.min(180, Number(p.days))) : 30;
    const dryRun = p.dry_run === true;

    const built = await buildSnapshot(admin, songId, days);
    if (built.notFound) return json({ error: "música não encontrada" }, 404);
    const { song, snapshot, periodStart, periodEnd } = built;

    if (!caller.isServiceRole) {
      const companyIds = await callerCompanyIds(admin, caller.userId!);
      if (companyIds !== "all" && !companyIds.includes(song.company_id)) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    if (dryRun) {
      return json({ ok: true, dry_run: true, song_id: songId, snapshot });
    }

    // 1 geração automática por música por dia (o pedido manual não é travado)
    if (triggerSource === "cron") {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { count } = await admin
        .from("artist_song_reports")
        .select("id", { count: "exact", head: true })
        .eq("song_id", songId)
        .gte("generated_at", since);
      if ((count ?? 0) > 0) {
        return json({ ok: true, skipped: "limite de 1 geração automática por dia", song_id: songId });
      }
    }

    if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

    runId = await startSyncRun(admin, {
      function_name: FUNCTION_NAME,
      trigger_source: triggerSource,
      dry_run: false,
      company_id: song.company_id,
      artist_id: song.artist_id,
    });

    const llm = await callLlm(snapshot);

    const base = {
      company_id: song.company_id,
      song_id: songId,
      artist_id: song.artist_id,
      period_start: periodStart,
      period_end: periodEnd,
      model: MODEL,
      input_snapshot: snapshot,
      generated_by: generatedBy,
    };

    if ("fail" in llm && llm.fail) {
      await admin.from("artist_song_reports").insert({
        ...base,
        status: "error",
        error_text: `${llm.fail.error}: ${llm.fail.message}`,
      });
      await finishSyncRun(admin, runId, startedMs, {
        status: "error",
        api_calls: 1,
        rows_written: 1,
        error_text: llm.fail.error,
      });
      return json({ error: llm.fail.error, message: llm.fail.message }, llm.fail.status);
    }

    const { data: inserted, error: iErr } = await admin
      .from("artist_song_reports")
      .insert({
        ...base,
        status: "ok",
        report: llm.report,
        tokens_in: llm.tokens_in,
        tokens_out: llm.tokens_out,
      })
      .select("id, generated_at")
      .single();
    if (iErr) throw new Error(`artist_song_reports: ${iErr.message}`);

    await finishSyncRun(admin, runId, startedMs, {
      status: "success",
      api_calls: 1,
      rows_written: 1,
      details: {
        song_id: songId,
        report_id: inserted.id,
        tokens_in: llm.tokens_in,
        tokens_out: llm.tokens_out,
        lacunas: snapshot.lacunas.length,
      },
    });

    return json({
      ok: true,
      report_id: inserted.id,
      generated_at: inserted.generated_at,
      model: MODEL,
      period: { inicio: periodStart, fim: periodEnd },
      tokens_in: llm.tokens_in,
      tokens_out: llm.tokens_out,
      report: llm.report,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error(`[${FUNCTION_NAME}]`, msg);
    await finishSyncRun(admin, runId, startedMs, { status: "error", error_text: msg });
    return json({ error: msg }, 500);
  }
});
