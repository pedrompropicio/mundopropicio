import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PaymentListsTab from "@/components/PaymentListsTab";
import SepaExportModal, { type SepaCandidate } from "@/components/SepaExportModal";
import { checkPaymentBankability, resolvePaymentIban, isBankable, isInternalNoIban, noIbanBadgeProps, bankDataOutsideSepaBadgeProps } from "@/lib/payment-iban";
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

const list = { id: "list", title: "Lista sintética SEPA", payment_date: "2026-11-03", status: "approved",
  created_at: "2026-11-01T12:00:00Z", created_by: "fixture@example.invalid", approved_by: null, approved_at: null };
const iban = "PT50001800034889774802033";
const tx = { id: "tx", description: "Serviço sintético", amount: 100, iva_rate: 23, paid_amount: 0,
  status: "approved", type: "expense", currency: "EUR", supplier_id: "supplier", invoice_group_id: null,
  suppliers: { name: "Fornecedor sintético", iban }, payment_method: "transfer", date: "2026-10-01" };
const groupTx = { ...tx, id: "group-tx", invoice_group_id: "group", invoice_ref: "TEST-498" };
const items = [tx, groupTx].map(transactions => ({ id: `item-${transactions.id}`, payment_list_id: list.id,
  transactions, transaction_id: transactions.id, removed_at: null, manually_marked_paid: false }));
const candidates: SepaCandidate[] = [
  { transactionId: "tx", creditorName: "Fornecedor sintético", iban, amount: 123,
    description: "Serviço sintético", isReimbursement: false },
  { transactionId: "missing", creditorName: "Fornecedor sem conta", iban: null, amount: 10,
    description: "Sem dados SEPA", isReimbursement: false },
];
function setCompany(country = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  vi.mocked(useCompany).mockReturnValue({ company: { id: "company", country, currency } as Company,
    companyId: "company", isLoading: false, isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function hashDom(html = document.body.innerHTML) {
  // Preserve all bytes except generated Radix IDs, matching the existing PT baselines.
  return createHash("sha256").update(html.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function openDetail() {
  const view = render(<PaymentListsTab />);
  fireEvent.click(screen.getByText(list.title));
  return view;
}
function renderSepa(rows = candidates) {
  return render(<SepaExportModal listId={list.id} listTitle={list.title} listStatus={list.status}
    paymentDate={list.payment_date} candidates={rows} companyName="Empresa sintética" onClose={vi.fn()} />);
}
beforeEach(() => {
  vi.clearAllMocks();
  setCompany();
  f.readers = {}; f.keys = {}; f.allowReads = false;
  f.installmentIds = new Set();
  f.queries = { "payment-lists": [list], "payment-list": list, "payment-list-items": items,
    "sepa-debtor-accounts": [{ id: "account", name: "Conta sintética", iban }] };
  f.clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: f.clipboard } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P3c — baseline PT capturada antes das alterações de produção", () => {
  it("fixa o DOM do detalhe aprovado com botão SEPA e o DOM do modal real", () => {
    openDetail();
    expect(screen.getByRole("button", { name: "Ficheiro Santander" })).toBeEnabled();
    const detail = hashDom();
    fireEvent.click(screen.getByRole("button", { name: "Ficheiro Santander" }));
    const modal = screen.getByRole("heading", { name: "Exportar ficheiro Santander" }).closest(".glass")!;
    expect({ detail, modal: hashDom(modal.outerHTML) }).toMatchInlineSnapshot(`
      {
        "detail": "be37040395e68b6da88868c0d34cde8a3c68a787b7fde8cd06f201930b4c587d",
        "modal": "fbd76cf27f324668c0d0d44fc2465b941fec6917c5277208821f23d9f917a263",
      }
    `);
  });

  it("fixa exactamente o contrato sem contexto, incluindo precedências e casos especiais", () => {
    const transactions = [null, {}, { iban_override: "  PT override  ", suppliers: { iban } },
      { suppliers: { iban: "  ", iban_2: "  segunda  ", iban_3: "terceira" } },
      { payment_entity: "12345" }, { payment_reference: "123456789" },
      { type: "expense", account_categories: { code: "10.4.02" } },
      { card_load_destination: { name: "Cartão", iban: null } },
      { card_load_destination: { name: "Cartão", iban: "PT destino" }, suppliers: { iban } }];
    expect(transactions.map(tx => checkPaymentBankability(tx))).toMatchInlineSnapshot(`
      [
        {
          "iban": null,
          "internalNoIban": false,
          "isCardLoad": false,
          "ok": false,
          "reason": "no_bank_data",
          "socialSecurityByNif": false,
          "viaReference": false,
        },
        {
          "iban": null,
          "internalNoIban": false,
          "isCardLoad": false,
          "ok": false,
          "reason": "no_bank_data",
          "socialSecurityByNif": false,
          "viaReference": false,
        },
        {
          "iban": "PT override",
          "internalNoIban": false,
          "isCardLoad": false,
          "ok": true,
          "socialSecurityByNif": false,
          "viaReference": false,
        },
        {
          "iban": "segunda",
          "internalNoIban": false,
          "isCardLoad": false,
          "ok": true,
          "socialSecurityByNif": false,
          "viaReference": false,
        },
        {
          "iban": null,
          "internalNoIban": false,
          "isCardLoad": false,
          "ok": true,
          "socialSecurityByNif": false,
          "viaReference": true,
        },
        {
          "iban": null,
          "internalNoIban": false,
          "isCardLoad": false,
          "ok": true,
          "socialSecurityByNif": false,
          "viaReference": true,
        },
        {
          "iban": null,
          "internalNoIban": false,
          "isCardLoad": false,
          "ok": true,
          "socialSecurityByNif": true,
          "viaReference": false,
        },
        {
          "iban": null,
          "internalNoIban": true,
          "isCardLoad": true,
          "ok": true,
          "socialSecurityByNif": false,
          "viaReference": false,
        },
        {
          "iban": "PT destino",
          "internalNoIban": false,
          "isCardLoad": true,
          "ok": true,
          "socialSecurityByNif": false,
          "viaReference": false,
        },
      ]
    `);
  });
});

describe("#498 P3c — elegibilidade gerencial separada do SEPA", () => {
  it("sem SEPA permite pagamento sem IBAN, sem inferir nem expor contas BR/Pix", () => {
    const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
    if (br.status !== "available") throw new Error("fixture BR inválida");
    const transaction = { ...tx, suppliers: { name: "Fornecedor BR", iban: null,
      foreign_bank_accounts: [{ account_number: "12345-6", pix_key: "fixture@example.invalid" }] } };
    expect(checkPaymentBankability(transaction, br.capabilities)).toEqual({
      ok: true, iban: null, viaReference: false, isCardLoad: false, internalNoIban: false,
      socialSecurityByNif: false, bankDataOutsideSepa: true,
    });
    expect(resolvePaymentIban(transaction)).toBeNull();
    expect(transaction.suppliers.foreign_bank_accounts[0].account_number).toBe("12345-6");
    expect(bankDataOutsideSepaBadgeProps()).toEqual({ label: "Pagamento fora do SEPA",
      tooltip: "Pagamento fora do SEPA — dados bancários no cadastro do fornecedor" });
    // Existing consumers keep their one-argument contract until their own dispatch wires context.
    expect(isBankable(transaction)).toBe(false);
    expect(isInternalNoIban(transaction)).toBe(false);
    expect(noIbanBadgeProps(transaction)).toEqual({ label: "Sem IBAN",
      tooltip: "Associa um fornecedor com IBAN ou define IBAN manual na transação para poder incluir em lista" });
  });

  it.each([{}, { suppliers: { iban: "" } }, { suppliers: { iban: "  " } }])(
    "omissão e SEPA activo mantêm a recusa original: %j", transaction => {
      expect(checkPaymentBankability(transaction, { sepa: true })).toEqual(checkPaymentBankability(transaction));
      expect(checkPaymentBankability(transaction).ok).toBe(false);
      expect(checkPaymentBankability(transaction, { sepa: false })).toMatchObject({
        ok: true, iban: null, bankDataOutsideSepa: true,
      });
    });

  it.each([{ suppliers: { iban } }, { payment_entity: "12345" }, { payment_reference: "123456789" },
    { type: "expense", account_categories: { code: "10.4.02" } },
    { card_load_destination: { name: "Cartão", iban: null } }])(
    "o contexto não altera a resolução já existente: %j", transaction => {
      expect(checkPaymentBankability(transaction, { sepa: false })).toEqual(checkPaymentBankability(transaction));
    });
});

describe("#498 P3c — entrada e modal SEPA por capability", () => {
  it.each([["BR", "BRL"], ["PT", "BRL"], ["BR", "EUR"], ["PT", "USD"]])(
    "%s/%s: botão desactivado e explicação, mesmo com IBAN válido", (country, currency) => {
      setCompany(country, currency);
      openDetail();
      const button = screen.getByRole("button", { name: "Ficheiro Santander" });
      expect(button).toBeDisabled();
      const explanation = `Exportação SEPA indisponível para esta empresa (moeda ${currency})`;
      expect(button).toHaveAttribute("title", explanation);
      expect(screen.getByText(explanation)).toBeInTheDocument();
      fireEvent.click(button);
      expect(screen.queryByRole("heading", { name: "Exportar ficheiro Santander" })).not.toBeInTheDocument();
      expect(f.readers["sepa-debtor-accounts"]).toBeUndefined();
    });

  it("BR: as duas linhas bancárias usam o rótulo da empresa", () => {
    setCompany("BR", "BRL");
    openDetail();
    expect(screen.getAllByText("Conta bancária:")).toHaveLength(2);
    expect(screen.queryByText("IBAN:")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(f.clipboard).toHaveBeenCalledOnce();
    expect(f.clipboard.mock.calls[0][0]).toContain(`Conta bancária: ${iban}`);
    expect(f.clipboard.mock.calls[0][0]).not.toContain("IBAN:");
  });

  it.each([["BR", "BRL"], ["PT", "BRL"], ["BR", "EUR"]])(
    "%s/%s: montagem directa não inicia queries, compactação, geração ou download", (country, currency) => {
      setCompany(country, currency);
      const long = [{ ...candidates[0], description: "Serviço sintético longo ".repeat(30) }];
      const view = renderSepa(long);
      expect(view.container).toBeEmptyDOMElement();
      expect(f.readers["sepa-debtor-accounts"]).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    });

  it.each([{ company: null, companyId: null }, { isLoading: true }, { isError: true }])(
    "contexto indisponível %j recusa abertura e montagem directa", overrides => {
      setCompany("PT", "EUR", overrides);
      openDetail();
      expect(screen.getByRole("button", { name: "Ficheiro Santander" })).toBeDisabled();
      cleanup();
      const view = renderSepa();
      expect(view.container).toBeEmptyDOMElement();
      expect(f.readers["sepa-debtor-accounts"]).toBeUndefined();
    });

  it("PT → BR desmonta o modal aberto e BR → PT preserva a apresentação original", () => {
    const view = openDetail();
    const before = hashDom();
    fireEvent.click(screen.getByRole("button", { name: "Ficheiro Santander" }));
    expect(screen.getByRole("heading", { name: "Exportar ficheiro Santander" })).toBeInTheDocument();
    setCompany("BR", "BRL");
    view.rerender(<PaymentListsTab />);
    expect(screen.queryByRole("heading", { name: "Exportar ficheiro Santander" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ficheiro Santander" })).toBeDisabled();
    setCompany();
    view.rerender(<PaymentListsTab />);
    expect(screen.getByRole("heading", { name: "Exportar ficheiro Santander" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(hashDom()).toBe(before);
  });

  it("PT: sem IBAN fica excluído e nunca se inventa uma conta para o ficheiro", () => {
    renderSepa([candidates[1]]);
    expect(screen.getByText("Sem IBAN")).toBeInTheDocument();
    expect(screen.getByText("Excluídos (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar ficheiro (0)" })).toBeDisabled();
  });

  it("mantém o gerador e os consumidores sem branches de país ou calendários novos", () => {
    for (const path of ["src/lib/payment-iban.ts", "src/components/PaymentListsTab.tsx", "src/components/SepaExportModal.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
      expect(source).not.toContain('type="date"');
    }
  });
});
