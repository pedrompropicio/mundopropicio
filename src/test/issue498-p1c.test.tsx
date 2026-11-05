import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import ReportDRE from "@/components/ReportDRE";
import ReportDREEmpresarial from "@/components/ReportDREEmpresarial";
import ReportDREBrasil from "@/components/ReportDREBrasil";
import ReportPL from "@/components/ReportPL";
import ReportCashFlow from "@/components/ReportCashFlow";
import Transactions from "@/pages/Transactions";

const fixtures = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return { queries: {} as Record<string, unknown> };
});

vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Query/mutation callbacks never run. Only the deletion preflight below reads
// a strictly allowlisted synthetic client; all other service access fails.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: fixtures.queries[queryKey.join(":")] ?? fixtures.queries[String(queryKey[0])],
    isLoading: false, isError: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        if (table === "transactions" && columns === "status, paid_amount") {
          return { eq: () => ({ maybeSingle: async () => ({ data: { status: "approved", paid_amount: 1234.56 } }) }) };
        }
        if (["payment_list_items", "reimbursement_note_items", "partner_paid_expenses", "supplier_credit_usages"].includes(table)) {
          return { eq: async () => ({ data: table === "supplier_credit_usages" ? [{ id: "credit", amount: 1234.56 }] : [] }) };
        }
        if (table === "transactions" && columns === "id") return { eq: () => ({}) };
        throw new Error(`#498: serviço MP proibido (${table}/${columns})`);
      },
    }),
  },
}));
vi.mock("@/lib/supabase-paging", () => ({
  fetchAllPaged: () => { throw new Error("#498: queryFn não autorizada"); },
  fetchAllPagedQuery: async () => ({ data: [], error: null }),
}));
vi.mock("@/lib/invoice-group", () => ({
  fetchInvoiceGroupSiblingDetails: async () => [
    { id: "sibling", description: "Irmã sintética", amount: 1234.56, date: "2026-01-02", due_date: null },
  ],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "fixture-user" }, isAdmin: true, isManager: false, hasPermission: () => true }) }));
vi.mock("@/contexts/CompanyBrandingContext", () => ({ useCompanyBranding: () => ({ logoUrl: null, displayName: "Empresa sintética" }) }));
vi.mock("@/hooks/useInstallmentTxIds", () => ({ useInstallmentTxIds: () => ({ data: new Set() }) }));
vi.mock("@/hooks/useOperationKeyTotals", () => ({ useOperationKeyTotals: () => ({ data: fixtures.queries["operation-key-totals"], isLoading: false }) }));
vi.mock("@/hooks/useUserPreferences", () => ({ useUserPreferences: () => ({ consolidateRefunds: true, setConsolidateRefunds: vi.fn() }) }));
// Leaves outside P1c: retain the real report/page markup and calculations.
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TransactionFormModal", () => ({ TransactionFormModal: () => null }));
vi.mock("@/components/TransactionEditModal", () => ({ TransactionEditModal: () => null }));
vi.mock("@/components/TransactionPaymentModal", () => ({ TransactionPaymentModal: () => null }));
vi.mock("@/components/TransactionAuditModal", () => ({ TransactionAuditModal: () => null }));
vi.mock("@/components/TransactionDocumentsModal", () => ({ TransactionDocumentsModal: () => null }));
vi.mock("@/components/TransactionPaymentsListModal", () => ({ TransactionPaymentsListModal: () => null }));
vi.mock("@/components/TransferFormModal", () => ({ TransferFormModal: () => null }));
vi.mock("@/components/BatchPaymentModal", () => ({ BatchPaymentModal: () => null }));
vi.mock("@/components/TicketOfficeSettlementLauncher", () => ({ TicketOfficeSettlementLauncher: () => null }));
vi.mock("@/components/BPViewerModal", () => ({ default: () => null }));
vi.mock("@/components/LinkBpLineDialog", () => ({ default: () => null }));
vi.mock("@/components/RaiseBudgetDialog", () => ({ default: () => null }));
vi.mock("@/components/TransactionRow", () => ({
  TransactionRow: ({ transaction, onDelete }: { transaction: { id: string }; onDelete: (id: string) => void }) =>
    <tr><td><button onClick={() => onDelete(transaction.id)}>Eliminar fixture</button></td></tr>,
}));

const event = { id: "event", name: "Evento sintético", date: "2026-01-02", status: "active", event_type: "simple", event_nature: "producao_propria", partner_calc_basis: "net_result_gross_expenses", budget_mode: "with_bp" };
const tx = { id: "tx", event_id: event.id, events: { name: event.name }, type: "income", amount: 1234.56, iva_rate: 0, paid_amount: 1234.56, status: "approved", date: "2026-01-02", due_date: "2026-01-02", account_id: "bank", category_id: "income", exclude_from_result: false };
const cost = { id: "cost", event_id: event.id, type: "expense", category_id: "expense", amount: 100, iva_rate: 23, status: "approved", date: "2026-01-02" };
const reports = { DRE: ReportDRE, Empresarial: ReportDREEmpresarial, Brasil: ReportDREBrasil, PL: ReportPL, CashFlow: ReportCashFlow };
type ReportName = keyof typeof reports;

function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}

function hash(node: HTMLElement) {
  // Normalize only React/Radix generated IDs, as in P1b. Keep every other byte,
  // including attributes, whitespace and NBSP; never normalize monetary text.
  return createHash("sha256").update(node.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}

function openReport(name: ReportName) {
  if (name === "CashFlow") fireEvent.click(screen.getByRole("button", { name: "Gerar" }));
  else if (name !== "Empresarial") fireEvent.click(screen.getByRole("button", { name: /Evento sintético/ }));
}

function showComparison() {
  fireEvent.keyDown(screen.getAllByRole("combobox")[0], { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: "Previsão vs Realizado" }));
}

function renderTransactions() {
  return render(<MemoryRouter initialEntries={["/transactions?excluded=1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Transactions /></MemoryRouter>);
}

async function openDeletion() {
  fireEvent.click(screen.getByRole("button", { name: "Eliminar fixture" }));
  await waitFor(() => expect(screen.getByText(/Irmã sintética/)).toBeInTheDocument());
  expect(screen.queryByText("A verificar dependências…")).not.toBeInTheDocument();
  return screen.getByRole("alertdialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida"); }));
  setCompany();
  fixtures.queries = {
    "business-lines": [],
    events: [event], "events-list": [event],
    "transactions:dre": [tx], "transactions:dre-brasil": [tx], "transactions:pl": [tx],
    transactions: [{ ...tx, type: "expense", exclude_from_result: true }],
    "transactions-approved": [tx],
    "dre-emp-non-accounting-accounts": [],
    "account-categories": [
      { id: "income", code: "1.1.01", name: "Receita sintética", type: "income" },
      { id: "expense", code: "2.1.01", name: "Despesa sintética", type: "expense" },
    ],
    "dre-forecasts-expense": [cost], "dre-emp-forecasts-expense": [cost],
    "all-forecasts": [{ ...tx, id: "forecast", status: "approved" }, cost],
    "event-partners-all": [{ id: "partner", event_id: event.id, percentage: 25, expense_includes_iva: true, suppliers: { name: "Sócio sintético" } }],
    "cf-accounts": [{ id: "bank", name: "Banco sintético", initial_balance: -10.01, initial_balance_date: "2026-01-01", skip_balance_check: false }],
    "cf-transactions": [{ ...tx, status: "paid" }],
    "cf-adjustments": { openingMap: new Map(), openingTotal: 0, periodTotal: 0 },
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P1c — hashes PT capturados antes de alterar os seis componentes", () => {
  it("preserva as seis colunas monetárias do P&L em comparação", () => {
    const { container } = render(<ReportPL />);
    openReport("PL");
    showComparison();
    expect(screen.getByRole("columnheader", { name: "Real s/ IVA (€)" })).toBeInTheDocument();
    expect(hash(container)).toMatchInlineSnapshot(`"5af4f7c5d69f29e7f837d23812b37e275ca0ae45e2c5a1918ca019cbefc3f7ab"`);
  });

  it("preserva o DOM dos cinco relatórios, fechado e detalhado", () => {
    const baseline: Record<string, string> = {};
    for (const [name, Report] of Object.entries(reports)) {
      const { container } = render(<Report />);
      baseline[`${name}:initial`] = hash(container);
      openReport(name as ReportName);
      baseline[`${name}:detail`] = hash(container);
      if (name === "CashFlow") {
        fireEvent.click(screen.getByRole("switch", { name: "Separar por evento" }));
        baseline["CashFlow:events"] = hash(container);
      }
      cleanup();
    }
    expect(baseline).toMatchInlineSnapshot(`
      {
        "Brasil:detail": "39b2236e1eaf6b3a381bd3e5190ec9d0fd4d35dcb70d8ac9ff4871857c9b7d08",
        "Brasil:initial": "e03ea4f795f6c25d7a7b965aae2b7a0375cb61630479c7bdf1a6a68473ce01a1",
        "CashFlow:detail": "b1fc7ff5862ecd203724b928f9aa6199085a1e2cf4bbf93ef446f387f5ba6bd3",
        "CashFlow:events": "3c489f871971a82ada179afc1e6dbbe085eee908833b30dbfca978d52cd22f88",
        "CashFlow:initial": "36dfdc324d34e73a195658ba753e42d43f2765947088c9433373b6f6d9f449b8",
        "DRE:detail": "80c3cc834c7f037e934c4145e3ce7ce2bc9db0177258f3fa0d9199ca893d4b3f",
        "DRE:initial": "948ba562b45bf1964c65ee613fc85c96aab073ca698a86e70d7ffe9491e249df",
        "Empresarial:detail": "3030db3fbdc34e5040f6128f16882b9b0e10d47ec3eda0bed8002b1073949d8f",
        "Empresarial:initial": "3030db3fbdc34e5040f6128f16882b9b0e10d47ec3eda0bed8002b1073949d8f",
        "PL:detail": "e8f7af7d9d9a38d70a566b4f8077e3ac99ebd799de5e09c4bb0efb8299e57a35",
        "PL:initial": "755cb513082c129d218abe1c2231821bd6ade464c9d4d19365fd7f57f65a8aba",
      }
    `);
  });

  it("preserva o bloco de Transações, os dois avisos e as irmãs da fatura", async () => {
    const { container } = renderTransactions();
    const page = hash(container);
    const dialog = await openDeletion();
    expect(dialog.textContent).toContain("Transação já liquidada (1234.56 €)");
    expect(dialog.textContent).toContain("crédito de fornecedor (1234.56 €)");
    expect(dialog.textContent).toContain(`${Number(1234.56).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
    expect({ page, dialog: hash(dialog) }).toMatchInlineSnapshot(`
      {
        "dialog": "dd8c737cb292c2a98f60c8970384f32b8524ff1c8e7743373d13d62fe79774cc",
        "page": "b46d43207098ed0446c5bb4bb125c29098b838ebbc2eb78278c8fc61604d4fb2",
      }
    `);
  });
});

describe("#498 P1c — apresentação monetária pela empresa activa", () => {
  it.each(Object.entries(reports))("BR: %s mostra Intl pt-BR, sem euros", (name, Report) => {
    setCompany("BR", "BRL");
    const { container } = render(<Report />);
    openReport(name as ReportName);
    if (name === "Empresarial") fireEvent.click(screen.getByRole("radio", { name: "Só transações" }));
    expect(container.textContent).toContain("R$\u00a01.234,56");
    expect(container.textContent).not.toContain("€");
    const headers: Partial<Record<ReportName, string[]>> = {
      DRE: ["S/ IVA (R$)", "IVA (R$)", "C/ IVA (R$)"],
      Brasil: ["Valor (R$)"],
      PL: ["Preço Unit. (R$)", "Valor s/ IVA (R$)", "IVA (R$)", "Total (R$)"],
    };
    for (const header of headers[name as ReportName] ?? []) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    if (name === "DRE") {
      // The formatter injected into the pure builder must also reach labels.
      expect(container.textContent).toContain("base: R$\u00a01.234,56 - R$\u00a0123,00 = R$\u00a01.111,56");
      expect(container.textContent).toContain("R$\u00a023,00");
    }
    if (name === "PL") {
      showComparison();
      for (const header of ["Real s/ IVA (R$)", "Variação (R$)"]) {
        expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
      }
    }
    if (name === "CashFlow") {
      expect(container.textContent).toContain("-R$\u00a010,01");
      expect(container.textContent).toContain("R$\u00a00,00");
      fireEvent.click(screen.getByRole("switch", { name: "Separar por evento" }));
      expect(screen.getAllByRole("cell").filter((cell) => cell.textContent === "R$\u00a01.234,56").length).toBeGreaterThan(1);
    }
    expect(document.body.textContent).not.toContain("€");
  });

  it("BR: Transações formata totais, ambos os avisos e as irmãs da fatura", async () => {
    setCompany("BR", "BRL");
    const { container } = renderTransactions();
    expect(container.textContent).toContain("Base: R$\u00a01.234,56");
    expect(container.textContent).toContain("Total: R$\u00a01.234,56");
    const dialog = await openDeletion();
    expect(dialog.textContent).toContain("Transação já liquidada (R$\u00a01.234,56)");
    expect(dialog.textContent).toContain("crédito de fornecedor (R$\u00a01.234,56)");
    expect(dialog.textContent).toContain("Irmã sintética — 2026-01-02 — R$\u00a01.234,56");
    expect(document.body.textContent).not.toContain("€");
  });

  it("BR: o total completo da operação e o subtotal visível usam R$", () => {
    setCompany("BR", "BRL");
    fixtures.queries.transactions = [{ ...tx, type: "expense", exclude_from_result: true, operation_key: "OP-498" }];
    fixtures.queries["operation-keys-distinct"] = [{ id: "OP-498", name: "OP-498" }];
    fixtures.queries["operation-key-totals"] = { count: 2, income: 0, expense: 1234.56, balance: -1234.56 };
    const { container } = renderTransactions();
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(screen.getByText("OP-498"));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(container.textContent).toContain("Receitas: R$\u00a00,00");
    expect(container.textContent).toContain("Despesas: R$\u00a01.234,56");
    expect(container.textContent).toContain("Saldo: -R$\u00a01.234,56");
    expect(container.textContent).toContain("receitas R$\u00a00,00, despesas R$\u00a01.234,56");
    expect(container.textContent).not.toContain("€");
  });

  it("BR: o grupo de reembolso mantém os valores agregados pago e total", () => {
    setCompany("BR", "BRL");
    fixtures.queries["reimbursement-index-for-tx-list-v2"] = {
      byTx: new Map([[tx.id, "refund"]]),
      notes: new Map([["refund", { noteId: "refund", code: "R-498/2026", employeeName: "Pessoa sintética", status: "approved" }]]),
      paymentTxIds: new Set(), totalChildCounts: new Map([["refund", 1]]),
    };
    const { container } = renderTransactions();
    const row = screen.getByText("R-498/2026").closest("tr")!;
    expect(row.textContent).toContain("R$\u00a01.234,56-R$\u00a01.234,56");
    expect(container.textContent).not.toContain("€");
  });

  it.each(Object.entries(reports))("%s reage a PT → BR → PT sem alterar bytes PT", (name, Report) => {
    const { container, rerender } = render(<Report />);
    openReport(name as ReportName);
    if (name === "Empresarial") fireEvent.click(screen.getByRole("radio", { name: "Só transações" }));
    const pt = hash(container);
    setCompany("BR", "BRL");
    rerender(<Report />);
    expect(container.textContent).toContain("R$\u00a01.234,56");
    expect(container.textContent).not.toContain("€");
    setCompany();
    rerender(<Report />);
    expect(hash(container)).toBe(pt);
  });

  it.each([
    [null, "EUR", {}],
    ["BR", "", {}],
    ["PT", "EUR", { isLoading: true }],
    ["PT", "EUR", { isError: true, error: new Error("fixture failure") }],
  ] as const)("contexto indisponível (%s/%s/%j): os cinco relatórios mostram —", (country, currency, overrides) => {
    for (const [name, Report] of Object.entries(reports)) {
      setCompany();
      const { container, rerender } = render(<Report />);
      openReport(name as ReportName);
      expect(container.textContent).toContain("€");
      setCompany(country, currency, overrides);
      rerender(<Report />);
      expect(container.textContent).toContain("—");
      expect(container.textContent).not.toMatch(/€|R\$/);
      cleanup();
    }
  });

  it("Transações e confirmação aberta reagem a PT → BR → indisponível → PT", async () => {
    const { container, rerender } = renderTransactions();
    const page = hash(container);
    const dialog = await openDeletion();
    const ptDialog = hash(dialog);
    const refresh = () => rerender(<MemoryRouter initialEntries={["/transactions?excluded=1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Transactions /></MemoryRouter>);
    setCompany("BR", "BRL");
    refresh();
    expect(dialog.textContent).toContain("Transação já liquidada (R$\u00a01.234,56)");
    expect(document.body.textContent).not.toContain("€");
    setCompany(null);
    refresh();
    expect(dialog.textContent).toContain("Transação já liquidada (—)");
    expect(dialog.textContent).toContain("crédito de fornecedor (—)");
    expect(dialog.textContent).toContain("Irmã sintética — 2026-01-02 — —");
    expect(document.body.textContent).not.toMatch(/€|R\$/);
    setCompany();
    refresh();
    expect(hash(container)).toBe(page);
    expect(hash(dialog)).toBe(ptDialog);
  });

  it("os seis componentes consomem o adapter sem branches por país", () => {
    for (const file of ["pages/Transactions.tsx", ...["ReportDRE", "ReportDREEmpresarial", "ReportDREBrasil", "ReportPL", "ReportCashFlow"].map((name) => `components/${name}.tsx`)]) {
      const source = readFileSync(`src/${file}`, "utf8");
      expect(source).toContain("useCompanyLocale()");
      expect(source).toContain("formatCurrency as formatLegacyCurrency");
      expect(source.match(/formatLegacyCurrency\(/g)).toHaveLength(1);
      expect(source).not.toMatch(/import\s*{[^}]*\bformatCurrency\s*[,}]/);
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    }
  });
});
