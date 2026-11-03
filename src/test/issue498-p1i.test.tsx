import React from "react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCompany, type Company } from "@/hooks/useCompany";
import { resolveCompanyLocale, type CompanyLocaleResult } from "@/lib/company-locale";
import ReportMovementReconciliation from "@/components/ReportMovementReconciliation";
import ReportBPTransactions from "@/components/ReportBPTransactions";
import ReportTicketOfficeAudit from "@/components/ReportTicketOfficeAudit";
import * as movementExport from "@/lib/export-movement-reconciliation";
import * as auditExport from "@/lib/export-ticket-office-audit";
import * as bpExport from "@/lib/export-bp-transactions";
import { exportContasPagarToExcel, exportContasPagarToPDF } from "@/lib/export-contas-pagar";
import { exportEventTicketingToPDF } from "@/lib/export-event-ticketing-pdf";
import { exportBPMultiVersionComparisonPDF } from "@/lib/export-bp-version-multi-comparison-pdf";
import { buildMultiDiff } from "@/lib/bp-version-multi-diff";

const captured = vi.hoisted(() => ({
  pdf: [] as unknown[][], xlsx: [] as unknown[][],
  queries: {} as Record<string, unknown>, data: {} as Record<string, any[]>,
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Query callbacks are never executed by the reports. The event PDF uses only
// the allowlisted, in-memory bundle below. No credentials, files or services.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: captured.queries[String(queryKey[0])], isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (!(table in captured.data)) throw new Error(`#498: serviço proibido (${table})`);
    let single = false;
    const filters: Record<string, unknown> = {};
    const query: object = new Proxy({}, { get: (_target, key) => {
      if (key === "then") return (resolve: (v: unknown) => void) => {
        const rows = captured.data[table].filter(row => Object.entries(filters).every(([field, value]) => row[field] === value));
        resolve({ data: single ? rows[0] : rows, error: null });
      };
      return (...args: unknown[]) => {
        if (key === "maybeSingle") single = true;
        if (key === "eq" || key === "is") filters[String(args[0])] = args[1];
        return query;
      };
    } });
    return query;
  },
} }));
vi.mock("@/lib/supabase-paging", () => ({
  fetchAllPaged: async (query: (from: number, to: number) => PromiseLike<any>) => (await query(0, 999)).data,
  fetchAllPagedQuery: () => { throw new Error("#498: queryFn proibida"); },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useScenarioForecasts", () => ({ useScenarioForecasts: () => ({ data: [] }) }));
vi.mock("@/components/reports/ReportScenarioSelector", () => ({ ReportScenarioSelector: () => null }));
vi.mock("@/components/TransactionDocumentsModal", () => ({ TransactionDocumentsModal: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("xlsx", async original => ({ ...await original<typeof import("xlsx")>(),
  writeFile: vi.fn((...args: unknown[]) => captured.xlsx.push(args)),
}));
vi.mock("jspdf", () => ({ default: class {
  constructor(options: unknown) {
    captured.pdf.push(["new", options]);
    const doc = new Proxy({
      internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
      lastAutoTable: { finalY: 100 },
    }, { get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        captured.pdf.push([String(key), ...args]);
        if (key === "getNumberOfPages") return 1;
        if (key === "getTextWidth") return String(args[0]).length;
        if (key === "splitTextToSize") return [args[0]];
        return doc;
      };
    } });
    return doc;
  }
} }));
vi.mock("jspdf-autotable", () => ({ default: (_doc: unknown, options: unknown) => captured.pdf.push(["autoTable", options]) }));

const event = { id: "event", name: "Evento sintético", date: "2026-10-01", status: "active", event_type: "simple", parent_event_id: null };
const office = { id: "office", name: "Bilheteira sintética", financial_account_id: "office" };
const category = { id: "category", code: "2.1.01", name: "Custo sintético", parent_id: "group", type: "expense" };
const tx = { id: "tx", event_id: event.id, events: event, description: "Despesa sintética", specification: null,
  type: "expense" as const, amount: 1234.56, iva_rate: 0, paid_amount: 100, status: "approved", date: "2026-10-01",
  due_date: "2026-10-02", payment_date: null, account_id: office.id, financial_accounts: office,
  category_id: category.id, supplier_id: "supplier", suppliers: { name: "Fornecedor sintético" },
  invoice_ref: "DOC-498", pl_override_note: null, is_reimbursement: false };
const sale = { id: "sale", event_id: event.id, financial_account_id: office.id, zone_id: "zone", lot_id: "lot", quantity: 1,
  unit_price: 1234.56, total_value: 1234.56, sale_date: "2026-10-01" };
const movement = { id: "movement", date: tx.date, type: "Despesa", description: tx.description, supplierName: "Fornecedor sintético",
  accountName: office.name, status: "A Pagar", netAmount: 1234.56, ivaAmount: 0, amount: 1234.56, paidAmount: 100,
  balance: 1134.56, isExpense: true, eventId: event.id, eventName: event.name, dueDate: tx.due_date, invoiceRef: tx.invoice_ref };
const movementInput = { movements: [movement, { ...movement, id: "income", isExpense: false, type: "Receita", paidAmount: 0 }],
  accountLabel: office.name, eventLabel: event.name, dateFrom: "", dateTo: "", totalPaid: 100, totalReceived: 0 };
const payableInput = { dateFrom: null, dateTo: null, eventNames: [event.name], items: [{ ...tx, event_name: event.name,
  supplier_name: "Fornecedor sintético", category_name: category.name, iban: "CONTA-SINTETICA" }] };
const synthetic = [{ officeName: office.name, totalSales: 1234.56, totalDirectExpenses: 100, totalTransfers: 10, totalAdvances: 1,
  expectedBalance: 1123.56, events: [{ eventName: event.name, eventStatus: "active", isConciliated: true,
    totalSales: 1234.56, totalExpenses: 100, totalTransfers: 10, totalAdvances: 1, balance: 1123.56 }] }];
const analytical = [{ officeName: office.name, expectedBalance: 1123.56, lines: [
  { date: tx.date, type: "sale", description: "Venda sintética", eventName: event.name, eventId: event.id, amount: 1234.56 },
  { date: tx.date, type: "expense", description: tx.description, eventName: event.name, eventId: event.id, amount: -100 },
  { date: tx.date, type: "transfer", description: "Transferência sintética", eventName: "—", amount: -10 },
] }];
const bpInput: bpExport.BPTransactionsPDFData = { eventName: event.name, eventDate: event.date, totalForecast: 1234.56, totalActual: 1200,
  outOfBPTransactions: [{ ...tx, amount: -10 }], groupedData: [{ groupName: "Custos", groupCode: "2.1", totalForecast: 1234.56, totalActual: 1200,
    categories: [{ categoryName: category.name, categoryCode: category.code, forecastAmount: 1234.56, actualAmount: 1200,
      transactions: [{ ...tx, amount: 1200 }], forecastDetails: [{ id: "forecast", amount: 1234.56, eventName: event.name, description: "BP sintético", isOverhead: true }] }] }] };
const versions = [{ id: "a", label: "V1" }, { id: "b", label: "V2" }];
const result = buildMultiDiff({ versions, snapshotsByVersion: {
  a: [{ ...tx, amount: 1234.56 }], b: [{ ...tx, amount: 1200 }, { ...tx, id: "income", type: "income", amount: 0 }],
}, lookup: {} });

function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "company-fixture", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function hash(value: unknown) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function domHash(node: HTMLElement) { return hash(node.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")); }
const reports = { movement: ReportMovementReconciliation, bp: () => <ReportBPTransactions initialEventId="event" />, audit: ReportTicketOfficeAudit };
type ReportName = keyof typeof reports;
function view(name: ReportName) {
  const Report = reports[name];
  return <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TooltipProvider><Report /></TooltipProvider></MemoryRouter>;
}
function openReport(name: ReportName) {
  if (name === "movement") {
    fireEvent.click(screen.getByRole("checkbox", { name: /Período Completo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  }
  if (name === "bp") fireEvent.click(screen.getByRole("button", { name: "Expandir tudo" }));
  if (name === "audit") fireEvent.click(screen.getByText(office.name));
}
function openAnalytical() {
  fireEvent.click(screen.getByRole("button", { name: "Analítico" }));
  fireEvent.click(screen.getByText("Bilhetes Vendidos"));
  fireEvent.click(screen.getByText(event.name));
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  vi.clearAllMocks(); setCompany(); captured.pdf = []; captured.xlsx = [];
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida"); }));
  captured.queries = {
    "financial-accounts": [office], "events-list-all": [event], "suppliers-list-all": [], "movement-report-tx": [tx],
    "movement-report-audit": [], "tx-doc-counts-mr": {}, events: [event], "all-forecasts": [{ ...tx, id: "forecast" }],
    "transactions-with-suppliers": [tx], "account-categories": [{ id: "group", code: "2.1", name: "Custos", parent_id: null }, category],
    "partner-paid-expenses-all": [], "reimbursement-note-items-all": [], report_ticket_offices: [office],
    report_to_assignments: [{ financial_account_id: office.id, event_id: event.id, is_conciliated: true, events: event }],
    report_to_zones: [{ id: "zone", event_id: event.id, name: "Zona sintética" }], report_to_sales: [sale], report_to_sales_rpc: [sale],
    report_to_txns: [tx], report_to_advances: [],
  };
  captured.data = { events: [event], event_sessions: [], event_ticket_zones: [{ id: "zone", event_id: event.id, name: "Zona sintética", total_capacity: 2, session_id: null, version_id: null }],
    event_ticket_lots: [{ id: "lot", zone_id: "zone", name: "Lote sintético", lot_number: 1, lot_type: "regular", price: 1234.56, quantity: 1, iva_rate: 0, version_id: null }],
    ticket_sales: [sale], event_ticket_office_assignments: [] };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const exports = ["movement-excel", "movement-pdf", "payable-excel", "payable-pdf", "payable-grouped-pdf",
  "audit-excel", "audit-type-excel", "audit-event-excel", "audit-pdf", "audit-2-pdf", "audit-3-pdf",
  "bp-synthetic-pdf", "bp-analytical-pdf", "event-pdf", "comparison-pdf", "comparison-differences-pdf"] as const;
type ExportName = typeof exports[number];
async function capture(name: ExportName, companyLocale?: CompanyLocaleResult) {
  captured.pdf = []; captured.xlsx = [];
  switch (name) {
    case "movement-excel": movementExport.exportMovementReconciliationToExcel({ ...movementInput, companyLocale }); break;
    case "movement-pdf": movementExport.exportMovementReconciliationToPDF({ ...movementInput, companyLocale }); break;
    case "payable-excel": exportContasPagarToExcel({ ...payableInput, companyLocale }); break;
    case "payable-pdf": exportContasPagarToPDF({ ...payableInput, companyLocale }); break;
    case "payable-grouped-pdf": exportContasPagarToPDF({ ...payableInput, companyLocale, groupByEvent: true }); break;
    case "audit-excel": auditExport.exportTicketOfficeAuditToExcel(synthetic, analytical, "synthetic", undefined, companyLocale); break;
    case "audit-type-excel": auditExport.exportTicketOfficeAuditToExcel(synthetic, analytical, "analytical", "type", companyLocale); break;
    case "audit-event-excel": auditExport.exportTicketOfficeAuditToExcel(synthetic, analytical, "analytical", "event", companyLocale); break;
    case "audit-pdf": auditExport.exportTicketOfficeAuditToPDF(synthetic, analytical, { viewMode: "synthetic" }, companyLocale); break;
    case "audit-2-pdf": auditExport.exportTicketOfficeAuditToPDF(synthetic, analytical, { viewMode: "analytical", detailLevel: 2 }, companyLocale); break;
    case "audit-3-pdf": auditExport.exportTicketOfficeAuditToPDF(synthetic, analytical, { viewMode: "analytical", detailLevel: 3 }, companyLocale); break;
    case "bp-synthetic-pdf": bpExport.exportBPTransactionsToPDF(bpInput, "synthetic", companyLocale); break;
    case "bp-analytical-pdf": bpExport.exportBPTransactionsToPDF(bpInput, "analytical", companyLocale); break;
    case "event-pdf": await exportEventTicketingToPDF({ eventId: event.id, companyLocale }); break;
    case "comparison-pdf": exportBPMultiVersionComparisonPDF({ eventName: event.name, result, companyLocale, showOnlyDifferences: false }); break;
    case "comparison-differences-pdf": exportBPMultiVersionComparisonPDF({ eventName: event.name, result, companyLocale, showOnlyDifferences: true }); break;
  }
  return name.endsWith("excel") ? captured.xlsx : captured.pdf;
}

describe("#498 P1i — baseline PT fixada antes das alterações de produção", () => {
  it("preserva o DOM dos três relatórios e o detalhe analítico", () => {
    const hashes: Record<string, string> = {};
    for (const name of Object.keys(reports) as ReportName[]) {
      const { container } = render(view(name));
      hashes[`${name}:initial`] = domHash(container);
      openReport(name); hashes[`${name}:detail`] = domHash(container);
      if (name === "audit") { openAnalytical(); hashes["audit:analytical"] = domHash(container); }
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "audit:analytical": "dcf113ab4719618f9601d8326713c0b6f1251d763e91d108629953d30216ce02",
        "audit:detail": "657e82f46f80830d92bc22e42f36dc34b126934fa50260c1244121c0d91a1d60",
        "audit:initial": "eda67bd27af90cb89043a39fbead2b60c57304eacbecc7b56f2fa2ec78f77013",
        "bp:detail": "90178c5cfca145dc626165b3302ad4759391fef4413daab35e764d42e5fc4435",
        "bp:initial": "2c37a88fc04fa9a53bb7826481a8db76299aa4e0106d796a6555cefa81f03ac0",
        "movement:detail": "c12746cc79e1b5e82873c20d9aec2c8d3e300f5b12abf35e2679223b32bd7595",
        "movement:initial": "c0e9e89dc1c664c07bae57b76d45292e11d52918a207f4fa6082a82b71bff6a1",
      }
    `);
  });
  it("preserva as capturas Excel/PDF das seis libs, incluindo modos e versões", async () => {
    const hashes: Record<string, string> = {};
    for (const name of exports) hashes[name] = hash(await capture(name));
    expect(hashes).toMatchInlineSnapshot(`
      {
        "audit-2-pdf": "4a5374554dfa368b6231519cb1137beaf6afdf35e04f54f851b6ed47fed14825",
        "audit-3-pdf": "f1387f01e59c1ccac0c6ff7239d0f95f0038105554f2d28d68164ea7aa536732",
        "audit-event-excel": "2b7abcc87c37159754f5fdab1caa9203d7d875cb03943a5ae9aa209ab84897d0",
        "audit-excel": "82c4eab7ddde1e57fbd864224d87cae0687ba56d98cc5a6497e05fabca0b901f",
        "audit-pdf": "58e31722534fd3ef0b6a342f080f60586143c27280315fa87f24ba1197f3866d",
        "audit-type-excel": "1423694acc6b3cc7d8f440c88f14bc51923f14bfd5a64c069aa7157413166b87",
        "bp-analytical-pdf": "0dd3bfa1e3b344086479f07eb8655973e628c503af2b61783f4211e3700efe4e",
        "bp-synthetic-pdf": "632464ea46b7c1f6b8a05de95fa20335018710c73110ffd17d43abd810016ec4",
        "comparison-differences-pdf": "85208514385fea99644176727513a01d46876c55a5f866eb925d7966591cb807",
        "comparison-pdf": "85208514385fea99644176727513a01d46876c55a5f866eb925d7966591cb807",
        "event-pdf": "0359167397850908d30a87061133a7490b36579fef6b389b7ea24b8d73550520",
        "movement-excel": "95d1e790ab2925ad58c6eef9848be8e21919b0a4bb4ee54edc4cdb6a046cdc4f",
        "movement-pdf": "5b87af5613317b19897ffd5abc4cf7dc1e50be052ced3c41b201c33f6bba0b7f",
        "payable-excel": "df724c08fb1a1c09ef337f20e404ae6fd81efcaae8cd8e1d4d145f7c0d527cc8",
        "payable-grouped-pdf": "af5d79415b9c3bb149dd23331922131091b0c3b5d6a21ee22de82a5ea6db1099",
        "payable-pdf": "00fb68a8ce97245f9c95c44d7f99616a6b2f6be06b93c90939fbf95991aa3d56",
      }
    `);
  });
});

const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
const pt = resolveCompanyLocale({ country: "PT", currency: "EUR" });
const unavailable = resolveCompanyLocale({});

describe("#498 P1i — moeda da empresa no ecrã e nos exports", () => {
  it.each(Object.keys(reports) as ReportName[])("%s: BR e troca PT → BR → indisponível → PT", name => {
    const { container, rerender } = render(view(name)); openReport(name);
    const original = domHash(container);
    setCompany("BR", "BRL"); rerender(view(name));
    expect(container.textContent).toContain("R$\u00a01.234,56");
    expect(container.textContent).toContain("(R$)");
    expect(container.textContent).not.toContain("€");
    setCompany(null); rerender(view(name));
    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toMatch(/€|R\$/);
    setCompany(); rerender(view(name));
    expect(domHash(container)).toBe(original);
  });

  it.each([
    ["PT", "EUR", { isLoading: true }], ["PT", "EUR", { isError: true }], ["BR", "", {}],
  ] as const)("contexto incompleto (%s/%s/%j) nunca mostra moeda inferida", (country, currency, overrides) => {
    setCompany(country, currency, overrides);
    for (const name of Object.keys(reports) as ReportName[]) {
      const { container } = render(view(name)); openReport(name);
      expect(container.textContent).toContain("—");
      expect(container.textContent).not.toMatch(/€|R\$/);
      cleanup();
    }
  });

  it("auditoria: detalhe analítico por categoria e por evento usa o mesmo formatter", () => {
    const { container, rerender } = render(view("audit")); openAnalytical();
    const original = domHash(container);
    setCompany("BR", "BRL"); rerender(view("audit"));
    expect(screen.getByRole("columnheader", { name: "Valor (R$)" })).toBeInTheDocument();
    expect(screen.getByText(/— Zona sintética/).closest("tr")?.textContent).toContain("R$\u00a01.234,56");
    expect(screen.getByText(/— Zona sintética/).textContent).toContain("Venda 1x R$\u00a01.234,56");
    setCompany(); rerender(view("audit"));
    expect(domHash(container)).toBe(original);
    setCompany("BR", "BRL"); rerender(view("audit"));
    fireEvent.click(screen.getByRole("button", { name: "Por Evento" }));
    fireEvent.click(screen.getByText(event.name));
    fireEvent.click(screen.getByText("Bilhetes Vendidos"));
    expect(screen.getByRole("columnheader", { name: "Valor (R$)" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("€");
    setCompany(null); rerender(view("audit"));
    expect(container.textContent).not.toMatch(/€|R\$/);
    expect(screen.getByText(/— Zona sintética/).closest("tr")?.textContent).toContain("—");
  });

  it("reconciliação envia o contexto aos dois exports", () => {
    setCompany("BR", "BRL");
    const excel = vi.spyOn(movementExport, "exportMovementReconciliationToExcel");
    const pdf = vi.spyOn(movementExport, "exportMovementReconciliationToPDF");
    render(view("movement")); openReport("movement");
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    for (const spy of [excel, pdf]) expect(spy).toHaveBeenCalledWith(expect.objectContaining({ companyLocale: expect.objectContaining(br) }));
    expect(JSON.stringify(captured.xlsx)).toContain("IVA (R$)");
    expect(JSON.stringify(captured.pdf)).toContain("R$\u00a01.234,56");
  });

  it("auditoria envia contexto ao Excel e ao PDF pelo diálogo existente", () => {
    setCompany("BR", "BRL");
    const excel = vi.spyOn(auditExport, "exportTicketOfficeAuditToExcel");
    const pdf = vi.spyOn(auditExport, "exportTicketOfficeAuditToPDF");
    render(view("audit"));
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    expect(excel).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), "synthetic", "type", expect.objectContaining(br));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar PDF" }));
    expect(pdf).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), expect.objectContaining({ viewMode: "synthetic" }), expect.objectContaining(br));
    expect(JSON.stringify(captured.pdf)).toContain("R$\u00a01.234,56");
  });

  it("BP envia contexto ao PDF sintético e ao analítico", () => {
    setCompany("BR", "BRL");
    const pdf = vi.spyOn(bpExport, "exportBPTransactionsToPDF");
    render(view("bp"));
    fireEvent.keyDown(screen.getByRole("button", { name: /PDF/ }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("menuitem", { name: /Sintético/ }));
    expect(pdf).toHaveBeenLastCalledWith(expect.any(Object), "synthetic", expect.objectContaining(br));
    fireEvent.keyDown(screen.getByRole("button", { name: /PDF/ }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("menuitem", { name: /Analítico/ }));
    expect(pdf).toHaveBeenLastCalledWith(expect.any(Object), "analytical", expect.objectContaining(br));
    expect(JSON.stringify(captured.pdf)).toContain("Previsto (R$)");
  });

  it.each(exports)("%s: PT explícito e indisponível mantêm a captura sem contexto", async name => {
    const original = hash(await capture(name));
    expect(hash(await capture(name, pt))).toBe(original);
    expect(hash(await capture(name, unavailable))).toBe(original);
  });

  it.each(exports)("%s: BR formata sem mudar números, datas, ficheiros ou ordem", async name => {
    const original = JSON.stringify(await capture(name));
    const output = await capture(name, br);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain("€");
    if (name.endsWith("excel")) {
      const workbook = output[0][0] as import("xlsx").WorkBook;
      expect(serialized).toContain("(R$)");
      for (const sheet of Object.values(workbook.Sheets)) {
        const numeric = Object.values(sheet).filter(cell => cell?.t === "n");
        expect(numeric.length).toBeGreaterThan(0);
        expect(numeric.some(cell => cell.v === 1234.56)).toBe(true);
        for (const cell of numeric) expect(cell.z).toBe('"R$ "#.##0,00');
      }
      // Exact workbook structure/values retained; only labels and cell masks differ.
      const neutralWorkbook = (input: unknown) => JSON.stringify(input, (key, value) =>
        key === "z" ? "<mask>" : typeof value === "string" ? value.replaceAll("R$", "€") : value);
      expect(neutralWorkbook(output)).toBe(neutralWorkbook(JSON.parse(original)));
    } else {
      expect(serialized).toContain("R$\u00a01.234,56");
      const neutralMoney = (text: string) => text
        .replace(/(-?)R\$\u00a0([\d.]+,\d{2})/g, "$1$2 <currency>")
        .replace(/(-?[\d.]+,\d{2})\u00a0€/g, "$1 <currency>")
        .replaceAll("R$", "€");
      expect(neutralMoney(serialized)).toBe(neutralMoney(original));
    }
  });

  it("EventTicketing passa o contexto apenas na chamada autorizada", () => {
    const source = readFileSync("src/components/EventTicketing.tsx", "utf8");
    expect(source).toMatch(/exportEventTicketingToPDF\(\{\s*companyLocale,/);
  });

  it("componentes usam o hook e as libs não mantêm formatter monetário de módulo", () => {
    for (const name of ["ReportMovementReconciliation", "ReportBPTransactions", "ReportTicketOfficeAudit"]) {
      const source = readFileSync(`src/components/${name}.tsx`, "utf8");
      expect(source).toContain("useCompanyLocale()");
      expect(source.match(/formatLegacyCurrency\(/g)).toHaveLength(1);
      expect(source).not.toMatch(/\bif\s*\([^)]*\bcountry\b/);
    }
    for (const name of ["movement-reconciliation", "contas-pagar", "ticket-office-audit", "event-ticketing-pdf", "bp-transactions", "bp-version-multi-comparison-pdf"]) {
      const source = readFileSync(`src/lib/export-${name}.ts`, "utf8");
      expect(source).not.toMatch(/^function (?:fmtCur|fmtVal)\([^)]*\).*string|^const (?:fmt|formatCurrency)\s*=/m);
      expect(source).not.toMatch(/\bif\s*\([^)]*\bcountry\b/);
    }
  });
});
