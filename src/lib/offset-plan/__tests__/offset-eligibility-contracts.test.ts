import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OFFSET_ERROR_MESSAGES, offsetErrorMessage, parseOffsetErrorCode } from "../index";
import { checkOffsetEligibility, type OffsetEligibilitySnapshot } from "../eligibility";
import { canApplyOffset, canReverseOffset, offsetControlLevel } from "../contracts";

const CORE = resolve(__dirname, "../../../../supabase/manual/20261021_issue335_offset_core.INERTE.sql");

describe("mapa de erros vs SQL do núcleo", () => {
  const sql = readFileSync(CORE, "utf8");
  // Maiúsculas e minúsculas ("RAISE"/"raise"); só identificadores em minúsculas seguidos de ':' ou "'".
  const codes = [
    ...new Set(
      [...sql.matchAll(/raise exception '([A-Za-z][A-Za-z0-9_]*)(?=[:'])/gi)]
        .map((m) => m[1])
        .filter((c) => /^[a-z0-9_]+$/.test(c)),
    ),
  ];
  it("lê códigos do núcleo", () => expect(codes.length).toBeGreaterThan(30));
  it.each(codes)("código %s tem mensagem", (c) => {
    expect((OFFSET_ERROR_MESSAGES as Record<string, string>)[c]).toBeTruthy();
  });
  it("mensagem pedida para encontro_desativado", () =>
    expect(offsetErrorMessage("encontro_desativado")).toBe("Encontros de contas estão temporariamente desativados."));
  it("aceita 'code: detalhe'", () => {
    expect(parseOffsetErrorCode("too_many_items: máximo 50")).toBe("too_many_items");
    expect(offsetErrorMessage("installation_order: balance_candidate_required")).toBe(
      OFFSET_ERROR_MESSAGES.installation_order,
    );
  });
  it("fallback com código para erro não mapeado", () =>
    expect(offsetErrorMessage("23503")).toContain("23503"));
});

const base: OffsetEligibilitySnapshot = { id: "t", kind: "transaction", open_amount: 100, currency: "EUR" };
const code = (x: Partial<OffsetEligibilitySnapshot>) => checkOffsetEligibility({ ...base, ...x }).code;

describe("elegibilidade", () => {
  it("dívida simples EUR é elegível", () => expect(checkOffsetEligibility(base).eligible).toBe(true));
  it("sem dívida", () => expect(code({ open_amount: 0 })).toBe("no_open_debt"));
  it("moeda não EUR", () => expect(code({ currency: "BRL" })).toBe("unsupported_debt"));
  it.each(["has_installments", "has_credit", "has_withholding", "has_fx", "has_planned_payments"] as const)(
    "%s recusa",
    (k) => expect(code({ [k]: true })).toBe("unsupported_debt"),
  );
  it.each(["reimbursement", "card", "aporte", "shared_cost", "transitory"] as const)("perna %s recusa", (l) =>
    expect(code({ leg_type: l })).toBe("unsupported_debt"),
  );
  it("camarim", () => expect(code({ leg_type: "camarim" })).toBe("camarim_leg_unsupported"));
  it("3 casas decimais", () => expect(code({ open_amount: 10.005 })).toBe("document_precision_unsupported"));
  it("evento fechado", () => expect(code({ event_closed: true })).toBe("event_closed"));
  it("acerto selado", () => expect(code({ settlement_sealed: true })).toBe("sealed_settlement"));
  it("conta inconsistente mantém recusa com lista", () => {
    const r = checkOffsetEligibility({ ...base, cash_account_inconsistent: true });
    expect(r.code).toBe("cash_account_inconsistent");
    expect(r.checklist.length).toBeGreaterThan(0);
  });
  it("BP partilhado / vínculo negado / indisponível", () => {
    expect(code({ kind: "forecast", forecast_shared: true })).toBe("forecast_shared_no_creation");
    expect(code({ kind: "forecast", forecast_link_denied: true })).toBe("forecast_link_denied");
    expect(code({ kind: "forecast", available: false })).toBe("forecast_not_available");
    expect(code({ available: false })).toBe("document_not_available");
  });
});

describe("controlo e permissões", () => {
  const N0 = { enabled: true, reverse_enabled: true };
  const N1 = { enabled: false, reverse_enabled: true };
  const N2 = { enabled: false, reverse_enabled: false };
  it("níveis", () => {
    expect(offsetControlLevel(N0)).toBe("N0");
    expect(offsetControlLevel(N1)).toBe("N1");
    expect(offsetControlLevel(N2)).toBe("N2");
  });
  it("aplicar: admin/manager/editor em N0; ninguém em N1", () => {
    for (const r of ["admin", "manager", "editor"]) expect(canApplyOffset([r], N0)).toBe(true);
    expect(canApplyOffset(["viewer"], N0)).toBe(false);
    expect(canApplyOffset(["admin"], N1)).toBe(false);
  });
  it("estornar só admin, fechado em N2", () => {
    expect(canReverseOffset(["admin"], N1)).toBe(true);
    expect(canReverseOffset(["manager"], N0)).toBe(false);
    expect(canReverseOffset(["admin"], N2)).toBe(false);
  });
});
