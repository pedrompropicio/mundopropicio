/** D-ERP266 — invalidação central + Realtime, sem ciclos. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import type { ReactNode } from "react";

const handlers: Array<() => void> = [];
const removed: unknown[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const ch: any = { on: (_e: any, _f: any, cb: () => void) => { handlers.push(cb); return ch; }, subscribe: () => ch };
  const from = (t: string) => ({ select: () => ({ in: async () => ({ data: t === "event_ticket_zones" ? [{ id: "z1" }] : [{ id: "c1" }] }) }) });
  return { supabase: { channel: () => ch, removeChannel: (c: unknown) => removed.push(c), from } };
});

import { invalidateEventFinancials, isEventFinancialKey, scheduleEventFinancialsInvalidation } from "@/lib/invalidate-event-financials";
import { useEventFinancialsRealtime, eventFinancialSubs } from "@/hooks/useEventFinancialsRealtime";
import { useInvalidateEventFinancials } from "@/hooks/useInvalidateEventFinancials";

function seeded() {
  const qc = new QueryClient();
  const keys = [
    ["event_cache_configs_impact", "m1"], ["efc-forecasts", "m1", "expense"], ["event-cost-basis", "m1"],
    ["event-revenue-basis", "m1"], ["real-ticket-sales", "m1"], ["event-root-settlements", "m1"],
    ["ab_realized_from_tx", "m1"], ["bp-formula-sync", "m1"], ["suppliers_active"],
  ];
  keys.forEach((k) => qc.setQueryData(k, 1));
  return qc;
}
const stale = (qc: QueryClient, k: unknown[]) => qc.getQueryState(k)?.isInvalidated;

beforeEach(() => { handlers.length = 0; removed.length = 0; vi.useRealTimers(); });

describe("invalidateEventFinancials", () => {
  it("gravar num painel (ex.: % do cachê) invalida os cartões do topo", () => {
    const qc = seeded();
    invalidateEventFinancials(qc, ["m1"]);
    for (const k of [["event_cache_configs_impact", "m1"], ["efc-forecasts", "m1", "expense"], ["event-cost-basis", "m1"],
      ["event-revenue-basis", "m1"], ["real-ticket-sales", "m1"], ["event-root-settlements", "m1"], ["ab_realized_from_tx", "m1"]]) {
      expect(stale(qc, k)).toBe(true);
    }
  });
  it("não toca em chaves que voltam a gravar (sem ciclo) nem em chaves alheias", () => {
    const qc = seeded();
    invalidateEventFinancials(qc);
    expect(stale(qc, ["bp-formula-sync", "m1"])).toBe(false);
    expect(stale(qc, ["suppliers_active"])).toBe(false);
    expect(isEventFinancialKey(["cache-sync-sales-fingerprint"])).toBe(false);
  });
  it("mutação bem-sucedida agenda uma só invalidação (debounce)", async () => {
    vi.useFakeTimers();
    const qc: QueryClient = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => scheduleEventFinancialsInvalidation(qc) }) });
    qc.setQueryData(["efc-tx", "m1"], 1);
    const spy = vi.spyOn(qc, "invalidateQueries");
    await qc.getMutationCache().build(qc, { mutationFn: async () => 1 }).execute(undefined);
    await qc.getMutationCache().build(qc, { mutationFn: async () => 1 }).execute(undefined);
    vi.advanceTimersByTime(1100);
    expect(stale(qc, ["efc-tx", "m1"])).toBe(true);
    const calls = spy.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(spy.mock.calls.length).toBe(calls); // não repete sozinho
  });
});

describe("gravação direta (camarim, fecho de bilheteira, revisão de verbas)", () => {
  it("useInvalidateEventFinancials invalida os cartões do evento", () => {
    const qc = seeded();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useInvalidateEventFinancials(), { wrapper });
    act(() => { result.current(["m1"]); });
    expect(stale(qc, ["event-cost-basis", "m1"])).toBe(true);
    expect(stale(qc, ["bp-formula-sync", "m1"])).toBe(false);
  });
});

describe("useEventFinancialsRealtime", () => {
  it("filtra pelos eventos (Master + subs) e inclui as tabelas pedidas", () => {
    const subs = eventFinancialSubs(["m1", "s1", null]);
    expect(subs.find((s) => s.table === "transactions")?.filter).toBe("event_id=in.(m1,s1)");
    expect(subs.map((s) => s.table)).toEqual(expect.arrayContaining(["event_forecasts", "event_cache_configs"]));
  });
  it("ticket_sales e deduções/escalões filtrados pelo evento (import de outro evento não chega)", () => {
    const subs = eventFinancialSubs(["m1"], ["z1", "z2"], ["c1"]);
    const ts = subs.filter((s) => s.table === "ticket_sales");
    expect(ts.map((s) => s.event).sort()).toEqual(["INSERT", "UPDATE"]);
    expect(ts.every((s) => s.filter === "zone_id=in.(z1,z2)")).toBe(true);
    const ded = subs.filter((s) => s.table === "event_cache_deductions");
    expect(ded.find((s) => s.event === "INSERT")?.filter).toBe("cache_config_id=eq.c1");
    expect(ded.find((s) => s.event === "DELETE")?.filter).toBeUndefined();
    // sem zonas/configs ainda conhecidas: não subscreve essas tabelas
    expect(eventFinancialSubs(["m1"]).some((s) => s.table === "ticket_sales")).toBe(false);
  });
  it("mais de 100 zonas: ticket_sales fica sem filtro em vez de cortar zonas", () => {
    const many = Array.from({ length: 101 }, (_, i) => `z${i}`);
    const ts = eventFinancialSubs(["m1"], many).filter((s) => s.table === "ticket_sales");
    expect(ts.length).toBe(2);
    expect(ts.every((s) => !s.filter)).toBe(true);
  });
  it("evento Realtime dispara a invalidação com debounce e desliga ao sair", () => {
    vi.useFakeTimers();
    const qc = seeded();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { unmount } = renderHook(() => useEventFinancialsRealtime(["m1", "s1"]), { wrapper });
    expect(handlers.length).toBeGreaterThan(0);
    act(() => { handlers[0](); handlers[1](); });
    expect(stale(qc, ["event_cache_configs_impact", "m1"])).toBe(false);
    act(() => { vi.advanceTimersByTime(1100); });
    expect(stale(qc, ["event_cache_configs_impact", "m1"])).toBe(true);
    unmount();
    expect(removed.length).toBe(1);
  });
});
