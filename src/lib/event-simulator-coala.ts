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
  breakEvenQtyByKey?: Record<string, number>,
): ScenarioRevenue {
  let ticketsQty = 0, ticketsRevenue = 0, courtesyQty = 0;

  for (const s of sessions) {
    const key = `${s.day_index}-${s.zone_label}`;
    if (scenario === "today") {
      ticketsQty += sessionTodayQty(s);
      ticketsRevenue += sessionTodayRevenue(s);
      courtesyQty += n(s.courtesy_qty);
    } else if (scenario === "forecast") {
      const fq = sessionForecastQty(s);
      ticketsQty += fq - n(s.courtesy_qty); // pagantes
      ticketsRevenue += sessionForecastRevenue(s);
      courtesyQty += n(s.courtesy_qty);
    } else {
      // break-even: usa real + delta calculado externamente (breakEvenQtyByKey contém qty TOTAL de pagantes)
      const beQty = breakEvenQtyByKey?.[key] ?? sessionTodayQty(s);
      const tm = sessionAvgTicket(s);
      ticketsQty += beQty;
      ticketsRevenue += beQty * tm;
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
    if (scenario === "today") eventCosts += n(l.prior_year_amount);
    else if (scenario === "breakeven") eventCosts += n(l.break_even_amount);
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
 * Procura a quantidade adicional de pagantes (acima do real) por sessão
 * que zera o resultado geral, mantendo as proporções do real.
 * Distribui proporcionalmente ao TM da sessão.
 */
export function solveBreakEven(
  sessions: CoalaSession[],
  costLines: CoalaCostLine[],
  cfg: CoalaConfig,
): { qtyByKey: Record<string, number>; reachable: boolean } {
  // marginPerExtraPub = TM_médio + ticketABMédio − repasseAB − comissão (não consideramos comissão aqui)
  // Vamos resolver por bisseção sobre fator multiplicador de "delta"
  const today = computeScenarioRevenue(sessions, cfg, "today");
  const todayCosts = computeScenarioCosts(costLines, today, cfg, "today");
  const todayRes = computeScenarioResult(today, todayCosts);

  if (todayRes.general >= 0) {
    // Já está no positivo → BE = real
    const map: Record<string, number> = {};
    for (const s of sessions) map[`${s.day_index}-${s.zone_label}`] = sessionTodayQty(s);
    return { qtyByKey: map, reachable: true };
  }

  // Para cada sessão, custo marginal de uma pessoa adicional:
  //   receita = TM + (drinkAvgTicket + foodAvgTicket)
  //   custo   = drinkAvgTicket*passthrough% + foodAvgTicket*passthrough%
  //   margem  = TM + drinkAvgTicket*(1 - p_d) + foodAvgTicket*(1 - p_f)
  const marginPerSeat = sessions.map((s) => {
    const tm = sessionAvgTicket(s);
    const margin =
      tm +
      n(cfg.ab_drink_avg_ticket) * (1 - n(cfg.ab_drink_passthrough_pct) / 100) +
      n(cfg.ab_food_avg_ticket) * (1 - n(cfg.ab_food_passthrough_pct) / 100);
    return Math.max(0, margin);
  });

  // Necessidade de margem extra
  const need = -todayRes.general;
  // Distribui em partes iguais (mais simples e estável que ponderação por TM)
  const sumMargin = marginPerSeat.reduce((a, b) => a + b, 0);
  if (sumMargin <= 0) {
    const map: Record<string, number> = {};
    for (const s of sessions) map[`${s.day_index}-${s.zone_label}`] = sessionTodayQty(s);
    return { qtyByKey: map, reachable: false };
  }

  // total extra de pagantes (somando margens médias). Usamos margem média ponderada igual.
  const avgMargin = sumMargin / marginPerSeat.length;
  const totalExtra = Math.ceil(need / avgMargin);

  const map: Record<string, number> = {};
  // distribui proporcional à participação do TM da sessão
  const totalTM = sessions.reduce((a, s) => a + sessionAvgTicket(s), 0) || 1;
  let allocated = 0;
  sessions.forEach((s, i) => {
    const key = `${s.day_index}-${s.zone_label}`;
    const share = i === sessions.length - 1
      ? totalExtra - allocated
      : Math.round(totalExtra * (sessionAvgTicket(s) / totalTM));
    allocated += share;
    map[key] = sessionTodayQty(s) + share;
  });
  return { qtyByKey: map, reachable: true };
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
