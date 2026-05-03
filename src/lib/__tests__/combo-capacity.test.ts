import { describe, it, expect } from "vitest";
import {
  computeZoneAllocations,
  validateSimpleLotAgainstCapacity,
  validateComboLotAgainstCapacity,
} from "../combo-capacity";

const zones = [
  { id: "zA", name: "VIP", total_capacity: 100 },
  { id: "zB", name: "Geral", total_capacity: 500 },
  { id: "zC", name: "Sem limite", total_capacity: 0 },
];

describe("combo-capacity: computeZoneAllocations", () => {
  it("soma simples + combos por zona (combo é mono-zona)", () => {
    const simple = [
      { id: "s1", zone_id: "zA", quantity: 30 },
      { id: "s2", zone_id: "zB", quantity: 200 },
    ];
    const combos = [{ id: "c1", zone_id: "zA" }];
    const comboLots = [{ id: "cl1", combo_pass_id: "c1", quantity: 50 }];

    const a = computeZoneAllocations(zones, simple, combos, comboLots);
    const vip = a.find((x) => x.zone_id === "zA")!;
    const geral = a.find((x) => x.zone_id === "zB")!;
    expect(vip.used_simple).toBe(30);
    expect(vip.used_combo).toBe(50);
    expect(vip.used_total).toBe(80);
    expect(vip.exceeded).toBe(false);
    // combo só conta na sua zona
    expect(geral.used_combo).toBe(0);
    expect(geral.used_total).toBe(200);
  });

  it("capacity=0 nunca está excedida", () => {
    const a = computeZoneAllocations(
      zones,
      [{ id: "s", zone_id: "zC", quantity: 99999 }],
      [],
      [],
    );
    expect(a.find((x) => x.zone_id === "zC")!.exceeded).toBe(false);
  });
});

describe("combo-capacity: validateSimpleLotAgainstCapacity", () => {
  const combos = [{ id: "c1", zone_id: "zA" }];
  const comboLots = [{ id: "cl1", combo_pass_id: "c1", quantity: 60 }];

  it("aceita lote dentro da capacidade", () => {
    expect(
      validateSimpleLotAgainstCapacity("zA", 30, zones, [], combos, comboLots),
    ).toBeNull();
  });

  it("rejeita quando simples + combos > capacidade", () => {
    const err = validateSimpleLotAgainstCapacity("zA", 50, zones, [], combos, comboLots);
    expect(err).toContain("Capacidade excedida");
    expect(err).toContain("VIP");
  });

  it("excludeSimpleLotId permite editar lote sem contar a versão antiga", () => {
    const simple = [{ id: "s1", zone_id: "zA", quantity: 30 }];
    expect(
      validateSimpleLotAgainstCapacity("zA", 30, zones, simple, combos, comboLots),
    ).toContain("excedida");
    expect(
      validateSimpleLotAgainstCapacity("zA", 30, zones, simple, combos, comboLots, "s1"),
    ).toBeNull();
  });

  it("capacity=0 → sem validação", () => {
    expect(
      validateSimpleLotAgainstCapacity("zC", 99999, zones, [], [], []),
    ).toBeNull();
  });
});

describe("combo-capacity: validateComboLotAgainstCapacity", () => {
  const combos = [
    { id: "c1", zone_id: "zA" },
    { id: "c2", zone_id: "zB" },
  ];

  it("rejeita se a zona do passe excede", () => {
    const simple = [{ id: "s", zone_id: "zA", quantity: 90 }];
    const err = validateComboLotAgainstCapacity("c1", 20, zones, simple, combos, []);
    expect(err).toContain("VIP");
  });

  it("aceita combo que cabe na zona", () => {
    expect(
      validateComboLotAgainstCapacity("c1", 5, zones, [], combos, []),
    ).toBeNull();
  });

  it("excludeComboLotId não conta a versão antiga", () => {
    const comboLots = [{ id: "cl1", combo_pass_id: "c1", quantity: 95 }];
    expect(
      validateComboLotAgainstCapacity("c1", 10, zones, [], combos, comboLots),
    ).toContain("excedida");
    expect(
      validateComboLotAgainstCapacity("c1", 10, zones, [], combos, comboLots, "cl1"),
    ).toBeNull();
  });

  it("passe sem zona ligada → sem validação", () => {
    const empty = [{ id: "cX", zone_id: null }];
    expect(
      validateComboLotAgainstCapacity("cX", 999, zones, [], empty, []),
    ).toBeNull();
  });
});
