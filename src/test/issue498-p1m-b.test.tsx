import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import { PartnerPaymentDialog } from "@/components/PartnerPaymentDialog";
import { computeSettlementEngine } from "@/lib/event-settlement-engine";
import { buildFreezeValues } from "@/lib/partner-contracts";
import { formatBrTaxId } from "@/lib/supplier-bank";

const f = vi.hoisted(() => ({
  country: "PT", currency: "EUR", loading: false,
  queries: {} as Record<string, unknown>, engine: null as unknown,
  rpc: vi.fn(), pending: [] as Promise<unknown>[],
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { country: f.country, currency: f.currency },
  companyId: "7c858982-6ccd-47ca-bd65-e0dd3eebf01c", isLoading: f.loading, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "admin", user: { id: "fixture-user" } }) }));
// Queries receive fixtures; mutations exercise the real adapter against an inert RPC mock.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: f.queries[String(queryKey[0])], refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: { mutationFn: (...args: unknown[]) => unknown }) => ({
    mutate: (...args: unknown[]) => { f.pending.push(Promise.resolve(mutationFn(...args))); }, isPending: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: f.rpc, from: () => { throw new Error("#498 P1m-b: serviço MP proibido"); },
} }));
vi.mock("@/hooks/useEventSettlementEngine", () => ({ useEventSettlementEngine: () => f.engine }));

const supplier = { id: "supplier", name: "Fornecedor PT", nif: "509123456",
  iban: "PT50000201231234567890154", swift_bic: "BPLIPTPL" };
const noop = () => {};
const dialog = () => <PartnerPaymentDialog open onOpenChange={noop} eventId="event" participantId="participant"
  supplierId="supplier" partnerName="Sócio sintético" />;
const details = () => <SupplierBankDetails supplier={supplier} defaultExpanded />;

function setCompany(country = "PT", currency = "EUR") { f.country = country; f.currency = currency; }
function setBasis(gross: boolean, frozen = false) {
  const result = computeSettlementEngine({
    eventBasis: gross ? "net_result_gross_expenses" : "net_result",
    eventTotals: { revenueNet: 3000, expensesNet: 1234.56, expensesGross: 1518.51 },
    settlements: [{ id: "root", name: "Raiz sintética", parent_id: null, position: 0 }],
    participants: [
      { id: "participant", settlement_id: "root", participant_kind: "partner", name: "Sócio sintético", mode: "settles", profit_pct: 50 },
      { id: "house", settlement_id: "root", participant_kind: "house", name: "MP", mode: "settles", profit_pct: 50 },
    ],
  });
  const node = result.nodes[0];
  const values = buildFreezeValues(node.participants.find(p => p.id === "participant")!, node);
  f.engine = { result, isLoading: false };
  f.queries["partner-payment-participant"] = { id: "participant", mode: "settles",
    frozen_at: frozen ? "2026-11-03T12:00:00Z" : null, frozen_values: frozen ? values : null };
  return values;
}
// Only generated Radix identifiers are normalized; all other DOM bytes are retained.
function domHash() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
const amounts = () => Array.from(document.querySelectorAll("dd"), node => node.textContent);

beforeEach(() => {
  vi.clearAllMocks(); setCompany(); f.loading = false; f.pending = [];
  f.rpc.mockResolvedValue({ data: null, error: null });
  f.queries = { "partner-payment-suppliers": [{ id: "supplier", name: "Sócio sintético" }] };
  setBasis(true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1m-b: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498 P1m-b: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498 P1m-b: rede proibida"); } });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); cleanup(); vi.unstubAllGlobals(); });

describe("#498 P1m-b — baseline PT fixada antes de alterar produção; não regenerar", () => {
  it("preserva SHA-256 do fornecedor PT e do diálogo em prévia/congelado, nas duas bases", () => {
    const hashes: Record<string, string> = {};
    render(details()); hashes.supplier = domHash(); cleanup();
    for (const gross of [true, false]) {
      for (const frozen of [false, true]) {
        setBasis(gross, frozen); render(dialog());
        hashes[`${frozen ? "frozen" : "preview"}-${gross}`] = domHash(); cleanup();
      }
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "frozen-false": "a5120bc83bac4161434dde71fa47c1d42aa297fb3888e5ef4f10e3647201b3d1",
        "frozen-true": "e0b0c9b01f35f76e251841ecf5fb5b0d295af3979db404269cd31af97ca42584",
        "preview-false": "4116ead3168a3fab980137590e00f09fced47998554594394c992008c445eae3",
        "preview-true": "01d6dadd89e560117ffc9021808ba45e2cbb73c25c3d5dd04e58b65e8725df6f",
        "supplier": "cfa746ea3c685778c3d6d34d52b81d8b730707b184192a2e130b5f3109237c2b",
      }
    `);
  });

  it("preserva todos os montantes BR em prévia/congelado, nas duas bases", () => {
    setCompany("BR", "BRL");
    const values: Record<string, Array<string | null>> = {};
    for (const gross of [true, false]) {
      for (const frozen of [false, true]) {
        setBasis(gross, frozen); render(dialog());
        values[`${frozen ? "frozen" : "preview"}-${gross}`] = amounts(); cleanup();
      }
    }
    expect(values).toMatchInlineSnapshot(`
      {
        "frozen-false": [
          "R$ 3.000,00",
          "-R$ 1.234,56",
          "R$ 1.765,44",
        ],
        "frozen-true": [
          "R$ 3.000,00",
          "-R$ 1.518,51",
          "R$ 1.481,49",
        ],
        "preview-false": [
          "R$ 882,72",
          "50%",
          "R$ 3.000,00",
          "-R$ 1.234,56",
          "R$ 1.765,44",
        ],
        "preview-true": [
          "R$ 740,75",
          "50%",
          "R$ 3.000,00",
          "-R$ 1.518,51",
          "R$ 1.481,49",
        ],
      }
    `);
  });
});

describe("#498 P1m-b — máscara fiscal só na apresentação", () => {
  it.each([
    ["12345678000199", "cnpj", "12.345.678/0001-99"],
    ["00000000000000", "cnpj", "00.000.000/0000-00"],
    [" 12.345.678/0001-99 ", "cnpj", "12.345.678/0001-99"],
    ["00000000000", "cpf", "000.000.000-00"],
    ["12345678900", "CPF", "123.456.789-00"],
    [" 000.000.000-00 ", "cpf", "000.000.000-00"],
    ["12345678000199", null, "12.345.678/0001-99"],
    [" 12-34 ", "cnpj", " 12-34 "],
    [" 123 ", "cpf", " 123 "],
    ["12345678900", "cnpj", "12345678900"],
    ["12345678000199", "cpf", "12345678000199"],
    ["12345678900", "tin", "12345678900"],
  ])("apresenta %j (%s) como %j e copia os bytes originais", (value, type, expected) => {
    setCompany("BR", "BRL");
    const source = { foreign_bank_accounts: [], tax_id_foreign: value, tax_id_type: type };
    const originalSource = structuredClone(source);
    f.queries["supplier-br-details"] = { available: true, details: source };
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(details());
      const label = screen.getByText(`${type?.toUpperCase() || "CNPJ"}: ${expected.trim()}`);
      expect(label.textContent).toBe(`${type?.toUpperCase() || "CNPJ"}: ${expected}`);
      expect(formatBrTaxId(value!, type)).toBe(expected);
      fireEvent.click(label.querySelector("button")!);
      expect(writeText).toHaveBeenCalledExactlyOnceWith(value);
      expect(source).toEqual(originalSource);
      expect(f.rpc).not.toHaveBeenCalled();
    } finally {
      if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

describe("#498 P1m-b — origem sem sufixos fiscais BR", () => {
  it.each([true, false])("prévia e congelado usam a base neutra; bruta=%s", gross => {
    setCompany("BR", "BRL");
    for (const frozen of [false, true]) {
      const values = setBasis(gross, frozen);
      const original = structuredClone(values);
      // A frozen origin must survive even when the current engine is unavailable.
      if (frozen) f.engine = { result: null, isLoading: false };
      render(dialog());
      expect(screen.getByText(`= Resultado do fechamento (base ${gross ? "bruta" : "líquida"})`)).toBeInTheDocument();
      expect(document.body.innerHTML).not.toMatch(/[cs]\/IVA/);
      expect(values).toEqual(original);
      cleanup();
    }
  });

  it.each([true, false])("congelar mantém o payload PT/BR idêntico; bruta=%s", async gross => {
    const values = setBasis(gross);
    const original = structuredClone(values);
    for (const country of ["PT", "BR"]) {
      setCompany(country, country === "PT" ? "EUR" : "BRL"); render(dialog());
      fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo congelar estes valores" }));
      fireEvent.click(screen.getByRole("button", { name: "Congelar" }));
      await Promise.all(f.pending);
      cleanup();
    }
    expect(f.rpc).toHaveBeenCalledTimes(2);
    expect(f.rpc.mock.calls[0]).toEqual(f.rpc.mock.calls[1]);
    expect(f.rpc.mock.calls[0]).toEqual(["freeze_settlement_participant", {
      _participant_id: "participant", _values: original, _note: null,
    }]);
    expect(values).toEqual(original);
  });

  it.each([false, true])("capability fiscal segue a empresa, independentemente da moeda; congelado=%s", frozen => {
    setBasis(false, frozen);
    setCompany("BR", "EUR"); render(dialog());
    expect(screen.getByText("= Resultado do fechamento (base líquida)")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/[cs]\/IVA/); cleanup();
    setCompany("PT", "BRL"); render(dialog());
    expect(screen.getByText("= Resultado do fechamento (s/IVA)")).toBeInTheDocument();
  });

  it.each([false, true])("PT → BR → PT repõe o DOM completo; congelado=%s", frozen => {
    setBasis(true, frozen);
    const view = render(dialog()); const original = domHash();
    setCompany("BR", "BRL"); view.rerender(dialog());
    expect(document.body.innerHTML).not.toMatch(/[cs]\/IVA/);
    setCompany(); view.rerender(dialog()); expect(domHash()).toBe(original);
  });

  it.each([false, true])("contexto indisponível conserva os rótulos PT; congelado=%s", frozen => {
    setCompany("BR", "BRL"); f.loading = true; setBasis(false, frozen); render(dialog());
    expect(screen.getByText("= Resultado do fechamento (s/IVA)")).toBeInTheDocument();
    expect(screen.queryByText(/base líquida/)).toBeNull();
  });
});
