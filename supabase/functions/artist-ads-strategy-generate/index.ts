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
import { buildArtistDataSnapshot } from "../_shared/artist-data-snapshot.ts";
import { analisarVideosTiktok } from "../_shared/tiktok-video-analysis.ts";
import { deduceTriggerSource, finishSyncRun, startSyncRun } from "../_shared/sync-run.ts";

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

// ── TikTok (D-ERP107) ───────────────────────────────────────────────────────
// Objetivos e mínimo de orçamento do alvo TikTok. O caminho Meta fica igual.
const OBJETIVOS_TIKTOK = ["REACH", "VIDEO_VIEWS", "TRAFFIC"];
const MIN_DAILY_CENTS_TIKTOK = 2000;
// Máximo de vídeos enviados ao LLM (a conta do artista pode ter milhares).
const MAX_VIDEOS_TIKTOK = 40;

// ── Google / YouTube (D-ERP108) ─────────────────────────────────────────────
// Campanhas de VÍDEO no YouTube: TRAFFIC não é suportado (ver
// crm-google-video-publish-execute → objetivo_nao_suportado_google).
const OBJETIVOS_GOOGLE = ["REACH", "VIDEO_VIEWS"];
const MIN_DAILY_CENTS_GOOGLE = 500;
const MAX_VIDEOS_GOOGLE = 40;

// ── Meta ────────────────────────────────────────────────────────────────────
// Máximo de publicações enviadas ao modelo. A conta de um artista activo tem
// centenas de publicações promovíveis (Litto: 499 a 23/09/2026) e a lista
// inteira no prompt fazia o modelo devolver post_ref truncado ou inventado.
const MAX_POSTS_META = 40;

/** Nome de estado sem acentos, minúsculas, sem "(state)" nem "state/estado of". */
function chaveEstado(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(state\)/g, "")
    .replace(/\b(state|estado)\s+(of|de|do|da)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Devolve o nome oficial do estado em public.br_estados (ou null). */
function estadoOficial(
  nome: string,
  tabela: { nome: string; uf: string }[],
): string | null {
  const k = chaveEstado(nome);
  if (!k) return null;
  const porNome = tabela.find((e) => chaveEstado(e.nome) === k);
  if (porNome) return porNome.nome;
  const porUf = tabela.find((e) => e.uf.toLowerCase() === k);
  return porUf ? porUf.nome : null;
}

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
10. EXISTE histórico pago por dimensão em historico_pago.breakdowns (RPC public.artist_ads_breakdowns, 90 dias): region, age, gender, publisher_platform e country, cada um com top 10 por impressões, gasto, CTR, CPC, CPM, quota de impressões e a mediana da dimensão. Os dados por CAMPANHA/ANÚNCIO continuam sem este corte. Quando uma dimensão vier vazia, escreva literalmente "sem histórico pago nesta região" / "sem histórico pago para este público" em vez de inferir a partir do orgânico.
11. demografia_organica_instagram é FONTE SECUNDÁRIA e só de Instagram orgânico. Se a usar, identifique-a como tal no texto ("fonte secundária: demografia orgânica do Instagram, snapshot de <data>"). Nunca a apresente como desempenho pago.
12. Criativo: justifique a publicação escolhida com o desempenho pago do anúncio/criativo correspondente quando existir em desempenho_pago.anuncios; se não existir, diga "publicação sem histórico pago".
13. ARTISTA REGIONAL: ordene a geografia por CONCENTRAÇÃO (quota da base do artista nesse estado/região), NUNCA por valor absoluto de uma cidade. Exemplo real do erro a evitar: São Paulo entrou num plano só por ser a 2.ª cidade em seguidores (7.596), contra Natal (19.557) e ~35,4 mil apenas nas cidades do Rio Grande do Norte no top 30 (artist_audience_demographics, instagram/followers, snapshot de 19/09/2026).
14. Metrópoles fora da região-base (ex.: São Paulo, Rio de Janeiro) só entram com evidência de desempenho PAGO ou de streaming no snapshot, e NUNCA na 1.ª campanha.
15. Quando os dados mostrarem base concentrada numa região, escreva explicitamente na justificação "artista regional: base RN/Nordeste" (ou a região que os dados mostrarem).
16. Sempre que estreitar idades (qualquer coisa diferente de 18–65), cite a distribuição etária real da base com a data do dado. Exemplo do dado do Litto a 19/09/2026: 25–34 = 42,9 %, 35–44 = 24,5 %, 18–24 = 18,5 % — foi por não citar que saiu um conjunto 18–34 contra uma base 25–44. Sem esse dado citado, mantenha 18–65.
17. GEOGRAFIA — ordem obrigatória das fontes: PRIMEIRO historico_pago.breakdowns.region (CTR, CPC, CPM e gasto dos últimos 90 dias) e SÓ DEPOIS a concentração orgânica em audiencia.por_estado (quota_pct e quota por região). A justificação de geografia cita SEMPRE as duas, com números e datas.
18. Um estado só entra num conjunto com EVIDÊNCIA: quota orgânica ≥ 5 % em audiencia.por_estado OU desempenho pago melhor que a mediana da dimensão region (CTR acima da mediana ou CPC abaixo da mediana, em historico_pago.breakdowns.region.medianas). A justificação diz explicitamente qual das duas evidências sustentou o estado. Sem nenhuma das duas, o estado fica fora.
19. IDADES — use a distribuição da audiência ENVOLVIDA (audiencia.por_tipo["instagram.engaged"]) quando existir; se não existir, a de audiencia.por_tipo["instagram.reached"]; se não existir, a de audiencia.por_tipo["instagram.followers"]. Cite as percentagens e a data, e diga qual o tipo de audiência usado.
19-U. UNIDADES DA AUDIÊNCIA — os números de audiência vêm com "unit": 'count' é contagem e 'pct' é já uma quota da plataforma, em percentagem. É PROIBIDO somar ou comparar valores de "unit" diferentes (nem dentro da mesma dimensão, nem entre dimensões). Ao citar um número de audiência diga sempre a plataforma, o tipo de audiência, a data do snapshot e, quando for percentagem, diga que é percentagem.
20. Cruzamento pago vs orgânico: quando o pago e o orgânico apontarem para estados diferentes, o pago manda e a divergência tem de ser escrita em resumo.avisos.
21. geografia_por_uf é a TABELA ÚNICA por estado (UF): junta o pago de Meta e de Google (impressões, cliques, gasto, CTR, CPC, CPM) com a quota orgânica, já com os nomes de cada fonte normalizados a UF (campo nomes_originais diz o nome cru e a fonte). Use-a para a regra de concentração regional; historico_pago.breakdowns.region e audiencia.por_estado continuam a ser as fontes citadas nos números.
22. FÃS (Instagram) ≠ OUVINTES (Spotify) — a concentração regional pondera DUAS fontes orgânicas: a base de FÃS (audiencia.fas, geografia_por_uf.quota_fas_pct) e a audiência de ESCUTA (audiencia.ouvintes, geografia_por_uf.quota_ouvintes_pct). É o OBJETIVO que decide qual pesa mais: objetivo de streams/plays da música → pesa a audiência de ESCUTA (Spotify); objetivo de comunidade, alcance local ou shows → pesa a base de FÃS (Instagram). A justificação de geografia DIZ qual das duas usou, com o número e a data, e ASSINALA quando as duas discordam (ex.: RN 46,4 % dos seguidores contra 2,6 % dos ouvintes; SP 9,7 % dos seguidores contra 23,3 % dos ouvintes). Quando só existir uma das fontes, diga-o explicitamente e NÃO finja a outra.

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

// ── Variante TikTok (D-ERP107) ──────────────────────────────────────────────
// Mesmas regras de fontes, concentração regional e evidência pago/orgânico; só
// muda o alvo (objetivos, criativo em vídeo, geografia por NOME de estado) e o
// formato de resposta (anuncios: [{ tiktok_video_id }]).
const SYSTEM_PROMPT_TIKTOK =
  `Você é estrategista de tráfego pago para lançamentos musicais (forró/piseiro, Nordeste do Brasil).
Desenha um plano de campanha TIKTOK para UMA música, a partir do snapshot de dados que recebe.

REGRAS ABSOLUTAS:
1. Só pode citar números que estão no JSON do snapshot. É PROIBIDO estimar, inventar ou recalcular ritmos por dia (use o campo de ritmo que vem no snapshot). Cada número citado traz a data do dado.
2. Objetivo só pode ser REACH, VIDEO_VIEWS ou TRAFFIC. Campanhas de conversão/vendas são recusadas neste módulo — nunca as proponha.
3. TRAFFIC só é permitido se houver link https (limites.smart_link_url). Sem link, proponha REACH ou VIDEO_VIEWS e registe a falta em avisos.
4. Geografia: publico_sugerido.geo só aceita códigos ISO de país com 2 letras (ex.: ["BR"]) e é SEMPRE obrigatória. Para estreitar dentro do país, use publico_sugerido.geo_regions: LISTA DE NOMES de estados brasileiros por extenso (ex.: ["Rio Grande do Norte","Ceará"]). É PROIBIDO escrever cidades ou siglas. O motor de publicação resolve os location_ids do TikTok.
5. No máximo 3 conjuntos. Cada conjunto tem UM público e UM anúncio, e esse anúncio é um VÍDEO do artista: { "tiktok_video_id": "<post_ref da lista videos_promoviveis>" }. NUNCA invente o id. PREFIRA vídeos ligados à música (song_id igual ao da música) e, se o snapshot tiver views/likes/shares desse vídeo em canais/conteúdo, cite-os na justificação do criativo.
6. Não há headline, corpo, cta nem existing_post no TikTok — não os escreva.
7. Por omissão não use end_time (orçamento diário). Se propuser end_time, tem de vir start_time e end_time > start_time.
8. A soma dos orcamento_cents por dia não pode passar limites.available_daily (moeda da conta). Cada conjunto tem pelo menos 2000 cents por dia.
9. FONTE PRIMÁRIA = desempenho_pago (histórico pago real do artista, que é de Meta e Google — não existe histórico pago de TikTok). Toda a escolha de público, geografia, orçamento e criativo cita no campo "porque": a FONTE, o NÚMERO exacto e a DATA. Quando não houver breakdowns de TikTok, escreva em resumo.avisos "sem histórico pago TikTok".
10. EXISTE histórico pago por dimensão em historico_pago.breakdowns (region, age, gender, publisher_platform, country), com top 10 por impressões, gasto, CTR, CPC, CPM e medianas. Dimensão vazia → escreva "sem histórico pago nesta região" / "sem histórico pago para este público" em vez de inferir do orgânico.
11. demografia_organica_instagram é FONTE SECUNDÁRIA e só de Instagram orgânico; identifique-a como tal e nunca a apresente como desempenho pago.
12. Criativo: justifique o vídeo com o desempenho que existir no snapshot; se não existir, diga "vídeo sem histórico pago".
13. ARTISTA REGIONAL: ordene a geografia por CONCENTRAÇÃO (quota da base nesse estado), NUNCA por valor absoluto de uma cidade.
14. Metrópoles fora da região-base só entram com evidência de desempenho PAGO ou de streaming no snapshot, e NUNCA na 1.ª campanha.
15. Base concentrada numa região → escreva "artista regional: base RN/Nordeste" (ou a região dos dados).
16. Ao estreitar idades (algo diferente de 18–65), cite a distribuição etária real com a data. Sem esse dado citado, mantenha 18–65.
17. GEOGRAFIA — ordem obrigatória: PRIMEIRO historico_pago.breakdowns.region e SÓ DEPOIS a concentração orgânica em audiencia.por_estado. A justificação cita SEMPRE as duas, com números e datas.
18. Um estado só entra com EVIDÊNCIA: quota orgânica ≥ 5 % OU desempenho pago melhor que a mediana da dimensão region (CTR acima ou CPC abaixo). Diga qual das duas sustentou o estado; sem nenhuma, fica fora.
19. IDADES — use a audiência ENVOLVIDA (audiencia.por_tipo["instagram.engaged"]) quando existir; senão audiencia.por_tipo["instagram.reached"]; senão audiencia.por_tipo["instagram.followers"]. Cite percentagens, data e o tipo usado.
19-U. UNIDADES DA AUDIÊNCIA — os números de audiência vêm com "unit": 'count' é contagem e 'pct' é já uma quota da plataforma, em percentagem. É PROIBIDO somar ou comparar valores de "unit" diferentes (nem dentro da mesma dimensão, nem entre dimensões). Ao citar um número de audiência diga sempre a plataforma, o tipo de audiência, a data do snapshot e, quando for percentagem, diga que é percentagem.
20. Pago vs orgânico divergentes: o pago manda e a divergência vai a resumo.avisos.
21. geografia_por_uf é a tabela única por estado (UF) com pago (Meta+Google) e quota orgânica já normalizados; use-a para a concentração regional.
21-B. FÃS (Instagram) ≠ OUVINTES (Spotify) — a concentração regional pondera DUAS fontes orgânicas: base de FÃS (audiencia.fas, geografia_por_uf.quota_fas_pct) e audiência de ESCUTA (audiencia.ouvintes, geografia_por_uf.quota_ouvintes_pct). O OBJETIVO decide o peso: streams/plays da música → pesa a ESCUTA (Spotify); comunidade, alcance local ou shows → pesa a base de FÃS (Instagram). A justificação diz qual usou, com número e data, e assinala quando as duas discordam (ex.: RN 46,4 % dos seguidores contra 2,6 % dos ouvintes; SP 9,7 % contra 23,3 %). Só com uma das fontes, diga-o e NÃO finja a outra.
22. Português do Brasil, linguagem de quem compra mídia: objetiva e com dado na mão.
23. MANDATO: proponha a estratégia MAIS OUSADA QUE OS DADOS SUSTENTAM. Plano morno (tudo igual, verba repartida sem razão, público largo por medo) é resposta errada. Ousadia é sempre ancorada em número com data — nunca em opinião.
24. ANÁLISE DOS VÍDEOS: analise_videos_tiktok traz top 15 por views, top 10 por taxa de interação, top 10 por crescimento de 7 dias, os vídeos ligados à música e padrões (duração média do top vs resto, sons e palavras/hooks mais frequentes no top). Escolha os criativos DAÍ, por evidência: taxa de interação, partilhas/views, crescimento recente e ligação à música. Em cada anúncio, o campo "porque" cita o número exacto e a data (ex.: "18,4 % de interação e 2,1 % de partilhas em 45.300 views, 19/09/2026").
25. Spark Ads: o anúncio é o VÍDEO ORGÂNICO que já existe na conta — não se produz criativo novo, aproveita-se a prova social acumulada. Diga-o na justificação do criativo.
26. HIPÓTESES OUSADAS E MENSURÁVEIS — cada conjunto é uma aposta explícita e as apostas têm de ser DIFERENTES entre si. Exemplos do tipo de aposta a fazer: vídeo mais partilhado contra vídeo ligado à música; público estreito no estado de maior concentração contra Nordeste inteiro; concentrar quase toda a verba num só vencedor contra dividir por três. Se a evidência aponta claramente um vencedor, CONCENTRE a verba nele e diga-o.
27. GATILHO DE 72 HORAS — para CADA conjunto, resumo.hipoteses tem de trazer o que tem de acontecer em 72 h para manter ou pausar, em número verificável (ex.: "manter se CPM ≤ mediana de 14,20 do histórico pago de 19/09/2026; pausar se ThruPlay acima disso"). Sem gatilho numérico, a hipótese não serve.
28. Sem breakdowns de TikTok, escreva em resumo.avisos exactamente: "sem histórico pago TikTok; hipótese sustentada em orgânico TikTok + pago Meta/Google".

FORMATO DE RESPOSTA — responde APENAS com JSON puro (sem markdown fences):
{
  "objetivo": "REACH|VIDEO_VIEWS|TRAFFIC",
  "link_destino": "<https://… ou null>",
  "adsets": [
    {
      "trigger_nome": "nome curto do conjunto",
      "funil": "topo|meio|fundo",
      "aposta": "a hipótese ousada que este conjunto testa",
      "orcamento_cents": <inteiro, por dia>,
      "publico_sugerido": {
        "geo": ["BR"],
        "geo_regions": ["Rio Grande do Norte"],
        "idade_min": 18,
        "idade_max": 65,
        "descricao": "quem é este público e porque"
      },
      "anuncios": [{ "tiktok_video_id": "<post_ref da lista videos_promoviveis>", "porque": "número exacto + data que sustentam este vídeo" }]
    }
  ],
  "resumo": {
    "justificacao": [{ "campo": "objetivo|publico|geografia|orcamento|criativo", "escolha": "…", "porque": "fonte + número + data" }],
    "hipoteses": [{ "conjunto": "trigger_nome", "o_que_testar": "…", "como_ler": "…", "gatilho_72h": "manter se … ; pausar se …" }],
    "avisos": ["…"]
  }
}`;

// ── Variante YouTube / Google Ads (D-ERP108) ────────────────────────────────
// Espelho do prompt TikTok: mesmas regras de fontes, concentração regional e
// evidência; muda o alvo (campanha de VÍDEO no YouTube), os objetivos
// (REACH|VIDEO_VIEWS) e o formato (anuncios: [{ youtube_video_id }]).
const SYSTEM_PROMPT_GOOGLE =
  `Você é estrategista de tráfego pago para lançamentos musicais (forró/piseiro, Nordeste do Brasil).
Desenha um plano de campanha de VÍDEO NO YOUTUBE (Google Ads) para UMA música, a partir do snapshot de dados que recebe.

REGRAS ABSOLUTAS:
1. Só pode citar números que estão no JSON do snapshot. É PROIBIDO estimar, inventar ou recalcular ritmos por dia. Cada número citado traz a data do dado.
2. Objetivo só pode ser REACH (alcance eficiente, CPM alvo) ou VIDEO_VIEWS (in-stream saltável, CPV alvo). NUNCA proponha TRAFFIC nem campanhas de conversão/vendas: neste módulo não são suportadas no YouTube.
3. Geografia: publico_sugerido.geo só aceita códigos ISO de país com 2 letras (ex.: ["BR"]) e é SEMPRE obrigatória. Para estreitar, use publico_sugerido.geo_regions: LISTA DE NOMES de estados brasileiros por extenso (ex.: ["Rio Grande do Norte","Ceará"]). PROIBIDO cidades ou siglas — o motor de publicação resolve as chaves de geografia do Google.
4. No máximo 3 conjuntos. Cada conjunto tem UM público e UM anúncio, e esse anúncio é um VÍDEO DO YOUTUBE do artista: { "youtube_video_id": "<post_ref da lista videos_promoviveis>" }. NUNCA invente o id. PREFIRA vídeos ligados à música (song_id igual ao da música).
5. Não há headline, corpo, cta nem existing_post — não os escreva.
6. Por omissão não use end_time (orçamento diário). Se propuser end_time, tem de vir start_time e end_time > start_time.
7. A soma dos orcamento_cents por dia não pode passar limites.available_daily (moeda da conta). Cada conjunto tem pelo menos 500 cents por dia.
8. FONTE PRIMÁRIA = desempenho_pago e historico_pago.breakdowns (Meta e Google, por region, country, age, gender, device), com top 10 por impressões, gasto, CTR, CPC, CPM e medianas. Toda a escolha de público, geografia, orçamento e criativo cita no campo "porque": a FONTE, o NÚMERO exacto e a DATA. Dimensão vazia → escreva "sem histórico pago nesta região" / "sem histórico pago para este público" em vez de inferir do orgânico.
9. demografia_organica_instagram é FONTE SECUNDÁRIA e só de Instagram orgânico; identifique-a como tal e nunca a apresente como desempenho pago.
10. ARTISTA REGIONAL: ordene a geografia por CONCENTRAÇÃO (quota da base nesse estado), NUNCA por valor absoluto de uma cidade.
11. Metrópoles fora da região-base só entram com evidência de desempenho PAGO ou de streaming no snapshot, e NUNCA na 1.ª campanha.
12. Base concentrada numa região → escreva "artista regional: base RN/Nordeste" (ou a região dos dados).
13. Ao estreitar idades (algo diferente de 18–65), cite a distribuição etária real com a data. Sem esse dado citado, mantenha 18–65.
14. GEOGRAFIA — ordem obrigatória: PRIMEIRO historico_pago.breakdowns.region e SÓ DEPOIS a concentração orgânica em audiencia.por_estado. A justificação cita SEMPRE as duas, com números e datas.
15. Um estado só entra com EVIDÊNCIA: quota orgânica ≥ 5 % OU desempenho pago melhor que a mediana da dimensão region (CTR acima ou CPC abaixo). Diga qual das duas sustentou o estado; sem nenhuma, fica fora.
16. IDADES — use a audiência ENVOLVIDA (audiencia.por_tipo["instagram.engaged"]) quando existir; senão audiencia.por_tipo["instagram.reached"]; senão audiencia.por_tipo["instagram.followers"]. Cite percentagens, data e o tipo usado.
16-U. UNIDADES DA AUDIÊNCIA — os números de audiência vêm com "unit": 'count' é contagem e 'pct' é já uma quota da plataforma, em percentagem. É PROIBIDO somar ou comparar valores de "unit" diferentes (nem dentro da mesma dimensão, nem entre dimensões). Ao citar um número de audiência diga sempre a plataforma, o tipo de audiência, a data do snapshot e, quando for percentagem, diga que é percentagem.
17. Pago vs orgânico divergentes: o pago manda e a divergência vai a resumo.avisos.
18. geografia_por_uf é a tabela única por estado (UF) com pago (Meta+Google) e quota orgânica já normalizados; use-a para a concentração regional.
18-B. FÃS (Instagram) ≠ OUVINTES (Spotify) — a concentração regional pondera DUAS fontes orgânicas: base de FÃS (audiencia.fas, geografia_por_uf.quota_fas_pct) e audiência de ESCUTA (audiencia.ouvintes, geografia_por_uf.quota_ouvintes_pct). O OBJETIVO decide o peso: streams/plays da música → pesa a ESCUTA (Spotify); comunidade, alcance local ou shows → pesa a base de FÃS (Instagram). A justificação diz qual usou, com número e data, e assinala quando as duas discordam (ex.: RN 46,4 % dos seguidores contra 2,6 % dos ouvintes; SP 9,7 % contra 23,3 %). Só com uma das fontes, diga-o e NÃO finja a outra.
19. Português do Brasil, linguagem de quem compra mídia: objetiva e com dado na mão.
20. MANDATO: proponha a estratégia MAIS OUSADA QUE OS DADOS SUSTENTAM. Plano morno é resposta errada. Ousadia ancorada em número com data — nunca em opinião.
21. ANÁLISE DOS VÍDEOS: analise_videos_youtube traz top 15 por views, top 10 por taxa de interação, top 10 por crescimento de 7 dias, os vídeos ligados à música e padrões (duração média do top vs resto, palavras/hooks mais frequentes no top). Escolha os criativos DAÍ, por evidência. Em cada anúncio, o campo "porque" cita o número exacto e a data.
22. O anúncio usa o VÍDEO QUE JÁ EXISTE no canal do artista — não se produz criativo novo, aproveita-se a prova social acumulada. Diga-o na justificação do criativo.
23. HIPÓTESES OUSADAS E MENSURÁVEIS — cada conjunto é uma aposta explícita e as apostas têm de ser DIFERENTES entre si (vídeo mais visto contra vídeo ligado à música; estado de maior concentração contra Nordeste inteiro; concentrar quase toda a verba num vencedor contra dividir). Se a evidência aponta um vencedor, CONCENTRE a verba nele e diga-o.
24. GATILHO DE 72 HORAS — para CADA conjunto, resumo.hipoteses traz o que tem de acontecer em 72 h para manter ou pausar, em número verificável (ex.: "manter se CPM ≤ mediana de 14,20 do histórico pago de 19/09/2026").
25. Sem breakdowns do Google para a região escolhida, escreva em resumo.avisos "sem histórico pago no YouTube nesta região; hipótese sustentada em orgânico YouTube + pago Meta/Google".

FORMATO DE RESPOSTA — responde APENAS com JSON puro (sem markdown fences):
{
  "objetivo": "REACH|VIDEO_VIEWS",
  "link_destino": "<https://… ou null>",
  "adsets": [
    {
      "trigger_nome": "nome curto do conjunto",
      "funil": "topo|meio|fundo",
      "aposta": "a hipótese ousada que este conjunto testa",
      "orcamento_cents": <inteiro, por dia>,
      "publico_sugerido": {
        "geo": ["BR"],
        "geo_regions": ["Rio Grande do Norte"],
        "idade_min": 18,
        "idade_max": 65,
        "descricao": "quem é este público e porque"
      },
      "anuncios": [{ "youtube_video_id": "<post_ref da lista videos_promoviveis>", "porque": "número exacto + data que sustentam este vídeo" }]
    }
  ],
  "resumo": {
    "justificacao": [{ "campo": "objetivo|publico|geografia|orcamento|criativo", "escolha": "…", "porque": "fonte + número + data" }],
    "hipoteses": [{ "conjunto": "trigger_nome", "o_que_testar": "…", "como_ler": "…", "gatilho_72h": "manter se … ; pausar se …" }],
    "avisos": ["…"]
  }
}`;

async function callLlm(prompt: string, systemPrompt: string = SYSTEM_PROMPT) {
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
          { role: "system", content: systemPrompt },
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

// Cliente de serviço — usado SÓ para o registo técnico em public.sync_runs
// (nunca para ler/escrever dados do plano, que continuam na sessão do chamador).
function adminClient() {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Diagnóstico da geração — vai inteiro para sync_runs.details. */
type Diag = {
  run_id: string | null;
  company_id: string | null;
  artist_id: string | null;
  song_id: string | null;
  connection_id: string | null;
  plataforma: string | null;
  modelo: string;
  posts_promoviveis_total: number | null;
  posts_enviados_ao_modelo: number | null;
  ids_permitidos_exemplo: string[];
  tentativas: number;
  retry_com_lista_de_ids: boolean;
  ids_devolvidos_pelo_modelo: string[];
  ids_nao_casaram: Array<{ id: string; motivo: string; conjunto?: string }>;
  adsets_do_modelo: number | null;
  anuncios_do_modelo: number | null;
  adsets_validos: number | null;
  plan_id: string | null;
  erro: string | null;
};

async function gerar(req: Request, diag: Diag, admin: Any): Promise<Response> {
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

  // Registo técnico da geração (sem browser: tudo fica em public.sync_runs).
  diag.artist_id = artistId;
  diag.song_id = songId;
  diag.connection_id = connectionId;
  try {
    const { data: art } = await admin.from("artists").select("company_id").eq("id", artistId).maybeSingle();
    diag.company_id = (art?.company_id as string) ?? null;
  } catch { /* o registo nunca faz a geração falhar */ }
  diag.run_id = await startSyncRun(admin, {
    function_name: FUNCTION_NAME,
    trigger_source: deduceTriggerSource(req),
    dry_run: false,
    company_id: diag.company_id,
    artist_id: artistId,
  });

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

  // ── 2) SNAPSHOT ÚNICO DO ARTISTA (D-ERP105) — um só coletor para música,
  //      conteúdo, audiência orgânica, histórico pago (meta + google),
  //      comparáveis, relatório, teto, publicações, criativos e geografia por UF.
  // ── 1b) PLATAFORMA DA LIGAÇÃO PEDIDA (D-ERP107)
  const { data: conns, error: connErr } = await user.rpc("artist_ads_connections", {
    p_artist_id: artistId,
  });
  if (connErr) return json({ error: "sem_permissao", mensagem: connErr.message }, 403);
  const ligacao: Any = (conns ?? []).find((c: Any) => c?.id === connectionId) ?? null;
  if (!ligacao) {
    return json({
      error: "ligacao_nao_encontrada",
      mensagem: "A ligação de anúncios não pertence a este artista.",
    }, 422);
  }
  const plataforma = String(ligacao.platform ?? "").toLowerCase();
  if (!["meta", "tiktok", "google"].includes(plataforma)) {
    return json({
      error: "plataforma_nao_suportada",
      mensagem: `Estratégia por IA só está disponível para Meta, TikTok e Google/YouTube (ligação é ${plataforma || "?"}).`,
    }, 422);
  }
  const eTiktok = plataforma === "tiktok";
  const eGoogle = plataforma === "google";
  /** Alvos cujo criativo é um vídeo orgânico existente (TikTok e YouTube). */
  const eVideo = eTiktok || eGoogle;

  const dados = await buildArtistDataSnapshot({
    userClient: user,
    artistId,
    songId,
    connectionId,
    dias: 30,
    plataformas: ["meta", "google"],
    plataformaCriativos: plataforma,
  });
  avisos.push(...dados.avisos);

  const snapshotMusica: Any = dados.blocos.musica;
  const relatorio: Any = dados.blocos.relatorio;
  const historicoPago: Any = dados.blocos.historico_pago ?? {};
  const audiencia: Any = dados.blocos.audiencia_organica ?? {};
  const geografiaPorUf: Any = dados.geografia;

  // Publicações/vídeos anunciáveis (só prontos). No TikTok são vídeos do artista
  // (post_kind 'tiktok_video'), no Google vídeos do YouTube (post_kind
  // 'youtube_video'); preferem-se os ligados à música.
  const postsTotais = (dados.blocos.publicacoes ?? []).filter((p: Any) => p?.meta_ready === true && p?.post_ref);
  let posts = postsTotais;
  if (posts.length === 0) {
    return json({
      error: "sem_publicacoes_promoviveis",
      mensagem: eTiktok
        ? "Não há vídeos do artista no TikTok prontos para anunciar."
        : eGoogle
        ? "Não há vídeos do artista no YouTube prontos para anunciar."
        : "Não há publicações do artista prontas para anunciar no Meta.",
    }, 422);
  }
  let videosLigadosMusica = 0;
  if (eVideo) {
    const ligados = posts.filter((p: Any) => p?.song_id === songId);
    const outros = posts.filter((p: Any) => p?.song_id !== songId);
    videosLigadosMusica = ligados.length;
    const limite = eGoogle ? MAX_VIDEOS_GOOGLE : MAX_VIDEOS_TIKTOK;
    posts = [...ligados, ...outros].slice(0, limite);
  } else {
    // META (defeito 23/09): a conta do Litto devolve 499 publicações prontas. A
    // lista inteira ia para o prompt (centenas de KB) e o modelo respondia com
    // post_ref truncado ou inventado — nenhum anúncio casava e o plano morria em
    // plano_invalido. Agora envia-se uma lista curta e ordenada por evidência:
    // ligadas à música → com gasto pago nos últimos 30 dias → mais recentes.
    const ordenadas = [...posts].sort((a: Any, b: Any) => {
      const ligA = a?.song_id === songId ? 1 : 0;
      const ligB = b?.song_id === songId ? 1 : 0;
      if (ligA !== ligB) return ligB - ligA;
      const gA = Number(a?.spend_30d_cents ?? 0);
      const gB = Number(b?.spend_30d_cents ?? 0);
      if (gA !== gB) return gB - gA;
      return Date.parse(b?.published_at ?? 0) - Date.parse(a?.published_at ?? 0);
    });
    videosLigadosMusica = posts.filter((p: Any) => p?.song_id === songId).length;
    posts = ordenadas.slice(0, MAX_POSTS_META);
  }
  const postRefsOk = new Set(posts.map((p: Any) => String(p.post_ref)));

  // Resolução de ids devolvidos pelo modelo (NÃO relaxa a validação: só aceita
  // ids que identifiquem sem ambiguidade UMA publicação da lista permitida).
  // O post_ref de object_story é "<page_id>_<post_id>"; o modelo devolve às
  // vezes só o segundo segmento. Essa chave é aceite quando aponta para uma só
  // publicação; se for ambígua ou desconhecida, o anúncio é descartado.
  const refExactas = new Set(postRefsOk);
  const refIndex = new Map<string, string>();
  const refAmbiguas = new Set<string>();
  for (const ref of refExactas) refIndex.set(ref, ref);
  for (const ref of refExactas) {
    if (!ref.includes("_")) continue;
    for (const parte of ref.split("_")) {
      if (!parte || refExactas.has(parte)) continue;
      const jaTem = refIndex.get(parte);
      if (jaTem && jaTem !== ref) { refAmbiguas.add(parte); continue; }
      refIndex.set(parte, ref);
    }
  }
  function resolverRef(v: unknown): string | null {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s || refAmbiguas.has(s)) return null;
    return refIndex.get(s) ?? null;
  }


  // ── 1c) ANÁLISE DOS VÍDEOS ORGÂNICOS (D-ERP107 TikTok / D-ERP108 YouTube).
  const analiseVideos = eVideo
    ? await analisarVideosTiktok(user, {
      artistId,
      songId,
      dias: 180,
      platform: eGoogle ? "youtube" : "tiktok",
    })
    : null;
  if (analiseVideos) avisos.push(...analiseVideos.avisos);

  // Estados brasileiros para validar os nomes de geo_regions (TikTok e Google).
  let estadosBr: { nome: string; uf: string }[] = [];
  if (eVideo) {
    const { data: ests, error: estErr } = await user.from("br_estados").select("nome, uf");
    if (estErr) avisos.push(`br_estados indisponível (${estErr.message}) — nomes de estado não validados`);
    estadosBr = (ests ?? []) as { nome: string; uf: string }[];
  }

  // Teto da ligação pedida
  const cap: Any = dados.blocos.teto?.ligacao ?? null;
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

  const DIAS_JANELA: number = historicoPago.janela_dias ?? 90;
  const periodoMin: string | null = historicoPago.periodo?.de ?? null;
  const periodoMax: string | null = historicoPago.periodo?.a ?? null;
  const ultimoSync: string | null = historicoPago.ultima_atualizacao ?? null;
  const campanhasPagas: Any[] = historicoPago.campanhas ?? [];
  const anuncios: Any[] = historicoPago.anuncios ?? [];
  const totais90d: Any = historicoPago.totais_90d ?? { gasto: 0, impressoes: 0, cliques: 0, video_views: 0 };
  const porEstado: Any = audiencia.por_estado ?? {};
  const porTipo: Any = audiencia.por_tipo ?? {};
  const demografiaOrganica = {
    _fonte:
      "secundária — demografia ORGÂNICA do Instagram (public.artist_audience_demographics). NÃO é desempenho pago.",
    periodo: audiencia.periodo_demografia ?? null,
    linhas: audiencia.linhas_demografia ?? [],
  };
  for (const f of (historicoPago.dados_em_falta ?? [])) avisos.push(`dado em falta: ${f}`);

  const alvoDiario = orcamentoPedido != null && orcamentoPedido > 0
    ? Math.min(orcamentoPedido, disponivel)
    : disponivel;
  if (orcamentoPedido != null && orcamentoPedido > disponivel) {
    avisos.push(
      `orçamento pedido ${orcamentoPedido} acima do disponível ${disponivel} ${cap.account_currency ?? ""} — usado o disponível`,
    );
  }

  const listaPosts = posts.map((p: Any) => ({
    post_ref: p.post_ref,
    kind: p.post_kind,
    origem: p.source,
    permalink: p.permalink,
    legenda: p.caption_excerpt,
    publicado_em: p.published_at,
    ultimo_anuncio: p.last_ad_name,
    gasto_30d_cents: p.spend_30d_cents,
    ...(eVideo ? { song_id: p.song_id ?? null, ligado_a_musica: p.song_id === songId } : {}),
  }));

  const blocoAnalise = analiseVideos
    ? {
      _fonte: analiseVideos.fonte.fonte,
      periodo: analiseVideos.fonte.periodo,
      data_mais_recente: analiseVideos.fonte.data_mais_recente,
      series_diarias: analiseVideos.fonte.series_diarias,
      totais: analiseVideos.totais,
      top_15_views: analiseVideos.top_15_views,
      top_10_interacao: analiseVideos.top_10_interacao,
      top_10_crescimento_7d: analiseVideos.top_10_crescimento_7d,
      videos_da_musica: analiseVideos.videos_da_musica,
      padroes: analiseVideos.padroes,
    }
    : null;

  const entradas = {
    plataforma,
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
    ...(eVideo ? { videos_promoviveis: listaPosts } : { publicacoes_promoviveis: listaPosts }),
    ...(blocoAnalise
      ? (eGoogle ? { analise_videos_youtube: blocoAnalise } : { analise_videos_tiktok: blocoAnalise })
      : {}),
    desempenho_pago: {
      _fonte: "primária — RPCs public.artist_ads_daily(90) + artist_ads_campaigns + artist_ads_ads",
      periodo: { de: periodoMin, a: periodoMax, dias_pedidos: DIAS_JANELA },
      ultima_atualizacao: ultimoSync,
      totais_90d: totais90d,
      campanhas: campanhasPagas,
      anuncios: anuncios,
      dados_em_falta: historicoPago.dados_em_falta ?? [],
    },
    demografia_organica_instagram: demografiaOrganica,
    historico_pago: historicoPago,
    audiencia,
    geografia_por_uf: geografiaPorUf,
    canais: dados.blocos.canais,
    criativos_anunciaveis: dados.blocos.criativos,


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

  // ── 7) LLM (prompt de sistema próprio nos alvos TikTok e YouTube)
  if (eTiktok) {
    avisos.push("sem histórico pago TikTok; hipótese sustentada em orgânico TikTok + pago Meta/Google");
  }
  const llm = await callLlm(
    `Dados (única fonte de números permitida):\n\n${JSON.stringify(entradas)}`,
    eGoogle ? SYSTEM_PROMPT_GOOGLE : eTiktok ? SYSTEM_PROMPT_TIKTOK : SYSTEM_PROMPT,
  );
  if ("fail" in llm && llm.fail) return llm.fail;
  const plano: Any = llm.plano ?? {};

  // ── 8) Normalização determinística (não confiar na saída do modelo)
  const objetivosOk = eGoogle ? OBJETIVOS_GOOGLE : eTiktok ? OBJETIVOS_TIKTOK : OBJETIVOS;
  const objetivoOmissao = eVideo ? "VIDEO_VIEWS" : "AWARENESS";
  let objetivo = String(plano.objetivo ?? "").toUpperCase();
  if (!objetivosOk.includes(objetivo)) {
    avisos.push(
      `objetivo "${plano.objetivo ?? ""}" fora de ${objetivosOk.join("/")} — usado ${objetivoOmissao}`,
    );
    objetivo = objetivoOmissao;
  }
  if (objetivo === "TRAFFIC" && !smartLink && !String(plano.link_destino ?? "").startsWith("https://")) {
    avisos.push(`Tráfego sem link https disponível — objetivo trocado para ${objetivoOmissao}`);
    objetivo = objetivoOmissao;
  }
  plano.objetivo = objetivo;
  plano.plataforma = plataforma;
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

    // Estados. No Meta → geo_regions [{nome, key}] com a chave resolvida na Meta.
    // No TikTok/Google → geo_regions é LISTA DE NOMES; os location_ids (TikTok) e
    // os geoTargetConstants (Google) são resolvidos no motor de publicação.
    const estadosBrutos: Any[] = Array.isArray(pub.estados)
      ? pub.estados
      : (Array.isArray(pub.geo_regions) ? pub.geo_regions.map((r: Any) => r?.nome ?? r) : []);
    const nomes = estadosBrutos
      .map((e) => (typeof e === "string" ? e.trim() : ""))
      .filter((e) => e.length > 2);
    delete pub.estados;
    delete pub.geo_regions;
    if (nomes.length > 0) {
      if (eVideo) {
        // Nomes validados contra public.br_estados (comparação sem acentos); o
        // motor de publicação resolve as chaves da plataforma a partir do nome.
        const unicos: string[] = [];
        for (const nome of nomes) {
          const oficial = estadosBr.length === 0 ? nome : estadoOficial(nome, estadosBr);
          if (!oficial) {
            avisos.push(
              `geo_regiao_nao_resolvida: conjunto "${a.trigger_nome ?? "?"}" pedia o estado "${nome}" — não existe em br_estados e ficou fora`,
            );
            continue;
          }
          if (!unicos.includes(oficial)) unicos.push(oficial);
        }
        if (unicos.length > 0) pub.geo_regions = unicos;
      } else {
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
    }



    if (!Number.isFinite(pub.idade_min)) pub.idade_min = 18;
    if (!Number.isFinite(pub.idade_max)) pub.idade_max = 65;

    // anúncios: só publicações/vídeos realmente promovíveis; nunca inventar ref
    const lista = Array.isArray(a.anuncios) ? a.anuncios : [];
    const validos: Any[] = [];
    for (const an of lista) {
      if (eVideo) {
        const campoId = eGoogle ? "youtube_video_id" : "tiktok_video_id";
        const vid = an?.[campoId] ?? an?.tiktok_video_id ?? an?.youtube_video_id ?? an?.video_id ?? an?.post_ref;
        if (typeof vid !== "string" || !postRefsOk.has(vid)) {
          avisos.push(
            `conjunto "${a.trigger_nome ?? "?"}": vídeo ${vid ?? `(sem ${campoId})`} não está na lista de vídeos promovíveis — anúncio descartado`,
          );
          continue;
        }
        const porque = typeof an?.porque === "string" ? an.porque : null;
        validos.push({ [campoId]: vid, ...(porque ? { porque } : {}) });
      } else {
        const ref = an?.existing_post?.post_ref;
        if (typeof ref !== "string" || !postRefsOk.has(ref)) {
          avisos.push(`conjunto "${a.trigger_nome ?? "?"}": publicação ${ref ?? "(sem post_ref)"} não é promovível — anúncio descartado`);
          continue;
        }
        const kind = an.existing_post.kind === "instagram_media" ? "instagram_media" : "object_story";
        validos.push({ ...an, existing_post: { post_ref: ref, kind } });
      }
      if (validos.length >= 1) break; // um anúncio por conjunto
    }
    a.anuncios = validos;
    a.orcamento_cents = Math.max(0, Math.round(Number(a.orcamento_cents ?? 0)));
  }

  adsets = adsets.filter((a) => (a.anuncios ?? []).length > 0);
  if (adsets.length === 0) {
    return json({
      error: "plano_invalido",
      mensagem: eVideo
        ? "O plano gerado ficou sem conjuntos com vídeo promovível."
        : "O plano gerado ficou sem conjuntos com publicação promovível.",
      avisos,
    }, 422);
  }

  // orçamento: mínimo por conjunto e corte proporcional ao alvo/disponível
  const minDiario = eTiktok ? MIN_DAILY_CENTS_TIKTOK : eGoogle ? MIN_DAILY_CENTS_GOOGLE : MIN_DAILY_CENTS;
  const minCents = minDiario * (end ? dias : 1);
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

  // FONTES: cada bloco do snapshot único com fonte, período e data mais recente.
  const fontes = analiseVideos
    ? [...dados.fontes, { bloco: eGoogle ? "analise_videos_youtube" : "analise_videos_tiktok", ...analiseVideos.fonte }]
    : dados.fontes;

  plano.resumo = {
    origem: "llm",
    modelo: MODEL,
    gerado_em: new Date().toISOString(),
    tokens: llm.tokens ?? null,
    entradas_usadas: {
      plataforma,
      snapshot_da_musica: snapshotMusica != null,
      relatorio_de_lancamento: relatorio?.gerado_em ?? null,
      publicacoes_promoviveis: posts.length,
      videos_promoviveis: eVideo
        ? { total: posts.length, ligados_a_musica: videosLigadosMusica }
        : null,
      videos_analisados: analiseVideos?.totais.videos_analisados ?? null,
      videos_ligados_a_musica: analiseVideos?.totais.videos_ligados_a_musica ?? videosLigadosMusica,
      series_diarias: analiseVideos?.fonte.series_diarias ?? null,
      series_diarias_tiktok: eTiktok ? (analiseVideos?.fonte.series_diarias ?? null) : null,
      campanhas_com_gasto_90d: campanhasPagas.length,
      anuncios_com_gasto: anuncios.length,
      dias_de_diario_90d: campanhasPagas.reduce((s: number, c: Any) => s + Number(c.dias_com_gasto ?? 0), 0),
      estados_na_geografia_unificada: (geografiaPorUf?.por_uf ?? []).length,
      criativos_anunciaveis: (dados.blocos.criativos ?? []).length,
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
  //
  // public.artist_ads_plan_validate aceita AWARENESS/TRAFFIC/ENGAGEMENT (Meta) e
  // REACH/VIDEO_VIEWS/TRAFFIC (TikTok e Google — D-ERP107/108). A RPC não é
  // alterada por esta função.
  {
    const { error: valErr } = await user.rpc("artist_ads_plan_validate", {
      p_plan: plano,
      p_smart_link: smartLink,
    });
    if (valErr) {
      return json({ error: "plano_invalido", mensagem: valErr.message, plano }, 422);
    }
  }

  const { data: planId, error: createErr } = await user.rpc("artist_ads_plan_create", {
    p_artist_id: artistId,
    p_song_id: songId,
    p_connection_id: connectionId,
    p_plan: plano,
    p_platform: plataforma,
  });
  if (createErr) {
    const msg = createErr.message ?? "";
    // artist_ads_plan_create chama artist_ads_plan_validate por dentro. Desde a
    // DDL de D-ERP107/108 essa RPC aceita REACH e VIDEO_VIEWS; se ainda recusar,
    // o erro é identificável em vez de mascarado (a RPC não é alterada aqui).
    if ((eTiktok || eGoogle) && /objetivo inv[áa]lido/i.test(msg)) {
      return json({
        error: eTiktok ? "rpc_objetivo_tiktok_nao_aceite" : "rpc_objetivo_google_nao_aceite",
        mensagem:
          `public.artist_ads_plan_validate (chamada dentro de artist_ads_plan_create) recusa o objetivo ${objetivo}. Falta a DDL que aceite REACH e VIDEO_VIEWS.`,
        plano,
      }, 422);
    }
    const status = /permiss|42501|papel|autoriza/i.test(msg) ? 403 : 422;
    return json({ error: status === 403 ? "sem_permissao" : "plano_invalido", mensagem: msg, plano }, status);
  }

  console.log(`[${FUNCTION_NAME}] plano ${planId} criado em rascunho para música ${songId}`);
  return json({ plan_id: planId, plano, resumo: plano.resumo });
});
