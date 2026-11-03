import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { HTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import { FechoBasisSelector } from "@/components/FechoBasisSelector";
import { EventSettlementsManager } from "@/components/EventSettlementsManager";
import { PartnerExtrasPanel } from "@/components/PartnerExtrasPanel";
import { PartnerPaymentDialog } from "@/components/PartnerPaymentDialog";
import { computeSettlementEngine } from "@/lib/event-settlement-engine";
import { buildFreezeValues } from "@/lib/partner-contracts";
import type { FechoBasis } from "@/hooks/useFechoBasis";
import type { PartnerExtraItem } from "@/lib/partner-extras";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  engine: null as unknown,
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Neither query callbacks nor mutations execute; any service/network access fails.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: f.queries[String(queryKey[0])], isLoading: false, isPending: false,
  }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#498 P1l-2b: serviço MP proibido"); },
}) }));
vi.mock("@/hooks/useEventSettlementEngine", () => ({ useEventSettlementEngine: () => f.engine }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));
// Unopened transaction editors are outside this dispatch; all four targets,
// their menus, company locale, extras arithmetic and freeze adapter are real.
vi.mock("@/components/TransactionFormModal", () => ({ TransactionFormModal: () => null }));
vi.mock("@/components/TransactionEditModal", () => ({ TransactionEditModal: () => null }));

const noop = () => {};
let basis: FechoBasis;
let gross: boolean;
const settlements = [
  { id: "root", name: "Raiz sintética", parent_id: null, position: 0, is_sealed: false },
  { id: "child-net", name: "Filho líquido", parent_id: "root", position: 1, is_sealed: false,
    parent_share_pct: 10, parent_share_basis: "net_result" as const },
  { id: "child-gross", name: "Filho bruto", parent_id: "root", position: 2, is_sealed: false,
    parent_share_pct: 20, parent_share_basis: "net_result_gross_expenses" as const },
];
const extras: PartnerExtraItem[] = [
  { id: "extra-tx", origem: "transacao", partner_id: "partner", event_id: "event", description: "Extra com taxa histórica",
    amount: 1234.56, data: "2026-11-03", transaction_id: "transaction", iva_rate: 23, category: null, kind: "extra", notes: null },
  { id: "extra-manual", origem: "manual", partner_id: "partner", event_id: "event", description: "Extra manual",
    amount: 100, data: "2026-11-03", transaction_id: null, iva_rate: 0, category: null, kind: "extra", notes: null },
  { id: "adjustment", origem: "manual", partner_id: "partner", event_id: "event", description: "Ajuste negativo",
    amount: -50.25, data: "2026-11-03", transaction_id: null, iva_rate: 0, category: null, kind: "disbursement_adjustment", notes: null },
];
function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function setBasis(withVat: boolean) {
  gross = withVat;
  basis = { withVat, expenseSource: "realized", includeOverhead: true, canEditBasis: true, isLoading: false, isSaving: false,
    setWithVat: vi.fn(), setExpenseSource: vi.fn(), setIncludeOverhead: vi.fn() };
  const result = computeSettlementEngine({
    eventBasis: withVat ? "net_result_gross_expenses" : "net_result",
    eventTotals: { revenueNet: 3000, expensesNet: 1234.56, expensesGross: 1518.51 },
    settlements: [settlements[0]],
    participants: [
      { id: "participant", settlement_id: "root", participant_kind: "partner", name: "Sócio sintético", mode: "settles", profit_pct: 50 },
      { id: "house", settlement_id: "root", participant_kind: "house", name: "MP", mode: "settles", profit_pct: 50 },
    ],
  });
  f.engine = { result, isLoading: false };
  return result;
}
const screens = {
  selector: () => <FechoBasisSelector basis={basis} expenseColumns={{ mode: "detailed", onChange: noop, disabled: !gross }} />,
  selectorMenu: () => screens.selector(),
  manager: () => <EventSettlementsManager eventId="event" canEdit />,
  managerCreate: () => screens.manager(),
  managerCreateMenu: () => screens.manager(),
  managerEdit: () => screens.manager(),
  managerEditMenu: () => screens.manager(),
  extras: () => <PartnerExtrasPanel partnerId="partner" partnerName="Sócio sintético" eventId="event" canEdit
    calcBasis="net_result_gross_expenses" expenseIncludesIva={gross} />,
  payment: () => <PartnerPaymentDialog open onOpenChange={noop} eventId="event" participantId="participant"
    supplierId="supplier" partnerName="Sócio sintético" />,
};
type ScreenName = keyof typeof screens;
const names = Object.keys(screens) as ScreenName[];
function openScreen(name: ScreenName, inForm = false) {
  const view = render(inForm ? <form onSubmit={event => event.preventDefault()}>{screens[name]()}</form> : screens[name]());
  if (name === "selectorMenu") fireEvent.keyDown(screen.getByRole("button", { name: "Critério" }), { key: "ArrowDown" });
  if (name.startsWith("managerCreate")) fireEvent.click(screen.getByRole("button", { name: "Novo fechamento" }));
  if (name.startsWith("managerEdit")) {
    const row = screen.getByText("↳ Filho líquido").closest("li")!;
    fireEvent.click(row.querySelector("svg.lucide-pencil")!.closest("button")!);
  }
  if (name === "managerCreateMenu") fireEvent.keyDown(screen.getAllByRole("combobox")[1], { key: "ArrowDown" });
  if (name === "managerEditMenu") fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  return view;
}
// Only Radix's generated IDs are canonicalized, exactly as in P1l-2.
function domHash() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function amounts() {
  const text = document.body.textContent ?? "";
  return text.match(/(?:-?R\$\u00a0[\d.,]+|-?[\d.,]+\u00a0€)/g) ?? [];
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1l-2b: rede proibida"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  setCompany(); setBasis(true);
  f.queries = {
    "event-settlements": settlements, "event-settlement-participant-counts": { "child-net": 1, "child-gross": 2 },
    "sub-event-ids": [], "partner-extras-union": extras, "partner-extra-docs": [],
    "partner-payment-participant": { id: "participant", mode: "settles", frozen_at: null },
    "partner-payment-suppliers": [{ id: "supplier", name: "Sócio sintético" }],
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("#498 P1l-2b — baselines fixadas antes de alterar produção; não regenerar", () => {
  it("SHA-256 PT dos quatro componentes, detalhes e menus nas duas bases", () => {
    const hashes: Record<string, string> = {};
    for (const withVat of [true, false]) {
      setBasis(withVat);
      for (const name of names) { openScreen(name); hashes[`${name}-${withVat}`] = domHash(); cleanup(); }
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "extras-false": "1db52b1ab0338a9273b5088d77dee167d7c3a41d86efdf3cbd997b0cd073c494",
        "extras-true": "9cbd1e2d5e9dff5352c8e0f85ef1dbae5ca090ab06180d68a9f49766287247f2",
        "manager-false": "c921b10a73e3db4bdd4ccbcefe186a8e92819df156cd22b2842d0f142e574003",
        "manager-true": "c921b10a73e3db4bdd4ccbcefe186a8e92819df156cd22b2842d0f142e574003",
        "managerCreate-false": "d9e4ab52d9f000b48f78860ef131bcf051959cc3dca3820d6c3cd66ac7050593",
        "managerCreate-true": "d9e4ab52d9f000b48f78860ef131bcf051959cc3dca3820d6c3cd66ac7050593",
        "managerCreateMenu-false": "f2be1db9ac17cf0779d7bc025cfa2f0e67e53385755d2da2ef88546de9ccad2a",
        "managerCreateMenu-true": "f2be1db9ac17cf0779d7bc025cfa2f0e67e53385755d2da2ef88546de9ccad2a",
        "managerEdit-false": "9f78ace546cbff54c7322c9e0d95cb2e3ebb90b9f50227e1ca7b47aa4e45cff5",
        "managerEdit-true": "9f78ace546cbff54c7322c9e0d95cb2e3ebb90b9f50227e1ca7b47aa4e45cff5",
        "managerEditMenu-false": "cb9eab1ea6aa75dc173cac6f45fdcea18f2bae493657a12f03b9b39da50a37e7",
        "managerEditMenu-true": "cb9eab1ea6aa75dc173cac6f45fdcea18f2bae493657a12f03b9b39da50a37e7",
        "payment-false": "4116ead3168a3fab980137590e00f09fced47998554594394c992008c445eae3",
        "payment-true": "01d6dadd89e560117ffc9021808ba45e2cbb73c25c3d5dd04e58b65e8725df6f",
        "selector-false": "4b706c5aaa2f4c906648bfde456c8b1e7ad10dac964c275a123e9539e23c0e2d",
        "selector-true": "926444b69ff7decf7a2eb7a4cb4ccd58c61b32a01412ec9209efa4d17c53a16b",
        "selectorMenu-false": "579be555e831b2a04f4c5c1ea06508e69f9e6cddd1fa5ac75ce4211369443f6f",
        "selectorMenu-true": "62ac1e8c039dfac299d2217fce5c5b7bd1d288084c69f1f9dfe0b45301c175d7",
      }
    `);
  });
  it("montantes BR antes da alteração dos rótulos nas duas bases", () => {
    setCompany("BR", "BRL");
    const values: Record<string, string[]> = {};
    for (const withVat of [true, false]) {
      setBasis(withVat);
      for (const name of ["extras", "payment"] as const) { openScreen(name); values[`${name}-${withVat}`] = amounts(); cleanup(); }
    }
    expect(values).toMatchInlineSnapshot(`
      {
        "extras-false": [
          "1.334,56 €",
          "-50,25 €",
          "1.234,56 €",
          "100,00 €",
          "-50,25 €",
        ],
        "extras-true": [
          "1.618,51 €",
          "-50,25 €",
          "1.518,51 €",
          "100,00 €",
          "-50,25 €",
        ],
        "payment-false": [
          "R$ 882,72",
          "R$ 3.000,00",
          "-R$ 1.234,56",
          "R$ 1.765,44",
        ],
        "payment-true": [
          "R$ 740,75",
          "R$ 3.000,00",
          "-R$ 1.518,51",
          "R$ 1.481,49",
        ],
      }
    `);
  });
});

const ivaLabels = /[cs]\/\s?IVA|Com IVA|Sem IVA/;
const nonPaymentNames = names.filter(name => name !== "payment");

describe("#498 P1l-2b — rótulos autorizados", () => {
  it.each([true, false])("BR: seletor, fechamentos filhos e extras sem sufixos fiscais; bruto=%s", withVat => {
    setCompany("BR", "BRL"); setBasis(withVat);
    for (const name of nonPaymentNames) {
      openScreen(name);
      expect(document.body.innerHTML, name).not.toMatch(ivaLabels);
      expect(document.body.textContent, name).toMatch(/base (?:bruta|líquida)/);
      cleanup();
    }
  });

  it.each([true, false])("BR: linha da parte usa base neutra sem mudar a origem real; bruto=%s", withVat => {
    setCompany("BR", "BRL"); setBasis(withVat); openScreen("payment");
    const label = screen.getByText(`Parte (motor, base ${withVat ? "bruta" : "líquida"})`);
    expect(label.tagName).toBe("DT");
    expect(label.textContent).not.toMatch(ivaLabels);
    // Acceptance gap: this other label comes from shareOriginRows in the
    // explicitly excluded partner-contracts.ts. Do not mask or mock it away.
    expect(screen.getByText(`= Resultado do fechamento (${withVat ? "c/IVA" : "s/IVA"})`)).toBeInTheDocument();
    expect(document.body.innerHTML).toMatch(ivaLabels);
  });

  it.each([true, false])("BR: origem congelada também conserva o rótulo fora de âmbito; bruto=%s", withVat => {
    setCompany("BR", "BRL");
    const result = setBasis(withVat);
    const node = result.nodes[0];
    const participant = node.participants.find(p => p.id === "participant")!;
    f.queries["partner-payment-participant"] = { id: "participant", mode: "settles", frozen_at: "2026-11-03T12:00:00Z",
      frozen_values: buildFreezeValues(participant, node) };
    openScreen("payment");
    expect(screen.getByText("Parte congelada:", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(`= Resultado do fechamento (${withVat ? "c/IVA" : "s/IVA"})`)).toBeInTheDocument();
  });

  it("BR: base da despesa, overhead e colunas do documento continuam funcionais", () => {
    setCompany("BR", "BRL");
    const choice = vi.fn();
    render(<FechoBasisSelector basis={basis} expenseColumns={{ mode: "detailed", onChange: choice, disabled: false }} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Critério" }), { key: "ArrowDown" });
    expect(screen.getByText("Base das despesas")).toBeInTheDocument();
    expect(screen.queryByText("IVA nas despesas")).not.toBeInTheDocument();
    expect(screen.getByText(/Base bruta — vem do critério/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Incluir overhead" }));
    expect(basis.setIncludeOverhead).toHaveBeenCalledExactlyOnceWith(false);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Previsto + excedido" }));
    expect(basis.setExpenseSource).toHaveBeenCalledExactlyOnceWith("committed");
    fireEvent.keyDown(screen.getByRole("button", { name: "Critério" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Só total pago" }));
    expect(choice).toHaveBeenCalledExactlyOnceWith("totalOnly");
    expect(basis.setWithVat).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toMatch(ivaLabels);
  });

  it("BR: mantém bloqueadas as opções sem permissão e as colunas sem base bruta", () => {
    setCompany("BR", "BRL"); setBasis(false); basis.canEditBasis = false;
    openScreen("selectorMenu");
    for (const name of ["Realizado (transações)", "Previsto + excedido", "Só total pago"]) {
      expect(screen.getByRole("menuitemradio", { name })).toHaveAttribute("aria-disabled", "true");
    }
    expect(screen.getByRole("menuitemcheckbox", { name: "Incluir overhead" })).toHaveAttribute("aria-disabled", "true");
    expect(document.body.innerHTML).not.toMatch(ivaLabels);
  });

  it.each(["managerCreateMenu", "managerEditMenu"] as const)("BR: opções neutras mantêm os valores canónicos em %s", name => {
    setCompany("BR", "BRL"); openScreen(name, true);
    const select = Array.from(document.querySelectorAll('button[role="combobox"]')).at(-1)!;
    fireEvent.click(screen.getByRole("option", { name: "resultado com despesas em base líquida" }));
    expect(select).toHaveTextContent("resultado com despesas em base líquida");
    expect(Array.from(document.querySelectorAll("select")).at(-1)).toHaveValue("net_result");
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "resultado com despesas em base bruta" }));
    expect(select).toHaveTextContent("resultado com despesas em base bruta");
    expect(Array.from(document.querySelectorAll("select")).at(-1)).toHaveValue("net_result_gross_expenses");
    // These are the real Select's native values, used by existing mutation payloads.
    const options = Array.from(document.querySelectorAll("select option")).map(o => (o as HTMLOptionElement).value);
    expect(options).toContain("net_result");
    expect(options).toContain("net_result_gross_expenses");
    expect(document.body.innerHTML).not.toMatch(ivaLabels);
  });

  it.each(names)("%s acompanha PT → BR → PT e repõe os mesmos bytes PT", name => {
    const view = openScreen(name);
    const original = domHash();
    setCompany("BR", "BRL"); view.rerender(screens[name]());
    if (name === "payment") expect(screen.getByText("Parte (motor, base bruta)")).toBeInTheDocument();
    else expect(document.body.innerHTML).not.toMatch(ivaLabels);
    setCompany(); view.rerender(screens[name]());
    expect(domHash()).toBe(original);
  });

  it.each([
    [null, "EUR", {}], ["BR", "", {}],
    ["BR", "BRL", { isLoading: true }], ["BR", "BRL", { isError: true, error: new Error("fixture") }],
  ] as const)("configuração indisponível %s/%s/%j preserva os rótulos PT", (country, currency, overrides) => {
    setCompany(country, currency, overrides);
    for (const withVat of [true, false]) {
      setBasis(withVat);
      for (const name of names) {
        openScreen(name);
        expect(document.body.innerHTML, name).toMatch(ivaLabels);
        expect(document.body.textContent, name).not.toMatch(/base bruta|despesas em base líquida/);
        cleanup();
      }
    }
  });

  it("usa apenas a capacidade partilhada sem condições por país", () => {
    for (const name of ["FechoBasisSelector", "EventSettlementsManager", "PartnerExtrasPanel", "PartnerPaymentDialog"]) {
      const source = readFileSync(`src/components/${name}.tsx`, "utf8");
      expect(source).toContain("companyHasIva(");
      expect(source).toContain("useCompanyLocale(");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    }
  });
});
