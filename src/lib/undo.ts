import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type UndoActionType =
  | "adopt_to_master"
  | "delete_forecast"
  | "delete_transaction"
  | "approve_transaction"
  | "pay_transaction"
  | "edit_forecast"
  | "edit_transaction";

export type UndoEntityType =
  | "event_forecast"
  | "transaction"
  | "event_forecast_master";

export interface UndoActionInput {
  action_type: UndoActionType;
  entity_type: UndoEntityType;
  entity_id?: string | null;
  payload: Record<string, any>;
  description?: string;
  performed_by: string;
  performed_by_name?: string;
}

export interface UndoActionRecord extends UndoActionInput {
  id: string;
  performed_at: string;
  reverted_at: string | null;
  reverted_by: string | null;
  reverted_by_name: string | null;
  revert_reason: string | null;
  expires_at: string;
}

/**
 * Records a reversible action. Returns the inserted row (with id) or null on failure.
 * Failures are logged but never throw — undo is a best-effort safety net.
 */
export async function recordUndo(input: UndoActionInput): Promise<UndoActionRecord | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("undo_actions")
      .insert({
        action_type: input.action_type,
        entity_type: input.entity_type,
        entity_id: input.entity_id ?? null,
        payload: input.payload,
        description: input.description ?? null,
        performed_by: input.performed_by,
        performed_by_name: input.performed_by_name ?? null,
      })
      .select("*")
      .single();
    if (error) {
      console.warn("[undo] failed to record action", error);
      return null;
    }
    return data as UndoActionRecord;
  } catch (err) {
    console.warn("[undo] unexpected error recording action", err);
    return null;
  }
}

/**
 * Marks an undo record as reverted (without performing the actual revert).
 * The caller is responsible for the data changes; this only updates bookkeeping.
 */
export async function markUndoReverted(
  undoId: string,
  revertedBy: string,
  revertedByName?: string,
  reason?: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("undo_actions")
    .update({
      reverted_at: new Date().toISOString(),
      reverted_by: revertedBy,
      reverted_by_name: revertedByName ?? null,
      revert_reason: reason ?? null,
    })
    .eq("id", undoId)
    .is("reverted_at", null);
  if (error) throw error;
}

/**
 * Executes the revert for a given undo record.
 * Dispatches to type-specific handlers and marks the record as reverted on success.
 */
export async function executeUndo(
  undoId: string,
  user: { id: string; name?: string },
  reason?: string,
): Promise<void> {
  const { data: record, error } = await (supabase as any)
    .from("undo_actions")
    .select("*")
    .eq("id", undoId)
    .single();
  if (error || !record) throw new Error("Ação de desfazer não encontrada");
  if (record.reverted_at) throw new Error("Esta ação já foi revertida");

  const r = record as UndoActionRecord;

  switch (r.action_type) {
    case "adopt_to_master":
      await revertAdoptToMaster(r);
      break;
    case "edit_forecast":
      await revertEditForecast(r);
      break;
    case "edit_transaction":
      await revertEditTransaction(r);
      break;
    case "approve_transaction":
    case "pay_transaction":
      await revertTransactionStatusChange(r);
      break;
    case "delete_forecast":
    case "delete_transaction":
      throw new Error(
        "Para restaurar itens eliminados, use a Lixeira na barra lateral.",
      );
    default:
      throw new Error(`Tipo de ação não suportado: ${r.action_type}`);
  }

  await markUndoReverted(undoId, user.id, user.name, reason);
}

// ─── Type-specific revert handlers ─────────────────────────────────────────

/**
 * Reverts a Master adoption: unlinks forecasts and removes auto-created splits.
 * Payload shape:
 *  - linkedForecastIds: string[]      // existing sub forecasts whose master_forecast_id was set
 *  - createdSplitIds: string[]        // splits created automatically for orphan transactions
 *  - createdMasterId?: string         // if mode === "create", the new master row to delete
 */
async function revertAdoptToMaster(r: UndoActionRecord) {
  const linkedIds: string[] = r.payload.linkedForecastIds ?? [];
  const createdIds: string[] = r.payload.createdSplitIds ?? [];
  const createdMasterId: string | undefined = r.payload.createdMasterId;

  // 1) Unlink existing forecasts
  if (linkedIds.length > 0) {
    const { error } = await (supabase as any)
      .from("event_forecasts")
      .update({ master_forecast_id: null })
      .in("id", linkedIds);
    if (error) throw error;
  }

  // 2) Delete auto-created splits (these point to orphan transactions; deleting
  //    the split row leaves the transaction intact)
  if (createdIds.length > 0) {
    const { error } = await (supabase as any)
      .from("event_forecasts")
      .delete()
      .in("id", createdIds);
    if (error) throw error;
  }

  // 3) If a new Master line was created, delete it (only if it has no remaining children)
  if (createdMasterId) {
    const { data: remainingChildren } = await (supabase as any)
      .from("event_forecasts")
      .select("id")
      .eq("master_forecast_id", createdMasterId)
      .limit(1);
    if (remainingChildren && remainingChildren.length > 0) {
      throw new Error(
        "Não é possível remover a linha Master criada: existem outras vinculações posteriores. Desvincule-as primeiro.",
      );
    }
    const { error } = await (supabase as any)
      .from("event_forecasts")
      .delete()
      .eq("id", createdMasterId);
    if (error) throw error;
  }
}

/**
 * Reverts an edit on event_forecasts.
 * Payload: { snapshot: { /* fields to restore *\/ } }
 */
async function revertEditForecast(r: UndoActionRecord) {
  if (!r.entity_id) throw new Error("Forecast ID em falta");
  const snapshot = r.payload.snapshot;
  if (!snapshot) throw new Error("Snapshot anterior não disponível");
  const { error } = await (supabase as any)
    .from("event_forecasts")
    .update(snapshot)
    .eq("id", r.entity_id);
  if (error) throw error;
}

/**
 * Reverts an edit on transactions.
 * Payload: { snapshot: { /* fields to restore *\/ } }
 */
async function revertEditTransaction(r: UndoActionRecord) {
  if (!r.entity_id) throw new Error("Transaction ID em falta");
  const snapshot = r.payload.snapshot;
  if (!snapshot) throw new Error("Snapshot anterior não disponível");
  const { error } = await (supabase as any)
    .from("transactions")
    .update(snapshot)
    .eq("id", r.entity_id);
  if (error) throw error;
}

/**
 * Reverts approve/pay on a transaction.
 * Payload: { previousStatus, previousPaymentDate, previousPaidAmount, previousAccountId }
 */
async function revertTransactionStatusChange(r: UndoActionRecord) {
  if (!r.entity_id) throw new Error("Transaction ID em falta");
  const update: Record<string, any> = {
    status: r.payload.previousStatus ?? "pending",
    payment_date: r.payload.previousPaymentDate ?? null,
    paid_amount: r.payload.previousPaidAmount ?? 0,
  };
  if ("previousAccountId" in r.payload) {
    update.account_id = r.payload.previousAccountId ?? null;
  }
  const { error } = await (supabase as any)
    .from("transactions")
    .update(update)
    .eq("id", r.entity_id);
  if (error) throw error;
}

// UI helpers live in src/hooks/useUndoToast.tsx (JSX requires .tsx file).

