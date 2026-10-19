import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DataEntryDialog from "../DataEntryDialog";
import { DataEntryError, parseAmount, type DataEntryAdapter, type DataEntryState } from "@/lib/data-entry-client";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterAll(() => vi.unstubAllGlobals());

const C = "c1";
const auth = vi.hoisted(() => ({ id: "u1", loading: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: auth.id }, loading: auth.loading }) }));
function fakeAdapter(execute: boolean) {
  const st: DataEntryState = {
    session: { id: "s1", created_at: "" }, company: { id: C, name: "Empresa Fictícia", tax_id: "PT500000001" }, event: null,
    actor: { name: "Gestora M", role: "manager" }, documents: [], preview: null, results: [], payers: [{ id: "p1", name: "Pagadora P" }], capabilities: { execute },
  };
  const a: DataEntryAdapter = {
    status: vi.fn(async () => ({ user_id: "u1", role: "manager", company_id: C, capabilities: { upload: true } })),
    session: vi.fn(async () => structuredClone(st)),
    upload: vi.fn(async () => { st.documents = [{ id: "d1", name: "f.pdf", sha256: "a".repeat(64), size_bytes: 2048, mime: "application/pdf" }]; return { id: "d1", reused: false }; }),
    preview: vi.fn(async (_s, _d, fields) => {
      st.preview = { id: "pv1", version: 1, snapshot_hash: "b".repeat(64), document_id: "d1", snapshot: { fields, payer_name: "Pagadora P", company_tax: "PT500000001", effects: ["Criar 1 Fatura Avulsa (estado novo) com o documento anexado"], event_id: null } };
      return st.preview;
    }),
    check: vi.fn(async () => ({ status: "conferencia_pendente" as const, error: "Documento por conferir" })),
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
  it("reviewing scanner AB-0001 changes only the literal field and invalidates prior authorization", async () => {
    const a = fakeAdapter(true);
    a.status = vi.fn(async () => ({ user_id: "u1", role: "manager", company_id: C, capabilities: { upload: true, analysis: true } }));
    a.analyze = vi.fn<NonNullable<DataEntryAdapter["analyze"]>>(async () => ({ document_id: "d1", document_sha256: "a".repeat(64), company_id: C,
      answer: "Scanner local", warnings: [], erp: { company_tax: "PT500000001" },
      candidates: [{ field: "invoice_number", value: "AB-0001", quote: null, page: null, confidence: null, uncertainty: "Revisão obrigatória", origin: "suggestion", usable: false, reviewable: true }] }));
    await fillAndPreview(a);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Autorizar e executar este lote" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Analisar documento" }));
    const use = await screen.findByRole("button", { name: "Passar para os dados da fatura" });
    expect(screen.getByLabelText("Número da fatura")).toHaveValue("FT 1");
    expect(use).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmei estes valores no documento." }));
    fireEvent.click(use);
    expect(screen.getByLabelText("Número da fatura")).toHaveValue("AB-0001");
    expect(screen.getByLabelText("Quem pagou")).toHaveValue("p1");
    expect(screen.getByRole("button", { name: "Autorizar e executar este lote" })).toBeDisabled();
    expect(a.execute).not.toHaveBeenCalled();
  });
  beforeEach(() => { localStorage.clear(); auth.id = "u1"; auth.loading = false; });
  it("header stays outside the scrolling body so close remains reachable", async () => {
    const a = fakeAdapter(false); ui(a);
    const body = await screen.findByTestId("data-entry-body");
    expect(body.className).toMatch(/overflow-y-auto/);
    expect(body.contains(screen.getByText("Assistente de Entrada de Dados"))).toBe(false);
    expect(screen.getByRole("button", { name: /close|fechar/i })).toBeInTheDocument();
  });
  it("endpoint ausente: mostra indisponível e não oferece ações", async () => {
    const a = fakeAdapter(false); a.status = vi.fn(async () => { throw new DataEntryError("O assistente ainda não está ativo neste ambiente. Nada foi guardado nem lançado.", 404); });
    ui(a);
    expect(await screen.findByRole("alert")).toHaveTextContent("ainda não está ativo");
    expect(screen.queryByRole("button", { name: "Novo lote" })).toBeNull();
  });
  it("execução não validada: prévia visível, botão desativado mesmo após confirmação", async () => {
    const a = fakeAdapter(false); await fillAndPreview(a);
    expect(a.preview).toHaveBeenCalledWith("s1", "d1", expect.objectContaining({ total_amount: 123, iva_amount: 23, currency: "EUR", invoice_date: "2026-10-17" }), { user_id: "u1", company_id: C });
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
    await waitFor(() => expect(a.execute).toHaveBeenCalledWith("s1", "pv1", "b".repeat(64), { user_id: "u1", company_id: C }));
    expect(await screen.findByText("Registado e conferido")).toBeInTheDocument();
    expect(screen.getByText(/Feito por LLM com autorização de Gestora M/)).toBeInTheDocument();
  });
  it("editar depois da prévia exige nova prévia/hash antes de executar", async () => {
    const a = fakeAdapter(true); await fillAndPreview(a);
    fireEvent.change(screen.getByLabelText("Total (EUR)"), { target: { value: "124" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Autorizar e executar este lote" })).toBeDisabled();
    expect(a.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Preparar prévia" }));
    await waitFor(() => expect(a.preview).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeDisabled());
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Autorizar e executar este lote" })).not.toBeDisabled();
  });
  it("retoma nunca declara sucesso por cache; repõe campos, lê check, sem commit", async () => {
    const a = fakeAdapter(true); await fillAndPreview(a);
    const state = await a.session();
    state.results = [{ preview_id: "pv1", result: { invoice_id: "i1", observation: "cache", total_amount: 123, invoice_date: "2026-10-17", path: "x", status: "new", approved_name: "M" } }];
    a.session = vi.fn(async () => state);
    // Close/remount through a fresh render keeps only the user+company resume pointer.
    const { cleanup } = await import("@testing-library/react"); cleanup(); ui(a);
    fireEvent.click(await screen.findByRole("button", { name: "Retomar último lote" }));
    expect(await screen.findByText("Conferência pendente")).toBeInTheDocument();
    expect(screen.queryByText("Registado e conferido")).toBeNull();
    expect(screen.getByLabelText("Fornecedor")).toHaveValue("Fornecedor Fictício");
    expect(a.check).toHaveBeenCalledWith("s1", "pv1", { user_id: "u1", company_id: C });
    expect(a.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Conferir novamente" }));
    await waitFor(() => expect(a.check).toHaveBeenCalledTimes(2));
  });
  it("resposta de load após fecho/reabertura é descartada", async () => {
    const a = fakeAdapter(true); const state = await a.session();
    let resolve: (s: DataEntryState) => void = () => {};
    a.session = vi.fn(() => new Promise<DataEntryState>((r) => { resolve = r; }));
    const mounted = ui(a);
    fireEvent.click(await screen.findByRole("button", { name: "Novo lote" }));
    mounted.rerender(<MemoryRouter><DataEntryDialog open={false} onOpenChange={() => {}} adapter={a} /></MemoryRouter>);
    mounted.rerender(<MemoryRouter><DataEntryDialog open onOpenChange={() => {}} adapter={a} /></MemoryRouter>);
    resolve(state);
    expect(await screen.findByRole("button", { name: "Novo lote" })).not.toBeDisabled();
    expect(screen.queryByText("Empresa Fictícia")).toBeNull();
  });
  it("troca empresa descarta load antigo e não mostra retoma de outra empresa", async () => {
    const a = fakeAdapter(true); const state = await a.session();
    let resolve: (s: DataEntryState) => void = () => {};
    a.session = vi.fn(() => new Promise<DataEntryState>((r) => { resolve = r; }));
    ui(a); fireEvent.click(await screen.findByRole("button", { name: "Novo lote" }));
    a.status = vi.fn(async () => ({ user_id: "u1", role: "manager", company_id: "c2", capabilities: { upload: true } }));
    const { act } = await import("@testing-library/react");
    act(() => window.dispatchEvent(new CustomEvent("mp:active-company-changed", { detail: { companyId: "c2" } })));
    resolve(state);
    expect(await screen.findByRole("button", { name: "Novo lote" })).not.toBeDisabled();
    expect(screen.queryByText("Empresa Fictícia")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retomar último lote" })).toBeNull();
  });
  it.each(["close", "company"])("execução tardia após %s não mostra sucesso e retoma só confere", async (mode) => {
    const a = fakeAdapter(true); await fillAndPreview(a);
    let resolve: (v: Awaited<ReturnType<DataEntryAdapter["execute"]>>) => void = () => {};
    a.execute = vi.fn(() => new Promise<Awaited<ReturnType<DataEntryAdapter["execute"]>>>((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Autorizar e executar este lote" }));
    await waitFor(() => expect(a.execute).toHaveBeenCalledTimes(1));
    const { act, cleanup } = await import("@testing-library/react");
    if (mode === "company") {
      a.status = vi.fn(async () => ({ user_id: "u1", role: "manager", company_id: "c2", capabilities: { upload: true } }));
      act(() => window.dispatchEvent(new CustomEvent("mp:active-company-changed", { detail: { companyId: "c2" } })));
    } else { cleanup(); ui(a); }
    act(() => resolve({ status: "conferido", result: { invoice_id: "i1", observation: "late", total_amount: 123, invoice_date: "2026-10-17", path: "x", status: "new", approved_name: "M" } }));
    expect(await screen.findByRole("button", { name: "Novo lote" })).not.toBeDisabled();
    expect(screen.queryByText("Registado e conferido")).toBeNull();
    if (mode === "close") {
      fireEvent.click(screen.getByRole("button", { name: "Retomar último lote" }));
      expect(await screen.findByText("Conferência pendente")).toBeInTheDocument();
      expect(a.check).toHaveBeenCalled(); expect(a.execute).toHaveBeenCalledTimes(1);
    }
  });
  it.each(["upload", "preview"])("resposta tardia de %s após contexto alterado é descartada", async (action) => {
    const a = fakeAdapter(true); await fillAndPreview(a);
    let finish: (v: any) => void = () => {};
    if (action === "preview") {
      a.preview = vi.fn(() => new Promise<Awaited<ReturnType<DataEntryAdapter["preview"]>>>((r) => { finish = r; }));
      fireEvent.change(screen.getByLabelText("Total (EUR)"), { target: { value: "124" } });
      fireEvent.click(screen.getByRole("button", { name: "Preparar prévia" }));
    } else {
      const { cleanup } = await import("@testing-library/react"); cleanup();
      a.session = vi.fn(async () => ({ ...(await fakeAdapter(true).session()), session: { id: "s2", created_at: "" } }));
      a.upload = vi.fn(() => new Promise<{id:string;reused:boolean}>((r) => { finish = r; }));
      ui(a); fireEvent.click(await screen.findByRole("button", { name: "Novo lote" }));
      fireEvent.change(await screen.findByLabelText("Escolher documento"), { target: { files: [new File(["x"], "late.pdf", {type:"application/pdf"})] } });
    }
    await waitFor(() => expect(a[action]).toHaveBeenCalled());
    const calls = vi.mocked(a.session).mock.calls.length;
    a.status = vi.fn(async () => ({ user_id: "u1", role: "manager", company_id: "c2", capabilities: { upload: true } }));
    const { act } = await import("@testing-library/react");
    act(() => window.dispatchEvent(new CustomEvent("mp:active-company-changed", { detail: { companyId: "c2" } })));
    act(() => finish({ id:"late", reused:false }));
    expect(await screen.findByRole("button", { name: "Novo lote" })).not.toBeDisabled();
    expect(screen.queryByText("f.pdf")).toBeNull(); expect(a.session).toHaveBeenCalledTimes(calls);
  });
  it("utilizador diferente não recebe retoma; contexto revalidado antes de execução", async () => {
    const a = fakeAdapter(true); await fillAndPreview(a);
    a.status = vi.fn(async () => ({ user_id:"u1", role:"manager", company_id:"c2", capabilities:{upload:true} }));
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Autorizar e executar este lote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Empresa ou sessão alterada"); expect(a.execute).not.toHaveBeenCalled();
    const { cleanup } = await import("@testing-library/react"); cleanup();
    auth.id="u2"; a.status=vi.fn(async () => ({ user_id:"u2",role:"manager",company_id:C,capabilities:{upload:true} })); ui(a);
    expect(await screen.findByRole("button", {name:"Novo lote"})).not.toBeDisabled();
    expect(screen.queryByRole("button", {name:"Retomar último lote"})).toBeNull();
  });
  it("valores: pt-PT com cêntimos; recusa 3 casas e texto", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56); expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("1,234")).toBeNull(); expect(parseAmount("abc")).toBeNull();
  });
});
