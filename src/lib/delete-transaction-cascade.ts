import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { logAudit, getAuditUser } from "@/lib/audit";
import { expandTransactionIdsByInvoiceGroup } from "@/lib/invoice-group";

interface DeleteCascadeParams {
  transactionId: string;
  user: any;
  /** Optional reason recorded in the audit log (e.g. "Eliminada via BP") */
  auditReason?: string;
  /**
   * Quando true (default), se a transação pertencer a um grupo de fatura (invoice_group_id),
   * todas as irmãs também são eliminadas em cascata. Define como false para eliminar
   * APENAS a transação fornecida (raro — normalmente quebra a integridade da fatura).
   */
  cascadeInvoiceGroup?: boolean;
}

/**
 * Deletes a transaction and ALL its dependencies in a controlled cascade,
 * ensuring the transaction does not remain "linked" to forecasts, payment lists,
 * reimbursements, cache payments, settlements, partner expenses, documents, etc.
 *
 * This is the single source of truth for transaction deletion across the app.
 *
 * Order of operations:
 *  1) Snapshot transaction (for trash + audit)
 *  2) Snapshot child split transactions (for trash)
 *  3) Move parent + children to trash
 *  4) Detach forecast links (event_forecasts.transaction_id → NULL)  ← CRITICAL: frees BP budget
 *  5) Detach cache payments (transaction_id and withholding_transaction_id → NULL)
 *  6) Detach settlement transfer (ticket_office_settlements.transfer_transaction_id → NULL)
 *  7) Detach reimbursement note payment (reimbursement_notes.payment_transaction_id → NULL)
 *  8) Hard-delete dependent rows (payment_list_items, reimbursement_note_items,
 *     partner_paid_expenses, supplier_credit_usages, transaction_payments, transaction_documents)
 *  9) Insert audit-log rows for the deleted transactions
 * 10) Delete child splits (DB cascade also covers this, but we do it explicitly for clarity)
 * 11) Delete the parent transaction
 * 12) Apply the same detach + delete to each child split id, recursively-light
 */
export async function deleteTransactionCascade({
  transactionId,
  user,
  auditReason,
  cascadeInvoiceGroup = true,
}: DeleteCascadeParams): Promise<void> {
  const callerName = getAuditUser(user);

  // 0) Expand to invoice-group siblings (linhas da mesma fatura com IVAs diferentes)
  const rootIds = cascadeInvoiceGroup
    ? await expandTransactionIdsByInvoiceGroup([transactionId])
    : [transactionId];

  // 1) Snapshot root transactions
  const { data: rootTxs } = await supabase
    .from("transactions")
    .select("*")
    .in("id", rootIds);

  const primaryTx = (rootTxs ?? []).find((t: any) => t.id === transactionId) ?? null;

  // 2) Snapshot children (split) of every root
  const { data: childTxs } = await supabase
    .from("transactions")
    .select("*")
    .in("parent_transaction_id", rootIds);

  const allIds = [
    ...rootIds,
    ...((childTxs ?? []).map((c: any) => c.id)),
  ];

  // 3) Trash (one entry per root tx, with own children when applicable)
  for (const tx of rootTxs ?? []) {
    const ownChildren = (childTxs ?? []).filter(
      (c: any) => c.parent_transaction_id === tx.id,
    );
    await moveToTrash({
      entity_type: "transaction",
      entity_id: tx.id,
      entity_data: tx,
      related_data: ownChildren.length > 0 ? { transactions: ownChildren } : null,
      deleted_by: callerName,
    });
  }

  // 4) Detach BP forecasts (frees budget) — apenas Ativa
  await supabase
    .from("event_forecasts")
    .update({ transaction_id: null })
    .in("transaction_id", allIds)
    .is("version_id", null);

  // 5) Detach cache payments (both columns)
  await supabase
    .from("event_cache_payments")
    .update({ transaction_id: null })
    .in("transaction_id", allIds);
  await supabase
    .from("event_cache_payments")
    .update({ withholding_transaction_id: null })
    .in("withholding_transaction_id", allIds);

  // 6) Detach settlement transfer
  await supabase
    .from("ticket_office_settlements")
    .update({ transfer_transaction_id: null })
    .in("transfer_transaction_id", allIds);

  // 7) Detach reimbursement note payment
  await supabase
    .from("reimbursement_notes")
    .update({ payment_transaction_id: null })
    .in("payment_transaction_id", allIds);

  // 8) Delete dependent rows
  await supabase.from("payment_list_items").delete().in("transaction_id", allIds);
  await supabase
    .from("reimbursement_note_items")
    .delete()
    .in("transaction_id", allIds);
  await supabase
    .from("partner_paid_expenses")
    .delete()
    .in("transaction_id", allIds);
  await supabase
    .from("partner_advance_expenses")
    .delete()
    .in("transaction_id", allIds);
  await supabase
    .from("supplier_credit_usages")
    .delete()
    .in("transaction_id", allIds);
  await supabase.from("transaction_payments").delete().in("transaction_id", allIds);
  await supabase.from("transaction_documents").delete().in("transaction_id", allIds);

  // 9) Audit log entries — preparar payload, mas inserir só APÓS o DELETE
  //    confirmar. Caso contrário, falhas de RLS/FK deixam "Eliminação"
  //    órfã no histórico de uma transação que continua viva.
  const groupReason =
    rootIds.length > 1
      ? `${auditReason ? auditReason + " · " : ""}Grupo fatura (${rootIds.length} linhas IVA)`
      : auditReason ?? null;

  const pendingAuditRows: Array<{
    transaction_id: string;
    changed_by: string;
    field_name: string;
    old_value: string;
    new_value: string | null;
  }> = [];
  for (const tx of rootTxs ?? []) {
    pendingAuditRows.push({
      transaction_id: tx.id,
      changed_by: callerName,
      field_name: "Eliminação",
      old_value: `${tx.description ?? "—"} — ${tx.amount ?? 0} €`,
      new_value: groupReason,
    });
  }
  for (const child of childTxs ?? []) {
    pendingAuditRows.push({
      transaction_id: child.id,
      changed_by: callerName,
      field_name: "Eliminação",
      old_value: `Eliminada em cascata com Master`,
      new_value: groupReason,
    });
  }

  // 10) Delete children explicitly (safety; DB cascade also handles this)
  await supabase
    .from("transactions")
    .delete()
    .in("parent_transaction_id", rootIds);

  // 11) Delete root transactions — se falhar, NÃO inserimos audit log
  const { error } = await supabase
    .from("transactions")
    .delete()
    .in("id", rootIds);
  if (error) throw error;

  // 11.b) DELETE confirmou → inserir audit rows agora
  if (pendingAuditRows.length > 0) {
    await supabase.from("transaction_audit_log").insert(pendingAuditRows);
  }

  // 12) System audit (one entry per root)
  for (const tx of rootTxs ?? []) {
    await logAudit({
      entity_type: "transaction",
      entity_id: tx.id,
      action: "delete",
      changed_by: callerName,
      old_data: tx,
      metadata: rootIds.length > 1 ? { invoice_group_size: rootIds.length } : null,
    });
  }

  // Silence unused-variable warning when only one root
  void primaryTx;
}

