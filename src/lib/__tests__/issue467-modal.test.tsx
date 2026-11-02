import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "./fixtures/issue467-snapshots.json";
import { BPVersionsCompareModal } from "@/components/bp-versions/BPVersionsCompareModal";

const transport = vi.hoisted(() => ({ in: vi.fn(), export: vi.fn() }));
const versions = [
  { id: "v1", version_number: 1, state: "active", is_pinned_scenario: false },
  { id: "v2", version_number: 2, state: "superseded", is_pinned_scenario: false },
];
vi.mock("@/hooks/useBPVersions", () => ({ useBPVersions: () => ({ data: versions, isLoading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => ({
    select: () => table === "bp_versions"
      ? { in: transport.in }
      : Promise.resolve({ data: [], error: null }),
  }) },
}));
vi.mock("@/lib/export-bp-version-multi-comparison-pdf", () => ({
  exportBPMultiVersionComparisonPDF: transport.export,
}));
afterEach(cleanup);

describe("#467 real comparison modal with synthetic transport", () => {
  it("loads complete snapshot payloads, keeps FX-only rows in only-differences, toggles legacy rows and exports same engine result", async () => {
    transport.in.mockResolvedValue({
      data: Object.entries(fixture).map(([id, snapshot_payload]) => ({ id, snapshot_payload })), error: null,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}>
      <BPVersionsCompareModal open onOpenChange={() => {}} eventId="synthetic-event" eventName="Fictício" />
    </QueryClientProvider>);
    await screen.findByText("Original (alterado): 120.00");
    expect(screen.getByText("Serviço fictício")).toBeInTheDocument();
    expect(screen.queryByText("Receita fictícia")).not.toBeInTheDocument();
    expect(screen.getByText("Original (alterado): 110")).toBeInTheDocument();
    expect(screen.getByText("Taxa FX (alterado): 0.181818")).toBeInTheDocument();
    expect(screen.getByText("Fonte FX (alterado): fixture-b")).toBeInTheDocument();
    expect(transport.in).toHaveBeenCalledWith("id", ["v1", "v2"]);
    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/ }));
    expect(transport.export).toHaveBeenLastCalledWith(expect.objectContaining({
      showOnlyDifferences: true,
      result: expect.objectContaining({ summary: expect.objectContaining({ income: [100, 100], expense: [20, 20] }) }),
    }));
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByText("Receita fictícia")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/ }));
    expect(transport.export).toHaveBeenLastCalledWith(expect.objectContaining({ showOnlyDifferences: false }));
    client.clear();
  });
});
