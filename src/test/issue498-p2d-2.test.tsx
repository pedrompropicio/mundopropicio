import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import { resolveCompanyLocale } from "@/lib/company-locale";
import ReportContasPagar from "@/components/ReportContasPagar";
import { BatchPaymentModal } from "@/components/BatchPaymentModal";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return {
    queries: {} as Record<string, any>,
    readers: {} as Record<string, () => Promise<any>>,
    writers: [] as (() => Promise<any>)[],
    writes: [] as { table: string; operation: string; payload: any }[],
    rows: [] as any[],
    allowService: false,
    hasBalance: vi.fn(),
    excel: vi.fn(), pdf: vi.fn(),
  };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// No query runs automatically; explicitly exercised readers/writers use only this recorder.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, queryFn }: any) => {
    f.readers[queryKey[0]] = queryFn;
    return { data: f.queries[queryKey[0]], isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: any) => {
    f.writers.push(mutationFn);
    return { mutate: vi.fn(), isPending: false };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (!f.allowService) throw new Error("#498: acesso a serviço MP proibido");
    const q: any = {
      insert: (payload: any) => { f.writes.push({ table, operation: "insert", payload }); return q; },
      update: (payload: any) => { f.writes.push({ table, operation: "update", payload }); return q; },
      select: () => q, eq: () => q, in: () => q, order: () => q, range: () => q,
      then: (resolve: any) => Promise.resolve({ data: f.rows, error: null }).then(resolve),
    };
    return q;
  },
  rpc: () => { throw new Error("#498: RPC proibida"); },
  functions: { invoke: () => { throw new Error("#498: edge proibida"); } },
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, hasPermission: () => true,
}) }));
vi.mock("@/lib/account-balance-rpc", () => ({
  accountHasBalanceFor: f.hasBalance,
  useAccountTrueBalance: () => 5000,
}));
vi.mock("@/lib/export-contas-pagar", () => ({
  exportContasPagarToExcel: f.excel, exportContasPagarToPDF: f.pdf,
}));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

const event = { id: "event", name: "Evento sintético A" };
const secondEvent = { id: "event-2", name: "Evento sintético B" };
const bank = { id: "bank", name: "Banco sintético", type: "bank" };
const tx = {
  id: "tx", description: "Serviço sintético", specification: "Fixture sem dados reais",
  type: "expense", amount: 1234.56, paid_amount: 34.56, iva_rate: null,
  currency: "EUR", original_amount: null, fx_rate: null, status: "approved",
  date: "2026-10-01", due_date: "2026-10-31", supplier_id: "supplier", event_id: event.id,
  events: { name: event.name }, suppliers: { name: "Fornecedor sintético", iban: "PT50000000000000000000000" },
  account_categories: { code: "3.1", name: "Serviços" }, payment_method: "transfer",
};
const secondTx = { ...tx, id: "tx-2", description: "Outra despesa sintética", amount: 100,
  paid_amount: 0, iva_rate: 6, event_id: secondEvent.id, events: { name: secondEvent.name } };
const usdTx = { ...tx, id: "usd", description: "Serviço USD sintético", amount: 90,
  paid_amount: 0, iva_rate: 0, currency: "USD", original_amount: 100, fx_rate: 0.9 };
const noop = () => {};

function setCompany(country = "PT", currency = "EUR", unavailable = false) {
  vi.mocked(useCompany).mockReturnValue({
    company: { id: "company", country, currency } as Company, companyId: "company",
    isLoading: unavailable, isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn(),
  });
}
function domHash() {
  // Freeze all DOM bytes except generated React/Radix IDs, following P1b/P1j.
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function openReport() {
  const view = render(<ReportContasPagar />);
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  return view;
}
function batchElement(transactions: any[] = [tx]) {
  return <BatchPaymentModal transactions={transactions} onClose={noop} initialPaymentDate="2026-11-03" />;
}
function chooseAccount() {
  fireEvent.click(screen.getByRole("button", { name: "Selecionar conta…" }));
  fireEvent.click(screen.getByRole("button", { name: bank.name }));
}
function writer() { return f.writers[f.writers.length - 1]; }

beforeEach(() => {
  vi.clearAllMocks();
  setCompany();
  f.queries = {
    "events-list": [event, secondEvent], "contas-pagar-report": [tx, secondTx],
    "financial-accounts-active": [bank], "transactions-with-installments": new Set(),
  };
  f.readers = {}; f.writers = []; f.writes = []; f.rows = []; f.allowService = false;
  f.hasBalance.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida"); }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => { vi.useRealTimers(); });

describe("#498 P2d-2 — baseline PT capturada antes de alterar os componentes", () => {
  it("relatório PT preserva DOM inicial, consultado e após interação com os filtros", () => {
    render(<ReportContasPagar />);
    const initial = domHash();
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    const searched = domHash();
    fireEvent.click(screen.getByRole("button", { name: "Todos os eventos" }));
    fireEvent.click(screen.getByText("Selecionar todos"));
    // Preserve the original event-checkbox interaction, including row bubbling.
    for (const checkbox of screen.getAllByRole("checkbox").slice(2)) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect({ initial, searched, afterEventFilter: domHash() }).toMatchInlineSnapshot(`
      {
        "afterEventFilter": "6d6f16555656893a1702c3cd7c789c6f7ab93f592cdd10bec012f088ae280fe5",
        "initial": "48ab657d8b668f21cd8272c4681617a040961c3ea036102f5cdbbdc39ee75b06",
        "searched": "6d6f16555656893a1702c3cd7c789c6f7ab93f592cdd10bec012f088ae280fe5",
      }
    `);
  });
  it("lote PT/EUR preserva DOM byte a byte", () => {
    render(batchElement());
    expect(document.body.textContent).not.toContain("Câmbio do dia");
    expect(domHash()).toMatchInlineSnapshot(`"7f189437b51e0770bb6f097e97e0622bc01f2b9a470fa4347bceb0dd808f5098"`);
  });
  it("lote USD/PT preserva DOM e bloco de câmbio, incluindo taxa preenchida", () => {
    const view = render(batchElement([usdTx]));
    expect(screen.getByText("Câmbio do dia (1 USD = X €)")).toBeInTheDocument();
    const withoutRate = domHash();
    fireEvent.change(view.container.querySelector('input[type="number"]')!, { target: { value: "0.95" } });
    expect({ withoutRate, withRate: domHash() }).toMatchInlineSnapshot(`
      {
        "withRate": "4caaf001960f8bbce395a3c00bb4caa3ac4f26014f55cc7f04091b6ae577ae54",
        "withoutRate": "8b67a64662725dc3fb94c47198565040ccaae278d816e4bcd94e299b793683d3",
      }
    `);
  });
});

describe("#498 P2d-2 — apresentação e IVA por política", () => {
  it("BR: relatório usa R$, IVA nulo=0 e transmite contexto e valores aos dois exports", () => {
    setCompany("BR", "BRL");
    f.queries["contas-pagar-report"] = [{ ...tx, currency: "BRL" }];
    const view = openReport();
    const row = view.container.querySelector("tbody tr")!;
    expect(row.textContent).toContain("0%");
    expect(row.textContent).toContain("R$\u00a01.234,56");
    expect(row.textContent).toContain("R$\u00a01.200,00");
    expect(view.container.querySelector("tfoot")?.textContent).toBe("Total GeralR$\u00a034,56R$\u00a01.234,56R$\u00a01.200,00");
    expect(document.body.innerHTML).not.toContain("€");
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    for (const exporter of [f.excel, f.pdf]) {
      expect(exporter).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        companyLocale: expect.objectContaining(resolveCompanyLocale({ country: "BR", currency: "BRL" })),
        items: [expect.objectContaining({ amount: 1234.56, iva_rate: 0, paid_amount: 34.56 })],
      }));
    }
  });

  it("BR: filtro de saldo exclui linhas já pagas sem repor IVA e preserva taxas explícitas", () => {
    setCompany("BR", "BRL");
    f.queries["contas-pagar-report"] = [{ ...tx, paid_amount: 1234.56 }, secondTx];
    const view = openReport();
    expect(screen.queryByText(tx.description)).not.toBeInTheDocument();
    expect(view.container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(view.container.querySelector("tbody tr")?.textContent).toContain("6%");
    expect(view.container.querySelector("tfoot")?.textContent).toContain("R$\u00a0106,00");
  });

  it("BR: subtotais agrupados usam IVA 0 quando ausente", () => {
    setCompany("BR", "BRL");
    f.queries["contas-pagar-report"] = [tx, { ...secondTx, iva_rate: undefined }];
    const view = openReport();
    fireEvent.click(screen.getByRole("button", { name: "Todos os eventos" }));
    fireEvent.click(screen.getByText("Selecionar todos").parentElement!.querySelector('button[role="checkbox"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(screen.getByText(`Subtotal ${event.name}`).parentElement?.textContent)
      .toBe(`Subtotal ${event.name}R$\u00a034,56R$\u00a01.234,56R$\u00a01.200,00`);
    expect(screen.getByText(`Subtotal ${secondEvent.name}`).parentElement?.textContent)
      .toBe(`Subtotal ${secondEvent.name}R$\u00a00,00R$\u00a0100,00R$\u00a0100,00`);
    expect(view.container.querySelector("tfoot")?.textContent).toContain("R$\u00a01.334,56");
  });

  it("relatório acompanha PT → BR → PT, incluindo os filtros memorizados", () => {
    const view = openReport();
    const before = domHash();
    setCompany("BR", "BRL");
    view.rerender(<ReportContasPagar />);
    expect(document.body.innerHTML).not.toContain("€");
    expect(view.container.querySelector("tfoot")?.textContent).toContain("R$\u00a01.340,56");
    setCompany();
    view.rerender(<ReportContasPagar />);
    expect(domHash()).toBe(before);
  });

  it("contexto indisponível mostra — e mantém EUR como referência de FX", () => {
    setCompany("BR", "BRL", true);
    const report = openReport();
    expect(report.container.querySelector("tfoot")?.textContent).toBe("Total Geral———");
    expect(document.body.innerHTML).not.toMatch(/€|R\$/);
    cleanup();
    const view = render(batchElement());
    expect(document.body.textContent).toContain("Saldo atual: —");
    expect(document.body.textContent).not.toContain("Câmbio do dia");
    expect(document.body.innerHTML).not.toMatch(/€|R\$/);
    view.rerender(batchElement([{ ...tx, currency: "BRL" }]));
    expect(screen.getByText("Câmbio do dia (1 BRL = X —)")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/€|R\$/);
  });
});

describe("#498 P2d-2 — liquidação nativa e estrangeira em memória", () => {
  it("BRL/BRL: liquida o saldo nativo sem FX, mesmo com metadados FX antigos", async () => {
    setCompany("BR", "BRL");
    render(batchElement([{ ...tx, currency: "BRL", original_amount: 999, fx_rate: 0.2 }]));
    expect(document.body.textContent).toContain("R$\u00a01.200,00");
    expect(document.body.textContent).not.toContain("Câmbio do dia");
    expect(document.body.innerHTML).not.toContain("€");
    chooseAccount();
    expect(screen.getByRole("button", { name: /Liquidar 1 do lote/ })).toBeEnabled();
    f.allowService = true;
    await writer()();
    expect(f.hasBalance).toHaveBeenCalledExactlyOnceWith(bank.id, 1199.95);
    expect(f.writes.filter(w => w.table === "transaction_payments")).toEqual([{
      table: "transaction_payments", operation: "insert", payload: expect.objectContaining({
        transaction_id: tx.id, amount: 1200, currency: "BRL", original_amount: null, fx_rate: null,
        closes_transaction: false, withholding_amount: 0, credit_amount: 0,
      }),
    }]);
    expect(f.writes.find(w => w.table === "transaction_audit_log")?.payload).toEqual([
      expect.objectContaining({ field_name: "Pagamento parcial", old_value: "34.56", new_value: "R$\u00a01.200,00 — Banco sintético" }),
    ]);
    expect(f.writes.find(w => w.table === "transactions")?.payload).toEqual({ account_id: bank.id });
  });

  it.each(["PT", "BR"])("USD/%s mantém câmbio do dia, montante original e fecho estrangeiro", async country => {
    setCompany(country, country === "BR" ? "BRL" : "EUR");
    const view = render(batchElement([usdTx]));
    expect(screen.getByText(`Câmbio do dia (1 USD = X ${country === "BR" ? "R$" : "€"})`)).toBeInTheDocument();
    fireEvent.change(view.container.querySelector('input[type="number"]')!, { target: { value: "0.95" } });
    chooseAccount();
    f.allowService = true;
    await writer()();
    expect(f.writes.find(w => w.table === "transaction_payments")?.payload).toMatchObject({
      amount: 95, currency: "USD", original_amount: 100, fx_rate: 0.95,
      fx_rate_source: "dia (manual)", closes_transaction: true,
    });
    expect(f.writes.find(w => w.table === "transaction_audit_log")?.payload).toEqual([
      expect.objectContaining({ field_name: "Pagamento parcial" }),
      expect.objectContaining({ field_name: "Câmbio do dia (USD) — lote", old_value: "0.900000", new_value: "0.950000 (variação: 0.050000)" }),
    ]);
    expect(document.body.innerHTML.includes("€")).toBe(country === "PT");
  });

  it("USD/PT sem taxa do dia conserva o fallback à taxa original, sem inventar taxa 1", async () => {
    render(batchElement([usdTx]));
    expect(screen.getByText("Sem câmbio do dia: usa-se o câmbio original de cada linha.")).toBeInTheDocument();
    chooseAccount();
    f.allowService = true;
    await writer()();
    expect(f.writes.find(w => w.table === "transaction_payments")?.payload).toMatchObject({
      amount: 90, currency: "USD", original_amount: 100, fx_rate: 0.9,
      fx_rate_source: "original da transação", closes_transaction: false,
    });
  });

  it.each([usdTx, { ...usdTx, currency: "EUR" }])("BRL: sugestão EUR não fornece taxa incorreta para $currency", transaction => {
    setCompany("BR", "BRL");
    const view = render(batchElement([transaction]));
    expect(screen.getByRole("button", { name: "Sugerir" })).toBeDisabled();
    expect(view.container.querySelector('input[type="number"]')).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Sugerir" }));
    expect(view.container.querySelector('input[type="number"]')).toHaveValue(null);
    expect(f.writes).toEqual([]);
  });

  it("EUR/EUR mantém IVA nulo=23, cêntimos e tolerância de saldo", async () => {
    render(batchElement());
    chooseAccount();
    f.allowService = true;
    await writer()();
    expect(f.hasBalance).toHaveBeenCalledWith(bank.id, 1483.90);
    expect(f.writes.find(w => w.table === "transaction_payments")?.payload).toMatchObject({
      amount: 1483.95, currency: "EUR", original_amount: null, fx_rate: null,
    });
  });

  it("moeda nativa vem da empresa mesmo com locale PT e BRL configurado", async () => {
    setCompany("PT", "BRL");
    render(batchElement([{ ...tx, currency: "BRL" }]));
    expect(document.body.textContent).not.toContain("Câmbio do dia");
    expect(document.body.textContent).toContain("1483,95\u00a0R$");
    chooseAccount();
    f.allowService = true;
    await writer()();
    expect(f.writes.find(w => w.table === "transaction_payments")?.payload).toMatchObject({
      amount: 1483.95, currency: "BRL", original_amount: null, fx_rate: null,
    });
  });

  it("BR: propagação de rateio usa IVA ausente=0 e preserva parcelas sem rateio", async () => {
    setCompany("BR", "BRL");
    render(batchElement([{ ...tx, amount: 100, paid_amount: 0, currency: "BRL" }]));
    chooseAccount();
    f.rows = [
      { id: "split", amount: 50, paid_amount: 0, split_percentage: 50, iva_rate: null },
      { id: "installment", amount: 50, paid_amount: 0, split_percentage: null, iva_rate: null },
    ];
    f.allowService = true;
    await writer()();
    expect(f.writes.filter(w => w.table === "transactions").map(w => w.payload)).toEqual([
      { account_id: bank.id },
      { paid_amount: 50, status: "paid", payment_date: "2026-11-03" },
    ]);
    expect(f.writes.filter(w => w.table === "transaction_payments")).toHaveLength(1);
  });

  it("BR: Pix conserva escolha explícita de outro canal e liquida em BRL", async () => {
    setCompany("BR", "BRL");
    const view = render(batchElement([{ ...tx, currency: "BRL", payment_method: "pix" }]));
    expect(screen.getByText("Pix")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Liquidar 0 do lote/ })).toBeDisabled();
    fireEvent.click(view.container.querySelector('input[type="checkbox"]')!);
    chooseAccount();
    expect(screen.getByRole("button", { name: /Liquidar 0 do lote \+ 1 de outro canal/ })).toBeEnabled();
    expect(document.body.textContent).not.toContain("Câmbio do dia");
    expect(document.body.innerHTML).not.toContain("€");
    f.allowService = true;
    await writer()();
    expect(f.writes.find(w => w.table === "transaction_payments")?.payload).toMatchObject({
      amount: 1200, currency: "BRL", original_amount: null, fx_rate: null,
    });
  });

  it("trocar contexto actualiza a classificação FX mesmo mantendo as mesmas transações", () => {
    const transactions = [{ ...tx, currency: "BRL" }];
    const view = render(batchElement(transactions));
    expect(screen.getByText("Câmbio do dia (1 BRL = X €)")).toBeInTheDocument();
    const before = domHash();
    setCompany("BR", "BRL");
    view.rerender(batchElement(transactions));
    expect(document.body.textContent).not.toContain("Câmbio do dia");
    expect(document.body.textContent).toContain("R$\u00a01.200,00");
    setCompany();
    view.rerender(batchElement(transactions));
    expect(domHash()).toBe(before);
  });

  it.each(["PT", "BR"])("%s: cobertura de fatura usa o default de IVA da política", async country => {
    setCompany(country, country === "BR" ? "BRL" : "EUR");
    render(batchElement([{ ...tx, invoice_group_id: "group", invoice_ref: "TEST-498" }]));
    f.rows = [
      { ...tx, invoice_group_id: "group", invoice_ref: "TEST-498", amount: 100, paid_amount: 0 },
      { ...tx, id: "outside", invoice_group_id: "group", invoice_ref: "TEST-498", amount: 100, paid_amount: 100 },
    ];
    f.allowService = true;
    expect(await f.readers["batch-invoice-group-coverage"]()).toEqual(
      country === "BR" ? [] : [{ ref: "TEST-498", open: 2, inBatch: 1 }],
    );
    expect(f.writes).toEqual([]);
  });

  it("os componentes usam o adapter e não introduzem condições por país ou campos de data", () => {
    for (const name of ["ReportContasPagar", "BatchPaymentModal"]) {
      const source = readFileSync(`src/components/${name}.tsx`, "utf8");
      expect(source).toContain("useCompanyLocale()");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
      expect(source).not.toMatch(/iva_rate\s*\?\?\s*23/);
      expect(source.match(/formatLegacyCurrency\(/g)).toHaveLength(1);
      expect(source).not.toContain('type="date"');
    }
  });
});
