/** Caller-JWT reads only. No privileged client, financial writes or generic model queries. */
import { z } from "npm:zod@3";
import type { ErpContext } from "./assistant-ticketline-proposal.ts";
export const ERP_LIMITS = { events: 20, settlements: 40, statements: 100 } as const;
const event = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), name: z.string(), date: z.string() });
const settlement = z.object({ event_id: z.string().uuid(), company_id: z.string().uuid(), status: z.string() });
const statement = z.object({ id: z.string().uuid(), company_id: z.string().uuid(), number: z.string(), status: z.string() });
export type ErpRead = { table: "events" | "ticket_office_settlements" | "ticket_office_statements"; columns: string; company: string; limit: number; text?: string; eventIds?: string[]; number?: string; signal: AbortSignal };
export async function readAssistantErp(read: (query: ErpRead) => Promise<unknown>, company: string, text: string, signal: AbortSignal, number?: string): Promise<ErpContext> {
  const safeText = text.normalize("NFC").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (safeText.length < 2 || signal.aborted) throw new Error("Consulta de evento inválida ou cancelada.");
  const events = z.array(event).parse(await read({ table: "events", columns: "id,company_id,name,date", company, text: safeText, limit: ERP_LIMITS.events + 1, signal }));
  if (events.length > ERP_LIMITS.events || events.some(e => e.company_id !== company)) throw new Error("Pesquisa de eventos incompleta ou contexto alterado. Precisa o nome do evento.");
  const settlements = events.length ? z.array(settlement).parse(await read({ table: "ticket_office_settlements", columns: "event_id,company_id,status", company, eventIds: events.map(e => e.id), limit: ERP_LIMITS.settlements + 1, signal })) : [];
  const statements = z.array(statement).parse(await read({ table: "ticket_office_statements", columns: "id,company_id,number,status", company, ...(number ? { number } : {}), limit: ERP_LIMITS.statements + 1, signal }));
  if (settlements.length > ERP_LIMITS.settlements || statements.length > ERP_LIMITS.statements || [...settlements, ...statements].some(r => r.company_id !== company)) throw new Error("Conferência ERP incompleta ou contexto alterado; proposta bloqueada.");
  if (signal.aborted) throw new DOMException("Cancelado", "AbortError");
  return { company_id: company, events: events.map(e => ({ id: e.id, name: e.name, date: e.date, sealed: settlements.some(s => s.event_id === e.id && s.status === "confirmed") })), existing_statements: statements.map(({ id, number, status }) => ({ id, number, status })) };
}