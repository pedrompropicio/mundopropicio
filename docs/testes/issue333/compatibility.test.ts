import { describe, it, expect, vi } from "vitest";
import { ambiguousIdentity, sameIdentity, strongPart, type Candidate, type Expected } from "../../../patches/issue333/identity";
import { findStrongCandidates, persistInvoice } from "../../../patches/issue333/compat";
import { standaloneWriteError } from "../../../patches/issue333/frontend-lookup";
vi.stubGlobal("fetch", () => { throw new Error("egress prohibited"); });
const bytes = new TextEncoder().encode("fictitious document bytes");
const expected: Expected = { company_id: "A", supplier_nif: "PT001", invoice_number: "FT1/23", supplier_name: "Fictício",
  file_name: "fixture.pdf", invoice_date: "2026-10-17", currency: "EUR", total_amount: 123, iva_amount: 23,
  original_amount: null, fx_rate: null, fx_rate_source: null, notes: "nota", paid_by_partner_id: "payer", created_by: "author" };
function world() {
  const files = new Map<string, Uint8Array>(); let rows: Candidate[] = []; let insertMode = "ok"; let inserts = 0; let uploadMode = "ok";
  const candidate = (over: Record<string, unknown> = {}): Candidate => ({ ...expected, id: "i", storage_path: "A/existing", ...over });
  const store = {
    find: async () => rows,
    get: async (id: string, company: string) => rows.find((r) => r.id === id && r.company_id === company) ?? null,
    read: async (path: string) => files.get(path) ?? null,
    upload: async (path: string, b: Uint8Array) => { if (uploadMode !== "missing") files.set(path, uploadMode === "corrupt" ? new Uint8Array([1]) : b); },
    insert: async (row: Expected & { storage_path: string }) => {
      inserts++;
      if (insertMode === "23505") { rows = [candidate()]; files.set("A/existing", bytes); throw { code: "23505", message: "private SQL" }; }
      if (insertMode === "divergent") { rows = [candidate({ total_amount: 124 })]; files.set("A/existing", bytes); throw { code: "23505" }; }
      rows = [{ ...row, id: "i" }];
      if (insertMode === "unknown") throw new Error("lost response after commit");
      return { id: "i", storage_path: row.storage_path };
    },
  };
  return { store, files, inserts: () => inserts, candidate, set: (r: Candidate[]) => { rows = r; }, mode: (m: string) => { insertMode = m; }, upload: (m: string) => { uploadMode = m; } };
}
describe("#333 proposed strong identity", () => {
  it("ASCII exterior trim/case only; internal separators/zeros/prefixes/nonASCII retained", () => {
    expect(strongPart(" ft1/23 ")).toBe("FT1/23");
    for (const number of ["FT12/3", "FT1-23", "FT 1/23", "FT01/23", "FT1/023"]) expect(sameIdentity(expected, { ...expected, invoice_number: number })).toBe(false);
    expect(sameIdentity(expected, { ...expected, supplier_nif: "001" })).toBe(false);
    expect(strongPart("áA\t")).toBe("áA\t"); expect(strongPart("  ")).toBeNull();
  });
  it("broad ambiguous matches never become strong identity", () => {
    for (const [a,b] of [["FT1/23","FT12/3"],["AB-12","AB1-2"]]) {
      expect(ambiguousIdentity({ ...expected, invoice_number:a }, { ...expected, invoice_number:b })).toBe(true);
      expect(sameIdentity({ ...expected, invoice_number:a }, { ...expected, invoice_number:b })).toBe(false);
    }
  });
  it("complete paginated collection and company filtering, never first-page-only", async () => {
    const first = Array.from({length:200}, (_,i) => ({ ...expected,id:String(i).padStart(3,"0"),storage_path:"A/x",invoice_number:"other" }));
    const pages=vi.fn(async (_c:string,after:string|null) => after === null ? first : [{ ...expected,id:"999",storage_path:"A/x" }]);
    expect((await findStrongCandidates(expected,pages)).map((r)=>r.id)).toEqual(["999"]); expect(pages).toHaveBeenCalledTimes(2);
    await expect(findStrongCandidates(expected,async()=>[{...expected,company_id:"B",id:"1",storage_path:"B/x"}])).rejects.toThrow();
  });
});
describe("#333 prepared ingest/storage compatibility", () => {
  it("reused requires same identity, full metadata AND actual stored bytes, preserves processed state", async () => {
    const w=world(); w.set([w.candidate({ status:"processed" })]); w.files.set("A/existing",bytes);
    const r=await persistInvoice(w.store,expected,bytes,"application/pdf","A/candidate");
    expect(r).toEqual({status:200,body:{id:"i",storage_path:"A/existing",reused:true,verified:true}}); expect(w.inserts()).toBe(0);
  });
  it.each(["file_name","supplier_name","invoice_date","currency","total_amount","iva_amount","notes","paid_by_partner_id","created_by","fx_rate","original_amount","fx_rate_source"])("divergent %s never reused",async(k)=>{
    const w=world();w.set([w.candidate({[k]:k.includes("amount")||k==="fx_rate"?999:"other"})]);w.files.set("A/existing",bytes);
    const r=await persistInvoice(w.store,expected,bytes,"application/pdf","A/candidate");expect(r.status).toBe(409);expect(r.body.reused).toBe(false);expect(w.inserts()).toBe(0);
  });
  it("missing metadata/bytes and corrupt document are conflict, not cached success",async()=>{
    for (const mode of ["missingMetadata","missingBytes","corruptBytes"]) {
      const w=world();w.set([w.candidate(mode==="missingMetadata"?{paid_by_partner_id:null}:{})]);
      if(mode!=="missingBytes") w.files.set("A/existing",mode==="corruptBytes"?new Uint8Array([0]):bytes);
      expect((await persistInvoice(w.store,expected,bytes,"application/pdf","A/candidate")).status).toBe(409);
    }
  });
  it.each(["missing","corrupt"])("upload200 %s has no insert",async(mode)=>{
    const w=world();w.upload(mode);expect((await persistInvoice(w.store,expected,bytes,"application/pdf","A/candidate")).status).toBe(409);expect(w.inserts()).toBe(0);
  });
  it("race 23505 equivalent returns verified only after readback, candidate retained",async()=>{
    const w=world();w.mode("23505");const r=await persistInvoice(w.store,expected,bytes,"application/pdf","A/candidate");
    expect(r.status).toBe(200);expect(r.body.reused).toBe(true);expect(w.files.get("A/candidate")).toEqual(bytes);expect(w.inserts()).toBe(1);
  });
  it("race 23505 divergence returns409 safe/no500/no retry/no removal",async()=>{
    const w=world();w.mode("divergent");const r=await persistInvoice(w.store,expected,bytes,"application/pdf","A/candidate");
    expect(r.status).toBe(409);expect(JSON.stringify(r)).not.toMatch(/private SQL/);expect(w.inserts()).toBe(1);expect(w.files.size).toBe(2);
    expect(standaloneWriteError({code:"23505"})).not.toMatch(/23505/);
  });
  it("unknown after COMMIT returns pending; manual retry reads without new INSERT/removal",async()=>{
    const w=world();w.mode("unknown");expect((await persistInvoice(w.store,expected,bytes,"application/pdf","A/candidate")).status).toBe(503);
    const check=await persistInvoice(w.store,expected,bytes,"application/pdf","A/second");expect(check.body.reused).toBe(true);expect(w.inserts()).toBe(1);expect(w.files.has("A/second")).toBe(false);
  });
  it.each(["USD","BRL","GBP"])("preserves %s explicit FX without BCE/network",async(currency)=>{
    const w=world();const e={...expected,currency,original_amount:100,fx_rate:0.92,fx_rate_source:"fixture fixing",total_amount:92};
    expect((await persistInvoice(w.store,e,bytes,"application/pdf","A/fx")).status).toBe(200);
    expect((await persistInvoice(w.store,e,bytes,"application/pdf","A/fx2")).body.reused).toBe(true);expect(w.inserts()).toBe(1);
  });
  it("legacy creation with optional null keys remains supported; incomplete existing never reused",async()=>{
    const w=world();const e={...expected,supplier_nif:null,invoice_number:null,supplier_name:null,invoice_date:null,iva_amount:null,paid_by_partner_id:null,created_by:null};
    const r=await persistInvoice(w.store,e,bytes,"application/pdf","A/incomplete");expect(r.status).toBe(200);expect(r.body.reused).toBe(false);
  });
});