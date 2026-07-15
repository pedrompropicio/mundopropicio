// SSoT para labels PT-PT dos status de transações.
// Reutilizar sempre que apresentar `transactions.status` na UI.
// Fallback: devolve o valor cru quando o status é desconhecido.

export const TRANSACTION_STATUS_LABELS_PT: Record<string, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  approved: "Aprovada",
  paid: "Pago",
  cancelled: "Cancelada",
};

export function formatTransactionStatusPT(status?: string | null): string {
  if (!status) return "—";
  return TRANSACTION_STATUS_LABELS_PT[status] ?? status;
}
