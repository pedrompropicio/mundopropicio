import { supabase } from "@/integrations/supabase/client";

export type ReviewStatus = "conferido" | "pendente" | "encerrada";

export interface AccountantReview {
  id: string;
  company_id: string;
  transaction_id: string;
  status: ReviewStatus;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  response_note: string | null;
  responded_by: string | null;
  responded_at: string | null
  closed_by: string | null;
  closed_at: string | null;
  updated_at: string;
}


/** Lê as conferências de um conjunto de transações (chunked para evitar URLs enormes). */
export async function fetchReviewsForTransactions(
  transactionIds: string[],
): Promise<Record<string, AccountantReview>> {
  const out: Record<string, AccountantReview> = {};
  if (!transactionIds.length) return out;
  const CHUNK = 200;
  for (let i = 0; i < transactionIds.length; i += CHUNK) {
    const slice = transactionIds.slice(i, i + CHUNK);
    const { data, error } = await (supabase as any)
      .from("accountant_transaction_reviews")
      .select("*")
      .in("transaction_id", slice);
    if (error) throw error;
    for (const r of data ?? []) out[r.transaction_id] = r as AccountantReview;
  }
  return out;
}

/** A contabilista marca a transação como conferida ou pendente (observação obrigatória se pendente). */
export async function saveAccountantReview(params: {
  companyId: string;
  transactionId: string;
  status: ReviewStatus;
  note?: string | null;
  userId: string;
}) {
  const payload = {
    company_id: params.companyId,
    transaction_id: params.transactionId,
    status: params.status,
    note: params.status === "pendente" ? (params.note ?? "").trim() : (params.note ?? null),
    reviewed_by: params.userId,
    reviewed_at: new Date().toISOString(),
  };
  const { error } = await (supabase as any)
    .from("accountant_transaction_reviews")
    .upsert(payload, { onConflict: "transaction_id" });
  if (error) throw error;
}

/** O financeiro responde a uma pendência da contabilista. */
export async function respondAccountantReview(params: {
  reviewId: string;
  responseNote: string;
  userId: string;
}) {
  const { error } = await (supabase as any)
    .from("accountant_transaction_reviews")
    .update({
      response_note: params.responseNote.trim(),
      responded_by: params.userId,
      responded_at: new Date().toISOString(),
    })
    .eq("id", params.reviewId);
  if (error) throw error;
}

export const REVIEW_QUERY_KEYS = [
  "accountant-reviews",
  "accountant-review",
  "accountant-pendencies",
  "accountant-pendencies-count",
];
