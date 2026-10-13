import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { resolveCacheScope } from "@/lib/cache-scope";

const MASTER = "master-1";
const CITY = "city-1";

const inner = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const rows: Record<string, any[]> = {
    events: [
      { id: MASTER, name: "Deive Leonardo", parent_event_id: null },
      { id: CITY, name: "Deive Leonardo - Braga", parent_event_id: MASTER },
      { id: "city-2", name: "Deive Leonardo - Lisboa", parent_event_id: MASTER },
    ],
    event_cache_configs: [{ id: "cfg-master", event_id: MASTER }],
  };
  const builder = (table: string) => {
    let data = [...(rows[table] ?? [])];
    let head = false;
    const b: any = {
      select: (_c: string, opts?: any) => { head = !!opts?.head; return b; },
      eq: (col: string, v: any) => { data = data.filter((r) => r[col] === v); return b; },
      in: (col: string, v: any[]) => { data = data.filter((r) => v.includes(r[col])); return b; },
      order: () => b,
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      then: (res: any) => res(head ? { count: data.length, error: null } : { data, error: null }),
    };
    return b;
  };
  return { supabase: { from: builder } };
});

describe("resolveCacheScope (D-ERP265)", () => {
  it("subevento com Master configurado → master", () =>
    expect(resolveCacheScope({ parentEventId: MASTER, parentConfigCount: 1, childrenWithConfigCount: 0 })).toBe("master"));
  it("Master com subeventos configurados → children", () =>
    expect(resolveCacheScope({ parentEventId: null, parentConfigCount: 0, childrenWithConfigCount: 2 })).toBe("children"));
  it("sem conflito → own", () =>
    expect(resolveCacheScope({ parentEventId: MASTER, parentConfigCount: 0, childrenWithConfigCount: 0 })).toBe("own"));
});

describe("ecrã do subevento usa a configuração do Master", () => {
  beforeEach(() => inner.mockClear());
  it("mostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs", async () => {
    vi.resetModules();
    vi.doMock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: true, isManager: false }) }));
    const { EventCacheConfig } = await import("@/components/EventCacheConfig");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <EventCacheConfig eventId={CITY} eventStatus="active" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Cachê configurado no Master/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Deive Leonardo" })).toHaveAttribute("href", `/eventos/${MASTER}`);
    expect(screen.queryByText(/Adicionar Atração/)).not.toBeInTheDocument();
  });
});
