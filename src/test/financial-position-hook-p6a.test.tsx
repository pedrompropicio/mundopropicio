import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { financialPositionFixture } from "./fixtures/financial-position";
import { useFinancialPosition } from "@/hooks/useFinancialPosition";
const state = vi.hoisted(() => ({ allowed: true, company: "10000000-0000-4000-8000-000000000002", rpc: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "synthetic-user" }, permissions: state.allowed ? ["view_financial_position"] : [], hasPermission: () => state.allowed }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: state.company, isLoading: false, isError: false, error: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>; }
beforeEach(() => { cleanup(); state.allowed = true; state.company = financialPositionFixture().meta.company_id; state.rpc.mockReset(); state.rpc.mockResolvedValue({ data: financialPositionFixture(), error: null }); });
describe("P6a read-only query", () => {
  it("passes active company and selected year unchanged", async () => { const { result } = renderHook(() => useFinancialPosition(2026), { wrapper }); await waitFor(() => expect(result.current.isSuccess).toBe(true)); expect(state.rpc).toHaveBeenCalledWith("get_financial_position_base", { p_company_id: state.company, p_year: 2026 }); });
  it("Todos passes null, not current year", async () => { const data = financialPositionFixture(); data.meta.year = null; state.rpc.mockResolvedValue({ data, error: null }); const { result } = renderHook(() => useFinancialPosition(null), { wrapper }); await waitFor(() => expect(result.current.isSuccess).toBe(true)); expect(state.rpc).toHaveBeenCalledWith("get_financial_position_base", { p_company_id: state.company, p_year: null }); });
  it("no permission means no RPC call", () => { state.allowed = false; renderHook(() => useFinancialPosition(2026), { wrapper }); expect(state.rpc).not.toHaveBeenCalled(); });
  it("missing company means no RPC call", () => { state.company = ""; renderHook(() => useFinancialPosition(2026), { wrapper }); expect(state.rpc).not.toHaveBeenCalled(); });
  it("rejects response from a different company", async () => { state.company = "10000000-0000-4000-8000-000000000009"; const { result } = renderHook(() => useFinancialPosition(2026), { wrapper }); await waitFor(() => expect(result.current.isError).toBe(true)); expect(String(result.current.error)).toContain("financial_position_invalid_response"); });
  it("rejects mismatched year", async () => { const { result } = renderHook(() => useFinancialPosition(2027), { wrapper }); await waitFor(() => expect(result.current.isError).toBe(true)); });
  it("propagates denied RPC without stale successful totals", async () => { state.rpc.mockResolvedValue({ data: null, error: { message: "financial_position_permission_denied" } }); const { result } = renderHook(() => useFinancialPosition(2026), { wrapper }); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined(); expect(state.rpc).toHaveBeenCalledTimes(1); });
});