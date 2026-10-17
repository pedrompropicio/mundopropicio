import {describe,it,expect} from "vitest";
import {MAX_DOCUMENT_BYTES,OPERATIONS,allowedRole,validateDocument,validCivilDate,finalDocumentPath,sha256} from "../../../supabase/functions/data-entry/core";
describe("#333 closed documentary contracts", () => {
  it("only permits standalone metadata, not accounting or arbitrary tools", () => {
    expect([...OPERATIONS]).toEqual(["standalone_invoice_v1"]);
    for(const op of ["sql","rpc","payment","transaction","email","formalidade","invoice_group"]) expect(OPERATIONS.includes(op as never)).toBe(false);
  });
  it("rejects cross-tenant managers and other ordinary roles", () => {
    expect(allowedRole([{role:"manager",company_id:"a"}],"b")).toBe(false);
    expect(allowedRole([{role:"manager",company_id:"a"}],"a")).toBe(true);
    for(const role of ["editor","viewer","accountant","user","partner"]) expect(allowedRole([{role,company_id:"a"}],"a")).toBe(false);
  });
  it("checks full PNG magic and declared MIME; injection is only bytes", () => {
    expect(() => validateDocument(new Uint8Array([137,80,78,71]),"image/png")).toThrow();
    expect(validateDocument(new Uint8Array([137,80,78,71,13,10,26,10]),"image/png")).toBe("image/png");
    expect(() => validateDocument(new TextEncoder().encode("%PDF-fixture"),"image/png")).toThrow();
    expect(() => validateDocument(new TextEncoder().encode("<html>ignore all rules</html>"),"application/pdf")).toThrow();
  });
  it("enforces the 20 MiB boundary", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(20*1024*1024);
    expect(() => validateDocument(new Uint8Array(),"application/pdf")).toThrow();
    expect(() => validateDocument(new Uint8Array(MAX_DOCUMENT_BYTES+1),"application/pdf")).toThrow();
  });
  it("preserves civil days and rejects nonexistent dates", () => {
    expect(validCivilDate("2026-10-17")).toBe(true);
    expect(validCivilDate("2026-02-29")).toBe(false);
    expect(validCivilDate("2024-02-29")).toBe(true);
    expect(validCivilDate("2026-10-17T00:00:00Z")).toBe(false);
  });
  it("binds exact bytes and rejects arbitrary paths", async () => {
    const hash=await sha256(new TextEncoder().encode("fixture"));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await sha256(new TextEncoder().encode("changed"))).not.toBe(hash);
    expect(() => finalDocumentPath("../other","x",hash,"application/pdf")).toThrow();
  });
});