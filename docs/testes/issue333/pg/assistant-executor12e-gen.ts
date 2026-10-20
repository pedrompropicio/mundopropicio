// #333 fase12e — propostas geradas pelo código do servidor (mesmo builder/hash) para a prova PG descartável.
import { buildTicketlineProposal } from "/dev-server/supabase/functions/_shared/assistant-ticketline-proposal.ts";
const C1 = "22222222-2222-2222-2222-222222222222", O1 = "0f000000-0000-4000-8000-000000000001", B1 = "0b000000-0000-4000-8000-000000000001";
const E1 = "e1000000-0000-4000-8000-000000000001", E2 = "e2000000-0000-4000-8000-000000000002", E3 = "e3000000-0000-4000-8000-000000000003", E4 = "e4000000-0000-4000-8000-000000000004";
const lines = [{ line_type: "event_right" as const, description: "Direito \"Duo\"\nSintético", amount_cents: 100000, event_hint: null },
  { line_type: "ticketline_invoice" as const, description: "Fatura Ticketline", amount_cents: -42050, event_hint: null }];
const st = (number: string) => ({ source_message_id: "msg000001", number, statement_date: "2026-10-10", document_total_cents: 57950, lines });
const ev = (id: string, sealed = false, canonical: unknown = null) => ({ id, name: `Evento ${id.slice(0, 2)}`, date: "2026-10-09", sealed, canonical: canonical as never });
const erp = { company_id: C1, events: [ev(E1), ev(E4)], existing_statements: [] };
const out: Record<string, unknown> = {};
for (const [k, n, e] of [["pa", "AP-1", E1], ["pa2", "AP-2", E1], ["pa3", "AP-3", E4], ["pa4", "AP-9", E1], ["pa5", "AP-5", E1], ["pa6", "AP-6", E1], ["pa7", "AP-7", E1]] as const)
  out[k] = await buildTicketlineProposal(st(n), erp, { event_id: e, human_reviewed: true, office_account_id: O1 });
out.pa_v2 = await buildTicketlineProposal(st("AP-6b"), erp, { event_id: E1, human_reviewed: true, office_account_id: O1 });
const canon = { status: "confirmed", settlement_date: "2026-10-15", net_transferred_cents: 57950, transfer_account_id: B1 };
const ev2 = { company_id: C1, events: [ev(E2, true, canon), ev(E3, true, canon)], existing_statements: [] };
const settle = { financial_account_id: B1, date: "2026-10-16", amount_cents: 57950, confirmed_by_user: true as const, confirmed_by_user_id: "11111111-1111-1111-1111-111111111111", server_validated: true };
out.pb = await buildTicketlineProposal(st("AP-B"), ev2, { event_id: E2, human_reviewed: true, settlement: settle });
out.pb3 = await buildTicketlineProposal(st("AP-B3"), ev2, { event_id: E3, human_reviewed: true, settlement: settle });
for (const [k, v] of Object.entries(out)) await Bun.write(`/tmp/pg333t/${k}.json`, JSON.stringify(v));
console.log(Object.entries(out).map(([k, v]) => `${k}:${(v as { actions: { id: string; blocked_reason: string | null }[] }).actions.filter(a => !a.blocked_reason).map(a => a.id).join(",")}`).join(" "));
