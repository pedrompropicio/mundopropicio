import { describe, it, expect } from "vitest";
import {
  effectiveQtyByPass,
  comboPassesToLotSales,
  comboPassesRevenue,
} from "../event-simulator-combo-bridge";
import { expandLotSalesToDailyAttendance } from "../event-simulator-combos";

const passes = [
  { id: "p1", name: "PASSE 3 DIAS", zone_id: "zA", applies_to_days: 0 },
  { id: "p2", name: "PASSE 2 DIAS", zone_id: "zC", applies_to_days: 2 },
];
const lots = [
  { id: "l1", combo_pass_id: "p1", quantity: 100, price: 50 },
  { id: "l2", combo_pass_id: "p2", quantity: 80, price: 40 },
];
const zones = [
  { id: "zA", name: "VIP" },
  { id: "zB", name: "Geral" },
  { id: "zC", name: "Camping" },
];

describe("combo bridge: effectiveQtyByPass", () => {
  it("BE/Forecast → soma quantity dos lotes planeados", () => {
    const out = effectiveQtyByPass(passes, lots, [], "breakeven");
    expect(out.get("p1")).toBe(100);
    expect(out.get("p2")).toBe(80);
  });
  it("Real → soma ticket_sales por combo_pass_lot_id", () => {
    const sales = [
      { combo_pass_lot_id: "l1", quantity: 10, unit_price: 50, total_value: 500 },
      { combo_pass_lot_id: "l1", quantity: 5, unit_price: 50, total_value: 250 },
      { combo_pass_lot_id: "l2", quantity: 3, unit_price: 40, total_value: 120 },
    ];
    const out = effectiveQtyByPass(passes, lots, sales, "real");
    expect(out.get("p1")).toBe(15);
    expect(out.get("p2")).toBe(3);
  });
});

describe("combo bridge: comboPassesToLotSales (mono-zona)", () => {
  it("expande passe para 1 LotSale por passe (mono-zona)", () => {
    const out = comboPassesToLotSales(passes, lots, [], zones, 3, "breakeven");
    expect(out).toHaveLength(2);
    expect(out.find((x) => x.zone_id === "zA")?.qty).toBe(100);
    expect(out.find((x) => x.zone_id === "zC")?.qty).toBe(80);
    expect(out.find((x) => x.zone_id === "zB")).toBeUndefined();
  });

  it("applies_to_days=0 cobre todos os dias do evento", () => {
    const totalDays = 4;
    const out = comboPassesToLotSales([passes[0]], [lots[0]], [], zones, totalDays, "breakeven");
    expect(out[0].applies_to_days).toBe(totalDays);
  });

  it("applies_to_days=N é capado a totalDays", () => {
    const out = comboPassesToLotSales(
      [{ id: "p", name: "X", zone_id: "zA", applies_to_days: 5 }],
      [{ id: "lx", combo_pass_id: "p", quantity: 1, price: 1 }],
      [],
      zones,
      3,
      "breakeven",
    );
    expect(out[0].applies_to_days).toBe(3);
  });

  it("ignora passes sem zona ligada ou sem qty", () => {
    const out = comboPassesToLotSales(
      [{ id: "p1", name: "PASSE 3 DIAS", zone_id: "zA", applies_to_days: 0 }, passes[1]],
      [{ id: "lx", combo_pass_id: "p1", quantity: 0, price: 50 }, lots[1]],
      [],
      zones,
      3,
      "breakeven",
    );
    expect(out.find((x) => x.lot_id === "combo-p1")).toBeUndefined();
    expect(out.find((x) => x.zone_id === "zC")?.qty).toBe(80);
  });
});

describe("combo bridge: comboPassesRevenue", () => {
  it("BE/Forecast → qty planeada × price (1× por venda, sem multiplicar dias)", () => {
    const r = comboPassesRevenue(lots, [], "forecast");
    expect(r.qty).toBe(180);
    expect(r.revenue).toBe(100 * 50 + 80 * 40);
  });

  it("Real → soma total_value (não multiplica por dia)", () => {
    const sales = [
      { combo_pass_lot_id: "l1", quantity: 2, unit_price: 50, total_value: 100 },
      { combo_pass_lot_id: "l1", quantity: 3, unit_price: 50, total_value: 150 },
    ];
    const r = comboPassesRevenue(lots, sales, "real");
    expect(r.qty).toBe(5);
    expect(r.revenue).toBe(250);
  });

  it("Real fallback usa unit_price quando total_value vazio", () => {
    const r = comboPassesRevenue(lots, [
      { combo_pass_lot_id: "l1", quantity: 4, unit_price: 50, total_value: null },
    ], "real");
    expect(r.revenue).toBe(200);
  });
});

describe("combo bridge: integração com expandLotSalesToDailyAttendance (mono-zona)", () => {
  it("passe 3 dias × 1 zona = 1 venda gera 3 presenças", () => {
    const totalDays = 3;
    const passeUm = [{ id: "p1", name: "PASSE 3 DIAS", zone_id: "zA", applies_to_days: 0 }];
    const lotUm = [{ id: "l1", combo_pass_id: "p1", quantity: 1, price: 100 }];
    const synth = comboPassesToLotSales(passeUm, lotUm, [], zones, totalDays, "breakeven");
    const grid = expandLotSalesToDailyAttendance(
      synth,
      [{ name: "VIP" }],
      totalDays,
      "",
      [{ date: "2026-06-01" }, { date: "2026-06-02" }, { date: "2026-06-03" }],
      new Map(),
    );
    const totalPaying = grid.reduce((acc, c) => acc + c.paying, 0);
    expect(totalPaying).toBe(3);
  });

  it("passe N=2 num festival de 4 dias → presença só nos 2 primeiros dias", () => {
    const totalDays = 4;
    const passeDois = [{ id: "p2", name: "PASSE 2 DIAS", zone_id: "zC", applies_to_days: 2 }];
    const lotDois = [{ id: "l2", combo_pass_id: "p2", quantity: 10, price: 40 }];
    const synth = comboPassesToLotSales(passeDois, lotDois, [], zones, totalDays, "breakeven");
    const grid = expandLotSalesToDailyAttendance(
      synth,
      [{ name: "Camping" }],
      totalDays,
      "",
      [{ date: "1" }, { date: "2" }, { date: "3" }, { date: "4" }],
      new Map(),
    );
    const byDay: Record<number, number> = {};
    for (const c of grid) byDay[c.day_index] = (byDay[c.day_index] ?? 0) + c.paying;
    expect(byDay[0]).toBe(10);
    expect(byDay[1]).toBe(10);
    expect(byDay[2] ?? 0).toBe(0);
    expect(byDay[3] ?? 0).toBe(0);
  });
});
