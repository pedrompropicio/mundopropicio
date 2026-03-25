import { describe, expect, it } from "vitest";
import {
  createExpenseCategoryMatcher,
  getExpenseLeafCategories,
  normalizeCategoryCodeKey,
  type ExpenseCategoryLite,
} from "../pl-category-matching";

const categories: ExpenseCategoryLite[] = [
  { id: "parent", code: "2.6", name: "Operação Complementar", type: "expense", parent_id: null },
  { id: "tick", code: "2.6.07", name: "Ticketeira", type: "expense", parent_id: "parent" },
  { id: "digital", code: "3.1.05", name: "Digital", type: "expense", parent_id: null },
  { id: "internal", code: "10.3", name: "Transferências Internas", type: "expense", parent_id: null },
];

describe("getExpenseLeafCategories", () => {
  it("keeps real expense leaves even when code has only two levels", () => {
    expect(getExpenseLeafCategories(categories).map((category) => category.code)).toEqual(["2.6.07", "3.1.05", "10.3"]);
  });
});

describe("normalizeCategoryCodeKey", () => {
  it("normalizes leading zeros in code segments", () => {
    expect(normalizeCategoryCodeKey("2.6.07")).toBe("2.6.7");
    expect(normalizeCategoryCodeKey("2.6.7")).toBe("2.6.7");
  });
});

describe("createExpenseCategoryMatcher", () => {
  const matcher = createExpenseCategoryMatcher(categories);

  it("matches operational categories by synonym", () => {
    expect(matcher({ description: "Comissão Ticketline", specification: null })).toBe("tick");
  });

  it("uses specification when description is generic", () => {
    expect(matcher({ description: "Serviços", specification: "Campanha Instagram e Meta Ads" })).toBe("digital");
  });

  it("matches non-operational leaf categories", () => {
    expect(matcher({ description: "Repasse interno entre contas", specification: null })).toBe("internal");
  });
});