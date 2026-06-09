import { supabase } from "@/integrations/supabase/client";

export interface AccountantDoc {
  id: string;
  name: string;
  file_url: string;
  source_tx_id: string;
  source_label?: string; // ex.: "Despesa do reembolso · descrição"
}

/**
 * Devolve os anexos da transação. Se a TX for o pagamento consolidado de
 * uma Nota de Reembolso (reimbursement_notes.payment_transaction_id = txId),
 * também inclui os anexos das despesas-filhas (faturas/recibos que o
 * funcionário pagou e que são o verdadeiro lastro contabilístico do reembolso).
 */
export async function fetchAccountantTxDocs(txId: string): Promise<AccountantDoc[]> {
  // 1) Anexos diretos da TX
  const { data: ownDocs } = await (supabase as any)
    .from("transaction_documents")
    .select("id, name, file_url")
    .eq("transaction_id", txId);

  const out: AccountantDoc[] = (ownDocs ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    file_url: d.file_url,
    source_tx_id: txId,
  }));

  // 2) Verificar se é pagamento de uma nota de reembolso
  const { data: note } = await (supabase as any)
    .from("reimbursement_notes")
    .select("id, code")
    .eq("payment_transaction_id", txId)
    .maybeSingle();

  if (!note) return out;

  // 3) Buscar despesas-filhas e respetivos anexos
  const { data: items } = await (supabase as any)
    .from("reimbursement_note_items")
    .select("transaction_id, transactions(id, description)")
    .eq("reimbursement_note_id", note.id);

  const childIds: string[] = (items ?? []).map((i: any) => i.transaction_id).filter(Boolean);
  const descById = new Map<string, string>();
  for (const i of items ?? []) {
    if (i.transactions?.id) descById.set(i.transactions.id, i.transactions.description ?? "");
  }

  if (childIds.length === 0) return out;

  const { data: childDocs } = await (supabase as any)
    .from("transaction_documents")
    .select("id, name, file_url, transaction_id")
    .in("transaction_id", childIds);

  for (const d of childDocs ?? []) {
    out.push({
      id: d.id,
      name: d.name,
      file_url: d.file_url,
      source_tx_id: d.transaction_id,
      source_label: `Despesa do reembolso · ${descById.get(d.transaction_id) ?? ""}`.trim(),
    });
  }

  return out;
}

/** Conta anexos diretos + filhos (caso seja pagamento de reembolso). */
export async function fetchAccountantTxDocCount(txId: string): Promise<number> {
  const docs = await fetchAccountantTxDocs(txId);
  return docs.length;
}

/**
 * Em lote: para cada txId, devolve a contagem total incluindo despesas-filhas
 * de notas de reembolso quando aplicável. Usa 3 queries (docs diretos +
 * notas + docs-filhas) — escala bem mesmo com centenas de TXs.
 */
export async function fetchAccountantDocCountsBatch(txIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (txIds.length === 0) return counts;

  // Diretos
  const { data: ownDocs } = await (supabase as any)
    .from("transaction_documents")
    .select("transaction_id")
    .in("transaction_id", txIds);
  for (const d of ownDocs ?? []) counts[d.transaction_id] = (counts[d.transaction_id] ?? 0) + 1;

  // Notas de reembolso cujo pagamento está na lista
  const { data: notes } = await (supabase as any)
    .from("reimbursement_notes")
    .select("id, payment_transaction_id")
    .in("payment_transaction_id", txIds);

  const noteIdToPayTx = new Map<string, string>();
  for (const n of notes ?? []) {
    if (n.payment_transaction_id) noteIdToPayTx.set(n.id, n.payment_transaction_id);
  }
  if (noteIdToPayTx.size === 0) return counts;

  const { data: items } = await (supabase as any)
    .from("reimbursement_note_items")
    .select("reimbursement_note_id, transaction_id")
    .in("reimbursement_note_id", Array.from(noteIdToPayTx.keys()));

  const childTxToPayTx = new Map<string, string>();
  for (const i of items ?? []) {
    const payTx = noteIdToPayTx.get(i.reimbursement_note_id);
    if (payTx && i.transaction_id) childTxToPayTx.set(i.transaction_id, payTx);
  }
  if (childTxToPayTx.size === 0) return counts;

  const { data: childDocs } = await (supabase as any)
    .from("transaction_documents")
    .select("transaction_id")
    .in("transaction_id", Array.from(childTxToPayTx.keys()));

  for (const d of childDocs ?? []) {
    const payTx = childTxToPayTx.get(d.transaction_id);
    if (payTx) counts[payTx] = (counts[payTx] ?? 0) + 1;
  }
  return counts;
}
