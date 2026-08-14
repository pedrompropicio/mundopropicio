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
  /** carga de cartão pré-pago: beneficiário é a conta de destino */
  isCardLoad: boolean;
  /** motivo da inelegibilidade (só quando ok = false) */
  reason?: "no_bank_data" | "card_destination_no_iban";
};

export const NO_IBAN_TOOLTIP =
  "Associa um fornecedor com IBAN ou define IBAN manual na transação para poder incluir em lista";

export const CARD_DEST_NO_IBAN_TOOLTIP =
  "Preenche o IBAN da conta do cartão de destino no cadastro de Contas para poder incluir em lista";

const clean = (v: unknown): string | null => {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
};

/**
 * Carga de cartão pré-pago — enriquecida por `enrichCardLoadDestinations`
 * (src/lib/card-load-destination.ts).
 */
export function getCardLoadDestination(tx: any): { name: string | null; iban: string | null } | null {
  const d = tx?.card_load_destination;
  if (!d) return null;
  return { name: clean(d.name), iban: clean(d.iban) };
}

export function resolvePaymentIban(tx: any): string | null {
  const sup: any = tx?.suppliers ?? {};
  const dest = getCardLoadDestination(tx);
  return (
    clean(tx?.iban_override) ??
    dest?.iban ??
    clean(sup.iban) ??
    clean(sup.iban_2) ??
    clean(sup.iban_3) ??
    null
  );
}

/**
 * Nome do beneficiário para o ficheiro SEPA. Nas cargas de cartão é o nome da
 * conta de destino (não há fornecedor).
 */
export function resolvePaymentCreditorName(tx: any, supplierName: string | null | undefined): string | null {
  const dest = getCardLoadDestination(tx);
  const sup = clean(supplierName);
  if (sup && sup !== "-") return sup;
  return dest?.name ?? sup ?? null;
}

/** Pagamento por referência (Estado, Segurança Social, seguros, etc.). */
export function hasPaymentReference(tx: any): boolean {
  return !!(clean(tx?.payment_entity) || clean(tx?.payment_reference));
}

export function checkPaymentBankability(tx: any): BankabilityCheck {
  const dest = getCardLoadDestination(tx);
  const isCardLoad = !!dest;
  const iban = resolvePaymentIban(tx);
  if (iban) return { ok: true, iban, viaReference: false, isCardLoad };
  if (hasPaymentReference(tx)) return { ok: true, iban: null, viaReference: true, isCardLoad };
  return {
    ok: false,
    iban: null,
    viaReference: false,
    isCardLoad,
    reason: isCardLoad ? "card_destination_no_iban" : "no_bank_data",
  };
}

export function isBankable(tx: any): boolean {
  return checkPaymentBankability(tx).ok;
}

/** Rótulo + tooltip do badge de inelegibilidade. */
export function noIbanBadgeProps(tx: any): { label: string; tooltip: string } {
  const check = checkPaymentBankability(tx);
  if (check.reason === "card_destination_no_iban") {
    return { label: "Conta de destino sem IBAN", tooltip: CARD_DEST_NO_IBAN_TOOLTIP };
  }
  return { label: "Sem IBAN", tooltip: NO_IBAN_TOOLTIP };
}
