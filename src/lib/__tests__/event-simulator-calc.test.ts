/**
 * Bateria de testes E2E (cálculo) do Event Simulator.
 *
 * Cobre todas as variações principais do modelo "Bilheteira é o motor":
 *  - 1 zona / múltiplas zonas / múltiplos dias
 *  - overrides de zona vs defaults globais
 *  - cortesias contam para totalPublic mas não para ticketRevenue
 *  - conversões 0% e 100% (extremos)
 *  - CMV 0% e 100%
 *  - patrocínios independentes do público
 *  - SPA sobre receita bruta total (incluindo patrocínios)
 *  - Comissão de bilheteira só sobre ticketRevenue
 *  - break-even: rejeita margem ≤ 0 e fixedExpenses ≤ 0
 *  - curva de vendas preset
 *  - distribuição uniforme do "Puxar do BP"
 *  - inputs inválidos (NaN, null, negativos)
 */
import { describe, it, expect } from "vitest";
import {
  computeCell,
  computeTotals,
  effectiveAB,
  suggestBreakEven,
  projectSalesCurve,
  distributeEvenly,
  PRESET_CURVE,
  type SimGlobalCfg,
  type SimZoneCfg,
  type SimCellInput,
} from "../event-simulator-calc";

const baseCfg: SimGlobalCfg = {
  default_drink_avg_ticket: 10,
  default_food_avg_ticket: 5,
  default_drink_cmv_pct: 60,
  default_food_cmv_pct: 70,
  default_drink_conversion_pct: 100,
  default_food_conversion_pct: 50,
  default_merch_avg_ticket: 25,
  default_merch_cmv_pct: 40,
  default_merch_conversion_pct: 8,
  sponsorship_revenue: 0,
  variable_spa_pct: 5,
  variable_commission_pct: 5,
};

const cell = (over: Partial<SimCellInput> = {}): SimCellInput => ({
  day_index: 0,
  zone_label: "Pista",
  projected_qty: 0,
  courtesy_qty: 0,
  ticket_revenue: 0,
  ...over,
});

describe("effectiveAB — overrides de zona vs defaults", () => {
  it("usa defaults quando zona é null", () => {
    const eff = effectiveAB(null, baseCfg);
    expect(eff.drinkTicket).toBe(10);
    expect(eff.merchConvPct).toBe(8);
  });

  it("override de zona prevalece sobre default", () => {
    const zone: SimZoneCfg = {
      drink_avg_ticket: 12.5,
      food_avg_ticket: null,
      drink_cmv_pct: null,
      food_cmv_pct: null,
      drink_conversion_pct: null,
      food_conversion_pct: null,
      merch_avg_ticket: null,
      merch_cmv_pct: null,
      merch_conversion_pct: null,
    };
    const eff = effectiveAB(zone, baseCfg);
    expect(eff.drinkTicket).toBe(12.5);
    expect(eff.foodTicket).toBe(5); // mantém default
  });

  it("override 0 não cai para default (0 é valor válido)", () => {
    const zone: SimZoneCfg = {
      drink_avg_ticket: 0,
      food_avg_ticket: null,
      drink_cmv_pct: null,
      food_cmv_pct: null,
      drink_conversion_pct: null,
      food_conversion_pct: null,
      merch_avg_ticket: null,
      merch_cmv_pct: null,
      merch_conversion_pct: null,
    };
    expect(effectiveAB(zone, baseCfg).drinkTicket).toBe(0);
  });
});

describe("computeCell — fórmula base", () => {
  it("público=0 zera todas as receitas derivadas", () => {
    const r = computeCell(cell({ projected_qty: 0, courtesy_qty: 0 }), null, baseCfg);
    expect(r.ab_drink_revenue).toBe(0);
    expect(r.ab_food_revenue).toBe(0);
    expect(r.merch_revenue).toBe(0);
    expect(r.derivedMargin).toBe(0);
  });

  it("100 pax × conv100% drink × €10 = €1000 receita drink", () => {
    const r = computeCell(cell({ projected_qty: 100 }), null, baseCfg);
    expect(r.ab_drink_revenue).toBe(1000);
    // CMV 60% → cogs 600 → margem drink 400
    expect(r.ab_drink_cogs).toBe(600);
  });

  it("conv 50% food → 100 pax × 0.5 × €5 = €250", () => {
    const r = computeCell(cell({ projected_qty: 100 }), null, baseCfg);
    expect(r.ab_food_revenue).toBe(250);
    expect(r.ab_food_cogs).toBe(250 * 0.7);
  });

  it("merch conv 8% × €25 → 100 pax = €200", () => {
    const r = computeCell(cell({ projected_qty: 100 }), null, baseCfg);
    expect(r.merch_revenue).toBe(200);
  });

  it("cortesias contam para público derivado mas não para ticketRevenue", () => {
    const r = computeCell(cell({ projected_qty: 80, courtesy_qty: 20, ticket_revenue: 800 }), null, baseCfg);
    expect(r.totalPublic).toBe(100);
    expect(r.ab_drink_revenue).toBe(1000); // 100 pax
    expect(r.ticket_revenue).toBe(800); // não alterado por cortesias
  });

  it("conversão 0% zera linha derivada respetiva", () => {
    const cfg = { ...baseCfg, default_drink_conversion_pct: 0 };
    const r = computeCell(cell({ projected_qty: 500 }), null, cfg);
    expect(r.ab_drink_revenue).toBe(0);
    expect(r.ab_drink_cogs).toBe(0);
  });

  it("conversão 100% e CMV 0% → margem = receita", () => {
    const cfg = { ...baseCfg, default_drink_cmv_pct: 0 };
    const r = computeCell(cell({ projected_qty: 100 }), null, cfg);
    expect(r.ab_drink_cogs).toBe(0);
    expect(r.derivedMargin).toBeGreaterThan(0);
  });

  it("CMV 100% → margem drink/food/merch = 0", () => {
    const cfg = {
      ...baseCfg,
      default_drink_cmv_pct: 100,
      default_food_cmv_pct: 100,
      default_merch_cmv_pct: 100,
    };
    const r = computeCell(cell({ projected_qty: 100 }), null, cfg);
    expect(r.derivedMargin).toBe(0);
  });

  it("override de zona aplica-se ao cálculo final", () => {
    const zone: SimZoneCfg = {
      drink_avg_ticket: 20, // dobro
      food_avg_ticket: null, food_cmv_pct: null, food_conversion_pct: null,
      drink_cmv_pct: null, drink_conversion_pct: null,
      merch_avg_ticket: null, merch_cmv_pct: null, merch_conversion_pct: null,
    };
    const r = computeCell(cell({ projected_qty: 100 }), zone, baseCfg);
    expect(r.ab_drink_revenue).toBe(2000);
  });
});

describe("computeTotals — agregados", () => {
  it("1 dia × 1 zona × 100 pax × ticketRev 1000", () => {
    const t = computeTotals(
      [cell({ projected_qty: 100, ticket_revenue: 1000 })],
      {},
      baseCfg,
    );
    expect(t.totalPublic).toBe(100);
    expect(t.ticketRevenue).toBe(1000);
    expect(t.drinkRevenue).toBe(1000);
    expect(t.foodRevenue).toBe(250);
    expect(t.merchRevenue).toBe(200);
    expect(t.grossRevenue).toBe(2450);
    // SPA 5% sobre 2450 = 122.5
    expect(t.variableSpa).toBeCloseTo(122.5);
    // Comissão 5% sobre 1000 = 50
    expect(t.variableCommission).toBe(50);
    expect(t.variableTotal).toBeCloseTo(172.5);
  });

  it("2 dias × 2 zonas — agrega corretamente", () => {
    const cells: SimCellInput[] = [
      cell({ day_index: 0, zone_label: "Pista", projected_qty: 100, ticket_revenue: 1000 }),
      cell({ day_index: 0, zone_label: "VIP", projected_qty: 50, ticket_revenue: 2000 }),
      cell({ day_index: 1, zone_label: "Pista", projected_qty: 200, ticket_revenue: 2000 }),
      cell({ day_index: 1, zone_label: "VIP", projected_qty: 100, ticket_revenue: 4000 }),
    ];
    const t = computeTotals(cells, {}, baseCfg);
    expect(t.projectedQty).toBe(450);
    expect(t.ticketRevenue).toBe(9000);
    // drink: 450 × 100% × €10
    expect(t.drinkRevenue).toBe(4500);
  });

  it("zonas com overrides distintos somam corretamente", () => {
    const zones = {
      Pista: { drink_avg_ticket: 8 } as any,
      VIP: { drink_avg_ticket: 20 } as any,
    };
    const cells = [
      cell({ zone_label: "Pista", projected_qty: 100 }),
      cell({ zone_label: "VIP", projected_qty: 100 }),
    ];
    const t = computeTotals(cells, zones, baseCfg);
    // Pista 100×€8=800, VIP 100×€20=2000
    expect(t.drinkRevenue).toBe(2800);
  });

  it("patrocínios entram em grossRevenue e em SPA mas NÃO em comissão de bilheteira", () => {
    const cfg = { ...baseCfg, sponsorship_revenue: 5000 };
    const t = computeTotals(
      [cell({ projected_qty: 100, ticket_revenue: 1000 })],
      {},
      cfg,
    );
    expect(t.sponsorsRevenue).toBe(5000);
    expect(t.grossRevenue).toBe(2450 + 5000); // 7450
    expect(t.variableSpa).toBeCloseTo(7450 * 0.05);
    expect(t.variableCommission).toBe(50); // só sobre ticketRevenue
  });

  it("variável SPA=0 e commission=0 → variableTotal=0", () => {
    const cfg = { ...baseCfg, variable_spa_pct: 0, variable_commission_pct: 0 };
    const t = computeTotals([cell({ projected_qty: 100, ticket_revenue: 1000 })], {}, cfg);
    expect(t.variableTotal).toBe(0);
  });

  it("array vazio devolve totals zerados", () => {
    const t = computeTotals([], {}, baseCfg);
    expect(t.grossRevenue).toBe(0);
    expect(t.variableSpa).toBe(0);
    expect(t.cogsTotal).toBe(0);
  });

  it("inputs com NaN/undefined são tratados como 0", () => {
    const t = computeTotals(
      // @ts-expect-error a testar resiliência
      [cell({ projected_qty: NaN, courtesy_qty: undefined, ticket_revenue: "abc" })],
      {},
      baseCfg,
    );
    expect(t.totalPublic).toBe(0);
    expect(t.ticketRevenue).toBe(0);
  });

  it("derivedMargin = receitas A&B/Merch − cogs (sem ticket nem patrocínio)", () => {
    const t = computeTotals([cell({ projected_qty: 100, ticket_revenue: 9999 })], {}, baseCfg);
    // drink 1000 (cogs 600) + food 250 (cogs 175) + merch 200 (cogs 80)
    // margem = 1450 − 855 = 595
    expect(t.derivedMargin).toBeCloseTo(595);
  });
});

describe("suggestBreakEven", () => {
  it("retorna null se margem por público ≤ 0", () => {
    // CMV 100% em tudo + 0 ticket → margem = 0
    const cfg = {
      ...baseCfg,
      default_drink_cmv_pct: 100,
      default_food_cmv_pct: 100,
      default_merch_cmv_pct: 100,
    };
    const t = computeTotals([cell({ projected_qty: 100, ticket_revenue: 0 })], {}, cfg);
    expect(suggestBreakEven(t, 5000)).toBeNull();
  });

  it("retorna null se fixedExpenses ≤ 0", () => {
    const t = computeTotals([cell({ projected_qty: 100, ticket_revenue: 1000 })], {}, baseCfg);
    expect(suggestBreakEven(t, 0)).toBeNull();
  });

  it("calcula público necessário para cobrir fixedExpenses", () => {
    const t = computeTotals([cell({ projected_qty: 100, ticket_revenue: 1000 })], {}, baseCfg);
    // ticket 1000 + derivedMargin 595 = 1595 / 100 pax = €15.95 margem/pax
    // fixed = 5000 - 855 (cogs) = 4145 → ceil(4145/15.95) = 260
    const be = suggestBreakEven(t, 5000);
    expect(be).toBe(260);
  });

  it("público projetado=0 → não dá divisão por zero", () => {
    const t = computeTotals([], {}, baseCfg);
    expect(suggestBreakEven(t, 5000)).toBeNull();
  });
});

describe("projectSalesCurve — preset", () => {
  it("milestone 100% iguala totalQty", () => {
    const c = projectSalesCurve(1000);
    expect(c[c.length - 1].qty).toBe(1000);
  });

  it("milestone 0 dias = 100% cumulativo", () => {
    expect(PRESET_CURVE[PRESET_CURVE.length - 1].cumulativePct).toBe(100);
  });

  it("respeita ordem decrescente de daysBefore", () => {
    const days = PRESET_CURVE.map((p) => p.daysBefore);
    const sorted = [...days].sort((a, b) => b - a);
    expect(days).toEqual(sorted);
  });

  it("totalQty=0 retorna todos os qty=0", () => {
    expect(projectSalesCurve(0).every((p) => p.qty === 0)).toBe(true);
  });
});

describe("distributeEvenly — Puxar do BP", () => {
  it("€10000 por 4 slots (2 dias × 2 zonas) = €2500 cada", () => {
    expect(distributeEvenly(10000, 4)).toBe(2500);
  });

  it("0 slots devolve 0 (não divide por zero)", () => {
    expect(distributeEvenly(1000, 0)).toBe(0);
  });

  it("arredonda a 2 casas decimais", () => {
    expect(distributeEvenly(100, 3)).toBe(33.33);
  });
});

describe("Cenários integrados (variações realistas)", () => {
  it("Cenário A — single show, 1 dia, sala 500 pax", () => {
    const t = computeTotals(
      [cell({ projected_qty: 500, ticket_revenue: 12500 })],
      {},
      { ...baseCfg, sponsorship_revenue: 2000 },
    );
    // ticket 12500 + drink 5000 + food 1250 + merch 1000 + sponsor 2000 = 21750
    expect(t.grossRevenue).toBe(21750);
  });

  it("Cenário B — festival 2 dias × 3 zonas com overrides", () => {
    const zones = {
      Geral: { drink_avg_ticket: 7, food_avg_ticket: 4 } as any,
      VIP: { drink_avg_ticket: 15, food_avg_ticket: 12, merch_conversion_pct: 20 } as any,
      Backstage: { drink_conversion_pct: 0, food_conversion_pct: 0, merch_conversion_pct: 0 } as any,
    };
    const cells: SimCellInput[] = [];
    for (const day of [0, 1]) {
      cells.push(cell({ day_index: day, zone_label: "Geral", projected_qty: 800, ticket_revenue: 12000 }));
      cells.push(cell({ day_index: day, zone_label: "VIP", projected_qty: 100, ticket_revenue: 8000 }));
      cells.push(cell({ day_index: day, zone_label: "Backstage", projected_qty: 30, courtesy_qty: 20 }));
    }
    const t = computeTotals(cells, zones, baseCfg);
    expect(t.projectedQty).toBe((800 + 100 + 30) * 2);
    expect(t.courtesyQty).toBe(20 * 2);
    // Backstage não gera A&B nem merch (todas conv=0)
    // Drink: Geral 1600×€7=11200; VIP 200×€15=3000; Backstage 0 → 14200
    expect(t.drinkRevenue).toBe(14200);
    // Comissão só sobre ticketRevenue (ticket Backstage=0)
    expect(t.variableCommission).toBeCloseTo(t.ticketRevenue * 0.05);
  });

  it("Cenário C — só patrocínios, sem público (lançamento corporate)", () => {
    const cfg = { ...baseCfg, sponsorship_revenue: 50000 };
    const t = computeTotals([cell({ projected_qty: 0 })], {}, cfg);
    expect(t.grossRevenue).toBe(50000);
    expect(t.ticketRevenue).toBe(0);
    expect(t.variableCommission).toBe(0);
    expect(t.variableSpa).toBeCloseTo(2500);
  });

  it("Cenário D — sold-out com cortesias massivas (showcase)", () => {
    const t = computeTotals(
      [cell({ projected_qty: 0, courtesy_qty: 1000, ticket_revenue: 0 })],
      {},
      baseCfg,
    );
    expect(t.ticketRevenue).toBe(0);
    expect(t.totalPublic).toBe(1000);
    // drink 1000×100%×€10 = €10000 mesmo sem ticketRevenue
    expect(t.drinkRevenue).toBe(10000);
    expect(t.variableCommission).toBe(0); // ticket=0
  });
});
