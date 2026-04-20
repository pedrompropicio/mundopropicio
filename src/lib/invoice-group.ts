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
