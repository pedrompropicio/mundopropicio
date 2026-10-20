import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { buildClosingPlan, closingOptions, saleRevenue, txGrossCents, eligibleForNewSettlement, type ClosingReads, type TxRow } from "../../supabase/functions/_shared/assistant-settlement-plan";
import { buildTicketlineProposal, authorizationMatches, type ErpContext } from "../../supabase/functions/_shared/assistant-ticketline-proposal";
import { rpcExecutor } from "../../supabase/functions/_shared/assistant-executor";
import { ticketSaleRevenue } from "@/lib/ticket-sales-revenue";
import { isSettlementEligibleTxn } from "@/lib/ticket-office-settlement-eligible";
import { computeSettlement } from "@/lib/ticket-office-settlement-calc";
import TicketlineReviewPanel from "@/components/data-entry/TicketlineReviewPanel";
import type { DataEntryAdapter, TicketlinePreviewResult } from "@/lib/data-entry-client";

const C = "22222222-2222-4222-8222-222222222222", O = "66666666-6666-4666-8666-666666666666", B = "55555555-5555-4555-8555-555555555555", E = "44444444-4444-4444-8444-444444444444";
const D1 = "d1000000-0000-4000-8000-000000000001", D2 = "d2000000-0000-4000-8000-000000000002", U = "11111111-1111-4111-8111-111111111111";
const tx = (o: Partial<TxRow>): TxRow => ({ id: D1, description: "Som", amount: 100, iva_rate: 23, status: "pending", account_id: null, operation_key: null, event_id: E, settlement_id: null,
  parent_transaction_id: null, exclude_from_result: false, type: "expense", company_id: C, ...o });
const reads = (o: Partial<ClosingReads> = {}): ClosingReads => ({ company: C, office: O, event: E, assigned: true, open_settlement: false,
  sales: [{ quantity: 10, unit_price: 50, total_value: 500 }, { quantity: 10, unit_price: 50, total_value: null }], direct: [tx({})], masters: [], split_children: [],
  advance_tx_ids: [], statement_tx_ids: [], transfer_accounts: [{ id: B, name: "Banco", type: "bank", withholds_revenue: false, company_id: C, is_active: true }], ...o });
const choice = { deduction_ids: [D1], settlement_date: "2026-10-15", transfer_account_id: B };

describe("#333 fase12f plano de fecho = regras do modal", () => {
  it("paridade com src/lib: receita, elegibilidade e líquido", () => {
    for (const s of [{ quantity: 3, unit_price: 32.253658, total_value: null }, { quantity: 1, unit_price: 9, total_value: "12.30" }, { quantity: 2, unit_price: 5, total_value: "" }])
      expect(saleRevenue(s)).toBe(ticketSaleRevenue(s));
    const adv = new Set(["adv"]);
    for (const t of [tx({}), tx({ status: "paid", account_id: O }), tx({ status: "paid", account_id: B }), tx({ exclude_from_result: true }), tx({ operation_key: "TRF-FECHO-AB12CD34" }), tx({ id: "adv" }), tx({ status: "approved" })])
      expect(eligibleForNewSettlement(t, O, adv)).toBe(isSettlementEligibleTxn(t, O, null, adv));
    const r = buildClosingPlan(reads(), choice, 87700, "2026-10-20");
    const modal = computeSettlement({ grossRevenue: 1000, totalDeductions: 123, venueRetainedAmount: 0, selectedInvoiceOpen: null, payInvoiceRemainder: false });
    expect(r.plan).toMatchObject({ gross_cents: 100000, deductions_cents: 12300, net_cents: Math.round(modal.netCalculated * 100), transfer_account: B });
    expect(txGrossCents({ amount: 33.33, iva_rate: 23 })).toBe(4100);
  });
  it("só o caso suportado gera plano; o resto fica pendente, sem valores inventados", () => {
    expect(buildClosingPlan(reads(), null, 87700, "2026-10-20").plan).toBeNull();
    expect(buildClosingPlan(reads({ assigned: false }), choice, 87700, "2026-10-20").issues.join()).toMatch(/atribuída/);
    expect(buildClosingPlan(reads({ open_settlement: true }), choice, 87700, "2026-10-20").issues.join()).toMatch(/modal/);
    expect(buildClosingPlan(reads({ sales: [] }), { ...choice, deduction_ids: [] }, 0, "2026-10-20").issues.join()).toMatch(/Sem vendas/);
    expect(buildClosingPlan(reads(), { ...choice, deduction_ids: [D2] }, 87700, "2026-10-20").issues.join()).toMatch(/fora da lista/);
    expect(buildClosingPlan(reads(), { ...choice, settlement_date: "2026-10-21" }, 87700, "2026-10-20").issues.join()).toMatch(/futura/);
    expect(buildClosingPlan(reads(), { ...choice, transfer_account_id: O }, 87700, "2026-10-20").issues.join()).toMatch(/destino/);
    expect(buildClosingPlan(reads(), choice, 87600, "2026-10-20").issues.join()).toMatch(/difere do líquido/);
    expect(buildClosingPlan(reads(), choice, null, "2026-10-20").issues.join()).toMatch(/direito do evento/);
    // Master de rateio presente → filho sai da lista (regra do modal).
    const o = closingOptions(reads({ direct: [tx({ id: D2, parent_transaction_id: D1 })], masters: [tx({ event_id: null })] }));
    expect(o.eligible.map(x => x.id)).toEqual([D1]);
    // Outra empresa / já ligada / estornada não entram.
    expect(closingOptions(reads({ direct: [tx({ company_id: B }), tx({ id: D2, settlement_id: B })] })).eligible).toEqual([]);
  });
});

const st = { source_message_id: "msg000001", number: "AP-1", statement_date: "2026-10-10", document_total_cents: 83495,
  lines: [{ line_type: "event_right" as const, description: "Direito", amount_cents: 87700, event_hint: null }, { line_type: "ticketline_invoice" as const, description: "Fatura", amount_cents: -4205, event_hint: null }] };
const erp: ErpContext = { company_id: C, events: [{ id: E, name: "Evento", date: "2026-10-09", sealed: false }], existing_statements: [] };
const evid = (amount_cents = 87700) => ({ financial_account_id: B, date: "2026-10-16", amount_cents, confirmed_by_user: true as const, confirmed_by_user_id: U, server_validated: true });

describe("#333 fase12f proposta e autorização", () => {
  it("com plano: a4/a3 desbloqueadas, a5 depende de a3 e compara com o plano; plano entra no hash", async () => {
    const plan = buildClosingPlan(reads(), choice, 87700, "2026-10-20").plan!;
    const p = await buildTicketlineProposal(st, erp, { event_id: E, human_reviewed: true, office_account_id: O, closing: plan, settlement: evid() });
    expect(p.actions.filter(a => !a.blocked_reason).map(a => a.id)).toEqual(["a1", "a2", "a4", "a3", "a5"]);
    expect(p.actions.find(a => a.id === "a5")?.depends_on).toEqual(["a3"]);
    expect(p.effects.closing).toEqual(plan);
    const ctx = { user_id: U, company_id: C };
    const a = (ids: string[]) => ({ user_id: U, company_id: C, version: 1 as const, effects_hash: p.effects_hash, action_ids: ids });
    expect(await authorizationMatches(a(["a1", "a2", "a4", "a3", "a5"]), p, ctx)).toBe(true);
    expect(await authorizationMatches(a(["a1", "a2", "a3"]), p, ctx)).toBe(false);
    const p2 = await buildTicketlineProposal(st, erp, { event_id: E, human_reviewed: true, office_account_id: O, closing: { ...plan, deductions: [] }, settlement: evid() });
    expect(p2.effects_hash).not.toBe(p.effects_hash);
    const diff = await buildTicketlineProposal(st, erp, { event_id: E, human_reviewed: true, office_account_id: O, closing: plan, settlement: evid(87600) });
    expect(diff.actions.find(x => x.id === "a5")?.blocked_reason).toMatch(/diverge/);
    expect(diff.needs.join()).toMatch(/difere do líquido/);
  });
  it("plano de outro evento/bilheteira é ignorado (não autoriza o fecho)", async () => {
    const plan = { ...buildClosingPlan(reads(), choice, 87700, "2026-10-20").plan!, office: B };
    const p = await buildTicketlineProposal(st, erp, { event_id: E, human_reviewed: true, office_account_id: O, closing: plan });
    expect(p.effects.closing).toBeNull(); expect(p.actions.find(a => a.id === "a3")?.blocked_reason).toBeTruthy();
  });
});

describe("#333 fase12f cliente do executor: recusa da base vs incerto", () => {
  it("erro lógico de writer/trigger (P0001/23505/22023) é definitivo; cancelamento/ligação continua incerto", async () => {
    const r = (code: string, message: string) => rpcExecutor(async () => ({ data: null, error: { code, message } }));
    await expect(r("P0001", "Data de pagamento no futuro (2026-10-21).").execute("t", D1, "a5")).rejects.toMatchObject({ status: 409, code: "sql_refused" });
    await expect(r("P0001", "#333: partial_state_manual").execute("t", D1, "a5")).rejects.toMatchObject({ code: "partial_state_manual" });
    await expect(r("42501", "#333: scope_closed").execute("t", D1, "a1")).rejects.toMatchObject({ status: 503, code: "scope_closed" });
    await expect(r("57014", "canceling statement").execute("t", D1, "a1")).rejects.toMatchObject({ status: 502 });
    await expect(r("08006", "connection failure").execute("t", D1, "a1")).rejects.toMatchObject({ status: 502 });
  });
});

describe("#333 fase12f revisão: escolhas do fecho", () => {
  it("mostra receita/deduções do servidor e envia deduções, data e conta; editar invalida a prévia", async () => {
    const cand = { number: { value: "AP-1", prov: { source: "human", user_id: U } }, date: { value: "2026-10-10", prov: { source: "human", user_id: U } }, total_cents: { value: 83495, prov: { source: "human", user_id: U } },
      event_id: { value: E, prov: { source: "human", user_id: U } }, lines: [], sources: [], incomplete: [] } as never;
    const previews: unknown[] = [];
    const result = (persisted: boolean): TicketlinePreviewResult => ({ candidate: cand, persisted, events: [{ id: E, label: "Evento" }],
      proposal: { checks: [], needs: [], actions: [], sum_cents: 83495, document_total_cents: 83495, effects_hash: "a".repeat(64) } as never,
      closing_options: { gross_cents: 100000, sales: 2, eligible: [{ id: D1, description: "Som", gross_cents: 12300, status: "pending" }], transfer_accounts: [{ id: B, name: "Banco B", type: "bank", withholds_revenue: false }] } });
    const adapter = { ticketlineAccounts: vi.fn(async () => ({ accounts: [{ id: O, name: "Bilheteira T", type: "ticket_office" }] })),
      ticketlinePreview: vi.fn(async (i: unknown) => { previews.push(i); return result(false); }) } as unknown as DataEntryAdapter;
    render(<TicketlineReviewPanel adapter={adapter} context={{ user_id: U, company_id: C }} messageId="msg000001" initial={{ candidate: cand, candidate_token: "tok" }} />);
    fireEvent.change(await screen.findByLabelText("Bilheteira"), { target: { value: O } });
    fireEvent.click(screen.getByText("Recalcular prévia"));
    expect(await screen.findByText(/1\s?000,00\s?€/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Deduzir Som"));
    fireEvent.change(screen.getByLabelText("Data do fecho"), { target: { value: "2026-10-15" } });
    fireEvent.change(screen.getByLabelText("Conta de destino do fecho"), { target: { value: B } });
    expect(screen.getByText(/deixaram de valer/)).toBeTruthy();
    fireEvent.click(screen.getByText("Recalcular prévia"));
    await waitFor(() => expect(previews.length).toBe(2));
    expect((previews[1] as { edits: { closing: unknown } }).edits.closing).toEqual({ deduction_ids: [D1], settlement_date: "2026-10-15", transfer_account_id: B });
  });
});
