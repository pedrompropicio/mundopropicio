import { describe, expect, it } from "vitest";
import { resolveMirrorPartners, type MirrorParticipant } from "../event-partner-mirror";

const base = {
  participant_kind: "partner",
  profit_pct: 0,
  loss_pct: null,
  expense_includes_iva: null,
  can_order: true,
  can_pay: false,
  created_at: "2026-01-01T00:00:00Z",
  is_root: true,
} satisfies Omit<MirrorParticipant, "supplier_id" | "mode">;

describe("resolveMirrorPartners", () => {
  it("prefere o participante que liquida (settles) ao nominal", () => {
    const out = resolveMirrorPartners([
      { ...base, supplier_id: "s1", mode: "nominal", profit_pct: 33.333333, is_root: false },
      { ...base, supplier_id: "s1", mode: "settles", profit_pct: 70, loss_pct: 90 },
    ]);
    expect(out).toEqual([
      {
        supplier_id: "s1",
        percentage: 70,
        loss_percentage: 90,
        expense_includes_iva: null,
        can_order: true,
        can_pay: false,
      },
    ]);
  });

  it("usa o nominal quando não há settles, preferindo o fechamento raiz", () => {
    const out = resolveMirrorPartners([
      { ...base, supplier_id: "s2", mode: "nominal", profit_pct: 10, is_root: false, created_at: "2026-01-01T00:00:00Z" },
      { ...base, supplier_id: "s2", mode: "nominal", profit_pct: 25, is_root: true, created_at: "2026-02-01T00:00:00Z" },
    ]);
    expect(out[0].percentage).toBe(25);
  });

  it("com vários nominais fora da raiz usa o mais antigo", () => {
    const out = resolveMirrorPartners([
      { ...base, supplier_id: "s3", mode: "nominal", profit_pct: 5, is_root: false, created_at: "2026-03-01T00:00:00Z" },
      { ...base, supplier_id: "s3", mode: "nominal", profit_pct: 8, is_root: false, created_at: "2026-01-15T00:00:00Z" },
    ]);
    expect(out[0].percentage).toBe(8);
  });

  it("inclui sócios que só existem em fechamentos-filhos e ignora house/sem fornecedor", () => {
    const out = resolveMirrorPartners([
      { ...base, supplier_id: "s4", mode: "settles", profit_pct: 60 },
      { ...base, supplier_id: "s5", mode: "nominal", profit_pct: 30, is_root: false },
      { ...base, supplier_id: null, mode: "settles", profit_pct: 15, participant_kind: "house" },
      { ...base, supplier_id: "s6", mode: "settles", profit_pct: 15, participant_kind: "house" },
    ]);
    expect(out.map((p) => p.supplier_id)).toEqual(["s4", "s5"]);
  });

  it("sócio sem qualquer participação não aparece (é removido do espelho)", () => {
    const out = resolveMirrorPartners([{ ...base, supplier_id: "s7", mode: "settles", profit_pct: 100 }]);
    expect(out.some((p) => p.supplier_id === "s8")).toBe(false);
  });
});
