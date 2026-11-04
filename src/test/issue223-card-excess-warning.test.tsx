import { createHash } from "node:crypto";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventFinancialCard } from "@/components/EventFinancialCard";
import { useCompany, type Company } from "@/hooks/useCompany";
import type { UseEventFinancialCardDataResult } from "@/hooks/useEventFinancialCardData";

const fixtures = vi.hoisted(() => ({
  card: {} as UseEventFinancialCardDataResult,
  costBasis: {
    expenseSource: "committed", withVat: false, includeOverhead: true,
    isLoading: false, canEditBasis: false,
  },
}));

vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Only synthetic reads: queryFn/mutationFn never execute.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: () => { throw new Error("#223: serviço MP proibido neste teste"); } }),
}));
vi.mock("@/hooks/useEventFinancialCardData", () => ({ useEventFinancialCardData: () => fixtures.card }));
vi.mock("@/hooks/useEventCostBasis", () => ({ useEventCostBasis: () => fixtures.costBasis }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "fixture-user" } }) }));

function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : {
    id: "7c858982-6ccd-47ca-bd65-e0dd3eebf01c", country, currency, display_name: "Mundo Propício",
  } as Company;
  vi.mocked(useCompany).mockReturnValue({
    company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides,
  });
}

function renderCard(kind: "expense" | "income" = "expense", cacheImpact = 30) {
  return render(<EventFinancialCard eventId="ev1" eventIds={["ev1"]} kind={kind} cacheImpact={cacheImpact} />);
}

function domHash() {
  // Same normalization as #498 P1j: only generated React/Radix IDs vary.
  const dom = document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
  return createHash("sha256").update(dom).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#223: rede proibida neste teste"); }));
  setCompany();
  fixtures.card = {
    displayValue: 1980.4, realValue: 1580.4, modeUsed: "committed", phase: "development", unavailable: false,
    subtotals: [], formalidadeBreakdown: { estimado: 1000, negociacao: 300, fechado: 200, pago: 0 },
    meta: { overhead: 200, masterQuota: 50, cacheAdded: 30, excess: 0 },
  };
});
afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("#223 — aviso de excedido no card de Custos", () => {
  it.each([0, undefined])("preserva o SHA-256 MP/EUR capturado antes da alteração, excess=%s", (excess) => {
    if (excess === undefined) delete fixtures.card.meta!.excess;
    else fixtures.card.meta!.excess = excess;
    renderCard();
    expect(screen.queryByTestId("card-excess-warning")).not.toBeInTheDocument();
    expect(domHash()).toBe("31c9363c463822f3870d16c4eeb6fd31f9ad91d46411d986319e9a6e1cf729eb");
  });

  it("mostra o valor PT/EUR exacto, com título e classe, logo depois dos extras", () => {
    fixtures.card.meta!.excess = 80.4;
    const { rerender } = renderCard();
    const warning = screen.getByTestId("card-excess-warning");
    expect(warning.textContent).toBe("Excedido fora do BP: 80,40\u00a0€");
    expect(warning).toHaveAttribute("title", "Custo acima do previsto no BP ou em rubricas sem linha de BP. Não aparece na barra de formalidade (só linhas de BP).");
    expect(warning.className).toBe("text-[10px] text-warning");
    expect(warning.previousElementSibling?.textContent).toBe("+ Cachê: 30,00\u00a0€+ Rateio turnê: 50,00\u00a0€+ Overhead: 200,00\u00a0€");

    fixtures.card.meta!.excess = 0;
    rerender(<EventFinancialCard eventId="ev1" eventIds={["ev1"]} kind="expense" cacheImpact={30} />);
    expect(screen.queryByTestId("card-excess-warning")).not.toBeInTheDocument();
    expect(domHash()).toBe("31c9363c463822f3870d16c4eeb6fd31f9ad91d46411d986319e9a6e1cf729eb");
  });

  it("usa a moeda BRL da empresa", () => {
    setCompany("BR", "BRL");
    fixtures.card.meta!.excess = 80.4;
    renderCard();
    expect(screen.getByTestId("card-excess-warning").textContent).toBe("Excedido fora do BP: R$\u00a080,40");
    expect(document.body.textContent).not.toContain("€");
  });

  it.each([
    [null, "EUR", {}],
    ["BR", "", {}],
    ["PT", "EUR", { isLoading: true }],
    ["PT", "EUR", { isError: true, error: new Error("fixture failure") }],
  ] as const)("locale indisponível mostra — sem moeda (%s/%s/%j)", (country, currency, overrides) => {
    setCompany(country, currency, overrides);
    fixtures.card.meta!.excess = 80.4;
    renderCard();
    expect(screen.getByTestId("card-excess-warning").textContent).toBe("Excedido fora do BP: —");
    expect(document.body.textContent).not.toMatch(/€|R\$/);
  });

  it.each(["realized", "forecast"] as const)("não mostra o aviso em %s, mesmo com excedido", (mode) => {
    fixtures.card.modeUsed = mode;
    fixtures.card.meta!.excess = 80.4;
    renderCard();
    expect(screen.queryByTestId("card-excess-warning")).not.toBeInTheDocument();
  });

  it("não mostra o aviso no card de Receitas, mesmo em committed com excedido", () => {
    fixtures.card.meta!.excess = 80.4;
    renderCard("income");
    expect(screen.queryByTestId("card-excess-warning")).not.toBeInTheDocument();
  });

  it.each([null, 0.0049, 0.005, -0.005])("não acrescenta nós dentro da tolerância, excess=%s", (excess) => {
    fixtures.card.meta!.excess = excess;
    renderCard();
    expect(screen.queryByTestId("card-excess-warning")).not.toBeInTheDocument();
    expect(domHash()).toBe("31c9363c463822f3870d16c4eeb6fd31f9ad91d46411d986319e9a6e1cf729eb");
  });

  it("não acrescenta nós com meta ausente", () => {
    delete fixtures.card.meta;
    renderCard();
    expect(screen.queryByTestId("card-excess-warning")).not.toBeInTheDocument();
  });

  it("usa o valor absoluto no limiar e preserva o sinal na apresentação", () => {
    fixtures.card.meta!.excess = -80.4;
    renderCard();
    expect(screen.getByTestId("card-excess-warning").textContent).toBe("Excedido fora do BP: -80,40\u00a0€");
  });

  it("mostra o aviso sem extras e sem linhas de BP na barra de formalidade", () => {
    fixtures.card.meta = { excess: 80.4, cacheAdded: 0 };
    fixtures.card.formalidadeBreakdown = { estimado: 0, negociacao: 0, fechado: 0, pago: 0 };
    renderCard("expense", 0);
    const warning = screen.getByTestId("card-excess-warning");
    expect(warning.textContent).toBe("Excedido fora do BP: 80,40\u00a0€");
    expect(warning.previousElementSibling?.textContent).toBe("Sem linhas aprovadas no BP.");
  });
});
