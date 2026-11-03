/** #415 Q4-A: liquidity is diagnostic. The caller supplies the existing canonical g5 obligation. */
import { roundCents } from "./iva.ts";

export interface SettlementLiquidityInput {
  settlementId: string;
  participantId: string;
  perimeter: { id: string; unambiguous: boolean; reason: string | null };
  result: number;
  effectivePct: number;
  shareBase: number;
  shareFinal: number;
  totalTransitoryCredit: number;
  ownTransitoryCredit: number;
  /** Legacy operational pool uses TX only; g5 also includes BP, adjustments and held revenue. */
  paidByTx: number;
  paidByBp: number;
  adjustment: number;
  revenuesHeld: number;
  advanced: number;
  g5TransferBase: number;
}
export function diagnoseSettlementLiquidity(i: SettlementLiquidityInput) {
  for (const [key, value] of Object.entries(i)) if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Invalid liquidity ${key}`);
  if (i.effectivePct < 0 || i.effectivePct > 100 || i.totalTransitoryCredit < 0 || i.ownTransitoryCredit < 0 || i.ownTransitoryCredit > i.totalTransitoryCredit) throw new Error("Invalid liquidity perimeter/credit");
  const obligation = roundCents(i.g5TransferBase);
  const common = { settlementId: i.settlementId, participantId: i.participantId, perimeter: { ...i.perimeter }, obligation };
  if (!i.perimeter.unambiguous) return { ...common, state: "unavailable" as const,
    reason: i.perimeter.reason ?? "Unattributed liquidity perimeter", pools: null, participant: null, bridge: null };
  const ratio = i.effectivePct / 100;
  const pending = Math.min(i.totalTransitoryCredit, Math.max(i.result, 0));
  const offset = Math.min(i.totalTransitoryCredit, Math.max(-i.result, 0));
  const contribution = Math.max(0, Math.max(-i.result, 0) - i.totalTransitoryCredit);
  const resultPending = roundCents(pending * ratio);
  const transitoryOffset = roundCents(offset * ratio);
  const equityContribution = roundCents(contribution * ratio);
  const legacyShare = i.result < 0 ? roundCents(i.result * ratio) : roundCents(i.shareBase);
  const resultRepasseNow = i.result >= 0 ? roundCents(i.shareBase - resultPending) : -equityContribution;
  const operational = roundCents(resultRepasseNow + roundCents(i.paidByTx) - roundCents(i.advanced));
  const balanceWithDeposits = roundCents(operational + resultPending + roundCents(i.ownTransitoryCredit));
  // Every term has an explicit sign. Relief affects g5, never the legacy percentage pool.
  const terms = {
    overheadAdjustment: roundCents(i.shareBase - i.shareFinal),
    legacyShareDifference: roundCents(legacyShare - i.shareBase),
    transitoryOffset,
    bpOmittedByLegacy: -roundCents(i.paidByBp),
    adjustmentOmittedByLegacy: -roundCents(i.adjustment),
    heldRevenueOmittedByLegacy: roundCents(i.revenuesHeld),
    ownTransitoryCredit: roundCents(i.ownTransitoryCredit),
  };
  const explained = roundCents(Object.values(terms).reduce((s, n) => s + n, 0));
  const difference = roundCents(balanceWithDeposits - obligation);
  return { ...common, state: "available" as const, reason: null,
    pools: { pending: roundCents(pending), offset: roundCents(offset), contribution: roundCents(contribution) },
    participant: { resultPending, transitoryOffset, equityContribution, resultRepasseNow, operational, balanceWithDeposits },
    bridge: { terms, difference, explained, rest: roundCents(difference - explained) } };
}
