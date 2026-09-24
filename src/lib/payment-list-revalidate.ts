import { supabase } from "@/integrations/supabase/client";

/** ids selecionados que já não estão ativos na lista (removed_at IS NOT NULL ou fora dela). */
export function findNotInActiveList(selectedTxIds: string[], activeTxIds: Iterable<string>): string[] {
  const active = new Set(activeTxIds);
  return [...new Set(selectedTxIds)].filter((id) => !active.has(id));
}

export function notInListMessage(n: number): string {
  return `${n} transação(ões) já não estão nesta lista (removidas). Recarrega a lista antes de liquidar.`;
}

/**
 * Relê da base os itens ATIVOS da lista e recusa se algum selecionado lá não estiver.
 * Lança Error (nada é gravado pelo chamador).
 */
export async function assertTxStillInPaymentList(paymentListId: string, selectedTxIds: string[]): Promise<void> {
  const { data, error } = await supabase
    .from("payment_list_items")
    .select("transaction_id")
    .eq("payment_list_id", paymentListId)
    .is("removed_at", null);
  if (error) throw error;
  const missing = findNotInActiveList(
    selectedTxIds,
    (data ?? []).map((r: any) => r.transaction_id as string),
  );
  if (missing.length > 0) throw new Error(notInListMessage(missing.length));
}
