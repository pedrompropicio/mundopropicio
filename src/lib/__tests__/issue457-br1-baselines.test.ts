import { describe, expect, it, vi } from "vitest";
import { convertToEur, eurToOriginal, fetchSuggestedFxRateDetails, formatMoney } from "../currency";
import { calcTotalWithIva, getDefaultIvaRateForCountry, roundCents } from "../iva";
import { computeBpFormula } from "../bp-formula";
import { computeSettlementEngine } from "../event-settlement-engine";
import { buildPartnerStatementDoc } from "../partner-statement-doc";
import { buildStatementWorkbook } from "../export-partner-statement-doc";
import { buildDREForExport } from "../export-dre";
import { settledTxIdsFrom, listItemPhase } from "../payment-settlement";

// Só dados fictícios. Expectativas literais: não recalcular a fórmula sob teste.
describe("#457 BR1 — caracterização monetária, não prontidão BR", () => {
  it.each([100.01, 100.02])("LACUNA: BRL %s → EUR 17 → BRL 100 à taxa fictícia 0,17", (original) => {
    const eur = convertToEur(original, 0.17);
    expect(eur).toBe(17);
    expect(eurToOriginal(eur, 0.17)).toBe(100);
    expect(eurToOriginal(eur, 0.17)).not.toBe(original);
  });

  it.each([[0, 0], [-100.02, -17], [0.02, 0], [0.03, 0.01]])("fronteira BRL %s → EUR %s", (original, expected) => {
    expect(convertToEur(original, 0.17)).toBe(expected);
  });

  it("identidade EUR e apresentação BRL não convertem o valor", () => {
    expect(convertToEur(100.01, 1)).toBe(100.01);
    expect(eurToOriginal(-17, 0.17)).toBe(-100);
    expect(formatMoney(100.01, "BRL").replace(/\s/g, " ")).toBe("R$ 100,01");
    expect(formatMoney(null, "BRL")).toBe("—");
  });

  it("caracteriza a assimetria atual dos conversores perante taxas inválidas", () => {
    expect(convertToEur(100, 0)).toBe(0);
    expect(convertToEur(100, -0.17)).toBe(-17);
    expect(convertToEur(100, Number.NaN)).toBeNaN();
    expect(convertToEur(100, Number.POSITIVE_INFINITY)).toBe(Infinity);
    for (const rate of [0, -0.17, Number.NaN]) expect(eurToOriginal(17, rate)).toBe(0);
    // Ausência é inválida no tipo: exercitar a fronteira JS explicitamente.
    expect(convertToEur(100, undefined as unknown as number)).toBeNaN();
    expect(eurToOriginal(17, undefined as unknown as number)).toBe(0);
  });

  it.each([undefined, null, 0, -0.17, "inválida", Infinity])("taxa sugerida %s é recusada sem rede", async (rate) => {
    const invoke = vi.fn().mockResolvedValue({ data: { rate }, error: null });
    expect(await fetchSuggestedFxRateDetails("BRL", { functions: { invoke } }, "2026-11-02")).toBeNull();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("fetch-fx-rate", { body: { from: "BRL", date: "2026-11-02" } });
  });

  it("EUR resolve identidade sem invocar serviço; BRL mantém fixing sintético", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { rate: 0.17, date_used: "2026-10-30", source: "fixture" }, error: null });
    expect(await fetchSuggestedFxRateDetails("EUR", { functions: { invoke } })).toEqual({ rate: 1, dateUsed: null, source: "identity" });
    expect(invoke).not.toHaveBeenCalled();
    expect(await fetchSuggestedFxRateDetails("BRL", { functions: { invoke } })).toEqual({ rate: 0.17, dateUsed: "2026-10-30", source: "fixture" });
  });
});

describe("#457 BR1 — empresa PT, evento PT/ES, EUR canónico", () => {
  it.each([
    { country: "Portugal", gross: 123.01, result: 877.02, share: 438.51, transfer: 433.51 },
    { country: "Espanha", gross: 121.01, result: 879.02, share: 439.51, transfer: 434.51 },
  ])("$country: BP, fecho, apresentação ao sócio e workbook", async ({ country, gross, result, share, transfer }) => {
    const rate = getDefaultIvaRateForCountry(country);
    expect(calcTotalWithIva(100.01, rate)).toBe(gross);
    const bp = computeBpFormula({ formulaType: "pct_ticket_revenue", params: { rate: 10, basis: "net", zone_ids: null }, sales: [{ zone_id: "fixture-zone", quantity: 1, unit_price: gross, total_value: gross, iva_rate: rate }], courtesies: [], realized: true });
    expect(bp.amount).toBe(10);
    const engine = computeSettlementEngine({
      eventBasis: "net_result_gross_expenses",
      eventTotals: { revenueNet: 1000.03, expensesNet: 100.01, expensesGross: gross },
      settlements: [{ id: "fixture-root", name: "Fecho fictício", parent_id: null, position: 0 }],
      participants: [
        { id: "fixture-partner", settlement_id: "fixture-root", participant_kind: "partner", name: "Sócio fictício", mode: "settles", profit_pct: 50, loss_pct: null },
        { id: "fixture-house", settlement_id: "fixture-root", participant_kind: "house", name: "Casa fictícia", mode: "settles", profit_pct: 50, loss_pct: null },
      ],
    });
    expect(engine.errors).toEqual([]);
    expect(engine.nodes[0].resultGross).toBe(result);
    expect(engine.nodes[0].participants[0].share).toBe(share);
    expect(engine.eventNetResult).toBe(900.02);
    expect(engine.c1.ok && engine.c2.ok).toBe(true);
    const doc = buildPartnerStatementDoc({
      eventName: "Evento fictício BR1", eventDate: null, locale: "pt-BR",
      recipientName: "Sócio fictício", participants: [{ name: "Sócio fictício", percentage: 50 }, { name: "Casa fictícia", percentage: 50, isHouse: true }],
      revenues: [{ origin: "Receita fictícia", net: 1000.03 }],
      expenseLines: [{ categoryId: null, description: "Custo fictício", base: 100.01, ivaRate: rate }], categories: [], usesGrossExpenses: true,
      paidByPartner: 20.01, revenuesHeld: [{ label: "Retida fictícia", value: 10.01 }], partnerExtras: 5, partnerAdvances: 10,
    });
    expect(doc.result).toBe(result);
    expect(doc.recipientShare).toBe(share);
    expect(doc.transferBase).toBe(transfer);
    expect(doc.transferTotal).toBe(transfer);
    expect(doc.transferVat).toBe(0);
    const workbook = await buildStatementWorkbook(doc);
    const cells: unknown[] = [];
    workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell.value))));
    expect(cells).toContain(transfer);
    expect(cells).toContain(result);

    const categories = [{ id: "fixture-income", name: "Receita", code: "1", type: "income", parent_id: null }, { id: "fixture-expense", name: "Custo", code: "2", type: "expense", parent_id: null }];
    const tx = [{ id: "fixture-i", type: "income", amount: 1000.03, iva_rate: 0, category_id: "fixture-income" }, { id: "fixture-e", type: "expense", amount: 100.01, iva_rate: rate, category_id: "fixture-expense" }];
    const dre = (brasil: boolean) => buildDREForExport(tx, categories, "transactions", [], [], [], "fixture-event", null, [], [], brasil);
    expect(roundCents(dre(false).find((line) => line.label === "RESULTADO LÍQUIDO")!.amountExIva)).toBe(900.02);
    expect(roundCents(dre(true).find((line) => line.label === "RESULTADO")!.amountExIva)).toBe(result);
  });

  it("estorno da única liquidação devolve o item pago ao estado legado", () => {
    const payment = { transaction_id: "fixture-tx", status: "paid", reversed_at: null as string | null };
    const phase = (rows: typeof payment[]) => listItemPhase({ txId: "fixture-tx", txStatus: "paid", settledTxIds: settledTxIdsFrom(rows) });
    expect(phase([payment])).toBe("settled");
    expect(phase([{ ...payment, reversed_at: "2026-11-02T00:00:00Z" }])).toBe("legacy");
    expect(phase([{ ...payment, reversed_at: "2026-11-02T00:00:00Z" }, payment])).toBe("settled");
  });
});
