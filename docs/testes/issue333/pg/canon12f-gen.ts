// #333 fase12f — propostas geradas pelo código do servidor (builder + plano de fecho + hash reais) para a prova canon12f.
import { buildTicketlineProposal } from "/dev-server/supabase/functions/_shared/assistant-ticketline-proposal.ts";
import { buildClosingPlan, type ClosingReads } from "/dev-server/supabase/functions/_shared/assistant-settlement-plan.ts";
const C1 = "22222222-2222-2222-2222-222222222222", O1 = "0f000000-0000-4000-8000-000000000001", B1 = "0b000000-0000-4000-8000-000000000001", U1 = "11111111-1111-1111-1111-111111111111";
const id = (p: string, n: number) => `${p}0000000-0000-4000-8000-00000000000${n}`;
const lines = [{ line_type: "event_right" as const, description: "Direito \"Evento\"\nSintético", amount_cents: 87700, event_hint: null },
  { line_type: "ticketline_invoice" as const, description: "Fatura Ticketline", amount_cents: -4205, event_hint: null }];
const st = (number: string) => ({ source_message_id: "msg000001", number, statement_date: "2026-10-10", document_total_cents: 83495, lines });
const reads = (n: number): ClosingReads => ({ company: C1, office: O1, event: id("e", n), assigned: true, open_settlement: false,
  sales: [{ quantity: 10, unit_price: 50, total_value: 500 }, { quantity: 10, unit_price: 50, total_value: null }],
  direct: [{ id: id("d", n), description: "Som", amount: 100, iva_rate: 23, status: "pending", account_id: null, operation_key: null, event_id: id("e", n), settlement_id: null, parent_transaction_id: null, exclude_from_result: false, type: "expense", company_id: C1 }],
  masters: [], split_children: [], advance_tx_ids: [], statement_tx_ids: [],
  transfer_accounts: [{ id: B1, name: "Banco B", type: "bank", withholds_revenue: false, company_id: C1, is_active: true }] });
const evidence = { financial_account_id: B1, date: "2026-10-16", amount_cents: 87700, confirmed_by_user: true as const, confirmed_by_user_id: U1, server_validated: true };
const ev = (n: number, sealed = false) => ({ id: id("e", n), name: `Evento ${n}`, date: "2026-10-09", sealed,
  canonical: sealed ? { status: "confirmed", settlement_date: "2026-10-15", net_transferred_cents: 87700, transfer_account_id: B1 } : null });
const erp = (n: number, sealed = false) => ({ company_id: C1, events: [ev(n, sealed)], existing_statements: [] });
const out: Record<string, unknown> = {};
for (const [k, n] of [["pa", 1], ["pb", 2], ["pc", 3], ["pd", 4], ["pe", 5], ["pf", 6]] as const) {
  const { plan, issues } = buildClosingPlan(reads(n), { deduction_ids: [id("d", n)], settlement_date: "2026-10-15", transfer_account_id: B1 }, 87700, "2026-10-20");
  if (!plan) throw new Error(issues.join(";"));
  out[k] = await buildTicketlineProposal(st(`AP-${n}`), erp(n), { event_id: id("e", n), human_reviewed: true, office_account_id: O1, closing: plan, settlement: evidence });
}
// Mesmo evento/plano, mas evidência com valor diferente → a5 bloqueada (diferença pendente), a1–a3 continuam.
{ const { plan } = buildClosingPlan(reads(1), { deduction_ids: [id("d", 1)], settlement_date: "2026-10-15", transfer_account_id: B1 }, 87700, "2026-10-20");
  out.pa_diff = await buildTicketlineProposal(st("AP-1X"), erp(1), { event_id: id("e", 1), human_reviewed: true, office_account_id: O1, closing: plan, settlement: { ...evidence, amount_cents: 87600 } }); }
// Fechos já confirmados no modal (canónico): só a5, sem dependências.
for (const [k, n] of [["pg", 7], ["ph", 8], ["pi", 9], ["pf2", 6]] as const)
  out[k] = await buildTicketlineProposal(st(`AP-S${n}`), erp(n, true), { event_id: id("e", n), human_reviewed: true, office_account_id: O1, settlement: evidence });
for (const [k, v] of Object.entries(out)) await Bun.write(`/tmp/pg12ft/${k}.json`, JSON.stringify(v));
console.log(Object.entries(out).map(([k, v]) => `${k}:${(v as { actions: { id: string; blocked_reason: string | null }[] }).actions.filter(a => !a.blocked_reason).map(a => a.id).join(",")}`).join(" "));
