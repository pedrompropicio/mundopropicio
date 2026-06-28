// crm-meta-campaign-new-design (Etapa 5 — "novo desenho do zero")
// POST { campaign_id (morta), goal_revenue_eur, ticket_avg_eur, total_budget_eur?,
//        target_roas?, country_codes?, user_notes?, strategy_name?, inheritance_decisions? }
//
// Postura novo_desenho (classe morta). COMPÕE:
//   - estrutura-do-zero-a-partir-do-evento (como crm-meta-campaign-strategy-generate):
//     contexto Graph (top performers 90d, custom audiences, interesses, pixels),
//     prompt por fases + schema, normalize/resolve partilhados, persist.
//   - herança SELETIVA de criativos/audiências (como crm-meta-campaign-redesign):
//     o utilizador escolhe o que herdar; o plano emite existing_creative_id para os
//     herdados; validação/fallback pós-LLM. (Lógica COPIADA da redesign — decisão G2:
//     consolidar em _shared só na unificação do diagnóstico; redesign fica intocada.)
//   - POOL de herança = campanha morta + peers do mesmo evento (linked_event_id),
//     via crm-meta-redesign-inventory com event_id (event_inheritance_pool).
//
// O generated_plan segue o MESMO schema da redesign → deployado pelo
// crm-meta-strategy-deploy EXISTENTE, sem alterações (reuso de existing_creative_id).
//
// LLM só escreve (briefs/racional); estrutura, herança e decisões = determinístico.
// Diagnóstico: crm.campaign_diagnosis_360. Auth: user JWT.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { normalizePlanInPlace } from "../_shared/plan-normalize.ts";
import { resolveInterestsInPlace } from "../_shared/resolve-interests.ts";
import { resolveCustomLocationsInPlace } from "../_shared/resolve-geo.ts";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const AI_MODEL = "google/gemini-2.5-flash";
const TEMPERATURE = 0.3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function normalizeAdAccountId(raw: string): string {
  const c = (raw ?? "").trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}
function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return t.trim();
}
// Heurística de nome de artista (espelha a generate).
function detectArtist(eventName: string): string | null {
  if (!eventName) return null;
  let s = eventName;
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/\b(20\d{2}|19\d{2})\b/g, " ");
  s = s.replace(/\b\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?\b/g, " ");
  s = s.replace(/\b(ensaios?|tour|turn[eê]|show|shows|concerto|concertos|festival|live|ao vivo|apresenta|edi[cç][aã]o|especial|tributo|premi[eè]re|estreia|lisboa|porto|braga|coimbra|faro|aveiro|funchal|s[aã]o paulo|rio|bras[ií]lia|salvador|recife|forta?leza|curitiba|portugal|brasil|pt|br)\b/gi, " ");
  s = s.replace(/[•·\-–—|:,;]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.split(" ").filter(Boolean).slice(0, 3).join(" ") || null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: {
    campaign_id?: string;
    goal_revenue_eur?: number; ticket_avg_eur?: number; total_budget_eur?: number;
    target_roas?: number; country_codes?: string[]; user_notes?: string; strategy_name?: string;
    inheritance_decisions?: {
      inherit_creative_ids?: string[];
      discard_creative_ids?: string[];
      new_creatives_to_generate?: Array<{ phase_id: string; angle: string; gap_tag: string; justification: string }>;
      new_audiences_to_create?: Array<{ phase_id: string; type: string; description: string; gap_tag: string }>;
    };
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const campaignId = body.campaign_id;
  if (!campaignId) return json({ error: "missing_campaign_id" }, 400);
  if (!body.goal_revenue_eur || !body.ticket_avg_eur) {
    return json({ error: "missing_params", required: ["goal_revenue_eur", "ticket_avg_eur"] }, 400);
  }
  const goalRevenueEur = Number(body.goal_revenue_eur);
  const ticketAvgEur = Number(body.ticket_avg_eur);
  const totalBudgetEur = typeof body.total_budget_eur === "number" ? body.total_budget_eur : null;
  const targetRoas = typeof body.target_roas === "number" && body.target_roas > 0 ? body.target_roas : 9;
  const countries = body.country_codes && body.country_codes.length ? body.country_codes : ["PT", "BR"];
  const inh = body.inheritance_decisions ?? null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized", detail: userErr?.message }, 401);
  const userId = userData.user.id;

  // 1) Campanha morta (fonte da herança + evento)
  const { data: campaign, error: campErr } = await (supabase as any)
    .schema("crm").from("meta_campaign_snapshot")
    .select("company_id, connection_id, ad_account_id, external_campaign_id, name, linked_event_id")
    .eq("external_campaign_id", campaignId)
    .maybeSingle();
  if (campErr || !campaign) return json({ error: "campaign_not_found", detail: campErr?.message }, 404);

  // G5 — sem evento associado, não há estrutura-do-evento nem peers para herdar.
  const eventId: string | null = campaign.linked_event_id ?? null;
  if (!eventId) {
    return json({
      error: "no_linked_event",
      message: "Esta campanha não tem evento associado. Associa um evento à campanha ou usa o fluxo 'Nova estratégia' (/audience/strategies/new).",
    }, 422);
  }

  // 2) Token decifrado + ad account
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: campaign.connection_id, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken, company_id: companyId } = tokenRows[0] as { access_token: string; company_id: string };
  const adAccountId = normalizeAdAccountId(campaign.ad_account_id ?? "");

  // 3) Evento
  const { data: event, error: eventErr } = await supabase
    .from("events").select("id, name, date, location, tickets_total, ticketing_url")
    .eq("id", eventId).maybeSingle();
  if (eventErr || !event) return json({ error: "event_not_found", detail: eventErr?.message }, 404);
  const startAtIso = event.date ? new Date(event.date).toISOString() : null;
  const daysUntilEvent = startAtIso ? Math.max(0, Math.round((new Date(startAtIso).getTime() - Date.now()) / 86400000)) : null;
  const expectedPurchases = Math.ceil(goalRevenueEur / ticketAvgEur);
  const detectedArtist = detectArtist(event.name || "");

  // 4) Diagnóstico 360 (para source_diagnosis_id — decisão G9; best-effort)
  const { data: diagRow } = await (supabase as any)
    .schema("crm").from("campaign_diagnosis_360")
    .select("id, source_campaign_class")
    .eq("external_campaign_id", campaignId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const diagnosisId: string | null = diagRow?.id ?? null;

  // 5) POOL de herança (morta + peers do evento) via inventory com event_id (s2s)
  let pool: any = null;
  let peersLearnings: any[] = [];
  try {
    const invUrl = `${SUPABASE_URL}/functions/v1/crm-meta-redesign-inventory`;
    const invResp = await fetch(invUrl, {
      method: "POST",
      headers: {
        "Authorization": req.headers.get("Authorization") ?? "",
        "Content-Type": "application/json",
        "apikey": req.headers.get("apikey") ?? "",
      },
      body: JSON.stringify({ campaign_id: campaignId, event_id: eventId, period_days: 30 }),
    });
    if (invResp.ok) {
      const invJson = await invResp.json();
      pool = invJson?.event_inheritance_pool ?? null;
    } else {
      console.warn("[new-design] inventory_http", invResp.status);
    }
  } catch (e) {
    console.warn("[new-design] inventory_exception", (e as Error).message);
  }
  const poolCreatives: any[] = pool?.creatives ?? [];
  const poolAudiences: any[] = pool?.audiences ?? [];

  // 5.1) Cross-event learnings (ROAS/spend por campanha do evento) — aprendizado.
  const eventCampIds: string[] = (pool?.source_campaigns ?? []).map((c: any) => c.external_campaign_id);
  if (eventCampIds.length > 0) {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: peerIns } = await (supabase as any)
      .schema("crm").from("meta_campaign_insights_daily")
      .select("external_campaign_id, spend_cents, purchases_value_cents")
      .in("external_campaign_id", eventCampIds).gte("date_start", since);
    const agg = new Map<string, { spend: number; rev: number }>();
    for (const r of peerIns ?? []) {
      const a = agg.get(r.external_campaign_id) ?? { spend: 0, rev: 0 };
      a.spend += r.spend_cents ?? 0; a.rev += r.purchases_value_cents ?? 0;
      agg.set(r.external_campaign_id, a);
    }
    peersLearnings = (pool?.source_campaigns ?? []).map((c: any) => {
      const a = agg.get(c.external_campaign_id) ?? { spend: 0, rev: 0 };
      const roas = a.spend > 0 ? a.rev / a.spend : null;
      return { name: c.name, is_dead: c.external_campaign_id === campaignId, roas, spend_eur: a.spend / 100 };
    });
  }

  // 6) Herança SELETIVA: criativos escolhidos pelo utilizador (∩ pool). Sem
  //    decisões → vazio → plano 100% novo (todos os ads com creative_brief).
  const keepIds: string[] = inh?.inherit_creative_ids ?? [];
  const inheritedCreatives = poolCreatives
    .filter((c) => keepIds.includes(c.meta_creative_id))
    .map((c) => ({
      meta_creative_id: c.meta_creative_id,
      ad_name: c.ad_name ?? c.name ?? null,
      library: {
        id: c.library_id ?? null, name: c.name ?? null, type: c.type ?? null,
        file_url: c.file_url ?? null, headline: c.headline ?? null, body: c.body ?? null,
        cta_type: c.cta_type ?? null, link_url: c.link_url ?? null,
      },
    }));

  // 7) Contexto Graph (best-effort — espelha a generate)
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const safeFetch = async (url: URL): Promise<any> => {
    try { const r = await fetch(url); const j = await r.json(); if (!r.ok || j.error) return null; return j; }
    catch { return null; }
  };
  let topPerformers: any[] = [];
  try {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/campaigns`);
    u.searchParams.set("fields", `id,name,objective,insights.time_range({"since":"${since90}","until":"${until}"}){spend,purchase_roas}`);
    u.searchParams.set("limit", "50"); u.searchParams.set("access_token", accessToken);
    const j = await safeFetch(u);
    const ranked: any[] = [];
    for (const c of j?.data ?? []) {
      const ins = c.insights?.data?.[0]; if (!ins) continue;
      const roas = parseFloat(ins.purchase_roas?.[0]?.value ?? "0");
      const spend = parseFloat(ins.spend ?? "0");
      if (roas >= 3 && spend >= 50) ranked.push({ campaign_name: c.name, roas, spend_eur: spend });
    }
    ranked.sort((a, b) => b.roas - a.roas);
    topPerformers = ranked.slice(0, 5);
  } catch { /* ignore */ }
  let customAudiences: any[] = [];
  {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/customaudiences`);
    u.searchParams.set("fields", "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound");
    u.searchParams.set("limit", "100"); u.searchParams.set("access_token", accessToken);
    const j = await safeFetch(u); customAudiences = j?.data ?? [];
  }
  let interests: any[] = [];
  if (detectedArtist) {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/search`);
    u.searchParams.set("type", "adinterest"); u.searchParams.set("q", detectedArtist);
    u.searchParams.set("limit", "5"); u.searchParams.set("locale", "pt_PT"); u.searchParams.set("access_token", accessToken);
    const j = await safeFetch(u); interests = j?.data ?? [];
  }
  let pixels: any[] = [];
  {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/adspixels`);
    u.searchParams.set("fields", "id,name"); u.searchParams.set("access_token", accessToken);
    const j = await safeFetch(u); pixels = j?.data ?? [];
  }

  // 8) Blocos de herança no prompt (espelham a redesign, adaptados ao novo desenho)
  const inheritedBlock = inheritedCreatives.length > 0
    ? `\n== CRIATIVOS HERDADOS (escolhidos pelo utilizador) ==
Tens ${inheritedCreatives.length} criativo(s) que JÁ EXISTEM no Meta (da campanha morta e/ou de campanhas do mesmo evento). Distribui-os pelas fases com \`existing_creative_id\`.
${inheritedCreatives.map((c, i) => `  ${i + 1}. ${c.meta_creative_id} (type=${c.library?.type ?? "?"}) — "${c.library?.name ?? c.ad_name ?? "sem nome"}"${c.library?.headline ? ` | hook: "${c.library.headline}"` : ""}`).join("\n")}
REGRAS:
- Cada ad usa OU \`existing_creative_id\` OU \`creative_brief\`, NUNCA ambos.
- Compatibilidade formato×objective: em fases REACH/BRAND_AWARENESS/VIDEO_VIEWS (OUTCOME_AWARENESS no Meta) só podes referenciar \`existing_creative_id\` com type=video. Se não houver vídeo herdado, usa \`creative_brief\` para vídeo novo.
`
    : `\n== SEM CRIATIVOS HERDADOS ==
O utilizador optou por NÃO herdar criativos. Todos os ads devem ter \`creative_brief\` (criativos 100% novos).
`;

  const decisionsBlock = inh
    ? `\n== DECISÕES DE HERANÇA (HARD CONSTRAINTS) ==
Criativos a MANTER (usar existing_creative_id): ${keepIds.join(", ") || "(nenhum)"}
Criativos a NÃO usar: ${(inh.discard_creative_ids ?? []).join(", ") || "(nenhum)"}
Criativos NOVOS a gerar brief (segue o angle): ${(inh.new_creatives_to_generate ?? []).map((nc) => `[phase=${nc.phase_id} angle=${nc.angle} gap=${nc.gap_tag}]`).join(" ") || "(nenhum)"}
Audiences NOVAS a criar: ${(inh.new_audiences_to_create ?? []).map((na) => `[phase=${na.phase_id} type=${na.type} ${na.description}]`).join(" ") || "(nenhuma)"}
NÃO uses criativos fora das listas acima.
`
    : "";

  const peersBlock = peersLearnings.length > 0
    ? `\n== APRENDIZADO CROSS-EVENT (campanhas do mesmo evento, 30d) ==
${peersLearnings.map((p) => `- "${p.name}"${p.is_dead ? " [MORTA — a substituir]" : ""}: ROAS ${p.roas != null ? p.roas.toFixed(2) + "x" : "n/a"}, spend €${p.spend_eur.toFixed(0)}`).join("\n")}
Se algum peer tem ROAS claramente superior, incorpora o que faz diferente (audiences, ângulos) e cita em \`redesign_rationale\`.
`
    : "";

  // 9) Prompt (estrutura-do-evento da generate + schema da redesign p/ deploy)
  const prompt = `És um especialista em Meta Ads para eventos ao vivo (concertos, festivais) em Portugal e Brasil. A campanha anterior deste evento MORREU (ROAS ~0). Vais desenhar uma campanha NOVA DE RAIZ para o mesmo evento, reaproveitando seletivamente os assets que o utilizador escolheu.

IMPORTANTE: Esta estratégia será criada AUTOMATICAMENTE via Meta Marketing API. Os campos targeting_json, optimization_goal, billing_event, budgets e ads[] (existing_creative_id|creative_brief) são usados diretamente no payload. Foca-te em valores precisos e estruturados.

== OBJETIVO ==
- Evento: ${event.name}
- Data: ${startAtIso ?? "N/A"} (dias até evento: ${daysUntilEvent ?? "N/A"})
- Local: ${event.location || "N/A"} · Capacidade: ${event.tickets_total || "N/A"}
- Meta de receita: ${goalRevenueEur}€ · Ticket médio: ${ticketAvgEur}€ · Vendas necessárias: ${expectedPurchases}
- Verba total: ${totalBudgetEur ? totalBudgetEur + "€" : "calcular pelo ROAS alvo"}
- ROAS alvo BLENDED: ${targetRoas}x (agregado do evento; awareness 0–2x, conversão >=8x, retargeting 10–20x)
- Países: ${countries.join(", ")} · Notas: ${body.user_notes || "—"}

== CONTEXTO META ==
Artista detetado: ${detectedArtist || "—"}
Interesses Meta para "${detectedArtist || ""}": ${interests.map((i: any) => i.name).join(", ") || "—"}
TOP PERFORMERS (90d, ROAS>3): ${topPerformers.map((t: any) => `${t.campaign_name} ROAS ${t.roas.toFixed(2)}x`).join(" · ") || "(sem histórico)"}
CUSTOM AUDIENCES disponíveis: ${customAudiences.map((c: any) => `${c.name} (id: ${c.id})`).join("; ") || "(nenhuma)"}
Pixels: ${pixels.map((p: any) => p.name).join(", ") || "(nenhum)"}
${inheritedBlock}${decisionsBlock}${peersBlock}
== O QUE PRECISO ==
Desenha uma estratégia COMPLETA em FASES (3-5 conforme o tempo até ao evento). Regras:
1. Learning Phase: cada adset de conversão (OFFSITE_CONVERSIONS) precisa ~50 conv/7d.
2. Escalar verba gradualmente (não >5% do total/dia no arranque).
3. Audiences por fase: awareness=broad; engagement=interesses+LAL; conversão=custom/retargeting; final=warm retargeting (VC30d/ATC14d/IC7d) com urgência.
4. custom_audiences/exclusions: usa APENAS ids reais da lista acima, verbatim. exclusions é um OBJETO, nunca array. NUNCA inventes ids/placeholders.
5. interests: emite \`{name:"<nome real>"}\` (sem id; o sistema resolve). Nunca strings nuas nem ids inventados.
6. Cada ad usa existing_creative_id (herdado) OU creative_brief (novo), nunca ambos. Distribui pelo menos 1 ad por adset.
7. creative_brief (ads novos): headline_suggestion (30-50 chars), primary_text_suggestion (80-180 chars), cta_suggestion (GET_TICKETS|LEARN_MORE|SHOP_NOW|SIGN_UP) são OBRIGATÓRIOS.
8. BUDGET_WEIGHT POR ADSET (sugestão de proporção, NÃO euros): em cada adset emite \`budget_weight\` ∈ [0,1]. A soma dentro da mesma campanha deve aproximar-se de 1.0 (o sistema normaliza). NÃO emitas valores absolutos por adset — o euro é decidido pelo CÓDIGO a partir de daily_budget_eur da campanha × budget_weight. Se inseguro, OMITE em TODOS os adsets dessa campanha (o sistema reparte igualmente). Heurística: retargeting > prospecção; lookalike compradores > interesses frios.


== FORMATO DE RESPOSTA ==
APENAS JSON puro (sem markdown) com este schema EXATO:
{
  "redesign_rationale": "3-6 frases em PT: porquê este desenho novo é melhor que a campanha morta",
  "summary": { "feasibility": "high|medium|low|impossible", "feasibility_reason": "...", "recommended_total_budget_eur": <n>, "expected_purchases": <n>, "expected_revenue_eur": <n>, "expected_overall_roas": <n>, "expected_cpa_eur": <n>, "confidence": "high|medium|low" },
  "phases": [ { "id": "phase_1_awareness", "name": "Awareness", "days_from_event_start": 60, "days_from_event_end": 45, "duration_days": 15, "objective": "REACH|TRAFFIC|OFFSITE_CONVERSIONS|VIDEO_VIEWS", "daily_budget_eur": <n>, "total_phase_budget_eur": <n>, "primary_audiences": [ {"type":"broad|interest|lookalike|custom|retargeting","description":"...","estimated_size":"..."} ], "creative_focus": "video_30s|carousel|single_image|reel", "target_kpis": {"cpm_eur_max":<n>,"ctr_pct_min":<n>,"cpa_eur_max":<n>,"roas_min":<n>}, "success_criteria_to_next_phase": "...", "learning_phase_note": "...", "expected_blended_contribution": <0-1> } ],
  "recommended_campaigns": [ { "phase_id": "phase_1_awareness", "campaign_name": "[NEW] {event} - REACH - Broad", "objective": "REACH", "daily_budget_eur": 50, "duration_days": 15, "adsets": [ { "adset_name": "Broad PT/BR 18-55", "budget_weight": 0.5, "targeting_json": {"age_min":18,"age_max":55,"geo_locations":{"countries":["PT","BR"]},"publisher_platforms":["facebook","instagram"],"custom_audiences":[{"id":"<id real ou omitir>"}],"exclusions":{"custom_audiences":[{"id":"<id real ou omitir>"}]},"interests":[{"name":"<nome real>"}]}, "optimization_goal": "REACH", "billing_event": "IMPRESSIONS", "creative_type_recommended": "video", "ads": [ {"existing_creative_id":"<meta_creative_id herdado>"}, {"creative_brief":{"primary_message":"...","tone":"...","must_include":["..."],"avoid":["..."],"headline_suggestion":"<30-50 chars>","primary_text_suggestion":"<80-180 chars>","cta_suggestion":"GET_TICKETS","destination_url_hint":${event.ticketing_url ? `"${event.ticketing_url}"` : "null"}}} ] } ] } ],
  "scaling_rules": [ {"trigger":"...","action":"...","rationale":"..."} ],
  "kpis_global": { "expected_total_impressions": <n>, "expected_total_reach": <n>, "expected_total_clicks": <n>, "expected_avg_frequency": <n>, "expected_total_purchases": <n> },
  "risks_and_warnings": [ {"severity":"high|medium|low","title":"...","description":"..."} ],
  "creative_brief": { "primary_message": "...", "tone": "...", "must_include": ["..."], "avoid": ["..."] },
  "automation_metadata": { "ready_to_deploy": true, "estimated_api_calls": <n>, "warnings_before_deploy": ["..."], "requires_manual_setup": ["..."] }
}
Sê preciso, realista e crítico. Números coerentes entre si.`;

  // 10) Chamar Lovable AI
  const callGemini = async (): Promise<Response> =>
    fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, temperature: TEMPERATURE, messages: [{ role: "user", content: prompt }] }),
    });
  let aiResp = await callGemini();
  if (aiResp.status === 429) { await new Promise((r) => setTimeout(r, 1500)); aiResp = await callGemini(); }
  if (aiResp.status === 429) return json({ error: "rate_limited", message: "Lovable AI rate limit; tenta novamente." }, 429);
  if (aiResp.status === 402) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);
  if (!aiResp.ok) { const t = await aiResp.text(); return json({ error: "ai_gateway_error", status: aiResp.status, detail: t.slice(0, 500) }, 502); }

  const aiJson = await aiResp.json();
  const rawText: string = aiJson?.choices?.[0]?.message?.content ?? "";
  const usageTokens: number | null = aiJson?.usage?.total_tokens ?? null;
  let plan: any;
  try { plan = JSON.parse(stripJsonFences(rawText)); }
  catch (e) { return json({ error: "ai_invalid_json", message: "Modelo devolveu JSON inválido.", raw_preview: rawText.slice(0, 800) }, 502); }

  // 11) Normalização/resolução determinística pós-LLM (partilhada com a generate)
  const warnings = normalizePlanInPlace(plan);
  if (warnings.length > 0) plan._normalization_warnings = warnings;
  const interestWarnings = await resolveInterestsInPlace(plan, { accessToken, apiVersion: GRAPH_API_VERSION, locale: "pt_PT" });
  const geoWarnings = await resolveCustomLocationsInPlace(plan, { accessToken, apiVersion: GRAPH_API_VERSION, locale: "pt_PT" });
  if (interestWarnings.length || geoWarnings.length) {
    plan._normalization_warnings = [...(plan._normalization_warnings ?? []), ...interestWarnings, ...geoWarnings];
  }

  // 12) Herança pós-LLM (COPIADO da redesign — anexar + validar + fallback + enforce)
  plan.inherited_creatives = inheritedCreatives.map((c) => ({
    meta_creative_id: c.meta_creative_id,
    ad_name: c.ad_name,
    library_id: c.library?.id ?? null,
    name: c.library?.name ?? c.ad_name ?? null,
    type: c.library?.type ?? null,
    file_url: c.library?.file_url ?? null,
    headline: c.library?.headline ?? null,
    body: c.library?.body ?? null,
    cta_type: c.library?.cta_type ?? null,
    link_url: c.library?.link_url ?? null,
  }));
  const validInheritedSet = new Set(inheritedCreatives.map((c) => c.meta_creative_id));
  let inheritedAdsCount = 0;
  for (const c of plan?.recommended_campaigns ?? []) {
    for (const a of c?.adsets ?? []) {
      if (!Array.isArray(a.ads)) continue;
      a.ads = a.ads.map((ad: any) => {
        const hasExisting = typeof ad?.existing_creative_id === "string" && validInheritedSet.has(ad.existing_creative_id);
        const hasBrief = ad?.creative_brief && typeof ad.creative_brief === "object";
        if (hasExisting && hasBrief) delete ad.creative_brief;            // mutuamente exclusivo
        if (hasExisting) inheritedAdsCount++;
        if (!hasExisting && typeof ad?.existing_creative_id === "string") delete ad.existing_creative_id; // ref inválida
        return ad;
      });
    }
  }
  // Fallback: há herdados escolhidos mas a IA não usou nenhum → distribui nos adsets vazios.
  if (inheritedCreatives.length > 0 && inheritedAdsCount === 0) {
    for (const c of plan?.recommended_campaigns ?? []) {
      for (const a of c?.adsets ?? []) {
        if (!Array.isArray(a.ads) || a.ads.length === 0) {
          a.ads = inheritedCreatives.map((ic) => ({ existing_creative_id: ic.meta_creative_id }));
        }
      }
    }
  }
  // Enforce: quando há decisões, ads herdados só podem usar criativos aprovados.
  if (inh) {
    const allowedCreativeSet = new Set(keepIds);
    for (const c of plan?.recommended_campaigns ?? []) {
      for (const a of c?.adsets ?? []) {
        if (!Array.isArray(a.ads)) continue;
        a.ads = a.ads.filter((ad: any) =>
          typeof ad?.existing_creative_id !== "string" || allowedCreativeSet.has(ad.existing_creative_id));
      }
    }
  }

  // 13) Persistir nova strategy (mesmo schema → deploy existente)
  const stratName = body.strategy_name?.trim() || `Novo desenho — ${event.name}`.slice(0, 200);
  const { data: inserted, error: insErr } = await (supabase as any)
    .schema("crm").from("meta_campaign_strategies")
    .insert({
      company_id: companyId,
      connection_id: campaign.connection_id,
      ad_account_id: adAccountId,
      event_id: eventId,
      name: stratName,
      goal_revenue_eur: goalRevenueEur,
      ticket_avg_eur: ticketAvgEur,
      total_budget_eur: totalBudgetEur,
      target_roas: targetRoas,
      days_until_event: daysUntilEvent,
      country_codes: countries,
      user_notes: body.user_notes ?? `Novo desenho a partir da campanha morta ${campaignId} (${campaign.name})`,
      detected_artist: detectedArtist,
      generated_plan: plan,
      generation_model: AI_MODEL,
      generation_tokens_used: usageTokens,
      generated_at: new Date().toISOString(),
      status: "generated",
      source_campaign_id: campaign.external_campaign_id,
      source_diagnosis_id: diagnosisId,
      inheritance_decisions: inh ?? null,
      created_by: userId,
    })
    .select("id").single();
  if (insErr || !inserted) {
    console.error("[new-design] persist failed", insErr);
    return json({ error: "persist_failed", detail: insErr?.message, plan }, 500);
  }

  console.log(`[new-design] done strategy=${inserted.id} inherited=${inheritedCreatives.length} pool=${poolCreatives.length}`);
  return json({
    strategy_id: inserted.id,
    event: { id: event.id, name: event.name, start_at: startAtIso, days_until_event: daysUntilEvent },
    source_campaign_id: campaign.external_campaign_id,
    source_diagnosis_id: diagnosisId,
    inherited_count: inheritedCreatives.length,
    pool_count: poolCreatives.length,
    plan,
    generated_at: new Date().toISOString(),
  });
});
