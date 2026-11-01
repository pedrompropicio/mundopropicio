import { describe, it, expect } from "vitest";
import { settlementIconState } from "@/lib/ticket-office-settlement-icon";

const OFFICE = "off-1";
const EV = "ev-1";
const base = { event_id: EV, financial_account_id: OFFICE, transfer_transaction_id: null, created_at: "2026-10-13" };

describe("settlementIconState", () => {
  it("sem fecho", () => {
    const r = settlementIconState([], EV, OFFICE);
    expect(r).toEqual({ estado: "sem_fecho", settlement: null, titulo: "Fechar evento nesta bilheteira" });
  });
  it("rascunho abre o fecho existente", () => {
    const f = { ...base, id: "5c871a42", status: "draft" };
    const r = settlementIconState([f], EV, OFFICE);
    expect(r.estado).toBe("rascunho");
    expect(r.settlement).toBe(f);
    expect(r.titulo).toBe("Fecho em rascunho · a aguardar repasse");
  });
  it("confirmado sem transferência", () => {
    const f = { ...base, id: "c1", status: "confirmed" };
    const r = settlementIconState([f], EV, OFFICE);
    expect(r.estado).toBe("confirmado_sem_repasse");
    expect(r.settlement).toBe(f);
    expect(r.titulo).toBe("Fecho confirmado · repasse por lançar");
  });
  it("confirmado com transferência", () => {
    const f = { ...base, id: "c2", status: "confirmed", transfer_transaction_id: "t1" };
    expect(settlementIconState([f], EV, OFFICE).estado).toBe("confirmado");
  });
  it("estornado conta como sem fecho", () => {
    const r = settlementIconState([{ ...base, id: "r1", status: "reversed" }], EV, OFFICE);
    expect(r.estado).toBe("sem_fecho");
    expect(r.settlement).toBeNull();
  });
  it("ignora outros eventos e bilheteiras; prefere confirmado a rascunho", () => {
    const fs = [
      { ...base, id: "x", event_id: "outro", status: "draft" },
      { ...base, id: "y", financial_account_id: "outra", status: "draft" },
      { ...base, id: "d", status: "draft" },
      { ...base, id: "c", status: "confirmed" },
    ];
    expect(settlementIconState(fs, EV, OFFICE).settlement?.id).toBe("c");
  });
});
