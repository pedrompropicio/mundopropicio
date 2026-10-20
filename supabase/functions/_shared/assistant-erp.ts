/** Caller-JWT reads only. No privileged client, financial writes or generic model queries. */
import { z } from "npm:zod@3";
import type { SaleRow, TxRow, ClosingReads } from "./assistant-settlement-plan.ts";
import type { ErpContext } from "./assistant-ticketline-proposal.ts";
export const ERP_LIMITS = { events: 20, settlements: 40, statements: 100, accounts: 100 } as const;
const event = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), name: z.string(), date: z.string().nullable() });
const settlement = z.object({ event_id: z.string().uuid(), company_id: z.string().uuid(), status: z.string(), settlement_date: z.string(), net_transferred: z.number(), transfer_account_id: z.string().uuid().nullable() });
const statement = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), number: z.string(), status: z.string() });
const account = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), name: z.string(), is_active: z.boolean(), is_hidden: z.boolean().nullable().optional(), type: z.string().nullable().optional() });
export type ErpRead = { table: "events" | "ticket_office_settlements" | "ticket_office_statements" | "financial_accounts"; columns: string; company: string; limit: number; text?: string; ids?: string[]; eventIds?: string[]; number?: string; active?: boolean; signal: AbortSignal };
export type ErpReader = (query: ErpRead) => Promise<unknown>;
export async function readAssistantErp(read: ErpReader, company: string, text: string, signal: AbortSignal, number?: string, eventId?: string): Promise<ErpContext> {
  const safeText = text.normalize("NFC").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if ((!eventId && safeText.length < 2) || signal.aborted) throw new Error("Consulta de evento inválida ou cancelada.");
  const found = z.array(event).parse(await read({ table: "events", columns: "id,company_id,name,date", company, ...(safeText.length >= 2 ? { text: safeText } : { ids: [eventId!] }), limit: ERP_LIMITS.events + 1, signal }));
  // Human-chosen event is read by id with the caller JWT, never trusted from the browser list.
  const chosen = eventId && !found.some(e => e.id === eventId) ? z.array(event).parse(await read({ table: "events", columns: "id,company_id,name,date", company, ids: [eventId], limit: 2, signal })) : [];
  const events = [...found, ...chosen];
  if (found.length > ERP_LIMITS.events || chosen.length > 1 || events.some(e => e.company_id !== company)) throw new Error("Pesquisa de eventos incompleta ou contexto alterado. Precisa o nome do evento.");
  const settlements = events.length ? z.array(settlement).parse(await read({ table: "ticket_office_settlements", columns: "event_id,company_id,status,settlement_date,net_transferred,transfer_account_id", company, eventIds: events.map(e => e.id), limit: ERP_LIMITS.settlements + 1, signal })) : [];
  const statements = z.array(statement).parse(await read({ table: "ticket_office_statements", columns: "id,company_id,number,status", company, ...(number ? { number } : {}), limit: ERP_LIMITS.statements + 1, signal }));
  if (settlements.length > ERP_LIMITS.settlements || statements.length > ERP_LIMITS.statements || [...settlements, ...statements].some(r => r.company_id !== company)) throw new Error("Conferência ERP incompleta ou contexto alterado; proposta bloqueada.");
  if (signal.aborted) throw new DOMException("Cancelado", "AbortError");
  return { company_id: company, events: events.map(e => {
    const confirmed = settlements.filter(s => s.event_id === e.id && s.status === "confirmed");
    // More than one confirmed settlement is ambiguous: no canonical value, liquidation stays pending.
    const c = confirmed.length === 1 ? confirmed[0] : null;
    return { id: e.id, name: e.name, date: e.date, sealed: confirmed.length > 0,
      canonical: c ? { status: c.status, settlement_date: c.settlement_date, net_transferred_cents: Math.round(c.net_transferred * 100), transfer_account_id: c.transfer_account_id } : null };
  }), existing_statements: statements.map(({ id, number, status }) => ({ id, number, status })) };
}
/** Contas ativas e visíveis da empresa canónica, para o seletor humano (nomes legíveis). */
export async function readAssistantAccounts(read: ErpReader, company: string, signal: AbortSignal): Promise<{ id: string; name: string; type: string | null }[]> {
  const rows = z.array(account).parse(await read({ table: "financial_accounts", columns: "id,company_id,name,is_active,is_hidden,type", company, active: true, limit: ERP_LIMITS.accounts + 1, signal }));
  if (rows.length > ERP_LIMITS.accounts || rows.some(r => r.company_id !== company)) throw new Error("Lista de contas incompleta ou de outro contexto.");
  return rows.filter(r => r.is_active && !r.is_hidden).map(r => ({ id: r.id, name: r.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 120), type: r.type ?? null })).sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/** #333 fase12f — leituras do plano de fecho (mesmas fontes do modal), só com o JWT do chamador e limites explícitos. */
export type ClosingRead = { table: "event_ticket_office_assignments" | "ticket_office_settlements" | "event_ticket_zones" | "ticket_sales" | "transactions" | "event_ticket_office_advances" | "ticket_office_statement_lines" | "financial_accounts";
  columns: string; eq?: Record<string, string | boolean>; in?: [string, string[]]; notNull?: string; neq?: [string, string]; limit: number; signal: AbortSignal };
export type ClosingReader = (q: ClosingRead) => Promise<unknown>;
export const CLOSING_LIMITS = { sales: 5000, transactions: 500, accounts: 100, misc: 500 } as const;
const txCols = "id,description,amount,iva_rate,status,account_id,operation_key,event_id,settlement_id,parent_transaction_id,exclude_from_result,type,company_id,reversed_at";
const tx = z.object({ id: z.string().uuid(), description: z.string().nullable(), amount: z.number(), iva_rate: z.number().nullable(), status: z.string(), account_id: z.string().uuid().nullable(),
  operation_key: z.string().nullable(), event_id: z.string().uuid().nullable(), settlement_id: z.string().uuid().nullable(), parent_transaction_id: z.string().uuid().nullable(),
  exclude_from_result: z.boolean().nullable(), type: z.string(), company_id: z.string().uuid(), reversed_at: z.string().nullable() });
export async function readAssistantClosing(read: ClosingReader, company: string, office: string, event: string, signal: AbortSignal): Promise<import("./assistant-settlement-plan.ts").ClosingReads> {
  const bounded = <T>(rows: T[], max: number) => { if (rows.length > max) throw new Error("Dados do fecho acima do limite de leitura: continuar no modal."); return rows; };
  const assigned = z.array(z.object({ event_id: z.string() })).parse(await read({ table: "event_ticket_office_assignments", columns: "event_id", eq: { event_id: event, financial_account_id: office }, limit: 2, signal }));
  const sets = z.array(z.object({ id: z.string(), status: z.string(), company_id: z.string() })).parse(await read({ table: "ticket_office_settlements", columns: "id,status,company_id", eq: { event_id: event, company_id: company }, neq: ["status", "reversed"], limit: 10, signal }));
  const zones = z.array(z.object({ id: z.string().uuid() })).parse(await read({ table: "event_ticket_zones", columns: "id", eq: { event_id: event }, limit: CLOSING_LIMITS.misc + 1, signal }));
  bounded(zones, CLOSING_LIMITS.misc);
  const sales = zones.length ? bounded(z.array(z.object({ quantity: z.number().nullable(), unit_price: z.number().nullable(), total_value: z.number().nullable() })).parse(
    await read({ table: "ticket_sales", columns: "quantity,unit_price,total_value", in: ["zone_id", zones.map(x => x.id)], eq: { financial_account_id: office }, limit: CLOSING_LIMITS.sales + 1, signal })), CLOSING_LIMITS.sales) : [];
  const direct = bounded(z.array(tx).parse(await read({ table: "transactions", columns: txCols, eq: { event_id: event, type: "expense", company_id: company }, limit: CLOSING_LIMITS.transactions + 1, signal })), CLOSING_LIMITS.transactions);
  const children = direct.filter(t => t.parent_transaction_id).map(t => ({ id: t.id, parent_transaction_id: t.parent_transaction_id!, event_id: event }));
  const masterIds = [...new Set(children.map(c => c.parent_transaction_id))];
  const masters = masterIds.length ? bounded(z.array(tx).parse(await read({ table: "transactions", columns: txCols, in: ["id", masterIds], eq: { type: "expense", company_id: company }, limit: CLOSING_LIMITS.transactions + 1, signal })), CLOSING_LIMITS.transactions) : [];
  const adv = z.array(z.object({ transaction_id: z.string().uuid().nullable() })).parse(await read({ table: "event_ticket_office_advances", columns: "transaction_id", eq: { event_id: event, financial_account_id: office }, limit: CLOSING_LIMITS.misc + 1, signal }));
  const ids = [...direct, ...masters].map(t => t.id);
  const stl = ids.length ? z.array(z.object({ transaction_id: z.string().uuid().nullable(), line_type: z.string() })).parse(await read({ table: "ticket_office_statement_lines", columns: "transaction_id,line_type", in: ["transaction_id", ids], limit: CLOSING_LIMITS.misc + 1, signal })) : [];
  const accounts = bounded(z.array(z.object({ id: z.string().uuid(), name: z.string(), type: z.string(), withholds_revenue: z.boolean(), company_id: z.string().uuid(), is_active: z.boolean() })).parse(
    await read({ table: "financial_accounts", columns: "id,name,type,withholds_revenue,company_id,is_active", eq: { company_id: company, is_active: true }, limit: CLOSING_LIMITS.accounts + 1, signal })), CLOSING_LIMITS.accounts);
  bounded(adv, CLOSING_LIMITS.misc); bounded(stl, CLOSING_LIMITS.misc);
  if ([...direct, ...masters, ...sets, ...accounts].some(r => r.company_id !== company)) throw new Error("Contexto alterado durante a leitura do fecho.");
  if (signal.aborted) throw new DOMException("Cancelado", "AbortError");
  // zod valida em runtime todos os campos como obrigatórios; o shim de tipos local infere-os opcionais.
  return { company, office, event, assigned: assigned.length > 0, open_settlement: sets.length > 0, sales: sales as SaleRow[], direct: direct as TxRow[], masters: masters as TxRow[], split_children: children,
    advance_tx_ids: adv.map(a => a.transaction_id).filter((x): x is string => !!x),
    statement_tx_ids: stl.filter(l => l.line_type === "advance" || l.line_type === "carry_over").map(l => l.transaction_id).filter((x): x is string => !!x),
    transfer_accounts: accounts as ClosingReads["transfer_accounts"] };
}
