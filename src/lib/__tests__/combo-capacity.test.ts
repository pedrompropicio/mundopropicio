import { describe, it, expect } from "vitest";
import {
  computeZoneAllocations,
  validateLotAgainstCapacity,
  type CapLot,
  type CapZone,
} from "../combo-capacity";

const zones: CapZone[] = [
  { id: "zRelSab", name: "Relvado — Sábado", total_capacity: 1000 },
  { id: "zRelDom", name: "Relvado — Domingo", total_capacity: 1000 },
  { id: "zVip", name: "VIP", total_capacity: 100 },
  { id: "zSemLim", name: "Sem limite", total_capacity: 0 },
];

describe("combo-capacity: computeZoneAllocations (modelo unificado)", () => {
  it("lote simples só conta na sua zona", () => {
    const lots: CapLot[] = [
      { id: "l1", zone_id: "zRelSab", quantity: 300 },
      { id: "l2", zone_id: "zRelDom", quantity: 200 },
    ];
    const a = computeZoneAllocations(zones, lots);
    expect(a.find((x) => x.zone_id === "zRelSab")!.used_simple).toBe(300);
    expect(a.find((x) => x.zone_id === "zRelDom")!.used_simple).toBe(200);
    expect(a.find((x) => x.zone_id === "zVip")!.used_total).toBe(0);
  });

  it("lote combo abate em CADA zona em consumes_zone_ids", () => {
    const lots: CapLot[] = [
      { id: "lc", zone_id: "zRelSab", quantity: 50, is_combo: true,
        consumes_zone_ids: ["zRelSab", "zRelDom"] },
    ];
    const a = computeZoneAllocations(zones, lots);
    expect(a.find((x) => x.zone_id === "zRelSab")!.used_combo).toBe(50);
    expect(a.find((x) => x.zone_id === "zRelDom")!.used_combo).toBe(50);
    expect(a.find((x) => x.zone_id === "zVip")!.used_combo).toBe(0);
  });

  it("simples + combo somam na mesma zona-dia", () => {
    const lots: CapLot[] = [
      { id: "l1", zone_id: "zRelSab", quantity: 700 },
      { id: "lc", zone_id: "zRelSab", quantity: 200, is_combo: true,
        consumes_zone_ids: ["zRelSab", "zRelDom"] },
    ];
    const a = computeZoneAllocations(zones, lots);
    const sab = a.find((x) => x.zone_id === "zRelSab")!;
    expect(sab.used_simple).toBe(700);
    expect(sab.used_combo).toBe(200);
    expect(sab.used_total).toBe(900);
    expect(sab.exceeded).toBe(false);
  });

  it("capacity=0 nunca está excedida", () => {
    const a = computeZoneAllocations(zones, [
      { id: "l", zone_id: "zSemLim", quantity: 99999 },
    ]);
    expect(a.find((x) => x.zone_id === "zSemLim")!.exceeded).toBe(false);
  });

  it("combo sem consumes_zone_ids cai na zona âncora", () => {
    const lots: CapLot[] = [
      { id: "lc", zone_id: "zVip", quantity: 10, is_combo: true, consumes_zone_ids: [] },
    ];
    const a = computeZoneAllocations(zones, lots);
    expect(a.find((x) => x.zone_id === "zVip")!.used_combo).toBe(10);
  });
});

describe("combo-capacity: validateLotAgainstCapacity", () => {
  it("aceita lote simples dentro da capacidade", () => {
    expect(
      validateLotAgainstCapacity(
        { zone_id: "zRelSab", quantity: 500 },
        zones,
        [{ id: "l", zone_id: "zRelSab", quantity: 400 }],
      ),
    ).toBeNull();
  });

  it("rejeita combo que estoura capacidade na 2ª zona consumida", () => {
    const others: CapLot[] = [
      { id: "l", zone_id: "zRelDom", quantity: 950 },
    ];
    const err = validateLotAgainstCapacity(
      { zone_id: "zRelSab", quantity: 100, is_combo: true,
        consumes_zone_ids: ["zRelSab", "zRelDom"] },
      zones,
      others,
    );
    expect(err).toContain("Domingo");
  });

  it("excludeLotId permite editar lote sem contar a versão antiga", () => {
    const others: CapLot[] = [
      { id: "lc", zone_id: "zRelSab", quantity: 950, is_combo: true,
        consumes_zone_ids: ["zRelSab", "zRelDom"] },
    ];
    expect(
      validateLotAgainstCapacity(
        { zone_id: "zRelSab", quantity: 200, is_combo: true,
          consumes_zone_ids: ["zRelSab", "zRelDom"] },
        zones,
        others,
      ),
    ).toContain("excedida");
    expect(
      validateLotAgainstCapacity(
        { zone_id: "zRelSab", quantity: 200, is_combo: true,
          consumes_zone_ids: ["zRelSab", "zRelDom"] },
        zones,
        others,
        "lc",
      ),
    ).toBeNull();
  });

  it("zona com capacity=0 nunca rejeita", () => {
    expect(
      validateLotAgainstCapacity(
        { zone_id: "zSemLim", quantity: 999999 },
        zones,
        [],
      ),
    ).toBeNull();
  });
});
