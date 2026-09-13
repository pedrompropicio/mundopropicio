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

/** (g4 adenda 13/09) Secção 5 — base a transferir e IVA 23% do repasse. */
describe("(g4 adenda) base a transferir", () => {
  const base = {
    eventName: "Evento X",
    eventDate: "2026-08-31",
    recipientName: "EVERYTHINGISNEW",
    participants: [
      { name: "EVERYTHINGISNEW", percentage: 50 },
      { name: "MUNDO PROPÍCIO", percentage: 50, isHouse: true },
    ],
    revenues: [{ origin: "Bilheteira", net: 1000 }],
    expenseLines: [],
    categories: [],
    usesGrossExpenses: false,
    resultOverride: 547906.69,
    recipientShareOverride: 273953.35,
  } as any;

  it("soma pagas e abate extras e adiantamentos", () => {
    const doc = buildPartnerStatementDoc({ ...base, paidByPartner: 10000, partnerExtras: 1500, partnerAdvances: 2500 });
    expect(doc.transferBase).toBeCloseTo(273953.35 + 10000 - 1500 - 2500, 2);
    expect(doc.transferVat).toBe(0);
    expect(doc.transferTotal).toBeCloseTo(doc.transferBase, 2);
  });

  it("acrescenta IVA 23% quando o repasse é facturado", () => {
    const doc = buildPartnerStatementDoc({ ...base, paidByPartner: 0, transferWithVat: true });
    expect(doc.transferBase).toBeCloseTo(273953.35, 2);
    expect(doc.transferVat).toBeCloseTo(63009.27, 2);
    expect(doc.transferTotal).toBeCloseTo(336962.62, 2);
  });

  it("não aplica IVA quando a base é negativa", () => {
    const doc = buildPartnerStatementDoc({
      ...base,
      recipientShareOverride: -1000,
      partnerAdvances: 500,
      transferWithVat: true,
    });
    expect(doc.transferBase).toBeCloseTo(-1500, 2);
    expect(doc.transferVat).toBe(0);
  });
});
