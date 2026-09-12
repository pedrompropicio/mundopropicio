import { Building, FileText, Landmark, Repeat, Scale, type LucideIcon } from "lucide-react";

/**
 * FONTE ÚNICA do domínio de `payment_method`
 * (colunas `transactions.payment_method` e `transaction_payments.payment_method`).
 *
 * O trigger `trg_force_no_account_on_compensation` compara a string
 * EXACTAMENTE com 'compensation' e força `account_id` a NULL — compensação é
 * encontro de contas, sem movimento de caixa, e não pode entrar na fórmula do
 * saldo (que soma por `t.account_id`). Qualquer grafia nova desarma o trigger
 * em silêncio: NÃO acrescentar valores nem variantes aqui sem CHECK na base.
 *
 * Espelho no servidor: `supabase/functions/update-transaction/index.ts`
 * (constante PAYMENT_METHODS) + CHECK `transactions_payment_method_check` /
 * `transaction_payments_payment_method_check`.
 */
export const PAYMENT_METHODS = [
  "transfer",
  "service_payment",
  "direct_debit",
  "state_payment",
  "compensation",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: "Transferência",
  service_payment: "Pag. Serviços",
  direct_debit: "Débito Direto",
  state_payment: "Pag. Estado",
  compensation: "Compensação",
};

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  transfer: Building,
  service_payment: FileText,
  direct_debit: Repeat,
  state_payment: Landmark,
  compensation: Scale,
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Rótulo em pt-PT; devolve a string crua se vier valor fora do domínio. */
export function paymentMethodLabel(value?: string | null): string {
  if (!value) return "—";
  return isPaymentMethod(value) ? PAYMENT_METHOD_LABELS[value] : value;
}

/** Mapa de rótulos para os sítios que já esperavam um Record<string, string>. */
export const methodLabels: Record<string, string> = PAYMENT_METHOD_LABELS;

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
  icon: LucideIcon;
}

function option(value: PaymentMethod): PaymentMethodOption {
  return { value, label: PAYMENT_METHOD_LABELS[value], icon: PAYMENT_METHOD_ICONS[value] };
}

/**
 * Lista de opções para a interface.
 * `state_payment` mantém a regra condicional existente (categorias 10.4/10.5).
 * `compensation` só é oferecida onde for explicitamente pedida (liquidação).
 */
export function paymentMethodOptions(opts?: {
  includeStatePayment?: boolean;
  includeCompensation?: boolean;
}): PaymentMethodOption[] {
  const list: PaymentMethodOption[] = [
    option("transfer"),
    option("service_payment"),
    option("direct_debit"),
  ];
  if (opts?.includeStatePayment) list.push(option("state_payment"));
  if (opts?.includeCompensation) list.push(option("compensation"));
  return list;
}
