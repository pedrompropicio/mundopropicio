/**
 * #333 — cliente do endpoint `data-entry`. A UI fala só através deste adaptador, para poder
 * ser exercitada localmente com um adaptador de teste. Não há respostas simuladas em produção:
 * se o endpoint não existir ou recusar, a UI mostra indisponível.
 */
import { supabase } from "@/integrations/supabase/client";

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
export type DataEntryStatus = { role: string; company_id: string; capabilities: Record<string, boolean> };
export type ExecuteOutcome = { status: "conferido" | "conferencia_pendente" | "por_confirmar"; result?: DataEntryResult; error?: string };

export class DataEntryError extends Error { constructor(message: string, readonly status: number) { super(message); } }

export interface DataEntryAdapter {
  status(): Promise<DataEntryStatus>;
  session(sessionId?: string): Promise<DataEntryState>;
  upload(sessionId: string, file: File): Promise<{ id: string; reused: boolean }>;
  preview(sessionId: string, documentId: string, fields: DataEntryFields): Promise<DataEntryPreview>;
  execute(sessionId: string, previewId: string, snapshotHash: string): Promise<ExecuteOutcome>;
}

const UNAVAILABLE = "O assistente ainda não está ativo neste ambiente. Nada foi guardado nem lançado.";
const endpoint = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-entry`;

async function call<T>(body: BodyInit, json: boolean): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new DataEntryError("Inicia sessão para continuar.", 401);
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: "POST", body,
      headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, ...(json ? { "Content-Type": "application/json" } : {}) },
    });
  } catch { throw new DataEntryError(UNAVAILABLE, 503); }
  const payload = await res.json().catch(() => null);
  if (res.status === 404) throw new DataEntryError(UNAVAILABLE, 404);
  // Execute returns structured outcomes on 409/503 that the UI must show, not hide.
  if (payload && typeof payload === "object" && "status" in payload && !res.ok) return payload as T;
  if (!res.ok) throw new DataEntryError(payload?.error ?? UNAVAILABLE, res.status);
  return payload as T;
}

export const edgeDataEntryAdapter: DataEntryAdapter = {
  status: () => call(JSON.stringify({ action: "status" }), true),
  session: (sessionId) => call(JSON.stringify(sessionId ? { action: "session", session_id: sessionId } : { action: "session" }), true),
  upload: (sessionId, file) => { const f = new FormData(); f.set("session_id", sessionId); f.set("file", file); return call(f, false); },
  preview: (sessionId, documentId, fields) => call(JSON.stringify({ action: "preview", session_id: sessionId, document_id: documentId, fields }), true),
  execute: (sessionId, previewId, snapshotHash) => call(JSON.stringify({ action: "execute", session_id: sessionId, preview_id: previewId, snapshot_hash: snapshotHash, authorize: true }), true),
};

/** Converts a pt-PT amount ("1.234,56" or "1234.56") to a number with cents, or null. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
