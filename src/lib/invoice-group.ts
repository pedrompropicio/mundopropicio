import { supabase } from "@/integrations/supabase/client";

/**
 * Hard-link agrupador para faturas com múltiplas taxas de IVA.
 * Linhas de transações ou previsões de BP podem partilhar o mesmo
 * `invoice_group_id` (UUID). Operações como eliminar, liquidar, aprovar
 * ou editar campos partilhados devem propagar a todas as irmãs.
 *
 * Helpers para obter/expandir IDs com base no grupo.
 */

/** Devolve todos os IDs de transações que partilham o mesmo invoice_group_id (incluindo o próprio). */
export async function expandTransactionIdsByInvoiceGroup(
  ids: string[],
): Promise<string[]> {
  if (!ids.length) return ids;
  const unique = [...new Set(ids)];
  // 1) get the invoice_group_id of each input id
  const { data: rows } = await (supabase as any)
    .from("transactions")
    .select("id, invoice_group_id")
    .in("id", unique);
  const groups = [
    ...new Set(
      (rows ?? [])
        .map((r: any) => r.invoice_group_id)
        .filter((g: any) => !!g),
    ),
  ] as string[];
  if (groups.length === 0) return unique;
  // 2) fetch all siblings sharing those groups
  const { data: siblings } = await (supabase as any)
    .from("transactions")
    .select("id")
    .in("invoice_group_id", groups);
  const expanded = new Set<string>(unique);
  for (const s of siblings ?? []) expanded.add(s.id);
  return [...expanded];
}

/** Para uma única transação, devolve os IDs das irmãs (excluindo o próprio). */
export async function getInvoiceGroupSiblings(
  transactionId: string,
): Promise<string[]> {
  const { data: tx } = await (supabase as any)
    .from("transactions")
    .select("invoice_group_id")
    .eq("id", transactionId)
    .single();
  const groupId = tx?.invoice_group_id;
  if (!groupId) return [];
  const { data: siblings } = await (supabase as any)
    .from("transactions")
    .select("id")
    .eq("invoice_group_id", groupId)
    .neq("id", transactionId);
  return (siblings ?? []).map((s: any) => s.id);
}

/** Gera um novo invoice_group_id (UUID v4). */
export function newInvoiceGroupId(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback simples
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ------------------------------------------------------------------ *
 * Deteção por Nº de fatura / ATCUD  →  grupo de fatura formal
 * ------------------------------------------------------------------ */

/** Normaliza o nº de fatura/ATCUD para comparação (maiúsculas, sem espaços extra). */
export function normalizeInvoiceRef(ref?: string | null): string {
  return (ref ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Só agrupamos automaticamente referências que identificam um documento
 * concreto. "proforma", "fatura", "recibo" (sem número) são demasiado
 * genéricos e agrupariam transações não relacionadas.
 */
export function isGroupableInvoiceRef(ref?: string | null): boolean {
  const n = normalizeInvoiceRef(ref);
  if (n.length < 4) return false;
  if (!/\d/.test(n)) return false; // sem qualquer número → genérico
  // Proformas não são fatura definitiva: nunca auto-agrupar.
  if (/PRO\s?-?\s?FORMA|PROFORMA|PRÓ-?FORMA/.test(n)) return false;
  return true;
}

export interface InvoiceSibling {
  id: string;
  description: string | null;
  amount: number;
  iva_rate: number | null;
  supplier_id: string | null;
  invoice_ref: string | null;
  invoice_group_id: string | null;
  status: string | null;
}

/** Todas as transações do MESMO fornecedor com o MESMO nº de fatura/ATCUD. */
export async function fetchInvoiceSiblings(
  supplierId: string,
  invoiceRef: string,
): Promise<InvoiceSibling[]> {
  const { data } = await (supabase as any)
    .from("transactions")
    .select("id, description, amount, iva_rate, supplier_id, invoice_ref, invoice_group_id, status")
    .eq("supplier_id", supplierId)
    .eq("invoice_ref", invoiceRef)
    .order("description");
  return (data ?? []) as InvoiceSibling[];
}

/** Documentos anexos (file_url) por transação. */
export async function fetchDocumentUrlsByTransaction(
  transactionIds: string[],
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (!transactionIds.length) return out;
  const { data } = await (supabase as any)
    .from("transaction_documents")
    .select("transaction_id, file_url")
    .in("transaction_id", transactionIds);
  for (const row of data ?? []) {
    const key = row.transaction_id as string;
    if (!out[key]) out[key] = [];
    if (row.file_url) out[key].push(row.file_url as string);
  }
  return out;
}

export type InvoiceDocCheck =
  | { kind: "shared" }          // partilham ≥1 file_url
  | { kind: "no_documents" }    // nenhuma linha tem documento
  | { kind: "conflict" };       // documentos diferentes → não agrupar sem confirmação

/**
 * Compara os documentos anexos das linhas candidatas. Só é seguro agrupar
 * automaticamente quando partilham pelo menos um ficheiro, ou quando nenhuma
 * tem documento. Documentos diferentes = provável talão diferente.
 */
export async function checkInvoiceDocumentsConsistency(
  transactionIds: string[],
): Promise<InvoiceDocCheck> {
  const docs = await fetchDocumentUrlsByTransaction(transactionIds);
  const withDocs = transactionIds.filter((id) => (docs[id]?.length ?? 0) > 0);
  if (withDocs.length === 0) return { kind: "no_documents" };
  // Interseção dos conjuntos de file_url das linhas QUE TÊM documento
  let intersection: Set<string> | null = null;
  for (const id of withDocs) {
    const set = new Set(docs[id]);
    if (intersection === null) intersection = set;
    else intersection = new Set([...intersection].filter((u) => set.has(u)));
  }
  if (intersection && intersection.size > 0) return { kind: "shared" };
  return { kind: "conflict" };
}

export interface EnsureInvoiceGroupResult {
  groupId: string | null;
  total: number;
  updated: number;
  /** true quando existem linhas com documentos DIFERENTES → precisa de confirmação humana. */
  needsConfirm?: boolean;
}

/**
 * Cria (ou reutiliza) o grupo de fatura para todas as transações do mesmo
 * fornecedor + mesmo nº de fatura/ATCUD. Nunca agrupa fornecedores diferentes.
 *
 * CONSERVADOR (2026-09): antes de escrever compara os documentos anexos. Se as
 * linhas tiverem documentos diferentes, NÃO agrupa e devolve `needsConfirm`.
 * Passar `{ force: true }` só depois de a editora confirmar no diálogo.
 */
export async function ensureInvoiceGroup(
  supplierId: string,
  invoiceRef: string,
  opts: { force?: boolean } = {},
): Promise<EnsureInvoiceGroupResult> {
  if (!supplierId || !invoiceRef) return { groupId: null, total: 0, updated: 0 };
  const siblings = await fetchInvoiceSiblings(supplierId, invoiceRef);
  if (siblings.length < 2) return { groupId: null, total: siblings.length, updated: 0 };

  const existing = [...new Set(siblings.map((s) => s.invoice_group_id).filter(Boolean))] as string[];
  // Ambíguo: já existem 2+ grupos distintos nesta fatura → não mexer.
  if (existing.length > 1) return { groupId: null, total: siblings.length, updated: 0 };

  if (!opts.force) {
    const check = await checkInvoiceDocumentsConsistency(siblings.map((s) => s.id));
    if (check.kind === "conflict") {
      return { groupId: null, total: siblings.length, updated: 0, needsConfirm: true };
    }
  }

  const groupId = existing[0] ?? newInvoiceGroupId();
  const toUpdate = siblings.filter((s) => s.invoice_group_id !== groupId).map((s) => s.id);
  if (toUpdate.length) {
    const { error } = await (supabase as any)
      .from("transactions")
      .update({ invoice_group_id: groupId })
      .in("id", toUpdate);
    if (error) throw error;
  }
  return { groupId, total: siblings.length, updated: toUpdate.length };
}

export interface AutoGroupOutcome {
  invoiceRef: string;
  total: number;
  updated: number;
  supplierId: string;
  /** Quando true nada foi escrito: é apenas uma SUGESTÃO a confirmar pela editora. */
  suggestion?: boolean;
}

/**
 * Auto-agrupamento conservador após criar/editar uma transação. Devolve:
 *  - `{ updated > 0 }` quando agrupou (documentos partilhados ou inexistentes);
 *  - `{ suggestion: true }` quando há irmãs mas com documentos diferentes;
 *  - `null` quando não há nada a fazer.
 */
export async function autoGroupInvoiceForTransaction(
  transactionId: string,
  opts: { force?: boolean } = {},
): Promise<AutoGroupOutcome | null> {
  try {
    const { data: tx } = await (supabase as any)
      .from("transactions")
      .select("supplier_id, invoice_ref, invoice_group_id")
      .eq("id", transactionId)
      .maybeSingle();
    const supplierId = tx?.supplier_id;
    const invoiceRef = tx?.invoice_ref;
    if (!supplierId || !isGroupableInvoiceRef(invoiceRef)) return null;
    const res = await ensureInvoiceGroup(supplierId, invoiceRef, opts);
    if (res.needsConfirm) {
      return { invoiceRef, total: res.total, updated: 0, supplierId, suggestion: true };
    }
    if (!res.groupId || res.updated === 0) return null;
    return { invoiceRef, total: res.total, updated: res.updated, supplierId };
  } catch {
    return null; // auto-agrupamento nunca deve quebrar o fluxo principal
  }
}

/**
 * Desagrupa UMA transação do seu grupo de fatura. Se depois disso ficar uma
 * única linha no grupo, limpa também essa (um grupo de 1 não faz sentido).
 */
export async function clearInvoiceGroupForTransaction(
  transactionId: string,
): Promise<{ groupId: string | null; alsoCleared: number }> {
  const { data: tx } = await (supabase as any)
    .from("transactions")
    .select("invoice_group_id")
    .eq("id", transactionId)
    .maybeSingle();
  const groupId: string | null = tx?.invoice_group_id ?? null;
  if (!groupId) return { groupId: null, alsoCleared: 0 };

  const { error } = await (supabase as any)
    .from("transactions")
    .update({ invoice_group_id: null })
    .eq("id", transactionId);
  if (error) throw error;

  const { data: rest } = await (supabase as any)
    .from("transactions")
    .select("id")
    .eq("invoice_group_id", groupId);
  let alsoCleared = 0;
  if ((rest ?? []).length === 1) {
    const { error: e2 } = await (supabase as any)
      .from("transactions")
      .update({ invoice_group_id: null })
      .eq("id", rest![0].id);
    if (e2) throw e2;
    alsoCleared = 1;
  }
  return { groupId, alsoCleared };
}

export interface InvoiceGroupSiblingDetail {
  id: string;
  description: string | null;
  amount: number;
  date: string | null;
  due_date: string | null;
}

/** Irmãs do grupo de fatura (excluindo a própria) com dados para confirmação de eliminação. */
export async function fetchInvoiceGroupSiblingDetails(
  transactionId: string,
): Promise<InvoiceGroupSiblingDetail[]> {
  const { data: tx } = await (supabase as any)
    .from("transactions")
    .select("invoice_group_id")
    .eq("id", transactionId)
    .maybeSingle();
  const groupId = tx?.invoice_group_id;
  if (!groupId) return [];
  const { data } = await (supabase as any)
    .from("transactions")
    .select("id, description, amount, date, due_date")
    .eq("invoice_group_id", groupId)
    .neq("id", transactionId);
  return (data ?? []) as InvoiceGroupSiblingDetail[];
}

