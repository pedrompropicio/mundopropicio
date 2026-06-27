// crm-meta-campaign-redesign (Fase 3 — Re-design)
// POST { campaign_id, diagnosis_id?, period_days? }
// Lê campanha + diagnóstico + dados granulares e gera variante optimizada,
// persistindo em crm.meta_campaign_strategies (status='generated').
//
// Reutiliza o schema generated_plan do crm-meta-campaign-strategy-generate
// para que crm-meta-strategy-deploy continue a funcionar sem alterações.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { normalizePlanInPlace } from "../_shared/plan-normalize.ts";
import { resolveInterestsInPlace } from "../_shared/resolve-interests.ts";
import { resolveCustomLocationsInPlace } from "../_shared/resolve-geo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const GRAPH_API_VERSION = "v18.0";
const AI_MODEL = "google/gemini-2.5-flash";
// TEMP — Temperature reduzida vs default 0.4 para baixar variância nos números do plano.
// Não elimina (LLM é stochastic) — combinar com NA (anchored numbers, override pós-LLM).
const TEMPERATURE_REDESIGN_LLM = 0.3;

// ─────────────────────────────────────────────────────────────────────────
// Tuning surface (Sprint redesign optimizer fix — caso Simone Mendes).
// Calibração em produção; não criar config table na DB ainda (over-engineering para v1).
// ─────────────────────────────────────────────────────────────────────────
const TRAJECTORY_STRONG_UPTREND_RATIO = 1.5;
const TRAJECTORY_UPTREND_RATIO = 1.15;
const TRAJECTORY_DOWNTREND_RATIO = 0.85;
const TRAJECTORY_STRONG_DOWNTREND_RATIO = 0.7;
const NO_OP_TARGET_PROXIMITY = 0.9;         // A3: roas_7d >= target * 0.9 → skip
const NO_OP_HORIZON_DAYS_THRESHOLD = 10;    // D3: days_until_event < 10 → skip (se !meets_floor)
const HIGH_BUDGET_SHARE_THRESHOLD = 0.30;   // B1: phase com peso > 30% = warning relevante
const KEYWORD_DIVERGENCE_TOLERANCE = 0.5;   // C2: claimed - expected > 0.5x = warning
// ─────────────────────────────────────────────────────────────────────────
// Fase 3B — Classificação winner/loser de criativos herdados (por performance real).
// Limiares de ARRANQUE, conservadores — a calibrar com dados reais em produção.
const CREATIVE_MIN_SPEND_EUR = 50;          // 3B: gasto acumulado mínimo p/ classificar
const CREATIVE_MIN_PURCHASES = 3;           // 3B: conversões mínimas p/ classificar
const CREATIVE_WINNER_ROAS_RATIO = 0.6;     // 3B: winner se roas_creative >= target_roas * 0.6
// ─────────────────────────────────────────────────────────────────────────
// Fase 3C — Budget determinístico (substitui o budget do LLM no caminho normal).
// Limiares de ARRANQUE, calibráveis com dados reais.
const BUDGET_MAX_MULTIPLIER_VS_CURRENT = 5;  // 3C: budget diário recomendado <= 5x o gasto diário actual
const STATISTICAL_FLOOR_SPEND_EUR = 2000;    // 3C: floor estatístico de spend (era hardcoded em analyzeViability)
const TICKET_AVG_FALLBACK_EUR = 25;          // 3C: ticket médio fallback p/ goal_revenue (era local em analyzeViability)
// 3C v3 — Verba de aprendizagem editável (sem piso rígido). Limiar de aviso de compressão
// RELATIVO à curva de cada fase (escala automaticamente com o tamanho do evento).
const PHASE_COMPRESSION_WARN_RATIO = 0.30;   // 3C v3: UI sinaliza fase de escala < 30% da verba-base da curva
// E3 — Downtrend tuning. Arbitrário; calibrar empiricamente em produção.
const TRAJECTORY_DOWNTREND_PROJECTION_RATIO_LIMIT = 2.0;
// E3 — Keywords PT que indicam que o LLM justificou plano de recovery no rationale.
// Se prompt mudar para EN no futuro, lista precisa de update.
const TRAJECTORY_RECOVERY_KEYWORDS = [
  "estancar",
  "recuperar",
  "reverter",
  "pivot",
  "nova estratégia",
  "corrigir",
  "ineficiência",
];

// CP-CONSTS — Counter-proposals tuning (feature nova, v1).
// Gera 1-3 sugestões determinísticas de mudança de constraints quando o plano sai
// como feasibility=impossible. Sem chamada LLM extra.
const COUNTER_PROPOSAL_BUDGET_ROUND_MULTIPLE_EUR = 5;
const COUNTER_PROPOSAL_FLOOR_ROUND_INCREMENT = 0.5;
const COUNTER_PROPOSAL_FLOOR_VS_LIFETIME_TRIGGER_RATIO = 1.2;
const COUNTER_PROPOSAL_REALISTIC_FLOOR_MULTIPLIER = 1.1;
const COUNTER_PROPOSAL_HYBRID_BUDGET_TRIGGER_MULTIPLIER = 5;
const COUNTER_PROPOSAL_HYBRID_FLOOR_TRIGGER_REDUCTION = 0.30;
const COUNTER_PROPOSAL_HYBRID_RATIO = 0.7;
const COUNTER_PROPOSAL_MAX_BUDGET_CAP_VS_CURRENT = 20;

// PAS-CONSTS — Plano Alternativo Sugerido.
// Quando feasibility=impossible E counter_proposals tem entries, faz fetch interno
// recursivo com constraints da CP priority 1 aplicadas; resultado anexado em
// plan.alternative_plan. PAS_RECURSION_GUARD_FIELD evita loop infinito: alt run
// (com este campo=true no body) NÃO gera outro alt — guard binário, profundidade
// máxima implícita = 1.
const PAS_RECURSION_GUARD_FIELD = "_is_alternative";
const PAS_INHERITED_CREATIVES_MAX_BYTES = 500 * 1024;

// NA-CONSTS — Anchored numbers tuning (v1 confiabilidade).
// Spec usa "moderate" para a melhor classe de gap. Codebase produz comfortable/stretch/aggressive/unrealistic.
// Aliases preservam a semântica do user spec mesmo quando o classifier produz nomes diferentes.
const GAP_SEVERITY_FACTORS: Record<string, number> = {
  comfortable: 1.25,
  moderate: 1.25,
  stretch: 1.10,
  aggressive: 1.00,
  unrealistic: 1.00,
};
const TRAJECTORY_PROJECTION_FACTORS: Record<string, number> = {
  strong_uptrend: 1.10,
  uptrend: 1.05,
  stable: 1.00,
  downtrend: 0.85,
  strong_downtrend: 0.70,
  insufficient_data: 1.00,
};
const ANCHORED_ROAS_CAP_VS_FLOOR = 1.20;
const ANCHORED_AVG_TICKET_FALLBACK_EUR = 50;

type Trajectory =
  | "strong_uptrend"
  | "uptrend"
  | "stable"
  | "downtrend"
  | "strong_downtrend"
  | "insufficient_data";

type SkipReason =
  | "unrealistic_gap"
  | "insufficient_horizon"
  | "ascending_trajectory_near_target"
  | "campaign_in_learning_phase";

type ROASBuckets = {
  roas_7d: number | null;
  roas_28d: number | null;
  roas_lifetime: number | null;
};

// CP-TYPE — Output shape de cada counter-proposal. Backwards-compat opcional no plan.
type CounterProposal = {
  id: "increase_budget" | "reduce_roas_floor" | "hybrid_budget_and_floor";
  type: "single_knob" | "multi_knob";
  priority: 1 | 2 | 3;
  label: string;
  constraints_change: Record<string, { from: number; to: number }>;
  rationale: string;
  expected_outcome: {
    feasibility_estimate: "medium" | "high";
    rationale: string;
  };
  trade_offs: string[];
  confidence: "high" | "medium" | "low";
};

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

// Espelho EXACTO de mapObjective em crm-meta-strategy-deploy/index.ts (L25-43).
// ALTERAR OS DOIS EM CONJUNTO. Necessário aqui (P4) para validação determinística
// de compatibilidade formato×objective sem chamada à Graph API.
function mapObjective(objective: string | undefined): string {
  const m: Record<string, string> = {
    REACH: "OUTCOME_AWARENESS",
    BRAND_AWARENESS: "OUTCOME_AWARENESS",
    VIDEO_VIEWS: "OUTCOME_AWARENESS",
    TRAFFIC: "OUTCOME_TRAFFIC",
    LINK_CLICKS: "OUTCOME_TRAFFIC",
    POST_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    PAGE_LIKES: "OUTCOME_ENGAGEMENT",
    LEAD_GENERATION: "OUTCOME_LEADS",
    APP_INSTALLS: "OUTCOME_APP_PROMOTION",
    OFFSITE_CONVERSIONS: "OUTCOME_SALES",
    CONVERSIONS: "OUTCOME_SALES",
    CATALOG_SALES: "OUTCOME_SALES",
  };
  if (!objective) return "OUTCOME_TRAFFIC";
  if (objective.startsWith("OUTCOME_")) return objective;
  return m[objective] ?? "OUTCOME_TRAFFIC";
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

function aggregateInto(target: Agg, r: any) {
  target.impressions += r.impressions ?? 0;
  target.reach = Math.max(target.reach, r.reach ?? 0);
  target.clicks += r.clicks ?? 0;
  target.spendCents += r.spend_cents ?? 0;
  target.purchases += r.purchases_count ?? 0;
  target.purchasesValueCents += r.purchases_value_cents ?? 0;
  if (r.frequency != null) { target.frequencySum += r.frequency; target.frequencyN++; }
}

function classifyTrajectory(roas7d: number | null, roas28d: number | null): Trajectory {
  if (roas7d == null || roas28d == null || roas28d <= 0) return "insufficient_data";
  const ratio = roas7d / roas28d;
  if (ratio >= TRAJECTORY_STRONG_UPTREND_RATIO) return "strong_uptrend";
  if (ratio >= TRAJECTORY_UPTREND_RATIO) return "uptrend";
  if (ratio >= TRAJECTORY_DOWNTREND_RATIO) return "stable";
  if (ratio >= TRAJECTORY_STRONG_DOWNTREND_RATIO) return "downtrend";
  return "strong_downtrend";
}

// NA-GEN — Anchored numbers (determinístico). Substitui projecções LLM por
// matemática auditável baseada em buckets ROAS observados + factors por
// gap_severity e trajectory + cap defensivo vs floor.
function computeAnchoredNumbers(args: {
  viability: {
    roas_7d: number | null;
    roas_28d: number | null;
    roas_lifetime: number | null;
    gap_severity: string;
    trajectory: string;
  };
  constraints: { daily_budget_eur: number | null; roas_floor: number; end_date: string };
  horizon_days: number;
  recommended_total_budget_eur: number;
  actual_revenue_eur: number;
  actual_purchases: number;
  // 1.E-2 — override de baseline/banda LIMPOS vindos do diagnóstico (wind-down).
  // Quando presente, substitui o baseline_roas interno (contaminado) e a trajectory
  // usada no trajectory_factor. gap_factor e tudo o resto mantêm-se.
  cleanOverride?: { baseline_roas: number; trajectory: string };
}): {
  expected_overall_roas: number;
  expected_revenue_eur: number;
  expected_purchases: number;
  avg_ticket_eur: number;
  number_lineage: {
    baseline_roas: number;
    baseline_components: { lifetime?: number; "28d"?: number; "7d"?: number; weights: Record<string, number> };
    gap_severity: string;
    gap_factor: number;
    trajectory: string;
    trajectory_factor: number;
    raw_computed_roas: number;
    capped_at: number | null;
    final_roas: number;
    avg_ticket_source: "actual" | "fallback";
    winddown_override?: {
      internal_baseline_roas: number;
      clean_baseline_roas: number;
      internal_trajectory: string;
      clean_trajectory: string;
    };
  };
} {
  const { viability, constraints, recommended_total_budget_eur, actual_revenue_eur, actual_purchases, cleanOverride } = args;
  const r = (n: number) => Math.round(n);

  // STEP 1 — Baseline ROAS (weighted): 28d=0.5, lifetime=0.3, 7d=0.2.
  const components: number[] = [];
  const weights: number[] = [];
  const componentDetails: { lifetime?: number; "28d"?: number; "7d"?: number; weights: Record<string, number> } = { weights: {} };
  if (viability.roas_lifetime != null && viability.roas_lifetime > 0) {
    components.push(viability.roas_lifetime); weights.push(0.3);
    componentDetails.lifetime = viability.roas_lifetime;
    componentDetails.weights.lifetime = 0.3;
  }
  if (viability.roas_28d != null && viability.roas_28d > 0) {
    components.push(viability.roas_28d); weights.push(0.5);
    componentDetails["28d"] = viability.roas_28d;
    componentDetails.weights["28d"] = 0.5;
  }
  if (viability.roas_7d != null && viability.roas_7d > 0) {
    components.push(viability.roas_7d); weights.push(0.2);
    componentDetails["7d"] = viability.roas_7d;
    componentDetails.weights["7d"] = 0.2;
  }
  let baseline_roas: number;
  if (components.length === 0) {
    baseline_roas = 1.0;
  } else {
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    baseline_roas = components.reduce((s, c, i) => s + c * weights[i], 0) / totalWeight;
  }

  // 1.E-2 — quando há override LIMPO (wind-down), usa o baseline/trajectory do
  // diagnóstico no lugar dos internos (contaminados). gap_factor MANTÉM-SE.
  const usedBaselineRoas = cleanOverride ? cleanOverride.baseline_roas : baseline_roas;
  const usedTrajectory = cleanOverride ? cleanOverride.trajectory : viability.trajectory;

  // STEP 2-3 — Factors gap_severity + trajectory.
  const gap_factor = GAP_SEVERITY_FACTORS[viability.gap_severity] ?? 1.00;
  const trajectory_factor = TRAJECTORY_PROJECTION_FACTORS[usedTrajectory] ?? 1.00;

  // STEP 4-5 — Computed + cap defensivo.
  const raw_computed_roas = usedBaselineRoas * gap_factor * trajectory_factor;
  const max_allowed = constraints.roas_floor * ANCHORED_ROAS_CAP_VS_FLOOR;
  const final_roas = Math.min(raw_computed_roas, max_allowed);
  const capped_at = raw_computed_roas > max_allowed ? max_allowed : null;

  // STEP 6 — Avg ticket (actual ou fallback).
  let avg_ticket_eur: number;
  let avg_ticket_source: "actual" | "fallback";
  if (actual_purchases > 0 && actual_revenue_eur > 0) {
    avg_ticket_eur = actual_revenue_eur / actual_purchases;
    avg_ticket_source = "actual";
  } else {
    avg_ticket_eur = ANCHORED_AVG_TICKET_FALLBACK_EUR;
    avg_ticket_source = "fallback";
  }

  // STEP 7-8 — Receita, compras, ROAS arredondado.
  const expected_revenue_eur = r(final_roas * recommended_total_budget_eur);
  const expected_purchases = avg_ticket_eur > 0 ? r(expected_revenue_eur / avg_ticket_eur) : 0;
  const expected_overall_roas = Math.round(final_roas * 100) / 100;

  return {
    expected_overall_roas,
    expected_revenue_eur,
    expected_purchases,
    avg_ticket_eur,
    number_lineage: {
      baseline_roas: Math.round(usedBaselineRoas * 100) / 100,
      baseline_components: componentDetails,
      gap_severity: viability.gap_severity,
      gap_factor,
      trajectory: usedTrajectory,
      trajectory_factor,
      raw_computed_roas: Math.round(raw_computed_roas * 100) / 100,
      capped_at,
      final_roas: expected_overall_roas,
      avg_ticket_source,
      ...(cleanOverride
        ? {
          winddown_override: {
            internal_baseline_roas: Math.round(baseline_roas * 100) / 100,
            clean_baseline_roas: Math.round(usedBaselineRoas * 100) / 100,
            internal_trajectory: viability.trajectory,
            clean_trajectory: usedTrajectory,
          },
        }
        : {}),
    },
  };
}

// CONF-GEN — Confidence determinístico baseado em horizon + statistical floor +
// gap_severity + trajectory. Regras prioritárias: low force (qualquer crítico),
// cap em medium (downtrend), promo a high (todos os requisitos OK).
function computeAnchoredConfidence(args: {
  viability: { gap_severity: string; trajectory: string };
  horizon_days: number;
  statistical_floor_met: boolean;
  final_roas: number;
  target_roas_floor: number;
}): { confidence: "low" | "medium" | "high"; confidence_reasons: string[] } {
  const { viability, horizon_days, statistical_floor_met } = args;
  const reasons: string[] = [];
  let confidence: "low" | "medium" | "high" = "medium";

  // Downgrades força low (qualquer um destes).
  if (!statistical_floor_met) {
    confidence = "low";
    reasons.push("Statistical floor não atingido");
  }
  if (horizon_days < 14) {
    confidence = "low";
    reasons.push(`Horizonte curto (${horizon_days}d < 14d)`);
  }
  if (viability.gap_severity === "unrealistic") {
    confidence = "low";
    reasons.push("Gap unrealistic — meta improvável mesmo com optimização");
  }

  // Cap em medium para downtrends.
  if (viability.trajectory === "downtrend" || viability.trajectory === "strong_downtrend") {
    if (confidence === "high") confidence = "medium";
    reasons.push(`Trajectória ${viability.trajectory} — confidence cap em medium`);
  }

  // Promo a high — todos os requisitos. "moderate" mantido para compat com user spec; "comfortable" é o equivalente real do codebase.
  const isFavourableGap = viability.gap_severity === "moderate" || viability.gap_severity === "comfortable";
  const isFavourableTraj =
    viability.trajectory === "stable" ||
    viability.trajectory === "uptrend" ||
    viability.trajectory === "strong_uptrend";
  if (
    confidence === "medium" &&
    statistical_floor_met &&
    horizon_days >= 60 &&
    isFavourableGap &&
    isFavourableTraj
  ) {
    confidence = "high";
    reasons.push("Horizonte longo + gap moderate/comfortable + trajectory favorável");
  }

  return { confidence, confidence_reasons: reasons };
}

// CP-GEN — Counter-proposals generator (determinístico, sem LLM).
// Disparado quando feasibility=impossible. Gera 1-3 sugestões accionáveis de
// mudança de constraints (budget, floor, ou ambos), cada uma com rationale e trade-offs.
function generateCounterProposals(args: {
  viability: {
    roas_lifetime: number | null;
    days_until_event: number;
  };
  constraints: {
    daily_budget_eur: number;
    roas_floor: number;
    end_date: string;
  };
  horizon_days: number;
  statistical_floor_eur: number;
  current_daily_total_eur: number;
}): CounterProposal[] {
  const proposals: CounterProposal[] = [];
  const { viability, constraints, horizon_days, statistical_floor_eur, current_daily_total_eur } = args;
  const round = (n: number) => Math.round(n);

  // CP1 — Aumentar budget (single_knob). Dispara se total projectado < floor estatístico.
  let p1ProposedDaily: number | null = null;
  let p1Fires = false;
  if (current_daily_total_eur < statistical_floor_eur && horizon_days > 0) {
    const rawProposed = statistical_floor_eur / horizon_days;
    let proposedDaily = Math.ceil(rawProposed / COUNTER_PROPOSAL_BUDGET_ROUND_MULTIPLE_EUR) * COUNTER_PROPOSAL_BUDGET_ROUND_MULTIPLE_EUR;
    const cap = constraints.daily_budget_eur * COUNTER_PROPOSAL_MAX_BUDGET_CAP_VS_CURRENT;
    proposedDaily = Math.min(proposedDaily, cap);
    if (proposedDaily > constraints.daily_budget_eur) {
      p1Fires = true;
      p1ProposedDaily = proposedDaily;
      const newTotal = proposedDaily * horizon_days;
      const increasePct = round((newTotal / current_daily_total_eur - 1) * 100);
      proposals.push({
        id: "increase_budget",
        type: "single_knob",
        priority: 1,
        label: `Aumentar verba diária para €${proposedDaily}`,
        constraints_change: {
          daily_budget_eur: { from: constraints.daily_budget_eur, to: proposedDaily },
        },
        rationale:
          `Statistical floor (€${statistical_floor_eur}) requer €${proposedDaily}/dia em ${horizon_days} dias ` +
          `para análise robusta. Plano actual com €${constraints.daily_budget_eur}/dia atinge apenas ` +
          `€${round(current_daily_total_eur)} no horizonte total — insuficiente.`,
        expected_outcome: {
          feasibility_estimate: "medium",
          rationale: "Budget atinge statistical floor, permitindo análise robusta e escala.",
        },
        trade_offs: [
          `Investimento total aumenta de €${round(current_daily_total_eur)} para €${round(newTotal)} (+${increasePct}%)`,
          "Não garante atingir ROAS floor — apenas permite avaliação correcta",
        ],
        confidence: "high",
      });
    }
  }

  // CP2 — Reduzir ROAS floor (single_knob). Dispara se floor >> roas_lifetime observado.
  let p2ProposedFloor: number | null = null;
  let p2Fires = false;
  const lifetime = viability.roas_lifetime;
  if (
    lifetime != null && lifetime > 0 &&
    constraints.roas_floor > lifetime * COUNTER_PROPOSAL_FLOOR_VS_LIFETIME_TRIGGER_RATIO
  ) {
    const rawProposed = lifetime * COUNTER_PROPOSAL_REALISTIC_FLOOR_MULTIPLIER;
    const proposedFloor = Math.round(rawProposed / COUNTER_PROPOSAL_FLOOR_ROUND_INCREMENT) * COUNTER_PROPOSAL_FLOOR_ROUND_INCREMENT;
    if (proposedFloor < constraints.roas_floor) {
      p2Fires = true;
      p2ProposedFloor = proposedFloor;
      const currentGapPct = round((constraints.roas_floor / lifetime - 1) * 100);
      const proposedGapPct = round((proposedFloor / lifetime - 1) * 100);
      const revenueDropPct = round((1 - proposedFloor / constraints.roas_floor) * 100);
      proposals.push({
        id: "reduce_roas_floor",
        type: "single_knob",
        priority: 2,
        label: `Reduzir ROAS floor para ${proposedFloor.toFixed(1)}x`,
        constraints_change: {
          roas_floor: { from: constraints.roas_floor, to: proposedFloor },
        },
        rationale:
          `ROAS lifetime actual é ${lifetime.toFixed(2)}x. Floor de ${constraints.roas_floor}x é ${currentGapPct}% ` +
          `acima do baseline observado — meta improvável sem mudança operacional drástica. Floor de ` +
          `${proposedFloor.toFixed(1)}x é ${proposedGapPct}% acima, mais alinhado com performance histórica.`,
        expected_outcome: {
          feasibility_estimate: "medium",
          rationale: "Floor realista alinhado com histórico — plano provavelmente viável sem aumentar verba.",
        },
        trade_offs: [
          `Receita esperada cai ~${revenueDropPct}% para mesmo budget (ROAS alvo menor)`,
          "Goal de receita absoluta precisa de ser reavaliado",
        ],
        confidence: "high",
      });
    }
  }

  // CP3 — Híbrido budget + floor (multi_knob). Dispara se ambos CP1+CP2 disparam E magnitudes superam thresholds.
  if (p1Fires && p2Fires && p1ProposedDaily != null && p2ProposedFloor != null) {
    const budgetRatio = p1ProposedDaily / constraints.daily_budget_eur;
    const floorReductionPct = (constraints.roas_floor - p2ProposedFloor) / constraints.roas_floor;
    if (
      budgetRatio > COUNTER_PROPOSAL_HYBRID_BUDGET_TRIGGER_MULTIPLIER &&
      floorReductionPct > COUNTER_PROPOSAL_HYBRID_FLOOR_TRIGGER_REDUCTION
    ) {
      let hybridBudget = constraints.daily_budget_eur +
        (p1ProposedDaily - constraints.daily_budget_eur) * COUNTER_PROPOSAL_HYBRID_RATIO;
      hybridBudget = Math.ceil(hybridBudget / COUNTER_PROPOSAL_BUDGET_ROUND_MULTIPLE_EUR) * COUNTER_PROPOSAL_BUDGET_ROUND_MULTIPLE_EUR;
      let hybridFloor = constraints.roas_floor -
        (constraints.roas_floor - p2ProposedFloor) * COUNTER_PROPOSAL_HYBRID_RATIO;
      hybridFloor = Math.round(hybridFloor / COUNTER_PROPOSAL_FLOOR_ROUND_INCREMENT) * COUNTER_PROPOSAL_FLOOR_ROUND_INCREMENT;
      const newTotal = hybridBudget * horizon_days;
      const revenueDropPct = round((1 - hybridFloor / constraints.roas_floor) * 100);
      proposals.push({
        id: "hybrid_budget_and_floor",
        type: "multi_knob",
        priority: 3,
        label: `Compromisso: €${hybridBudget}/dia + floor ${hybridFloor.toFixed(1)}x`,
        constraints_change: {
          daily_budget_eur: { from: constraints.daily_budget_eur, to: hybridBudget },
          roas_floor: { from: constraints.roas_floor, to: hybridFloor },
        },
        rationale:
          `Aumentar verba para €${p1ProposedDaily} sozinho ou reduzir floor para ${p2ProposedFloor.toFixed(1)}x ` +
          `sozinho são mudanças grandes. Esta proposta combina ambos com intensidade moderada ` +
          `(~${Math.round(COUNTER_PROPOSAL_HYBRID_RATIO * 100)}% do delta individual de cada): aumenta verba ` +
          `parcialmente E aceita floor mais realista. Boa opção se queres validar a campanha sem committment ` +
          `grande em nenhum eixo.`,
        expected_outcome: {
          feasibility_estimate: "medium",
          rationale: "Compromisso equilibrado entre rigor de meta e investimento.",
        },
        trade_offs: [
          `Investimento total: €${round(newTotal)} (vs €${round(current_daily_total_eur)} actual)`,
          `Receita esperada cai ~${revenueDropPct}% face a meta original`,
          "Nenhuma das mudanças individuais é tão drástica — preserva opcionalidade futura",
        ],
        confidence: "medium",
      });
    }
  }

  return proposals.sort((a, b) => a.priority - b.priority);
}

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

// Multi-day tour aware. master.events.date pode ser data de criação no Meta (errada
// para turnês). Combina master + children (events.parent_event_id) + event_dates,
// escolhe próxima futura (fallback: última se já passaram todas).
type EffectiveEventDate = {
  date: Date;
  source: "master" | "child" | "event_dates";
  is_future: boolean;
};

function resolveEffectiveEventDate(
  masterDate: string | null | undefined,
  children: Array<{ date: string | null }>,
  eventDates: Array<{ date: string | null }>,
): { effectiveMs: number | null; source: EffectiveEventDate["source"] | null; allDates: EffectiveEventDate[] } {
  const nowMs = Date.now();
  const collected: EffectiveEventDate[] = [];
  const push = (d: string | null | undefined, source: EffectiveEventDate["source"]) => {
    if (!d) return;
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) return;
    collected.push({ date: new Date(t), source, is_future: t >= nowMs });
  };
  push(masterDate, "master");
  for (const c of children) push(c.date, "child");
  for (const ed of eventDates) push(ed.date, "event_dates");

  if (collected.length === 0) return { effectiveMs: null, source: null, allDates: [] };

  const futures = collected.filter(d => d.is_future);
  const pick = futures.length > 0
    ? futures.reduce((a, b) => (a.date.getTime() <= b.date.getTime() ? a : b))
    : collected.reduce((a, b) => (a.date.getTime() >= b.date.getTime() ? a : b));
  return { effectiveMs: pick.date.getTime(), source: pick.source, allDates: collected };
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[redesign] BUILD_VERSION=redesign-360-v1", new Date().toISOString());
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
    // DR-2026-06-27c — opt-in: override de modelo + modo dry_run (não persiste).
    model?: string;
    dry_run?: boolean;
    // DR-2026-06-27d — modo async_persist: responde 202, corre em waitUntil, insere candidato
    // via service_role e actualiza crm.audience_duel_runs nas colunas do modelo. Exclusivo de dry_run.
    async_persist?: boolean;
    duel_id?: string;
    source_model?: string;
    reference_campaign_id?: string | null;
    // PAS — flags internas para chamada recursiva auto-gerada (não documentado em API pública).
    [PAS_RECURSION_GUARD_FIELD]?: boolean;
    _pas_source_proposal_id?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const campaignId = body.campaign_id;
  if (!campaignId) return json({ error: "missing_campaign_id" }, 400);
  const periodDays = Math.min(Math.max(body.period_days ?? 30, 7), 90);
  // DR-2026-06-27c — modelId opt-in com allowlist; fallback silencioso para AI_MODEL.
  const MODEL_ALLOWLIST = new Set([
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
    "openai/gpt-5",
    "openai/gpt-5-mini",
  ]);
  const requestedModel = (typeof body.model === "string" && body.model.trim()) ? body.model.trim() : null;
  const modelId = requestedModel && MODEL_ALLOWLIST.has(requestedModel) ? requestedModel : AI_MODEL;
  const dryRun = body.dry_run === true;
  // DR-2026-06-27d — async_persist: validações (exclusivo de dry_run; exige duel_id+source_model).
  const asyncPersist = body.async_persist === true;
  const asyncDuelId = typeof body.duel_id === "string" ? body.duel_id.trim() : "";
  const asyncSourceModel = typeof body.source_model === "string" ? body.source_model.trim() : "";
  const asyncReferenceCampaignId = typeof body.reference_campaign_id === "string" && body.reference_campaign_id.trim()
    ? body.reference_campaign_id.trim()
    : null;
  if (asyncPersist && dryRun) {
    return json({ error: "async_persist_and_dry_run_exclusive" }, 400);
  }
  if (asyncPersist && (!asyncDuelId || !asyncSourceModel)) {
    return json({ error: "missing_async_persist_fields", required: ["duel_id", "source_model"] }, 400);
  }
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

  // 2) Diagnóstico 360 (fornecido ou mais recente) — fonte exclusiva: crm.campaign_diagnosis_360.
  let diagnosis: any = null;
  if (body.diagnosis_id) {
    const { data: d } = await (supabase as any)
      .schema("crm").from("campaign_diagnosis_360")
      .select("*").eq("id", body.diagnosis_id).maybeSingle();
    diagnosis = d ?? null;
  } else {
    const { data: d } = await (supabase as any)
      .schema("crm").from("campaign_diagnosis_360")
      .select("*").eq("external_campaign_id", campaignId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    diagnosis = d ?? null;
  }
  if (!diagnosis) {
    return json({ error: "no_diagnosis", message: "Faz primeiro um diagnóstico 360 desta campanha." }, 422);
  }
  const diagnosisId = diagnosis.id;

  // 3) Período + insights agregados (campanha + adsets agregados)
  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);
  const since = new Date(today); since.setUTCDate(since.getUTCDate() - (periodDays - 1));
  const fromDate = since.toISOString().slice(0, 10);

  // A1 — 3 buckets (roas_7d, roas_28d, roas_lifetime) + janela legacy periodDays.
  // Query única sem filtro de data, sliced em memória pelos cut-offs.
  // Insights por campanha são pequenos (~365 rows/campanha max).
  const { data: campInsightsLifetime } = await (supabase as any)
    .schema("crm").from("meta_campaign_insights_daily")
    .select("date_start, impressions, reach, frequency, clicks, spend_cents, purchases_count, purchases_value_cents")
    .eq("external_campaign_id", campaignId)
    .order("date_start", { ascending: false });

  const cutoff7 = new Date(today); cutoff7.setUTCDate(cutoff7.getUTCDate() - 6);
  const cutoff28 = new Date(today); cutoff28.setUTCDate(cutoff28.getUTCDate() - 27);
  const cutoff7Str = cutoff7.toISOString().slice(0, 10);
  const cutoff28Str = cutoff28.toISOString().slice(0, 10);

  const campAgg = emptyAgg();      // legacy: janela periodDays — preservada para FIX 1 e métricas existentes
  const last7Agg = emptyAgg();
  const last28Agg = emptyAgg();
  const lifetimeAgg = emptyAgg();

  for (const r of campInsightsLifetime ?? []) {
    const d = r.date_start as string;
    aggregateInto(lifetimeAgg, r);
    if (d >= cutoff28Str) aggregateInto(last28Agg, r);
    if (d >= cutoff7Str) aggregateInto(last7Agg, r);
    if (d >= fromDate && d <= toDate) aggregateInto(campAgg, r);
  }

  const campMetrics = metricsOf(campAgg);
  const roasBuckets: ROASBuckets = {
    roas_7d: metricsOf(last7Agg).roas,
    roas_28d: metricsOf(last28Agg).roas,
    roas_lifetime: metricsOf(lifetimeAgg).roas,
  };

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
      .select("id, name, type, file_url, headline, body, cta_type, link_url, meta_creative_id")
      .in("meta_creative_id", inheritedIds);
    for (const c of lib ?? []) {
      const slot = inheritedMap.get(c.meta_creative_id);
      if (slot) slot.library = c;
    }
  }
  const inheritedCreatives = [...inheritedMap.values()];

  // 4) Evento + ticket avg
  // Multi-day tour aware: combina master + parent_event_id children + event_dates,
  // escolhe próxima futura (fallback: última passada). Fix S — caso Simone Mendes
  // onde master.date = data de criação no Meta e datas reais vivem nos children.
  let eventCtx: {
    id?: string; name?: string; date?: string;
    daysUntil?: number | null;
    tickets_total?: number | null; location?: string | null; ticketing_url?: string | null;
    effectiveDate?: string | null; eventDateSource?: string | null;
  } = {};
  if (campaign.linked_event_id) {
    const { data: e } = await supabase.from("events")
      .select("id, name, date, location, tickets_total, ticketing_url")
      .eq("id", campaign.linked_event_id).maybeSingle();
    if (e) {
      const [{ data: childrenRows }, { data: eventDatesRows }] = await Promise.all([
        supabase.from("events").select("date").eq("parent_event_id", e.id),
        supabase.from("event_dates").select("date").eq("event_id", e.id),
      ]);
      const resolved = resolveEffectiveEventDate(
        (e as any).date ?? null,
        (childrenRows ?? []) as Array<{ date: string | null }>,
        (eventDatesRows ?? []) as Array<{ date: string | null }>,
      );
      const daysUntil = resolved.effectiveMs != null
        ? Math.max(0, Math.round((resolved.effectiveMs - Date.now()) / 86400000))
        : null;
      const effectiveIso = resolved.effectiveMs != null
        ? new Date(resolved.effectiveMs).toISOString().slice(0, 10)
        : null;
      console.log("[redesign] event_date_resolution", {
        event_id: e.id,
        master_date: (e as any).date ?? null,
        n_children: childrenRows?.length ?? 0,
        n_event_dates: eventDatesRows?.length ?? 0,
        n_total: resolved.allDates.length,
        n_future: resolved.allDates.filter(d => d.is_future).length,
        effective_date: effectiveIso,
        source: resolved.source,
      });
      eventCtx = {
        id: e.id,
        name: e.name,
        date: e.date,
        daysUntil,
        tickets_total: e.tickets_total,
        location: e.location,
        ticketing_url: (e as any).ticketing_url ?? null,
        effectiveDate: effectiveIso,
        eventDateSource: resolved.source,
      };
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
  // Fase 3C — só há constraint EXPLÍCITA de verba quando o utilizador passou um número.
  // (keepOriginal a puxar o budget actual da campanha NÃO conta como explícita.)
  // Quando há constraint explícita, ela tem precedência sobre o budget determinístico.
  const hasExplicitBudgetConstraint =
    typeof ctIn.daily_budget_cents === "number" || typeof ctIn.lifetime_budget_cents === "number";
  if (keepOriginal && effDailyCents == null && effLifetimeCents == null) {
    effDailyCents = campaign.daily_budget_cents ?? null;
    effLifetimeCents = campaign.lifetime_budget_cents ?? null;
  }
  const effRoasFloor: number | null = typeof ctIn.roas_floor === "number" ? ctIn.roas_floor : null;
  const effEndTime: string | null = typeof ctIn.end_time === "string" && ctIn.end_time ? ctIn.end_time : null;
  // Target BLENDED ROAS para o evento (piso da meta — redesign corrige campanha existente face a este piso).
  // Default 8 (não 9 como em strategy-generate; aqui é piso, não centro da banda).
  const targetBlendedRoas: number = typeof ctIn.roas_floor === "number" && ctIn.roas_floor > 0 ? ctIn.roas_floor : 8;

  // ─────────────────────────────────────────────────────────────────────────
  // Fase 3B — Classificação determinística de criativos herdados (winner/loser/
  // inconclusive) por performance real (ROAS por criativo). NÃO remove criativos —
  // só ANEXA creative_performance + creative_label + marked_for_replacement a cada
  // entrada de inheritedCreatives. Colocado após targetBlendedRoas (necessário ao
  // limiar de winner) e após a herança (inheritedCreatives/inheritedIds já existem).
  // ─────────────────────────────────────────────────────────────────────────
  if (inheritedCreatives.length > 0) {
    // Mapa external_ad_id → meta_creative_id: TODOS os ads da campanha que usam os
    // criativos herdados (qualquer status — maximiza o histórico de performance).
    // Query separada da herança (não tocamos na query de 656-681).
    const adToCreative = new Map<string, string>();
    const { data: creativeAds } = await (supabase as any)
      .schema("crm").from("meta_ad_snapshot")
      .select("external_ad_id, meta_creative_id")
      .eq("company_id", campaign.company_id)
      .eq("external_campaign_id", campaignId)
      .in("meta_creative_id", inheritedIds);
    for (const a of creativeAds ?? []) {
      if (a.external_ad_id && a.meta_creative_id) adToCreative.set(a.external_ad_id, a.meta_creative_id);
    }
    const adIdsForPerf = [...adToCreative.keys()];

    // Agrega insights ALL-TIME (sem fatiar janela) por criativo: soma dos ads que o usam.
    const perfByCreative = new Map<string, { spend_cents: number; pv_cents: number; purchases: number }>();
    for (const id of inheritedIds) perfByCreative.set(id, { spend_cents: 0, pv_cents: 0, purchases: 0 });
    if (adIdsForPerf.length > 0) {
      const { data: creativeAdInsights } = await (supabase as any)
        .schema("crm").from("meta_ad_insights_daily")
        .select("external_ad_id, spend_cents, purchases_value_cents, purchases_count")
        .eq("company_id", campaign.company_id)
        .eq("external_campaign_id", campaignId)
        .in("external_ad_id", adIdsForPerf);
      for (const r of creativeAdInsights ?? []) {
        const cid = adToCreative.get(r.external_ad_id);
        if (!cid) continue;
        const agg = perfByCreative.get(cid);
        if (!agg) continue;
        agg.spend_cents += Number(r.spend_cents ?? 0);
        agg.pv_cents += Number(r.purchases_value_cents ?? 0);
        agg.purchases += Number(r.purchases_count ?? 0);
      }
    }

    // Classifica cada criativo herdado e anexa os campos (não remove nenhum).
    const winnerRoasThreshold = targetBlendedRoas * CREATIVE_WINNER_ROAS_RATIO;
    const creativeLabelCounts = { winner: 0, loser: 0, inconclusive: 0 };
    for (const c of inheritedCreatives as any[]) {
      const agg = perfByCreative.get(c.meta_creative_id) ?? { spend_cents: 0, pv_cents: 0, purchases: 0 };
      const spend_eur = agg.spend_cents / 100;
      const purchases_value_eur = agg.pv_cents / 100;
      const roas = spend_eur > 0 ? Math.round((purchases_value_eur / spend_eur) * 10000) / 10000 : null;
      let label: "winner" | "loser" | "inconclusive";
      if (spend_eur < CREATIVE_MIN_SPEND_EUR || agg.purchases < CREATIVE_MIN_PURCHASES) {
        // Gate de volume (inclui criativos sem qualquer insight) → não julgar.
        label = "inconclusive";
      } else {
        label = roas != null && roas >= winnerRoasThreshold ? "winner" : "loser";
      }
      creativeLabelCounts[label]++;
      c.creative_performance = {
        spend_eur: Math.round(spend_eur * 100) / 100,
        purchases_count: agg.purchases,
        purchases_value_eur: Math.round(purchases_value_eur * 100) / 100,
        roas,
      };
      c.creative_label = label;
      c.marked_for_replacement = label === "loser";
    }

    console.log("[redesign] creative_classification", {
      total_inherited: inheritedCreatives.length,
      winner: creativeLabelCounts.winner,
      loser: creativeLabelCounts.loser,
      inconclusive: creativeLabelCounts.inconclusive,
      winner_roas_threshold: Math.round(winnerRoasThreshold * 100) / 100,
    });
  }

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
  // (TICKET_AVG_FALLBACK_EUR e STATISTICAL_FLOOR_SPEND_EUR agora no topo — Fase 3C.)
  function analyzeViability(buckets: ROASBuckets) {
    const targetRoas = targetBlendedRoas;
    const currentRoas = campMetrics.roas ?? 0;
    const trajectory = classifyTrajectory(buckets.roas_7d, buckets.roas_28d);
    const eventGoalRevenue = (eventCtx.tickets_total ?? 0) * TICKET_AVG_FALLBACK_EUR;
    const daysUntil = eventCtx.daysUntil ?? 60;
    const currentDailySpend = (campAgg.spendCents / 100) / Math.max(1, periodDays);

    const needPurchases = eventGoalRevenue > 0 ? Math.ceil(eventGoalRevenue / TICKET_AVG_FALLBACK_EUR) : null;
    const currentPurchaseRate = campAgg.purchases / Math.max(1, periodDays);
    const projectedPurchases = currentPurchaseRate * daysUntil;

    const spendNeededForGoal = eventGoalRevenue > 0 ? eventGoalRevenue / targetRoas : null;
    const dailySpendNeeded = spendNeededForGoal != null && daysUntil > 0 ? spendNeededForGoal / daysUntil : null;

    const statisticalFloorSpend = STATISTICAL_FLOOR_SPEND_EUR;
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
      roas_7d: buckets.roas_7d,
      roas_28d: buckets.roas_28d,
      roas_lifetime: buckets.roas_lifetime,
      trajectory,
      roas_gap_multiplier: roasGap,
      gap_severity: gapSeverity,
      event_goal_revenue_eur: eventGoalRevenue,
      need_purchases: needPurchases,
      projected_purchases_at_current_rate: Math.round(projectedPurchases),
      current_daily_spend_eur: currentDailySpend,
      projected_total_spend_eur: currentProjectedSpend,
      daily_spend_needed_for_goal_eur: dailySpendNeeded,
      days_until_event: daysUntil,
      effective_event_date: eventCtx.effectiveDate ?? null,
      event_date_source: eventCtx.eventDateSource ?? null,
      statistical_floor_spend_eur: statisticalFloorSpend,
      statistical_floor_purchases: statisticalFloorPurchases,
      meets_statistical_floor: meetsStatFloor,
    };
  }

  const viability = analyzeViability(roasBuckets);

  // ─────────────────────────────────────────────────────────────────────────
  // Fase 3C — Budget diário/total DETERMINÍSTICO (substitui o budget do LLM no
  // caminho normal). Aplica-se SÓ quando NÃO há constraint explícita de verba do
  // utilizador — caso contrário a constraint mantém precedência.
  // ─────────────────────────────────────────────────────────────────────────
  function computeDeterministicBudget() {
    const days = Math.max(1, viability.days_until_event);
    const candidato_goal = viability.target_roas > 0
      ? viability.event_goal_revenue_eur / viability.target_roas / days : 0;
    const candidato_floor = STATISTICAL_FLOOR_SPEND_EUR / days;
    const ancora = Math.max(candidato_goal, candidato_floor);
    const winner: "goal" | "floor" = candidato_goal >= candidato_floor ? "goal" : "floor";
    // Cap só quando há gasto actual conhecido (>0) — gasto 0/desconhecido NÃO limita
    // (evita forçar budget 0); usa-se a âncora directamente.
    const cap = viability.current_daily_spend_eur > 0
      ? viability.current_daily_spend_eur * BUDGET_MAX_MULTIPLIER_VS_CURRENT
      : null;
    const cap_applied = cap != null && ancora > cap;
    const dailyBeforeRound = cap != null ? Math.min(ancora, cap) : ancora;
    const daily_final = Math.ceil(dailyBeforeRound / 5) * 5; // múltiplos de €5 (padrão CP1)
    const total = daily_final * days;
    return { daily_final, total, candidato_goal, candidato_floor, ancora, cap, cap_applied, winner };
  }
  const budgetDet = computeDeterministicBudget();
  const useDeterministicBudget = !hasExplicitBudgetConstraint && budgetDet.total > 0;
  console.log("[redesign] budget_deterministic", {
    candidato_goal: Math.round(budgetDet.candidato_goal * 100) / 100,
    candidato_floor: Math.round(budgetDet.candidato_floor * 100) / 100,
    ancora: Math.round(budgetDet.ancora * 100) / 100,
    cap: budgetDet.cap != null ? Math.round(budgetDet.cap * 100) / 100 : null,
    budget_diario_final: budgetDet.daily_final,
    budget_total_deterministico: budgetDet.total,
    winner: budgetDet.winner,
    cap_applied: budgetDet.cap_applied,
    current_daily_spend: Math.round(viability.current_daily_spend_eur * 100) / 100,
    applied: useDeterministicBudget,
    has_explicit_constraint: hasExplicitBudgetConstraint,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DIAG — Diagnóstico 360 server-to-server (crm-campaign-diagnosis).
  // [Fase 3A] Movido para ANTES do decideSkip/switch: define diagSourceClass e
  // diagBaselineRoas, necessários à ramificação de shape por classe (e à FIX 1).
  // Corre também nos caminhos de skip — intencional (a diagnosis é determinística
  // e barata). Padrão PAS: URL absoluto, reencaminha Authorization+apikey, falha
  // graciosa (em falha diagSourceClass e diagBaselineRoas ficam null).
  // ─────────────────────────────────────────────────────────────────────────
  let diagBaselineRoas: number | null = null;
  let diagSourceClass: string | null = null;
  let diag360Id: string | null = null;
  // 1.E-2 — ingredientes LIMPOS do diagnóstico (wind-down). Fallback gracioso a false/null.
  let diagIsWinddown = false;
  let diagCleanBaseNumber: number | null = null;
  let diagCleanBand: string | null = null;
  try {
    const diagUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-campaign-diagnosis`;
    console.log("[redesign] DIAG_starting", {
      company_id: campaign.company_id,
      external_campaign_id: campaignId,
      target_roas: targetBlendedRoas,
    });
    const diagResp = await fetch(diagUrl, {
      method: "POST",
      headers: {
        "Authorization": req.headers.get("Authorization") ?? "",
        "Content-Type": "application/json",
        "apikey": req.headers.get("apikey") ?? "",
      },
      body: JSON.stringify({
        company_id: campaign.company_id,
        external_campaign_id: campaignId,
        target_roas: targetBlendedRoas,
      }),
    });
    if (diagResp.ok) {
      const diagData = await diagResp.json();
      const baseline = Number(diagData?.projected_baseline_roas);
      diagBaselineRoas = Number.isFinite(baseline) && baseline > 0 ? baseline : null;
      diagSourceClass = typeof diagData?.source_campaign_class === "string" ? diagData.source_campaign_class : null;
      diag360Id = typeof diagData?.diagnosis_id === "string" ? diagData.diagnosis_id : null;
      // 1.E-2 — parsing defensivo dos campos limpos (wind-down).
      diagIsWinddown = diagData?.operational_warning?.is_winddown === true;
      const diagTraj = diagData?.levels?.campaign?.trajectory;
      const cleanNum = Number(diagTraj?.numero_base);
      diagCleanBaseNumber = Number.isFinite(cleanNum) && cleanNum > 0 ? cleanNum : null;
      diagCleanBand = typeof diagTraj?.trend_band === "string" ? diagTraj.trend_band : null;
      console.log("[redesign] DIAG_completed", {
        ok: diagData?.ok ?? null,
        source_campaign_class: diagSourceClass,
        projected_baseline_roas: diagData?.projected_baseline_roas ?? null,
        recommended_posture: diagData?.recommended_posture ?? null,
        diagnosis_id: diag360Id,
        usable_baseline: diagBaselineRoas,
      });
    } else {
      const errText = await diagResp.text().catch(() => "");
      console.warn("[redesign] DIAG_http_error", { status: diagResp.status, body_excerpt: errText.slice(0, 200) });
    }
  } catch (err) {
    console.warn("[redesign] DIAG_exception", { error: err instanceof Error ? err.message : String(err) });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fase 1 — Pré-checks early-abort de VIABILIDADE (D1 + D3) — independentes de classe.
  // Decide se vale a pena chamar o LLM. Devolve {reason, message} ou null.
  // (A3 movido para legacyA3Skip() — ver switch por classe da Fase 3A.)
  // ─────────────────────────────────────────────────────────────────────────
  function decideSkip(): { reason: SkipReason; message: string } | null {
    // D1 — Gap unrealistic + sem budget para validar
    if (viability.gap_severity === "unrealistic" && !viability.meets_statistical_floor) {
      return {
        reason: "unrealistic_gap",
        message:
          `ROAS actual ${viability.current_roas.toFixed(2)}x vs alvo ${viability.target_roas.toFixed(1)}x ` +
          `(gap ${viability.roas_gap_multiplier?.toFixed(1) ?? "?"}x — unrealistic) e spend projectado ` +
          `€${viability.projected_total_spend_eur.toFixed(0)} fica abaixo do floor estatístico ` +
          `€${viability.statistical_floor_spend_eur}. Sem orçamento para validar qualquer optimização. ` +
          `Recomenda-se: (1) prolongar prazo do evento, (2) aceitar ROAS menor como goal, ` +
          `ou (3) aumentar verba substancialmente antes de tentar redesign.`,
      };
    }
    // D3 — Horizon curto + sem floor estatístico
    if (
      viability.days_until_event < NO_OP_HORIZON_DAYS_THRESHOLD &&
      !viability.meets_statistical_floor
    ) {
      return {
        reason: "insufficient_horizon",
        message:
          `Faltam apenas ${viability.days_until_event} dias até ao evento e spend projectado ` +
          `€${viability.projected_total_spend_eur.toFixed(0)} não chega ao floor estatístico ` +
          `€${viability.statistical_floor_spend_eur}. Sem horizon nem volume para validar redesign — ` +
          `manter campanha actual e monitorizar até ao fim.`,
      };
    }
    // A3 movido para legacyA3Skip() (Fase 3A) — agora só corre no ramo default do
    // switch por classe (rede de segurança quando a diagnosis está indisponível).
    return null;
  }

  // legacyA3Skip — condição A3 ORIGINAL (pré-3A): trajectória ascendente perto do
  // alvo (campanha em auto-melhoria). Usada SÓ no ramo default do switch por classe
  // (diagSourceClass null/desconhecido). Lógica byte-a-byte igual à antiga A3.
  function legacyA3Skip(): { reason: SkipReason; message: string } | null {
    if (
      (viability.trajectory === "strong_uptrend" || viability.trajectory === "uptrend") &&
      viability.roas_7d != null &&
      viability.target_roas > 0 &&
      viability.roas_7d >= viability.target_roas * NO_OP_TARGET_PROXIMITY
    ) {
      return {
        reason: "ascending_trajectory_near_target",
        message:
          `Campanha em trajectória ${viability.trajectory} (ROAS 7d ${viability.roas_7d.toFixed(2)}x ` +
          `vs ROAS 28d ${viability.roas_28d?.toFixed(2) ?? "?"}x) e ROAS recente já a ` +
          `${((viability.roas_7d / viability.target_roas) * 100).toFixed(0)}% do alvo ${viability.target_roas.toFixed(1)}x. ` +
          `Recomenda-se NÃO fazer redesign — monitorizar próximos 7 dias para confirmar curva. ` +
          `Redesign agora arriscaria degradar uma campanha em auto-melhoria.`,
      };
    }
    return null;
  }

  // Gates de viabilidade D1/D3 (independentes de classe) — têm precedência sobre o switch.
  let skip = decideSkip();

  // ─────────────────────────────────────────────────────────────────────────
  // Fase 3A — Decisão de SHAPE do output por classe da campanha-fonte.
  // Corre após DIAG (diagSourceClass) e após os gates D1/D3 (não os altera).
  // Só decide o shape quando D1/D3 não abortaram.
  // ─────────────────────────────────────────────────────────────────────────
  if (!skip) {
    let outputShape: "skip_saudavel_subindo" | "skip_em_maturacao" | "redesign" | "fallback_default" = "redesign";
    let decidedBy: "class" | "fallback" = "class";
    switch (diagSourceClass) {
      case "em_maturacao":
        // Portão de maturação (diagnosis): campanha em learning phase. NÃO redesenhar —
        // o ROAS é imaturo (ruído estatístico), não estrutural. Redesign agora reiniciaria
        // a aprendizagem dos adsets de conversão e queimaria os dados já acumulados.
        // Mesmo shape de skip stub que "saudavel_subindo".
        skip = {
          reason: "campaign_in_learning_phase",
          message:
            `Campanha em fase de aprendizagem (classe "em_maturacao"): nenhum adset de conversão ` +
            `atingiu ainda ~50 eventos de optimização em 7 dias (learning phase da Meta). O ROAS ` +
            `actual é imaturo (ruído estatístico por falta de volume), não uma fraqueza estrutural. ` +
            `Recomenda-se NÃO fazer redesign agora — aguardar maturação e re-diagnosticar quando ` +
            `os adsets saírem de learning. Redesign agora reiniciaria a aprendizagem e queimaria ` +
            `os dados já acumulados.`,
        };
        outputShape = "skip_em_maturacao";
        break;
      case "saudavel_subindo":
        // Mesmo shape que o A3 antigo: skip stub. Campanha saudável e a subir.
        skip = {
          reason: "ascending_trajectory_near_target",
          message:
            `Campanha classificada como saudável e em trajectória ascendente ` +
            `(classe "saudavel_subindo"${diagBaselineRoas != null ? `, ROAS projectado ${diagBaselineRoas.toFixed(2)}x` : ""}). ` +
            `Recomenda-se NÃO fazer redesign agora — escalar gradualmente e monitorizar. ` +
            `Redesign arriscaria degradar uma campanha em auto-melhoria.`,
        };
        outputShape = "skip_saudavel_subindo";
        break;
      case "fraca":
        // Fluxo de redesign completo (caminho actual — não alterado).
        outputShape = "redesign";
        break;
      case "morta":
        // TODO Fase 3B: shape "nova_campanha_completa". Por agora cai no redesign.
        outputShape = "redesign";
        console.warn("[redesign] shape_not_specialized", {
          source_campaign_class: "morta",
          intended_shape: "nova_campanha_completa",
          using: "redesign_fallback",
        });
        break;
      case "saudavel_caindo":
        // TODO Fase 3B: shape "intervencao_cirurgica". Por agora cai no redesign.
        outputShape = "redesign";
        console.warn("[redesign] shape_not_specialized", {
          source_campaign_class: "saudavel_caindo",
          intended_shape: "intervencao_cirurgica",
          using: "redesign_fallback",
        });
        break;
      default: {
        // diagnosis indisponível / classe inesperada → rede de segurança pré-3A:
        // corre o A3 antigo. Se disparar → skip; senão segue para redesign.
        // Comportamento idêntico ao de antes da Fase 3A.
        const a3 = legacyA3Skip();
        if (a3) skip = a3;
        outputShape = "fallback_default";
        decidedBy = "fallback";
        break;
      }
    }
    console.log("[redesign] output_shape_decision", {
      diag_source_class: diagSourceClass,
      output_shape: outputShape,
      decided_by: decidedBy,
      skip_triggered: !!skip,
      skip_reason: skip?.reason ?? null,
    });
  }

  if (skip) {
    // Stub plan: mesma shape do output normal mas com phases vazias + flags de skip.
    // Front renderiza graciosamente via skip_llm flag (assumido — não verificado).
    const stubPlan = {
      skip_llm: true,
      skip_reason: skip.reason,
      redesign_rationale: skip.message,
      summary: {
        feasibility: "impossible" as const,
        feasibility_reason: skip.message,
        recommended_total_budget_eur: 0,
        expected_purchases: 0,
        expected_revenue_eur: 0,
        expected_overall_roas: viability.current_roas,
        expected_cpa_eur: 0,
        confidence: "low" as const,
      },
      phases: [] as any[],
      recommended_campaigns: [] as any[],
      risks_and_warnings: [] as any[],
      inherited_creatives: inheritedCreatives.map((c) => ({
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
      })),
      automation_metadata: {
        ready_to_deploy: false,
        deploy_blocked_reason: skip.message,
        skip_reason: skip.reason,
      },
    };
    const skipAppliedConstraints = {
      keep_original_budget: keepOriginal,
      daily_budget_cents: effDailyCents,
      lifetime_budget_cents: effLifetimeCents,
      roas_floor: effRoasFloor,
      end_time: effEndTime,
      violations_corrected: [] as string[],
      pause_original_mode: pauseOriginalMode,
      viability_analysis: viability,
      skip_llm: true,
      skip_reason: skip.reason,
    };
    const stubName = `Re-design (skip:${skip.reason}) — ${campaign.name}`.slice(0, 200);
    const adAccountIdSkip = campaign.ad_account_id?.startsWith("act_")
      ? campaign.ad_account_id
      : `act_${campaign.ad_account_id}`;
    // DR-2026-06-27c — dry_run: devolve stub sem persistir.
    if (dryRun) {
      console.log(`[redesign] dry_run early-abort skip: ${skip.reason}`);
      return json({
        generated_plan: stubPlan,
        redesign_rationale: skip.message,
        viability_analysis: viability,
        skip_llm: true,
        skip_reason: skip.reason,
        source: {
          campaign_id: campaign.external_campaign_id,
          campaign_name: campaign.name,
          diagnosis_id: diagnosisId,
        },
      });
    }
    const { data: skipInserted, error: skipInsErr } = await (supabase as any)
      .schema("crm").from("meta_campaign_strategies")
      .insert({
        company_id: campaign.company_id,
        connection_id: campaign.connection_id,
        ad_account_id: adAccountIdSkip,
        event_id: campaign.linked_event_id ?? null,
        name: stubName,
        goal_revenue_eur: 0,
        ticket_avg_eur: null,
        total_budget_eur: null,
        target_roas: null,
        days_until_event: eventCtx.daysUntil ?? null,
        country_codes: ["PT", "BR"],
        user_notes: `Re-design abortado (${skip.reason}) — campanha ${campaign.external_campaign_id}`,
        detected_artist: null,
        generated_plan: stubPlan,
        generation_model: modelId,
        generation_tokens_used: 0,
        generated_at: new Date().toISOString(),
        status: "generated",
        source_campaign_id: campaign.external_campaign_id,
        source_diagnosis_id: diagnosisId,
        redesign_rationale: skip.message,
        applied_constraints: skipAppliedConstraints,
        pause_original_mode: pauseOriginalMode,
        inheritance_decisions: inh ?? null,
        created_by: userId,
      })
      .select("id").single();
    if (skipInsErr || !skipInserted) {
      console.error("[redesign] skip persist failed", skipInsErr);
      return json({ error: "persist_failed", detail: skipInsErr?.message, plan: stubPlan }, 500);
    }
    console.log(`[redesign] early-abort skip: ${skip.reason}`);
    return json({
      strategy_id: skipInserted.id,
      generated_plan: stubPlan,
      redesign_rationale: skip.message,
      viability_analysis: viability,
      skip_llm: true,
      skip_reason: skip.reason,
      source: {
        campaign_id: campaign.external_campaign_id,
        campaign_name: campaign.name,
        diagnosis_id: diagnosisId,
      },
    });
  }

  // E1 — Downtrend pre-LLM warning injection.
  // Trajectórias descendentes NÃO fazem skip (diferente do A3 uptrend skip): queremos
  // o LLM analisar — pode haver fix operacional que reverta. Mas pré-popula warnings
  // que vão (a) ao prompt como contexto e (b) ao plan.risks_and_warnings pós-parse.
  const isDowntrend =
    viability.trajectory === "downtrend" || viability.trajectory === "strong_downtrend";
  const downtrendDropPct =
    isDowntrend && viability.roas_7d != null && viability.roas_28d != null && viability.roas_28d > 0
      ? (1 - viability.roas_7d / viability.roas_28d) * 100
      : null;
  const downtrendPreWarnings: Array<{
    type: string;
    severity: "high" | "medium";
    title: string;
    description: string;
  }> = isDowntrend && downtrendDropPct != null && viability.roas_7d != null && viability.roas_28d != null
    ? [{
        type: "trajectory_warning",
        severity: viability.trajectory === "strong_downtrend" ? "high" : "medium",
        title: "Queda recente no ROAS",
        description:
          `ROAS últimos 7 dias (${viability.roas_7d.toFixed(2)}x) caiu ${downtrendDropPct.toFixed(0)}% ` +
          `face a últimos 28 dias (${viability.roas_28d.toFixed(2)}x). Investigar causa antes de validar redesign.`,
      }]
    : [];

  // E2 — Downtrend prompt enhancement block.
  // Só injectado quando isDowntrend. Vazio caso contrário (não polui o prompt).
  const downtrendInstructionsBlock = isDowntrend && downtrendDropPct != null && viability.roas_7d != null && viability.roas_28d != null
    ? `
== TRAJECTÓRIA DESCENDENTE DETECTADA ==

A campanha está em queda — ROAS últimos 7d é ${viability.roas_7d.toFixed(2)}x vs ROAS 28d ${viability.roas_28d.toFixed(2)}x (${downtrendDropPct.toFixed(0)}% de queda).

REGRAS OBRIGATÓRIAS para este caso:
1. Integra explicitamente a queda recente no campo \`redesign_rationale\` (não apenas problemas operacionais; aborda o padrão temporal).
2. NÃO projectes \`expected_overall_roas\` superior a ${(viability.roas_7d * TRAJECTORY_DOWNTREND_PROJECTION_RATIO_LIMIT).toFixed(2)}x sem justificação explícita no rationale sobre como vais reverter a queda. Se projectares acima desse valor, explica concretamente que mudanças causam a recuperação (palavras como "estancar", "reverter", "corrigir ineficiência", "pivot", "nova estratégia").
3. Marca \`feasibility\` como "medium" no mínimo — nunca "high" — porque há risco real de a queda continuar mesmo com redesign.
4. Inclui em \`risks_and_warnings\` uma entrada específica sobre o downtrend (severidade "${viability.trajectory === "strong_downtrend" ? "high" : "medium"}").
`
    : "";

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
  const classReason = diagnosis?.diagnosis_jsonb?.levels?.campaign?.classification?.classification_reason ?? null;
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

  // P2: best-effort fetch das custom audiences reais da ad account para
  // injectar no prompt + permitir validação. Falha silenciosamente — o
  // redesign não bloqueia se a Graph API não responder ou se a decifragem
  // falhar; o LLM passa a ter regra "se não houver lista, NÃO uses ids".
  let customAudienceList: Array<{ id: string; name: string }> = [];
  // P1 — accessToken/adAcct HOISTED para reutilização pós-LLM (resolveInterestsInPlace).
  let accessToken: string | null = null;
  let adAcct: string | null = null;
  try {
    const { data: tokenRows, error: tokenErr } = await (supabase as any).rpc(
      "crm_get_meta_decrypted_token",
      { p_connection_id: campaign.connection_id, p_master_key: ENCRYPTION_MASTER_KEY },
    );
    if (!tokenErr && Array.isArray(tokenRows) && tokenRows.length > 0) {
      accessToken = (tokenRows[0] as { access_token: string }).access_token;
      adAcct = String(campaign.ad_account_id ?? "").startsWith("act_")
        ? String(campaign.ad_account_id)
        : `act_${campaign.ad_account_id}`;
      const caUrl = new URL(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAcct}/customaudiences`,
      );
      caUrl.searchParams.set("fields", "id,name");
      caUrl.searchParams.set("limit", "100");
      caUrl.searchParams.set("access_token", accessToken);
      const caResp = await fetch(caUrl.toString());
      const caJson = await caResp.json();
      if (caResp.ok && Array.isArray(caJson.data)) {
        customAudienceList = caJson.data
          .filter((c: any) => c?.id && c?.name)
          .map((c: any) => ({ id: String(c.id), name: String(c.name) }));
      } else {
        console.warn("[redesign] CA fetch non-ok:", caJson?.error?.message ?? caResp.status);
      }
    } else if (tokenErr) {
      console.warn("[redesign] CA decrypt failed (non-fatal):", tokenErr.message);
    }
  } catch (e) {
    console.warn("[redesign] CA fetch threw (non-fatal):", String(e));
  }

  const customAudiencesBlock = customAudienceList.length > 0
    ? `\n== CUSTOM AUDIENCES disponíveis nesta ad account ==\n` +
      customAudienceList.map((c) => `- id="${c.id}" name="${c.name}"`).join("\n") +
      `\n(usa estes ids VERBATIM em targeting_json.custom_audiences[].id e exclusions.custom_audiences[].id)\n`
    : `\n== CUSTOM AUDIENCES ==\n(nenhuma audience disponível ou fetch falhou — NÃO uses custom_audiences nem exclusions com ids inventados)\n`;

  const inheritedBlock = inheritedCreatives.length > 0
    ? `\n== CRIATIVOS DISPONÍVEIS (REAPROVEITAR POR DEFEITO) ==
A campanha original tem ${inheritedCreatives.length} criativo(s) que JÁ EXISTEM no Meta. **Reaproveita-os por defeito** — não peças briefs novos para o que já está bom.

Lista (Meta creative_id → descrição):
${inheritedCreatives.map((c, i) => `  ${i + 1}. ${c.meta_creative_id} (type=${c.library?.type ?? "?"}) — "${c.library?.name ?? c.ad_name ?? "sem nome"}"${c.library?.headline ? ` | hook: "${c.library.headline}"` : ""}`).join("\n")}

REGRAS PARA OS \`ads\` DE CADA ADSET:
- Para cada ad no plano, indica \`existing_creative_id: "<meta_creative_id>"\` em vez de pedir um brief novo.
- Distribui os criativos herdados pelos adsets de forma sensata (todos em todas as fases por defeito, salvo se a fase pedir criativo específico).
- Só sugere \`creative_brief\` (em alternativa) se o diagnóstico identificou problema concreto num criativo (hook_score < 60, audio_score < 60, congruência baixa) — nesse caso preenche \`creative_replacement_reason\` a explicar.
- Cada ad usa OR \`existing_creative_id\` OR \`creative_brief\`, NUNCA ambos.
- **Compatibilidade formato×objective (P4)**: em campanhas com objective REACH/BRAND_AWARENESS/VIDEO_VIEWS (mapeiam para OUTCOME_AWARENESS no Meta), só PODES referenciar \`existing_creative_id\` cujo type=video. Criativos image/carousel/dynamic em adsets dessas fases são rejeitados pelo deploy (erro 1885873). Em fases de awareness, se não houver vídeo herdado, prefere \`creative_brief\` para vídeo novo em vez de inserir image herdada.
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
- Capacidade: ${eventCtx.tickets_total ?? "N/A"}
- URL de bilheteira: ${eventCtx.ticketing_url ?? "(não definido)"}` : "(campanha sem evento vinculado)"}

== DIAGNÓSTICO 360 (classe=${diagnosis.source_campaign_class ?? "n/a"}, baseline_projetado=${diagnosis.projected_baseline_roas ?? "n/a"}x) ==
${classReason ? `Razão da classificação: ${classReason}\n` : ""}${diagJsonStr}
${inheritedBlock}
${customAudiencesBlock}
${crossEventContextText}
${inheritanceDecisionsText}
${viabilityBlock}
${downtrendInstructionsBlock}
== META PRINCIPAL ==
ROAS alvo BLENDED do evento: ${targetBlendedRoas.toFixed(1)}x (agregado entre TODAS as fases — não por campanha/adset individual).
Avaliação por fase: fases REACH/AWARENESS/VIDEO_VIEWS terão ROAS individual baixo (esperado 0–2x); fases CONVERSIONS/SALES devem entregar ROAS >=${targetBlendedRoas.toFixed(1)}x para puxar o blended; retargeting deve entregar 10–20x.
ROAS floor é HARD CONSTRAINT: nenhuma phase com peso >${(HIGH_BUDGET_SHARE_THRESHOLD * 100).toFixed(0)}% do budget total pode propor target_kpis.roas_min inferior a ${targetBlendedRoas.toFixed(1)}x.
Se não consegues atingir esse floor em phases com peso significativo, marca feasibility=medium/low e explica no redesign_rationale por que (não inflaciones números para forçar consistency).

== O QUE PRECISO QUE FAÇAS ==
Desenha uma estratégia COMPLETA estruturada em fases (3-5), aplicando o diagnóstico:
- Pausa/elimina o que está mau, escala o que funciona, corrige fraquezas (CTR baixo, CPA alto, frequência saturada, etc.).
- Adsets novos com targetings concretos (countries, age, interests, custom audiences, lookalikes). Para interests usa NOMES reais de interesses Meta (ex.: nome do artista, género musical); o sistema resolve o id automaticamente pós-geração. NUNCA inventes ids numéricos de interesse; NUNCA emitas interests como array de strings nuas — emite como objetos {name:"..."}.
- Verbas diárias e KPIs por fase.
- Inclui também \`redesign_rationale\` (texto curto, 3-6 frases, em PT) explicando o porquê das mudanças vs original.

Países alvo: ${countries.join(", ")}.${constraintsBlock}

REGRAS:
- **expected_overall_roas DEVE ser >= current_roas (${campMetrics.roas != null ? campMetrics.roas.toFixed(2) + "x" : "n/a"}).** Re-design existe para MELHORAR a campanha, não para degradar. Se a tua honest estimate é que o plano não consegue melhorar com os constraints actuais, NÃO proponhas o plano — usa feasibility='impossible' e redesign_rationale a explicar por que nenhum plano viável existe. Forçar números optimistas é inaceitável (Sprint 3c-2), mas propor degradação também é. A saída correcta é honestidade sobre impossibilidade.
- **COERÊNCIA INTERNA OBRIGATÓRIA dos campos do summary** (Sprint 3c-4.5) — todos devem bater entre si dentro de 10% de tolerância:
  * \`expected_revenue_eur ≈ expected_overall_roas × recommended_total_budget_eur\`
  * \`recommended_total_budget_eur ≈ expected_cpa_eur × expected_purchases\`
  Não inventes números aspiracionais para um campo enquanto mantens outros baseados na realidade. Se ROAS alvo é 8x, então \`recommended_total_budget × 8 = expected_revenue\`. Sem excepções.
  Exemplo correcto: budget 11000€, ROAS alvo 8x → revenue 88000€, com purchases ≈ 88000 / ticket_avg ≈ 3520, CPA = 11000 / 3520 ≈ 3.13€.
  Se a aritmética não bate, ajusta budget ou ROAS alvo. NÃO inventes. Plano com KPIs incoerentes será automaticamente marcado confidence='low'.
- Learning Phase: cada adset OFFSITE_CONVERSIONS precisa ~50 conversões/7d.
- Frequência: alertar se >5.
- Custom audiences / exclusions: usa APENAS os ids da lista "CUSTOM AUDIENCES disponíveis" acima, verbatim como id="...". NUNCA inventes placeholders nem nomes humanos como id. Se a lista estiver vazia, NÃO incluas \`custom_audiences\` nem \`exclusions\` no targeting_json.
- \`exclusions\` é um OBJETO Meta-válido, NUNCA um array. Forma correcta: \`"exclusions": {"custom_audiences": [{"id": "<id real>"}]}\`. Forma ERRADA (será descartada): \`"exclusions": [{"custom_audience_id": "..."}]\`.
- Sê crítico e directo no rationale.
- ROAS BLENDED: em cada phase do output, preenche \`expected_blended_contribution\` (peso 0–1 desta fase no ROAS agregado do evento — soma de todas as fases deve aproximar-se de 1.0; fases de conversão e retargeting pesam mais que awareness). Não definas \`roas_min\` em \`target_kpis\` de fases REACH/VIDEO_VIEWS; usa 0 ou omite.
- Creative briefs (ads NOVOS): quando propones \`creative_brief\` em qualquer ad, os campos \`headline_suggestion\`, \`primary_text_suggestion\` e \`cta_suggestion\` SÃO OBRIGATÓRIOS. Não basta \`primary_message\` abstracto — escreve a copy concreta como apareceria no anúncio final. \`headline_suggestion\` 30–50 chars; \`primary_text_suggestion\` 80–180 chars. \`cta_suggestion\` deve ser um valor Meta Ads válido (preferidos: GET_TICKETS para conversion phases, LEARN_MORE para awareness, SHOP_NOW se URL leva a checkout, SIGN_UP se leva a formulário). \`destination_url_hint\` é null por default — só preencher se o evento tiver ticketing_url conhecido ou se for óbvio do contexto.

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
            "publisher_platforms": ["facebook","instagram"],
            "custom_audiences": [{"id": "<id real da lista CUSTOM AUDIENCES, ou omitir o campo>"}],
            "exclusions": {"custom_audiences": [{"id": "<id real, ou omitir o campo inteiro>"}]},
            "interests": [{"name": "<nome real do interesse Meta; id resolvido pelo sistema>"}]
          },
          "optimization_goal": "REACH",
          "billing_event": "IMPRESSIONS",
          "creative_type_recommended": "video",
          "ads": [
            { "existing_creative_id": "<meta_creative_id herdado>" },
            {
              "creative_brief": {
                "primary_message": "...",
                "tone": "...",
                "must_include": ["..."],
                "avoid": ["..."],
                "headline_suggestion": "<headline curta 30-50 chars em PT-BR>",
                "primary_text_suggestion": "<primary text 80-180 chars em PT-BR>",
                "cta_suggestion": "GET_TICKETS|LEARN_MORE|SHOP_NOW|SIGN_UP",
                "destination_url_hint": "<URL ou null se não souber>"
              },
              "creative_replacement_reason": "porquê substituir um criativo herdado"
            }
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
  // DR-2026-06-27c (fix multi-modelo): temperature condicional + retry para 502/empty/5xx.
  // - GPT-5 (e qualquer openai/*) rejeita temperature!=1 → não enviar o campo.
  // - Gemini Pro intermitente (502/empty) → backoff 3 tentativas.
  const modelSupportsTemperature = (m: string): boolean => {
    const id = (m || "").toLowerCase();
    if (id.includes("gpt-5") || id.startsWith("openai/gpt-5")) return false;
    if (id.startsWith("openai/")) return false; // reasoning models OpenAI não aceitam override
    if (id.startsWith("google/gemini")) return true;
    return true;
  };

  const buildBody = () => {
    const body: Record<string, unknown> = {
      model: modelId,
      messages: [
        { role: "system", content: "És um especialista sênior em Meta Ads para eventos ao vivo. Respondes SEMPRE com JSON puro (sem fences) e em PT-BR." },
        { role: "user", content: prompt },
      ],
    };
    if (modelSupportsTemperature(modelId)) {
      // TEMP — reduzida vs 0.4 anterior para baixar variância nos números do plano.
      body.temperature = TEMPERATURE_REDESIGN_LLM;
    }
    return JSON.stringify(body);
  };

  const callAI = () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: buildBody(),
  });

  const RETRY_BACKOFF_MS = [1500, 3000, 6000];
  let aiResp: Response | null = null;
  let aiJson: any = null;
  let content = "";
  let usageTokens: number | null = null;
  let lastErrorKind: "rate_limit" | "ai_failed" | "ai_empty_response" | null = null;
  let lastErrorDetail = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= 3; attempt++) {
    aiResp = await callAI();
    lastStatus = aiResp.status;

    // 402 — terminal, não retry.
    if (aiResp.status === 402) {
      return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);
    }

    // 429 — retryable.
    if (aiResp.status === 429) {
      lastErrorKind = "rate_limit";
      const t = await aiResp.text().catch(() => "");
      lastErrorDetail = t.slice(0, 200);
      console.error(`[redesign][gateway-retry] { model: "${modelId}", status: 429, attempt: ${attempt}, snippet: ${JSON.stringify(t.slice(0, 200))} }`);
      if (attempt < 3) { await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1])); continue; }
      return json({ error: "rate_limit", message: "Lovable AI rate limit; tenta de novo em alguns segundos." }, 429);
    }

    // 5xx — retryable.
    if (aiResp.status >= 500) {
      lastErrorKind = "ai_failed";
      const t = await aiResp.text().catch(() => "");
      lastErrorDetail = t.slice(0, 200);
      console.error(`[redesign][gateway-retry] { model: "${modelId}", status: ${aiResp.status}, attempt: ${attempt}, snippet: ${JSON.stringify(t.slice(0, 200))} }`);
      if (attempt < 3) { await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1])); continue; }
      console.error("[redesign] AI error", aiResp.status, t.slice(0, 300));
      return json({ error: "ai_failed", detail: lastErrorDetail }, 502);
    }

    // Outros 4xx não-429 — terminal.
    if (!aiResp.ok) {
      const t = await aiResp.text().catch(() => "");
      console.error("[redesign] AI error", aiResp.status, t.slice(0, 300));
      return json({ error: "ai_failed", detail: t.slice(0, 200) }, 502);
    }

    // ok — verifica content vazio (retryable).
    aiJson = await aiResp.json();
    content = aiJson?.choices?.[0]?.message?.content ?? "";
    usageTokens = aiJson?.usage?.total_tokens ?? null;
    if (!content) {
      lastErrorKind = "ai_empty_response";
      lastErrorDetail = "empty content";
      console.error(`[redesign][gateway-retry] { model: "${modelId}", status: 200, attempt: ${attempt}, snippet: "ai_empty_response" }`);
      if (attempt < 3) { await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1])); continue; }
      return json({ error: "ai_empty_response" }, 502);
    }
    // sucesso
    break;
  }

  let plan: any;
  try { plan = JSON.parse(stripJsonFences(content)); }
  catch (e) {
    console.error("[redesign] parse error:", e, content.slice(0, 500));
    return json({ error: "ai_invalid_json", detail: content.slice(0, 200) }, 502);
  }

  // Normalização determinística pós-LLM (P2+P3 backstop, partilhada com generate).
  // Se o LLM ignorar as regras do prompt (exclusions array, ids inventados), corrige
  // o plan ANTES de qualquer validação a jusante. Warnings persistidas em
  // plan._normalization_warnings (merge com array existente se houver).
  {
    const normWarnings = normalizePlanInPlace(plan);
    if (normWarnings.length > 0) {
      console.warn("[redesign] normalization warnings:", normWarnings);
      const prev = Array.isArray(plan._normalization_warnings) ? plan._normalization_warnings : [];
      plan._normalization_warnings = [...prev, ...normWarnings];
    }
  }

  // P1 — Resolução determinística de interests nome→{id,name} via Meta /search.
  // accessToken vem do bloco P2 acima (hoisted). Se token é null (decrypt falhou),
  // o helper remove interests não-numéricos defensivamente com warning.
  {
    const interestWarnings = await resolveInterestsInPlace(plan, {
      accessToken, apiVersion: GRAPH_API_VERSION, locale: "pt_PT",
    });
    if (interestWarnings.length > 0) {
      console.warn("[redesign] interest resolution warnings", interestWarnings);
      const prev = Array.isArray(plan._normalization_warnings) ? plan._normalization_warnings : [];
      plan._normalization_warnings = [...prev, ...interestWarnings];
    }
  }

  // Fix 3 — Resolução determinística de geo "raio à volta de cidade".
  // accessToken hoisted (bloco P2). Null → fallback countries defensivo.
  {
    const geoWarnings = await resolveCustomLocationsInPlace(plan, {
      accessToken, apiVersion: GRAPH_API_VERSION, locale: "pt_PT",
    });
    if (geoWarnings.length > 0) {
      console.warn("[redesign] geo resolution warnings", geoWarnings);
      const prev = Array.isArray(plan._normalization_warnings) ? plan._normalization_warnings : [];
      plan._normalization_warnings = [...prev, ...geoWarnings];
    }
  }

  // NA-POST / CONF-POST — Override autoritário pós-LLM (única passagem).
  // LLM continua a gerar números livremente. Substituímos os 4 críticos do
  // summary + confidence com matemática auditável aqui. C2 (rationale "atingir Nx"
  // vs expected_roas) pode disparar warning — comportamento desejável: utilizador
  // vê o disagreement explícito via number_lineage. Sem injection pre-LLM em v1.
  if (plan && plan.summary && typeof plan.summary === "object") {
    const lifetimeMetricsForAnchor = metricsOf(lifetimeAgg);
    const estimatedBudgetFallback = Math.max(
      viability.current_daily_spend_eur * viability.days_until_event,
      viability.statistical_floor_spend_eur,
    );
    const recommendedBudgetFromLLM = Number(plan.summary.recommended_total_budget_eur) || estimatedBudgetFallback;
    // Fase 3C — budget determinístico tem precedência no caminho normal (sem constraint
    // explícita). Caso contrário usa o do LLM (comportamento anterior). Escala receita/
    // compras/CPA linearmente; NÃO afecta expected_overall_roas.
    const recommendedTotalBudget = useDeterministicBudget ? budgetDet.total : recommendedBudgetFromLLM;
    // 1.E-2 — override LIMPO: só quando o diagnóstico sinaliza wind-down E tem os ingredientes
    // (numero_base e banda limpos). Senão undefined → computeAnchoredNumbers calcula como hoje.
    const winddownCleanOverride = (diagIsWinddown && diagCleanBaseNumber != null && diagCleanBand != null)
      ? { baseline_roas: diagCleanBaseNumber, trajectory: diagCleanBand }
      : undefined;
    const anchoredPost = computeAnchoredNumbers({
      viability: {
        roas_7d: viability.roas_7d,
        roas_28d: viability.roas_28d,
        roas_lifetime: viability.roas_lifetime,
        gap_severity: viability.gap_severity,
        trajectory: viability.trajectory,
      },
      constraints: {
        daily_budget_eur: effDailyCents != null ? effDailyCents / 100 : null,
        roas_floor: targetBlendedRoas,
        end_date: effEndTime ?? "",
      },
      horizon_days: viability.days_until_event,
      recommended_total_budget_eur: recommendedTotalBudget,
      actual_revenue_eur: lifetimeMetricsForAnchor.revenue_eur,
      actual_purchases: lifetimeMetricsForAnchor.purchases,
      cleanOverride: winddownCleanOverride,
    });
    // 1.E-2 — log do override de baseline/banda por wind-down.
    const nlOverride = (anchoredPost.number_lineage as any).winddown_override;
    console.log("[redesign] winddown_baseline_override", {
      diag_is_winddown: diagIsWinddown,
      override_applied: !!winddownCleanOverride,
      internal_baseline_roas: nlOverride?.internal_baseline_roas ?? anchoredPost.number_lineage.baseline_roas,
      clean_baseline_roas: winddownCleanOverride ? diagCleanBaseNumber : null,
      internal_trajectory: viability.trajectory,
      clean_band: winddownCleanOverride ? diagCleanBand : null,
      final_roas: anchoredPost.expected_overall_roas,
    });
    const confidencePost = computeAnchoredConfidence({
      viability: { gap_severity: viability.gap_severity, trajectory: viability.trajectory },
      horizon_days: viability.days_until_event,
      statistical_floor_met: viability.meets_statistical_floor,
      final_roas: anchoredPost.expected_overall_roas,
      target_roas_floor: targetBlendedRoas,
    });

    plan.summary.expected_overall_roas = anchoredPost.expected_overall_roas;
    plan.summary.expected_revenue_eur = anchoredPost.expected_revenue_eur;
    plan.summary.expected_purchases = anchoredPost.expected_purchases;
    plan.summary.expected_cpa_eur = anchoredPost.expected_purchases > 0
      ? Math.round((recommendedTotalBudget / anchoredPost.expected_purchases) * 100) / 100
      : null;
    plan.summary.confidence = confidencePost.confidence;
    plan.summary.confidence_reasons = confidencePost.confidence_reasons;
    plan.summary.number_lineage = anchoredPost.number_lineage;
    // Fase 3C — quando determinístico, o total do summary passa a ser o calculado.
    if (useDeterministicBudget) plan.summary.recommended_total_budget_eur = budgetDet.total;

    console.log("[redesign] anchored_numbers", anchoredPost.number_lineage);
    console.log("[redesign] anchored_confidence", confidencePost);
  }

  // Fase 3C — budget_recommendation (UI) com os números DETERMINÍSTICOS quando aplicável.
  if (useDeterministicBudget && plan && typeof plan === "object") {
    const curDaily = viability.current_daily_spend_eur;
    plan.budget_recommendation = (plan.budget_recommendation && typeof plan.budget_recommendation === "object")
      ? plan.budget_recommendation : {};
    plan.budget_recommendation.suggested_daily_eur = budgetDet.daily_final;
    plan.budget_recommendation.suggested_total_eur = budgetDet.total;
    plan.budget_recommendation.adjustment_direction =
      budgetDet.daily_final > curDaily ? "increase" : budgetDet.daily_final < curDaily ? "decrease" : "maintain";
    plan.budget_recommendation.adjustment_reason =
      `Budget determinístico (3C): €${budgetDet.daily_final}/dia × ${viability.days_until_event} dias = €${budgetDet.total}. ` +
      `Âncora=${budgetDet.winner} (goal €${Math.round(budgetDet.candidato_goal)}/dia vs floor €${Math.round(budgetDet.candidato_floor)}/dia)` +
      `${budgetDet.cap_applied ? `, limitado a ${BUDGET_MAX_MULTIPLIER_VS_CURRENT}x o gasto diário actual (€${Math.round(curDaily)})` : ""}.`;
    plan.budget_recommendation.deterministic = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sprint 3c-2.5 — guardrails pós-parse. Ordem importa: FIX2 → FIX1 → FIX3 → FIX4.
  // FIX1 pode forçar feasibility='impossible'; FIX3 só dispara se FIX1 não bloqueou.
  // Os caps do Sprint 3c-2 (logo a seguir) operam sobre os valores já potencialmente ajustados.
  // ─────────────────────────────────────────────────────────────────────────

  // FIX 2 (Sprint 3c-2.5) — Forçar roas_min=0 em phases não-conversion.
  // IA estava a herdar roas_min do constraint global em phases REACH/VIDEO_VIEWS,
  // contrariando o prompt que pede 0 ou omitir.
  const NON_CONVERSION_OBJECTIVES = new Set(["REACH", "BRAND_AWARENESS", "VIDEO_VIEWS", "TRAFFIC"]);
  for (const phase of plan?.phases ?? []) {
    const obj = String(phase?.objective ?? "").toUpperCase();
    if (NON_CONVERSION_OBJECTIVES.has(obj) && phase?.target_kpis) {
      if (typeof phase.target_kpis.roas_min === "number" && phase.target_kpis.roas_min > 0) {
        const originalMin = phase.target_kpis.roas_min;
        phase.target_kpis.roas_min = 0;
        phase.target_kpis._roas_min_overridden_reason =
          `Phase ${obj} não deve ter roas_min>0 (era ${originalMin}). Forçado para 0.`;
      }
    }
  }

  // FIX 1 (Sprint 3c-2.5) — Guardrail anti-degradação.
  // Re-design existe para MELHORAR; se IA propõe expected_overall_roas < current_roas,
  // bloqueia o plano como 'impossible' + ready_to_deploy=false.
  // Só aplica quando current_roas > 0 (campanha sem compras: qualquer plano é melhoria).
  if (plan && plan.summary && typeof plan.summary === "object") {
    // Fonte do "actual" da comparação: baseline projectado da diagnosis (trajectória)
    // com precedência; fallback para o ROAS-30d estático (viability.current_roas).
    const useDiagBaseline = diagBaselineRoas != null && diagBaselineRoas > 0;
    const currentRoasForCheck = useDiagBaseline ? (diagBaselineRoas as number) : viability.current_roas;
    const baselineSource = useDiagBaseline ? "diagnosis" : "fallback_roas_30d";
    const expectedRoas = Number(plan.summary.expected_overall_roas ?? 0);
    console.log("[redesign] feasibility_baseline_source", {
      source: baselineSource,
      baseline_used: currentRoasForCheck,
      diagnosis_projected_baseline_roas: diagBaselineRoas,
      roas_30d_static: viability.current_roas,
      source_campaign_class: diagSourceClass,
    });
    if (currentRoasForCheck > 0 && expectedRoas > 0 && expectedRoas < currentRoasForCheck) {
      plan.summary.feasibility = "impossible";
      plan.summary.confidence = "low";
      plan.summary.feasibility_reason =
        `Re-design incongruente: plano propõe expected_overall_roas ${expectedRoas.toFixed(2)}x, ` +
        `inferior ao ${useDiagBaseline ? "baseline projectado de trajectória" : "actual"} ${currentRoasForCheck.toFixed(2)}x. Re-design existe para MELHORAR. ` +
        `Reavaliar premissas, ajustar constraints, ou aceitar que goal não é viável.`;
      plan.summary.expected_roas_degradation_blocked = true;
      plan.summary.expected_roas_degradation_reason =
        `Bloqueado por guardrail server-side: ${expectedRoas.toFixed(2)}x < ${currentRoasForCheck.toFixed(2)}x.`;
      plan.automation_metadata = plan.automation_metadata ?? {};
      plan.automation_metadata.ready_to_deploy = false;
      plan.automation_metadata.deploy_blocked_reason =
        `Plano propõe degradação de ROAS (${expectedRoas.toFixed(2)}x < ${currentRoasForCheck.toFixed(2)}x ${useDiagBaseline ? "baseline projectado de trajectória" : "actual"}). Não deployável.`;
      // C3 — substitui TODO o redesign_rationale do LLM por template determinístico.
      // Perde nuance do LLM mas garante coerência entre texto e estado (impossible).
      // Texto cita a fonte real do baseline: projecção de trajectória (diagnosis) ou
      // janela estática (fallback).
      const c3Baseline = useDiagBaseline
        ? `baseline projectado de trajectória ${currentRoasForCheck.toFixed(2)}x (diagnóstico 360 — projecção da tendência, não uma janela estática)`
        : `ROAS actual ${currentRoasForCheck.toFixed(2)}x`;
      plan.redesign_rationale =
        `Plano gerado projecta ROAS ${expectedRoas.toFixed(2)}x, inferior ao ${c3Baseline}. ` +
        `Recomenda-se: (1) reavaliar o ROAS floor configurado, ` +
        `(2) manter a campanha actual em observação, ou ` +
        `(3) considerar pausar e redirigir budget para campanhas com maior alavanca.`;
      console.warn(`[redesign] degradation blocked: expected ${expectedRoas.toFixed(2)}x < current ${currentRoasForCheck.toFixed(2)}x`);
    }
  }

  // CP-MAIN — Counter-proposals para planos impossible.
  // Disparado tanto por LLM impossible directo como por FIX 1 server-side guardrail.
  // Determinístico, sem chamada LLM. Output adicional em plan.counter_proposals.
  if (plan?.summary?.feasibility === "impossible") {
    const dailyBudgetEur = effDailyCents != null ? effDailyCents / 100 : null;
    if (dailyBudgetEur != null && effRoasFloor != null && viability.days_until_event > 0) {
      plan.counter_proposals = generateCounterProposals({
        viability: {
          roas_lifetime: viability.roas_lifetime,
          days_until_event: viability.days_until_event,
        },
        constraints: {
          daily_budget_eur: dailyBudgetEur,
          roas_floor: effRoasFloor,
          end_date: effEndTime ?? "",
        },
        horizon_days: viability.days_until_event,
        statistical_floor_eur: viability.statistical_floor_spend_eur,
        current_daily_total_eur: dailyBudgetEur * viability.days_until_event,
      });
    } else {
      plan.counter_proposals = [];
    }
  } else {
    plan.counter_proposals = [];
  }
  console.log("[redesign] counter_proposals", {
    generated_count: plan.counter_proposals.length,
    proposal_ids: plan.counter_proposals.map((p: any) => p.id),
  });

  // PAS-MAIN — Plano Alternativo Sugerido (auto-generated).
  // Quando o plano principal é impossible mas há CPs, faz fetch interno recursivo
  // com a CP priority 1 aplicada. Resultado anexado em plan.alternative_plan.
  // Guard via PAS_RECURSION_GUARD_FIELD evita loop infinito. Falha graciosa: se a
  // chamada interna falhar, o plano principal volta normalmente sem alternative_plan.
  // Custo: 2 chamadas LLM por redesign impossible (+30-60s latência).
  const isAlternativeRun = body?.[PAS_RECURSION_GUARD_FIELD] === true;
  if (
    plan?.summary?.feasibility === "impossible"
    && Array.isArray(plan.counter_proposals)
    && plan.counter_proposals.length > 0
    && !isAlternativeRun
  ) {
    try {
      const topProposal = [...plan.counter_proposals]
        .sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99))[0];

      // CP emite daily_budget_eur (EUR); body usa daily_budget_cents (cents). Converter.
      // roas_floor: unidade 1:1. CPs nunca emitem end_date/end_time.
      const newConstraints: any = { ...(body.constraints ?? {}) };
      for (const [k, change] of Object.entries(topProposal.constraints_change ?? {})) {
        const ch = change as { from?: number; to?: number } | undefined;
        if (!ch || typeof ch !== "object" || ch.to == null) continue;
        if (k === "daily_budget_eur") newConstraints.daily_budget_cents = Math.round(ch.to * 100);
        else if (k === "roas_floor") newConstraints.roas_floor = ch.to;
      }

      const altBody = {
        ...body,
        constraints: newConstraints,
        [PAS_RECURSION_GUARD_FIELD]: true,
        _pas_source_proposal_id: topProposal.id,
      };

      console.log("[redesign] PAS_starting", {
        source_proposal_id: topProposal.id,
        source_proposal_priority: topProposal.priority,
        constraints_changing: Object.keys(topProposal.constraints_change ?? {}),
      });

      const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-meta-campaign-redesign`;
      console.log("[redesign] PAS_self_url", { url: selfUrl });
      const altResp = await fetch(selfUrl, {
        method: "POST",
        headers: {
          "Authorization": req.headers.get("Authorization") ?? "",
          "Content-Type": "application/json",
          "apikey": req.headers.get("apikey") ?? "",
        },
        body: JSON.stringify(altBody),
      });

      if (altResp.ok) {
        const altData = await altResp.json();
        const altPlan = altData?.generated_plan ?? null;
        if (altPlan && typeof altPlan === "object") {
          // Defensive strip: inherited_creatives típico <100KB, mas se algum corner
          // case empurrar >500KB, descarta (alt usa os mesmos do plano principal).
          const icSize = JSON.stringify(altPlan.inherited_creatives ?? []).length;
          const icStripped = icSize > PAS_INHERITED_CREATIVES_MAX_BYTES;
          if (icStripped) {
            delete altPlan.inherited_creatives;
            altPlan.inherited_creatives_omitted = true;
          }
          // Defesa em profundidade: garante que alt nunca tem alternative_plan recursivo.
          delete altPlan.alternative_plan;
          // alt.counter_proposals preservado intacto (útil se alt sair stretch/moderate).

          plan.alternative_plan = {
            ...altPlan,
            applied_counter_proposal: {
              id: topProposal.id,
              label: topProposal.label,
              priority: topProposal.priority,
              constraints_change: topProposal.constraints_change,
            },
            applied_counter_proposal_summary: topProposal.label,
            is_counter_proposal_alternative: true,
          };

          console.log("[redesign] PAS_completed", {
            source_proposal_id: topProposal.id,
            alt_feasibility: altPlan?.summary?.feasibility ?? "unknown",
            alt_expected_roas: altPlan?.summary?.expected_overall_roas ?? null,
            alt_expected_revenue: altPlan?.summary?.expected_revenue_eur ?? null,
            alt_has_counter_proposals: Array.isArray(altPlan.counter_proposals) && altPlan.counter_proposals.length > 0,
            inherited_creatives_stripped: icStripped,
          });
        } else {
          console.warn("[redesign] PAS_empty_plan", { source_proposal_id: topProposal.id });
        }
      } else {
        const errText = await altResp.text().catch(() => "");
        console.warn("[redesign] PAS_http_error", {
          status: altResp.status,
          body_excerpt: errText.slice(0, 200),
        });
      }
    } catch (err) {
      console.warn("[redesign] PAS_exception", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // FIX 3 (Sprint 3c-2.5) — deploy_warning informativo (não bloqueante).
  // Não duplicar quando FIX 1 já preencheu deploy_blocked_reason.
  if (!plan?.automation_metadata?.deploy_blocked_reason) {
    const feas = String(plan?.summary?.feasibility ?? "").toLowerCase();
    const conf = String(plan?.summary?.confidence ?? "").toLowerCase();
    if (feas === "low" || feas === "impossible" || conf === "low") {
      plan.automation_metadata = plan.automation_metadata ?? {};
      plan.automation_metadata.deploy_warning =
        `Plano avaliado como feasibility=${feas}/confidence=${conf}. ` +
        `Deploy é permitido mas considera revisar premissas ou tratar como experiência controlada.`;
    }
  }

  // FIX 4 (Sprint 3c-2.5) — Detector de concentração de risco.
  // Phase com contribuição >30% do blended mas <15% do budget = plano fragil.
  const allPhasesForRisk: any[] = plan?.phases ?? [];
  const totalDailyBudget = allPhasesForRisk.reduce(
    (s: number, p: any) => s + (Number(p?.daily_budget_eur) || 0), 0,
  );
  if (totalDailyBudget > 0 && allPhasesForRisk.length > 0) {
    const concentrationRisks: Array<{ phase_id: string; phase_name: string; contribution_pct: string; budget_share_pct: string; phase_daily_budget: number }> = [];
    for (const p of allPhasesForRisk) {
      const contribution = Number(p?.expected_blended_contribution) || 0;
      const phaseBudget = Number(p?.daily_budget_eur) || 0;
      const budgetShare = phaseBudget / totalDailyBudget;
      if (contribution > 0.3 && budgetShare < 0.15) {
        concentrationRisks.push({
          phase_id: String(p?.id ?? ""),
          phase_name: String(p?.name ?? p?.id ?? "?"),
          contribution_pct: (contribution * 100).toFixed(0),
          budget_share_pct: (budgetShare * 100).toFixed(1),
          phase_daily_budget: phaseBudget,
        });
      }
    }
    if (concentrationRisks.length > 0) {
      plan.risks_and_warnings = plan.risks_and_warnings ?? [];
      for (const risk of concentrationRisks) {
        plan.risks_and_warnings.push({
          severity: "high",
          title: `Concentração de risco em phase pequena: ${risk.phase_name}`,
          description:
            `Phase "${risk.phase_name}" tem contribuição esperada de ${risk.contribution_pct}% ` +
            `do ROAS blended mas apenas ${risk.budget_share_pct}% do budget total ` +
            `(€${risk.phase_daily_budget.toFixed(2)}/dia). Plano fragil — se esta phase ` +
            `não entregar o leverage esperado, ROAS blended colapsa. Validar audiences ` +
            `e criativos desta phase antes de deploy.`,
        });
      }
      console.log(`[redesign] concentration risks detected: ${concentrationRisks.length}`);
    }
  }

  // FIX 5 (Sprint 3c-4.5) — Coerência interna dos KPIs do summary.
  // Tolerância 10%. Se incoerente, força confidence='low' e regista warning.
  // Caso descoberto Ivete F: budget=11100, revenue=11100, ROAS=8 (drift 87% no Check 1).
  const sumKpi: any = plan?.summary;
  if (sumKpi && typeof sumKpi === "object") {
    const totalBudget = Number(sumKpi.recommended_total_budget_eur) || 0;
    const expectedRevenue = Number(sumKpi.expected_revenue_eur) || 0;
    const expectedRoasInternal = Number(sumKpi.expected_overall_roas) || 0;
    const expectedPurchases = Number(sumKpi.expected_purchases) || 0;
    const expectedCpa = Number(sumKpi.expected_cpa_eur) || 0;
    const kpiIssues: string[] = [];

    // Check 1: revenue ≈ roas × budget (tolerância 10%)
    if (totalBudget > 0 && expectedRoasInternal > 0 && expectedRevenue > 0) {
      const impliedRev = totalBudget * expectedRoasInternal;
      const drift = Math.abs(expectedRevenue - impliedRev) / impliedRev;
      if (drift > 0.10) {
        kpiIssues.push(
          `Receita €${expectedRevenue.toFixed(0)} inconsistente com ROAS ${expectedRoasInternal.toFixed(1)}x × Verba €${totalBudget.toFixed(0)} = €${impliedRev.toFixed(0)} (desvio ${(drift * 100).toFixed(0)}%)`,
        );
      }
    }

    // Check 2: cpa × purchases ≈ budget (tolerância 10%)
    if (expectedCpa > 0 && expectedPurchases > 0 && totalBudget > 0) {
      const impliedCost = expectedCpa * expectedPurchases;
      const drift = Math.abs(totalBudget - impliedCost) / totalBudget;
      if (drift > 0.10) {
        kpiIssues.push(
          `Verba €${totalBudget.toFixed(0)} inconsistente com CPA €${expectedCpa.toFixed(2)} × ${expectedPurchases} compras = €${impliedCost.toFixed(0)} (desvio ${(drift * 100).toFixed(0)}%)`,
        );
      }
    }

    if (kpiIssues.length > 0) {
      sumKpi.kpi_coherence_warning = kpiIssues.join(" | ");
      if (sumKpi.confidence !== "low") {
        const prevConf = sumKpi.confidence;
        sumKpi.confidence = "low";
        sumKpi.confidence_capped_reason =
          (sumKpi.confidence_capped_reason ? sumKpi.confidence_capped_reason + " | " : "") +
          `Confiança rebaixada de ${prevConf} para low por incoerência interna nos KPIs: ${kpiIssues[0]}`;
      }
      console.warn(`[redesign] KPI incoherence detected:`, kpiIssues);
    }
  }

  // C2 (Sprint redesign optimizer fix) — Coerência texto vs números no redesign_rationale.
  // Heurístico: detecta padrões "melhorar/atingir/chegar a Nx" e compara com expected_overall_roas.
  // Pode dar falsos positivos em frases históricas/comparativas; é warning, não block.
  {
    const rationaleText = String(plan?.redesign_rationale ?? "");
    const expectedRoasC2 = Number(plan?.summary?.expected_overall_roas) || 0;
    if (rationaleText && expectedRoasC2 > 0) {
      const KEYWORD_PATTERNS = /(?:melhor(?:ar|ia)?\s+para|atingir|chegar(?:\s+a)?|alcan[çc]ar|subir(?:\s+a)?|para)\s+(\d{1,2}(?:[.,]\d+)?)\s*x/gi;
      let m: RegExpExecArray | null;
      let maxClaimed = 0;
      while ((m = KEYWORD_PATTERNS.exec(rationaleText)) !== null) {
        const n = parseFloat(m[1].replace(",", "."));
        if (!isNaN(n) && n > maxClaimed) maxClaimed = n;
      }
      if (maxClaimed > 0 && maxClaimed - expectedRoasC2 > KEYWORD_DIVERGENCE_TOLERANCE) {
        plan.risks_and_warnings = plan.risks_and_warnings ?? [];
        plan.risks_and_warnings.push({
          severity: "medium",
          title: "Incoerência texto/números no redesign_rationale",
          description:
            `Texto promete ${maxClaimed}x mas plano entrega ${expectedRoasC2.toFixed(2)}x ` +
            `(tolerância configurada: ${KEYWORD_DIVERGENCE_TOLERANCE}x).`,
        });
        console.warn(`[redesign] C2 keyword divergence: claimed=${maxClaimed}x expected=${expectedRoasC2.toFixed(2)}x`);
      }
    }
  }

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

  // FIX 7 / E3 — Downtrend post-LLM coherence (Sprint downtrend handling).
  // Caso Ivete: LLM recebe trajectory=strong_downtrend mas não a integra na narrativa
  // nem calibra a projecção (rationale silencia a queda, expected_overall_roas optimista).
  // Aplicação:
  //   7.1 — Merge pre-warnings de E1 com plan.risks_and_warnings (dedupe fuzzy por título)
  //   7.2 — Detecta projecção overoptimistic (expected > roas_7d * limit) sem keywords recovery
  //   7.3 — Soft warning quando LLM marca feasibility=high (preserva valor + audit trail)
  const downtrendPostCheckFlags = { overoptimistic_added: false, feasibility_capped_warning: false };
  if (isDowntrend && plan && typeof plan === "object") {
    // 7.1 — Merge pre-warnings com dedupe fuzzy por título existente
    plan.risks_and_warnings = plan.risks_and_warnings ?? [];
    const existingTitles: string[] = (plan.risks_and_warnings as any[])
      .map((w) => String(w?.title ?? "").toLowerCase());
    for (const pre of downtrendPreWarnings) {
      const isDuplicate = existingTitles.some(
        (t) =>
          t.startsWith("queda") ||
          t.includes("trajectória descendente") ||
          t.includes("trajetória descendente") ||
          t.includes("downtrend"),
      );
      if (!isDuplicate) {
        plan.risks_and_warnings.push({
          severity: pre.severity,
          title: pre.title,
          description: pre.description,
        });
      }
    }

    // 7.2 — Detector de projecção overoptimistic sem justificação de recovery
    if (viability.roas_7d != null && viability.roas_7d > 0 && plan.summary && typeof plan.summary === "object") {
      const expected = Number(plan.summary.expected_overall_roas) || 0;
      const ratioLimit = viability.roas_7d * TRAJECTORY_DOWNTREND_PROJECTION_RATIO_LIMIT;
      if (expected > ratioLimit) {
        const rationaleText = String(plan?.redesign_rationale ?? "").toLowerCase();
        const hasJustification = TRAJECTORY_RECOVERY_KEYWORDS.some((kw) => rationaleText.includes(kw.toLowerCase()));
        if (!hasJustification) {
          plan.risks_and_warnings.push({
            severity: "high",
            title: "Projecção optimista sem justificação",
            description:
              `expected_overall_roas (${expected.toFixed(2)}x) é mais de ${TRAJECTORY_DOWNTREND_PROJECTION_RATIO_LIMIT}x ` +
              `o ROAS recente (${viability.roas_7d.toFixed(2)}x), e o rationale não menciona explicitamente o plano ` +
              `de reverter a queda. Reavaliar realismo.`,
          });
          downtrendPostCheckFlags.overoptimistic_added = true;
        }
      }
    }

    // 7.3 — Soft warning quando LLM marca feasibility=high em downtrend.
    // NÃO altera o valor original: preserva o sinal do LLM (audit trail do disagreement
    // entre modelo e validador determinístico). Adiciona warning explícito para o
    // utilizador decidir. Discutido na review: hard override esconde o disagreement.
    if (plan.summary && typeof plan.summary === "object") {
      const currentFeas = String(plan.summary.feasibility ?? "").toLowerCase();
      if (currentFeas === "high") {
        plan.risks_and_warnings.push({
          type: "feasibility_calibration",
          severity: "high",
          title: "Confiança 'high' face a trajectória descendente",
          description:
            `LLM marcou viabilidade=high mas campanha está em ${viability.trajectory} ` +
            `(queda de ${downtrendDropPct != null ? downtrendDropPct.toFixed(0) : "?"}% face a 28d). ` +
            `Reavaliar se as recomendações são suficientes para reverter a tendência observada.`,
        });
        plan.summary.feasibility_calibration_note =
          "Trajectory descendente — confiança 'high' sinalizada como possivelmente excessiva " +
          "(valor não foi alterado, ver risks_and_warnings)";
        downtrendPostCheckFlags.feasibility_capped_warning = true;
      }
    }
  }

  // E4 — Logging defensivo do downtrend handling
  if (isDowntrend) {
    console.log("[redesign] downtrend_handling", {
      trajectory: viability.trajectory,
      roas_7d: viability.roas_7d,
      roas_28d: viability.roas_28d,
      drop_pct: downtrendDropPct != null ? Number(downtrendDropPct.toFixed(1)) : null,
      pre_warnings_added: downtrendPreWarnings.length,
      post_check_warning_added: downtrendPostCheckFlags.overoptimistic_added,
      feasibility_capped_warning: downtrendPostCheckFlags.feasibility_capped_warning,
    });
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

  // 7.0.2) P4 — enforce determinístico de compatibilidade formato×objective.
  // Em campanhas OUTCOME_AWARENESS (REACH/BRAND_AWARENESS/VIDEO_VIEWS), o Meta
  // rejeita criativos image/carousel/dynamic (erro 1885873). Filtra os ads que
  // referenciam existing_creative_id de type != "video" nessas fases. Lookup do
  // type a partir de inheritedCreatives (já carregado, sem queries extra).
  {
    const typeByCreativeId = new Map<string, string | undefined>(
      inheritedCreatives.map((ic: any) => [ic.meta_creative_id, ic?.library?.type])
    );
    const p4Warnings: string[] = [];
    for (const c of plan?.recommended_campaigns ?? []) {
      const campObj = mapObjective(c?.objective);
      if (campObj !== "OUTCOME_AWARENESS") continue;
      for (const a of c?.adsets ?? []) {
        if (!Array.isArray(a.ads)) continue;
        const before = a.ads.length;
        a.ads = a.ads.filter((ad: any) => {
          const cid = typeof ad?.existing_creative_id === "string" ? ad.existing_creative_id : null;
          if (!cid) return true; // brief novo passa — deploy logo decide
          const t = typeByCreativeId.get(cid);
          if (t === "video") return true;
          p4Warnings.push(`campanha "${c?.campaign_name ?? "?"}" adset "${a?.adset_name ?? "?"}": ad com creative_id=${cid} type=${t ?? "?"} removido (OUTCOME_AWARENESS requer vídeo)`);
          return false;
        });
        if (a.ads.length !== before) {
          // se ficou sem ads, deixa array vazio — gate a jusante valida
        }
      }
    }
    if (p4Warnings.length > 0) {
      console.warn("[redesign] P4 awareness×non-video filter:", p4Warnings);
      const prev = Array.isArray(plan._normalization_warnings) ? plan._normalization_warnings : [];
      plan._normalization_warnings = [...prev, ...p4Warnings];
    }
  }

  // 7) Validar e enforce constraints (sobrescreve se IA desviou >5%)
  const constraintViolations: string[] = [];
  // 2a (review 3C) — em modo budget DETERMINÍSTICO, a 3C é a fonte do budget; o
  // enforcement antigo (clobber do summary + re-escala das campanhas) NÃO corre.
  if (effDailyCents != null && !useDeterministicBudget) {
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
    // B1 — antes da sobrescrita, computar peso de cada phase e flag warnings
    // para phases relevantes (>30% peso) onde o LLM propôs roas_min < floor.
    const totalDailyForB1 = (plan?.phases ?? []).reduce(
      (s: number, p: any) => s + (Number(p?.daily_budget_eur) || 0), 0,
    );
    for (const phase of plan?.phases ?? []) {
      if (!phase?.target_kpis) continue;
      const originalMin = phase.target_kpis.roas_min;
      const needsOverride = originalMin == null || originalMin < effRoasFloor;
      if (!needsOverride) continue;
      // B1 warning quando phase tem peso relevante e LLM propôs explicitamente abaixo do floor
      if (typeof originalMin === "number" && totalDailyForB1 > 0) {
        const phaseBudget = Number(phase?.daily_budget_eur) || 0;
        const budgetShare = phaseBudget / totalDailyForB1;
        if (budgetShare > HIGH_BUDGET_SHARE_THRESHOLD && originalMin < effRoasFloor) {
          plan.risks_and_warnings = plan.risks_and_warnings ?? [];
          plan.risks_and_warnings.push({
            severity: "medium",
            title: `Fase "${phase?.name ?? phase?.id ?? "?"}" com peso significativo não atinge floor`,
            description:
              `Fase com ${(budgetShare * 100).toFixed(0)}% do budget total propôs roas_min ` +
              `${originalMin.toFixed(2)}x abaixo do floor configurado ${effRoasFloor.toFixed(2)}x. ` +
              `Valor sobrescrito de ${originalMin.toFixed(2)}x para ${effRoasFloor.toFixed(2)}x — ` +
              `verificar se floor é realista para esta fase.`,
          });
        }
      }
      phase.target_kpis.roas_min = effRoasFloor;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fase 3C v3 — Distribuição do budget determinístico pela CURVA do LLM. SEM piso rígido
  // nem water-filling: o total é SEMPRE o determinístico (não há overshoot). TODAS as fases
  // recebem uma verba SUGERIDA + EDITÁVEL — a UI ajusta-a mantendo o total fixo, redistribuindo
  // o delta pelas RESTANTES fases ∝ peso. Só no caminho normal.
  //  B) escala única total/Σtotal_LLM → curva (forma decrescente do LLM) preservada.
  //  E) cada campanha copia o daily da sua fase (1:1 via phase_id).
  //  Saída: learning_budget por fase (editável) + redistribution_contract para a UI.
  // ─────────────────────────────────────────────────────────────────────────
  if (useDeterministicBudget && Array.isArray(plan?.phases) && plan.phases.length > 0) {
    const sumDuration = plan.phases.reduce((s: number, p: any) => s + (Number(p?.duration_days) || 0), 0);
    if (sumDuration > 0) {
      // Contexto INFORMATIVO (não entra em nenhum cálculo de verba). Vem do summary
      // (anchoring interno do redesign) — nunca depende de insights da Meta.
      const expectedCpa = Number(plan?.summary?.expected_cpa_eur);
      const expectedCpaOut = Number.isFinite(expectedCpa) && expectedCpa > 0 ? Math.round(expectedCpa * 100) / 100 : null;

      // ── Parte B — curva (escala única). total_phase_budget_eur do LLM (fallback daily×dur)
      // define a forma; uma só escala preserva-a exactamente. Total = determinístico.
      const phasesArr: any[] = plan.phases;
      const campaigns: any[] = Array.isArray(plan?.recommended_campaigns) ? plan.recommended_campaigns : [];
      const ph = phasesArr.map((p: any) => {
        const dur = Number(p?.duration_days) || 0;
        const tRaw = Number(p?.total_phase_budget_eur);
        const dyLLM = Number(p?.daily_budget_eur) || 0;
        const totalLLM = Number.isFinite(tRaw) && tRaw > 0 ? tRaw : dyLLM * dur;
        const obj = String(p?.objective ?? "").toUpperCase();
        const isLearning = !NON_CONVERSION_OBJECTIVES.has(obj);
        return { ref: p, dur, totalLLM, dailyLLM: dur > 0 ? totalLLM / dur : 0, obj, isLearning };
      });
      const sumPhaseTotalLLM = ph.reduce((s, x) => s + x.totalLLM, 0);
      const scale0 = sumPhaseTotalLLM > 0 ? budgetDet.total / sumPhaseTotalLLM : 0;

      // ── Escreve daily/total da curva por fase + marca aprendizagem/editável.
      const dailyByPhase: Record<string, number> = {};
      let sumDistributed = 0;
      for (const x of ph) {
        const totalCurve = x.totalLLM * scale0;
        const daily = x.dur > 0 ? Math.round((totalCurve / x.dur) * 100) / 100 : 0;
        const totalPhase = Math.round(daily * x.dur * 100) / 100;
        x.ref.daily_budget_eur = daily;
        x.ref.total_phase_budget_eur = totalPhase;
        sumDistributed += totalPhase;
        dailyByPhase[String(x.ref?.id ?? "")] = daily;
        // 3C v3.1 — TODAS as fases são editáveis e redistribuíveis. is_learning_phase fica
        // como rótulo informativo (objective ∉ NON_CONVERSION_OBJECTIVES) e NÃO condiciona
        // editable. Contexto (cpa/conversões) é só informativo, presente em todas as fases.
        const estConv = expectedCpaOut && expectedCpaOut > 0 ? Math.round(totalPhase / expectedCpaOut) : null;
        x.ref.learning_budget = {
          is_learning_phase: x.isLearning,
          editable: true,
          suggested_daily_eur: daily,
          expected_cpa_eur: expectedCpaOut,
          estimated_conversions: estConv,
        };
      }
      sumDistributed = Math.round(sumDistributed * 100) / 100;

      // ── Parte E — campanhas 1:1 copiam o daily da sua fase.
      let campaignsMatched = 0;
      for (const c of campaigns) {
        const pid = String(c?.phase_id ?? "");
        if (Object.prototype.hasOwnProperty.call(dailyByPhase, pid)) {
          c.daily_budget_eur = dailyByPhase[pid];
          campaignsMatched++;
        } else {
          console.warn("[redesign] campaign_phase_unmatched", { phase_id: pid });
        }
      }

      // ── Contrato de redistribuição de TOTAL FIXO para a UI. A edição da verba é feita na
      // plataforma (esta função não recebe override). Fornecemos os dados: total fixo + UMA
      // lista única com TODAS as fases e o seu peso (verba-base da curva escalada). Todas são
      // editáveis e redistribuíveis. A lista nunca fica vazia quando há fases no plano. O limiar
      // de aviso é RELATIVO (ratio × peso) → escala com o tamanho do evento.
      const contractPhases = ph.map((x) => ({
        phase_id: String(x.ref?.id ?? ""),
        weight: Number(x.ref.total_phase_budget_eur) || 0,
      }));

      // ── budget_recommendation — total determinístico (sempre) + média informativa + contrato.
      const avgDaily = Math.round((budgetDet.total / sumDuration) * 100) / 100;
      if (plan.budget_recommendation && typeof plan.budget_recommendation === "object") {
        const curDaily = viability.current_daily_spend_eur;
        plan.budget_recommendation.suggested_total_eur = budgetDet.total;
        plan.budget_recommendation.suggested_daily_eur = avgDaily;
        plan.budget_recommendation.suggested_daily_is_average = true; // curva real por fase
        plan.budget_recommendation.adjustment_direction =
          avgDaily > curDaily ? "increase" : avgDaily < curDaily ? "decrease" : "maintain";
        plan.budget_recommendation.adjustment_reason =
          `Budget determinístico (3C v3): alvo €${budgetDet.total} distribuído pela curva do LLM (escala ${scale0.toFixed(3)}). ` +
          `${contractPhases.length} fase(s) com verba editável e redistribuível (sugestão = curva). ` +
          `Daily €${avgDaily} é a MÉDIA (a curva real está em phases[].daily_budget_eur). Âncora=${budgetDet.winner}${budgetDet.cap_applied ? `, cap ${BUDGET_MAX_MULTIPLIER_VS_CURRENT}x` : ""}.`;
        plan.budget_recommendation.redistribution_contract = {
          total_is_fixed: true,
          fixed_total_eur: budgetDet.total,
          phases: contractPhases, // TODAS as fases: { phase_id, weight }, weight = verba-base da curva
          compression_warn_ratio: PHASE_COMPRESSION_WARN_RATIO,
          note: "Todas as fases são editáveis e redistribuíveis. Ao editar a verba de uma fase, redistribuir o delta pelas RESTANTES fases (todas menos a editada) ∝ ao seu weight, mantendo fixed_total_eur. A fase editada é excluída do rateio dessa edição. SINALIZAR (não bloquear) se qualquer fase, ao absorver o delta, cair abaixo de weight × compression_warn_ratio. Se a lista tiver 1 só fase, não há para onde redistribuir: editar essa fase equivale a editar o total.",
        };
      }
      if (plan.summary && typeof plan.summary === "object") {
        plan.summary.recommended_total_budget_eur = budgetDet.total;
      }

      console.log("[redesign] deterministic_budget_v3", {
        total_target: budgetDet.total,
        scale0: Math.round(scale0 * 10000) / 10000,
        total_distributed: sumDistributed,
        expected_cpa_eur: expectedCpaOut,
        compression_warn_ratio: PHASE_COMPRESSION_WARN_RATIO,
        n_campaigns: campaigns.length,
        campaigns_matched: campaignsMatched,
        editable_phase_ids: contractPhases.map((p) => p.phase_id),
        phases: ph.map((x) => ({
          id: String(x.ref?.id ?? ""),
          obj: x.obj,
          dur: x.dur,
          is_learning: x.isLearning,
          editable: true,
          daily_llm: Math.round(x.dailyLLM * 100) / 100,
          daily_curve: x.ref.daily_budget_eur,
        })),
      });
    }
  }

  // C3 captura o redesign_rationale FINAL (pode ter sido overwritten por FIX 1 com template determinístico).
  const rationale: string = String(plan.redesign_rationale ?? "").slice(0, 4000);

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

  // PAS-SKIP-PERSIST — alternativa não vai para a UI nem para meta_campaign_strategies.
  // Volta apenas o generated_plan para o caller (o run principal) anexar como alternative_plan.
  // Evita row órfão em DB e duplicação de ticket_avg/source_diagnosis_id.
  // DR-2026-06-27c — PAS recursion guard OU dry_run: devolve plano canónico final SEM persistir.
  if (body[PAS_RECURSION_GUARD_FIELD] === true || dryRun) {
    console.log("[redesign] skip_persist", {
      reason: body[PAS_RECURSION_GUARD_FIELD] === true ? "pas_alternative" : "dry_run",
      model: modelId,
      source_proposal_id: body._pas_source_proposal_id ?? null,
      feasibility: plan?.summary?.feasibility ?? null,
      expected_overall_roas: plan?.summary?.expected_overall_roas ?? null,
    });
    return json({
      generated_plan: plan,
      redesign_rationale: rationale,
      viability_analysis: viability,
      source: {
        campaign_id: campaign.external_campaign_id,
        campaign_name: campaign.name,
        diagnosis_id: diagnosisId,
      },
    });
  }

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
      generation_model: modelId,
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
