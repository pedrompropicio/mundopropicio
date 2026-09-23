import { describe, it, expect } from "vitest";
import { nonAccountingOrFilter, normalizeAccountFilter } from "@/lib/accountant-account-filter";

describe("nonAccountingOrFilter", () => {
  it("não filtra quando não há contas gerenciais", () => {
    expect(nonAccountingOrFilter([])).toBeNull();
  });

  it("mantém transações sem conta e exclui as gerenciais", () => {
    expect(nonAccountingOrFilter(["a", "b"])).toBe("account_id.is.null,account_id.not.in.(a,b)");
  });
});

describe("normalizeAccountFilter", () => {
  it("deixa passar 'all'", () => {
    expect(normalizeAccountFilter("all", ["a"])).toBe("all");
  });

  it("trata conta gerencial como 'all'", () => {
    expect(normalizeAccountFilter("a", ["a"])).toBe("all");
  });

  it("mantém conta contábil", () => {
    expect(normalizeAccountFilter("c", ["a", "b"])).toBe("c");
  });
});
