import { describe, expect, it } from "vitest";
import { calculateStandaloneEur, isStandaloneInvoiceDuplicateError, parseStandaloneAmount, validateStandaloneMonetaryFields } from "../standalone-invoices";

describe("standalone invoice helpers", () => {
  it("calcula o contravalor EUR arredondado", () => {
    expect(calculateStandaloneEur("100", "0,92345")).toBe("92.35");
  });

  it("aceita vírgula e rejeita vazio", () => {
    expect(parseStandaloneAmount("12,50")).toBe(12.5);
    expect(parseStandaloneAmount("")).toBeNull();
  });

  it("reconhece a restrição única de fornecedor e número", () => {
    expect(isStandaloneInvoiceDuplicateError({ code: "23505" })).toBe(true);
    expect(isStandaloneInvoiceDuplicateError({ message: "uq_standalone_invoice_supplier_number" })).toBe(true);
  });

  it("exige total EUR e campos cambiais válidos", () => {
    expect(validateStandaloneMonetaryFields("EUR", "", "", "12,50")).toBeNull();
    expect(validateStandaloneMonetaryFields("EUR", "", "", "")).toContain("total");
    expect(validateStandaloneMonetaryFields("USD", "100", "0,92", "92")).toBeNull();
    expect(validateStandaloneMonetaryFields("USD", "100", "", "92")).toContain("câmbio");
  });
});