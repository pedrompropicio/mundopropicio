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
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Detalhamento"]);
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

/**
 * (g9c · #166) Vocabulário do documento — gerado para os 3 sócios da Anitta,
 * nas duas línguas e nas duas bases, nenhum termo proibido pode aparecer
 * (nem "fechamento"/"fecho", nem os extras de devolução).
 */
describe("(g9c) vocabulário do documento", () => {
  const participants = [
    { name: "ANITTA", percentage: 70 },
    { name: "RAFAEL LOBO", percentage: 10 },
    { name: "MUNDO PROPÍCIO", percentage: 20, isHouse: true },
  ];
  const extras = [
    { label: "Quota contratual do acordo", value: 1000 },
    { label: "IVA dedutível recuperado", value: 250 },
    { label: "Custos internos da sociedade", value: 500 },
    { label: "Activos adicionais", value: 100 },
  ];

  for (const recipient of ["ANITTA", "RAFAEL LOBO", "MUNDO PROPÍCIO"]) {
    for (const locale of ["pt-PT", "pt-BR"] as const) {
      for (const usesGrossExpenses of [true, false]) {
        it(`${recipient} · ${locale} · ${usesGrossExpenses ? "c/IVA" : "s/IVA"} sem termos proibidos`, async () => {
          const doc = buildPartnerStatementDoc({
            ...base,
            locale,
            usesGrossExpenses,
            recipientName: recipient,
            participants,
            extras,
            paidByPartner: 5000,
            partnerAdvances: 1200,
            revenuesHeld: [{ label: "Bares (operação de terceiros)", value: 3000 }],
          });
          const text = JSON.stringify(doc).toLowerCase();
          for (const term of FORBIDDEN_DOC_TERMS) expect(text).not.toContain(term.toLowerCase());
          const wb = await buildStatementWorkbook(doc);
          expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Detalhamento"]);
          const cells: string[] = [];
          wb.worksheets.forEach((ws) =>
            ws.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value ?? "")))),
          );
          const sheetText = cells.join(" | ").toLowerCase();
          for (const term of FORBIDDEN_DOC_TERMS) expect(sheetText).not.toContain(term.toLowerCase());
        });
      }
    }
  }
});

/**
 * (g10) Base efetiva num fechamento que devolve o IVA dedutível do fechamento
 * acima: o documento diz "Despesas s/IVA"/"Resultado s/IVA" e nunca fala do
 * mecanismo do IVA. Sem devolução, nada muda.
 */
describe("(g10) base efetiva no documento", () => {
  const input: PartnerStatementDocInput = {
    eventName: "Evento Y",
    eventDate: "2026-08-31",
    recipientName: "SÓCIO A",
    participants: [
      { name: "SÓCIO A", percentage: 50 },
      { name: "MUNDO PROPÍCIO", percentage: 50, isHouse: true },
    ],
    revenues: [{ origin: "Bilheteira", net: 1000 }],
    expenseLines: [{ categoryId: null, description: "Som", base: 100, ivaRate: 23 }],
    categories: [],
    usesGrossExpenses: true,
    extras: [{ label: "IVA dedutível recuperado", value: 23 }],
  };

  it("com devolução apresenta s/IVA e não fala de IVA dedutível", () => {
    const doc = buildPartnerStatementDoc({ ...input, returnsDeductibleVat: true });
    expect(doc.expenseBasisLabel).toBe("Despesas s/IVA");
    expect(doc.resultBasisLabel).toBe("Resultado s/IVA");
    expect(doc.usesGrossExpenses).toBe(false);
    expect(doc.expenseForResult).toBe(100);
    expect(JSON.stringify(doc).toLowerCase()).not.toContain("iva dedut");
    // O resultado é o mesmo: perde-se o extra do IVA e ganha-se a base s/IVA.
    expect(doc.result).toBeCloseTo(900, 2);
  });

  it("sem devolução mantém c/IVA e o extra", () => {
    const doc = buildPartnerStatementDoc(input);
    expect(doc.expenseBasisLabel).toBe("Despesas c/IVA");
    expect(doc.resultBasisLabel).toBe("Resultado c/IVA");
    expect(doc.expenseForResult).toBe(123);
    expect(doc.extras).toHaveLength(1);
    expect(doc.result).toBeCloseTo(900, 2);
  });
});

/**
 * (g13) Documento de um sócio cujo acordo apura sobre parte do resultado do
 * evento: as despesas são as do evento e a conta desce em cascata, nomeando os
 * sócios dos acordos acima. Números reais de um evento a três acordos.
 */
describe("(g13) cascata desde o resultado do evento", () => {
  const eventRevenues = [{ origin: "Bilheteira", net: 2527352.94 }];
  const eventExpenses = [{ categoryId: null, description: "Despesas do evento", base: 1668759.64, ivaRate: (262459.85 / 1668759.64) * 100 }];

  const societyDoc = (locale: "pt-PT" | "pt-BR") =>
    buildPartnerStatementDoc({
      locale,
      eventName: "Evento a três acordos",
      eventDate: "2026-08-31",
      recipientName: "EVERYTHINGISNEW",
      participants: [
        { name: "EVERYTHINGISNEW", percentage: 50 },
        { name: "MUNDO PROPÍCIO", percentage: 50, isHouse: true },
      ],
      revenues: eventRevenues,
      expenseLines: eventExpenses,
      categories: [],
      usesGrossExpenses: true,
      // (g13-b) o nó devolve o IVA dedutível: mesmo assim a conta em cascata
      // parte da base c/IVA e soma o IVA recuperado — nunca o esconde.
      returnsDeductibleVat: true,
      cascade: {
        levels: [
          {
            baseValue: 596133.45,
            quotaPct: 20,
            quota: 119226.69,
            deductions: [
              { name: "ANITTA", percentage: 70, value: 417293.42 },
              { name: "RAFAEL LOBO", percentage: 10, value: 59613.35 },
            ],
          },
        ],
      },
      extras: [
        { label: "IVA dedutível recuperado", value: 262459.85 },
        {
          label: "Receitas exclusivas da sociedade",
          value: 72250.52,
          items: [
            { label: "Oeiras", value: 50000 },
            { label: "Bengaleiro", value: 138.82 },
            { label: "Ticketline RS 1%", value: 22111.7 },
          ],
        },
        { label: "Operações de terceiros — resultado adicional", value: 93969.63 },
      ],
      resultOverride: 547906.69,
      recipientShareOverride: 273953.35,
    });

  it("as despesas são as do evento e a cascata fecha ao cêntimo", () => {
    const doc = societyDoc("pt-PT");
    expect(doc.expenseTotal).toBeCloseTo(1931219.49, 0);
    expect(doc.cascadeQuota).toBeCloseTo(119226.69, 2);
    expect(doc.result).toBeCloseTo(547906.69, 2);
    expect(doc.cascadeMismatch).toBeCloseTo(0, 2);
    expect(doc.recipientShare).toBeCloseTo(273953.35, 2);
    // As receitas do evento ficam limpas dos termos adicionais.
    expect(doc.revenueNet).toBeCloseTo(2527352.94, 2);
  });

  it("(g13-b) mantém a base c/IVA e a linha do IVA recuperado", () => {
    const doc = societyDoc("pt-PT");
    expect(doc.usesGrossExpenses).toBe(true);
    expect(doc.expenseBasisLabel).toBe("Despesas c/IVA");
    expect(doc.expenseForResult).toBeCloseTo(doc.expenseTotal, 2);
    expect(doc.extras.map((e) => e.label)).toContain("IVA dedutível recuperado");
    // 596.133,45 − 417.293,42 − 59.613,35 = 119.226,69
    const lv = doc.cascade![0];
    expect(lv.baseValue - lv.deductions.reduce((s, d) => s + d.value, 0)).toBeCloseTo(119226.69, 2);
    // + 262.459,85 + 72.250,52 + 93.969,63 = 547.906,69 → sem aviso
    expect(doc.cascadeQuota! + doc.extrasTotal).toBeCloseTo(547906.69, 2);
    expect(Math.abs(doc.cascadeMismatch)).toBeLessThan(0.02);
  });

  it("nomeia só os sócios dos acordos acima e o destinatário", () => {
    const doc = societyDoc("pt-PT");
    const names = doc.cascade?.[0].deductions.map((d) => d.name);
    expect(names).toEqual(["ANITTA", "RAFAEL LOBO"]);
    expect(doc.agreement.map((r) => r.name)).toEqual(["EVERYTHINGISNEW", "Mundo Propício"]);
  });

  it("não usa termos proibidos em nenhuma das línguas, na planilha inclusive", async () => {
    for (const locale of ["pt-PT", "pt-BR"] as const) {
      const doc = societyDoc(locale);
      const wb = await buildStatementWorkbook(doc);
      const cells: string[] = [];
      wb.worksheets.forEach((ws) =>
        ws.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value ?? "")))),
      );
      const text = `${JSON.stringify(doc)} | ${cells.join(" | ")}`.toLowerCase();
      for (const term of FORBIDDEN_DOC_TERMS) expect(text).not.toContain(term.toLowerCase());
    }
  });

  it("outro sócio da mesma cascata não vê o primeiro", () => {
    const doc = buildPartnerStatementDoc({
      eventName: "Evento a três acordos",
      eventDate: "2026-08-31",
      recipientName: "RAFAEL LOBO",
      participants: [
        { name: "RAFAEL LOBO", percentage: 20 },
        { name: "MUNDO PROPÍCIO", percentage: 80, isHouse: true },
      ],
      revenues: eventRevenues,
      expenseLines: eventExpenses,
      categories: [],
      usesGrossExpenses: true,
      cascade: {
        levels: [
          {
            baseValue: 596133.45,
            quotaPct: 30,
            quota: 178840.04,
            deductions: [{ name: "ANITTA", percentage: 70, value: 417293.42 }],
          },
        ],
      },
      resultOverride: 178840.04,
      recipientShareOverride: 35768.01,
    });
    expect(doc.cascadeQuota).toBeCloseTo(178840.04, 2);
    expect(doc.recipientShare).toBeCloseTo(35768.01, 2);
    expect(doc.agreement[1].percentage).toBeCloseTo(80, 2);
    expect(JSON.stringify(doc)).not.toContain("EVERYTHINGISNEW");
  });

  it("na raiz nada muda: sem cascata e sem nomes de outros", () => {
    const doc = buildPartnerStatementDoc({
      eventName: "Evento a três acordos",
      eventDate: "2026-08-31",
      recipientName: "ANITTA",
      participants: [
        { name: "ANITTA", percentage: 70 },
        { name: "RAFAEL LOBO", percentage: 10 },
        { name: "MUNDO PROPÍCIO", percentage: 20, isHouse: true },
      ],
      revenues: eventRevenues,
      expenseLines: eventExpenses,
      categories: [],
      usesGrossExpenses: true,
      resultOverride: 596133.45,
      recipientShareOverride: 417293.42,
    });
    expect(doc.cascade).toBeNull();
    expect(doc.agreement.map((r) => r.name)).toEqual(["ANITTA", "Sócios locais"]);
    const text = JSON.stringify(doc);
    expect(text).not.toContain("EVERYTHINGISNEW");
    expect(text).not.toContain("RAFAEL");
  });
});
