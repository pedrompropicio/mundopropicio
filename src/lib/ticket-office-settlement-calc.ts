/**
 * Cálculos puros do fecho de bilheteira (TicketOfficeSettlement).
 * Mantidos sem dependências de UI/Supabase para serem facilmente testáveis.
 */

export interface SettlementInputs {
  grossRevenue: number;
  totalDeductions: number;
  totalAdvances: number;
  venueRetainedAmount: number;
  /** Saldo em aberto da fatura escolhida (já líquido de pagamentos prévios), ou null/undefined se não há fatura escolhida. */
  selectedInvoiceOpen?: number | null;
  /** Se a checkbox "liquidar saldo restante pela bilheteira" está ativa. */
  payInvoiceRemainder: boolean;
}

export interface SettlementResult {
  /** Saldo restante da fatura após abate da venda retida (>=0). 0 se não há fatura. */
  invoiceRemainder: number;
  /** True se o saldo restante será efetivamente abatido (checkbox + saldo > epsilon). */
  remainderApplied: boolean;
  /** Líquido a transferir, depois de todos os abatimentos. */
  netCalculated: number;
  /** True quando o valor retido excede o saldo em aberto da fatura selecionada. */
  venueRetainedExceedsInvoice: boolean;
  /** Soma total que será aplicada à fatura escolhida (retido + restante quando ativo). */
  totalAppliedToInvoice: number;
}

const EPS = 0.005;

export function computeSettlement(inputs: SettlementInputs): SettlementResult {
  const {
    grossRevenue,
    totalDeductions,
    totalAdvances,
    venueRetainedAmount,
    selectedInvoiceOpen,
    payInvoiceRemainder,
  } = inputs;

  const hasInvoice = selectedInvoiceOpen != null;
  const open = hasInvoice ? Math.max(0, Number(selectedInvoiceOpen)) : 0;

  const venueRetainedExceedsInvoice =
    hasInvoice && venueRetainedAmount > 0 && venueRetainedAmount > open + EPS;

  const invoiceRemainder = hasInvoice ? Math.max(0, open - venueRetainedAmount) : 0;
  const remainderApplied = payInvoiceRemainder && hasInvoice && invoiceRemainder > EPS;

  const netCalculated =
    grossRevenue -
    totalDeductions -
    totalAdvances -
    venueRetainedAmount -
    (remainderApplied ? invoiceRemainder : 0);

  const totalAppliedToInvoice =
    (hasInvoice ? venueRetainedAmount : 0) + (remainderApplied ? invoiceRemainder : 0);

  return {
    invoiceRemainder,
    remainderApplied,
    netCalculated,
    venueRetainedExceedsInvoice,
    totalAppliedToInvoice,
  };
}

/**
 * Calcula o novo estado de uma fatura após aplicar pagamentos.
 * Usa o total c/IVA (amount * (1 + iva_rate/100)) como base.
 */
export function applyPaymentToInvoice(params: {
  amountBase: number; // amount sem IVA
  ivaRate: number; // %
  currentPaid: number;
  paymentToAdd: number;
}): { newPaid: number; total: number; status: "paid" | "approved"; isFullyPaid: boolean } {
  const total = params.amountBase * (1 + params.ivaRate / 100);
  const newPaid = Math.max(0, params.currentPaid + params.paymentToAdd);
  const isFullyPaid = newPaid >= total - EPS;
  return {
    newPaid,
    total,
    status: isFullyPaid ? "paid" : "approved",
    isFullyPaid,
  };
}

/**
 * Reverte um pagamento aplicado a uma fatura, devolvendo o paid_amount esperado.
 */
export function revertPaymentFromInvoice(params: {
  amountBase: number;
  ivaRate: number;
  currentPaid: number;
  paymentToRemove: number;
}): { newPaid: number; total: number; status: "paid" | "approved"; isFullyPaid: boolean } {
  const total = params.amountBase * (1 + params.ivaRate / 100);
  const newPaid = Math.max(0, params.currentPaid - params.paymentToRemove);
  const isFullyPaid = newPaid >= total - EPS;
  return {
    newPaid,
    total,
    status: isFullyPaid ? "paid" : "approved",
    isFullyPaid,
  };
}

/**
 * #302 — Saldo em aberto EFETIVO de uma fatura ao editar um fecho já confirmado.
 * O paid_amount da fatura já inclui os pagamentos que este mesmo fecho criou
 * (compensação do retido + transferência do saldo restante). Para o ecrã mostrar
 * o mesmo saldo que existia antes da confirmação, somam-se de volta os valores
 * REAIS desses pagamentos (transaction_payments), só se pertencerem a esta fatura.
 */
export interface OwnSettlementPayment {
  id: string;
  transaction_id: string;
  amount: number;
}

export function effectiveInvoiceOpen(params: {
  invoiceId: string;
  total: number;
  paidAmount: number;
  /** Fecho em edição (ou null se é um fecho novo). */
  settlement?: {
    venue_retained_invoice_id?: string | null;
    venue_retained_payment_id?: string | null;
    venue_invoice_remainder_payment_id?: string | null;
  } | null;
  /** Pagamentos reais lidos de transaction_payments pelos ids do fecho. */
  ownPayments?: OwnSettlementPayment[];
}): number {
  const { invoiceId, total, paidAmount, settlement, ownPayments = [] } = params;
  let addBack = 0;
  if (settlement && settlement.venue_retained_invoice_id === invoiceId) {
    for (const pid of [settlement.venue_retained_payment_id, settlement.venue_invoice_remainder_payment_id]) {
      if (!pid) continue;
      const p = ownPayments.find((x) => x.id === pid);
      if (p && p.transaction_id === invoiceId) addBack += Number(p.amount || 0);
    }
  }
  return Math.max(0, Math.round((total - paidAmount + addBack) * 100) / 100);
}
