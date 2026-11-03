import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartnerSettlementExclusionSwitch } from "@/components/PartnerSettlementExclusionSwitch";

import { TransactionEditModal } from "@/components/TransactionEditModal";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { MemoryRouter } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { partnerSettlementExclusionReason } from "@/lib/fecho-filters";
import {
  friendlyPaymentError, PAYMENT_NETWORK_ERROR_MESSAGE,
  BOLETO_CHECK_CONSTRAINT, BOLETO_FIELDS_MESSAGE,
  SERVICE_PAYMENT_CHECK_CONSTRAINT, SERVICE_PAYMENT_FIELDS_MESSAGE,
} from "@/lib/payment-methods";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>, writes: [] as { table: string; payload: any }[],
  queryFns: {} as Record<string, () => Promise<any>>, selects: [] as { table: string; columns: string }[],
  updates: [] as { table: string; payload: any }[], filters: [] as { table: string; column: string; value: any }[],
  mutations: [] as Promise<any>[], toast: vi.fn(), invoke: vi.fn(),
  isAdmin: true, isManager: false,
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, isAdmin: f.isAdmin, isManager: f.isManager, hasPermission: () => true,
}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, queryFn }: any) => {
    f.queryFns[queryKey[0]] = queryFn;
    return { data: f.queries[queryKey[0]], isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: any) => ({
    isPending: false,
    mutate: (input: any) => {
      const result = Promise.resolve().then(() => options.mutationFn(input));
      f.mutations.push(result);
      result.catch(options.onError);
    },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: f.invoke },
  from: (table: string) => {
    const q: any = {
      insert: (payload: any) => { f.writes.push({ table, payload }); return q; },
      update: (payload: any) => { f.updates.push({ table, payload }); return q; },
      select: (columns: string) => { f.selects.push({ table, columns }); return q; },
      eq: (column: string, value: any) => { f.filters.push({ table, column, value }); return q; },
      in: () => q, is: () => q, order: () => q, limit: () => q, range: () => q, or: () => q,
      single: async () => ({ data: { id: "created" }, error: null }),
      maybeSingle: async () => ({ data: table === "event_forecasts" ? f.queries["linked-forecast"] ?? null : null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return q;
  },
} }));
vi.mock("@/hooks/use-toast", () => ({ toast: f.toast, useToast: () => ({ toast: f.toast }) }));
vi.mock("@/hooks/useEventHouseLabel", () => ({ useEventHouseLabel: () => "Empresa" }));
vi.mock("@/components/AdminCostOverrideDialog", () => ({ useAdminWindowEvent: () => null, AdminCostOverrideDialog: () => null }));
vi.mock("@/hooks/useMasterCategoryDetection", () => ({ useMasterCategoryDetection: () => ({
  masterCategoryIds: [], getMasterForecastForCategory: () => null, shouldShowReinforcementDialog: () => false,
}) }));
vi.mock("@/components/TransactionDuplicateWarning", () => ({
  useTransactionDuplicateCheck: () => ({ needsConfirmation: false }), TransactionDuplicateWarning: () => null,
}));
vi.mock("@/components/SupplierFormModal", () => ({ SupplierFormModal: () => null }));
vi.mock("@/components/SplitByIvaModal", () => ({ SplitByIvaModal: () => null }));
vi.mock("@/components/LocalReinforcementDialog", () => ({ LocalReinforcementDialog: () => null }));
vi.mock("@/components/InvoiceGroupSuggestDialog", () => ({ default: () => null }));
vi.mock("@/lib/pdf-first-page-to-jpeg", () => ({ pdfFirstPageToJpeg: vi.fn() }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/ui/overlay-layer", async () => {
  const { forwardRef } = await import("react");
  return { OverlayLayer: forwardRef<HTMLDivElement, { children: React.ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>,
  ) };
});

vi.mock("@/components/AccountantReviewBadge", () => ({ AccountantReviewBlock: () => null }));



describe("#413 — DOM legado capturado antes de alterar o interruptor", () => {
  it("preserva todos os estados atuais sem a prop de herança", () => {
    const hashes: Record<string, string> = {};
    const cases = [
      ["sem permissão", { type: "income" }, false, false],
      ["despesa", { type: "expense" }, true, false],
      ["desligado", { type: "income" }, true, false],
      ["ligado", { type: "income" }, true, true],
      ...["is_transitory", "exclude_from_result", "event_settlement_id", "is_overhead"].map(
        flag => [flag, { type: "income", [flag]: true }, true, true] as const,
      ),
    ] as const;
    for (const [name, row, canManage, checked] of cases) {
      const { container, unmount } = render(<PartnerSettlementExclusionSwitch
        row={row} canManage={canManage} checked={checked} onChange={vi.fn()} />);
      hashes[name] = createHash("sha256").update(container.innerHTML).digest("hex");
      unmount();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "desligado": "c8042d0050b57fb29d8d12e267da29a938c42b22be0299399ca5f029d3c2a63d",
        "despesa": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "event_settlement_id": "c4e06c4d7f348f42e79d9852ed3015a464152425ac64cc4bf2ee5ec1724d1102",
        "exclude_from_result": "f9e93c6afb82ac945d84d52b31bb9495b6735fd5b11a4e385a68277894cb100d",
        "is_overhead": "adc1b6c1cc284763ce95d143b1c5a48ad6dada227393fa5f7955d5c254c9d8d2",
        "is_transitory": "0f0d4a63335b1df7ec54cb82af00e644d31d6bd64afa1ce22635a2bcc4a456ae",
        "ligado": "66f43c5bc5249b3bbd2b3832fd796f4509d125c70097d2234d621d5cb2fbe4e9",
        "sem permissão": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      }
    `);
  });
});

const switchName = "Fora do acerto do sócio (receita só da MP)";
const forecastId = "41300000-0000-4000-8000-000000000001";
const forecast = {
  id: forecastId, event_id: "event", category_id: "category", type: "income", amount: 1000,
  description: "Receita BP fixture", status: "approved", iva_rate: 0,
  excluded_from_partner_settlement: true,
};
const transaction = {
  id: "transaction", description: "Receita fixture", amount: 1000, date: "2026-11-02",
  supplier_id: "supplier", type: "income", status: "pending", currency: "EUR",
  event_id: null, category_id: null, account_id: "account", iva_rate: 0,
  is_transitory: false, is_confidential: false, is_reimbursement: false,
  excluded_from_partner_settlement: false, exclude_from_result: false, payment_method: "transfer",
  declared_withholding_rate: null, declared_withholding_amount: null,
};
function edit(overrides = {}, canApprove = true) {
  return <MemoryRouter><TransactionEditModal onClose={vi.fn()} canApprove={canApprove}
    transaction={{ ...transaction, ...overrides }} /></MemoryRouter>;
}
function create(withEvent = false, type: "income" | "expense" = "income") {
  return <TransactionFormModal onClose={vi.fn()} defaults={{
    description: "Receita fixture", amount: "1000", date: "2026-11-02", supplier_id: "supplier",
    type, account_id: "account", iva_rate: 0,
    ...(withEvent ? { event_id: "event" } : {}),
  }} />;
}
async function submit() {
  fireEvent.submit(document.body.querySelector("form")!);
  await waitFor(() => expect(f.mutations).toHaveLength(1));
  await Promise.all(f.mutations);
}
function expectInherited(value: boolean) {
  const control = screen.getByRole("switch", { name: switchName });
  expect(control).toBeDisabled();
  expect(control).toHaveAttribute("aria-checked", String(value));
  expect(screen.getByText("Herdado da linha do BP")).toBeInTheDocument();
}
beforeEach(() => {
  vi.clearAllMocks();
  f.isAdmin = true; f.isManager = false;
  vi.mocked(useCompany).mockReturnValue({
    company: { id: "company", country: "PT", currency: "EUR" }, companyId: "company",
    isLoading: false, isError: false,
  } as ReturnType<typeof useCompany>);
  f.queries = {};
  f.queryFns = {}; f.selects = []; f.updates = []; f.filters = []; f.writes = []; f.mutations = [];
  f.invoke.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#413: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#413: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#413: rede proibida"); } });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  cleanup(); vi.unstubAllGlobals();
});

describe("#413 C1 — interruptor herdado", () => {
  it.each([true, false])("herda %s e impede alterações", inheritedFromForecast => {
    const onChange = vi.fn();
    render(<PartnerSettlementExclusionSwitch row={{ type: "income" }} canManage
      checked={!inheritedFromForecast} inheritedFromForecast={inheritedFromForecast} onChange={onChange} />);
    expectInherited(inheritedFromForecast);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["is_transitory", "exclude_from_result", "event_settlement_id", "is_overhead"])(
    "mostra a guarda %s antes da indicação de herança", flag => {
      const row = { type: "income", [flag]: true };
      const { container } = render(<PartnerSettlementExclusionSwitch row={row} canManage checked={false}
        inheritedFromForecast onChange={vi.fn()} />);
      expectInherited(true);
      expect([...container.querySelectorAll("p")].map(node => node.textContent)).toEqual([
        partnerSettlementExclusionReason(row), "Herdado da linha do BP",
      ]);
    },
  );

  it("null preserva o DOM e o comportamento sem herança", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<PartnerSettlementExclusionSwitch row={{ type: "income" }}
      canManage checked={false} onChange={onChange} />);
    const original = container.innerHTML;
    rerender(<PartnerSettlementExclusionSwitch row={{ type: "income" }} canManage checked={false}
      inheritedFromForecast={null} onChange={onChange} />);
    expect(container.innerHTML).toBe(original);
    expect(screen.queryByText("Herdado da linha do BP")).toBeNull();
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it.each([
    [{ type: "income" }, false], [{ type: "expense" }, true],
  ])("mantém a visibilidade existente mesmo com herança", (row, canManage) => {
    render(<PartnerSettlementExclusionSwitch row={row} canManage={canManage} checked
      inheritedFromForecast onChange={vi.fn()} />);
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("#413 C2 — edição", () => {
  it.each([
    ["forecast_id", { forecast_id: forecastId }],
    ["âncora legada", {}],
    ["ajuste de receita paga", { forecast_id: forecastId, status: "paid" }],
    ["receita paga bloqueada", { forecast_id: forecastId, status: "paid" }],
  ])("%s herda e grava outro campo sem marca própria", async (name, overrides) => {
    f.queries["linked-forecast"] = forecast;
    render(edit(overrides, name !== "receita paga bloqueada"));
    expectInherited(true);
    const loaded = await f.queryFns["linked-forecast"]();
    expect(loaded.excluded_from_partner_settlement).toBe(true);
    expect(f.selects.filter(read => read.table === "event_forecasts").every(
      read => read.columns.split(", ").includes("excluded_from_partner_settlement"),
    )).toBe(true);
    expect(f.filters).toContainEqual({
      table: "event_forecasts", column: "forecast_id" in overrides ? "id" : "transaction_id",
      value: "forecast_id" in overrides ? forecastId : "transaction",
    });
    fireEvent.change(screen.getByPlaceholderText("Detalhes adicionais"), { target: { value: "Detalhe editado" } });
    await submit();
    expect(f.invoke).toHaveBeenCalledTimes(1);
    const [functionName, { body }] = f.invoke.mock.calls[0];
    expect(functionName).toBe("update-transaction");
    expect(body.updates.specification).toBe("Detalhe editado");
    expect(body.updates).not.toHaveProperty("excluded_from_partner_settlement");
    expect(body.changes).not.toContainEqual(expect.objectContaining({ field_name: "Fora do acerto do sócio" }));
    expect(f.updates.filter(write => write.table === "transactions")).toEqual([]);
  });

  it.each([false, null, undefined])("linha com valor %s fica bloqueada e desligada", value => {
    f.queries["linked-forecast"] = { ...forecast, excluded_from_partner_settlement: value };
    render(edit({ forecast_id: forecastId, excluded_from_partner_settlement: true }));
    expectInherited(false);
  });

  it("uma mudança anterior à chegada da linha não grava marca própria nem a inclui em changes", async () => {
    const { rerender } = render(edit({ forecast_id: forecastId }));
    fireEvent.click(screen.getByRole("switch", { name: switchName }));
    f.queries["linked-forecast"] = { ...forecast, excluded_from_partner_settlement: false };
    rerender(edit({ forecast_id: forecastId }));
    expectInherited(false);
    fireEvent.change(screen.getByDisplayValue("Receita fixture"), { target: { value: "Receita editada" } });
    await submit();
    expect(f.invoke).toHaveBeenCalledTimes(1);
    const body = f.invoke.mock.calls[0][1].body;
    expect(body.updates).not.toHaveProperty("excluded_from_partner_settlement");
    expect(body.changes).not.toContainEqual(expect.objectContaining({ field_name: "Fora do acerto do sócio" }));
    expect(f.updates.filter(write => write.table === "transactions")).toEqual([]);
  });

  it("sem linha mantém a gravação direta da marca própria", async () => {
    render(edit());
    const control = screen.getByRole("switch", { name: switchName });
    expect(control).not.toBeDisabled();
    fireEvent.click(control);
    await submit();
    expect(f.updates.filter(write => write.table === "transactions")).toEqual([
      { table: "transactions", payload: { excluded_from_partner_settlement: true } },
    ]);
    expect(f.invoke).not.toHaveBeenCalled();
  });
});

describe("#413 C3 — criação", () => {
  it.each([
    ["despesa admin", "expense", true, false, "ed06a8f451f5c297fa020c76ef8734db810ee01fdc0ec2930c048ae66565908b"],
    ["despesa gestora", "expense", false, true, "ed06a8f451f5c297fa020c76ef8734db810ee01fdc0ec2930c048ae66565908b"],
    ["receita sem permissão", "income", false, false, "17f42391f6ba65ecb51fe8dfeabff77d79110696b335a2876e6db000c199dd93"],
    ["despesa sem permissão", "expense", false, false, "78de0ed11e33c929910b38cd8e24020dbb0fc066768e356d540a0bfe6e3f6621"],
  ] as const)("%s mantém o DOM sem interruptor", (_name, type, isAdmin, isManager, hash) => {
    f.isAdmin = isAdmin; f.isManager = isManager;
    render(create(false, type));
    expect(screen.queryByRole("switch", { name: switchName })).toBeNull();
    const dom = document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
    expect(createHash("sha256").update(dom).digest("hex")).toBe(hash);
  });

  it.each((["admin", "gestora"] as const).flatMap(profile =>
    [false, true].flatMap(withEvent => [false, true].map(checked => ({ profile, withEvent, checked }))),
  ))("sem linha: $profile, evento=$withEvent, marca própria=$checked", async ({ profile, withEvent, checked }) => {
    f.isAdmin = profile === "admin"; f.isManager = profile === "gestora";
    f.queries["events-active"] = [{ id: "event", name: "Evento fixture", pl_mode: "passive", event_type: "single" }];
    render(create(withEvent));
    const control = screen.getByRole("switch", { name: switchName });
    expect(control).not.toBeDisabled();
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("Herdado da linha do BP")).toBeNull();
    if (checked) fireEvent.click(control);
    expect(control).toHaveAttribute("aria-checked", String(checked));
    await submit();
    const writes = f.writes.filter(write => write.table === "transactions");
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({
      event_id: withEvent ? "event" : null, forecast_id: null, excluded_from_partner_settlement: checked,
    });
  });

  it.each([true, false, null, undefined])("linha %s prevalece sobre o estado próprio true no INSERT", async value => {
    f.queries["events-active"] = [{ id: "event", name: "Evento fixture", pl_mode: "passive", event_type: "single" }];
    f.queries["account_categories"] = [{ id: "category", code: "1.1.01", name: "Receitas fixture", type: "income" }];
    f.queries["event_forecasts_budget"] = [{ ...forecast, excluded_from_partner_settlement: value }];
    render(create(true));
    const control = screen.getByRole("switch", { name: switchName });
    expect(control).not.toBeDisabled();
    expect(control).toHaveAttribute("aria-checked", "false");
    fireEvent.click(control);
    expect(control).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByText("Receita BP fixture"));
    expectInherited(value ?? false);
    fireEvent.click(screen.getByRole("switch", { name: switchName }));
    expectInherited(value ?? false);
    await f.queryFns["event_forecasts_budget"]();
    expect(f.selects).toContainEqual({ table: "event_forecasts", columns: expect.stringContaining("excluded_from_partner_settlement") });
    await submit();
    const writes = f.writes.filter(write => write.table === "transactions");
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ forecast_id: forecastId, excluded_from_partner_settlement: value ?? false });
  });

  it("sem linha mostra o interruptor próprio desligado e mantém o INSERT atual", async () => {
    render(create());
    const control = screen.getByRole("switch", { name: switchName });
    expect(control).not.toBeDisabled();
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("Herdado da linha do BP")).toBeNull();
    const dom = document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
    expect(createHash("sha256").update(dom).digest("hex")).toMatchInlineSnapshot(`"9b21530f1b5a5d6f09c3324834f648209b6fa75dc8dfbe4f816428b1bb57a01e"`);
    await submit();
    expect(f.writes.filter(write => write.table === "transactions")).toHaveLength(1);
    expect(f.writes.find(write => write.table === "transactions")!.payload).toMatchObject({
      forecast_id: null, excluded_from_partner_settlement: false,
    });
  });
});

describe("#413 C4 — tradução de erros", () => {
  it.each(["TypeError: Load failed", "TypeError: Failed to fetch", "NetworkError ao guardar"])(
    "traduz %s", message => {
      expect(friendlyPaymentError({ message })).toBe(PAYMENT_NETWORK_ERROR_MESSAGE);
      expect(PAYMENT_NETWORK_ERROR_MESSAGE).toBe("Sem ligação ao servidor ao guardar — nada foi gravado. Verifique a rede e tente novamente.");
    },
  );
  it.each([
    [BOLETO_CHECK_CONSTRAINT, BOLETO_FIELDS_MESSAGE],
    [SERVICE_PAYMENT_CHECK_CONSTRAINT, SERVICE_PAYMENT_FIELDS_MESSAGE],
    [`${BOLETO_CHECK_CONSTRAINT} Load failed`, BOLETO_FIELDS_MESSAGE],
    [`${SERVICE_PAYMENT_CHECK_CONSTRAINT} Failed to fetch`, SERVICE_PAYMENT_FIELDS_MESSAGE],
    ["Erro anterior", "Erro anterior"], ["", ""],
  ])("preserva a mensagem anterior para %s", (message, expected) => {
    expect(friendlyPaymentError({ message })).toBe(expected);
  });
  it.each([null, undefined, {}])("mantém o fallback desconhecido para %s", error => {
    expect(friendlyPaymentError(error)).toBe("Erro desconhecido");
  });
});
