/**
 * #269 causa 2 — com N linhas do BP só há UM pedido a event_forecast_attachments.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabaseMock, supabaseCalls } from "./supabase-chain-mock";

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

import { useForecastAttachmentCounts } from "@/hooks/useForecastAttachmentCounts";

function Row({ id, eventId }: { id: string; eventId: string }) {
  const counts = useForecastAttachmentCounts(eventId);
  return <span data-testid="row">{counts[id] ?? 0}</span>;
}

describe("anexos do BP — uma leitura por evento (#269)", () => {
  beforeEach(() => { supabaseCalls.length = 0; });
  it("361 linhas → 1 pedido a event_forecast_attachments", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ids = Array.from({ length: 361 }, (_, i) => `f${i}`);
    const { getAllByTestId } = render(
      <QueryClientProvider client={qc}>
        {ids.map((id) => <Row key={id} id={id} eventId="e1" />)}
      </QueryClientProvider>,
    );
    await waitFor(() => expect(supabaseCalls.filter((t) => t === "event_forecast_attachments").length).toBe(1));
    await new Promise((r) => setTimeout(r, 200));
    expect(supabaseCalls.filter((t) => t === "event_forecast_attachments").length).toBe(1);
    expect(getAllByTestId("row")).toHaveLength(361);
  });
});
