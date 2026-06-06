// crm-campaign-diagnosis (P0 MP Audience)
// POST { company_id, external_campaign_id, target_roas? }
//
// FASE 1A — leitura e estruturação (readInsightWindows):
//   Lê os insights diários (campanha / adsets / ads) da campanha indicada e
//   organiza-os em 4 janelas temporais ancoradas na data MAIS RECENTE com dados
//   (NÃO em "hoje"): últimos 7d, 7d anteriores (-14..-7), últimos 30d, all-time.
//
// FASE 1B — cálculo determinístico (computeWindowMetrics):
//   Para cada janela de cada nível, calcula métricas (spend/revenue/ROAS/CTR/
//   CPC/CPA/frequência ponderada) e um conversion_signal descritivo. Os níveis
//   adset e ad trazem métricas por entidade individual + agregado do nível.
//   A 1B MEDE, não julga — conversion_signal apenas descreve o facto.
//
// FASE 1C — projeção de trajetória (computeCampaignTrajectory, só nível campaign):
//   PASSO 1: número-base = média ponderada de roas(last_7d/last_30d/all_time).
//            "no_data" sai da conta (renormaliza); "no_conversions" entra como 0.
//   PASSO 2: ajuste pela banda de tendência (roas_last_7d vs roas_prev_7d).
//   projected_baseline_roas = numero_base * fator_da_banda. Bloco auditável.
//
// FASE 1D — classificação da campanha-fonte (classifyCampaign, só nível campaign):
//   Cruza NÍVEL (projected_baseline_roas vs floor = target*0.60) com DIREÇÃO
//   (trend_band) → 1 de 4 classes (saudavel_subindo/saudavel_caindo/fraca/morta)
//   ou "indeterminada". Deriva a postura recomendada. Nunca classifica por uma
//   janela de 7d isolada — usa o baseline projetado.
//
// FASE DE ESCRITA — persiste o diagnóstico completo em crm.campaign_diagnosis_360
//   (append-only, via service role). Resposta inclui diagnosis_id + persisted.
//
// Histórico ~45 dias COM gaps: iteramos sobre as linhas existentes, nunca
// assumimos continuidade nem usamos generate_series.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Cliente único service-role: a função corre server-side e é invocada também
// server-to-server (sem JWT de utilizador), por isso NÃO depende do token
// reencaminhado ser verificável pela Data API. Lê E escreve com esta chave; o
// isolamento por tenant é garantido em código (filtro company_id + validação
// de pertença abaixo) — com service-role o RLS não protege.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Fallback fixo de ROAS-alvo quando o request não o fornece (Fase 1A).
const DEFAULT_TARGET_ROAS = 8.0;

// ── Projeção de trajetória (Fase 1C) — constantes CALIBRÁVEIS ──
// PASSO 1: pesos do número-base. Renormalizados se alguma janela for excluída.
const BASE_WINDOW_WEIGHTS = { last_7d: 0.5, last_30d: 0.35, all_time: 0.15 } as const;
// PASSO 2: limiares da banda de tendência. ratio = roas_last_7d / roas_prev_7d.
const TREND_RATIO_STRONG_UP = 1.30; // ratio >= 1.30 → strong_uptrend
const TREND_RATIO_UP = 1.10;        // 1.10 <= ratio < 1.30 → uptrend
const TREND_RATIO_STABLE = 0.90;    // 0.90 <= ratio < 1.10 → stable
const TREND_RATIO_DOWN = 0.70;      // 0.70 <= ratio < 0.90 → downtrend ; < 0.70 → strong_downtrend
// Fator de ajuste por banda (multiplica o número-base).
const TREND_BAND_FACTORS: Record<string, number> = {
  strong_uptrend: 1.10,
  uptrend: 1.05,
  stable: 1.00,
  downtrend: 0.85,
  strong_downtrend: 0.70,
  indeterminate: 1.00,
};

// ── Classificação da campanha (Fase 1D) — constantes CALIBRÁVEIS ──
const HEALTHY_FLOOR_RATIO = 0.60;     // floor de "nível bom" = target_roas * 0.60
const DEAD_BASELINE_THRESHOLD = 0.30; // baseline projetado <= isto → MORTA
// ── Sub-fase 1.E-1: detecção de wind-down — constante CALIBRÁVEL ──
const WINDDOWN_PAUSED_ADSET_RATIO = 0.5; // > 50% dos adsets PAUSED → campanha em wind-down
// ── Portão de maturação (learning phase) — constante CALIBRÁVEL ──
// Régua ~da Meta para um adset sair da "learning phase": ~50 eventos de
// OTIMIZAÇÃO por adset / 7 dias (ao nível do adset e do evento que o adset
// optimiza). Calibrável.
const LEARNING_EVENTS_THRESHOLD = 50;
// Tipos estritos: o compilador valida que a função só produz estes valores
// (e que batem com a coluna source_campaign_class text da tabela).
type SourceCampaignClass =
  | "saudavel_subindo" | "saudavel_caindo" | "fraca" | "morta" | "indeterminada"
  | "em_maturacao";
type RecommendedPosture =
  | "manter_escalar" | "intervencao_cirurgica" | "redesign" | "novo_desenho" | "recolher_mais_dados"
  | "aguardar_maturacao";

// Postura recomendada por classe (deriva diretamente da classe).
const POSTURE_BY_CLASS: Record<SourceCampaignClass, RecommendedPosture> = {
  saudavel_subindo: "manter_escalar",
  saudavel_caindo: "intervencao_cirurgica",
  fraca: "redesign",
  morta: "novo_desenho",
  indeterminada: "recolher_mais_dados",
  em_maturacao: "aguardar_maturacao",
};

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

// Descodifica o payload de um JWT SEM verificação (a assinatura já foi validada
// pelo gateway, verify_jwt=true). Só para ler role/sub. À maneira de
// crm-measure-action-impact. Devolve null se o token for inválido/ausente.
function decodeJwtPayload(authHeader: string | null): Record<string, any> | null {
  try {
    const token = (authHeader ?? "").replace(/^Bearer\s+/i, "");
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Datas (UTC, formato ISO YYYY-MM-DD)
// ──────────────────────────────────────────────────────────────────────────
function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetweenInclusive(fromIso: string, toIso: string): number {
  const f = new Date(fromIso + "T00:00:00Z").getTime();
  const t = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((t - f) / 86400000) + 1;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ──────────────────────────────────────────────────────────────────────────
// Janelas temporais ancoradas na data mais recente com dados
// ──────────────────────────────────────────────────────────────────────────
type Window = { from: string; to: string };

function buildWindows(anchor: string, minDate: string): Record<string, Window> {
  return {
    last_7d: { from: addDays(anchor, -6), to: anchor },
    prev_7d: { from: addDays(anchor, -13), to: addDays(anchor, -7) },
    last_30d: { from: addDays(anchor, -29), to: anchor },
    all_time: { from: minDate, to: anchor },
  };
}

function inWindow(dateStart: string, w: Window): boolean {
  return dateStart >= w.from && dateStart <= w.to;
}

// ──────────────────────────────────────────────────────────────────────────
// FASE 1B — Cálculo determinístico de métricas por janela
// ──────────────────────────────────────────────────────────────────────────
// conversion_signal DESCREVE o facto (não julga — isso é a Fase 1D):
//   "no_data"         → spend_eur = 0 (ou janela vazia): sem atividade medida
//   "no_conversions"  → spend_eur > 0 mas purchases = 0
//   "has_conversions" → purchases > 0
type ConversionSignal = "no_data" | "no_conversions" | "has_conversions";

type WindowMetrics = {
  days_with_data: number;
  conversion_signal: ConversionSignal;
  spend_eur: number | null;
  revenue_eur: number | null;
  purchases: number | null;
  roas: number | null;
  ctr: number | null;        // percentagem (0–100)
  cpc_eur: number | null;
  cpa_eur: number | null;
  cpa_undefined: boolean;    // true quando não há purchases → CPA indefinido
  frequency_avg: number | null; // média ponderada pelas impressões da linha
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  add_to_cart: number | null;
  initiate_checkout: number | null;
  view_content: number | null;
  leads: number | null;
};

// Janela completamente vazia (0 linhas): todas as métricas null, days_with_data 0.
function emptyWindowMetrics(): WindowMetrics {
  return {
    days_with_data: 0,
    conversion_signal: "no_data",
    spend_eur: null,
    revenue_eur: null,
    purchases: null,
    roas: null,
    ctr: null,
    cpc_eur: null,
    cpa_eur: null,
    cpa_undefined: true,
    frequency_avg: null,
    impressions: null,
    clicks: null,
    reach: null,
    add_to_cart: null,
    initiate_checkout: null,
    view_content: null,
    leads: null,
  };
}

// Calcula as métricas determinísticas de uma janela a partir das suas linhas.
// Itera apenas sobre linhas existentes (gaps tolerados). Sem erros nem números
// inventados: divisão por zero / dados em falta → null (+ flag onde aplicável).
function computeWindowMetrics(rows: any[]): WindowMetrics {
  const days_with_data = rows.length;
  if (days_with_data === 0) return emptyWindowMetrics();

  let spendCents = 0, revCents = 0, purchases = 0;
  let impressions = 0, clicks = 0, reach = 0;
  let leads = 0, atc = 0, ic = 0, vc = 0;
  // Frequência: média ponderada pelas impressões da própria linha.
  let freqWeightedSum = 0, freqImpressions = 0;

  for (const r of rows) {
    const imp = Number(r.impressions ?? 0);
    spendCents += Number(r.spend_cents ?? 0);
    revCents += Number(r.purchases_value_cents ?? 0);
    purchases += Number(r.purchases_count ?? 0);
    impressions += imp;
    clicks += Number(r.clicks ?? 0);
    reach = Math.max(reach, Number(r.reach ?? 0));
    leads += Number(r.leads_count ?? 0);
    atc += Number(r.add_to_cart_count ?? 0);
    ic += Number(r.initiate_checkout_count ?? 0);
    vc += Number(r.view_content_count ?? 0);
    if (r.frequency != null) {            // frequency null na linha → ignora-a no peso
      freqWeightedSum += Number(r.frequency) * imp;
      freqImpressions += imp;
    }
  }

  const spend_eur = spendCents / 100;       // cents → euros (exato a 2 casas)
  const revenue_eur = revCents / 100;

  const roas = spend_eur > 0 ? round(revenue_eur / spend_eur, 4) : null;
  const ctr = impressions > 0 ? round((clicks / impressions) * 100, 4) : null;
  const cpc_eur = clicks > 0 ? round(spend_eur / clicks, 4) : null;
  const frequency_avg = freqImpressions > 0 ? round(freqWeightedSum / freqImpressions, 4) : null;
  const cpa_undefined = purchases <= 0;
  const cpa_eur = purchases > 0 ? round(spend_eur / purchases, 2) : null;

  const conversion_signal: ConversionSignal =
    spend_eur === 0 ? "no_data" : purchases > 0 ? "has_conversions" : "no_conversions";

  return {
    days_with_data,
    conversion_signal,
    spend_eur: round(spend_eur, 2),
    revenue_eur: round(revenue_eur, 2),
    purchases,
    roas,
    ctr,
    cpc_eur,
    cpa_eur,
    cpa_undefined,
    frequency_avg,
    impressions,
    clicks,
    reach,
    add_to_cart: atc,
    initiate_checkout: ic,
    view_content: vc,
    leads,
  };
}

// Aplica computeWindowMetrics às 4 janelas para um conjunto de linhas.
function windowMetricsForRows(rows: any[], windows: Record<string, Window>) {
  const out: Record<string, WindowMetrics> = {};
  for (const [key, w] of Object.entries(windows)) {
    out[key] = computeWindowMetrics(rows.filter((r) => r.date_start && inWindow(r.date_start, w)));
  }
  return out;
}

// Agrupa linhas por chave de entidade (external_adset_id / external_ad_id).
function groupByKey(rows: any[], key: string): Map<string, any[]> {
  const m = new Map<string, any[]>();
  for (const r of rows) {
    const k = r[key];
    if (k == null) continue;
    const bucket = m.get(k);
    if (bucket) bucket.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// ──────────────────────────────────────────────────────────────────────────
// FASE 1C — Projeção de trajetória (PASSO 2: banda de tendência)
// ──────────────────────────────────────────────────────────────────────────
type TrendBand =
  | "strong_uptrend" | "uptrend" | "stable"
  | "downtrend" | "strong_downtrend" | "indeterminate";

// Compara roas de last_7d vs prev_7d. Trata roas 0 / janelas sem atividade.
function classifyTrendBand(
  last7: WindowMetrics,
  prev7: WindowMetrics,
): { band: TrendBand; ratio: number | null } {
  // Sem atividade numa das pontas → trajetória indeterminada.
  if (last7.conversion_signal === "no_data" || prev7.conversion_signal === "no_data") {
    return { band: "indeterminate", ratio: null };
  }
  // Aqui ambos têm gasto: roas é número (0 quando no_conversions).
  const r7 = last7.roas ?? 0;
  const rp = prev7.roas ?? 0;
  // prev_7d a 0: ratio indefinido → decidir pelo sinal de last_7d.
  if (rp === 0) {
    return r7 > 0
      ? { band: "strong_uptrend", ratio: null }   // saiu de 0 para positivo
      : { band: "strong_downtrend", ratio: null }; // 0 → 0, continua morto
  }
  const ratio = r7 / rp;
  let band: TrendBand;
  if (ratio >= TREND_RATIO_STRONG_UP) band = "strong_uptrend";
  else if (ratio >= TREND_RATIO_UP) band = "uptrend";
  else if (ratio >= TREND_RATIO_STABLE) band = "stable";
  else if (ratio >= TREND_RATIO_DOWN) band = "downtrend";
  else band = "strong_downtrend";
  return { band, ratio: round(ratio, 4) };
}

// ──────────────────────────────────────────────────────────────────────────
// FASE 1C — Projeção de trajetória (PASSO 1 + RESULTADO)
// ──────────────────────────────────────────────────────────────────────────
// Devolve um bloco auditável: a partir de windows_used (roas_used + peso
// renormalizado) reconstrói-se numero_base; e numero_base * adjustment_factor
// reconstrói projected_baseline_roas.
function computeCampaignTrajectory(
  byWindow: Record<string, WindowMetrics>,
  historyWarning: boolean,
  bandOverride?: { band: TrendBand; ratio: number | null },
) {
  const baseWindows = ["last_7d", "last_30d", "all_time"] as const;
  const windowsUsed: any[] = [];
  let totalWeight = 0;

  // 1ª passagem: decide inclusão e soma os pesos das janelas incluídas.
  for (const key of baseWindows) {
    const wm = byWindow[key];
    const weightBase = BASE_WINDOW_WEIGHTS[key];
    if (!wm || wm.conversion_signal === "no_data") {
      // "no_data" → fora da conta (renormaliza); registado para auditoria.
      windowsUsed.push({
        window: key,
        included: false,
        reason: "no_data",
        conversion_signal: wm?.conversion_signal ?? "no_data",
        roas_raw: wm?.roas ?? null,
        roas_used: null,
        weight_base: weightBase,
        weight_normalized: 0,
      });
      continue;
    }
    // "no_conversions" → entra como 0 (gastar sem converter é negativo real).
    const roasUsed = wm.conversion_signal === "no_conversions" ? 0 : (wm.roas ?? 0);
    windowsUsed.push({
      window: key,
      included: true,
      conversion_signal: wm.conversion_signal,
      roas_raw: wm.roas,
      roas_used: roasUsed,
      weight_base: weightBase,
      weight_normalized: 0, // preenchido na 2ª passagem
    });
    totalWeight += weightBase;
  }

  // 2ª passagem: renormaliza pesos e soma. Usa os pesos JÁ arredondados para
  // que numero_base seja reconstruível exatamente a partir do bloco.
  const insufficientData = totalWeight === 0;
  let numeroBase: number | null = null;
  if (!insufficientData) {
    let weightedSum = 0;
    for (const u of windowsUsed) {
      if (!u.included) continue;
      u.weight_normalized = round(u.weight_base / totalWeight, 6);
      weightedSum += u.roas_used * u.weight_normalized;
    }
    numeroBase = round(weightedSum, 4);
  }

  // Banda: override (1.E-1, janelas pré-pausa) ou o cálculo normal (last_7d vs prev_7d).
  const { band, ratio } = bandOverride ?? classifyTrendBand(byWindow.last_7d, byWindow.prev_7d);
  const adjustmentFactor = TREND_BAND_FACTORS[band];
  const projected = numeroBase === null ? null : round(numeroBase * adjustmentFactor, 4);

  return {
    numero_base: numeroBase,
    trend_band: band,
    trend_ratio: ratio,
    adjustment_factor: adjustmentFactor,
    projected_baseline_roas: projected,
    included_weight_total: round(totalWeight, 6),
    windows_used: windowsUsed,
    insufficient_data: insufficientData,
    low_confidence: historyWarning === true,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// FASE 1D — Classificação da campanha-fonte
// ──────────────────────────────────────────────────────────────────────────
// Decide a classe cruzando NÍVEL (baseline vs floor) com DIREÇÃO (trend_band).
// targetRoas chega sempre como número válido (handler garante o default 8.0).
type TrajectoryBlock = ReturnType<typeof computeCampaignTrajectory>;

type CampaignClassification = {
  source_campaign_class: SourceCampaignClass;
  recommended_posture: RecommendedPosture;
  healthy_floor: number;
  classification_reason: string;
  inputs: { projected_baseline_roas: number | null; trend_band: string; target_roas: number };
};

function classifyCampaign(trajectory: TrajectoryBlock, targetRoas: number): CampaignClassification {
  const healthyFloor = round(targetRoas * HEALTHY_FLOOR_RATIO, 4);
  const baseline = trajectory.projected_baseline_roas;
  const band = trajectory.trend_band;
  const fmt = (n: number) => n.toFixed(2);

  const inputs = {
    projected_baseline_roas: baseline,
    trend_band: band,
    target_roas: targetRoas,
  };

  // Edge: sem baseline projetado (insufficient_data) → não forçar nenhuma classe.
  if (trajectory.insufficient_data || baseline === null) {
    return {
      source_campaign_class: "indeterminada",
      recommended_posture: POSTURE_BY_CLASS["indeterminada"],
      healthy_floor: healthyFloor,
      classification_reason:
        "sem baseline projetado (insufficient_data) — recolher mais dados antes de classificar",
      inputs,
    };
  }

  let cls: SourceCampaignClass;
  let reason: string;

  if (baseline <= DEAD_BASELINE_THRESHOLD) {
    // "Morta" depende SÓ do baseline perto de zero, não de uma janela de 7d.
    cls = "morta";
    reason = `baseline projetado ${fmt(baseline)}x <= limiar de morta ${fmt(DEAD_BASELINE_THRESHOLD)}x — retorno praticamente nulo`;
  } else if (baseline < healthyFloor) {
    cls = "fraca";
    reason = `baseline projetado ${fmt(baseline)}x abaixo do floor ${fmt(healthyFloor)}x e acima do limiar de morta ${fmt(DEAD_BASELINE_THRESHOLD)}x`;
  } else {
    // Nível bom (>= floor): a direção decide subindo vs caindo.
    const falling = band === "downtrend" || band === "strong_downtrend";
    if (falling) {
      cls = "saudavel_caindo";
      reason = `baseline projetado ${fmt(baseline)}x >= floor ${fmt(healthyFloor)}x mas tendência ${band}`;
    } else {
      cls = "saudavel_subindo";
      const bandNote = band === "indeterminate"
        ? "sem sinal de tendência (assumido estável)"
        : `tendência ${band}`;
      reason = `baseline projetado ${fmt(baseline)}x >= floor ${fmt(healthyFloor)}x e ${bandNote}`;
    }
  }

  return {
    source_campaign_class: cls,
    recommended_posture: POSTURE_BY_CLASS[cls],
    healthy_floor: healthyFloor,
    classification_reason: reason,
    inputs,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// PORTÃO DE MATURAÇÃO (learning phase) — a MONTANTE da Fase 1D
// ──────────────────────────────────────────────────────────────────────────
// A Meta tira um adset da "learning phase" com ~50 eventos de OTIMIZAÇÃO por
// adset / 7 dias, ao nível do adset e do EVENTO que o adset optimiza. Uma
// campanha jovem cujos adsets de conversão ainda não atingiram esse volume tem
// ROAS IMATURO (ruído estatístico), não fraco — classificá-la como "fraca" e
// mandá-la para redesign queima o aprendizado. Este portão deteta esse estado e
// curto-circuita a classificação por ROAS (força "em_maturacao").
//
// Recorte: SÓ adsets de CONVERSÃO (optimization_goal de conversão). Goals de
// awareness/reach/video/tráfego/engagement NÃO entram (não há "50 conversões" a
// atingir). Contagem: por adset de conversão, os eventos do SEU goal na janela
// last_7d (mapa goal→coluna de evento dos insights). 100% determinística — sem
// LLM nem Graph API.
//
// Régua: há >=1 adset de conversão MAS nenhum atingiu LEARNING_EVENTS_THRESHOLD
// eventos do seu goal em 7d → imatura. Sem adsets de conversão → portão NÃO se
// aplica (mantém o comportamento normal).

// optimization_goal de conversão → campo de evento de WindowMetrics (= coluna de
// insight já existente). Espelha a semântica de sumActions no crm-meta-sync-insights
// e o CONVERSION_GOALS do crm-meta-strategy-deploy. Goals fora deste mapa NÃO são
// considerados de conversão para efeitos do portão.
const CONVERSION_GOAL_EVENT_FIELD: Record<string, keyof WindowMetrics> = {
  OFFSITE_CONVERSIONS: "purchases",
  CONVERSIONS: "purchases",
  VALUE: "purchases",
  PURCHASE: "purchases",
  LEAD_GENERATION: "leads",
  QUALITY_LEAD: "leads",
  LEADS: "leads",
  ADD_TO_CART: "add_to_cart",
  INITIATE_CHECKOUT: "initiate_checkout",
};

type MaturationAdset = {
  external_adset_id: string;
  optimization_goal: string;
  event_field: string;       // coluna de evento contada (campo de WindowMetrics)
  events_last_7d: number;    // eventos do goal na janela last_7d
  reached_threshold: boolean;
};
type MaturationGate = {
  applies: boolean;              // há >=1 adset de conversão
  is_immature: boolean;         // applies && nenhum adset atingiu o limiar
  threshold: number;            // LEARNING_EVENTS_THRESHOLD
  conversion_adsets_count: number;
  conversion_adsets: MaturationAdset[];
  reason: string;
};

// Conta, por adset de CONVERSÃO, os eventos do seu goal na janela last_7d.
// adsetSnaps: snapshot fresco (external_adset_id + optimization_goal).
// adsetGroups: linhas de insight agrupadas por adset (Fase 1B). Determinístico.
function computeMaturationGate(
  adsetSnaps: Array<{ external_adset_id: string; optimization_goal: string | null }>,
  adsetGroups: Map<string, any[]>,
  last7: Window,
): MaturationGate {
  const conversionAdsets: MaturationAdset[] = [];
  for (const snap of adsetSnaps) {
    const goal = (snap.optimization_goal ?? "").toUpperCase();
    const field = CONVERSION_GOAL_EVENT_FIELD[goal];
    if (!field) continue; // não é adset de conversão → fora do portão
    const rows = (adsetGroups.get(snap.external_adset_id) ?? [])
      .filter((r: any) => r.date_start && inWindow(r.date_start, last7));
    const m = computeWindowMetrics(rows);
    const events = Number((m[field] as number | null) ?? 0);
    conversionAdsets.push({
      external_adset_id: snap.external_adset_id,
      optimization_goal: goal,
      event_field: field,
      events_last_7d: events,
      reached_threshold: events >= LEARNING_EVENTS_THRESHOLD,
    });
  }
  const applies = conversionAdsets.length > 0;
  const anyMature = conversionAdsets.some((a) => a.reached_threshold);
  const isImmature = applies && !anyMature;
  const reason = !applies
    ? "sem adsets de conversão — portão de maturação não aplicável"
    : isImmature
      ? `nenhum dos ${conversionAdsets.length} adset(s) de conversão atingiu ${LEARNING_EVENTS_THRESHOLD} eventos do seu goal em 7d — campanha em learning phase`
      : `pelo menos um adset de conversão atingiu ${LEARNING_EVENTS_THRESHOLD} eventos em 7d — campanha madura para classificação por ROAS`;
  return {
    applies,
    is_immature: isImmature,
    threshold: LEARNING_EVENTS_THRESHOLD,
    conversion_adsets_count: conversionAdsets.length,
    conversion_adsets: conversionAdsets,
    reason,
  };
}

// Classificação forçada quando o portão dispara (curto-circuita a Fase 1D).
function maturationClassification(
  trajectory: TrajectoryBlock,
  targetRoas: number,
  gate: MaturationGate,
): CampaignClassification {
  const healthyFloor = round(targetRoas * HEALTHY_FLOOR_RATIO, 4);
  return {
    source_campaign_class: "em_maturacao",
    recommended_posture: POSTURE_BY_CLASS["em_maturacao"],
    healthy_floor: healthyFloor,
    classification_reason:
      `portão de maturação: ${gate.reason}. Classificação por ROAS curto-circuitada ` +
      `(limiar ${gate.threshold} eventos/adset/7d).`,
    inputs: {
      projected_baseline_roas: trajectory.projected_baseline_roas,
      trend_band: trajectory.trend_band,
      target_roas: targetRoas,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Camada de leitura: lê os 3 níveis de insights e estrutura por janela.
// ──────────────────────────────────────────────────────────────────────────
const CAMPAIGN_COLS =
  "connection_id, campaign_name, date_start, impressions, reach, frequency, clicks, unique_clicks, spend_cents, purchases_count, purchases_value_cents, leads_count, add_to_cart_count, initiate_checkout_count, view_content_count, roas";
const ADSET_COLS = "external_adset_id, " + CAMPAIGN_COLS;
const AD_COLS = "external_ad_id, external_adset_id, " + CAMPAIGN_COLS;

async function readInsightWindows(
  supabase: any,
  companyId: string,
  campaignId: string,
  targetRoas: number,
) {
  // As 3 tabelas de insights têm external_campaign_id + company_id → filtramos
  // diretamente, sem precisar de juntar as snapshots nesta fase.
  const [campRes, adsetRes, adRes] = await Promise.all([
    supabase.schema("crm").from("meta_campaign_insights_daily")
      .select(CAMPAIGN_COLS)
      .eq("company_id", companyId).eq("external_campaign_id", campaignId)
      .order("date_start", { ascending: true }),
    supabase.schema("crm").from("meta_adset_insights_daily")
      .select(ADSET_COLS)
      .eq("company_id", companyId).eq("external_campaign_id", campaignId)
      .order("date_start", { ascending: true }),
    supabase.schema("crm").from("meta_ad_insights_daily")
      .select(AD_COLS)
      .eq("company_id", companyId).eq("external_campaign_id", campaignId)
      .order("date_start", { ascending: true }),
  ]);

  for (const [lvl, res] of [["campaign", campRes], ["adset", adsetRes], ["ad", adRes]] as const) {
    if (res.error) {
      console.error(`[campaign-diagnosis] read error (${lvl}):`, res.error.message);
      throw new Error(`read_failed_${lvl}: ${res.error.message}`);
    }
  }

  const campRows: any[] = campRes.data ?? [];
  const adsetRows: any[] = adsetRes.data ?? [];
  const adRows: any[] = adRes.data ?? [];

  console.log(
    `[campaign-diagnosis] rows read — campaign=${campRows.length} adset=${adsetRows.length} ad=${adRows.length}`,
  );

  // Âncora = data mais recente com dados. Preferimos a série da campanha; se
  // estiver vazia, caímos para o máximo global entre os 3 níveis.
  const allDates = [
    ...campRows.map((r) => r.date_start),
    ...adsetRows.map((r) => r.date_start),
    ...adRows.map((r) => r.date_start),
  ].filter(Boolean).sort();

  // Metadados da campanha para a persistência (connection_id, campaign_name).
  // Preferimos a linha de campanha; caímos para adset/ad se necessário.
  const metaRow = campRows[0] ?? adsetRows[0] ?? adRows[0] ?? null;
  const campaignMeta = {
    connection_id: metaRow?.connection_id ?? null,
    campaign_name: metaRow?.campaign_name ?? null,
  };

  if (allDates.length === 0) {
    return {
      has_data: false,
      anchor_date: null,
      history: { min_date: null, max_date: null, history_days_available: 0, history_warning: true },
      windows: null,
      levels: null,
      raw_counts: { campaign: 0, adset: 0, ad: 0 },
      campaign_meta: campaignMeta,
      operational_warning: null,
    };
  }

  const campDates = campRows.map((r) => r.date_start).filter(Boolean).sort();
  const anchor = (campDates.length > 0 ? campDates : allDates)[
    (campDates.length > 0 ? campDates : allDates).length - 1
  ];
  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];

  // history_days_available: span da série da campanha (entidade primária); se
  // vazia, span global. Gaps NÃO reduzem o span — é a janela disponível.
  const histBase = campDates.length > 0 ? campDates : allDates;
  const historyDaysAvailable = daysBetweenInclusive(histBase[0], histBase[histBase.length - 1]);
  const historyWarning = historyDaysAvailable < 30;

  const windows = buildWindows(anchor, minDate);

  // ── FASE 1B: métricas por janela ──
  // Campanha: entidade única → só agregado de nível.
  // Adset / Ad: agregado de nível (by_window) + bloco de 4 janelas por entidade.
  const adsetGroups = groupByKey(adsetRows, "external_adset_id");
  const adGroups = groupByKey(adRows, "external_ad_id");

  // ── FASE 1C: projeção de trajetória (apenas nível campaign) ──
  const campaignByWindow = windowMetricsForRows(campRows, windows);

  // ── Sub-fase 1.E-1: detecção de wind-down (campanha a ser desligada) ──
  // Lê effective_status + optimization_goal dos adsets (snapshot fresco;
  // service_role tem SELECT). effective_status → wind-down; optimization_goal →
  // portão de maturação (recorte dos adsets de conversão).
  // Maioria PAUSED (> WINDDOWN_PAUSED_ADSET_RATIO) → is_winddown.
  const { data: adsetSnaps } = await supabase
    .schema("crm").from("meta_adset_snapshot")
    .select("external_adset_id, effective_status, optimization_goal")
    .eq("company_id", companyId).eq("external_campaign_id", campaignId);
  const totalAdsets = adsetSnaps?.length ?? 0;
  const pausedAdsets = (adsetSnaps ?? []).filter((a: any) => a.effective_status === "PAUSED").length;
  const pausedRatio = totalAdsets > 0 ? pausedAdsets / totalAdsets : 0;
  const isWinddown = totalAdsets > 0 && pausedRatio > WINDDOWN_PAUSED_ADSET_RATIO;

  // winddown_start_date: a partir da âncora para trás, 1º dia da sequência CONTÍGUA
  // (calendário) de dias com spend>0 e 0 conversões. Um dia em falta / com conversões /
  // sem spend quebra a sequência. null se a âncora ainda convertia (sem cauda contaminada).
  let winddownStart: string | null = null;
  if (isWinddown) {
    const byDate = new Map<string, any>();
    for (const r of campRows) if (r.date_start) byDate.set(r.date_start, r);
    let cursor = anchor;
    while (true) {
      const row = byDate.get(cursor);
      if (!row) break;
      const spend = Number(row.spend_cents ?? 0);
      const purch = Number(row.purchases_count ?? 0);
      if (spend > 0 && purch === 0) {
        winddownStart = cursor;
        cursor = addDays(cursor, -1);
      } else break;
    }
  }

  // Trajetória: ajustada (só dados pré-wind-down) quando há winddownStart; senão normal.
  const trajAdjusted = isWinddown && winddownStart != null;
  let campaignTrajectory: any;
  let numeroBaseBefore: number | null = null;
  let bandBefore: string | null = null;
  if (trajAdjusted) {
    const startStr = winddownStart as string;
    // Dados limpos = dias < winddownStart. A last_7d limpa fica vazia → no_data → excluída.
    // last_30d/all_time são recalculadas só com dias limpos (renormalização já existente).
    const cleanRows = campRows.filter((r: any) => r.date_start && r.date_start < startStr);
    const cleanByWindow = windowMetricsForRows(cleanRows, windows);
    // Banda (Opção Y): duas semanas de 7d imediatamente ANTES do winddownStart.
    const preWeekWin = { from: addDays(startStr, -7), to: addDays(startStr, -1) };
    const priorWeekWin = { from: addDays(startStr, -14), to: addDays(startStr, -8) };
    const preWeekM = computeWindowMetrics(campRows.filter((r: any) => r.date_start && inWindow(r.date_start, preWeekWin)));
    const priorWeekM = computeWindowMetrics(campRows.filter((r: any) => r.date_start && inWindow(r.date_start, priorWeekWin)));
    const bandOverride = classifyTrendBand(preWeekM, priorWeekM); // sem dados → indeterminate (fator 1.0)
    const before = computeCampaignTrajectory(campaignByWindow, historyWarning);
    numeroBaseBefore = before.numero_base;
    bandBefore = before.trend_band;
    campaignTrajectory = {
      ...computeCampaignTrajectory(cleanByWindow, historyWarning, bandOverride),
      trajectory_adjusted_for_winddown: true,
    };
  } else {
    campaignTrajectory = {
      ...computeCampaignTrajectory(campaignByWindow, historyWarning),
      trajectory_adjusted_for_winddown: false,
    };
  }

  // Aviso operacional (top-level do diagnosis) — só quando wind-down.
  const operationalWarning = isWinddown
    ? {
      is_winddown: true,
      paused_adset_ratio: Math.round(pausedRatio * 1000) / 1000,
      paused_adsets: pausedAdsets,
      total_adsets: totalAdsets,
      winddown_start_date: winddownStart,
      message: winddownStart
        ? `Campanha maioritariamente pausada (${pausedAdsets}/${totalAdsets} adsets PAUSED). ` +
          `Detectado gasto residual sem conversões desde ${winddownStart} (wind-down). ` +
          `A trajetória foi recalculada apenas com dados anteriores a essa data (pré-pausa).`
        : `Campanha maioritariamente pausada (${pausedAdsets}/${totalAdsets} adsets PAUSED), ` +
          `mas os últimos dados ainda convertiam — trajetória não ajustada, apenas sinalizada.`,
    }
    : null;

  // ── PORTÃO DE MATURAÇÃO (learning phase) — a MONTANTE da Fase 1D ──
  // Recorta adsets de conversão (via optimization_goal do snapshot) e conta os
  // eventos do goal de cada um na janela last_7d. 100% determinístico.
  const maturationGate = computeMaturationGate(
    (adsetSnaps ?? []) as Array<{ external_adset_id: string; optimization_goal: string | null }>,
    adsetGroups,
    windows.last_7d,
  );

  // ── FASE 1D: classificação da campanha (apenas nível campaign) ──
  // Se o portão de maturação disparar (campanha imatura), curto-circuita a
  // classificação por ROAS e força "em_maturacao" / "aguardar_maturacao".
  const campaignClassification = maturationGate.is_immature
    ? maturationClassification(campaignTrajectory, targetRoas, maturationGate)
    : classifyCampaign(campaignTrajectory, targetRoas);

  const levels = {
    campaign: {
      total_rows: campRows.length,
      by_window: campaignByWindow,
      trajectory: campaignTrajectory,
      maturation_gate: maturationGate,
      classification: campaignClassification,
    },
    adset: {
      total_rows: adsetRows.length,
      entities: adsetGroups.size,
      by_window: windowMetricsForRows(adsetRows, windows),
      per_entity: Array.from(adsetGroups.entries()).map(([id, rows]) => ({
        external_adset_id: id,
        total_rows: rows.length,
        by_window: windowMetricsForRows(rows, windows),
      })),
    },
    ad: {
      total_rows: adRows.length,
      entities: adGroups.size,
      by_window: windowMetricsForRows(adRows, windows),
      per_entity: Array.from(adGroups.entries()).map(([id, rows]) => ({
        external_ad_id: id,
        external_adset_id: rows[0]?.external_adset_id ?? null,
        total_rows: rows.length,
        by_window: windowMetricsForRows(rows, windows),
      })),
    },
  };

  const campLast7 = levels.campaign.by_window.last_7d;
  console.log(
    `[campaign-diagnosis] metrics computed — entities adset=${adsetGroups.size} ad=${adGroups.size}` +
      ` | campaign last_7d: signal=${campLast7.conversion_signal} roas=${campLast7.roas} cpa_undefined=${campLast7.cpa_undefined}`,
  );
  console.log(
    `[campaign-diagnosis] trajectory — numero_base=${campaignTrajectory.numero_base}` +
      ` band=${campaignTrajectory.trend_band} ratio=${campaignTrajectory.trend_ratio}` +
      ` factor=${campaignTrajectory.adjustment_factor}` +
      ` projected_baseline_roas=${campaignTrajectory.projected_baseline_roas}` +
      ` insufficient=${campaignTrajectory.insufficient_data} low_confidence=${campaignTrajectory.low_confidence}`,
  );
  console.log(
    `[campaign-diagnosis] classification — class=${campaignClassification.source_campaign_class}` +
      ` posture=${campaignClassification.recommended_posture}` +
      ` floor=${campaignClassification.healthy_floor}` +
      ` | reason: ${campaignClassification.classification_reason}`,
  );
  console.log("[campaign-diagnosis] maturation_gate", {
    applies: maturationGate.applies,
    is_immature: maturationGate.is_immature,
    threshold: maturationGate.threshold,
    conversion_adsets: maturationGate.conversion_adsets_count,
    events_by_adset: maturationGate.conversion_adsets.map((a) => ({
      adset: a.external_adset_id,
      goal: a.optimization_goal,
      field: a.event_field,
      events_7d: a.events_last_7d,
      reached: a.reached_threshold,
    })),
  });
  console.log("[campaign-diagnosis] winddown_detection", {
    paused_adset_ratio: Math.round(pausedRatio * 1000) / 1000,
    paused_adsets: pausedAdsets,
    total_adsets: totalAdsets,
    is_winddown: isWinddown,
    winddown_start_date: winddownStart,
    trajectory_adjusted: trajAdjusted,
    numero_base_before: numeroBaseBefore,
    numero_base_after: trajAdjusted ? campaignTrajectory.numero_base : null,
    band_before: bandBefore,
    band_after: trajAdjusted ? campaignTrajectory.trend_band : null,
  });

  return {
    has_data: true,
    anchor_date: anchor,
    history: {
      min_date: minDate,
      max_date: maxDate,
      history_days_available: historyDaysAvailable,
      history_warning: historyWarning,
    },
    windows,
    levels,
    raw_counts: { campaign: campRows.length, adset: adsetRows.length, ad: adRows.length },
    campaign_meta: campaignMeta,
    operational_warning: operationalWarning,
    maturation_gate: maturationGate,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { company_id?: string; external_campaign_id?: string; target_roas?: number };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const companyId = body.company_id;
  const campaignId = body.external_campaign_id;
  if (!companyId) return json({ error: "missing_company_id" }, 400);
  if (!campaignId) return json({ error: "missing_external_campaign_id" }, 400);

  const targetRoas = typeof body.target_roas === "number" && body.target_roas > 0
    ? body.target_roas
    : DEFAULT_TARGET_ROAS;

  console.log(
    `[campaign-diagnosis] start company=${companyId} campaign=${campaignId} target_roas=${targetRoas}`,
  );

  // Cliente único service-role (lê insights + escreve diagnóstico).
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Token já verificado pelo gateway (verify_jwt=true); aqui só lemos role/sub.
  const claims = decodeJwtPayload(authHeader);
  const tokenRole = typeof claims?.role === "string" ? claims.role : null;
  // created_by: o sub do utilizador (auditoria). Null em chamadas server-to-server.
  const createdBy: string | null = typeof claims?.sub === "string" ? claims.sub : null;

  // ── Validação de pertença ao company_id (OBRIGATÓRIA com service-role) ──
  // service_role  → chamada interna de confiança (server-to-server): aceita o body.
  // authenticated → resolve o company do utilizador (padrão de _shared/multiTenant.ts:
  //   profiles.company_id, ou active_company_id + is_platform_admin) e exige match.
  if (tokenRole === "service_role") {
    console.log("[campaign-diagnosis] caller=service_role (server-to-server) — company_id aceite");
  } else if (tokenRole === "authenticated" && createdBy) {
    const { data: profile } = await supabase
      .from("profiles").select("company_id, active_company_id").eq("id", createdBy).maybeSingle();
    const { data: isPaRow } = await supabase.rpc("is_platform_admin", { _user_id: createdBy });
    const isPlatformAdmin = Boolean(isPaRow);
    const callerCompanyId = isPlatformAdmin
      ? (profile?.active_company_id ?? profile?.company_id ?? null)
      : (profile?.company_id ?? null);
    // PA sem company ativo pode aceder a qualquer tenant (raro); senão exige match.
    const bypass = isPlatformAdmin && callerCompanyId == null;
    if (!bypass && callerCompanyId !== companyId) {
      console.warn(
        `[campaign-diagnosis] 403 cross-tenant — caller company=${callerCompanyId} body=${companyId}`,
      );
      return json({ error: "forbidden", detail: "company_id não pertence ao utilizador" }, 403);
    }
    console.log(`[campaign-diagnosis] caller=authenticated user=${createdBy} company verificado`);
  } else {
    console.warn(`[campaign-diagnosis] 403 — token role inesperado: ${tokenRole}`);
    return json(
      { error: "forbidden", detail: "autorização insuficiente para aceder a este company_id" },
      403,
    );
  }

  let windowsResult;
  try {
    windowsResult = await readInsightWindows(supabase, companyId, campaignId, targetRoas);
  } catch (e) {
    console.error("[campaign-diagnosis] readInsightWindows failed:", e);
    return json({ error: "read_failed", detail: String((e as Error)?.message ?? e) }, 500);
  }

  if (!windowsResult.has_data) {
    console.log("[campaign-diagnosis] no insight data for campaign");
  }

  console.log(
    `[campaign-diagnosis] done anchor=${windowsResult.anchor_date} history_days=${windowsResult.history.history_days_available} warning=${windowsResult.history.history_warning}`,
  );

  // Espelho no topo (acesso rápido pela fase de escrita / fases seguintes).
  // Defensivo: se não houver dados (levels null), cai em "indeterminada".
  const campaignLevel = (windowsResult.levels as any)?.campaign ?? null;
  const classification = campaignLevel?.classification ?? null;
  const sourceCampaignClass = classification?.source_campaign_class ?? "indeterminada";
  const recommendedPosture = classification?.recommended_posture ?? POSTURE_BY_CLASS["indeterminada"];
  const projectedBaselineRoas = campaignLevel?.trajectory?.projected_baseline_roas ?? null;

  // Objeto de diagnóstico COMPLETO (vai para diagnosis_jsonb e para a resposta).
  const diagnosis = {
    ok: true,
    phase: "1-complete",
    input: {
      company_id: companyId,
      external_campaign_id: campaignId,
      target_roas: targetRoas,
      target_roas_source: typeof body.target_roas === "number" && body.target_roas > 0 ? "request" : "default",
    },
    // ── Espelho de topo ──
    source_campaign_class: sourceCampaignClass,
    projected_baseline_roas: projectedBaselineRoas,
    recommended_posture: recommendedPosture,
    // 1.E-1 — aviso operacional (só quando wind-down; omitido caso contrário).
    operational_warning: (windowsResult as any).operational_warning ?? undefined,
    // Portão de maturação (learning phase) — bloco auditável (eventos por adset
    // de conversão, limiar, decisão). Omitido quando não houve dados para avaliar.
    maturation_gate: (windowsResult as any).maturation_gate ?? undefined,
    created_by: createdBy,
    anchor_date: windowsResult.anchor_date,
    history: windowsResult.history,
    windows: windowsResult.windows,
    levels: windowsResult.levels,
    raw_counts: windowsResult.raw_counts,
    generated_at: new Date().toISOString(),
  };

  // ── FASE DE ESCRITA: persistir (append-only) via service role ──
  // RLS só dá SELECT a authenticated; a escrita usa a policy service_role_bypass.
  // Edge case: diagnóstico indeterminado (sem dados) também é inserido — saber
  // que uma campanha não tem dados suficientes é informação útil.
  const campaignMeta = (windowsResult as any).campaign_meta ?? { connection_id: null, campaign_name: null };

  let diagnosisId: string | null = null;
  let persisted = false;
  let persistError: string | null = null;
  try {
    const { data: inserted, error: insErr } = await (supabase as any)
      .schema("crm")
      .from("campaign_diagnosis_360")
      .insert({
        company_id: companyId,
        connection_id: campaignMeta.connection_id,
        external_campaign_id: campaignId,
        campaign_name: campaignMeta.campaign_name,
        target_roas: targetRoas,
        diagnosis_jsonb: diagnosis,
        source_campaign_class: sourceCampaignClass,
        projected_baseline_roas: projectedBaselineRoas,
        history_days_available: windowsResult.history?.history_days_available ?? null,
        history_warning: windowsResult.history?.history_warning ?? null,
        created_by: createdBy,
      })
      .select("id")
      .single();
    if (insErr) {
      persistError = insErr.message;
      console.error(`[campaign-diagnosis] persist FAILED — ${insErr.message}`);
    } else {
      diagnosisId = inserted?.id ?? null;
      persisted = true;
      console.log(`[campaign-diagnosis] persisted ok — id=${diagnosisId} class=${sourceCampaignClass}`);
    }
  } catch (e) {
    persistError = String((e as Error)?.message ?? e);
    console.error(`[campaign-diagnosis] persist EXCEPTION — ${persistError}`);
  }

  // Falha de inserção é reportada (não silenciosa): persisted=false + persist_error.
  // O diagnóstico calculado vem SEMPRE na resposta.
  return json({
    ...diagnosis,
    persisted,
    diagnosis_id: diagnosisId,
    persist_error: persistError,
  });
});
