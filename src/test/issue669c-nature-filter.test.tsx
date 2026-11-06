import type { PropsWithChildren } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportDREEmpresarial from "@/components/ReportDREEmpresarial";
import { resolveCompanyLocale } from "@/lib/company-locale";
import { EVENT_NATURES } from "@/lib/event-nature";

const f = vi.hoisted(() => ({ queries: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: f.queries[String(queryKey[0])], isLoading: false, isError: false,
  }),
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: "company" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => ({
  ...resolveCompanyLocale({ country: "PT", currency: "EUR" }),
  companyId: "company", isLoading: false, isError: false,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#669c: serviço remoto proibido"); },
}) }));

// Duas naturezas cruzadas com duas linhas, um evento legado e um id ausente
// do catálogo: sem filtros, esse id continua a contribuir para as receitas.
const sources = [
  { id: "own-a", nature: "producao_propria", line: "a", factor: 1 },
  { id: "own-b", nature: "producao_propria", line: "b", factor: 2 },
  { id: "agent-a", nature: "intermediacao", line: "a", factor: 4 },
  { id: "agent-b", nature: "intermediacao", line: "b", factor: 8 },
  { id: "legacy", nature: null, line: null, factor: 0.5 },
  { id: "absent", nature: null, line: null, factor: 0.7 },
];
const events = sources.slice(0, -1).map(s => ({
  id: s.id, name: s.id, event_nature: s.nature, business_line_id: s.line,
  date: "2026-06-15", status: "active", cost_expense_source: "committed", partner_calc_basis: "net_result",
}));
const tx = (id: string, eventId: string | null, type: string, category: string, amount: number,
  accountId = "contabil", date = "2026-02-10", dueDate = "2026-03-10") => ({
  id, event_id: eventId, type, category_id: category, amount, account_id: accountId,
  date, due_date: dueDate, payment_date: null, status: "approved", iva_rate: 0,
});
const transactions = sources.flatMap(s => [
  tx(`${s.id}-income-c`, s.id, "income", "income", 100 * s.factor),
  tx(`${s.id}-income-g`, s.id, "income", "income", 30 * s.factor, "gerencial", "2026-04-10", "2026-05-10"),
  tx(`${s.id}-tickets`, s.id, "income", "tickets", 80 * s.factor, "contabil", "2026-09-10", "2026-10-10"),
  tx(`${s.id}-cost-c`, s.id, "expense", "expense", 12 * s.factor),
  tx(`${s.id}-cost-g`, s.id, "expense", "expense", 8 * s.factor, "gerencial", "2026-04-10", "2026-05-10"),
]).concat([
  tx("corporate", null, "expense", "corp-expense", 40),
  tx("financial", null, "income", "corp-income", 60),
]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#669c: rede proibida"); }));
  f.queries = {
    events, "transactions-approved": transactions,
    "business-lines": [
      { id: "a", name: "Linha A", is_active: true },
      { id: "b", name: "Linha B", is_active: true },
    ],
    "dre-emp-non-accounting-accounts": ["gerencial"],
    "account-categories": [
      { id: "income", code: "1.2.01", name: "Receita", type: "income" },
      { id: "tickets", code: "1.1.01", name: "Bilheteira", type: "income" },
      { id: "expense", code: "2.1.01", name: "Custo", type: "expense" },
      { id: "corp-expense", code: "10.3.01", name: "Estrutura", type: "expense" },
      { id: "corp-income", code: "10.1.01", name: "Financiamento", type: "income" },
    ],
    "dre-emp-forecasts-expense": sources.slice(0, -1).map(s => ({
      id: `${s.id}-bp`, event_id: s.id, type: "expense", category_id: "expense",
      amount: 40 * s.factor, iva_rate: 0, status: "approved", version_id: null,
    })),
    "event-partners-all": events.map(e => ({ event_id: e.id, percentage: 25, expense_includes_iva: false })),
    "ticket-zones-all": sources.map(s => ({ id: `${s.id}-zone`, event_id: s.id })),
    "ticket-lots-all": sources.map(s => ({ id: `${s.id}-lot`, zone_id: `${s.id}-zone`, iva_rate: 10 })),
    "ticket-sales-all": sources.map(s => ({
      lot_id: `${s.id}-lot`, sale_date: "2026-01-15", total_value: 110 * s.factor,
    })),
  };
});
afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function openReport(entry = "/reports") {
  const wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {children}
    </MemoryRouter>
  );
  return render(<ReportDREEmpresarial />, { wrapper });
}
function rows() {
  return Object.fromEntries(screen.getAllByRole("row")
    .filter(row => row.children.length === 14 && row.firstElementChild?.tagName === "TD")
    .map(row => [row.firstElementChild!.textContent!, within(row).getAllByRole("cell").slice(1).map(cell => {
      const value = cell.textContent!;
      return value === "—" ? 0 : Number(value.replace(/[^\d,-]/g, "").replace(",", "."));
    })]));
}
function monthly(entries: Record<number, number>) {
  const values = Array.from({ length: 12 }, (_, i) => entries[i + 1] ?? 0);
  return [...values, values.reduce((sum, value) => sum + value, 0)];
}
function selectFilter(kind: "Natureza do evento" | "Linha de negócio", selected: string[]) {
  const trigger = screen.getByRole("button", { name: new RegExp(`^${kind}:`) });
  fireEvent.click(trigger);
  const options = kind === "Natureza do evento"
    ? EVENT_NATURES.map(n => n.label) : ["Linha A", "Linha B", "Sem linha"];
  // Seleccionar primeiro evita que a última desmarcação passe por [] (= todas).
  const ordered = [...options.filter(name => selected.includes(name)), ...options.filter(name => !selected.includes(name))];
  for (const name of ordered) {
    const checkbox = screen.getByRole("checkbox", { name });
    if ((checkbox.getAttribute("aria-checked") === "true") !== selected.includes(name)) fireEvent.click(checkbox);
  }
  fireEvent.click(trigger);
}
function clearFilter(kind: "Natureza do evento" | "Linha de negócio") {
  const trigger = screen.getByRole("button", { name: new RegExp(`^${kind}:`) });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "Todas" }));
  fireEvent.click(trigger);
}
function transactionTickets() { fireEvent.click(screen.getByRole("radio", { name: "Só transações" })); }

// Valores fixados e executados nesta mesma fixture antes da alteração #669c.
const unfilteredBaseline = {
  ticket_sales: {
    "Receitas de Eventos": monthly({ 1: 1620, 3: 1620, 5: 486 }),
    "(-) Custos Directos de Eventos": monthly({ 6: -620 }),
    "= Resultado Líquido Eventos": monthly({ 1: 1620, 3: 1620, 5: 486, 6: -620 }),
    "(-) Distribuição Sócios": monthly({ 6: -736.25 }),
    "= Margem da Empresa (Eventos)": monthly({ 1: 1620, 3: 1620, 5: 486, 6: -1356.25 }),
    "= Total Custos Corporativos": monthly({ 3: -40 }),
    "RESULTADO DA EMPRESA": monthly({ 1: 1620, 3: 1580, 5: 486, 6: -1356.25 }),
    "= Total Movimentos Financeiros": monthly({ 3: 60 }),
    "POSIÇÃO FINANCEIRA": monthly({ 1: 1620, 3: 1640, 5: 486, 6: -1356.25 }),
  },
  transactions: {
    "Receitas de Eventos": monthly({ 3: 1620, 5: 486, 10: 1296 }),
    "(-) Custos Directos de Eventos": monthly({ 6: -620 }),
    "= Resultado Líquido Eventos": monthly({ 3: 1620, 5: 486, 6: -620, 10: 1296 }),
    "(-) Distribuição Sócios": monthly({ 6: -658.75 }),
    "= Margem da Empresa (Eventos)": monthly({ 3: 1620, 5: 486, 6: -1278.75, 10: 1296 }),
    "= Total Custos Corporativos": monthly({ 3: -40 }),
    "RESULTADO DA EMPRESA": monthly({ 3: 1580, 5: 486, 6: -1278.75, 10: 1296 }),
    "= Total Movimentos Financeiros": monthly({ 3: 60 }),
    "POSIÇÃO FINANCEIRA": monthly({ 3: 1640, 5: 486, 6: -1278.75, 10: 1296 }),
  },
};

describe("#669c — natureza na secção de eventos da DRE Empresarial", () => {
  it.each(["ticket_sales", "transactions"] as const)("sem filtros: %s mantém os totais mensais e anuais anteriores", source => {
    openReport();
    if (source === "transactions") transactionTickets();
    expect(rows()).toMatchObject(unfilteredBaseline[source]);
  });

  it.each([
    ["Produção própria", 3], ["Intermediação", 12],
  ] as const)("%s: receita transaccional, bilheteira, BP e parceiros usam os mesmos eventos", (nature, factor) => {
    const original = JSON.stringify(f.queries);
    openReport();
    const before = rows();
    selectFilter("Natureza do evento", [nature]);
    const filtered = rows();
    // A bilheteira ocupa janeiro; a receita transaccional ocupa março e maio.
    expect(filtered["Receitas de Eventos"]).toEqual(monthly({ 1: 100 * factor, 3: 100 * factor, 5: 30 * factor }));
    expect(filtered["(-) Custos Directos de Eventos"]).toEqual(monthly({ 6: -40 * factor }));
    expect(filtered["(-) Distribuição Sócios"]).toEqual(monthly({ 6: -47.5 * factor }));
    expect(filtered["= Total Custos Corporativos"]).toEqual(before["= Total Custos Corporativos"]);
    expect(filtered["= Total Movimentos Financeiros"]).toEqual(before["= Total Movimentos Financeiros"]);
    clearFilter("Natureza do evento");
    expect(rows()).toEqual(before);
    expect(JSON.stringify(f.queries)).toBe(original);
  });

  it("natureza + linha é a intersecção, admite vários valores e não alarga um conjunto vazio", () => {
    openReport();
    const before = rows();
    selectFilter("Linha de negócio", ["Linha A"]);
    expect(rows()["Receitas de Eventos"]).toEqual(monthly({ 1: 500, 3: 500, 5: 150 }));
    selectFilter("Natureza do evento", ["Produção própria"]);
    expect(rows()["Receitas de Eventos"]).toEqual(monthly({ 1: 100, 3: 100, 5: 30 }));
    expect(rows()["(-) Custos Directos de Eventos"]).toEqual(monthly({ 6: -40 }));
    expect(rows()["(-) Distribuição Sócios"]).toEqual(monthly({ 6: -47.5 }));
    selectFilter("Linha de negócio", ["Linha A", "Linha B"]);
    expect(rows()["Receitas de Eventos"][12]).toBe(690);
    selectFilter("Natureza do evento", ["Produção própria", "Intermediação"]);
    expect(rows()["Receitas de Eventos"][12]).toBe(3450);
    selectFilter("Natureza do evento", ["Coprodução"]);
    expect(rows()["Receitas de Eventos"]).toEqual(monthly({}));
    expect(rows()["(-) Custos Directos de Eventos"]).toEqual(monthly({}));
    expect(rows()["(-) Distribuição Sócios"]).toBeUndefined();
    expect(rows()["= Total Custos Corporativos"]).toEqual(before["= Total Custos Corporativos"]);
    clearFilter("Natureza do evento");
    clearFilter("Linha de negócio");
    expect(rows()).toEqual(before);
  });

  it.each(["caixa", "competencia"] as const)("%s: natureza e linha compõem com os três tipos e ambas as fontes de bilheteira", regime => {
    openReport(`/reports?regime=${regime}`);
    selectFilter("Natureza do evento", ["Produção própria"]);
    selectFilter("Linha de negócio", ["Linha A"]);
    const accountingMonth = regime === "caixa" ? 3 : 2;
    const managerialMonth = regime === "caixa" ? 5 : 4;
    const ticketMonth = regime === "caixa" ? 10 : 9;
    for (const ticketSource of ["ticket_sales", "transactions"]) {
      if (ticketSource === "transactions") transactionTickets();
      for (const type of ["Todas", "Só contábeis", "Só gerenciais"]) {
        fireEvent.click(screen.getByRole("radio", { name: type }));
        const expected: Record<number, number> = {};
        if (ticketSource === "ticket_sales") expected[1] = 100;
        if (type !== "Só gerenciais") {
          expected[accountingMonth] = 100;
          if (ticketSource === "transactions") expected[ticketMonth] = 80;
        }
        if (type !== "Só contábeis") expected[managerialMonth] = 30;
        const current = rows();
        expect(current["Receitas de Eventos"]).toEqual(monthly(expected));
        expect(current["(-) Custos Directos de Eventos"]).toEqual(monthly({ 6: -40 }));
        expect(current["(-) Distribuição Sócios"]).toEqual(monthly({ 6: ticketSource === "ticket_sales" ? -47.5 : -42.5 }));
        expect(current["= Total Custos Corporativos"]).toEqual(monthly(type === "Só gerenciais" ? {} : { [accountingMonth]: -40 }));
        if (type !== "Só gerenciais") expect(current["= Total Movimentos Financeiros"]).toEqual(monthly({ [accountingMonth]: 60 }));
      }
    }
  });

  it("comparação por transações filtra também os custos e conserva as datas de regime e de distribuição", () => {
    openReport();
    fireEvent.click(screen.getByRole("radio", { name: /Transações \(comparação\)/ }));
    selectFilter("Natureza do evento", ["Produção própria"]);
    selectFilter("Linha de negócio", ["Linha B"]);
    expect(rows()["Receitas de Eventos"]).toEqual(monthly({ 1: 200, 3: 200, 5: 60 }));
    expect(rows()["(-) Custos Directos de Eventos"]).toEqual(monthly({ 3: -24, 5: -16 }));
    expect(rows()["(-) Distribuição Sócios"]).toEqual(monthly({ 6: -105 }));
    fireEvent.click(screen.getByRole("radio", { name: "Competência" }));
    fireEvent.click(screen.getByRole("radio", { name: "Só contábeis" }));
    expect(rows()["Receitas de Eventos"]).toEqual(monthly({ 1: 200, 2: 200 }));
    expect(rows()["(-) Custos Directos de Eventos"]).toEqual(monthly({ 2: -24 }));
    expect(rows()["(-) Distribuição Sócios"]).toEqual(monthly({ 6: -105 }));
  });
});
