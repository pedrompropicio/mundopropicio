// artist-data-snapshot.ts — SNAPSHOT ÚNICO DE DADOS DO ARTISTA (D-ERP105).
//
// Um só coletor para tudo o que o módulo Carreira Artística sabe de um artista
// (e, quando indicada, de uma música): música, canais e conteúdo, audiência
// orgânica, histórico pago (meta + google), comparáveis, último relatório,
// teto de orçamento, publicações e criativos anunciáveis.
//
// Fronteira: só `public.*` (tabelas, vistas e RPCs artist_ads_*). Nada de `crm`.
// Toda a leitura usa o cliente passado (`userClient`) — sessão do utilizador no
// gerador de estratégia, adminClient() no relatório.
//
// Cada bloco leva a sua origem e a sua data: `fontes[]` traz
// { bloco, fonte, periodo, data_mais_recente, linhas, vazia }.
//
// NORMALIZAÇÃO DE GEOGRAFIA (obrigatória): os nomes de região chegam diferentes
// por fonte — Google "State of Pernambuco" / "Ceara" (sem acento), Meta
// "Pernambuco" / "São Paulo (state)", Instagram "Cidade, Estado". Todos são
// resolvidos a UF por public.br_estados (comparação sem acentos, sem prefixo
// "State of" e sem sufixo "(state)"), guardando uf, nome_original e fonte. No
// fim, pago + orgânico são agregados por UF numa tabela única, que é a base da
// regra de concentração regional.

import { buildSnapshot } from "./artist-song-snapshot.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export type SnapshotBloco =
  | "musica"
  | "conteudo"
  | "audiencia_organica"
  | "historico_pago"
  | "comparaveis"
  | "relatorio"
  | "teto"
  | "publicacoes"
  | "criativos";

export interface ArtistDataSnapshotParams {
  userClient: Any;
  artistId?: string | null;
  songId?: string | null;
  connectionId?: string | null;
  dias?: number;
  /** Subconjunto de blocos a recolher. Por omissão, todos. */
  blocos?: SnapshotBloco[];
  /** Plataformas do histórico pago. Por omissão meta + google. */
  plataformas?: string[];
  /** Plataforma de publicações/criativos anunciáveis. Por omissão 'meta'. */
  plataformaCriativos?: string;
}

export interface FonteInfo {
  bloco: string;
  fonte: string;
  periodo: string;
  data_mais_recente: string | null;
  linhas: number;
  vazia: boolean;
}

const DIAS_PAGO = 90;
const BREAKDOWN_DIMS = ["region", "age", "gender", "publisher_platform", "country", "device"];

const round2 = (v: number) => Math.round(v * 100) / 100;
const hoje = () => new Date().toISOString().slice(0, 10);

function mediana(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => Number.isFinite(x as number)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  const r = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  return Math.round(r * 10000) / 10000;
}

// ─────────────────────────────────── geografia
/** Minúsculas, sem acentos, sem "state of", sem "(state)", sem pontuação solta. */
export function normalizarNomeRegiao(nome: string): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(\s*state\s*\)/g, " ")
    .replace(/\b(state|estado|provincia|province)\s+(of|de|do|da)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface GeoResolver {
  /** nome cru (qualquer fonte) → { uf, regiao, nome } ou null */
  resolve: (nome: string) => { uf: string; regiao: string | null; nome: string } | null;
  estados: number;
}

export async function carregarGeoResolver(client: Any): Promise<{ resolver: GeoResolver; erro: string | null }> {
  const { data, error } = await client.from("br_estados").select("nome, uf, regiao");
  const porNome = new Map<string, { uf: string; regiao: string | null; nome: string }>();
  const porUf = new Map<string, { uf: string; regiao: string | null; nome: string }>();
  for (const r of (data ?? []) as Any[]) {
    const uf = String(r.uf ?? "").trim().toUpperCase();
    const item = { uf, regiao: r.regiao ?? null, nome: String(r.nome ?? "") };
    porNome.set(normalizarNomeRegiao(item.nome), item);
    porUf.set(uf, item);
  }
  const resolver: GeoResolver = {
    estados: porUf.size,
    resolve: (nomeCru: string) => {
      const cru = String(nomeCru ?? "").trim();
      if (!cru) return null;
      // "Cidade, Estado" (Instagram) → tenta a última parte, depois o todo.
      const partes = cru.split(",").map((p) => p.trim()).filter(Boolean).reverse();
      for (const p of [...partes, cru]) {
        const n = normalizarNomeRegiao(p);
        if (!n) continue;
        const direto = porNome.get(n);
        if (direto) return direto;
        if (/^[a-z]{2}$/.test(n)) {
          const porSigla = porUf.get(n.toUpperCase());
          if (porSigla) return porSigla;
        }
      }
      return null;
    },
  };
  return { resolver, erro: error?.message ?? null };
}

/**
 * FONTES ORGÂNICAS (D-ERP, 20/09/2026): a geografia orgânica tem DUAS fontes.
 *  • instagram → base de FÃS (seguidores/engaged/reached)
 *  • spotify   → audiência de ESCUTA (listeners)
 * Tudo o que não estiver aqui é tratado como PAGO (meta, google). Uma fonte nova
 * orgânica tem de ser acrescentada aqui, senão os seus números entram como gasto.
 */
const FONTES_ORGANICAS = new Set(["instagram", "spotify"]);

interface LinhaGeo {
  fonte: string; // 'meta' | 'google' | 'instagram' | 'spotify'
  nome_original: string;
  uf: string | null;
  impressoes?: number;
  cliques?: number;
  gasto?: number;
  quota_pct?: number | null;
  valor?: number;
}

function agregarGeoPorUf(linhas: LinhaGeo[], resolver: GeoResolver) {
  const porUf = new Map<string, Any>();
  const naoResolvidos: Any[] = [];
  for (const l of linhas) {
    const r = l.uf ? { uf: l.uf, regiao: null, nome: l.nome_original } : resolver.resolve(l.nome_original);
    if (!r) {
      naoResolvidos.push({ fonte: l.fonte, nome_original: l.nome_original });
      continue;
    }
    const chave = r.uf;
    const cur = porUf.get(chave) ?? {
      uf: chave,
      estado: r.nome,
      regiao: r.regiao,
      pago: {} as Record<string, Any>,
      // Orgânico POR FONTE: { instagram: {...}, spotify: {...} }. Nunca um balde único.
      organico: {} as Record<string, Any>,
      nomes_originais: [] as Any[],
    };
    if (!cur.regiao && r.regiao) cur.regiao = r.regiao;
    if (!cur.nomes_originais.some((n: Any) => n.fonte === l.fonte && n.nome === l.nome_original)) {
      cur.nomes_originais.push({ fonte: l.fonte, nome: l.nome_original });
    }
    if (FONTES_ORGANICAS.has(l.fonte)) {
      const q = l.quota_pct ?? null;
      const o = cur.organico[l.fonte] ?? { valor: 0, quota_pct: null };
      cur.organico[l.fonte] = {
        valor: (o.valor ?? 0) + (l.valor ?? 0),
        quota_pct: q == null ? o.quota_pct : round2((o.quota_pct ?? 0) + q),
      };
    } else {
      const p = cur.pago[l.fonte] ?? { impressoes: 0, cliques: 0, gasto: 0 };
      p.impressoes += l.impressoes ?? 0;
      p.cliques += l.cliques ?? 0;
      p.gasto = round2(p.gasto + (l.gasto ?? 0));
      cur.pago[l.fonte] = p;
    }
    porUf.set(chave, cur);
  }
  const tabela = [...porUf.values()].map((u) => {
    const pagoTotal = Object.values(u.pago as Record<string, Any>).reduce(
      (t: Any, p: Any) => ({
        impressoes: t.impressoes + p.impressoes,
        cliques: t.cliques + p.cliques,
        gasto: round2(t.gasto + p.gasto),
      }),
      { impressoes: 0, cliques: 0, gasto: 0 },
    );
    return {
      ...u,
      pago_total: pagoTotal,
      ctr_pct: pagoTotal.impressoes > 0
        ? Math.round((pagoTotal.cliques / pagoTotal.impressoes) * 100 * 10000) / 10000
        : null,
      cpc: pagoTotal.cliques > 0 ? Math.round((pagoTotal.gasto / pagoTotal.cliques) * 10000) / 10000 : null,
      cpm: pagoTotal.impressoes > 0 ? round2((pagoTotal.gasto / pagoTotal.impressoes) * 1000) : null,
      // Fãs = Instagram; ouvintes = Spotify. `quota_organica_pct` mantém-se igual ao
      // Instagram por compatibilidade com quem já a lê.
      quota_fas_pct: u.organico?.instagram?.quota_pct ?? null,
      quota_ouvintes_pct: u.organico?.spotify?.quota_pct ?? null,
      quota_organica_pct: u.organico?.instagram?.quota_pct ?? null,
    };
  });
  tabela.sort((a, b) =>
    (b.pago_total.impressoes - a.pago_total.impressoes) ||
    ((b.quota_fas_pct ?? 0) - (a.quota_fas_pct ?? 0)) ||
    ((b.quota_ouvintes_pct ?? 0) - (a.quota_ouvintes_pct ?? 0))
  );
  return { tabela, nao_resolvidos: naoResolvidos };
}

// ─────────────────────────────────── coletor
export async function buildArtistDataSnapshot(p: ArtistDataSnapshotParams) {
  const user = p.userClient;
  const dias = Number.isFinite(p.dias) ? Math.max(7, Math.min(180, Number(p.dias))) : 30;
  const plataformas = p.plataformas ?? ["meta", "google"];
  const plataformaCriativos = p.plataformaCriativos ?? "meta";
  const quer = (b: SnapshotBloco) => !p.blocos || p.blocos.includes(b);

  const avisos: string[] = [];
  const fontes: FonteInfo[] = [];
  const addFonte = (f: Partial<FonteInfo> & { bloco: string; fonte: string }) =>
    fontes.push({
      periodo: "actual",
      data_mais_recente: null,
      linhas: 0,
      vazia: (f.linhas ?? 0) === 0,
      ...f,
    } as FonteInfo);

  let artistId = p.artistId ?? null;
  const songId = p.songId ?? null;

  // ── 1) MÚSICA (+ streams, playlists, vídeos, comparáveis) via coletor da música
  let snapshotMusica: Any = null;
  let songRow: Any = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let notFoundSong = false;
  if (songId && (quer("musica") || quer("conteudo") || quer("comparaveis"))) {
    try {
      const built = await buildSnapshot(user, songId, dias);
      if (built.notFound) {
        notFoundSong = true;
      } else {
        snapshotMusica = built.snapshot;
        songRow = built.song;
        periodStart = built.periodStart;
        periodEnd = built.periodEnd;
        if (!artistId) artistId = built.song.artist_id;
      }
    } catch (e) {
      avisos.push(`snapshot da música incompleto: ${(e as Error).message}`);
    }
    addFonte({
      bloco: "musica",
      fonte:
        "public.artist_songs + artist_song_metrics_daily + artist_song_playlists (+ v_song_playlist_streams_latest)",
      periodo: periodStart && periodEnd ? `${periodStart} a ${periodEnd}` : `últimos ${dias} dias`,
      data_mais_recente: periodEnd,
      linhas: snapshotMusica ? 1 : 0,
    });
    addFonte({
      bloco: "conteudo",
      fonte: "public.artist_content + artist_content_metrics_daily (vídeos ligados à música)",
      periodo: `últimos ${dias} dias`,
      data_mais_recente: periodEnd,
      linhas: (snapshotMusica?.videos ?? []).length,
    });
    addFonte({
      bloco: "comparaveis",
      fonte: "RPC public.song_benchmark_aligned + public.v_artist_momentum",
      periodo: "à mesma idade de lançamento",
      data_mais_recente: periodEnd,
      linhas: (snapshotMusica?.benchmark_alinhado ?? []).length,
    });
  }

  if (!artistId) {
    return {
      notFoundSong,
      artistId: null as string | null,
      song: songRow,
      periodStart,
      periodEnd,
      blocos: { musica: snapshotMusica },
      geografia: null,
      fontes,
      avisos: [...avisos, "sem artist_id — snapshot incompleto"],
    };
  }

  // ── 2) CANAIS E CONTEÚDO por plataforma (contagens do artista todo)
  let canais: Any = null;
  if (quer("conteudo")) {
    const { data: cRows, error: cErr } = await user
      .from("artist_content")
      .select("id, platform, song_id, published_at, permalink, title, caption_excerpt")
      .eq("artist_id", artistId)
      .order("published_at", { ascending: false })
      .limit(1000);
    if (cErr) avisos.push(`conteúdo do artista indisponível: ${cErr.message}`);
    const rows: Any[] = cRows ?? [];
    const porPlataforma = new Map<string, Any>();
    for (const r of rows) {
      const k = String(r.platform ?? "?");
      const cur = porPlataforma.get(k) ?? { plataforma: k, publicacoes: 0, ligadas_a_esta_musica: 0, ultima: null };
      cur.publicacoes += 1;
      if (songId && r.song_id === songId) cur.ligadas_a_esta_musica += 1;
      const d = r.published_at ? String(r.published_at) : null;
      if (d && (!cur.ultima || d > cur.ultima)) cur.ultima = d;
      porPlataforma.set(k, cur);
    }
    canais = {
      _fonte: "public.artist_content (contagens por plataforma) + vídeos da música em blocos.musica.videos",
      total_publicacoes: rows.length,
      por_plataforma: [...porPlataforma.values()].sort((a, b) => b.publicacoes - a.publicacoes),
      top_videos_da_musica: snapshotMusica?.videos ?? [],
    };
    addFonte({
      bloco: "canais",
      fonte: "public.artist_content — publicações por plataforma",
      periodo: "histórico",
      data_mais_recente: [...porPlataforma.values()].map((v: Any) => v.ultima).filter(Boolean).sort().pop() ??
        null,
      linhas: rows.length,
    });
  }

  // ── 3) AUDIÊNCIA ORGÂNICA (por estado e por tipo)
  let audiencia: Any = null;
  const geoOrganica: LinhaGeo[] = [];
  if (quer("audiencia_organica")) {
    // DUAS fontes orgânicas: fãs (Instagram) e ouvintes (Spotify). A chave de
    // `por_estado` é "<platform>.<audience_type>" — nunca só o tipo.
    const { data: estadoRaw, error: estadoErr } = await user
      .from("v_artist_audience_by_state")
      .select("platform, audience_type, timeframe, snapshot_date, uf, regiao, estado_nome, valor, quota_pct")
      .eq("artist_id", artistId)
      .in("platform", ["instagram", "spotify"])
      .order("snapshot_date", { ascending: false })
      .limit(2000);
    if (estadoErr) avisos.push(`audiência por estado indisponível: ${estadoErr.message}`);
    const estadoRows: Any[] = estadoRaw ?? [];
    const porEstado: Record<string, Any> = {};
    let estadoDataMax: string | null = null;
    const datasPorPlataforma = new Map<string, string>();
    const linhasPorPlataforma = new Map<string, number>();
    for (const g of [...new Set(estadoRows.map((r: Any) => `${String(r.platform)}.${String(r.audience_type)}`))]) {
      const [plat, tipo] = g.split(".");
      const doGrupo = estadoRows.filter((r: Any) =>
        String(r.platform) === plat && String(r.audience_type) === tipo
      );
      linhasPorPlataforma.set(plat, (linhasPorPlataforma.get(plat) ?? 0) + doGrupo.length);
      const ultima = doGrupo.map((r: Any) => String(r.snapshot_date)).sort().pop() ?? null;
      if (ultima && (!estadoDataMax || ultima > estadoDataMax)) estadoDataMax = ultima;
      if (ultima && (!datasPorPlataforma.get(plat) || ultima > datasPorPlataforma.get(plat)!)) {
        datasPorPlataforma.set(plat, ultima);
      }
      const linhas = doGrupo.filter((r: Any) => String(r.snapshot_date) === ultima);
      const regioes = new Map<string, number>();
      for (const l of linhas) {
        const k = l.regiao ? String(l.regiao) : "(sem região)";
        regioes.set(k, Math.round(((regioes.get(k) ?? 0) + Number(l.quota_pct ?? 0)) * 10) / 10);
      }
      porEstado[g] = {
        platform: plat,
        audience_type: tipo,
        snapshot_date: ultima,
        timeframe: linhas[0]?.timeframe ?? null,
        top_10_estados: linhas
          .map((l: Any) => ({
            uf: String(l.uf ?? "").trim(),
            estado: l.estado_nome,
            regiao: l.regiao,
            valor: Number(l.valor ?? 0),
            quota_pct: l.quota_pct == null ? null : Number(l.quota_pct),
          }))
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 10),
        quota_por_regiao_pct: [...regioes.entries()]
          .map(([regiao, quota_pct]) => ({ regiao, quota_pct }))
          .sort((a, b) => b.quota_pct - a.quota_pct),
      };
      // Na tabela única por UF a fonte é a PLATAFORMA REAL — nunca "instagram" fixo,
      // senão os ouvintes de Spotify caíam na coluna de gasto.
      for (const l of linhas) {
        geoOrganica.push({
          fonte: plat,
          nome_original: String(l.estado_nome ?? l.uf ?? ""),
          uf: l.uf ? String(l.uf).trim().toUpperCase() : null,
          valor: Number(l.valor ?? 0),
          quota_pct: l.quota_pct == null ? null : Number(l.quota_pct),
        });
      }
    }
    if (!linhasPorPlataforma.get("instagram")) {
      avisos.push("fonte vazia: public.v_artist_audience_by_state sem linhas de Instagram (base de fãs) para este artista");
    }
    if (!linhasPorPlataforma.get("spotify")) {
      avisos.push("fonte vazia: public.v_artist_audience_by_state sem linhas de Spotify (audiência de escuta) para este artista");
    }
    for (const plat of ["instagram", "spotify"]) {
      addFonte({
        bloco: `audiencia_organica.por_estado.${plat}`,
        fonte: plat === "instagram"
          ? "public.v_artist_audience_by_state (platform=instagram) — base de FÃS por estado/região"
          : "public.v_artist_audience_by_state (platform=spotify) — audiência de ESCUTA (ouvintes) por estado/região",
        periodo: datasPorPlataforma.get(plat) ? `snapshot de ${datasPorPlataforma.get(plat)}` : "sem dados",
        data_mais_recente: datasPorPlataforma.get(plat) ?? null,
        linhas: linhasPorPlataforma.get(plat) ?? 0,
      });
    }

    const { data: demoRaw, error: demoErr } = await user
      .from("artist_audience_demographics")
      .select("platform, audience_type, dimension, dim_key, value, timeframe, snapshot_date, source")
      .eq("artist_id", artistId)
      .order("snapshot_date", { ascending: false })
      .limit(600);
    if (demoErr) avisos.push(`demografia orgânica indisponível: ${demoErr.message}`);
    const demoRows: Any[] = demoRaw ?? [];
    // Agrupado por plataforma + tipo de audiência: "instagram.followers",
    // "spotify.listeners", … O Spotify já não é descartado.
    const porTipo: Record<string, Any> = {};
    for (
      const g of [...new Set(demoRows.map((d: Any) => `${String(d.platform)}.${String(d.audience_type)}`))]
    ) {
      const [plat, tipo] = g.split(".");
      const doTipo = demoRows.filter((d: Any) =>
        String(d.platform) === plat && String(d.audience_type) === tipo
      );
      if (doTipo.length === 0) continue;
      const ultima = doTipo.map((d: Any) => String(d.snapshot_date)).sort().pop() ?? null;
      const linhas = doTipo.filter((d: Any) => String(d.snapshot_date) === ultima);
      const porDim = (dim: string) => {
        const ls = linhas.filter((l: Any) => String(l.dimension) === dim);
        const total = ls.reduce((s: number, l: Any) => s + Number(l.value ?? 0), 0);
        return ls
          .map((l: Any) => ({
            chave: l.dim_key,
            valor: Number(l.value ?? 0),
            quota_pct: total > 0 ? Math.round((Number(l.value ?? 0) / total) * 1000) / 10 : null,
          }))
          .sort((a, b) => b.valor - a.valor);
      };
      porTipo[t] = {
        snapshot_date: ultima,
        timeframe: linhas[0]?.timeframe ?? null,
        age: porDim("age"),
        gender: porDim("gender"),
      };
    }
    for (const t of ["engaged", "reached"]) {
      if (!porTipo[t]) avisos.push(`sem audiência "${t}" no Instagram — usada a de seguidores`);
    }
    const demoDatas = demoRows.map((d: Any) => String(d.snapshot_date)).sort();
    audiencia = {
      _fonte:
        "orgânica — public.v_artist_audience_by_state (estados/regiões) + public.artist_audience_demographics (idade/género por tipo de audiência). Secundária face ao pago.",
      por_estado: porEstado,
      por_tipo: porTipo,
      linhas_demografia: demoRows,
      periodo_demografia: demoRows.length
        ? { de: demoDatas[0], a: demoDatas[demoDatas.length - 1] }
        : null,
    };
    addFonte({
      bloco: "audiencia_organica.por_tipo",
      fonte:
        "public.artist_audience_demographics por tipo de audiência (followers/engaged/reached) — idade e género",
      periodo: Object.keys(porTipo).length
        ? Object.entries(porTipo).map(([t, v]: Any) => `${t}: ${v.snapshot_date}`).join("; ")
        : "sem dados",
      data_mais_recente: Object.values(porTipo).map((v: Any) => v.snapshot_date).filter(Boolean).sort()
        .pop() ?? null,
      linhas: Object.keys(porTipo).length,
    });
  }

  // ── 4) HISTÓRICO PAGO (campanhas, diário, anúncios, breakdowns meta + google)
  let historicoPago: Any = null;
  const geoPaga: LinhaGeo[] = [];
  if (quer("historico_pago")) {
    const { data: campanhas } = await user.rpc("artist_ads_campaigns", {
      p_artist_id: artistId,
      p_include_removed: false,
    });
    const { data: diario } = await user.rpc("artist_ads_daily", {
      p_artist_id: artistId,
      p_days: DIAS_PAGO,
    });
    const todasCampanhas: Any[] = campanhas ?? [];
    const diarioRows: Any[] = diario ?? [];
    const campanhasDaLigacao = p.connectionId
      ? todasCampanhas.filter((c: Any) => c?.connection_id === p.connectionId)
      : todasCampanhas;
    const idsDaLigacao = new Set(campanhasDaLigacao.map((c: Any) => String(c.campaign_id)));
    const diarioDaLigacao = diarioRows.filter((d: Any) => idsDaLigacao.has(String(d.campaign_id)));
    if (diarioRows.length > 0 && diarioDaLigacao.length === 0) {
      avisos.push(`nenhum dia de gasto nos últimos ${DIAS_PAGO} dias nas campanhas desta ligação`);
    }

    const agg = new Map<string, Any>();
    let periodoMin: string | null = null;
    let periodoMax: string | null = null;
    for (const d of diarioDaLigacao) {
      const key = String(d.campaign_id);
      const cur = agg.get(key) ?? {
        campaign_id: key,
        campaign_name: d.campaign_name ?? null,
        dias_com_gasto: 0,
        gasto: 0,
        impressoes: 0,
        cliques: 0,
        video_views: 0,
        resultados: 0,
        primeiro_dia: null as string | null,
        ultimo_dia: null as string | null,
      };
      cur.dias_com_gasto += 1;
      cur.gasto += Number(d.spend ?? 0);
      cur.impressoes += Number(d.impressions ?? 0);
      cur.cliques += Number(d.clicks ?? 0);
      cur.video_views += Number(d.video_views ?? 0);
      cur.resultados += Number(d.results ?? 0);
      const day = d.day ? String(d.day) : null;
      if (day) {
        if (!cur.primeiro_dia || day < cur.primeiro_dia) cur.primeiro_dia = day;
        if (!cur.ultimo_dia || day > cur.ultimo_dia) cur.ultimo_dia = day;
        if (!periodoMin || day < periodoMin) periodoMin = day;
        if (!periodoMax || day > periodoMax) periodoMax = day;
      }
      agg.set(key, cur);
    }

    const campanhasPagas = [...agg.values()]
      .sort((a, b) => b.gasto - a.gasto)
      .map((a) => {
        const c = campanhasDaLigacao.find((x: Any) => String(x.campaign_id) === a.campaign_id) ?? {};
        return {
          ...a,
          gasto: round2(a.gasto),
          objetivo: c.objective ?? null,
          status: c.status ?? null,
          moeda: c.currency ?? null,
          orcamento_diario_atual: c.budget_daily ?? null,
          metricas_30d_da_rpc: {
            gasto_30d: c.spend_30d ?? null,
            impressoes_30d: c.impressions_30d ?? null,
            cliques_30d: c.clicks_30d ?? null,
            video_views_30d: c.video_views_30d ?? null,
            cpc_30d: c.cpc_30d ?? null,
            cpv_30d: c.cpv_30d ?? null,
          },
          ultimo_sync: c.last_synced_at ?? null,
        };
      });

    const anuncios: Any[] = [];
    for (const c of campanhasPagas.slice(0, 10)) {
      const { data: ads } = await user.rpc("artist_ads_ads", {
        p_artist_id: artistId,
        p_campaign_id: c.campaign_id,
      });
      for (const a of (ads ?? [])) {
        if (Number(a?.spend_30d ?? 0) <= 0 && Number(a?.spend_7d ?? 0) <= 0) continue;
        anuncios.push({
          campanha: a.campaign_name,
          adset: a.adset_name,
          ad_id: a.ad_id,
          nome: a.ad_name,
          status: a.status,
          moeda: a.currency,
          criativo_id: a.creative_id ?? null,
          publicacao_permalink: a.permalink ?? null,
          thumbnail: a.thumbnail_url ?? null,
          gasto_30d: a.spend_30d,
          impressoes_30d: a.impressions_30d,
          cliques_30d: a.clicks_30d,
          ctr_30d: a.ctr_30d,
          cpc_30d: a.cpc_30d,
          video_3s_views_30d: a.video_3s_views_30d,
          thruplays_30d: a.thruplays_30d,
          custo_por_thruplay_30d: a.cost_per_thruplay_30d,
          gasto_7d: a.spend_7d,
          thruplays_7d: a.thruplays_7d,
          custo_por_thruplay_7d: a.cost_per_thruplay_7d,
          ultimo_sync: a.last_synced_at ?? null,
        });
      }
    }

    const ultimoSync =
      [...campanhasDaLigacao.map((c: Any) => c.last_synced_at), ...anuncios.map((a) => a.ultimo_sync)]
        .filter(Boolean).sort().pop() ?? null;

    const totais = campanhasPagas.reduce(
      (t, c) => ({
        gasto: round2(t.gasto + c.gasto),
        impressoes: t.impressoes + c.impressoes,
        cliques: t.cliques + c.cliques,
        video_views: t.video_views + c.video_views,
      }),
      { gasto: 0, impressoes: 0, cliques: 0, video_views: 0 },
    );

    // Breakdowns por plataforma (meta E google).
    const breakdownsPorPlataforma: Record<string, Any> = {};
    let linhasBreakdown = 0;
    let moedaBreakdown: string | null = null;
    for (const plat of plataformas) {
      const daPlataforma: Record<string, Any> = {};
      let linhasPlat = 0;
      for (const dim of BREAKDOWN_DIMS) {
        const { data: bdRaw, error: bdErr } = await user.rpc("artist_ads_breakdowns", {
          p_artist_id: artistId,
          p_days: DIAS_PAGO,
          p_platform: plat,
          p_breakdown: dim,
        });
        if (bdErr) {
          daPlataforma[dim] = { linhas: 0, top_10: [], medianas: null, erro: bdErr.message };
          avisos.push(`breakdown pago "${plat}/${dim}" indisponível: ${bdErr.message}`);
          continue;
        }
        const rows: Any[] = bdRaw ?? [];
        linhasPlat += rows.length;
        linhasBreakdown += rows.length;
        if (rows.length === 0) {
          daPlataforma[dim] = { linhas: 0, top_10: [], medianas: null };
          continue;
        }
        const calc = rows.map((r: Any) => {
          const imp = Number(r.impressions ?? 0);
          const clk = Number(r.clicks ?? 0);
          const gasto = Number(r.spend ?? 0);
          if (!moedaBreakdown && r.currency) moedaBreakdown = String(r.currency);
          if (dim === "region") {
            geoPaga.push({
              fonte: plat,
              nome_original: String(r.breakdown_value ?? ""),
              uf: null,
              impressoes: imp,
              cliques: clk,
              gasto,
            });
          }
          return {
            valor: r.breakdown_value,
            impressoes: imp,
            cliques: clk,
            gasto: round2(gasto),
            moeda: r.currency ?? null,
            quota_impressoes_pct: r.quota == null ? null : Number(r.quota),
            ctr_pct: imp > 0 ? Math.round((clk / imp) * 100 * 10000) / 10000 : null,
            cpc: clk > 0 ? Math.round((gasto / clk) * 10000) / 10000 : null,
            cpm: imp > 0 ? round2((gasto / imp) * 1000) : null,
          };
        });
        daPlataforma[dim] = {
          linhas: calc.length,
          medianas: {
            ctr_pct: mediana(calc.map((c) => c.ctr_pct)),
            cpc: mediana(calc.map((c) => c.cpc)),
            cpm: mediana(calc.map((c) => c.cpm)),
          },
          top_10: [...calc].sort((a, b) => b.impressoes - a.impressoes).slice(0, 10),
        };
      }
      if (linhasPlat === 0) avisos.push(`sem histórico pago por dimensão em "${plat}" nos últimos ${DIAS_PAGO} dias`);
      breakdownsPorPlataforma[plat] = daPlataforma;
    }

    historicoPago = {
      _fonte:
        "primária — RPCs public.artist_ads_daily(90) + artist_ads_campaigns + artist_ads_ads + artist_ads_breakdowns (meta e google)",
      janela_dias: DIAS_PAGO,
      moeda: moedaBreakdown,
      periodo: { de: periodoMin, a: periodoMax, dias_pedidos: DIAS_PAGO },
      ultima_atualizacao: ultimoSync,
      totais_90d: totais,
      campanhas: campanhasPagas,
      anuncios,
      breakdowns: breakdownsPorPlataforma["meta"] ?? {},
      breakdowns_por_plataforma: breakdownsPorPlataforma,
      nota:
        "CTR (cliques/impressões), CPC (gasto/cliques) e CPM (gasto/impressões×1000) calculados pelo motor a partir dos totais das RPCs. Top 10 por impressões em cada dimensão, com a mediana da dimensão.",
      dados_em_falta: [
        "alcance (reach) e CPM não existem nas RPCs de campanha/anúncio — só o CPM derivado dos breakdowns",
        "ThruPlays, 3s, CTR e custo por ThruPlay só existem em janela de 7 e 30 dias (por anúncio)",
        "por campanha/anúncio não há corte por região, idade ou género — esse corte existe só em historico_pago.breakdowns",
      ],
    };
    addFonte({
      bloco: "historico_pago.campanhas",
      fonte: "RPCs public.artist_ads_daily(90) + artist_ads_campaigns + artist_ads_ads",
      periodo: periodoMin && periodoMax ? `${periodoMin} a ${periodoMax}` : "sem dias com gasto",
      data_mais_recente: ultimoSync ? String(ultimoSync).slice(0, 10) : null,
      linhas: campanhasPagas.length,
    });
    addFonte({
      bloco: "historico_pago.breakdowns",
      fonte: `RPC public.artist_ads_breakdowns (${DIAS_PAGO} dias, plataformas: ${plataformas.join(", ")})`,
      periodo: `últimos ${DIAS_PAGO} dias`,
      data_mais_recente: ultimoSync ? String(ultimoSync).slice(0, 10) : null,
      linhas: linhasBreakdown,
    });
  }

  // ── 5) ÚLTIMO RELATÓRIO DE LANÇAMENTO
  let relatorio: Any = null;
  if (songId && quer("relatorio")) {
    const { data: rep } = await user
      .from("v_song_report_latest")
      .select("generated_at, status, report")
      .eq("song_id", songId)
      .maybeSingle();
    relatorio = rep && rep.status === "ok" ? { gerado_em: rep.generated_at, relatorio: rep.report } : null;
    if (!relatorio) avisos.push("sem relatório de lançamento desta música");
    addFonte({
      bloco: "relatorio",
      fonte: "public.v_song_report_latest — último relatório de lançamento",
      periodo: relatorio?.gerado_em ? `gerado em ${String(relatorio.gerado_em).slice(0, 10)}` : "sem dados",
      data_mais_recente: relatorio?.gerado_em ? String(relatorio.gerado_em).slice(0, 10) : null,
      linhas: relatorio ? 1 : 0,
    });
  }

  // ── 6) TETO DE ORÇAMENTO
  let tetos: Any[] = [];
  let teto: Any = null;
  if (quer("teto")) {
    const { data: capsRaw, error: capsErr } = await user.rpc("artist_ads_budget_cap_get", {
      p_artist_id: artistId,
    });
    if (capsErr) avisos.push(`teto indisponível: ${capsErr.message}`);
    tetos = capsRaw ?? [];
    teto = p.connectionId ? (tetos.find((c: Any) => c?.connection_id === p.connectionId) ?? null) : null;
    addFonte({
      bloco: "teto",
      fonte: "RPC public.artist_ads_budget_cap_get — teto e disponível por ligação",
      periodo: `leitura de ${hoje()}`,
      data_mais_recente: teto?.set_at ? String(teto.set_at).slice(0, 10) : hoje(),
      linhas: tetos.length,
    });
  }

  // ── 7) PUBLICAÇÕES ANUNCIÁVEIS
  let publicacoes: Any[] = [];
  if (quer("publicacoes")) {
    const { data: postsRaw, error: postsErr } = await user.rpc("artist_ads_promotable_posts", {
      p_artist_id: artistId,
      p_platform: plataformaCriativos,
    });
    if (postsErr) avisos.push(`publicações anunciáveis indisponíveis: ${postsErr.message}`);
    publicacoes = postsRaw ?? [];
    addFonte({
      bloco: "publicacoes",
      fonte: `RPC public.artist_ads_promotable_posts (p_platform='${plataformaCriativos}')`,
      periodo: `leitura de ${hoje()}`,
      data_mais_recente: hoje(),
      linhas: publicacoes.length,
    });
  }

  // ── 8) CRIATIVOS ANUNCIÁVEIS
  let criativos: Any[] = [];
  if (quer("criativos")) {
    const { data: crRaw, error: crErr } = await user.rpc("artist_ads_creatives", {
      p_artist_id: artistId,
      p_connection_id: p.connectionId ?? null,
      p_platform: plataformaCriativos,
    });
    if (crErr) avisos.push(`criativos anunciáveis indisponíveis: ${crErr.message}`);
    criativos = crRaw ?? [];
    addFonte({
      bloco: "criativos",
      fonte: `RPC public.artist_ads_creatives (p_platform='${plataformaCriativos}')`,
      periodo: `leitura de ${hoje()}`,
      data_mais_recente: hoje(),
      linhas: criativos.length,
    });
  }

  // ── 9) GEOGRAFIA UNIFICADA POR UF (pago + orgânico)
  const { resolver, erro: geoErr } = await carregarGeoResolver(user);
  if (geoErr) avisos.push(`public.br_estados indisponível: ${geoErr}`);
  const geo = agregarGeoPorUf([...geoPaga, ...geoOrganica], resolver);
  for (const nr of geo.nao_resolvidos) {
    avisos.push(`região não resolvida a UF: "${nr.nome_original}" (fonte ${nr.fonte})`);
  }
  const geografia = {
    _fonte:
      "public.br_estados (nome→UF, comparação sem acentos, sem prefixo 'State of' e sem sufixo '(state)') sobre historico_pago.breakdowns.region (meta/google) + v_artist_audience_by_state (Instagram)",
    estados_conhecidos: resolver.estados,
    por_uf: geo.tabela,
    nao_resolvidos: geo.nao_resolvidos,
  };
  addFonte({
    bloco: "geografia_por_uf",
    fonte: "public.br_estados + breakdowns pagos (region) + audiência orgânica por estado",
    periodo: `últimos ${DIAS_PAGO} dias (pago) + último snapshot (orgânico)`,
    data_mais_recente: hoje(),
    linhas: geo.tabela.length,
  });

  return {
    notFoundSong,
    artistId,
    song: songRow,
    periodStart,
    periodEnd,
    blocos: {
      musica: snapshotMusica,
      canais,
      audiencia_organica: audiencia,
      historico_pago: historicoPago,
      comparaveis: snapshotMusica?.benchmark_alinhado ?? null,
      relatorio,
      teto: { ligacao: teto, todas_as_ligacoes: tetos },
      publicacoes,
      criativos,
    },
    geografia,
    fontes,
    avisos,
  };
}

/**
 * Atalho para o relatório de lançamento: devolve exactamente o mesmo contrato do
 * coletor da música (buildSnapshot) e acrescenta `fontes` ao snapshot.
 */
export async function buildSongSnapshotComFontes(client: Any, songId: string, dias: number) {
  const built = await buildArtistDataSnapshot({
    userClient: client,
    songId,
    dias,
    blocos: ["musica", "conteudo", "comparaveis"],
  });
  if (built.notFoundSong || !built.blocos.musica) return { notFound: true as const };
  // Formato do relatório intacto: os blocos são os mesmos de sempre; só se
  // acrescenta a lista de fontes (bloco, fonte, período, data mais recente).
  const snapshot = { ...built.blocos.musica, fontes: built.fontes };
  return {
    notFound: false as const,
    song: built.song,
    periodStart: built.periodStart!,
    periodEnd: built.periodEnd!,
    snapshot,
  };
}
