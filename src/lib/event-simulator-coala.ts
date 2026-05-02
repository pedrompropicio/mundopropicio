/**
 * Cálculos do Simulador formato Coala (3 cenários: Hoje · Break Even · Forecast).
 *
 * Estrutura espelha a aba "Simulador" do BP_COALA:
 *  - Matriz dia × zona com Vendas Reais + Projeção + Cortesia + Forecast
 *  - Receitas A&B com ticket médio bebida/alimento globais e % repasse
 *  - Patrocínio + Souvenir + Outros Créditos (Bonif. bebidas, Ponto vendido)
 *  - Custos por categoria L3 com colunas 2025 / Break Even / Forecast
 *  - IVA bilheteira por sessão
 *  - Resultado Geral / Evento / A&B / Souvenir e indicadores per capita
 */

export type CoalaSession = {
  day_index: number;
  zone_label: string;
  real_sales_qty: number;
  real_sales_revenue: number;
  projected_qty: number;     // projeção restante de vendas
  courtesy_qty: number;
  forecast_qty: number;      // total ambicionado pelo Forecast DVT
  prior_year_qty: number;
  prior_year_revenue: number;
  iva_pct: number;           // ex: 6
  avg_ticket_override?: number | null;
};

export type CoalaCostLine = {
  label: string;
  prior_year_amount: number;
  actual_amount?: number;     // Hoje (Edição atual) = TX pagas/aprovadas + BP s/ TX
  break_even_amount: number;
  forecast_amount: number;
  is_ab_passthrough?: boolean; // marca linhas A&B Bebida/Alimento (recalculadas)
};

export type CoalaConfig = {
  ab_drink_avg_ticket: number;
  ab_food_avg_ticket: number;
  ab_drink_passthrough_pct: number;  // % do CMV/repasse sobre receita
  ab_food_passthrough_pct: number;
  sponsorship_revenue: number;
  souvenir_revenue: number;
  souvenir_cost: number;
  bonif_bebidas: number;
  ponto_vendido: number;
  prior_year_tickets: number;
  prior_year_drink: number;
  prior_year_food: number;
  prior_year_sponsor: number;
  prior_year_souvenir: number;
  prior_year_other: number;
  ticket_iva_pct: number;
};

const n = (v: any, fb = 0): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fb;
};

// ---------- Lotes / capacidade (input opcional para o solver BE) ----------

export type SessionLotInfo = {
  /** chave que casa com `${day_index}-${zone_label}` em CoalaSession */
  key: string;
  /** capacidade total da zona/sessão */
  capacity: number;
  /** lotes ordenados por lot_number (ascendente) */
  lots: Array<{ lot_number: number; price: number; quantity: number; sold: number }>;
  /** dias decorridos desde a 1ª venda (mínimo 1) — usado para velocidade */
  days_selling: number;
};

export type BreakEvenBreakdownItem = {
  key: string;
  zone_label: string;
  day_index: number;
  current_qty: number;
  extra_qty: number;
  capacity_left: number;
  marginal_price: number;
  velocity: number;          // bilhetes/dia
  reason?: "no_velocity" | "capacity_full" | "no_price" | "ok";
};

export type BreakEvenSolution = {
  qtyByKey: Record<string, number>;
  /** Receita de bilheteira por sessão (real + extras a preços marginais reais lote-a-lote). */
  revenueByKey: Record<string, number>;
  reachable: boolean;
  deficit: number;            // € que faltam para empatar
  totalExtraTickets: number;  // soma dos bilhetes extras alocados
  unfilled: number;           // € que NÃO foi possível alocar (capacidade esgotada)
  breakdown: BreakEvenBreakdownItem[];
};

// ---------- Forecast solver ----------

export type ForecastBreakdownItem = {
  key: string;
  zone_label: string;
  day_index: number;
  current_qty: number;
  projected_qty: number;       // projeção autom. (recente + curva final)
  forecast_qty: number;        // total final (com piso manual e teto de capacidade)
  capacity_left: number;       // capacidade restante após forecast (Infinity se sem plano)
  recent_velocity: number;     // bilhetes/dia (janela recente)
  days_to_event: number;
  capped_by_capacity: boolean;
  manual_floor_used: boolean;
  reason?: "no_velocity" | "capacity_full" | "ok";
};

export type ForecastSolution = {
  qtyByKey: Record<string, number>;       // forecast TOTAL por sessão (inclui real + extras)
  revenueByKey: Record<string, number>;   // receita por sessão (real + extras lote-a-lote)
  breakdown: ForecastBreakdownItem[];
  daysToEvent: number;                    // máx. entre todas as sessões
  hasCapacityPlan: boolean;               // true se ALGUMA zona tem capacidade definida
};

/** Multiplicador de aceleração na "reta final" (últimos N dias antes do evento) — DEFAULTS. */
export const FORECAST_FINAL_ACCEL_DEFAULT = 1.6;
export const FORECAST_FINAL_WINDOW_DAYS_DEFAULT = 30;
/** Janela recente para calcular ritmo (preferimos os últimos X dias para captar tendência). */
const FORECAST_RECENT_WINDOW_DAYS = 14;

// ---------- Por sessão (dia × zona) ----------

export function sessionAvgTicket(s: CoalaSession): number {
  if (s.avg_ticket_override != null) return n(s.avg_ticket_override);
  const qty = n(s.real_sales_qty);
  if (qty <= 0) return 0;
  return n(s.real_sales_revenue) / qty;
}

export function sessionTodayQty(s: CoalaSession): number {
  return n(s.real_sales_qty);
}
export function sessionTodayRevenue(s: CoalaSession): number {
  return n(s.real_sales_revenue);
}

/** Break-Even por sessão: distribuição proporcional do break-even global é tratada externamente.
 *  Esta função devolve só a quantidade adicional ao Real para atingir o forecast. */
export function sessionForecastQty(s: CoalaSession): number {
  // Forecast = max(real + projeção + cortesia, forecast_qty manual)
  const computed = n(s.real_sales_qty) + n(s.projected_qty) + n(s.courtesy_qty);
  return Math.max(computed, n(s.forecast_qty));
}

export function sessionForecastRevenue(s: CoalaSession): number {
  const tm = sessionAvgTicket(s);
  // Receita forecast = real_revenue + (projeção × tm)  — cortesias não geram receita
  return n(s.real_sales_revenue) + n(s.projected_qty) * tm;
}

// ---------- Totais por cenário ----------

export type Scenario = "today" | "breakeven" | "forecast";

export type ScenarioRevenue = {
  ticketsQty: number;       // quantidade pagantes (sem cortesias)
  ticketsRevenue: number;
  drinkRevenue: number;
  foodRevenue: number;
  sponsorRevenue: number;
  souvenirRevenue: number;
  otherCredits: number;
  totalRevenue: number;
  // cortesias (informativo)
  courtesyQty: number;
};

function abForPublic(publicQty: number, cfg: CoalaConfig) {
  return {
    drink: publicQty * n(cfg.ab_drink_avg_ticket),
    food: publicQty * n(cfg.ab_food_avg_ticket),
  };
}

export function computeScenarioRevenue(
  sessions: CoalaSession[],
  cfg: CoalaConfig,
  scenario: Scenario,
  /** Quantidade total de pagantes por sessão (vindo de solver BE/Forecast). */
  qtyByKey?: Record<string, number>,
  /** Receita de bilheteira por sessão (real + extras a preços marginais reais).
   *  Quando fornecido, substitui o cálculo qty × TM. */
  revenueByKey?: Record<string, number>,
): ScenarioRevenue {
  let ticketsQty = 0, ticketsRevenue = 0, courtesyQty = 0;

  for (const s of sessions) {
    const key = `${s.day_index}-${s.zone_label}`;
    if (scenario === "today") {
      ticketsQty += sessionTodayQty(s);
      ticketsRevenue += sessionTodayRevenue(s);
      courtesyQty += n(s.courtesy_qty);
    } else {
      // breakeven OU forecast: usa solver se fornecido; senão fallback estático.
      const realQty = sessionTodayQty(s);
      const realRev = sessionTodayRevenue(s);
      let totalQty: number;
      if (qtyByKey?.[key] != null) {
        totalQty = qtyByKey[key];
      } else if (scenario === "forecast") {
        totalQty = sessionForecastQty(s) - n(s.courtesy_qty); // pagantes
      } else {
        totalQty = realQty;
      }
      ticketsQty += totalQty;

      const exact = revenueByKey?.[key];
      if (exact != null && Number.isFinite(exact)) {
        ticketsRevenue += exact;
      } else if (scenario === "forecast" && qtyByKey?.[key] == null) {
        ticketsRevenue += sessionForecastRevenue(s);
      } else {
        const extra = Math.max(0, totalQty - realQty);
        const tm = sessionAvgTicket(s);
        ticketsRevenue += realRev + extra * tm;
      }
      courtesyQty += n(s.courtesy_qty);
    }
  }

  const publicForAB = ticketsQty + courtesyQty;
  const ab = abForPublic(publicForAB, cfg);


  return {
    ticketsQty,
    ticketsRevenue,
    drinkRevenue: ab.drink,
    foodRevenue: ab.food,
    sponsorRevenue: n(cfg.sponsorship_revenue),
    souvenirRevenue: n(cfg.souvenir_revenue),
    otherCredits: n(cfg.bonif_bebidas) + n(cfg.ponto_vendido),
    totalRevenue:
      ticketsRevenue + ab.drink + ab.food +
      n(cfg.sponsorship_revenue) + n(cfg.souvenir_revenue) +
      n(cfg.bonif_bebidas) + n(cfg.ponto_vendido),
    courtesyQty,
  };
}

// ---------- Custos ----------

export type ScenarioCosts = {
  eventCosts: number;        // custos de evento (não A&B / não souvenir)
  abCost: number;            // CMV A&B (Bebida + Alimento) — recalculado pelo passthrough
  souvenirCost: number;
  totalCost: number;
};

export function computeScenarioCosts(
  costLines: CoalaCostLine[],
  revenue: ScenarioRevenue,
  cfg: CoalaConfig,
  scenario: Scenario,
): ScenarioCosts {
  let eventCosts = 0;
  for (const l of costLines) {
    if (l.is_ab_passthrough) continue;
    if (scenario === "today") eventCosts += n(l.actual_amount ?? l.prior_year_amount);
    else if (scenario === "breakeven") {
      // BE: assume custos = reais atuais (a alavanca é só receita de bilheteira).
      // Fallback se a coluna BE estiver vazia: actual → prior → forecast.
      const be = n(l.break_even_amount);
      if (be > 0) eventCosts += be;
      else eventCosts += n(l.actual_amount) || n(l.prior_year_amount) || n(l.forecast_amount);
    }
    else eventCosts += n(l.forecast_amount);
  }
  // Em "today" o A&B real é desconhecido → usa mesma fórmula proporcional ao público
  const abCost =
    revenue.drinkRevenue * (n(cfg.ab_drink_passthrough_pct) / 100) +
    revenue.foodRevenue * (n(cfg.ab_food_passthrough_pct) / 100);
  const souvenirCost = n(cfg.souvenir_cost);
  return {
    eventCosts,
    abCost,
    souvenirCost,
    totalCost: eventCosts + abCost + souvenirCost,
  };
}

// ---------- Resultado ----------

export type ScenarioResult = {
  general: number;
  event: number;     // ticketsRevenue + sponsor + outros - eventCosts
  ab: number;        // drink+food - abCost
  souvenir: number;  // souvenirRevenue - souvenirCost
};

export function computeScenarioResult(
  rev: ScenarioRevenue,
  cost: ScenarioCosts,
): ScenarioResult {
  const ab = rev.drinkRevenue + rev.foodRevenue - cost.abCost;
  const souvenir = rev.souvenirRevenue - cost.souvenirCost;
  const event =
    rev.ticketsRevenue + rev.sponsorRevenue + rev.otherCredits - cost.eventCosts;
  return { general: ab + souvenir + event, event, ab, souvenir };
}

// ---------- Indicadores per capita ----------

export type ScenarioKpis = {
  totalPublic: number;
  tmTickets: number;
  tmAB: number;
  costPerPerson: number;
  resultPerPerson: number;
};

export function computeScenarioKpis(
  rev: ScenarioRevenue,
  cost: ScenarioCosts,
  result: ScenarioResult,
): ScenarioKpis {
  const totalPublic = rev.ticketsQty + rev.courtesyQty;
  const div = totalPublic > 0 ? totalPublic : 0;
  return {
    totalPublic,
    tmTickets: div ? rev.ticketsRevenue / rev.ticketsQty : 0,
    tmAB: div ? (rev.drinkRevenue + rev.foodRevenue) / div : 0,
    costPerPerson: div ? cost.totalCost / div : 0,
    resultPerPerson: div ? result.general / div : 0,
  };
}

// ---------- Break-Even solver ----------

/**
 * Resolve quantos bilhetes adicionais (acima do real) é preciso vender
 * para zerar o resultado geral do cenário Break-Even.
 *
 * Regras de produto (validadas com utilizador):
 *  - Só a receita de bilheteira é a "alavanca". A&B escala proporcional
 *    ao público; Souvenir/Patrocínio/Outros são fixos.
 *  - Custos usados são os do cenário Break-Even (`break_even_amount`).
 *  - Cada sessão (dia × zona) respeita a CAPACIDADE da zona — nunca
 *    aloca acima de `total_capacity − qty_real`.
 *  - PREÇO MARGINAL: usa o preço do próximo lote disponível (vendido
 *    < quantity); se já está no último lote ou não há plano, usa o
 *    último preço definido (ou TM real como fallback).
 *  - PESO POR ZONA: proporcional ao **ritmo de venda** (qty/dia),
 *    ponderado pela margem unitária. Zona com ritmo zero não recebe
 *    esforço (não adianta projetar venda onde ninguém compra).
 *  - Distribuição é iterativa por "ondas": a cada iteração distribui
 *    o restante do défice pelas zonas elegíveis, respeita capacidade,
 *    e repete até cobrir o défice ou esgotar capacidade.
 *
 * Retorna também um breakdown detalhado para a UI mostrar o "porquê".
 */
export function solveBreakEven(
  sessions: CoalaSession[],
  costLines: CoalaCostLine[],
  cfg: CoalaConfig,
  lotInfoByKey?: Record<string, SessionLotInfo>,
): BreakEvenSolution {
  const baseMap: Record<string, number> = {};
  for (const s of sessions) baseMap[`${s.day_index}-${s.zone_label}`] = sessionTodayQty(s);

  // Ponto de partida: cenário "Break Even" usando só o real como vendas.
  const baseRev = computeScenarioRevenue(sessions, cfg, "breakeven", baseMap);
  const baseCosts = computeScenarioCosts(costLines, baseRev, cfg, "breakeven");
  const baseRes = computeScenarioResult(baseRev, baseCosts);

  const emptyBreakdown: BreakEvenBreakdownItem[] = sessions.map((s) => ({
    key: `${s.day_index}-${s.zone_label}`,
    zone_label: s.zone_label,
    day_index: s.day_index,
    current_qty: sessionTodayQty(s),
    extra_qty: 0,
    capacity_left: 0,
    marginal_price: 0,
    velocity: 0,
    reason: "ok",
  }));

  // Receita base por sessão (real) — preenche também as não-elegíveis.
  const baseRevByKey: Record<string, number> = {};
  for (const s of sessions) baseRevByKey[`${s.day_index}-${s.zone_label}`] = sessionTodayRevenue(s);

  if (baseRes.general >= 0) {
    return {
      qtyByKey: baseMap, revenueByKey: baseRevByKey, reachable: true, deficit: 0,
      totalExtraTickets: 0, unfilled: 0, breakdown: emptyBreakdown,
    };
  }

  const deficit = -baseRes.general;

  // A&B líquido por pessoa adicional (igual em todas as sessões)
  const abMarginPerPub =
    n(cfg.ab_drink_avg_ticket) * (1 - n(cfg.ab_drink_passthrough_pct) / 100) +
    n(cfg.ab_food_avg_ticket) * (1 - n(cfg.ab_food_passthrough_pct) / 100);

  // Pré-cálculo por sessão
  type Slot = {
    idx: number;
    key: string;
    capLeft: number;
    velocity: number;
    margPrice: number;          // preço do próximo bilhete a vender
    margin: number;             // preço + A&B líquido
    weight: number;             // velocidade × margem
    eligible: boolean;
    reason: BreakEvenBreakdownItem["reason"];
    // estado mutável
    extra: number;
    extraRevenue: number;       // soma (extras × preço marginal real, lote-a-lote)
    // cópia mutável dos lotes para "consumir"
    lotsRemaining: Array<{ price: number; left: number }>;
    fallbackPrice: number;
  };

  const slots: Slot[] = sessions.map((s, idx) => {
    const key = `${s.day_index}-${s.zone_label}`;
    // Tenta a chave composta E também só pelo nome da zona (UI passa indexado por zona).
    const info = lotInfoByKey?.[key] ?? lotInfoByKey?.[s.zone_label];
    const realQty = sessionTodayQty(s);

    // Capacidade: usa lote/zona se definido (>0), senão fica "ilimitada"
    // (Number.POSITIVE_INFINITY) para não bloquear solver quando não há
    // planeamento de zonas/lotes registado.
    const hasCapacity = (info?.capacity ?? 0) > 0;
    const capLeft = hasCapacity
      ? Math.max(0, (info!.capacity) - realQty)
      : Number.POSITIVE_INFINITY;

    // Peso = potencial real de venda (mix entre zonas).
    // Usamos qty/dia quando há histórico ≥2 dias; caso contrário (importação
    // em batch / 1 dia) usamos qty real diretamente para preservar a
    // proporção observada entre zonas.
    const days = Math.max(1, info?.days_selling ?? 1);
    const realVelocity = days > 1 ? realQty / days : realQty;
    const proxyVelocity = n(s.projected_qty) + n(s.forecast_qty);
    const velocity = realVelocity > 0 ? realVelocity : proxyVelocity;

    // Lotes ordenados; "left" = quantity − vendido
    const lots = (info?.lots ?? []).slice().sort((a, b) => a.lot_number - b.lot_number);
    let lotsRemaining = lots.map((l) => ({ price: n(l.price), left: Math.max(0, n(l.quantity) - n(l.sold)) }));
    const nextLot = lotsRemaining.find((l) => l.left > 0);
    const lastDefinedPrice = lots.length ? n(lots[lots.length - 1].price) : 0;
    // Fallback: preço do PRÓXIMO lote disponível → último preço definido no BP
    // (= preço do último bilhete vendido quando tudo está esgotado) → TM real.
    const fallbackPrice = lastDefinedPrice || sessionAvgTicket(s);
    const margPrice = nextLot?.price ?? fallbackPrice;

    let eligible = true;
    let reason: BreakEvenBreakdownItem["reason"] = "ok";
    if (hasCapacity && capLeft <= 0) { eligible = false; reason = "capacity_full"; }
    else if (velocity <= 0) { eligible = false; reason = "no_velocity"; }
    else if (margPrice <= 0) { eligible = false; reason = "no_price"; }

    const margin = Math.max(0, margPrice + abMarginPerPub);
    const weight = velocity * margin;

    return {
      idx, key, capLeft, velocity, margPrice, margin, weight,
      eligible, reason, extra: 0, extraRevenue: 0, lotsRemaining, fallbackPrice,
    };
  });

  // Se nenhuma zona é elegível, devolve sem solução
  const eligibleSlots = slots.filter((sl) => sl.eligible);
  if (!eligibleSlots.length) {
    return {
      qtyByKey: baseMap, revenueByKey: baseRevByKey, reachable: false, deficit,
      totalExtraTickets: 0, unfilled: deficit,
      breakdown: slots.map((sl) => ({
        key: sl.key, zone_label: sessions[sl.idx].zone_label, day_index: sessions[sl.idx].day_index,
        current_qty: sessionTodayQty(sessions[sl.idx]), extra_qty: 0,
        capacity_left: Number.isFinite(sl.capLeft) ? sl.capLeft : 0,
        marginal_price: sl.margPrice, velocity: sl.velocity, reason: sl.reason,
      })),
    };
  }

  // Distribuição iterativa por ondas — para lidar com capacidade limitada e
  // mudança de preço entre lotes.
  let remainingDeficit = deficit;
  const MAX_WAVES = 50;
  for (let wave = 0; wave < MAX_WAVES && remainingDeficit > 0.005; wave++) {
    const active = slots.filter((sl) => sl.eligible && sl.capLeft > 0 && sl.weight > 0);
    if (!active.length) break;
    const sumW = active.reduce((a, sl) => a + sl.weight, 0);
    let progressed = false;

    for (const sl of active) {
      const share = remainingDeficit * (sl.weight / sumW);
      // Quantos bilhetes para cobrir essa fatia, respeitando lote atual + capacidade
      let toAlloc = Math.ceil(share / sl.margin);
      if (toAlloc <= 0) continue;
      toAlloc = Math.min(toAlloc, sl.capLeft);
      // Limita ao stock do próximo lote (depois recalculamos preço marginal)
      const lot = sl.lotsRemaining.find((l) => l.left > 0);
      if (lot) toAlloc = Math.min(toAlloc, lot.left);
      if (toAlloc <= 0) { sl.eligible = false; sl.reason = "capacity_full"; continue; }

      sl.extra += toAlloc;
      sl.extraRevenue += toAlloc * sl.margPrice; // receita pura de bilheteira (sem A&B)
      sl.capLeft -= toAlloc;
      if (lot) lot.left -= toAlloc;
      remainingDeficit -= toAlloc * sl.margin;
      progressed = true;

      // Recalcula preço marginal para próxima onda
      const nextLot = sl.lotsRemaining.find((l) => l.left > 0);
      sl.margPrice = nextLot?.price ?? sl.fallbackPrice;
      sl.margin = Math.max(0, sl.margPrice + abMarginPerPub);
      sl.weight = sl.velocity * sl.margin;
      if (sl.capLeft <= 0) { sl.eligible = false; sl.reason = "capacity_full"; }
    }
    if (!progressed) break;
  }

  const map: Record<string, number> = { ...baseMap };
  const revMap: Record<string, number> = { ...baseRevByKey };
  let totalExtra = 0;
  const breakdown: BreakEvenBreakdownItem[] = slots.map((sl) => {
    map[sl.key] = sessionTodayQty(sessions[sl.idx]) + sl.extra;
    revMap[sl.key] = sessionTodayRevenue(sessions[sl.idx]) + sl.extraRevenue;
    totalExtra += sl.extra;
    return {
      key: sl.key,
      zone_label: sessions[sl.idx].zone_label,
      day_index: sessions[sl.idx].day_index,
      current_qty: sessionTodayQty(sessions[sl.idx]),
      extra_qty: sl.extra,
      capacity_left: Number.isFinite(sl.capLeft) ? sl.capLeft : 0,
      marginal_price: sl.margPrice,
      velocity: sl.velocity,
      reason: sl.reason,
    };
  });

  return {
    qtyByKey: map,
    revenueByKey: revMap,
    reachable: remainingDeficit <= 0.5,
    deficit,
    totalExtraTickets: totalExtra,
    unfilled: Math.max(0, remainingDeficit),
    breakdown,
  };
}

// ---------- Forecast solver ----------

/**
 * Projecao de vendas ate ao dia do evento, por sessao (dia x zona).
 * Modelo HIBRIDO: ritmo recente extrapolado + aceleracao na reta final;
 * capacidade rigida; manual como piso minimo; receita lote-a-lote.
 * Cada zona/produto projeta o seu PROPRIO ritmo (apetite por produto).
 */
export function solveForecast(
  sessions: CoalaSession[],
  cfg: CoalaConfig,
  lotInfoByKey?: Record<string, SessionLotInfo>,
  eventDate?: string | null,
  opts?: { finalAccel?: number; finalWindowDays?: number },
): ForecastSolution {
  const finalAccel = Number.isFinite(opts?.finalAccel) && (opts!.finalAccel as number) > 0
    ? (opts!.finalAccel as number)
    : FORECAST_FINAL_ACCEL_DEFAULT;
  const finalWindowDays = Number.isFinite(opts?.finalWindowDays) && (opts!.finalWindowDays as number) > 0
    ? Math.round(opts!.finalWindowDays as number)
    : FORECAST_FINAL_WINDOW_DAYS_DEFAULT;

  const todayStr = new Date().toISOString().slice(0, 10);
  let daysToEvent = 30;
  if (eventDate) {
    const ms = new Date(eventDate).getTime() - new Date(todayStr).getTime();
    daysToEvent = Math.max(1, Math.round(ms / 86400000));
  }
  const finalWindow = Math.min(finalWindowDays, daysToEvent);
  const baseWindow = Math.max(0, daysToEvent - finalWindowDays);

  const qtyByKey: Record<string, number> = {};
  const revenueByKey: Record<string, number> = {};
  const breakdown: ForecastBreakdownItem[] = [];
  let hasCapacityPlan = false;

  for (const s of sessions) {
    const key = `${s.day_index}-${s.zone_label}`;
    const info = lotInfoByKey?.[key] ?? lotInfoByKey?.[s.zone_label];
    const realQty = sessionTodayQty(s);
    const realRev = sessionTodayRevenue(s);
    const courtesy = n(s.courtesy_qty);
    const manualFloor = Math.max(0, n(s.forecast_qty) - courtesy);

    const hasCapacity = (info?.capacity ?? 0) > 0;
    if (hasCapacity) hasCapacityPlan = true;
    const capLeft = hasCapacity
      ? Math.max(0, info!.capacity - realQty)
      : Number.POSITIVE_INFINITY;

    const daysSelling = Math.max(1, info?.days_selling ?? 1);
    const recentVelocity = daysSelling > 1 ? realQty / daysSelling : realQty;

    const baseProjection = recentVelocity * baseWindow;
    const finalProjection = recentVelocity * finalAccel * finalWindow;
    let projectedQty = Math.round(baseProjection + finalProjection);

    let cappedByCapacity = false;
    if (Number.isFinite(capLeft) && projectedQty > capLeft) {
      projectedQty = Math.floor(capLeft);
      cappedByCapacity = true;
    }

    let manualUsed = false;
    if (manualFloor > realQty) {
      const manualExtra = manualFloor - realQty;
      const cappedManual = Number.isFinite(capLeft) ? Math.min(manualExtra, Math.floor(capLeft)) : manualExtra;
      if (cappedManual > projectedQty) {
        projectedQty = cappedManual;
        manualUsed = true;
      }
    }

    let extraRevenue = 0;
    let remaining = projectedQty;
    const lots = (info?.lots ?? []).slice().sort((a, b) => a.lot_number - b.lot_number);
    const lotsRemaining = lots.map((l) => ({
      price: n(l.price),
      left: Math.max(0, n(l.quantity) - n(l.sold)),
    }));
    const lastDefinedPrice = lots.length ? n(lots[lots.length - 1].price) : 0;
    const fallbackPrice = lastDefinedPrice || sessionAvgTicket(s);

    while (remaining > 0) {
      const lot = lotsRemaining.find((l) => l.left > 0);
      const price = lot?.price ?? fallbackPrice;
      if (price <= 0) break;
      const take = lot ? Math.min(remaining, lot.left) : remaining;
      extraRevenue += take * price;
      if (lot) lot.left -= take;
      remaining -= take;
      if (!lot) break;
    }

    let reason: ForecastBreakdownItem["reason"] = "ok";
    if (recentVelocity <= 0 && !manualUsed) reason = "no_velocity";
    else if (cappedByCapacity && capLeft <= 0) reason = "capacity_full";

    qtyByKey[key] = realQty + projectedQty;
    revenueByKey[key] = realRev + extraRevenue;

    breakdown.push({
      key,
      zone_label: s.zone_label,
      day_index: s.day_index,
      current_qty: realQty,
      projected_qty: projectedQty,
      forecast_qty: realQty + projectedQty,
      capacity_left: Number.isFinite(capLeft) ? Math.max(0, capLeft - projectedQty) : Number.POSITIVE_INFINITY,
      recent_velocity: recentVelocity,
      days_to_event: daysToEvent,
      capped_by_capacity: cappedByCapacity,
      manual_floor_used: manualUsed,
      reason,
    });
  }

  return { qtyByKey, revenueByKey, breakdown, daysToEvent, hasCapacityPlan };
}

// ---------- IVA por sessão ----------

export type IvaRow = {
  label: string;
  gross: number;     // faturamento bruto
  iva: number;
  net: number;
  share: number;     // representatividade no total líquido
};

export function computeIvaTable(sessions: CoalaSession[]): IvaRow[] {
  const rows = sessions.map((s) => {
    const gross = sessionTodayRevenue(s); // base: real
    const ivaPct = n(s.iva_pct, 6);
    const iva = gross - gross / (1 + ivaPct / 100);
    const net = gross - iva;
    return { label: `Dia ${String(s.day_index + 1).padStart(2, "0")} — ${s.zone_label}`, gross, iva, net, share: 0 };
  });
  const totalNet = rows.reduce((a, r) => a + r.net, 0) || 1;
  return rows.map((r) => ({ ...r, share: r.net / totalNet }));
}
