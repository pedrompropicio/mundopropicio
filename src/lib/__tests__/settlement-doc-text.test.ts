import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_DOC_TERMS,
  inferSettlesSettlementId,
  quotaOriginText,
  settlementDocFileName,
  settlementDocTitle,
} from "@/lib/settlement-doc-text";

const fmt = (v: number) => `${v.toFixed(2)} €`;

describe("documento de fecho sem hierarquia (#146 (f) ponto 1)", () => {
  const text = quotaOriginText(
    {
      parentResult: 100000,
      grossExpenses: true,
      sharePct: 30,
      quota: 30000,
      partnerName: "HENRY VARGAS PRODUCOES LTDA",
      partnerPct: 33.3333,
      partnerShare: 9999.99,
    },
    fmt,
  );

  it("escreve o cálculo contratual", () => {
    expect(text).toBe(
      "Resultado do evento (despesas c/IVA) 100000.00 € · Sócios locais 30% = 30000.00 € · HENRY VARGAS PRODUCOES LTDA 33,3333% = 9999.99 €",
    );
  });

  it("não contém termos de hierarquia nem o nome do fechamento", () => {
    const doc = `${settlementDocTitle("Mágicos Henry&Klaus", "HENRY VARGAS PRODUCOES LTDA")}\n${text}`;
    const lower = doc.toLowerCase();
    FORBIDDEN_DOC_TERMS.forEach((term) => {
      expect(lower).not.toContain(term);
    });
    expect(doc).not.toContain("Teste (apagar)");
    expect(doc).not.toContain("Fechamento do evento");
  });

  it("base s/IVA quando a quota é líquida", () => {
    expect(quotaOriginText({ parentResult: 10, grossExpenses: false, sharePct: 50, quota: 5 }, fmt)).toBe(
      "Resultado do evento (despesas s/IVA) 10.00 € · Sócios locais 50% = 5.00 €",
    );
  });

  it("nome do ficheiro: fechamento só na peça interna", () => {
    expect(
      settlementDocFileName({
        eventName: "Mágicos Henry&Klaus",
        partnerName: "HENRY VARGAS",
        settlementName: "Teste (apagar)",
        multipleSettlements: true,
      }),
    ).toBe("Fecho_M_gicos_Henry_Klaus_HENRY_VARGAS.pdf");

    expect(
      settlementDocFileName({
        eventName: "Mágicos Henry&Klaus",
        settlementName: "Teste (apagar)",
        multipleSettlements: true,
      }),
    ).toBe("Fecho_M_gicos_Henry_Klaus_Teste__apagar_.pdf");

    expect(
      settlementDocFileName({ eventName: "Anitta", settlementName: "Fechamento do evento", multipleSettlements: false }),
    ).toBe("Fecho_Anitta.pdf");
  });

  it("infere o fechamento onde o sócio acerta", () => {
    const rows = [
      { supplier_id: "s1", mode: "nominal", settlement_id: "root" },
      { supplier_id: "s1", mode: "settles", settlement_id: "child" },
      { supplier_id: "s2", mode: "settles", settlement_id: "root" },
    ];
    expect(inferSettlesSettlementId(rows, "s1")).toBe("child");
    expect(inferSettlesSettlementId(rows, "s2")).toBe("root");
    expect(inferSettlesSettlementId(rows, "s3")).toBeNull();
    expect(inferSettlesSettlementId(rows, null)).toBeNull();
  });
});
