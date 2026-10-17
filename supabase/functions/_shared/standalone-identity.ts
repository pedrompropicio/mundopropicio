/** INERT #333 proposal. Not imported by deployed application/functions. */
export const strongPart = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const text = value.replace(/^ +| +$/g, "").replace(/[a-z]/g, (c) => c.toUpperCase());
  return text === "" ? null : text;
};
export type Identity = { company_id: string; supplier_nif: string | null; invoice_number: string | null };
export function sameIdentity(a: Identity, b: Identity): boolean {
  const nif = strongPart(a.supplier_nif), number = strongPart(a.invoice_number);
  return nif !== null && number !== null && a.company_id === b.company_id
    && nif === strongPart(b.supplier_nif) && number === strongPart(b.invoice_number);
}
/** Review signal ONLY; never use for lookup/reused/index/automatic conflict. */
export const broadPart = (text: string | null) => text?.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || null;
export const ambiguousIdentity = (a: Identity, b: Identity) => !sameIdentity(a, b)
  && a.company_id === b.company_id && broadPart(a.supplier_nif) !== null && broadPart(a.invoice_number) !== null
  && broadPart(a.supplier_nif) === broadPart(b.supplier_nif) && broadPart(a.invoice_number) === broadPart(b.invoice_number);

export type Candidate = Identity & Record<string, unknown> & { id: string; storage_path: string };
export type Expected = Identity & Record<string, unknown>;
const exact = ["file_name", "supplier_name", "invoice_date", "currency", "fx_rate_source", "notes", "paid_by_partner_id", "created_by"];
const numeric = ["total_amount", "iva_amount", "original_amount", "fx_rate"];
const required = ["file_name", "supplier_name", "invoice_date", "currency", "total_amount", "iva_amount", "paid_by_partner_id", "created_by"];
export async function equivalent(candidate: Candidate, expected: Expected, bytes: Uint8Array,
  read: (path: string) => Promise<Uint8Array | null>, reuse = true): Promise<boolean> {
  if (reuse && (!sameIdentity(candidate, expected) || required.some((k) => expected[k] == null || expected[k] === "" || candidate[k] == null))) return false;
  if (!reuse && (candidate.company_id !== expected.company_id || candidate.supplier_nif !== expected.supplier_nif || candidate.invoice_number !== expected.invoice_number)) return false;
  if (exact.some((k) => (candidate[k] ?? null) !== (expected[k] ?? null))) return false;
  for (const k of numeric) {
    const a = candidate[k] ?? null, b = expected[k] ?? null;
    if (a === null || b === null) { if (a !== b) return false; }
    else if (![a,b].every((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && /^-?\d+(\.\d+)?$/.test(v)))
      || !Number.isFinite(Number(a)) || !Number.isFinite(Number(b)) || Number(a) !== Number(b)) return false;
  }
  // Both objects read now; no cached checksums or filename/size-only proof.
  const stored = await read(candidate.storage_path);
  if (!stored || stored.length !== bytes.length || bytes.length === 0) return false;
  const hash = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(b).buffer))).map((x) => x.toString(16).padStart(2, "0")).join("");
  return await hash(stored) === await hash(bytes);
}