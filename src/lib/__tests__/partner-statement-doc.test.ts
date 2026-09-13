import { describe, expect, it } from "vitest";
import {
  buildPartnerStatementDoc,
  FORBIDDEN_DOC_TERMS,
  type PartnerStatementDocInput,
} from "../partner-statement-doc";
import { buildStatementWorkbook } from "../export-partner-statement-doc";

const base: PartnerStatementDocInput = {
  eventName: "Anitta - EDA 2026",
  eventDate: "2026-08-31",
  eventLocation: "Oeiras",
  recipientName: "ANITTA",
  participants: [
    { name: "ANITTA", percentage: 70 },
    { name: "RAFAEL LOBO", percentage: 10 },
    { name: "MUNDO PROPÍCIO", percentage: 20, isHouse: true },
  ],
  categories: [],
  usesGrossExpenses: true,
  revenues: [{ origin: "Bilheteira", description: "Sessão 1 · Plateia", net: 1000 }],
  expenseLines: [{ categoryId: null, description: "Som", base: 100, ivaRate: 23 }],
  resultOverride: 596133.45,
  recipientShareOverride: 417293.42,
};

describe("(g4) documento do sócio — estanque", () => {
  it("colapsa os outros participantes em 'Sócios locais' com o complemento da percentagem", () => {
    const doc = buildPartnerStatementDoc(base);
    expect(doc.agreement.map((r) => r.name)).toEqual(["ANITTA", "Sócios locais"]);
    expect(doc.agreement[0].percentage).toBe(70);
    expect(doc.agreement[1].percentage).toBe(30);
  });

  it("num acordo bilateral com a casa escreve 'Mundo Propício'", () => {
    const doc = buildPartnerStatementDoc({
      ...base,
      recipientName: "EVERYTHINGISNEW",
      participants: [
        { name: "EVERYTHINGISNEW", percentage: 50 },
        { name: "MUNDO PROPÍCIO", percentage: 50, isHouse: true },
      ],
    });
    expect(doc.agreement.map((r) => r.name)).toEqual(["EVERYTHINGISNEW", "Mundo Propício"]);
  });

  it("nunca revela nomes, níveis nem outras bases", () => {
    const doc = buildPartnerStatementDoc(base);
    const text = JSON.stringify(doc).toLowerCase();
    expect(text).not.toContain("rafael");
    expect(text).not.toContain("mundo propício");
    for (const term of FORBIDDEN_DOC_TERMS) expect(text).not.toContain(term.toLowerCase());
  });

  it("a parte do destinatário e a dos outros somam o resultado ao cêntimo", () => {
    const doc = buildPartnerStatementDoc({ ...base, resultOverride: 100, recipientShareOverride: undefined });
    expect(doc.recipientShare + doc.othersShare).toBeCloseTo(100, 2);
  });

  it("usa pt-BR quando pedido", () => {
    const doc = buildPartnerStatementDoc({ ...base, locale: "pt-BR" });
    expect(doc.locale).toBe("pt-BR");
    expect(JSON.stringify(doc.t)).toContain("Bilheteria");
  });
});

describe("(g4) planilha do documento", () => {
  it("tem 2 folhas, sem fórmulas e sem protecção de livro", async () => {
    const doc = buildPartnerStatementDoc(base);
    const wb = await buildStatementWorkbook(doc);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo do Fecho", "Detalhamento"]);
    expect((wb as any).workbookProtection).toBeFalsy();
    wb.worksheets.forEach((ws) =>
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          expect((cell as any).formula).toBeUndefined();
        }),
      ),
    );
  });
});
