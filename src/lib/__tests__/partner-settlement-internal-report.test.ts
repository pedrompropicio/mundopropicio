import { describe, it, expect } from "vitest";
import {
  buildInternalSettlementReport,
  internalReportCloses,
  partnerAccountLines,
  partnerBlockMismatch,
  type InternalPartnerBlock,
  type InternalReportInput,
} from "../partner-settlement-internal-report";

const baseInput = (over: Partial<InternalReportInput> = {}): InternalReportInput => ({
  eventName: "Evento",
  settlementName: "Fechamento X",
  criterion: "Despesas c/IVA · base: previsto + excedido · com overhead",
  rootTotals: { revenueNet: 1000, expensesNet: 300, expensesGross: 400, usesGrossExpenses: true },
  cascadeSteps: [],
  vatReturnedIn: 0,
  exclusiveRevenues: [],
  exclusiveRevenuesTotal: 0,
  thirdPartyOperations: [],
  thirdPartyTotal: 0,
  addbacks: [],
  addbackTotal: 0,
  nodeResult: 600,
  distribution: [],
  partners: [],
  house: null,
  ticketing: [],
  ticketingGroupLabel: "Sessão",
  expenseCategories: [],
  ...over,
});

describe("buildInternalSettlementReport", () => {
  it("na raiz reduz-se a resultado + operações + devoluções e fecha", () => {
    const r = buildInternalSettlementReport(
      baseInput({ thirdPartyTotal: 50, addbackTotal: 10, nodeResult: 660 }),
    );
    expect(r.rootResult).toBe(600);
    expect(r.hasCascade).toBe(false);
    expect(r.cascadeTotal).toBe(660);
    expect(internalReportCloses(r.cascadeMismatch)).toBe(true);
  });

  it("num fechamento abaixo desce pelos sócios de cima e soma o IVA recuperado", () => {
    const r = buildInternalSettlementReport(
      baseInput({
        cascadeSteps: [
          {
            baseValue: 600,
            quotaPct: 50,
            quota: 250,
            deductions: [{ name: "Sócio A", mode: "settles", percentage: 20, value: 100 }],
          },
        ],
        vatReturnedIn: 200,
        exclusiveRevenues: [{ label: "Bar", value: 40 }],
        exclusiveRevenuesTotal: 40,
        exclusiveExpensesTotal: 15,
        nodeResult: 475,
      }),
    );
    expect(r.hasCascade).toBe(true);
    expect(r.cascade.some((l) => l.label === "(+) IVA dedutível recuperado")).toBe(true);
    expect(r.cascadeTotal).toBe(475);
    expect(r.cascadeMismatch).toBe(0);
  });

  it("não corrige silenciosamente: devolve a diferença", () => {
    const r = buildInternalSettlementReport(baseInput({ nodeResult: 500 }));
    expect(r.cascadeMismatch).toBe(100);
    expect(internalReportCloses(r.cascadeMismatch)).toBe(false);
  });
});

const partner = (over: Partial<InternalPartnerBlock> = {}): InternalPartnerBlock => ({
  name: "Sócio",
  profitPct: 20,
  lossPct: null,
  partnerShare: 100,
  disbursement: 1000,
  adjustmentsTotal: -50,
  revenuesHeldTotal: 800,
  extrasTotal: 0,
  transferBase: 250,
  transferWithVat: true,
  transferVat: 57.5,
  transferTotal: 307.5,
  bpLines: [],
  bpTotal: 0,
  paidExpenses: [],
  paidExpensesTotal: 0,
  adjustments: [],
  revenuesHeld: [],
  extras: [],
  transitoryItems: [],
  transitoryCredit: 0,
  ...over,
});

describe("linha g5 do sócio", () => {
  it("escreve a conta por extenso e prova que fecha", () => {
    const p = partner();
    const labels = partnerAccountLines(p).map((l) => l.label);
    expect(labels).toEqual([
      "Parte no fechamento",
      "(+) Desembolso do sócio",
      "(±) Ajustes ao desembolso",
      "(−) Receitas em poder do sócio",
      "= Base a transferir",
      "(+) IVA 23% do repasse",
      "= Total",
    ]);
    expect(partnerBlockMismatch(p)).toBe(0);
  });

  it("acusa detalhe que não bate com a base a transferir", () => {
    expect(partnerBlockMismatch(partner({ transferBase: 300 }))).toBe(-50);
  });
});
