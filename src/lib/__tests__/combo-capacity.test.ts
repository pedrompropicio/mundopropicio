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
  it("soma simples + combos por zona (multi-zona conta em CADA zona)", () => {
    const simple = [
      { id: "s1", zone_id: "zA", quantity: 30 },
      { id: "s2", zone_id: "zB", quantity: 200 },
    ];
    const combos = [
      { id: "c1", zone_ids: ["zA", "zB"] }, // passe que dá acesso a VIP+Geral
    ];
    const comboLots = [{ id: "cl1", combo_pass_id: "c1", quantity: 50 }];

    const a = computeZoneAllocations(zones, simple, combos, comboLots);
    const vip = a.find((x) => x.zone_id === "zA")!;
    const geral = a.find((x) => x.zone_id === "zB")!;
    expect(vip.used_simple).toBe(30);
    expect(vip.used_combo).toBe(50);
    expect(vip.used_total).toBe(80);
    expect(vip.exceeded).toBe(false);
    expect(geral.used_combo).toBe(50);
    expect(geral.used_total).toBe(250);
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
  const combos = [{ id: "c1", zone_ids: ["zA"] }];
  const comboLots = [{ id: "cl1", combo_pass_id: "c1", quantity: 60 }];

  it("aceita lote dentro da capacidade", () => {
    expect(
      validateSimpleLotAgainstCapacity("zA", 30, zones, [], combos, comboLots),
    ).toBeNull();
  });

  it("rejeita quando simples + combos > capacidade", () => {
    // VIP cap=100; combo já consome 60 → 60+50=110 > 100
    const err = validateSimpleLotAgainstCapacity("zA", 50, zones, [], combos, comboLots);
    expect(err).toContain("Capacidade excedida");
    expect(err).toContain("VIP");
  });

  it("excludeSimpleLotId permite editar lote sem contar a versão antiga", () => {
    const simple = [{ id: "s1", zone_id: "zA", quantity: 30 }];
    // sem exclude: 30 + 60 + 30 = 120 > 100
    expect(
      validateSimpleLotAgainstCapacity("zA", 30, zones, simple, combos, comboLots),
    ).toContain("excedida");
    // com exclude (estamos a editar s1 para 30): 60 + 30 = 90 ≤ 100
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
    { id: "c1", zone_ids: ["zA", "zB"] }, // passe multi-zona
    { id: "c2", zone_ids: ["zB"] },
  ];

  it("rejeita se UMA das zonas ligadas excede", () => {
    // VIP cap=100; já tem 90 simples → +20 combo passa para 110
    const simple = [{ id: "s", zone_id: "zA", quantity: 90 }];
    const err = validateComboLotAgainstCapacity("c1", 20, zones, simple, combos, []);
    expect(err).toContain("VIP");
  });

  it("aceita combo que cabe em todas as zonas ligadas", () => {
    expect(
      validateComboLotAgainstCapacity("c1", 5, zones, [], combos, []),
    ).toBeNull();
  });

  it("excludeComboLotId não conta a versão antiga", () => {
    const comboLots = [{ id: "cl1", combo_pass_id: "c1", quantity: 95 }];
    // sem exclude: 95 + 10 = 105 > 100 (VIP)
    expect(
      validateComboLotAgainstCapacity("c1", 10, zones, [], combos, comboLots),
    ).toContain("excedida");
    // editando cl1 para 10: novo total 10 ≤ 100
    expect(
      validateComboLotAgainstCapacity("c1", 10, zones, [], combos, comboLots, "cl1"),
    ).toBeNull();
  });

  it("passe sem zonas ligadas → sem validação", () => {
    const empty = [{ id: "cX", zone_ids: [] as string[] }];
    expect(
      validateComboLotAgainstCapacity("cX", 999, zones, [], empty, []),
    ).toBeNull();
  });
});
