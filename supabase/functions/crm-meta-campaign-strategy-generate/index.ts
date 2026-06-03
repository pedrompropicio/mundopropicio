// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-campaign-strategy-generate
// POST → gera plano de campanha Meta via Lovable AI Gateway (Gemini 2.5 Flash)
// e persiste em crm.meta_campaign_strategies.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeAdAccountId(raw: string): string {
  const c = raw.trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

// Heurística simples para extrair nome de artista de um título de evento.
function detectArtist(eventName: string): string | null {
  if (!eventName) return null;
  let s = eventName;
  s = s.replace(/\[[^\]]*\]/g, " "); // [SoldOut][F][Q]…
  s = s.replace(/\b(20\d{2}|19\d{2})\b/g, " "); // anos
  s = s.replace(/\b\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?\b/g, " "); // datas
  s = s.replace(
    /\b(ensaios?|tour|turn[eê]|show|shows|concerto|concertos|festival|live|ao vivo|apresenta|edi[cç][aã]o|especial|tributo|premi[eè]re|estreia|lisboa|porto|braga|coimbra|faro|aveiro|funchal|s[aã]o paulo|rio|bras[ií]lia|salvador|recife|forta?leza|curitiba|portugal|brasil|pt|br)\b/gi,
    " ",
  );
  s = s.replace(/[•·\-–—|:,;]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const words = s.split(" ").filter(Boolean).slice(0, 3);
  return words.join(" ") || null;
}

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

// Normalização determinística pós-LLM (backstop para P2 e P3 do prompt):
// — Converte `targeting.exclusions` array em objeto Meta-válido se possível
//   (mapear `custom_audience_id`/`audience_id`/`id` para `{custom_audiences:[{id}]}`).
// — Remove ids de custom audiences (em `custom_audiences` e em
//   `exclusions.custom_audiences`) que não sejam estritamente numéricos
//   (descarta placeholders simbólicos que o LLM inventa sem ter id real).
// Idempotente e defensiva: não rebenta em campos em falta. Devolve a lista
// de warnings (para console.warn + persistir em plan._normalization_warnings).
function normalizePlanInPlace(plan: any): string[] {
  const warnings: string[] = [];
  if (!plan || typeof plan !== "object") return warnings;
  const isNumericId = (v: any) => typeof v === "string" && /^\d+$/.test(v);
  const sanitizeCAs = (arr: any[], ctx: string): any[] => {
    const out: any[] = [];
    for (const item of arr ?? []) {
      if (isNumericId(item?.id)) {
        out.push(item);
      } else {
        warnings.push(`${ctx}: custom audience descartado (id inválido/placeholder: ${JSON.stringify(item)?.slice(0, 120)})`);
      }
    }
    return out;
  };
  for (const c of plan.recommended_campaigns ?? []) {
    for (const a of c.adsets ?? []) {
      const t = a?.targeting_json;
      if (!t || typeof t !== "object") continue;
      const adsetCtx = `adset "${a?.adset_name ?? "?"}"`;
      // P3 — exclusions ARRAY → OBJETO (tentativa de recuperação)
      if (Array.isArray(t.exclusions)) {
        const cas: any[] = [];
        for (const item of t.exclusions) {
          const id = item?.id ?? item?.custom_audience_id ?? item?.audience_id;
          if (id !== undefined) cas.push({ id });
        }
        const sanitized = sanitizeCAs(cas, `${adsetCtx} exclusions[]→{}`);
        warnings.push(`${adsetCtx}: exclusions array normalizado para objeto (${sanitized.length}/${t.exclusions.length} ids válidos)`);
        if (sanitized.length > 0) {
          t.exclusions = { custom_audiences: sanitized };
        } else {
          delete t.exclusions;
        }
      }
      // P2 — validar exclusions.custom_audiences (após eventual normalização)
      if (t.exclusions && typeof t.exclusions === "object" && !Array.isArray(t.exclusions) && Array.isArray(t.exclusions.custom_audiences)) {
        t.exclusions.custom_audiences = sanitizeCAs(t.exclusions.custom_audiences, `${adsetCtx} exclusions.custom_audiences`);
        if (!t.exclusions.custom_audiences.length) delete t.exclusions.custom_audiences;
        if (t.exclusions && Object.keys(t.exclusions).length === 0) delete t.exclusions;
      }
      // P2 — validar custom_audiences (positivos)
      if (Array.isArray(t.custom_audiences)) {
        t.custom_audiences = sanitizeCAs(t.custom_audiences, `${adsetCtx} custom_audiences`);
        if (!t.custom_audiences.length) delete t.custom_audiences;
      }
    }
  }
  return warnings;
}

interface ReqBody {
  event_id?: string;
  connection_id?: string;
  ad_account_id?: string;
  goal_revenue_eur?: number;
  ticket_avg_eur?: number;
  total_budget_eur?: number;
  target_roas?: number;
  country_codes?: string[];
  user_notes?: string;
  strategy_name?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: ReqBody;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const {
    event_id, connection_id, ad_account_id,
    goal_revenue_eur, ticket_avg_eur,
    total_budget_eur, target_roas,
    country_codes, user_notes, strategy_name,
  } = body;

  if (!event_id || !connection_id || !ad_account_id || !goal_revenue_eur || !ticket_avg_eur) {
    return json({ error: "missing_params", required: ["event_id","connection_id","ad_account_id","goal_revenue_eur","ticket_avg_eur"] }, 400);
  }

  const adAccountId = normalizeAdAccountId(ad_account_id);
  const countries = country_codes && country_codes.length ? country_codes : ["PT","BR"];
  // Default 9x = centro da banda 8–11x (target principal Mundo Propício, ROAS BLENDED por evento).
  const targetRoas = target_roas ?? 9;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) auth user — extrair token do header e passar explicitamente
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    console.error("[auth] getUser failed", userErr);
    return json({ error: "unauthorized", detail: userErr?.message }, 401);
  }
  const userId = userData.user.id;

  // 2) decrypt token
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connection_id, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as { access_token: string; company_id: string };

  // 3) event
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("id, name, date, location, tickets_total")
    .eq("id", event_id)
    .maybeSingle();
  if (eventErr || !event) return json({ error: "event_not_found", detail: eventErr?.message }, 404);

  const startAtIso = event.date ? new Date(event.date).toISOString() : null;
  const daysUntilEvent = startAtIso
    ? Math.max(0, Math.round((new Date(startAtIso).getTime() - Date.now()) / 86400000))
    : null;
  const expectedPurchases = Math.ceil(goal_revenue_eur / ticket_avg_eur);
  const detectedArtist = detectArtist(event.name || "");

  // 4) Graph context (best-effort)
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);

  const safeFetch = async (url: URL): Promise<any> => {
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok || j.error) { console.warn("[ctx] graph err", url.pathname, j.error); return null; }
      return j;
    } catch (e) { console.warn("[ctx] threw", e); return null; }
  };

  // 4a) Top performers (campaigns + insights)
  let topPerformers: any[] = [];
  try {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/campaigns`);
    u.searchParams.set("fields", `id,name,objective,insights.time_range({"since":"${since}","until":"${until}"}){spend,purchase_roas,actions,impressions,clicks}`);
    u.searchParams.set("limit", "50");
    u.searchParams.set("access_token", accessToken);
    const j = await safeFetch(u);
    const camps = j?.data ?? [];
    const ranked: any[] = [];
    for (const c of camps) {
      const ins = c.insights?.data?.[0];
      if (!ins) continue;
      const roas = parseFloat(ins.purchase_roas?.[0]?.value ?? "0");
      const spend = parseFloat(ins.spend ?? "0");
      if (roas >= 3 && spend >= 50) {
        ranked.push({ campaign_id: c.id, campaign_name: c.name, objective: c.objective, roas, spend_eur: spend });
      }
    }
    ranked.sort((a, b) => b.roas - a.roas);
    topPerformers = ranked.slice(0, 5);
    // Fetch 1 adset targeting per top
    for (const t of topPerformers) {
      const au = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${t.campaign_id}/adsets`);
      au.searchParams.set("fields", "id,name,targeting");
      au.searchParams.set("limit", "1");
      au.searchParams.set("access_token", accessToken);
      const aj = await safeFetch(au);
      t.adsets = aj?.data ?? [];
    }
  } catch (e) { console.warn("[ctx] top performers failed", e); }

  // 4b) Custom audiences
  let customAudiences: any[] = [];
  {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/customaudiences`);
    u.searchParams.set("fields", "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound");
    u.searchParams.set("limit", "100");
    u.searchParams.set("access_token", accessToken);
    const j = await safeFetch(u);
    customAudiences = j?.data ?? [];
  }

  // 4c) Interest search
  let interests: any[] = [];
  if (detectedArtist) {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/search`);
    u.searchParams.set("type", "adinterest");
    u.searchParams.set("q", detectedArtist);
    u.searchParams.set("limit", "5");
    u.searchParams.set("locale", "pt_PT");
    u.searchParams.set("access_token", accessToken);
    const j = await safeFetch(u);
    interests = j?.data ?? [];
  }

  // 4d) Pixels
  let pixels: any[] = [];
  {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/adspixels`);
    u.searchParams.set("fields", "id,name,enable_automatic_matching,first_party_cookie_status");
    u.searchParams.set("access_token", accessToken);
    const j = await safeFetch(u);
    pixels = j?.data ?? [];
  }

  // 5) Build prompt
  const prompt = `És um especialista em Meta Ads para a indústria de eventos ao vivo (concertos, festivais) em Portugal e Brasil, com 10 anos de experiência. Desenhas estratégias completas de campanha para vender ingressos de eventos, otimizando custo-benefício do tráfego pago.

IMPORTANTE: Esta estratégia será executada AUTOMATICAMENTE através da Meta Marketing API pela plataforma MP Audience. Não precisas de explicar como aplicar manualmente — os campos targeting_json, optimization_goal, billing_event e budgets serão usados diretamente no payload da API. Foca-te em valores precisos e estruturados.

== OBJETIVO DESTA ESTRATÉGIA ==
- Evento: ${event.name}
- Data: ${startAtIso ?? "N/A"}
- Dias até o evento: ${daysUntilEvent ?? "N/A"}
- Local: ${event.location || "N/A"}
- Capacidade: ${event.tickets_total || "N/A"} ingressos
- Meta de receita: ${goal_revenue_eur}€
- Ticket médio: ${ticket_avg_eur}€
- Vendas necessárias: ${expectedPurchases} ingressos
- Verba total disponível: ${total_budget_eur ? total_budget_eur + "€" : "calcular automaticamente baseado em ROAS alvo"}
- ROAS alvo: ${targetRoas}x (META BLENDED do evento — agregada entre TODAS as fases/campanhas, não por campanha individual. Fases finais de conversão + retargeting devem PUXAR o blended para cima mesmo que awareness/reach fiquem em 1–2x.)
- Países alvo: ${countries.join(", ")}
- Notas do utilizador: ${user_notes || "—"}

== CONTEXTO META ATUAL ==
Artista detetado: ${detectedArtist || "—"}

Interesses Meta para "${detectedArtist || ""}":
${interests.map((i: any) => `- ${i.name} (id: ${i.id}, audience: ${i.audience_size_lower_bound ?? "?"}-${i.audience_size_upper_bound ?? "?"})`).join("\n") || "—"}

TOP PERFORMERS desta ad account (últimos 90d, ROAS > 3):
${topPerformers.map((t: any) => `- ${t.campaign_name}: ROAS ${t.roas.toFixed(2)}x, gasto ${t.spend_eur}€, targeting top: ${(t.adsets?.[0]?.targeting?.flexible_spec?.[0]?.interests || t.adsets?.[0]?.targeting?.interests || []).map((i: any) => i.name).slice(0, 3).join("+") || "—"}, geo: ${t.adsets?.[0]?.targeting?.geo_locations?.countries?.join(",") || "—"}`).join("\n") || "(sem histórico)"}

CUSTOM AUDIENCES disponíveis nesta ad account:
${customAudiences.map((c: any) => `- ${c.name} (id: ${c.id}, ${c.subtype}, ~${c.approximate_count_lower_bound ?? "?"}-${c.approximate_count_upper_bound ?? "?"} users)`).join("\n") || "(nenhuma)"}

Pixels disponíveis: ${pixels.map((p: any) => p.name).join(", ") || "(nenhum)"}

== O QUE PRECISO QUE FAÇAS ==
Desenha uma estratégia de campanha COMPLETA estruturada em FASES (tipicamente 3-5 fases dependendo do tempo até o evento). Cada fase deve ter:
- Período (D-X a D-Y dias antes do evento)
- Objetivo Meta (REACH / TRAFFIC / OFFSITE_CONVERSIONS / CATALOG_SALES)
- Verba diária recomendada (em €)
- 2-4 audiences priorizadas a usar
- Tipo de criativo a focar (video, carousel, single image, story, reel)
- KPIs esperados (CPM, CPC, CPR, ROAS alvo da fase)
- Critérios de sucesso para passar à próxima fase

REGRAS QUE DEVES OBEDECER:
1. Learning Phase: cada adset Meta precisa ~50 conversões em 7 dias para estabilizar. Se a fase é de conversão (OFFSITE_CONVERSIONS), garante que verba diária × dias × (1/CPR_esperado) >= 50.
2. Cap de verba: nunca recomendar daily budget que ultrapasse 5% do total budget num único dia, no início. Escalar gradualmente.
3. Frequência: se uma fase tem >5 dias com audiência pequena (<100k pessoas), alertar para risco de saturação (Freq > 4).
4. Geo: respeitar os países definidos. Se cidade/venue indicada, considerar dar mais peso geográfico próximo ao venue.
5. Audiences:
   - Fase awareness: broad com idade ampla, interests gerais
   - Fase engagement: interesses do artista + LAL de compradores
   - Fase conversão: custom audiences (engagers, ATC, IC), retargeting
   - Fase final: warm retargeting (VC 30d, ATC 14d, IC 7d) com urgência
6. Criativos: cada fase precisa de criativos diferentes. Ser explícito sobre que tipo recomendar.
7. Scaling: incluir regras concretas de escalonamento (ex: "se CPR < 3€ por 3 dias, aumentar verba 20%").
8. Ser realista: se a meta de receita é muito agressiva vs verba, alertar e propor metas alternativas.
9. ROAS BLENDED do evento: ROAS alvo é a MÉTRICA AGREGADA do evento. Fases REACH/AWARENESS/VIDEO_VIEWS terão ROAS individual baixo (esperado 0–2x); fases CONVERSIONS/SALES devem entregar ROAS >=8x para puxar o blended até ${targetRoas}x; retargeting deve entregar 10–20x. Em cada phase do output, preenche \`expected_blended_contribution\` (peso 0–1 desta fase no ROAS agregado — soma de todas as fases deve aproximar-se de 1.0; fases de conversão e retargeting pesam mais que awareness).
10. Avaliação por fase: critérios de sucesso de fases não-conversion são CPM, CTR, hook rate, alcance — NÃO ROAS. Não definas \`roas_min\` em \`target_kpis\` de uma fase REACH/VIDEO_VIEWS; usa 0 ou omite.
11. Custom audiences / exclusions: usa APENAS os ids da lista "CUSTOM AUDIENCES disponíveis" acima, verbatim, no formato \`[{id:"<id>", name:"<name>"}]\`. NUNCA inventes placeholders simbólicos (ex.: "LOOKALIKE_PURCHASERS_1_PERCENT", "PURCHASERS_ALL_TIME"). Se não há id real para o que queres, omite o item.
12. Exclusions é um OBJETO, NUNCA um array. Formato Meta correto: \`targeting.exclusions = { custom_audiences: [{id:"<numeric-id>"}], interests: [{id:..., name:...}] }\`. Qualquer outro formato será rejeitado pela Meta.

== FORMATO DE RESPOSTA ==
Responde APENAS com JSON puro (sem markdown fences) com este schema EXATO:

{
  "summary": {
    "feasibility": "high|medium|low|impossible",
    "feasibility_reason": "1-2 frases sobre a viabilidade da meta",
    "recommended_total_budget_eur": <number>,
    "expected_purchases": <number>,
    "expected_revenue_eur": <number>,
    "expected_overall_roas": <number>,
    "expected_cpa_eur": <number>,
    "confidence": "high|medium|low"
  },
  "phases": [
    {
      "id": "phase_1_awareness",
      "name": "Awareness",
      "days_from_event_start": 60,
      "days_from_event_end": 45,
      "duration_days": 15,
      "objective": "REACH|TRAFFIC|OFFSITE_CONVERSIONS|VIDEO_VIEWS",
      "daily_budget_eur": <number>,
      "total_phase_budget_eur": <number>,
      "primary_audiences": [
        {"type": "broad|interest|lookalike|custom|retargeting", "description": "Broad PT/BR 18-55", "estimated_size": "10M+"}
      ],
      "creative_focus": "video_30s_announcement|carousel_lineup|single_image_urgency|reel_short",
      "target_kpis": {
        "cpm_eur_max": <number>,
        "ctr_pct_min": <number>,
        "cpa_eur_max": <number>,
        "roas_min": <number>
      },
      "success_criteria_to_next_phase": "ex: CTR > 1% e CPM < 8€",
      "learning_phase_note": "Sem learning phase (REACH) | Adset com OFFSITE_CONVERSIONS precisa ~50 conv/7d para estabilizar.",
      "expected_blended_contribution": <number 0-1: peso desta fase no ROAS agregado do evento. A soma de todas as fases deve aproximar-se de 1.0. Fases de conversão e retargeting pesam mais que awareness.>
    }
  ],
  "recommended_campaigns": [
    {
      "phase_id": "phase_1_awareness",
      "campaign_name": "[MPA] {event} - REACH - Broad",
      "objective": "REACH",
      "daily_budget_eur": 50,
      "duration_days": 15,
      "adsets": [
        {
          "adset_name": "Broad PT/BR 18-55",
          "targeting_json": {
            "age_min": 18,
            "age_max": 55,
            "geo_locations": {"countries": ["PT","BR"]},
            "publisher_platforms": ["facebook","instagram"],
            "custom_audiences": [{"id": "<id-numerico-da-lista-acima>"}],
            "exclusions": {"custom_audiences": [{"id": "<id-numerico>"}]}
          },
          "optimization_goal": "REACH",
          "billing_event": "IMPRESSIONS",
          "creative_type_recommended": "video"
        }
      ]
    }
  ],
  "scaling_rules": [
    {"trigger": "CPR < target × 0.7 por 3 dias", "action": "Aumentar daily budget 20%", "rationale": "Performance acima do esperado, escalar gradualmente"}
  ],
  "kpis_global": {
    "expected_total_impressions": <number>,
    "expected_total_reach": <number>,
    "expected_total_clicks": <number>,
    "expected_avg_frequency": <number>,
    "expected_total_purchases": <number>
  },
  "risks_and_warnings": [
    {"severity": "high|medium|low", "title": "Risco curto", "description": "explicação"}
  ],
  "creative_brief": {
    "primary_message": "Mensagem central a passar nos criativos",
    "tone": "ex: urgência elevada, celebração, exclusividade",
    "must_include": ["data do evento", "venue", "preço a partir de"],
    "avoid": ["claims excessivos", "promessas não cumpríveis"]
  },
  "automation_metadata": {
    "ready_to_deploy": true,
    "estimated_api_calls": <number>,
    "warnings_before_deploy": ["aviso 1", "aviso 2"],
    "requires_manual_setup": ["pixels", "domains", "custom_conversions"]
  }
}

automation_metadata: flags que ajudam o agent de deployment automático. ready_to_deploy=true se o plano pode ser criado sem intervenção. requires_manual_setup lista o que precisa de ser configurado manualmente no BM antes (pixels, domain verification, custom conversions criadas, etc).

Sê preciso, realista e crítico. Se a meta é inalcançável, diz claramente. Se o orçamento é insuficiente, alerta. Os números devem ser coerentes entre si.`;

  // 6) Call Lovable AI
  const callGemini = async (): Promise<Response> => {
    return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  };

  let aiResp = await callGemini();
  if (aiResp.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    aiResp = await callGemini();
  }
  if (aiResp.status === 429) return json({ error: "rate_limited", message: "Lovable AI rate limit; tenta novamente em alguns segundos." }, 429);
  if (aiResp.status === 402) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI. Adiciona em Settings → Workspace → Usage." }, 402);
  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("[ai] error", aiResp.status, t);
    return json({ error: "ai_gateway_error", status: aiResp.status, detail: t.slice(0, 500) }, 502);
  }

  const aiJson = await aiResp.json();
  const rawText: string = aiJson?.choices?.[0]?.message?.content ?? "";
  const usageTokens: number | null = aiJson?.usage?.total_tokens ?? null;

  let plan: any;
  try {
    plan = JSON.parse(stripJsonFences(rawText));
  } catch (e) {
    console.error("[ai] invalid JSON", e, rawText.slice(0, 500));
    return json({ error: "ai_invalid_json", message: "Modelo devolveu JSON inválido.", raw_preview: rawText.slice(0, 800) }, 502);
  }

  // Normalização determinística pós-LLM (backstop para P2 e P3 do prompt).
  const planNormalizationWarnings = normalizePlanInPlace(plan);
  if (planNormalizationWarnings.length > 0) {
    console.warn("[generate] plan normalization warnings", planNormalizationWarnings);
    plan._normalization_warnings = planNormalizationWarnings;
  }

  // 7) Persist
  const generatedAt = new Date().toISOString();
  const stratName = strategy_name?.trim() || `Strategy ${event.name}`;

  const { data: inserted, error: insErr } = await supabase
    .schema("crm")
    .from("meta_campaign_strategies")
    .insert({
      company_id: companyId,
      connection_id,
      ad_account_id: adAccountId,
      event_id,
      name: stratName,
      goal_revenue_eur,
      ticket_avg_eur,
      total_budget_eur: total_budget_eur ?? null,
      target_roas: targetRoas,
      days_until_event: daysUntilEvent,
      country_codes: countries,
      user_notes: user_notes ?? null,
      detected_artist: detectedArtist,
      generated_plan: plan,
      generation_model: "google/gemini-2.5-flash",
      generation_tokens_used: usageTokens,
      generated_at: generatedAt,
      status: "generated",
      created_by: userId,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[persist] failed", insErr);
    return json({ error: "persist_failed", detail: insErr?.message, plan }, 500);
  }

  return json({
    strategy_id: inserted.id,
    event: { id: event.id, name: event.name, start_at: startAtIso, days_until_event: daysUntilEvent },
    detected_artist: detectedArtist,
    context_used: {
      top_performers_count: topPerformers.length,
      interests_found: interests.length,
      custom_audiences_count: customAudiences.length,
      pixels_count: pixels.length,
    },
    plan,
    generated_at: generatedAt,
  });
});
