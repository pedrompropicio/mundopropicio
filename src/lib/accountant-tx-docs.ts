import { supabase } from "@/integrations/supabase/client";

export type AccountantDocBucket = "transaction-documents" | "camarim-documents";

export interface AccountantDoc {
  id: string;
  name: string;
  file_url: string;
  /** Caminho já resolvido dentro do bucket (sem prefixo camarim://). */
  path: string;
  bucket: AccountantDocBucket;
  source_tx_id: string;
  source_label?: string; // ex.: "Despesa do reembolso · descrição"
  origin?: "transaction" | "camarim" | "reimbursement";
}

/**
 * `transaction_documents.file_url` pode vir:
 *  - "company_id/…"           → bucket transaction-documents
 *  - "camarim://company_id/…" → bucket camarim-documents
 */
export function resolveDocBucket(fileUrl: string): { bucket: AccountantDocBucket; path: string } {
  if (fileUrl?.startsWith("camarim://")) {
    return { bucket: "camarim-documents", path: fileUrl.slice("camarim://".length) };
  }
  return { bucket: "transaction-documents", path: fileUrl };
}

/**
 * Devolve os anexos contabilísticos da transação, agregando três fontes:
 *  1) `transaction_documents` da própria TX (inclui refs camarim:// criadas no fecho do camarim);
 *  2) `camarim_item_documents` dos itens de camarim cuja `transaction_id` aponta para esta TX
 *     (fallback para sessões em que a replicação não correu);
 *  3) `transaction_documents` das transações de ORIGEM de uma Nota de Reembolso quando esta TX
 *     é o pagamento consolidado da nota (`reimbursement_notes.payment_transaction_id`).
 *
 * DECISÃO (duplicação nos reembolsos): os comprovativos aparecem tanto na TX-mãe (pagamento
 * consolidado, que é a linha que a contabilista procura) como nas TXs de origem se estas
 * também estiverem no período. No ZIP a de-duplicação é feita por caminho de ficheiro.
 */
export async function fetchAccountantTxDocs(txId: string): Promise<AccountantDoc[]> {
  const out: AccountantDoc[] = [];
  const seen = new Set<string>();

  const push = (d: AccountantDoc) => {
    const key = `${d.bucket}:${d.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(d);
  };

  // 1) Anexos diretos da TX
  const { data: ownDocs } = await (supabase as any)
    .from("transaction_documents")
    .select("id, name, file_url")
    .eq("transaction_id", txId);

  for (const d of ownDocs ?? []) {
    const { bucket, path } = resolveDocBucket(d.file_url);
    push({
      id: d.id,
      name: d.name,
      file_url: d.file_url,
      path,
      bucket,
      source_tx_id: txId,
      origin: bucket === "camarim-documents" ? "camarim" : "transaction",
      source_label: bucket === "camarim-documents" ? "Camarim" : undefined,
    });
  }

  // 2) Talões de camarim ligados a esta TX
  const { data: camItems } = await (supabase as any)
    .from("camarim_items")
    .select("id, description")
    .eq("transaction_id", txId);

  const camItemIds: string[] = (camItems ?? []).map((i: any) => i.id);
  if (camItemIds.length > 0) {
    const camDescById = new Map<string, string>();
    for (const i of camItems ?? []) camDescById.set(i.id, i.description ?? "");

    const { data: camDocs } = await (supabase as any)
      .from("camarim_item_documents")
      .select("id, item_id, file_name, file_path, company_id")
      .in("item_id", camItemIds);

    for (const d of camDocs ?? []) {
      const path = d.file_path?.startsWith(`${d.company_id}/`) || !d.company_id
        ? d.file_path
        : `${d.company_id}/${d.file_path}`;
      push({
        id: d.id,
        name: d.file_name,
        file_url: d.file_path,
        path,
        bucket: "camarim-documents",
        source_tx_id: txId,
        origin: "camarim",
        source_label: `Camarim · ${camDescById.get(d.item_id) ?? ""}`.trim(),
      });
    }
  }

  // 3) Nota de reembolso cujo pagamento é esta TX
  const { data: note } = await (supabase as any)
    .from("reimbursement_notes")
    .select("id, code")
    .eq("payment_transaction_id", txId)
    .maybeSingle();

  if (!note) return out;

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
    const { bucket, path } = resolveDocBucket(d.file_url);
    push({
      id: d.id,
      name: d.name,
      file_url: d.file_url,
      path,
      bucket,
      source_tx_id: d.transaction_id,
      origin: "reimbursement",
      source_label: `Reembolso · ${descById.get(d.transaction_id) ?? ""}`.trim(),
    });
  }

  return out;
}

/** Conta anexos agregados (diretos + camarim + despesas-filhas de reembolso). */
export async function fetchAccountantTxDocCount(txId: string): Promise<number> {
  const docs = await fetchAccountantTxDocs(txId);
  return docs.length;
}

/**
 * Em lote: para cada txId, devolve a contagem total incluindo talões de camarim e
 * despesas-filhas de notas de reembolso quando aplicável.
 */
export async function fetchAccountantDocCountsBatch(txIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (txIds.length === 0) return counts;

  // chaves já contadas por TX, para não duplicar camarim (replicado) vs talão original
  const keys = new Map<string, Set<string>>();
  const bump = (txId: string, key: string) => {
    if (!keys.has(txId)) keys.set(txId, new Set());
    const s = keys.get(txId)!;
    if (s.has(key)) return;
    s.add(key);
    counts[txId] = (counts[txId] ?? 0) + 1;
  };

  // Diretos
  const { data: ownDocs } = await (supabase as any)
    .from("transaction_documents")
    .select("transaction_id, file_url")
    .in("transaction_id", txIds);
  for (const d of ownDocs ?? []) {
    const { bucket, path } = resolveDocBucket(d.file_url);
    bump(d.transaction_id, `${bucket}:${path}`);
  }

  // Camarim: itens ligados a estas TXs
  const { data: camItems } = await (supabase as any)
    .from("camarim_items")
    .select("id, transaction_id")
    .in("transaction_id", txIds);
  const camItemToTx = new Map<string, string>();
  for (const i of camItems ?? []) if (i.transaction_id) camItemToTx.set(i.id, i.transaction_id);
  if (camItemToTx.size > 0) {
    const { data: camDocs } = await (supabase as any)
      .from("camarim_item_documents")
      .select("item_id, file_path, company_id")
      .in("item_id", Array.from(camItemToTx.keys()));
    for (const d of camDocs ?? []) {
      const tx = camItemToTx.get(d.item_id);
      if (!tx) continue;
      const path = !d.company_id || d.file_path?.startsWith(`${d.company_id}/`)
        ? d.file_path
        : `${d.company_id}/${d.file_path}`;
      bump(tx, `camarim-documents:${path}`);
    }
  }

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
    .select("transaction_id, file_url")
    .in("transaction_id", Array.from(childTxToPayTx.keys()));

  for (const d of childDocs ?? []) {
    const payTx = childTxToPayTx.get(d.transaction_id);
    if (!payTx) continue;
    const { bucket, path } = resolveDocBucket(d.file_url);
    bump(payTx, `${bucket}:${path}`);
  }
  return counts;
}
