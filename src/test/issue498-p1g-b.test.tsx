import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import EventABRealizedSection from "@/components/EventABRealizedSection";
import ExecutiveDashboard from "@/components/simulator/ExecutiveDashboard";
import TourSimulator from "@/components/simulator/TourSimulator";
import { PriorCurveSelector } from "@/components/simulator/PriorCurveSelector";

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Synthetic reads only: query functions and MP services must never execute.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "sim-prior-sources"
      ? [{ id: "fixture-source", name: "Histórico sintético", date: "2026-01-02", collectedAt: "2026-01-03", sameArtist: true }]
      : { avg_ticket_per_pax: 1234.56, sample_size: 2, last_calculated_at: "2026-01-03" },
    isLoading: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: () => { throw new Error("#498 P1g-b: serviço MP proibido"); } }),
}));
vi.mock("@/hooks/useEventABRealized", () => ({ useEventABRealized: () => ({
  isLoading: false, hasData: true, references: ["TEST-498"],
  receita: 1234.56, despesas: 12.34, resultado: 1222.22,
  incomeLines: [{ id: "fixture-income", description: "Receita sintética", amount: 1234.56 }],
  expenseLines: [{ id: "fixture-expense", description: "Despesa sintética", amount: 12.34 }],
}) }));
vi.mock("@/hooks/useCitySimulator", () => ({
  useCitySimulator: (id: string) => id === "fixture-master" ? masterData : cityData,
}));
vi.mock("@/lib/event-simulator-view-pdf", () => ({
  exportNodeToPdf: () => { throw new Error("#498 P1g-b: exportação fora do teste"); },
}));
vi.mock("@/components/simulator/DailyAttendanceCard", () => ({ default: () => null }));
// Keep actual dashboard leaves; expose the supplied Recharts tooltip callbacks in
// the DOM without layout/animation, including both screen and PDF chart trees.
vi.mock("recharts", () => {
  const Chart = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    ResponsiveContainer: Chart, PieChart: Chart, BarChart: Chart, Pie: Chart,
    Bar: Empty, Cell: Empty, XAxis: Empty, YAxis: Empty, CartesianGrid: Empty, ReferenceLine: Empty,
    Tooltip: ({ formatter }: { formatter?: (v: number) => ReactNode }) => formatter
      ? <span data-testid="money-tooltip">{formatter(1234.56)}</span> : null,
  };
});

const noop = async () => {};
const masterEvent = { id: "fixture-master", name: "Turnê sintética" };
const splits = [{ id: "fixture-city", name: "Cidade sintética" }];
const scenario = (factor: number) => ({
  rev: { ticketsRevenue: 1234.56 * factor, drinkRevenue: 1234.56 * factor,
    foodRevenue: 0, sponsorRevenue: 0, souvenirRevenue: 0, otherCredits: 0,
    ticketsQty: factor, courtesyQty: 0, attendanceQty: factor, totalRevenue: 2469.12 * factor },
  cost: { eventCosts: 1234.56 * factor, abCost: 0, souvenirCost: 0, totalCost: 1234.56 * factor },
  res: { general: 1234.56 * factor, event: 1234.56 * factor, ab: 0, souvenir: 0 },
  kpis: { totalPublic: factor, tmTickets: 1234.56, tmAB: 1234.56,
    costPerPerson: 1234.56, resultPerPerson: 1234.56 },
});
const real = scenario(1);
const be = scenario(2);
const fc = scenario(3);
const cityData = {
  loading: false,
  cfg: { sponsorship_revenue: 0 },
  rev: { real: real.rev, breakeven: be.rev, forecast: fc.rev },
  costs: { real: real.cost, breakeven: be.cost, forecast: fc.cost },
  res: { real: real.res, breakeven: be.res, forecast: fc.res },
  kpis: { real: real.kpis, breakeven: be.kpis, forecast: fc.kpis },
  beTotalQty: 2,
};
const masterData = { ...cityData, cfg: { sponsorship_revenue: 1234.56 } };
const abTotals = { faturacaoTotal: 2469.12, custoTotal: 1234.56, resultadoTotal: 1234.56 };
const dashboardProps = {
  eventName: "Evento sintético",
  today: real.rev, todayCosts: real.cost, todayRes: real.res, todayKpis: real.kpis,
  breakeven: be.rev, beCosts: be.cost, beRes: be.res, beKpis: be.kpis,
  forecast: fc.rev, fcCosts: fc.cost, fcRes: fc.res, fcKpis: fc.kpis,
  costLines: [{ label: "Custo sintético", actual_amount: 1234.56, break_even_amount: 2469.12, forecast_amount: 3703.68 }],
  dailyTotals: [], ivaTable: [], sessions: [],
  abModule: { hasConfig: true, totals: { real: abTotals, breakeven: abTotals, forecast: abTotals } },
  tourBreakdowns: [{ name: splits[0].name, publico: 1, ticketMedio: 1234.56, abPerPerson: 1234.56,
    receita: 2469.12, custo: 1234.56, resultado: 1234.56, margem: 50, breakEvenQty: 2 }],
};
const screens = {
  ab: () => <EventABRealizedSection eventId="fixture-event" moduleReceita={12345.67} />,
  dashboard: () => <ExecutiveDashboard {...dashboardProps} />,
  tour: () => <TourSimulator masterEvent={masterEvent} splits={splits} />,
  prior: () => <PriorCurveSelector eventId="fixture-event" eventName="Evento sintético" companyId="fixture-company"
    mode="preset" priorEventId={null} collectedAt={null} onChange={noop} />,
};
type ScreenName = keyof typeof screens;
function element(name: ScreenName) {
  return <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{screens[name]()}</MemoryRouter>;
}
function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null,
    isLoading: false, isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function domHash() {
  // Only generated React/Radix IDs are canonicalised; Intl bytes are untouched.
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function visitViews(name: ScreenName, check: () => void) {
  check();
  if (name === "dashboard") {
    for (const label of ["Break Even", "Forecast"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      check();
    }
  }
  if (name === "tour") {
    for (const value of ["consolidated", "dashboard"]) {
      fireEvent.mouseDown(document.querySelector(`[role="tab"][id$="trigger-${value}"]`)!, { button: 0, ctrlKey: false });
      check();
    }
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1g-b: rede proibida"); }));
  setCompany();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P1g-b — PT anterior à alteração dos quatro filhos", () => {
  it("fixa SHA-256 do DOM de cada componente e dos separadores monetários", () => {
    const hashes: Record<string, string[]> = {};
    for (const name of Object.keys(screens) as ScreenName[]) {
      render(element(name));
      hashes[name] = [];
      visitViews(name, () => hashes[name].push(domHash()));
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "ab": [
          "f967b74e20577ef0a81fea72333637a7369d06198775e625b2cbb5e9d3d41e07",
        ],
        "dashboard": [
          "f8ad784b4e4611594920dd3593944d1c98979e8f2ebf5d0bdcb9354497881de7",
          "82b3a3ef4756ba1780972c1c970f891b4cc347ac3db460425bb216818e9b3d70",
          "81135a02acfc2d9ff2c5c0c470f4681238608ba6229023b61d54d9195844eae9",
        ],
        "prior": [
          "e52b7037fc0288c5eb7a19f90f71ef0b802502007244aca7923cd84803ad11a6",
        ],
        "tour": [
          "989d534fb798a5573bb7f66a17d73069a8ce35c200f67a12c90d95919c93fe89",
          "1738145926c54abcf8ef8ed5bced024feca889ebcfb0d083e30db94d8644c07c",
          "116d752d8a82624b8c0c556ff5fc4971225206035702ffa09a3f6e90b9c47502",
        ],
      }
    `);
  });

  it("preserva Intl pt-PT no realizado A&B e na sugestão histórica", () => {
    for (const name of ["ab", "prior"] as const) {
      render(element(name));
      expect(document.body.textContent).toContain("1234,56\u00a0€");
      cleanup();
    }
    render(element("ab"));
    expect(document.body.textContent).toContain("12\u00a0345,67\u00a0€");
  });
});

describe("#498 P1g-b — moeda da empresa nos quatro filhos", () => {
  it.each(Object.keys(screens) as ScreenName[])("BR: %s usa R$ e pt-BR em todas as vistas", name => {
    setCompany("BR", "BRL");
    render(element(name));
    visitViews(name, () => {
      expect(document.body.textContent).toContain("R$\u00a01.234,56");
      expect(document.body.innerHTML).not.toContain("€");
      for (const tooltip of screen.queryAllByTestId("money-tooltip")) {
        expect(tooltip.textContent).toBe("R$\u00a01.234,56");
      }
    });
  });

  it("BR: KPIs, badges, tabelas, A&B, cartões de cidade e os quatro tooltips usam o mesmo contexto", () => {
    setCompany("BR", "BRL");
    const { container } = render(element("dashboard"));
    const dashboard = within(container.querySelector<HTMLElement>("[data-pdf-screen]")!);
    expect(dashboard.getByText("Resultado Geral").parentElement!.textContent).toContain("R$\u00a01.234,56");
    expect(dashboard.getByText(/Margem A&B: R\$\s1\.234,56/).textContent).toContain("Margem A&B: R$\u00a01.234,56");
    expect(dashboard.getByText("Custo sintético").closest("tr")!.textContent).toContain("R$\u00a01.234,56");
    expect(dashboard.getByText("Resultado A&B").parentElement!.textContent).toContain("R$\u00a01.234,56");
    expect(dashboard.getByText(splits[0].name).closest("section")!.textContent).toContain("TM R$\u00a01.234,56");
    expect(screen.getAllByTestId("money-tooltip")).toHaveLength(4);
  });

  it.each(Object.keys(screens) as ScreenName[])("%s acompanha PT → BR → PT sem alterar os bytes PT", name => {
    const view = render(element(name));
    visitViews(name, () => {
      const pt = domHash();
      setCompany("BR", "BRL");
      view.rerender(element(name));
      expect(document.body.textContent).toContain("R$\u00a01.234,56");
      expect(document.body.innerHTML).not.toContain("€");
      setCompany();
      view.rerender(element(name));
      expect(domHash()).toBe(pt);
    });
  });

  it.each([
    [null, "EUR", {}], ["BR", "", {}],
    ["BR", "BRL", { isLoading: true }],
    ["BR", "BRL", { isError: true, error: new Error("synthetic error") }],
  ] as const)("contexto indisponível %s/%s/%j não conserva moeda anterior", (country, currency, overrides) => {
    for (const name of Object.keys(screens) as ScreenName[]) {
      setCompany("BR", "BRL");
      const view = render(element(name));
      setCompany(country, currency, overrides);
      view.rerender(element(name));
      visitViews(name, () => {
        expect(document.body.innerHTML).not.toMatch(/R\$|€/);
        expect(document.body.textContent).toContain("—");
      });
      cleanup();
    }
  });

  it("não introduz guards de país nem mantém formatters monetários de módulo", () => {
    for (const file of ["src/components/EventABRealizedSection.tsx", "src/components/simulator/ExecutiveDashboard.tsx",
      "src/components/simulator/TourSimulator.tsx", "src/components/simulator/PriorCurveSelector.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/if\s*\(\s*country/);
      expect(source).not.toMatch(/^const (?:fmtEUR|fmt|formatCurrency)\s*=/m);
    }
  });
});
