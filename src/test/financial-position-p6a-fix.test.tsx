import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { financialPositionFixture } from "./fixtures/financial-position";
import { formatPositionAmount, positionYearOptions, currentLisbonYear } from "@/lib/financial-position";
import { FinancialPositionView } from "@/components/financial-position/FinancialPositionView";

const hook = vi.hoisted(() => ({ calls: [] as Array<number | null> }));
vi.mock("@/hooks/useFinancialPosition", () => ({ useFinancialPosition: (year: number | null) => { hook.calls.push(year); return { isLoading: false, isFetching: false, isError: false, companyLoading: false, companyMissing: false, companyError: false, data: undefined, refetch: vi.fn() }; } }));
vi.mock("@/components/financial-position/FutureCoverageCard", () => ({ FutureCoverageCard: () => null }));
vi.mock("@/components/financial-position/FinancialPositionAccess", () => ({ FinancialPositionAccess: ({ children }: { children: ReactNode }) => <>{children}</> }));
// Native stand-in for the shared Select so the test can drive value changes.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => <select aria-label="Ano" value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
import FinancialPositionPage from "@/pages/FinancialPosition";

const norm = (t: string) => t.replace(/\s/g, " ");
function card(label: string) { return screen.getByText(label).closest("div.min-w-0") as HTMLElement; }
beforeEach(() => { cleanup(); hook.calls = []; });

describe("P6a-fix top cards", () => {
  it("A pagar shows a_pagar.total, not posicao.a_pagar, with transients line", () => {
    const data = financialPositionFixture(); data.a_pagar.total = 947790.71; data.a_pagar.transitorias.total = 64703.88; data.posicao.a_pagar = 1012494.59;
    render(<MemoryRouter><FinancialPositionView data={data} /></MemoryRouter>);
    const c = within(card("A pagar"));
    expect(c.getByText(formatPositionAmount(947790.71), { normalizer: t => t })).toBeDefined();
    expect(c.queryByText(formatPositionAmount(1012494.59), { normalizer: t => t })).toBeNull();
    expect(norm(c.getByText(/transitórias de repasse/).textContent ?? "")).toBe("+ transitórias de repasse: 64 703,88 €");
  });
  it("A receber shows a_receber.total, not posicao.a_receber, with transients line", () => {
    const data = financialPositionFixture(); data.a_receber.total = 22636.89; data.a_receber.transitorias.total = 5192.19; data.posicao.a_receber = 27829.08;
    render(<MemoryRouter><FinancialPositionView data={data} /></MemoryRouter>);
    const c = within(card("A receber"));
    expect(c.getByText(formatPositionAmount(22636.89), { normalizer: t => t })).toBeDefined();
    expect(c.queryByText(formatPositionAmount(27829.08), { normalizer: t => t })).toBeNull();
    expect(norm(c.getByText(/transitórias de repasse/).textContent ?? "")).toBe("+ transitórias de repasse: 5 192,19 €");
  });
  it("four-digit amounts always carry the thousands separator", () => {
    expect(norm(formatPositionAmount(4661.86))).toBe("4 661,86 €");
    expect(norm(formatPositionAmount(1162.19))).toBe("1 162,19 €");
    expect(norm(formatPositionAmount(1012494.59))).toBe("1 012 494,59 €");
  });
  it("no totals are computed in the view", () => {
    const src = readFileSync("src/components/financial-position/FinancialPositionView.tsx", "utf8");
    expect(src).not.toMatch(/\.reduce\(|\+=|total\s*\+|\+\s*d\./);
    expect(src).not.toContain("posicao.a_pagar");
    expect(src).not.toContain("posicao.a_receber");
  });
});

describe("P6a-fix year selector", () => {
  it("renders one selector, defaults to Lisbon year, and Todos sends null", () => {
    render(<MemoryRouter><FinancialPositionPage /></MemoryRouter>);
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(1);
    expect(screen.queryByText("Selecionar ano")).toBeNull();
    expect(screen.queryByLabelText("Ano selecionado")).toBeNull();
    expect(hook.calls.at(-1)).toBe(currentLisbonYear());
    fireEvent.change(selects[0], { target: { value: "all" } });
    expect(hook.calls.at(-1)).toBeNull();
    const other = positionYearOptions(currentLisbonYear())[3];
    fireEvent.change(selects[0], { target: { value: String(other) } });
    expect(hook.calls.at(-1)).toBe(other);
  });
});
