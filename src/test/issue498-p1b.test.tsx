import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import Events from "@/pages/Events";
import { EventEditModal } from "@/components/EventEditModal";
import { EventFinancialCard } from "@/components/EventFinancialCard";
import { DashboardBalanceCards } from "@/components/DashboardBalanceCards";
import { TransactionRow } from "@/components/TransactionRow";

const fixtures = vi.hoisted(() => {
  // Match the original capture date before Events' module-level emptyForm loads.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  return ({
  queries: {} as Record<string, unknown>,
  card: {} as Record<string, unknown>,
  balances: {} as Record<string, unknown>,
  costBasis: { expenseSource: "committed", withVat: false, includeOverhead: true, isLoading: false, canEditBasis: false },
});
});

vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Queries supply synthetic reads; no queryFn/mutationFn is executed.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: fixtures.queries[String(queryKey[0])], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: () => { throw new Error("#498: serviço MP proibido neste teste"); } }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "fixture-user" }, isAdmin: true, isManager: false }) }));
vi.mock("@/hooks/useEventStages", () => ({ useEventStages: () => ({ data: {} }) }));
vi.mock("@/hooks/useEventFinancialCardData", () => ({ useEventFinancialCardData: () => fixtures.card }));
vi.mock("@/hooks/useEventCostBasis", () => ({ useEventCostBasis: () => fixtures.costBasis }));
vi.mock("@/hooks/useAccountBalanceCards", () => ({
  useAccountBalanceCards: () => fixtures.balances,
  CASH_ACCOUNT_TYPES: ["bank", "cash", "prepaid_card"],
}));
// Unchanged leaf services are outside P1b. Tooltip content is always mounted so
// the render assertions also cover monetary values normally hidden on hover.
vi.mock("@/components/CityVenueSelector", () => ({ CityVenueSelector: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/BalanceCompositionModal", () => ({ BalanceCompositionModal: () => null }));
vi.mock("@/components/TransactionOffsetsBlock", () => ({ OffsetPaidBadge: () => null }));
vi.mock("@/components/ReimbursementNoteRefBadge", () => ({ ReimbursementNoteRefBadge: () => null }));
vi.mock("@/components/AccountantReviewBadge", () => ({ AccountantReviewRowBadge: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

const event = {
  id: "fixture-event", company_id: "fixture-company", name: "Evento sintético",
  date: "2026-01-02", status: "planning", event_type: "simple", budget: 12345.67,
  totalIncome: 12345.6789, totalExpenses: 1234.5678, subEvents: [],
};
const transaction = {
  id: "fixture-tx", description: "Despesa sintética", type: "expense", amount: 1234.5678,
  iva_rate: 23, paid_amount: 20.01, status: "approved", due_date: "2099-12-31",
  created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-02T12:00:00Z",
  parent_transaction_id: "fixture-parent", event_id: event.id, events: { name: event.name },
  split_percentage: 50, split_amount: 1234.5678, invoice_ref: "TEST-498", supplier_id: "fixture-supplier",
};
const noop = () => {};

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

function Row({ tx = transaction }: { tx?: Record<string, unknown> }) {
  return <table><tbody><TransactionRow transaction={tx} canApprove={false}
    onEdit={noop} onApprove={noop} onPayment={noop} onDocs={noop} onAudit={noop} onDelete={noop} /></tbody></table>;
}

function AllScreens() {
  return <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <section data-testid="events"><Events /></section>
    <section data-testid="edit"><EventEditModal event={event} onClose={noop} /></section>
    <section data-testid="dashboard"><DashboardBalanceCards /></section>
    <section data-testid="income"><EventFinancialCard eventId={event.id} eventIds={[event.id]} kind="income" /></section>
    <section data-testid="expense"><EventFinancialCard eventId={event.id} eventIds={[event.id]} kind="expense" cacheImpact={33.3333} /></section>
    <section data-testid="transaction"><Row /></section>
  </MemoryRouter>;
}

function openDetails() {
  fireEvent.click(screen.getByRole("button", { name: "Novo Evento" }));
  fireEvent.click(screen.getByTitle("Ver movimentos"));
}

function snapshot(node: HTMLElement) {
  // Only React/Radix's generated IDs vary between mounts. All other DOM bytes,
  // attributes, whitespace and NBSP are included in the SHA-256, without trimming.
  const dom = node.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
  return { domSha256: createHash("sha256").update(dom).digest("hex"), text: node.textContent };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida neste teste"); }));
  setCompany();
  fixtures.costBasis.isLoading = false;
  fixtures.card = {
    displayValue: 0, realValue: -1234.5678, modeUsed: "committed", phase: "planning", unavailable: false,
    subtotals: [{ label: "Zero", value: 0 }, { label: "Negativo", value: -12345.6789 }, { label: "Sem dado", value: null }],
    formalidadeBreakdown: null, meta: { cacheAdded: 33.3333, masterQuota: 1234.5678, overhead: 10.01 },
  };
  fixtures.queries = {
    events_full: [event], cities_map: {}, venues_map: {}, "company-default-budget-mode": "with_bp", "business-lines": [],
    dashboard_balance_accounts: [{ id: "bank", type: "bank" }, { id: "office", type: "ticket_office" }],
    "invoice-group": [transaction, { id: "other", description: "Outra despesa", amount: 100, iva_rate: 0 }],
    "transaction-movements": [{ id: "movement", field_name: "Pagamento parcial", old_value: "10", new_value: "20.01", changed_at: "2026-01-02T12:00:00Z", changed_by: "sistema" }],
  };
  fixtures.balances = {
    isLoading: false, balances: {},
    cash: { total: 0, count: 1, hiddenNames: [], uncontrolledNames: [] },
    ticketOffice: { total: -12345.6789, count: 1, hiddenNames: [], uncontrolledNames: [] },
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P1b — baseline PT capturada antes de alterar os cinco componentes", () => {
  it("congela o DOM e texto integral dos cinco componentes, incluindo Novo Evento e movimentos", () => {
    render(<AllScreens />);
    openDetails();
    const baseline = Object.fromEntries(["events", "edit", "dashboard", "income", "expense", "transaction"].map((id) => [id, snapshot(screen.getByTestId(id))]));
    expect(baseline).toMatchInlineSnapshot(`
      {
        "dashboard": {
          "domSha256": "7df9a0c89c6f4e073695d0edccd13487d16624389fef13904e69a331582b5e1e",
          "text": "Esconder valoresSaldo em Caixa0,00 €Contas bancárias, caixa e cartões pré-pagosRetido em Bilheteiras-12.345,68 €Dinheiro que existe mas ainda não está no banco — não é caixa",
        },
        "edit": {
          "domSha256": "603dba5df164206605eceb984ce3b872d6972aaf7d06feead7b6c7d1ffaf0b98",
          "text": "Editar EventoNome *Natureza do eventoProdução própriaIntermediaçãoCoproduçãoParceiro localTemporadaData *EstadoPlaneamentoAtivoConcluídoCanceladoModo orçamentalPadrão da empresa (Com BP)Com BPSem BPLinha de negócioSem linhaModo BPBP AtivoControla saldo por categoriaBP PassivoTransações livresOrçamento (€)Bilhetes (total)Este evento absorve custos administrativosTransações das contas marcadas no Plano de Contas com data do documento dentro desta janela têm de ser lançadas neste evento. As janelas da empresa são contíguas: ligar uma janela depois de outra em aberto fecha a anterior no dia antes.Tráfego pagoOnde é lançado o tráfego desta famíliaTour — tudo lança neste eventoPor cidade — lança no sub-evento da cidadeExterno — nunca atribuir automaticamenteNomes alternativos usados nas campanhas (separados por vírgula)Guardar Alterações",
        },
        "events": {
          "domSha256": "7f92b74185f33dba5b49dbf035a41abd45d1a2570be444831cb152f6ac9a978d",
          "text": "Eventos Gestão e acompanhamento financeiro por eventoTodos os estágiosPlaneamentoEm cursoEm fechoFechadoHistóricoCanceladoMostrar históricosNatureza do evento: TodasNovo EventoNovo EventoTipo de Evento *Evento SimplesFestivalMúltiplos DiasNome *Data *EstadoPlaneamentoAtivoConcluídoCanceladoNatureza do eventoEscolha a natureza do eventoProdução própriaIntermediaçãoCoproduçãoParceiro localTemporadaLinha de negócioSem linhaModo BP *BP AtivoControla saldo por categoria do BPBP PassivoTransações livres sem controloModo orçamentalCom BP (padrão da empresa)Custo = previsto + excedido; linha de BP exigida nas despesasSem BPCusto = realizado; não exige linha de BPSessões (opcional) SessãoAdicione sessões se o evento tiver múltiplos espetáculos.Orçamento (€)Bilhetes (total)Criar EventoEscolha a natureza do eventoEvento sintético02/01/2026PlaneamentoEvento Simples— por definir —Orçamento10%Receitas12.345,68 €Despesas1.234,57 €Lucro11.111,11 €0 / 0 bilhetes",
        },
        "expense": {
          "domSha256": "267aed4b70bcd927a9f1df170ba4fa40bbc5a6229a4ce99e3849b4da1f02a5e5",
          "text": "CustosPrevisto + excedidos/IVA0,00 €Zero: 0,00 €Negativo: -12.345,68 €Sem dado: —Cachê: 33,33 €Rateio turnê: 1.234,57 €Overhead: 10,01 €",
        },
        "income": {
          "domSha256": "5839ff75f31a5d98e75b1fa0921716f0bc2836abd32695161c6e16d4a96c708f",
          "text": "ReceitasPrevisto + excedidos/IVA0,00 €real: -1.234,57 €Zero: 0,00 €Negativo: -12.345,68 €Sem dado: —",
        },
        "transaction": {
          "domSha256": "c79ec0bd99454dbad57bafe39f8be55a06b1ffdfcfe5dfb4a1817752c32d1238",
          "text": "Despesa sintéticaSplit 1234.57€Transação split vinculada a um rateio multi-evento.A liquidação é feita na transação master e propagada automaticamente.📄 TEST-498 (2) — 1.618,52 €Fatura agrupada: TEST-4982 transações — Total: 1.618,52 €Despesa sintética: 1.518,52 €Outra despesa: 100,00 €Agrupar faturaEvento sintéticoEvento sintético——A PagarAberto: 1.498,51 €31/12/209920,01 €-1.518,52 €Base: 1.234,57 € + IVA 23%Abre a transação master para liquidação completaMovimentos01/01/2026 12:00CriaçãoLançamento criado — 1.518,52 €02/01/2026 12:00PagamentoPago: 10,01 € de 1.518,52 €📄 TEST-498Sistema",
        },
      }
    `);
    fireEvent.click(screen.getByTitle("Vista em lista"));
    expect(snapshot(screen.getByTestId("events"))).toMatchInlineSnapshot(`
      {
        "domSha256": "1af58dd61dee8fefbb17b89ec377a910e9a0f05bcbc98bbebecabe4f36539f1a",
        "text": "Eventos Gestão e acompanhamento financeiro por eventoTodos os estágiosPlaneamentoEm cursoEm fechoFechadoHistóricoCanceladoMostrar históricosNatureza do evento: TodasNovo EventoNovo EventoTipo de Evento *Evento SimplesFestivalMúltiplos DiasNome *Data *EstadoPlaneamentoAtivoConcluídoCanceladoNatureza do eventoEscolha a natureza do eventoProdução própriaIntermediaçãoCoproduçãoParceiro localTemporadaLinha de negócioSem linhaModo BP *BP AtivoControla saldo por categoria do BPBP PassivoTransações livres sem controloModo orçamentalCom BP (padrão da empresa)Custo = previsto + excedido; linha de BP exigida nas despesasSem BPCusto = realizado; não exige linha de BPSessões (opcional) SessãoAdicione sessões se o evento tiver múltiplos espetáculos.Orçamento (€)Bilhetes (total)Criar EventoEscolha a natureza do eventoEventoData Local Estado ReceitasDespesasLucroEvento sintéticoEvento Simples02/01/202602/01/2026—Planeamento— por definir —12.345,68 €1.234,57 €11.111,11 €",
      }
    `);
  });

  it("congela a decomposição por formalidade, incluindo tooltips e extras", () => {
    fixtures.card.formalidadeBreakdown = { estimado: 12345.6789, negociacao: 33.3333, fechado: 10.01, pago: 0 };
    const { container } = render(<EventFinancialCard eventId={event.id} eventIds={[event.id]} kind="expense" cacheImpact={33.3333} />);
    expect(snapshot(container)).toMatchInlineSnapshot(`
      {
        "domSha256": "c1bd7a2534b27daf087087eb2c48ccac688838da53005ed5972ffab4cf495e20",
        "text": "CustosPrevisto + excedidos/IVA0,00 €Estimado: 12.345,68 € (100%)Negociação: 33,33 € (0%)Fechado: 10,01 € (0%)Estimado: 12.345,68 €Negociação: 33,33 €Fechado: 10,01 €+ Cachê: 33,33 €+ Rateio turnê: 1.234,57 €+ Overhead: 10,01 €",
      }
    `);
  });

  it("congela as filhas de rateio, incluindo o valor absoluto do split", () => {
    fixtures.queries["split-child-events"] = [{ name: event.name, pct: 50, absAmount: 1234.5678 }];
    fixtures.queries["split-children-full"] = [transaction];
    const { container } = render(<Row tx={{ ...transaction, parent_transaction_id: null, event_id: null, split_percentage: null }} />);
    fireEvent.click(screen.getByTitle("Ver subeventos"));
    expect(snapshot(container)).toMatchInlineSnapshot(`
      {
        "domSha256": "3b462e1e8bc554dc1f8c2a95b64aa8f24a93d8dea3e1f550efed15d3c182968f",
        "text": "Despesa sintéticaMasterTransação master de rateio multi-evento.A liquidação aqui propaga automaticamente para todas as transações split.📄 TEST-498 (2) — 1.618,52 €Fatura agrupada: TEST-4982 transações — Total: 1.618,52 €Despesa sintética: 1.518,52 €Outra despesa: 100,00 €Agrupar faturaEvento sintéticoEvento sintético (50%)——A PagarAberto: 1.498,51 €31/12/209920,01 €-1.518,52 €Base: 1.234,57 € + IVA 23%Subeventos (1)▸ Ver movimentosSplit 1234.57€Evento sintético20,01 €-1.518,52 €",
      }
    `);
  });
});

describe("#498 P1b — moeda da empresa activa", () => {
  it("BR: Novo/Editar Evento, dashboard, cards, splits, tooltips e movimentos usam R$ e NBSP", () => {
    setCompany("BR", "BRL");
    render(<AllScreens />);
    openDetails();
    const events = screen.getByTestId("events");
    expect(events.textContent).toContain("Orçamento (R$)");
    expect(screen.getByTestId("edit").textContent).toContain("Orçamento (R$)");
    expect(events.textContent).toContain("R$\u00a012.345,68");
    expect(events.textContent).toContain("R$\u00a01.234,57");
    expect(events.textContent).toContain("R$\u00a011.111,11");
    expect(screen.getByTestId("dashboard").textContent).toContain("R$\u00a00,00");
    expect(screen.getByTestId("dashboard").textContent).toContain("-R$\u00a012.345,68");
    expect(screen.getByTestId("income").textContent).toContain("R$\u00a00,00");
    expect(screen.getByTestId("income").textContent).toContain("real: -R$\u00a01.234,57");
    expect(screen.getByTestId("expense").textContent).toContain("Cachê: R$\u00a033,33");
    expect(screen.getByTestId("expense").textContent).toContain("Rateio turnê: R$\u00a01.234,57");
    expect(screen.getByTestId("expense").textContent).toContain("Overhead: R$\u00a010,01");
    const row = screen.getByTestId("transaction");
    expect(row.textContent).toContain("Split R$\u00a01.234,57");
    expect(row.textContent).toContain("Aberto: R$\u00a01.498,51");
    expect(row.textContent).toContain("Total: R$\u00a01.618,52");
    expect(row.textContent).toContain("Pago: R$\u00a010,01 de R$\u00a01.518,52");
    expect(row.textContent).toContain("Base: R$\u00a01.234,57 + IVA 23%");
    expect(document.body.textContent).not.toContain("€");
    fireEvent.click(screen.getByTitle("Vista em lista"));
    expect(events.textContent).toContain("R$\u00a012.345,68");
    expect(events.textContent).toContain("R$\u00a011.111,11");
    expect(events.textContent).not.toContain("€");
  });

  it("BR: formalidade e rateios filhos usam o mesmo formatter do card/linha", () => {
    setCompany("BR", "BRL");
    fixtures.card.formalidadeBreakdown = { estimado: 12345.6789, negociacao: 33.3333, fechado: 10.01, pago: 0 };
    fixtures.queries["split-child-events"] = [{ name: event.name, pct: 50, absAmount: 1234.5678 }];
    fixtures.queries["split-children-full"] = [transaction];
    const { container } = render(<>
      <EventFinancialCard eventId={event.id} eventIds={[event.id]} kind="expense" cacheImpact={33.3333} />
      <Row tx={{ ...transaction, parent_transaction_id: null, event_id: null, split_percentage: null }} />
    </>);
    fireEvent.click(screen.getByTitle("Ver subeventos"));
    expect(container.textContent).toContain("Estimado: R$\u00a012.345,68");
    expect(container.textContent).toContain("Negociação: R$\u00a033,33");
    expect(container.textContent).toContain("Split R$\u00a01.234,57");
    expect(container.textContent).not.toContain("€");
  });

  it.each([
    [null, "EUR", {}],
    ["BR", "", {}],
    ["PT", "EUR", { isLoading: true }],
    ["PT", "EUR", { isError: true, error: new Error("fixture failure") }],
  ] as const)("configuração ausente/inválida, carregamento ou erro mostra — sem moeda (%s/%s/%j)", (country, currency, overrides) => {
    // Transition from a rendered PT company also catches stale/default currency.
    const { rerender } = render(<AllScreens />);
    openDetails();
    expect(document.body.textContent).toContain("€");
    setCompany(country, currency, overrides);
    rerender(<AllScreens />);
    for (const id of ["events", "edit", "dashboard", "income", "expense", "transaction"]) {
      const text = screen.getByTestId(id).textContent;
      expect(text).toContain("—");
      expect(text).not.toMatch(/€|R\$/);
    }
    expect(screen.getByTestId("transaction").textContent).toContain("Split —");
    fireEvent.click(screen.getByTitle("Vista em lista"));
    expect(screen.getByTestId("events").textContent).not.toMatch(/€|R\$/);
  });

  it("PT → BR → PT actualiza os cinco componentes e repõe os mesmos bytes PT", () => {
    const { rerender } = render(<AllScreens />);
    openDetails();
    const pt = snapshot(document.body);
    setCompany("BR", "BRL");
    rerender(<AllScreens />);
    expect(document.body.textContent).toContain("Orçamento (R$)");
    expect(document.body.textContent).not.toContain("€");
    setCompany("PT", "EUR");
    rerender(<AllScreens />);
    expect(snapshot(document.body)).toEqual(pt);
  });

  it("a moeda vem da configuração mesmo quando difere da moeda habitual do locale", () => {
    setCompany("PT", "BRL");
    render(<AllScreens />);
    openDetails();
    expect(document.body.textContent).toContain("Orçamento (R$)");
    expect(document.body.textContent).not.toContain("€");
    expect(screen.getByTestId("income").textContent).toContain("0,00\u00a0R$");
  });

  it("mantém a máscara de privacidade do dashboard e o carregamento existente do card", () => {
    setCompany("BR", "BRL");
    fixtures.costBasis.isLoading = true;
    render(<AllScreens />);
    expect(screen.getByTestId("income").querySelector(".text-2xl")?.textContent).toBe("—");
    expect(screen.getByTestId("expense").querySelector(".text-2xl")?.textContent).toBe("—");
    fireEvent.click(screen.getByRole("button", { name: "Esconder valores" }));
    expect(screen.getByTestId("dashboard").textContent).toContain("••••••••");
    expect(screen.getByTestId("dashboard").textContent).not.toContain("R$");
    expect(localStorage.getItem("mp:dashboard:hide-amounts")).toBe("true");
  });

  it("os componentes autorizados não contêm símbolos Euro literais nem branches por país", () => {
    for (const file of ["pages/Events.tsx", "components/EventEditModal.tsx", "components/EventFinancialCard.tsx", "components/DashboardBalanceCards.tsx", "components/TransactionRow.tsx"]) {
      const source = readFileSync(`src/${file}`, "utf8");
      expect(source).not.toContain("€");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
      expect(source).toContain("useCompanyLocale()");
    }
  });
});
