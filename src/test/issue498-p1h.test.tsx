import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { useCompany, type Company } from "@/hooks/useCompany";
import { exportBankStatementToExcel, exportBankStatementToPDF } from "@/lib/export-bank-statement";
import ReportForecastPayables from "@/components/ReportForecastPayables";
import ReportBankStatement from "@/components/ReportBankStatement";
import ReportTreasuryProjection from "@/components/ReportTreasuryProjection";
import ReportMonthlyEvolution from "@/components/ReportMonthlyEvolution";
import ReportProfitability from "@/components/ReportProfitability";
import ReportBudgetDeviation from "@/components/ReportBudgetDeviation";

const fixtures = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  pdf: [] as unknown[][],
  xlsx: [] as unknown[][],
  consolidate: false,
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Query callbacks never execute; service and network access fail closed.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: fixtures.queries[String(queryKey[0])], isLoading: false, isError: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#498 P1h: serviço MP proibido"); },
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useUserPreferences", () => ({ useUserPreferences: () => ({
  consolidateBankMovements: fixtures.consolidate, setConsolidateBankMovements: vi.fn(),
}) }));
vi.mock("@/hooks/useBankMovementGroups", () => ({ useBankMovementGroups: () => ({
  byTx: new Map([["expense", "bank:fixture"], ["expense-zero", "bank:fixture"]]),
  groups: new Map([["bank:fixture", { groupId: "bank:fixture", source: "bank", bankDate: "2026-11-02",
    description: "Movimento sintético", bankAmount: -100, txIds: ["expense", "expense-zero"] }]]),
  degraded: false,
}) }));
vi.mock("@/components/TransactionDocumentsModal", () => ({ TransactionDocumentsModal: () => null }));
vi.mock("@/components/bank/BankLineDocumentsDialog", () => ({ default: () => null }));
// Replace only Recharts' layout boundary: exercise every supplied axis/tooltip
// formatter deterministically, while keeping report tables/cards and UI real.
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <div data-testid="chart">{children}</div>,
  ChartTooltip: ({ content }: { content: ReactNode }) => <foreignObject>{content}</foreignObject>,
  ChartTooltipContent: ({ formatter }: { formatter: (v: number) => ReactNode }) =>
    <span data-testid="money-tooltip">{formatter(1234.56)}</span>,
}));
vi.mock("recharts", () => {
  const Chart = ({ children, data }: { children: ReactNode; data: unknown }) =>
    <svg data-series={JSON.stringify(data)}>{children}</svg>;
  const Axis = ({ tickFormatter }: { tickFormatter?: (v: number) => ReactNode }) =>
    tickFormatter ? <text data-testid="axis">{tickFormatter(1234.56)}</text> : null;
  return { AreaChart: Chart, LineChart: Chart, BarChart: Chart, XAxis: Axis, YAxis: Axis,
    Area: () => null, Line: () => null, Bar: () => null, Cell: () => null,
    CartesianGrid: () => null, ReferenceLine: () => null, ResponsiveContainer: Chart };
});
vi.mock("xlsx", async (original) => ({ ...await original<typeof import("xlsx")>(),
  writeFile: vi.fn((...args: unknown[]) => fixtures.xlsx.push(args)),
}));
vi.mock("@/lib/export-bank-statement", async (original) => {
  const actual = await original<typeof import("@/lib/export-bank-statement")>();
  return { ...actual, exportBankStatementToExcel: vi.fn(actual.exportBankStatementToExcel),
    exportBankStatementToPDF: vi.fn(actual.exportBankStatementToPDF) };
});
vi.mock("jspdf", () => ({ default: class {
  constructor(options: unknown) {
    fixtures.pdf.push(["new", options]);
    const doc = new Proxy({ internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } } }, {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        return (...args: unknown[]) => {
          // Image bytes are a static imported asset, outside this dispatch.
          fixtures.pdf.push([String(key), ...(key === "addImage" ? ["fixture-logo", ...args.slice(1)] : args)]);
          if (key === "getNumberOfPages") return 1;
          return doc;
        };
      },
    });
    return doc;
  }
} }));
vi.mock("jspdf-autotable", () => ({ default: (_doc: unknown, options: unknown) => {
  fixtures.pdf.push(["autoTable", options]);
} }));

const event = { id: "event", name: "Evento sintético", date: "2026-11-01", status: "completed", venue_id: "venue", parent_event_id: null, event_nature: "producao_propria" };
const category = { id: "category", code: "2.1.01", name: "Despesa sintética", type: "expense" };
const account = { id: "bank", name: "Banco sintético", is_active: true, initial_balance: -10.01, initial_balance_date: "2026-10-31", skip_balance_check: false, balance_visible_to_all: true };
const income = { id: "income", event_id: "event", type: "income", amount: 1234.56, paid_amount: 1234.56, iva_rate: 0, status: "paid", date: "2026-11-01", description: "Entrada sintética", events: { name: event.name } };
const expense = { ...income, id: "expense", type: "expense", amount: 100, paid_amount: 100, category_id: "category", date: "2026-11-02", description: "Saída sintética" };
const forecast = { ...expense, id: "forecast", amount: 1234.56, paid_amount: 0, status: "approved" };
const reports = { Forecast: ReportForecastPayables, Bank: ReportBankStatement, Treasury: ReportTreasuryProjection,
  Monthly: ReportMonthlyEvolution, Profitability: ReportProfitability, Budget: ReportBudgetDeviation };
type ReportName = keyof typeof reports;

function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false,
    isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function hash(node: HTMLElement) {
  // Normalize only React/Radix generated IDs; keep whitespace/NBSP/money intact.
  return digest(node.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:"));
}
function mount(name: ReportName) {
  const Report = reports[name];
  const element = () => <MemoryRouter initialEntries={["/?conta=bank&auto=1"]}
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Report /></MemoryRouter>;
  return { ...render(element()), refresh: element };
}
function selectEvent() {
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: event.name }));
}
function openDetails(name: ReportName) {
  if (name === "Forecast" || name === "Budget") selectEvent();
  if (name === "Forecast") fireEvent.click(screen.getByRole("button", { name: "Expandir" }));
}
function globalForecast() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Visão Global/ }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByRole("button", { name: "Expandir" }));
}
function exportReport(name: "Forecast" | "Bank", kind: "Excel" | "PDF") {
  if (name === "Forecast") {
    fireEvent.keyDown(screen.getByRole("button", { name: "Exportar" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("menuitem", { name: kind }));
  } else fireEvent.click(screen.getByRole("button", { name: kind }));
}
function exportCapture() { return JSON.stringify({ pdf: fixtures.pdf, xlsx: fixtures.xlsx }); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1h: rede proibida"); }));
  setCompany();
  fixtures.pdf = []; fixtures.xlsx = []; fixtures.consolidate = false;
  fixtures.queries = {
    "business-lines": [],
    events: [event], "all-forecasts": [forecast], "all-transactions-payables": [expense], "account-categories": [category],
    "financial-accounts": [account], "bank-statement-tx": [income, expense, { ...expense, id: "expense-zero", amount: 0, paid_amount: 0 }],
    "bank-statement-adj": { before: 0, inPeriod: -0.01 },
    "treasury-accounts": [account], "treasury-server-balances": new Map([["bank", 1234.56]]),
    "treasury-pending": [{ ...expense, date: "2026-11-09", due_date: "2026-11-09" }],
    "monthly-evolution-txs": [income, expense],
    "profitability-events": [event], "profitability-venues": [{ id: "venue", name: "Sala sintética" }],
    "profitability-cache": [{ event_id: "event", artist_name: "Artista sintético" }],
    "profitability-transactions": [income, expense], "profitability-forecasts-expense": [forecast],
    "budget-dev-events": [event], "budget-dev-categories": [category], "budget-dev-forecasts": [forecast], "budget-dev-txs": [expense],
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("#498 P1h — PT capturado ANTES da alteração dos seis relatórios; não regenerar", () => {
  it("preserva os bytes do DOM inicial, detalhado e das vistas alternativas", () => {
    const hashes: Record<string, string> = {};
    for (const name of Object.keys(reports) as ReportName[]) {
      const { container, rerender, refresh } = mount(name);
      hashes[`${name}:initial`] = hash(container);
      openDetails(name);
      hashes[`${name}:detail`] = hash(container);
      if (name === "Forecast") {
        globalForecast();
        hashes["Forecast:global"] = hash(container);
      }
      if (name === "Profitability") {
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Por Venue" }), { button: 0, ctrlKey: false });
        hashes["Profitability:venue"] = hash(container);
      }
      if (name === "Bank") {
        fixtures.consolidate = true;
        rerender(refresh());
        hashes["Bank:grouped"] = hash(container);
        fireEvent.click(screen.getByText("Movimento sintético"));
        hashes["Bank:expanded"] = hash(container);
      }
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "Bank:detail": "c81ebbeab896451c037f871cfeb8ca8258d73a594fbd776c2dd15447b9b2fc4b",
        "Bank:expanded": "d77fdfb328d9f5918400123080224dbbcdda47ec47edc95e551a3a3d18e2c002",
        "Bank:grouped": "3dba27e1457f6c51ae1c6f0156e4e54ffdfb181fc6fb115430a4792fc76378c0",
        "Bank:initial": "c81ebbeab896451c037f871cfeb8ca8258d73a594fbd776c2dd15447b9b2fc4b",
        "Budget:detail": "67e62d6a54146d5d070797c2c815e64e758aaf074cfc0a4a360f3f839773ca50",
        "Budget:initial": "3a23c3532372b1cd68669ef1d2900d68d8834718569e48d8826b9e3661fc1539",
        "Forecast:detail": "ade4bbf6fe8b40fdb87d953765e2732ba1b8e125f77a63aad04807c3d24bd2fb",
        "Forecast:global": "8b99d856dd0c53b2f976519a07c53bc89fbaa550204673f995fb4095eb2999f5",
        "Forecast:initial": "38e0b7edbef0f5d72f0c52ef479a853e074f479a8b097e73c7b5a69acc6535e4",
        "Monthly:detail": "186ed06ff5597dd1d439d6361d398434b5a9816f055eab9fdb078a47c43e8569",
        "Monthly:initial": "186ed06ff5597dd1d439d6361d398434b5a9816f055eab9fdb078a47c43e8569",
        "Profitability:detail": "4ca9ec1a865083c968373efaaf8615f1f7b9d0d6443c4282ecfcbe5ccd875864",
        "Profitability:initial": "4ca9ec1a865083c968373efaaf8615f1f7b9d0d6443c4282ecfcbe5ccd875864",
        "Profitability:venue": "b7a965246c36ec8b5fec7623081037a5a6c95ddda0e73591e9037af427a854bc",
        "Treasury:detail": "e520d15fb7e277bed7ac5ba7d331d24029a7dee76aa74580fbf9ef0b57594d86",
        "Treasury:initial": "e520d15fb7e277bed7ac5ba7d331d24029a7dee76aa74580fbf9ef0b57594d86",
      }
    `);
  });
  it("preserva workbooks, chamadas PDF, nomes, estilos e números dos exports PT", () => {
    const hashes: Record<string, string> = {};
    for (const name of ["Forecast", "Bank"] as const) {
      mount(name); openDetails(name);
      for (const view of name === "Forecast" ? ["event", "global"] : ["flat"]) {
        if (view === "global") globalForecast();
        for (const kind of ["Excel", "PDF"] as const) {
          fixtures.pdf = []; fixtures.xlsx = [];
          exportReport(name, kind);
          expect(fixtures.pdf.length + fixtures.xlsx.length).toBeGreaterThan(0);
          hashes[`${name}:${view}:${kind}`] = digest(exportCapture());
        }
      }
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "Bank:flat:Excel": "6bf27dd6d40a3d70d1c966d97791718867c67df79fee74bd120fdeba9ce00eb2",
        "Bank:flat:PDF": "de8143857e158b3f06955beb36c865482bfccd3b99801de8b8d93cf9787f9eeb",
        "Forecast:event:Excel": "04abdf23972f22f2acd3ba1fb5f72ac47b26dbc696cffa093c6715ce80c48974",
        "Forecast:event:PDF": "64c6227d73c88b679673182405964683518aa2f9ce3bc351d0ad8c3e184bb0f1",
        "Forecast:global:Excel": "78e1a06e95b976824b238d1243133a37927844a98b211e3c0c3445f3ffa49bde",
        "Forecast:global:PDF": "b5ed76f0e1907e6d6eb369580c5d75ece7e7a4c4844799d15c77b99c2ae261d7",
      }
    `);
  });
});

// Reverse only monetary presentation. Comparing the full DOM/export payload
// also protects dates, percentages, order, styles and every computed amount.
function normalizeBR(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeBR);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeBR(item)]));
  if (typeof value !== "string") return value;
  if (value === '"R$ "#.##0,00') return '#.##0,00\\ "€"';
  return value.replace(/\(R\$\)/g, "(€)")
    .replace(/(-?)R\$(\u00a0|&nbsp;)([\d.]+),(\d{2})/g, "$1$3,$4$2€");
}

describe("#498 P1h — moeda da empresa sem alterar cálculos", () => {
  it.each(Object.keys(reports) as ReportName[])("%s: PT → BR → indisponível → PT preserva os bytes", (name) => {
    const { container, rerender, refresh } = mount(name);
    openDetails(name);
    const pt = hash(container);
    setCompany("BR", "BRL");
    rerender(refresh());
    expect(container.textContent).toContain("R$\u00a01.234,56");
    expect(document.body.textContent).not.toContain("€");
    expect(digest(normalizeBR(container.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")) as string)).toBe(pt);
    if (["Treasury", "Monthly", "Profitability", "Budget"].includes(name)) {
      expect(screen.getByTestId("money-tooltip")).toHaveTextContent("R$ 1.234,56");
    }
    if (name === "Profitability" || name === "Budget") {
      expect(screen.getByTestId("axis")).toHaveTextContent("R$ 1.234,56");
    }
    if (name === "Bank") {
      for (const label of ["Entrada (R$)", "Saída (R$)", "Saldo (R$)"]) {
        expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
      }
      expect(container.textContent).toContain("-R$\u00a010,01");
    }
    if (name === "Budget") expect(screen.getByRole("columnheader", { name: "Desvio (R$)" })).toBeInTheDocument();
    if (name === "Monthly") expect(container.textContent).toContain("R$\u00a00,00");
    setCompany(null);
    rerender(refresh());
    expect(container.textContent).toContain("—");
    expect(document.body.textContent).not.toMatch(/€|R\$/);
    setCompany();
    rerender(refresh());
    expect(hash(container)).toBe(pt);
  });

  it.each([
    ["BR", "", {}],
    ["PT", "EUR", { isLoading: true }],
    ["PT", "EUR", { isError: true, error: new Error("fixture") }],
  ] as const)("configuração indisponível %s/%s/%j nunca assume euros", (country, currency, overrides) => {
    for (const name of Object.keys(reports) as ReportName[]) {
      setCompany(country, currency, overrides);
      const { container } = mount(name); openDetails(name);
      expect(container.textContent).toContain("—");
      expect(document.body.textContent).not.toMatch(/€|R\$/);
      cleanup();
    }
  });

  it("desvio positivo indisponível mostra — sem prefixo monetário; percentagens mantêm-se", () => {
    fixtures.queries["budget-dev-forecasts"] = [{ ...forecast, amount: 100 }];
    fixtures.queries["budget-dev-txs"] = [{ ...expense, amount: 1234.56 }];
    setCompany("BR", "BRL");
    const { container, rerender, refresh } = mount("Budget"); openDetails("Budget");
    expect(container.textContent).toContain("+R$\u00a01.134,56");
    expect(container.textContent).toContain("+1134.6%");
    setCompany(null); rerender(refresh());
    expect(screen.getAllByRole("row")[1].querySelectorAll("td")[3].textContent?.trim()).toBe("—");
    expect(container.textContent).toContain("+1134.6%");
    expect(container.textContent).not.toMatch(/€|R\$/);
  });

  it.each(["Forecast", "Bank", "Profitability"] as const)("%s: vistas alternativas e detalhes usam o mesmo formatter", (name) => {
    setCompany("BR", "BRL");
    fixtures.consolidate = true;
    const { container } = mount(name); openDetails(name);
    if (name === "Forecast") globalForecast();
    if (name === "Bank") fireEvent.click(screen.getByText("Movimento sintético"));
    if (name === "Profitability") fireEvent.mouseDown(screen.getByRole("tab", { name: "Por Venue" }), { button: 0, ctrlKey: false });
    expect(container.textContent).toContain("R$\u00a01.234,56");
    expect(document.body.textContent).not.toContain("€");
    if (name === "Bank") {
      expect(container.textContent).toContain("Banco: -R$\u00a0100,00");
      expect(container.textContent).toContain("Saída sintética");
    }
  });

  it.each(["Forecast", "Bank"] as const)("%s: exports BR só alteram a apresentação e recebem o contexto", (name) => {
    const { rerender, refresh } = mount(name); openDetails(name);
    for (const view of name === "Forecast" ? ["event", "global"] : ["flat"]) {
      if (view === "global") globalForecast();
      for (const kind of ["Excel", "PDF"] as const) {
        setCompany(); rerender(refresh()); fixtures.pdf = []; fixtures.xlsx = [];
        exportReport(name, kind);
        const pt = exportCapture();
        setCompany("BR", "BRL"); rerender(refresh()); fixtures.pdf = []; fixtures.xlsx = [];
        exportReport(name, kind);
        const br = exportCapture();
        expect(br).not.toContain("€");
        expect(br).toContain("R$");
        expect(JSON.stringify(normalizeBR(JSON.parse(br)))).toBe(pt);
        if (kind === "Excel") {
          const [workbook] = fixtures.xlsx[0] as [XLSX.WorkBook];
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          const cells = Object.values(ws).filter((cell) => cell?.t === "n");
          expect(cells.length).toBeGreaterThan(0);
          expect(cells.every((cell) => cell.z === '"R$ "#.##0,00')).toBe(true);
          expect(cells.some((cell) => cell.v === 1234.56)).toBe(true);
        } else expect(br).toContain("R$\u00a01.234,56");
        if (name === "Bank") {
          const spy = kind === "Excel" ? exportBankStatementToExcel : exportBankStatementToPDF;
          const args = vi.mocked(spy).mock.calls.at(-1)!;
          expect(args).toHaveLength(8);
          expect(args[6]).toBe(false);
          expect(args[7]).toMatchObject({ status: "available", locale: "pt-BR", currency: "BRL", symbol: "R$" });
        }
      }
    }
  });

  it.each(["Forecast", "Bank"] as const)("%s: sem moeda disponível nenhum export assume EUR", (name) => {
    setCompany(null);
    mount(name); openDetails(name);
    exportReport(name, "Excel"); exportReport(name, "PDF");
    expect(fixtures.pdf).toEqual([]);
    expect(fixtures.xlsx).toEqual([]);
    expect(exportBankStatementToExcel).not.toHaveBeenCalled();
    expect(exportBankStatementToPDF).not.toHaveBeenCalled();
  });

  it("o extrato conserva saldos não controlados e passa o sinalizador aos dois exports", () => {
    setCompany("BR", "BRL");
    fixtures.queries["financial-accounts"] = [{ ...account, skip_balance_check: true }];
    const { container } = mount("Bank");
    expect(container.textContent).toContain("Saldo não controlado");
    expect(container.textContent).not.toContain("-R$\u00a010,01");
    for (const kind of ["Excel", "PDF"] as const) {
      exportReport("Bank", kind);
      const spy = kind === "Excel" ? exportBankStatementToExcel : exportBankStatementToPDF;
      expect(vi.mocked(spy).mock.calls.at(-1)![6]).toBe(true);
    }
    expect(exportCapture()).toContain("Não controlado");
    expect(exportCapture()).not.toContain("€");
  });

  it("os seis componentes usam o adapter sem branches de país ou formatter legado directo", () => {
    for (const Report of ["ForecastPayables", "BankStatement", "TreasuryProjection", "MonthlyEvolution", "Profitability", "BudgetDeviation"]) {
      const source = readFileSync(`src/components/Report${Report}.tsx`, "utf8");
      expect(source).toContain("useCompanyLocale()");
      expect(source.match(/formatLegacyCurrency\(/g)).toHaveLength(1);
      expect(source).not.toMatch(/import\s*{[^}]*\bformatCurrency\s*[,}]/);
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    }
  });
});
