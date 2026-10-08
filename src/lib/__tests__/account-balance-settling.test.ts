import { describe, it, expect, vi } from "vitest";

const calls: string[] = [];
const rows = [
  { account_id: "A", withholding_amount: 10, credit_amount: 5, payment_date: "2026-10-01", status: "paid", reversed_at: null },
  { account_id: "A", withholding_amount: 100, credit_amount: 0, payment_date: "2026-10-01", status: "cancelled", reversed_at: null },
  { account_id: "A", withholding_amount: 0, credit_amount: 50, payment_date: "2026-10-01", status: "paid", reversed_at: "2026-10-02" },
  { account_id: "B", withholding_amount: 0, credit_amount: 7, payment_date: "2026-10-01", status: "planned", reversed_at: null },
];

vi.mock("@/integrations/supabase/client", () => {
  const q: any = {
    select: (c: string) => (calls.push(`select:${c}`), q),
    eq: (c: string, v: any) => (calls.push(`eq:${c}=${v}`), q),
    is: (c: string, v: any) => (calls.push(`is:${c}=${v}`), q),
    not: (c: string) => (calls.push(`not:${c}`), q),
    in: () => q,
  };
  return { supabase: { from: () => q } };
});
vi.mock("@/lib/supabase-paging", () => ({
  fetchAllPagedQuery: async () => ({ data: rows, error: null }),
}));

import { fetchAccountCashAdjustments } from "../account-balance";

describe("fetchAccountCashAdjustments — só pagamentos que liquidam", () => {
  it("filtra status=paid e reversed_at null na query", async () => {
    await fetchAccountCashAdjustments();
    expect(calls).toContain("eq:status=paid");
    expect(calls).toContain("is:reversed_at=null");
  });
  it("ignora cancelados, planeados e estornados mesmo que venham na resposta", async () => {
    const m = await fetchAccountCashAdjustments();
    expect(m.get("A")).toBe(15);
    expect(m.has("B")).toBe(false);
  });
});
