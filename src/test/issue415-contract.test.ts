import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({
  auth: { user: { id: "reader" }, role: "admin", permissions: ["manage_bp"], loading: false, isAdmin: true, isManager: false },
  company: { companyId: "tenant", isLoading: false },
  rows: {} as Record<string, unknown[]>, calls: [] as { table: string; columns: string; filters: [string, unknown][]; from: number; to: number }[],
  rpc: vi.fn(), invalidate: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => mocks.company }));
vi.mock("@/lib/invalidate-event-financials", async (original) => ({ ...(await original<typeof import("@/lib/invalidate-event-financials")>()), invalidateEventFinancials: mocks.invalidate }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: (table: string) => {
    let columns = ""; const filters: [string, unknown][] = [];
    const builder = {
      select: (value: string) => { columns = value; return builder; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
      order: () => builder,
      range: async (from: number, to: number) => { mocks.calls.push({ table, columns, filters, from, to }); return { data: (mocks.rows[table] ?? []).slice(from, to + 1), error: null }; },
    };
    return builder;
  },
} }));
import { useSettlementContract, parseSettlementContractReceipt, type SettlementContractCommand } from "@/hooks/useSettlementContract";
import { isEventFinancialKey } from "@/lib/invalidate-event-financials";
import { parseSettlementContractNode, resolveSettlementContract, type SettlementContractNode } from "@/lib/settlement-contract";
import { readFileSync } from "node:fs";
const node = (patch: Partial<SettlementContractNode> = {}): SettlementContractNode => ({
  id: "root", company_id: "tenant", event_id: "event", parent_id: null, parent_share_basis: null, partner_calc_basis: "net_result",
  is_sealed: false, contract_expense_source: null, contract_include_overhead: null, contract_revision: 0, contract_initialized_at: null, contract_initialized_by: null, ...patch,
});
const ready = (patch: Partial<SettlementContractNode> = {}) => node({ contract_expense_source: "committed", contract_include_overhead: true, contract_revision: 2, contract_initialized_at: "2026-11-03T10:00:00Z", contract_initialized_by: "approver", ...patch });
const child = (patch: Partial<SettlementContractNode> = {}) => node({ id: "child", parent_id: "root", parent_share_basis: "net_result_gross_expenses", ...patch });
describe("#415 contract resolution", () => {
  it("C3: historical absence never creates a decision", () => {
    expect(resolveSettlementContract([node(), child()])).toEqual(expect.arrayContaining([
      expect.objectContaining({ settlementId: "root", state: "uninitialized", expenseSource: null, includeOverhead: null, expenseSourceOrigin: null, includeOverheadOrigin: null }),
      expect.objectContaining({ settlementId: "child", state: "uninitialized" }),
    ]));
  });
  it("C3: ready own contract with g4, seal and revisions", () => {
    expect(resolveSettlementContract([ready({ is_sealed: true, partner_calc_basis: "net_result_gross_expenses" })])[0]).toMatchObject({
      state: "ready", expenseSource: "committed", includeOverhead: true, revision: 2, isSealed: true,
      expenseSourceOrigin: { kind: "own", settlementId: "root", revision: 2 }, basis: "net_result_gross_expenses", basisOrigin: "partner_calc_basis",
    });
  });
  it("C3: child inherits nearest initialized ancestor per field, including explicit false", () => {
    const middle = ready({ id: "child", parent_id: "root", parent_share_basis: "net_result", contract_expense_source: "realized", contract_include_overhead: null, contract_revision: 5 });
    const grand = child({ id: "grand", parent_id: "child" });
    const result = resolveSettlementContract([grand, middle, ready({ contract_include_overhead: false, contract_revision: 7 })]);
    expect(result[0]).toMatchObject({ state: "ready", expenseSource: "realized", includeOverhead: false, revision: 0,
      expenseSourceOrigin: { kind: "inherited", settlementId: "child", revision: 5 }, includeOverheadOrigin: { kind: "inherited", settlementId: "root", revision: 7 },
      revisions: [{ settlementId: "grand", revision: 0 }, { settlementId: "child", revision: 5 }, { settlementId: "root", revision: 7 }], basis: "net_result_gross_expenses", basisOrigin: "parent_share_basis" });
  });
  it("C3: deliberate override/removal changes only its field and revision origin", () => {
    const own = ready({ id: "child", parent_id: "root", parent_share_basis: "net_result", contract_expense_source: null, contract_include_overhead: false });
    expect(resolveSettlementContract([ready(), own])[1]).toMatchObject({ expenseSource: "committed", includeOverhead: false, includeOverheadOrigin: { kind: "own", settlementId: "child" } });
    expect(resolveSettlementContract([ready(), { ...own, contract_include_overhead: null, contract_revision: 3 }])[1]).toMatchObject({ includeOverhead: true, revision: 3, includeOverheadOrigin: { kind: "inherited", settlementId: "root", revision: 2 } });
  });
  it("C3: revision changes invalidate dependent provenance without changing child's own revision", () => {
    const a = resolveSettlementContract([ready(), child()])[1];
    const b = resolveSettlementContract([ready({ contract_revision: 3 }), child()])[1];
    expect(a.revision).toBe(b.revision);
    expect(a.revisions).not.toEqual(b.revisions);
  });
  it.each([
    { contract_expense_source: "other" }, { contract_include_overhead: "true" }, { contract_revision: -1 },
    { contract_revision: 1.2 }, { contract_revision: NaN }, { contract_revision: "1" }, { is_sealed: null },
    { contract_initialized_at: "tomorrow" }, { partner_calc_basis: "gross" }, { parent_share_basis: "gross_revenue" },
    { extra: true }, { contract_expense_source: undefined },
  ])("C3: strict wire schema rejects %j", (patch) => {
    expect(() => parseSettlementContractNode({ ...node(), ...patch })).toThrow();
  });
  it("C3: missing fields, duplicate IDs and broken graph fail closed", () => {
    const { contract_revision: omitted, ...partial } = node();
    expect(() => parseSettlementContractNode(partial)).toThrow();
    expect(() => resolveSettlementContract([node(), node()])).toThrow(/Duplicate/);
    expect(resolveSettlementContract([ready(), ready({ id: "second-root" })]).every((c) => c.state === "invalid")).toBe(true);
    expect(resolveSettlementContract([child()])[0].state).toBe("invalid");
    expect(resolveSettlementContract([child({ parent_id: "child" })])[0].state).toBe("invalid");
    expect(resolveSettlementContract([ready(), child({ company_id: "other" })])[1].state).toBe("invalid");
    expect(resolveSettlementContract([ready(), child({ event_id: "other" })])[1].state).toBe("invalid");
  });
  it("C3: metadata/revision contradictions are invalid, never repaired", () => {
    for (const bad of [node({ contract_include_overhead: true }), ready({ contract_initialized_by: null }), ready({ contract_revision: 0 }), ready({ contract_expense_source: null }), child({ parent_share_basis: null })]) {
      expect(resolveSettlementContract([bad])[0].state).toBe("invalid");
    }
  });
  it("C3: uninitialized child uses its g4 basis and existing null root g4 convention", () => {
    expect(resolveSettlementContract([ready({ partner_calc_basis: null }), child()]).map((c) => c.basis)).toEqual(["net_result", "net_result_gross_expenses"]);
  });
  it("C5: prepared hook selects new fields locally, has scoped key, pages reads, writes RPC only and central invalidation", () => {
    const source = readFileSync("src/hooks/useSettlementContract.ts", "utf8");
    expect(source).toContain('"efc-settlement-contract", companyId, user?.id, role, permissions, eventId, settlementId');
    for (const rpc of ["initialize_settlement_contract", "set_settlement_contract", "set_settlement_participant_overhead"]) expect(source).toContain(rpc);
    expect(source).toContain("invalidateEventFinancials(qc, [eventId])");
    expect(source).toContain("fetchAllPaged<unknown>");
    expect(source).not.toMatch(/cost_expense_source|cost_include_overhead|\.from\("events"\)|\.update\(|\.insert\(/);
  });
});

const clients: QueryClient[] = [];
beforeEach(() => {
  mocks.auth = { user: { id: "reader" }, role: "admin", permissions: ["manage_bp"], loading: false, isAdmin: true, isManager: false };
  mocks.company = { companyId: "tenant", isLoading: false };
  const { partner_calc_basis: omitted, ...wireNode } = ready();
  mocks.rows = { event_settlements: [wireNode], event_settlement_participants: [{ id: "A", company_id: "tenant", event_id: "event", settlement_id: "root", participant_kind: "partner", mode: "settles", supports_overhead: true }] };
  mocks.calls = []; mocks.rpc.mockReset(); mocks.invalidate.mockReset();
});
afterEach(() => { cleanup(); clients.splice(0).forEach((qc) => qc.clear()); });
function mountHook() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(qc);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { ...renderHook(() => useSettlementContract("event", "root", "net_result"), { wrapper }), qc };
}
const receipt = (patch: Record<string, unknown> = {}) => ({ ok: true, request_key: "request", settlement_id: "root", participant_id: null,
  revision: 1, expense_source: "committed", include_overhead: true, supports_overhead: null, changed_by: "reader", ...patch });
describe("#415 prepared React Query hook", () => {
  it("C3/C5: scopes both paginated reads and cache to company/user/permission/event/node", async () => {
    const { result, qc, rerender } = mountHook();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.contract.state).toBe("ready");
    expect(mocks.calls).toHaveLength(2);
    for (const call of mocks.calls) expect(call).toMatchObject({ filters: [["company_id", "tenant"], ["event_id", "event"]], from: 0, to: 999 });
    const key = qc.getQueryCache().getAll()[0].queryKey;
    expect(key).toEqual(["efc-settlement-contract", "tenant", "reader", "admin", ["manage_bp"], "event", "root", "net_result"]);
    expect(isEventFinancialKey(key)).toBe(true);
    mocks.auth = { ...mocks.auth, permissions: ["view"] };
    rerender();
    await waitFor(() => expect(qc.getQueryCache().getAll()).toHaveLength(2));
  });
  it("C3: schema/perimeter failures are errors and no historical configuration is fabricated", async () => {
    mocks.rows.event_settlements = mocks.rows.event_settlements.map((r: any) => ({ ...r, company_id: "other" }));
    const invalid = mountHook();
    await waitFor(() => expect(invalid.result.current.isError).toBe(true));
    expect(invalid.result.current.data).toBeUndefined();
    invalid.unmount();
    const { partner_calc_basis: omitted, ...wireNode } = node();
    mocks.rows.event_settlements = [wireNode];
    const uninitialized = mountHook();
    await waitFor(() => expect(uninitialized.result.current.isSuccess).toBe(true));
    expect(uninitialized.result.current.data?.contract).toMatchObject({ state: "uninitialized", expenseSource: null, includeOverhead: null });
  });
  it.each([
    ["initialize", { operation: "initialize", expenseSource: "committed", includeOverhead: true, reason: "manifesto", requestKey: "request" }, "initialize_settlement_contract", { p_settlement_id: "root", p_expense_source: "committed", p_include_overhead: true, p_reason: "manifesto", p_request_key: "request" }, receipt()],
    ["set", { operation: "set", expenseSource: null, includeOverhead: false, expectedRevision: 2, reason: "override", requestKey: "request" }, "set_settlement_contract", { p_settlement_id: "root", p_expense_source: null, p_include_overhead: false, p_expected_revision: 2, p_reason: "override", p_request_key: "request" }, receipt({ revision: 3, include_overhead: false })],
    ["participant", { operation: "participant", participantId: "A", supportsOverhead: false, expectedRevision: 2, reason: "exemption", requestKey: "request" }, "set_settlement_participant_overhead", { p_participant_id: "A", p_supports_overhead: false, p_expected_revision: 2, p_reason: "exemption", p_request_key: "request" }, receipt({ revision: 3, participant_id: "A", supports_overhead: false })],
  ])("C3/C5: %s sends exact RPC payload and invalidates only validated success", async (_name, command, name, args, response) => {
    const { result, qc } = mountHook();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    mocks.rpc.mockResolvedValue({ data: response, error: null });
    await act(async () => { await result.current.command.mutateAsync(command as SettlementContractCommand); });
    expect(mocks.rpc).toHaveBeenCalledWith(name, args);
    expect(mocks.invalidate).toHaveBeenCalledWith(qc, ["event"]);
  });
  it("C3: RPC rejection or mismatched receipt cannot invalidate or optimistically rewrite cached contract", async () => {
    const { result } = mountHook();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const before = result.current.data;
    const command: SettlementContractCommand = { operation: "set", expenseSource: "committed", includeOverhead: true, expectedRevision: 2, reason: "edit", requestKey: "request" };
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("Revisão desfasada") });
    await act(async () => { await expect(result.current.command.mutateAsync(command)).rejects.toThrow(/desfasada/); });
    mocks.rpc.mockResolvedValue({ data: receipt({ settlement_id: "other", revision: 3 }), error: null });
    await act(async () => { await expect(result.current.command.mutateAsync(command)).rejects.toThrow(/mismatch/); });
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(result.current.data).toBe(before);
  });
  it("C3: manage_bp alone cannot edit; unresolved company cannot load", async () => {
    mocks.auth = { ...mocks.auth, isAdmin: false, isManager: false, role: "editor" };
    const { result, rerender } = mountHook();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.canEdit).toBe(false);
    await act(async () => { await expect(result.current.command.mutateAsync({ operation: "initialize", expenseSource: "committed", includeOverhead: true, reason: "edit", requestKey: "request" })).rejects.toThrow(/permissão/); });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.company = { companyId: null, isLoading: false };
    mocks.calls = [];
    rerender();
    expect(result.current.fetchStatus).toBe("idle");
    expect(mocks.calls).toHaveLength(0);
  });
  it("C3: strict receipts reject omitted/new fields, invalid revisions and wrong types", () => {
    for (const bad of [receipt({ revision: "1" }), receipt({ extra: true }), receipt({ include_overhead: null }), receipt({ ok: false }), receipt({ revision: 0 })]) expect(() => parseSettlementContractReceipt(bad)).toThrow();
    const { supports_overhead: omitted, ...missing } = receipt();
    expect(() => parseSettlementContractReceipt(missing)).toThrow();
  });
});
