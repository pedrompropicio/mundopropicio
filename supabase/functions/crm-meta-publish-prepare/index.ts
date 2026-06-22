// crm-meta-publish-prepare
// POST { company_id, design_id, orcamento_total_cents?, objetivo? }
// FASE 1 — Preparação. NÃO escreve no Meta. Só lê, sugere público (LLM),
// reparte orçamento (determinístico) e persiste plano em crm.meta_publish_plan.

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

// Reparte total pelos pesos (somam 100). Arredonda aos cents; diferença vai ao maior peso.
function repartirOrcamento(total: number, pesos: number[]): number[] {
  const somaPesos = pesos.reduce((a, b) => a + b, 0) || 1;
  const raw = pesos.map((p) => (total * p) / somaPesos);
  const floor = raw.map((v) => Math.floor(v));
  let resto = total - floor.reduce((a, b) => a + b, 0);
  // ordem por maior fracção (estável: pelo maior peso primeiro)
  const order = pesos.map((p, i) => ({ i, p })).sort((a, b) => b.p - a.p).map((x) => x.i);
  for (const idx of order) {
    if (resto <= 0) break;
    floor[idx] += 1;
    resto -= 1;
  }
  return floor;
}

function summarizeTargeting(t: any): string {
  if (!t || typeof t !== "object") return "";
  const parts: string[] = [];
  if (t.age_min || t.age_max) parts.push(`idade ${t.age_min ?? "?"}-${t.age_max ?? "?"}`);
  if (t.genders) parts.push(`gen=${JSON.stringify(t.genders)}`);
  const geo = t.geo_locations;
  if (geo) {
    const c = geo.countries ? `paises=${JSON.stringify(geo.countries)}` : "";
    const ci = geo.cities ? `cidades=${(geo.cities || []).slice(0, 3).map((x: any) => x.name || x.key).join(",")}` : "";
    const reg = geo.regions ? `regioes=${(geo.regions || []).slice(0, 3).map((x: any) => x.name || x.key).join(",")}` : "";
    [c, ci, reg].filter(Boolean).forEach((x) => parts.push(x));
  }
  const fs = t.flexible_spec || t.interests;
  if (Array.isArray(fs)) {
    const ints: string[] = [];
    for (const f of fs.slice(0, 3)) {
      if (Array.isArray(f?.interests)) ints.push(...f.interests.slice(0, 4).map((i: any) => i.name).filter(Boolean));
    }
    if (ints.length) parts.push(`interesses=${ints.slice(0, 6).join(", ")}`);
  } else if (Array.isArray(t.interests)) {
    parts.push(`interesses=${t.interests.slice(0, 6).map((i: any) => i.name || i).filter(Boolean).join(", ")}`);
  }
  return parts.join(" | ").slice(0, 400);
}

async function callGeminiJSON(prompt: string): Promise<any> {
  const doCall = async () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
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
  const raw = data?.choices?.[0]?.message?.content ?? "";
  return JSON.parse(stripJsonFences(raw));
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[meta-publish-prepare] BUILD_VERSION=publish-prepare-v3");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);
  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

  let body: { company_id?: string; design_id?: string; orcamento_total_cents?: number; objetivo?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { company_id, design_id } = body;
  const orcamentoTotal = typeof body.orcamento_total_cents === "number" ? Math.max(0, Math.floor(body.orcamento_total_cents)) : null;
  const objetivo = typeof body.objetivo === "string" ? body.objetivo : null;
  if (!company_id || !design_id) {
    return json({ error: "missing_params", message: "company_id e design_id obrigatórios" }, 400);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Lê design via service_role
  const { data: design, error: dErr } = await (adminClient as any)
    .schema("crm").from("campaign_design")
    .select("id, company_id, event_id, adsets")
    .eq("id", design_id)
    .maybeSingle();
  if (dErr) return json({ error: "design_read_failed", detail: dErr.message }, 500);
  if (!design) return json({ error: "design_not_found" }, 404);
  if (design.company_id !== company_id) return json({ error: "forbidden", message: "design não pertence ao company_id" }, 403);

  // Valida via RLS do user (lê evento)
  const { data: evRow, error: evErr } = await userClient
    .from("events").select("id, name, company_id, date, ticketing_url").eq("id", design.event_id).maybeSingle();
  if (evErr) return json({ error: "db_error", detail: evErr.message }, 500);
  if (!evRow || evRow.company_id !== company_id) {
    return json({ error: "forbidden", message: "evento não pertence ao company_id indicado ou sem acesso" }, 403);
  }
  const linkDestinoEvento: string | null =
    typeof (evRow as any).ticketing_url === "string" && (evRow as any).ticketing_url.startsWith("https://")
      ? (evRow as any).ticketing_url
      : null;

  const adsetsIn: any[] = Array.isArray(design.adsets) ? design.adsets : [];
  if (adsetsIn.length === 0) return json({ error: "empty_design", message: "design sem adsets" }, 400);

  // 2) Amostra de targetings reais (informativo p/ LLM)
  const { data: snaps } = await (adminClient as any)
    .schema("crm").from("meta_adset_snapshot")
    .select("name, optimization_goal, targeting, updated_at")
    .eq("company_id", company_id)
    .not("targeting", "is", null)
    .order("updated_at", { ascending: false })
    .limit(60);
  const targetingSamples = (snaps ?? []).map((s: any, i: number) =>
    `Adset real ${i + 1}: nome="${(s.name ?? "").slice(0, 80)}" opt=${s.optimization_goal ?? "?"} | ${summarizeTargeting(s.targeting)}`
  ).slice(0, 30).join("\n");

  // 3) Para cada adset: filtra anúncios SÓ variações coerentes; chama LLM para sugerir público
  type AnuncioOut = {
    creative_ids: string[];
    headline: string; corpo: string; cta: string;
    origem_variacao_idx: number;
  };
  type AdsetOut = {
    trigger_id: string | null;
    trigger_nome: string;
    trigger_tipo: string;
    peso_pct: number;
    orcamento_cents: number;
    publico_sugerido: any;
    publico_custom_audience_id: string | null;
    anuncios: AnuncioOut[];
  };

  // Agregação para resumo
  let anunciosElegiveisTot = 0;
  let variacoesExcluidasTot = 0;

  // PARALELIZA sugestões de público
  const sugestoes = await Promise.all(adsetsIn.map(async (adset) => {
    try {
      const prompt = `⚠️ IDIOMA OBRIGATÓRIO: PORTUGUÊS (PT-PT).

Estás a sugerir um PÚBLICO Meta para UM adset de uma campanha. Sugere idade, geografia e interesses com base em (a) o evento, (b) o gatilho deste adset, (c) padrões reais de como esta empresa segmenta no Meta (amostra real abaixo). SUGERES — o gestor edita à mão depois.

NÃO sugiras orçamento. NÃO inventes números de audiência. Não cites preços nem datas concretas.

DADOS:
- Evento: ${evRow.name ?? "(sem nome)"} (id=${evRow.id})${(evRow as any).date ? ` — data ${(evRow as any).date}` : ""}
- Gatilho deste adset: ${adset.trigger_nome} (tipo=${adset.trigger_tipo})
- Peso do adset na campanha: ${adset.peso_pct}% (informativo)

AMOSTRA REAL de como a empresa segmenta adsets (até 30 exemplos):
${targetingSamples || "(sem amostra disponível)"}

Responde APENAS JSON puro com este shape:
{
  "resumo": "texto curto PT do público sugerido (1-2 frases)",
  "idade_min": 18,
  "idade_max": 65,
  "geo": ["PT"],
  "interesses": ["música ao vivo", "..."],
  "baseado_em": "1-2 frases PT citando que padrões da amostra real informaram a sugestão"
}`;
      const parsed = await callGeminiJSON(prompt);
      return {
        resumo: typeof parsed?.resumo === "string" ? parsed.resumo.slice(0, 500) : "",
        idade_min: Number.isFinite(parsed?.idade_min) ? Math.max(13, Math.min(65, parsed.idade_min)) : 18,
        idade_max: Number.isFinite(parsed?.idade_max) ? Math.max(13, Math.min(65, parsed.idade_max)) : 65,
        geo: Array.isArray(parsed?.geo) ? parsed.geo.slice(0, 10).map((x: any) => String(x).slice(0, 60)) : ["PT"],
        interesses: Array.isArray(parsed?.interesses) ? parsed.interesses.slice(0, 15).map((x: any) => String(x).slice(0, 100)) : [],
        baseado_em: typeof parsed?.baseado_em === "string" ? parsed.baseado_em.slice(0, 600) : "",
      };
    } catch (e) {
      const msg = String(e);
      if (msg.includes("rate_limited") || msg.includes("credits_exhausted")) throw e;
      return {
        resumo: "Sugestão indisponível — preenche à mão.",
        idade_min: 18, idade_max: 65, geo: ["PT"], interesses: [], baseado_em: "",
      };
    }
  })).catch((e) => {
    const msg = String(e);
    if (msg.includes("rate_limited")) return { _err: 429 } as any;
    if (msg.includes("credits_exhausted")) return { _err: 402 } as any;
    throw e;
  });

  if ((sugestoes as any)._err === 429) return json({ error: "rate_limited", message: "Tenta novamente em alguns segundos." }, 429);
  if ((sugestoes as any)._err === 402) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);

  // 4) Repartição de orçamento determinística
  const pesos = adsetsIn.map((a) => Math.max(0, Number(a.peso_pct) || 0));
  const orcamentos = orcamentoTotal && orcamentoTotal > 0
    ? repartirOrcamento(orcamentoTotal, pesos)
    : adsetsIn.map(() => 0);

  // 5) Constrói adsets de saída, filtrando SÓ variações coerentes (P0)
  const adsetsOut: AdsetOut[] = adsetsIn.map((adset, i) => {
    const variacoes: any[] = Array.isArray(adset.variacoes_texto) ? adset.variacoes_texto : [];
    const creativeIds: string[] = Array.isArray(adset.pecas)
      ? adset.pecas.filter((p: any) => p?.incluida !== false).map((p: any) => p?.creative_id).filter(Boolean)
      : [];

    const anuncios: AnuncioOut[] = [];
    let excluidas = 0;
    variacoes.forEach((v, idx) => {
      if (v?.semaforo === "coerente") {
        anuncios.push({
          creative_ids: creativeIds,
          headline: String(v?.headline ?? "").slice(0, 500),
          corpo: String(v?.corpo ?? "").slice(0, 2000),
          cta: String(v?.cta ?? "LEARN_MORE").slice(0, 60),
          origem_variacao_idx: idx,
        });
      } else {
        excluidas += 1;
      }
    });

    anunciosElegiveisTot += anuncios.length;
    variacoesExcluidasTot += excluidas;

    return {
      trigger_id: adset.trigger_id ?? null,
      trigger_nome: adset.trigger_nome ?? "",
      trigger_tipo: adset.trigger_tipo ?? "",
      peso_pct: Number(adset.peso_pct) || 0,
      orcamento_cents: orcamentos[i] ?? 0,
      publico_sugerido: (sugestoes as any[])[i],
      publico_custom_audience_id: null,
      anuncios,
    };
  });

  // 6) Persiste plano
  const { data: ins, error: insErr } = await (adminClient as any)
    .schema("crm").from("meta_publish_plan")
    .insert({
      company_id,
      event_id: design.event_id,
      design_id,
      objetivo: objetivo,
      orcamento_total_cents: orcamentoTotal,
      moeda: "EUR",
      link_destino: linkDestinoEvento,
      adsets: adsetsOut,
      estado: "rascunho",
    })
    .select("id, link_destino")
    .single();
  if (insErr) return json({ error: "persist_failed", detail: insErr.message }, 500);

  return json({
    plan_id: ins.id,
    design_id,
    link_destino: (ins as any).link_destino ?? linkDestinoEvento,
    adsets: adsetsOut,
    totais: {
      adsets: adsetsOut.length,
      anuncios_elegiveis: anunciosElegiveisTot,
      variacoes_excluidas: variacoesExcluidasTot,
    },
  });
});
