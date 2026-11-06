import { describe, it, expect } from "vitest";
import { diagnoseSettlementLiquidity, type SettlementLiquidityInput } from "@/lib/settlement-liquidity";
import { partnerDisbursement, partnerFinancingToReturn, partnerAdvancedTotal, partnerTransferIvaBase } from "@/lib/partner-disbursement";
import { roundCents, calcIvaAmount } from "@/lib/iva";
const fixture = (patch: Partial<SettlementLiquidityInput> = {}): SettlementLiquidityInput => ({
  settlementId: "root", participantId: "A", perimeter: { id: "root/city", unambiguous: true, reason: null },
  result: 400, effectivePct: 30, shareBase: 120, shareFinal: 120, totalTransitoryCredit: 60, ownTransitoryCredit: 60,
  paidByTx: 80, paidByBp: 30, adjustment: -10, revenuesHeld: 40, advanced: 20, g5TransferBase: 160, ...patch,
});
describe("#415 account g5 versus liquidity Q4-A", () => {
  it("C4 §6.6: canonical g5 160/IVA39.10/199.10 remains obligation; diagnostic balance 240 explained", () => {
    const i = fixture();
    const disbursement = partnerDisbursement(i.paidByTx, i.paidByBp);
    const financing = partnerFinancingToReturn(disbursement, i.adjustment, i.revenuesHeld);
    const base = roundCents(i.shareFinal + financing - partnerAdvancedTotal(i.advanced));
    const vat = calcIvaAmount(partnerTransferIvaBase(base, 10), 23);
    expect([disbursement, financing, base, vat, roundCents(base + vat)]).toEqual([110, 60, 160, 39.1, 199.1]);
    const copy = structuredClone(i);
    const result = diagnoseSettlementLiquidity(i);
    expect(result.obligation).toBe(160);
    expect(result.pools).toEqual({ pending: 60, offset: 0, contribution: 0 });
    expect(result.participant).toMatchObject({ resultPending: 18, resultRepasseNow: 102, operational: 162, balanceWithDeposits: 240 });
    expect(result.bridge).toMatchObject({ difference: 80, explained: 80, rest: 0, terms: { bpOmittedByLegacy: -30, adjustmentOmittedByLegacy: 10, heldRevenueOmittedByLegacy: 40, ownTransitoryCredit: 60 } });
    expect(i).toEqual(copy);
  });
  it("C4 §6.6: loss contribution is diagnostic 96, obligation -120 and bridge 84", () => {
    const result = diagnoseSettlementLiquidity(fixture({ result: -300, effectivePct: 40, shareBase: -120, shareFinal: -120, paidByTx: 0, paidByBp: 0, adjustment: 0, revenuesHeld: 0, advanced: 0, g5TransferBase: -120 }));
    expect(result.pools).toEqual({ pending: 0, offset: 60, contribution: 240 });
    expect(result.participant).toMatchObject({ transitoryOffset: 24, equityContribution: 96, resultRepasseNow: -96, balanceWithDeposits: -36 });
    expect(result.bridge).toMatchObject({ difference: 84, explained: 84, rest: 0 });
    expect(result.obligation).toBe(-120);
  });
  it("C4: relief and sign change expose a bridge without creating a collection rule", () => {
    const result = diagnoseSettlementLiquidity(fixture({ result: -50, effectivePct: 40, shareBase: -20, shareFinal: 15, totalTransitoryCredit: 0, ownTransitoryCredit: 0, paidByTx: 0, paidByBp: 0, adjustment: 0, revenuesHeld: 0, advanced: 0, g5TransferBase: 15 }));
    expect(result.obligation).toBe(15);
    expect(result.participant?.equityContribution).toBe(20);
    expect(result.bridge).toMatchObject({ difference: -35, rest: 0, terms: { overheadAdjustment: -35 } });
  });
  it("C4: legacy loss pool retains its formula even when supplied base part differs from pool percentage", () => {
    const result = diagnoseSettlementLiquidity(fixture({ result: -300, effectivePct: 40, shareBase: -110, shareFinal: -110, paidByTx: 0, paidByBp: 0, adjustment: 0, revenuesHeld: 0, advanced: 0, g5TransferBase: -110 }));
    expect(result.participant?.resultRepasseNow).toBe(-96);
    expect(result.bridge).toMatchObject({ difference: 74, rest: 0, terms: { legacyShareDifference: -10 } });
    expect(result.obligation).toBe(-110);
  });
  it("C4: attributed return extinguishes credit/pools only; return to house cannot consume another owner's credit", () => {
    const settled = diagnoseSettlementLiquidity(fixture({ totalTransitoryCredit: 0, ownTransitoryCredit: 0 }));
    expect(settled.obligation).toBe(160);
    expect(settled.pools?.pending).toBe(0);
    const houseReturn = diagnoseSettlementLiquidity(fixture()); // source adapter supplies A's unchanged credit
    expect(houseReturn.participant?.resultPending).toBe(18);
    expect(houseReturn.obligation).toBe(160);
  });
  it("C4: ambiguous perimeter disables only liquidity; valid g5 remains available", () => {
    const result = diagnoseSettlementLiquidity(fixture({ perimeter: { id: "mixed-nodes", unambiguous: false, reason: "Deposit owner/perimeter unknown" } }));
    expect(result).toMatchObject({ state: "unavailable", obligation: 160, pools: null, participant: null, bridge: null, reason: "Deposit owner/perimeter unknown" });
  });
  it("C4: g5 mismatch and rounding remain visible; invalid amounts never become zero", () => {
    expect(diagnoseSettlementLiquidity(fixture({ g5TransferBase: 159.99 })).bridge?.rest).toBe(0.01);
    expect(() => diagnoseSettlementLiquidity(fixture({ ownTransitoryCredit: 61 }))).toThrow();
    expect(() => diagnoseSettlementLiquidity(fixture({ g5TransferBase: NaN }))).toThrow();
    expect(() => diagnoseSettlementLiquidity(fixture({ effectivePct: 101 }))).toThrow();
  });
});
