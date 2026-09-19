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

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
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

// deno-lint-ignore no-explicit-any
type Any = any;

const SYSTEM_PROMPT =
  `Você é estrategista de tráfego pago para lançamentos musicais (forró/piseiro, Nordeste do Brasil).
Desenha um plano de campanha Meta para UMA música, a partir do snapshot de dados que recebe.

REGRAS ABSOLUTAS:
1. Só pode citar números que estão no JSON do snapshot. É PROIBIDO estimar, inventar ou recalcular ritmos por dia (use o campo de ritmo que vem no snapshot). Cada número citado traz a data do dado.
2. Objetivo só pode ser AWARENESS, TRAFFIC ou ENGAGEMENT. Campanhas de conversão/vendas são recusadas neste módulo — nunca as proponha.
3. TRAFFIC só é permitido se a música tiver smart link https no snapshot (limites.smart_link_url). Sem smart link, proponha AWARENESS ou ENGAGEMENT e registe a falta em avisos.
4. Geografia é obrigatória em cada conjunto (publico_sugerido.geo). Por omissão ["BR"]. Só refine (cidades/estados) com dados de demografia que existam no snapshot.
5. No máximo 3 conjuntos de anúncios. Cada conjunto tem UM público e UM anúncio, e esse anúncio promove uma publicação existente (existing_post) da lista publicacoes_promoviveis. NUNCA invente post_ref: use exactamente um post_ref dessa lista.
6. Por omissão não use end_time (orçamento diário). Se propuser end_time, tem de vir start_time e end_time > start_time.
7. A soma dos orcamento_cents dos conjuntos por dia não pode passar o disponível em limites.available_daily (na moeda da conta). Cada conjunto tem pelo menos 100 cents por dia.
8. Português do Brasil, linguagem de quem compra mídia: objetiva e com dado na mão.

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
    "justificacao": [{ "campo": "objetivo", "escolha": "AWARENESS", "porque": "número do snapshot + data" }],
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
  const { data: diario } = await user.rpc("artist_ads_daily", { p_artist_id: artistId, p_days: 30 });
  const comGasto = (campanhas ?? []).filter((c: Any) => Number(c?.spend_30d ?? 0) > 0).slice(0, 5);
  const anuncios: Any[] = [];
  for (const c of comGasto) {
    const { data: ads } = await user.rpc("artist_ads_ads", {
      p_artist_id: artistId,
      p_campaign_id: c.campaign_id,
    });
    for (const a of (ads ?? [])) anuncios.push(a);
  }

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
    historico_trafego: {
      campanhas: campanhas ?? [],
      diario_30d: diario ?? [],
      anuncios_das_campanhas_com_gasto: anuncios,
    },
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
    const geo = Array.isArray(pub.geo)
      ? pub.geo.filter((g: Any) => typeof g === "string" && g.trim().length > 0)
      : [];
    if (geo.length === 0) {
      avisos.push(`conjunto "${a.trigger_nome ?? "?"}" sem geografia — usado ["BR"]`);
      pub.geo = ["BR"];
    } else {
      pub.geo = geo;
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
      campanhas_com_gasto: comGasto.length,
      anuncios_no_historico: anuncios.length,
      dias_de_diario: (diario ?? []).length,
      teto: {
        daily_cap: Number(cap.daily_cap),
        committed_daily: Number(cap.committed_daily ?? 0),
        available_daily: disponivel,
        alvo_diario: alvoDiario,
        moeda: cap.account_currency ?? cap.cap_currency ?? null,
      },
    },
    justificacao: Array.isArray(resumoLlm.justificacao) ? resumoLlm.justificacao : [],
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
