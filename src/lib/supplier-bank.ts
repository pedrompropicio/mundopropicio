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

/** BR fields extend the open slot schema documented by 0302. Keep numbers as text. */
export interface BrBankDetails {
  bank_name?: string;
  routing_number?: string;
  account_number?: string;
  account_digit?: string;
  account_kind?: "corrente" | "poupanca";
  pix_key?: string;
}
export interface BrBankSlot extends BrBankDetails {
  slot: number;
  account_type: "br_banco_agencia_conta";
}
export function readBrBankSlots(value: unknown): BrBankSlot[] {
  return Array.isArray(value) ? value.filter((v): v is BrBankSlot =>
    v && typeof v === "object" && v.account_type === "br_banco_agencia_conta" && [1, 2, 3].includes(v.slot)) : [];
}

export interface SupplierBrData {
  foreign_bank_accounts: unknown[];
  tax_id_foreign: string | null;
  tax_id_type: string | null;
}
export type OptionalSupplierBrData = { available: boolean; details: SupplierBrData | null };
type BankRpcResult = { data: unknown; error: unknown };
export interface SupplierBrReader {
  rpc(name: "get_supplier_bank_details", args: { p_supplier_ids: string[] }): {
    select(columns: string): PromiseLike<BankRpcResult>;
  };
}

/** Validate the selected supplier and all three fields, preserving the complete slot JSON. */
export function projectSupplierBrData(data: unknown, id?: string): OptionalSupplierBrData {
  const unavailable = { available: false, details: null };
  if (!Array.isArray(data)) return unavailable;
  if (!id) return { available: data.length === 0, details: null };
  if (data.length !== 1) return unavailable;
  const row = data[0];
  if (!row || row.id !== id || !Array.isArray(row.foreign_bank_accounts)
    || !(row.tax_id_foreign === null || typeof row.tax_id_foreign === "string")
    || !(row.tax_id_type === null || typeof row.tax_id_type === "string")) return unavailable;
  return { available: true, details: {
    foreign_bank_accounts: row.foreign_bank_accounts,
    tax_id_foreign: row.tax_id_foreign, tax_id_type: row.tax_id_type,
  } };
}

/** Injectable RPC-only reader; optional data failures must never block cadastral edits. */
export async function readOptionalSupplierBrData(client: SupplierBrReader, id?: string): Promise<OptionalSupplierBrData> {
  try {
    const { data, error } = await client.rpc("get_supplier_bank_details", { p_supplier_ids: id ? [id] : [] })
      // This projection validates the RPC contract even for the empty creation probe.
      .select("id,foreign_bank_accounts,tax_id_foreign,tax_id_type");
    return error ? { available: false, details: null } : projectSupplierBrData(data, id);
  } catch {
    return { available: false, details: null };
  }
}

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
