/** Prepared destination: src/lib/standalone-identity-lookup.ts. Not wired yet. */
import { findStrongCandidates } from "./compat";
import type { Candidate, Expected } from "./identity";
export async function lookupStandalone(client: { from(table: string): any }, expected: Expected, exclude?: string) {
  const rows = await findStrongCandidates(expected, async (company, after, size) => {
    let q = client.from("standalone_invoices").select("id,company_id,supplier_nif,invoice_number")
      .eq("company_id", company).order("id", { ascending: true }).limit(size);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Candidate[];
  });
  return rows.some((r) => r.id !== exclude);
}
export const standaloneWriteError = (e: { code?: string } | null | undefined) =>
  e?.code === "23505" || e?.code === "DUPLICATE_INVOICE"
    ? "Esta identidade de fatura já existe. Confere o documento e os dados; nada foi reutilizado automaticamente."
    : "Resultado por confirmar. Confere a lista antes de tentar novamente.";