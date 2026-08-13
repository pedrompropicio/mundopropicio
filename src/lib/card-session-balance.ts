/**
 * Sincronização sessão de cartão ↔ conta (módulo Contas).
 *
 * A conta de um cartão pré-pago tem movimentos de DOIS mundos:
 *   (a) transações da sessão (carimbadas com `card_session_id`) + recargas;
 *   (b) transações DIRETAS lançadas na conta fora de qualquer sessão.
 *
 * Modelo (2026-08-13, decisão do Pedro):
 * - `card_sessions.opening_balance` passa a ser SÓ o override manual
 *   (NULL = dinâmico). O saldo de abertura é CALCULADO na leitura:
 *   `initial_balance` da conta + ajustes de caixa + Σ movimentos pagos com data
 *   efetiva ANTERIOR a `opened_at`. Transações retroativas refletem-se sozinhas.
 * - O fecho conta também os movimentos diretos do período da sessão, para que
 *   `teórico == saldo calculado da conta` (mesma fórmula do `fetchCardAccountBalance`
 *   e do `computeBalance` de Contas).
 *
 * Data efetiva = `payment_date` com fallback para `date` (coerente com Contas).
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAccountCashAdjustments } from "@/lib/account-balance";

export interface CardAccountTx {
  id: string;
  description: string | null;
  type: string;
  paid_amount: number | null;
  date: string | null;
  payment_date: string | null;
  card_session_id: string | null;
}

/** Data efetiva de um movimento: payment_date com fallback para date. */
export function txEffectiveDate(t: { payment_date?: string | null; date?: string | null }): string {
  return (t.payment_date ?? t.date ?? "") as string;
}

/** Valor assinado do movimento na conta (income soma, expense subtrai). */
export function txSignedAmount(t: { type?: string | null; paid_amount?: number | null }): number {
  const amt = Number(t.paid_amount ?? 0);
  return t.type === "income" ? amt : -amt;
}

export interface CardSessionAccountSync {
  /** Saldo de abertura calculado da conta (à data/hora de abertura). */
  dynamicOpening: number;
  /** Movimentos diretos na conta durante o período da sessão (fora da sessão). */
  directMovements: CardAccountTx[];
  /** Σ assinada dos movimentos diretos. */
  directTotal: number;
  /** Saldo calculado da conta (mesma fórmula do módulo Contas). */
  accountBalance: number;
}

/**
 * Calcula, numa só ida à BD, o saldo de abertura dinâmico, os movimentos
 * diretos do período e o saldo total da conta.
 */
export async function fetchCardSessionAccountSync(params: {
  accountId: string;
  sessionId: string;
  openedAt: string;
  /** IDs das transações de ENTRADA das recargas da sessão (não são "diretas"). */
  loadInTransactionIds?: (string | null | undefined)[];
}): Promise<CardSessionAccountSync> {
  const { accountId, sessionId, openedAt } = params;
  const loadIds = new Set((params.loadInTransactionIds ?? []).filter(Boolean) as string[]);

  const [{ data: account, error: accErr }, { data: txs, error: txErr }, adjustments] = await Promise.all([
    supabase.from("financial_accounts").select("initial_balance").eq("id", accountId).maybeSingle(),
    supabase
      .from("transactions")
      .select("id, description, type, paid_amount, date, payment_date, card_session_id")
      .eq("account_id", accountId),
    fetchAccountCashAdjustments([accountId]),
  ]);
  if (accErr) throw accErr;
  if (txErr) throw txErr;

  const base = Number(account?.initial_balance ?? 0) + (adjustments.get(accountId) ?? 0);
  // Comparação de datas: opened_at é timestamp; a data efetiva é YYYY-MM-DD.
  const openDay = String(openedAt ?? "").slice(0, 10);

  let dynamicOpening = base;
  let accountBalance = base;
  const directMovements: CardAccountTx[] = [];
  let directTotal = 0;

  for (const raw of (txs ?? []) as CardAccountTx[]) {
    const signed = txSignedAmount(raw);
    accountBalance += signed;
    const eff = txEffectiveDate(raw);
    if (eff && openDay && eff < openDay) {
      dynamicOpening += signed;
      continue;
    }
    // Período da sessão: só é "direto" se não pertencer à sessão nem às recargas.
    if (raw.card_session_id === sessionId) continue;
    if (loadIds.has(raw.id)) continue;
    if (signed === 0) continue;
    directMovements.push(raw);
    directTotal += signed;
  }

  directMovements.sort((a, b) => (txEffectiveDate(b) > txEffectiveDate(a) ? 1 : -1));

  return {
    dynamicOpening,
    directMovements,
    directTotal,
    accountBalance,
  };
}

/** Resolve o saldo de abertura efetivo a partir do override + dinâmico. */
export function resolveOpening(overrideOpening: number | null | undefined, dynamicOpening: number) {
  const isOverride = overrideOpening !== null && overrideOpening !== undefined;
  return { opening: isOverride ? Number(overrideOpening) : dynamicOpening, isOverride };
}

/** Saldo calculado da conta a uma data (exclusivo): usado na abertura de sessões novas. */
export async function fetchAccountBalanceAsOf(accountId: string, beforeDay?: string): Promise<number> {
  const [{ data: account, error: accErr }, { data: txs, error: txErr }, adjustments] = await Promise.all([
    supabase.from("financial_accounts").select("initial_balance").eq("id", accountId).maybeSingle(),
    supabase.from("transactions").select("type, paid_amount, date, payment_date").eq("account_id", accountId),
    fetchAccountCashAdjustments([accountId]),
  ]);
  if (accErr) throw accErr;
  if (txErr) throw txErr;

  let balance = Number(account?.initial_balance ?? 0) + (adjustments.get(accountId) ?? 0);
  const cut = beforeDay ? beforeDay.slice(0, 10) : null;
  for (const t of (txs ?? []) as any[]) {
    if (cut) {
      const eff = txEffectiveDate(t);
      if (!eff || eff >= cut) continue;
    }
    balance += txSignedAmount(t);
  }
  return balance;
}
