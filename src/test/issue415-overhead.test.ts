import { describe, it, expect } from "vitest";
import { applySettlementOverhead, type OverheadParticipantInput, type SettlementResidualBase } from "@/lib/settlement-contract";
const part = (id: string, shareBase: number, shareWithout: number, patch: Partial<OverheadParticipantInput> = {}): OverheadParticipantInput => ({
  id, settlementId: "root", kind: "partner", mode: "settles", supportsOverhead: id !== "A", includeOverhead: true, basis: "net_result", shareBase,
  withoutOverhead: { share: shareWithout, sourceLineIds: ["OH-source"] }, ...patch,
});
const terms = (declaredBase: number, patch: Partial<SettlementResidualBase> = {}): SettlementResidualBase => ({ declaredBase, ivaDeductibleBase: 0, nominalGapBase: 0, houseOnlyRevenue: 0, otherBase: 0, ...patch });
const check = (result: ReturnType<typeof applySettlementOverhead>, shares: number[], residual: number, absorbed: number) => {
  expect(result.participants.map((p) => p.shareFinal)).toEqual(shares);
  expect(result.houseResidualFinal).toBe(residual);
  expect(result.overheadAbsorbedByHouse).toBe(absorbed);
  expect([result.c1, result.c2]).toEqual([0, 0]);
};
describe("#415 overhead: precomputed contractual/counterfactual parts (§6.1–6.5)", () => {
  it("C4 §6.1: profit, all-support baseline and individual relief", () => {
    const participants = [part("A", 120, 150), part("B", 80, 100), part("H", 200, 250, { kind: "house" })];
    const before = structuredClone(participants);
    check(applySettlementOverhead({ eventNetResult: 400, residualBase: terms(200), participants }), [150, 80, 200], 170, -30);
    check(applySettlementOverhead({ eventNetResult: 400, residualBase: terms(200), participants: participants.map((p) => ({ ...p, supportsOverhead: true })) }), [120, 80, 200], 200, 0);
    expect(participants).toEqual(before);
  });
  it("C4 §6.2: loss and sign change use supplied counterfactual part, not pct times overhead", () => {
    check(applySettlementOverhead({ eventNetResult: -300, residualBase: terms(-150), participants: [part("A", -120, -80), part("B", -30, -20), part("H", -150, -100, { kind: "house" })] }), [-80, -30, -150], -190, -40);
    check(applySettlementOverhead({ eventNetResult: -50, residualBase: terms(-25), participants: [part("A", -20, 15), part("B", -5, 10), part("H", -25, 25, { kind: "house" })] }), [15, -5, -25], -60, -35);
  });
  it.each([
    [600, 254, 173, 173], [560, 254, 153, 153], [550, 254, 148, 148],
  ])("C4 §6.3: mixed bases, returned VAT and distinct source projected parts (%s)", (anchor, a, b, house) => {
    // Parts are fixtures from the approved plan, not a replica of the reserved engine.
    check(applySettlementOverhead({ eventNetResult: anchor, residualBase: terms(house), participants: [
      part("A", a, a, { supportsOverhead: true, basis: "net_result_gross_expenses" }),
      part("Hnom", 254, 254, { kind: "house", mode: "nominal" }),
      part("B", b, b, { settlementId: "child" }), part("H", house, house, { kind: "house", settlementId: "child" }),
    ] }), [a, 254, b, house], house, 0);
  });
  it("C4 §6.4: inherited overhead in quota; nominal gap BASE retained, with no double relief", () => {
    const participants = [part("A", 200, 250, { supportsOverhead: true }),
      part("BN", 80, 100, { mode: "nominal" }), part("HN", 120, 150, { kind: "house", mode: "nominal" }),
      part("B", 40, 50, { settlementId: "child", supportsOverhead: false, withoutOverhead: { share: 50, sourceLineIds: ["ancestor/OH"] } }),
      // Explicit zero-percent house is a second settles in the same node; it adds no declared share.
      part("H0", 0, 0, { settlementId: "child", kind: "house" }), part("H", 120, 150, { settlementId: "house-child", kind: "house" })];
    const result = applySettlementOverhead({ eventNetResult: 400, residualBase: terms(120, { nominalGapBase: 40 }), participants });
    check(result, [200, 80, 120, 50, 0, 120], 150, -10);
    expect(result.participants[3].sourceLineIds).toEqual(["ancestor/OH"]);
    const duplicateGap = applySettlementOverhead({ eventNetResult: 400, residualBase: terms(120, { nominalGapBase: 30 }), participants });
    expect(duplicateGap.c2).toBe(10); // Never hide double adjustment in O.
  });
  it.each([0, 50])("C4 §6.5: gross overhead relief includes VAT once, house-only revenue %s stays in residual", (houseOnly) => {
    const participants = [part("A", 78.6, 115.5, { basis: "net_result_gross_expenses" }), part("B", 52.4, 77, { basis: "net_result_gross_expenses" }), part("H", 131, 192.5, { kind: "house", basis: "net_result_gross_expenses" })];
    const result = applySettlementOverhead({ eventNetResult: 400 + houseOnly, residualBase: terms(131, { ivaDeductibleBase: 138, houseOnlyRevenue: houseOnly }), participants });
    check(result, [115.5, 52.4, 131], 232.1 + houseOnly, -36.9);
    expect(result.residualBase.ivaDeductibleBase).toBe(138);
  });
  it("C4: overhead disabled, gross revenue and nominal never get relief", () => {
    for (const patch of [{ includeOverhead: false }, { basis: "gross_revenue" as const }, { mode: "nominal" as const }]) {
      const result = applySettlementOverhead({ eventNetResult: 400, residualBase: terms(280), participants: [part("A", 120, 500, patch)] });
      expect(result.participants[0].overheadRelief).toBe(0);
      expect(result.overheadAbsorbedByHouse).toBe(0);
    }
  });
  it("C4: signed negative relief remains signed, without cap or abs", () => {
    check(applySettlementOverhead({ eventNetResult: 100, residualBase: terms(50), participants: [part("A", 50, 40), part("H", 50, 50, { kind: "house" })] }), [40, 50], 60, 10);
  });
  it("C4: incomplete counterfactual, duplicate lineage/participant, house exemption and lone settles rejected", () => {
    const run = (participants: OverheadParticipantInput[]) => applySettlementOverhead({ eventNetResult: 100, residualBase: terms(50), participants });
    const a = part("A", 50, 60), h = part("H", 50, 50, { kind: "house" });
    expect(() => run([{ ...a, withoutOverhead: null }, h])).toThrow(/counterfactual/);
    expect(() => run([{ ...a, withoutOverhead: { share: 60, sourceLineIds: ["OH", "OH"] } }, h])).toThrow(/lineage/);
    expect(() => run([{ ...a, withoutOverhead: { share: 60, sourceLineIds: [] } }, h])).toThrow(/provenance/);
    expect(() => run([a, a, h])).toThrow(/Duplicate/);
    expect(() => run([a])).toThrow(/two settles/);
    expect(() => run([{ ...h, supportsOverhead: false }])).toThrow(/House/);
    expect(() => run([{ ...a, shareBase: NaN }, h])).toThrow(/Nonfinite/);
  });
});
