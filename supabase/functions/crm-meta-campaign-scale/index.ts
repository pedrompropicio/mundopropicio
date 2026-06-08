// crm-meta-campaign-scale (Etapa 4 — motor "manter e escalar")
// POST { campaign_id, period_days? }
//
// Irmão do crm-meta-campaign-surgical: mesma infra (inventory, guarda de
// maturação, cap de role, contrato de prescrição/ações, aplicação via
// entity-action), REGRA OPOSTA — em vez de podar/realocar, ESCALA verba para
// crescer volume nas campanhas saudáveis a subir (saudavel_subindo).
//
// Princípios fechados (não reabrir):
//  - Escala SÓ adsets de PROSPECÇÃO (broad/interest/lookalike). RETARGETING
//    NUNCA escala (público finito → satura ao subir verba).
//  - Só adsets FORA de learning (guarda de maturação). Conversão em learning não escala.
//  - A escala INFLA o total (objetivo desta postura): total_after >= total_before.
//  - +SCALE_INCREASE_PCT por intervenção, com cooldown de SCALE_COOLDOWN_DAYS
//    desde o último AUMENTO de verba do adset (subir cedo reinicia o learning).
//  - Só escala prospecção com ROAS >= SCALE_ROAS_FLOOR; e NÃO escala winner com
//    ROAS a cair forte (roas_decay_pct < -SCALE_DECAY_BLOCK_PCT).
//  - Cap de role pré-validado: nunca propor verba que a entity-action bloquearia.
//  - v1 = escala incremental (sem objetivo de receita — isso é a Etapa 4.2).
//  - Prescrição EFÉMERA: nada é persistido aqui. Só as ações aplicadas (pela UI
//    via crm-meta-entity-action) vão ao audit existente.
//  - Usa o diagnóstico crm.campaign_diagnosis_360 (NUNCA a tabela antiga).
//
// Auth: user JWT (verify_jwt=true). Read-only + compute (não toca na Graph API).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ── Constantes CALIBRÁVEIS (decisões G2, G3, G4, G9) ─────────────────────────
// G2: aumento de verba por adset POR INTERVENÇÃO (fração do daily atual).
const SCALE_INCREASE_PCT = 0.25;
// G3: dias mínimos desde o último AUMENTO de verba do adset antes de voltar a
// subir (subir cedo demais reinicia o learning).
const SCALE_COOLDOWN_DAYS = 3;
// G4: piso de ROAS para um adset de prospecção ser elegível a escala. Abaixo
// disto não compensa expandir. Sem cutoff superior (ROAS alto = mais margem).
const SCALE_ROAS_FLOOR = 3.5;
// G9: se o ROAS do adset está a cair mais do que isto (decay 7d vs prev-7d),
// NÃO escalar — escalar algo em queda acelera o problema.
const SCALE_DECAY_BLOCK_PCT = 0.30;

// Audiências de PROSPECÇÃO (as únicas que escalam). detectAudienceType na
// inventory devolve um destes: broad | interest | lookalike | custom | retargeting.
const PROSPECTING_AUDIENCES = new Set(["broad", "interest", "lookalike"]);

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

// ── Contrato de output (IGUAL ao surgical para reutilizar a vista da UI) ──────
// group "scale_increase" é o novo grupo executável desta postura.
type ActionGroup = "scale_increase" | "recommendation";

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
  audience_type?: string | null;   // broad/interest/lookalike/custom/retargeting
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

  console.log(`[scale] start campaign=${campaignId} period=${periodDays}d`);

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

  // Mapa external_adset_id → reached_threshold (portão de maturação do 360).
  // Em learning = adset de conversão presente no portão com reached_threshold=false.
  const matGate = dj.maturation_gate ?? null;
  const learningByAdset = new Map<string, boolean>();
  for (const ca of (matGate?.conversion_adsets ?? [])) {
    if (ca?.external_adset_id != null) {
      learningByAdset.set(String(ca.external_adset_id), ca.reached_threshold === true);
    }
  }
  const isLearning = (adsetId: string) =>
    learningByAdset.has(adsetId) && learningByAdset.get(adsetId) === false;
  const learningAdsetsCount = [...learningByAdset.values()].filter((r) => r === false).length;

  // ── 3) Inventário (server-to-server, self-contained) ────────────────────────
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
      console.error("[scale] inventory_http_error", invResp.status, t.slice(0, 200));
      return json({ error: "inventory_failed", detail: `HTTP ${invResp.status}` }, 502);
    }
    inventory = await invResp.json();
  } catch (e) {
    console.error("[scale] inventory_exception", (e as Error).message);
    return json({ error: "inventory_failed", detail: (e as Error).message }, 502);
  }
  const adsetsInv: any[] = inventory?.adsets_inventory ?? [];

  // ── 4) Snapshots de adsets (verba atual, status, ids p/ entity-action) ──────
  const { data: adsetSnaps } = await (supabase as any)
    .schema("crm").from("meta_adset_snapshot")
    .select("external_adset_id, name, optimization_goal, effective_status, daily_budget_cents, lifetime_budget_cents, connection_id, ad_account_id")
    .eq("external_campaign_id", campaignId);
  const adsetById = new Map<string, any>();
  for (const a of (adsetSnaps ?? [])) adsetById.set(String(a.external_adset_id), a);

  // ── 5) Cap de verba por role (pré-validação) ────────────────────────────────
  let capEur: number | null = null;     // null = sem limite ; 0 = sem autoridade
  const { data: capData, error: capErr } = await supabase.rpc(
    "get_user_max_daily_budget_eur",
    { _user_id: userId },
  );
  if (capErr) {
    console.error("[scale] budget cap read failed", capErr.message);
    return json({ error: "internal_error", message: "Falha a ler o cap de verba." }, 500);
  }
  capEur = capData === null ? null : Number(capData);
  const capCents = capEur === null ? null : Math.round(capEur * 100);
  const noBudgetAuthority = capEur === 0; // qualquer update de daily_budget seria 403

  // ── 6) Cooldown: último AUMENTO de verba por adset (decisões G3, G6) ────────
  // Lê o histórico de mudanças de verba da campanha e guarda, por adset, a data
  // mais recente em que a verba SUBIU (after > before). Reduções/realocações
  // (cirúrgico) NÃO contam.
  const lastIncreaseByAdset = new Map<string, string>(); // id → applied_at ISO
  const { data: changeRows } = await (supabase as any)
    .schema("crm").from("meta_campaign_changes")
    .select("external_adset_id, before_jsonb, after_jsonb, applied_at, change_type")
    .eq("external_campaign_id", campaignId)
    .eq("change_type", "budget")
    .order("applied_at", { ascending: false });
  for (const c of (changeRows ?? [])) {
    const id = c.external_adset_id != null ? String(c.external_adset_id) : null;
    if (!id || lastIncreaseByAdset.has(id)) continue; // já temos a mais recente (ordenado desc)
    const before = Number(c.before_jsonb?.daily_budget_cents ?? NaN);
    const after = Number(c.after_jsonb?.daily_budget_cents ?? NaN);
    if (Number.isFinite(before) && Number.isFinite(after) && after > before) {
      lastIncreaseByAdset.set(id, c.applied_at);
    }
  }
  const cooldownMs = SCALE_COOLDOWN_DAYS * 86400000;
  const now = Date.now();
  const daysSince = (iso: string) => Math.floor((now - new Date(iso).getTime()) / 86400000);
  const inCooldown = (id: string): { blocked: boolean; days?: number } => {
    const last = lastIncreaseByAdset.get(id);
    if (!last) return { blocked: false };
    const elapsed = now - new Date(last).getTime();
    return elapsed < cooldownMs ? { blocked: true, days: daysSince(last) } : { blocked: false };
  };

  // ── 7) Modo de verba: ABO vs CBO vs unknown (espelha a UI e o surgical) ──────
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

  const sortedAdsets = [...activeAdsets].sort((a, b) =>
    String(a.inv.external_adset_id).localeCompare(String(b.inv.external_adset_id)));

  const scaleActions: ProposedAction[] = [];
  const recommendations: ProposedAction[] = [];

  // Aumento proposto a partir de uma verba atual: +25%, com clamp ao cap de role.
  // Devolve {proposed, blocked, reason}. Determinístico.
  function computeIncrease(currentCents: number): { proposed: number; blocked: boolean; reason?: string } {
    if (noBudgetAuthority) {
      return { proposed: currentCents, blocked: true, reason: "sem autoridade de verba (cap de role = 0)" };
    }
    let proposed = currentCents + Math.round(currentCents * SCALE_INCREASE_PCT);
    if (capCents !== null && currentCents >= capCents) {
      return { proposed: currentCents, blocked: true, reason: `verba atual já no cap do teu role (€${eur(capCents)}/dia)` };
    }
    if (capCents !== null && proposed > capCents) proposed = capCents; // clamp; continua a ser aumento
    if (proposed <= currentCents) {
      return { proposed: currentCents, blocked: true, reason: "sem margem para aumentar sob o cap de role" };
    }
    return { proposed, blocked: false };
  }

  // ── 8) ABO: escala por adset elegível ───────────────────────────────────────
  let totalIncreaseCents = 0;
  let eligibleCount = 0;     // prospecção winning com ROAS>=floor e não em queda
  let cooldownCount = 0;

  if (budgetMode === "ABO") {
    for (const { inv, snap } of sortedAdsets) {
      const id = String(inv.external_adset_id);
      const name = snap.name ?? inv.name ?? id;
      const verdict = inv.verdict as string;
      const audience = (inv.audience_type as string) ?? null;
      const roas = inv?.performance?.roas as number | null;
      const decay = inv?.performance?.roas_decay_pct as number | null;
      const currentCents = snap.daily_budget_cents ?? 0;
      const isProspecting = audience != null && PROSPECTING_AUDIENCES.has(audience);

      // Retargeting winning → recomendação informativa (nunca escala).
      if (verdict === "winning" && audience === "retargeting") {
        recommendations.push(rec(id, name, snap, verdict, audience,
          `Retargeting a ganhar (ROAS ${fmtRoas(roas)}) mas NÃO escala — público finito; ` +
          `subir verba satura (CPA dispara). Mantém como está.`));
        continue;
      }
      // Custom (não-retargeting) winning → informativa (fora do âmbito de prospecção pura).
      if (verdict === "winning" && audience === "custom") {
        recommendations.push(rec(id, name, snap, verdict, audience,
          `Audiência custom a ganhar (ROAS ${fmtRoas(roas)}). Fora do âmbito de escala de ` +
          `prospecção — avaliar manualmente antes de subir verba.`));
        continue;
      }
      // neutral de prospecção a ir bem (ROAS>=floor) → recomendação (decisão G5).
      if (verdict === "neutral" && isProspecting && roas != null && roas >= SCALE_ROAS_FLOOR) {
        recommendations.push(rec(id, name, snap, verdict, audience,
          `Prospecção com ROAS ${fmtRoas(roas)} mas ainda classificada neutral (sem volume ` +
          `suficiente). A ganhar tração — monitorizar; ainda não escalar.`));
        continue;
      }

      // Só seguimos para escala em winning de prospecção.
      if (verdict !== "winning" || !isProspecting) continue;

      // ROAS floor (decisão G4).
      if (roas == null || roas < SCALE_ROAS_FLOOR) {
        recommendations.push(rec(id, name, snap, verdict, audience,
          `Prospecção winning mas ROAS ${fmtRoas(roas)} < piso de escala ` +
          `${SCALE_ROAS_FLOOR.toFixed(1)}x — não compensa expandir agora.`));
        continue;
      }

      eligibleCount++;

      // Queda forte (decisão G9) → aviso, não escala.
      if (decay != null && decay < -SCALE_DECAY_BLOCK_PCT) {
        scaleActions.push({
          action_index: -1, group: "scale_increase", executable: true,
          entity_type: "adset", external_id: id, connection_id: connOf(snap),
          ad_account_id: acctOf(snap), entity_name: name, verdict, audience_type: audience,
          current_value_cents: currentCents, proposed_value_cents: currentCents,
          rationale: `Não escalar: ROAS a cair ${(decay * 100).toFixed(0)}% (7d vs 7d anteriores). ` +
            `Escalar algo em queda acelera o problema — estabilizar primeiro.`,
          selected_by_default: false, blocked: true,
          blocked_reason: `ROAS em queda ${(decay * 100).toFixed(0)}% (> ${(SCALE_DECAY_BLOCK_PCT * 100).toFixed(0)}%)`,
        });
        continue;
      }

      // Learning (guarda de maturação) → não escala.
      if (isLearning(id)) {
        scaleActions.push({
          action_index: -1, group: "scale_increase", executable: true,
          entity_type: "adset", external_id: id, connection_id: connOf(snap),
          ad_account_id: acctOf(snap), entity_name: name, verdict, audience_type: audience,
          current_value_cents: currentCents, proposed_value_cents: currentCents,
          rationale: `Não escalar: adset de conversão em learning (< limiar de eventos/7d). ` +
            `Aumentar a verba reiniciaria o aprendizado.`,
          selected_by_default: false, blocked: true,
          blocked_reason: "adset em learning — aumentar verba reiniciaria o aprendizado",
        });
        continue;
      }

      // Cooldown (decisões G3, G6) → não escala ainda.
      const cd = inCooldown(id);
      if (cd.blocked) {
        cooldownCount++;
        scaleActions.push({
          action_index: -1, group: "scale_increase", executable: true,
          entity_type: "adset", external_id: id, connection_id: connOf(snap),
          ad_account_id: acctOf(snap), entity_name: name, verdict, audience_type: audience,
          current_value_cents: currentCents, proposed_value_cents: currentCents,
          rationale: `Em cooldown: verba aumentada há ${cd.days}d. Aguardar ` +
            `${SCALE_COOLDOWN_DAYS}d entre aumentos para não reiniciar o learning.`,
          selected_by_default: false, blocked: true,
          blocked_reason: `aumentada há ${cd.days}d (< ${SCALE_COOLDOWN_DAYS}d de cooldown)`,
        });
        continue;
      }

      // Cap de role.
      const { proposed, blocked, reason } = computeIncrease(currentCents);
      if (blocked) {
        scaleActions.push({
          action_index: -1, group: "scale_increase", executable: true,
          entity_type: "adset", external_id: id, connection_id: connOf(snap),
          ad_account_id: acctOf(snap), entity_name: name, verdict, audience_type: audience,
          current_value_cents: currentCents, proposed_value_cents: currentCents,
          rationale: `Não escalável: ${reason}.`,
          selected_by_default: false, blocked: true, blocked_reason: reason,
        });
        continue;
      }

      // Ação de escala válida.
      const incr = proposed - currentCents;
      totalIncreaseCents += incr;
      scaleActions.push({
        action_index: -1, group: "scale_increase", executable: true,
        entity_type: "adset", external_id: id, connection_id: connOf(snap),
        ad_account_id: acctOf(snap), entity_name: name, verdict, audience_type: audience,
        current_value_cents: currentCents, proposed_value_cents: proposed,
        entity_action: { action: "update", updates: { daily_budget_cents: proposed } },
        rationale: `Prospecção ${audience} a ganhar (ROAS ${fmtRoas(roas)} >= ` +
          `${SCALE_ROAS_FLOOR.toFixed(1)}x) — escalar +${Math.round(SCALE_INCREASE_PCT * 100)}% ` +
          `(€${eur(currentCents)} → €${eur(proposed)}/dia) para crescer volume.`,
        selected_by_default: true, blocked: false,
      });
    }
  }

  // ── 9) CBO: escalar o budget DA CAMPANHA só se for prospecção pura (G7) ──────
  // Mistura (qualquer retargeting OU qualquer adset em learning) → só recomendação:
  // escalar a campanha em CBO empurraria verba para retargeting (satura) e para
  // adsets em learning (reset), violando as fronteiras.
  if (budgetMode === "CBO") {
    const anyRetargeting = activeAdsets.some((x) =>
      (x.inv.audience_type as string) === "retargeting");
    const anyLearning = activeAdsets.some((x) => isLearning(String(x.inv.external_adset_id)));
    const anyProspectingWinner = activeAdsets.some((x) =>
      x.inv.verdict === "winning" &&
      PROSPECTING_AUDIENCES.has((x.inv.audience_type as string) ?? "") &&
      (x.inv.performance?.roas ?? 0) >= SCALE_ROAS_FLOOR);
    const campCurrent = campaign.daily_budget_cents ?? 0;

    if (anyRetargeting || anyLearning) {
      recommendations.push({
        action_index: -1, group: "recommendation", executable: false,
        entity_type: "campaign", external_id: campaignId,
        connection_id: campaign.connection_id ?? null, ad_account_id: campaign.ad_account_id ?? null,
        entity_name: campaign.name ?? null, verdict: null, audience_type: null,
        rationale: `Campanha CBO com mistura (` +
          `${anyRetargeting ? "retargeting" : ""}${anyRetargeting && anyLearning ? " + " : ""}` +
          `${anyLearning ? "adsets em learning" : ""}). Escalar o budget da campanha empurraria ` +
          `verba para retargeting (satura) e/ou learning (reset). Não escalável automaticamente — ` +
          `separa a prospecção numa campanha/adset próprio para poder escalar.`,
        selected_by_default: false, blocked: false,
      });
    } else if (anyProspectingWinner && campCurrent > 0) {
      const cd = inCooldown(campaignId);
      const { proposed, blocked, reason } = computeIncrease(campCurrent);
      if (cd.blocked) {
        scaleActions.push({
          action_index: -1, group: "scale_increase", executable: true,
          entity_type: "campaign", external_id: campaignId, connection_id: campaign.connection_id ?? null,
          ad_account_id: campaign.ad_account_id ?? null, entity_name: campaign.name ?? null,
          verdict: "winning", audience_type: null,
          current_value_cents: campCurrent, proposed_value_cents: campCurrent,
          rationale: `Em cooldown: budget da campanha aumentado há ${cd.days}d. Aguardar ${SCALE_COOLDOWN_DAYS}d.`,
          selected_by_default: false, blocked: true,
          blocked_reason: `aumentado há ${cd.days}d (< ${SCALE_COOLDOWN_DAYS}d de cooldown)`,
        });
      } else if (blocked) {
        scaleActions.push({
          action_index: -1, group: "scale_increase", executable: true,
          entity_type: "campaign", external_id: campaignId, connection_id: campaign.connection_id ?? null,
          ad_account_id: campaign.ad_account_id ?? null, entity_name: campaign.name ?? null,
          verdict: "winning", audience_type: null,
          current_value_cents: campCurrent, proposed_value_cents: campCurrent,
          rationale: `Não escalável: ${reason}.`,
          selected_by_default: false, blocked: true, blocked_reason: reason,
        });
      } else {
        eligibleCount++;
        totalIncreaseCents += proposed - campCurrent;
        scaleActions.push({
          action_index: -1, group: "scale_increase", executable: true,
          entity_type: "campaign", external_id: campaignId, connection_id: campaign.connection_id ?? null,
          ad_account_id: campaign.ad_account_id ?? null, entity_name: campaign.name ?? null,
          verdict: "winning", audience_type: null,
          current_value_cents: campCurrent, proposed_value_cents: proposed,
          entity_action: { action: "update", updates: { daily_budget_cents: proposed } },
          rationale: `Campanha CBO de prospecção pura a ganhar — escalar o budget da campanha ` +
            `+${Math.round(SCALE_INCREASE_PCT * 100)}% (€${eur(campCurrent)} → €${eur(proposed)}/dia).`,
          selected_by_default: true, blocked: false,
        });
      }
    }
  }

  // ── 10) unknown → só recomendação ───────────────────────────────────────────
  if (budgetMode === "unknown") {
    recommendations.push({
      action_index: -1, group: "recommendation", executable: false,
      entity_type: "campaign", external_id: campaignId,
      connection_id: campaign.connection_id ?? null, ad_account_id: campaign.ad_account_id ?? null,
      entity_name: campaign.name ?? null, verdict: null, audience_type: null,
      rationale: `Modo de verba indeterminado (sem daily budget na campanha nem nos adsets). ` +
        `Sem campo de verba acionável — define orçamentos antes de escalar.`,
      selected_by_default: false, blocked: false,
    });
  }

  // ── 11) Ordenação final estável + atribuição de action_index ────────────────
  const ordered: ProposedAction[] = [...scaleActions, ...recommendations];
  ordered.forEach((a, i) => { a.action_index = i; });

  // ── 12) Resumo (o total SOBE — a escala infla, por design) ──────────────────
  const totalDailyBeforeCents = budgetMode === "ABO"
    ? sumAdsetDaily
    : budgetMode === "CBO" ? (campaign.daily_budget_cents ?? 0) : 0;
  const totalDailyAfterCents = totalDailyBeforeCents + totalIncreaseCents;

  const scaledCount = scaleActions.filter((a) => !a.blocked && a.entity_action).length;
  const counts = {
    scale_increase: scaleActions.length,
    recommendation: recommendations.length,
    blocked: ordered.filter((a) => a.blocked).length,
  };

  console.log(`[scale] done mode=${budgetMode} before=${totalDailyBeforeCents} ` +
    `after=${totalDailyAfterCents} increase=${totalIncreaseCents} eligible=${eligibleCount} ` +
    `scaled=${scaledCount} cooldown=${cooldownCount} blocked=${counts.blocked}`);

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
      total_increase_cents: totalIncreaseCents,
      cap_eur: capEur,
      eligible_count: eligibleCount,
      scaled_count: scaledCount,
      cooldown_count: cooldownCount,
      learning_adsets_count: learningAdsetsCount,
      currency: campaign.currency ?? "EUR",
      counts,
    },
    proposed_actions: ordered,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtRoas(roas: number | null): string {
  return roas != null ? `${roas.toFixed(2)}x` : "n/a";
}
function rec(
  id: string, name: string, snap: any, verdict: string, audience: string | null, rationale: string,
): ProposedAction {
  return {
    action_index: -1, group: "recommendation", executable: false,
    entity_type: "adset", external_id: id,
    connection_id: snap?.connection_id ?? null, ad_account_id: snap?.ad_account_id ?? null,
    entity_name: name, verdict, audience_type: audience,
    rationale, selected_by_default: false, blocked: false,
  };
}
