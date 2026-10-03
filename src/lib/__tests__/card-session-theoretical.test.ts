import { describe, it, expect, vi } from "vitest";

const account = { id: "acc", initial_balance: 1000, initial_balance_date: null };
const txs = [
  // Carimbada com a sessão mas com data ANTERIOR à abertura (caso Amazon 19/08, #213).
  { id: "t1", description: "Amazon", type: "expense", paid_amount: 113.32, date: "2026-08-19", payment_date: "2026-08-19", card_session_id: "S" },
  // Movimento anterior, fora da sessão.
  { id: "t2", description: "Antigo", type: "expense", paid_amount: 50, date: "2026-08-01", payment_date: "2026-08-01", card_session_id: null },
];

vi.mock("@/integrations/supabase/client", () => {
  const q: any = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: account, error: null }) };
  return { supabase: { from: () => q } };
});
vi.mock("@/lib/supabase-paging", () => ({ fetchAllPagedQuery: () => Promise.resolve({ data: txs, error: null }) }));
vi.mock("@/lib/account-balance", () => ({
  fetchAccountCashAdjustments: async () => new Map(),
  countsAfterCutoff: () => true,
}));

import { fetchCardSessionAccountSync, computeOpenSessionTheoretical, resolveOpening } from "@/lib/card-session-balance";

describe("#275 saldo teórico da sessão = fecho", () => {
  it("sem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar", async () => {
    const sync = await fetchCardSessionAccountSync({ accountId: "acc", sessionId: "S", openedAt: "2026-08-20T10:00:00Z" });
    const { opening } = resolveOpening(null, sync.dynamicOpening);
    const openItemsGross = 200;
    const theoretical = computeOpenSessionTheoretical({
      opening,
      totalLoads: 0,
      openItemsGross,
      legacySessionSpend: sync.legacySessionSpend,
      directTotal: sync.directTotal,
    });
    console.log("[#275] teórico =", theoretical.toFixed(2), "esperado =", (sync.accountBalance - openItemsGross).toFixed(2));
    expect(theoretical).toBeCloseTo(sync.accountBalance - openItemsGross, 2);
    expect(sync.legacySessionCount).toBe(1);
  });
});
