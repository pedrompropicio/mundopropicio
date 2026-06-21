// crm-assisted-assembly-narrate
// POST { company_id, assembly_id }
// → Recebe uma montagem JÁ CALCULADA (PARTE 1 — motor) e devolve uma explicação
//   curta por adset em PT-PT. NÃO recalcula nada. O LLM SÓ CITA os números
//   recebidos no input — nunca calcula, soma, arredonda nem deriva qualquer
//   número novo. A fonte da verdade dos números é a tabela crm.assisted_assembly.

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

type AdsetIn = {
  trigger_id: string | null;
  trigger_nome: string;
  trigger_tipo: string;
  creative_ids: string[];
  peso_pct: number;
  peso_origem: "roas" | "fallback_criativos";
  roas_agregado: number | null;
  dias_dados: number;
  conversoes: number;
  fiavel: boolean;
};

function buildPrompt(adset: AdsetIn): string {
  const n_criativos = adset.creative_ids?.length ?? 0;
  return `⚠️ IDIOMA OBRIGATÓRIO: responder em PORTUGUÊS (PT-PT).

És um redactor que justifica em 1-2 frases curtas o peso de investimento de UM adset numa montagem publicitária.

REGRAS DURAS (não negociáveis):
1. SÓ podes citar os NÚMEROS EXACTOS que estão no bloco "DADOS DO ADSET" abaixo. Esses são: peso_pct, roas_agregado, conversoes, dias_dados, n_criativos. NUNCA inventes, calcules, arredondes, somes ou derives outro número. Se um número não está no bloco, NÃO pode aparecer no texto.
2. Se peso_origem = "roas" (adset fiável): explica que leva este peso por ter convertido de forma consistente, citando roas_agregado (com "x" no fim) e conversoes (com a palavra "conversões").
3. Se peso_origem = "fallback_criativos" (adset imaturo ou fallback global): explica que o peso veio do NÚMERO DE CRIATIVOS (n_criativos) por ainda NÃO haver dados suficientes para confiar na performance. NUNCA apresentes o roas_agregado deste caso como se fosse fiável (mesmo que esteja preenchido, é imaturo — não o cites para justificar peso).
4. Linguagem honesta: nunca prometas resultados, nunca afirmes causalidade. Não uses superlativos vazios.
5. 1 ou 2 frases curtas. Sem emojis. Sem markdown. Sem fences.

DADOS DO ADSET (única fonte de números):
- trigger_nome: ${adset.trigger_nome}
- trigger_tipo: ${adset.trigger_tipo}
- peso_pct: ${adset.peso_pct}
- peso_origem: ${adset.peso_origem}
- roas_agregado: ${adset.roas_agregado ?? "null"}
- conversoes: ${adset.conversoes}
- dias_dados: ${adset.dias_dados}
- n_criativos: ${n_criativos}
- fiavel: ${adset.fiavel}

Responde APENAS com JSON puro (sem markdown fences), com este shape exacto:

{ "texto": "1-2 frases em PT-PT, citando apenas os números acima quando relevantes" }`;
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

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[assembly-narrate] BUILD_VERSION=assembly-narrate-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);
  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

  let body: { company_id?: string; assembly_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { company_id, assembly_id } = body;
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

  // 1) Lê a montagem (service_role) e o event_id para validar pertença via RLS user
  const { data: assemblyRow, error: aErr } = await (adminClient as any)
    .schema("crm")
    .from("assisted_assembly")
    .select("id, company_id, event_id, adsets")
    .eq("id", assembly_id)
    .maybeSingle();
  if (aErr) return json({ error: "assembly_read_failed", detail: aErr.message }, 500);
  if (!assemblyRow) return json({ error: "assembly_not_found" }, 404);
  if (assemblyRow.company_id !== company_id) {
    return json({ error: "forbidden", message: "montagem não pertence ao company_id" }, 403);
  }

  // Valida pertença ao company via RLS-user (lê o evento)
  const { data: evRow, error: evErr } = await userClient
    .from("events")
    .select("id, company_id")
    .eq("id", assemblyRow.event_id)
    .maybeSingle();
  if (evErr) return json({ error: "db_error", detail: evErr.message }, 500);
  if (!evRow || evRow.company_id !== company_id) {
    return json({ error: "forbidden", message: "evento não acessível" }, 403);
  }

  const adsets: AdsetIn[] = Array.isArray(assemblyRow.adsets) ? assemblyRow.adsets : [];
  const narrativas: { trigger_id: string | null; trigger_nome: string; texto: string }[] = [];

  for (const adset of adsets) {
    const prompt = buildPrompt(adset);
    let texto = "";
    try {
      const raw = await callGeminiText(prompt);
      const parsed = JSON.parse(stripJsonFences(raw));
      texto = typeof parsed?.texto === "string" ? parsed.texto.slice(0, 600) : "";
    } catch (e) {
      const msg = String(e);
      if (msg.includes("rate_limited")) return json({ error: "rate_limited", message: "Tenta novamente em alguns segundos." }, 429);
      if (msg.includes("credits_exhausted")) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);
      // Fallback determinístico (sem inventar números): só cita os do input.
      const n = adset.creative_ids?.length ?? 0;
      texto = adset.peso_origem === "roas"
        ? `Leva ${adset.peso_pct}% por ter convertido de forma consistente — ${adset.conversoes} conversões a ROAS ${adset.roas_agregado}x.`
        : `Peso de ${adset.peso_pct}% definido pelo número de criativos (${n}) por ainda não haver dados suficientes para confiar na performance.`;
    }
    narrativas.push({
      trigger_id: adset.trigger_id,
      trigger_nome: adset.trigger_nome,
      texto,
    });
  }

  return json({
    assembly_id,
    analysis_model: MODEL,
    narrativas,
  });
});
