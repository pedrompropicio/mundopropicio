import { describe, it, expect } from "vitest";
import { computeReviewCounts } from "@/lib/accountant-review-counts";

const map = {
  a: { status: "conferido" },
  b: { status: "pendente" },
  c: { status: "encerrada" },
};

describe("computeReviewCounts (#396)", () => {
  it("lista filtrada com 1 transacção dá 1 no estado respectivo e 0 nos outros", () => {
    expect(computeReviewCounts([{ id: "a" }], map)).toEqual({ conferidas: 1, pendentes: 0, encerradas: 0, porConferir: 0 });
    expect(computeReviewCounts([{ id: "z" }], map)).toEqual({ conferidas: 0, pendentes: 0, encerradas: 0, porConferir: 1 });
  });
  it("lista completa conta todos os estados", () => {
    expect(computeReviewCounts([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], map))
      .toEqual({ conferidas: 1, pendentes: 1, encerradas: 1, porConferir: 1 });
  });
});
