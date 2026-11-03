import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { useCompany, type Company } from "@/hooks/useCompany";
import { resolveCompanyLocale, type CompanyLocaleResult } from "@/lib/company-locale";
import Transactions from "@/pages/Transactions";
import Reports from "@/pages/Reports";
import { PaymentTimeline } from "@/components/PaymentTimeline";
import PaymentListsTab from "@/components/PaymentListsTab";
import ReportContasPagar from "@/components/ReportContasPagar";
import { IvaToggle, useIvaMode } from "@/components/sales/IvaToggle";
import { exportContasPagarToExcel, exportContasPagarToPDF } from "@/lib/export-contas-pagar";
import { exportPaymentListToExcel, exportPaymentListToPDF } from "@/lib/export-payment-list";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return { queries: {} as Record<string, unknown>, mobile: false, pdf: [] as unknown[][], xlsx: [] as unknown[][] };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Callbacks never execute; any accidental service or network access fails.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: f.queries[queryKey[0] === "payment-lists" && queryKey[1] === "totals" ? "totals" : String(queryKey[0])],
    isLoading: false, isError: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#498 P1l: serviço MP proibido"); },
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false,
  role: "admin", hasPermission: () => true,
}) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => f.mobile }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: () => {} }));
vi.mock("@/hooks/useInstallmentTxIds", () => ({ useInstallmentTxIds: () => ({ data: new Set() }) }));
vi.mock("@/hooks/useOperationKeyTotals", () => ({ useOperationKeyTotals: () => ({ data: undefined, isLoading: false }) }));
vi.mock("@/hooks/useUserPreferences", () => ({ useUserPreferences: () => ({ consolidateRefunds: true, setConsolidateRefunds: vi.fn() }) }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TransactionOffsetsBlock", () => ({ OffsetLineNote: () => null }));
vi.mock("@/components/SepaExportModal", () => ({ default: () => null }));
vi.mock("@/components/PaymentListReceipts", () => ({ default: () => null }));
vi.mock("@/components/SepaBankExecutionPanel", () => ({ default: () => null }));
vi.mock("@/components/BPViewerModal", () => ({ default: () => null }));
vi.mock("@/components/LinkBpLineDialog", () => ({ default: () => null }));
vi.mock("@/components/RaiseBudgetDialog", () => ({ default: () => null }));
vi.mock("@/components/TransactionRow", () => ({ TransactionRow: () => <tr><td>Transação sintética</td></tr> }));
vi.mock("@/components/TransactionFormModal", () => ({ TransactionFormModal: () => null }));
vi.mock("@/components/TransactionEditModal", () => ({ TransactionEditModal: () => null }));
vi.mock("@/components/TransactionPaymentModal", () => ({ TransactionPaymentModal: () => null }));
vi.mock("@/components/TransactionAuditModal", () => ({ TransactionAuditModal: () => null }));
vi.mock("@/components/TransactionDocumentsModal", () => ({ TransactionDocumentsModal: () => null }));
vi.mock("@/components/TransactionPaymentsListModal", () => ({ TransactionPaymentsListModal: () => null }));
vi.mock("@/components/TransferFormModal", () => ({ TransferFormModal: () => null }));
vi.mock("@/components/BatchPaymentModal", () => ({ BatchPaymentModal: () => null }));
vi.mock("@/components/TicketOfficeSettlementLauncher", () => ({ TicketOfficeSettlementLauncher: () => null }));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));
vi.mock("xlsx", async original => ({ ...await original<typeof import("xlsx")>(),
  writeFile: vi.fn((...args: unknown[]) => f.xlsx.push(args)),
}));
vi.mock("jspdf", () => ({ default: class {
  constructor(options: unknown) {
    f.pdf.push(["new", options]);
    const doc = new Proxy({
      internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
      lastAutoTable: { finalY: 100 },
    }, { get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        f.pdf.push([String(key), ...args]);
        if (key === "getNumberOfPages") return 1;
        if (key === "getTextWidth") return String(args[0]).length;
        if (key === "splitTextToSize") return [args[0]];
        return doc;
      };
    } });
    return doc;
  }
} }));
vi.mock("jspdf-autotable", () => ({ default: (_doc: unknown, options: unknown) => f.pdf.push(["autoTable", options]) }));

const event = { id: "event", name: "Evento sintético", date: "2026-11-02", status: "active", event_type: "simple" };
const tx = { id: "tx", description: "Despesa sintética", specification: null, amount: 1234.56, iva_rate: 0, paid_amount: 100,
  status: "approved", type: "expense", date: "2026-11-01", due_date: "2026-11-02", payment_date: "2026-11-03",
  event_id: event.id, events: event, supplier_id: "supplier", suppliers: { name: "Fornecedor sintético", iban: "CONTA-SINTETICA" },
  category_id: "category", account_categories: { code: "3.1", name: "Serviços" }, exclude_from_result: true };
const extraTx = { ...tx, id: "extra", description: "Adição sintética" };
const list = { id: "list", title: "Lista sintética", payment_date: "2026-11-03", status: "pending_approval",
  created_at: "2026-11-01T12:00:00Z", created_by: "fixture@example.invalid", approved_by: null, approved_at: null };
const items = [{ id: "item", transaction_id: tx.id, payment_list_id: list.id, transactions: tx,
  removed_at: null, manually_marked_paid: false }];
const exportItem = { ...tx, event_name: event.name, supplier_name: tx.suppliers.name, iban: tx.suppliers.iban,
  category_name: "Serviços" };
const payableInput = { dateFrom: null, dateTo: null, eventNames: null, items: [exportItem] };
const paymentInput = { ...list, items: [exportItem] };

function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function ModeProbe() {
  const { withIva, setWithIva, ivaSuffix } = useIvaMode();
  const [params] = useSearchParams();
  return <><output>{JSON.stringify({ withIva, ivaSuffix, other: params.get("other") })}</output>
    <IvaToggle withIva={withIva} onChange={setWithIva} /></>;
}
const screens = ["transactions", "transactions-paid", "timeline", "lists", "lists-create", "lists-approve", "lists-add",
  "payables", "reports", "reports-mobile", "toggle", "toggle-net"] as const;
type ScreenName = typeof screens[number];
function element(name: ScreenName) {
  const content = name.startsWith("transactions") ? <Transactions /> : name === "timeline" ? <PaymentTimeline transaction={tx} canApprove />
    : name.startsWith("lists") ? <PaymentListsTab /> : name === "payables" ? <ReportContasPagar />
    : name.startsWith("reports") ? <Reports /> : <ModeProbe />;
  const path = name.startsWith("transactions") ? "/transactions?excluded=1" : name === "toggle-net" ? "/?iva=0&other=kept" : "/?other=kept";
  return <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{content}</MemoryRouter>;
}
function openScreen(name: ScreenName) {
  f.mobile = name === "reports-mobile";
  if (name === "transactions-paid") f.queries.transactions = [{ ...tx, status: "paid", paid_amount: tx.amount }];
  const view = render(element(name));
  if (name === "transactions") fireEvent.click(screen.getByRole("button", { name: "Em Aberto" }));
  if (name === "transactions-paid") fireEvent.click(screen.getByRole("button", { name: "Liquidadas" }));
  if (name === "lists-create") fireEvent.click(screen.getByRole("button", { name: "Nova Lista" }));
  if (name === "lists-approve") fireEvent.click(screen.getByTitle("Aprovar (total ou parcial)"));
  if (name === "lists-add") {
    fireEvent.click(screen.getByText(list.title));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar transações" }));
  }
  if (name === "payables") fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  if (name === "reports-mobile") fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  return view;
}
function hash(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}
function domHash() { return hash(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")); }
const exports = ["payables-xlsx", "payables-pdf", "payables-grouped-pdf", "lists-xlsx", "lists-pdf"] as const;
type ExportName = typeof exports[number];
function capture(name: ExportName, companyLocale?: CompanyLocaleResult) {
  f.pdf = []; f.xlsx = [];
  if (name === "payables-xlsx") exportContasPagarToExcel({ ...payableInput, companyLocale });
  if (name === "payables-pdf" || name === "payables-grouped-pdf")
    exportContasPagarToPDF({ ...payableInput, companyLocale, groupByEvent: name === "payables-grouped-pdf" });
  if (name === "lists-xlsx") exportPaymentListToExcel({ ...paymentInput, companyLocale });
  if (name === "lists-pdf") exportPaymentListToPDF({ ...paymentInput, companyLocale });
  return name.endsWith("xlsx") ? f.xlsx : f.pdf;
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); setCompany(); f.mobile = false; f.pdf = []; f.xlsx = [];
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1l: rede proibida"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  f.queries = {
    "events-list": [event], transactions: [tx], "contas-pagar-report": [tx],
    "payment-timeline": { payments: [{ id: "payment", amount: 100, status: "paid", payment_date: "2026-11-01" }],
      paymentListItems: [], reimbursementItems: [], creditUsages: [], partnerPaid: [] },
    "payment-lists": [list], "payment-list": list, "payment-list-items": items, "payment-list-items-approve": items,
    "approved-transactions-for-list": [tx, extraTx],
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P1l-1 — baselines PT capturadas antes de alterar produção", () => {
  it("fixa o DOM de todos os componentes, incluindo os três seletores de listas", () => {
    const hashes: Record<string, string> = {};
    for (const name of screens) {
      openScreen(name); expectIvaPresentation(name, true); hashes[name] = domHash(); cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "lists": "360ee9ad067b41a82830825f326eb64693a5c79d0f9f1be49ddda62a779e3267",
        "lists-add": "6271a44b10036e0cc7e80034d69839634f01661ffda0533af66d3b2598211d20",
        "lists-approve": "1513a260c4c4e0f3f5c0533c3a09c6b847af52bfe5045faf8274a50b4423116d",
        "lists-create": "523de01d8cbbf4f447696c37d945b2ccda744d1892d31a8fa107eaf67e1d0e01",
        "payables": "0e6b061a40378750f1cea3bf58b76c2d38dd6bc1b8e03ceda1c841314b3ad823",
        "reports": "7b71a4b6afb10ec1cb566b13499966aedf0eb6bb0d1c71b2befed1be0ee670a0",
        "reports-mobile": "0affea28dc9139663bb3e0d54d53ae84a2954984d7b3bf87bdba4d0483247e62",
        "timeline": "39c334c866d2a0859fa010125efe13a5586213de9ccbb2e69464e05a26dec810",
        "toggle": "6008e46fe24e01b57cc3ee15b930c773bb84681fe9594f6d8e95c780c293d07b",
        "toggle-net": "71ea27220eb37620dc785a37833033ee23039ea045943835ef235475b63fb130",
        "transactions": "55aa945f3505e474c840b03bb4caa777b300e7e22ea61072bad3f98f76bc5f63",
        "transactions-paid": "e2132266fb46a07dab37acccf4d988288ae9c522040d6e09a5b245292d2ca272",
      }
    `);
  });
  it("fixa os bytes dos exports PT e os cabeçalhos Excel/PDF", () => {
    const hashes: Record<string, string> = {};
    const headers: Record<string, unknown> = {};
    for (const name of exports) {
      hashes[name] = hash(capture(name));
      if (name.endsWith("xlsx")) {
        const wb = f.xlsx[0][0] as XLSX.WorkBook;
        headers[name] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[3];
      } else if (name.startsWith("payables")) {
        headers[name] = (f.pdf.find(row => row[0] === "autoTable")![1] as { head: unknown }).head;
      }
      expect(hash(capture(name, resolveCompanyLocale({ country: "PT", currency: "EUR" })))).toBe(hashes[name]);
      expect(hash(capture(name, resolveCompanyLocale({})))).toBe(hashes[name]);
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "lists-pdf": "b271ff73822eee7e5414a40ad5e38f42aae47187644070f08b47b247652d5eb0",
        "lists-xlsx": "96ec7cf84eeef96b068dba588a042a43d961d303171e9c0a3a8598ec5172ebd5",
        "payables-grouped-pdf": "092a6dbc43440f9ec6c857d2d7e7b1a01269a1d626f7c184696ac2422dc05c2c",
        "payables-pdf": "e62f8831f47addcc3d3795a848addb912f6401c1f8a88b5a8fc2ce200e3918b6",
        "payables-xlsx": "66334b9197b135ef951a50d0dd80376c270025dc71893fe6322c6299bc3049ce",
      }
    `);
    expect(headers).toMatchInlineSnapshot(`
      {
        "lists-xlsx": [
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
        "payables-grouped-pdf": [
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
        "payables-pdf": [
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
        "payables-xlsx": [
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
      }
    `);
  });
});

const pt = resolveCompanyLocale({ country: "PT", currency: "EUR" });
const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
const unavailable = resolveCompanyLocale({});
const forbidden = /c\/ ?IVA|Com IVA|Sem IVA|Auditoria de IVA/i;
function expectIvaPresentation(name: ScreenName, hasIva: boolean) {
  if (name.startsWith("transactions") || name === "payables" || ["lists-create", "lists-approve", "lists-add"].includes(name)) {
    expect(screen.getByRole("columnheader", { name: hasIva ? "Valor c/IVA" : "Valor" })).toBeInTheDocument();
  }
  if (name.startsWith("transactions")) expect(document.body.textContent).toContain(hasIva ? "c/IVA:" : "Total:");
  if (name === "timeline" || name === "payables") {
    expect(screen.getByText(hasIva ? name === "timeline" ? "Total c/ IVA" : "Total c/IVA" : "Total", { exact: true })).toBeInTheDocument();
  }
  if (name.startsWith("reports")) {
    expect(screen.queryByText("Auditoria de IVA") !== null).toBe(hasIva);
  }
  if (name.startsWith("toggle")) {
    expect(screen.queryByRole("button", { name: "Com IVA" }) !== null).toBe(hasIva);
    expect(screen.queryByRole("button", { name: "Sem IVA" }) !== null).toBe(hasIva);
    expect(screen.getByRole("status").textContent).toBe(JSON.stringify({
      withIva: !hasIva || name !== "toggle-net", ivaSuffix: hasIva && name === "toggle-net" ? "?iva=0" : "", other: "kept",
    }));
  }
}

describe("#498 P1l-1 — apresentação por capability IVA", () => {
  it.each(screens)("BR: %s usa os rótulos simples, sem referências ao IVA do lote", name => {
    setCompany("BR", "BRL");
    openScreen(name);
    expectIvaPresentation(name, false);
    expect(document.body.textContent).not.toMatch(forbidden);
  });

  it.each(screens)("%s acompanha PT → BR → PT com todos os bytes PT preservados", name => {
    const view = openScreen(name);
    expectIvaPresentation(name, true);
    const baseline = domHash();
    setCompany("BR", "BRL"); view.rerender(element(name));
    expectIvaPresentation(name, false);
    expect(document.body.textContent).not.toMatch(forbidden);
    setCompany(); view.rerender(element(name));
    expectIvaPresentation(name, true);
    expect(domHash()).toBe(baseline);
  });

  it.each([
    [null, "EUR", {}], ["BR", "", {}],
    ["BR", "BRL", { isLoading: true }], ["BR", "BRL", { isError: true, error: new Error("fixture failure") }],
  ] as const)("unavailable (%s/%s/%j) recupera os rótulos e controlos PT", (country, currency, overrides) => {
    for (const name of screens) {
      setCompany("BR", "BRL");
      const view = openScreen(name);
      setCompany(country, currency, overrides); view.rerender(element(name));
      expectIvaPresentation(name, true);
      cleanup();
    }
  });

  it.each(["PT", "BR"])("%s: o setter mantém o modo autorizado e conserva os outros parâmetros", country => {
    setCompany(country, country === "BR" ? "BRL" : "EUR");
    function SetterProbe() {
      const { withIva, setWithIva, ivaSuffix } = useIvaMode();
      const [params] = useSearchParams();
      return <><output>{JSON.stringify({ withIva, ivaSuffix, params: params.toString() })}</output>
        <button onClick={() => setWithIva(false)}>Pedir modo sem IVA</button>
        <button onClick={() => setWithIva(true)}>Pedir modo com IVA</button></>;
    }
    render(<MemoryRouter initialEntries={["/?iva=0&other=kept"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SetterProbe /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Pedir modo sem IVA" }));
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual(country === "BR"
      ? { withIva: true, ivaSuffix: "", params: "other=kept" }
      : { withIva: false, ivaSuffix: "?iva=0", params: "iva=0&other=kept" });
    fireEvent.click(screen.getByRole("button", { name: "Pedir modo com IVA" }));
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({ withIva: true, ivaSuffix: "", params: "other=kept" });
  });

  it("BR: IvaToggle isolado não mostra botões nem aviso mesmo recebendo withIva=false", () => {
    setCompany("BR", "BRL");
    const onChange = vi.fn();
    const view = render(<IvaToggle withIva={false} onChange={onChange} />);
    expect(view.container).toBeEmptyDOMElement();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(exports)("%s: BR não contém os rótulos de IVA; PT, omissão e unavailable preservam os bytes", name => {
    const baseline = hash(capture(name, pt));
    const brCapture = capture(name, br);
    expect(JSON.stringify(brCapture)).not.toMatch(forbidden);
    if (name.endsWith("xlsx")) {
      const wb = f.xlsx[0][0] as XLSX.WorkBook;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const column = name === "payables-xlsx" ? 9 : 10;
      expect(rows[3][column]).toBe("Valor (R$)");
      expect(rows[4][column]).toBe(1234.56);
    } else if (name.startsWith("payables")) {
      const table = f.pdf.find(row => row[0] === "autoTable")![1] as { head: string[][]; body: string[][] };
      expect(table.head[0]).toContain("Valor");
      expect(table.body[0]).toContain("R$\u00a01.234,56");
      if (name === "payables-grouped-pdf") expect(JSON.stringify(f.pdf)).toContain("TOTAL GERAL — Valor:");
    }
    expect(hash(capture(name))).toBe(baseline);
    expect(hash(capture(name, unavailable))).toBe(baseline);
    expect(hash(capture(name, pt))).toBe(baseline);
  });

  it("todos os consumidores novos delegam em companyHasIva sem branches por país", () => {
    for (const file of ["pages/Transactions.tsx", "components/PaymentTimeline.tsx", "components/PaymentListsTab.tsx",
      "components/ReportContasPagar.tsx", "pages/Reports.tsx", "components/sales/IvaToggle.tsx",
      "lib/export-contas-pagar.ts", "lib/export-payment-list.ts"]) {
      const source = readFileSync(`src/${file}`, "utf8");
      expect(source).toContain("companyHasIva(");
      if (!file.startsWith("lib/")) expect(source).toContain("useCompanyLocale()");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    }
  });
});
