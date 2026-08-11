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

/**
 * Cria (ou reutiliza) o grupo de fatura para todas as transações do mesmo
 * fornecedor + mesmo nº de fatura/ATCUD. Nunca agrupa fornecedores diferentes.
 * Devolve o grupo e quantas linhas passaram a ter grupo.
 */
export async function ensureInvoiceGroup(
  supplierId: string,
  invoiceRef: string,
): Promise<{ groupId: string | null; total: number; updated: number }> {
  if (!supplierId || !invoiceRef) return { groupId: null, total: 0, updated: 0 };
  const siblings = await fetchInvoiceSiblings(supplierId, invoiceRef);
  if (siblings.length < 2) return { groupId: null, total: siblings.length, updated: 0 };

  const existing = [...new Set(siblings.map((s) => s.invoice_group_id).filter(Boolean))] as string[];
  // Ambíguo: já existem 2+ grupos distintos nesta fatura → não mexer.
  if (existing.length > 1) return { groupId: null, total: siblings.length, updated: 0 };

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

/**
 * Auto-agrupamento conservador após criar/editar uma transação: se tiver
 * fornecedor + nº de fatura inequívoco e existirem irmãs sem grupo, agrupa.
 * Devolve info para toast, ou null quando não há nada a fazer.
 */
export async function autoGroupInvoiceForTransaction(
  transactionId: string,
): Promise<{ invoiceRef: string; total: number; updated: number } | null> {
  try {
    const { data: tx } = await (supabase as any)
      .from("transactions")
      .select("supplier_id, invoice_ref, invoice_group_id")
      .eq("id", transactionId)
      .maybeSingle();
    const supplierId = tx?.supplier_id;
    const invoiceRef = tx?.invoice_ref;
    if (!supplierId || !isGroupableInvoiceRef(invoiceRef)) return null;
    const res = await ensureInvoiceGroup(supplierId, invoiceRef);
    if (!res.groupId || res.updated === 0) return null;
    return { invoiceRef, total: res.total, updated: res.updated };
  } catch {
    return null; // auto-agrupamento nunca deve quebrar o fluxo principal
  }
}
