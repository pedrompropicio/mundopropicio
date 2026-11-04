import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportProfitability from "@/components/ReportProfitability";
import { buildDREForExport } from "@/lib/export-dre";
import { resolveCompanyLocale } from "@/lib/company-locale";
import { vatNonRecoverableCost, withVatNonRecoverableCost } from "@/lib/vat-non-recoverable";

const f = vi.hoisted(() => ({ queries: {} as Record<string, any>, queryFns: {} as Record<string, () => Promise<any>> }));
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => resolveCompanyLocale({ country: "PT", currency: "EUR" }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey, queryFn }: any) => {
  f.queryFns[queryKey[0]] = queryFn;
  return { data: f.queries[queryKey[0]], isLoading: false };
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#257b: serviço remoto proibido"); },
}) }));
vi.mock("@/components/ui/chart", () => ({ ChartContainer: () => null, ChartTooltip: () => null, ChartTooltipContent: () => null }));
vi.mock("recharts", () => ({ BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, ResponsiveContainer: () => null, Cell: () => null }));

const expense = { id: "expense", event_id: "event", type: "expense", amount: 100, iva_rate: 21,
  category_id: "category", status: "approved", vat_non_recoverable: true };
beforeEach(() => {
  f.queries = {
    "profitability-events": [{ id: "event", name: "Evento sintético", status: "completed", venue_id: "venue" }],
    "profitability-cache": [{ event_id: "event", artist_name: "Artista sintético" }],
    "profitability-venues": [{ id: "venue", name: "Sala sintética" }],
    "profitability-forecasts-expense": [],
    "profitability-transactions": [expense, { ...expense, id: "income", type: "income", amount: 500, iva_rate: 0 }],
  };
  f.queryFns = {};
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#257b: rede proibida"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); cleanup(); vi.unstubAllGlobals(); });

describe("#257b C2 — projeção do IVA para custo", () => {
  it("preserva array, objetos e bytes sem marcação aplicável", () => {
    const rows = [Object.freeze({ ...expense, vat_non_recoverable: false }),
      Object.freeze({ ...expense, type: "income" }), Object.freeze({ ...expense, iva_rate: 0 })];
    const bytes = JSON.stringify(rows);
    expect(withVatNonRecoverableCost(rows)).toBe(rows);
    expect(withVatNonRecoverableCost([])).toEqual([]);
    expect(JSON.stringify(rows)).toBe(bytes);
    rows.forEach(row => expect(vatNonRecoverableCost(row)).toBe(0));
  });
  it("soma IVA próprio, zera taxa na projeção e preserva os outros objetos", () => {
    const rows = [Object.freeze({ ...expense }), Object.freeze({ ...expense, type: "income" }),
      Object.freeze({ ...expense, iva_rate: 0 })];
    const projected = withVatNonRecoverableCost(rows);
    expect(vatNonRecoverableCost(rows[0])).toBe(21);
    expect(projected[0]).toEqual({ ...expense, amount: 121, iva_rate: 0 });
    expect(projected[1]).toBe(rows[1]); expect(projected[2]).toBe(rows[2]);
    expect(rows[0]).toEqual(expense);
    expect(withVatNonRecoverableCost(projected)).toBe(projected);
  });
  it.each([[243.98, 21, 51.24, 295.22], [-243.98, 21, -51.24, -295.22], [0.03, 23, 0.01, 0.04]])(
    "usa arredondamento canónico para %s a %s%%", (amount, iva_rate, iva, cost) => {
      const row = { ...expense, amount, iva_rate };
      expect(vatNonRecoverableCost(row)).toBe(iva);
      expect(withVatNonRecoverableCost([row])[0].amount).toBe(cost);
    },
  );
  it.each([false, true])("export DRE usa custo e IVA corretos com marcação %s", marked => {
    const rows = withVatNonRecoverableCost([{ ...expense, vat_non_recoverable: marked }]);
    const categories = [{ id: "category", code: "2.1.01", name: "Custo sintético", type: "expense", parent_id: null }];
    const dre = buildDREForExport(rows, categories, "transactions", [], [], [], "event", null);
    expect(dre.find(line => line.label === "DESPESAS")).toMatchObject({
      amountExIva: marked ? 121 : 100, ivaAmount: marked ? 0 : 21, amountIncIva: 121,
    });
  });
  it("os quatro consumidores projetam as linhas e Rentabilidade seleciona a coluna", () => {
    for (const component of ["ReportDRE", "ReportDREBrasil", "ReportDREEmpresarial", "ReportProfitability"]) {
      const source = readFileSync(`src/components/${component}.tsx`, "utf8");
      expect(source).toContain("data: transactionsRaw = []");
      expect(source).toContain("useMemo(() => withVatNonRecoverableCost(transactionsRaw as any[]), [transactionsRaw])");
    }
    const source = readFileSync("src/components/ReportProfitability.tsx", "utf8");
    expect(source).toMatch(/\.select\("event_id, type, amount, iva_rate, vat_non_recoverable,/);
  });
  it.each([false, true])("Rentabilidade inclui o custo do evento com marcação %s", marked => {
    f.queries["profitability-transactions"][0] = { ...expense, vat_non_recoverable: marked };
    const rawBytes = JSON.stringify(f.queries["profitability-transactions"]);
    render(<ReportProfitability />);
    fireEvent.click(screen.getByRole("radio", { name: /Transações/ }));
    const artist = screen.getByText("Artista sintético").closest("tr")!;
    expect(artist.textContent).toContain(marked ? "121,00" : "100,00");
    expect(artist.textContent).toContain(marked ? "379,00" : "400,00");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Venue/ }), { button: 0, ctrlKey: false });
    const venue = screen.getByText("Sala sintética").closest("tr")!;
    expect(venue.textContent).toContain(marked ? "121,00" : "100,00");
    expect(JSON.stringify(f.queries["profitability-transactions"])).toBe(rawBytes);
  });
});
