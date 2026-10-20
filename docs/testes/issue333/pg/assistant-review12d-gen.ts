import { buildTicketlineProposal } from "/dev-server/supabase/functions/_shared/assistant-ticketline-proposal.ts";
const company = "22222222-2222-2222-2222-222222222222", event = "44444444-4444-4444-8444-444444444444";
const st = { source_message_id: "msg000001", number: "AP-77 «ç»", statement_date: "2026-10-10", document_total_cents: 57950,
  lines: [{ line_type: "event_right" as const, description: "Direito \"Duo\"\nSintético", amount_cents: 100000, event_hint: "Duo Sintético" }, { line_type: "ticketline_invoice" as const, description: "Fatura", amount_cents: -42050, event_hint: null }] };
const erp = { company_id: company, events: [{ id: event, name: "Duo Sintético", date: "2026-10-09", sealed: false }], existing_statements: [] };
const p1 = await buildTicketlineProposal(st, erp, { human_reviewed: true });
const p2 = await buildTicketlineProposal({ ...st, number: "AP-78" }, erp, { human_reviewed: true });
await Bun.write("/tmp/pg333t/p1.json", JSON.stringify(p1)); await Bun.write("/tmp/pg333t/p2.json", JSON.stringify(p2));
console.log(p1.effects_hash, p2.effects_hash);
