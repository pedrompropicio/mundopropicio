/**
 * Fonte única do saldo retido numa bilheteira.
 *
 * Antes desta função havia três fórmulas diferentes (página de Bilheteiras,
 * painel de Liquidez e relatório de Auditoria) e nenhuma contava as
 * transferências — por isso o saldo nunca fechava a zero depois de um fecho.
 *
 * Regras (todas obrigatórias):
 * - Vendas: só `financial_account_id === officeId` (igualdade estrita). Entram
 *   sempre no total; só o `byEvent` exige evento atribuído. Valor via
 *   `ticketSaleRevenue()`.

 * - Transações: `account_id === officeId`, status em {approved, paid},
 *   `reversed_at` nulo, `is_hidden` falso. SEMPRE por `paid_amount` (nunca
 *   fallback para `amount`). income soma; expense e transfer subtraem.
 * - Adiantamentos: só os que têm `transaction_id` nulo E `settlement_id` nulo
 *   (os restantes já estão contados pela transação). Mesma regra no total e
 *   no byEvent.
 * - byEvent: só transações com esse `event_id`. Movimentos sem evento (ou de
 *   evento não atribuído) entram no total e não no byEvent.
 */
import { ticketSaleRevenue, type TicketSaleLike } from "@/lib/ticket-sales-revenue";

/**
 * Rubrica 10.3 Transferências Internas. Uma transferência entre contas é um par
 * expense + income nesta rubrica; não existe transação de tipo 'transfer'.
 * Usada só como indicador de leitura — nunca entra na fórmula do saldo.
 */
export const INTERNAL_TRANSFER_CATEGORY_ID = "b32df086-c995-4747-a3f9-bfefa0063d0a";

export interface TicketOfficeBalanceSale extends TicketSaleLike {
  event_id?: string | null;
  financial_account_id?: string | null;
}

export interface TicketOfficeBalanceTxn {
  account_id?: string | null;
  type?: string | null;
  status?: string | null;
  paid_amount?: number | string | null;
  event_id?: string | null;
  reversed_at?: string | null;
  is_hidden?: boolean | null;
}

export interface TicketOfficeBalanceAdvance {
  event_id?: string | null;
  amount?: number | string | null;
  transaction_id?: string | null;
  settlement_id?: string | null;
}

export interface TicketOfficeBalanceInput {
  officeId: string;
  /** Eventos atribuídos à bilheteira. */
  assignedEventIds: string[];
  sales: TicketOfficeBalanceSale[];
  transactions: TicketOfficeBalanceTxn[];
  advances: TicketOfficeBalanceAdvance[];
}

export interface TicketOfficeBalanceResult {
  total: number;
  byEvent: Record<string, number>;
}

const COUNTED_STATUSES = new Set(["approved", "paid"]);

export function isCountedTicketOfficeTxn(t: TicketOfficeBalanceTxn, officeId: string): boolean {
  return (
    t.account_id === officeId &&
    COUNTED_STATUSES.has(String(t.status || "")) &&
    !t.reversed_at &&
    t.is_hidden !== true
  );
}

/** Sinal do movimento no saldo da bilheteira: income entra, expense/transfer saem. */
export function ticketOfficeTxnDelta(t: TicketOfficeBalanceTxn): number {
  const paid = Number(t.paid_amount || 0);
  if (!Number.isFinite(paid) || paid === 0) return 0;
  if (t.type === "income") return paid;
  if (t.type === "expense" || t.type === "transfer") return -paid;
  return 0;
}

/** Adiantamento que ainda pesa no saldo (não tem transação nem fecho). */
export function isOpenTicketOfficeAdvance(a: TicketOfficeBalanceAdvance): boolean {
  return !a.transaction_id && !a.settlement_id;
}

export function computeTicketOfficeBalance(input: TicketOfficeBalanceInput): TicketOfficeBalanceResult {
  const { officeId, assignedEventIds, sales, transactions, advances } = input;
  const assigned = new Set(assignedEventIds.filter(Boolean));

  const byEvent: Record<string, number> = {};
  assigned.forEach((id) => {
    byEvent[id] = 0;
  });

  let total = 0;

  // Vendas
  sales.forEach((s) => {
    if (s.financial_account_id !== officeId) return;
    const value = ticketSaleRevenue(s);
    if (!Number.isFinite(value) || value === 0) return;
    total += value;
    const eventId = s.event_id || undefined;
    if (eventId && eventId in byEvent) {
      byEvent[eventId] += value;
    }
  });


  // Transações
  transactions.forEach((t) => {
    if (!isCountedTicketOfficeTxn(t, officeId)) return;
    const delta = ticketOfficeTxnDelta(t);
    if (delta === 0) return;
    total += delta;
    const eventId = t.event_id || undefined;
    if (eventId && eventId in byEvent) {
      byEvent[eventId] += delta;
    }
  });

  // Adiantamentos abertos
  advances.forEach((a) => {
    if (!isOpenTicketOfficeAdvance(a)) return;
    const amount = Number(a.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) return;
    total -= amount;
    const eventId = a.event_id || undefined;
    if (eventId && eventId in byEvent) {
      byEvent[eventId] -= amount;
    }
  });

  return { total, byEvent };
}
