// Análise dos VÍDEOS TIKTOK do artista (D-ERP107).
//
// Bloco novo do snapshot, usado SÓ quando a plataforma do plano é 'tiktok'.
// Fronteira do módulo: lê apenas public.artist_content e
// public.artist_content_metrics_daily (nunca crm.*), com a sessão do chamador.
//
// artist_content NÃO guarda métricas correntes: views/likes/comments/shares vêm
// sempre do último snapshot de artist_content_metrics_daily. Sem séries, o bloco
// sai vazio e deixa aviso — nunca se estima.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Any = any;

export type VideoTiktok = {
  content_id: string;
  tiktok_video_id: string | null;
  permalink: string | null;
  published_at: string | null;
  duracao_seg: number | null;
  legenda: string | null;
  som: { nome: string | null; external_id: string | null };
  song_id: string | null;
  ligado_a_musica: boolean;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  crescimento_7d: { views: number; likes: number; comments: number; shares: number } | null;
  crescimento_30d: { views: number; likes: number; comments: number; shares: number } | null;
  taxa_interacao_pct: number | null;
  partilhas_por_views_pct: number | null;
  views_por_dia: number | null;
  dias_desde_publicacao: number | null;
};

export type AnaliseVideosTiktok = {
  fonte: {
    fonte: string;
    periodo: { de: string | null; a: string | null };
    data_mais_recente: string | null;
    videos: number;
    series_diarias: boolean;
    vazia: boolean;
  };
  avisos: string[];
  totais: { videos_analisados: number; videos_ligados_a_musica: number };
  top_15_views: VideoTiktok[];
  top_10_interacao: VideoTiktok[];
  top_10_crescimento_7d: VideoTiktok[];
  videos_da_musica: VideoTiktok[];
  padroes: {
    duracao_media_top_seg: number | null;
    duracao_media_resto_seg: number | null;
    sons_mais_frequentes_no_top: { nome: string; external_id: string | null; vezes: number }[];
    palavras_frequentes_nas_legendas_do_top: { palavra: string; vezes: number }[];
    hooks_do_top: string[];
  };
};

const METRICAS = ["views", "likes", "comments", "shares"] as const;
type Metrica = typeof METRICAS[number];

const STOPWORDS = new Set([
  "a","o","as","os","de","do","da","dos","das","e","é","em","no","na","nos","nas","um","uma","que",
  "para","pra","por","com","se","eu","tu","você","voce","ele","ela","meu","minha","seu","sua","não",
  "nao","mais","muito","já","ja","aí","ai","lá","la","the","of","to","and","my","you",
]);

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function pct(num: number, den: number): number | null {
  if (!(den > 0)) return null;
  return Math.round((num / den) * 10000) / 100;
}

function media(vals: number[]): number | null {
  const l = vals.filter((v) => Number.isFinite(v) && v > 0);
  if (!l.length) return null;
  return Math.round((l.reduce((s, v) => s + v, 0) / l.length) * 10) / 10;
}

/**
 * Monta a análise dos vídeos do artista nos últimos `dias` dias.
 *
 * Generalizada por plataforma em D-ERP108: 'tiktok' (omissão, comportamento
 * inalterado) ou 'youtube' (campanhas de vídeo do Google Ads). Nunca lança:
 * qualquer falha vira aviso e bloco vazio.
 */
export async function analisarVideosTiktok(
  userClient: SupabaseClient,
  opts: {
    artistId: string;
    songId?: string | null;
    dias?: number;
    platform?: "tiktok" | "youtube";
    contentTypes?: string[];
  },
): Promise<AnaliseVideosTiktok> {
  const dias = opts.dias ?? 180;
  const plataforma = opts.platform ?? "tiktok";
  const tipos = opts.contentTypes ?? (plataforma === "youtube" ? ["video", "short"] : ["video"]);
  const rotulo = plataforma === "youtube" ? "analise_videos_youtube" : "analise_videos_tiktok";
  const rotuloFonte = plataforma === "youtube" ? "YouTube" : "TikTok";
  const avisos: string[] = [];
  const vazio: AnaliseVideosTiktok = {
    fonte: {
      fonte: `public.artist_content + public.artist_content_metrics_daily (${rotuloFonte})`,
      periodo: { de: null, a: null },
      data_mais_recente: null,
      videos: 0,
      series_diarias: false,
      vazia: true,
    },
    avisos,
    totais: { videos_analisados: 0, videos_ligados_a_musica: 0 },
    top_15_views: [],
    top_10_interacao: [],
    top_10_crescimento_7d: [],
    videos_da_musica: [],
    padroes: {
      duracao_media_top_seg: null,
      duracao_media_resto_seg: null,
      sons_mais_frequentes_no_top: [],
      palavras_frequentes_nas_legendas_do_top: [],
      hooks_do_top: [],
    },
  };

  const desde = new Date(Date.now() - dias * 86400000).toISOString();

  const { data: conteudos, error: errC } = await userClient
    .from("artist_content")
    .select(
      "id, external_id, permalink, published_at, duration_seconds, caption_excerpt, title, sound_name, sound_external_id, song_id",
    )
    .eq("artist_id", opts.artistId)
    .eq("platform", plataforma)
    .in("content_type", tipos)
    .gte("published_at", desde)
    .order("published_at", { ascending: false })
    .limit(2000);

  if (errC) {
    avisos.push(`${rotulo}: falha ao ler artist_content (${errC.message})`);
    return vazio;
  }
  const linhas = conteudos ?? [];
  if (!linhas.length) {
    avisos.push(`${rotulo}: sem vídeos ${rotuloFonte} publicados nos últimos ${dias} dias`);
    return vazio;
  }

  // Séries diárias por vídeo (views/likes/comments/shares).
  const ids = linhas.map((c: Any) => c.id);
  const series = new Map<string, Map<Metrica, { d: string; v: number }[]>>();
  let dataMin: string | null = null;
  let dataMax: string | null = null;

  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const { data: mets, error: errM } = await userClient
      .from("artist_content_metrics_daily")
      .select("content_id, metric, metric_date, value")
      .eq("platform", plataforma)
      .in("content_id", lote)
      .in("metric", METRICAS as unknown as string[])
      .order("metric_date", { ascending: true })
      .limit(50000);
    if (errM) {
      avisos.push(`analise_videos_tiktok: falha ao ler artist_content_metrics_daily (${errM.message})`);
      break;
    }
    for (const m of (mets ?? [])) {
      const cid = String((m as Any).content_id);
      const met = String((m as Any).metric) as Metrica;
      const d = String((m as Any).metric_date);
      if (!dataMin || d < dataMin) dataMin = d;
      if (!dataMax || d > dataMax) dataMax = d;
      if (!series.has(cid)) series.set(cid, new Map());
      const porMet = series.get(cid)!;
      if (!porMet.has(met)) porMet.set(met, []);
      porMet.get(met)!.push({ d, v: n((m as Any).value) });
    }
  }

  const temSeries = series.size > 0;
  if (!temSeries) {
    avisos.push(
      "analise_videos_tiktok: sem séries em artist_content_metrics_daily para TikTok — não há métricas correntes em artist_content, por isso views/likes/comments/shares e crescimento ficam indisponíveis",
    );
  }

  const hoje = Date.now();
  const atLimite = (
    lista: { d: string; v: number }[] | undefined,
    limite: string,
  ): number | null => {
    if (!lista?.length) return null;
    let escolhido: number | null = null;
    for (const p of lista) if (p.d <= limite) escolhido = p.v;
    return escolhido;
  };
  const isoDia = (msAtras: number) => new Date(hoje - msAtras).toISOString().slice(0, 10);
  const lim7 = isoDia(7 * 86400000);
  const lim30 = isoDia(30 * 86400000);

  const videos: VideoTiktok[] = [];
  for (const c of linhas) {
    const porMet = series.get(String((c as Any).id));
    const atual: Record<Metrica, number> = { views: 0, likes: 0, comments: 0, shares: 0 };
    const cresc: Record<string, { views: number; likes: number; comments: number; shares: number }> = {
      d7: { views: 0, likes: 0, comments: 0, shares: 0 },
      d30: { views: 0, likes: 0, comments: 0, shares: 0 },
    };
    let temCresc7 = false;
    let temCresc30 = false;
    for (const met of METRICAS) {
      const lista = porMet?.get(met);
      if (!lista?.length) continue;
      atual[met] = lista[lista.length - 1].v;
      const b7 = atLimite(lista, lim7);
      if (b7 !== null) {
        cresc.d7[met] = Math.max(0, atual[met] - b7);
        temCresc7 = true;
      }
      const b30 = atLimite(lista, lim30);
      if (b30 !== null) {
        cresc.d30[met] = Math.max(0, atual[met] - b30);
        temCresc30 = true;
      }
    }

    const pub = (c as Any).published_at ? new Date((c as Any).published_at).getTime() : null;
    const diasPub = pub ? Math.max(1, Math.floor((hoje - pub) / 86400000)) : null;
    const interacoes = atual.likes + atual.comments + atual.shares;

    videos.push({
      content_id: String((c as Any).id),
      tiktok_video_id: (c as Any).external_id ?? null,
      permalink: (c as Any).permalink ?? null,
      published_at: (c as Any).published_at ?? null,
      duracao_seg: (c as Any).duration_seconds ?? null,
      legenda: (c as Any).caption_excerpt ?? (c as Any).title ?? null,
      som: { nome: (c as Any).sound_name ?? null, external_id: (c as Any).sound_external_id ?? null },
      song_id: (c as Any).song_id ?? null,
      ligado_a_musica: !!opts.songId && (c as Any).song_id === opts.songId,
      views: atual.views,
      likes: atual.likes,
      comments: atual.comments,
      shares: atual.shares,
      crescimento_7d: temCresc7 ? cresc.d7 : null,
      crescimento_30d: temCresc30 ? cresc.d30 : null,
      taxa_interacao_pct: pct(interacoes, atual.views),
      partilhas_por_views_pct: pct(atual.shares, atual.views),
      views_por_dia: diasPub ? Math.round(atual.views / diasPub) : null,
      dias_desde_publicacao: diasPub,
    });
  }

  const porViews = [...videos].sort((a, b) => b.views - a.views);
  const top15 = porViews.slice(0, 15);
  const top10Int = [...videos]
    .filter((v) => v.views >= 500 && v.taxa_interacao_pct !== null)
    .sort((a, b) => (b.taxa_interacao_pct ?? 0) - (a.taxa_interacao_pct ?? 0))
    .slice(0, 10);
  const top10Cresc = [...videos]
    .filter((v) => v.crescimento_7d !== null)
    .sort((a, b) => (b.crescimento_7d?.views ?? 0) - (a.crescimento_7d?.views ?? 0))
    .slice(0, 10);
  const daMusica = videos.filter((v) => v.ligado_a_musica);

  // Padrões: duração média do top vs resto, sons e palavras frequentes no top.
  const topIds = new Set([...top15, ...top10Int, ...top10Cresc].map((v) => v.content_id));
  const topSet = videos.filter((v) => topIds.has(v.content_id));
  const restoSet = videos.filter((v) => !topIds.has(v.content_id));

  const sons = new Map<string, { nome: string; external_id: string | null; vezes: number }>();
  const palavras = new Map<string, number>();
  for (const v of topSet) {
    if (v.som.nome) {
      const k = v.som.external_id ?? v.som.nome;
      const atual = sons.get(k) ?? { nome: v.som.nome, external_id: v.som.external_id, vezes: 0 };
      atual.vezes += 1;
      sons.set(k, atual);
    }
    for (const w of String(v.legenda ?? "").toLowerCase().split(/[^\p{L}\p{N}#@]+/u)) {
      const t = w.trim();
      if (t.length < 3 || STOPWORDS.has(t)) continue;
      palavras.set(t, (palavras.get(t) ?? 0) + 1);
    }
  }

  return {
    fonte: {
      fonte: "public.artist_content + public.artist_content_metrics_daily (TikTok)",
      periodo: { de: dataMin, a: dataMax },
      data_mais_recente: dataMax,
      videos: videos.length,
      series_diarias: temSeries,
      vazia: videos.length === 0,
    },
    avisos,
    totais: { videos_analisados: videos.length, videos_ligados_a_musica: daMusica.length },
    top_15_views: top15,
    top_10_interacao: top10Int,
    top_10_crescimento_7d: top10Cresc,
    videos_da_musica: daMusica.slice(0, 20),
    padroes: {
      duracao_media_top_seg: media(topSet.map((v) => n(v.duracao_seg))),
      duracao_media_resto_seg: media(restoSet.map((v) => n(v.duracao_seg))),
      sons_mais_frequentes_no_top: [...sons.values()].sort((a, b) => b.vezes - a.vezes).slice(0, 5),
      palavras_frequentes_nas_legendas_do_top: [...palavras.entries()]
        .filter(([, v]) => v >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([palavra, vezes]) => ({ palavra, vezes })),
      hooks_do_top: top10Int.map((v) => String(v.legenda ?? "").slice(0, 120)).filter((s) => s.length > 0).slice(0, 8),
    },
  };
}
