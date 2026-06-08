// crm-meta-campaign-surgical (Etapa 3 — motor de intervenção cirúrgica)
// POST { campaign_id, period_days? }
//
// Motor 100% DETERMINÍSTICO (sem LLM) que, a partir do diagnóstico 360 + do
// inventário (crm-meta-redesign-inventory) + dos snapshots, propõe ações sobre os
// adsets/ads EXISTENTES — sem recriar a campanha, preservando o aprendizado.
//
// Princípios fechados (não reabrir):
//  - PODA e REALOCA, NUNCA infla o total (total_after <= total_before).
//  - Targeting/audiência só como RECOMENDAÇÃO informativa (a entity-action não
//    edita targeting). Só pausar/ativar e verba são executáveis.
//  - Maturação: adset de conversão em learning NÃO recebe alterações de verba
//    (marcado blocked); pausa-se só se for losing; nunca recebe realocação.
//  - Cap de role pré-validado: nunca propor verba que a entity-action bloquearia.
//  - Prescrição EFÉMERA: nada é persistido aqui. Só as ações aplicadas (pela UI
//    via crm-meta-entity-action) vão ao audit existente.
//  - Usa o diagnóstico crm.campaign_diagnosis_360 (NUNCA a tabela antiga).
//
// Auth: user JWT (verify_jwt=true). Read-only + compute (não toca na Graph API).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ── Constantes CALIBRÁVEIS (decisões G1, G2, G5) ─────────────────────────────
// G1: corte de verba aplicado a um adset SATURATED (fração do daily atual).
const SATURATED_BUDGET_REDUCTION_PCT = 0.30;
// G2: teto de aumento por winner POR INTERVENÇÃO. Um salto maior reinicia o
// learning do próprio winner (regra de escala +20-30% a cada 2-3 dias). O
// excedente do pool que não couber NÃO é forçado → fica em pool_unallocated.
const REALLOC_MAX_INCREASE_PCT = 0.30;
// G5: piso mínimo de verba diária por adset (Meta exige um mínimo). Não reduzir
// abaixo disto. Campanhas são todas EUR → 100 cents = €1.
const MIN_ADSET_DAILY_CENTS = 100;

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

const eur = (cents: number) => (cents / 100).toFixed(2);

// ── Tipos do output (prescrição) ─────────────────────────────────────────────
type ActionGroup =
  | "pause" | "reduce_budget" | "reallocate_increase" | "pause_ad" | "recommendation";

type ProposedAction = {
  action_index: number;            // estável 0..N (vai para applied_action_index no audit)
  group: ActionGroup;
  executable: boolean;             // false → recomendação informativa (sem botão aplicar)
  entity_type: "adset" | "ad" | "campaign";
  external_id: string | null;
  connection_id: string | null;
  ad_account_id: string | null;
  entity_name: string | null;
  verdict: string | null;          // herdado do inventário
  current_value_cents?: number | null;
  proposed_value_cents?: number | null;
  entity_action?: { action: "pause" | "update"; updates?: { daily_budget_cents?: number } };
  rationale: string;
  selected_by_default: boolean;
  blocked: boolean;
  blocked_reason?: string;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { campaign_id?: string; period_days?: number };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const campaignId = body.campaign_id;
  if (!campaignId) return json({ error: "missing_campaign_id" }, 400);
  const periodDays = Math.min(Math.max(body.period_days ?? 30, 7), 90);

  console.log(`[surgical] start campaign=${campaignId} period=${periodDays}d`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized", detail: userErr?.message }, 401);
  const userId = userData.user.id;

  // ── 1) Campanha (modo de verba + ids p/ fallback) ──────────────────────────
  const { data: campaign, error: campErr } = await (supabase as any)
    .schema("crm").from("meta_campaign_snapshot")
    .select("external_campaign_id, name, company_id, connection_id, ad_account_id, currency, daily_budget_cents, lifetime_budget_cents")
    .eq("external_campaign_id", campaignId)
    .maybeSingle();
  if (campErr || !campaign) return json({ error: "campaign_not_found", detail: campErr?.message }, 404);

  // ── 2) Diagnóstico 360 mais recente (fonte ÚNICA; nunca a tabela antiga) ────
  const { data: diagRow } = await (supabase as any)
    .schema("crm").from("campaign_diagnosis_360")
    .select("id, source_campaign_class, projected_baseline_roas, target_roas, diagnosis_jsonb, created_at")
    .eq("external_campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!diagRow) {
    return json({ error: "no_diagnosis", message: "Faz primeiro um diagnóstico desta campanha." }, 422);
  }
  const diagnosisId: string = diagRow.id;
  const sourceClass: string | null = diagRow.source_campaign_class ?? null;
  const dj = diagRow.diagnosis_jsonb ?? {};
  const recommendedPosture: string | null = (dj.recommended_posture as string) ?? null;

  // Mapa external_adset_id → reached_threshold (do portão de maturação do 360).
  // Em learning = adset de conversão presente no portão com reached_threshold=false.
  const matGate = dj.maturation_gate ?? null;
  const learningByAdset = new Map<string, boolean>(); // id → reached_threshold
  for (const ca of (matGate?.conversion_adsets ?? [])) {
    if (ca?.external_adset_id != null) {
      learningByAdset.set(String(ca.external_adset_id), ca.reached_threshold === true);
    }
  }
  const isLearning = (adsetId: string) =>
    learningByAdset.has(adsetId) && learningByAdset.get(adsetId) === false;
  const learningAdsetsCount = [...learningByAdset.values()].filter((r) => r === false).length;

  // ── 3) Inventário (server-to-server, self-contained — decisão G6) ───────────
  let inventory: any;
  try {
    const invUrl = `${SUPABASE_URL}/functions/v1/crm-meta-redesign-inventory`;
    const invResp = await fetch(invUrl, {
      method: "POST",
      headers: {
        "Authorization": req.headers.get("Authorization") ?? "",
        "Content-Type": "application/json",
        "apikey": req.headers.get("apikey") ?? "",
      },
      body: JSON.stringify({ campaign_id: campaignId, period_days: periodDays }),
    });
    if (!invResp.ok) {
      const t = await invResp.text().catch(() => "");
      console.error("[surgical] inventory_http_error", invResp.status, t.slice(0, 200));
      return json({ error: "inventory_failed", detail: `HTTP ${invResp.status}` }, 502);
    }
    inventory = await invResp.json();
  } catch (e) {
    console.error("[surgical] inventory_exception", (e as Error).message);
    return json({ error: "inventory_failed", detail: (e as Error).message }, 502);
  }
  const adsetsInv: any[] = inventory?.adsets_inventory ?? [];
  const creativesInv: any[] = inventory?.creatives_inventory ?? [];
  const gapsInv: any[] = inventory?.gaps_detected ?? [];

  // ── 4) Snapshots de adsets/ads (verba atual, status, ids p/ entity-action) ──
  const { data: adsetSnaps } = await (supabase as any)
    .schema("crm").from("meta_adset_snapshot")
    .select("external_adset_id, name, optimization_goal, effective_status, daily_budget_cents, lifetime_budget_cents, connection_id, ad_account_id")
    .eq("external_campaign_id", campaignId);
  const adsetById = new Map<string, any>();
  for (const a of (adsetSnaps ?? [])) adsetById.set(String(a.external_adset_id), a);

  const { data: adSnaps } = await (supabase as any)
    .schema("crm").from("meta_ad_snapshot")
    .select("external_ad_id, external_adset_id, meta_creative_id, name, effective_status, connection_id, ad_account_id")
    .eq("external_campaign_id", campaignId);
  const ads: any[] = adSnaps ?? [];

  // ── 5) Cap de verba por role (pré-validação — decisão G/D) ──────────────────
  let capEur: number | null = null;     // null = sem limite ; 0 = sem autoridade
  const { data: capData, error: capErr } = await supabase.rpc(
    "get_user_max_daily_budget_eur",
    { _user_id: userId },
  );
  if (capErr) {
    console.error("[surgical] budget cap read failed", capErr.message);
    return json({ error: "internal_error", message: "Falha a ler o cap de verba." }, 500);
  }
  capEur = capData === null ? null : Number(capData);
  const capCents = capEur === null ? null : Math.round(capEur * 100);
  const noBudgetAuthority = capEur === 0; // qualquer update de daily_budget seria 403

  // ── 6) Modo de verba: ABO vs CBO vs unknown (espelha a UI) ──────────────────
  const campaignHasBudget =
    (campaign.daily_budget_cents ?? 0) > 0 || (campaign.lifetime_budget_cents ?? 0) > 0;
  const activeAdsets = adsetsInv
    .map((inv) => ({ inv, snap: adsetById.get(String(inv.external_adset_id)) }))
    .filter((x) => x.snap && (x.snap.effective_status ?? "") === "ACTIVE");
  const sumAdsetDaily = activeAdsets.reduce((s, x) => s + (x.snap.daily_budget_cents ?? 0), 0);
  const sumAdsetLifetime = activeAdsets.reduce((s, x) => s + (x.snap.lifetime_budget_cents ?? 0), 0);
  const adsetsHaveBudget = sumAdsetDaily > 0 || sumAdsetLifetime > 0;
  const budgetMode: "ABO" | "CBO" | "unknown" = campaignHasBudget
    ? "CBO"
    : adsetsHaveBudget ? "ABO" : "unknown";

  const connOf = (snap: any) => snap?.connection_id ?? campaign.connection_id ?? null;
  const acctOf = (snap: any) => snap?.ad_account_id ?? campaign.ad_account_id ?? null;

  // ── 7) Construção determinística das ações por grupo ─────────────────────────
  // Ordenamos as entradas por id para estabilidade dos re-runs.
  const sortedAdsets = [...activeAdsets].sort((a, b) =>
    String(a.inv.external_adset_id).localeCompare(String(b.inv.external_adset_id)));

  const pauseActions: ProposedAction[] = [];
  const reduceActions: ProposedAction[] = [];
  const reallocActions: ProposedAction[] = [];
  const pauseAdActions: ProposedAction[] = [];
  const recommendations: ProposedAction[] = [];

  const pausedAdsetIds = new Set<string>();   // adsets pausados → não pausar os seus ads
  let poolFreedCents = 0;                       // verba libertada (losing + cortes saturated)

  // Winners elegíveis a realocação (preenchido durante o varrimento; só ABO).
  type WinnerCand = { id: string; snap: any; inv: any; currentCents: number };
  const winnerCands: WinnerCand[] = [];

  for (const { inv, snap } of sortedAdsets) {
    const id = String(inv.external_adset_id);
    const name = snap.name ?? inv.name ?? id;
    const verdict = inv.verdict as string;
    const currentCents = snap.daily_budget_cents ?? 0;
    const learning = isLearning(id);

    if (verdict === "losing") {
      // Pausar adset losing (executável em qualquer modo). Pausa permitida mesmo
      // em learning (estamos a cortá-lo). Em ABO liberta a verba para o pool.
      pausedAdsetIds.add(id);
      if (budgetMode === "ABO") poolFreedCents += currentCents;
      pauseActions.push({
        action_index: -1,
        group: "pause",
        executable: true,
        entity_type: "adset",
        external_id: id,
        connection_id: connOf(snap),
        ad_account_id: acctOf(snap),
        entity_name: name,
        verdict,
        current_value_cents: currentCents || null,
        entity_action: { action: "pause" },
        rationale: `Adset com performance fraca — ${inv.reason}` +
          (budgetMode === "ABO" && currentCents > 0
            ? ` Pausar liberta €${eur(currentCents)}/dia para realocar aos winners.`
            : budgetMode === "CBO"
              ? ` Pausar concentra automaticamente a verba CBO nos restantes adsets.`
              : ``),
        selected_by_default: true,
        blocked: false,
      });
    } else if (verdict === "saturated") {
      // Recomendação informativa SEMPRE (refrescar criativo/audiência — targeting
      // não executável). Em ABO acrescenta-se corte de verba; em CBO/unknown não.
      recommendations.push({
        action_index: -1,
        group: "recommendation",
        executable: false,
        entity_type: "adset",
        external_id: id,
        connection_id: connOf(snap),
        ad_account_id: acctOf(snap),
        entity_name: name,
        verdict,
        rationale: `Adset saturado — ${inv.reason} Recomenda-se refrescar criativos e/ou ` +
          `renovar a audiência (alargar/trocar targeting). Mudança de targeting não é ` +
          `aplicável por aqui (informativa).`,
        selected_by_default: false,
        blocked: false,
      });

      if (budgetMode === "ABO") {
        let proposed = currentCents - Math.round(currentCents * SATURATED_BUDGET_REDUCTION_PCT);
        // Se a verba atual já está acima do cap do role, aprofunda o corte até ao
        // cap (continua a ser redução) — garante que a entity-action não bloqueia.
        if (capCents !== null && proposed > capCents) proposed = capCents;
        const cut = currentCents - proposed;
        if (learning) {
          reduceActions.push({
            action_index: -1, group: "reduce_budget", executable: true,
            entity_type: "adset", external_id: id, connection_id: connOf(snap),
            ad_account_id: acctOf(snap), entity_name: name, verdict,
            current_value_cents: currentCents, proposed_value_cents: currentCents,
            rationale: `Corte de verba bloqueado: adset de conversão em learning ` +
              `(< limiar de eventos/7d). Alterar a verba reiniciaria o aprendizado.`,
            selected_by_default: false, blocked: true,
            blocked_reason: "adset em learning — alterar verba reiniciaria o aprendizado",
          });
        } else if (currentCents <= MIN_ADSET_DAILY_CENTS || proposed < MIN_ADSET_DAILY_CENTS) {
          reduceActions.push({
            action_index: -1, group: "reduce_budget", executable: true,
            entity_type: "adset", external_id: id, connection_id: connOf(snap),
            ad_account_id: acctOf(snap), entity_name: name, verdict,
            current_value_cents: currentCents, proposed_value_cents: currentCents,
            rationale: `Corte de 30% não aplicado: verba já no/abaixo do piso ` +
              `€${eur(MIN_ADSET_DAILY_CENTS)}/dia.`,
            selected_by_default: false, blocked: true,
            blocked_reason: `redução violaria o piso mínimo €${eur(MIN_ADSET_DAILY_CENTS)}/dia`,
          });
        } else if (noBudgetAuthority) {
          reduceActions.push({
            action_index: -1, group: "reduce_budget", executable: true,
            entity_type: "adset", external_id: id, connection_id: connOf(snap),
            ad_account_id: acctOf(snap), entity_name: name, verdict,
            current_value_cents: currentCents, proposed_value_cents: currentCents,
            rationale: `Sem autoridade de verba (cap do teu role = €0). Pede a quem ` +
              `tem permissão para ajustar a verba.`,
            selected_by_default: false, blocked: true,
            blocked_reason: "sem autoridade de verba (cap de role = 0)",
          });
        } else {
          poolFreedCents += cut;
          reduceActions.push({
            action_index: -1, group: "reduce_budget", executable: true,
            entity_type: "adset", external_id: id, connection_id: connOf(snap),
            ad_account_id: acctOf(snap), entity_name: name, verdict,
            current_value_cents: currentCents, proposed_value_cents: proposed,
            entity_action: { action: "update", updates: { daily_budget_cents: proposed } },
            rationale: `Adset saturado — reduzir verba 30% (€${eur(currentCents)} → ` +
              `€${eur(proposed)}/dia); os €${eur(cut)}/dia libertados vão para o pool ` +
              `de realocação. ${inv.reason}`,
            selected_by_default: true, blocked: false,
          });
        }
      }
    } else if (verdict === "winning") {
      // Candidato a RECEBER realocação (só ABO; nunca em learning; precisa de base
      // de verba > 0 para o cálculo proporcional + teto).
      if (budgetMode === "ABO" && !learning && currentCents > 0) {
        winnerCands.push({ id, snap, inv, currentCents });
      } else if (budgetMode === "ABO" && learning) {
        reallocActions.push({
          action_index: -1, group: "reallocate_increase", executable: true,
          entity_type: "adset", external_id: id, connection_id: connOf(snap),
          ad_account_id: acctOf(snap), entity_name: name, verdict,
          current_value_cents: currentCents, proposed_value_cents: currentCents,
          rationale: `Realocação bloqueada: winner em learning (< limiar de ` +
            `eventos/7d). Aumentar a verba reiniciaria o aprendizado.`,
          selected_by_default: false, blocked: true,
          blocked_reason: "adset em learning — aumentar verba reiniciaria o aprendizado",
        });
      }
    }
    // neutral → nenhuma ação
  }

  // ── 8) Realocação proporcional com teto por winner (só ABO; passe único) ────
  // share_i = pool * current_i / Σcurrent ; increase_i = min(round(share_i), teto_i)
  // teto_i = min(30% do current_i, espaço até ao cap de role). Passe único: o
  // excedente que não couber NÃO é forçado → pool_unallocated (G2).
  let poolReallocatedCents = 0;
  if (budgetMode === "ABO" && poolFreedCents > 0 && winnerCands.length > 0) {
    const sumWinnerCurrent = winnerCands.reduce((s, w) => s + w.currentCents, 0);
    for (const w of winnerCands) {
      const name = w.snap.name ?? w.inv.name ?? w.id;
      const rawShare = poolFreedCents * (w.currentCents / sumWinnerCurrent);
      const tetoScale = Math.floor(w.currentCents * REALLOC_MAX_INCREASE_PCT);
      const tetoCap = capCents === null ? Infinity : Math.max(0, capCents - w.currentCents);
      const maxIncrease = Math.min(tetoScale, tetoCap);
      const increase = Math.min(Math.round(rawShare), maxIncrease);
      if (increase <= 0) {
        const why = noBudgetAuthority
          ? "sem autoridade de verba (cap de role = 0)"
          : (capCents !== null && tetoCap <= 0)
            ? "verba atual já no cap do teu role"
            : "teto de +30%/intervenção (evitar reset de learning) não deixa espaço";
        reallocActions.push({
          action_index: -1, group: "reallocate_increase", executable: true,
          entity_type: "adset", external_id: w.id, connection_id: connOf(w.snap),
          ad_account_id: acctOf(w.snap), entity_name: name, verdict: "winning",
          current_value_cents: w.currentCents, proposed_value_cents: w.currentCents,
          rationale: `Realocação não aplicada: ${why}.`,
          selected_by_default: false, blocked: true, blocked_reason: why,
        });
        continue;
      }
      const proposed = w.currentCents + increase;
      poolReallocatedCents += increase;
      reallocActions.push({
        action_index: -1, group: "reallocate_increase", executable: true,
        entity_type: "adset", external_id: w.id, connection_id: connOf(w.snap),
        ad_account_id: acctOf(w.snap), entity_name: name, verdict: "winning",
        current_value_cents: w.currentCents, proposed_value_cents: proposed,
        entity_action: { action: "update", updates: { daily_budget_cents: proposed } },
        rationale: `Winner — realocar +€${eur(increase)}/dia do pool ` +
          `(€${eur(w.currentCents)} → €${eur(proposed)}/dia, dentro do teto de +30% ` +
          `por intervenção). ${w.inv.reason}`,
        selected_by_default: true, blocked: false,
      });
    }
  }
  const poolUnallocatedCents = Math.max(0, poolFreedCents - poolReallocatedCents);

  // ── 9) Criativos losing → pausar ads (guarda: nunca deixar adset sem ad ATIVO) ──
  const losingCreativeIds = new Set<string>(
    creativesInv.filter((c) => c.verdict === "losing" && c.meta_creative_id != null)
      .map((c) => String(c.meta_creative_id)),
  );
  // Contagem de ads ACTIVE por adset (estado atual).
  const activeAdCountByAdset = new Map<string, number>();
  for (const ad of ads) {
    if ((ad.effective_status ?? "") === "ACTIVE") {
      const k = String(ad.external_adset_id);
      activeAdCountByAdset.set(k, (activeAdCountByAdset.get(k) ?? 0) + 1);
    }
  }
  const candidateAds = ads
    .filter((ad) =>
      (ad.effective_status ?? "") === "ACTIVE" &&
      ad.meta_creative_id != null &&
      losingCreativeIds.has(String(ad.meta_creative_id)) &&
      !pausedAdsetIds.has(String(ad.external_adset_id))) // adset já vai ser pausado → redundante
    .sort((a, b) => String(a.external_ad_id).localeCompare(String(b.external_ad_id)));

  for (const ad of candidateAds) {
    const adsetId = String(ad.external_adset_id);
    const remaining = activeAdCountByAdset.get(adsetId) ?? 0;
    const name = ad.name ?? String(ad.external_ad_id);
    if (remaining <= 1) {
      // Decisão G4: é o último ad ATIVO do adset → avisar e SALTAR (não pausar).
      recommendations.push({
        action_index: -1, group: "recommendation", executable: false,
        entity_type: "ad", external_id: String(ad.external_ad_id),
        connection_id: ad.connection_id ?? campaign.connection_id ?? null,
        ad_account_id: ad.ad_account_id ?? campaign.ad_account_id ?? null,
        entity_name: name, verdict: "losing",
        rationale: `Criativo fraco mas é o ÚLTIMO anúncio ativo do adset — não ` +
          `pausado (deixaria o adset sem anúncios). Substitui o criativo antes de pausar.`,
        selected_by_default: false, blocked: false,
      });
      continue;
    }
    activeAdCountByAdset.set(adsetId, remaining - 1);
    pauseAdActions.push({
      action_index: -1, group: "pause_ad", executable: true,
      entity_type: "ad", external_id: String(ad.external_ad_id),
      connection_id: ad.connection_id ?? campaign.connection_id ?? null,
      ad_account_id: ad.ad_account_id ?? campaign.ad_account_id ?? null,
      entity_name: name, verdict: "losing",
      rationale: `Anúncio com criativo classificado losing no inventário — pausar ` +
        `(restam ${remaining - 1} anúncio(s) ativo(s) no adset).`,
      selected_by_default: true, blocked: false,
    });
  }

  // ── 10) Gaps do inventário como recomendações informativas (read-only) ──────
  for (const g of gapsInv) {
    recommendations.push({
      action_index: -1, group: "recommendation", executable: false,
      entity_type: "campaign", external_id: g.affected_adset_id ?? null,
      connection_id: null, ad_account_id: null,
      entity_name: null, verdict: null,
      rationale: `[${g.tag}] ${g.description}`,
      selected_by_default: false, blocked: false,
    });
  }

  // ── 11) Ordenação final estável + atribuição de action_index ────────────────
  const ordered: ProposedAction[] = [
    ...pauseActions,
    ...reduceActions,
    ...reallocActions,
    ...pauseAdActions,
    ...recommendations,
  ];
  ordered.forEach((a, i) => { a.action_index = i; });

  // ── 12) Resumo ──────────────────────────────────────────────────────────────
  const totalDailyBeforeCents = budgetMode === "ABO"
    ? sumAdsetDaily
    : budgetMode === "CBO" ? (campaign.daily_budget_cents ?? 0) : 0;
  // ABO: total desce do pool não realocado. CBO/unknown: verba intocada.
  const totalDailyAfterCents = budgetMode === "ABO"
    ? totalDailyBeforeCents - poolUnallocatedCents
    : totalDailyBeforeCents;

  const counts = {
    pause: pauseActions.length,
    reduce_budget: reduceActions.length,
    reallocate_increase: reallocActions.length,
    pause_ad: pauseAdActions.length,
    recommendation: recommendations.length,
    blocked: ordered.filter((a) => a.blocked).length,
  };

  console.log(`[surgical] done mode=${budgetMode} pool_freed=${poolFreedCents} ` +
    `realloc=${poolReallocatedCents} unalloc=${poolUnallocatedCents} ` +
    `actions=${ordered.length} blocked=${counts.blocked}`);

  return json({
    ok: true,
    campaign_id: campaignId,
    diagnosis_id: diagnosisId,
    source_campaign_class: sourceClass,
    recommended_posture: recommendedPosture,
    period_days: periodDays,
    budget_mode: budgetMode,
    generated_at: new Date().toISOString(),
    summary: {
      total_daily_before_cents: totalDailyBeforeCents,
      total_daily_after_cents: totalDailyAfterCents,
      pool_freed_cents: poolFreedCents,
      pool_reallocated_cents: poolReallocatedCents,
      pool_unallocated_cents: poolUnallocatedCents,
      cap_eur: capEur,
      learning_adsets_count: learningAdsetsCount,
      currency: campaign.currency ?? "EUR",
      counts,
    },
    proposed_actions: ordered,
  });
});
