import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DocumentAnalysisPanel from "../DocumentAnalysisPanel";
import type { DataEntryAdapter } from "@/lib/data-entry-client";
import type { AnalysisReport } from "@/lib/data-entry-analysis";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
beforeAll(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterAll(() => { vi.unstubAllGlobals(); });
const doc = { id: "d1", sha256: "a".repeat(64), size_bytes: 200, mime: "application/pdf", name: "local-only.pdf" };
const response: AnalysisReport = { document_id: "d1", document_sha256: doc.sha256, company_id: "c1", answer: "Fornecedor encontrado. Confirma manualmente.", warnings: [], erp: { company_tax: "PT500000001" }, candidates: [{ field: "supplier_name", value: "Fornecedor isolado", quote: "Fornecedor isolado", page: 1, confidence: "high", uncertainty: null, origin: "document", usable: true }] };
const setup = (enabled = true) => {
  const analyze = vi.fn<NonNullable<DataEntryAdapter["analyze"]>>(async () => response), onCandidate = vi.fn(), onBusy = vi.fn();
  const adapter = { analyze } as unknown as DataEntryAdapter;
  const mounted = render(<DocumentAnalysisPanel adapter={adapter} context={{ user_id: "u1", company_id: "c1" }} sessionId="s1" doc={doc} enabled={enabled} locked={false} onCandidate={onCandidate} onBusy={onBusy} />);
  return { analyze, onCandidate, onBusy, mounted };
};
describe("#333 local analysis review UI", () => {
  it("closed analysis never invokes provider", () => { const h = setup(false); expect(screen.getByRole("button", { name: "Analisar documento" })).toBeDisabled(); expect(h.analyze).not.toHaveBeenCalled(); });
  it("candidate does not populate fields until explicit human review", async () => { const h = setup(); fireEvent.click(screen.getByRole("button", { name: "Analisar documento" })); const use = await screen.findByRole("button", { name: "Revi e usar fornecedor" }); expect(h.onCandidate).not.toHaveBeenCalled(); fireEvent.click(use); expect(h.onCandidate).toHaveBeenCalledWith(response.candidates[0]); expect(h.analyze).toHaveBeenCalledTimes(1); });
  it("rejects response for another company before review", async () => { const h = setup(); h.analyze.mockResolvedValue({ ...response, company_id: "other" }); fireEvent.click(screen.getByRole("button", { name: "Analisar documento" })); expect(await screen.findByRole("alert")).toHaveTextContent("Resposta descartada"); expect(h.onCandidate).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Revi e usar fornecedor" })).toBeNull(); });
  it("shows user message immediately and cancellation discards response", async () => { const h = setup(); let finish: (r: AnalysisReport) => void = () => {}; h.analyze.mockImplementation(() => new Promise((r) => { finish = r; })); fireEvent.click(screen.getByRole("button", { name: "Analisar documento" })); expect(screen.getByText(/Extrai os campos da fatura/)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Parar análise" })); finish(response); await waitFor(() => expect(h.onBusy).toHaveBeenLastCalledWith(false)); expect(h.onCandidate).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Revi e usar fornecedor" })).toBeNull(); });
  it("unmount cancels only the local analysis request", async () => { const h = setup(); h.analyze.mockImplementation(() => new Promise(() => {})); fireEvent.click(screen.getByRole("button", { name: "Analisar documento" })); await waitFor(() => expect(h.analyze).toHaveBeenCalled()); const signal = h.analyze.mock.calls[0]?.[5] as AbortSignal | undefined; h.mounted.unmount(); expect(signal?.aborted).toBe(true); });
});