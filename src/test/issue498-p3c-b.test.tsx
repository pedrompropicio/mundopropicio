import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PaymentListsTab from "@/components/PaymentListsTab";
import { BatchPaymentModal } from "@/components/BatchPaymentModal";
import NoIbanBadge from "@/components/NoIbanBadge";
import { noIbanBadgeProps, bankDataOutsideSepaBadgeProps, internalNoIbanBadgeProps, socialSecurityBadgeProps } from "@/lib/payment-iban";
import { useCompany, type Company } from "@/hooks/useCompany";

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
vi.mock("@/lib/account-balance-rpc", () => ({
  accountHasBalanceFor: vi.fn(), useAccountTrueBalance: () => null,
}));
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

// Synthetic fixtures cover missing data, resolvable IBANs, and an atomic mixed invoice.
const list = { id: "list", title: "Lista sintética P3c-b", payment_date: "2026-11-03", status: "pending_approval",
  created_at: "2026-11-01T12:00:00Z", created_by: "fixture@example.invalid", approved_by: null, approved_at: null };
const iban = "PT50001800034889774802033";
const tx = { id: "missing", description: "Serviço sem conta", amount: 100, iva_rate: null, paid_amount: 0,
  status: "approved", type: "expense", currency: "EUR", supplier_id: "supplier", invoice_group_id: null,
  suppliers: { name: "Fornecedor sintético", iban: null }, payment_method: "transfer", date: "2026-10-01" };
const bankTx = { ...tx, id: "bank", description: "Serviço com IBAN", suppliers: { ...tx.suppliers, iban } };
const grouped = [
  { ...tx, id: "group-missing", description: "Linha agrupada sem conta", invoice_group_id: "group", invoice_ref: "TEST-498" },
  { ...bankTx, id: "group-bank", description: "Linha agrupada com IBAN", invoice_group_id: "group", invoice_ref: "TEST-498" },
];
const transactions = [tx, bankTx, ...grouped];
const items = transactions.map(transactions => ({ id: `item-${transactions.id}`, payment_list_id: list.id,
  transactions, transaction_id: transactions.id, removed_at: null, manually_marked_paid: false }));
const extra = transactions.map(t => ({ ...t, id: `extra-${t.id}`,
  invoice_group_id: t.invoice_group_id ? "extra-group" : null, invoice_ref: t.invoice_group_id ? "TEST-EXTRA" : null }));
const bank = { id: "account", name: "Conta sintética", type: "bank" };
const screens = ["criação", "adição", "detalhe", "aprovação", "lote"] as const;
type ScreenName = typeof screens[number];
function setCompany(country = "PT", currency = "EUR") {
  vi.mocked(useCompany).mockReturnValue({ company: { id: "company", country, currency } as Company,
    companyId: "company", isLoading: false, isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn() });
}
function hashDom() {
  // Normalize only generated Radix IDs; every other rendered byte remains covered.
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function batchElement(rows = transactions) {
  return <BatchPaymentModal transactions={rows} onClose={vi.fn()} initialPaymentDate="2026-11-03" />;
}
function openScreen(name: ScreenName) {
  if (name === "lote") return render(batchElement());
  const view = render(<PaymentListsTab />);
  if (name === "criação") fireEvent.click(screen.getByRole("button", { name: "Nova Lista" }));
  if (name === "aprovação") fireEvent.click(screen.getByTitle("Aprovar (total ou parcial)"));
  if (name === "detalhe" || name === "adição") fireEvent.click(screen.getByText(list.title));
  if (name === "adição") fireEvent.click(screen.getByRole("button", { name: "Adicionar transações" }));
  return view;
}
function modal(name: ScreenName) {
  const heading = name === "detalhe" ? list.title : name === "aprovação" ? "Aprovar Lista de Pagamentos"
    : name === "adição" ? "Adicionar transações à lista" : name === "lote" ? "Liquidação em Lote" : "Nova Lista de Contas a Pagar";
  return screen.getByRole("heading", { name: heading }).closest<HTMLDivElement>(".glass")!;
}
function chooseAccount() {
  fireEvent.click(screen.getByRole("button", { name: "Selecionar conta…" }));
  fireEvent.click(screen.getByRole("button", { name: bank.name }));
}
beforeEach(() => {
  vi.clearAllMocks();
  setCompany();
  f.readers = {}; f.keys = {}; f.allowReads = false; f.installmentIds = new Set();
  f.queries = { "payment-lists": [list], "payment-list": list, "payment-list-items": items,
    "payment-list-items-approve": items, "approved-transactions-for-list": [...transactions, ...extra],
    "financial-accounts-active": [bank] };
  f.clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: f.clipboard } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P3c-b — hashes PT capturados antes de alterar os consumidores (não regenerar)", () => {
  it("fixa criação, adição, detalhe, aprovação e lote com itens sem IBAN e grupos mistos", () => {
    const hashes: Record<string, string> = {};
    for (const name of screens) {
      openScreen(name);
      hashes[name] = hashDom();
      // Also pin the opened invoice, where the nested missing-data badge lives.
      if (name === "aprovação") {
        fireEvent.click(within(modal(name)).getByRole("button", { name: "Ver itens" }));
        hashes["aprovação expandida"] = hashDom();
      }
      if (name === "lote") {
        fireEvent.click(within(modal(name)).getAllByRole("checkbox")[0]);
        chooseAccount();
        hashes["lote seleccionado"] = hashDom();
      }
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "adição": "a4c26d057391195f8f252711b8d61b7df156134b88bfab8215d50c26b01b0c91",
        "aprovação": "5dddbaf6eb040c87d95454f11357a033bd782ea2ad7e18773f87820d20a15134",
        "aprovação expandida": "e15e04efd6427083d32ab5fb705a92ad545b0194bb2717a083cedb1451b9e924",
        "criação": "161a19b26f9d06c01f5bfc6db41b2c252281784bbf8d5c8a2c48bf5d555f56bb",
        "detalhe": "7f779efc605b7f9d4b2f4d4a614342578f283b6a4abbdaa7a7dbcd3c1c8d0a00",
        "lote": "2d0c0db4a8f4021da8b197f39545188fb60d1120dd7417c63f802efdf6ec579a",
        "lote seleccionado": "93d0c00c8c60758bbc8f2e2cc1ec66a6029bb2a76fbac364b4b0390dcb4bac88",
      }
    `);
  });
});

function expectOutsideSepa(scope: ReturnType<typeof within>) {
  const badge = bankDataOutsideSepaBadgeProps();
  const badges = scope.getAllByText(badge.label);
  for (const element of badges) {
    expect(element).toHaveAttribute("title", badge.tooltip);
    expect(element).toHaveClass("bg-muted", "text-muted-foreground");
  }
  expect(scope.queryByText("Sem IBAN")).not.toBeInTheDocument();
  expect(scope.queryByText(/sem dados bancários/)).not.toBeInTheDocument();
}

describe("#498 P3c-b — elegibilidade e badges BR nos consumidores reais", () => {
  it.each(["criação", "adição"] as const)("BR: %s permite item sem conta, grupo misto e seleccionar todos", name => {
    setCompany("BR", "BRL");
    openScreen(name);
    const scope = within(modal(name));
    expectOutsideSepa(scope);
    const missingRow = scope.getAllByText(tx.description)[0].closest("tr")!;
    expect(within(missingRow).getByRole("checkbox")).toBeEnabled();
    fireEvent.click(missingRow);
    expect(scope.getByText("1 selecionada(s)")).toBeInTheDocument();
    fireEvent.click(missingRow);
    const groupRow = scope.getByText(/TEST-EXTRA$/).closest("tr")!;
    expect(groupRow).toHaveAttribute("title", bankDataOutsideSepaBadgeProps().tooltip);
    expect(within(groupRow).getByRole("checkbox")).toBeEnabled();
    fireEvent.click(groupRow);
    expect(scope.getByText("2 selecionada(s)")).toBeInTheDocument();
    expect(within(groupRow).getByRole("checkbox")).toBeChecked();
    fireEvent.click(groupRow);
    fireEvent.click(scope.getAllByRole("checkbox")[0]);
    expect(scope.getByText(`${name === "criação" ? 8 : 4} selecionada(s)`)).toBeInTheDocument();
    for (const checkbox of scope.getAllByRole("checkbox")) expect(checkbox).toBeChecked();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("BR: aprovação mantém todos seleccionados, permite seleção parcial e não conta itens fora do SEPA como sem IBAN", () => {
    setCompany("BR", "BRL");
    openScreen("aprovação");
    const scope = within(modal("aprovação"));
    expectOutsideSepa(scope);
    expect(scope.getByText("4 de 4 selecionada(s)")).toBeInTheDocument();
    expect(scope.getByRole("button", { name: "Aprovar Todas" })).toBeEnabled();
    fireEvent.click(scope.getByRole("button", { name: "Ver itens" }));
    expectOutsideSepa(scope);
    expect(scope.getByText(grouped[0].description).closest("tr")!).toHaveTextContent(bankDataOutsideSepaBadgeProps().label);
    const missingRow = scope.getByText(tx.description).closest("tr")!;
    fireEvent.click(missingRow);
    expect(scope.getByText("3 de 4 selecionada(s)")).toBeInTheDocument();
    fireEvent.click(missingRow);
    expect(scope.getByText("4 de 4 selecionada(s)")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("BR: detalhe aprovado informa pagamento fora do SEPA e mantém o item seleccionável para liquidação", () => {
    setCompany("BR", "BRL");
    f.queries["payment-list"] = { ...list, status: "approved" };
    openScreen("detalhe");
    const scope = within(modal("detalhe"));
    expectOutsideSepa(scope);
    const heading = scope.getByText(tx.description);
    const card = heading.closest(".rounded-lg.border")!;
    fireEvent.click(within(card as HTMLElement).getByRole("checkbox"));
    expect(scope.getByRole("button", { name: /Liquidar \(1\)/ })).toBeEnabled();
    expect(scope.getByRole("button", { name: "Ficheiro Santander" })).toBeDisabled();
  });

  it.each([null, new Set<string>(), new Set([bankTx.id])])(
    "BR: lote oferece escolha explícita de outro canal com badge e liquidação habilitada (exportação=%j)", exportedIds => {
      setCompany("BR", "BRL");
      const missing = { ...tx, currency: "BRL" };
      f.queries["batch-sepa-exported-ids"] = exportedIds;
      render(batchElement([missing]));
      const scope = within(modal("lote"));
      expectOutsideSepa(scope);
      expect(scope.getByText("0 transação(ões) selecionada(s)")).toBeInTheDocument();
      chooseAccount();
      expect(scope.getByRole("button", { name: /Liquidar/ })).toBeDisabled();
      const checkbox = scope.getByRole("checkbox");
      expect(checkbox).toBeEnabled();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(scope.getByText("1 transação(ões) selecionada(s)")).toBeInTheDocument();
      expect(scope.getByRole("button", { name: /Liquidar 0 do lote \+ 1 de outro canal/ })).toBeEnabled();
      expect(scope.getAllByText(bankDataOutsideSepaBadgeProps().label)).toHaveLength(2);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("BR: referências, cargas internas e Segurança Social preservam as precedências e badges existentes", () => {
    setCompany("BR", "BRL");
    const special = [
      { ...tx, id: "reference", description: "Referência sintética", payment_entity: "12345", payment_reference: "123456789" },
      { ...tx, id: "internal", description: "Carga sintética", card_load_destination: { name: "Cartão sintético", iban: null } },
      { ...tx, id: "social", description: "Contribuição sintética", account_categories: { code: "10.4.02", name: "Segurança Social" } },
    ];
    f.queries["approved-transactions-for-list"] = special;
    openScreen("criação");
    const scope = within(modal("criação"));
    expect(scope.queryByText("Sem IBAN")).not.toBeInTheDocument();
    expect(scope.queryByText(bankDataOutsideSepaBadgeProps().label)).not.toBeInTheDocument();
    expect(scope.getByText(internalNoIbanBadgeProps().label)).toHaveAttribute("title", internalNoIbanBadgeProps().tooltip);
    expect(scope.getByText(socialSecurityBadgeProps().label)).toHaveAttribute("title", socialSecurityBadgeProps().tooltip);
    fireEvent.click(scope.getAllByRole("checkbox")[0]);
    expect(scope.getByText("3 selecionada(s)")).toBeInTheDocument();
  });
});

describe("#498 P3c-b — PT e mudança de capability", () => {
  it.each(["criação", "adição"] as const)("PT: %s conserva bloqueios do item/grupo e contagem sem dados bancários", name => {
    openScreen(name);
    const scope = within(modal(name));
    const row = scope.getAllByText(tx.description)[0].closest("tr")!;
    expect(within(row).getByRole("checkbox")).toBeDisabled();
    expect(row).toHaveAttribute("title", noIbanBadgeProps(tx).tooltip);
    const groupRow = scope.getByText(/TEST-EXTRA$/).closest("tr")!;
    expect(within(groupRow).getByRole("checkbox")).toBeDisabled();
    expect(groupRow).toHaveAttribute("title", noIbanBadgeProps(tx).tooltip);
    expect(scope.getByText(new RegExp(`^${name === "criação" ? 4 : 2} transaç.*sem dados bancários`))).toBeInTheDocument();
    expect(scope.queryByText(bankDataOutsideSepaBadgeProps().label)).not.toBeInTheDocument();
    fireEvent.click(row);
    fireEvent.click(groupRow);
    expect(scope.getByText("0 selecionada(s)")).toBeInTheDocument();
  });

  it.each(screens)("%s reavalia PT → BR → PT mantendo as mesmas transações em memória", name => {
    const view = openScreen(name);
    const before = document.body.cloneNode(true);
    setCompany("BR", "BRL");
    view.rerender(name === "lote" ? batchElement() : <PaymentListsTab />);
    expectOutsideSepa(within(modal(name)));
    if (name === "criação" || name === "adição") {
      const scope = within(modal(name));
      const row = scope.getAllByText(tx.description)[0].closest("tr")!;
      expect(within(row).getByRole("checkbox")).toBeEnabled();
      fireEvent.click(scope.getAllByRole("checkbox")[0]);
      expect(scope.getByText(`${name === "criação" ? 8 : 4} selecionada(s)`)).toBeInTheDocument();
      // Restore the selection as well as the company before comparing bytes.
      fireEvent.click(scope.getAllByRole("checkbox")[0]);
    }
    setCompany();
    view.rerender(name === "lote" ? batchElement() : <PaymentListsTab />);
    // React reinserts disabled attributes on PT return; compare node values here.
    // The immutable baseline above still hashes the original markup bytes.
    expect(document.body.isEqualNode(before)).toBe(true);
  });

  it("NoIbanBadge conserva a omissão PT e aceita rótulo/tooltip neutros do helper existente", () => {
    const view = render(<NoIbanBadge />);
    expect(screen.getByText("Sem IBAN")).toHaveAttribute("title", noIbanBadgeProps(tx).tooltip);
    expect(screen.getByText("Sem IBAN")).toHaveClass("bg-destructive/15", "text-destructive");
    view.rerender(<NoIbanBadge variant="neutral" {...bankDataOutsideSepaBadgeProps()} />);
    expectOutsideSepa(within(view.container));
  });

  it("os consumidores não introduzem condições por país nem calendários nativos", () => {
    for (const path of ["src/components/PaymentListsTab.tsx", "src/components/BatchPaymentModal.tsx", "src/components/NoIbanBadge.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
      expect(source).not.toContain('type="date"');
    }
  });
});
