// artist-ads-strategy-generate — plano de tráfego Meta para uma MÚSICA (D-ERP98).
//
// POST { artist_id, song_id, connection_id, orcamento_diario?, objetivo?, notas? }
// 200 → { plan_id, plano, resumo }
//
// Módulo Carreira Artística. Fronteira absoluta: esta função NÃO lê nenhuma
// tabela do schema `crm`. Tudo o que é tráfego passa pelas RPCs
// public.artist_ads_* (SECURITY DEFINER) — elas são a fronteira.
//
// O plano nasce SEMPRE em 'rascunho' (artist_ads_plan_create). Esta função
// nunca publica nem activa nada no Meta e nunca chama a Graph API (fase 1).
//
// Autenticação: cliente com a ANON KEY + Authorization do chamador, porque
// artist_ads_plan_create usa auth.uid() em created_by e passa por
// artist_ads_assert_write. Com service_role o plano nascia sem autor.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildSnapshot } from "../_shared/artist-song-snapshot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const MODEL = "google/gemini-2.5-flash";
const FUNCTION_NAME = "artist-ads-strategy-generate";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripJsonFences(text: string): string {
  let t = String(text ?? "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

const OBJETIVOS = ["AWARENESS", "TRAFFIC", "ENGAGEMENT"];
const MIN_DAILY_CENTS = 100;

// ── Geografia por ESTADO (região Meta) ──────────────────────────────────────
// O LLM só propõe NOMES de estado; a chave de região é resolvida aqui, na
// função, por GET /search?type=adgeolocation&location_types=['region'].
// Fronteira do módulo: não há leitura de crm.* nem token de ligação — usa-se o
// token de aplicação (META_APP_ID|META_APP_SECRET), que basta para /search.
const META_GRAPH_VERSION = "v18.0";
const META_APP_ID = Deno.env.get("META_APP_ID");
const META_APP_SECRET = Deno.env.get("META_APP_SECRET");

function metaAppToken(): string | null {
  return META_APP_ID && META_APP_SECRET ? `${META_APP_ID}|${META_APP_SECRET}` : null;
}

const regionCache = new Map<string, string | null>();

async function resolveRegionKey(
  nome: string,
  countryCode: string,
  token: string,
): Promise<string | null> {
  const chave = `${countryCode}:${nome.toLowerCase()}`;
  if (regionCache.has(chave)) return regionCache.get(chave) ?? null;
  let key: string | null = null;
  try {
    const u = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/search`);
    u.searchParams.set("type", "adgeolocation");
    u.searchParams.set("location_types", '["region"]');
    u.searchParams.set("q", nome);
    u.searchParams.set("country_code", countryCode);
    u.searchParams.set("limit", "10");
    u.searchParams.set("locale", "pt_BR");
    u.searchParams.set("access_token", token);
    const r = await fetch(u.toString());
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    if (r.ok && !j?.error && Array.isArray(j?.data)) {
      // deno-lint-ignore no-explicit-any
      const mesmoPais = j.data.filter((d: any) =>
        String(d?.country_code ?? countryCode).toUpperCase() === countryCode
      );
      const alvo = nome.trim().toLowerCase();
      // deno-lint-ignore no-explicit-any
      const exacto = mesmoPais.find((d: any) => String(d?.name ?? "").trim().toLowerCase() === alvo);
      const escolhido = exacto ?? mesmoPais[0];
      if (escolhido?.key) key = String(escolhido.key);
    } else {
      console.warn(`[${FUNCTION_NAME}] /search region falhou`, j?.error?.message ?? r.status);
    }
  } catch (e) {
    console.warn(`[${FUNCTION_NAME}] /search region exception`, String(e));
  }
  regionCache.set(chave, key);
  return key;
}

// deno-lint-ignore no-explicit-any
type Any = any;

const SYSTEM_PROMPT =
  `Você é estrategista de tráfego pago para lançamentos musicais (forró/piseiro, Nordeste do Brasil).
Desenha um plano de campanha Meta para UMA música, a partir do snapshot de dados que recebe.

REGRAS ABSOLUTAS:
1. Só pode citar números que estão no JSON do snapshot. É PROIBIDO estimar, inventar ou recalcular ritmos por dia (use o campo de ritmo que vem no snapshot). Cada número citado traz a data do dado.
2. Objetivo só pode ser AWARENESS, TRAFFIC ou ENGAGEMENT. Campanhas de conversão/vendas são recusadas neste módulo — nunca as proponha.
3. TRAFFIC só é permitido se a música tiver smart link https no snapshot (limites.smart_link_url). Sem smart link, proponha AWARENESS ou ENGAGEMENT e registe a falta em avisos.
4. Geografia: publico_sugerido.geo só aceita códigos ISO de país com 2 letras (ex.: ["BR"]) e é SEMPRE obrigatória. Para estreitar dentro do país, use publico_sugerido.estados: nomes de estados brasileiros escritos por extenso (ex.: ["Rio Grande do Norte","Paraíba","Ceará"]). É PROIBIDO escrever cidades (ex.: "Natal") ou siglas (ex.: "RN") — cidades ficam fora desta versão. A chave Meta de cada estado é resolvida pelo motor, não por você.
5. No máximo 3 conjuntos de anúncios. Cada conjunto tem UM público e UM anúncio, e esse anúncio promove uma publicação existente (existing_post) da lista publicacoes_promoviveis. NUNCA invente post_ref: use exactamente um post_ref dessa lista.
6. Por omissão não use end_time (orçamento diário). Se propuser end_time, tem de vir start_time e end_time > start_time.
7. A soma dos orcamento_cents dos conjuntos por dia não pode passar o disponível em limites.available_daily (na moeda da conta). Cada conjunto tem pelo menos 100 cents por dia.
8. Português do Brasil, linguagem de quem compra mídia: objetiva e com dado na mão.
9. FONTE PRIMÁRIA = desempenho_pago (histórico pago real: gasto, impressões, cliques, ThruPlays, custo por ThruPlay, por campanha e por anúncio). Toda a escolha de público, geografia, orçamento e criativo tem de citar, no campo "porque": a FONTE (que RPC/tabela do snapshot), o NÚMERO exacto e a DATA (ou período) do dado.
10. Não existe histórico pago por região, idade ou género: os dados pagos são agregados por anúncio e por dia. Quando não houver histórico pago para uma região ou um público, escreva isso literalmente ("sem histórico pago nesta região" / "sem histórico pago para este público") em vez de inferir a partir da demografia orgânica.
11. demografia_organica_instagram é FONTE SECUNDÁRIA e só de Instagram orgânico. Se a usar, identifique-a como tal no texto ("fonte secundária: demografia orgânica do Instagram, snapshot de <data>"). Nunca a apresente como desempenho pago.
12. Criativo: justifique a publicação escolhida com o desempenho pago do anúncio/criativo correspondente quando existir em desempenho_pago.anuncios; se não existir, diga "publicação sem histórico pago".
13. ARTISTA REGIONAL: ordene a geografia por CONCENTRAÇÃO (quota da base do artista nesse estado/região), NUNCA por valor absoluto de uma cidade. Exemplo real do erro a evitar: São Paulo entrou num plano só por ser a 2.ª cidade em seguidores (7.596), contra Natal (19.557) e ~35,4 mil apenas nas cidades do Rio Grande do Norte no top 30 (artist_audience_demographics, instagram/followers, snapshot de 19/09/2026).
14. Metrópoles fora da região-base (ex.: São Paulo, Rio de Janeiro) só entram com evidência de desempenho PAGO ou de streaming no snapshot, e NUNCA na 1.ª campanha.
15. Quando os dados mostrarem base concentrada numa região, escreva explicitamente na justificação "artista regional: base RN/Nordeste" (ou a região que os dados mostrarem).
16. Sempre que estreitar idades (qualquer coisa diferente de 18–65), cite a distribuição etária real da base com a data do dado. Exemplo do dado do Litto a 19/09/2026: 25–34 = 42,9 %, 35–44 = 24,5 %, 18–24 = 18,5 % — foi por não citar que saiu um conjunto 18–34 contra uma base 25–44. Sem esse dado citado, mantenha 18–65.

FORMATO DE RESPOSTA — responde APENAS com JSON puro (sem markdown fences):
{
  "objetivo": "AWARENESS|TRAFFIC|ENGAGEMENT",
  "link_destino": "<https://… ou null>",
  "adsets": [
    {
      "trigger_nome": "nome curto do conjunto",
      "funil": "topo|meio|fundo",
      "orcamento_cents": <inteiro, por dia>,
      "publico_sugerido": {
        "geo": ["BR"],
        "estados": ["Rio Grande do Norte"],
        "idade_min": 18,
        "idade_max": 65,
        "descricao": "quem é este público e porque"
      },
      "anuncios": [
        {
          "headline": "título curto",
          "corpo": "texto do anúncio",
          "cta": "LEARN_MORE|SHOP_NOW|SUBSCRIBE",
          "existing_post": { "post_ref": "<post_ref da lista>", "kind": "object_story|instagram_media" }
        }
      ]
    }
  ],
  "resumo": {
    "justificacao": [{ "campo": "objetivo|publico|geografia|orcamento|criativo", "escolha": "…", "porque": "fonte + número + data" }],
    "hipoteses": [{ "o_que_testar": "…", "como_ler": "…" }],
    "avisos": ["…"]
  }
}`;

async function callLlm(prompt: string) {
  const call = () =>
    fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });

  let resp = await call();
  if (resp.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    resp = await call();
  }
  if (resp.status === 429) {
    return { fail: json({ error: "rate_limited", mensagem: "Lovable AI com limite de pedidos; tenta outra vez daqui a pouco." }, 429) };
  }
  if (resp.status === 402) {
    return { fail: json({ error: "credits_exhausted", mensagem: "Sem créditos no Lovable AI." }, 402) };
  }
  if (!resp.ok) {
    const t = await resp.text();
    console.error(`[${FUNCTION_NAME}] ai_gateway_error`, resp.status, t.slice(0, 500));
    return { fail: json({ error: "ai_gateway_error", mensagem: `HTTP ${resp.status} — ${t.slice(0, 300)}` }, 502) };
  }
  const data = await resp.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  let plano: Any;
  try {
    plano = JSON.parse(stripJsonFences(raw));
  } catch {
    return { fail: json({ error: "ai_invalid_json", mensagem: raw.slice(0, 500) }, 502) };
  }
  return { plano, tokens: data?.usage?.total_tokens ?? null };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed", mensagem: "Usa POST." }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured", mensagem: "Falta a chave do Lovable AI." }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "sessao_invalida", mensagem: "É preciso sessão de utilizador." }, 401);

  let body: Any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json", mensagem: "Corpo do pedido inválido." }, 400);
  }
  const artistId = typeof body.artist_id === "string" ? body.artist_id : "";
  const songId = typeof body.song_id === "string" ? body.song_id : "";
  const connectionId = typeof body.connection_id === "string" ? body.connection_id : "";
  if (!artistId || !songId || !connectionId) {
    return json({
      error: "missing_params",
      mensagem: "artist_id, song_id e connection_id são obrigatórios.",
    }, 400);
  }
  const objetivoPedido = typeof body.objetivo === "string" ? body.objetivo.toUpperCase() : null;
  const orcamentoPedido = Number.isFinite(body.orcamento_diario) ? Number(body.orcamento_diario) : null;
  const notas = typeof body.notas === "string" ? body.notas.slice(0, 2000) : null;

  // Cliente na sessão do chamador: auth.uid() tem de existir para o plano ter autor.
  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await user.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: "sessao_invalida", mensagem: "Sessão inválida ou expirada." }, 401);
  }

  const avisos: string[] = [];

  // ── 1) Música + artista (a RLS faz o isolamento por empresa)
  const { data: song, error: songErr } = await user
    .from("artist_songs")
    .select("id, artist_id, title, release_date, is_launch, smart_link_url, cover_url, tracking_status")
    .eq("id", songId)
    .maybeSingle();
  if (songErr) return json({ error: "sem_permissao", mensagem: songErr.message }, 403);
  if (!song) return json({ error: "musica_nao_encontrada", mensagem: "Música não encontrada." }, 404);
  if (song.artist_id !== artistId) {
    return json({ error: "musica_de_outro_artista", mensagem: "A música não pertence a este artista." }, 422);
  }
  const smartLink = typeof song.smart_link_url === "string" && song.smart_link_url.startsWith("https://")
    ? song.smart_link_url
    : null;
  if (!smartLink) avisos.push("música sem smart link https — objetivo Tráfego indisponível");

  // ── 2) Snapshot da música (coletor partilhado com artist-song-report)
  let snapshotMusica: Any = null;
  try {
    const built = await buildSnapshot(user, songId, 30);
    if (!built.notFound) snapshotMusica = built.snapshot;
  } catch (e) {
    avisos.push(`snapshot da música incompleto: ${(e as Error).message}`);
  }

  // ── 3) Último relatório de lançamento
  const { data: rep } = await user
    .from("v_song_report_latest")
    .select("generated_at, status, report")
    .eq("song_id", songId)
    .maybeSingle();
  const relatorio = rep && rep.status === "ok"
    ? { gerado_em: rep.generated_at, relatorio: rep.report }
    : null;
  if (!relatorio) avisos.push("sem relatório de lançamento desta música");

  // ── 4) Publicações anunciáveis (só meta_ready)
  const { data: postsRaw, error: postsErr } = await user.rpc("artist_ads_promotable_posts", {
    p_artist_id: artistId,
  });
  if (postsErr) return json({ error: "sem_permissao", mensagem: postsErr.message }, 403);
  const posts = (postsRaw ?? []).filter((p: Any) => p?.meta_ready === true && p?.post_ref);
  if (posts.length === 0) {
    return json({
      error: "sem_publicacoes_promoviveis",
      mensagem: "Não há publicações do artista prontas para anunciar no Meta.",
    }, 422);
  }
  const postRefsOk = new Set(posts.map((p: Any) => String(p.post_ref)));

  // ── 5) Limites da ligação pedida
  const { data: capsRaw, error: capsErr } = await user.rpc("artist_ads_budget_cap_get", {
    p_artist_id: artistId,
  });
  if (capsErr) return json({ error: "sem_permissao", mensagem: capsErr.message }, 403);
  const cap = (capsRaw ?? []).find((c: Any) => c?.connection_id === connectionId) ?? null;
  if (!cap || cap.has_cap !== true || cap.available_daily == null) {
    return json({
      error: "sem_teto",
      mensagem: "A ligação de anúncios não tem teto diário definido — define o teto antes de gerar a estratégia.",
    }, 422);
  }
  const disponivel = Number(cap.available_daily);
  if (!(disponivel > 0)) {
    return json({
      error: "sem_teto",
      mensagem: "O teto diário desta ligação já está todo comprometido por planos publicados.",
    }, 422);
  }

  // ── 6) Histórico de tráfego (30 dias)
  const { data: campanhas } = await user.rpc("artist_ads_campaigns", {
    p_artist_id: artistId,
    p_include_removed: false,
  });
  // Desempenho PAGO REAL, 90 dias (defeito 1 da v2). O diário é a única fonte
  // com janela de 90 dias; as RPCs de campanha/anúncio só trazem 7d/30d.
  const DIAS_JANELA = 90;
  const { data: diario } = await user.rpc("artist_ads_daily", {
    p_artist_id: artistId,
    p_days: DIAS_JANELA,
  });
  const diarioRows: Any[] = diario ?? [];

  // Campanhas desta ligação (a RPC do diário não traz connection_id).
  const campanhasDaLigacao = (campanhas ?? []).filter((c: Any) => c?.connection_id === connectionId);
  const idsDaLigacao = new Set(campanhasDaLigacao.map((c: Any) => String(c.campaign_id)));
  const diarioDaLigacao = diarioRows.filter((d: Any) => idsDaLigacao.has(String(d.campaign_id)));
  if (diarioRows.length > 0 && diarioDaLigacao.length === 0) {
    avisos.push("nenhum dia de gasto nos últimos 90 dias nas campanhas desta ligação");
  }

  // Agregação por campanha (só somas do que a RPC devolve — nada recalculado).
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
        gasto: Math.round(a.gasto * 100) / 100,
        objetivo: c.objective ?? null,
        status: c.status ?? null,
        moeda: c.currency ?? null,
        orcamento_diario_atual: c.budget_daily ?? null,
        // janela de 30 dias, tal como a RPC devolve (não recalculado)
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

  const comGasto = campanhasPagas.slice(0, 10);
  const anuncios: Any[] = [];
  for (const c of comGasto) {
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

  const ultimoSync = [...campanhasDaLigacao.map((c: Any) => c.last_synced_at), ...anuncios.map((a) => a.ultimo_sync)]
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  const totais90d = campanhasPagas.reduce(
    (t, c) => ({
      gasto: Math.round((t.gasto + c.gasto) * 100) / 100,
      impressoes: t.impressoes + c.impressoes,
      cliques: t.cliques + c.cliques,
      video_views: t.video_views + c.video_views,
    }),
    { gasto: 0, impressoes: 0, cliques: 0, video_views: 0 },
  );

  // O que a base NÃO tem — registado, nunca inventado.
  const faltasPago = [
    "alcance (reach) e CPM não existem nas RPCs de tráfego — não constam do snapshot",
    "ThruPlays, visualizações de 3s, CTR e custo por ThruPlay só existem em janela de 7 e 30 dias (por anúncio); na janela de 90 dias só há gasto, impressões, cliques e video_views",
    "não há breakdown pago por região, idade ou género: os dados pagos são agregados por anúncio e por dia",
  ];
  for (const f of faltasPago) avisos.push(`dado em falta: ${f}`);

  // Demografia orgânica do Instagram — FONTE SECUNDÁRIA, identificada como tal.
  const { data: demoRaw } = await user
    .from("artist_audience_demographics")
    .select("platform, audience_type, dimension, dim_key, value, timeframe, snapshot_date, source")
    .eq("artist_id", artistId)
    .order("snapshot_date", { ascending: false })
    .limit(300);
  const demoRows: Any[] = demoRaw ?? [];
  const demoDatas = demoRows.map((d: Any) => String(d.snapshot_date)).sort();
  const demografiaOrganica = {
    _fonte: "secundária — demografia ORGÂNICA do Instagram (public.artist_audience_demographics). NÃO é desempenho pago.",
    periodo: demoRows.length ? { de: demoDatas[0], a: demoDatas[demoDatas.length - 1] } : null,
    linhas: demoRows,
  };
  if (demoRows.length === 0) avisos.push("sem demografia orgânica de Instagram para este artista");

  // ── 6b) HISTÓRICO PAGO POR DIMENSÃO — RPC public.artist_ads_breakdowns(90d)
  // Fonte primária de geografia/idade/género PAGOS. CTR/CPC/CPM são derivados
  // aqui a partir dos totais que a RPC devolve (impressões, cliques, gasto).
  const BREAKDOWN_DIMS = ["region", "age", "gender", "publisher_platform", "country"];
  const mediana = (xs: number[]): number | null => {
    const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (v.length === 0) return null;
    const m = Math.floor(v.length / 2);
    const r = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    return Math.round(r * 10000) / 10000;
  };
  const breakdowns: Record<string, Any> = {};
  let breakdownLinhas = 0;
  let breakdownMoeda: string | null = null;
  for (const dim of BREAKDOWN_DIMS) {
    const { data: bdRaw, error: bdErr } = await user.rpc("artist_ads_breakdowns", {
      p_artist_id: artistId,
      p_days: DIAS_JANELA,
      p_platform: "meta",
      p_breakdown: dim,
    });
    if (bdErr) {
      avisos.push(`breakdown pago "${dim}" indisponível: ${bdErr.message}`);
      breakdowns[dim] = { linhas: 0, top_10: [], medianas: null, erro: bdErr.message };
      continue;
    }
    const rows: Any[] = bdRaw ?? [];
    breakdownLinhas += rows.length;
    if (rows.length === 0) {
      avisos.push(`sem histórico pago por "${dim}" nos últimos ${DIAS_JANELA} dias`);
      breakdowns[dim] = { linhas: 0, top_10: [], medianas: null };
      continue;
    }
    const calc = rows.map((r: Any) => {
      const imp = Number(r.impressions ?? 0);
      const clk = Number(r.clicks ?? 0);
      const gasto = Number(r.spend ?? 0);
      if (!breakdownMoeda && r.currency) breakdownMoeda = String(r.currency);
      return {
        valor: r.breakdown_value,
        impressoes: imp,
        cliques: clk,
        gasto: Math.round(gasto * 100) / 100,
        moeda: r.currency ?? null,
        quota_impressoes_pct: r.quota == null ? null : Number(r.quota),
        ctr_pct: imp > 0 ? Math.round((clk / imp) * 100 * 10000) / 10000 : null,
        cpc: clk > 0 ? Math.round((gasto / clk) * 10000) / 10000 : null,
        cpm: imp > 0 ? Math.round((gasto / imp) * 1000 * 100) / 100 : null,
      };
    });
    breakdowns[dim] = {
      linhas: calc.length,
      medianas: {
        ctr_pct: mediana(calc.map((c) => c.ctr_pct as number)),
        cpc: mediana(calc.map((c) => c.cpc as number)),
        cpm: mediana(calc.map((c) => c.cpm as number)),
      },
      top_10: calc.sort((a, b) => b.impressoes - a.impressoes).slice(0, 10),
    };
  }
  if (breakdownLinhas === 0) {
    avisos.push(`fonte vazia: public.artist_ads_breakdowns (${DIAS_JANELA} dias) não devolveu linhas`);
  }

  // ── 6c) AUDIÊNCIA ORGÂNICA POR ESTADO — vista public.v_artist_audience_by_state
  const { data: estadoRaw, error: estadoErr } = await user
    .from("v_artist_audience_by_state")
    .select("platform, audience_type, timeframe, snapshot_date, uf, regiao, estado_nome, valor, quota_pct")
    .eq("artist_id", artistId)
    .eq("platform", "instagram")
    .order("snapshot_date", { ascending: false })
    .limit(2000);
  if (estadoErr) avisos.push(`audiência por estado indisponível: ${estadoErr.message}`);
  const estadoRows: Any[] = estadoRaw ?? [];
  const porEstado: Record<string, Any> = {};
  let estadoDataMax: string | null = null;
  for (const t of [...new Set(estadoRows.map((r: Any) => String(r.audience_type)))]) {
    const doTipo = estadoRows.filter((r: Any) => String(r.audience_type) === t);
    const ultima = doTipo.map((r: Any) => String(r.snapshot_date)).sort().pop() ?? null;
    if (ultima && (!estadoDataMax || ultima > estadoDataMax)) estadoDataMax = ultima;
    const linhas = doTipo.filter((r: Any) => String(r.snapshot_date) === ultima);
    const regioes = new Map<string, number>();
    for (const l of linhas) {
      const k = l.regiao ? String(l.regiao) : "(sem região)";
      regioes.set(k, Math.round(((regioes.get(k) ?? 0) + Number(l.quota_pct ?? 0)) * 10) / 10);
    }
    porEstado[t] = {
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
  }
  if (estadoRows.length === 0) {
    avisos.push("fonte vazia: public.v_artist_audience_by_state sem linhas de Instagram para este artista");
  }

  // ── 6d) AUDIÊNCIA POR TIPO (followers / engaged / reached) — age e gender
  const porTipo: Record<string, Any> = {};
  for (const t of [...new Set(demoRows.map((d: Any) => String(d.audience_type)))]) {
    const doTipo = demoRows.filter((d: Any) =>
      String(d.audience_type) === t && String(d.platform) === "instagram"
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

  const audiencia = {
    _fonte:
      "orgânica — public.v_artist_audience_by_state (estados/regiões) + public.artist_audience_demographics (idade/género por tipo de audiência). Secundária face ao pago.",
    por_estado: porEstado,
    por_tipo: porTipo,
  };

  const historicoPago = {
    _fonte: "primária — RPC public.artist_ads_breakdowns(p_days=90, p_platform='meta')",
    janela_dias: DIAS_JANELA,
    moeda: breakdownMoeda,
    nota: "CTR (cliques/impressões), CPC (gasto/cliques) e CPM (gasto/impressões×1000) calculados pelo motor a partir dos totais da RPC. Top 10 por impressões em cada dimensão, com a mediana da dimensão para comparação.",
    breakdowns,
  };



  const alvoDiario = orcamentoPedido != null && orcamentoPedido > 0
    ? Math.min(orcamentoPedido, disponivel)
    : disponivel;
  if (orcamentoPedido != null && orcamentoPedido > disponivel) {
    avisos.push(
      `orçamento pedido ${orcamentoPedido} acima do disponível ${disponivel} ${cap.account_currency ?? ""} — usado o disponível`,
    );
  }

  const entradas = {
    musica: {
      id: song.id,
      titulo: song.title,
      release_date: song.release_date,
      is_launch: song.is_launch,
      smart_link_url: smartLink,
      cover_url: song.cover_url ?? null,
    },
    snapshot: snapshotMusica,
    relatorio_de_lancamento: relatorio,
    publicacoes_promoviveis: posts.map((p: Any) => ({
      post_ref: p.post_ref,
      kind: p.post_kind,
      origem: p.source,
      permalink: p.permalink,
      legenda: p.caption_excerpt,
      publicado_em: p.published_at,
      ultimo_anuncio: p.last_ad_name,
      gasto_30d_cents: p.spend_30d_cents,
    })),
    desempenho_pago: {
      _fonte: "primária — RPCs public.artist_ads_daily(90) + artist_ads_campaigns + artist_ads_ads",
      periodo: { de: periodoMin, a: periodoMax, dias_pedidos: DIAS_JANELA },
      ultima_atualizacao: ultimoSync,
      totais_90d: totais90d,
      campanhas: campanhasPagas,
      anuncios: anuncios,
      dados_em_falta: faltasPago,
    },
    demografia_organica_instagram: demografiaOrganica,

    limites: {
      connection_id: connectionId,
      moeda: cap.account_currency ?? cap.cap_currency ?? null,
      status_ligacao: cap.status,
      daily_cap: Number(cap.daily_cap),
      committed_daily: Number(cap.committed_daily ?? 0),
      available_daily: disponivel,
      alvo_diario: alvoDiario,
      smart_link_url: smartLink,
    },
    pedido: { objetivo: objetivoPedido, orcamento_diario: orcamentoPedido, notas },
  };

  // ── 7) LLM
  const llm = await callLlm(
    `Dados (única fonte de números permitida):\n\n${JSON.stringify(entradas)}`,
  );
  if ("fail" in llm && llm.fail) return llm.fail;
  const plano: Any = llm.plano ?? {};

  // ── 8) Normalização determinística (não confiar na saída do modelo)
  let objetivo = String(plano.objetivo ?? "").toUpperCase();
  if (!OBJETIVOS.includes(objetivo)) {
    avisos.push(`objetivo "${plano.objetivo ?? ""}" fora de AWARENESS/TRAFFIC/ENGAGEMENT — usado AWARENESS`);
    objetivo = "AWARENESS";
  }
  if (objetivo === "TRAFFIC" && !smartLink && !String(plano.link_destino ?? "").startsWith("https://")) {
    avisos.push("Tráfego sem link https disponível — objetivo trocado para AWARENESS");
    objetivo = "AWARENESS";
  }
  plano.objetivo = objetivo;
  plano.link_destino = objetivo === "TRAFFIC"
    ? (String(plano.link_destino ?? "").startsWith("https://") ? plano.link_destino : smartLink)
    : null;

  let adsets: Any[] = Array.isArray(plano.adsets) ? plano.adsets.slice(0, 3) : [];
  if (Array.isArray(plano.adsets) && plano.adsets.length > 3) {
    avisos.push(`plano vinha com ${plano.adsets.length} conjuntos — ficaram os 3 primeiros`);
  }

  // datas: end_time obriga a start_time e a end_time > start_time
  const start = typeof plano.start_time === "string" ? plano.start_time : null;
  let end = typeof plano.end_time === "string" ? plano.end_time : null;
  if (end && (!start || Date.parse(end) <= Date.parse(start))) {
    avisos.push("end_time inválido (sem start_time ou anterior ao arranque) — plano fica com orçamento diário");
    end = null;
  }
  plano.start_time = start;
  plano.end_time = end;
  const dias = end && start
    ? Math.max(1, Math.ceil((Date.parse(end) - Date.parse(start)) / 86_400_000))
    : 1;

  for (const a of adsets) {
    const pub = (a.publico_sugerido = a.publico_sugerido ?? {});
    // Defeito 4: geo só aceita código ISO de país com 2 letras. Cidade/estado em
    // texto livre viraria país em targeting.geo_locations.countries e a Meta recusa.
    const bruto: Any[] = Array.isArray(pub.geo) ? pub.geo : [];
    const geo: string[] = [];
    for (const g of bruto) {
      const s = typeof g === "string" ? g.trim() : "";
      if (/^[A-Za-z]{2}$/.test(s)) {
        const iso = s.toUpperCase();
        if (!geo.includes(iso)) geo.push(iso);
      } else if (s.length > 0) {
        avisos.push(
          `geo_cidade_descartada: conjunto "${a.trigger_nome ?? "?"}" pedia "${s}" em geo — em geo só entram códigos ISO de país com 2 letras (estados vão em publico_sugerido.estados)`,
        );
      }
    }
    if (geo.length === 0) {
      avisos.push(`conjunto "${a.trigger_nome ?? "?"}" sem geografia válida — usado ["BR"]`);
      pub.geo = ["BR"];
    } else {
      pub.geo = geo;
    }

    // Estados → geo_regions [{nome, key}]. A chave vem sempre da Meta; um estado
    // que não resolva NÃO entra e deixa aviso com o nome tentado.
    const estadosBrutos: Any[] = Array.isArray(pub.estados)
      ? pub.estados
      : (Array.isArray(pub.geo_regions) ? pub.geo_regions.map((r: Any) => r?.nome ?? r) : []);
    const nomes = estadosBrutos
      .map((e) => (typeof e === "string" ? e.trim() : ""))
      .filter((e) => e.length > 2);
    delete pub.estados;
    delete pub.geo_regions;
    if (nomes.length > 0) {
      const token = metaAppToken();
      if (!token) {
        avisos.push(
          `geo_regions_nao_resolvidas: sem credenciais de aplicação Meta — estados pedidos ficaram fora (${nomes.join(", ")})`,
        );
      } else {
        const pais = pub.geo[0] ?? "BR";
        const regioes: Any[] = [];
        for (const nome of nomes) {
          const key = await resolveRegionKey(nome, pais, token);
          if (key) {
            if (!regioes.some((r) => r.key === key)) regioes.push({ nome, key });
          } else {
            avisos.push(
              `geo_regiao_nao_resolvida: conjunto "${a.trigger_nome ?? "?"}" pedia o estado "${nome}" — não foi encontrado na Meta e ficou fora`,
            );
          }
        }
        if (regioes.length > 0) pub.geo_regions = regioes;
      }
    }



    if (!Number.isFinite(pub.idade_min)) pub.idade_min = 18;
    if (!Number.isFinite(pub.idade_max)) pub.idade_max = 65;

    // anúncios: só publicações realmente promovíveis; nunca inventar post_ref
    const lista = Array.isArray(a.anuncios) ? a.anuncios : [];
    const validos: Any[] = [];
    for (const an of lista) {
      const ref = an?.existing_post?.post_ref;
      if (typeof ref !== "string" || !postRefsOk.has(ref)) {
        avisos.push(`conjunto "${a.trigger_nome ?? "?"}": publicação ${ref ?? "(sem post_ref)"} não é promovível — anúncio descartado`);
        continue;
      }
      const kind = an.existing_post.kind === "instagram_media" ? "instagram_media" : "object_story";
      validos.push({ ...an, existing_post: { post_ref: ref, kind } });
      if (validos.length >= 1) break; // um anúncio por conjunto
    }
    a.anuncios = validos;
    a.orcamento_cents = Math.max(0, Math.round(Number(a.orcamento_cents ?? 0)));
  }

  adsets = adsets.filter((a) => (a.anuncios ?? []).length > 0);
  if (adsets.length === 0) {
    return json({
      error: "plano_invalido",
      mensagem: "O plano gerado ficou sem conjuntos com publicação promovível.",
      avisos,
    }, 422);
  }

  // orçamento: mínimo por conjunto e corte proporcional ao alvo/disponível
  const minCents = MIN_DAILY_CENTS * (end ? dias : 1);
  const tetoCents = Math.floor(alvoDiario * 100) * (end ? dias : 1);
  let soma = adsets.reduce((s, a) => s + a.orcamento_cents, 0);
  if (soma <= 0) {
    const fatia = Math.floor(tetoCents / adsets.length);
    for (const a of adsets) a.orcamento_cents = fatia;
    avisos.push("plano sem orçamentos — repartido o disponível em partes iguais");
    soma = adsets.reduce((s, a) => s + a.orcamento_cents, 0);
  }
  if (soma > tetoCents) {
    const fator = tetoCents / soma;
    for (const a of adsets) a.orcamento_cents = Math.floor(a.orcamento_cents * fator);
    avisos.push(
      `orçamento total do plano acima do disponível (${soma / 100} > ${tetoCents / 100}) — cortado proporcionalmente`,
    );
  }
  for (const a of adsets) {
    if (a.orcamento_cents < minCents) {
      avisos.push(`conjunto "${a.trigger_nome ?? "?"}" abaixo do mínimo — subido para ${minCents} cents`);
      a.orcamento_cents = minCents;
    }
  }
  // se o mínimo por conjunto estourar o teto, fica só com os conjuntos que cabem
  while (adsets.length > 1 && adsets.reduce((s, a) => s + a.orcamento_cents, 0) > tetoCents) {
    const fora = adsets.pop();
    avisos.push(`conjunto "${fora?.trigger_nome ?? "?"}" removido: não cabe no teto diário`);
  }
  plano.adsets = adsets;
  plano.orcamento_total_cents = adsets.reduce((s, a) => s + a.orcamento_cents, 0);

  // ── 9) Justificação vai DENTRO do plano (sem DDL, sem tabela de log)
  const resumoLlm = plano.resumo && typeof plano.resumo === "object" ? plano.resumo : {};
  const moeda = cap.account_currency ?? cap.cap_currency ?? "";
  const totalFinal = plano.orcamento_total_cents / 100;
  const porConjunto = adsets
    .map((a) => `"${a.trigger_nome ?? "?"}" ${(a.orcamento_cents / 100).toFixed(2)}`)
    .join(" + ");
  const textoOrcamento =
    `Orçamento final depois da normalização: ${totalFinal.toFixed(2)} ${moeda} por dia ` +
    `(${porConjunto}). Fonte: RPC public.artist_ads_budget_cap_get — teto ${Number(cap.daily_cap).toFixed(2)}, ` +
    `comprometido ${Number(cap.committed_daily ?? 0).toFixed(2)}, disponível ${disponivel.toFixed(2)} ${moeda} ` +
    `(leitura de ${new Date().toISOString().slice(0, 10)}).`;

  // Defeito 3: a justificação do orçamento é REESCRITA com os valores finais.
  // Nenhuma entrada de orçamento sobrevive com números anteriores ao corte.
  const ORC_RE = /or[çc]amento|budget|verba|di[áa]ri/i;
  const justificacao: Any[] = (Array.isArray(resumoLlm.justificacao) ? resumoLlm.justificacao : [])
    .filter((j: Any) => {
      const campo = String(j?.campo ?? "");
      const porque = String(j?.porque ?? "");
      const escolha = String(j?.escolha ?? "");
      const falaDeOrcamento = ORC_RE.test(campo) || ORC_RE.test(porque) || ORC_RE.test(escolha);
      const temNumero = /\d/.test(porque) || /\d/.test(escolha);
      return !(falaDeOrcamento && temNumero);
    });
  justificacao.push({
    campo: "orcamento",
    escolha: `${totalFinal.toFixed(2)} ${moeda}/dia`,
    porque: textoOrcamento,
  });

  const fontes = [
    {
      fonte: "RPC public.artist_ads_daily (90 dias) — desempenho pago por campanha e dia",
      periodo: periodoMin && periodoMax ? `${periodoMin} a ${periodoMax}` : "sem dias com gasto",
      ultima_atualizacao: ultimoSync,
    },
    {
      fonte: "RPC public.artist_ads_campaigns — campanhas da ligação (janelas 7d/30d)",
      periodo: "últimos 30 dias",
      ultima_atualizacao: ultimoSync,
    },
    {
      fonte: "RPC public.artist_ads_ads — anúncios com gasto (ThruPlays, 3s, CTR, custo por ThruPlay; 7d/30d)",
      periodo: "últimos 30 dias",
      ultima_atualizacao: ultimoSync,
    },
    {
      fonte: "RPC public.artist_ads_promotable_posts — publicações prontas para anunciar",
      periodo: "actual",
      ultima_atualizacao: null,
    },
    {
      fonte: "RPC public.artist_ads_budget_cap_get — teto e disponível da ligação",
      periodo: "actual",
      ultima_atualizacao: cap.set_at ?? null,
    },
    {
      fonte: "public.artist_audience_demographics (Instagram orgânico) — FONTE SECUNDÁRIA",
      periodo: demografiaOrganica.periodo
        ? `${demografiaOrganica.periodo.de} a ${demografiaOrganica.periodo.a}`
        : "sem dados",
      ultima_atualizacao: demografiaOrganica.periodo?.a ?? null,
    },
    {
      fonte: "public.artist_song_metrics_daily + RPC song_benchmark_aligned — snapshot da música",
      periodo: "últimos 30 dias",
      ultima_atualizacao: relatorio?.gerado_em ?? null,
    },
  ];

  plano.resumo = {
    origem: "llm",
    modelo: MODEL,
    gerado_em: new Date().toISOString(),
    tokens: llm.tokens ?? null,
    entradas_usadas: {
      snapshot_da_musica: snapshotMusica != null,
      relatorio_de_lancamento: relatorio?.gerado_em ?? null,
      publicacoes_promoviveis: posts.length,
      campanhas_no_historico: (campanhas ?? []).length,
      campanhas_da_ligacao: campanhasDaLigacao.length,
      campanhas_com_gasto_90d: campanhasPagas.length,
      anuncios_com_gasto: anuncios.length,
      dias_de_diario_90d: diarioDaLigacao.length,
      periodo_pago: { de: periodoMin, a: periodoMax },
      totais_pagos_90d: totais90d,
      ultimo_sync: ultimoSync,
      demografia_organica_instagram: demografiaOrganica.periodo,
      teto: {
        daily_cap: Number(cap.daily_cap),
        committed_daily: Number(cap.committed_daily ?? 0),
        available_daily: disponivel,
        alvo_diario: alvoDiario,
        moeda: cap.account_currency ?? cap.cap_currency ?? null,
      },
    },
    fontes,
    justificacao,
    hipoteses: Array.isArray(resumoLlm.hipoteses) ? resumoLlm.hipoteses : [],
    avisos: [...(Array.isArray(resumoLlm.avisos) ? resumoLlm.avisos : []), ...avisos],
  };


  // ── 10) Validar (IMMUTABLE, não grava) e só depois gravar em 'rascunho'
  const { error: valErr } = await user.rpc("artist_ads_plan_validate", {
    p_plan: plano,
    p_smart_link: smartLink,
  });
  if (valErr) {
    return json({ error: "plano_invalido", mensagem: valErr.message, plano }, 422);
  }

  const { data: planId, error: createErr } = await user.rpc("artist_ads_plan_create", {
    p_artist_id: artistId,
    p_song_id: songId,
    p_connection_id: connectionId,
    p_plan: plano,
  });
  if (createErr) {
    const msg = createErr.message ?? "";
    const status = /permiss|42501|papel|autoriza/i.test(msg) ? 403 : 422;
    return json({ error: status === 403 ? "sem_permissao" : "plano_invalido", mensagem: msg, plano }, status);
  }

  console.log(`[${FUNCTION_NAME}] plano ${planId} criado em rascunho para música ${songId}`);
  return json({ plan_id: planId, plano, resumo: plano.resumo });
});
