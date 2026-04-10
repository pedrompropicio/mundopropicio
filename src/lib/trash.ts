import { supabase } from "@/integrations/supabase/client";

interface MoveToTrashParams {
  entity_type: string;
  entity_id: string;
  entity_data: Record<string, any>;
  related_data?: Record<string, any> | null;
  deleted_by: string;
}

/**
 * Moves an entity to the trash table before hard-deleting it.
 * Returns true if the trash entry was created successfully.
 */
export async function moveToTrash(params: MoveToTrashParams): Promise<boolean> {
  try {
    const { error } = await supabase.from("trash" as any).insert({
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      entity_data: params.entity_data,
      related_data: params.related_data ?? null,
      deleted_by: params.deleted_by,
    } as any);
    if (error) {
      console.error("Failed to move to trash:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Trash error:", e);
    return false;
  }
}

/**
 * Restore an entity from trash by re-inserting its data.
 * The caller must handle the actual re-insert into the original table.
 */
export async function markAsRestored(trashId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("trash" as any)
      .update({ restored_at: new Date().toISOString() } as any)
      .eq("id", trashId);
    if (error) {
      console.error("Failed to mark as restored:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Restore error:", e);
    return false;
  }
}

/** Entity type labels in PT */
export const entityTypeLabels: Record<string, string> = {
  forecast: "Linha do BP",
  transaction: "Transação",
  event: "Evento",
  supplier: "Fornecedor",
  reimbursement_note: "Nota de Reembolso",
  quotation: "Cotação",
  recurring_transaction: "Transação Recorrente",
};
