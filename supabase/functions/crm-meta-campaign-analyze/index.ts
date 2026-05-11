import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { campaign_id?: string; days_back?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const campaignId = body.campaign_id;
  const daysBack = Math.min(Math.max(body.days_back ?? 30, 7), 90);
  if (!campaignId) return json({ error: "missing_campaign_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: campaign, error: campErr } = await supabase
    .schema("crm")
    .from("meta_campaign_snapshot")
    .select("external_campaign_id, name, status, objective, currency, linked_event_id, daily_budget_cents, lifetime_budget_cents")
    .eq("external_campaign_id", campaignId)
    .maybeSingle();
  if (campErr || !campaign) {
    return json({ error: "campaign_not_found", detail: campErr?.message }, 404);
  }

  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - daysBack);
  const { data: insights, error: insErr } = await supabase
    .schema("crm")
    .from("meta_campaign_insights_daily")
    .select("date_start, impressions, reach, frequency, clicks, spend_cents, cpc_cents, cpm_cents, ctr, purchases_count, purchases_value_cents, leads_count, add_to_cart_count, initiate_checkout_count, view_content_count, roas")
    .eq("external_campaign_id", campaignId)
    .gte("date_start", sinceDate.toISOString().slice(0, 10))
    .order("date_start", { ascending: true });
  if (insErr) {
    console.error("[analyze] insights err:", insErr);
    return json({ error: "insights_failed", detail: insErr.message }, 500);
  }

  if (!insights || insights.length === 0) {
    return json({ error: "no_data", message: "Sem dados de insights suficientes. Sincronize primeiro." }, 422);
  }

  const totals = insights.reduce((acc, r) => ({
    impressions: acc.impressions + (r.impressions ?? 0),
    reach: Math.max(acc.reach, r.reach ?? 0),
    clicks: acc.clicks + (r.clicks ?? 0),
    spendCents: acc.spendCents + (r.spend_cents ?? 0),
    purchases: acc.purchases + (r.purchases_count ?? 0),
    purchaseValueCents: acc.purchaseValueCents + (r.purchases_value_cents ?? 0),
    leads: acc.leads + (r.leads_count ?? 0),
    addToCart: acc.addToCart + (r.add_to_cart_count ?? 0),
    initiateCheckout: acc.initiateCheckout + (r.initiate_checkout_count ?? 0),
    viewContent: acc.viewContent + (r.view_content_count ?? 0),
  }), { impressions: 0, reach: 0, clicks: 0, spendCents: 0, purchases: 0, purchaseValueCents: 0, leads: 0, addToCart: 0, initiateCheckout: 0, viewContent: 0 });

  const avgFreq = insights.reduce((a, r) => a + (r.frequency ?? 0), 0) / insights.length;
  const avgCtr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const avgCpcCents = totals.clicks > 0 ? totals.spendCents / totals.clicks : 0;
  const overallRoas = totals.spendCents > 0 ? totals.purchaseValueCents / totals.spendCents : null;
  const spendEur = totals.spendCents / 100;
  const revenueEur = totals.purchaseValueCents / 100;

  let eventContext = "";
  if (campaign.linked_event_id) {
    const { data: peerCampaigns } = await supabase
      .schema("crm")
      .from("meta_campaign_snapshot")
      .select("external_campaign_id, name")
      .eq("linked_event_id", campaign.linked_event_id)
      .neq("external_campaign_id", campaignId)
      .eq("status", "ACTIVE");
    if (peerCampaigns && peerCampaigns.length > 0) {
      const peerIds = peerCampaigns.map((c: any) => c.external_campaign_id);
      const { data: peerInsights } = await supabase
        .schema("crm")
        .from("meta_campaign_insights_daily")
        .select("external_campaign_id, spend_cents, purchases_value_cents")
        .in("external_campaign_id", peerIds)
        .gte("date_start", sinceDate.toISOString().slice(0, 10));
      if (peerInsights) {
        const peerSpend = peerInsights.reduce((a: number, r: any) => a + (r.spend_cents ?? 0), 0);
        const peerRev = peerInsights.reduce((a: number, r: any) => a + (r.purchases_value_cents ?? 0), 0);
        const peerRoas = peerSpend > 0 ? peerRev / peerSpend : 0;
        eventContext = `\n\nContexto do evento: existem ${peerCampaigns.length} outras campanhas ativas para o mesmo evento. ROAS médio dessas: ${peerRoas.toFixed(2)}x. Gasto total: ${(peerSpend/100).toFixed(2)}€. Receita total: ${(peerRev/100).toFixed(2)}€.`;
      }
    }
  }

  const prompt = `Estás a analisar uma campanha publicitária Meta (Facebook/Instagram) para um evento ao vivo (concertos, festivais). A empresa é Mundo Propício, baseada em Portugal e Brasil. Analisa os dados abaixo e dá uma análise objetiva e crítica.

CAMPANHA
- Nome: ${campaign.name}
- Objetivo: ${campaign.objective ?? "N/A"}
- Status: ${campaign.status}
- Moeda: ${campaign.currency ?? "EUR"}
- Período analisado: últimos ${daysBack} dias (${insights.length} dias com dados)

MÉTRICAS AGREGADAS
- Gasto total: ${spendEur.toFixed(2)}€
- Receita total: ${revenueEur.toFixed(2)}€
- ROAS: ${overallRoas !== null ? overallRoas.toFixed(2) + "x" : "N/A (sem conversões)"}
- Impressões: ${totals.impressions.toLocaleString("pt-PT")}
- Alcance único: ${totals.reach.toLocaleString("pt-PT")}
- Frequência média: ${avgFreq.toFixed(2)}
- Cliques: ${totals.clicks.toLocaleString("pt-PT")}
- CTR: ${(avgCtr * 100).toFixed(2)}%
- CPC médio: ${(avgCpcCents / 100).toFixed(2)}€

FUNIL DE CONVERSÃO
- View Content: ${totals.viewContent}
- Add to Cart: ${totals.addToCart}
- Initiate Checkout: ${totals.initiateCheckout}
- Purchases: ${totals.purchases}
- Leads: ${totals.leads}
${eventContext}

INSTRUÇÕES
Responde APENAS com JSON válido (sem markdown, sem texto antes/depois) com este schema EXATO:

{
  "summary": "1-2 frases concisas a resumir o estado da campanha",
  "verdict": "excelente|bom|regular|fraco|mau",
  "strengths": ["ponto forte 1", "ponto forte 2", "ponto forte 3"],
  "weaknesses": ["ponto fraco 1", "ponto fraco 2", "ponto fraco 3"],
  "recommendations": [
    {"priority": "high|medium|low", "action": "ação específica curta", "rationale": "porquê em 1 frase"}
  ]
}

Sê crítico mas construtivo. Foca em ações concretas. Para eventos com bilhetes, ROAS >5x é excelente (margem alta), 2-5x bom, <2x preocupante. Frequência >4 indica saturação. CTR <1% no Meta indica criativo fraco. Funil deve ter taxas de conversão razoáveis: ATC/VC ~20%, IC/ATC ~50%, Purchase/IC ~30%.`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "És um especialista em marketing digital e análise de campanhas Meta Ads para a indústria de eventos (concertos, festivais). Respondes em português europeu, conciso, com dados concretos. Devolves SEMPRE JSON puro, sem markdown fences." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    console.error("[analyze] Lovable AI error:", aiResp.status, errText);
    if (aiResp.status === 429) {
      return json({ error: "rate_limit", message: "Limite de pedidos IA atingido. Tente em 1 minuto." }, 429);
    }
    if (aiResp.status === 402) {
      return json({ error: "credits_exhausted", message: "Créditos Lovable AI esgotados." }, 402);
    }
    return json({ error: "ai_failed", detail: errText.slice(0, 200) }, 502);
  }

  const aiJson = await aiResp.json();
  const content = aiJson?.choices?.[0]?.message?.content;
  if (!content) {
    return json({ error: "ai_empty_response" }, 502);
  }

  let cleanContent = content.trim();
  if (cleanContent.startsWith("```")) {
    cleanContent = cleanContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  let analysis;
  try {
    analysis = JSON.parse(cleanContent);
  } catch (e) {
    console.error("[analyze] parse error:", e, "content:", cleanContent.slice(0, 500));
    return json({ error: "ai_invalid_json", detail: cleanContent.slice(0, 200) }, 502);
  }

  return json({
    campaign: {
      external_campaign_id: campaignId,
      name: campaign.name,
      status: campaign.status,
    },
    period: {
      days_back: daysBack,
      days_with_data: insights.length,
    },
    metrics: {
      spend_eur: spendEur,
      revenue_eur: revenueEur,
      roas: overallRoas,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: avgCtr,
      cpc_eur: avgCpcCents / 100,
      frequency: avgFreq,
      purchases: totals.purchases,
    },
    analysis,
    generated_at: new Date().toISOString(),
  });
});
