/**
 * Cálculos puros do Event Simulator — extraídos para permitir testes.
 *
 * Modelo "Bilheteira é o motor":
 *   totalPublic = projected_qty + courtesy_qty
 *   F&B/Merch escalam com público × conv% × ticket médio
 *   SPA = grossRevenue × variable_spa_pct%
 *   Comissão bilheteira = ticketRevenue × variable_commission_pct%
 *
 * Mantém-se aritmeticamente equivalente ao cálculo inline em
 * `src/pages/EventSimulator.tsx` (useMemo `calc`).
 */

export type SimZoneCfg = {
  drink_avg_ticket: number | null;
  food_avg_ticket: number | null;
  drink_cmv_pct: number | null;
  food_cmv_pct: number | null;
  drink_conversion_pct: number | null;
  food_conversion_pct: number | null;
  merch_avg_ticket: number | null;
  merch_cmv_pct: number | null;
  merch_conversion_pct: number | null;
};

export type SimGlobalCfg = {
  default_drink_avg_ticket: number;
  default_food_avg_ticket: number;
  default_drink_cmv_pct: number;
  default_food_cmv_pct: number;
  default_drink_conversion_pct: number;
  default_food_conversion_pct: number;
  default_merch_avg_ticket: number;
  default_merch_cmv_pct: number;
  default_merch_conversion_pct: number;
  sponsorship_revenue: number;
  variable_spa_pct: number;
  variable_commission_pct: number;
};

export type SimCellInput = {
  day_index: number;
  zone_label: string;
  projected_qty: number;
  courtesy_qty: number;
  /** receita de bilheteira já líquida — input livre */
  ticket_revenue: number;
};

export function n(v: any, fb = 0): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fb;
}

export function effectiveAB(zone: SimZoneCfg | null | undefined, cfg: SimGlobalCfg) {
  return {
    drinkTicket: zone?.drink_avg_ticket ?? cfg.default_drink_avg_ticket,
    foodTicket: zone?.food_avg_ticket ?? cfg.default_food_avg_ticket,
    drinkCmvPct: zone?.drink_cmv_pct ?? cfg.default_drink_cmv_pct,
    foodCmvPct: zone?.food_cmv_pct ?? cfg.default_food_cmv_pct,
    drinkConvPct: zone?.drink_conversion_pct ?? cfg.default_drink_conversion_pct,
    foodConvPct: zone?.food_conversion_pct ?? cfg.default_food_conversion_pct,
    merchTicket: zone?.merch_avg_ticket ?? cfg.default_merch_avg_ticket,
    merchCmvPct: zone?.merch_cmv_pct ?? cfg.default_merch_cmv_pct,
    merchConvPct: zone?.merch_conversion_pct ?? cfg.default_merch_conversion_pct,
  };
}

export function computeCell(input: SimCellInput, zone: SimZoneCfg | null | undefined, cfg: SimGlobalCfg) {
  const eff = effectiveAB(zone, cfg);
  const totalPublic = n(input.projected_qty) + n(input.courtesy_qty);
  const drinkUnits = totalPublic * (eff.drinkConvPct / 100);
  const foodUnits = totalPublic * (eff.foodConvPct / 100);
  const merchUnits = totalPublic * (eff.merchConvPct / 100);
  const ab_drink_revenue = drinkUnits * eff.drinkTicket;
  const ab_food_revenue = foodUnits * eff.foodTicket;
  const merch_revenue = merchUnits * eff.merchTicket;
  const ab_drink_cogs = ab_drink_revenue * (eff.drinkCmvPct / 100);
  const ab_food_cogs = ab_food_revenue * (eff.foodCmvPct / 100);
  const merch_cogs = merch_revenue * (eff.merchCmvPct / 100);
  return {
    totalPublic,
    ticket_revenue: n(input.ticket_revenue),
    ab_drink_revenue,
    ab_food_revenue,
    merch_revenue,
    ab_drink_cogs,
    ab_food_cogs,
    merch_cogs,
    derivedMargin:
      ab_drink_revenue + ab_food_revenue + merch_revenue -
      (ab_drink_cogs + ab_food_cogs + merch_cogs),
  };
}

export function computeTotals(
  cells: SimCellInput[],
  zoneCfgByLabel: Record<string, SimZoneCfg | undefined>,
  cfg: SimGlobalCfg,
) {
  let projectedQty = 0, courtesyQty = 0, ticketRevenue = 0;
  let drinkRevenue = 0, foodRevenue = 0, merchRevenue = 0;
  let drinkCogs = 0, foodCogs = 0, merchCogs = 0;

  for (const c of cells) {
    const r = computeCell(c, zoneCfgByLabel[c.zone_label], cfg);
    projectedQty += n(c.projected_qty);
    courtesyQty += n(c.courtesy_qty);
    ticketRevenue += r.ticket_revenue;
    drinkRevenue += r.ab_drink_revenue;
    foodRevenue += r.ab_food_revenue;
    merchRevenue += r.merch_revenue;
    drinkCogs += r.ab_drink_cogs;
    foodCogs += r.ab_food_cogs;
    merchCogs += r.merch_cogs;
  }

  const sponsorsRevenue = n(cfg.sponsorship_revenue);
  const grossRevenue = ticketRevenue + drinkRevenue + foodRevenue + merchRevenue + sponsorsRevenue;
  const cogsTotal = drinkCogs + foodCogs + merchCogs;
  const variableSpa = grossRevenue * (n(cfg.variable_spa_pct) / 100);
  const variableCommission = ticketRevenue * (n(cfg.variable_commission_pct) / 100);

  return {
    projectedQty,
    courtesyQty,
    totalPublic: projectedQty + courtesyQty,
    ticketRevenue,
    drinkRevenue,
    foodRevenue,
    merchRevenue,
    sponsorsRevenue,
    drinkCogs,
    foodCogs,
    merchCogs,
    cogsTotal,
    derivedMargin: drinkRevenue + foodRevenue + merchRevenue - cogsTotal,
    grossRevenue,
    variableSpa,
    variableCommission,
    variableTotal: variableSpa + variableCommission,
  };
}

/** Sugestão de break-even (público necessário) dado fixedExpenses de BP. */
export function suggestBreakEven(
  totals: ReturnType<typeof computeTotals>,
  bpExpenses: number,
): number | null {
  const marginPerPub = totals.projectedQty > 0
    ? (totals.ticketRevenue + totals.derivedMargin) / totals.projectedQty
    : 0;
  if (marginPerPub <= 0) return null;
  const fixedExpenses = bpExpenses - totals.cogsTotal;
  if (fixedExpenses <= 0) return null;
  return Math.ceil(fixedExpenses / marginPerPub);
}

export const PRESET_CURVE: { daysBefore: number; cumulativePct: number }[] = [
  { daysBefore: 90, cumulativePct: 5 },
  { daysBefore: 60, cumulativePct: 12 },
  { daysBefore: 45, cumulativePct: 22 },
  { daysBefore: 30, cumulativePct: 35 },
  { daysBefore: 21, cumulativePct: 45 },
  { daysBefore: 14, cumulativePct: 58 },
  { daysBefore: 7, cumulativePct: 72 },
  { daysBefore: 3, cumulativePct: 85 },
  { daysBefore: 1, cumulativePct: 95 },
  { daysBefore: 0, cumulativePct: 100 },
];

export function projectSalesCurve(totalQty: number) {
  return PRESET_CURVE.map((p) => ({ ...p, qty: Math.round(totalQty * (p.cumulativePct / 100)) }));
}

/** Distribuição uniforme: usado por "Puxar do BP" para bilheteira. */
export function distributeEvenly(total: number, slots: number): number {
  if (slots <= 0) return 0;
  return Number((total / slots).toFixed(2));
}
