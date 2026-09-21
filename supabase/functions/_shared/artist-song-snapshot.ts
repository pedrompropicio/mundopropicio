// artist-song-snapshot.ts — COLETOR ÚNICO do snapshot de uma música (D-ERP54).
//
// Extraído de artist-song-report/index.ts sem alteração de comportamento, para
// ser reutilizado por artist-ads-strategy-generate (D-ERP98). Toda a leitura é
// feita com o cliente que lhe é passado: adminClient() no relatório, cliente da
// sessão do utilizador no gerador de estratégia.
//
// Regra absoluta: números só daqui. Contagens e ritmos por dia saem inteiros;
// percentuais com 1 casa. Comparáveis SÓ pela RPC song_benchmark_aligned.

// deno-lint-ignore no-explicit-any
export type Admin = any;
// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export function daysAgoFrom(base: string, n: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
}
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}
export const num = (v: unknown): number => (v == null ? 0 : Number(v));
export const round2 = (v: number) => Math.round(v * 100) / 100;
/** Contagens e ritmos por dia saem do snapshot já como INTEIROS (D-ERP54 adenda 19/09/2026). */
export const int0 = (v: number) => Math.round(v);
export const intOrNull = (v: unknown): number | null => (v == null ? null : Math.round(Number(v)));
/** Percentuais e índices: 1 casa decimal. */
export const pct1 = (v: unknown): number | null => (v == null ? null : Math.round(Number(v) * 10) / 10);

/** Soma de valores por dia; nunca inventa dias que não existem. */
function seriesFrom(rows: Row[]): { date: string; cumulative: number; daily_gain: number | null }[] {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.metric_date, num(r.value));
  const dates = [...byDate.keys()].sort();
  return dates.map((d, i) => ({
    date: d,
    cumulative: byDate.get(d)!,
    daily_gain: i === 0 ? null : int0(byDate.get(d)! - byDate.get(dates[i - 1])!),
  }));
}

function avgGain(serie: { daily_gain: number | null }[], from: number, to: number): number | null {
  const slice = serie.slice(serie.length - from, serie.length - to).filter((p) => p.daily_gain != null);
  if (slice.length === 0) return null;
  return int0(slice.reduce((s, p) => s + (p.daily_gain ?? 0), 0) / slice.length);
}

// ---------------------------------------------------------------- snapshot
export async function buildSnapshot(admin: Admin, songId: string, days: number) {
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
        ? int0(serie[serie.length - 1].cumulative - serie[0].cumulative)
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

  // ---- Spotify for Artists: streams por playlist (recolha assistida, D-ERP67)
  const { data: s4aRows, error: s4aErr } = await admin
    .from("v_song_playlist_streams_latest")
    .select(
      "snapshot_date, period_days, rank, playlist_name, made_by, streams, date_added, playlists_na_snapshot, streams_total, streams_spotify_owned, streams_user_playlists, streams_top10, soundcharts_subscribers, soundcharts_playlist_type, soundcharts_position",
    )
    .eq("song_id", songId)
    .order("streams", { ascending: false });
  if (s4aErr) lacunas.push(`streams por playlist (S4A) indisponíveis: ${s4aErr.message}`);
  const s4aAll = s4aRows ?? [];
  const s4aMetrics = (smRows ?? []).filter((r: Row) =>
    typeof r.metric === "string" && r.metric.startsWith("s4a_")
  );
  const s4aMetricLatest: Record<string, unknown> = {};
  for (const r of s4aMetrics) {
    const prev = s4aMetricLatest[r.metric as string] as Row | undefined;
    if (!prev || String(r.metric_date) >= String(prev.data)) {
      s4aMetricLatest[r.metric as string] = { valor: num(r.value), data: r.metric_date };
    }
  }
  const spotifyForArtists = s4aAll.length === 0 && s4aMetrics.length === 0 ? null : {
    fonte: "Spotify for Artists (recolha assistida na sessão do artista)",
    snapshot: s4aAll[0]?.snapshot_date ?? null,
    periodo_dias: s4aAll[0]?.period_days ?? null,
    metricas_da_musica: s4aMetricLatest,
    totais: s4aAll.length
      ? {
        playlists_na_snapshot: s4aAll[0].playlists_na_snapshot,
        streams_total: s4aAll[0].streams_total,
        streams_playlists_do_spotify: s4aAll[0].streams_spotify_owned,
        streams_playlists_de_utilizadores: s4aAll[0].streams_user_playlists,
        streams_top_10: s4aAll[0].streams_top10,
      }
      : null,
    top_15: s4aAll.slice(0, 15).map((p: Row) => ({
      posicao: p.rank,
      nome: p.playlist_name,
      feita_por: p.made_by,
      streams: p.streams,
      data_adicao: p.date_added,
      soundcharts_seguidores: p.soundcharts_subscribers,
      soundcharts_tipo: p.soundcharts_playlist_type,
      soundcharts_posicao: p.soundcharts_position,
    })),
    nota:
      "S4A é a fonte oficial de streams; a Soundcharts é a contagem pública desfasada. Quando ambas existirem, avaliar pelo S4A e mencionar a diferença.",
  };
  if (!spotifyForArtists) {
    lacunas.push("sem recolha do Spotify for Artists (streams por playlist) desta música");
  }

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
        return int0(m.views - m.views_7d_ago);
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
        ? int0(
          withMetrics.reduce((s, v) => s + (v.views ?? 0), 0) /
            withMetrics.filter((v) => v.views != null).length,
        )
        : null,
      media_views_videos_sem_esta_musica_60d: baseline.length
        ? int0(baseline.reduce((s, v) => s + v, 0) / baseline.length)
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
      delta_desde_lancamento: atLaunch != null ? int0(actual - atLaunch) : null,
      delta_30d_antes_do_lancamento: atLaunch != null && pre != null ? int0(atLaunch - pre) : null,
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
    .select("platform, dimension, dim_key, value, unit, snapshot_date")
    .eq("artist_id", song.artist_id)
    .order("snapshot_date", { ascending: false })
    .limit(500);
  const lastSnap = demoRows?.[0]?.snapshot_date ?? null;
  const demoLatest = (demoRows ?? []).filter((r: Row) => r.snapshot_date === lastSnap);
  // `unit` acompanha sempre o número: 'count' é contagem, 'pct' é quota já em
  // percentagem da plataforma. Valores de `unit` diferentes não se somam.
  const topDim = (dim: string) =>
    demoLatest.filter((r: Row) => r.dimension === dim)
      .sort((a: Row, b: Row) => num(b.value) - num(a.value))
      .slice(0, 5)
      .map((r: Row) => ({
        chave: r.dim_key,
        valor: num(r.value),
        unit: String(r.unit ?? "count"),
        platform: r.platform ?? null,
      }));
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
      delta_7d_pct: pct1(m.d7_pct),
      delta_30d_pct: pct1(m.d30_pct),
      indice: pct1(m.momentum_index),
    })),
  }));
  const momentumDoArtista = momentum.filter((m) => m.artist_id === song.artist_id).map((m) => ({
    plataforma: m.platform,
    metrica: m.metric,
    valor: num(m.latest_value),
    delta_7d_pct: pct1(m.d7_pct),
    delta_30d_pct: pct1(m.d30_pct),
    indice: pct1(m.momentum_index),
  }));
  if (comparaveis.length === 0) lacunas.push("sem artistas comparáveis definidos");

  // ---- benchmark alinhado por idade (D-ERP59)
  const { data: benchRows, error: bErr } = await admin.rpc("song_benchmark_aligned", {
    p_song_id: songId,
  });
  if (bErr) lacunas.push(`benchmark alinhado indisponível: ${bErr.message}`);
  const benchmarkAlinhado = (benchRows ?? []).map((r: Row) => ({
    artista: r.artist_name,
    musica: r.title,
    e_a_propria: r.is_self,
    release_date: r.release_date,
    idade_hoje_dias: r.dias_desde_lancamento,
    idade_comparada_dias: r.idade_alinhada_dias,
    nota_da_musica: r.song_notes ?? null,
    spotify_streams_a_esta_idade: r.spotify_streams_dia_n,
    spotify_streams_a_esta_idade_data: r.spotify_streams_dia_n_date,
    spotify_streams_por_dia_a_esta_idade: intOrNull(r.spotify_streams_por_dia_n),
    spotify_streams_hoje: r.spotify_streams_hoje,
    spotify_posicao_a_esta_idade: r.rank_spotify_dia_n,
    spotify_total_com_dados: r.total_spotify_dia_n,
    tiktok_ugc_publicacoes: r.tiktok_ugc_latest,
    tiktok_ugc_data: r.tiktok_ugc_date,
    tiktok_ugc_fonte: r.tiktok_ugc_source,
    tiktok_ugc_por_dia: intOrNull(r.tiktok_ugc_por_dia),
    tiktok_ugc_posicao_por_dia: r.rank_tiktok_ugc_por_dia,
    tiktok_ugc_total_com_dados: r.total_tiktok_ugc_por_dia,
    instagram_reels: r.instagram_reels_latest,
    instagram_reels_posicao: r.rank_instagram_reels,
    instagram_reels_total_com_dados: r.total_instagram_reels,
  }));
  if (benchmarkAlinhado.length <= 1) {
    lacunas.push("sem músicas de referência dos comparáveis para comparar à mesma idade");
  }

  // ---- frescura dos dados manuais (D-ERP54 adenda 19/09/2026)
  const atraso = (d: unknown): number | null =>
    d == null ? null : daysBetween(String(d).slice(0, 10), periodEnd);
  const selfRow = (benchRows ?? []).find((r: Row) => r.is_self) ?? null;
  const ugcData = selfRow?.tiktok_ugc_date ?? null;
  const s4aSnap = spotifyForArtists?.snapshot ?? null;
  const compUgcDates = (benchRows ?? [])
    .filter((r: Row) => !r.is_self && r.tiktok_ugc_latest != null && r.tiktok_ugc_date != null)
    .map((r: Row) => String(r.tiktok_ugc_date).slice(0, 10))
    .sort();
  const benchUgcMaisAntiga = compUgcDates.length ? compUgcDates[0] : null;
  const frescura = {
    gerado_em: new Date().toISOString(),
    ugc_tiktok_data: ugcData ?? null,
    ugc_dias_de_atraso: atraso(ugcData),
    s4a_snapshot: s4aSnap ?? null,
    s4a_dias_de_atraso: atraso(s4aSnap),
    benchmark_ugc_data_mais_antiga: benchUgcMaisAntiga,
    benchmark_ugc_dias_de_atraso: atraso(benchUgcMaisAntiga),
  };

  return {
    notFound: false as const,
    song,
    periodStart,
    periodEnd,
    snapshot: {
      periodo: { inicio: periodStart, fim: periodEnd, dias: days },
      frescura,
      musica,
      streams: streamsPorPlataforma,
      playlists,
      spotify_for_artists: spotifyForArtists,
      videos: videosPorPlataforma,
      artista: {
        por_plataforma: artistaPorPlataforma,
        momentum: momentumDoArtista,
        instagram_oficial: instagramOficial,
        demografia,
      },
      comparaveis,
      benchmark_alinhado: benchmarkAlinhado,
      benchmark_nota:
        "Só as músicas do elenco têm dados do Spotify for Artists. As músicas de referência (comparáveis) só têm contagem pública da Soundcharts — não comparar streams do S4A com streams da Soundcharts.",
      lacunas,
    },
  };

}
