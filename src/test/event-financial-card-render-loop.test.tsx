/**
 * #269 causa 1 — o card não pode avisar a página em ciclo.
 * Com queries vazias, onEbitdaParcelsChange é chamado UMA vez e não cresce.
 */
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabaseMock } from "./supabase-chain-mock";

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, isAdmin: true, isManager: false, hasPermission: () => true, role: "admin" }),
}));

import { EventFinancialCard } from "@/components/EventFinancialCard";

describe("EventFinancialCard — sem ciclo de redesenho (#269)", () => {
  it("chama onEbitdaParcelsChange uma única vez com queries vazias", async () => {
    let calls = 0;
    let renders = 0;
    function Page() {
      renders++;
      const [, setE] = useState<any>(null);
      const [, setP] = useState<any>(null);
      // callbacks inline de propósito: identidade nova em cada desenho (pior caso)
      return (
        <EventFinancialCard
          eventId="e1"
          eventIds={["e1"]}
          kind="expense"
          isMasterView={false}
          eventStatus="active"
          primaryEventDate="2026-12-31"
          onEbitdaParcelsChange={(v) => { calls++; setE(v); }}
          onPerimeterChange={(v) => setP(v)}
        />
      );
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><Page /></QueryClientProvider>);
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(1));
    await new Promise((r) => setTimeout(r, 500));
    const afterSettle = calls;
    const rendersAfterSettle = renders;
    await new Promise((r) => setTimeout(r, 500));
    expect(afterSettle).toBe(1);
    expect(calls).toBe(1);
    expect(renders).toBe(rendersAfterSettle);
  });
});
