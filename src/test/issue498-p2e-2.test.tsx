import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PaymentListsTab from "@/components/PaymentListsTab";
import { useCompany, type Company } from "@/hooks/useCompany";
import { resolveCompanyLocale } from "@/lib/company-locale";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return {
    queries: {} as Record<string, any>, readers: {} as Record<string, () => Promise<any>>,
    keys: {} as Record<string, unknown[]>, rows: {} as Record<string, any[]>, allowReads: false,
    excel: vi.fn(), pdf: vi.fn(), clipboard: vi.fn(), installmentIds: new Set<string>(),
  };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, queryFn }: any) => {
    const key = queryKey[0] === "payment-lists" && queryKey[1] === "totals" ? "totals" : queryKey[0];
    f.readers[key] = queryFn;
    f.keys[key] = queryKey;
    return { data: f.queries[key], isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Only explicitly invoked SELECT closures may use the in-memory reader. All writes fail.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (!f.allowReads) throw new Error("#498: acesso a serviço MP proibido");
    const q: any = {
      select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q, range: () => q,
      then: (resolve: any) => Promise.resolve({ data: f.rows[table] ?? [], error: null }).then(resolve),
    };
    return q;
  },
  rpc: () => { throw new Error("#498: RPC proibida"); },
  functions: { invoke: () => { throw new Error("#498: edge proibida"); } },
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false,
}) }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: () => {} }));
vi.mock("@/hooks/useInstallmentTxIds", () => ({ useInstallmentTxIds: () => ({ data: f.installmentIds }) }));
vi.mock("@/lib/export-payment-list", async original => ({
  ...await original<typeof import("@/lib/export-payment-list")>(),
  exportPaymentListToExcel: f.excel, exportPaymentListToPDF: f.pdf,
}));
vi.mock("@/components/TransactionDocumentsModal", () => ({ TransactionDocumentsModal: () => null }));
vi.mock("@/components/TransactionEditModal", () => ({ TransactionEditModal: () => null }));
vi.mock("@/components/TransactionOffsetsBlock", () => ({ OffsetLineNote: () => null }));
vi.mock("@/components/BatchPaymentModal", () => ({ BatchPaymentModal: () => null }));
vi.mock("@/components/SepaExportModal", () => ({ default: () => null }));
vi.mock("@/components/PaymentListReceipts", () => ({ default: () => null }));
vi.mock("@/components/SepaBankExecutionPanel", () => ({ default: () => null }));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));

const list = { id: "list", title: "Lista sintética", payment_date: "2026-11-03", status: "pending_approval",
  created_at: "2026-11-01T12:00:00Z", created_by: "fixture@example.invalid", approved_by: null, approved_at: null };
const tx = { id: "tx", description: "Serviço sintético A", specification: "Fixture sem dados reais",
  amount: 1000, iva_rate: null, paid_amount: 0, status: "approved", type: "expense", currency: "EUR",
  event_id: "event", category_id: "category", supplier_id: "supplier", invoice_group_id: "group", invoice_ref: "TEST-498",
  events: { name: "Evento sintético" }, suppliers: { name: "Fornecedor sintético", iban: "PT50000000000000000000000" },
  account_categories: { code: "3.1", name: "Serviços" }, payment_method: "transfer", date: "2026-10-01", due_date: "2026-10-31" };
const secondTx = { ...tx, id: "tx-2", description: "Serviço sintético B", amount: 234.56, iva_rate: undefined };
const extraTx = { ...tx, id: "extra", description: "Adição sintética A", invoice_group_id: "extra-group", invoice_ref: "TEST-EXTRA" };
const extraSecondTx = { ...secondTx, id: "extra-2", description: "Adição sintética B", invoice_group_id: "extra-group", invoice_ref: "TEST-EXTRA" };
const explicitTx = { ...tx, id: "explicit", description: "Taxa explícita sintética", invoice_group_id: null, invoice_ref: null,
  amount: 100, iva_rate: 6, paid_amount: 20, declared_withholding_amount: 10 };
const items = [tx, secondTx].map((transactions, i) => ({ id: `item-${i}`, payment_list_id: list.id, transactions,
  transaction_id: transactions.id, removed_at: null, manually_marked_paid: false }));
const screens = ["lista", "detalhe", "aprovação", "adição", "criação"] as const;
type ScreenName = typeof screens[number];

function setCompany(country = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  vi.mocked(useCompany).mockReturnValue({ company: { id: "company", country, currency } as Company,
    companyId: "company", isLoading: false, isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function domHash() {
  // Freeze every byte except generated React/Radix IDs, as in P1j and P2d-2.
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function openScreen(name: ScreenName) {
  const view = render(<PaymentListsTab />);
  if (name === "criação") fireEvent.click(screen.getByRole("button", { name: "Nova Lista" }));
  if (name === "aprovação") fireEvent.click(screen.getByTitle("Aprovar (total ou parcial)"));
  if (name === "detalhe" || name === "adição") fireEvent.click(screen.getByText(list.title));
  if (name === "adição") fireEvent.click(screen.getByRole("button", { name: "Adicionar transações" }));
  return view;
}
function modal(name: Exclude<ScreenName, "lista">) {
  const heading = name === "detalhe" ? list.title : name === "aprovação" ? "Aprovar Lista de Pagamentos"
    : name === "adição" ? "Adicionar transações à lista" : "Nova Lista de Contas a Pagar";
  return screen.getByRole("heading", { name: heading }).closest<HTMLDivElement>(".glass")!;
}
function card(label: string) { return screen.getByText(label).parentElement!.textContent; }
async function loadTotals(view: ReturnType<typeof render>) {
  f.allowReads = true;
  try { f.queries.totals = await f.readers.totals(); }
  finally { f.allowReads = false; }
  view.rerender(<PaymentListsTab />);
}
beforeEach(() => {
  vi.clearAllMocks();
  setCompany();
  f.readers = {}; f.keys = {}; f.allowReads = false;
  f.clipboard.mockResolvedValue(undefined);
  f.installmentIds = new Set();
  f.rows = { payment_list_items: items, transaction_payments: [] };
  f.queries = {
    "payment-lists": [list], "payment-list": list, "payment-list-items": items, "payment-list-items-approve": items,
    "approved-transactions-for-list": [tx, secondTx, extraTx, extraSecondTx, explicitTx],
    "invoice-group-counts": { group: 3 },
    // Pre-aggregated progress is supplied by a hook outside this dispatch's write scope.
    "invoice-group-progress": { group: { total: 3, paidCount: 1, openWithIva: 1234.56 },
      "extra-group": { total: 3, paidCount: 1, openWithIva: 1234.56 } },
    "bp-forecasts-for-payment": [{ event_id: "event", category_id: "category", amount: 10 }],
  };
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida"); }));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: f.clipboard } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P2e-2 — apresentação e defaults de IVA por empresa", () => {
  it.each(screens)("BR: %s mostra R$ e grupos sem repor IVA ausente", async name => {
    setCompany("BR", "BRL");
    const view = openScreen(name);
    await loadTotals(view);
    expect(document.body.innerHTML).not.toContain("€");
    expect(view.container.querySelector("article")?.textContent).toContain("R$\u00a01.234,56");
    if (name === "lista") return;
    const scope = within(modal(name));
    expect(scope.getAllByText(/Fatura Agrupada/).length).toBeGreaterThan(0);
    expect(modal(name).textContent).toContain("R$\u00a01.234,56");
    if (name === "aprovação") fireEvent.click(scope.getByRole("button", { name: "Ver itens" }));
    if (name !== "adição") {
      expect(modal(name).textContent).toContain("Valor previsto no BP: R$\u00a010,00");
      expect(modal(name).textContent).toContain("Valor da transação: R$\u00a01.000,00");
    }
    if (name === "detalhe" || name === "aprovação") {
      expect(card("Total da lista")).toBe("Total da listaR$\u00a01.234,56");
      expect(modal(name).textContent).not.toContain("R$\u00a01.518,51");
    }
    if (name === "detalhe") {
      expect(card("Aguardando aprovação")).toBe("Aguardando aprovaçãoR$\u00a01.234,56");
      expect(scope.getByText(/em aberto:/).textContent).toBe("em aberto: R$\u00a01.234,56");
    }
    if (name === "criação" || name === "adição") {
      const explicitRow = scope.getByText(explicitTx.description).closest("tr")!;
      expect(explicitRow.textContent).toContain("R$\u00a0106,00");
      if (name === "criação") {
        expect(explicitRow.textContent).toContain("R$\u00a021,20");
        expect(explicitRow.textContent).toContain("R$\u00a084,80");
        expect(explicitRow.textContent).toContain("R$\u00a074,80");
        expect(explicitRow.textContent).toContain("Ret. IRS −R$\u00a010,00");
      }
      const groupRow = scope.getByText(/TEST-EXTRA$/).closest("tr")!;
      expect(groupRow.querySelector("td.text-right")?.textContent).toBe("R$\u00a01.234,56");
    }
  });

  it("BR: a seleção parcial recalcula os três cards de aprovação e mantém o grupo atómico", () => {
    setCompany("BR", "BRL");
    f.queries["payment-list-items-approve"] = [...items, { ...items[0], id: "explicit-item", transactions: explicitTx }];
    openScreen("aprovação");
    const scope = within(modal("aprovação"));
    expect(card("A aprovar")).toBe("A aprovarR$\u00a01.340,56");
    fireEvent.click(scope.getByRole("button", { name: "Ver itens" }));
    // Nested items deliberately have no individual checkbox: the invoice is atomic.
    expect(within(scope.getByText(secondTx.description).closest("tr")!).queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(scope.getByText(explicitTx.description).closest("tr")!);
    expect(card("A aprovar")).toBe("A aprovarR$\u00a01.234,56");
    expect(card("Não aprovado")).toBe("Não aprovadoR$\u00a0106,00");
    expect(scope.getByRole("button", { name: "Aprovar Selecionadas" })).toBeEnabled();
    const groupRow = scope.getByText(/Fatura Agrupada/).closest("tr")!;
    fireEvent.click(groupRow);
    expect(card("A aprovar")).toBe("A aprovarR$\u00a00,00");
    expect(card("Não aprovado")).toBe("Não aprovadoR$\u00a01.340,56");
    fireEvent.click(groupRow);
    expect(card("A aprovar")).toBe("A aprovarR$\u00a01.234,56");
    expect(card("Total da lista")).toBe("Total da listaR$\u00a01.340,56");
  });

  it.each(["criação", "adição"] as const)("BR: %s conserva seleção agrupada e pesquisa dentro da fatura", name => {
    setCompany("BR", "BRL");
    openScreen(name);
    const scope = within(modal(name));
    const groupRow = scope.getByText(/TEST-EXTRA$/).closest("tr")!;
    fireEvent.click(groupRow);
    expect(scope.getByText("2 selecionada(s)")).toBeInTheDocument();
    expect(within(groupRow).getByRole("checkbox")).toBeChecked();
    fireEvent.change(scope.getByPlaceholderText("Descrição, fornecedor, nº de fatura…"), { target: { value: extraSecondTx.description } });
    expect(scope.getByText(extraTx.description)).toBeInTheDocument();
    expect(scope.getByText(extraSecondTx.description)).toBeInTheDocument();
    expect(scope.queryByText(explicitTx.description)).not.toBeInTheDocument();
    expect(modal(name).textContent).toContain("R$\u00a01.234,56");
  });

  it.each(screens)("%s acompanha PT → BR → PT com as mesmas linhas memorizadas", async name => {
    const view = openScreen(name);
    await loadTotals(view);
    const before = domHash();
    setCompany("BR", "BRL");
    view.rerender(<PaymentListsTab />);
    await loadTotals(view);
    expect(document.body.innerHTML).not.toContain("€");
    expect(view.container.querySelector("article")?.textContent).toContain("R$\u00a01.234,56");
    if (name === "detalhe" || name === "aprovação") {
      expect(card("Total da lista")).toBe("Total da listaR$\u00a01.234,56");
    }
    setCompany();
    view.rerender(<PaymentListsTab />);
    await loadTotals(view);
    expect(domHash()).toBe(before);
  });

  it.each([
    { company: null, companyId: null },
    { company: { id: "company", country: "BR", currency: "" } as Company },
    { isLoading: true },
    { isError: true, error: new Error("fixture failure") },
  ])("contexto indisponível %j mostra — e conserva default PT", async overrides => {
    setCompany("BR", "BRL", overrides);
    for (const name of screens) {
      const view = openScreen(name);
      await loadTotals(view);
      expect(document.body.innerHTML).not.toMatch(/€|R\$/);
      expect(document.body.textContent).toContain("—");
      expect(f.queries.totals.totals.list).toBe(1518.51);
      if (name !== "lista") expect(screen.getAllByText(/Fatura Agrupada/).length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("usa a moeda configurada e a política de IVA, sem condições por país", async () => {
    setCompany("PT", "BRL");
    const view = openScreen("detalhe");
    await loadTotals(view);
    expect(card("Total da lista")).toBe("Total da lista1518,51\u00a0R$");
    expect(document.body.innerHTML).not.toContain("€");
  });

  it("a chave dos totais isola empresa e default de IVA, incluindo a chegada do contexto", () => {
    setCompany("BR", "BRL", { isLoading: true });
    const view = openScreen("lista");
    const unavailable = f.keys.totals;
    setCompany("BR", "BRL");
    view.rerender(<PaymentListsTab />);
    const br = f.keys.totals;
    expect(br).not.toEqual(unavailable);
    setCompany();
    view.rerender(<PaymentListsTab />);
    expect(f.keys.totals).not.toEqual(br);
    const pt = f.keys.totals;
    setCompany("PT", "EUR", { companyId: "other-company" });
    view.rerender(<PaymentListsTab />);
    expect(f.keys.totals).not.toEqual(pt);
  });
});

describe("#498 P2e-2 — leitura agregada, detalhe e export em memória", () => {
  it.each(["PT", "BR"])("%s: fases e remoções mantêm a semântica com o default local", async country => {
    setCompany(country, country === "BR" ? "BRL" : "EUR");
    const row = (id: string, amount: number, properties = {}, txProperties = {}) => ({
      ...items[0], id, ...properties, transactions: { ...tx, id, amount, ...txProperties },
    });
    f.rows.payment_list_items = [
      row("open", 100), row("marked", 50, { manually_marked_paid: true }), row("settled", 25),
      row("legacy", 10, {}, { status: "paid" }),
      row("cut", 40, { removed_at: "2026-11-02", removed_reason: "Não aprovado na aprovação de 02/11/2026" }),
      row("removed", 99, { removed_at: "2026-11-02", removed_reason: "Removida na composição" }),
      row("explicit", 100, {}, { iva_rate: 6 }), row("zero", 20, {}, { iva_rate: 0 }),
    ];
    f.rows.transaction_payments = [{ transaction_id: "settled", status: "paid", reversed_at: null }];
    const view = openScreen("lista");
    await loadTotals(view);
    const phases = f.queries.totals.phases;
    const br = country === "BR";
    expect(f.queries.totals.totals.list).toBeCloseTo(br ? 351 : 402.75, 2);
    expect(phases.launched).toEqual({ count: 6, amount: br ? 311 : 353.55 });
    expect(phases.notApproved).toEqual({ count: 1, amount: br ? 40 : 49.2 });
    expect(phases.unpaid.amount).toBeCloseTo(br ? 226 : 249, 2);
    expect(phases.markedPaid).toEqual({ count: 1, amount: br ? 50 : 61.5 });
    expect(phases.settled).toEqual({ count: 1, amount: br ? 25 : 30.75 });
    expect(phases.legacy).toEqual({ count: 1, amount: br ? 10 : 12.3 });
  });

  it.each(["PT", "BR"])("%s: ambos os exports recebem o contexto e os montantes originais com taxas resolvidas", country => {
    setCompany(country, country === "BR" ? "BRL" : "EUR");
    f.queries["payment-list"] = { ...list, status: "approved" };
    f.queries["payment-list-items"] = [...items, { ...items[0], id: "explicit-item", transactions: explicitTx }];
    openScreen("detalhe");
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    for (const exporter of [f.excel, f.pdf]) {
      expect(exporter).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        companyLocale: expect.objectContaining(resolveCompanyLocale({ country, currency: country === "BR" ? "BRL" : "EUR" })),
        title: list.title, payment_date: list.payment_date,
        items: [
          expect.objectContaining({ amount: 1000, iva_rate: country === "BR" ? 0 : 23, paid_amount: 0 }),
          expect.objectContaining({ amount: 234.56, iva_rate: country === "BR" ? 0 : 23, paid_amount: 0 }),
          expect.objectContaining({ amount: 100, iva_rate: 6, paid_amount: 20, declared_withholding_amount: 10 }),
        ],
      }));
    }
  });

  it("BR: cópia local usa R$ nos grupos e no total, sem envio de mensagens", () => {
    setCompany("BR", "BRL");
    f.queries["payment-list"] = { ...list, status: "approved" };
    openScreen("detalhe");
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(f.clipboard).toHaveBeenCalledOnce();
    const text = f.clipboard.mock.calls[0][0];
    expect(text).toContain("Fatura Agrupada: TEST-498");
    expect(text).toContain("*Total: R$\u00a01.234,56*");
    expect(text).toContain("*Total líquido a transferir: R$\u00a01.234,56*");
    expect(text).not.toContain("€");
  });

  it("BR: o detalhe mantém retenção, parcelas, pagamento parcial e corte pela aprovação", () => {
    setCompany("BR", "BRL");
    f.queries["payment-list"] = { ...list, status: "partially_approved" };
    f.queries["payment-list-items"] = [
      { ...items[0], transactions: { ...tx, amount: 100, invoice_group_id: null, paid_amount: 20, declared_withholding_amount: 10 } },
      { ...items[1], removed_at: "2026-11-02", removed_reason: "Não aprovado na aprovação de 02/11/2026",
        transactions: { ...secondTx, amount: 50, invoice_group_id: null } },
    ];
    const view = openScreen("detalhe");
    expect(card("Total da lista")).toBe("Total da listaR$\u00a0150,00");
    expect(card("Aprovado")).toBe("AprovadoR$\u00a0100,00");
    expect(card("Não aprovado")).toBe("Não aprovadoR$\u00a050,00");
    expect(document.body.textContent).toContain("Saldo a pagar: R$\u00a080,00");
    expect(document.body.textContent).toContain("Líquido a pagar:R$\u00a090,00");
    f.installmentIds = new Set([tx.id]);
    view.rerender(<PaymentListsTab />);
    expect(screen.queryByText("Líquido a pagar:")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Ret. IRS");
    expect(card("Total da lista")).toBe("Total da listaR$\u00a0150,00");
    expect(screen.queryByRole("button", { name: "Restaurar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar transações" })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("€");
  });

  it("confina o formatter legado aos helpers e não introduz defaults fixos, condições por país ou datas nativas", () => {
    const source = readFileSync("src/components/PaymentListsTab.tsx", "utf8");
    expect(source.match(/useCompanyLocale\(\)/g)).toHaveLength(5);
    expect(source.match(/formatLegacyCurrency\(/g)).toHaveLength(5);
    expect(source).toContain("formatCurrency as formatLegacyCurrency");
    expect(source).not.toMatch(/import\s*\{\s*formatCurrency\s*[,}]/);
    expect(source).not.toMatch(/\?\?\s*23\b/);
    expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    expect(source).not.toContain('type="date"');
  });
});
describe("#498 P2e-2 — baseline PT capturada antes de alterar PaymentListsTab", () => {
  it("preserva o DOM da lista, detalhe com fatura agrupada, aprovação, adição e criação", async () => {
    const hashes: Partial<Record<ScreenName, string>> = {};
    for (const name of screens) {
      const view = openScreen(name);
      await loadTotals(view);
      if (name !== "lista") expect(screen.getAllByText(/Fatura Agrupada/).length).toBeGreaterThan(0);
      hashes[name] = domHash();
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "adição": "679637069a603a354dcb7806595c6e6acb456456a62d6ad90bc33a31415882ad",
        "aprovação": "8e5d31f425439dcb5be8c72228b52064ff00b1d7d982aa1c60236d8bbe50a0d5",
        "criação": "2e2f922d142d9c1a3d19fa40521ad35354e204ae80ddd88cfd0977efb40fd0c2",
        "detalhe": "c2f92928c2d13e396d73bfaa8a26896826b7a4763010989de08781aa54fb01c1",
        "lista": "2d8747cf4a0dfacf2254a0e3f8473d3bfa0763a8c19c8525e456c9904ca3315a",
      }
    `);
  });
});
