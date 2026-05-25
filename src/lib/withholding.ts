/**
 * Helpers para retenção IRS declarada.
 *
 * Regra (memória `tax-withholding`):
 *  - `transactions.paid_amount` continua em bruto (compromisso 100% para BP/DRE).
 *  - O fornecedor recebe = bruto − retenção declarada.
 *  - O caixa real debitado = bruto − retenção − créditos.
 *  - Só aplica em transações SEM parcelas (transação com linhas em
 *    `transaction_payments` é tratada parcela-a-parcela).
 */

export function getDeclaredWithholding(t: any): number {
  const w = Number(t?.declared_withholding_amount ?? 0);
  return Number.isFinite(w) && w > 0 ? w : 0;
}

export interface NetPayable {
  gross: number;
  withholding: number;
  net: number;
  applied: boolean;
}

export function computeNetPayable(opts: {
  grossWithIva: number;
  declaredWithholding: number;
  hasInstallments: boolean;
}): NetPayable {
  const { grossWithIva, declaredWithholding, hasInstallments } = opts;
  const gross = Math.max(0, Number(grossWithIva) || 0);
  if (hasInstallments || declaredWithholding <= 0 || gross <= 0) {
    return { gross, withholding: 0, net: gross, applied: false };
  }
  const w = Math.min(declaredWithholding, gross);
  return {
    gross,
    withholding: +w.toFixed(2),
    net: +Math.max(0, gross - w).toFixed(2),
    applied: w > 0,
  };
}
