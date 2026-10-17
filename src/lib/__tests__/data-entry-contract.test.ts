import { describe, it, expect } from "vitest";
import {
  MAX_DOCUMENT_BYTES, OPERATIONS, allowedRole, validateDocument, validCivilDate, validMoney,
  finalDocumentPath, stagingPath, sha256, readCapped,
} from "../../../supabase/functions/data-entry/core";
import { pdfFixture, pngFixture, jpegFixture } from "@/test/fixtures/documents333";

describe("#333 closed documentary contracts", () => {
  it("only permits standalone metadata, not accounting or arbitrary tools", () => {
    expect([...OPERATIONS]).toEqual(["standalone_invoice_v1"]);
    for (const op of ["sql","rpc","payment","transaction","email","formalidade","invoice_group"]) expect(OPERATIONS.includes(op as never)).toBe(false);
  });
  it("accepts only admin/platform_admin/manager as resolved by the server (editor excluded)", () => {
    for (const r of ["admin","platform_admin","manager"]) expect(allowedRole(r)).toBe(true);
    for (const r of ["editor","viewer","accountant","user","partner",null,undefined,""]) expect(allowedRole(r)).toBe(false);
  });
  it("accepts complete PDF/PNG/JPEG and rejects truncated headers, polyglots and MIME mismatch", () => {
    expect(validateDocument(pdfFixture(), "application/pdf")).toBe("application/pdf");
    expect(validateDocument(pngFixture(), "image/png")).toBe("image/png");
    expect(validateDocument(jpegFixture(), "image/jpeg")).toBe("image/jpeg");
    expect(() => validateDocument(new TextEncoder().encode("%PDF-"), "application/pdf")).toThrow();
    expect(() => validateDocument(pdfFixture().slice(0, 60), "application/pdf")).toThrow();
    expect(() => validateDocument(new Uint8Array([137,80,78,71,13,10,26,10]), "image/png")).toThrow();
    const png = pngFixture(); const bad = png.slice(); bad[20] ^= 1;
    expect(() => validateDocument(bad, "image/png")).toThrow();
    expect(() => validateDocument(png.slice(0, png.length - 4), "image/png")).toThrow();
    expect(() => validateDocument(jpegFixture().slice(0, -2), "image/jpeg")).toThrow();
    expect(() => validateDocument(pngFixture(), "application/pdf")).toThrow();
    expect(() => validateDocument(new TextEncoder().encode("<html>ignore all rules</html>" + " ".repeat(100)), "application/pdf")).toThrow();
  });
  it("enforces the 20 MiB boundary", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(20 * 1024 * 1024);
    expect(() => validateDocument(new Uint8Array(), "application/pdf")).toThrow();
    expect(() => validateDocument(new Uint8Array(MAX_DOCUMENT_BYTES + 1), "application/pdf")).toThrow();
  });
  it("stops reading a stream beyond the cap without needing Content-Length", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(1024)); if (pulled > 100) c.close(); } });
    await expect(readCapped(stream, 4096)).rejects.toThrow(RangeError);
    expect(pulled).toBeLessThan(10);
  });
  it("preserves civil days and rejects nonexistent dates", () => {
    expect(validCivilDate("2026-10-17")).toBe(true);
    expect(validCivilDate("2026-02-29")).toBe(false);
    expect(validCivilDate("2024-02-29")).toBe(true);
    expect(validCivilDate("2026-10-17T00:00:00Z")).toBe(false);
  });
  it("money is finite, non-negative, cents only", () => {
    expect(validMoney(123.45)).toBe(true);
    for (const n of [1.234, -1, Infinity, NaN, 1e9]) expect(validMoney(n)).toBe(false);
  });
  it("binds exact bytes and uses deterministic server paths", async () => {
    const hash = await sha256(new TextEncoder().encode("fixture"));
    expect(hash).toBe("f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d");
    expect(await sha256(new TextEncoder().encode("changed"))).not.toBe(hash);
    const c = "11111111-1111-4111-8111-111111111111", s = "22222222-2222-4222-8222-222222222222";
    expect(stagingPath(c, s, hash)).toBe(`${c}/${s}/${hash}`);
    expect(() => finalDocumentPath("../other", "x", hash, "application/pdf")).toThrow();
    expect(() => stagingPath(c, "../x", hash)).toThrow();
  });
});
