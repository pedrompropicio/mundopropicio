import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import { isTxSettledByAmount, useInvoiceGroupProgress } from "@/hooks/useInvoiceGroupProgress";
import { TransactionOffsetsBlock, OffsetLineNote } from "@/components/TransactionOffsetsBlock";
import PaymentListReceipts from "@/components/PaymentListReceipts";
import SepaBankExecutionPanel from "@/components/SepaBankExecutionPanel";
import { MirrorAporteNotice } from "@/components/MirrorAporteNotice";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>,
  readers: {} as Record<string, () => Promise<any>>,
  keys: {} as Record<string, unknown[]>,
  enabled: {} as Record<string, boolean | undefined>,
  rows: [] as any[], allowReads: false,
  bank: {} as any,
  mirrors: {} as any,
}));
const forbidden = () => { throw new Error("#498: serviço MP/escrita proibidos"); };
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, queryFn, enabled }: any) => {
    f.readers[queryKey[0]] = queryFn;
    f.keys[queryKey[0]] = queryKey;
    f.enabled[queryKey[0]] = enabled;
    return { data: f.queries[queryKey[0]], isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (!f.allowReads || table !== "transactions") throw new Error("#498: serviço MP proibido");
    const q: any = {
      select: () => q, in: () => q, range: () => q,
      then: (resolve: any) => Promise.resolve({ data: f.rows, error: null }).then(resolve),
    };
    return q;
  },
  rpc: () => { throw new Error("#498: RPC proibida"); },
  functions: { invoke: () => { throw new Error("#498: edge proibida"); } },
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, role: "admin", permissions: [],
}) }));
vi.mock("@/lib/storage", () => ({ uploadToCompanyBucket: () => forbidden() }));
vi.mock("@/lib/transaction-document-storage", () => ({ deleteTransactionDocument: () => forbidden() }));
vi.mock("@/lib/offset-plan/groups", () => ({
  OFFSET_GROUP_STATUS_LABEL: { applied: "Aplicado" },
  useOffsetGroupsForTransaction: () => ({ data: f.queries.groups }),
}));
vi.mock("@/components/OffsetGroupDetailDialog", () => ({ OffsetGroupDetailDialog: () => null }));
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ options }: { options: { value: string; description: string }[] }) =>
    <ul>{options.map(o => <li key={o.value}>{o.description}</li>)}</ul>,
}));
vi.mock("@/hooks/useSepaBankExecution", () => ({ useSepaBankExecution: () => ({ data: f.bank, isLoading: false }) }));
vi.mock("@/lib/mirror-partner-account", () => ({ useMirrorPartnerAccounts: () => ({ data: f.mirrors }) }));

const tx = { id: "tx", type: "income", supplier_id: "supplier", amount: 1234.56, iva_rate: 0 };
const components = {
  offsets: () => <TransactionOffsetsBlock transaction={tx} canEdit />,
  receipts: () => <PaymentListReceipts listId="list" listTitle="Lista sintética" activeTransactionIds={["tx"]} />,
  bank: () => <SepaBankExecutionPanel listId="list" />,
  mirror: () => <MirrorAporteNotice accountId="mirror" amount={1234.56} />,
  note: () => <OffsetLineNote txId="tx" />,
};
type ComponentName = keyof typeof components;
const names = Object.keys(components) as ComponentName[];
function setCompany(country = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  vi.mocked(useCompany).mockReturnValue({ company: { id: "company", country, currency } as Company,
    companyId: "company", isLoading: false, isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function domHash() {
  return createHash("sha256").update(document.body.innerHTML).digest("hex");
}
async function loadProgress() {
  f.allowReads = true;
  try { return await f.readers["invoice-group-progress"](); }
  finally { f.allowReads = false; }
}
beforeEach(() => {
  vi.clearAllMocks();
  setCompany();
  f.readers = {}; f.keys = {}; f.enabled = {}; f.rows = []; f.allowReads = false;
  const ex = { id: "export", exported_at: "2026-11-03T12:00:00Z", total_amount: 1234.56,
    transaction_ids: ["tx"], n_transactions: 1, file_name: "fixture.xml" };
  f.queries = {
    "transaction-offsets": [{ id: "offset", amount: 1234.56, receivable_transaction_id: "tx",
      payable_transaction_id: "other", pay: { description: "Despesa sintética", invoice_ref: "TEST-498" }, applied: false }],
    groups: [{ group_id: "group", operation_date: "2026-11-03", supplier_name: "Entidade sintética",
      movement_amount: 1234.56, status: "applied" }],
    "offset-candidates": [{ id: "candidate", description: "Candidata sintética", amount: 1234.56, iva_rate: 0 }],
    payment_list_sepa_exports: [ex, { ...ex, id: "older", exported_at: "2026-11-02T12:00:00Z" }],
    payment_list_documents: [],
  };
  f.bank = { exports: [ex], coverageFrom: null, coverageTo: null,
    txById: new Map([["tx", { amount: 1234.56, supplier_name: "Entidade sintética" }]]),
    results: [{ transaction_id: "tx", sepa_export_id: "export", state: "sem_extrato", bank_line: null, reused: false }],
  };
  f.mirrors = { mirror: { partnerName: "Sócio sintético" } };
  vi.stubGlobal("fetch", vi.fn(forbidden));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("#498 P2e-b — baseline PT capturada antes de alterar os cinco módulos; não regenerar", () => {
  it("fixa SHA256 dos quatro componentes e da nota, incluindo candidatos de compensação", () => {
    const hashes: Record<string, string> = {};
    for (const name of names) {
      render(components[name]());
      hashes[name] = domHash();
      if (name === "offsets") {
        fireEvent.click(screen.getByRole("button", { name: "Compensa com…" }));
        hashes.candidates = domHash();
      }
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "bank": "e0d98bf916f74a2dc86407dd14333a99dced3ae8a6f18a72bb8bfc23acc64efe",
        "candidates": "f2d481072c977bd32d51c281af9736510236edc55cc566dcf7edc7ee0bfd8e6d",
        "mirror": "3e49c0852c761f0046bdbb60812cdd32e96a1eba2e07ab6b9553ff72f2d42855",
        "note": "5abbf9390768a334b45df90ed3c04e079b7973059f5e0c710217193f4c1a7119",
        "offsets": "9f5bef98299dc78e053517ccb486aa6d7e9064dcd0cf1d31371a73cd71722164",
        "receipts": "a7b971ecefe04c378be54ed4a8b42565fd5caf725701c9c6d772db646935d208",
      }
    `);
  });

  it("fixa a saída pura sem contexto e a agregação PT com taxas ausentes e explícitas", async () => {
    const cases = [
      { amount: 100, paid_amount: 100 }, { amount: 100, paid_amount: 122.95 },
      { amount: 100, paid_amount: 122.94 }, { amount: 100, iva_rate: 0, paid_amount: 100 },
      { amount: 100, iva_rate: 6, paid_amount: 106 }, { amount: 100, paid_amount: 0, status: "paid" }, {},
    ];
    // The wrapper avoids Array.map passing its index as the future optional default.
    expect(cases.map(row => isTxSettledByAmount(row))).toMatchInlineSnapshot(`
      [
        false,
        true,
        false,
        true,
        true,
        true,
        true,
      ]
    `);
    f.rows = cases.map((row, i) => ({ id: `row-${i}`, invoice_group_id: "group", ...row }));
    renderHook(() => useInvoiceGroupProgress(["group"]));
    expect(await loadProgress()).toMatchInlineSnapshot(`
      {
        "group": {
          "openWithIva": 246,
          "paidCount": 5,
          "total": 7,
        },
      }
    `);
  });
});

describe("#498 P2e-b — moeda e locale da empresa nos componentes", () => {
  it.each(names)("BR: %s mostra R$ 1.234,56 sem euros em todas as ocorrências", name => {
    setCompany("BR", "BRL");
    render(components[name]());
    if (name === "offsets") fireEvent.click(screen.getByRole("button", { name: "Compensa com…" }));
    expect(document.body.innerHTML).not.toContain("€");
    const occurrences = document.body.textContent!.split("R$\u00a01.234,56").length - 1;
    // Group + linked offset + candidate; two exports in the select and two in the list.
    expect(occurrences).toBe(name === "offsets" ? 3 : name === "receipts" ? 4 : 1);
  });

  it.each(names)("%s acompanha PT → BR → indisponível → PT sem reutilizar moeda anterior", name => {
    const view = render(components[name]());
    if (name === "offsets") fireEvent.click(screen.getByRole("button", { name: "Compensa com…" }));
    const ptHash = domHash();
    setCompany("BR", "BRL");
    view.rerender(components[name]());
    expect(document.body.textContent).toContain("R$\u00a01.234,56");
    expect(document.body.innerHTML).not.toContain("€");
    for (const overrides of [
      { company: null, companyId: null },
      { company: { id: "company", country: "BR", currency: "" } as Company },
      { isLoading: true }, { isError: true, error: new Error("fixture") },
    ]) {
      setCompany("BR", "BRL", overrides);
      view.rerender(components[name]());
      expect(document.body.innerHTML).not.toMatch(/€|R\$/);
      expect(document.body.textContent).toContain("—");
    }
    setCompany();
    view.rerender(components[name]());
    expect(domHash()).toBe(ptHash);
  });

  it.each(names)("%s usa currency configurada independentemente da política PT", name => {
    setCompany("PT", "BRL");
    render(components[name]());
    expect(document.body.textContent).toContain("1234,56\u00a0R$");
    expect(document.body.innerHTML).not.toContain("€");
  });
});

describe("#498 P2e-b — progresso da fatura e política de IVA", () => {
  it.each([null, undefined])("BR: taxa ausente %s usa 0 na contagem e no saldo; taxas explícitas prevalecem", async iva_rate => {
    setCompany("BR", "BRL");
    f.rows = [
      { invoice_group_id: "group", amount: 1234.56, paid_amount: 0, iva_rate },
      { invoice_group_id: "group", amount: 1234.56, paid_amount: 1234.56, iva_rate },
      { invoice_group_id: "group", amount: 100, paid_amount: 100, iva_rate: 6 },
      { invoice_group_id: "group", amount: 100, paid_amount: 100, iva_rate: 0 },
      { invoice_group_id: "group", amount: 10, paid_amount: 0, status: "paid", iva_rate },
      { invoice_group_id: "other", amount: 12, paid_amount: 0, iva_rate },
      { invoice_group_id: null, amount: 999, paid_amount: 0, iva_rate },
    ];
    renderHook(() => useInvoiceGroupProgress(["group", "other"]));
    expect(await loadProgress()).toEqual({
      group: { total: 5, paidCount: 3, openWithIva: 1340.56 },
      other: { total: 1, paidCount: 0, openWithIva: 12 },
    });
  });

  it("o helper puro aceita default opcional, preserva tolerância/estado e respeita taxas explícitas", () => {
    expect(isTxSettledByAmount({ amount: 100, paid_amount: 99.95 }, 0)).toBe(true);
    expect(isTxSettledByAmount({ amount: 100, paid_amount: 99.94 }, 0)).toBe(false);
    expect(isTxSettledByAmount({ amount: 100, paid_amount: 100 }, 0)).toBe(true);
    expect(isTxSettledByAmount({ amount: 100, paid_amount: 100 })).toBe(false);
    expect(isTxSettledByAmount({ amount: 100, paid_amount: 100, iva_rate: 6 }, 0)).toBe(false);
    expect(isTxSettledByAmount({ amount: 100, paid_amount: 100, iva_rate: 0 })).toBe(true);
    expect(isTxSettledByAmount({ amount: 100, paid_amount: 0, status: "paid" }, 0)).toBe(true);
  });

  it("a query isola empresa/default e mantém seleção por grupos, sem leituras com seleção vazia", async () => {
    const view = renderHook(({ ids }) => useInvoiceGroupProgress(ids), { initialProps: { ids: ["b", "a", "b", ""] } });
    const key = () => [...f.keys["invoice-group-progress"]];
    const pt = key();
    expect(pt.slice(0, 2)).toEqual(["invoice-group-progress", "a,b"]);
    f.rows = [{ invoice_group_id: "a", amount: 100, paid_amount: 100 }];
    expect(await loadProgress()).toEqual({ a: { total: 1, paidCount: 0, openWithIva: 123 } });
    setCompany("BR", "BRL");
    view.rerender({ ids: ["a", "b"] });
    const br = key();
    expect(br).not.toEqual(pt);
    expect(await loadProgress()).toEqual({ a: { total: 1, paidCount: 1, openWithIva: 0 } });
    setCompany("BR", "BRL", { companyId: "other-company" });
    view.rerender({ ids: ["a", "b"] });
    expect(key()).not.toEqual(br);
    setCompany("BR", "BRL", { isLoading: true });
    view.rerender({ ids: ["a", "b"] });
    expect(key()).not.toEqual(br);
    expect(await loadProgress()).toEqual({ a: { total: 1, paidCount: 0, openWithIva: 123 } });
    setCompany();
    view.rerender({ ids: ["a", "b"] });
    expect(key()).toEqual(pt);
    view.rerender({ ids: [] });
    expect(f.enabled["invoice-group-progress"]).toBe(false);
  });
});
