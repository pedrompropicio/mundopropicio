// crm-campaign-design-generate
// POST { company_id, assembly_id }
// → veste a montagem (Camada 4) com textos + escolha de imagem por adset.
//   LLM gera 2-3 variações por adset E auto-classifica cada uma segundo a
//   MESMA lógica da Camada 2 (semáforo + aproveita_gatilhos + explicacao).
//   Selecção de gatilhos disponíveis/expirados é 100% determinística em código.
//   Pesos (peso_pct) vêm da Camada 4 e NÃO são recalculados aqui.

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

type Creative = {
  id: string;
  name: string | null;
  type: string | null;
  headline: string | null;
  body: string | null;
  cta_type: string | null;
  file_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  analysis_jsonb: any;
};

type AssemblyAdset = {
  trigger_id: string | null;
  trigger_nome: string;
  trigger_tipo: string;
  peso_pct: number;
  creative_ids: string[];
};

function fmtTriggerLines(list: Trigger[], kind: "available" | "expired"): string {
  if (list.length === 0) return kind === "available" ? "(nenhum)" : "(nenhum)";
  return list.map((g) =>
    `- [${g.tipo}] ${g.nome}${g.carrega_afirmacao_factual ? " (factual)" : ""}: ${g.descricao ?? ""}` +
    `${g.detalhe ? ` | detalhe: ${g.detalhe}` : ""}${g.validade ? ` | válido até ${g.validade}` : ""}`
  ).join("\n");
}

function buildAdsetPrompt(args: {
  adset: AssemblyAdset;
  adsetAvailable: Trigger[]; // gatilhos relevantes para ESTE adset (o do trigger_id se existir, senão todos)
  allAvailable: Trigger[];
  allExpired: Trigger[];
  pecas: Creative[];
}): string {
  const { adset, adsetAvailable, allAvailable, allExpired, pecas } = args;

  const hasTime = allAvailable.some((g) => g.tipo === "calendario" || g.tipo === "contagem_regressiva");
  const adsetTrigger = adsetAvailable.length > 0 ? adsetAvailable : [];

  const pecasBlock = pecas.map((c, i) =>
    `Peça ${i + 1} (creative_id=${c.id}):
  nome: ${c.name ?? "(sem nome)"}
  tipo: ${c.type ?? "?"} ${c.width ?? "?"}x${c.height ?? "?"}${c.duration_seconds ? ` ${c.duration_seconds}s` : ""}
  headline actual: ${c.headline ?? "(vazio)"}
  body actual: ${c.body ?? "(vazio)"}
  cta actual: ${c.cta_type ?? "(vazio)"}
  análise visual: ${c.analysis_jsonb ? JSON.stringify(c.analysis_jsonb).slice(0, 600) : "(sem análise)"}`
  ).join("\n\n");

  return `⚠️ IDIOMA OBRIGATÓRIO: TODOS os campos textuais da resposta JSON em PORTUGUÊS (PT-PT).

Estás a desenhar texto para UM adset de uma campanha publicitária. Para cada peça anexa um "motivo_escolha" curto (porque serve este adset) e geras 2 a 3 VARIAÇÕES de texto (headline + corpo + cta). Depois auto-classificas cada variação com semáforo de coerência com os gatilhos.

REGRAS DURAS (não negociáveis):
1. Só podes afirmar o que um gatilho ACTIVO DISPONÍVEL respalda. Lista abaixo.
2. URGÊNCIA TEMPORAL (alegações de tempo imediato — "hoje", "agora", "últimas horas", "termina já", "acaba hoje", "só até hoje", contagens regressivas): SÓ é permitida se houver um gatilho activo do tipo 'calendario' OU 'contagem_regressiva' dentro de validade. ${hasTime ? "Há gatilho temporal disponível: podes usar." : "NÃO há gatilho temporal disponível: PROIBIDO usar urgência temporal."}
3. Um gatilho de 'escassez' (ex.: "Mudança de lote") autoriza falar de subida de preço / virada de lote, mas NÃO autoriza falar de horas/hoje.
4. NUNCA inventes factos comerciais (preços, datas concretas, lugares) que não estejam nos gatilhos. Não cites números que não te foram dados.
5. CTAs válidos (Meta): SHOP_NOW, LEARN_MORE, GET_OFFER, BOOK_TRAVEL, SIGN_UP, SUBSCRIBE, CONTACT_US, GET_TICKETS. Escolhe o mais adequado.

AUTO-CLASSIFICAÇÃO de cada variação (semáforo, mesma lógica da Camada 2):
- "contradiz" — a variação faz uma alegação que NENHUM gatilho disponível respalda OU que um gatilho EXPIRADO contradiz OU viola a regra 2 (urgência temporal sem gatilho).
- "coerente" + aproveita_gatilhos=true — variação usa pelo menos um gatilho activo disponível do adset.
- "coerente" + aproveita_gatilhos=false — variação genérica que não aciona nenhum gatilho (ex.: "Garante o teu bilhete").
- "atencao" — coerência parcial / ambígua.

DADOS DO ADSET:
- trigger do adset: ${adset.trigger_nome} (${adset.trigger_tipo})
- peso desta adset na campanha: ${adset.peso_pct}% (informativo, não cites no texto do anúncio)
- gatilho(s) específico(s) que este adset deve trabalhar:
${adsetTrigger.length === 0 ? "(adset Genérico — sem gatilho específico; escreve copy de conversão sem fazer alegações factuais)" : fmtTriggerLines(adsetTrigger, "available")}

GATILHOS ACTIVOS DISPONÍVEIS DO EVENTO (factos respaldados):
${fmtTriggerLines(allAvailable, "available")}

GATILHOS EXPIRADOS / FORA DE VALIDADE (NÃO respaldam — contradizem alegações associadas):
${fmtTriggerLines(allExpired, "expired")}

PEÇAS DISPONÍVEIS NESTE ADSET:
${pecasBlock || "(sem peças)"}

Responde APENAS com JSON puro (sem markdown fences), com este shape exacto:
{
  "pecas": [
    { "creative_id": "uuid", "motivo_escolha": "1 frase curta em PT explicando porque esta peça serve este adset" }
  ],
  "variacoes_texto": [
    {
      "headline": "...",
      "corpo": "...",
      "cta": "SHOP_NOW",
      "semaforo": "coerente",
      "aproveita_gatilhos": true,
      "explicacao_validacao": "1-2 frases PT justificando o semáforo segundo as regras"
    }
  ]
}

Gera entre 2 e 3 variações. A "pecas" deve listar TODAS as peças recebidas, uma a uma, com motivo_escolha.`;
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
  console.log("[campaign-design] BUILD_VERSION=design-generate-v1");
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

  // 1) Lê assembly via service_role
  const { data: asm, error: asmErr } = await (adminClient as any)
    .schema("crm").from("assisted_assembly")
    .select("id, company_id, event_id, adsets")
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

  const adsetsIn: AssemblyAdset[] = Array.isArray(asm.adsets) ? asm.adsets : [];
  if (adsetsIn.length === 0) return json({ error: "empty_assembly", message: "assembly sem adsets" }, 400);

  // 2) Lê gatilhos do evento + selecção determinística
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

  // 3) Lê todos os criativos referenciados
  const allCreativeIds = Array.from(new Set(adsetsIn.flatMap((a) => a.creative_ids || [])));
  const { data: creativesRaw, error: crErr } = await (adminClient as any)
    .schema("crm").from("meta_creatives")
    .select("id, company_id, name, type, headline, body, cta_type, file_url, width, height, duration_seconds, analysis_jsonb")
    .in("id", allCreativeIds.length > 0 ? allCreativeIds : ["00000000-0000-0000-0000-000000000000"]);
  if (crErr) return json({ error: "creatives_read_failed", detail: crErr.message }, 500);
  const creativesById = new Map<string, Creative>();
  for (const c of (creativesRaw ?? []) as any[]) {
    if (c.company_id !== company_id) continue;
    creativesById.set(c.id, c);
  }

  // 4) Por adset: chama o LLM para gerar pecas[].motivo_escolha + variacoes_texto[]
  const adsetsOut: any[] = [];
  let variacoesTotal = 0;

  for (const adset of adsetsIn) {
    const pecas: Creative[] = (adset.creative_ids || [])
      .map((id) => creativesById.get(id))
      .filter((x): x is Creative => !!x);

    const adsetAvailable = adset.trigger_id
      ? allAvailable.filter((g) => g.trigger_id === adset.trigger_id)
      : [];

    let pecasOut: { creative_id: string; incluida: boolean; motivo_escolha: string }[] = [];
    let variacoesOut: any[] = [];

    try {
      const prompt = buildAdsetPrompt({ adset, adsetAvailable, allAvailable, allExpired, pecas });
      const raw = await callGeminiText(prompt, 0.4);
      const parsed = JSON.parse(stripJsonFences(raw));

      const motivoMap = new Map<string, string>();
      for (const p of (parsed.pecas ?? []) as any[]) {
        if (p?.creative_id && typeof p.motivo_escolha === "string") {
          motivoMap.set(p.creative_id, p.motivo_escolha.slice(0, 500));
        }
      }
      pecasOut = pecas.map((c) => ({
        creative_id: c.id,
        incluida: true,
        motivo_escolha: motivoMap.get(c.id) ?? "",
      }));

      variacoesOut = ((parsed.variacoes_texto ?? []) as any[]).slice(0, 3).map((v) => {
        const semaforo = ["coerente", "atencao", "contradiz"].includes(v?.semaforo) ? v.semaforo : "atencao";
        return {
          headline: typeof v?.headline === "string" ? v.headline.slice(0, 500) : "",
          corpo: typeof v?.corpo === "string" ? v.corpo.slice(0, 2000) : "",
          cta: typeof v?.cta === "string" ? v.cta.slice(0, 60) : "LEARN_MORE",
          semaforo,
          aproveita_gatilhos: !!v?.aproveita_gatilhos,
          explicacao_validacao: typeof v?.explicacao_validacao === "string" ? v.explicacao_validacao.slice(0, 1000) : "",
          escolhida: false,
        };
      });
    } catch (e) {
      const msg = String(e);
      if (msg.includes("rate_limited")) return json({ error: "rate_limited", message: "Tenta novamente em alguns segundos." }, 429);
      if (msg.includes("credits_exhausted")) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);
      // Fallback determinístico mínimo: peças sem motivo, sem variações
      pecasOut = pecas.map((c) => ({ creative_id: c.id, incluida: true, motivo_escolha: "" }));
      variacoesOut = [];
    }

    variacoesTotal += variacoesOut.length;

    adsetsOut.push({
      trigger_id: adset.trigger_id,
      trigger_nome: adset.trigger_nome,
      trigger_tipo: adset.trigger_tipo,
      peso_pct: adset.peso_pct,
      pecas: pecasOut,
      variacoes_texto: variacoesOut,
    });
  }

  // 5) Persiste linha nova (histórico)
  const { data: ins, error: insErr } = await (adminClient as any)
    .schema("crm").from("campaign_design")
    .insert({
      company_id,
      event_id: asm.event_id,
      assembly_id,
      adsets: adsetsOut,
      estado: "rascunho",
    })
    .select("id")
    .single();
  if (insErr) return json({ error: "persist_failed", detail: insErr.message }, 500);

  return json({
    design_id: ins.id,
    assembly_id,
    adsets: adsetsOut,
    contagem: { adsets: adsetsOut.length, variacoes_total: variacoesTotal },
  });
});
