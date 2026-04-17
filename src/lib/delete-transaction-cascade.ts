import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { logAudit, getAuditUser } from "@/lib/audit";

interface DeleteCascadeParams {
  transactionId: string;
  user: any;
  /** Optional reason recorded in the audit log (e.g. "Eliminada via BP") */
  auditReason?: string;
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
}: DeleteCascadeParams): Promise<void> {
  const callerName = getAuditUser(user);

  // 1) Snapshot
  const { data: txData } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  // 2) Snapshot children (split)
  const { data: childTxs } = await supabase
    .from("transactions")
    .select("*")
    .eq("parent_transaction_id", transactionId);

  const allIds = [transactionId, ...(childTxs?.map((c: any) => c.id) ?? [])];

  // 3) Trash
  if (txData) {
    await moveToTrash({
      entity_type: "transaction",
      entity_id: transactionId,
      entity_data: txData,
      related_data:
        childTxs && childTxs.length > 0 ? { transactions: childTxs } : null,
      deleted_by: callerName,
    });
  }

  // 4) Detach BP forecasts (frees budget)
  await supabase
    .from("event_forecasts")
    .update({ transaction_id: null })
    .in("transaction_id", allIds);

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
    .from("supplier_credit_usages")
    .delete()
    .in("transaction_id", allIds);
  await supabase.from("transaction_payments").delete().in("transaction_id", allIds);
  await supabase.from("transaction_documents").delete().in("transaction_id", allIds);

  // 9) Audit log entries
  if (txData) {
    await supabase.from("transaction_audit_log").insert({
      transaction_id: transactionId,
      changed_by: callerName,
      field_name: "Eliminação",
      old_value: `${txData.description ?? "—"} — ${txData.amount ?? 0} €`,
      new_value: auditReason ?? null,
    });
  }
  if (childTxs && childTxs.length > 0) {
    for (const child of childTxs) {
      await supabase.from("transaction_audit_log").insert({
        transaction_id: child.id,
        changed_by: callerName,
        field_name: "Eliminação",
        old_value: `Eliminada em cascata com Master`,
        new_value: auditReason ?? null,
      });
    }
  }

  // 10) Delete children explicitly (safety; DB cascade also handles this)
  await supabase
    .from("transactions")
    .delete()
    .eq("parent_transaction_id", transactionId);

  // 11) Delete parent
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId);
  if (error) throw error;

  // 12) System audit
  await logAudit({
    entity_type: "transaction",
    entity_id: transactionId,
    action: "delete",
    changed_by: callerName,
    old_data: txData,
  });
}
