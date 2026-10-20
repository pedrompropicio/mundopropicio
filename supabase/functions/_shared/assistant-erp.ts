/** Caller-JWT reads only. No privileged client, financial writes or generic model queries. */
import { z } from "npm:zod@3";
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
