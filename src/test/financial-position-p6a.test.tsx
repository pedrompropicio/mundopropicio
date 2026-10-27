import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { financialPositionFixture } from "./fixtures/financial-position";
import { parseFinancialPosition, financialPositionError, formatPositionAmount, formatPositionDate } from "@/lib/financial-position";
import { FinancialPositionView } from "@/components/financial-position/FinancialPositionView";
import { FinancialPositionAccess } from "@/components/financial-position/FinancialPositionAccess";
const auth = vi.hoisted(() => ({ allowed: false, loading: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ loading: auth.loading, hasPermission: (p: string) => auth.allowed && p === "view_financial_position" }) }));
beforeEach(() => { cleanup(); auth.allowed = false; auth.loading = false; });
describe("P6a strict RPC contract", () => {
  it("accepts complete synthetic JSON without recalculation", () => expect(parseFinancialPosition(financialPositionFixture()).posicao.caixa_e_cartoes).toBe(4321.98));
  it.each(["meta", "caixa", "cartoes", "retido", "a_pagar", "a_receber", "acerto_informativo", "operacoes_terceiros_informativo", "alertas", "posicao", "eventos_por_estagio"])("fails closed with missing %s", field => {
    const raw = { ...financialPositionFixture() } as Record<string, unknown>; delete raw[field]; expect(() => parseFinancialPosition(raw)).toThrow("financial_position_invalid_response");
  });
  it("fails closed for string numbers", () => { const raw = financialPositionFixture(); expect(() => parseFinancialPosition({ ...raw, posicao: { ...raw.posicao, a_pagar: "100" } })).toThrow(); });
  it("fails closed for missing nested totals", () => { const raw = financialPositionFixture(); expect(() => parseFinancialPosition({ ...raw, a_pagar: { ...raw.a_pagar, por_estagio: {} } })).toThrow(); });
  it("preserves legitimate null balances", () => { const raw = financialPositionFixture(); raw.caixa[0].saldo = null; raw.retido.total_visiveis = null; expect(parseFinancialPosition(raw).caixa[0].saldo).toBeNull(); });
  it("removes historical/cancelled event lists returned by current RPC", () => { const raw = financialPositionFixture(); const result = parseFinancialPosition({ ...raw, eventos_por_estagio: { ...raw.eventos_por_estagio, historico: raw.eventos_por_estagio.em_fecho, cancelado: [] } }); expect(result.eventos_por_estagio).not.toHaveProperty("historico"); expect(result.eventos_por_estagio).not.toHaveProperty("cancelado"); });
  it.each([["financial_position_permission_denied", "Sem permissão para ver a posição financeira"], ["company_forbidden", "Empresa não autorizada"], ["not_authenticated", "Sessão expirada"]])("maps %s", (message, expected) => expect(financialPositionError({ message })).toBe(expected));
  it("formats EUR pt-PT and civil date; null never becomes zero", () => { expect(formatPositionAmount(1234.56).replace(/\s/g, " ")).toBe("1234,56 €"); expect(formatPositionAmount(null)).toBe("—"); expect(formatPositionDate("2026-10-27")).toBe("27/10/2026"); });
});
describe("P6a access and display", () => {
  it("denies the page without the exact permission", () => { render(<FinancialPositionAccess><div>protected</div></FinancialPositionAccess>); expect(screen.queryByText("protected")).toBeNull(); expect(screen.getByRole("heading", { name: "Sem acesso" })).toBeDefined(); });
  it("allows the page with permission", () => { auth.allowed = true; render(<FinancialPositionAccess><div>protected</div></FinancialPositionAccess>); expect(screen.getByText("protected")).toBeDefined(); });
  it("uses returned position totals even when detail amounts differ", () => { render(<MemoryRouter><FinancialPositionView data={financialPositionFixture()} /></MemoryRouter>); for (const value of [4321.98, 8765.43, 5432.1, 6789.12]) expect(screen.getByText(formatPositionAmount(value))).toBeDefined(); });
  it("conceals balances when meta denies visibility, even if RPC supplied numbers", () => { const data = financialPositionFixture(); data.meta.balances_visible = false; render(<MemoryRouter><FinancialPositionView data={data} /></MemoryRouter>); expect(screen.queryByText(formatPositionAmount(4321.98))).toBeNull(); expect(screen.getAllByText("Saldos não visíveis para o seu perfil").length).toBeGreaterThan(0); });
  it("shows null account balance as unavailable, not zero", () => { const data = financialPositionFixture(); data.caixa[0].saldo = null; render(<MemoryRouter><FinancialPositionView data={data} /></MemoryRouter>); expect(screen.getByText("Saldos não visíveis para o seu perfil")).toBeDefined(); });
  it("registers route and menu permission, and disables only dashboard projections", () => {
    const app = readFileSync("src/App.tsx", "utf8"), menu = readFileSync("src/components/AppSidebar.tsx", "utf8"), dashboard = readFileSync("src/pages/Index.tsx", "utf8"), analysis = readFileSync("src/components/ResultsAnalysis.tsx", "utf8");
    expect(app).toContain('path="/erp/posicao-financeira" element={<FinancialPosition />}');
    expect(menu).toContain('show: hasPermission(FINANCIAL_POSITION_PERMISSION)');
    expect(dashboard).toContain('<ResultsAnalysis showActiveProjections={false} />');
    expect(analysis).toContain('showActiveProjections && active.length > 0');
  });
});