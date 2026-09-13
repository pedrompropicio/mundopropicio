/**
 * (g4 precisão 13/09) Desembolso efectivo do sócio e dinheiro do evento já em poder dele.
 *
 * Duas peças que faltavam ao Encontro de Contas (issue #133):
 *
 *  (a) LINHAS DE BP PAGAS PELO SÓCIO SEM TRANSAÇÃO — D-ERP14: há fornecedores que
 *      facturam em nome do sócio (ex. EVERYTHINGISNEW) e é ele que refactura à
 *      Mundo Propício; essas linhas nunca viram transações no sistema, logo não
 *      apareciam em `partner_paid_expenses`. Contam para o "+ Despesas do evento
 *      pagas por <sócio>", valorizadas na base do fechamento (c/IVA quando a base
 *      do nó é bruta). Uma linha de BP COM `transaction_id` NÃO conta aqui — essa
 *      já entra pela transação (sem dupla contagem).
 *
 *  (b) CONTAS DE ACERTO DO SÓCIO — `financial_accounts.partner_id` (ex. "Acerto
 *      EIN · Anitta EDA 2026"): as entradas nessas contas são dinheiro do evento
 *      que já está com o sócio (os 905.000,00 que a Ticketline transferiu para a
 *      EIN por instrução da MP, par 10.3 com `exclude_from_result`). Abatem no
 *      "− Já adiantado a <sócio>".
 *
 * Módulo puro (sem React nem Supabase) para poder ser testado.
 */

import { calcTotalWithIva, roundCents } from "@/lib/iva";

export interface BpPaidForecastRow {
  id: string;
  description?: string | null;
  amount: number | string | null;
  iva_rate?: number | string | null;
  type?: string | null;
  status?: string | null;
  paying_partner_id?: string | null;
  transaction_id?: string | null;
  event_id?: string | null;
  account_categories?: { name?: string | null; code?: string | null } | null;
}

export interface BpPaidLine {
  id: string;
  description: string;
  /** Valor já na base do fechamento (c/IVA quando `useGross`). */
  amount: number;
  base: number;
  ivaRate: number;
  category: string;
  cityLabel: string;
}

export interface SettlementAccountEntryRow {
  id: string;
  partnerId: string;
  accountName: string;
  description: string;
  amount: number;
  date: string;
  eventId: string | null;
}

/**
 * Linhas de BP pagas pelo sócio que NUNCA geraram transação.
 * `useGross` = base do fechamento é c/IVA.
 */
export function collectBpPaidLines(
  forecasts: BpPaidForecastRow[],
  partnerId: string,
  useGross: boolean,
  cityLabelByEvent: Record<string, string> = {},
): BpPaidLine[] {
  return (forecasts || [])
    .filter(
      (f) =>
        f &&
        f.type === "expense" &&
        f.paying_partner_id === partnerId &&
        (f.transaction_id === null || f.transaction_id === undefined),
    )
    .map((f) => {
      const base = Number(f.amount) || 0;
      const ivaRate = Number(f.iva_rate) || 0;
      return {
        id: f.id,
        description: f.description || f.account_categories?.name || "—",
        amount: useGross ? calcTotalWithIva(base, ivaRate) : base,
        base,
        ivaRate,
        category: f.account_categories?.name || "—",
        cityLabel: (f.event_id && cityLabelByEvent[f.event_id]) || "—",
      };
    });
}

export function sumLineAmounts(lines: Array<{ amount: number }>): number {
  return roundCents(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
}

/** Entradas nas contas de acerto do sócio (dinheiro do evento já em poder dele). */
export function collectSettlementAccountEntries(
  entries: SettlementAccountEntryRow[],
  partnerId: string,
): SettlementAccountEntryRow[] {
  return (entries || []).filter((e) => e && e.partnerId === partnerId);
}

/**
 * Desembolso efectivo do sócio = transações pagas por ele + linhas de BP em nome dele
 * sem transação.
 */
export function partnerDisbursement(paidByTx: number, paidByBp: number): number {
  return roundCents((Number(paidByTx) || 0) + (Number(paidByBp) || 0));
}

/** Já adiantado ao sócio = extras/adiantamentos + entradas nas contas de acerto dele. */
export function partnerAdvancedTotal(extras: number, settlementAccountInflows: number): number {
  return roundCents((Number(extras) || 0) + (Number(settlementAccountInflows) || 0));
}
