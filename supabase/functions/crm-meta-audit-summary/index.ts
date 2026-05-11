// crm-meta-audit-summary (Fase 5)
// POST { landing_results: [...], funnel_results: [...], pixel_results: [...], context?: { event_name?, campaign_name? } }
// Devolve veredicto IA sobre onde está o problema (landing/pixel/placement/audience/mixed/healthy).

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_MODEL = "google/gemini-2.5-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function stripFences(s: string) {
  let t = s.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return t.trim();
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const landing = Array.isArray(body.landing_results) ? body.landing_results : [];
  const funnel = Array.isArray(body.funnel_results) ? body.funnel_results : [];
  const pixel = Array.isArray(body.pixel_results) ? body.pixel_results : (body.pixel_results ? [body.pixel_results] : []);
  const ctx = body.context ?? {};

  const landingBlock = landing.length === 0 ? "  (sem auditorias landing)" : landing.map((l: any) => {
    const m = l.metrics ?? {};
    const s = l.scores ?? {};
    return `  - ${l.url} [${l.strategy}] perf=${s.performance ?? "?"} a11y=${s.accessibility ?? "?"} seo=${s.seo ?? "?"} bp=${s.best_practices ?? "?"} | LCP=${m.lcp_ms ?? "?"}ms FCP=${m.fcp_ms ?? "?"}ms TBT=${m.tbt_ms ?? "?"}ms TTI=${m.tti_ms ?? "?"}ms TTFB=${m.ttfb_ms ?? "?"}ms CLS=${m.cls ?? "?"}`;
  }).join("\n");

  const funnelBlock = funnel.length === 0 ? "  (sem breakdown funnel)" : funnel.map((fb: any) => {
    const top = (fb.rows ?? []).slice(0, 8).map((r: any) =>
      `      - ${r.label} | spend=€${r.spend_eur} clicks=${r.link_clicks} lpv=${r.lpv} atc=${r.atc} ic=${r.ic} purch=${r.purchases} | LPV/click=${r.rates?.lpv_per_click_pct ?? "n/a"}% ATC/LPV=${r.rates?.atc_per_lpv_pct ?? "n/a"}% IC/ATC=${r.rates?.ic_per_atc_pct ?? "n/a"}% Purch/IC=${r.rates?.purchase_per_ic_pct ?? "n/a"}% ROAS=${r.rates?.roas ?? "n/a"}`
    ).join("\n");
    return `  Breakdown ${fb.breakdown_by}:\n${top}`;
  }).join("\n\n");

  const pixelBlock = pixel.length === 0 ? "  (sem dados pixel)" : pixel.map((p: any) => JSON.stringify(p).slice(0, 800)).join("\n  ---\n  ");

  const ctxBlock = `Contexto: evento=${ctx.event_name ?? "n/a"} | campanha=${ctx.campaign_name ?? "n/a"}`;

  const prompt = `⚠️ IDIOMA OBRIGATÓRIO: TODOS OS CAMPOS TEXTUAIS DA RESPOSTA JSON DEVEM SER ESCRITOS EM PORTUGUÊS (PT-BR preferencial — público maioritário é Brasil).
Mantém em inglês APENAS: nomes próprios, marcas, IDs, e termos técnicos (LCP, TBT, CLS, ROAS, CTR, pixel, placement).
ENUMS INTERNOS — INGLÊS:
- verdict_severity: "landing"|"pixel"|"placement"|"audience"|"mixed"|"healthy"
- confidence: "high"|"medium"|"low"
- evidence[].status: "good"|"warning"|"critical"
- actions[].priority: "high"|"medium"|"low"
- actions[].target: "platform"|"ticketline"|"meta_setup"

És um auditor técnico sênior de Meta Ads + infraestrutura web para eventos ao vivo da Mundo Propício. Avalia OBJECTIVAMENTE onde está o problema com base nos DADOS abaixo. Não especules — cita métricas concretas.

${ctxBlock}

==== LANDING PAGE PERFORMANCE (PageSpeed Insights) ====
${landingBlock}

Benchmarks Mundo Propício: LCP <2500ms | FCP <1800ms | TBT <200ms | TTI <3800ms | TTFB <600ms | CLS <0.1 | Performance score >=70 mobile.

==== FUNNEL BREAKDOWN ====
${funnelBlock}

Benchmarks: LPV/Click >=80% saudável (<60% problema landing/redirect). ATC/LPV ~20%. IC/ATC ~50%. Purch/IC ~30%. Overall ~3%.

==== PIXEL HEALTH ====
  ${pixelBlock}

Sinais críticos pixel: match rate baixo (<60%), ausência de server events (CAPI), eventos duplicados, EMQ score baixo.

REGRAS DE DIAGNÓSTICO:
- Se LPV/Click <60% em múltiplos placements + landing TTI/LCP fracos → "landing"
- Se pixel com match rate baixo ou sem CAPI → "pixel"
- Se variação ENORME entre placements (1 placement com ROAS 8x e outros 0.5x) → "placement"
- Se rates funnel ok mas baixo volume / CPA alto → "audience"
- Se vários sinais → "mixed"
- Se tudo dentro dos benchmarks → "healthy"

Responde APENAS com JSON puro (sem markdown fences):

{
  "verdict_severity": "landing|pixel|placement|audience|mixed|healthy",
  "confidence": "high|medium|low",
  "summary_pt": "2-3 frases objectivas",
  "evidence": [
    { "metric": "<nome>", "value": "<valor concreto>", "benchmark": "<benchmark>", "status": "good|warning|critical" }
  ],
  "actions": [
    { "priority": "high|medium|low", "action": "ação específica", "expected_impact": "impacto esperado", "target": "platform|ticketline|meta_setup" }
  ]
}`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "És um auditor técnico de Meta Ads. Respondes SEMPRE com JSON puro em PT-BR." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("[audit-summary] AI err", aiResp.status, t.slice(0, 300));
    if (aiResp.status === 429) return json({ error: "rate_limit", message: "Limite de pedidos IA atingido. Tenta em 1 min." }, 429);
    if (aiResp.status === 402) return json({ error: "credits_exhausted", message: "Créditos Lovable AI esgotados." }, 402);
    return json({ error: "ai_failed", detail: t.slice(0, 200) }, 502);
  }
  const aiJson = await aiResp.json();
  const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
  if (!content) return json({ error: "ai_empty" }, 502);
  let verdict: any;
  try { verdict = JSON.parse(stripFences(content)); }
  catch (e) {
    console.error("[audit-summary] parse err", e, content.slice(0, 300));
    return json({ error: "ai_invalid_json", detail: content.slice(0, 200) }, 502);
  }

  return json({
    verdict,
    ai_model: AI_MODEL,
    generated_at: new Date().toISOString(),
  });
});
