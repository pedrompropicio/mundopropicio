import { describe, it, expect } from "vitest";
import {
  effectiveQtyByPass,
  comboPassesToLotSales,
  comboPassesRevenue,
} from "../event-simulator-combo-bridge";
import { expandLotSalesToDailyAttendance } from "../event-simulator-combos";

const passes = [
  { id: "p1", name: "PASSE 3 DIAS", applies_to_days: 0 }, // 0 → todos os dias
  { id: "p2", name: "PASSE 2 DIAS", applies_to_days: 2 },
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
const links = [
  { combo_pass_id: "p1", zone_id: "zA" },
  { combo_pass_id: "p1", zone_id: "zB" },
  { combo_pass_id: "p2", zone_id: "zC" },
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

describe("combo bridge: comboPassesToLotSales", () => {
  it("expande passe para 1 LotSale por (passe × zona)", () => {
    const out = comboPassesToLotSales(passes, lots, [], links, zones, 3, "breakeven");
    // p1 → 2 zonas (VIP, Geral); p2 → 1 zona (Camping) → 3 LotSales
    expect(out).toHaveLength(3);
    expect(out.find((x) => x.zone_id === "zA")?.qty).toBe(100);
    expect(out.find((x) => x.zone_id === "zB")?.qty).toBe(100);
    expect(out.find((x) => x.zone_id === "zC")?.qty).toBe(80);
  });

  it("applies_to_days=0 cobre todos os dias do evento", () => {
    const totalDays = 4;
    const out = comboPassesToLotSales([passes[0]], [lots[0]], [], [links[0]], zones, totalDays, "breakeven");
    expect(out[0].applies_to_days).toBe(totalDays);
  });

  it("applies_to_days=N é capado a totalDays", () => {
    const out = comboPassesToLotSales(
      [{ id: "p", name: "X", applies_to_days: 5 }],
      [{ id: "lx", combo_pass_id: "p", quantity: 1, price: 1 }],
      [],
      [{ combo_pass_id: "p", zone_id: "zA" }],
      zones,
      3,
      "breakeven",
    );
    expect(out[0].applies_to_days).toBe(3);
  });

  it("ignora passes sem zonas ligadas ou sem qty", () => {
    const out = comboPassesToLotSales(
      passes,
      [{ id: "lx", combo_pass_id: "p1", quantity: 0, price: 50 }, lots[1]],
      [],
      links,
      zones,
      3,
      "breakeven",
    );
    expect(out.every((x) => x.combo_pass_id !== "p1")).toBe(true);
    expect(out.find((x) => x.zone_id === "zC")?.qty).toBe(80);
  });
});

describe("combo bridge: comboPassesRevenue", () => {
  it("BE/Forecast → qty planeada × price (1× por venda, sem multiplicar dias)", () => {
    const r = comboPassesRevenue(lots, [], "forecast");
    expect(r.qty).toBe(180);
    expect(r.revenue).toBe(100 * 50 + 80 * 40); // 5000 + 3200
  });

  it("Real → soma total_value (não multiplica por dia, mesmo passe 3 dias)", () => {
    const sales = [
      { combo_pass_lot_id: "l1", quantity: 2, unit_price: 50, total_value: 100 },
      { combo_pass_lot_id: "l1", quantity: 3, unit_price: 50, total_value: 150 },
    ];
    const r = comboPassesRevenue(lots, sales, "real");
    expect(r.qty).toBe(5);
    expect(r.revenue).toBe(250); // 1× por venda, sem ×3 dias
  });

  it("Real fallback usa unit_price quando total_value vazio", () => {
    const r = comboPassesRevenue(lots, [
      { combo_pass_lot_id: "l1", quantity: 4, unit_price: 50, total_value: null },
    ], "real");
    expect(r.revenue).toBe(200);
  });
});

describe("combo bridge: integração com expandLotSalesToDailyAttendance (presença N×)", () => {
  it("passe 3 dias × 2 zonas = 1 venda gera 6 presenças (3 dias × 2 zonas)", () => {
    const totalDays = 3;
    const passeUm = [{ id: "p1", name: "PASSE 3 DIAS", applies_to_days: 0 }];
    const lotUm = [{ id: "l1", combo_pass_id: "p1", quantity: 1, price: 100 }];
    const linksUm = [
      { combo_pass_id: "p1", zone_id: "zA" },
      { combo_pass_id: "p1", zone_id: "zB" },
    ];
    const synth = comboPassesToLotSales(passeUm, lotUm, [], linksUm, zones, totalDays, "breakeven");
    const grid = expandLotSalesToDailyAttendance(
      synth,
      [{ name: "VIP" }, { name: "Geral" }],
      totalDays,
      "",
      [{ date: "2026-06-01" }, { date: "2026-06-02" }, { date: "2026-06-03" }],
      new Map(),
    );
    const totalPaying = grid.reduce((acc, c) => acc + c.paying, 0);
    expect(totalPaying).toBe(6); // 1 venda × 3 dias × 2 zonas
  });

  it("passe N=2 num festival de 4 dias → presença só nos 2 primeiros dias", () => {
    const totalDays = 4;
    const passeDois = [{ id: "p2", name: "PASSE 2 DIAS", applies_to_days: 2 }];
    const lotDois = [{ id: "l2", combo_pass_id: "p2", quantity: 10, price: 40 }];
    const linksDois = [{ combo_pass_id: "p2", zone_id: "zC" }];
    const synth = comboPassesToLotSales(passeDois, lotDois, [], linksDois, zones, totalDays, "breakeven");
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
