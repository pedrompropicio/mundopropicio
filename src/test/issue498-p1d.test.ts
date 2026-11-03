import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { resolveCompanyLocale, type CompanyLocaleResult } from "@/lib/company-locale";
import { applyPTNumberFormat } from "@/lib/excel-format";
import { buildDREForExport, exportDREToExcel, exportDREToPDF } from "@/lib/export-dre";
import { exportPLToExcel, exportPLToPDF } from "@/lib/export-pl";
import { exportEventBPToPDF } from "@/lib/export-event-bp-pdf";
import { exportPaymentListToExcel, exportPaymentListToPDF, formatAmountForBank } from "@/lib/export-payment-list";
import { exportBankStatementToExcel, exportBankStatementToPDF } from "@/lib/export-bank-statement";

// All delivery and data access are intercepted; fixtures are entirely synthetic.
const captured = vi.hoisted(() => ({
  pdf: [] as unknown[][],
  xlsx: [] as unknown[],
  books: [] as import("exceljs").Workbook[],
  data: {} as Record<string, unknown[]>,
}));

vi.mock("xlsx", async (original) => ({
  ...await original<typeof import("xlsx")>(),
  writeFile: vi.fn((...args: unknown[]) => captured.xlsx.push(args)),
}));

vi.mock("exceljs", async (original) => {
  const actual = (await original<{ default: typeof import("exceljs") }>()).default;
  return { default: { ...actual, Workbook: class extends actual.Workbook {
    constructor() {
      super();
      captured.books.push(this);
      this.xlsx.writeBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    }
  } } };
});

vi.mock("jspdf", () => ({ default: class {
  constructor(options: unknown) {
    captured.pdf.push(["new", options]);
    const doc = new Proxy({
      internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
      lastAutoTable: { finalY: 100 },
    }, {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        return (...args: unknown[]) => {
          captured.pdf.push([String(key), ...args]);
          if (key === "getNumberOfPages") return 1;
          if (key === "getTextWidth") return String(args[0]).length;
          if (key === "splitTextToSize") return [args[0]];
          return doc;
        };
      },
    });
    return doc;
  }
} }));

vi.mock("jspdf-autotable", () => ({ default: (_doc: unknown, options: unknown) => {
  captured.pdf.push(["autoTable", options]);
} }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let single = false;
    const filters: Record<string, unknown> = {};
    const query: object = new Proxy({}, { get: (_target, key) => {
      if (key === "table") return table;
      if (key === "then") return (resolve: (value: unknown) => void) => {
        const rows = (captured.data[table] ?? []).filter((row: any) =>
          Object.entries(filters).every(([field, value]) => row[field] === value));
        resolve({ data: single ? rows[0] : rows, error: null });
      };
      return (...args: unknown[]) => {
        if (key === "maybeSingle") single = true;
        if (key === "eq") filters[String(args[0])] = args[1];
        return query;
      };
    } });
    return query;
  },
} }));
vi.mock("@/lib/supabase-paging", () => ({ fetchAllPagedQuery: async (query: PromiseLike<any>) => await query }));
vi.mock("@/lib/bp-income-synthetic", () => ({ computeTicketSynthetic: async () => ({
  initialLoad: 2000, currentLoad: 1500, soldQty: 1200,
  baselineNet: 1234.56, currentNet: 1500, realNet: 1000, ivaPct: 6,
}) }));
vi.mock("@/lib/bp-sponsorship-synthetic", () => ({ computeSponsorshipSynthetic: async () => ({
  hasTargets: true, excludedForecastIds: [], baselineNet: 1234.56, currentNet: 1500,
  realNet: 1000, segments: [{ name: "Segmento", target: 1500, closed: 1000 }],
}) }));

const events = [{ id: "event", name: "Evento teste", date: "2026-10-01", status: "active", event_type: "single", parent_event_id: null, partner_calc_basis: "net_result" }];
const categories = [
  { id: "income", code: "1", name: "Receitas", parent_id: null },
  { id: "sales", code: "1.1", name: "Vendas", parent_id: "income" },
  { id: "expense", code: "2", name: "Despesas", parent_id: null },
  { id: "cost", code: "2.1", name: "Custos", parent_id: "expense" },
];
const transactions = [
  { id: "tx-income", event_id: "event", type: "income", category_id: "sales", amount: 1234.56, iva_rate: 6, description: "Receita", status: "paid", paid_amount: 100 },
  { id: "tx-cost", event_id: "event", type: "expense", category_id: "cost", amount: 100.1234, iva_rate: 23, description: "Despesa", status: "pending", paid_amount: 0 },
  { id: "tx-credit", event_id: "event", type: "expense", category_id: "cost", amount: -10, iva_rate: 23, description: "Crédito", status: "pending", paid_amount: 0 },
];
const partners = [{ id: "partner", event_id: "event", percentage: 25, expense_includes_iva: true, suppliers: { name: "Sócio teste" } }];
const forecasts = transactions.slice(0, 2).map((tx, i) => ({
  ...tx, id: `forecast-${i}`, transaction_id: tx.id, specification: "Especificação",
  quantity: 2, unit_price: tx.amount / 2, status: "approved",
  account_categories: categories.find((c) => c.id === tx.category_id),
}));
const account = { name: "Conta teste", initial_balance: 1234.56, initial_balance_date: "2026-10-01" };
const bankLines = [
  { date: "2026-10-02", description: "Entrada", signedAmount: 1234.56, runningBalance: 2469.12, events: { name: "Evento teste" } },
  { date: "2026-10-03", description: "Saída", signedAmount: -100, runningBalance: 2369.12 },
];
const payment = {
  title: "Lista teste", payment_date: "2026-10-02", approved_by: "Aprovador teste", approved_at: "2026-10-01",
  items: [0, 1, 2].map((i) => ({
    description: `Pagamento ${i}`, event_name: "Evento teste", supplier_name: "Fornecedor teste", supplier_id: "supplier",
    iban: "CONTA-TESTE", amount: i === 2 ? 1234.56 : 100, iva_rate: 23, paid_amount: 0,
    due_date: "2026-10-02", date: "2026-10-01", invoice_ref: i < 2 ? "DOC-TESTE" : null,
    declared_withholding_amount: 10,
  })),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  captured.pdf = []; captured.xlsx = []; captured.books = [];
  captured.data = { events, event_forecasts: forecasts, transactions, event_partners: partners,
    event_forecast_partners: [], forecast_audit_log: [{ id: "audit", forecast_id: "forecast-0", field_name: "amount", old_value: "1", new_value: "2", changed_by: "Teste", created_at: "2026-10-01T12:00:00Z" }] };
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:teste"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function capture(name: string, companyLocale?: CompanyLocaleResult) {
  switch (name) {
    case "dre-excel": exportDREToExcel(events, transactions, categories, "transactions", [], [], [], null, partners, events, false, [], companyLocale); break;
    case "dre-pdf": exportDREToPDF(events, transactions, categories, "transactions", [], [], [], null, partners, events, false, [], companyLocale); break;
    case "dre-brasil-excel": exportDREToExcel(events, transactions, categories, "transactions", [], [], [], null, partners, events, true, [], companyLocale); break;
    case "dre-brasil-pdf": exportDREToPDF(events, transactions, categories, "transactions", [], [], [], null, partners, events, true, [], companyLocale); break;
    case "pl-excel": await exportPLToExcel(events, events, forecasts, transactions, categories, [], [], [], "comparison", [], [], [], "both", 2, undefined, false, null, false, false, companyLocale); break;
    case "pl-pdf": exportPLToPDF(events, events, forecasts, transactions, categories, [], [], [], "comparison", [], [], [], "both", 2, null, undefined, false, null, false, false, companyLocale); break;
    case "bp-pdf": await exportEventBPToPDF({ eventId: "event", includeChildren: true, companyLocale }); break;
    case "payment-excel": exportPaymentListToExcel({ ...payment, companyLocale }); break;
    case "payment-pdf": exportPaymentListToPDF({ ...payment, companyLocale }); break;
    case "bank-excel": exportBankStatementToExcel(account, bankLines, 1234.56, 2369.12, "2026-10-01", "2026-10-31", false, companyLocale); break;
    case "bank-pdf": exportBankStatementToPDF(account, bankLines, 1234.56, 2369.12, "2026-10-01", "2026-10-31", false, companyLocale); break;
    case "excel-format": {
      const ws = XLSX.utils.aoa_to_sheet([[1234.56, -10, 0, "texto"]]);
      applyPTNumberFormat(ws, companyLocale); captured.xlsx.push(ws); break;
    }
    default: throw new Error(name);
  }
  return JSON.parse(JSON.stringify({ pdf: captured.pdf, xlsx: captured.xlsx, books: captured.books.map((book) => book.model) }));
}

// Filled from the unmodified exporters before adding company context. Never regenerate.
const ptHashes: Record<string, string> = {
  "dre-excel": "5293b2e4859fcad032e5446401e2206c1f1817321e13b52420c252c413d5a60d",
  "dre-pdf": "e0e74293caf2d5772089423ff0a4361190035a80dba7b249cef04dd0e29eeda6",
  "dre-brasil-excel": "60d5dc154d19e6b880141a667893226ce4a308cd93d69f4da5eb7d4e27656315",
  "dre-brasil-pdf": "df3ffc61fab3f13f40b48a2478ff3fe3655ce7d21d3abc634318e7593bca0f99",
  "pl-excel": "5e818eff5e3df32505fa72b0de99b55f1e4262961c582678d7a6b82bef56154c",
  "pl-pdf": "7705ea4031063a92881d3b3b8702d165d92ae18034f7bc13c280c736f8637de7",
  "bp-pdf": "c96e73cbd44fe6f74aaf7e4bbb9c383486ce1d928895c62716df260dd4107f8b",
  "payment-excel": "f2bacae22a575625e28df03f720d633e2733608b2b9fe17927efa449b35d96f8",
  "payment-pdf": "2e8cb7dcb3d741d53de3fa5ee71cb09947615c53241f924378a5c20efabb687b",
  "bank-excel": "0b4e607535e7b37eac83a92fca2f779178af4ba0c3b3f5a1fa5f38aeeab2be58",
  "bank-pdf": "f03f82b70e460b110948e11a09de7c9936cbe559661bfa827d79a29100a41630",
  "excel-format": "486d4d0bc9cbbcebbd6c7e6cdf29a49631a559372deb5787a1966b6f3a29d0b1",
};

const pt = resolveCompanyLocale({ country: "PT", currency: "EUR" });
const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
const unavailable = resolveCompanyLocale({});
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Reverse only the allowed presentation changes, so the original hashes also
// protect all numbers, ordering, rows, styles, filenames and nonmonetary text in BR.
function normalizeBR(value: unknown, name: string): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeBR(item, name));
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeBR(item, name)]));
  if (typeof value !== "string") return value;
  if (value === (name === "pl-excel" ? '"R$ "#,##0.00;[Red]-"R$ "#,##0.00' : '"R$ "#.##0,00')) return name === "pl-excel"
    ? '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"'
    : '#.##0,00\\ "€"';
  return value.replace(/\(R\$\)/g, "(€)")
    .replace(/(-?)R\$\u00a0([\d.]+),(\d{2})/g, "$1$2,$3\u00a0€");
}

describe("#498 P1d — PT captures before implementation", () => {
  describe.each([
    ["omitted", undefined], ["PT/EUR", pt], ["unavailable", unavailable],
  ] as const)("context %s", (_label, ctx) => {
    it.each(Object.entries(ptHashes))("%s preserves all workbook data/styles or PDF calls", async (name, hash) => {
      expect(digest(await capture(name, ctx))).toBe(hash);
    });
  });

  it("keeps the bank paste format without grouping or symbols", () => {
    expect(formatAmountForBank(1234.56)).toBe("1234,56");
  });
});


describe("#498 P1d — explicit BR context", () => {
  it.each(Object.entries(ptHashes))("%s changes only money presentation", async (name, hash) => {
    const output = await capture(name, br);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain("€");
    expect(serialized).toContain("R$");
    if (name === "payment-excel") {
      expect(serialized).toContain("Valor (R$)");
      expect(serialized).not.toContain("Valor c/IVA");
    }
    const normalized = normalizeBR(output, name);
    expect(digest(name === "payment-excel"
      ? JSON.parse(JSON.stringify(normalized).replaceAll("Valor (€)", "Valor c/IVA (€)"))
      : normalized)).toBe(hash);
    if (name.endsWith("excel") || name === "excel-format") {
      expect(serialized).toContain(name === "pl-excel"
        ? '\\"R$ \\"#,##0.00;[Red]-\\"R$ \\"#,##0.00'
        : '\\"R$ \\"#.##0,00');
      if (name !== "excel-format") expect(serialized).toContain("(R$)");
    } else {
      expect(serialized).toContain(name === "payment-pdf" ? "R$\u00a01.518,51" : "R$\u00a01.234,56");
    }
  });

  it("accepts context as argument 12 without changing DRE figures or partner shares", () => {
    const legacy = buildDREForExport(transactions, categories, "transactions", [], [], [], "event", null, partners, events, false);
    const localized = buildDREForExport(transactions, categories, "transactions", [], [], [], "event", null, partners, events, false, br);
    expect(localized.find((line) => line.isDistribution)?.label).toContain("(base: R$\u00a01.234,56 - ");
    expect(normalizeBR(localized, "dre")).toEqual(legacy);
  });

  it("preserves the legacy overhead-array argument with and without context", () => {
    const closingCosts = [{ event_id: "event", category_id: "cost", amount: 80.12, iva_rate: 23 }];
    const legacy = buildDREForExport(transactions, categories, "transactions", [], [], [], "event", null, partners, events, true, closingCosts);
    const localized = buildDREForExport(transactions, categories, "transactions", [], [], [], "event", null, partners, events, true, closingCosts, br);
    expect(localized).toEqual(legacy);
    expect(legacy.find((line) => line.label === "DESPESAS")?.amountIncIva).toBeCloseTo((100.1234 - 10 + 80.12) * 1.23);
  });

  it.each([undefined, pt, unavailable, br])("preserves uncontrolled bank balances (%j)", (ctx) => {
    exportBankStatementToExcel(account, bankLines, 1234.56, 2369.12, "2026-10-01", "2026-10-31", true, ctx);
    const [wb] = captured.xlsx[0] as [XLSX.WorkBook];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Extrato, { header: 1 });
    expect(rows.filter((row) => row[5] === "Não controlado")).toHaveLength(4);
    exportBankStatementToPDF(account, bankLines, 1234.56, 2369.12, "2026-10-01", "2026-10-31", true, ctx);
    const texts = captured.pdf.filter((call) => call[0] === "text").map((call) => call[1]);
    expect(texts.filter((text) => text === "Não controlado")).toHaveLength(2);
    expect(texts.filter((text) => text === "N/C")).toHaveLength(4);
  });
});
