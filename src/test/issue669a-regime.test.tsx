import type { PropsWithChildren } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportDREEmpresarial from "@/components/ReportDREEmpresarial";
import { resolveCompanyLocale } from "@/lib/company-locale";
import { regimeDate, useReportRegime, type Regime } from "@/lib/report-regime";

const f = vi.hoisted(() => ({ queries: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: f.queries[String(queryKey[0])], isLoading: false }),
}));
vi.mock("@/hooks/useCompanyLocale", () => ({
  useCompanyLocale: () => resolveCompanyLocale({ country: "PT", currency: "EUR" }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#669: serviço remoto proibido"); },
}) }));

const event = { id: "event", name: "Evento sintético", date: "2026-06-15", status: "active", event_nature: "producao_propria" };
const baseTx = {
  event_id: event.id, type: "income", category_id: "event-income", amount: 10, iva_rate: 0,
  date: "2026-05-10", due_date: null, payment_date: null, status: "approved",
};
const transactions = [
  { ...baseTx, id: "paid-cross-year", amount: 120, date: "2025-12-15", due_date: "2025-12-31", payment_date: "2026-01-10", status: "paid" },
  { ...baseTx, id: "due-cross-month", amount: 50, date: "2026-02-05", due_date: "2026-03-10" },
  { ...baseTx, id: "no-due", amount: 30 },
  { ...baseTx, id: "expense-paid", amount: 20, type: "expense", category_id: "event-expense", date: "2025-12-20", payment_date: "2026-01-15", status: "paid" },
  { ...baseTx, id: "corporate-expense", amount: 40, type: "expense", category_id: "corp-expense", event_id: null, date: "2026-02-05", due_date: "2026-04-10" },
  { ...baseTx, id: "financial-income", amount: 60, category_id: "corp-income", event_id: null, date: "2026-02-05", due_date: "2026-07-10" },
  { ...baseTx, id: "due-cross-year", amount: 70, date: "2025-11-05", due_date: "2026-09-10" },
  { ...baseTx, id: "distinct-years", amount: 90, date: "2024-12-31", payment_date: "2027-01-01", status: "paid" },
];

let setItem: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  setItem = vi.spyOn(Storage.prototype, "setItem");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#669: rede proibida"); }));
  f.queries = {
    "business-lines": [],
    events: [event], "transactions-approved": transactions,
    "account-categories": [
      { id: "event-income", code: "1.2.01", name: "Receita sintética", type: "income" },
      { id: "event-expense", code: "2.1.01", name: "Despesa sintética", type: "expense" },
      { id: "corp-expense", code: "10.3.01", name: "Estrutura sintética", type: "expense" },
      { id: "corp-income", code: "10.1.01", name: "Financiamento sintético", type: "income" },
    ],
  };
});
afterEach(() => {
  cleanup();
  expect(setItem).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("#669 C1 — tabela de datas", () => {
  it.each([
    ["pago", { date: "2025-12-15", due_date: "2025-12-31", payment_date: "2026-01-10" }, "2026-01-10"],
    ["por pagar com vencimento", { date: "2025-12-15", due_date: "2026-02-10", payment_date: null }, "2026-02-10"],
    ["por pagar sem vencimento", { date: "2025-12-15", due_date: null, payment_date: null }, "2025-12-15"],
    ["parcialmente pago", { date: "2025-12-15", due_date: "2026-02-10", payment_date: null, paid_amount: 25 }, "2026-02-10"],
    ["datas opcionais ausentes", { date: "2025-12-15" }, "2025-12-15"],
  ] as const)("%s: caixa e competência", (_name, tx, caixa) => {
    const bytes = JSON.stringify(tx);
    expect(regimeDate(tx, "caixa")).toBe(caixa);
    expect(regimeDate(tx, "competencia")).toBe("2025-12-15");
    expect(JSON.stringify(tx)).toBe(bytes);
  });
});

const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
function routerWrapper(entry: string) {
  return ({ children }: PropsWithChildren) => <MemoryRouter initialEntries={[entry]} future={future}>{children}</MemoryRouter>;
}

describe("#669 C3 — regime só no URL", () => {
  it.each(["/reports", "/reports?regime=caixa", "/reports?regime=invalido"])("%s usa caixa", entry => {
    const { result } = renderHook(useReportRegime, { wrapper: routerWrapper(entry) });
    expect(result.current.regime).toBe("caixa");
  });

  it("lê competência, preserva os outros parâmetros e substitui a entrada do histórico", () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <MemoryRouter initialEntries={["/anterior", "/reports?tab=empresarial&regime=competencia&year=2026"]} initialIndex={1} future={future}>
        {children}
      </MemoryRouter>
    );
    const { result } = renderHook(() => ({ ...useReportRegime(), location: useLocation(), navigate: useNavigate() }), { wrapper });
    expect(result.current.regime).toBe("competencia");
    act(() => result.current.setRegime("caixa"));
    expect(result.current.regime).toBe("caixa");
    expect(result.current.location).toMatchObject({ pathname: "/reports", search: "?tab=empresarial&year=2026" });
    act(() => result.current.setRegime("competencia"));
    expect(new URLSearchParams(result.current.location.search).get("regime")).toBe("competencia");
    act(() => result.current.navigate(-1));
    expect(result.current.location.pathname).toBe("/anterior");
    expect(result.current.regime).toBe("caixa");
    act(() => result.current.navigate(1));
    expect(result.current.regime).toBe("competencia");
  });

  it("fora de Router devolve caixa e o setter é inerte", () => {
    const { result } = renderHook(useReportRegime);
    expect(result.current.regime).toBe("caixa");
    act(() => result.current.setRegime("competencia"));
    expect(result.current.regime).toBe("caixa");
    render(<ReportDREEmpresarial />);
    expect(screen.getByRole("radio", { name: "Caixa" })).toBeChecked();
  });
});

function monthly(entries: Record<number, number>) {
  return Array.from({ length: 12 }, (_, index) => entries[index + 1] ?? 0);
}
function expectRow(label: string, amounts: number[]) {
  const row = screen.getAllByRole("row").find(row =>
    row.children.length === 14 && row.firstElementChild?.textContent === label,
  )!;
  const cells = within(row).getAllByRole("cell").slice(1);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  expect(cells.map(cell => cell.textContent)).toEqual([...amounts, total].map(amount =>
    amount === 0 ? "—" : `${amount.toFixed(2).replace(".", ",")}\u00a0€`,
  ));
}
function selectYear(year: number) {
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: String(year) }));
}
function openReport(entry = "/reports?tab=empresarial") {
  const result = render(<ReportDREEmpresarial />, { wrapper: routerWrapper(entry) });
  fireEvent.click(screen.getByRole("radio", { name: /Transações \(comparação\)/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Só transações" }));
  return result;
}

describe("#669 C2 — DRE Empresarial com as mesmas transações", () => {
  it("muda meses e totais anuais em todas as secções e fecha pela soma das datas do regime", () => {
    const original = JSON.stringify(transactions);
    openReport();
    // Caixa por omissão, antigo → novo: receita anual 200 → 270; fevereiro →
    // março (50) e novembro/2025 → setembro/2026 (70), pelos vencimentos.
    expectRow("Receitas de Eventos", monthly({ 1: 120, 3: 50, 5: 30, 9: 70 }));
    expectRow("(-) Custos Directos de Eventos", monthly({ 1: -20 }));
    expectRow("= Total Custos Corporativos", monthly({ 4: -40 }));
    expectRow("= Total Movimentos Financeiros", monthly({ 7: 60 }));
    expectRow("RESULTADO DA EMPRESA", monthly({ 1: 100, 3: 50, 4: -40, 5: 30, 9: 70 }));
    expectRow("POSIÇÃO FINANCEIRA", monthly({ 1: 100, 3: 50, 4: -40, 5: 30, 7: 60, 9: 70 }));

    fireEvent.click(screen.getByRole("radio", { name: "Competência" }));
    expectRow("Receitas de Eventos", monthly({ 2: 50, 5: 30 }));
    expectRow("(-) Custos Directos de Eventos", monthly({}));
    expectRow("= Total Custos Corporativos", monthly({ 2: -40 }));
    expectRow("= Total Movimentos Financeiros", monthly({ 2: 60 }));
    expectRow("RESULTADO DA EMPRESA", monthly({ 2: 10, 5: 30 }));
    expectRow("POSIÇÃO FINANCEIRA", monthly({ 2: 70, 5: 30 }));

    selectYear(2025);
    expectRow("Receitas de Eventos", monthly({ 11: 70, 12: 120 }));
    expectRow("(-) Custos Directos de Eventos", monthly({ 12: -20 }));
    expectRow("RESULTADO DA EMPRESA", monthly({ 11: 70, 12: 100 }));
    fireEvent.click(screen.getByRole("radio", { name: "Caixa" }));
    expectRow("Receitas de Eventos", monthly({}));
    expectRow("RESULTADO DA EMPRESA", monthly({}));
    selectYear(2026);
    expectRow("RESULTADO DA EMPRESA", monthly({ 1: 100, 3: 50, 4: -40, 5: 30, 9: 70 }));
    expect(JSON.stringify(transactions)).toBe(original);
  });

  it.each(["caixa", "competencia"] as Regime[])("os anos disponíveis e a montagem inicial seguem %s", regime => {
    openReport(`/reports?regime=${regime}`);
    expect(screen.getByRole("radio", { name: regime === "caixa" ? "Caixa" : "Competência" })).toBeChecked();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(
      regime === "caixa" ? ["2027", "2026"] : ["2026", "2025", "2024"],
    );
    fireEvent.click(screen.getByRole("option", { name: regime === "caixa" ? "2027" : "2024" }));
    expectRow("Receitas de Eventos", monthly(regime === "caixa" ? { 1: 90 } : { 12: 90 }));
  });

  it("BP, bilheteira e distribuição mantêm as datas das suas fontes nos dois regimes", () => {
    f.queries["transactions-approved"] = [];
    f.queries["dre-emp-forecasts-expense"] = [{ id: "bp", event_id: event.id, type: "expense", status: "approved", category_id: "event-expense", amount: 20, iva_rate: 0 }];
    f.queries["ticket-zones-all"] = [{ id: "zone", event_id: event.id }];
    f.queries["ticket-lots-all"] = [{ id: "lot", zone_id: "zone", iva_rate: 0 }];
    f.queries["ticket-sales-all"] = [{ lot_id: "lot", sale_date: "2026-02-15", quantity: 1, total_value: 100 }];
    f.queries["event-partners-all"] = [{ event_id: event.id, percentage: 25, expense_includes_iva: false }];
    render(<ReportDREEmpresarial />, { wrapper: routerWrapper("/reports") });
    for (const name of ["Caixa", "Competência"]) {
      fireEvent.click(screen.getByRole("radio", { name }));
      expectRow("Receitas de Eventos", monthly({ 2: 100 }));
      expectRow("(-) Custos Directos de Eventos", monthly({ 6: -20 }));
      expectRow("(-) Distribuição Sócios", monthly({ 6: -20 }));
    }
  });
});
