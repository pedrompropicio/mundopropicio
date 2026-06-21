// crm-validate-creative-messages
// POST { company_id, event_id, creative_ids: uuid[] }
// → valida a copy de cada criativo contra os gatilhos ACTIVOS e DISPONÍVEIS
//   do evento (Camada 1). LLM apenas faz linguagem; selecção de gatilhos é
//   100% determinística. Faz upsert em crm.creative_message_validation
//   (uma linha por creative_id+event_id).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const MODEL = "google/gemini-2.5-flash";

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
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

type ActiveTrigger = {
  id: string;
  trigger_id: string;
  estado: string;
  validade: string | null;
  detalhe: string | null;
  nome: string;
  tipo: string;
  descricao: string | null;
  carrega_afirmacao_factual: boolean;
};

type Creative = {
  id: string;
  name: string | null;
  headline: string | null;
  body: string | null;
  cta_type: string | null;
};

function buildPrompt(creative: Creative, available: ActiveTrigger[], expired: ActiveTrigger[]): string {
  const availableLines = available.length === 0
    ? "(nenhum gatilho activo e dentro de validade)"
    : available.map((g) => `- [${g.tipo}] ${g.nome}${g.carrega_afirmacao_factual ? " (factual)" : ""}: ${g.descricao ?? ""}${g.detalhe ? ` | detalhe: ${g.detalhe}` : ""}${g.validade ? ` | válido até ${g.validade}` : ""}`).join("\n");
  const expiredLines = expired.length === 0
    ? "(nenhum)"
    : expired.map((g) => `- [${g.tipo}] ${g.nome}${g.validade ? ` (expirou ${g.validade})` : " (marcado expirado)"}`).join("\n");

  return `⚠️ IDIOMA OBRIGATÓRIO: TODOS os campos textuais da resposta JSON em PORTUGUÊS (PT-PT, com tolerância PT-BR se ambíguo).

És um validador de mensagem de criativos publicitários. NUNCA decides nem afirmas um facto comercial — os factos vêm exclusivamente da lista de "gatilhos activos disponíveis" abaixo, declarados manualmente pelo gestor. Tu apenas LÊS a copy do criativo, COMPARAS com esses gatilhos, e emites um veredicto sobre coerência da MENSAGEM.

REGRAS DURAS (não negociáveis):
1. "contradiz" — quando a copy faz uma alegação (urgência, escassez, prazo, virada de lote, contagem regressiva, últimas unidades, etc.) que NENHUM gatilho activo disponível respalda, OU que um gatilho na lista de EXPIRADOS contradiz directamente.
2. "coerente" — quando a copy não contradiz nada. Dentro de coerente:
   - aproveita_gatilhos=true se a copy usa pelo menos um gatilho activo disponível.
   - aproveita_gatilhos=false se é copy genérica (ex.: "Garante o teu bilhete") que não aciona nenhum gatilho activo. Nesse caso, a explicação DEVE assinalar a OPORTUNIDADE perdida ("não aproveita o gatilho X que está activo").
3. "atencao" — coerência parcial ou ambígua (ex.: alegação suportada apenas parcialmente, ou interpretação dúbia).
4. sugestao_copy — SÓ podes propor reformulações que se apoiem nos gatilhos ACTIVOS DISPONÍVEIS. NUNCA introduzir uma alegação nova que não tenha gatilho activo a respaldá-la (não trocar uma alegação não-respaldada por outra inventada). Se não houver gatilho activo que justifique mudar, sugestao_copy deve ser null.
5. NUNCA inventar factos comerciais próprios. Se a lista de gatilhos disponíveis estiver vazia, qualquer alegação factual na copy é "contradiz".

CONTEXTO DO CRIATIVO:
- Nome interno: ${creative.name ?? "(sem nome)"}
- Headline: ${creative.headline ?? "(vazio)"}
- Body: ${creative.body ?? "(vazio)"}
- CTA: ${creative.cta_type ?? "(vazio)"}

GATILHOS ACTIVOS DISPONÍVEIS (factos respaldados):
${availableLines}

GATILHOS EXPIRADOS / FORA DE VALIDADE (NÃO respaldam nada; contradizem alegações associadas):
${expiredLines}

Responde APENAS com JSON puro (sem markdown fences), com este shape exacto:

{
  "semaforo": "coerente" | "atencao" | "contradiz",
  "aproveita_gatilhos": true | false,
  "explicacao": "1-2 frases em PT, justificando o semáforo e (se coerente sem aproveitar) assinalando a oportunidade perdida",
  "sugestao_copy": "reformulação curta apoiada em gatilhos disponíveis, OU null se nada a sugerir"
}`;
}

async function callGeminiText(prompt: string): Promise<string> {
  const doCall = async () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
  });

  let resp = await doCall();
  if (resp.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    resp = await doCall();
  }
  if (resp.status === 429) throw new Error("rate_limited");
  if (resp.status === 402) throw new Error("credits_exhausted");
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ai_gateway_error:${resp.status}:${t.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[validate-messages] BUILD_VERSION=validate-messages-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

  let body: { company_id?: string; event_id?: string; creative_ids?: string[] };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { company_id, event_id, creative_ids } = body;
  if (!company_id || !event_id || !Array.isArray(creative_ids) || creative_ids.length === 0) {
    return json({ error: "missing_params", message: "company_id, event_id e creative_ids[] obrigatórios" }, 400);
  }

  // Cliente do utilizador — valida pertença ao company via RLS (current_company_id)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validação de pertença: leitura RLS-protegida ao próprio company devolve linhas só se for o company do user (ou service_role).
  // Para isolar simples, lemos o evento via RLS:
  const { data: evRow, error: evErr } = await userClient
    .from("events")
    .select("id, company_id")
    .eq("id", event_id)
    .maybeSingle();
  if (evErr) return json({ error: "db_error", detail: evErr.message }, 500);
  if (!evRow || evRow.company_id !== company_id) {
    return json({ error: "forbidden", message: "evento não pertence ao company_id indicado ou sem acesso" }, 403);
  }

  // Cliente service_role para escritas + leitura de schema crm
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Lê todos os gatilhos do evento + join catálogo
  const { data: triggers, error: trErr } = await (adminClient as any)
    .schema("crm")
    .from("event_active_triggers")
    .select("id, trigger_id, estado, validade, detalhe, strategic_trigger_catalog!inner(nome, tipo, descricao, carrega_afirmacao_factual, company_id)")
    .eq("event_id", event_id)
    .eq("company_id", company_id);
  if (trErr) return json({ error: "triggers_read_failed", detail: trErr.message }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const normalize = (rows: any[]): ActiveTrigger[] => (rows ?? []).map((r) => ({
    id: r.id,
    trigger_id: r.trigger_id,
    estado: r.estado,
    validade: r.validade,
    detalhe: r.detalhe,
    nome: r.strategic_trigger_catalog?.nome ?? "",
    tipo: r.strategic_trigger_catalog?.tipo ?? "",
    descricao: r.strategic_trigger_catalog?.descricao ?? null,
    carrega_afirmacao_factual: !!r.strategic_trigger_catalog?.carrega_afirmacao_factual,
  }));

  const all = normalize(triggers as any[]);
  const available = all.filter((g) => g.estado === "activo" && (!g.validade || g.validade >= today));
  const expired = all.filter((g) => g.estado === "expirado" || (g.validade && g.validade < today));

  // 2) Lê os criativos pedidos (filtra por company via RLS-user)
  const { data: creatives, error: crErr } = await (userClient as any)
    .schema("crm")
    .from("meta_creatives")
    .select("id, name, headline, body, cta_type, company_id")
    .in("id", creative_ids);
  if (crErr) return json({ error: "creatives_read_failed", detail: crErr.message }, 500);

  const validCreatives = (creatives ?? []).filter((c: any) => c.company_id === company_id) as (Creative & { company_id: string })[];
  if (validCreatives.length === 0) return json({ error: "no_creatives_accessible" }, 404);

  // Snapshot determinístico dos gatilhos usados (só os disponíveis)
  const gatilhosSnapshot = {
    available: available.map((g) => ({
      trigger_id: g.trigger_id, nome: g.nome, tipo: g.tipo,
      carrega_afirmacao_factual: g.carrega_afirmacao_factual,
      validade: g.validade, detalhe: g.detalhe,
    })),
    expired: expired.map((g) => ({
      trigger_id: g.trigger_id, nome: g.nome, tipo: g.tipo, validade: g.validade,
    })),
    captured_at: new Date().toISOString(),
  };

  const results: any[] = [];
  for (const creative of validCreatives) {
    const prompt = buildPrompt(creative, available, expired);
    let parsed: { semaforo: string; aproveita_gatilhos: boolean; explicacao: string; sugestao_copy: string | null };
    try {
      const raw = await callGeminiText(prompt);
      parsed = JSON.parse(stripJsonFences(raw));
    } catch (e) {
      const msg = String(e);
      if (msg.includes("rate_limited")) return json({ error: "rate_limited", message: "Tenta novamente em alguns segundos." }, 429);
      if (msg.includes("credits_exhausted")) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);
      results.push({ creative_id: creative.id, error: msg.slice(0, 300) });
      continue;
    }

    // Sanitiza valores
    const semaforo = ["coerente", "atencao", "contradiz"].includes(parsed.semaforo) ? parsed.semaforo : "atencao";
    const aproveita = !!parsed.aproveita_gatilhos;
    const explicacao = typeof parsed.explicacao === "string" ? parsed.explicacao.slice(0, 2000) : null;
    const sugestao = typeof parsed.sugestao_copy === "string" && parsed.sugestao_copy.trim() ? parsed.sugestao_copy.slice(0, 2000) : null;

    const validatedAt = new Date().toISOString();
    const { data: upserted, error: upErr } = await (adminClient as any)
      .schema("crm")
      .from("creative_message_validation")
      .upsert({
        company_id,
        event_id,
        creative_id: creative.id,
        semaforo,
        aproveita_gatilhos: aproveita,
        explicacao,
        sugestao_copy: sugestao,
        gatilhos_snapshot: gatilhosSnapshot,
        analysis_model: MODEL,
        validated_at: validatedAt,
      }, { onConflict: "creative_id,event_id" })
      .select()
      .maybeSingle();

    if (upErr) {
      results.push({ creative_id: creative.id, error: `persist_failed:${upErr.message}` });
      continue;
    }

    results.push({
      creative_id: creative.id,
      semaforo,
      aproveita_gatilhos: aproveita,
      explicacao,
      sugestao_copy: sugestao,
      validated_at: validatedAt,
      row: upserted,
    });
  }

  return json({
    event_id,
    company_id,
    analysis_model: MODEL,
    triggers_available_count: available.length,
    triggers_expired_count: expired.length,
    results,
  });
});
