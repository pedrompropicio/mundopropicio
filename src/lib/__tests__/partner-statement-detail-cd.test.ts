import { describe, expect, it } from "vitest";
import {
  buildPartnerStatementDoc,
  paidByPartnerDocLines,
  partnerExtrasDocLines,
  PARTNER_EXTRA_ORIGIN_LABEL,
  type PartnerStatementDocInput,
} from "../partner-statement-doc";
import { buildStatementPdf, buildStatementWorkbook, detailCD } from "../export-partner-statement-doc";

// Caso sintético (#345). Linhas com 3 casas decimais forçam arredondamento.
const base: PartnerStatementDocInput = {
  eventName: "Evento Teste",
  eventDate: "2026-10-10",
  recipientName: "SÓCIO X",
  participants: [
    { name: "SÓCIO X", percentage: 50 },
    { name: "MUNDO PROPÍCIO", percentage: 50, isHouse: true },
  ],
  revenues: [{ origin: "Bilheteira", description: "Sessão", net: 1000 }],
  expenseLines: [{ categoryId: null, description: "Produção", base: 400, ivaRate: 23 }],
  categories: [],
  usesGrossExpenses: true,
  paidByPartner: 300.01,
  disbursementAdjustments: -10,
  partnerExtras: 50.01,
};

// Origem: equipa (row.paidExpenses / row.bpPaidLines / row.partnerExtras).
const teamPaid = [
  { description: "Som", amount: 100.005, date: "2026-10-09", category: "Técnica", cityLabel: "—" },
  { description: "Luz", amount: 100.005, date: "2026-10-01", category: "Técnica", cityLabel: "—" },
];
const teamBp = [{ id: "b1", description: "Palco BP", amount: 100, base: 100, ivaRate: 0, category: "Palco", categoryId: null, cityLabel: "—", hasTransaction: false }];
const teamExtras = [
  { origem: "transacao" as const, description: "Jantar", amount: 25.005, date: "2026-10-02", category: "—", cityLabel: "—" },
  { origem: "manual" as const, description: "Táxi", amount: 25.005, date: "2026-10-03T22:30:00Z", category: "—", cityLabel: "—" },
];

const fromTeam = (): Partial<PartnerStatementDocInput> => ({
  paidByPartnerLines: paidByPartnerDocLines(teamPaid, teamBp),
  disbursementAdjustmentLines: [{ date: "2026-10-05", description: "Acerto", amount: -10 }],
  partnerExtrasLines: partnerExtrasDocLines(
    teamExtras.map((e) => ({ date: e.date, description: e.description, origin: PARTNER_EXTRA_ORIGIN_LABEL[e.origem], amount: e.amount })),
  ),
});

// Origem: serviço do Portal (linhas cruas de partner_paid_expenses e extras).
const fromPortal = (): Partial<PartnerStatementDocInput> => ({
  paidByPartnerLines: paidByPartnerDocLines(
    [
      { transactions: { date: "2026-10-09", description: "Som", amount: 100.005, account_categories: { name: "Técnica" } } },
      { transactions: { date: "2026-10-01", description: "Luz", amount: 100.005, account_categories: { name: "Técnica" } } },
    ].map((pe) => ({ date: pe.transactions.date, description: pe.transactions.description, category: pe.transactions.account_categories.name, amount: pe.transactions.amount })),
    teamBp,
  ),
  disbursementAdjustmentLines: [{ date: "2026-10-05", description: "Acerto", amount: -10 }],
  partnerExtrasLines: partnerExtrasDocLines(
    [
      { data: "2026-10-02", description: "Jantar", origem: "transacao", amount: 25.005 },
      { data: "2026-10-03T22:30:00Z", description: "Táxi", origem: "manual", amount: 25.005 },
    ].map((e) => ({ date: e.data, description: e.description, origin: PARTNER_EXTRA_ORIGIN_LABEL[e.origem], amount: e.amount })),
  ),
});

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

async function wbText(input: PartnerStatementDocInput) {
  const wb = await buildStatementWorkbook(buildPartnerStatementDoc(input));
  const cells: string[] = [];
  wb.worksheets.forEach((ws) => ws.eachRow((r) => r.eachCell((c) => cells.push(String(c.value ?? "")))));
  return cells.join(" | ");
}
function pdfText(input: PartnerStatementDocInput) {
  const pdf = buildStatementPdf(buildPartnerStatementDoc(input));
  return ((pdf as any).internal.pages as string[]).join("\n").replace(/\\\(/g, "(").replace(/\\\)/g, ")");
}

describe("(g20 · #345) detalhe C/D do desembolso e extras", () => {
  it("soma de C = paidByPartner e de D = partnerExtras ao cêntimo (com arredondamento)", () => {
    const doc = buildPartnerStatementDoc({ ...base, ...fromTeam() });
    expect(sum(doc.paidByPartnerLines.map((l) => l.amount))).toBe(300.01);
    expect(sum(doc.partnerExtrasLines.map((l) => l.amount))).toBe(50.01);
    expect(sum(doc.disbursementAdjustmentLines.map((l) => l.amount))).toBe(-10);
    doc.paidByPartnerLines.forEach((l) => expect(Math.round(l.amount * 100) / 100).toBe(l.amount));
    expect(doc.paidByPartner).toBe(300.01);
    expect(doc.partnerExtras).toBe(50.01);
  });

  it("sem linhas no input → secções omitidas e documento igual ao de hoje", async () => {
    const doc = buildPartnerStatementDoc(base);
    expect(detailCD(doc)).toEqual([]);
    const txt = await wbText(base);
    expect(txt).not.toContain("C. Despesas do evento pagas por");
    expect(txt).not.toContain("D. Extras de");
    expect(pdfText(base)).not.toContain("D. Extras de");
  });

  it("base a transferir inalterada com e sem detalhe", () => {
    const a = buildPartnerStatementDoc(base);
    const b = buildPartnerStatementDoc({ ...base, ...fromTeam() });
    expect(b.transferBase).toBe(a.transferBase);
    expect(b.financingToReturn).toBe(a.financingToReturn);
    expect(b.transferTotal).toBe(a.transferTotal);
  });

  it("equipa e Portal dão as mesmas secções C e D", () => {
    const a = detailCD(buildPartnerStatementDoc({ ...base, ...fromTeam() }));
    const b = detailCD(buildPartnerStatementDoc({ ...base, ...fromPortal() }));
    expect(b).toEqual(a);
    expect(a.map((s) => s.title)).toEqual(["C. Despesas do evento pagas por SÓCIO X", "D. Extras de SÓCIO X"]);
  });

  it("datas em dia civil (sem fuso); BP sem transação sem data", () => {
    const [c, d] = detailCD(buildPartnerStatementDoc({ ...base, ...fromTeam() }));
    expect(c.rows[0][0]).toBe("09/10/2026");
    expect(c.rows[2][0]).toBe("—");
    expect(d.rows[1][0]).toBe("03/10/2026");
    expect(c.head).toEqual(["Data", "Descrição", "Rubrica", "Valor"]);
    expect(d.head).toEqual(["Data", "Descrição", "Origem", "Valor"]);
  });

  for (const mode of ["detailed", "totalOnly"] as const) {
    it(`PDF e Excel em '${mode}' contêm C e D${mode === "totalOnly" ? " sem 'c/iva'" : ""}`, async () => {
      const input = { ...base, ...fromTeam(), expenseColumns: mode };
      const x = await wbText(input);
      const p = pdfText(input);
      for (const t of [x, p]) {
        expect(t).toContain("C. Despesas do evento pagas por SÓCIO X");
        expect(t).toContain("D. Extras de SÓCIO X");
        if (mode === "totalOnly") expect(t.toLowerCase()).not.toContain("c/iva");
      }
    });
  }

  it("pt-BR usa os rótulos do ficheiro", () => {
    const [c] = detailCD(buildPartnerStatementDoc({ ...base, ...fromTeam(), locale: "pt-BR" }));
    expect(c.title).toBe("C. Despesas do evento pagas por SÓCIO X");
  });
});
