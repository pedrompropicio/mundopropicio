import { describe, it, expect, vi, beforeEach } from "vitest";
import { chunkIds } from "@/lib/chunk-ids";

// Base em memória + registo de cada pedido `.in()`
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
const calls: { table: string; inSize: number }[] = [];
let failTable: string | null = null;

function builder(table: string) {
  let filterCol = "";
  let filterVals: any[] = [];
  const b: any = {
    select: () => b,
    order: () => b,
    in: (col: string, vals: any[]) => {
      filterCol = col;
      filterVals = vals;
      return b;
    },
    range: (from: number, to: number) => run(from, to),
    then: (res: any, rej: any) => run(0, 999).then(res, rej),
  };
  const run = async (from: number, to: number) => {
    calls.push({ table, inSize: filterVals.length });
    if (failTable === table) return { data: null, error: { message: `falha ${table}` } };
    const set = new Set(filterVals);
    const rows = (db[table] ?? []).filter((r) => set.has(r[filterCol]));
    return { data: rows.slice(from, to + 1), error: null };
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t) },
}));

import { fetchAccountantDocCountsBatch } from "@/lib/accountant-tx-docs";

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  calls.length = 0;
  failTable = null;
});

describe("#392 contagem de anexos em blocos", () => {
  it("chunkIds parte 1.545 ids em blocos de no máximo 200", () => {
    const ids = Array.from({ length: 1545 }, (_, i) => `t${i}`);
    const parts = chunkIds(ids);
    expect(parts.length).toBe(8);
    expect(Math.max(...parts.map((p) => p.length))).toBe(200);
    expect(parts.flat()).toEqual(ids);
  });

  it("com 1.545 ids nenhum pedido leva mais de 200 ids e todos os anexos contam", async () => {
    const ids = Array.from({ length: 1545 }, (_, i) => `t${i}`);
    db.transaction_documents = ids.map((id, i) => ({ id: `d${i}`, transaction_id: id, file_url: `c/${id}.pdf` }));
    db.camarim_items = [];
    db.reimbursement_notes = [];
    const counts = await fetchAccountantDocCountsBatch(ids);
    expect(calls.length).toBeGreaterThan(0);
    expect(Math.max(...calls.map((c) => c.inSize))).toBeLessThanOrEqual(200);
    expect(Object.keys(counts).length).toBe(1545);
    expect(counts.t1544).toBe(1);
  });

  it("caso pequeno: contagens iguais às esperadas (diretos + camarim + reembolso)", async () => {
    db.transaction_documents = [
      { id: "a", transaction_id: "t1", file_url: "c/a.pdf" },
      { id: "b", transaction_id: "t1", file_url: "camarim://c/x.jpg" },
      { id: "c", transaction_id: "child", file_url: "c/r.pdf" },
    ];
    db.camarim_items = [{ id: "i1", transaction_id: "t1" }];
    db.camarim_item_documents = [
      { id: "cd1", item_id: "i1", file_path: "c/x.jpg", company_id: "c" }, // duplicado do replicado
      { id: "cd2", item_id: "i1", file_path: "y.jpg", company_id: "c" },
    ];
    db.reimbursement_notes = [{ id: "n1", payment_transaction_id: "t2" }];
    db.reimbursement_note_items = [{ reimbursement_note_id: "n1", transaction_id: "child" }];
    const counts = await fetchAccountantDocCountsBatch(["t1", "t2", "t3"]);
    expect(counts).toEqual({ t1: 3, t2: 1 });
  });

  it.each(["transaction_documents", "camarim_items", "camarim_item_documents", "reimbursement_notes", "reimbursement_note_items"])(
    "erro em %s propaga em vez de devolver 0",
    async (table) => {
      db.transaction_documents = [{ id: "c", transaction_id: "child", file_url: "c/r.pdf" }];
      db.camarim_items = [{ id: "i1", transaction_id: "t1" }];
      db.camarim_item_documents = [];
      db.reimbursement_notes = [{ id: "n1", payment_transaction_id: "t1" }];
      db.reimbursement_note_items = [{ reimbursement_note_id: "n1", transaction_id: "child" }];
      failTable = table;
      await expect(fetchAccountantDocCountsBatch(["t1"])).rejects.toBeTruthy();
    },
  );
});
