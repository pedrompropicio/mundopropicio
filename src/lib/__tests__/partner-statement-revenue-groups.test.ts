import { describe, expect, it } from "vitest";
import { buildPartnerStatementDoc, type PartnerStatementDocInput } from "../partner-statement-doc";
import { buildStatementPdf, buildStatementWorkbook } from "../export-partner-statement-doc";
import { roundCents } from "../iva";

// Synthetic amounts, not a reproduction of the real event's private lines.
const input: PartnerStatementDocInput = {
  eventName: "Evento de teste #344",
  eventDate: "2026-10-23",
  recipientName: "Sócio de teste",
  participants: [{ name: "Sócio de teste", percentage: 50 }],
  categories: [],
  usesGrossExpenses: true,
  expenseLines: [{ categoryId: null, description: "Produção", base: 10, ivaRate: 23 }],
  revenues: [
    { origin: "Bilheteira", description: "Sessão A", net: 100.005 },
    { origin: "F&B", description: "Bar A", net: 20.004 },
    { origin: "Bilheteira", description: "Sessão B", net: 50.005 },
    { origin: "Apoios", description: "Apoio A", net: 7.005 },
    { origin: "F&B", description: "Bar B", net: -2.005 },
  ],
};
const expectedLines = [
  { origin: "Bilheteira", description: "Sessão A", net: 100.01 },
  { origin: "F&B", description: "Bar A", net: 20 },
  { origin: "Bilheteira", description: "Sessão B", net: 50.01 },
  { origin: "Apoios", description: "Apoio A", net: 7.01 },
  { origin: "F&B", description: "Bar B", net: -2.01 },
];
const expectedGroups = [
  { origin: "Bilheteira", net: 150.02 },
  { origin: "F&B", net: 17.99 },
  { origin: "Apoios", net: 7.01 },
];
const money = (n: number, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n);
const pdfMoney = (n: number, locale: string) => money(n, locale).replace(/€/g, "\u0080");

describe("#344 receita resumida por origem", () => {
  it("agrupa origens exatas sem repetição, na ordem da primeira aparição", () => {
    const doc = buildPartnerStatementDoc(input);
    expect(doc.revenueGroups).toEqual(expectedGroups);
  });

  it("soma linhas já arredondadas, conserva o total ao cêntimo e não altera detalhe nem input", () => {
    const original = structuredClone(input);
    const doc = buildPartnerStatementDoc(input);
    expect(doc.revenues).toEqual(expectedLines);
    expect(input).toEqual(original);
    expect(doc.revenueNet).toBe(175.02);
    expect(roundCents(doc.revenueGroups.reduce((sum, row) => sum + row.net, 0))).toBe(175.02);
    expect(doc.result).toBe(162.72);
  });

  it("mantém grupos com soma zero e devolve lista vazia sem receitas", () => {
    const doc = buildPartnerStatementDoc({ ...input, revenues: [{ origin: "A", net: 1 }, { origin: "A", net: -1 }] });
    expect(doc.revenueGroups).toEqual([{ origin: "A", net: 0 }]);
    expect(doc.revenueNet).toBe(0);
    expect(buildPartnerStatementDoc({ ...input, revenues: [] }).revenueGroups).toEqual([]);
  });

  it("referência de aceitação: 20 linhas sintéticas conservam 575.355,39 e o acerto", () => {
    const revenues = Array.from({ length: 20 }, (_, i) => ({
      origin: i < 7 ? "Bilheteira" : i < 16 ? "F&B" : "Apoios",
      description: `Linha sintética ${i + 1}`,
      net: i === 19 ? 575355.39 - 19 * 10000 : 10000,
    }));
    const doc = buildPartnerStatementDoc({ ...input, revenues, transferBaseOverride: 139590.01 });
    expect(doc.revenues).toEqual(revenues);
    expect(doc.revenues).toHaveLength(20);
    expect(doc.revenueGroups).toEqual([
      { origin: "Bilheteira", net: 70000 },
      { origin: "F&B", net: 90000 },
      { origin: "Apoios", net: 415355.39 },
    ]);
    expect(roundCents(doc.revenueGroups.reduce((s, r) => s + r.net, 0))).toBe(575355.39);
    expect(doc.revenueNet).toBe(575355.39);
    expect(doc.transferBase).toBe(139590.01);
  });

  it("documento antigo do Portal sem o campo novo continua exportável até à atualização do serviço", async () => {
    const doc = buildPartnerStatementDoc(input);
    // Simulate an older server response; no second grouping implementation.
    Reflect.deleteProperty(doc, "revenueGroups");
    const wb = await buildStatementWorkbook(doc);
    const ws = wb.getWorksheet(doc.t.summarySheet);
    if (!ws) throw new Error("Missing summary");
    const rows = ws.getRows(1, ws.rowCount) ?? [];
    const start = rows.findIndex((r) => r.getCell(1).value === doc.t.section2);
    const end = rows.findIndex((r) => r.getCell(1).value === doc.t.totalRevenues);
    expect(rows.slice(start + 2, end).map((r) => [r.getCell(1).value, r.getCell(2).value])).toEqual(expectedLines.map((r) => [r.origin, r.net]));
    expect(rows[end].getCell(2).value).toBe(175.02);
    const pdf = buildStatementPdf(doc);
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });

  for (const expenseColumns of ["detailed", "totalOnly"] as const) {
    for (const locale of ["pt-PT", "pt-BR"] as const) {
      it(`Excel ${expenseColumns}/${locale}: uma linha por origem no resumo, mesmas linhas no detalhe A`, async () => {
        const doc = buildPartnerStatementDoc({ ...input, expenseColumns, locale });
        const wb = await buildStatementWorkbook(doc);
        const ws = wb.getWorksheet(doc.t.summarySheet);
        const wd = wb.getWorksheet(doc.t.detailSheet);
        if (!ws || !wd) throw new Error("Missing statement sheets");
        const rows = ws.getRows(1, ws.rowCount) ?? [];
        const start = rows.findIndex((r) => r.getCell(1).value === doc.t.section2);
        const end = rows.findIndex((r) => r.getCell(1).value === doc.t.totalRevenues);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        expect(rows.slice(start + 2, end).map((r) => [r.getCell(1).value, r.getCell(2).value])).toEqual(expectedGroups.map((r) => [r.origin, r.net]));
        expect(rows[end].getCell(2).value).toBe(175.02);
        const detail = wd.getRows(1, wd.rowCount) ?? [];
        const a = detail.findIndex((r) => r.getCell(1).value === doc.t.detailARevenues);
        expect(a).toBeGreaterThan(-1);
        expect(detail.slice(a + 2, a + 2 + expectedLines.length).map((r) => [r.getCell(1).value, r.getCell(2).value, r.getCell(4).value])).toEqual(expectedLines.map((r) => [r.origin, r.net, r.description]));
      });

      it(`PDF ${expenseColumns}/${locale}: uma linha por origem no resumo, mesmas linhas no detalhe A`, () => {
        const doc = buildPartnerStatementDoc({ ...input, expenseColumns, locale });
        const pdf = buildStatementPdf(doc);
        const pages = (pdf as unknown as { internal: { pages: string[][] } }).internal.pages;
        const text = pages.slice(1).flat().join("\n").replace(/\\\(/g, "(").replace(/\\\)/g, ")");
        const start = text.indexOf(doc.t.section2);
        const end = text.indexOf(doc.t.section3);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const summary = text.slice(start, end);
        for (const r of expectedGroups) {
          expect(summary.split(`(${r.origin}) Tj`).length - 1).toBe(1);
          expect(summary).toContain(pdfMoney(r.net, locale));
        }
        expect(summary).toContain(pdfMoney(175.02, locale));
        const a = text.indexOf(doc.t.detailARevenues);
        const b = text.indexOf(doc.t.detailBExpenses.split(" (")[0], a);
        expect(a).toBeGreaterThan(-1);
        expect(b).toBeGreaterThan(a);
        const detail = text.slice(a, b);
        let previous = -1;
        for (const r of expectedLines) {
          const current = detail.indexOf(`(${r.description}) Tj`);
          expect(current).toBeGreaterThan(previous);
          expect(detail).toContain(pdfMoney(r.net, locale));
          previous = current;
        }
      });
    }
  }
});