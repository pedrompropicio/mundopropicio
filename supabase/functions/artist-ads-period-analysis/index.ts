// artist-ads-period-analysis — leitura em texto do relatório de tráfego pago por período.
//
// POST { artist_id: uuid, from: 'AAAA-MM-DD', to: 'AAAA-MM-DD' }
// Chama public.artist_ads_period_report COM O TOKEN DO UTILIZADOR (a RPC valida
// o acesso ao artista) e pede ao modelo um texto no padrão do artist-song-report:
// só números do JSON, inteiros pt-BR, data em cada número, nunca causalidade entre
// tráfego e música (só coincidência temporal). Fase 1: não grava nada.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MODEL = "google/gemini-2.5-flash";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SYSTEM_PROMPT = `Você é analista de tráfego pago de um artista de música no Brasil. Leitor empresarial: número na mão, sem enfeite.

REGRAS ABSOLUTAS:
1. Só pode citar números que estão no JSON do relatório. PROIBIDO estimar, inferir, extrapolar ou trazer benchmarks de fora.
2. Se um dado é null ou não existe, escreva "sem dados". Nunca trate null como zero.
3. Todo número citado vem com a data ou o intervalo a que se refere (ex.: "R$ 635,19 de 25/09 a 28/09").
4. É PROIBIDO afirmar causalidade entre tráfego e a música (streams, ouvintes, UGC). Só pode dizer coincidência temporal: "no mesmo período", "a partir de DD/MM".
5. Quando a entrega de uma campanha parou (ultimo_dia anterior ao fim do período), diga-o explicitamente com a data.
6. Resultado: use resultado.nome/valor/custo e compare com meta.valor quando meta não for null ("custo R$ 0,0063 por view 6 s contra meta R$ 0,004"). Se resultado vier de fallback (fonte.resultado_origem começa por "fallback"), diga-o.
7. Vídeo: cada plataforma tem a sua definição (meta_3s, meta_thruplay, google_views, tiktok_2s, tiktok_6s). PROIBIDO somar ou comparar views de definições diferentes.
8. Alcance: só cite alcance_periodo se não for null. Nunca some alcances.
9. Formato pt-BR: contagens SEMPRE inteiras com ponto de milhar (106.438); dinheiro com vírgula decimal e 2 casas (R$ 3.075,31), exceto custos por resultado abaixo de R$ 0,10, que podem ter até 4 casas; percentuais com vírgula e 1 casa. Nunca abrevie ("mil", "mi").
10. Moeda: use a currency de cada campanha; totais em ref_currency.
11. Liste em "lacunas" do relatório o que for relevante como alerta; não invente alertas sem número.
12. "numeros_citados": uma entrada por número usado, no formato "<número> — <campo do JSON> — <data/intervalo>".
13. Português do Brasil.
14. Custo por resultado: resultado.custo usa só o gasto dos dias/grupos em que o resultado foi lido. Quando gasto_sem_medicao.valor > 0, diga que o custo exclui esse gasto e cite valor e dias (ex.: "custo calculado sem os R$ 244,68 de 25/09, dia sem leitura de views").
15. fonte.dias_sem_entrega = a campanha não entregou nesses dias (o sync correu); diga quando parou de entregar. fonte.dias_sem_leitura = o sync não leu esses dias; diga "sem dados", nunca "sem entrega".
16. Smart link: cite chegadas_eventos (carregamentos da página) sempre ao lado de visitantes_unicos_dia (IP anonimizado único por dia). Nunca chame "visitantes" às chegadas.
17. "cliques" = todos os cliques da plataforma; "cliques_link" = só cliques no link (Meta, action link_click; null = sem dados). Não os confunda nem some.`;

const TOOL = {
  type: "function",
  function: {
    name: "analise_periodo",
    description: "Leitura do relatório de tráfego pago por período.",
    parameters: {
      type: "object",
      properties: {
        resumo: { type: "string" },
        por_plataforma: {
          type: "array",
          items: {
            type: "object",
            properties: { platform: { type: "string", enum: ["meta", "google", "tiktok"] }, leitura: { type: "string" } },
            required: ["platform", "leitura"],
            additionalProperties: false,
          },
        },
        alertas: { type: "array", items: { type: "string" } },
        numeros_citados: { type: "array", items: { type: "string" } },
      },
      required: ["resumo", "por_plataforma", "alertas", "numeros_citados"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "sessão obrigatória" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u, error: uErr } = await userClient.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "token inválido" }, 401);

  let body: { artist_id?: string; from?: string; to?: string };
  try { body = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  const artistId = String(body.artist_id ?? "");
  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  if (!UUID.test(artistId)) return json({ error: "artist_id inválido" }, 400);
  if (!DATE.test(from) || !DATE.test(to) || to < from) return json({ error: "período inválido (from/to AAAA-MM-DD)" }, 400);

  const { data: report, error: rErr } = await userClient.rpc("artist_ads_period_report", {
    p_artist_id: artistId, p_from: from, p_to: to,
  });
  if (rErr) return json({ error: rErr.message, code: rErr.code ?? null }, rErr.code === "42501" ? 403 : 400);

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return json({ error: "lovable_ai_not_configured" }, 500);

  const payload = {
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Relatório (única fonte de números permitida):\n\n${JSON.stringify(report)}` },
    ],
    tools: [TOOL],
    tool_choice: { type: "function", function: { name: "analise_periodo" } },
  };
  const call = () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let resp = await call();
  if (resp.status === 429) { await new Promise((r) => setTimeout(r, 1500)); resp = await call(); }
  if (resp.status === 429) return json({ error: "rate_limited", message: "Lovable AI com limite de pedidos; tenta daqui a pouco." }, 429);
  if (resp.status === 402) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);
  if (!resp.ok) return json({ error: "ai_gateway_error", message: `HTTP ${resp.status} — ${(await resp.text()).slice(0, 400)}` }, 502);

  const data = await resp.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return json({ error: "ai_invalid_response" }, 502);
  let out: unknown;
  try { out = JSON.parse(args); } catch { return json({ error: "ai_invalid_json" }, 502); }

  return json({
    ...(out as Record<string, unknown>),
    model: MODEL,
    periodo: { de: from, ate: to },
    tokens_in: data?.usage?.prompt_tokens ?? null,
    tokens_out: data?.usage?.completion_tokens ?? null,
  });
});
