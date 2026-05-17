// crm-meta-campaign-redesign (Fase 3 — Re-design)
// POST { campaign_id, diagnosis_id?, period_days? }
// Lê campanha + diagnóstico + dados granulares e gera variante optimizada,
// persistindo em crm.meta_campaign_strategies (status='generated').
//
// Reutiliza o schema generated_plan do crm-meta-campaign-strategy-generate
// para que crm-meta-strategy-deploy continue a funcionar sem alterações.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const AI_MODEL = "google/gemini-2.5-flash";

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
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return t.trim();
}

type Agg = {
  impressions: number; reach: number; clicks: number;
  spendCents: number; purchases: number; purchasesValueCents: number;
  frequencySum: number; frequencyN: number;
};
const emptyAgg = (): Agg => ({ impressions: 0, reach: 0, clicks: 0, spendCents: 0, purchases: 0, purchasesValueCents: 0, frequencySum: 0, frequencyN: 0 });

function metricsOf(a: Agg) {
  const ctr = a.impressions > 0 ? a.clicks / a.impressions : 0;
  const cpcEur = a.clicks > 0 ? (a.spendCents / a.clicks) / 100 : 0;
  const cpaEur = a.purchases > 0 ? (a.spendCents / a.purchases) / 100 : null;
  const roas = a.spendCents > 0 ? a.purchasesValueCents / a.spendCents : null;
  const freq = a.frequencyN > 0 ? a.frequencySum / a.frequencyN : 0;
  return {
    spend_eur: a.spendCents / 100,
    revenue_eur: a.purchasesValueCents / 100,
    impressions: a.impressions, reach: a.reach, clicks: a.clicks, purchases: a.purchases,
    ctr, cpc_eur: cpcEur, cpa_eur: cpaEur, roas, frequency: freq,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: {
    campaign_id?: string;
    diagnosis_id?: string;
    period_days?: number;
    constraints?: {
      keep_original_budget?: boolean;
      daily_budget_cents?: number;
      lifetime_budget_cents?: number;
      roas_floor?: number;
      end_time?: string;
    };
    // Sprint 3a-2 — opcionais (retrocompatível: chamada sem estes campos preserva comportamento).
    inheritance_decisions?: {
      inherit_creative_ids?: string[];
      discard_creative_ids?: string[];
      inherit_adset_ids?: string[];
      discard_adset_ids?: string[];
      new_creatives_to_generate?: Array<{ phase_id: string; angle: string; gap_tag: string; justification: string }>;
      new_audiences_to_create?: Array<{ phase_id: string; type: string; description: string; gap_tag: string }>;
    };
    pause_original_mode?: "immediate" | "delayed_7d" | "manual";
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const campaignId = body.campaign_id;
  if (!campaignId) return json({ error: "missing_campaign_id" }, 400);
  const periodDays = Math.min(Math.max(body.period_days ?? 30, 7), 90);
  const ctIn = body.constraints ?? {};
  const inh = body.inheritance_decisions ?? null;
  const pauseOriginalMode: "immediate" | "delayed_7d" | "manual" =
    body.pause_original_mode === "delayed_7d" || body.pause_original_mode === "manual"
      ? body.pause_original_mode
      : "immediate";

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized", detail: userErr?.message }, 401);
  const userId = userData.user.id;

  // 1) Campanha original
  const { data: campaign, error: campErr } = await (supabase as any)
    .schema("crm").from("meta_campaign_snapshot")
    .select("company_id, connection_id, ad_account_id, external_campaign_id, name, status, effective_status, objective, currency, linked_event_id, daily_budget_cents, lifetime_budget_cents")
    .eq("external_campaign_id", campaignId)
    .maybeSingle();
  if (campErr || !campaign) return json({ error: "campaign_not_found", detail: campErr?.message }, 404);

  // 2) Diagnóstico (fornecido ou mais recente)
  let diagnosis: any = null;
  if (body.diagnosis_id) {
    const { data: d } = await (supabase as any)
      .schema("crm").from("meta_campaign_diagnoses")
      .select("*").eq("id", body.diagnosis_id).maybeSingle();
    diagnosis = d ?? null;
  } else {
    const { data: d } = await (supabase as any)
      .schema("crm").from("meta_campaign_diagnoses")
      .select("*").eq("external_campaign_id", campaignId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    diagnosis = d ?? null;
  }
  if (!diagnosis) {
    return json({ error: "no_diagnosis", message: "Faz primeiro um diagnóstico desta campanha." }, 422);
  }
  const diagnosisId = diagnosis.id;

  // 3) Período + insights agregados (campanha + adsets agregados)
  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);
  const since = new Date(today); since.setUTCDate(since.getUTCDate() - (periodDays - 1));
  const fromDate = since.toISOString().slice(0, 10);

  const { data: campInsights } = await (supabase as any)
    .schema("crm").from("meta_campaign_insights_daily")
    .select("impressions, reach, frequency, clicks, spend_cents, purchases_count, purchases_value_cents")
    .eq("external_campaign_id", campaignId).gte("date_start", fromDate).lte("date_start", toDate);

  const campAgg = emptyAgg();
  for (const r of campInsights ?? []) {
    campAgg.impressions += r.impressions ?? 0;
    campAgg.reach = Math.max(campAgg.reach, r.reach ?? 0);
    campAgg.clicks += r.clicks ?? 0;
    campAgg.spendCents += r.spend_cents ?? 0;
    campAgg.purchases += r.purchases_count ?? 0;
    campAgg.purchasesValueCents += r.purchases_value_cents ?? 0;
    if (r.frequency != null) { campAgg.frequencySum += r.frequency; campAgg.frequencyN++; }
  }
  const campMetrics = metricsOf(campAgg);

  const { data: adsets } = await (supabase as any)
    .schema("crm").from("meta_adset_snapshot")
    .select("external_adset_id, name, optimization_goal, billing_event")
    .eq("external_campaign_id", campaignId);
  const adsetIds: string[] = (adsets ?? []).map((a: any) => a.external_adset_id);

  // 3.1) Criativos herdados — reaproveitar por defeito
  const { data: ads } = await (supabase as any)
    .schema("crm").from("meta_ad_snapshot")
    .select("meta_creative_id, name, effective_status")
    .eq("external_campaign_id", campaignId)
    .in("effective_status", ["ACTIVE", "PAUSED"])
    .not("meta_creative_id", "is", null);
  const inheritedMap = new Map<string, { meta_creative_id: string; ad_name: string | null; library: any | null }>();
  for (const a of ads ?? []) {
    if (!a.meta_creative_id) continue;
    if (!inheritedMap.has(a.meta_creative_id)) {
      inheritedMap.set(a.meta_creative_id, { meta_creative_id: a.meta_creative_id, ad_name: a.name ?? null, library: null });
    }
  }
  const inheritedIds = [...inheritedMap.keys()];
  if (inheritedIds.length > 0) {
    const { data: lib } = await (supabase as any)
      .schema("crm").from("meta_creatives")
      .select("id, name, type, file_url, headline, body, meta_creative_id")
      .in("meta_creative_id", inheritedIds);
    for (const c of lib ?? []) {
      const slot = inheritedMap.get(c.meta_creative_id);
      if (slot) slot.library = c;
    }
  }
  const inheritedCreatives = [...inheritedMap.values()];

  // 4) Evento + ticket avg
  let eventCtx: { id?: string; name?: string; date?: string; daysUntil?: number | null; tickets_total?: number | null; location?: string | null } = {};
  if (campaign.linked_event_id) {
    const { data: e } = await supabase.from("events")
      .select("id, name, date, location, tickets_total")
      .eq("id", campaign.linked_event_id).maybeSingle();
    if (e) {
      const daysUntil = e.date ? Math.max(0, Math.round((new Date(e.date).getTime() - Date.now()) / 86400000)) : null;
      eventCtx = { id: e.id, name: e.name, date: e.date, daysUntil, tickets_total: e.tickets_total, location: e.location };
    }
  }

  // 4b) Cross-event context — peers do mesmo evento (Sprint 3a-2).
  let crossEventContextText = "";
  if (campaign.linked_event_id) {
    const { data: peersRaw } = await (supabase as any)
      .schema("crm").from("meta_campaign_snapshot")
      .select("external_campaign_id, name, status, effective_status")
      .eq("linked_event_id", campaign.linked_event_id)
      .neq("external_campaign_id", campaignId)
      .limit(5);
    const peers = peersRaw ?? [];
    if (peers.length > 0) {
      const peerIds: string[] = peers.map((p: any) => p.external_campaign_id);
      const { data: peerInsights } = await (supabase as any)
        .schema("crm").from("meta_campaign_insights_daily")
        .select("external_campaign_id, impressions, reach, clicks, spend_cents, purchases_count, purchases_value_cents, frequency")
        .in("external_campaign_id", peerIds)
        .gte("date_start", fromDate).lte("date_start", toDate);
      const peerAggsMap = new Map<string, Agg>();
      for (const id of peerIds) peerAggsMap.set(id, emptyAgg());
      for (const r of peerInsights ?? []) {
        const a = peerAggsMap.get(r.external_campaign_id);
        if (!a) continue;
        a.impressions += r.impressions ?? 0;
        a.reach = Math.max(a.reach, r.reach ?? 0);
        a.clicks += r.clicks ?? 0;
        a.spendCents += r.spend_cents ?? 0;
        a.purchases += r.purchases_count ?? 0;
        a.purchasesValueCents += r.purchases_value_cents ?? 0;
        if (r.frequency != null) { a.frequencySum += r.frequency; a.frequencyN++; }
      }
      const lines: string[] = [];
      for (const p of peers) {
        const a = peerAggsMap.get(p.external_campaign_id) ?? emptyAgg();
        const m = metricsOf(a);
        const status = p.effective_status ?? p.status ?? "?";
        lines.push(`- "${p.name}" [${status}]: ROAS ${m.roas != null ? m.roas.toFixed(2) + "x" : "n/a"}, spend €${m.spend_eur.toFixed(2)}, ${m.purchases} compras`);
      }
      crossEventContextText = `\n== CONTEXTO CROSS-EVENT ==\nOutras campanhas do mesmo evento${eventCtx.name ? ` (${eventCtx.name})` : ""}:\n${lines.join("\n")}\n\nSe peers têm ROAS médio significativamente superior, identifica o que estão a fazer diferente e incorpora esse padrão no plano novo (audiences, ângulos criativos, distribuição de verba por fase). Cita explicitamente em \`redesign_rationale\` se aplicável.\n`;
    }
  }

  // 5) Resolve constraints efectivas
  const keepOriginal = ctIn.keep_original_budget !== false; // default true
  let effDailyCents: number | null = typeof ctIn.daily_budget_cents === "number" ? ctIn.daily_budget_cents : null;
  let effLifetimeCents: number | null = typeof ctIn.lifetime_budget_cents === "number" ? ctIn.lifetime_budget_cents : null;
  if (keepOriginal && effDailyCents == null && effLifetimeCents == null) {
    effDailyCents = campaign.daily_budget_cents ?? null;
    effLifetimeCents = campaign.lifetime_budget_cents ?? null;
  }
  const effRoasFloor: number | null = typeof ctIn.roas_floor === "number" ? ctIn.roas_floor : null;
  const effEndTime: string | null = typeof ctIn.end_time === "string" && ctIn.end_time ? ctIn.end_time : null;
  // Target BLENDED ROAS para o evento (piso da meta — redesign corrige campanha existente face a este piso).
  // Default 8 (não 9 como em strategy-generate; aqui é piso, não centro da banda).
  const targetBlendedRoas: number = typeof ctIn.roas_floor === "number" && ctIn.roas_floor > 0 ? ctIn.roas_floor : 8;

  const constraintLines: string[] = [];
  if (effDailyCents != null) constraintLines.push(`- Verba diária TOTAL da campanha: €${(effDailyCents / 100).toFixed(2)}/dia (não inventes valor diferente)`);
  if (effLifetimeCents != null) constraintLines.push(`- Verba lifetime TOTAL da campanha: €${(effLifetimeCents / 100).toFixed(2)} (não inventes valor diferente)`);
  if (effRoasFloor != null) constraintLines.push(`- ROAS mínimo (floor): ${effRoasFloor.toFixed(2)}x — todos os adsets devem ter target_kpis.roas_min ≥ ${effRoasFloor.toFixed(2)}`);
  if (effEndTime) constraintLines.push(`- Data de fim da campanha: ${effEndTime} (calcular duration_days a partir daqui)`);
  const constraintsBlock = constraintLines.length > 0
    ? `\n\n== CONSTRAINTS RÍGIDAS (NÃO NEGOCIÁVEIS) ==\nRespeita EXACTAMENTE os seguintes limites. Não inventes valores diferentes:\n${constraintLines.join("\n")}\n`
    : "";

  // 5b) Análise de viabilidade (Sprint 3c-2) — calcula apenas, não prescreve.
  // Métricas concretas para o prompt ancorar o juízo da IA na realidade.
  const TICKET_AVG_FALLBACK_EUR = 25;
  function analyzeViability() {
    const targetRoas = targetBlendedRoas;
    const currentRoas = campMetrics.roas ?? 0;
    const eventGoalRevenue = (eventCtx.tickets_total ?? 0) * TICKET_AVG_FALLBACK_EUR;
    const daysUntil = eventCtx.daysUntil ?? 60;
    const currentDailySpend = (campAgg.spendCents / 100) / Math.max(1, periodDays);

    const needPurchases = eventGoalRevenue > 0 ? Math.ceil(eventGoalRevenue / TICKET_AVG_FALLBACK_EUR) : null;
    const currentPurchaseRate = campAgg.purchases / Math.max(1, periodDays);
    const projectedPurchases = currentPurchaseRate * daysUntil;

    const spendNeededForGoal = eventGoalRevenue > 0 ? eventGoalRevenue / targetRoas : null;
    const dailySpendNeeded = spendNeededForGoal != null && daysUntil > 0 ? spendNeededForGoal / daysUntil : null;

    const statisticalFloorSpend = 2000;
    const statisticalFloorPurchases = 50;
    const currentProjectedSpend = currentDailySpend * daysUntil;
    const meetsStatFloor = currentProjectedSpend >= statisticalFloorSpend
      || projectedPurchases >= statisticalFloorPurchases;

    const roasGap = targetRoas > 0 ? targetRoas / Math.max(0.1, currentRoas) : null;
    let gapSeverity: "comfortable" | "stretch" | "aggressive" | "unrealistic" = "comfortable";
    if (roasGap != null) {
      if (roasGap < 1.5) gapSeverity = "comfortable";
      else if (roasGap < 2.5) gapSeverity = "stretch";
      else if (roasGap < 4.0) gapSeverity = "aggressive";
      else gapSeverity = "unrealistic";
    }

    return {
      target_roas: targetRoas,
      current_roas: currentRoas,
      roas_gap_multiplier: roasGap,
      gap_severity: gapSeverity,
      event_goal_revenue_eur: eventGoalRevenue,
      need_purchases: needPurchases,
      projected_purchases_at_current_rate: Math.round(projectedPurchases),
      current_daily_spend_eur: currentDailySpend,
      projected_total_spend_eur: currentProjectedSpend,
      daily_spend_needed_for_goal_eur: dailySpendNeeded,
      days_until_event: daysUntil,
      statistical_floor_spend_eur: statisticalFloorSpend,
      statistical_floor_purchases: statisticalFloorPurchases,
      meets_statistical_floor: meetsStatFloor,
    };
  }

  const viability = analyzeViability();

  const viabilityBlock = `
== ANÁLISE DE VIABILIDADE DO BUDGET ACTUAL (CONTEXTO PARA O TEU JUÍZO) ==

Métricas calculadas a partir dos dados reais:
- ROAS actual: ${viability.current_roas.toFixed(2)}x | ROAS alvo: ${viability.target_roas.toFixed(1)}x
- Gap ROAS: ${viability.roas_gap_multiplier != null ? viability.roas_gap_multiplier.toFixed(1) + "x" : "N/A"} (severity: **${viability.gap_severity}**)
- Goal de receita do evento (estimado, ticket avg €${TICKET_AVG_FALLBACK_EUR}): €${viability.event_goal_revenue_eur.toFixed(0)}
- Compras necessárias: ${viability.need_purchases ?? "N/A"}
- Spend diário actual: €${viability.current_daily_spend_eur.toFixed(2)}/dia
- Spend total projectado até evento (no ritmo actual): €${viability.projected_total_spend_eur.toFixed(0)}
- Spend diário necessário para hit goal ao ROAS alvo: ${viability.daily_spend_needed_for_goal_eur != null ? "€" + viability.daily_spend_needed_for_goal_eur.toFixed(2) + "/dia" : "N/A"}
- Compras projectadas no ritmo actual: ${viability.projected_purchases_at_current_rate}
- Dias até evento: ${viability.days_until_event}

Floor estatístico para validar a tese (mínimo absoluto para concluir algo):
- ≥ €${viability.statistical_floor_spend_eur} spend acumulado OU ≥ ${viability.statistical_floor_purchases} compras agregadas
- Cumpre actualmente: ${viability.meets_statistical_floor ? "SIM" : "NÃO"}

INSTRUÇÕES DE USO DESTAS MÉTRICAS:

1. **Não inventes números fora deste contexto.** Os teus expected_purchases / expected_revenue / recommended_total_budget devem ser COERENTES com a realidade actual. Se propões ROAS ${viability.target_roas.toFixed(1)}x quando actual é ${viability.current_roas.toFixed(2)}x, justifica especificamente como (que adsets pausar, que criativos escalar, etc.).

2. **Calibra a viabilidade no gap_severity:**
   - 'comfortable' (gap < 1.5x): feasibility=high, confidence=high é OK
   - 'stretch' (1.5–2.5x): feasibility=high mas confidence=medium é o teto
   - 'aggressive' (2.5–4x): feasibility=medium, confidence=medium ou low
   - 'unrealistic' (>4x): feasibility=low ou impossible, confidence=low. Marca claramente em feasibility_reason que o gap é grande demais sem mudança operacional radical (criativos novos, audiences novas, etc.).

3. **Budget analysis (NOVO — campo budget_recommendation):**
   No JSON de output, preenche \`budget_recommendation\` com sugestão de ajuste (mais detalhes no schema). Regras:
   - Se gap_severity='comfortable' e meets_floor=true: adjustment_direction='maintain' (sugestão = actual).
   - Se gap_severity='stretch'/'aggressive' e meets_floor=true: pode sugerir 'increase' moderado (15-50%) ou 'maintain'. Reason explica.
   - Se !meets_floor: SEMPRE sugerir 'increase' suficiente para chegar a statistical_floor_spend até à data do evento. floor_warning preenchido.
   - Se gap_severity='unrealistic': sugerir reanalisar premissa (ex: reduzir goal_revenue, prolongar prazo, ou aceitar ROAS menor). adjustment_direction='maintain' e floor_warning explica.

4. **Verba no plano não é prescrição autoritária — é sugestão informada.** O utilizador decide.

5. **feasibility_reason DEVE citar números concretos do contexto acima.** Ex: "ROAS actual 1.89x vs alvo 8x = gap 4.2x (unrealistic). Sem recalibração criativa profunda e expansão de audience, target não é atingível mesmo com 5x mais spend."
`;

  // 6) Prompt
  const diagJsonStr = JSON.stringify(diagnosis.diagnosis_jsonb ?? {}).slice(0, 12000);
  const countries = ["PT", "BR"];

  // 6a) Inheritance decisions text — só quando body.inheritance_decisions presente.
  let inheritanceDecisionsText = "";
  if (inh) {
    const keepCreativeIds: string[] = inh.inherit_creative_ids ?? [];
    const discardCreativeIds: string[] = inh.discard_creative_ids ?? [];
    const keepAdsetIds: string[] = inh.inherit_adset_ids ?? [];
    const discardAdsetIds: string[] = inh.discard_adset_ids ?? [];
    const newCreatives = inh.new_creatives_to_generate ?? [];
    const newAudiences = inh.new_audiences_to_create ?? [];

    const keepCreativeDetails = keepCreativeIds.map((cid) => {
      const found = inheritedCreatives.find((c) => c.meta_creative_id === cid);
      return found
        ? `  - ${cid}: "${found.library?.name ?? found.ad_name ?? "?"}"${found.library?.headline ? ` (hook: "${found.library.headline}")` : ""}`
        : `  - ${cid}`;
    }).join("\n");

    let keepAdsetDetails = "";
    if (keepAdsetIds.length > 0) {
      const { data: keepAdsetsData } = await (supabase as any)
        .schema("crm").from("meta_adset_snapshot")
        .select("external_adset_id, name, optimization_goal, targeting")
        .in("external_adset_id", keepAdsetIds);
      keepAdsetDetails = (keepAdsetsData ?? []).map((a: any) => {
        const t = a.targeting ?? {};
        const countries = (t.geo_locations?.countries ?? []).slice(0, 3).join("/");
        const age = `${t.age_min ?? "?"}-${t.age_max ?? "?"}`;
        const interestArr = t.flexible_spec?.[0]?.interests ?? t.interests ?? [];
        const interests = interestArr.slice(0, 2).map((i: any) => i.name).filter(Boolean).join(", ");
        const customs = (t.custom_audiences ?? []).length;
        const summary = [
          countries && `geo: ${countries}`,
          `age ${age}`,
          interests && `interests: ${interests}`,
          customs > 0 && `${customs} custom audience(s)`,
        ].filter(Boolean).join(" · ");
        return `  - ${a.external_adset_id}: "${a.name}" [${a.optimization_goal ?? "?"}] — ${summary || "broad"}`;
      }).join("\n");
    }

    const discardCreativeLine = discardCreativeIds.join(", ") || "(nenhum)";
    const discardAdsetLine = discardAdsetIds.join(", ") || "(nenhum)";

    const newCreativeLines = newCreatives.length > 0
      ? newCreatives.map((nc, i) =>
          `  ${i + 1}. phase=${nc.phase_id} | angle=${nc.angle} | gap=${nc.gap_tag} | razão: ${nc.justification}`
        ).join("\n")
      : "  (nenhum)";

    const newAudienceLines = newAudiences.length > 0
      ? newAudiences.map((na, i) =>
          `  ${i + 1}. phase=${na.phase_id} | type=${na.type} | gap=${na.gap_tag} | descrição: ${na.description}`
        ).join("\n")
      : "  (nenhuma)";

    inheritanceDecisionsText = `\n== DECISÕES DE HERANÇA DO UTILIZADOR (HARD CONSTRAINTS) ==
O utilizador já reviu o inventário desta campanha e decidiu o que herdar/descartar. Respeita EXACTAMENTE estas escolhas — NÃO inventes assets fora destas listas.

Criativos a MANTER (usar existing_creative_id em ads, distribuir pelas fases):
${keepCreativeDetails || "  (nenhum)"}

Criativos a NÃO usar:
${discardCreativeLine}

Adsets cujo TARGETING deve ser preservado (recria adsets equivalentes nas novas campanhas, mantendo geo/age/interests/audiences):
${keepAdsetDetails || "  (nenhum)"}

Adsets a NÃO recriar (targeting falhou — evita padrões similares):
${discardAdsetLine}

Criativos NOVOS a gerar brief (utilizador aprovou estas lacunas — segue o angle especificado):
${newCreativeLines}

Audiences NOVAS a criar (utilizador aprovou):
${newAudienceLines}

REGRAS RÍGIDAS:
- Cada ad de cada adset deve referenciar APENAS criativos das listas: inherit_creative_ids OU criativos novos cujo brief está acima
- NÃO recries adsets com targeting similar aos descartados
- Para cada novo creative_brief proposto, segue o angle e gap_tag indicados
- Distribui os criativos herdados pelos adsets de forma sensata (cada fase deve ter pelo menos 1 ad)
`;
  }

  const inheritedBlock = inheritedCreatives.length > 0
    ? `\n== CRIATIVOS DISPONÍVEIS (REAPROVEITAR POR DEFEITO) ==
A campanha original tem ${inheritedCreatives.length} criativo(s) que JÁ EXISTEM no Meta. **Reaproveita-os por defeito** — não peças briefs novos para o que já está bom.

Lista (Meta creative_id → descrição):
${inheritedCreatives.map((c, i) => `  ${i + 1}. ${c.meta_creative_id} — "${c.library?.name ?? c.ad_name ?? "sem nome"}"${c.library?.headline ? ` | hook: "${c.library.headline}"` : ""}`).join("\n")}

REGRAS PARA OS \`ads\` DE CADA ADSET:
- Para cada ad no plano, indica \`existing_creative_id: "<meta_creative_id>"\` em vez de pedir um brief novo.
- Distribui os criativos herdados pelos adsets de forma sensata (todos em todas as fases por defeito, salvo se a fase pedir criativo específico).
- Só sugere \`creative_brief\` (em alternativa) se o diagnóstico identificou problema concreto num criativo (hook_score < 60, audio_score < 60, congruência baixa) — nesse caso preenche \`creative_replacement_reason\` a explicar.
- Cada ad usa OR \`existing_creative_id\` OR \`creative_brief\`, NUNCA ambos.
`
    : "";

  const prompt = `⚠️ IDIOMA OBRIGATÓRIO: TODOS OS CAMPOS TEXTUAIS DA RESPOSTA JSON DEVEM SER ESCRITOS EM PORTUGUÊS (PT-BR preferencial — público maioritário é Brasil).
Mantém em inglês APENAS: nomes próprios, marcas, IDs, e termos técnicos (hook, CTA, ROAS, CTR, CPA).

És um especialista sênior em Meta Ads para eventos ao vivo (concertos, festivais) na Mundo Propício, em Portugal e Brasil.

TAREFA: A campanha abaixo já existe no Meta Ads e foi diagnosticada. Vais propor uma VARIANTE OPTIMIZADA (re-design) que aplique as recomendações do diagnóstico — novas fases, novos adsets, nova alocação de verba, novos targetings. O resultado será criado AUTOMATICAMENTE no Meta via Marketing API (tudo PAUSED). Os campos targeting_json, optimization_goal, billing_event e budgets vão ser usados directamente no payload.

== CAMPANHA ORIGINAL ==
- ID: ${campaign.external_campaign_id}
- Nome: ${campaign.name}
- Objetivo: ${campaign.objective ?? "N/A"}
- Status efetivo: ${campaign.effective_status ?? campaign.status}
- Moeda: ${campaign.currency ?? "EUR"}
- Adsets actuais: ${adsetIds.length}

MÉTRICAS AGREGADAS (${fromDate} → ${toDate})
- Gasto: €${campMetrics.spend_eur.toFixed(2)} | Receita: €${campMetrics.revenue_eur.toFixed(2)}
- ROAS: ${campMetrics.roas != null ? campMetrics.roas.toFixed(2) + "x" : "n/a"} | CPA: ${campMetrics.cpa_eur != null ? "€" + campMetrics.cpa_eur.toFixed(2) : "n/a"}
- CTR: ${(campMetrics.ctr * 100).toFixed(2)}% | CPC: €${campMetrics.cpc_eur.toFixed(2)} | Frequência: ${campMetrics.frequency.toFixed(2)}
- Impressões: ${campMetrics.impressions} | Compras: ${campMetrics.purchases}

== EVENTO ==
${eventCtx.name ? `- Nome: ${eventCtx.name}
- Data: ${eventCtx.date ?? "N/A"}
- Dias até evento: ${eventCtx.daysUntil ?? "N/A"}
- Local: ${eventCtx.location ?? "N/A"}
- Capacidade: ${eventCtx.tickets_total ?? "N/A"}` : "(campanha sem evento vinculado)"}

== DIAGNÓSTICO ANTERIOR (severity=${diagnosis.severity}, score=${diagnosis.overall_score}) ==
${diagJsonStr}
${inheritedBlock}
${crossEventContextText}
${inheritanceDecisionsText}
${viabilityBlock}
== META PRINCIPAL ==
ROAS alvo BLENDED do evento: ${targetBlendedRoas.toFixed(1)}x (agregado entre TODAS as fases — não por campanha/adset individual).
Avaliação por fase: fases REACH/AWARENESS/VIDEO_VIEWS terão ROAS individual baixo (esperado 0–2x); fases CONVERSIONS/SALES devem entregar ROAS >=${targetBlendedRoas.toFixed(1)}x para puxar o blended; retargeting deve entregar 10–20x.

== O QUE PRECISO QUE FAÇAS ==
Desenha uma estratégia COMPLETA estruturada em fases (3-5), aplicando o diagnóstico:
- Pausa/elimina o que está mau, escala o que funciona, corrige fraquezas (CTR baixo, CPA alto, frequência saturada, etc.).
- Adsets novos com targetings concretos (countries, age, interests, custom audiences, lookalikes — usa nomes reconhecíveis).
- Verbas diárias e KPIs por fase.
- Inclui também \`redesign_rationale\` (texto curto, 3-6 frases, em PT) explicando o porquê das mudanças vs original.

Países alvo: ${countries.join(", ")}.${constraintsBlock}

REGRAS:
- Learning Phase: cada adset OFFSITE_CONVERSIONS precisa ~50 conversões/7d.
- Frequência: alertar se >5.
- Não inventes IDs Meta. Usa nomes humanos para audiences/criativos.
- Sê crítico e directo no rationale.
- ROAS BLENDED: em cada phase do output, preenche \`expected_blended_contribution\` (peso 0–1 desta fase no ROAS agregado do evento — soma de todas as fases deve aproximar-se de 1.0; fases de conversão e retargeting pesam mais que awareness). Não definas \`roas_min\` em \`target_kpis\` de fases REACH/VIDEO_VIEWS; usa 0 ou omite.

== FORMATO DE RESPOSTA ==
APENAS JSON puro (sem markdown fences) com este schema EXATO:

{
  "redesign_rationale": "3-6 frases em PT explicando porquê esta versão é diferente e melhor",
  "summary": {
    "feasibility": "high|medium|low|impossible",
    "feasibility_reason": "1-2 frases citando números do contexto de viabilidade",
    "recommended_total_budget_eur": <number>,
    "expected_purchases": <number>,
    "expected_revenue_eur": <number>,
    "expected_overall_roas": <number>,
    "expected_cpa_eur": <number>,
    "confidence": "high|medium|low"
  },
  "budget_recommendation": {
    "current_daily_eur": <number — do contexto ANÁLISE DE VIABILIDADE>,
    "current_projected_total_eur": <number — do contexto>,
    "suggested_daily_eur": <number — pode ser igual, mais, ou menos>,
    "suggested_total_eur": <number>,
    "adjustment_direction": "maintain|increase|decrease",
    "adjustment_reason": "1-3 frases em PT explicando o porquê (cita gap_severity + meets_floor)",
    "meets_statistical_floor": <boolean — copia do contexto>,
    "floor_warning": "<string ou null — preencher se NÃO cumpre floor>"
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
        {"type": "broad|interest|lookalike|custom|retargeting", "description": "...", "estimated_size": "..."}
      ],
      "creative_focus": "video_30s|carousel|single_image|reel",
      "target_kpis": { "cpm_eur_max": <number>, "ctr_pct_min": <number>, "cpa_eur_max": <number>, "roas_min": <number> },
      "success_criteria_to_next_phase": "...",
      "learning_phase_note": "...",
      "expected_blended_contribution": <number 0-1: peso desta fase no ROAS agregado do evento>
    }
  ],
  "recommended_campaigns": [
    {
      "phase_id": "phase_1_awareness",
      "campaign_name": "[REDESIGN] {event} - REACH - Broad",
      "objective": "REACH",
      "daily_budget_eur": 50,
      "duration_days": 15,
      "adsets": [
        {
          "adset_name": "Broad PT/BR 18-55",
          "targeting_json": {
            "age_min": 18, "age_max": 55,
            "geo_locations": {"countries": ["PT","BR"]},
            "publisher_platforms": ["facebook","instagram"]
          },
          "optimization_goal": "REACH",
          "billing_event": "IMPRESSIONS",
          "creative_type_recommended": "video",
          "ads": [
            { "existing_creative_id": "<meta_creative_id herdado>" },
            { "creative_brief": { "primary_message": "...", "tone": "...", "must_include": ["..."], "avoid": ["..."] }, "creative_replacement_reason": "porquê substituir um criativo herdado" }
          ]
        }
      ]
    }
  ],
  "scaling_rules": [
    {"trigger": "...", "action": "...", "rationale": "..."}
  ],
  "kpis_global": {
    "expected_total_impressions": <number>,
    "expected_total_reach": <number>,
    "expected_total_clicks": <number>,
    "expected_avg_frequency": <number>,
    "expected_total_purchases": <number>
  },
  "risks_and_warnings": [
    {"severity": "high|medium|low", "title": "...", "description": "..."}
  ],
  "creative_brief": {
    "primary_message": "...",
    "tone": "...",
    "must_include": ["..."],
    "avoid": ["..."]
  },
  "automation_metadata": {
    "ready_to_deploy": true,
    "estimated_api_calls": <number>,
    "warnings_before_deploy": ["..."],
    "requires_manual_setup": ["..."]
  }
}`;

  // 6) Lovable AI
  const callAI = () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.4,
      messages: [
        { role: "system", content: "És um especialista sênior em Meta Ads para eventos ao vivo. Respondes SEMPRE com JSON puro (sem fences) e em PT-BR." },
        { role: "user", content: prompt },
      ],
    }),
  });

  let aiResp = await callAI();
  if (aiResp.status === 429) { await new Promise((r) => setTimeout(r, 1500)); aiResp = await callAI(); }
  if (aiResp.status === 429) return json({ error: "rate_limit", message: "Lovable AI rate limit; tenta de novo em alguns segundos." }, 429);
  if (aiResp.status === 402) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);
  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("[redesign] AI error", aiResp.status, t.slice(0, 300));
    return json({ error: "ai_failed", detail: t.slice(0, 200) }, 502);
  }

  const aiJson = await aiResp.json();
  const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
  const usageTokens: number | null = aiJson?.usage?.total_tokens ?? null;
  if (!content) return json({ error: "ai_empty_response" }, 502);

  let plan: any;
  try { plan = JSON.parse(stripJsonFences(content)); }
  catch (e) {
    console.error("[redesign] parse error:", e, content.slice(0, 500));
    return json({ error: "ai_invalid_json", detail: content.slice(0, 200) }, 502);
  }

  const rationale: string = String(plan.redesign_rationale ?? "").slice(0, 4000);

  // 6c) Sprint 3c-2: enforcement de confidence/feasibility face ao gap_severity.
  // IA tem tendência a marcar confidence=high mesmo quando o gap é unrealistic.
  // Caps aplicados aqui são guardrails — não substituem o juízo do prompt, garantem floor.
  if (plan && typeof plan === "object" && plan.summary && typeof plan.summary === "object") {
    const sev = viability.gap_severity;
    const currentConfidence = String(plan.summary.confidence ?? "").toLowerCase();
    const currentFeasibility = String(plan.summary.feasibility ?? "").toLowerCase();
    const gapStr = viability.roas_gap_multiplier != null ? viability.roas_gap_multiplier.toFixed(1) + "x" : "n/a";

    if (sev === "stretch" && currentConfidence === "high") {
      plan.summary.confidence = "medium";
      plan.summary.confidence_capped_reason = `IA propôs confidence=high mas gap ROAS ${gapStr} é stretch — capped para medium.`;
    }
    if ((sev === "aggressive" || sev === "unrealistic") &&
        (currentConfidence === "high" || currentConfidence === "medium")) {
      plan.summary.confidence = "low";
      plan.summary.confidence_capped_reason = `IA propôs confidence=${currentConfidence} mas gap ROAS ${gapStr} é ${sev} — capped para low.`;
    }
    if (sev === "unrealistic" && currentFeasibility === "high") {
      plan.summary.feasibility = "medium";
      plan.summary.feasibility_capped_reason = `Gap unrealistic — feasibility capped de high para medium. Considera ajustar premissas (reduzir goal_revenue, prolongar prazo, ou aceitar ROAS menor).`;
    }
  }

  // 7.0) Anexar criativos herdados (mesmo que IA não tenha referenciado) + sanitizar ads
  plan.inherited_creatives = inheritedCreatives.map((c) => ({
    meta_creative_id: c.meta_creative_id,
    ad_name: c.ad_name,
    library_id: c.library?.id ?? null,
    name: c.library?.name ?? c.ad_name ?? null,
    type: c.library?.type ?? null,
    file_url: c.library?.file_url ?? null,
    headline: c.library?.headline ?? null,
  }));
  const validInheritedSet = new Set(inheritedCreatives.map((c) => c.meta_creative_id));
  let inheritedAdsCount = 0;
  for (const c of plan?.recommended_campaigns ?? []) {
    for (const a of c?.adsets ?? []) {
      if (!Array.isArray(a.ads)) continue;
      a.ads = a.ads.map((ad: any) => {
        const hasExisting = typeof ad?.existing_creative_id === "string" && validInheritedSet.has(ad.existing_creative_id);
        const hasBrief = ad?.creative_brief && typeof ad.creative_brief === "object";
        if (hasExisting && hasBrief) {
          // mutuamente exclusivo — preferir existing
          delete ad.creative_brief;
        }
        if (hasExisting) inheritedAdsCount++;
        if (!hasExisting && typeof ad?.existing_creative_id === "string") {
          // referência inválida — descartar
          delete ad.existing_creative_id;
        }
        return ad;
      });
    }
  }
  // Fallback: se há herdados mas IA não usou nenhum, distribui um ad por adset com o 1º herdado
  if (inheritedCreatives.length > 0 && inheritedAdsCount === 0) {
    const fallbackId = inheritedCreatives[0].meta_creative_id;
    for (const c of plan?.recommended_campaigns ?? []) {
      for (const a of c?.adsets ?? []) {
        if (!Array.isArray(a.ads) || a.ads.length === 0) {
          a.ads = inheritedCreatives.map((ic) => ({ existing_creative_id: ic.meta_creative_id }));
        }
      }
    }
    console.log("[redesign] fallback: aplicado", fallbackId, "a todos os adsets vazios");
  }

  // 7.0.1) Enforce inheritance_decisions (Sprint 3a-2): filtra ads para
  //        usar SÓ criativos aprovados pelo wizard. Se algum adset ficou
  //        sem ads, repreenche com os aprovados que existem na library.
  if (inh) {
    const allowedCreativeSet = new Set(inh.inherit_creative_ids ?? []);
    let removedCount = 0;
    for (const c of plan?.recommended_campaigns ?? []) {
      for (const a of c?.adsets ?? []) {
        if (!Array.isArray(a.ads)) continue;
        const before = a.ads.length;
        a.ads = a.ads.filter((ad: any) => {
          if (typeof ad?.existing_creative_id === "string") {
            return allowedCreativeSet.has(ad.existing_creative_id);
          }
          return true; // creative_brief (novo) passa
        });
        removedCount += (before - a.ads.length);
      }
    }
    const approvedHeritageList = (inh.inherit_creative_ids ?? []).filter((cid) =>
      inheritedCreatives.find((ic) => ic.meta_creative_id === cid)
    );
    if (approvedHeritageList.length > 0) {
      for (const c of plan?.recommended_campaigns ?? []) {
        for (const a of c?.adsets ?? []) {
          if (!Array.isArray(a.ads) || a.ads.length === 0) {
            a.ads = approvedHeritageList.map((cid) => ({ existing_creative_id: cid }));
          }
        }
      }
    }
    if (removedCount > 0) console.log(`[redesign] inheritance_decisions enforce: ${removedCount} ad(s) com criativo não-aprovado filtrados`);
  }


  // 7) Validar e enforce constraints (sobrescreve se IA desviou >5%)
  const constraintViolations: string[] = [];
  if (effDailyCents != null) {
    const expectedEur = effDailyCents / 100;
    const sumDaily = (plan?.recommended_campaigns ?? []).reduce(
      (s: number, c: any) => s + (Number(c?.daily_budget_eur) || 0), 0,
    );
    if (sumDaily > 0 && Math.abs(sumDaily - expectedEur) / expectedEur > 0.05) {
      constraintViolations.push(`daily_budget desvio: AI=${sumDaily.toFixed(2)}€ vs constraint=${expectedEur.toFixed(2)}€`);
      // sobrescreve plan.summary
      if (plan.summary) plan.summary.recommended_total_budget_eur = expectedEur * (Number(plan?.summary?.expected_duration_days) || 30);
      // re-escala adsets proporcionalmente
      if (sumDaily > 0) {
        const scale = expectedEur / sumDaily;
        for (const c of plan.recommended_campaigns ?? []) {
          if (typeof c.daily_budget_eur === "number") c.daily_budget_eur = +(c.daily_budget_eur * scale).toFixed(2);
        }
      }
    }
  }
  if (effRoasFloor != null) {
    for (const phase of plan?.phases ?? []) {
      if (phase?.target_kpis && (phase.target_kpis.roas_min == null || phase.target_kpis.roas_min < effRoasFloor)) {
        phase.target_kpis.roas_min = effRoasFloor;
      }
    }
  }

  const appliedConstraints = {
    keep_original_budget: keepOriginal,
    daily_budget_cents: effDailyCents,
    lifetime_budget_cents: effLifetimeCents,
    roas_floor: effRoasFloor,
    end_time: effEndTime,
    violations_corrected: constraintViolations,
    pause_original_mode: pauseOriginalMode, // duplicado em coluna dedicada, mantido aqui para leitura retrocompatível
    viability_analysis: viability, // Sprint 3c-2 — audit trail do contexto de viabilidade
  };

  // 8) Persistir nova strategy
  const stratName = `Re-design — ${campaign.name}`.slice(0, 200);
  const adAccountId = campaign.ad_account_id?.startsWith("act_") ? campaign.ad_account_id : `act_${campaign.ad_account_id}`;

  const { data: inserted, error: insErr } = await (supabase as any)
    .schema("crm").from("meta_campaign_strategies")
    .insert({
      company_id: campaign.company_id,
      connection_id: campaign.connection_id,
      ad_account_id: adAccountId,
      event_id: campaign.linked_event_id ?? null,
      name: stratName,
      goal_revenue_eur: plan?.summary?.expected_revenue_eur ?? 0,
      ticket_avg_eur: null,
      total_budget_eur: plan?.summary?.recommended_total_budget_eur ?? null,
      target_roas: plan?.summary?.expected_overall_roas ?? null,
      days_until_event: eventCtx.daysUntil ?? null,
      country_codes: countries,
      user_notes: `Re-design da campanha ${campaign.external_campaign_id} (${campaign.name})`,
      detected_artist: null,
      generated_plan: plan,
      generation_model: AI_MODEL,
      generation_tokens_used: usageTokens,
      generated_at: new Date().toISOString(),
      status: "generated",
      source_campaign_id: campaign.external_campaign_id,
      source_diagnosis_id: diagnosisId,
      redesign_rationale: rationale,
      applied_constraints: appliedConstraints,
      pause_original_mode: pauseOriginalMode,
      inheritance_decisions: inh ?? null,
      created_by: userId,
    })
    .select("id").single();

  if (insErr || !inserted) {
    console.error("[redesign] persist failed", insErr);
    return json({ error: "persist_failed", detail: insErr?.message, plan }, 500);
  }

  return json({
    strategy_id: inserted.id,
    generated_plan: plan,
    redesign_rationale: rationale,
    viability_analysis: viability, // Sprint 3c-2 — frontend pode renderizar diferenças vs IA
    source: {
      campaign_id: campaign.external_campaign_id,
      campaign_name: campaign.name,
      diagnosis_id: diagnosisId,
    },
  });
});
