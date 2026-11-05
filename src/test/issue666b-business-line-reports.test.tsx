import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { BusinessLineFilter } from "@/components/BusinessLineFilter";
import ReportDRE from "@/components/ReportDRE";
import ReportDREBrasil from "@/components/ReportDREBrasil";
import ReportDREEmpresarial from "@/components/ReportDREEmpresarial";
import ReportProfitability from "@/components/ReportProfitability";
import { businessLineLabel, filterEventsByBusinessLine } from "@/lib/business-line-filter";
import { resolveCompanyLocale } from "@/lib/company-locale";

const f = vi.hoisted(() => ({ queries: {} as Record<string, any>, keys: [] as unknown[][],
  queryFns: {} as Record<string, () => Promise<unknown>>, from: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey, queryFn }: any) => {
  f.keys.push(queryKey); f.queryFns[queryKey[0]] = queryFn;
  return { data: f.queries[queryKey[0]], isLoading: false, isError: false };
} }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: "company" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => ({
  ...resolveCompanyLocale({ country: "PT", currency: "EUR" }), companyId: "company",
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from } }));
vi.mock("@/components/ui/chart", () => ({ ChartContainer: () => null, ChartTooltip: () => null, ChartTooltipContent: () => null }));
vi.mock("recharts", () => ({ BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, ResponsiveContainer: () => null, Cell: () => null }));

const lines = [
  { id: "a", name: "Social Eventos", company_id: "company", sort_order: 0, is_active: true },
  { id: "b", name: "Social Esporte", company_id: "company", sort_order: 1, is_active: false },
];
const event = (id: string, name: string, line: string | null, parent: string | null = null) => ({
  id, name, business_line_id: line, parent_event_id: parent, date: "2026-06-15", status: "completed",
  event_nature: "producao_propria", partner_calc_basis: "net_result_gross_expenses", venue_id: "venue",
});
const events = [event("master", "Master", "a"), event("c1", "Cidade 1", "a", "master"),
  event("c2", "Cidade 2", "a", "master"), event("b", "Evento Esporte", "b"), event("none", "Evento sem linha", null)];
const tx = (id: string, eventId: string | null, type: string, amount: number, category = type, iva = 0) => ({
  id, event_id: eventId, type, amount, category_id: category, iva_rate: iva, date: "2026-06-15",
  due_date: "2026-06-15", status: "approved", version_id: null,
});
const income = [tx("im", "master", "income", 200), tx("i1", "c1", "income", 50),
  tx("i2", "c2", "income", 50), tx("ib", "b", "income", 200), tx("in", "none", "income", 100)];
const costs = [tx("fm", "master", "expense", 60, "financial", 10), tx("fb", "b", "expense", 80), tx("fn", "none", "expense", 20)];
const categories = [
  { id: "income", code: "1.2.01", name: "Receita", type: "income" },
  { id: "expense", code: "2.1.01", name: "Custo", type: "expense" },
  { id: "financial", code: "2.2.01", name: "Juros", type: "expense", ebitda_class: "financeiro" },
  { id: "corp", code: "10.3.01", name: "Estrutura", type: "expense" },
  { id: "corp-income", code: "10.1.01", name: "Financiamento", type: "income" },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#666b: rede proibida"); }));
  f.from.mockReset().mockImplementation(() => { throw new Error("#666b: serviço remoto proibido"); });
  f.keys = []; f.queryFns = {};
  f.queries = {
    "business-lines": lines, events,
    transactions: [...income, ...costs, tx("common", null, "income", 999, "corp-income")],
    "transactions-approved": [...income, ...costs, tx("common", null, "income", 999, "corp-income")], "account-categories": categories,
    "dre-forecasts-expense": costs, "dre-emp-forecasts-expense": costs,
    "dre-emp-non-accounting-accounts": [], "profitability-events": events, "profitability-transactions": [...income, ...costs],
    "profitability-forecasts-expense": costs, "profitability-venues": [{ id: "venue", name: "Sala" }],
    "profitability-cache": events.map(e => ({ event_id: e.id, artist_name: "Artista" })),
  };
});
afterEach(() => { cleanup(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const names = ["Social Eventos", "Social Esporte (inactiva)", "Sem linha"];
function chooseLine(name: string) {
  const trigger = screen.getByRole("button", { name: /^Linha de negócio:/ });
  fireEvent.click(trigger);
  for (const option of names) {
    const box = screen.getByRole("checkbox", { name: option });
    if ((box.getAttribute("aria-checked") === "true") !== (option === name)) fireEvent.click(box);
  }
  fireEvent.click(trigger);
}
function clearLine() {
  const trigger = screen.getByRole("button", { name: /^Linha de negócio:/ });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "Todas" }));
  fireEvent.click(trigger);
}
function money(text: string) {
  return text === "—" ? 0 : Number(text.replace(/[^\d,-]/g, "").replace(",", "."));
}
function amounts(row: HTMLElement) { return within(row).getAllByRole("cell").slice(1).map(cell => money(cell.textContent!)); }
function linePanel() { return within(screen.getByRole("region", { name: "Total por linha de negócio" })); }
function lineRow(label: string) { return linePanel().getByRole("row", { name: new RegExp(`^${label} `) }); }

describe("#666b C1 — helper puro e filtro", () => {
  it("vazio e todas preservam array; uma linha e Sem linha não alargam o conjunto", () => {
    const source = events.map(e => Object.freeze({ ...e }));
    const bytes = JSON.stringify(source);
    expect(filterEventsByBusinessLine(source, [])).toBe(source);
    expect(filterEventsByBusinessLine(source, ["a", "b", "__sem_linha__"])).toBe(source);
    expect(filterEventsByBusinessLine(source, ["a"]).map(e => e.id)).toEqual(["master", "c1", "c2"]);
    expect(filterEventsByBusinessLine(source, ["b"]).map(e => e.id)).toEqual(["b"]);
    expect(filterEventsByBusinessLine(source, ["__sem_linha__"]).map(e => e.id)).toEqual(["none"]);
    expect(filterEventsByBusinessLine([{ id: "legacy" }], ["a"])).toEqual([]);
    expect(filterEventsByBusinessLine([{ id: "legacy" }], ["__sem_linha__"])).toEqual([{ id: "legacy" }]);
    expect(JSON.stringify(source)).toBe(bytes);
    expect(businessLineLabel(null, lines)).toBe("Sem linha");
    expect(businessLineLabel("a", lines)).toBe("Social Eventos");
    expect(businessLineLabel("missing", lines)).toBe("Linha indisponível");
  });
  it("consulta catálogo completo, marca inactivas e normaliza todas para []", () => {
    function Harness() {
      const [value, setValue] = useState<string[]>(["a"]);
      return <><BusinessLineFilter value={value} onChange={setValue} /><output>{JSON.stringify(value)}</output></>;
    }
    render(<Harness />);
    expect(f.keys).toContainEqual(["business-lines", "company", "user", false]);
    fireEvent.click(screen.getByRole("button", { name: "Linha de negócio: Social Eventos" }));
    fireEvent.click(screen.getByRole("checkbox", { name: names[1] }));
    fireEvent.click(screen.getByRole("checkbox", { name: names[2] }));
    expect(screen.getByRole("status")).toHaveTextContent("[]");
    expect(screen.getByRole("button", { name: "Linha de negócio: Todas" })).toBeInTheDocument();
  });
});

describe("#666b C2 — DRE e DRE Brasil", () => {
  it.each([["DRE", ReportDRE, 60, 160, 440], ["Brasil", ReportDREBrasil, 66, 166, 434]] as const)(
    "%s agrega eventSummaries, reconcilia globais e conserva Master ÷2", (_name, Report, lineCost, cost, result) => {
      render(<Report />);
      expect(amounts(lineRow("Social Eventos"))).toEqual([300, lineCost, 300, 300 - lineCost]);
      expect(amounts(lineRow("Social Esporte"))).toEqual([200, 80, 120, 120]);
      expect(amounts(lineRow("Sem linha"))).toEqual([100, 20, 80, 80]);
      expect(amounts(lineRow("Total"))).toEqual([600, cost, 500, result]);
      expect(money(screen.getByText("Total Receitas").nextElementSibling!.textContent!)).toBe(600);
      expect(money(screen.getByText("Total Despesas").nextElementSibling!.textContent!)).toBe(cost);
      const rows = ["Social Eventos", "Social Esporte", "Sem linha"].map(name => amounts(lineRow(name)));
      expect(rows[0].map((_, i) => rows.reduce((sum, row) => sum + row[i], 0))).toEqual(amounts(lineRow("Total")));
      const city = screen.getByRole("button", { name: /^Cidade 1 / });
      const before = city.textContent;
      chooseLine("Social Eventos");
      expect(screen.queryByRole("button", { name: /^Evento Esporte / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Evento sem linha / })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Cidade 1 / }).textContent).toBe(before);
      expect(amounts(lineRow("Total"))).toEqual([300, lineCost, 300, 300 - lineCost]);
      clearLine();
      expect(amounts(lineRow("Total"))).toEqual([600, cost, 500, result]);
      chooseLine("Sem linha");
      expect(amounts(lineRow("Total"))).toEqual([100, 20, 80, 80]);
    },
  );
  it("Brasil conserva o filtro disponível numa linha sem eventos elegíveis", () => {
    f.queries["business-lines"] = [...lines, { ...lines[0], id: "empty", name: "Vazia" }];
    render(<ReportDREBrasil />);
    const trigger = screen.getByRole("button", { name: /^Linha de negócio:/ });
    fireEvent.click(trigger);
    for (const name of names) fireEvent.click(screen.getByRole("checkbox", { name }));
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Linha de negócio: Vazia" })).toBeInTheDocument();
    clearLine();
    expect(amounts(lineRow("Total"))[0]).toBe(600);
  });
});

function monthly(label: string) { return amounts(screen.getByRole("row", { name: new RegExp(`^${label} `) })); }
describe("#666b C3 — Empresarial", () => {
  it.each(["bp", "transactions"])("%s: filtra receitas, custos, bilheteira e sócios; Comuns mantém-se", source => {
    f.queries["transactions-approved"] = [...income, ...costs, tx("corp", null, "expense", 40, "corp"),
      tx("fin", null, "income", 70, "corp-income")];
    f.queries["ticket-zones-all"] = [{ id: "za", event_id: "c1" }, { id: "zb", event_id: "b" }];
    f.queries["ticket-lots-all"] = [{ id: "la", zone_id: "za", iva_rate: 10 }, { id: "lb", zone_id: "zb", iva_rate: 10 }];
    f.queries["ticket-sales-all"] = [{ lot_id: "la", sale_date: "2026-06-15", total_value: 110 },
      { lot_id: "lb", sale_date: "2026-06-15", total_value: 220 }];
    f.queries["event-partners-all"] = [{ event_id: "master", percentage: 25 }, { event_id: "b", percentage: 50 }];
    render(<ReportDREEmpresarial />);
    if (source === "transactions") fireEvent.click(screen.getByRole("radio", { name: /Transações \(comparação\)/ }));
    const baseline = monthly("Receitas de Eventos");
    expect(baseline.at(-1)).toBe(900);
    expect(monthly("\\(-\\) Custos Directos de Eventos").at(-1)).toBe(-160);
    const common = monthly("= Total Custos Corporativos");
    const financial = monthly("= Total Movimentos Financeiros");
    chooseLine("Social Eventos");
    expect(monthly("Receitas de Eventos").at(-1)).toBe(400);
    expect(monthly("\\(-\\) Custos Directos de Eventos").at(-1)).toBe(-60);
    expect(monthly("\\(-\\) Distribuição Sócios").at(-1)).toBe(-33.5);
    expect(screen.getByText("Comuns (sem evento)")).toBeInTheDocument();
    expect(monthly("= Total Custos Corporativos")).toEqual(common);
    expect(monthly("= Total Movimentos Financeiros")).toEqual(financial);
    clearLine();
    expect(monthly("Receitas de Eventos")).toEqual(baseline);
  }, 15000);
  it("preserva o alcance legado do filtro de natureza na receita e no custo transaccional", () => {
    render(<ReportDREEmpresarial />);
    fireEvent.click(screen.getByRole("radio", { name: /Transações \(comparação\)/ }));
    const before = monthly("Receitas de Eventos");
    fireEvent.click(screen.getByRole("button", { name: /^Natureza do evento:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Produção própria" }));
    expect(monthly("Receitas de Eventos")).toEqual(before);
    expect(monthly("\\(-\\) Custos Directos de Eventos").at(-1)).toBe(-160);
  });
});

describe("#666b C4 — Rentabilidade", () => {
  it("selecciona business_line_id na query de eventos concluídos", async () => {
    render(<ReportProfitability />);
    const returns = vi.fn().mockResolvedValue({ data: events, error: null });
    const inFilter = vi.fn().mockReturnValue({ returns });
    const select = vi.fn().mockReturnValue({ in: inFilter });
    f.from.mockReturnValue({ select });
    await expect(f.queryFns["profitability-events"]()).resolves.toEqual(events);
    expect(f.from).toHaveBeenCalledExactlyOnceWith("events");
    expect(select).toHaveBeenCalledExactlyOnceWith("id, name, status, venue_id, parent_event_id, event_nature, cost_expense_source, business_line_id");
    expect(inFilter).toHaveBeenCalledExactlyOnceWith("status", ["completed"]);
  });
  it("os três separadores somam os mesmos valores e o filtro restringe a linha", () => {
    render(<ReportProfitability />);
    const sum = () => screen.getAllByRole("row").slice(1).map(row => amounts(row)).reduce((a, row) =>
      a.map((v, i) => v + row[i]), [0, 0, 0, 0]);
    const expected = sum();
    expect(expected).toEqual([5, 600, 160, 440]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Por Venue" }), { button: 0, ctrlKey: false });
    expect(sum()).toEqual(expected);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Por linha" }), { button: 0, ctrlKey: false });
    expect(sum()).toEqual(expected);
    expect(screen.getByRole("row", { name: /^Social Eventos / })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /^Sem linha / })).toBeInTheDocument();
    chooseLine("Social Eventos");
    expect(sum()).toEqual([3, 300, 60, 240]);
    expect(screen.queryByRole("row", { name: /^Social Esporte / })).not.toBeInTheDocument();
  });
});
