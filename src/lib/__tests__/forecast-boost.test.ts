import { describe, it, expect } from "vitest";
import {
  solveForecast,
  type CoalaSession,
  type CoalaConfig,
  type SessionLotInfo,
} from "@/lib/event-simulator-coala";

const cfg: CoalaConfig = {
  ab_drink_avg_ticket: 0,
  ab_food_avg_ticket: 0,
  ab_drink_passthrough_pct: 0,
  ab_food_passthrough_pct: 0,
  sponsorship_revenue: 0,
  souvenir_revenue: 0,
  souvenir_cost: 0,
  bonif_bebidas: 0,
  ponto_vendido: 0,
  other_revenue: 0,
  prior_year_tickets: 0,
  prior_year_drink: 0,
  prior_year_food: 0,
  prior_year_sponsor: 0,
  prior_year_souvenir: 0,
  prior_year_other: 0,
  ticket_iva_pct: 6,
};

const mkSession = (overrides: Partial<CoalaSession> = {}): CoalaSession => ({
  day_index: 0,
  zone_label: "Geral",
  real_sales_qty: 0,
  real_sales_revenue: 0,
  projected_qty: 0,
  courtesy_qty: 0,
  forecast_qty: 0,
  prior_year_qty: 0,
  prior_year_revenue: 0,
  iva_pct: 6,
  ...overrides,
});

const lot = (
  capacity: number,
  daysSelling: number,
  sold: number,
  price = 50,
): SessionLotInfo => ({
  key: "Geral",
  capacity,
  days_selling: daysSelling,
  lots: [{ lot_number: 1, price, quantity: capacity, sold }],
});

const dateInDays = (d: number) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t.toISOString().slice(0, 10);
};

describe("solveForecast — janela adaptativa & boost", () => {
  it("aplica boost padrão (1.6×) na reta final quando há ritmo", () => {
    // 100 vendas em 30 dias = 3.33/dia base; reta final 30 dias × 1.6
    const sessions = [mkSession({ real_sales_qty: 100 })];
    const lots = { Geral: lot(1000, 30, 100) };
    const sol = solveForecast(sessions, cfg, lots, dateInDays(60));
    // baseWindow=30, finalWindow=30, vel=100/30
    // proj = 100/30 * 30 + 100/30 * 1.6 * 30 ≈ 100 + 160 = 260
    expect(sol.qtyByKey["0-Geral"]).toBeGreaterThanOrEqual(355); // 100 real + ~260
    expect(sol.qtyByKey["0-Geral"]).toBeLessThanOrEqual(365);
  });

  it("janela adaptativa: quando faltam 10 dias, finalWindow = 10 (não 30)", () => {
    const sessions = [mkSession({ real_sales_qty: 100 })];
    const lots = { Geral: lot(1000, 30, 100) };
    const sol = solveForecast(sessions, cfg, lots, dateInDays(10));
    // daysToEvent=10, finalWindow=min(30,10)=10, baseWindow=0
    // proj = vel * 1.6 * 10 = (100/30)*1.6*10 ≈ 53.3
    const proj = sol.qtyByKey["0-Geral"] - 100;
    expect(proj).toBeGreaterThanOrEqual(50);
    expect(proj).toBeLessThanOrEqual(57);
  });

  it("respeita capacidade restante como tecto rígido", () => {
    const sessions = [mkSession({ real_sales_qty: 100 })];
    // Só restam 50 lugares
    const lots = { Geral: lot(150, 30, 100) };
    const sol = solveForecast(sessions, cfg, lots, dateInDays(60));
    expect(sol.qtyByKey["0-Geral"]).toBe(150);
    expect(sol.breakdown[0].capped_by_capacity).toBe(true);
  });

  it("usa manual_floor (forecast_qty) como piso mínimo", () => {
    // Sem velocidade mas piso manual de 500
    const sessions = [mkSession({ real_sales_qty: 0, forecast_qty: 500 })];
    const lots = { Geral: lot(1000, 1, 0) };
    const sol = solveForecast(sessions, cfg, lots, dateInDays(30));
    expect(sol.qtyByKey["0-Geral"]).toBeGreaterThanOrEqual(500);
    expect(sol.breakdown[0].manual_floor_used).toBe(true);
  });

  it("opt-in finalAccel customizado é respeitado (calibrado)", () => {
    const sessions = [mkSession({ real_sales_qty: 100 })];
    const lots = { Geral: lot(10000, 30, 100) };
    const sol = solveForecast(sessions, cfg, lots, dateInDays(60), {
      finalAccel: 3.0,
      finalWindowDays: 30,
    });
    // proj = 100 + (100/30)*3*30 = 100 + 300 = 400 base+final = 100+300 → +100 base
    // Total = base 100 + final 300 = 400 → +real 100 = 500
    expect(sol.qtyByKey["0-Geral"]).toBeGreaterThanOrEqual(495);
    expect(sol.qtyByKey["0-Geral"]).toBeLessThanOrEqual(505);
  });

  it("PASSE 2 DIAS: agrupa por zone_label, não duplica vendas entre dias", () => {
    // Mesmo zone_label em 2 day_index com vendas só no dia anchor (dia 0)
    const sessions = [
      mkSession({ day_index: 0, zone_label: "Passe 2 dias", real_sales_qty: 200 }),
      mkSession({ day_index: 1, zone_label: "Passe 2 dias", real_sales_qty: 0 }),
    ];
    const lots = { "Passe 2 dias": lot(2000, 30, 200) };
    const sol = solveForecast(sessions, cfg, lots, dateInDays(60));
    // Anchor (day 0) recebe toda a projeção; day 1 fica em 0.
    const anchor = sol.qtyByKey["0-Passe 2 dias"];
    const sibling = sol.qtyByKey["1-Passe 2 dias"];
    expect(anchor).toBeGreaterThan(200);
    expect(sibling).toBe(0);
    // Velocidade calculada com base no total da zona, não no dia anchor sozinho.
    expect(sol.breakdown[0].recent_velocity).toBeCloseTo(200 / 30, 1);
  });

  it("zona sem velocidade nem manual → projeção = 0 e reason no_velocity", () => {
    const sessions = [mkSession({ real_sales_qty: 0 })];
    const lots = { Geral: lot(1000, 30, 0) };
    const sol = solveForecast(sessions, cfg, lots, dateInDays(60));
    expect(sol.qtyByKey["0-Geral"]).toBe(0);
    expect(sol.breakdown[0].reason).toBe("no_velocity");
  });

  it("finalWindowDays=7 (curto) reduz a contribuição da reta final", () => {
    const sessions = [mkSession({ real_sales_qty: 100 })];
    const lots = { Geral: lot(10000, 30, 100) };
    const sol7 = solveForecast(sessions, cfg, lots, dateInDays(60), {
      finalAccel: 1.6,
      finalWindowDays: 7,
    });
    const sol30 = solveForecast(sessions, cfg, lots, dateInDays(60), {
      finalAccel: 1.6,
      finalWindowDays: 30,
    });
    expect(sol30.qtyByKey["0-Geral"]).toBeGreaterThan(sol7.qtyByKey["0-Geral"]);
  });

  it("dia do evento (daysToEvent=1) → projeção colapsa para janela mínima", () => {
    const sessions = [mkSession({ real_sales_qty: 500 })];
    const lots = { Geral: lot(10000, 30, 500) };
    const sol = solveForecast(sessions, cfg, lots, dateInDays(0));
    // daysToEvent=1, finalWindow=1 → proj ≈ vel*1.6*1 ≈ 26
    const proj = sol.qtyByKey["0-Geral"] - 500;
    expect(proj).toBeLessThan(40);
  });
});
