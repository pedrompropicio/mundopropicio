import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import FinancialAccounts from "@/pages/FinancialAccounts";
import { AccountantDocumentsTab } from "@/pages/contabilidade/AccountantDocumentsTab";
import { NewSupplierCreditModal } from "@/components/supplier-credits/NewSupplierCreditModal";
import { SupplierCreditsTab } from "@/components/supplier-credits/SupplierCreditsTab";
import { SupplierCreditBanner, resolveCreditSelection } from "@/components/supplier-credits/SupplierCreditBanner";
import { TransferFormModal } from "@/components/TransferFormModal";
import type { SupplierCredit } from "@/lib/supplier-credits";
import { resolveCompanyLocale } from "@/lib/company-locale";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return {
    queries: {} as Record<string, unknown>,
    mutations: [] as { mutationFn: () => Promise<unknown> }[],
    writes: [] as { table: string; payload: unknown }[],
    allowWrites: false,
    hasBalance: vi.fn(),
  };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Query functions never run; only explicitly exercised mutation closures run.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: f.queries[String(queryKey[0])], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: { mutationFn: () => Promise<unknown> }) => {
    f.mutations.push(options);
    return { mutate: vi.fn(), isPending: false };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (!f.allowWrites) throw new Error("#498: serviço MP proibido neste teste");
    return { insert: (payload: unknown) => {
      f.writes.push({ table, payload });
      return { select: () => ({ single: async () => ({ data: { id: `fixture-${table}` }, error: null }) }) };
    } };
  },
  rpc: () => { throw new Error("#498: RPC proibida neste teste"); },
} }));
vi.mock("@/lib/account-balance-rpc", async (original) => ({
  ...await original<typeof import("@/lib/account-balance-rpc")>(),
  accountHasBalanceFor: f.hasBalance,
}));
vi.mock("@/lib/supplier-credits", async (original) => ({
  ...await original<typeof import("@/lib/supplier-credits")>(),
  expireStaleCredits: vi.fn(),
}));
vi.mock("@/hooks/useAvailableSupplierCredits", () => ({
  useAvailableSupplierCredits: () => ({ data: f.queries.credits }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@/hooks/useAccountBalanceCards", () => ({
  CASH_ACCOUNT_TYPES: ["bank", "cash", "prepaid_card"],
  useAccountBalanceCards: () => ({
    isLoading: false, balances: { bank: { value: 1234.56 }, office: { value: -12.34 } },
    cash: { total: 1234.56, count: 1, hiddenNames: [], uncontrolledNames: [] },
    ticketOffice: { total: -12.34, count: 1, hiddenNames: [], uncontrolledNames: [] },
    settlements: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] },
  }),
}));
vi.mock("@/components/FinancialOperationsTab", () => ({ default: () => null }));
vi.mock("@/components/PartnerCurrentAccountTab", () => ({ default: () => null }));
vi.mock("@/components/supplier-credits/SupplierCreditsSummaryCard", () => ({ SupplierCreditsSummaryCard: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/AccountAccessModal", () => ({ default: () => null }));
vi.mock("@/components/AccountBalanceImplantModal", () => ({ default: () => null }));
vi.mock("@/components/BalanceCompositionModal", () => ({ BalanceCompositionModal: () => null }));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));

const noop = () => {};
const bank = { id: "bank", name: "Banco sintético", type: "bank", is_active: true, initial_balance: 1234.56, initial_balance_date: "2026-01-01", balance_visible_to_all: true };
const office = { ...bank, id: "office", name: "Bilheteira sintética", type: "ticket_office", initial_balance: -12.34 };
const credit: SupplierCredit = {
  id: "credit", supplier_id: "supplier", amount: 1246.90, used_amount: 12.34, reason: "Crédito sintético",
  document_ref: "TEST-498", valid_until: null, status: "active", file_url: null, origin_event_id: null,
  created_at: "2026-01-01T12:00:00Z", created_by: "fixture", notes: null,
};
const screens = {
  accounts: () => <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><FinancialAccounts /></MemoryRouter>,
  documents: () => <AccountantDocumentsTab period={{ from: "2026-01-01", to: "2026-12-31" }} />,
  newCredit: () => <NewSupplierCreditModal open onOpenChange={noop} />,
  credits: () => <SupplierCreditsTab />,
  banner: () => <SupplierCreditBanner supplierId="supplier" maxAmount={2000} value={{ creditId: credit.id, amount: "12.34" }} onChange={noop} />,
  transfer: () => <TransferFormModal onClose={noop} />,
};
type ScreenName = keyof typeof screens;

function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function openScreen(name: ScreenName) {
  const view = render(screens[name]());
  if (name === "accounts") fireEvent.click(screen.getByRole("button", { name: "Nova Conta" }));
  if (name === "credits") fireEvent.click(view.container.querySelector(".divide-y button")!);
  if (name === "transfer") {
    fireEvent.click(screen.getAllByRole("button", { name: "Selecionar conta…" })[0]);
    fireEvent.click(screen.getByText(bank.name));
  }
  return view;
}
function domHash() {
  // React/Radix IDs vary by mount; all other bytes (including Intl spaces) remain.
  const dom = document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
  return createHash("sha256").update(dom).digest("hex");
}
function transferWriter() { return f.mutations.at(-1)!.mutationFn; }
function fillTransfer(amount = "20") {
  fireEvent.click(screen.getByRole("button", { name: "Selecionar conta…" }));
  fireEvent.click(screen.getByText(office.name));
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: amount } });
}

beforeEach(() => {
  vi.clearAllMocks();
  f.mutations = []; f.writes = []; f.allowWrites = false;
  f.hasBalance.mockResolvedValue(false);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida neste teste"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  setCompany();
  f.queries = {
    "financial-accounts": [bank, office], "financial-accounts-active": [bank, office],
    "financial-account-br-column": true, "transfer-category": { id: "category" }, "account-true-balance": 12.34,
    "supplier-credits-all": [{ ...credit, suppliers: { name: "Fornecedor sintético" } }],
    "supplier-credit-usages-all": [{ id: "usage", credit_id: credit.id, amount: 12.34, created_at: "2026-01-02T12:00:00Z", transactions: { description: "Uso sintético" } }],
    "suppliers-for-credits": [{ id: "supplier", name: "Fornecedor sintético" }],
    credits: [credit], "accountant-non-accounting-accounts": [], "accountant-accounts": [bank],
    "accountant-documents": [{ id: "tx", type: "expense", description: "Documento sintético", amount: 1234.56, paid_amount: 1234.56,
      account_id: bank.id, supplier_name: "Fornecedor sintético", doc_count: 0, payment_date: "2026-01-02" }],
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P1j — baseline PT capturada antes de alterar os seis componentes", () => {
  it("congela SHA-256 do DOM dos seis ecrãs, com formulário, histórico e saldo visíveis", () => {
    const hashes: Partial<Record<ScreenName, string>> = {};
    for (const name of Object.keys(screens) as ScreenName[]) {
      openScreen(name);
      hashes[name] = domHash();
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "accounts": "5fc1a1c7437e07706af4ec961c72763e4e05344e3c5f1a3882dd299c8bf68c44",
        "banner": "af154f2f476965112bd05382fafdbab7b2fc2ccadbacad09469fb390972f9898",
        "credits": "85486949e054ac7f992f021ab08f7e54554914903e742b107b9cda3aa5465bb6",
        "documents": "340da6b73363d401a3cfce98fc4889360114414264dec2694f2bd4797fbedfef",
        "newCredit": "3f5503f4bcae8c56454afb0c17bff0dbb758e422e50c7531d8b87851f00e34d2",
        "transfer": "42d13d60e3c58a8a397da8ee34a7383d37814a58ea875f7bdd1fe77c5597ede0",
      }
    `);
  });
  it("preserva as mensagens PT de transferência e crédito byte a byte", async () => {
    openScreen("transfer");
    fillTransfer();
    await expect(transferWriter()()).rejects.toThrow("Saldo insuficiente na conta. Disponível: €12.34");
    expect(() => resolveCreditSelection({ creditId: credit.id, amount: "20" }, [{ ...credit, amount: 12.34, used_amount: 0 }], 100))
      .toThrow("O crédito só tem 12.34 € disponível");
  });
});

describe("#498 P1j — moeda e locale da empresa activa", () => {
  const brTexts: Record<ScreenName, string[]> = {
    accounts: ["Saldo Inicial (R$)", "R$\u00a01.234,56", "-R$\u00a012,34", "Acertos em CursoR$\u00a00,00"],
    documents: ["R$\u00a01.234,56"],
    newCredit: ["Valor (R$) *"],
    credits: ["R$\u00a01.234,56 disponível", "R$\u00a01.234,56 / R$\u00a01.246,90", "R$\u00a012,34"],
    banner: ["R$\u00a01.234,56 de crédito disponível", "Valor a abater (R$)", "· máx R$\u00a01.234,56"],
    transfer: ["Saldo disponível: R$\u00a012,34", "Valor (R$)"],
  };

  it.each(Object.keys(screens) as ScreenName[])("BR: %s usa R$, sem Euro no DOM", name => {
    setCompany("BR", "BRL");
    const view = openScreen(name);
    for (const text of brTexts[name]) expect(document.body.textContent).toContain(text);
    expect(document.body.innerHTML).not.toContain("€");
    if (name === "accounts") {
      const rows = view.container.querySelectorAll("tbody tr");
      expect(rows[0].textContent).toContain("R$\u00a01.234,56");
      expect(rows[1].textContent).toContain("-R$\u00a012,34");
    }
    if (name === "documents") {
      expect(view.container.querySelector("tbody tr")?.textContent).toContain("R$\u00a01.234,56");
    }
  });

  it.each(Object.keys(screens) as ScreenName[])("%s acompanha PT → BR → PT e repõe exactamente o DOM PT", name => {
    const view = openScreen(name);
    const pt = domHash();
    setCompany("BR", "BRL");
    view.rerender(screens[name]());
    expect(document.body.innerHTML).not.toContain("€");
    for (const text of brTexts[name]) expect(document.body.textContent).toContain(text);
    setCompany();
    view.rerender(screens[name]());
    expect(domHash()).toBe(pt);
  });

  it.each([
    [null, "EUR", {}],
    ["BR", "", {}],
    ["BR", "BRL", { isLoading: true }],
    ["BR", "BRL", { isError: true, error: new Error("fixture failure") }],
  ] as const)("contexto indisponível (%s/%s/%j): valores — e campos/rótulos PT mantidos", (country, currency, overrides) => {
    for (const name of Object.keys(screens) as ScreenName[]) {
      setCompany("BR", "BRL");
      const view = openScreen(name);
      setCompany(country, currency, overrides);
      view.rerender(screens[name]());
      const text = document.body.textContent;
      expect(text).not.toMatch(/R\$|€12\.34|[\d,.]+\s*€/);
      expect(text).toContain("—");
      if (name === "accounts") {
        expect(text).toContain("Saldo Inicial (€)");
        expect(screen.getByPlaceholderText("Ex: Conta BPI Principal")).toBeInTheDocument();
        expect(view.container.querySelectorAll("tbody tr")).toHaveLength(2);
      }
      if (name === "newCredit") expect(text).toContain("Valor (€) *");
      if (name === "banner") expect(text).toContain("Valor a abater (€)");
      if (name === "transfer") {
        expect(text).toContain("Saldo disponível: —");
        expect(text).toContain("Valor (€)");
      }
      cleanup();
    }
  });

  it("usa a moeda configurada mesmo quando difere da moeda habitual do locale", () => {
    setCompany("PT", "BRL");
    openScreen("accounts");
    expect(document.body.textContent).toContain("Saldo Inicial (R$)");
    expect(document.body.textContent).toContain("1234,56\u00a0R$");
    expect(screen.getByPlaceholderText("Ex: Conta BPI Principal")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("€");
  });

  it("BR: a recusa de transferência usa R$ e não executa escritas", async () => {
    setCompany("BR", "BRL");
    openScreen("transfer");
    fillTransfer();
    await expect(transferWriter()()).rejects.toThrow("Saldo insuficiente na conta. Disponível: R$\u00a012,34");
    expect(f.hasBalance).toHaveBeenCalledWith(bank.id, 20);
    expect(f.writes).toEqual([]);
  });

  it.each([null, undefined])("transferência sem permissão ou saldo carregado (%s) mantém a mensagem sem valor", async balance => {
    setCompany("BR", "BRL");
    f.queries["account-true-balance"] = balance;
    openScreen("transfer");
    fillTransfer();
    expect(document.body.textContent).not.toContain("Saldo disponível");
    await expect(transferWriter()()).rejects.toThrow(/^Saldo insuficiente na conta\.$/);
    expect(f.writes).toEqual([]);
  });

  it.each(["PT", "BR"])("%s: mantém os montantes das duas pernas e formata apenas os textos de auditoria", async country => {
    setCompany(country, country === "BR" ? "BRL" : "EUR");
    openScreen("transfer");
    fillTransfer("12.34");
    f.hasBalance.mockResolvedValue(true);
    f.allowWrites = true; // In-memory insert recorder only; no service client exists.
    await transferWriter()();
    expect(f.writes).toHaveLength(3);
    expect(f.writes.slice(0, 2)).toEqual([
      { table: "transactions", payload: expect.objectContaining({ type: "expense", account_id: bank.id, amount: 12.34, paid_amount: 12.34, iva_rate: 0 }) },
      { table: "transactions", payload: expect.objectContaining({ type: "income", account_id: office.id, amount: 12.34, paid_amount: 12.34, iva_rate: 0 }) },
    ]);
    const money = country === "PT" ? "€12.34" : "R$\u00a012,34";
    expect(f.writes[2]).toEqual({ table: "transaction_audit_log", payload: [
      expect.objectContaining({ new_value: `Saída: ${bank.name} → ${office.name} | ${money}` }),
      expect.objectContaining({ new_value: `Entrada: ${bank.name} ← ${bank.name} | ${money}` }),
    ] });
  });

  it("o validador puro do crédito mantém limites, arredondamento e mensagens com contexto explícito", () => {
    const small = [{ ...credit, amount: 12.34, used_amount: 0 }];
    const pt = resolveCompanyLocale({ country: "PT", currency: "EUR" });
    const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
    for (const [context, formatted] of [[pt, "12.34 €"], [br, "R$\u00a012,34"], [resolveCompanyLocale({}), "—"]] as const) {
      expect(() => resolveCreditSelection({ creditId: credit.id, amount: "20" }, small, 100, context))
        .toThrow(`O crédito só tem ${formatted} disponível`);
      expect(resolveCreditSelection({ creditId: credit.id, amount: "12.344" }, small, 100, context))
        .toEqual({ creditId: credit.id, amount: 12.34 });
      expect(resolveCreditSelection(null, small, 100, context)).toBeNull();
      expect(() => resolveCreditSelection({ creditId: "missing", amount: "1" }, small, 100, context))
        .toThrow("Crédito inválido ou já indisponível");
      expect(() => resolveCreditSelection({ creditId: credit.id, amount: "0" }, small, 100, context))
        .toThrow("Valor do crédito a abater tem de ser positivo");
      expect(() => resolveCreditSelection({ creditId: credit.id, amount: "10" }, small, 5, context))
        .toThrow("O crédito a abater não pode exceder o valor a pagar");
    }
  });

  it("os seis componentes consomem o contexto e confinam o formatter legado ao helper", () => {
    for (const file of ["pages/FinancialAccounts.tsx", "pages/contabilidade/AccountantDocumentsTab.tsx",
      "components/supplier-credits/NewSupplierCreditModal.tsx", "components/supplier-credits/SupplierCreditsTab.tsx",
      "components/supplier-credits/SupplierCreditBanner.tsx", "components/TransferFormModal.tsx"]) {
      const source = readFileSync(`src/${file}`, "utf8");
      expect(source).toContain("useCompanyLocale()");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
      expect(source).not.toMatch(/import\s*\{\s*formatCurrency\s*\}/);
      if (source.includes("@/lib/mock-data")) {
        expect(source).toContain("formatCurrency as formatLegacyCurrency");
        expect(source.match(/formatLegacyCurrency\(/g)).toHaveLength(1);
      }
    }
  });
});
