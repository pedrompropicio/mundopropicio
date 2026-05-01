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
    if (scenario === "today") eventCosts += n(l.actual_amount ?? l.prior_year_amount);
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
 * Resolve quantos bilhetes adicionais (acima do real) é preciso vender
 * para zerar o resultado geral do cenário Break-Even.
 *
 * Regras (decisão de produto):
 *  - Só a receita de bilheteira é a "alavanca" (o utilizador só controla isso).
 *  - O aumento de público arrasta automaticamente A&B (Bebida + Alimento)
 *    proporcional ao público — esse efeito está modelado em
 *    `computeScenarioRevenue` (`abForPublic`) e em `computeScenarioCosts`
 *    (CMV A&B = receita A&B × passthrough%).
 *  - Souvenir, Patrocínio e Outros Créditos NÃO escalam com público —
 *    permanecem como o cfg do cenário Break-Even.
 *  - Os custos de evento usados são os do cenário Break-Even
 *    (`break_even_amount` em cada `costLine`), e não os de "today".
 *
 * Margem unitária por bilhete adicional:
 *    margem = TM_sessão
 *           + drinkAvgTicket × (1 − drinkPassthrough%)
 *           + foodAvgTicket  × (1 − foodPassthrough%)
 *
 * Como nenhuma das parcelas depende não-linearmente do nº de bilhetes
 * adicionais, basta resolver linearmente:
 *    extra = ceil(deficit_BE / margem_média_ponderada)
 * e distribuir o `extra` proporcional ao TM de cada sessão.
 */
export function solveBreakEven(
  sessions: CoalaSession[],
  costLines: CoalaCostLine[],
  cfg: CoalaConfig,
): { qtyByKey: Record<string, number>; reachable: boolean } {
  const baseMap: Record<string, number> = {};
  for (const s of sessions) baseMap[`${s.day_index}-${s.zone_label}`] = sessionTodayQty(s);

  // Ponto de partida: cenário "Break Even" usando só o real como vendas.
  const baseRev = computeScenarioRevenue(sessions, cfg, "breakeven", baseMap);
  const baseCosts = computeScenarioCosts(costLines, baseRev, cfg, "breakeven");
  const baseRes = computeScenarioResult(baseRev, baseCosts);

  if (baseRes.general >= 0) {
    // Já está no positivo (ou exato) → BE = real
    return { qtyByKey: baseMap, reachable: true };
  }

  const deficit = -baseRes.general;

  // Margem unitária por sessão (bilhete + A&B líquido por pessoa)
  const abMarginPerPub =
    n(cfg.ab_drink_avg_ticket) * (1 - n(cfg.ab_drink_passthrough_pct) / 100) +
    n(cfg.ab_food_avg_ticket) * (1 - n(cfg.ab_food_passthrough_pct) / 100);

  const marginPerSeat = sessions.map((s) => Math.max(0, sessionAvgTicket(s) + abMarginPerPub));
  const sumMargin = marginPerSeat.reduce((a, b) => a + b, 0);

  if (sumMargin <= 0) {
    // Sem TM nem A&B → impossível resolver
    return { qtyByKey: baseMap, reachable: false };
  }

  // Margem média ponderada (cada sessão contribui igual em "uma pessoa adicional"):
  const avgMargin = sumMargin / marginPerSeat.length;
  const totalExtra = Math.ceil(deficit / avgMargin);

  // Distribuição proporcional ao TM (sessões com TM maior absorvem mais bilhetes)
  const totalTM = sessions.reduce((a, s) => a + sessionAvgTicket(s), 0);
  const map: Record<string, number> = { ...baseMap };
  let allocated = 0;
  sessions.forEach((s, i) => {
    const key = `${s.day_index}-${s.zone_label}`;
    const tm = sessionAvgTicket(s);
    const weight = totalTM > 0 ? tm / totalTM : 1 / sessions.length;
    const share = i === sessions.length - 1
      ? totalExtra - allocated
      : Math.round(totalExtra * weight);
    allocated += share;
    map[key] = sessionTodayQty(s) + Math.max(0, share);
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
