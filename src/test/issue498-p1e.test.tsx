import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import FinancialPositionPage from "@/pages/FinancialPosition";
import { TicketOfficeBalancePanel } from "@/components/TicketOfficeBalancePanel";
import { TicketOfficePositionCards } from "@/components/TicketOfficePositionCards";
import { resolveCompanyLocale, type CompanyLocaleResult } from "@/lib/company-locale";
import { useCompanyLocale } from "@/hooks/useCompanyLocale";
import { formatPositionAmount } from "@/lib/financial-position";
import { financialPositionFixture } from "./fixtures/financial-position";
import type { FinancialPositionP5 } from "@/lib/financial-position-p5";
import { decomposeTicketOfficeRetained } from "@/lib/ticket-office-balance";

const fixtures = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  position: {} as Record<string, unknown>,
  p5: {} as Record<string, unknown>,
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/hooks/useFinancialPosition", () => ({ useFinancialPosition: () => fixtures.position }));
vi.mock("@/hooks/useFinancialPositionP5", () => ({ useFinancialPositionP5: () => fixtures.p5 }));
// Synthetic reads only: queryFn/mutationFn are never executed.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: fixtures.queries[String(queryKey[0])], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: () => { throw new Error("#498: serviço MP proibido neste teste"); } }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user" }, isAdmin: true, isManager: false, hasPermission: () => true, loading: false,
}) }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TicketOfficeSettlementModal", () => ({ TicketOfficeSettlementModal: () => null }));

const amount = 1234.56;
const officeId = "10000000-0000-4000-8000-000000000011";
const eventId = "10000000-0000-4000-8000-000000000012";
const event = { id: eventId, name: "Evento sintético", status: "active" };
const scenario = { modo: "previsao" as const, percentagem: 100, receita_manual_bruta: amount, viragem_real_dias: null };
const planning = { event_id: eventId, nome: event.name, previsto_original: amount, cenario: scenario, zonas: [] };
const statement = {
  id: "fixture-statement", number: "TEST-498", status: "draft", statement_date: "2026-11-01", document_total: -amount,
  ticket_office_statement_lines: [{ id: "fixture-line", position: 1, description: "Linha sintética", amount: -amount, event_id: "settled-event" }],
};
const openEvents = [{ ...event, balance: amount }];

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

function positionFixture() {
  const d = financialPositionFixture();
  d.caixa[0].saldo = amount;
  d.cartoes[0].saldo = null;
  d.posicao.caixa_e_cartoes = amount;
  d.posicao.retido_visiveis = amount;
  d.retido = { visivel: [{ account_id: officeId, name: "Bilheteira sintética", saldo: amount }], ocultas: [], total_visiveis: amount, total_ocultas: 0 };
  d.a_pagar.total = amount;
  d.a_receber.total = amount;
  d.a_pagar.caches = {
    total: amount, retencao_irs_total: 10, sem_retencao_total: 1224.56,
    por_artista: [{ artist_supplier_id: null, artista: "Artista sintético", total: amount, retencao_irs: 10, sem_retencao: 1224.56,
      por_evento: [{ evento_id: eventId, evento: event.name, total: amount, retencao_irs: 10 }] }],
    sem_contrato: { total: 0, n: 0 }, nota: "Informativo sintético",
  };
  d.operacoes_terceiros_informativo = [{ event_id: eventId, name: event.name, kind: "teste", gross_amount: amount, operator_result: -amount }];
  return d;
}

function coverageFixture(): FinancialPositionP5["cobertura_futuros"] {
  return {
    meta: { incompleto: false, motivo: null, nota_bp_provisorio: "BP sintético", notas: { necessidade: "Nota sintética", aporte_mp: "Estimativa" } },
    eventos: [{ event_id: eventId, nome: event.name, estagio: "planeamento", first_day: "2027-01-02", started: false, data_indeterminada: false,
      vendas_bruto: amount, fonte_vendas: "unica", bp_total: amount, despesas_pagas: amount, a_pagar_lancado: amount, a_pagar_sem_linha: 0, bp_por_lancar: amount,
      custo_total_projetado: { com_sem_linha: amount, sem_linha_cobre_bp: amount }, cobertura: { com_sem_linha: amount, sem_linha_cobre_bp: amount },
      aporte_socios: { total: 0, por_transferencia_conta_liquida: 0, pago_direto_automatico: 0, linhas: [] }, aporte_mp_estimativa: amount,
      dinheiro_parado_bruto: { desde_corte: 0, anterior_ao_corte: 0, total: 0 }, dinheiro_parado: 0, caixa_mp_adiantado: amount,
      necessidade_financiamento: { com_sem_linha: amount, sem_linha_cobre_bp: amount } }],
    bilheteiras: [],
    total: { vendas_futuras: amount, despesas_pagas_futuras: amount, a_pagar_lancado_futuros: amount, a_pagar_sem_linha_futuros: 0, bp_por_lancar_futuros: amount,
      saido_minimo_total: null, aporte_socios_total: 0, aporte_mp_estimativa_total: amount, dinheiro_de_eventos_em_conta: 0, caixa_mp_adiantado_total: amount,
      necessidade: { com_sem_linha: amount, sem_linha_cobre_bp: amount } },
    receita_prevista: { eventos_sem_previsao: 0, receita_considerada_total: amount, potencial_total: amount,
      necessidade_com_receita: { com_sem_linha: 0, sem_linha_cobre_bp: 0 },
      eventos: [{ event_id: eventId, ativo: true, previsao_bruta: amount, receita_considerada: amount, potencial: amount, fonte_potencial: "sintética",
        eventos: [{ ...planning, herdado: false, fonte: "manual", previsao_bruta: amount, vendas_bruto: amount, receita_considerada: amount, previsao_ativa: true, cortes: [] }] }] },
  };
}

function snapshot(node: HTMLElement) {
  // Normalize only React/Radix generated IDs. Preserve every other DOM byte,
  // including Intl spaces/NBSP; no trimming or monetary normalization.
  const dom = node.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
  return createHash("sha256").update(dom).digest("hex");
}
const page = () => <MemoryRouter><FinancialPositionPage /></MemoryRouter>;
const balance = () => <MemoryRouter><TicketOfficeBalancePanel officeId={officeId} officeName="Bilheteira sintética" /></MemoryRouter>;
const cards = (companyLocale?: CompanyLocaleResult) => <MemoryRouter><TicketOfficePositionCards officeId={officeId} companyLocale={companyLocale} /></MemoryRouter>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida neste teste"); }));
  setCompany();
  fixtures.position = { data: positionFixture(), refetch: vi.fn() };
  fixtures.p5 = { data: { meta: { incompleto: false }, resultado_mp_ano: { sem_estrutura: amount, com_estrutura: -amount,
    participacoes: { cloudscape: { valor: amount, linhas: 1 } }, total_mp: 0 }, cobertura_futuros: coverageFixture() } };
  fixtures.queries = {
    "financial-position-cache-names": {},
    "financial-position-retained-composition": [{ accountId: officeId, globalBalance: amount,
      decomposition: decomposeTicketOfficeRetained({ globalBalance: amount, events: openEvents, statements: [statement], settledEventIds: [] }) }],
    ticket_office_assignments: [{ event_id: eventId, events: event, is_conciliated: false }],
    ticket_office_sales_rpc: [{ event_id: eventId, financial_account_id: officeId, quantity: 1, unit_price: amount, total_value: amount }],
    ticket_office_account_txns: [], ticket_office_pending_advances: [], ticket_office_settlements: [], ticket_office_statements_for_balance: [statement],
    "ticket-office-position": { openTotal: amount, advanced: amount, retained: amount, position: -amount, calendarDifference: amount,
      openEvents, calendarItems: [{ id: "fixture-calendar", description: "Movimento sintético", amount: -amount }], latest: statement },
    "coverage-scenario-planning": { event: planning, root: planning }, "coverage-scenario-history": [],
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("#498 P1e — hashes PT capturados ANTES de alterar a implementação (não regenerar)", () => {
  it("congela o DOM da página inteira, incluindo P6b e cobertura", () => {
    const { container } = render(page());
    expect(snapshot(container)).toMatchInlineSnapshot(`"638ae0feca40482754cebecc87c1c46c5ed4c17005dcf3f8085471cef221b856"`);
    fireEvent.click(screen.getByRole("button", { name: "Composição: A pagar" }));
    expect(snapshot(screen.getByRole("dialog"))).toMatchInlineSnapshot(`"0254914984a4d16055a100e0aae0fa2b4dffa434cd2f9f8d066f5c0598ed43a9"`);
  });
  it("congela o DOM do painel de saldo, incluindo a decomposição expandida", () => {
    const { container } = render(balance());
    fireEvent.click(screen.getByRole("button", { name: /Posição já apurada/ }));
    expect(snapshot(container)).toMatchInlineSnapshot(`"90bd4c56189bbdc72b2eb299dec7c45bc5289686e7b07b427364d8e85a0cd97f"`);
  });
  it("congela o DOM dos cartões de posição e de ambos os detalhes", () => {
    const { container } = render(cards());
    fireEvent.click(screen.getByRole("button", { name: "1 eventos" }));
    expect(snapshot(container)).toMatchInlineSnapshot(`"00d699110883414150be589821b2d678b0e5a795178af5cd5cd74e9c7d42430b"`);
    fireEvent.click(screen.getByRole("button", { name: /Diferença de calendário:/ }));
    expect(snapshot(container)).toMatchInlineSnapshot(`"fddba1e28e6bd8cfc4da329ff39a5918f372666b811e60a86b66c0f2cb4ad99c"`);
  });
  it("congela o rótulo e a prévia PT do cenário", () => {
    render(page());
    fireEvent.click(screen.getByRole("button", { name: "Cenário de receita" }));
    expect(snapshot(screen.getByRole("dialog"))).toMatchInlineSnapshot(`"0081923fb66aba08740354dfc5d04013b0f91af4a4ae4c3a7ad41deb20ceec8c"`);
  });
});

const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
const pt = resolveCompanyLocale({ country: "PT", currency: "EUR" });
const unavailable = resolveCompanyLocale({});
const brAmount = "R$\u00a01.234,56";

// The Cards caller is outside this dispatch; simulate its explicit locale prop.
function Screens() {
  const companyLocale = useCompanyLocale();
  return <MemoryRouter>
    <div data-testid="position"><FinancialPositionPage /></div>
    <div data-testid="balance"><TicketOfficeBalancePanel officeId={officeId} officeName="Bilheteira sintética" /></div>
    <div data-testid="cards"><TicketOfficePositionCards officeId={officeId} companyLocale={companyLocale} /></div>
  </MemoryRouter>;
}

function closeDialog() {
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
}

describe("#498 P1e — moeda da empresa activa", () => {
  it("BR: KPIs, contas, estágios, P6b, cobertura e detalhes de previsão usam R$ sem euros", () => {
    setCompany("BR", "BRL");
    render(page());
    for (const label of ["Caixa e cartões", "Retido visível", "A pagar", "A receber"]) {
      expect(screen.getByText(label).closest("div.min-w-0")?.textContent).toContain(brAmount);
    }
    for (const label of ["Cachês aprovados por pagar", "Composição do retido", "Cobertura de eventos futuros"]) {
      expect(screen.getByLabelText(label).textContent).toContain(brAmount);
      expect(screen.getByLabelText(label).textContent).not.toContain("€");
    }
    expect(screen.getByText("Resultado da MP · sem estrutura").parentElement?.textContent).toContain(brAmount);
    expect(screen.getByText("Resultado da MP · com estrutura").parentElement?.textContent).toContain(`-${brAmount}`);
    expect(screen.getByText("Resultado total da MP").parentElement?.textContent).toContain("R$\u00a00,00");
    expect(screen.getByText(`Previsão bruta: ${brAmount}`, { normalizer: t => t })).toBeInTheDocument();
    expect(screen.getByText(`Previsão: ${brAmount} · Considerada: ${brAmount}`, { normalizer: t => t })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("€");
  });

  it("BR: folha de explicação formata parcelas, total, diferença e grupos com o contexto da página", () => {
    setCompany("BR", "BRL");
    const before = JSON.stringify(fixtures.position.data);
    render(page());
    fireEvent.click(screen.getByRole("button", { name: "Composição: A pagar" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(brAmount);
    expect(dialog.textContent).toContain("Não reconciliado · diferença R$\u00a0750,56");
    expect(dialog.textContent).toContain("R$\u00a0121,00");
    expect(dialog.textContent).not.toContain("€");
    expect(JSON.stringify(fixtures.position.data)).toBe(before);
    closeDialog();
    fireEvent.click(screen.getByRole("button", { name: "Composição: Necessidade — com faturas sem linha" }));
    expect(screen.getByRole("dialog").textContent).toContain(brAmount);
    expect(screen.getByRole("dialog").textContent).not.toContain("€");
  });

  it("BR: cenário mostra o símbolo no rótulo e as duas prévias em R$", () => {
    setCompany("BR", "BRL");
    render(page());
    fireEvent.click(screen.getByRole("button", { name: "Cenário de receita" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Receita manual bruta (R$)")).toHaveValue(amount);
    expect(dialog.getAllByText(brAmount, { normalizer: t => t })).toHaveLength(2);
    expect(screen.getByRole("dialog").textContent).not.toContain("€");
  });

  it("BR: painel de saldo formata todas as linhas da decomposição e dos eventos", () => {
    setCompany("BR", "BRL");
    render(balance());
    expect(screen.getByText("Vendas").parentElement?.textContent).toContain(brAmount);
    expect(screen.getByRole("button", { name: /Posição já apurada/ }).textContent).toContain(`-${brAmount}`);
    fireEvent.click(screen.getByRole("button", { name: /Posição já apurada/ }));
    expect(screen.getByText("Linha sintética").parentElement?.textContent).toContain(`-${brAmount}`);
    fireEvent.click(screen.getByRole("button", { name: /Vendas de eventos ainda sem fecho/ }));
    expect(document.body.textContent).toContain(brAmount);
    expect(document.body.textContent).not.toContain("€");
  });

  it("BR: cartões recebem contexto por prop e os dois detalhes usam R$", () => {
    render(cards(br));
    expect(screen.getByText("Valor por apurar").parentElement?.textContent).toContain(brAmount);
    expect(screen.getByText("Já adiantado").parentElement?.textContent).toContain(brAmount);
    expect(screen.getByText("Saldo retido").parentElement?.textContent).toContain(brAmount);
    fireEvent.click(screen.getByRole("button", { name: "1 eventos" }));
    expect(screen.getByRole("link", { name: event.name }).parentElement?.textContent).toContain(brAmount);
    fireEvent.click(screen.getByRole("button", { name: /Diferença de calendário:/ }));
    expect(screen.getByText("Movimento sintético").parentElement?.textContent).toContain(`-${brAmount}`);
    expect(document.body.textContent).not.toContain("€");
  });

  it.each([
    [null, "EUR", {}], ["BR", "", {}],
    ["PT", "EUR", { isLoading: true }],
    ["PT", "EUR", { isError: true, error: new Error("fixture failure") }],
  ] as const)("contexto indisponível (%s/%s/%j) apaga as moedas na página, painéis e cenário aberto", (country, currency, overrides) => {
    const { rerender } = render(<Screens />);
    fireEvent.click(screen.getByRole("button", { name: "Cenário de receita" }));
    setCompany(country, currency, overrides);
    rerender(<Screens />);
    for (const id of ["position", "balance", "cards"]) {
      expect(screen.getByTestId(id).textContent).toContain("—");
      expect(screen.getByTestId(id).textContent).not.toMatch(/€|R\$/);
    }
    // Existing guard omits the form entirely when companyId is missing.
    // Whenever mounted, its monetary label must use the unavailable marker.
    expect(screen.queryByLabelText(/Receita manual bruta/)).toBe(screen.queryByLabelText("Receita manual bruta (—)"));
    expect(screen.getByRole("dialog").textContent).not.toMatch(/€|R\$/);
    closeDialog();
    fireEvent.click(screen.getByRole("button", { name: "Composição: A pagar" }));
    expect(screen.getByRole("dialog").textContent).not.toMatch(/€|R\$/);
    expect(screen.getByRole("dialog").textContent).toContain("—");
  });

  it("PT → BR → PT actualiza os três ecrãs e a explicação aberta, repondo os bytes PT", () => {
    const { container, rerender } = render(<Screens />);
    fireEvent.click(screen.getByRole("button", { name: "Composição: A pagar" }));
    const initial = snapshot(container);
    const initialDialog = snapshot(screen.getByRole("dialog"));
    setCompany("BR", "BRL");
    rerender(<Screens />);
    expect(container.textContent).toContain(brAmount);
    expect(container.textContent).not.toContain("€");
    expect(screen.getByRole("dialog").textContent).toContain(brAmount);
    expect(screen.getByRole("dialog").textContent).not.toContain("€");
    setCompany();
    rerender(<Screens />);
    expect(snapshot(container)).toBe(initial);
    expect(snapshot(screen.getByRole("dialog"))).toBe(initialDialog);
  });

  it("PT explícito preserva o DOM legado dos cartões e o formatter Intl da posição", () => {
    const { container, rerender } = render(cards());
    const legacy = snapshot(container);
    rerender(cards(pt));
    expect(snapshot(container)).toBe(legacy);
    expect(formatPositionAmount(4661.86)).toBe("4\u00a0661,86\u00a0€");
    expect(formatPositionAmount(4661.86, pt)).toBe(formatPositionAmount(4661.86));
    expect(formatPositionAmount(0, br)).toBe("R$\u00a00,00");
    expect(formatPositionAmount(-amount, br)).toBe(`-${brAmount}`);
    expect(formatPositionAmount(null)).toBe("—");
    expect(formatPositionAmount(null, br)).toBe("—");
    expect(formatPositionAmount(amount, unavailable)).toBe("—");
  });

  it("moeda configurada prevalece sobre a moeda habitual do locale", () => {
    setCompany("PT", "BRL");
    render(<Screens />);
    expect(document.body.textContent).toContain("1234,56\u00a0R$");
    expect(document.body.textContent).not.toContain("€");
    fireEvent.click(screen.getByRole("button", { name: "Cenário de receita" }));
    expect(screen.getByLabelText("Receita manual bruta (R$)")).toBeInTheDocument();
  });

  it("balances_visible continua a ocultar os mesmos saldos, sem ocultar o a pagar", () => {
    setCompany("BR", "BRL");
    const d = positionFixture();
    d.meta.balances_visible = false;
    fixtures.position.data = d;
    render(page());
    expect(screen.getByText("Caixa e cartões").closest("div.min-w-0")?.textContent).toContain("Saldos não visíveis para o seu perfil");
    expect(screen.queryByLabelText("Composição do retido")).toBeNull();
    expect(screen.getByText("A pagar").closest("div.min-w-0")?.textContent).toContain(brAmount);
  });

  it("os consumidores não escolhem regras por país nem ligam as vistas puras ao hook de empresa", () => {
    const files = ["lib/financial-position.ts", "pages/FinancialPosition.tsx", "components/TicketOfficeBalancePanel.tsx", "components/TicketOfficePositionCards.tsx",
      ...["FinancialPositionView", "P6bSections", "FutureCoverageCard", "CoverageScenarioModal", "ExplainSheet"].map(f => `components/financial-position/${f}.tsx`)];
    for (const file of files) {
      const source = readFileSync(`src/${file}`, "utf8");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
      if (!file.startsWith("pages/") && !file.endsWith("TicketOfficeBalancePanel.tsx")) expect(source).not.toContain("useCompanyLocale()");
    }
  });
});
