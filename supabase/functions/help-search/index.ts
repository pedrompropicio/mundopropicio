import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { z } from "npm:zod@3.23.8";

const EMBED_MODEL = "google/gemini-embedding-2";
const ANSWER_MODEL = "google/gemini-2.5-flash";
// Calibração medida em Live, só por leitura, antes dos termos: rateio de hotel
// 0,7322; rateio de turnê 0,7110; SAF-T 0,6110 (tem de continuar a falhar).
// Baixado 0,65 -> 0,64 para dar margem às perguntas curtas em calão
// ("rateio day off"), mantendo folga sobre o SAF-T. Voltar a medir depois do
// primeiro sync com termos e ajustar se alguma das 5 perguntas de aceitação
// falhar.
const MIN_COSINE_SIMILARITY = 0.64;
const BodySchema = z.object({ question: z.string().trim().min(5).max(1000), route: z.string().trim().max(500).nullable().optional() });

type Chunk = { chunk_id: string; section_anchor: string; section_heading: string; article_slug: string; article_title: string; content: string; section_terms: string[] | null; score: number };
type Citation = { n: number; anchor_id: string; article_slug: string; heading: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

/**
 * Falhas de infra (RPC ou gateway AI) nunca devolvem 500 opaco: devolvem 200
 * com { error: 'search_unavailable', detail } para a UI mostrar "A pesquisa
 * está indisponível" (o detalhe só é visível a admin) e registam a mensagem
 * real no console da função.
 */
function unavailable(where: string, detail: string) {
  console.error(`[help-search] ${where}: ${detail}`);
  return json({ error: "search_unavailable", detail: `${where}: ${detail}` });
}

async function gatewayError(where: string, response: Response) {
  const body = await response.text().catch(() => "");
  const hint = response.status === 429
    ? "Demasiados pedidos. Tente novamente em instantes."
    : response.status === 402
      ? "Créditos AI esgotados. Contacte o administrador."
      : "Erro ao consultar a AI.";
  return unavailable(where, `${hint} (HTTP ${response.status}) ${body.slice(0, 500)}`.trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const aiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!url || !anonKey || !aiKey) return json({ error: "Configuração do servidor incompleta." }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado." }, 401);
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: claimsData, error: claimsError } = await client.auth.getClaims(token);
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (claimsError || !userId) return json({ error: "Token inválido." }, 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const { question, route } = parsed.data;

  const { data: roles, error: rolesError } = await client.from("user_roles").select("role").eq("user_id", userId);
  if (rolesError) return json({ error: "Não foi possível determinar o perfil." }, 500);
  const priority = ["platform_admin", "admin", "manager", "accountant", "marketing_manager", "content_manager", "editor", "producer", "field_producer", "partner", "viewer", "user"];
  const role = priority.find((candidate) => (roles ?? []).some((row) => row.role === candidate)) ?? "user";

  let embeddingResponse: Response;
  try {
    embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST", headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: question }),
    });
  } catch (caught) {
    return unavailable("embeddings", caught instanceof Error ? caught.message : String(caught));
  }
  if (!embeddingResponse.ok) return await gatewayError("embeddings", embeddingResponse);
  const embeddingData = await embeddingResponse.json().catch(() => null);
  const embedding = embeddingData?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 3072) {
    return unavailable("embeddings", `embedding inválido (dimensão ${Array.isArray(embedding) ? embedding.length : "n/a"})`);
  }

  const { data: found, error: searchError } = await client.rpc("help_search_chunks", {
    query_embedding: JSON.stringify(embedding), query_text: question, match_count: 8, user_profile: role,
  });
  if (searchError) return unavailable("help_search_chunks", `${searchError.message}${searchError.hint ? ` — ${searchError.hint}` : ""}`);
  const chunks = (found ?? []) as Chunk[];
  const bestSimilarity = Math.max(0, ...chunks.map((chunk) => Number(chunk.score) || 0));

  const record = async (result: { answered: boolean; confidence: "alta" | "media" | "baixa"; citations: Citation[] }) => {
    const { error } = await client.from("help_questions").insert({
      question, route: route ?? null, answered: result.answered, confidence: result.confidence,
      cited_anchor_ids: result.citations.map((citation) => citation.anchor_id), user_id: userId,
    });
    if (error) console.error("[help-search] question log", error);
  };

  if (chunks.length === 0 || bestSimilarity < MIN_COSINE_SIMILARITY) {
    const result = { answered: false, answer: "", citations: [] as Citation[], confidence: "baixa" as const };
    await record(result);
    return json(result);
  }

  const context = chunks
    .map((chunk, index) => {
      const terms = (chunk.section_terms ?? []).filter(Boolean);
      const vocab = terms.length > 0 ? `\nVocabulário da equipa: ${terms.join(", ")}` : "";
      return `[${index + 1}] ${chunk.article_title} › ${chunk.section_heading}${vocab}\n${chunk.content}`;
    })
    .join("\n\n");
  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ANSWER_MODEL,
      messages: [
        { role: "system", content: "Responde em português europeu e apenas com base nos pedaços fornecidos. Sê curto e usa passos quando for um procedimento. Cada frase factual termina com [n], apontando para o pedaço usado. Interpreta a pergunta pelo vocabulário da equipa indicado em cada pedaço (por exemplo, \"day off\" é o custo de dias sem show partilhado com promotores de outras cidades). Nunca inventes ecrãs ou botões. Nunca dês números, valores ou montantes: indica onde se consultam no sistema. Se os pedaços não responderem à pergunta, devolve answered=false. Usa sempre a função answer_help." },
        { role: "user", content: `Pergunta: ${question}\n\nPedaços do manual:\n${context}` },
      ],
      tools: [{ type: "function", function: { name: "answer_help", description: "Resposta fundamentada no manual.", parameters: { type: "object", properties: { answered: { type: "boolean" }, answer: { type: "string" }, citation_numbers: { type: "array", items: { type: "integer", minimum: 1, maximum: chunks.length } }, confidence: { type: "string", enum: ["alta", "media", "baixa"] } }, required: ["answered", "answer", "citation_numbers", "confidence"], additionalProperties: false } } }],
      tool_choice: { type: "function", function: { name: "answer_help" } },
    }),
  });
  if (!aiResponse.ok) return gatewayError(aiResponse.status);
  const aiData = await aiResponse.json();
  const args = aiData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return json({ error: "Resposta AI inválida." }, 500);
  const answer = JSON.parse(args) as { answered?: boolean; answer?: string; citation_numbers?: number[]; confidence?: "alta" | "media" | "baixa" };
  const citationNumbers = [...new Set((answer.citation_numbers ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= chunks.length))];
  const citations = citationNumbers.map((n) => ({ n, anchor_id: chunks[n - 1].section_anchor, article_slug: chunks[n - 1].article_slug, heading: chunks[n - 1].section_heading }));
  const answered = answer.answered === true && Boolean(answer.answer?.trim()) && citations.length > 0;
  const result = { answered, answer: answered ? answer.answer?.trim() ?? "" : "", citations: answered ? citations : [], confidence: answered ? answer.confidence ?? "media" : "baixa" as const };
  await record(result);
  return json(result);
});
