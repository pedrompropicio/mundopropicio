import { createHash } from "node:crypto";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import { CacheSettlementPanel } from "@/components/CacheSettlementPanel";
import { EventCacheConfig } from "@/components/EventCacheConfig";
import { CacheContractsPanel } from "@/components/CacheContractsPanel";
import ReportArtistCache from "@/components/ReportArtistCache";
import { formatCurrency as cardMoney } from "@/lib/card-session-helpers";
import { formatCurrency as camarimMoney } from "@/lib/camarim-helpers";
import { resolveCompanyLocale } from "@/lib/company-locale";
import { buildArtistCacheReport, tierReferenceRows } from "@/lib/cache-report";
import { cityRowsFor, exportArtistCachePdf } from "@/lib/export-artist-cache-pdf";
import { exportCardSessionToPdf, exportCardSessionToExcel, type CardSessionExportData } from "@/lib/export-card-session";
import { exportCamarimSessionPdf } from "@/lib/export-camarim-session-pdf";
import * as XLSX from "xlsx";
import { computeRealCacheResults } from "@/lib/real-cache-calc";

const fixtures = vi.hoisted(() => ({ queries: {} as Record<string, unknown>, calculation: {} as any, context: {} as any, tables: {} as Record<string, any>, pdf: [] as any[] }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: fixtures.queries[String(queryKey[0])], isLoading: false, isFetched: true,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    if (!(table in fixtures.tables)) throw new Error("#498: leitura MP não simulada: " + table);
    const result = { data: fixtures.tables[table], error: null };
    const builder: any = { select: () => builder, eq: () => builder, single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result), then: (resolve: any) => Promise.resolve(result).then(resolve) };
    return builder;
  } },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user" }, isAdmin: true, isManager: false,
}) }));
vi.mock("@/contexts/CompanyBrandingContext", () => ({ useCompanyBranding: () => ({ displayName: "Empresa sintética", logoUrl: null }) }));
vi.mock("@/hooks/useRealCacheCalculation", () => ({ useRealCacheCalculation: () => fixtures.calculation }));
vi.mock("@/hooks/useSyncCacheForecasts", () => ({ useSyncCacheForecasts: () => undefined }));
vi.mock("@/hooks/useCacheContractContext", () => ({
  useCacheContractContext: () => ({ data: fixtures.context, isLoading: false }),
  useInvalidateCacheContracts: () => vi.fn(),
}));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/CacheExtrasPanel", () => ({ CacheExtrasPanel: () => null }));
vi.mock("@/components/CityCacheSettlementsPanel", () => ({ CityCacheSettlementsPanel: () => null }));
// A native selector permits deterministic selection without Radix popover IDs.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (s: string) => void }) =>
    <select aria-label="Evento do relatório" value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

vi.mock("jspdf-autotable", () => ({ default: (doc: any, options: any) => {
  fixtures.pdf.push(options);
  doc.lastAutoTable = { finalY: 100 };
} }));
vi.mock("jspdf", async (original) => {
  const { default: Real } = await original<typeof import("jspdf")>();
  return { default: class extends Real { constructor(...args: ConstructorParameters<typeof Real>) {
    super(...args);
    this.save = vi.fn() as any;
  } } };
});
vi.mock("@/lib/export-header", () => ({
  fetchExportBranding: vi.fn(async () => ({})), drawPdfExportHeader: () => 20, buildXlsxHeaderRows: () => [],
}));
vi.mock("xlsx", async (original) => ({ ...await original<typeof import("xlsx")>(), writeFile: vi.fn() }));

const amount = 1234.56;
const eventId = "fixture-event";
const fixed = { id: "fixture-fixed", event_id: eventId, supplier_id: "fixture-artist", artist_name: "Artista fixo", cache_type: "fixed", fixed_amount: amount, tiers: [] };
const variable = { id: "fixture-variable", event_id: eventId, supplier_id: "fixture-artist", artist_name: "Artista variável", cache_type: "variable", percentage: 50, minimum_guaranteed: amount, fixed_deduction_percentage: 10, cache_revenue_basis: "net", tiers: [{ occupancy_threshold: 50, percentage: 50 }] };
const event = { id: eventId, name: "Evento sintético", date: "2026-11-01", parent_event_id: null, city_id: null, venue_id: null };
function setCompany(country: string | null = "PT", currency = "EUR") {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn() });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida neste teste"); }));
  setCompany();
  fixtures.pdf = [];
  fixtures.tables = {};
  fixtures.calculation = { results: computeRealCacheResults({ configs: [fixed, variable], deductions: [],
    categoryMap: new Map(), expenses: [], sources: [], revenue: { net: amount, gross: amount }, occupancyPct: 50 }), resultsByCity: {}, isLoading: false };
  fixtures.context = { contracts: [], free_advances: [], cities: [{ event_id: eventId, by_role: { artist_balance: { amount, paid: 0 } } }] };
  fixtures.queries = {
    cache_contract_context: { root_event_id: eventId, in_closing: true, has_config: true, frozen: true,
      cities: [{ event_id: eventId, name: event.name, cap: amount, forecast_id: "fixture-forecast", candidates: [] }] },
    event_cache_configs: [fixed, variable], event_cache_deductions: [], event_cache_tiers: [{ cache_config_id: variable.id, occupancy_threshold: 50, percentage: 50 }],
    account_categories: [], suppliers_active: [], "suppliers-active-min": [], event_ticket_zones: [], event_ticket_lots_for_pl: [], event_forecasts: [],
    event_cache_configs_report: [fixed, variable], event_cache_deductions_report: [], event_cache_tiers_report: [{ cache_config_id: variable.id, occupancy_threshold: 50, percentage: 50 }],
    event_cache_city_settlements_report: [], event_cache_extras_report: [], event_detail_cache_report_events: [event],
    event_detail_cache_report_places: { cities: {}, venues: {} }, event_cache_configs_report_counts: { [eventId]: 2 },
    "real-cache-report-capacity": { [eventId]: { gross: amount, net: amount, seats: 100, sold: 50 } },
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function hash(node: HTMLElement) {
  // Only generated React/Radix IDs are normalized; preserve every other byte.
  return createHash("sha256").update(node.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function settlement() { return <CacheSettlementPanel eventId={eventId} config={variable} projectedValue={amount}
  eventStatus="active" realResult={fixtures.calculation.results.find((r: any) => r.configId === variable.id)} canEdit />; }
function mount(node: ReactNode) { return render(<MemoryRouter>{node}</MemoryRouter>); }
function selectReport() { fireEvent.change(screen.getByLabelText("Evento do relatório"), { target: { value: eventId } }); }

describe("#498 P1f — baseline PT capturada ANTES da implementação; não regenerar", () => {
  it("congela o DOM do acerto e memória de cálculo", () => {
    const { container } = mount(settlement());
    fireEvent.click(screen.getByRole("button", { name: "Memória de cálculo" }));
    expect(hash(container)).toMatchInlineSnapshot(`"2bb219fd80911b563037aeaa78b9bbba1c9dc4ddede85794d6d45650a1292159"`);
  });
  it("congela o DOM da configuração com formulário e configuração expandida", () => {
    const { container } = mount(<EventCacheConfig eventId={eventId} />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar Atração" }));
    fireEvent.click(screen.getByTitle("Configurar descontos e retenção"));
    expect(hash(container)).toMatchInlineSnapshot(`"e333d4155d61aca63f4408f931eb5d549581cc0dadcb1ce94ef2c4fe9f872fe2"`);
  });
  it("congela o DOM dos contratos e diálogo de criação", () => {
    const { container } = mount(<CacheContractsPanel eventId={eventId} config={fixed} canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Novo contrato" }));
    expect(hash(container)).toMatchInlineSnapshot(`"1933326b95974ac95489d6c950ee1790839913698e36bcf99f4b71d5c1764e83"`);
    expect(hash(document.body)).toMatchInlineSnapshot(`"2e756985ea27cfe21d3dbd14d3219f044b255375329cbcd85e274b41fb0c60db"`);
  });
  it("congela o DOM do relatório com valores e escalões", () => {
    const { container } = mount(<ReportArtistCache />);
    selectReport();
    expect(container.textContent).toContain("1.234,56\u00a0€");
    expect(hash(container)).toMatchInlineSnapshot(`"b36a344807638e7fdedd8a33a908f95d1546a68634b7e11e1bf28978a79d4e01"`);
  });
  it("fixa os bytes EUR dos dois helpers antes da alteração", () => {
    expect([cardMoney(amount), cardMoney(amount, "EUR"), camarimMoney(amount), camarimMoney(amount, "EUR")]).toMatchInlineSnapshot(`
      [
        "1234,56 €",
        "1234,56 €",
        "1234,56 €",
        "1234,56 €",
      ]
    `);
  });
});

const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
const pt = resolveCompanyLocale({ country: "PT", currency: "EUR" });
const unavailable = resolveCompanyLocale({});
const brAmount = "R$\u00a01.234,56";
const tableCells = () => fixtures.pdf.flatMap((table) => [table.head, table.body, table.foot].flat(2)).filter((c) => c != null).map(String);

describe("#498 P1f — painéis com contexto da empresa", () => {
  it.each(["settlement", "config", "contracts", "report"])("mostra BRL/pt-BR no painel %s", (panel) => {
    setCompany("BR", "BRL");
    const nodes: Record<string, ReactNode> = { settlement: settlement(), config: <EventCacheConfig eventId={eventId} />,
      contracts: <CacheContractsPanel eventId={eventId} config={fixed} canEdit />, report: <ReportArtistCache /> };
    const { container } = mount(nodes[panel]);
    if (panel === "report") selectReport();
    if (panel === "settlement") fireEvent.click(screen.getByRole("button", { name: "Memória de cálculo" }));
    if (panel === "config") {
      fireEvent.click(screen.getByRole("button", { name: "Adicionar Atração" }));
      expect(container.textContent).toContain("Valor do Cachê (R$)");
      fireEvent.click(screen.getByRole("button", { name: "Variável" }));
      expect(container.textContent).toContain("Mín. Garantido (R$)");
      fireEvent.click(screen.getByTitle("Configurar descontos e retenção"));
      expect(container.textContent).toContain("Mínimo Garantido (R$)");
    }
    expect(container.textContent).toContain(brAmount);
    expect(document.body.textContent).not.toMatch(/€|EUR/);
    if (panel === "contracts") {
      fireEvent.click(screen.getByRole("button", { name: "Novo contrato" }));
      expect(screen.getByRole("group", { name: "Unidade do valor" }).textContent).toBe("R$%");
      expect(document.body.textContent).toContain(brAmount);
      expect(document.body.textContent).not.toMatch(/€|EUR/);
    }
    if (panel === "report") expect(container.textContent).toContain("receita ≥ R$\u00a0617,28");
  });

  it("reage à troca BR → PT → indisponível nos quatro painéis", () => {
    const all = () => <><div data-testid="settlement">{settlement()}</div><div data-testid="config"><EventCacheConfig eventId={eventId} /></div>
      <div data-testid="contracts"><CacheContractsPanel eventId={eventId} config={fixed} canEdit /></div><div data-testid="report"><ReportArtistCache /></div></>;
    setCompany("BR", "BRL");
    const { rerender } = mount(all());
    selectReport();
    for (const name of ["settlement", "config", "contracts", "report"]) expect(screen.getByTestId(name).textContent).toContain(brAmount);
    setCompany();
    rerender(<MemoryRouter>{all()}</MemoryRouter>);
    for (const name of ["settlement", "config", "contracts", "report"]) expect(screen.getByTestId(name).textContent).toContain("1.234,56\u00a0€");
    setCompany(null);
    rerender(<MemoryRouter>{all()}</MemoryRouter>);
    for (const name of ["settlement", "config", "contracts", "report"]) {
      expect(screen.getByTestId(name).textContent).toContain("—");
      expect(screen.getByTestId(name).textContent).not.toMatch(/€|R\$|EUR|1\.234,56/);
    }
    fireEvent.click(screen.getByRole("button", { name: "Adicionar Atração" }));
    expect(screen.getByText("Valor do Cachê (—)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Novo contrato" }));
    expect(screen.getByRole("group", { name: "Unidade do valor" }).textContent).toBe("—%");
  });

  it("passa o contexto BR do relatório ao export PDF", async () => {
    setCompany("BR", "BRL");
    mount(<ReportArtistCache />);
    selectReport();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(tableCells()).toContain(brAmount));
    expect(tableCells().join("\n")).not.toContain("€");
  });

  it("mostra BRL no adiantamento e na prévia percentual sem alterar a unidade interna", () => {
    setCompany("BR", "BRL");
    fixtures.queries.cache_contract_context = { ...fixtures.queries.cache_contract_context as object, has_config: false, frozen: false };
    mount(<CacheContractsPanel eventId={eventId} config={fixed} canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Adiantamento" }));
    expect(document.body.textContent).toContain(brAmount);
    expect(screen.getByRole("group", { name: "Unidade do valor" }).textContent).toBe("R$%");
    fireEvent.click(screen.getByRole("button", { name: "%" }));
    const field = document.body.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    fireEvent.change(field, { target: { value: "50" } });
    expect(document.body.textContent).toContain("R$\u00a0617,28");
    expect(document.body.textContent).not.toMatch(/€|EUR/);
  });

  it("formata o resumo da turnê em BR sem alterar os valores canónicos por cidade", () => {
    setCompany("BR", "BRL");
    fixtures.queries.event_detail_cache_report_events = [
      { ...event, id: "fixture-tour", name: "Turnê sintética" }, { ...event, parent_event_id: "fixture-tour" },
    ];
    fixtures.queries.event_cache_configs_report_counts = { "fixture-tour": 2 };
    fixtures.calculation.resultsByCity = { [eventId]: fixtures.calculation.results };
    const { container } = mount(<ReportArtistCache />);
    fireEvent.change(screen.getByLabelText("Evento do relatório"), { target: { value: "tour:fixture-tour" } });
    expect(screen.getByText("Resumo da turnê")).toBeInTheDocument();
    expect(container.textContent).toContain(brAmount);
    expect(container.textContent).not.toMatch(/€|EUR/);
  });

  it("formata em BR o contrato existente e a ligação de adiantamentos", () => {
    setCompany("BR", "BRL");
    fixtures.context.contracts = [{ id: "fixture-contract", gross: amount, beneficiary_name: "Artista sintético", beneficiary_supplier_id: "fixture-artist",
      withholding_applies: true, withholding_rate: 25, withholding_amount: 123.45, advances_amount: 100,
      artist_mother: { id: "fixture-mother", amount: amount, paid: 10 }, has_payment: false, advance_ids: [],
      cities: [{ event_id: eventId, quota: amount, withholding: 123.45, advances: 100, artist_balance: amount }] }];
    fixtures.context.free_advances = [{ id: "fixture-advance", amount: 100, paid: 100, description: "Adiantamento sintético",
      by_city: { [eventId]: 100 }, supplier_id: "fixture-artist" }];
    fixtures.queries["cache-attach-state"] = { kids: [{ event_id: eventId, amount, paid_amount: 10 }], inList: false };
    mount(<CacheContractsPanel eventId={eventId} config={fixed} canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Ligar adiantamento" }));
    expect(document.body.textContent).toContain("Saldo antes");
    expect(document.body.textContent).toContain(brAmount);
    expect(document.body.textContent).toContain("R$\u00a0100,00");
    expect(document.body.textContent).not.toMatch(/€|EUR/);
  });

  it("mantém o zero legado da dedução PT e formata BR/indisponível sem euro implícito", () => {
    fixtures.calculation.results[1].deductionDetails = [{ categoryId: "zero", categoryCode: "2.0", categoryName: "Zero sintético", amount: 0, origin: "none" }];
    const { container, rerender } = mount(settlement());
    fireEvent.click(screen.getByRole("button", { name: "Memória de cálculo" }));
    expect(container.textContent).toContain("€0,00");
    setCompany("BR", "BRL");
    rerender(<MemoryRouter>{settlement()}</MemoryRouter>);
    expect(container.textContent).toContain("R$\u00a00,00");
    expect(container.textContent).not.toContain("€");
    setCompany(null);
    rerender(<MemoryRouter>{settlement()}</MemoryRouter>);
    expect(container.textContent).not.toContain("€");
  });
});

function reportFixture() {
  const capacityByEvent = { [eventId]: { gross: amount, net: amount, seats: 100, sold: 50 } };
  return buildArtistCacheReport({ config: variable, spec: { holderId: eventId, childIds: [] },
    realResult: fixtures.calculation.results[1], resultsByCity: {}, citySettlements: [],
    extras: [{ cache_config_id: variable.id, event_id: eventId, description: "Extra sintético", amount: 10 }],
    capacityByEvent });
}
function cardFixture(currency?: string): CardSessionExportData {
  return { currency, cardName: "Cartão sintético", holderName: "Pessoa sintética", primaryEventName: null,
    statusLabel: "Aberta", openedAt: null, closedAt: null,
    summary: { availableOnCard: null, delivered: amount, deliveredNote: "Sintético", approvedSpent: amount, approvedCount: 1,
      pending: 0, pendingCount: 0, theoretical: -amount }, byEvent: [{ name: event.name, amount }],
    expenses: [{ date: "01/11/2026", description: "Despesa sintética", event: event.name, category: "Teste", status: "Aprovada", amount }],
    loads: [{ date: "01/11/2026", source: "Sintética", amount }] };
}

describe("#498 P1f — helpers e documentos, sem rede", () => {
  it.each([cardMoney, camarimMoney])("deriva pt-BR para BRL e preserva as opções legadas das outras moedas", (money) => {
    expect(money(amount, "BRL")).toBe(brAmount);
    for (const currency of ["EUR", "USD", "GBP", "JPY"]) {
      const opts = money === cardMoney ? { minimumFractionDigits: 2 } : {};
      for (const value of [0, -amount, 12345.6789]) expect(money(value, currency)).toBe(new Intl.NumberFormat("pt-PT", { style: "currency", currency, ...opts }).format(value));
    }
  });

  it("cityRowsFor recebe contexto, preserva PT e mantém números/marks dos escalões", () => {
    const report = reportFixture();
    const original = cityRowsFor(report, eventId, "both");
    expect(cityRowsFor(report, eventId, "both", pt)).toEqual(original);
    expect(original.slice(0, 5)).toEqual(tierReferenceRows(report.config, report.cities[0].capacityRevenue, report.cities[0].result!.percentage, "both", amount));
    const brazil = cityRowsFor(report, eventId, "both", br).flat().join("\n");
    expect(brazil).toContain(brAmount);
    expect(brazil).toContain("receita ≥ R$\u00a0617,28");
    expect(brazil).toContain("50 bilhetes");
    expect(brazil).toContain("aplicado");
    expect(brazil).not.toContain("€");
    const missing = cityRowsFor(report, eventId, "both", unavailable).flat().join("\n");
    expect(missing).not.toContain("€");
    expect(missing).toContain("—");
    expect(report.grossTotal).toBe(amount);
    expect(report.netTotal).toBe(1224.56);
  });

  it.each([undefined, pt, br, unavailable])("PDF de cachê renderiza o mesmo contexto em resumo, escalões, extras e líquido (%j)", async (companyLocale) => {
    const report = reportFixture();
    await exportArtistCachePdf({ companyLocale, title: "Relatório sintético", companyName: "Empresa sintética", logo: null, fileName: "fixture.pdf", tierMode: "both",
      tourSummary: { tourName: "Turnê sintética", reports: [report], meta: {} },
      sections: [{ meta: { id: eventId, name: event.name, date: null, city: null, venue: null }, reports: [report] }] });
    const cells = tableCells().join("\n");
    if (companyLocale === br) { expect(cells).toContain(brAmount); expect(cells).toContain("-R$\u00a010,00"); expect(cells).not.toContain("€"); }
    else if (companyLocale === unavailable) { expect(cells).toContain("Cachê Bruto\n-"); expect(cells).not.toContain("€"); }
    else { expect(cells).toContain("1.234,56\u00a0€"); expect(cells).not.toContain("R$"); }
  });

  it.each([undefined, "EUR", "BRL"])("PDF de cartão passa a moeda %s às seis posições de formatação", async (currency) => {
    await exportCardSessionToPdf(cardFixture(currency));
    const cells = tableCells();
    const formatted = currency === "BRL" ? brAmount : "1234,56\u00a0€";
    expect(cells.filter((c) => c === formatted)).toHaveLength(7);
    expect(cells).toContain(currency === "BRL" ? "-R$\u00a01.234,56" : "-1234,56\u00a0€");
    expect(cells).toContain("—");
    if (currency === "BRL") expect(cells.join("\n")).not.toContain("€");
  });

  it("Excel de cartão conserva valores numéricos sem conversão", async () => {
    const data = cardFixture("BRL");
    await exportCardSessionToExcel(data);
    const wb = vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0];
    expect(wb.Sheets.Resumo.B2?.v).toBeUndefined();
    expect(wb.Sheets.Resumo.B3.v).toBe(amount);
    expect(wb.Sheets.Despesas.F2.v).toBe(amount);
    expect(wb.Sheets.Recargas.C2.v).toBe(amount);
  });

  it.each([undefined, "EUR", "BRL"])("PDF de camarim usa a moeda %s da sessão e o helper de caixa partilhado", async (currency) => {
    fixtures.tables = {
      camarim_sessions: { id: "fixture-session", title: "Sessão sintética", currency, budget_amount: amount, mode: "single_event", status: "open", opened_at: "2026-11-01" },
      camarim_items: [{ total_amount: amount, base_amount: amount, iva_amount: 0, payment_origin: "advance", status: "approved" }],
      camarim_fund_moves: [{ move_type: "advance", amount: amount * 2 }], camarim_session_events: [],
    };
    await exportCamarimSessionPdf("fixture-session");
    const cells = tableCells();
    expect(cells).toContain(currency === "BRL" ? brAmount : "1234,56\u00a0€");
    expect(cells).toContain("Caixa em mão");
    if (currency === "BRL") expect(cells.join("\n")).not.toContain("€");
  });

});
