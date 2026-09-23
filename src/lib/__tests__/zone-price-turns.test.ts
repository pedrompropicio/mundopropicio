import { describe, expect, it } from "vitest";
import { detectPriceTurns } from "@/lib/zone-price-turns";

describe("detectPriceTurns", () => {
  it("preço estável não gera viradas", () => {
    expect(
      detectPriceTurns([
        { sale_date: "2026-01-01", price: 45 },
        { sale_date: "2026-01-02", price: 45 },
        { sale_date: "2026-01-05", price: 45 },
      ]),
    ).toEqual([]);
  });

  it("detecta duas viradas, por ordem de data e fora de ordem na entrada", () => {
    expect(
      detectPriceTurns([
        { sale_date: "2026-01-10", price: 50 },
        { sale_date: "2026-01-01", price: 35 },
        { sale_date: "2026-01-04", price: 45 },
      ]),
    ).toEqual([
      { sale_date: "2026-01-04", from: 35, to: 45 },
      { sale_date: "2026-01-10", from: 45, to: 50 },
    ]);
  });

  it("ignora dias sem preço e aceita descidas", () => {
    expect(
      detectPriceTurns([
        { sale_date: "2026-01-01", price: 65 },
        { sale_date: "2026-01-02", price: null },
        { sale_date: "2026-01-03", price: 60 },
      ]),
    ).toEqual([{ sale_date: "2026-01-03", from: 65, to: 60 }]);
  });
});
