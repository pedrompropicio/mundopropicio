import { describe, it, expect } from "vitest";
import { matchSepaBankExecutions, stateByTransaction, descriptionHasBeneficiary, sepaEndToEndId } from "./bank-execution";

const tx = (id: string, amount: number, supplier_name?: string) => [id, { id, amount, supplier_name }] as const;

describe("matchSepaBankExecutions (#37 ponto 3)", () => {
  const base = { coverageFrom: "2026-08-31", coverageTo: "2026-10-09" };

  it("casa o lote pelo total ao cêntimo e marca todas as linhas", () => {
    const r = matchSepaBankExecutions({
      ...base,
      exports: [{ id: "e1", payment_list_id: "l1", exported_at: "2026-09-02T10:00:00Z", total_amount: 150.5, transaction_ids: ["a", "b"] }],
      lines: [{ id: "b1", booking_date: "2026-09-03", amount: -150.5, description: "LOTE TRF CRED SEPA+ 01092026" }],
      txById: new Map([tx("a", 100), tx("b", 50.5)]),
    });
    expect(r.map((x) => x.state)).toEqual(["executado", "executado"]);
    expect(r[0].match_kind).toBe("lote");
    expect(r[0].reused).toBe(false);
  });

  it("uma linha do banco serve uma só exportação (re-exportação fica por executar)", () => {
    const r = matchSepaBankExecutions({
      ...base,
      exports: [
        { id: "e1", payment_list_id: "l1", exported_at: "2026-09-02T10:00:00Z", total_amount: 10, transaction_ids: ["a"] },
        { id: "e2", payment_list_id: "l1", exported_at: "2026-09-02T10:01:00Z", total_amount: 10, transaction_ids: ["a"] },
      ],
      lines: [{ id: "b1", booking_date: "2026-09-03", amount: -10, description: "LOTE", matched_sepa_export_id: "e2" }],
      txById: new Map([tx("a", 10)]),
    });
    expect(r.find((x) => x.sepa_export_id === "e2")!.state).toBe("executado");
    expect(r.find((x) => x.sepa_export_id === "e2")!.reused).toBe(true);
    expect(r.find((x) => x.sepa_export_id === "e1")!.state).toBe("por_executar");
    expect(stateByTransaction(r).get("a")!.state).toBe("executado");
  });

  it("fora da janela de 10 dias ou valor diferente não casa", () => {
    const r = matchSepaBankExecutions({
      ...base,
      exports: [{ id: "e1", payment_list_id: "l1", exported_at: "2026-09-02T10:00:00Z", total_amount: 10, transaction_ids: ["a"] }],
      lines: [
        { id: "b1", booking_date: "2026-09-13", amount: -10, description: "LOTE" },
        { id: "b2", booking_date: "2026-09-04", amount: -10.01, description: "LOTE" },
        { id: "b3", booking_date: "2026-09-04", amount: 10, description: "LOTE" },
      ],
      txById: new Map([tx("a", 10)]),
    });
    expect(r[0].state).toBe("por_executar");
  });

  it("linha individual exige valor e nome do beneficiário", () => {
    const common = {
      ...base,
      exports: [{ id: "e1", payment_list_id: "l1", exported_at: "2026-09-02T10:00:00Z", total_amount: 999, transaction_ids: ["a"] }],
      txById: new Map([tx("a", 72.33, "Allianz Portugal SA")]),
    };
    expect(matchSepaBankExecutions({ ...common, lines: [{ id: "b1", booking_date: "2026-09-05", amount: -72.33, description: "TRF ALLIANZ PORTUGAL" }] })[0].match_kind).toBe("linha");
    expect(matchSepaBankExecutions({ ...common, lines: [{ id: "b1", booking_date: "2026-09-05", amount: -72.33, description: "TRF OUTRO" }] })[0].state).toBe("por_executar");
  });

  it("sem extrato a cobrir a data da exportação", () => {
    const r = matchSepaBankExecutions({
      ...base,
      exports: [{ id: "e1", payment_list_id: "l1", exported_at: "2026-08-25T10:00:00Z", total_amount: 10, transaction_ids: ["a"] }],
      lines: [],
      txById: new Map([tx("a", 10)]),
    });
    expect(r[0].state).toBe("sem_extrato");
  });

  it("confirmação gravada é reutilizada", () => {
    const r = matchSepaBankExecutions({
      ...base,
      exports: [{ id: "e1", payment_list_id: "l1", exported_at: "2026-09-02T10:00:00Z", total_amount: 10, transaction_ids: ["a"] }],
      lines: [{ id: "b9", booking_date: "2026-09-20", amount: -10, description: "X" }],
      txById: new Map([tx("a", 10)]),
      confirmed: new Map([["e1|a", "b9"]]),
    });
    expect(r[0]).toMatchObject({ state: "executado", reused: true });
  });

  it("helpers", () => {
    expect(descriptionHasBeneficiary("TRF CRED JC DECAUX PORTUGAL", "J.C.DECAUX PORTUGAL LDA")).toBe(true);
    expect(sepaEndToEndId("40da4765-aaaa-bbbb-cccc-000000000000", 0)).toBe("PL001-40da4765");
  });
});
