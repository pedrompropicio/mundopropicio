/**
 * Leitura ÚNICA dos dados bancários de fornecedores (IBAN/SWIFT).
 *
 * As colunas `iban`, `swift_bic`, `iban_2`, `swift_bic_2`, `iban_3`,
 * `swift_bic_3` de `public.suppliers` já NÃO são legíveis pela API com a role
 * `authenticated` (column-level REVOKE). O único caminho é a RPC
 * `get_supplier_bank_details`, SECURITY DEFINER, com verificação explícita de
 * papel (admin / platform_admin / manager / editor / accountant) e isolamento
 * por `company_id` via `current_company_id()`.
 *
 * Quem não tem papel elegível recebe simplesmente uma lista vazia — nada
 * estoura, os ecrãs mostram "Sem IBAN"/vazio.
 */
import { supabase } from "@/integrations/supabase/client";

export type SupplierBank = {
  id: string;
  name: string | null;
  nif: string | null;
  iban: string | null;
  swift_bic: string | null;
  iban_2: string | null;
  swift_bic_2: string | null;
  iban_3: string | null;
  swift_bic_3: string | null;
};

/** Colunas cadastrais de `suppliers` legíveis por qualquer membro do tenant. */
export const SUPPLIER_BASE_COLUMNS =
  "id, name, nif, contact_name, email, phone, address, payment_terms, category, notes, is_active, created_at, updated_at, trade_name, is_partner, company_id";

const EMPTY_BANK: Omit<SupplierBank, "id" | "name" | "nif"> = {
  iban: null,
  swift_bic: null,
  iban_2: null,
  swift_bic_2: null,
  iban_3: null,
  swift_bic_3: null,
};

/** Linhas bancárias dos fornecedores pedidos (ou de todos, se `ids` for null). */
export async function fetchSupplierBankRows(ids?: string[] | null): Promise<SupplierBank[]> {
  const p_supplier_ids = ids && ids.length ? Array.from(new Set(ids)) : null;
  if (ids && ids.length === 0) return [];
  const { data, error } = await (supabase as any).rpc("get_supplier_bank_details", { p_supplier_ids });
  if (error) {
    // Papel sem acesso a dados bancários: degrada em vazio, não quebra o ecrã.
    if (error.code === "42501" || /permission denied/i.test(error.message ?? "")) return [];
    throw error;
  }
  return (data ?? []) as SupplierBank[];
}

export async function fetchSupplierBankMap(ids?: string[] | null): Promise<Map<string, SupplierBank>> {
  const rows = await fetchSupplierBankRows(ids);
  return new Map(rows.map((r) => [r.id, r]));
}

/** Junta os campos bancários a linhas de fornecedor (por `id`). */
export function mergeSupplierBank<T extends { id: string }>(
  rows: T[],
  bank: Map<string, SupplierBank>,
): (T & Omit<SupplierBank, "id" | "name" | "nif">)[] {
  return rows.map((r) => {
    const b = bank.get(r.id);
    return {
      ...r,
      iban: b?.iban ?? null,
      swift_bic: b?.swift_bic ?? null,
      iban_2: b?.iban_2 ?? null,
      swift_bic_2: b?.swift_bic_2 ?? null,
      iban_3: b?.iban_3 ?? null,
      swift_bic_3: b?.swift_bic_3 ?? null,
    };
  });
}

/**
 * Junta os campos bancários ao objeto embutido `suppliers` de linhas de
 * transação (ou equivalente), preservando a forma que o resto do código já
 * espera (`tx.suppliers.iban`, resolvePaymentIban, ficheiro SEPA, etc.).
 */
export function mergeEmbeddedSupplierBank<T extends { supplier_id?: string | null; suppliers?: any }>(
  rows: T[],
  bank: Map<string, SupplierBank>,
): T[] {
  return rows.map((r) => {
    if (!r.suppliers) return r;
    const id = (r.supplier_id ?? r.suppliers?.id) as string | undefined;
    const b = id ? bank.get(id) : undefined;
    return { ...r, suppliers: { ...r.suppliers, ...EMPTY_BANK, ...(b ?? {}) } };
  });
}

/** Ids de fornecedor presentes numa lista de transações. */
export function collectSupplierIds(rows: { supplier_id?: string | null }[]): string[] {
  return Array.from(new Set(rows.map((r) => r.supplier_id).filter(Boolean) as string[]));
}

/**
 * Enriquece IN-PLACE o objeto embutido `suppliers` de linhas de transação já
 * carregadas (usado quando as linhas são partilhadas por referência).
 */
export async function attachSupplierBankToTxRows(
  txRows: { supplier_id?: string | null; suppliers?: any }[],
): Promise<void> {
  const bank = await fetchSupplierBankMap(collectSupplierIds(txRows));
  for (const tx of txRows) {
    if (!tx.suppliers) continue;
    const id = (tx.supplier_id ?? tx.suppliers?.id) as string | undefined;
    const b = id ? bank.get(id) : undefined;
    Object.assign(tx.suppliers, EMPTY_BANK, b ?? {});
  }
}
