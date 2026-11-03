import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import { PartnerPaymentDialog } from "@/components/PartnerPaymentDialog";
import { computeSettlementEngine } from "@/lib/event-settlement-engine";
import { buildFreezeValues } from "@/lib/partner-contracts";

const f = vi.hoisted(() => ({
  country: "PT", currency: "EUR", queries: {} as Record<string, unknown>,
  engine: null as unknown, rpc: vi.fn(), pending: [] as Promise<unknown>[],
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { country: f.country, currency: f.currency }, companyId: "company",
  isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "admin", user: { id: "user" } }) }));
// Query callbacks never run; only the freeze command reaches the in-memory RPC spy.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: f.queries[String(queryKey[0])], isLoading: false, refetch: vi.fn(),
  }),
  useMutation: ({ mutationFn }: { mutationFn: () => unknown }) => ({
    mutate: () => { f.pending.push(Promise.resolve(mutationFn())); }, isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: f.rpc, from: () => { throw new Error("#498 P1m-b: acesso MP proibido"); },
} }));
vi.mock("@/hooks/useEventSettlementEngine", () => ({ useEventSettlementEngine: () => f.engine }));

const supplier = {
  id: "supplier", name: "Fornecedor PT", nif: "509123456",
  iban: "PT50000201231234567890154", swift_bic: "BPLIPTPL",
  iban_2: "GB82WEST12345698765432", swift_bic_2: "WESTGB2L",
};
const bank = { slot: 1, account_type: "br_banco_agencia_conta", bank_name: "Banco sintético",
  routing_number: "0001", account_number: "00123", pix_key: "pix@example.invalid" };
function setTaxId(value: string, type: string | null) {
  f.queries["supplier-br-details"] = { available: true, details: {
    id: supplier.id, tax_id_foreign: value, tax_id_type: type, foreign_bank_accounts: [bank],
  } };
}
function setCompany(br = false) { f.country = br ? "BR" : "PT"; f.currency = br ? "BRL" : "EUR"; }
function setPayment(gross: boolean, frozen = false) {
  const result = computeSettlementEngine({
    eventBasis: gross ? "net_result_gross_expenses" : "net_result",
    eventTotals: { revenueNet: 3000, expensesNet: 1234.56, expensesGross: 1518.51 },
    settlements: [{ id: "root", name: "Raiz sintética", parent_id: null, position: 0, is_sealed: false }],
    participants: [
      { id: "participant", settlement_id: "root", participant_kind: "partner", name: "Sócio sintético", mode: "settles", profit_pct: 50 },
      { id: "house", settlement_id: "root", participant_kind: "house", name: "MP", mode: "settles", profit_pct: 50 },
    ],
  });
  f.engine = { result, isLoading: false };
  const node = result.nodes[0];
  const values = buildFreezeValues(node.participants.find(p => p.id === "participant")!, node);
  f.queries["partner-payment-participant"] = { id: "participant", mode: "settles",
    frozen_at: frozen ? "2026-11-03T12:00:00Z" : null, frozen_values: frozen ? values : null };
  return values;
}
const payment = () => <PartnerPaymentDialog open onOpenChange={() => {}} eventId="event"
  participantId="participant" supplierId="supplier" partnerName="Sócio sintético" />;
// Canonicalize only generated Radix IDs, as in the existing PT baselines.
function domHash() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function amounts() {
  return (document.body.textContent ?? "").match(/(?:-?R\$\u00a0[\d.,]+|-?[\d.,]+\u00a0€)/g) ?? [];
}
const ivaLabels = /[cs]\/\s?IVA|Com IVA|Sem IVA/;
beforeEach(() => {
  vi.clearAllMocks(); f.queries = {}; f.pending = []; setCompany();
  setTaxId("12345678000199", "cnpj"); setPayment(true);
  f.rpc.mockResolvedValue({ data: null, error: null });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1m-b: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498 P1m-b: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498 P1m-b: rede proibida"); } });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  cleanup(); vi.unstubAllGlobals();
});

describe("#498 P1m-b — baselines fixadas antes de alterar produção; não regenerar", () => {
  it("baseline SHA-256 PT: fornecedor, prévia e congelado nas duas bases", () => {
    const hashes: Record<string, string> = {};
    render(<SupplierBankDetails supplier={supplier} defaultExpanded />);
    hashes.supplier = domHash(); cleanup();
    for (const gross of [true, false]) {
      for (const frozen of [false, true]) {
        setPayment(gross, frozen); render(payment());
        hashes[`${frozen ? "frozen" : "preview"}-${gross}`] = domHash(); cleanup();
      }
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "frozen-false": "a5120bc83bac4161434dde71fa47c1d42aa297fb3888e5ef4f10e3647201b3d1",
        "frozen-true": "e0b0c9b01f35f76e251841ecf5fb5b0d295af3979db404269cd31af97ca42584",
        "preview-false": "4116ead3168a3fab980137590e00f09fced47998554594394c992008c445eae3",
        "preview-true": "01d6dadd89e560117ffc9021808ba45e2cbb73c25c3d5dd04e58b65e8725df6f",
        "supplier": "bdd706020c54ed6ec9655c51a299d027132af17511f5746432c1c0618398418f",
      }
    `);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("baseline de montantes BR na prévia e no congelado", () => {
    setCompany(true);
    const values: Record<string, string[]> = {};
    for (const gross of [true, false]) {
      for (const frozen of [false, true]) {
        setPayment(gross, frozen); render(payment());
        values[`${frozen ? "frozen" : "preview"}-${gross}`] = amounts(); cleanup();
      }
    }
    expect(values).toMatchInlineSnapshot(`
      {
        "frozen-false": [
          "R$ 882,72",
          "R$ 3.000,00",
          "-R$ 1.234,56",
          "R$ 1.765,44",
        ],
        "frozen-true": [
          "R$ 740,75",
          "R$ 3.000,00",
          "-R$ 1.518,51",
          "R$ 1.481,49",
        ],
        "preview-false": [
          "R$ 882,72",
          "R$ 3.000,00",
          "-R$ 1.234,56",
          "R$ 1.765,44",
        ],
        "preview-true": [
          "R$ 740,75",
          "R$ 3.000,00",
          "-R$ 1.518,51",
          "R$ 1.481,49",
        ],
      }
    `);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("baseline dos payloads de congelar PT e BR, sem alterar valores nem origem", async () => {
    const calls: Record<string, unknown> = {};
    for (const gross of [true, false]) {
      for (const br of [false, true]) {
        setCompany(br); setPayment(gross); render(payment());
        fireEvent.change(document.querySelector("textarea")!, { target: { value: "  Nota sintética  " } });
        fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo congelar estes valores" }));
        fireEvent.click(screen.getByRole("button", { name: "Congelar" }));
        await Promise.all(f.pending);
        const call = f.rpc.mock.calls.at(-1);
        if (br) expect(call).toEqual(calls[String(gross)]);
        else calls[String(gross)] = call;
        cleanup();
      }
    }
    expect(f.rpc).toHaveBeenCalledTimes(4);
    expect(calls).toMatchInlineSnapshot(`
      {
        "false": [
          "freeze_settlement_participant",
          {
            "_note": "Nota sintética",
            "_participant_id": "participant",
            "_values": {
              "effective_pct": 50,
              "origin": {
                "addback_in": 0,
                "additional_actives": [],
                "additional_actives_total": 0,
                "exclusive_revenue": 3000,
                "expenses_in_perimeter": 1234.56,
                "parent_quota": 0,
                "result_amount": 1765.44,
                "result_basis_gross": false,
                "vat_returned_in": 0,
              },
              "settlement_id": "root",
              "share": 882.72,
              "share_amount": 882.72,
              "share_net": 882.72,
              "uses_gross_expenses": false,
            },
          },
        ],
        "true": [
          "freeze_settlement_participant",
          {
            "_note": "Nota sintética",
            "_participant_id": "participant",
            "_values": {
              "effective_pct": 50,
              "origin": {
                "addback_in": 0,
                "additional_actives": [],
                "additional_actives_total": 0,
                "exclusive_revenue": 3000,
                "expenses_in_perimeter": 1518.51,
                "parent_quota": 0,
                "result_amount": 1481.49,
                "result_basis_gross": true,
                "vat_returned_in": 0,
              },
              "settlement_id": "root",
              "share": 740.75,
              "share_amount": 740.75,
              "share_net": 882.72,
              "uses_gross_expenses": true,
            },
          },
        ],
      }
    `);
  });
});

describe("#498 P1m-b — apresentação BR", () => {
  it.each<[string | null, string, string]>([
    ["cnpj", "12345678000199", "12.345.678/0001-99"],
    ["cpf", "00000000000", "000.000.000-00"],
    ["cnpj", "1234567800019", "1234567800019"],
    ["cpf", "0000000000", "0000000000"],
    ["cnpj", " 12.345 ", " 12.345 "],
    [null, "12345678000199", "12.345.678/0001-99"],
  ])("%s: mostra %s como %s e copia os bytes crus", (type, raw, displayed) => {
    setCompany(true); setTaxId(raw, type);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<SupplierBankDetails supplier={supplier} defaultExpanded />);
    const row = screen.getByText((_text, element) => element?.tagName === "P"
      && element.textContent === `${type?.toUpperCase() || "CNPJ"}: ${displayed}`);
    fireEvent.click(row.querySelector("button")!);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(raw);
    expect(f.queries["supplier-br-details"]).toMatchObject({ details: { tax_id_foreign: raw } });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [true, false], [false, false], [true, true], [false, true],
  ])("base bruta=%s; congelado=%s: origem neutra e mesmos bytes ao regressar a PT", (gross, frozen) => {
    const values = setPayment(gross, frozen);
    const originalQueries = JSON.stringify(f.queries);
    const view = render(payment());
    const ptHash = domHash();
    expect(screen.getByText(`= Resultado do fechamento (${gross ? "c/IVA" : "s/IVA"})`)).toBeInTheDocument();
    setCompany(true); view.rerender(payment());
    expect(screen.getByText(`= Resultado do fechamento (base ${gross ? "bruta" : "líquida"})`)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(ivaLabels);
    expect(JSON.stringify(f.queries)).toBe(originalQueries);
    expect(f.rpc).not.toHaveBeenCalled();
    // A frozen origin must come from the retained snapshot, even without an engine.
    if (frozen) {
      f.engine = { result: null, isLoading: false }; view.rerender(payment());
      expect(screen.getByText(`= Resultado do fechamento (base ${gross ? "bruta" : "líquida"})`)).toBeInTheDocument();
      expect(document.body.innerHTML).not.toMatch(ivaLabels);
      expect(f.queries["partner-payment-participant"]).toMatchObject({ frozen_values: values });
    }
    setCompany(); view.rerender(payment());
    expect(domHash()).toBe(ptHash);
  });

  it("a ligação usa helpers e a capability, sem condição por país", () => {
    const bankSource = readFileSync("src/components/SupplierBankDetails.tsx", "utf8");
    expect(bankSource).toContain("formatBrTaxId(taxId, source.tax_id_type)");
    expect(bankSource).toContain("<CopyButton text={taxId} />");
    const paymentSource = readFileSync("src/components/PartnerPaymentDialog.tsx", "utf8");
    expect(paymentSource).toContain("hasIva = true");
    expect(paymentSource).toContain("shareOriginRows(origin, { hasIva })");
    expect(paymentSource.match(/hasIva=\{companyHasIva\(companyLocale\)\}/g)).toHaveLength(2);
    for (const source of [bankSource, paymentSource]) {
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    }
  });
});
