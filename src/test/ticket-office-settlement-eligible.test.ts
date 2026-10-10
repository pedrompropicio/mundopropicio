import { describe, it, expect } from "vitest";
import { isSettlementEligibleTxn } from "@/lib/ticket-office-settlement-eligible";

const OFFICE = "bb741051-5716-4149-a971-984803e095cf";

describe("isSettlementEligibleTxn — exclude_from_result (D-ERP236)", () => {
  it("despesa paga na conta da bilheteira com exclude_from_result=true NÃO é elegível (perna 10.3)", () => {
    // Caso real: 78489f4b — 265,00 retidos pelo Fórum Braga (Ticketline → Acerto Turnê)
    const t = {
      id: "78489f4b-6927-4db7-bdd6-2293fda8b8b6",
      status: "paid",
      account_id: OFFICE,
      exclude_from_result: true,
      settlement_id: null,
    };
    expect(isSettlementEligibleTxn(t, OFFICE, null, new Set())).toBe(false);
  });

  it("despesa paga na conta da bilheteira com exclude_from_result=false continua elegível", () => {
    const t = {
      id: "despesa-normal",
      status: "paid",
      account_id: OFFICE,
      exclude_from_result: false,
      settlement_id: null,
    };
    expect(isSettlementEligibleTxn(t, OFFICE, null, new Set())).toBe(true);
  });

  it("exclusão por exclude_from_result aplica-se antes da excepção 'já ligada ao fecho'", () => {
    const settlement = { id: "fecho-1", transfer_transaction_id: null };
    const t = {
      id: "perna-10-3",
      status: "paid",
      account_id: OFFICE,
      exclude_from_result: true,
      settlement_id: "fecho-1",
    };
    expect(isSettlementEligibleTxn(t, OFFICE, settlement, new Set())).toBe(false);
  });

  it("despesa paga noutra conta não é elegível", () => {
    const t = { id: "x", status: "paid", account_id: "outra-conta", exclude_from_result: false, settlement_id: null };
    expect(isSettlementEligibleTxn(t, OFFICE, null, new Set())).toBe(false);
  });

  it("perna TRF-FECHO- continua excluída", () => {
    const t = {
      id: "trf",
      status: "paid",
      account_id: OFFICE,
      operation_key: "TRF-FECHO-abc",
      exclude_from_result: false,
      settlement_id: null,
    };
    expect(isSettlementEligibleTxn(t, OFFICE, null, new Set())).toBe(false);
  });
});
