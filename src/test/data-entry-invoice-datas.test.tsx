import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import DataEntryDialog from "@/components/data-entry/DataEntryDialog";
import type { DataEntryAdapter, DataEntryFields, DataEntryState } from "@/lib/data-entry-client";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "local-user" }, loading: false }) }));
vi.mock("@/lib/permissions", () => ({ onActiveCompanyChanged: () => () => {} }));
const fields: DataEntryFields = { supplier_name: "Sintético", supplier_nif: "123", invoice_number: "LOCAL-1", invoice_date: "2026-10-09", currency: "EUR", total_amount: 10, iva_amount: 0, customer_nif: "456", paid_by_partner_id: "payer", notes: "" };
function fixture(date = fields.invoice_date) {
  const state: DataEntryState = { session: { id: "session", created_at: "" }, company: { id: "company", name: "Local", tax_id: "456" }, event: null, actor: { name: "Local", role: "manager" }, documents: [{ id: "doc", name: "synthetic.pdf", sha256: "x", size_bytes: 1, mime: "application/pdf" }], preview: { id: "preview", document_id: "doc", version: 1, snapshot_hash: "x", snapshot: { fields: { ...fields, invoice_date: date }, payer_name: "Local", company_tax: "456", effects: [], event_id: null } }, results: [], payers: [{ id: "payer", name: "Local" }], capabilities: { execute: false } };
  const preview = vi.fn().mockResolvedValue(state.preview);
  const adapter = { status: vi.fn().mockResolvedValue({ user_id: "local-user", company_id: "company", capabilities: { upload: true } }), session: vi.fn().mockResolvedValue(state), preview, execute: vi.fn() } as unknown as DataEntryAdapter;
  return { adapter, preview };
}
async function setup(date?: string) {
  const f = fixture(date);
  render(<MemoryRouter><DataEntryDialog open onOpenChange={vi.fn()} adapter={f.adapter} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Novo lote" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Novo lote" }));
  await waitFor(() => expect(screen.getByLabelText("Data da fatura")).not.toBeDisabled());
  return f;
}
describe("#333 data da fatura — canónico e invalidação preservados", () => {
  it("data vazia não assume hoje e bloqueia preparar prévia", async () => {
    const { preview } = await setup("");
    expect(screen.getByLabelText("Data da fatura")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Preparar prévia" }));
    expect(preview).not.toHaveBeenCalled();
  });
  it("nova data envia ISO; limpeza invalida prévia e não guarda data antiga", async () => {
    const { preview } = await setup();
    fireEvent.change(screen.getByLabelText("Data da fatura"), { target: { value: "10102026" } });
    expect(screen.getByRole("button", { name: "Autorizar e executar este lote" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Preparar prévia" }));
    await waitFor(() => expect(preview).toHaveBeenCalledWith("session", "doc", expect.objectContaining({ invoice_date: "2026-10-10" }), { user_id: "local-user", company_id: "company" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preparar prévia" })).not.toBeDisabled());
    preview.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Limpar Data da fatura" }));
    fireEvent.blur(screen.getByLabelText("Data da fatura"));
    expect(screen.getByLabelText("Data da fatura")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Preparar prévia" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Autorizar e executar este lote" })).toBeDisabled();
    expect(preview).not.toHaveBeenCalled();
  });
});