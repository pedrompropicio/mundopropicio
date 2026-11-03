import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import TicketOffices from "@/pages/TicketOffices";
import { EventTicketing } from "@/components/EventTicketing";
import { INTERNAL_TRANSFER_CATEGORY_ID } from "@/lib/ticket-office-balance";

const fixtures = vi.hoisted(() => ({ queries: {} as Record<string, unknown> }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Query and mutation functions are never executed; reads are synthetic fixtures.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: fixtures.queries[String(queryKey[0])], isLoading: false, isSuccess: true,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: () => { throw new Error("#498: serviço MP proibido neste teste"); } }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user" }, isAdmin: true, isManager: false, hasPermission: () => true, loading: false,
}) }));
vi.mock("@/contexts/EventScenarioContext", () => ({ useEventScenario: () => ({
  selectedVersionId: null, setSelectedVersionId: vi.fn(), isScenarioMode: false,
}) }));
vi.mock("@/hooks/useBPVersions", () => ({ useBPVersions: () => ({ data: [] }) }));
vi.mock("@/components/bp-versions/BPScenarioSelector", () => ({ BPScenarioSelector: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/SalesLogPanel", () => ({ SalesLogPanel: () => null }));
vi.mock("@/components/EventCourtesiesEditor", () => ({ EventCourtesiesEditor: () => null }));
vi.mock("@/components/TicketForecastImportModal", () => ({ TicketForecastImportModal: () => null }));
vi.mock("@/components/TicketOfficeFormModal", () => ({ TicketOfficeFormModal: () => null }));
vi.mock("@/components/TicketUploadModals", () => ({ TicketImportModal: () => null }));
vi.mock("@/components/FeverImportModal", () => ({ FeverImportModal: () => null }));
vi.mock("@/components/TicketOfficeSettlementModal", () => ({ TicketOfficeSettlementModal: () => null }));

const amount = 1234.56;
const brAmount = "R$\u00a01.234,56";
const officeId = "10000000-0000-4000-8000-000000000011";
const eventId = "10000000-0000-4000-8000-000000000012";
const officeName = "Bilheteira sintética";
const planning = {
  event_id: eventId, nome: "Evento sintético", previsto_original: amount, zonas: [],
  cenario: { modo: "previsao", percentagem: 100, receita_manual_bruta: amount, viragem_real_dias: null },
};

function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company: Company | null = country === null ? null : {
    id: "fixture-company", country, currency, legal_name: "Empresa sintética", display_name: "Empresa sintética",
    slug: "fixture", tax_id: null, timezone: "UTC", logo_url: null, favicon_url: null, theme_config: null,
    address: null, contact_email: null, status: "active",
  };
  vi.mocked(useCompany).mockReturnValue({
    company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides,
  });
}

function snapshot(node: HTMLElement) {
  // Same normalization as P1e: only unstable React/Radix IDs, no monetary,
  // whitespace, NBSP, markup or other attribute normalization.
  return createHash("sha256").update(node.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
const offices = () => <MemoryRouter><TicketOffices /></MemoryRouter>;
const ticketing = () => <MemoryRouter><EventTicketing eventId={eventId} eventStatus="planning" /></MemoryRouter>;

function selectOffice() {
  fireEvent.click(screen.getByRole("heading", { name: officeName }));
}
function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
  expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
}
function openScenario() {
  fireEvent.click(screen.getByRole("button", { name: "Cenário de receita" }));
  return screen.getByRole("dialog");
}
function expectSummary(formatted: string) {
  for (const label of ["Retido", "Transferido", "Movimentado"]) {
    const cell = screen.getByText(label).parentElement!;
    expect(cell.textContent).toContain(formatted);
  }
}
function expectCards(formatted: string) {
  const cards = screen.getByRole("region", { name: "Posição da bilheteira" });
  for (const label of ["Valor por apurar", "Já adiantado", "Saldo retido"]) {
    expect(within(cards).getByText(label).parentElement?.textContent).toContain(formatted);
  }
  return cards;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida neste teste"); }));
  setCompany();
  fixtures.queries = {
    ticket_offices: [{ id: officeId, name: officeName, is_active: true, initial_balance: 2 * amount,
      contact_name: "Contacto sintético", email_contact: "fixture@example.invalid", phone: "000000000", description: "Notas sintéticas" }],
    ticket_office_sales_rpc: [{ event_id: eventId, financial_account_id: officeId, quantity: 1, total_value: 2 * amount }],
    ticket_office_balances: [{ account_id: officeId, event_id: eventId, type: "expense", status: "paid", paid_amount: amount,
      category_id: INTERNAL_TRANSFER_CATEGORY_ID, is_hidden: false, reversed_at: null }],
    ticket_office_assignments_all: [{ financial_account_id: officeId, event_id: eventId }],
    ticket_office_advances_all: [],
    "ticket-office-position": { openTotal: amount, advanced: amount, retained: amount, position: -amount, calendarDifference: amount,
      openEvents: [{ id: eventId, name: planning.nome, balance: amount }],
      calendarItems: [{ id: "fixture-calendar", description: "Movimento sintético", amount: -amount }],
      latest: { number: "TEST-498" } },
    "coverage-scenario-planning": { event: planning, root: planning }, "coverage-scenario-history": [],
    "ticketline-cutoffs": new Map(),
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("#498 P1e-b — hashes PT capturados ANTES de alterar a implementação (não regenerar)", () => {
  it("congela a página de Bilheteiras na lista, no resumo e com Apuramentos aberto", () => {
    const { container } = render(offices());
    expectSummary("1.234,56\u00a0€");
    expect(snapshot(container)).toMatchInlineSnapshot(`"d16a299cf37344014d58675607b6d7d556321f276a5f15199006c90ed8b4e465"`);
    selectOffice();
    expectSummary("1.234,56\u00a0€");
    expect(snapshot(container)).toMatchInlineSnapshot(`"8c374eb5fdd892eb189ed440ab7062e20a5abfe9e595157f01ff396e926974c5"`);
    selectTab("Apuramentos");
    expectCards("1.234,56\u00a0€");
    // Real statements/advances panels remain mounted and are covered by the hash.
    expect(screen.getByText("Total registado")).toBeInTheDocument();
    expect(snapshot(container)).toMatchInlineSnapshot(`"f30d1e3e98c0f9d6abcfc93d8e79a5392e719ad81c6c15cc71ae51706b1f8786"`);
  });

  it("congela o cenário aberto pelo botão real de EventTicketing", () => {
    render(ticketing());
    const dialog = openScenario();
    expect(within(dialog).getByLabelText("Receita manual bruta (€)")).toHaveValue(amount);
    expect(snapshot(dialog)).toMatchInlineSnapshot(`"0081923fb66aba08740354dfc5d04013b0f91af4a4ae4c3a7ad41deb20ceec8c"`);
  });
});

describe("#498 P1e-b — locale nos chamadores reais", () => {
  it("BR: Retido, Transferido e Movimentado usam R$ na lista e no resumo", () => {
    setCompany("BR", "BRL");
    render(offices());
    expectSummary(brAmount);
    expect(document.body.textContent).not.toContain("€");
    selectOffice();
    expectSummary(brAmount);
    expect(document.body.textContent).not.toContain("€");
  });

  it("BR: Apuramentos passa o locale aos cartões e aos seus detalhes", () => {
    setCompany("BR", "BRL");
    render(offices());
    selectOffice();
    selectTab("Apuramentos");
    const cards = expectCards(brAmount);
    fireEvent.click(within(cards).getByRole("button", { name: "1 eventos" }));
    expect(within(cards).getByRole("link", { name: planning.nome }).parentElement?.textContent).toContain(brAmount);
    fireEvent.click(within(cards).getByRole("button", { name: /Diferença de calendário:/ }));
    expect(within(cards).getByText("Movimento sintético").parentElement?.textContent).toContain(`-${brAmount}`);
    expect(cards.textContent).not.toContain("€");
  });

  it("BR: EventTicketing abre o modal real com rótulo e duas prévias em R$", () => {
    setCompany("BR", "BRL");
    render(ticketing());
    const dialog = openScenario();
    const manual = within(dialog).getByLabelText("Receita manual bruta (R$)");
    expect(manual).toHaveValue(amount);
    expect(within(dialog).getAllByText(brAmount, { normalizer: text => text })).toHaveLength(2);
    fireEvent.change(manual, { target: { value: "2469.12" } });
    expect(within(dialog).getByText("R$\u00a02.469,12", { normalizer: text => text })).toBeInTheDocument();
    expect(dialog.textContent).not.toContain("€");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    [null, "EUR", {}], ["BR", "", {}],
    ["PT", "EUR", { isLoading: true }],
    ["PT", "EUR", { isError: true, error: new Error("fixture failure") }],
  ] as const)("locale indisponível (%s/%s/%j) não infere euros no resumo, cartões ou cenário", (country, currency, overrides) => {
    setCompany(country, currency, overrides);
    const page = render(offices());
    expectSummary("—");
    expect(page.container.textContent).not.toMatch(/€|R\$/);
    selectOffice();
    expectSummary("—");
    expect(page.container.textContent).not.toMatch(/€|R\$/);
    selectTab("Apuramentos");
    expect(expectCards("—").textContent).not.toMatch(/€|R\$/);
    page.unmount();
    render(ticketing());
    const dialog = openScenario();
    expect(dialog.textContent).not.toMatch(/€|R\$/);
    // Missing companyId retains the modal's existing no-form guard.
    expect(within(dialog).queryByLabelText(/Receita manual bruta/)).toBe(within(dialog).queryByLabelText("Receita manual bruta (—)"));
  });

  it("PT → BR → PT actualiza as duas vistas e os cartões, repondo os bytes PT", () => {
    const { container, rerender } = render(offices());
    const listPT = snapshot(container);
    selectOffice();
    const summaryPT = snapshot(container);
    selectTab("Apuramentos");
    const cardsPT = snapshot(container);

    setCompany("BR", "BRL");
    rerender(offices());
    expect(expectCards(brAmount).textContent).not.toContain("€");
    selectTab("Dados");
    expectSummary(brAmount);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expectSummary(brAmount);

    setCompany();
    rerender(offices());
    expect(snapshot(container)).toBe(listPT);
    selectOffice();
    expect(snapshot(container)).toBe(summaryPT);
    selectTab("Apuramentos");
    expect(snapshot(container)).toBe(cardsPT);
  });

  it("PT → BR → PT actualiza o cenário já aberto e repõe os bytes PT", () => {
    const { rerender } = render(ticketing());
    const original = snapshot(openScenario());
    setCompany("BR", "BRL");
    rerender(ticketing());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Receita manual bruta (R$)")).toHaveValue(amount);
    expect(dialog.textContent).toContain(brAmount);
    expect(dialog.textContent).not.toContain("€");
    setCompany();
    rerender(ticketing());
    expect(snapshot(screen.getByRole("dialog"))).toBe(original);
  });

  it("a moeda configurada prevalece sobre a moeda habitual do locale", () => {
    setCompany("PT", "BRL");
    const page = render(offices());
    expectSummary("1234,56\u00a0R$");
    selectOffice();
    expectSummary("1234,56\u00a0R$");
    selectTab("Apuramentos");
    expect(expectCards("1234,56\u00a0R$").textContent).not.toContain("€");
    page.unmount();
    render(ticketing());
    const dialog = openScenario();
    expect(within(dialog).getByLabelText("Receita manual bruta (R$)")).toHaveValue(amount);
    expect(dialog.textContent).toContain("1234,56\u00a0R$");
    expect(dialog.textContent).not.toContain("€");
  });
});
