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

/** Acesso nomeado aos valores, para não repetir literais no código. */
export const PAYMENT_METHOD = {
  transfer: "transfer",
  service_payment: "service_payment",
  direct_debit: "direct_debit",
  state_payment: "state_payment",
  compensation: "compensation",
} as const satisfies Record<PaymentMethod, PaymentMethod>;

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

/**
 * Pagamento de Serviços (referência MB): Entidade tem 5 dígitos e Referência 9.
 * ESPELHO do CHECK `transactions_service_payment_requires_mb` (NOT VALID em
 * Live) e da mesma verificação em `supabase/functions/update-transaction`.
 * Mensagem única — nunca mostrar o erro técnico da base ao utilizador.
 */
export const SERVICE_PAYMENT_ENTITY_PATTERN = /^\d{5}$/;
export const SERVICE_PAYMENT_REFERENCE_PATTERN = /^\d{9}$/;
export const SERVICE_PAYMENT_CHECK_CONSTRAINT = "transactions_service_payment_requires_mb";
export const SERVICE_PAYMENT_FIELDS_MESSAGE =
  "Pagamento de Serviços exige Entidade (5 dígitos) e Referência (9 dígitos)";

/** Devolve `null` quando está válido, ou a mensagem única quando não está. */
export function validateServicePaymentFields(input: {
  payment_method?: string | null;
  payment_entity?: string | null;
  payment_reference?: string | null;
}): string | null {
  if (input.payment_method !== PAYMENT_METHOD.service_payment) return null;
  const entity = (input.payment_entity ?? "").trim();
  const reference = (input.payment_reference ?? "").trim();
  if (!SERVICE_PAYMENT_ENTITY_PATTERN.test(entity)) return SERVICE_PAYMENT_FIELDS_MESSAGE;
  if (!SERVICE_PAYMENT_REFERENCE_PATTERN.test(reference)) return SERVICE_PAYMENT_FIELDS_MESSAGE;
  return null;
}

/** True quando o erro é a rejeição do CHECK da base (23514 com esta constraint). */
export function isServicePaymentCheckViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const text = `${e?.code ?? ""} ${e?.message ?? ""}`;
  return text.includes(SERVICE_PAYMENT_CHECK_CONSTRAINT);
}

/** Mensagem a mostrar: troca o erro técnico do CHECK pela frase do domínio. */
export function friendlyPaymentError(err: unknown): string {
  if (isServicePaymentCheckViolation(err)) return SERVICE_PAYMENT_FIELDS_MESSAGE;
  return (err as { message?: string } | null)?.message ?? "Erro desconhecido";
}

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
