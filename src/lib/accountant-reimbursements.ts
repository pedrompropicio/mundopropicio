import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";

export interface AccountantReimbursementNote {
  id: string;
  code: string;
  employee_name: string;
}

export async function fetchAccountantReimbursementNotes(companyId: string) {
  const { data, error } = await fetchAllPagedQuery<AccountantReimbursementNote>(
    supabase.from("reimbursement_notes")
      .select("id, code, employee_name")
      .eq("company_id", companyId)
      .order("code", { ascending: false }),
  );
  if (error) throw error;
  return data ?? [];
}

export async function fetchAccountantReimbursementTransactionIds(companyId: string, noteId: string) {
  // Revalidar a nota na empresa activa antes de resolver pagamento e itens.
  const { data: note, error: noteError } = await supabase.from("reimbursement_notes")
    .select("payment_transaction_id")
    .eq("company_id", companyId)
    .eq("id", noteId)
    .maybeSingle();
  if (noteError) throw noteError;
  if (!note) throw new Error("Nota de reembolso indisponível nesta empresa.");

  const { data: items, error } = await fetchAllPagedQuery<{ transaction_id: string }>(
    supabase.from("reimbursement_note_items")
      .select("transaction_id")
      .eq("company_id", companyId)
      .eq("reimbursement_note_id", noteId),
  );
  if (error) throw error;
  return [...new Set([
    ...(note.payment_transaction_id ? [note.payment_transaction_id] : []),
    ...(items ?? []).map((item) => item.transaction_id),
  ])];
}
