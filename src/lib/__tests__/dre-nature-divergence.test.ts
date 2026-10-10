import { describe, it, expect } from "vitest";
import { computeNatureDivergence } from "@/lib/dre-nature-divergence";

const cats = [
  { id: "c103", code: "10.3.01", type: "expense" },
  { id: "c108", code: "10.8.01", type: "expense" },
  { id: "c1063", code: "10.6.03", type: "expense" },
  { id: "c101", code: "10.1.01", type: "income" },
  { id: "c26", code: "2.6.07", type: "expense" },
];

describe("computeNatureDivergence (#304)", () => {
  it("conta receita em rubrica de despesa 10* e despesa em rubrica de receita", () => {
    const r = computeNatureDivergence(
      [
        { type: "income", category_id: "c103", amount: 100 },
        { type: "income", category_id: "c108", amount: "58.65" },
        { type: "expense", category_id: "c101", amount: 10 },
        { type: "expense", category_id: "c103", amount: 999 }, // bate: não conta
        { type: "income", category_id: "c1063", amount: 5 }, // Juros Recebidos: excepção
        { type: "income", category_id: "c26", amount: 7 }, // fora do 10*: não conta
        { type: "income", category_id: null, amount: 3 },
      ],
      cats,
    );
    expect(r.count).toBe(3);
    expect(r.total).toBe(168.65);
    expect(r.byType.income).toEqual({ count: 2, total: 158.65 });
    expect(r.byType.expense).toEqual({ count: 1, total: 10 });
  });

  it("vazio quando tudo bate", () => {
    const r = computeNatureDivergence([{ type: "expense", category_id: "c103", amount: 1 }], cats);
    expect(r.count).toBe(0);
    expect(r.total).toBe(0);
  });
});
