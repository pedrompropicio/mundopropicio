import React from "react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCompany, type Company } from "@/hooks/useCompany";
import { resolveCompanyLocale, type CompanyLocaleResult } from "@/lib/company-locale";
import Transactions from "@/pages/Transactions";
import Reports from "@/pages/Reports";
import { PaymentTimeline } from "@/components/PaymentTimeline";
import PaymentListsTab from "@/components/PaymentListsTab";
import ReportContasPagar from "@/components/ReportContasPagar";
import { IvaToggle, useIvaMode } from "@/components/sales/IvaToggle";
import { exportContasPagarToExcel, exportContasPagarToPDF } from "@/lib/export-contas-pagar";
import { exportPaymentListToExcel } from "@/lib/export-payment-list";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return { queries: {} as Record<string, unknown>, mobile: false, pdf: [] as unknown[][], xlsx: [] as unknown[][] };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Callbacks never run: all data is synthetic and service access fails closed.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: f.queries[queryKey.slice(0, 2).join(":")] ?? f.queries[String(queryKey[0])], isLoading: false, isError: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => { throw new Error("#498: serviço MP proibido"); },
  rpc: () => { throw new Error("#498: RPC proibida"); },
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false, hasPermission: () => true, permissions: [],
}) }));
vi.mock("@/contexts/CompanyBrandingContext", () => ({ useCompanyBranding: () => ({ logoUrl: null, displayName: "Empresa sintética" }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => f.mobile }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: () => {} }));
vi.mock("@/hooks/useInstallmentTxIds", () => ({ useInstallmentTxIds: () => ({ data: new Set<string>() }) }));
vi.mock("@/hooks/useOperationKeyTotals", () => ({ useOperationKeyTotals: () => ({ isLoading: false }) }));
vi.mock("@/hooks/useUserPreferences", () => ({ useUserPreferences: () => ({ consolidateRefunds: true, setConsolidateRefunds: vi.fn() }) }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TransactionFormModal", () => ({ TransactionFormModal: () => null }));
vi.mock("@/components/TransactionEditModal", () => ({ TransactionEditModal: () => null }));
vi.mock("@/components/TransactionPaymentModal", () => ({ TransactionPaymentModal: () => null }));
vi.mock("@/components/TransactionAuditModal", () => ({ TransactionAuditModal: () => null }));
vi.mock("@/components/TransactionDocumentsModal", () => ({ TransactionDocumentsModal: () => null }));
vi.mock("@/components/TransactionPaymentsListModal", () => ({ TransactionPaymentsListModal: () => null }));
vi.mock("@/components/TransferFormModal", () => ({ TransferFormModal: () => null }));
vi.mock("@/components/BatchPaymentModal", () => ({ BatchPaymentModal: () => null }));
vi.mock("@/components/SepaPaymentModal", () => ({ SepaPaymentModal: () => null }));
vi.mock("@/components/TicketOfficeSettlementLauncher", () => ({ TicketOfficeSettlementLauncher: () => null }));
vi.mock("@/components/BPViewerModal", () => ({ default: () => null }));
vi.mock("@/components/LinkBpLineDialog", () => ({ default: () => null }));
vi.mock("@/components/RaiseBudgetDialog", () => ({ default: () => null }));
vi.mock("@/components/TransactionRow", () => ({ TransactionRow: () => <tr><td>Transação sintética</td></tr> }));
vi.mock("xlsx", async original => ({ ...await original<typeof import("xlsx")>(),
  writeFile: vi.fn((...args: unknown[]) => f.xlsx.push(args)),
}));
vi.mock("jspdf", () => ({ default: class {
  constructor(options: unknown) {
    f.pdf.push(["new", options]);
    const doc = new Proxy({ internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } }, lastAutoTable: { finalY: 100 } }, {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        return (...args: unknown[]) => { f.pdf.push([String(key), ...args]); return doc; };
      },
    });
    return doc;
  }
} }));
vi.mock("jspdf-autotable", () => ({ default: (_doc: unknown, options: unknown) => f.pdf.push(["autoTable", options]) }));

const event = { id: "event", name: "Evento sintético", date: "2026-01-02", status: "active", event_type: "simple" };
const tx = { id: "tx", type: "expense", event_id: event.id, events: event, description: "Despesa sintética", amount: 1234.56,
  iva_rate: 0, paid_amount: 100, status: "approved", date: "2026-01-02", due_date: "2026-01-03", exclude_from_result: true,
  suppliers: { name: "Fornecedor sintético", iban: "PT50000201231234567890154" }, supplier_id: "supplier" };
const list = { id: "list", title: "Lista sintética", status: "pending_approval", created_by: "fixture@example.invalid", payment_date: "2026-01-03" };
const item = { description: tx.description, specification: null, event_name: event.name, supplier_name: tx.suppliers.name,
  iban: tx.suppliers.iban, category_name: "Custos", amount: tx.amount, iva_rate: 0, paid_amount: tx.paid_amount,
  date: tx.date, due_date: tx.due_date, status: tx.status };
const payable = { dateFrom: null, dateTo: null, eventNames: [event.name], items: [item] };
const payment = { title: list.title, payment_date: list.payment_date, approved_by: null, approved_at: null, items: [item] };
const pt = resolveCompanyLocale({ country: "PT", currency: "EUR" });
const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
const unavailable = resolveCompanyLocale({});

function ModeProbe() {
  const { withIva, setWithIva, ivaSuffix } = useIvaMode();
  return <><IvaToggle withIva={withIva} onChange={setWithIva} /><output>{String(withIva)}:{ivaSuffix}</output></>;
}
const screens = ["transactions-open", "transactions-paid", "timeline", "lists", "lists-create", "lists-approve", "lists-add",
  "payable", "reports-desktop", "reports-mobile", "iva-on", "iva-off"] as const;
type ScreenName = typeof screens[number];
function view(name: ScreenName) {
  const content = name.startsWith("transactions") ? <Transactions /> : name.startsWith("lists") ? <PaymentListsTab />
    : name === "timeline" ? <PaymentTimeline transaction={tx} canApprove /> : name === "payable" ? <ReportContasPagar />
      : name.startsWith("reports") ? <Reports /> : <ModeProbe />;
  const path = name.startsWith("transactions") ? "/transactions?excluded=1" : name === "iva-off" ? "/vendas?iva=0" : "/";
  return <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TooltipProvider>{content}</TooltipProvider></MemoryRouter>;
}
function openScreen(name: ScreenName) {
  f.mobile = name === "reports-mobile";
  const result = render(view(name));
  if (name === "transactions-open") fireEvent.click(screen.getByRole("button", { name: "Em Aberto" }));
  if (name === "transactions-paid") fireEvent.click(screen.getByRole("button", { name: /Liquidadas/ }));
  if (name === "lists-create") fireEvent.click(screen.getByRole("button", { name: /Nova Lista/ }));
  if (name === "lists-approve") fireEvent.click(screen.getByTitle("Aprovar (total ou parcial)"));
  if (name === "lists-add") {
    fireEvent.click(screen.getByRole("button", { name: list.title }));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar transações/ }));
  }
  if (name === "payable") fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  if (name === "reports-mobile") fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  return result;
}
function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function domHash() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
const exports = ["payment-excel", "payable-excel", "payable-pdf", "payable-grouped-pdf"] as const;
function capture(name: typeof exports[number], companyLocale?: CompanyLocaleResult) {
  f.pdf = []; f.xlsx = [];
  if (name === "payment-excel") exportPaymentListToExcel({ ...payment, companyLocale });
  else if (name === "payable-excel") exportContasPagarToExcel({ ...payable, companyLocale });
  else exportContasPagarToPDF({ ...payable, companyLocale, groupByEvent: name === "payable-grouped-pdf" });
  return name.endsWith("excel") ? XLSX.utils.sheet_to_json<unknown[]>(
    (f.xlsx[0][0] as XLSX.WorkBook).Sheets[(f.xlsx[0][0] as XLSX.WorkBook).SheetNames[0]], { header: 1 },
  ) : f.pdf;
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); setCompany(); f.mobile = false;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  f.queries = { events: [event], "events-list": [event], transactions: [tx, { ...tx, id: "paid", status: "paid", paid_amount: tx.amount }],
    "account-categories": [], "contas-pagar-report": [tx], "payment-lists": [list], "payment-lists:totals": { totals: { list: tx.amount } },
    "payment-list": list, "payment-list-items": [{ id: "list-item", transactions: tx }],
    "payment-list-items-approve": [{ id: "list-item", transactions: tx }],
    "approved-transactions-for-list": [{ ...tx, id: "eligible" }],
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P1l-1 — baseline PT capturada antes da implementação", () => {
  it("preserva os 12 hashes SHA-256 de DOM, incluindo os três pickers e os dois menus", () => {
    const hashes: Record<string, string> = {};
    for (const name of screens) { openScreen(name); hashes[name] = domHash(); cleanup(); }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "iva-off": "3cce507979fd8af01814fdabf1bcbcd29bc331588f7fc1fdd8064534db8b988b",
        "iva-on": "7c1085fd3c37ea4af862eade844fe3c9478d5aff49e5f768022251b38f99bd3a",
        "lists": "ed4ab4b5e533cb46a3645caa13b55a9247954fa7858cab4a597148d9cac06e75",
        "lists-add": "57ef257fe96aec82eadc541482fd37fba70923b8a1851172444fd36b869a083d",
        "lists-approve": "bf1d4ee3906752e68fcf497dd994c5f1dd9435a03a50e87b178bf03a562da814",
        "lists-create": "5565293b95fa5cc8b71f0aa99b72f79015ddf9c2c8a742118ad9b3bc99ac754e",
        "payable": "8b07b1f9cedf1b40cbc5cc94d272afc64520e9dbcc348c22d01c45a68041c669",
        "reports-desktop": "7b71a4b6afb10ec1cb566b13499966aedf0eb6bb0d1c71b2befed1be0ee670a0",
        "reports-mobile": "0affea28dc9139663bb3e0d54d53ae84a2954984d7b3bf87bdba4d0483247e62",
        "timeline": "efd8b20f43d13f359c03cffecf690ba837c8ea2f023427111e983ea26838ed98",
        "transactions-open": "e320ee83706b97a38af4dc47790bb8d6c228902e6e0aa0068b9f7ae1f2d5a638",
        "transactions-paid": "52f937344d4318063eaf76cfcc0bf4258ef49ae8485d59bd03c22162c736817a",
      }
    `);
  });

  it("fixa os cabeçalhos e total geral dos exports PT, omitido e indisponível", () => {
    const headers: Record<string, unknown> = {};
    for (const name of exports) {
      const original = capture(name);
      expect(capture(name, pt)).toEqual(original);
      expect(capture(name, unavailable)).toEqual(original);
      headers[name] = name.endsWith("excel") ? original.find(row => row[0] === "#")
        : original.filter(row => row[0] === "autoTable" || (row[0] === "text" && String(row[1]).startsWith("TOTAL GERAL")))
          .map(row => row[0] === "autoTable" ? (row[1] as { head: string[][] }).head : row[1]);
    }
    expect(headers).toMatchInlineSnapshot(`
      {
        "payable-excel": [
          "#",
          "Data",
          "Evento",
          "Fornecedor",
          "Descrição",
          "Especificação",
          "Estado",
          "Valor Base (€)",
          "IVA (%)",
          "Valor c/IVA (€)",
          "Já Pago (€)",
          "Saldo (€)",
          "Vencimento",
        ],
        "payable-grouped-pdf": [
          [
            [
              "#",
              "Data",
              "Fornecedor",
              "Descrição",
              "Estado",
              "Valor c/IVA",
              "Pago",
              "Saldo",
              "Vencimento",
            ],
          ],
          "TOTAL GERAL — Valor c/IVA: 1.234,56 €  |  Pago: 100,00 €  |  Saldo: 1.134,56 €",
        ],
        "payable-pdf": [
          [
            [
              "#",
              "Data",
              "Evento",
              "Fornecedor",
              "Descrição",
              "Estado",
              "Valor c/IVA",
              "Pago",
              "Saldo",
              "Vencimento",
            ],
          ],
        ],
        "payment-excel": [
          "#",
          "Evento",
          "Categoria",
          "Descrição",
          "Especificação",
          "Fornecedor",
          "Nº Fatura",
          "IBAN / Dados Pgto",
          "Valor Base (€)",
          "IVA (%)",
          "Valor c/IVA (€)",
          "Ret. IRS (€)",
          "Líquido a pagar (€)",
          "Já Pago (€)",
          "Saldo (€)",
          "Vencimento",
        ],
      }
    `);
  });
});

describe("#498 P1l-1 — empresa sem IVA", () => {
  it.each(screens)("BR: %s não apresenta rótulos nem controlos de IVA", name => {
    setCompany("BR", "BRL"); openScreen(name);
    expect(document.body.textContent).not.toMatch(/c\/\s?IVA|Com IVA|Sem IVA|Auditoria de IVA/);
    if (name.startsWith("transactions") || name.startsWith("lists-")) {
      expect(screen.getByRole("columnheader", { name: "Valor" })).toBeInTheDocument();
    }
    if (name.startsWith("transactions")) expect(document.body.textContent).toContain("Total:");
    if (name === "timeline" || name === "payable") expect(screen.getByText("Total", { exact: true })).toBeInTheDocument();
    if (name.startsWith("iva")) expect(screen.getByRole("status")).toHaveTextContent("true:");
  });

  it.each(screens)("%s reage a PT → BR → PT sem alterar um byte do DOM PT", name => {
    const { rerender } = openScreen(name);
    const original = domHash();
    setCompany("BR", "BRL"); rerender(view(name));
    expect(document.body.textContent).not.toMatch(/c\/\s?IVA|Com IVA|Sem IVA|Auditoria de IVA/);
    setCompany(); rerender(view(name));
    expect(domHash()).toBe(original);
  });

  it.each(exports)("BR: %s usa Valor e preserva todos os restantes dados e opções", name => {
    const original = capture(name, pt);
    const output = capture(name, br);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toMatch(/c\/\s?IVA/);
    expect(serialized).toContain(name.endsWith("excel") ? "Valor (R$)" : '"Valor"');
    // Reverse precisely the labels and currency presentation authorized in P1l-1.
    const normalize = (value: unknown) => JSON.stringify(value)
      .replaceAll("Valor c/IVA", "Valor")
      .replace(/R\$\u00a0([\d.]+,\d{2})/g, "$1 €")
      .replaceAll("\u00a0€", " €")
      .replaceAll("(R$)", "(€)");
    expect(normalize(output)).toBe(normalize(original));
  });

  it.each([
    [null, "EUR", {}], ["BR", "", {}], ["PT", "EUR", { isLoading: true }],
    ["PT", "EUR", { isError: true, error: new Error("fixture error") }],
  ] as const)("indisponível %s/%s/%j mantém alternador e menu PT", (country, currency, overrides) => {
    setCompany(country, currency, overrides);
    openScreen("iva-off");
    expect(screen.getByRole("button", { name: "Com IVA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sem IVA" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("false:?iva=0");
    cleanup(); openScreen("reports-desktop");
    expect(screen.getByRole("link", { name: "Auditoria de IVA" })).toBeInTheDocument();
    cleanup(); openScreen("timeline");
    expect(screen.getByText("Total c/ IVA")).toBeInTheDocument();
    cleanup(); openScreen("payable");
    expect(screen.getByRole("columnheader", { name: "Valor c/IVA" })).toBeInTheDocument();
  });

  it("PT: os dois botões mantêm o estado e o sufixo de navegação existentes", () => {
    openScreen("iva-on");
    fireEvent.click(screen.getByRole("button", { name: "Sem IVA" }));
    expect(screen.getByRole("status")).toHaveTextContent("false:?iva=0");
    expect(screen.getByText(/Sem IVA não é receita líquida/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Com IVA" }));
    expect(screen.getByRole("status")).toHaveTextContent("true:");
    expect(screen.queryByText(/Sem IVA não é receita líquida/)).not.toBeInTheDocument();
  });

  it("BR: o hook recusa desligar IVA mesmo com ?iva=0 e o alternador isolado fica ausente", () => {
    function RequestOff() {
      const { withIva, setWithIva, ivaSuffix } = useIvaMode();
      return <><button onClick={() => setWithIva(false)}>request-off</button><output>{String(withIva)}:{ivaSuffix}</output></>;
    }
    setCompany("BR", "BRL");
    render(<MemoryRouter initialEntries={["/?iva=0"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><RequestOff /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("true:");
    fireEvent.click(screen.getByRole("button", { name: "request-off" }));
    expect(screen.getByRole("status")).toHaveTextContent("true:");
    cleanup();
    const onChange = vi.fn();
    const { container } = render(<IvaToggle withIva={false} onChange={onChange} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("#498 P1l-1 — fonte única da capacidade", () => {
  it("os componentes do lote usam o hook e companyHasIva sem novas decisões por país", () => {
    for (const file of ["pages/Transactions.tsx", "pages/Reports.tsx", "components/PaymentTimeline.tsx",
      "components/PaymentListsTab.tsx", "components/ReportContasPagar.tsx", "components/sales/IvaToggle.tsx"]) {
      const source = readFileSync(`src/${file}`, "utf8");
      expect(source).toContain("useCompanyLocale()");
      expect(source).toContain("companyHasIva(");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    }
  });

  it("os exports usam o helper puro com contexto opcional e sem decisões por país", () => {
    for (const name of ["contas-pagar", "payment-list"]) {
      const source = readFileSync(`src/lib/export-${name}.ts`, "utf8");
      expect(source).toContain("companyLocale?: CompanyLocaleResult");
      expect(source).toContain("companyHasIva(");
      expect(source).not.toMatch(/\bif\s*\([^)]*\bcountry\b/);
    }
  });

  it("os três BI continuam a consumir useIvaMode para impedir o modo sem IVA em BR", () => {
    for (const name of ["SalesBI", "SalesBIEvent", "SalesBIDetail"]) {
      expect(readFileSync(`src/pages/${name}.tsx`, "utf8")).toContain("useIvaMode()");
    }
  });
});
