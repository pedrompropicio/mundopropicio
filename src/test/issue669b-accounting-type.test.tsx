import type { PropsWithChildren } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportDREEmpresarial from "@/components/ReportDREEmpresarial";
import { resolveCompanyLocale } from "@/lib/company-locale";
import { accountingTypeOf, useReportAccountingType, type AccountingType } from "@/lib/report-accounting-type";
import { useReportRegime, type Regime } from "@/lib/report-regime";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  companyId: "company" as string | null,
  from: vi.fn(), select: vi.fn(), eq: vi.fn(),
}));
vi.mock("@tanstack/react-query", async importOriginal => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: (options: { queryKey: unknown[] }) =>
    options.queryKey[0] === "dre-emp-non-accounting-accounts"
      ? actual.useQuery(options as Parameters<typeof actual.useQuery>[0])
      : { data: f.queries[String(options.queryKey[0])], isLoading: false, isError: false },
  };
});
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => ({
  ...resolveCompanyLocale({ country: "PT", currency: "EUR" }),
  companyId: f.companyId, isLoading: false, isError: false,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from } }));

const event = { id: "event", date: "2026-06-15", status: "active", event_nature: "producao_propria" };
const base = {
  event_id: event.id, type: "income", category_id: "event-income", amount: 10, iva_rate: 0,
  account_id: "contabil", date: "2026-02-05", due_date: "2026-03-10", payment_date: null, status: "approved",
};
const transactions = [
  { ...base, id: "contabil", amount: 100 },
  { ...base, id: "gerencial", account_id: "gerencial", amount: 60, date: "2026-04-05", due_date: "2026-05-10" },
  { ...base, id: "sem-conta", account_id: null, amount: 20 },
  { ...base, id: "despesa-contabil", type: "expense", category_id: "event-expense", amount: 12 },
  { ...base, id: "despesa-gerencial", account_id: "gerencial", type: "expense", category_id: "event-expense", amount: 15 },
  { ...base, id: "estrutura-contabil", event_id: null, type: "expense", category_id: "corp-expense", amount: 10 },
  { ...base, id: "estrutura-gerencial", event_id: null, account_id: "gerencial", type: "expense", category_id: "corp-expense", amount: 8 },
  { ...base, id: "financeiro-contabil", event_id: null, category_id: "corp-income", amount: 30 },
  { ...base, id: "financeiro-gerencial", event_id: null, account_id: "gerencial", category_id: "corp-income", amount: 40 },
  { ...base, id: "entre-anos-contabil", amount: 80, date: "2025-12-15", due_date: "2025-12-31", payment_date: "2026-01-10", status: "paid" },
  { ...base, id: "entre-anos-gerencial", account_id: "gerencial", amount: 50, date: "2025-12-15", due_date: "2025-12-31", payment_date: "2026-01-10", status: "paid" },
  { ...base, id: "ano-anterior-contabil", amount: 40, date: "2025-11-05", due_date: "2025-11-10" },
  { ...base, id: "ano-anterior-gerencial", account_id: "gerencial", amount: 30, date: "2025-11-05", due_date: "2025-11-10" },
];

const clients: QueryClient[] = [];
const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
function routerWrapper(entry: string) {
  return ({ children }: PropsWithChildren) => <MemoryRouter initialEntries={[entry]} future={future}>{children}</MemoryRouter>;
}
function reportWrapper(entry = "/reports") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]} future={future}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

let setItem: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  setItem = vi.spyOn(Storage.prototype, "setItem");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#669b: rede proibida"); }));
  f.companyId = "company";
  f.queries = {
    events: [event], "transactions-approved": transactions,
    "account-categories": [
      { id: "event-income", code: "1.2.01", name: "Receita sintética", type: "income" },
      { id: "event-expense", code: "2.1.01", name: "Despesa sintética", type: "expense" },
      { id: "corp-expense", code: "10.3.01", name: "Estrutura sintética", type: "expense" },
      { id: "corp-income", code: "10.1.01", name: "Financiamento sintético", type: "income" },
    ],
  };
  f.from.mockReset().mockImplementation((table: string) => {
    if (table !== "financial_accounts") throw new Error(`#669b: tabela proibida ${table}`);
    return { select: f.select };
  });
  f.select.mockReset().mockImplementation(() => ({ eq: f.eq }));
  f.eq.mockReset().mockImplementation((column: string) => column === "company_id"
    ? { eq: f.eq } : Promise.resolve({ data: [{ id: "gerencial" }], error: null }));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  expect(setItem).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("#669b C1 — marca de conta da #235", () => {
  it.each([
    [{ account_id: "gerencial" }, "gerencial"],
    [{ account_id: "contabil" }, "contabil"],
    [{ account_id: null }, "contabil"],
    [{}, "contabil"],
  ] as const)("classifica %j como %s sem mutação", (tx, expected) => {
    const ids = Object.freeze(["gerencial"]);
    const bytes = JSON.stringify(tx);
    expect(accountingTypeOf(Object.freeze(tx), ids)).toBe(expected);
    expect(accountingTypeOf(tx, [])).toBe("contabil");
    expect(JSON.stringify(tx)).toBe(bytes);
    expect(ids).toEqual(["gerencial"]);
  });
});

describe("#669b C3 — tipo só no URL", () => {
  it.each([
    ["/reports", "all"], ["/reports?tipo=all", "all"], ["/reports?tipo=invalido", "all"],
    ["/reports?tipo=contabil", "contabil"], ["/reports?tipo=gerencial", "gerencial"],
  ])("%s resolve %s", (entry, expected) => {
    const { result } = renderHook(useReportAccountingType, { wrapper: routerWrapper(entry) });
    expect(result.current.accountingType).toBe(expected);
  });

  it("Todas remove tipo, preserva regime/outros parâmetros e substitui o histórico", () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <MemoryRouter initialEntries={["/anterior", "/reports?tipo=gerencial&regime=competencia&tab=empresarial"]} initialIndex={1} future={future}>
        {children}
      </MemoryRouter>
    );
    const { result } = renderHook(() => ({ ...useReportAccountingType(), ...useReportRegime(), location: useLocation(), navigate: useNavigate() }), { wrapper });
    act(() => result.current.setAccountingType("all"));
    expect(result.current.accountingType).toBe("all");
    expect(result.current.location.search).toBe("?regime=competencia&tab=empresarial");
    act(() => result.current.setAccountingType("contabil"));
    act(() => result.current.setRegime("caixa"));
    expect(result.current.location.search).toBe("?tab=empresarial&tipo=contabil");
    act(() => result.current.navigate(-1));
    expect(result.current.location.pathname).toBe("/anterior");
    act(() => result.current.navigate(1));
    expect(result.current.accountingType).toBe("contabil");
  });

  it("fora do Router devolve all e o setter é inerte", () => {
    const { result } = renderHook(useReportAccountingType);
    act(() => result.current.setAccountingType("gerencial"));
    expect(result.current.accountingType).toBe("all");
  });
});

const labels: Record<AccountingType, string> = { all: "Todas", contabil: "Só contábeis", gerencial: "Só gerenciais" };
function chooseType(type: AccountingType) {
  fireEvent.click(screen.getByRole("radio", { name: labels[type] }));
}
function reportRows() {
  return Object.fromEntries(screen.getAllByRole("row")
    .filter(row => row.children.length === 14 && row.firstElementChild?.tagName === "TD")
    .map(row => [row.firstElementChild!.textContent!, within(row).getAllByRole("cell").slice(1).map(cell => {
      const text = cell.textContent!;
      return text === "—" ? 0 : Number(text.replace(/[^\d,-]/g, "").replace(",", "."));
    })]));
}
async function openReport(entry = "/reports", comparisons = true) {
  const view = render(<ReportDREEmpresarial />, { wrapper: reportWrapper(entry) });
  await waitFor(() => expect(screen.getByRole("radio", { name: "Só gerenciais" })).toBeEnabled());
  if (comparisons) {
    fireEvent.click(screen.getByRole("radio", { name: /Transações \(comparação\)/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Só transações" }));
  }
  return view;
}

describe("#669b C2 — DRE Empresarial", () => {
  it.each(["caixa", "competencia"] as Regime[])("%s: gerenciais + contábeis = Todas por mês/ano em 2025 e 2026", async regime => {
    const bytes = JSON.stringify(transactions);
    await openReport(`/reports?regime=${regime}`);
    for (const year of [2026, 2025]) {
      if (year === 2025) {
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
        fireEvent.click(screen.getByRole("option", { name: "2025" }));
      }
      chooseType("all");
      const all = reportRows();
      chooseType("gerencial");
      const gerencial = reportRows();
      chooseType("contabil");
      const contabil = reportRows();
      expect(Object.keys(gerencial)).toEqual(Object.keys(all));
      expect(Object.keys(contabil)).toEqual(Object.keys(all));
      for (const label of Object.keys(all)) {
        expect(gerencial[label].map((amount, i) => amount + contabil[label][i])).toEqual(all[label]);
        for (const rows of [all, gerencial, contabil]) {
          expect(rows[label].slice(0, 12).reduce((sum, amount) => sum + amount, 0)).toBe(rows[label][12]);
        }
      }
      expect(all["Receitas de Eventos"][12]).toBe(year === 2025 ? (regime === "caixa" ? 70 : 200) : (regime === "caixa" ? 310 : 180));
      expect(contabil["Receitas de Eventos"][12]).toBe(year === 2025 ? (regime === "caixa" ? 40 : 120) : (regime === "caixa" ? 200 : 120));
    }
    expect(f.from).toHaveBeenCalledWith("financial_accounts");
    expect(f.select).toHaveBeenCalledWith("id");
    expect(f.eq.mock.calls).toEqual([["company_id", "company"], ["is_accounting", false]]);
    expect(JSON.stringify(transactions)).toBe(bytes);
  });

  it("URL gerencial aplica o corte logo que a query fica disponível", async () => {
    await openReport("/reports?tipo=gerencial&regime=competencia");
    expect(screen.getByRole("radio", { name: "Só gerenciais" })).toBeChecked();
    expect(reportRows()["Receitas de Eventos"][12]).toBe(60);
    chooseType("all");
    expect(reportRows()["Receitas de Eventos"][12]).toBe(180);
  });

  it("erro inicial avisa, desativa o tipo e mostra Todas mesmo com tipo no URL", async () => {
    f.eq.mockImplementation((column: string) => column === "company_id" ? { eq: f.eq }
      : Promise.resolve({ data: null, error: new Error("leitura recusada") }));
    render(<ReportDREEmpresarial />, { wrapper: reportWrapper("/reports?tipo=gerencial") });
    fireEvent.click(screen.getByRole("radio", { name: /Transações \(comparação\)/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Só transações" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/tipo indisponível.*Todas/i);
    for (const name of Object.values(labels)) expect(screen.getByRole("radio", { name })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Todas" })).toBeChecked();
    expect(reportRows()["Receitas de Eventos"][12]).toBe(310);
    expect(reportRows()["RESULTADO DA EMPRESA"][12]).toBe(265);
  });

  it("erro de refetch invalida também uma lista anterior em cache e repõe Todas", async () => {
    await openReport("/reports?tipo=gerencial");
    expect(reportRows()["Receitas de Eventos"][12]).toBe(110);
    f.eq.mockImplementation((column: string) => column === "company_id" ? { eq: f.eq }
      : Promise.resolve({ data: null, error: new Error("refetch recusado") }));
    await act(async () => { await clients[0].invalidateQueries({ queryKey: ["dre-emp-non-accounting-accounts"] }); });
    expect(await screen.findByRole("alert")).toHaveTextContent(/tipo indisponível.*Todas/i);
    expect(screen.getByRole("radio", { name: "Só gerenciais" })).toBeDisabled();
    expect(reportRows()["Receitas de Eventos"][12]).toBe(310);
  });

  it("sem empresa não consulta contas; a troca de empresa não reutiliza ids da anterior", async () => {
    f.companyId = null;
    const view = render(<ReportDREEmpresarial />, { wrapper: reportWrapper("/reports?tipo=gerencial") });
    expect(f.from).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Só gerenciais" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Todas" })).toBeChecked();
    f.companyId = "company";
    view.rerender(<ReportDREEmpresarial />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Só gerenciais" })).toBeEnabled());
    f.eq.mockImplementation((column: string) => column === "company_id" ? { eq: f.eq }
      : Promise.resolve({ data: [], error: null }));
    f.companyId = "other-company";
    view.rerender(<ReportDREEmpresarial />);
    expect(screen.getByRole("radio", { name: "Só gerenciais" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Todas" })).toBeChecked();
    expect(reportRows()["Receitas de Eventos"][12]).toBe(310);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Só gerenciais" })).toBeEnabled());
    expect(f.eq).toHaveBeenCalledWith("company_id", "other-company");
    expect(reportRows()["Receitas de Eventos"][12]).toBe(0);
  });

  it.each(["caixa", "competencia"] as Regime[])("%s: BP, bilheteira e distribuição preservam bases e datas nos três tipos", async regime => {
    f.queries["dre-emp-forecasts-expense"] = [{ id: "bp", event_id: event.id, type: "expense", status: "approved", category_id: "event-expense", amount: 40, iva_rate: 0 }];
    f.queries["ticket-zones-all"] = [{ id: "zone", event_id: event.id }];
    f.queries["ticket-lots-all"] = [{ id: "lot", zone_id: "zone", iva_rate: 0 }];
    f.queries["ticket-sales-all"] = [{ lot_id: "lot", sale_date: "2026-02-15", quantity: 1, total_value: 100 }];
    f.queries["event-partners-all"] = [{ event_id: event.id, percentage: 25, expense_includes_iva: false }];
    const view = await openReport(`/reports?regime=${regime}`, false);
    const all = reportRows();
    for (const type of ["all", "contabil", "gerencial"] as AccountingType[]) {
      chooseType(type);
      const rows = reportRows();
      expect(rows["(-) Custos Directos de Eventos"]).toEqual(all["(-) Custos Directos de Eventos"]);
      expect(rows["(-) Custos Directos de Eventos"][5]).toBe(-40);
      expect(rows["(-) Distribuição Sócios"]).toEqual(all["(-) Distribuição Sócios"]);
      expect(rows["(-) Distribuição Sócios"][5]).toBe(regime === "caixa" ? -92.5 : -60);
      // Vendas sintéticas (100) ficam em fevereiro; competência soma receita contábil (120).
      expect(rows["Receitas de Eventos"][1]).toBe(regime === "competencia" && type !== "gerencial" ? 220 : 100);
    }
    // O BP realizado usa as mesmas transações completas, mesmo com o filtro activo.
    f.queries.events = [{ ...event, cost_expense_source: "realized" }];
    view.rerender(<ReportDREEmpresarial />);
    for (const type of ["all", "contabil", "gerencial"] as AccountingType[]) {
      chooseType(type);
      expect(reportRows()["(-) Custos Directos de Eventos"][5]).toBe(-27);
    }
    // A distribuição na comparação também usa a base original, fora do corte de tipo.
    fireEvent.click(screen.getByRole("radio", { name: /Transações \(comparação\)/ }));
    const distribution = reportRows()["(-) Distribuição Sócios"];
    chooseType("contabil");
    expect(reportRows()["(-) Distribuição Sócios"]).toEqual(distribution);
  });
});
