import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { matchDuplicateCandidates, type DuplicateRow } from "@/lib/transaction-duplicate-check";

const CO = "co-1";
const X = "sup-x";

const row = (o: Partial<DuplicateRow> & { id: string }): DuplicateRow => ({
  company_id: CO,
  supplier_id: X,
  invoice_ref: null,
  description: "",
  amount: 0,
  paid_amount: 0,
  date: "2026-06-01",
  status: "approved",
  event_id: null,
  parent_transaction_id: null,
  reversed_at: null,
  ...o,
});

describe("transaction-duplicate-check (#284)", () => {
  it("caso Montaditos: linha nova COM ref apanha linha antiga SEM ref (mesmo fornecedor, valor, <30 dias)", () => {
    const A = row({ id: "A", description: "Alimentação da equipe", amount: 20, date: "2026-06-26", status: "paid", paid_amount: 20 });
    const out = matchDuplicateCandidates(
      {
        companyId: CO,
        supplierId: X,
        invoiceRef: "ATCUD: JF43N67M-041005",
        amount: 20,
        date: "2026-07-22",
        description: "compra de agua/lanche",
      },
      [A],
    );
    expect(out.map((c) => c.id)).toEqual(["A"]);
    expect(out[0].rule).toBe("amount_date");
  });

  it("fatura repartida (#29): mesma ref, valores diferentes → avisa (não bloqueia, só devolve candidatas)", () => {
    const L1 = row({ id: "L1", invoice_ref: "FT 2026/15", amount: 300, date: "2026-03-01" });
    const L2 = row({ id: "L2", invoice_ref: " ft  2026/15 ", amount: 120, date: "2026-03-01" });
    const out = matchDuplicateCandidates(
      { companyId: CO, supplierId: X, invoiceRef: "FT 2026/15", amount: 80, date: "2026-03-01" },
      [L1, L2],
    );
    expect(out.map((c) => c.id).sort()).toEqual(["L1", "L2"]);
    expect(out.every((c) => c.rule === "invoice_ref")).toBe(true);
  });

  it("edição nunca se devolve a si própria", () => {
    const self = row({ id: "SELF", invoice_ref: "FR M/139", amount: 820, date: "2026-04-09", description: "Som" });
    const out = matchDuplicateCandidates(
      {
        companyId: CO,
        supplierId: X,
        invoiceRef: "FR M/139",
        amount: 820,
        date: "2026-04-09",
        description: "Som",
        excludeTransactionId: "SELF",
      },
      [self],
    );
    expect(out).toEqual([]);
  });

  it("regras cumulativas: união sem repetidos; ignora filhas e estornadas", () => {
    const both = row({ id: "B", invoice_ref: "R1", amount: 10, date: "2026-05-02" });
    const child = row({ id: "C", invoice_ref: "R1", parent_transaction_id: "B" });
    const rev = row({ id: "R", invoice_ref: "R1", reversed_at: "2026-05-03" });
    const out = matchDuplicateCandidates(
      { companyId: CO, supplierId: X, invoiceRef: "R1", amount: 10, date: "2026-05-01" },
      [both, both, child, rev],
    );
    expect(out.map((c) => c.id)).toEqual(["B"]);
  });

  it("descrição no mesmo evento: apanha mesmo com ref só num dos lados", () => {
    const old = row({ id: "D", description: "Hostess", event_id: "ev1", amount: 50, invoice_ref: "FT 9", supplier_id: "other", date: "2025-01-01" });
    const out = matchDuplicateCandidates(
      { companyId: CO, supplierId: X, invoiceRef: null, amount: 50, date: "2026-05-01", description: "hostess", eventId: "ev1" },
      [old],
    );
    expect(out.map((c) => c.rule)).toEqual(["description"]);
  });

  it("onlyInvoiceRefRule: sem ref não avisa", () => {
    const A = row({ id: "A", amount: 20, date: "2026-06-26" });
    expect(
      matchDuplicateCandidates({ companyId: CO, supplierId: X, invoiceRef: "", amount: 20, date: "2026-06-27", onlyInvoiceRefRule: true }, [A]),
    ).toEqual([]);
  });
});
