import { supabase } from "@/integrations/supabase/client";

/**
 * COSMÉTICO. Remove o sufixo "(n/m)" do fim da descrição, apenas para
 * apresentação/comparação de texto. O sistema NUNCA identifica parcelamento
 * pela descrição — isso é feito por `transactions.installment_group_id`.
 */
export function stripInstallmentSuffix(description: string | null | undefined): string {
  return String(description ?? "")
    .replace(/\(\s*\d+\s*\/\s*\d+\s*\)\s*$/, "")
    .trim();
}


/** Normaliza para comparação: minúsculas, sem acentos, sem pontuação, espaços colapsados. */
export function normalizeDescription(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ExistingInstallment = {
  id: string;
  description: string;
  amount: number;
  due_date: string | null;
  status: string;
  parent_transaction_id: string | null;
};

/**
 * Deteta parcelas já existentes para o mesmo documento, para bloquear uma
 * segunda geração (caso real: "Hotel Londres" gerado 2× em 25/05).
 *
 * Identificação ESTRUTURAL — nunca por texto:
 *  - (1) transações com `parent_transaction_id = parentTransactionId`;
 *  - (2) transações do mesmo fornecedor + evento que pertencem a um
 *    parcelamento (`installment_group_id NOT NULL`) do mesmo documento
 *    (descrição-base igual, usada só para restringir ao mesmo documento).
 */
export async function findExistingInstallments(params: {
  eventId?: string | null;
  supplierId?: string | null;
  description: string;
  parentTransactionId?: string | null;
  installmentGroupId?: string | null;
  excludeIds?: string[];
}): Promise<ExistingInstallment[]> {
  const cols =
    "id, description, amount, due_date, status, parent_transaction_id, is_transitory, split_percentage, installment_group_id";
  const exclude = new Set((params.excludeIds ?? []).filter(Boolean));
  const found = new Map<string, ExistingInstallment>();

  const keep = (r: any) => {
    if (!r?.id || exclude.has(r.id)) return;
    if (r.is_transitory) return;
    if (r.split_percentage !== null) return; // split de rateio, não parcela
    found.set(r.id, {
      id: r.id,
      description: r.description ?? "",
      amount: Number(r.amount) || 0,
      due_date: r.due_date ?? null,
      status: r.status ?? "",
      parent_transaction_id: r.parent_transaction_id ?? null,
    });
  };

  // (1) mesmo grupo — filhas de uma transação-mãe conhecida
  if (params.parentTransactionId) {
    const { data, error } = await supabase
      .from("transactions")
      .select(cols)
      .eq("parent_transaction_id", params.parentTransactionId);
    if (error) throw error;
    (data ?? []).forEach(keep);
  }

  // (1b) mesmo installment_group_id, quando conhecido
  if (params.installmentGroupId) {
    const { data, error } = await supabase
      .from("transactions")
      .select(cols)
      .eq("installment_group_id", params.installmentGroupId);
    if (error) throw error;
    (data ?? []).forEach(keep);
  }

  // (2) parcelamento estrutural já existente para o mesmo documento
  const base = normalizeDescription(stripInstallmentSuffix(params.description));
  if (base) {
    let q = supabase
      .from("transactions")
      .select(cols)
      .not("installment_group_id", "is", null)
      .limit(500);
    q = params.eventId ? q.eq("event_id", params.eventId) : q.is("event_id", null);
    q = params.supplierId ? q.eq("supplier_id", params.supplierId) : q.is("supplier_id", null);
    const { data, error } = await q;
    if (error) throw error;
    (data ?? [])
      .filter(
        (r: any) => normalizeDescription(stripInstallmentSuffix(r.description)) === base,
      )
      .forEach(keep);
  }


  return [...found.values()];
}

export function existingInstallmentsMessage(count: number): string {
  return `Este documento já tem parcelas geradas (${count} encontradas). Apaga ou edita as existentes em vez de gerar novas.`;
}
