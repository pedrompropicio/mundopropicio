import { describe, expect, it } from "vitest";
import { splitPartnerExtrasByKind, type PartnerExtraItem } from "@/lib/partner-extras";

const PARTNER = "ein-partner";

function item(over: Partial<PartnerExtraItem>): PartnerExtraItem {
  return {
    id: "x",
    origem: "manual",
    partner_id: PARTNER,
    event_id: "e1",
    description: "—",
    amount: 0,
    data: "",
    transaction_id: null,
    iva_rate: 0,
    category: null,
    kind: "extra",
    notes: null,
    ...over,
  };
}

describe("(#224) splitPartnerExtrasByKind", () => {
  it("separa extras de ajustes ao desembolso", () => {
    const rows = [
      item({ id: "a", amount: 100, kind: "extra" }),
      item({ id: "b", amount: -34304.72, kind: "disbursement_adjustment" }),
    ];
    const r = splitPartnerExtrasByKind(rows, PARTNER, false);
    expect(r.extras).toBe(100);
    expect(r.adjustments).toBe(-34304.72);
  });

  it("ignora linhas de outro sócio", () => {
    const rows = [
      item({ id: "a", amount: 100 }),
      item({ id: "c", amount: 999, partner_id: "outro" }),
      item({ id: "d", amount: -50, partner_id: "outro", kind: "disbursement_adjustment" }),
    ];
    expect(splitPartnerExtrasByKind(rows, PARTNER, false)).toEqual({ extras: 100, adjustments: 0 });
  });

  it("ajustes nunca levam IVA, mesmo em base c/IVA", () => {
    const rows = [item({ id: "b", amount: -1000, iva_rate: 23, kind: "disbursement_adjustment" })];
    expect(splitPartnerExtrasByKind(rows, PARTNER, true).adjustments).toBe(-1000);
  });
});
