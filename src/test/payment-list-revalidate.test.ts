import { describe, it, expect } from "vitest";
import { findNotInActiveList, notInListMessage } from "@/lib/payment-list-revalidate";

describe("revalidação da lista ao liquidar (P0 24/09/2026)", () => {
  const active = Array.from({ length: 21 }, (_, i) => `tx-${i}`);
  it("recusa os dois removidos depois da aprovação (Rider e Delay)", () => {
    const selected = [...active, "tx-rider", "tx-delay"];
    const missing = findNotInActiveList(selected, active);
    expect(missing).toEqual(["tx-rider", "tx-delay"]);
    expect(notInListMessage(missing.length)).toBe(
      "2 transação(ões) já não estão nesta lista (removidas). Recarrega a lista antes de liquidar.",
    );
  });
  it("aceita seleção só de ativos", () => {
    expect(findNotInActiveList(active, active)).toEqual([]);
  });
});
