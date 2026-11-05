import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany } from "@/hooks/useCompany";
import { EventTicketing } from "@/components/EventTicketing";
import { EventClosingCosts } from "@/components/EventClosingCosts";
import RecurringTransactions from "@/pages/RecurringTransactions";
import Quotations from "@/pages/Quotations";
import { NewCardExpenseModal } from "@/components/cards/NewCardExpenseModal";
import { CamarimItemModal } from "@/components/camarim/CamarimItemModal";
import { ImplBPTab } from "@/components/implementation/ImplBPTab";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return ({
  reads: {} as Record<string, any>, lines: [] as any[], buffer: null as ArrayBuffer | null,
  queries: {} as Record<string, any>, writes: [] as { table: string; payload: any }[],
  mutations: [] as Promise<any>[],
}); });
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@/contexts/EventScenarioContext", () => ({ useEventScenario: () => ({ selectedVersionId: null, isScenarioMode: false }) }));
vi.mock("@/hooks/useBPVersions", () => ({ useBPVersions: () => ({ data: [] }) }));
vi.mock("@/hooks/useInvalidateEventFinancials", () => ({ useInvalidateEventFinancials: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: f.queries[queryKey[0]], isLoading: false, isSuccess: true, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: any) => ({ isPending: false, mutate: (input: any) => {
    const result = Promise.resolve().then(() => options.mutationFn(input));
    f.mutations.push(result); result.catch(options.onError);
  } }),
}));
// All reads/writes below are in-memory fixtures. No real client or credential is loaded.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "fixture:bp" }, error: null }) }) },
  auth: { getUser: async () => ({ data: { user: { email: "fixture@example.invalid" } } }) },
  rpc: async () => ({ data: "with_bp", error: null }),
  from: (table: string) => {
    const q: any = {
      select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q,
      insert: (payload: any) => { f.writes.push({ table, payload }); return q; },
      update: (payload: any) => { f.writes.push({ table, payload }); return q; },
      single: async () => ({ data: { id: "created" }, error: null }),
      maybeSingle: async () => ({ data: f.reads[table] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: f.reads[table] ?? [], error: null }).then(resolve),
    }; return q;
  },
} }));
vi.mock("@/lib/camarim-bp-lines", () => ({ fetchCamarimLines: async () => f.lines }));
vi.mock("@/lib/image-upload", () => ({ isHeicFile: () => false, normalizeImageFile: vi.fn(), HEIC_ACCEPT: "" }));
vi.mock("@/lib/pdf-first-page-to-jpeg", () => ({ pdfFirstPageToJpeg: vi.fn() }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/BpFormulaPanel", () => ({ BpFormulaPanel: () => null }));
vi.mock("@/components/bp-versions/BPScenarioSelector", () => ({ BPScenarioSelector: () => null }));
vi.mock("@/components/SalesLogPanel", () => ({ SalesLogPanel: () => null }));
vi.mock("@/components/EventCourtesiesEditor", () => ({ EventCourtesiesEditor: () => null }));
vi.mock("@/components/TicketForecastImportModal", () => ({ TicketForecastImportModal: () => null }));
vi.mock("@/components/SupplierFormModal", () => ({ SupplierFormModal: () => null }));
vi.mock("@/components/CategoryFormModal", () => ({ default: () => null }));
vi.mock("@/components/LinkBpLineDialog", () => ({ default: () => null }));
vi.mock("@/components/cards/CardItemDocumentsField", () => ({ default: () => null }));
vi.mock("@/components/camarim/SplitItemModal", () => ({ SplitItemModal: () => null }));

const amount = 1234.56;
const event = { id: "fixture-event", name: "Evento sintético", event_type: "single", parent_event_id: null };
const recurring = { id: "fixture-recurring", description: "Recorrente sintética", type: "expense", amount, iva_rate: 23,
  frequency: "monthly", day_of_month: 1, start_date: "2026-11-01", end_date: null, is_active: true };
const forecast = { id: "fixture-forecast", description: "Previsão sintética", specification: "", amount, iva_rate: 23,
  type: "expense", category_id: "fixture-category", status: "approved", account_categories: { code: "2.6.04", name: "Camarins" } };
function company(country = "PT", currency = "EUR", overrides = {}) {
  vi.mocked(useCompany).mockReturnValue({ company: { id: "fixture-company", country, currency }, companyId: "fixture-company",
    isLoading: false, isError: false, ...overrides } as ReturnType<typeof useCompany>);
}
type View = "ticketing" | "closing" | "recurring" | "quotations" | "card" | "camarim" | "implementation";
function component(view: View) {
  switch (view) {
    case "ticketing": return <EventTicketing eventId={event.id} eventStatus="planning" />;
    case "closing": return <EventClosingCosts eventId={event.id} eventStatus="planning" />;
    case "recurring": return <RecurringTransactions />;
    case "quotations": return <Quotations />;
    case "card": return <NewCardExpenseModal open onOpenChange={() => {}} sessionId="fixture-session" cardAccountId="fixture-card" />;
    case "camarim": return <CamarimItemModal open onOpenChange={() => {}} sessionId="fixture-session" mode="manager" />;
    case "implementation": return <ImplBPTab implementation={{ id: "fixture-implementation" }} event={event} allEvents={[event]} />;
  }
}
async function open(view: View) {
  const result = render(<MemoryRouter>{component(view)}</MemoryRouter>);
  if (view === "closing") fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  if (view === "recurring") fireEvent.click(screen.getByRole("button", { name: "Novo Template" }));
  if (view === "quotations") fireEvent.click(screen.getByRole("button", { name: "Nova Cotação" }));
  if (view === "ticketing") fireEvent.click(screen.getAllByText("Zona sintética")[0]);
  if (view === "closing") fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: String(amount) } });
  if (view === "card") fireEvent.change(Array.from(document.body.querySelectorAll('input[type="number"]')).at(-1)!, { target: { value: String(amount) } });
  if (view === "camarim") fireEvent.change(screen.getByLabelText(/^Total \(/), { target: { value: String(amount) } });
  await act(async () => {});
  return result;
}
function hash() {
  // Only unstable React/Radix IDs are normalized. Monetary bytes, whitespace and markup are preserved.
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
beforeEach(() => {
  company(); f.writes = []; f.mutations = []; f.reads = {}; f.lines = []; f.buffer = null;
  f.queries = {
    "event-iva-country": ["Portugal"], "ticketline-cutoffs": new Map(),
    event_ticket_zones: [{ id: "fixture-zone", name: "Zona sintética", capacity: 1, event_id: event.id, sort_order: 0 }],
    event_ticket_lots: [{ id: "fixture-lot", zone_id: "fixture-zone", name: "Lote sintético", quantity: 1, price: amount, iva_rate: 0, lot_type: "regular", lot_kind: "simple" }],
    "event-ticketing-meta": event,
    "event-overhead-forecasts": [forecast], "recurring-transactions": [recurring],
    quotations: [{ id: "fixture-quotation", description: "Cotação sintética", amount, iva_rate: 23, status: "pending", created_at: "2026-11-01", suppliers: { name: "Fornecedor sintético" }, events: { name: event.name } }],
    "impl-forecasts": [forecast], "impl-categories": [{ id: "fixture-category", code: "2.6.04", name: "Camarins", type: "expense", level: 3 }],
  };
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "fixture:bp" && f.buffer) return Promise.resolve({ arrayBuffer: async () => f.buffer });
    throw new Error("#498 P2g: rede proibida");
  }));
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498 P2g: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498 P2g: rede proibida"); } });
});
afterEach(() => { for (const [url] of vi.mocked(fetch).mock.calls) expect(url).toBe("fixture:bp"); cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("#498 P2g — hashes PT capturados ANTES das alterações (não regenerar)", () => {
  it("bilheteira", async () => { await open("ticketing"); expect(hash()).toMatchInlineSnapshot(`"1df5eccb26ece1a910693ee0280fa7a5f03784fbb8ab5d07016f224c0495a9fa"`); });
  it("custos de fecho", async () => { await open("closing"); expect(hash()).toMatchInlineSnapshot(`"6a7462711b835edcf1567b31be0bacfef30f8cd6d437dd53e806a62f1879f302"`); });
  it("recorrentes", async () => { await open("recurring"); expect(hash()).toMatchInlineSnapshot(`"e4cd67e69d477e89bcff98bb310de98f2ad1d283c8494662753ba83dc8bdba9b"`); });
  it("cotações", async () => { await open("quotations"); expect(hash()).toMatchInlineSnapshot(`"78ab78b54afcb1fa4afcdfd45c69a3500ac922bf46c26fc215ff47f090d26792"`); });
  it("despesa de cartão", async () => { await open("card"); expect(hash()).toMatchInlineSnapshot(`"374cafe523e1a5e676083b6812e35cfb7ba7c915c975b7b3130bfa1563ac4b50"`); });
  it("item de camarim", async () => { await open("camarim"); expect(hash()).toMatchInlineSnapshot(`"54f97fbb439f14223e8ec4b7758caa94c8a2c0bba15cd358c7b53a762fd97ea0"`); });
  it("BP de implementação", async () => { await open("implementation"); expect(hash()).toMatchInlineSnapshot(`"fb94558909667616b69b50dad12a0be34978e4be27a679425e387ddbb1a91513"`); });
});

const views: View[] = ["ticketing", "closing", "recurring", "quotations", "card", "camarim", "implementation"];
describe("#498 P2g — BR, contexto indisponível e mudanças de empresa", () => {
  it.each(views)("%s usa o símbolo da empresa sem euros", async view => {
    company("BR", "BRL");
    await open(view);
    expect(document.body.textContent).not.toContain("€");
    expect(document.body.textContent).toContain("R$");
    if (view !== "camarim") expect(document.body.textContent).toContain("R$\u00a01.234,56");
    if (["closing", "recurring", "quotations", "card", "implementation"].includes(view)) {
      expect(screen.queryByText("Taxa IVA")).not.toBeInTheDocument();
      expect(screen.queryByText("IVA (%)")).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "IVA" })).not.toBeInTheDocument();
    }
    if (view === "implementation") expect(screen.getByRole("columnheader", { name: "Valor Base (R$)" })).toBeInTheDocument();
    if (view === "card") {
      expect(screen.getByText("Nota Fiscal/Doc")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Ex: NF 12345")).toBeInTheDocument();
      expect(screen.getByText("Total c/IVA (R$) *")).toBeInTheDocument();
    }
  });

  it.each(views)("%s: contexto indisponível não inventa moeda", async view => {
    company("BR", "BRL", { isLoading: true });
    await open(view);
    expect(document.body.textContent).not.toMatch(/€|R\$/);
    expect(document.body.textContent).toContain("—");
    if (view === "closing") expect(document.body.querySelector('select option[value="23"]:checked')).toBeInTheDocument();
    if (view === "recurring" || view === "quotations") expect(screen.getAllByRole("combobox").find(node => node.textContent === "23%")).toBeInTheDocument();
    if (view === "card") expect(document.body.querySelector('select option[value="23"]:checked')).toBeInTheDocument();
  });

  it.each(views)("%s: PT → BR → PT repõe o DOM PT", async view => {
    const result = await open(view);
    const pt = hash();

    company("BR", "BRL");
    result.rerender(<MemoryRouter>{component(view)}</MemoryRouter>);
    await act(async () => {});
    expect(document.body.textContent).not.toContain("€");
    company();
    result.rerender(<MemoryRouter>{component(view)}</MemoryRouter>);
    await act(async () => {});
    expect(hash()).toBe(pt);
  });
});

describe.each([["PT", "EUR", 23], ["BR", "BRL", 0]] as const)("#498 P2g — defaults e payloads %s", (country, currency, rate) => {
  beforeEach(() => company(country, currency));
  it("custos de fecho gravam a taxa da política e o reset volta ao mesmo default", async () => {
    await open("closing");
    fireEvent.change(screen.getByPlaceholderText("Ex: Rateio assessoria de imprensa"), { target: { value: "Custo sintético" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(f.mutations).toHaveLength(1)); await Promise.all(f.mutations);
    expect(f.writes.find(w => w.table === "event_forecasts")?.payload).toMatchObject({ amount, iva_rate: rate });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    if (rate) expect(document.body.querySelector('select option[value="23"]:checked')).toBeInTheDocument();
    else expect(screen.queryByText("IVA (%)")).not.toBeInTheDocument();
  });
  it("recorrentes mantêm o montante e a taxa ao gerar as transações", async () => {
    await open("recurring");
    const form = document.body.querySelector("form")!;
    fireEvent.change(form.querySelector('input[type="number"]')!, { target: { value: String(amount) } });
    fireEvent.submit(form);
    await waitFor(() => expect(f.mutations).toHaveLength(1)); await Promise.all(f.mutations);
    expect(f.writes.find(w => w.table === "recurring_transactions")?.payload).toMatchObject({ amount, iva_rate: rate });
    const generated = f.writes.find(w => w.table === "transactions")?.payload;
    // The legacy generator includes the end month (November 2026 through November 2027).
    expect(generated).toHaveLength(13);
    expect(generated[0].date).toBe("2026-11-01");
    expect(generated[12].date).toBe("2027-11-01");
    for (const tx of generated) expect(tx).toMatchObject({ amount, iva_rate: rate });
  });
  it("cotações mantêm o valor nativo e a taxa da política", async () => {
    await open("quotations");
    fireEvent.change(screen.getByLabelText(/^Valor \(/), { target: { value: String(amount) } });
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.mutations).toHaveLength(1)); await Promise.all(f.mutations);
    expect(f.writes.find(w => w.table === "quotations")?.payload).toMatchObject({ amount, iva_rate: rate });
  });
  it("cartão grava o item com o documento e a taxa da política", async () => {
    f.queries["l3-categories"] = [
      { id: "root", code: "2", name: "Despesa", type: "expense", parent_id: null },
      { id: "parent", code: "2.6", name: "Produção", type: "expense", parent_id: "root" },
      { id: "leaf", code: "2.6.04", name: "Camarins", type: "expense", parent_id: "parent" },
    ];
    await open("card");
    const form = document.body.querySelector("form")!;
    fireEvent.change(form.querySelector("input")!, { target: { value: "Despesa sintética" } });
    fireEvent.click(screen.getByText("Selecionar rubrica…"));
    fireEvent.click(screen.getByText("2.6.04 — Camarins"));
    fireEvent.change(screen.getByPlaceholderText(rate ? "Ex: FT 002/5944" : "Ex: NF 12345"), { target: { value: "DOC-SINTETICO" } });
    const reasonLabel = screen.getByText("Justificação sem documento *");
    fireEvent.change(reasonLabel.parentElement!.querySelector("input")!, { target: { value: "Fixture sem comprovativo" } });
    fireEvent.submit(form);
    await waitFor(() => expect(f.mutations).toHaveLength(1)); await Promise.all(f.mutations);
    expect(f.writes.find(w => w.table === "card_session_items")?.payload).toMatchObject({
      amount: rate ? 1003.71 : amount, iva_rate: rate, invoice_ref: "DOC-SINTETICO", status: "approved",
    });
    expect(f.writes.some(w => w.table === "transactions")).toBe(false);
  });
  it("BP usa o parser partilhado e conserva os bytes PT da auditoria", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Descrição", "Custo", "IVA", "Total", "Status"],
      ["Camarins sintéticos", amount, 283.95, 1518.51, "A pagar"],
    ]), "Evento sintético");
    f.buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    f.queries["impl-forecasts"] = [];
    render(<ImplBPTab implementation={{ id: "fixture-implementation", reference_file_url: "synthetic.xlsx", reference_file_name: "synthetic.xlsx" }} event={event} allEvents={[event]} />);
    fireEvent.click(screen.getByRole("button", { name: "Analisar Ficheiro" }));
    await screen.findByRole("button", { name: "Importar BP" });
    if (!rate) {
      expect(document.body.textContent).not.toContain("€");
      expect(document.body.textContent).toContain("R$\u00a01.234,56");
      expect(screen.queryByRole("columnheader", { name: "IVA" })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Importar BP" }));
    await waitFor(() => expect(f.writes.some(w => w.table === "forecast_audit_log")).toBe(true));
    expect(f.writes.find(w => w.table === "event_forecasts")?.payload).toMatchObject({ amount, iva_rate: rate });
    expect(f.writes.find(w => w.table === "forecast_audit_log")?.payload.new_value).toBe(rate
      ? "Camarins sintéticos — 1234.56€" : "Camarins sintéticos — R$\u00a01.234,56");
  });
});

it("#498 P2g — camarim formata o saldo da linha real do seletor em R$", async () => {
  company("BR", "BRL");
  f.reads = { camarim_sessions: { master_event_id: event.id }, camarim_session_events: [{ event_id: event.id, is_primary: true }], events: { name: event.name } };
  f.lines = [{ id: "fixture-line", event_id: event.id, description: "Linha sintética", specification: null, amount, realized: 0 }];
  await open("camarim");
  const field = screen.getByTestId("camarim-item-bp-line");
  fireEvent.click(within(field).getByRole("combobox"));
  expect(screen.getByRole("option", { name: /disponível R\$\s1\.234,56/ })).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("€");
});
