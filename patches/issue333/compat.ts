/** INERT prepared ingest adapter: inject existing auth/tenant/FX/validation externally. */
import { equivalent, sameIdentity, type Candidate, type Expected } from "./identity";
export type Store = {
  find(expected: Expected): Promise<Candidate[]>;
  read(path: string): Promise<Uint8Array | null>;
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  insert(row: Expected & { storage_path: string }): Promise<{ id: string; storage_path: string }>;
};
export type Outcome = { status: number; body: Record<string, unknown> };
const conflict = (): Outcome => ({ status: 409, body: { code: "invoice_conflict", error: "Fatura existente: documento ou dados divergentes/insuficientes. Conferência necessária.", reused: false } });
const unknown = (): Outcome => ({ status: 503, body: { code: "result_unknown", error: "Resultado por confirmar. Não repitas; confere a fatura existente.", reused: false } });
export async function persistInvoice(store: Store, expected: Expected, bytes: Uint8Array, mime: string, path: string): Promise<Outcome> {
  const check = async (): Promise<Outcome | null> => {
    const candidates = (await store.find(expected)).filter((c) => sameIdentity(c, expected));
    if (candidates.length === 0) return null;
    if (candidates.length !== 1) return conflict();
    const row = candidates[0];
    if (!row || !await equivalent(row, expected, bytes, store.read)) return conflict();
    return { status: 200, body: { id: row.id, storage_path: row.storage_path, reused: true, verified: true } };
  };
  try {
    const prior = await check(); if (prior) return prior;
    await store.upload(path, bytes, mime);
    const stored = await store.read(path);
    if (!stored || stored.length !== bytes.length || stored.some((b, i) => b !== bytes[i]))
      return { status: 409, body: { code: "storage_unverified", error: "Documento não conferido; nada foi autorizado.", reused: false } };
    try {
      const row = await store.insert({ ...expected, storage_path: path });
      // INSERT success is not final proof: read row and stored bytes back.
      const checked = await check();
      if (!checked || checked.status !== 200 || checked.body.id !== row.id) return unknown();
      return { status: 200, body: { ...row, reused: false, verified: true } };
    } catch (e) {
      // Never remove a candidate on rejection/unknown; no check-then-delete.
      if (typeof e === "object" && e !== null && "code" in e && e.code === "23505") return await check() ?? conflict();
      return unknown();
    }
  } catch { return unknown(); }
}

/** Complete keyset collection for strong lookup, not a silently truncated maybeSingle. */
export async function findStrongCandidates(expected: Expected,
  page: (company: string, after: string | null, size: number) => Promise<Candidate[]>): Promise<Candidate[]> {
  const matches: Candidate[] = []; let after: string | null = null;
  for (;;) {
    const rows = await page(expected.company_id, after, 200);
    for (const row of rows) {
      if (row.company_id !== expected.company_id || (after !== null && row.id <= after)) throw new Error("invalid collection");
      if (sameIdentity(row, expected)) matches.push(row);
      after = row.id;
    }
    if (rows.length < 200) return matches;
  }
}