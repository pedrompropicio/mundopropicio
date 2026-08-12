/**
 * Resolução ÚNICA dos dados bancários de uma transação para pagamento.
 *
 * É a MESMA resolução usada pela geração do ficheiro SEPA Santander
 * (`sepaCandidates` em PaymentListsTab) e pelo gate de elegibilidade dos
 * pickers de Listas de Pagamento — zero divergência entre o que entra na lista
 * e o que o ficheiro consegue gerar.
 *
 * Ordem: `transactions.iban_override` → `suppliers.iban` → `iban_2` → `iban_3`.
 * Nos REEMBOLSOS o `iban_override` é gravado na criação da transação de
 * pagamento a partir de `reimbursement_notes.payment_iban` (ou do IBAN do
 * fornecedor associado à nota); no detalhe da lista o objeto é enriquecido com
 * essa fonte antes de chegar aqui.
 */

export type BankabilityCheck = {
  /** elegível para entrar numa lista de pagamento */
  ok: boolean;
  /** IBAN resolvido (bruto, sem normalizar) */
  iban: string | null;
  /**
   * Pagamento ao Estado / serviços por Entidade+Referência (multibanco):
   * não tem IBAN por natureza e é pago no homebanking, fora do ficheiro SEPA.
   */
  viaReference: boolean;
};

export const NO_IBAN_TOOLTIP =
  "Associa um fornecedor com IBAN ou define IBAN manual na transação para poder incluir em lista";

const clean = (v: unknown): string | null => {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
};

export function resolvePaymentIban(tx: any): string | null {
  const sup: any = tx?.suppliers ?? {};
  return (
    clean(tx?.iban_override) ??
    clean(sup.iban) ??
    clean(sup.iban_2) ??
    clean(sup.iban_3) ??
    null
  );
}

/** Pagamento por referência (Estado, Segurança Social, seguros, etc.). */
export function hasPaymentReference(tx: any): boolean {
  return !!(clean(tx?.payment_entity) || clean(tx?.payment_reference));
}

export function checkPaymentBankability(tx: any): BankabilityCheck {
  const iban = resolvePaymentIban(tx);
  if (iban) return { ok: true, iban, viaReference: false };
  if (hasPaymentReference(tx)) return { ok: true, iban: null, viaReference: true };
  return { ok: false, iban: null, viaReference: false };
}

export function isBankable(tx: any): boolean {
  return checkPaymentBankability(tx).ok;
}
