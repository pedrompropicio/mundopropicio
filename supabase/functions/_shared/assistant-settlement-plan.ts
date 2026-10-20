/**
 * #333 fase12f — plano de fecho de bilheteira (a3/a4) a partir de leituras ERP com o JWT do chamador.
 * Regras IGUAIS às do modal canónico (TicketOfficeSettlementModal): receita = Σ ticket_sales da bilheteira
 * (total_value ou quantity×unit_price), elegibilidade = isSettlementEligibleTxn, dedução = bruto c/IVA ao cêntimo,
 * líquido = computeSettlement sem retido/fatura (esses casos ficam no modal). Paridade testada contra src/lib.
 * Só o subconjunto suportado gera plano; tudo o resto devolve pendências legíveis, nunca um valor inventado.
 */
export type SaleRow = { quantity: number | string | null; unit_price: number | string | null; total_value?: number | string | null };
export type TxRow = {
  id: string; description: string | null; amount: number; iva_rate: number | null; status: string; account_id: string | null;
  operation_key: string | null; event_id: string | null; settlement_id: string | null; parent_transaction_id: string | null;
  exclude_from_result: boolean | null; type: string; company_id: string; reversed_at?: string | null;
};
export type ClosingReads = {
  company: string; office: string; event: string;
  assigned: boolean; open_settlement: boolean;
  sales: SaleRow[];
  /** Despesas diretas do evento + Masters de rateio cujos filhos são deste evento (sem settlement). */
  direct: TxRow[]; masters: TxRow[]; split_children: { id: string; parent_transaction_id: string; event_id: string }[];
  advance_tx_ids: string[]; statement_tx_ids: string[];
  transfer_accounts: { id: string; name: string; type: string; withholds_revenue: boolean; company_id: string; is_active: boolean }[];
};
export type ClosingChoice = { deduction_ids: string[]; settlement_date: string; transfer_account_id: string };
export type ClosingPlan = {
  office: string; event: string; settlement_date: string; gross_cents: number;
  deductions: { id: string; gross_cents: number }[]; deductions_cents: number; net_cents: number;
  transfer_account: string; event_right_cents: number | null;
};
export type ClosingOptions = {
  gross_cents: number; sales: number;
  eligible: { id: string; description: string; gross_cents: number; status: string }[];
  transfer_accounts: { id: string; name: string; type: string; withholds_revenue: boolean }[];
};

const cents = (n: number) => Math.round(n * 100);
/** ticketSaleRevenue (src/lib/ticket-sales-revenue.ts). */
export function saleRevenue(s: SaleRow): number {
  const tv = s.total_value;
  if (tv !== null && tv !== undefined && tv !== "") { const n = Number(tv); if (!Number.isNaN(n)) return n; }
  return Number(s.quantity || 0) * Number(s.unit_price || 0);
}
/** txnGross do modal: bruto c/IVA arredondado ao cêntimo. */
export const txGrossCents = (t: { amount: number; iva_rate: number | null }) => cents(Math.round(Number(t.amount || 0) * (1 + Number(t.iva_rate || 0) / 100) * 100) / 100);
/** isSettlementEligibleTxn (src/lib/ticket-office-settlement-eligible.ts) para um fecho NOVO. */
export function eligibleForNewSettlement(t: TxRow, office: string, advanceIds: Set<string>): boolean {
  if (t.exclude_from_result === true) return false;
  if (typeof t.operation_key === "string" && t.operation_key.startsWith("TRF-FECHO-")) return false;
  if (advanceIds.has(t.id)) return false;
  if (t.status === "pending" || t.status === "approved") return true;
  return t.status === "paid" && t.account_id === office;
}

export function closingOptions(r: ClosingReads): ClosingOptions {
  const adv = new Set([...r.advance_tx_ids, ...r.statement_tx_ids]);
  const seen = new Set<string>();
  const all = [...r.direct, ...r.masters].filter(t => t.company_id === r.company && t.type === "expense" && !t.settlement_id && !t.reversed_at);
  const eligible = all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return eligibleForNewSettlement(t, r.office, adv); });
  const present = new Set(eligible.map(t => t.id));
  const list = eligible.filter(t => !(t.parent_transaction_id && present.has(t.parent_transaction_id)));
  return {
    gross_cents: cents(r.sales.reduce((a, s) => a + saleRevenue(s), 0)), sales: r.sales.length,
    eligible: list.map(t => ({ id: t.id, description: (t.description ?? "").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 120), gross_cents: txGrossCents(t), status: t.status })),
    transfer_accounts: r.transfer_accounts.filter(a => a.company_id === r.company && a.is_active && a.id !== r.office && ["bank", "cash", "venue"].includes(a.type))
      .map(({ id, name, type, withholds_revenue }) => ({ id, name: name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 120), type, withholds_revenue })),
  };
}

/** Plano só para o caso suportado; qualquer falta/divergência fica como pendência (o modal resolve). */
export function buildClosingPlan(r: ClosingReads, choice: ClosingChoice | null | undefined, eventRightCents: number | null, today: string): { plan: ClosingPlan | null; options: ClosingOptions; issues: string[] } {
  const options = closingOptions(r); const issues: string[] = [];
  if (!r.assigned) issues.push("A bilheteira não está atribuída a este evento.");
  if (r.open_settlement) issues.push("Já existe um fecho (rascunho ou confirmado) deste evento: continuar no modal.");
  if (options.sales === 0) issues.push("Sem vendas registadas desta bilheteira para o evento.");
  if (!choice) { issues.push("Escolher as deduções, a data do fecho e a conta que recebe o líquido."); return { plan: null, options, issues }; }
  const ids = [...new Set(choice.deduction_ids)];
  if (ids.length !== choice.deduction_ids.length) issues.push("Deduções repetidas.");
  const chosen = ids.map(id => options.eligible.find(e => e.id === id));
  if (chosen.some(x => !x)) issues.push("Dedução fora da lista elegível do modal.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(choice.settlement_date) || choice.settlement_date > today) issues.push("Data do fecho inválida ou futura.");
  const acc = options.transfer_accounts.find(a => a.id === choice.transfer_account_id);
  if (!acc) issues.push("Conta de destino indisponível para esta empresa.");
  const deductions = chosen.filter((x): x is NonNullable<typeof x> => !!x).map(x => ({ id: x.id, gross_cents: x.gross_cents }));
  const deductions_cents = deductions.reduce((a, d) => a + d.gross_cents, 0);
  const net_cents = options.gross_cents - deductions_cents;
  if (net_cents <= 0) issues.push("Líquido do fecho ≤ 0: sem transferência a receber; usar o modal.");
  if (eventRightCents == null) issues.push("Apuramento sem linha de direito do evento para comparar.");
  else if (eventRightCents !== net_cents) issues.push(`Direito do evento no apuramento difere do líquido do fecho em ${((eventRightCents - net_cents) / 100).toFixed(2).replace(".", ",")} €: resolver no modal.`);
  if (issues.length) return { plan: null, options, issues };
  return { plan: { office: r.office, event: r.event, settlement_date: choice.settlement_date, gross_cents: options.gross_cents, deductions, deductions_cents, net_cents,
    transfer_account: acc!.id, event_right_cents: eventRightCents }, options, issues };
}
