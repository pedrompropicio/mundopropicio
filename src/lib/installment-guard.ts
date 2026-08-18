import { supabase } from "@/integrations/supabase/client";

/** Padrão "(1/3)" na descrição — marca formal das parcelas antigas. */
export const INSTALLMENT_PATTERN = /\(\s*\d+\s*\/\s*\d+\s*\)/;

/** Remove o sufixo "(n/m)" (e espaços) do fim da descrição. */
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
 * Deteta parcelas "(n/m)" já existentes para o mesmo documento, para bloquear
 * uma segunda geração (caso real: "Hotel Londres" gerado 2× em 25/05).
 *
 * Critérios (OR):
 *  - transações com `parent_transaction_id = parentTransactionId` (mesmo grupo);
 *  - transações do mesmo fornecedor + evento cuja descrição-base (sem sufixo
 *    "(n/m)") é igual à do documento a parcelar e que têm o padrão "(n/m)".
 */
export async function findExistingInstallments(params: {
  eventId?: string | null;
  supplierId?: string | null;
  description: string;
  parentTransactionId?: string | null;
  excludeIds?: string[];
}): Promise<ExistingInstallment[]> {
  const cols = "id, description, amount, due_date, status, parent_transaction_id, is_transitory, split_percentage";
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

  // (2) caso histórico — mesmo fornecedor+evento, mesma descrição-base, com padrão (n/m)
  const base = normalizeDescription(stripInstallmentSuffix(params.description));
  if (base) {
    let q = supabase.from("transactions").select(cols).limit(500);
    q = params.eventId ? q.eq("event_id", params.eventId) : q.is("event_id", null);
    q = params.supplierId ? q.eq("supplier_id", params.supplierId) : q.is("supplier_id", null);
    const { data, error } = await q;
    if (error) throw error;
    (data ?? [])
      .filter(
        (r: any) =>
          INSTALLMENT_PATTERN.test(String(r.description ?? "")) &&
          normalizeDescription(stripInstallmentSuffix(r.description)) === base,
      )
      .forEach(keep);
  }

  return [...found.values()];
}

export function existingInstallmentsMessage(count: number): string {
  return `Este documento já tem parcelas geradas (${count} encontradas). Apaga ou edita as existentes em vez de gerar novas.`;
}
