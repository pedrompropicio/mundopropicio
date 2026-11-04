import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import PaymentListReceipts from "@/components/PaymentListReceipts";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import FinancialAccounts from "@/pages/FinancialAccounts";
import AdminPanel from "@/pages/AdminPanel";
import IbanDuplicates from "@/pages/admin/IbanDuplicates";
import SimilarSuppliersReview from "@/pages/admin/SimilarSuppliersReview";
import { shareOriginRows, type PartnerShareOrigin } from "@/lib/partner-contracts";
import { formatBrTaxId } from "@/lib/supplier-bank";

const f = vi.hoisted(() => ({
  country: "PT", currency: "EUR", loading: false,
  queries: {} as Record<string, any>,
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { country: f.country, currency: f.currency }, companyId: "fixture-company",
  isLoading: f.loading, isError: false, isPlatformAdmin: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, role: "admin",
  isAdmin: true, isManager: false, permissions: [], hasPermission: () => true,
}) }));
// Query callbacks and mutations never run; the real screens receive synthetic data only.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: f.queries[String(queryKey[0])], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#498 P1m: serviço MP proibido"); },
}) }));
vi.mock("@/lib/account-balance-rpc", () => ({
  useAccountTrueBalance: () => 5000, accountHasBalanceFor: vi.fn(), insufficientBalanceMessage: vi.fn(),
}));
vi.mock("@/hooks/useAccountBalanceCards", () => ({
  CASH_ACCOUNT_TYPES: ["bank", "cash", "prepaid_card"],
  useAccountBalanceCards: () => ({
    isLoading: false, balances: {},
    cash: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] },
    ticketOffice: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] },
    settlements: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] },
  }),
}));
vi.mock("@/components/FinancialOperationsTab", () => ({ default: () => null }));
vi.mock("@/components/PartnerCurrentAccountTab", () => ({ default: () => null }));
vi.mock("@/components/supplier-credits/SupplierCreditsSummaryCard", () => ({ SupplierCreditsSummaryCard: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/SupplierPortalUserLink", () => ({ SupplierPortalUserLink: () => null }));
vi.mock("@/components/SystemRemindersBanner", () => ({ default: () => null }));
vi.mock("@/components/CompanyBudgetModeCard", () => ({ CompanyBudgetModeCard: () => null }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: () => "fixture" }));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

const noop = () => {};
const bank = { id: "bank", name: "Banco sintético", type: "bank" };
const tx = {
  id: "tx", description: "Receita sintética", type: "income", amount: 1234.56, paid_amount: 0,
  currency: "EUR", iva_rate: 0, status: "approved", date: "2026-11-01", payment_date: "2026-11-03",
  account_id: bank.id, payment_method: "transfer", invoice_ref: "", supplier_id: null,
};
const suppliers = [
  { id: "a", name: "Fornecedor A", nif: "123456789", iban: "PT50000201231234567890154", is_active: true },
  { id: "b", name: "Fornecedor B", nif: "123456789", iban: "PT50000201231234567890154", is_active: false },
];
const screens = {
  receipt: () => <TransactionPaymentModal transaction={{ ...tx, currency: f.currency }} onClose={noop} />,
  listFallback: () => <PaymentListReceipts listId="list" listTitle="Lista sintética" activeTransactionIds={["a", "b"]} />,
  supplier: () => <SupplierFormModal open onOpenChange={noop} />,
  account: () => <FinancialAccounts />,
  duplicates: () => <IbanDuplicates />,
  similar: () => <SimilarSuppliersReview />,
  admin: () => <AdminPanel />,
};
type Screen = keyof typeof screens;
function open(name: Screen) {
  const view = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{screens[name]()}</MemoryRouter>);
  if (name === "account") fireEvent.click(screen.getByRole("button", { name: "Nova Conta" }));
  return view;
}
function domHash() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
beforeEach(() => {
  vi.clearAllMocks(); f.country = "PT"; f.currency = "EUR"; f.loading = false;
  f.queries = {
    "financial-accounts-active": [bank], "financial-accounts": [], "financial-accounts-tx-summary": [],
    "financial-account-br-column": true,
    "payment_list_sepa_exports": [], "payment_list_documents": [],
    "supplier-br-details": { available: true, details: null },
    "iban-duplicates-source": suppliers,
    "supplier-similarity-flags": {
      flags: [{ id: "flag", supplier_id: "a", similar_supplier_id: "b", motivo: "nif",
        source: "sponsors_import", created_at: "2026-11-03T12:00:00Z" }],
      names: new Map(suppliers.map(s => [s.id, s])),
    },
  };
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1m: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498 P1m: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498 P1m: rede proibida"); } });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); cleanup(); vi.unstubAllGlobals(); });

describe("#498 P1m — hashes PT fixados antes de alterar produção; não regenerar", () => {
  it("conserva o DOM completo dos sete ecrãs", () => {
    const hashes: Record<string, string> = {};
    for (const name of Object.keys(screens) as Screen[]) {
      open(name); hashes[name] = domHash(); cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "account": "fff3710c80d4831d9b1259c00665052968a8030336799907499702bdebae1b39",
        "admin": "6a1a06086d3f8b8391c740cb9c0092ca5f3f679aa2fa03d9dca1142ba7505d89",
        "duplicates": "093dd5a09458fa3f4bc85a4819c4c2bfe166f6c7f045044df98912890303d2b7",
        "listFallback": "8e6c9720e3445b2698dfdd91056f09b9940848345cf1cf4ca1f5cfcc4bbde23a",
        "receipt": "522b00a56204f7b47a14684fe68e36dcf3734b57bb984377267278a893c8de79",
        "similar": "159bfb1b7d4d73f75310ece21a0c8facfb41caa5c349d6197300d90a1cab57df",
        "supplier": "491b39bce2616e350bd3d6a20cd7c2d1be27d750092e2e0d8224ec2cf92a80b7",
      }
    `);
  });
});

const origin: PartnerShareOrigin = {
  parent_quota: 100, vat_returned_in: 23, addback_in: 50, additional_actives_total: 30,
  additional_actives: [{ name: "Ativo sintético", value: 30 }], exclusive_revenue: 1000,
  expenses_in_perimeter: 200, result_basis_gross: true, result_amount: 1003.01,
};
it("shareOriginRows sem opts conserva o contrato completo anterior nas duas bases", () => {
  expect([shareOriginRows(origin), shareOriginRows({ ...origin, result_basis_gross: false })]).toMatchInlineSnapshot(`
    [
      [
        {
          "key": "parent",
          "label": "Quota do fechamento acima",
          "value": 100,
        },
        {
          "key": "vat",
          "label": "IVA dedutível devolvido",
          "value": 23,
        },
        {
          "key": "addback",
          "label": "Custos devolvidos",
          "value": 50,
        },
        {
          "key": "actives",
          "label": "Ativos adicionais",
          "value": 30,
        },
        {
          "detail": true,
          "key": "operation-0",
          "label": "Ativo sintético",
          "value": 30,
        },
        {
          "key": "revenue",
          "label": "Receitas exclusivas do fechamento",
          "note": "lançadas só neste fechamento",
          "value": 1000,
        },
        {
          "key": "expenses",
          "label": "(−) Despesas do perímetro na base do nó",
          "value": -200,
        },
        {
          "key": "other",
          "label": "Outros / arredondamentos",
          "value": 0.01,
        },
        {
          "key": "result",
          "label": "= Resultado do fechamento (c/IVA)",
          "value": 1003.01,
        },
      ],
      [
        {
          "key": "parent",
          "label": "Quota do fechamento acima",
          "value": 100,
        },
        {
          "key": "vat",
          "label": "IVA dedutível devolvido",
          "value": 23,
        },
        {
          "key": "addback",
          "label": "Custos devolvidos",
          "value": 50,
        },
        {
          "key": "actives",
          "label": "Ativos adicionais",
          "value": 30,
        },
        {
          "detail": true,
          "key": "operation-0",
          "label": "Ativo sintético",
          "value": 30,
        },
        {
          "key": "revenue",
          "label": "Receitas exclusivas do fechamento",
          "note": "lançadas só neste fechamento",
          "value": 1000,
        },
        {
          "key": "expenses",
          "label": "(−) Despesas do perímetro na base do nó",
          "value": -200,
        },
        {
          "key": "other",
          "label": "Outros / arredondamentos",
          "value": 0.01,
        },
        {
          "key": "result",
          "label": "= Resultado do fechamento (s/IVA)",
          "value": 1003.01,
        },
      ],
    ]
  `);
});

describe("#498 P1m — apresentação BR por labels/capabilities", () => {
  beforeEach(() => { f.country = "BR"; f.currency = "BRL"; });

  it.each(["BRL", "EUR"])("Recebimento usa o placeholder NF com moeda %s", currency => {
    f.currency = currency; open("receipt");
    expect(screen.getByText("Registar Recebimento")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex: NF 12345")).toHaveValue("");
    expect(screen.queryByPlaceholderText("Ex: FT 2026/001")).toBeNull();
  });

  it.each([0, 1, 3])("lista sem exportações informa os %s itens ativos sem aviso SEPA", count => {
    render(<PaymentListReceipts listId="list" listTitle="Lista sintética" activeTransactionIds={Array.from({ length: count }, (_, i) => String(i))} />);
    const message = screen.getByText(`O comprovativo será replicado em todos os ${count} item(ns) ativo(s).`);
    expect(message.querySelector("svg")).toBeNull();
    expect(message.className).not.toMatch(/amber/);
    expect(document.body.innerHTML).not.toMatch(/SEPA/);
  });

  it("a ausência de SEPA segue a capability mesmo em PT com outra moeda", () => {
    f.country = "PT"; f.currency = "BRL"; open("listFallback");
    expect(screen.getByText("O comprovativo será replicado em todos os 2 item(ns) ativo(s).")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/SEPA/);
  });

  it("o fornecedor pede Endereço", () => {
    open("supplier");
    expect(screen.getByLabelText("Endereço")).toHaveValue("");
    expect(screen.queryByText("Morada")).toBeNull();
  });

  it("a ajuda da conta contábil refere o Brasil", () => {
    open("account");
    expect(screen.getByText(/Desligue para contas puramente gerenciais/)).toHaveTextContent(
      "Desligue para contas puramente gerenciais (ex.: pagamentos feitos fora do Brasil por um sócio). Os movimentos e documentos dessa conta deixam de entrar nas exportações para a contabilidade. Saldos e extratos não são afetados.",
    );
    expect(document.body.innerHTML).not.toMatch(/Portugal/);
  });

  it.each(["admin", "duplicates", "similar"] as const)("%s usa os rótulos BR sem alterar os dados da auditoria", name => {
    open(name);
    expect(document.body.innerHTML).not.toMatch(/IBAN|NIF/);
    expect(document.body.textContent).toMatch(/CNPJ\/CPF/);
    if (name !== "similar") expect(document.body.textContent).toMatch(/conta bancária/i);
    if (name === "duplicates") {
      expect(screen.getByRole("columnheader", { name: "Conta bancária" })).toBeInTheDocument();
      expect(screen.getByText(suppliers[0].iban)).toBeInTheDocument();
      expect(screen.getAllByText(`CNPJ/CPF: ${suppliers[0].nif}`)).toHaveLength(2);
    }
    if (name === "similar") {
      expect(screen.getByText("mesmo CNPJ/CPF")).toBeInTheDocument();
      expect(screen.getByText(`Fornecedor B (CNPJ/CPF ${suppliers[1].nif}) · inativo`)).toBeInTheDocument();
    }
  });

  it("a auditoria vazia também usa o rótulo de conta bancária", () => {
    f.queries["iban-duplicates-source"] = []; open("duplicates");
    expect(screen.getByText("Não foram detetados duplicados de conta bancária ✓")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/IBAN|NIF/);
  });
});

it.each([true, false])("shareOriginRows usa base neutra apenas com hasIva=false; bruta=%s", gross => {
  const source = { ...origin, result_basis_gross: gross };
  const original = structuredClone(source);
  const legacy = shareOriginRows(source);
  const neutral = shareOriginRows(source, { hasIva: false });
  expect(neutral).toEqual(legacy.map(row => row.key === "result"
    ? { ...row, label: `= Resultado do fechamento (base ${gross ? "bruta" : "líquida"})` } : row));
  expect(shareOriginRows(source, {})).toEqual(legacy);
  expect(shareOriginRows(source, { hasIva: true })).toEqual(legacy);
  expect(source).toEqual(original);
});

describe("#498 P1m — retorno a PT e contexto indisponível", () => {
  it.each(Object.keys(screens) as Screen[])("%s volta aos mesmos bytes após PT → BR → PT", name => {
    const view = open(name);
    const original = domHash();
    const rerender = () => view.rerender(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{screens[name]()}</MemoryRouter>);
    f.country = "BR"; f.currency = "BRL"; rerender();
    expect(domHash()).not.toBe(original);
    f.country = "PT"; f.currency = "EUR"; rerender();
    expect(domHash()).toBe(original);
  });

  it("Recebimento e lista conservam a apresentação legada durante carregamento", () => {
    f.country = "BR"; f.currency = "BRL"; f.loading = true;
    open("receipt");
    expect(screen.getByPlaceholderText("Ex: FT 2026/001")).toBeInTheDocument(); cleanup();
    open("listFallback");
    expect(screen.getByText(/Sem exportação SEPA registada nesta lista/)).toBeInTheDocument();
  });
});

describe("#498 P1m — formatador fiscal puro e cópia do valor original", () => {
  it.each([
    ["12345678000199", "cnpj", "12.345.678/0001-99"],
    ["00000000000000", "cnpj", "00.000.000/0000-00"],
    [" 12.345.678/0001-99 ", "cnpj", "12.345.678/0001-99"],
    ["12345678900", "cpf", "123.456.789-00"],
    ["00000000000", "cpf", "000.000.000-00"],
    [" 000.000.000-00 ", "CPF", "000.000.000-00"],
    ["12345678000199", null, "12.345.678/0001-99"],
    ["12345678000199", undefined, "12.345.678/0001-99"],
    [" 12-34 ", "cnpj", " 12-34 "], [" 123 ", "cpf", " 123 "],
    ["", "cnpj", ""], ["12345678000199", "cpf", "12345678000199"],
    ["12345678900", "cnpj", "12345678900"], ["12345678900", "tin", "12345678900"],
  ])("formatBrTaxId(%j, %s) → %j", (value, type, expected) => {
    expect(formatBrTaxId(value!, type)).toBe(expected);
  });

  it.each([
    ["12345678000199", "cnpj"],
    ["00000000000", "cpf"],
    [" 12.345.678/0001-99 ", "cnpj"],
  ])("detalhes copiam os bytes originais de %s", (value, type) => {
    f.country = "BR"; f.currency = "BRL";
    const details = { foreign_bank_accounts: [], tax_id_foreign: value, tax_id_type: type };
    f.queries["supplier-br-details"] = { available: true, details };
    const writeText = vi.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(<SupplierBankDetails supplier={{ id: "a", name: "Fornecedor sintético" }} defaultExpanded />);
      const line = screen.getByText(`${type.toUpperCase()}: ${type === "cnpj" ? "12.345.678/0001-99" : "000.000.000-00"}`);
      fireEvent.click(line.querySelector("button")!);
      expect(writeText).toHaveBeenCalledExactlyOnceWith(value);
      expect(details).toEqual({ foreign_bank_accounts: [], tax_id_foreign: value, tax_id_type: type });
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("o input CNPJ mantém o valor cru da RPC", () => {
    f.country = "BR"; f.currency = "BRL";
    f.queries["supplier-br-details"] = { available: true, details: {
      foreign_bank_accounts: [], tax_id_foreign: "12345678000199", tax_id_type: "cnpj",
    } };
    open("supplier");
    expect(screen.getByLabelText("CNPJ")).toHaveValue("12.345.678/0001-99");
  });
});
