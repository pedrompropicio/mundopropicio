import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DataEntryDialog from "../DataEntryDialog";
import { DataEntryError, parseAmount, type DataEntryAdapter, type DataEntryState } from "@/lib/data-entry-client";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const C = "c1";
function fakeAdapter(execute: boolean) {
  const st: DataEntryState = {
    session: { id: "s1", created_at: "" }, company: { id: C, name: "Empresa Fictícia", tax_id: "PT500000001" }, event: null,
    actor: { name: "Gestora M", role: "manager" }, documents: [], preview: null, results: [], payers: [{ id: "p1", name: "Pagadora P" }], capabilities: { execute },
  };
  const a: DataEntryAdapter = {
    status: vi.fn(async () => ({ role: "manager", company_id: C, capabilities: { upload: true } })),
    session: vi.fn(async () => structuredClone(st)),
    upload: vi.fn(async () => { st.documents = [{ id: "d1", name: "f.pdf", sha256: "a".repeat(64), size_bytes: 2048, mime: "application/pdf" }]; return { id: "d1", reused: false }; }),
    preview: vi.fn(async (_s, _d, fields) => {
      st.preview = { id: "pv1", version: 1, snapshot_hash: "b".repeat(64), document_id: "d1", snapshot: { fields, payer_name: "Pagadora P", company_tax: "PT500000001", effects: ["Criar 1 Fatura Avulsa (estado novo) com o documento anexado"], event_id: null } };
      return st.preview;
    }),
    execute: vi.fn(async () => ({ status: "conferido" as const, result: { invoice_id: "i1", observation: "Feito por LLM com autorização de Gestora M em 17/10/2026.", total_amount: 123, invoice_date: "2026-10-17", path: "x", status: "new", approved_name: "Gestora M" } })),
  };
  return a;
}
const ui = (a: DataEntryAdapter) => render(<MemoryRouter><DataEntryDialog open onOpenChange={() => {}} adapter={a} /></MemoryRouter>);
async function fillAndPreview(a: DataEntryAdapter) {
  ui(a);
  fireEvent.click(await screen.findByRole("button", { name: "Novo lote" }));
  const file = new File(["%PDF-1.4"], "f.pdf", { type: "application/pdf" });
  fireEvent.change(await screen.findByLabelText("Escolher documento"), { target: { files: [file] } });
  await screen.findByText("f.pdf");
  const set = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
  set("Fornecedor", "Fornecedor Fictício"); set("NIF do fornecedor", "PT500111222"); set("Número da fatura", "FT 1");
  set("Data da fatura", "2026-10-17"); set("Total (EUR)", "123,00"); set("IVA (EUR)", "23"); set("NIF do destinatário no documento", "PT500000001");
  set("Quem pagou", "p1");
  fireEvent.click(screen.getByRole("button", { name: "Preparar prévia" }));
  await screen.findByText(/Versão da prévia/);
}

describe("#333 DataEntryDialog", () => {
  it("endpoint ausente: mostra indisponível e não oferece ações", async () => {
    const a = fakeAdapter(false); a.status = vi.fn(async () => { throw new DataEntryError("O assistente ainda não está ativo neste ambiente. Nada foi guardado nem lançado.", 404); });
    ui(a);
    expect(await screen.findByRole("alert")).toHaveTextContent("ainda não está ativo");
    expect(screen.queryByRole("button", { name: "Novo lote" })).toBeNull();
  });
  it("execução não validada: prévia visível, botão desativado mesmo após confirmação", async () => {
    const a = fakeAdapter(false); await fillAndPreview(a);
    expect(a.preview).toHaveBeenCalledWith("s1", "d1", expect.objectContaining({ total_amount: 123, iva_amount: 23, currency: "EUR", invoice_date: "2026-10-17" }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Autorizar e executar este lote" })).toBeDisabled();
    expect(screen.getByText(/execução ainda não foi validada/)).toBeInTheDocument();
    expect(a.execute).not.toHaveBeenCalled();
  });
  it("execução validada: exige confirmação explícita e mostra a conferência com a observação", async () => {
    const a = fakeAdapter(true); await fillAndPreview(a);
    const btn = screen.getByRole("button", { name: "Autorizar e executar este lote" });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(btn);
    await waitFor(() => expect(a.execute).toHaveBeenCalledWith("s1", "pv1", "b".repeat(64)));
    expect(await screen.findByText("Registado e conferido")).toBeInTheDocument();
    expect(screen.getByText(/Feito por LLM com autorização de Gestora M/)).toBeInTheDocument();
  });
  it("valores: pt-PT com cêntimos; recusa 3 casas e texto", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56); expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("1,234")).toBeNull(); expect(parseAmount("abc")).toBeNull();
  });
});
