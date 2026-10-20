/**
 * #333 — cliente do endpoint `data-entry`. A UI fala só através deste adaptador, para poder
 * ser exercitada localmente com um adaptador de teste. Não há respostas simuladas em produção:
 * se o endpoint não existir ou recusar, a UI mostra indisponível.
 */
import { supabase } from "@/integrations/supabase/client";
import { DefaultChatTransport, readUIMessageStream } from "ai";
import { parseAnalysisReport, type AnalysisReport, type AnalysisTurn } from "@/lib/data-entry-analysis";

export type DataEntryFields = {
  supplier_name: string; supplier_nif: string; invoice_number: string; invoice_date: string;
  currency: "EUR"; total_amount: number; iva_amount: number; customer_nif: string;
  paid_by_partner_id: string; notes: string;
};
export type DataEntryDocument = { id: string; name: string; sha256: string; size_bytes: number; mime: string };
export type DataEntryPreview = {
  id: string; version: number; snapshot_hash: string; document_id: string;
  snapshot: { fields: DataEntryFields; payer_name: string; company_tax: string; effects: string[]; event_id: string | null };
};
export type DataEntryResult = { invoice_id: string; observation: string; total_amount: number; invoice_date: string; path: string; status: string; approved_name: string };
export type DataEntryState = {
  session: { id: string; created_at: string };
  company: { id: string; name: string; tax_id: string | null };
  event: { id: string; name: string } | null;
  actor: { name: string; role: string };
  documents: DataEntryDocument[];
  preview: DataEntryPreview | null;
  results: { preview_id: string; result: DataEntryResult }[];
  payers: { id: string; name: string }[];
  capabilities: { execute: boolean };
};
export type DataEntryStatus = { user_id: string; role: string; company_id: string; capabilities: Record<string, boolean> };
export type DataEntryContext = { user_id: string; company_id: string };
export type ExecuteOutcome = { status: "conferido" | "conferencia_pendente" | "por_confirmar"; result?: DataEntryResult; persisted?: { id: string; status: string; total_amount: number; invoice_date: string; storage_path: string } | null; error?: string };

export type GmailFilters = { from_date: string; to_date: string; sender?: string; subject?: string; page_size: number; page_token?: string };
export type GmailAttachment = { part_id: string; filename: string; mime: string; size_bytes: number };
export type GmailMessage = { message_id: string; from: string; subject: string; date: string; attachments: GmailAttachment[] };
export type GmailConnectionStatus = { linked: boolean; reconnect_required: boolean; mailbox_email?: string };
export type GmailSearchResult = { messages: GmailMessage[]; next_page_token: string | null };
export type GmailMessageBody = { message_id: string; from: string; subject: string; date: string; kind: "plain" | "html" | "none"; body_text: string; truncated: boolean };

export class DataEntryError extends Error { constructor(message: string, readonly status: number) { super(message); } }

export interface DataEntryAdapter {
  status(): Promise<DataEntryStatus>;
  session(sessionId?: string, context?: DataEntryContext): Promise<DataEntryState>;
  upload(sessionId: string, file: File, context?: DataEntryContext): Promise<{ id: string; reused: boolean }>;
  preview(sessionId: string, documentId: string, fields: DataEntryFields, context?: DataEntryContext): Promise<DataEntryPreview>;
  execute(sessionId: string, previewId: string, snapshotHash: string, context?: DataEntryContext): Promise<ExecuteOutcome>;
  check(sessionId: string, previewId: string, context?: DataEntryContext): Promise<ExecuteOutcome>;
  gmailSearch?(filters: GmailFilters, context: DataEntryContext): Promise<GmailSearchResult>;
  gmailConnection?(context: DataEntryContext): Promise<GmailConnectionStatus>;
  gmailConnectStart?(context: DataEntryContext): Promise<{ authorization_url: string }>;
  gmailDisconnect?(context: DataEntryContext): Promise<{ revoked_at_google: boolean }>;
  gmailImport?(sessionId: string, selection: { message_id: string; part_id: string }, context: DataEntryContext): Promise<{ id: string; reused: boolean; origin: string }>;
  gmailRead?(messageId: string, context: DataEntryContext): Promise<GmailMessageBody>;
  analyze?(sessionId: string, documentId: string, message: string, history: AnalysisTurn[], context: DataEntryContext, signal: AbortSignal): Promise<AnalysisReport>;
}

const UNAVAILABLE = "O assistente ainda não está ativo neste ambiente. Nada foi guardado nem lançado.";
const endpoint = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-entry`;

async function call<T>(body: BodyInit, json: boolean, context?: DataEntryContext): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new DataEntryError("Inicia sessão para continuar.", 401);
  if (context && data.session?.user.id !== context.user_id) throw new DataEntryError("Sessão alterada; reabre o assistente.", 409);
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: "POST", body,
      headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, ...(json ? { "Content-Type": "application/json" } : {}),
        ...(context ? { "X-Data-Entry-User": context.user_id, "X-Data-Entry-Company": context.company_id } : {}) },
    });
  } catch { throw new DataEntryError(UNAVAILABLE, 503); }
  const payload = await res.json().catch(() => null);
  if (context) {
    const current = await supabase.auth.getSession();
    if (current.data.session?.access_token !== token || current.data.session?.user.id !== context.user_id)
      throw new DataEntryError("Sessão alterada; reabre o assistente.", 409);
  }
  if (res.status === 404) throw new DataEntryError(UNAVAILABLE, 404);
  // Execute returns structured outcomes on 409/503 that the UI must show, not hide.
  if (payload && typeof payload === "object" && "status" in payload && !res.ok) return payload as T;
  if (!res.ok) throw new DataEntryError(payload?.error ?? UNAVAILABLE, res.status);
  return payload as T;
}

export const edgeDataEntryAdapter: DataEntryAdapter = {
  status: () => call(JSON.stringify({ action: "status" }), true),
  session: (sessionId, context) => call(JSON.stringify(sessionId ? { action: "session", session_id: sessionId } : { action: "session" }), true, context),
  upload: (sessionId, file, context) => { const f = new FormData(); f.set("session_id", sessionId); f.set("file", file); return call(f, false, context); },
  preview: (sessionId, documentId, fields, context) => call(JSON.stringify({ action: "preview", session_id: sessionId, document_id: documentId, fields }), true, context),
  execute: (sessionId, previewId, snapshotHash, context) => call(JSON.stringify({ action: "execute", session_id: sessionId, preview_id: previewId, snapshot_hash: snapshotHash, authorize: true }), true, context),
  check: (sessionId, previewId, context) => call(JSON.stringify({ action: "check", session_id: sessionId, preview_id: previewId }), true, context),
  gmailSearch: (filters, context) => call(JSON.stringify({ action: "gmail_search", filters }), true, context),
  gmailConnection: (context) => call(JSON.stringify({ action: "gmail_connection" }), true, context),
  gmailConnectStart: (context) => call(JSON.stringify({ action: "gmail_connect_start", origin: window.location.origin }), true, context),
  gmailDisconnect: (context) => call(JSON.stringify({ action: "gmail_disconnect" }), true, context),
  gmailImport: (sessionId, selection, context) => call(JSON.stringify({ action: "gmail_import", session_id: sessionId, selection }), true, context),
  gmailRead: (messageId, context) => call(JSON.stringify({ action: "gmail_read", message_id: messageId }), true, context),
  async analyze(sessionId, documentId, message, history, context, signal) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new DataEntryError("Inicia sessão para continuar.", 401);
    const transport = new DefaultChatTransport({
      api: endpoint(), headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "X-Data-Entry-User": context.user_id, "X-Data-Entry-Company": context.company_id },
      prepareSendMessagesRequest: () => ({ body: { action: "analyze", session_id: sessionId, document_id: documentId, message, history } }),
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        if (!res.ok) { const error = await res.json().catch(() => null); throw new DataEntryError(typeof error?.error === "string" ? error.error : "Análise indisponível.", res.status); }
        return res;
      },
    });
    const stream = await transport.sendMessages({ trigger: "submit-message", chatId: sessionId, messageId: undefined, messages: [], abortSignal: signal });
    let result: AnalysisReport | null = null;
    for await (const msg of readUIMessageStream({ stream, terminateOnError: true })) {
      for (const part of msg.parts) {
        if (part.type === "data-analysis-error") {
          const e = part.data as { status?: number; message?: string };
          throw new DataEntryError(e.message ?? "Análise interrompida.", e.status ?? 503);
        }
        if (part.type === "data-analysis") result = parseAnalysisReport(part.data);
      }
    }
    if (!result || signal.aborted) throw new DataEntryError(signal.aborted ? "Análise cancelada." : "A análise terminou sem dados válidos.", signal.aborted ? 499 : 422);
    return result;
  },
};

/** Converts a pt-PT amount ("1.234,56" or "1234.56") to a number with cents, or null. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Página de retorno: só reencaminha o código de uso único ao servidor; nunca recebe a chave. */
export const completeGmailConnection = (binding: string, code: string) =>
  call<GmailConnectionStatus>(JSON.stringify({ action: "gmail_connect_complete", binding, code }), true);
