import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/issue498-pt.json";
import { formatInCurrency, formatMoney } from "../currency";
import { calcWithIva } from "../utils";
import * as iva from "../iva";
import * as sharedIva from "@shared/settlement/iva.ts";
import { computeBpFormula, type BpFormulaInput } from "../bp-formula";
import { masterFormulaShares } from "../master-formula";
import { computeSettlementEngine, type EngineInput } from "../event-settlement-engine";
import { buildPartnerStatementDoc, type PartnerStatementDocInput } from "../partner-statement-doc";
import { buildDREForExport } from "../export-dre";

// Captura anterior à alteração de currency.ts, sem snapshots regeneráveis.
// SHA-256 do JSON: b911b93a56ef343f5e51fcd6fa7810b7907fa346e35fdecfbc30802ec3fb65b6.
describe("#498 — baseline PT congelada antes de P1a", () => {
  it.each(fixture.money)("preserva os bytes de $amount, incluindo parcelas a quatro casas", (row) => {
    expect(formatMoney(row.amount, "EUR")).toBe(row.expected);
    expect(formatMoney(row.amount, undefined)).toBe(row.expected);
    expect(formatInCurrency(row.amount, "EUR")).toBe(row.inCurrency);
    expect(formatMoney(row.amount, "EUR", { maximumFractionDigits: 4 })).toBe(row.fourDecimals);
    expect(formatMoney(row.amount, "EUR", { fromCents: true })).toBe(row.fromCents);
    expect(row.expected.endsWith("\u00a0€")).toBe(true);
  });

  it("mantém NBSP, símbolo à direita e texto integral no DOM", () => {
    render(<output data-testid="pt-baseline">{fixture.money.map((row) => formatMoney(row.amount, "EUR")).join("|")}</output>);
    expect(screen.getByTestId("pt-baseline").textContent).toBe(fixture.money.map((row) => row.expected).join("|"));
  });

  it.each(fixture.iva)("preserva base $base / IVA $rate% no alias, ERP e pacote partilhado", (row) => {
    expect(calcWithIva(row.base, row.rate)).toBe(row.total);
    expect(iva.calcTotalWithIva(row.base, row.rate)).toBe(row.total);
    expect(sharedIva.calcTotalWithIva(row.base, row.rate)).toBe(row.total);
    expect(iva.calcIvaAmount(row.base, row.rate)).toBe(row.iva);
    expect(sharedIva.calcIvaAmount(row.base, row.rate)).toBe(row.iva);
  });

  it("preserva a saída integral do motor puro de fórmulas BP", () => {
    expect(computeBpFormula(fixture.bp.input as BpFormulaInput)).toEqual(fixture.bp.expected);
  });

  it("preserva a compensação residual do último filho no rateio BP", () => {
    const { line, childIds, amount } = fixture.allocation.input;
    expect(masterFormulaShares(line, childIds, amount)).toEqual(fixture.allocation.expected);
  });

  it("preserva a saída integral do motor de fecho e as partes dos sócios", () => {
    expect(computeSettlementEngine(fixture.engine.input as EngineInput)).toEqual(fixture.engine.expected);
  });

  it("preserva documento PT, rótulos, detalhes, acerto e IVA do repasse", () => {
    const input = { ...fixture.document.input, generatedAt: new Date(fixture.document.input.generatedAt) } as PartnerStatementDocInput;
    // O builder inclui funções de tradução; a fixture congela o documento serializável.
    expect(JSON.parse(JSON.stringify(buildPartnerStatementDoc(input)))).toEqual(fixture.document.expected);
  });

  it("preserva as linhas integrais DRE e vista sócio, incluindo negativos, zero e quatro casas", () => {
    const { transactions, categories } = fixture.dre;
    expect(buildDREForExport(transactions, categories, "transactions", [], [], [], "event", null)).toEqual(fixture.dre.expected);
    expect(buildDREForExport(transactions, categories, "transactions", [], [], [], "event", null, [], [], true)).toEqual(fixture.dre.partnerViewExpected);
  });
});
