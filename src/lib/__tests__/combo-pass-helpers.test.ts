import { describe, it, expect } from "vitest";
import {
  comboPassLotGrossRevenue,
  comboPassLotNetRevenue,
  comboCoveredDays,
  comboAttendanceMultiplier,
  calcZoneCapacityUsage,
} from "../combo-pass-helpers";

describe("comboPassLotGrossRevenue", () => {
  it("calcula bruto qty × price", () => {
    expect(comboPassLotGrossRevenue({ combo_pass_id: "x", quantity: 100, price: 50 })).toBe(5000);
  });
  it("trata strings", () => {
    expect(comboPassLotGrossRevenue({ combo_pass_id: "x", quantity: "10", price: "12.5" })).toBe(125);
  });
  it("zero quando vazio", () => {
    expect(comboPassLotGrossRevenue({ combo_pass_id: "x", quantity: 0, price: 0 })).toBe(0);
  });
});

describe("comboPassLotNetRevenue (IVA por dentro)", () => {
  it("IVA 6% sobre 100€ → ~94,34€", () => {
    expect(comboPassLotNetRevenue({ combo_pass_id: "x", quantity: 1, price: 100, iva_rate: 6 })).toBeCloseTo(94.339622, 4);
  });
  it("IVA 23% sobre 123€ → 100€", () => {
    expect(comboPassLotNetRevenue({ combo_pass_id: "x", quantity: 1, price: 123, iva_rate: 23 })).toBeCloseTo(100, 6);
  });
  it("default IVA 6% se não informado", () => {
    expect(comboPassLotNetRevenue({ combo_pass_id: "x", quantity: 1, price: 100 })).toBeCloseTo(94.339622, 4);
  });
});

describe("comboCoveredDays", () => {
  it("applies_to_days=0 → todos os dias", () => {
    expect(comboCoveredDays({ id: "c", applies_to_days: 0 }, 3)).toBe(3);
  });
  it("applies_to_days=null → todos os dias", () => {
    expect(comboCoveredDays({ id: "c", applies_to_days: null }, 5)).toBe(5);
  });
  it("applies_to_days=2 num festival de 3 dias → 2", () => {
    expect(comboCoveredDays({ id: "c", applies_to_days: 2 }, 3)).toBe(2);
  });
  it("applies_to_days > eventDaysCount → cap em eventDaysCount", () => {
    expect(comboCoveredDays({ id: "c", applies_to_days: 10 }, 3)).toBe(3);
  });
  it("combo undefined → todos os dias", () => {
    expect(comboCoveredDays(undefined, 4)).toBe(4);
  });
});

describe("comboAttendanceMultiplier", () => {
  it("multiplicador = nº de dias cobertos", () => {
    expect(comboAttendanceMultiplier({ id: "c", applies_to_days: 0 }, 3)).toBe(3);
    expect(comboAttendanceMultiplier({ id: "c", applies_to_days: 2 }, 3)).toBe(2);
  });
  it("nunca menor que 1", () => {
    expect(comboAttendanceMultiplier({ id: "c", applies_to_days: 0 }, 0)).toBe(1);
  });
});

describe("calcZoneCapacityUsage", () => {
  it("soma lotes simples + combo passes por zona", () => {
    const zones = [
      { id: "z1", total_capacity: 100 },
      { id: "z2", total_capacity: 50 },
    ];
    const simple = { z1: 30, z2: 20 };
    const passZones = [
      { combo_pass_id: "p1", zone_id: "z1" },
      { combo_pass_id: "p1", zone_id: "z2" },
      { combo_pass_id: "p2", zone_id: "z1" },
    ];
    const passLots = { p1: 25, p2: 10 };
    const usage = calcZoneCapacityUsage(zones, simple, passZones, passLots);
    expect(usage[0]).toEqual({ zoneId: "z1", used: 30 + 25 + 10, capacity: 100, exceeded: false });
    expect(usage[1]).toEqual({ zoneId: "z2", used: 20 + 25, capacity: 50, exceeded: false });
  });

  it("flagga excedente correctamente", () => {
    const usage = calcZoneCapacityUsage(
      [{ id: "z1", total_capacity: 10 }],
      { z1: 8 },
      [{ combo_pass_id: "p1", zone_id: "z1" }],
      { p1: 5 },
    );
    expect(usage[0].used).toBe(13);
    expect(usage[0].exceeded).toBe(true);
  });

  it("zona sem combo nem simples = 0", () => {
    const usage = calcZoneCapacityUsage(
      [{ id: "z1", total_capacity: 100 }],
      {},
      [],
      {},
    );
    expect(usage[0].used).toBe(0);
    expect(usage[0].exceeded).toBe(false);
  });
});

describe("E2E: festival 3 dias com 1 combo de 50 vendas", () => {
  it("receita conta 1x; presença = 50 × 3 dias = 150", () => {
    const lot = { combo_pass_id: "p1", quantity: 50, price: 80, iva_rate: 6 };
    const combo = { id: "p1", applies_to_days: 0 };
    const eventDays = 3;

    expect(comboPassLotGrossRevenue(lot)).toBe(4000); // receita única
    expect(comboPassLotNetRevenue(lot)).toBeCloseTo(3773.5849, 3);

    const presencaTotal = Number(lot.quantity) * comboAttendanceMultiplier(combo, eventDays);
    expect(presencaTotal).toBe(150);
  });
});
