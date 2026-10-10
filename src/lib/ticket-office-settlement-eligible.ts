// Regra de elegibilidade de uma transação como dedução do fecho de bilheteira.
// Função pura (testável); a deduplicação por id fica no chamador.
export function isSettlementEligibleTxn(
  t: any,
  officeId: string,
  existingSettlement: any | null | undefined,
  advanceTxnIds: Set<string>,
): boolean {
  // #272: a perna de despesa da transferência do fecho (create_settlement_transfer)
  // NUNCA é dedução — tem settlement_id deste fecho e está paga pela bilheteira,
  // mas já é o próprio líquido. Excluída antes da excepção "já ligada ao fecho".
  if (existingSettlement?.transfer_transaction_id && t.id === existingSettlement.transfer_transaction_id) return false;
  // Transferência interna 10.3 nunca é dedução de fecho — é movimento
  // entre contas da casa, não custo do evento (ex.: bilheteira local
  // retida pela sala, D-ERP236). Excluída antes da excepção "já ligada".
  if (t.exclude_from_result === true) return false;
  if (typeof t.operation_key === "string" && t.operation_key.startsWith("TRF-FECHO-")) return false;
  // Always keep transactions already linked to this settlement (when editing).
  // This is the ONLY exception to the advance exclusion above.
  if (existingSettlement && t.settlement_id === existingSettlement.id) return true;
  if (advanceTxnIds.has(t.id)) return false;
  // Eligible: pending/approved (to be liquidated by the settlement) OR
  // already paid by this very box-office account (e.g. registered via "Nova despesa liquidada").
  if (t.status === "pending" || t.status === "approved") return true;
  if (t.status === "paid" && t.account_id === officeId) return true;
  return false;
}
