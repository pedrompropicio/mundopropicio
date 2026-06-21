// crm-validate-design-text
// POST { company_id, assembly_id, headline, corpo, cta }
// → Re-valida UM texto livre (editado pelo gestor no Estúdio de Desenho)
//   contra os gatilhos activos do evento ligado à assembly.
// Espelha as REGRAS do prompt de crm-campaign-design-generate, em particular
// a regra dura de urgência temporal (só com calendário/contagem regressiva).
// NÃO persiste — só devolve o veredicto { semaforo, aproveita_gatilhos, explicacao }.

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

function stripJsonFences(t: string): string {
  let s = t.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return s.trim();
}

type Trigger = {
  trigger_id: string;
  nome: string;
  tipo: string;
  descricao: string | null;
  detalhe: string | null;
  validade: string | null;
  carrega_afirmacao_factual: boolean;
};

function fmtTriggerLines(list: Trigger[]): string {
  if (list.length === 0) return "(nenhum)";
  return list.map((g) =>
    `- [${g.tipo}] ${g.nome}${g.carrega_afirmacao_factual ? " (factual)" : ""}: ${g.descricao ?? ""}` +
    `${g.detalhe ? ` | detalhe: ${g.detalhe}` : ""}${g.validade ? ` | válido até ${g.validade}` : ""}`
  ).join("\n");
}

function buildPrompt(args: {
  headline: string;
  corpo: string;
  cta: string;
  allAvailable: Trigger[];
  allExpired: Trigger[];
  hasTime: boolean;
}): string {
  const { headline, corpo, cta, allAvailable, allExpired, hasTime } = args;
  return `⚠️ IDIOMA OBRIGATÓRIO: responde em PORTUGUÊS (PT-PT).

Estás a VALIDAR um texto de anúncio editado por um gestor humano contra os gatilhos estratégicos activos do evento. NÃO escreves novo texto — só classificas o que recebes.

REGRAS DURAS (idênticas às da geração):
1. Só é coerente afirmar o que um gatilho ACTIVO DISPONÍVEL respalda.
2. URGÊNCIA TEMPORAL (alegações de tempo imediato — "hoje", "agora", "últimas horas", "termina já", "acaba hoje", "só até hoje", contagens regressivas): SÓ é permitida se houver um gatilho activo do tipo 'calendario' OU 'contagem_regressiva' dentro de validade. ${hasTime ? "Há gatilho temporal disponível: o texto pode usar urgência temporal." : "NÃO há gatilho temporal disponível: qualquer urgência temporal no texto é 'contradiz'."}
3. Um gatilho de 'escassez' (ex.: "Mudança de lote") autoriza falar de subida de preço / virada de lote, mas NÃO autoriza horas/hoje.
4. Inventar factos comerciais (preços, datas concretas, lugares) que não estejam nos gatilhos = contradiz.
5. Afirmar algo que um gatilho EXPIRADO contradiz = contradiz.

CLASSIFICAÇÃO (semáforo):
- "contradiz" — viola alguma regra acima, ou faz alegação sem respaldo, ou contra um expirado.
- "coerente" + aproveita_gatilhos=true — usa pelo menos um gatilho activo disponível.
- "coerente" + aproveita_gatilhos=false — texto genérico, não aciona gatilho mas não contradiz.
- "atencao" — coerência parcial / ambígua / risco moderado.

TEXTO A VALIDAR:
- headline: ${headline || "(vazio)"}
- corpo: ${corpo || "(vazio)"}
- cta: ${cta || "(vazio)"}

GATILHOS ACTIVOS DISPONÍVEIS DO EVENTO (factos respaldados):
${fmtTriggerLines(allAvailable)}

GATILHOS EXPIRADOS / FORA DE VALIDADE (NÃO respaldam — contradizem alegações associadas):
${fmtTriggerLines(allExpired)}

Responde APENAS com JSON puro (sem markdown fences), com este shape exacto:
{
  "semaforo": "coerente" | "atencao" | "contradiz",
  "aproveita_gatilhos": true | false,
  "explicacao": "1-2 frases PT-PT justificando segundo as regras"
}`;
}

async function callGeminiText(prompt: string, temperature: number): Promise<string> {
  const doCall = async () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature,
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
  console.log("[validate-design-text] BUILD_VERSION=validate-design-text-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);
  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

  let body: { company_id?: string; assembly_id?: string; headline?: string; corpo?: string; cta?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { company_id, assembly_id } = body;
  const headline = (body.headline ?? "").toString();
  const corpo = (body.corpo ?? "").toString();
  const cta = (body.cta ?? "").toString();
  if (!company_id || !assembly_id) {
    return json({ error: "missing_params", message: "company_id e assembly_id obrigatórios" }, 400);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Lê assembly (event_id) via service_role + valida pertença
  const { data: asm, error: asmErr } = await (adminClient as any)
    .schema("crm").from("assisted_assembly")
    .select("id, company_id, event_id")
    .eq("id", assembly_id)
    .maybeSingle();
  if (asmErr) return json({ error: "assembly_read_failed", detail: asmErr.message }, 500);
  if (!asm) return json({ error: "assembly_not_found" }, 404);
  if (asm.company_id !== company_id) return json({ error: "forbidden", message: "assembly não pertence ao company_id" }, 403);

  // Valida pertença ao company via RLS do user (lê evento)
  const { data: evRow, error: evErr } = await userClient
    .from("events").select("id, company_id").eq("id", asm.event_id).maybeSingle();
  if (evErr) return json({ error: "db_error", detail: evErr.message }, 500);
  if (!evRow || evRow.company_id !== company_id) {
    return json({ error: "forbidden", message: "evento não pertence ao company_id indicado ou sem acesso" }, 403);
  }

  // 2) Lê gatilhos do evento + selecção determinística (igual ao motor)
  const { data: triggers, error: trErr } = await (adminClient as any)
    .schema("crm").from("event_active_triggers")
    .select("trigger_id, estado, validade, detalhe, strategic_trigger_catalog!inner(nome, tipo, descricao, carrega_afirmacao_factual, company_id)")
    .eq("event_id", asm.event_id)
    .eq("company_id", company_id);
  if (trErr) return json({ error: "triggers_read_failed", detail: trErr.message }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const all: Trigger[] = (triggers ?? []).map((r: any) => ({
    trigger_id: r.trigger_id,
    nome: r.strategic_trigger_catalog?.nome ?? "",
    tipo: r.strategic_trigger_catalog?.tipo ?? "",
    descricao: r.strategic_trigger_catalog?.descricao ?? null,
    detalhe: r.detalhe,
    validade: r.validade,
    carrega_afirmacao_factual: !!r.strategic_trigger_catalog?.carrega_afirmacao_factual,
    estado: r.estado,
  } as any));
  const allAvailable = all.filter((g: any) => g.estado === "activo" && (!g.validade || g.validade >= today));
  const allExpired = all.filter((g: any) => g.estado === "expirado" || (g.validade && g.validade < today));
  const hasTime = allAvailable.some((g) => g.tipo === "calendario" || g.tipo === "contagem_regressiva");

  // 3) LLM (temperature baixa — é validação, não geração)
  try {
    const prompt = buildPrompt({ headline, corpo, cta, allAvailable, allExpired, hasTime });
    const raw = await callGeminiText(prompt, 0.1);
    const parsed = JSON.parse(stripJsonFences(raw));
    const semaforo = ["coerente", "atencao", "contradiz"].includes(parsed?.semaforo) ? parsed.semaforo : "atencao";
    return json({
      semaforo,
      aproveita_gatilhos: !!parsed?.aproveita_gatilhos,
      explicacao: typeof parsed?.explicacao === "string" ? parsed.explicacao.slice(0, 1000) : "",
    });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("rate_limited")) return json({ error: "rate_limited", message: "Tenta novamente em alguns segundos." }, 429);
    if (msg.includes("credits_exhausted")) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);
    return json({ error: "validate_failed", detail: msg.slice(0, 300) }, 500);
  }
});
