/**
 * (g5 13/09) Desembolso do sócio, ajustes e receitas em poder do sócio.
 *
 * Reproduz a secção 7 da planilha — "O que a EIN já pagou e o que já tem em mãos".
 *
 *  (A) DESEMBOLSO DO SÓCIO
 *      (a) transações de despesa pagas pelo sócio (`partner_paid_expenses`);
 *      (b) TODAS as linhas de BP aprovadas com `paying_partner_id` = sócio,
 *          INCLUINDO as que têm transação ligada (ex. as linhas de open bar pagas
 *          por encontro de contas com o operador dos bares). Só se exclui a linha
 *          cuja transação ligada já esteja em `partner_paid_expenses` do MESMO
 *          sócio — essa entra por (a) e contá-la-ia duas vezes.
 *      Valorização: s/IVA por defeito (o sócio deduz o IVA e o IVA volta à
 *      sociedade pela regra do fechamento); c/IVA apenas quando o sócio não deduz
 *      IVA em PT (`suppliers.doc_locale = 'pt-BR'`).
 *
 *  (B) AJUSTES AO DESEMBOLSO — lançamentos manuais por sócio × evento
 *      (`event_partner_extras.kind = 'disbursement_adjustment'`), valor com sinal.
 *
 *  (C) RECEITAS EM PODER DO SÓCIO — dinheiro do evento que já está com ele e abate
 *      ao financiamento a devolver: (i) entradas nas contas de acerto do sócio;
 *      (ii) receitas do evento cuja conta tem `partner_id` = sócio; (iii)
 *      `operator_result` de operações de terceiros com `held_by_supplier_id` = sócio.
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
  /** Valor na base de valorização do desembolso (c/IVA só quando `useGross`). */
  amount: number;
  base: number;
  ivaRate: number;
  category: string;
  cityLabel: string;
  /** (g5) A linha tem transação ligada no sistema? (coluna do export de conferência.) */
  hasTransaction: boolean;
  status: string;
}

/**
 * (g5/g7) Linha de receita em poder do sócio.
 * (g7) `compensation`: receita recebida por encontro de contas com um terceiro,
 * feito pelo sócio. Nunca tem conta (trigger `force_no_account_on_compensation`),
 * por isso é marcada na própria transação em `held_by_supplier_id`.
 */
export type RevenueHeldSource =
  | "settlement_account"
  | "partner_account"
  | "third_party"
  | "compensation";


export interface RevenueHeldRow {
  id: string;
  partnerId: string;
  source: RevenueHeldSource;
  /** Nome da conta / operação de onde vem. */
  accountName: string;
  description: string;
  amount: number;
  date: string;
  eventId: string | null;
}

/** Compatibilidade com o nome anterior (contas de acerto). */
export type SettlementAccountEntryRow = RevenueHeldRow;

export interface PartnerAdjustmentRow {
  id: string;
  partner_id: string;
  event_id?: string | null;
  description?: string | null;
  amount: number | string | null;
  kind?: string | null;
  data?: string | null;
}

export interface PartnerAdjustment {
  id: string;
  description: string;
  /** Valor com sinal: negativo reduz o desembolso. */
  amount: number;
  date: string;
  cityLabel: string;
}

export const REVENUE_HELD_SOURCE_LABEL: Record<RevenueHeldSource, string> = {
  settlement_account: "Conta de acerto",
  partner_account: "Receita na conta do sócio",
  third_party: "Operação de terceiros",
  compensation: "Encontro de contas",
};


/**
 * (A·b) Linhas de BP pagas pelo sócio.
 *
 * `useGross` = o sócio não deduz IVA (doc_locale 'pt-BR'); por defeito é s/IVA.
 * `paidExpenseTxIds` = transações já contadas por `partner_paid_expenses` desse
 * sócio, para não haver dupla contagem.
 */
export function collectBpPaidLines(
  forecasts: BpPaidForecastRow[],
  partnerId: string,
  useGross: boolean,
  cityLabelByEvent: Record<string, string> = {},
  paidExpenseTxIds: Set<string> | string[] = [],
): BpPaidLine[] {
  const already = paidExpenseTxIds instanceof Set ? paidExpenseTxIds : new Set(paidExpenseTxIds);
  return (forecasts || [])
    .filter(
      (f) =>
        f &&
        f.type === "expense" &&
        f.paying_partner_id === partnerId &&
        !(f.transaction_id && already.has(f.transaction_id)),
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
        hasTransaction: !!f.transaction_id,
        status: f.status || "—",
      };
    });
}

export function sumLineAmounts(lines: Array<{ amount: number }>): number {
  return roundCents(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
}

/** (B) Ajustes manuais ao desembolso do sócio (valor com sinal). */
export function collectDisbursementAdjustments(
  rows: PartnerAdjustmentRow[],
  partnerId: string,
  cityLabelByEvent: Record<string, string> = {},
): PartnerAdjustment[] {
  return (rows || [])
    .filter((r) => r && r.partner_id === partnerId && r.kind === "disbursement_adjustment")
    .map((r) => ({
      id: r.id,
      description: r.description || "—",
      amount: Number(r.amount) || 0,
      date: r.data || "",
      cityLabel: (r.event_id && cityLabelByEvent[r.event_id]) || "—",
    }));
}

/** (C) Receitas em poder do sócio, das três fontes. */
export function collectRevenuesHeld(rows: RevenueHeldRow[], partnerId: string): RevenueHeldRow[] {
  return (rows || []).filter((e) => e && e.partnerId === partnerId);
}

/** Compatibilidade: filtro pelas entradas das contas de acerto do sócio. */
export function collectSettlementAccountEntries(
  entries: RevenueHeldRow[],
  partnerId: string,
): RevenueHeldRow[] {
  return collectRevenuesHeld(entries, partnerId);
}

/** (A) Desembolso do sócio = transações pagas por ele + linhas de BP em nome dele. */
export function partnerDisbursement(paidByTx: number, paidByBp: number): number {
  return roundCents((Number(paidByTx) || 0) + (Number(paidByBp) || 0));
}

/**
 * Financiamento a devolver = desembolso ± ajustes − receitas em poder do sócio.
 * É a linha da planilha e o subtotal mostrado no ecrã e no documento.
 */
export function partnerFinancingToReturn(
  disbursement: number,
  adjustments: number,
  revenuesHeld: number,
): number {
  return roundCents(
    (Number(disbursement) || 0) + (Number(adjustments) || 0) - (Number(revenuesHeld) || 0),
  );
}

/** Já adiantado ao sócio = extras/adiantamentos (as receitas em poder saem em linha própria). */
export function partnerAdvancedTotal(extras: number, settlementAccountInflows = 0): number {
  return roundCents((Number(extras) || 0) + (Number(settlementAccountInflows) || 0));
}
