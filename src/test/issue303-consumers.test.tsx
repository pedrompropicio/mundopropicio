import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TicketOfficePositionCards } from "@/components/TicketOfficePositionCards";
import { TicketOfficeBalancePanel } from "@/components/TicketOfficeBalancePanel";
import { RetainedCompositionSection } from "@/components/financial-position/P6bSections";
import { issue303ConsumerFixture } from "./fixtures/issue303-statement";
import type { FinancialPosition } from "@/lib/financial-position";
import { formatCurrency as money } from "@/lib/mock-data";
import { formatPositionAmount } from "@/lib/financial-position";
import ReportTicketOfficeAudit from "@/components/ReportTicketOfficeAudit";
import { loadTicketOfficeStatements } from "@/hooks/useTicketOfficeStatements";
import { loadRetainedComposition } from "@/hooks/useRetainedComposition";
import { exportTicketOfficeAuditToExcel } from "@/lib/export-ticket-office-audit";
import * as XLSX from "xlsx";

const scope = vi.hoisted(() => ({ db: null as any, companyId: "company-synthetic" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => scope.db.from(t), rpc: (n: string, args: any) => scope.db.rpc(n, args) } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-synthetic" }, isAdmin: false, hasPermission: () => false }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: scope.companyId }) }));
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => ({ status: "available", locale: "pt-PT", currency: "EUR" }) }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TicketOfficeSettlementModal", () => ({ TicketOfficeSettlementModal: () => null }));
vi.mock("xlsx", async importOriginal => ({ ...await importOriginal<typeof import("xlsx")>(), writeFile: vi.fn() }));
// Replace only the existing technical classification ID, keeping every formula real
// and all fixture identities synthetic (including the transfer category).
vi.mock("@/lib/ticket-office-balance", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/ticket-office-balance")>(),
  INTERNAL_TRANSFER_CATEGORY_ID: "synthetic-transfer-category",
}));

function fixture(mode: "legacy" | "v2" | "unavailable" = "v2") {
  const f = issue303ConsumerFixture();
  if (mode === "legacy") f.tables.company_features[0].enabled = false;
  const calls: { table: string; select: string }[] = [];
  const db = {
    rpc: vi.fn(async (name: string) => {
      if (name === "current_company_id") return { data: f.company, error: null };
      if (name === "get_ticket_office_sales") return { data: f.sales, error: null };
      if (name === "ticket_office_balances") return { data: [{ account_id: f.account, balance: 350 }], error: null };
      throw new Error(`Unexpected RPC ${name}`);
    }),
    from(table: string) {
      const call = { table, select: "" }; calls.push(call);
      const filters: ((r: any) => boolean)[] = [], orders: { key: string; asc: boolean }[] = [];
      let page: [number, number] | null = null, single = false;
      const q = {
        select(columns: string) { call.select = columns; return q; },
        eq(k: string, v: unknown) { filters.push(r => r[k] === v); return q; },
        is(k: string, v: unknown) { filters.push(r => (r[k] ?? null) === v); return q; },
        in(k: string, v: unknown[]) { filters.push(r => v.includes(r[k])); return q; },
        order(key: string, opts?: { ascending?: boolean }) { orders.push({ key, asc: opts?.ascending ?? true }); return q; },
        range(a: number, b: number) { page = [a, b]; return q; },
        limit(n: number) { page = [0, n - 1]; return q; },
        maybeSingle() { single = true; return q; },
        then(resolve: any, reject: any) {
          return Promise.resolve().then(() => {
            if (mode === "unavailable" && table === "ticket_office_statements" && call.select.includes("contract_version")) return { data: null, error: { code: "42703" } };
            let rows = (f.tables[table] ?? []).filter(r => filters.every(fn => fn(r)));
            rows = [...rows].sort((a, b) => {
              for (const o of orders) { const c = String(a[o.key]).localeCompare(String(b[o.key])); if (c) return o.asc ? c : -c; }
              return 0;
            });
            if (page) rows = rows.slice(page[0], page[1] + 1);
            return { data: single ? rows[0] ?? null : rows, error: null };
          }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  scope.db = db;
  return { ...f, calls, db };
}
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.clearAllMocks(); });
const textMoney = (value: number) => money(value).replace(/\s/g, " ");
const textPosition = (value: number) => formatPositionAmount(value).replace(/\s/g, " ");
const domHash = (html: string) => createHash("sha256").update(html).digest("hex");
function mount(f: ReturnType<typeof fixture>, view: "cards" | "panel" | "p6b") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client);
  const data = { retido: { visivel: [{ account_id: f.account, name: "Synthetic office", saldo: 350 }], ocultas: [] }, meta: { balances_visible: true } } as FinancialPosition;
  const node = view === "cards" ? <TicketOfficePositionCards officeId={f.account} /> : view === "panel" ? <TicketOfficeBalancePanel officeId={f.account} officeName="Synthetic office" /> : <RetainedCompositionSection data={data} />;
  return { ...render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>), client };
}
async function ready(view: ReturnType<typeof mount>) {
  await waitFor(() => {
    expect(view.client.isFetching()).toBe(0);
    expect(view.container.textContent).not.toContain("A carregar");
    expect(view.container.textContent).not.toContain("Sem eventos associados");
  });
}

describe("#303 R9 consumer DOM baseline", () => {
  it.each(["cards", "panel", "p6b"] as const)("pins disabled %s DOM captured before R9", async name => {
    const f = fixture("legacy"), view = mount(f, name); await ready(view);
    expect(domHash(view.container.innerHTML)).toBe({ cards: "837aaf0193f1d295f00f926cdba89f97de8fde9de722bf617d78860396a0d7df", panel: "34889de8fa290b7b4a66d45bb0a25c337e9da16be6f24c88f5ff87e306806b62", p6b: "2c2838f8a9ea65bd9b269f0610fb370bdd3f8e8ad73efcad945bbe733f1694a7" }[name]);
  });
  it.each(["cards", "panel", "p6b"] as const)("pins unavailable %s DOM captured before R9", async name => {
    const f = fixture("unavailable"), view = mount(f, name); await ready(view);
    expect(domHash(view.container.innerHTML)).toBe({ cards: "837aaf0193f1d295f00f926cdba89f97de8fde9de722bf617d78860396a0d7df", panel: "34889de8fa290b7b4a66d45bb0a25c337e9da16be6f24c88f5ff87e306806b62", p6b: "5cd7ac36368b3404413d19635d6247efebd4b67a951991dd2455ec7c7b93bd1b" }[name]);
  });
});

describe("#303 R9 confirmed consumers", () => {
  async function all(f: ReturnType<typeof fixture>) {
    const cards = mount(f, "cards"), panel = mount(f, "panel"), p6b = mount(f, "p6b");
    await Promise.all([ready(cards), ready(panel), ready(p6b)]);
    return { cards: within(cards.container), panel: within(panel.container), p6b: within(p6b.container) };
  }
  it("all three use the positive latest confirmed cutoff, preserve retained totals and ignore drafts", async () => {
    const f = fixture(), v = await all(f);
    expect(v.cards.getByText("Posição a receber").nextElementSibling).toHaveTextContent(textMoney(350));
    expect(v.cards.getByText("Saldo retido").nextElementSibling).toHaveTextContent(textMoney(350));
    expect(v.cards.getByText("Valor por apurar").nextElementSibling).toHaveTextContent(textMoney(0));
    expect(v.panel.getByRole("button", { name: /Posição já apurada.*next/ })).toHaveTextContent(textMoney(350));
    expect(v.panel.getByRole("button", { name: /Vendas de eventos ainda sem fecho \(0\)/ })).toHaveTextContent(textMoney(0));
    expect(v.panel.getByRole("button", { name: /Retido na Bilheteira/ })).toHaveTextContent(textMoney(350));
    expect(v.p6b.getByText(/Posição do apuramento n.º next/).parentElement).toHaveTextContent(textPosition(350));
    expect(v.p6b.getByText("Synthetic office").parentElement).toHaveTextContent(textPosition(350));
    for (const view of Object.values(v)) {
      expect(view.queryByText(/999/)).toBeNull();
      expect(view.getByText(/Repasses e saldos transportados pertencem à conta/)).toBeDefined();
    }
    // Active v2 consumers read through R5; no independent legacy-document selection.
    expect(f.calls.filter(c => c.table === "ticket_office_statements").every(c => c.select.includes("contract_version"))).toBe(true);
  });
  it("negative predecessor leaves the same open events and residual in the three views", async () => {
    const f = fixture();
    f.tables.ticket_office_statements = f.tables.ticket_office_statements.filter(s => s.id !== "next");
    f.tables.ticket_office_statement_lines = f.tables.ticket_office_statement_lines.filter(l => l.statement_id !== "next");
    f.tables.ticket_office_statement_events = f.tables.ticket_office_statement_events.filter(m => m.statement_id !== "next");
    f.tables.ticket_office_settlements = f.tables.ticket_office_settlements.filter(s => s.event_id === "event-a");
    const v = await all(f);
    expect(v.cards.getByText("Já adiantado").nextElementSibling).toHaveTextContent(textMoney(400));
    expect(v.cards.getByText("Valor por apurar").nextElementSibling).toHaveTextContent(textMoney(1700));
    expect(v.cards.getByRole("button", { name: /Diferença de calendário/ })).toHaveTextContent(textMoney(-950));
    expect(v.panel.getByRole("button", { name: /Posição já apurada.*first/ })).toHaveTextContent(textMoney(-400));
    expect(v.panel.getByRole("button", { name: /Vendas de eventos ainda sem fecho \(2\)/ })).toHaveTextContent(textMoney(1700));
    expect(v.panel.getByRole("button", { name: /Por conciliar/ })).toHaveTextContent(textMoney(-950));
    expect(v.p6b.getByText(/Posição do apuramento n.º first/).parentElement).toHaveTextContent(textPosition(-400));
    expect(v.p6b.getByText(/Vendas de eventos sem fecho \(2\)/).parentElement).toHaveTextContent(textPosition(1700));
    expect(v.p6b.getByText(/Por conciliar/).parentElement).toHaveTextContent(textPosition(-950));
  });
  it("membership renders each frozen event right once; legacy closing and later Q4 never add another quota", async () => {
    const f = fixture();
    f.tables.ticket_office_settlements.forEach(s => { s.net_calculated = 9999; });
    f.tables.ticket_office_statement_lines.filter(l => l.document_line_type === "event_sales").forEach(l => { l.amount = 9999; l.declared_event_net = 9999; });
    const before = JSON.stringify(f.tables);
    const v = await all(f);
    expect(v.panel.getAllByTitle("Direito do evento").map(e => e.textContent)).toEqual([money(700), money(1200), money(500)]);
    expect(v.panel.getAllByRole("link", { name: "first" })).toHaveLength(1);
    expect(v.panel.getAllByRole("link", { name: "next" })).toHaveLength(2);
    fireEvent.click(v.panel.getByRole("button", { name: /Posição já apurada/ }));
    expect(v.panel.getByText("Synthetic q4-a").parentElement).toHaveTextContent(textMoney(-50));
    expect(v.panel.queryByText(money(9999))).toBeNull();
    expect(JSON.stringify(f.tables)).toBe(before); // No mutation of history, receipts or snapshots.
  });
  it("confirmed membership alone excludes events from the open total in every consumer", async () => {
    const f = fixture();
    f.tables.ticket_office_settlements = [];
    const v = await all(f);
    expect(v.cards.getByText("Valor por apurar").nextElementSibling).toHaveTextContent(textMoney(0));
    expect(v.panel.getByRole("button", { name: /Vendas de eventos ainda sem fecho \(0\)/ })).toHaveTextContent(textMoney(0));
    expect(v.p6b.getByText(/Vendas de eventos sem fecho \(0\)/).parentElement).toHaveTextContent(textPosition(0));
    expect(v.panel.getAllByTitle("Direito do evento").map(e => e.textContent)).toEqual([money(700), money(1200), money(500)]);
    expect(v.panel.getByRole("button", { name: /Por conciliar/ })).toHaveTextContent(textMoney(0));
  });
  it("retains v1 history inside an enabled account without reinterpreting it as a v2 quota", async () => {
    const f = fixture();
    f.tables.ticket_office_statements.find(s => s.id === "first")!.contract_version = 1;
    f.tables.ticket_office_statement_lines.filter(l => l.statement_id === "first").forEach(l => { l.document_line_type = null; });
    const v = await all(f);
    expect(v.cards.getByText("Valor por apurar").nextElementSibling).toHaveTextContent(textMoney(0));
    expect(v.panel.getAllByTitle("Direito do evento").map(e => e.textContent)).toEqual([money(1200), money(500)]);
    expect(v.panel.getByRole("link", { name: "Synthetic event-a" }).parentElement).toHaveTextContent(textMoney(650));
    expect(v.panel.getByRole("button", { name: /Posição já apurada.*next/ })).toHaveTextContent(textMoney(350));
    expect(v.p6b.getByText(/Posição do apuramento n.º next/).parentElement).toHaveTextContent(textPosition(350));
  });
  it("carry_over and advances retain account scope, with no event link or second subtraction", async () => {
    const f = fixture(), v = await all(f);
    fireEvent.click(v.panel.getByRole("button", { name: /Posição já apurada/ }));
    for (const [id, amount] of [["carry-next", -400], ["advance-next", -900]] as const) {
      const row = v.panel.getByText(`Synthetic ${id}`).parentElement!;
      expect(row).toHaveTextContent(textMoney(amount));
      expect(within(row).queryByRole("link")).toBeNull();
      expect(f.tables.ticket_office_statement_lines.find(l => l.id === id)?.event_id).toBeNull();
    }
    const read = await loadTicketOfficeStatements(f.account, { companyId: f.company });
    if (read.status !== "v2") throw new Error("Expected v2");
    expect(read.provenance.eventMemberships).toHaveLength(3);
    expect(read.provenance.latestConfirmedStatementId).toBe("next");
    expect(read.confirmedStatements.map(s => Number(s.document_total))).toEqual([350, -400]);
    expect(v.panel.getAllByTitle("Direito do evento")).toHaveLength(3);
    expect(v.panel.getByRole("button", { name: /Por conciliar/ })).toHaveTextContent(textMoney(0));
  });
  it("draft-only v2 never displays a draft position", async () => {
    const f = fixture();
    f.tables.ticket_office_statements = f.tables.ticket_office_statements.filter(s => s.status === "draft");
    f.tables.ticket_office_statement_lines = []; f.tables.ticket_office_statement_events = [];
    const v = await all(f);
    expect(v.cards.getByText("Já adiantado").nextElementSibling).toHaveTextContent(textMoney(0));
    expect(v.panel.queryByRole("button", { name: /Posição já apurada/ })).toBeNull();
    expect(v.p6b.getByText(/Sem apuramento/)).toBeDefined();
    for (const view of Object.values(v)) expect(view.queryByText(/999/)).toBeNull();
  });
  it("Audit and Excel export preserve the same retained total, including account advances once", async () => {
    const f = fixture();
    f.tables.financial_accounts = [{ id: f.account, name: "Synthetic office", type: "ticket_office", is_active: true }];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    const view = render(<QueryClientProvider client={client}><MemoryRouter><ReportTicketOfficeAudit /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(within(view.container).getByRole("button", { name: /Excel/ })).toBeDefined());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    fireEvent.click(within(view.container).getByRole("button", { name: /Excel/ }));
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Sintético"], { header: 1 });
    const office = rows.find(r => r[0] === "Synthetic office")!, total = rows.find(r => r[0] === "TOTAL")!;
    expect(office.slice(1, 6)).toEqual([3000, 650, 2000, 0, 350]);
    expect(total[5]).toBe(350);
    const composition = await loadRetainedComposition(f.account, { companyId: f.company });
    expect(composition.globalBalance).toBe(office[5]);
    expect(composition.decomposition?.position).toBe(office[5]);
    // The real exporter also preserves an analytical account-level total.
    exportTicketOfficeAuditToExcel([], [{ officeName: "Synthetic office", expectedBalance: office[5], lines: [] }], "analytical");
    const analytical = vi.mocked(XLSX.writeFile).mock.calls[1][0];
    expect(XLSX.utils.sheet_to_json<any[]>(analytical.Sheets["Synthetic office"], { header: 1 }).find(r => r[0] === "SALDO PREVISTO")?.[3]).toBe(350);
  });
});
