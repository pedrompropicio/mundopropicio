import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FutureCoverageCard, FutureCoverageView } from "@/components/financial-position/FutureCoverageCard";
import { CoverageScenarioModal } from "@/components/financial-position/CoverageScenarioModal";
import { useBpHorizons } from "@/hooks/useBpHorizons";
import { FinancialPositionLocaleContext, formatPositionAmount } from "@/lib/financial-position";
import { formatMoney, resolveCompanyLocale } from "@/lib/company-locale";
import type { FinancialPositionP5 } from "@/lib/financial-position-p5";
import type { PlanningEvent } from "../../supabase/functions/_shared/ticketing/planning-forecast";

interface QueryOptions { queryKey: unknown[]; enabled?: boolean; queryFn: () => Promise<unknown> }
interface MutationOptions {
  mutationFn: (inherit: boolean) => Promise<void>;
  onSuccess: () => void;
  onError: (error: Error) => void;
}
const fixtures = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  options: [] as QueryOptions[],
  p5: {} as Record<string, unknown>,
  companyId: "10000000-0000-4000-8000-000000000001" as string | null,
  auth: { user: { id: "fixture-user" }, isAdmin: true, isManager: false, hasPermission: () => true },
  invalidateQueries: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  errorToast: vi.fn(),
  pendingMutation: undefined as Promise<void> | undefined,
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: fixtures.companyId }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => fixtures.auth }));
vi.mock("@/hooks/useFinancialPositionP5", () => ({ useFinancialPositionP5: () => fixtures.p5 }));
// Molde #498 P1e: nenhuma query é executada automaticamente; só fixtures sintéticas.
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: QueryOptions) => {
    fixtures.options.push(options);
    return { data: fixtures.queries[String(options.queryKey[0])], isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: fixtures.invalidateQueries }),
  useMutation: (options: MutationOptions) => ({
    mutate: (inherit: boolean) => {
      fixtures.pendingMutation = options.mutationFn(inherit).then(options.onSuccess).catch(options.onError);
    },
    isPending: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fixtures.from } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: fixtures.errorToast } }));

const rootId = "10000000-0000-4000-8000-000000000012";
const rgId = "10000000-0000-4000-8000-000000000013";
const childId = "10000000-0000-4000-8000-000000000014";
const companyId = "10000000-0000-4000-8000-000000000001";
const ref = "2026-10-28";
const label = "Compromisso previsto até ao evento";
const planning: PlanningEvent = { event_id: rootId, nivel: 0, nome: "Madrid", previsto_original: 666561, cenario: null, zonas: [] };

function coverage(): FinancialPositionP5["cobertura_futuros"] {
  const pair = { com_sem_linha: 900000, sem_linha_cobre_bp: 800000 };
  const event = { event_id: rootId, nome: "Madrid", estagio: "planeamento" as const, first_day: "2026-11-21", started: false, data_indeterminada: false,
    vendas_bruto: 0, fonte_vendas: "sem_vendas" as const, bp_total: 666561, despesas_pagas: 100, a_pagar_lancado: 200, a_pagar_sem_linha: 0, bp_por_lancar: 265641,
    custo_total_projetado: pair, cobertura: pair, aporte_socios: { total: 0, por_transferencia_conta_liquida: 0, pago_direto_automatico: 0, linhas: [] },
    aporte_mp_estimativa: 0, dinheiro_parado_bruto: { desde_corte: 0, anterior_ao_corte: 0, total: 0 }, dinheiro_parado: 0, caixa_mp_adiantado: 0, necessidade_financiamento: pair };
  return {
    meta: { incompleto: false, motivo: null, nota_bp_provisorio: "BP provisório", notas: { necessidade: "Nota sintética", aporte_mp: "Estimativa" } },
    eventos: [event, { ...event, event_id: rgId, nome: "RG 2027", first_day: "2027-02-11", bp_por_lancar: 143982 }],
    bilheteiras: [],
    total: { vendas_futuras: 0, despesas_pagas_futuras: 100, a_pagar_lancado_futuros: 200, a_pagar_sem_linha_futuros: 0,
      bp_por_lancar_futuros: 409623, saido_minimo_total: null, aporte_socios_total: 0, aporte_mp_estimativa_total: 0,
      dinheiro_de_eventos_em_conta: 0, caixa_mp_adiantado_total: 0, necessidade: pair },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.queries = {
    "coverage-bp-horizon": { [rootId]: null, [rgId]: 120 },
    "coverage-scenario-planning": { event: { ...planning }, root: { ...planning } },
    "coverage-scenario-history": [],
  };
  fixtures.options = [];
  fixtures.companyId = companyId;
  fixtures.auth.isAdmin = true;
  fixtures.auth.isManager = false;
  fixtures.p5 = { data: { meta: { data_referencia: ref }, cobertura_futuros: coverage() }, isLoading: false };
  fixtures.pendingMutation = undefined;
  fixtures.upsert.mockReset().mockResolvedValue({ error: null });
  fixtures.from.mockReset().mockImplementation((table: string) => {
    if (table !== "event_coverage_scenarios") throw new Error("#389: serviço MP proibido neste teste");
    return { upsert: fixtures.upsert };
  });
});
afterEach(cleanup);

describe("#389 — linha informativa na cobertura (critério 2)", () => {
  it("mostra o total depois de BP por lançar e detalhes só dos eventos dentro, sem alterar os outros totais", () => {
    const data = coverage();
    const before = JSON.stringify(data);
    render(<FutureCoverageView data={data} referenceDate={ref} horizons={{ [rootId]: null }} />);
    const totalRow = screen.getByText(label).parentElement!;
    expect(totalRow.textContent).toContain(formatPositionAmount(265641));
    expect(totalRow.previousElementSibling?.textContent).toContain("BP por lançar");
    expect(screen.getByText(`${label}: ${formatPositionAmount(265641)} · horizonte 30 dias`, { normalizer: t => t })).toHaveClass("text-xs");
    expect(screen.getAllByText(new RegExp(label))).toHaveLength(2);
    expect(screen.getByText("A pagar lançado").parentElement?.textContent).toContain(formatPositionAmount(200));
    expect(screen.getByText("Necessidade — com faturas sem linha").closest("div.rounded-md")?.textContent).toContain(formatPositionAmount(900000));
    expect(JSON.stringify(data)).toBe(before);
  });

  it("a card passa a data P5 e os horizontes das raízes à view", () => {
    render(<FutureCoverageCard />);
    expect(screen.getByText(label).parentElement?.textContent).toContain(formatPositionAmount(409623));
    expect(screen.getByText(`${label}: ${formatPositionAmount(143982)} · horizonte 120 dias`, { normalizer: t => t })).toBeInTheDocument();
    expect(fixtures.options.find(q => q.queryKey[0] === "coverage-bp-horizon")?.queryKey).toEqual(["coverage-bp-horizon", companyId, [rootId, rgId]]);
    expect(fixtures.from).not.toHaveBeenCalled();
  });

  it("BR/BRL usa formatMoney no total e no detalhe", () => {
    const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
    if (br.status !== "available") throw new Error("Fixture BR inválida");
    render(<FinancialPositionLocaleContext.Provider value={br}><FutureCoverageView data={coverage()} referenceDate={ref} horizons={{ [rgId]: 120 }} /></FinancialPositionLocaleContext.Provider>);
    expect(screen.getByText(label).parentElement?.textContent).toContain(formatMoney(409623, br));
    expect(screen.getByText(`${label}: ${formatMoney(265641, br)} · horizonte 30 dias`, { normalizer: t => t })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("€");
  });

  it("contexto indisponível mostra — no total e no detalhe", () => {
    render(<FinancialPositionLocaleContext.Provider value={{ status: "unavailable", message: "configuração da empresa incompleta" }}>
      <FutureCoverageView data={coverage()} referenceDate={ref} horizons={{}} />
    </FinancialPositionLocaleContext.Provider>);
    expect(screen.getByText(label).parentElement?.textContent).toBe(`${label}—`);
    expect(screen.getByText(`${label}: — · horizonte 30 dias`)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/€|R\$/);
  });

  it.each([
    { referenceDate: undefined, horizons: {} }, { referenceDate: ref, horizons: undefined },
    { referenceDate: ref, horizons: { [rootId]: 0 } }, { referenceDate: "2026-01-01", horizons: {} },
    { referenceDate: "inválida", horizons: {} },
  ])("não acrescenta nós sem os dados necessários ou eventos dentro (%j)", props => {
    const { container, rerender } = render(<FutureCoverageView data={coverage()} />);
    const legacy = container.innerHTML;
    rerender(<FutureCoverageView data={coverage()} {...props} />);
    expect(screen.queryByText(new RegExp(label))).toBeNull();
    expect(container.innerHTML).toBe(legacy);
  });

  it("sem data ou cobertura incompleta não mostra o compromisso", () => {
    const data = coverage();
    data.eventos = data.eventos!.map(e => ({ ...e, first_day: null }));
    const { rerender } = render(<FutureCoverageView data={data} referenceDate={ref} horizons={{}} />);
    expect(screen.queryByText(new RegExp(label))).toBeNull();
    rerender(<FutureCoverageView data={{ ...data, meta: { ...data.meta, incompleto: true }, eventos: null, total: null }} referenceDate={ref} horizons={{}} />);
    expect(screen.queryByText(new RegExp(label))).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("incompleto");
  });
});

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await act(async () => { await fixtures.pendingMutation; });
}

describe("#389 — modal de cenário (critério 3)", () => {
  it.each([["", null], ["45", 45], ["0", 0]] as const)("admin grava %s como %s na raiz e invalida o horizonte", async (input, expected) => {
    const onClose = vi.fn();
    render(<CoverageScenarioModal eventId={rootId} onClose={onClose} />);
    const field = screen.getByLabelText("Horizonte do BP (dias)");
    expect(field).toHaveAttribute("id", "coverage-bp-horizon");
    expect(field).toHaveAttribute("placeholder", "30");
    expect(field).toHaveAttribute("min", "0");
    expect(field).toHaveAttribute("step", "1");
    fireEvent.change(field, { target: { value: input } });
    await save();
    expect(fixtures.upsert).toHaveBeenCalledWith({ event_id: rootId, company_id: companyId,
      modo: "real", percentagem: 0, receita_manual_bruta: null, viragem_real_dias: null, bp_horizon_days: expected }, { onConflict: "event_id" });
    expect(fixtures.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["coverage-bp-horizon"] });
    expect(fixtures.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["coverage-scenario-planning"] });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(["-1", "1.5"])("%s desactiva Guardar e não escreve", value => {
    render(<CoverageScenarioModal eventId={rootId} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Horizonte do BP (dias)"), { target: { value } });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(fixtures.upsert).not.toHaveBeenCalled();
  });

  it("manager pode editar e gravar um horizonte existente", async () => {
    fixtures.auth.isAdmin = false;
    fixtures.auth.isManager = true;
    fixtures.queries["coverage-bp-horizon"] = { [rootId]: 60 };
    render(<CoverageScenarioModal eventId={rootId} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Horizonte do BP (dias)")).toHaveValue(60);
    fireEvent.change(screen.getByLabelText("Horizonte do BP (dias)"), { target: { value: "45" } });
    await save();
    expect(fixtures.upsert.mock.calls[0][0].bp_horizon_days).toBe(45);
  });

  it("a leitura tardia preenche o campo e limpar não repõe o valor na renderização seguinte", async () => {
    delete fixtures.queries["coverage-bp-horizon"];
    const { rerender } = render(<CoverageScenarioModal eventId={rootId} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Horizonte do BP (dias)")).toBeNull();
    fixtures.queries["coverage-bp-horizon"] = { [rootId]: 45 };
    rerender(<CoverageScenarioModal eventId={rootId} onClose={vi.fn()} />);
    const field = screen.getByLabelText("Horizonte do BP (dias)");
    expect(field).toHaveValue(45);
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    rerender(<CoverageScenarioModal eventId={rootId} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Horizonte do BP (dias)")).toHaveValue(null);
    await save();
    expect(fixtures.upsert.mock.calls[0][0].bp_horizon_days).toBeNull();
  });

  it("sem leitura mantém o formulário legado e não sobrescreve o horizonte", async () => {
    delete fixtures.queries["coverage-bp-horizon"];
    render(<CoverageScenarioModal eventId={rootId} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Horizonte do BP (dias)")).toBeNull();
    await save();
    expect(JSON.parse(JSON.stringify(fixtures.upsert.mock.calls[0][0]))).not.toHaveProperty("bp_horizon_days");
  });

  it("sub-evento não tem campo nem altera o payload existente", async () => {
    fixtures.queries["coverage-scenario-planning"] = { event: { ...planning, event_id: childId, nivel: 1 }, root: planning };
    render(<CoverageScenarioModal eventId={childId} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Horizonte do BP (dias)")).toBeNull();
    expect(fixtures.options.find(q => q.queryKey[0] === "coverage-bp-horizon")?.enabled).toBe(false);
    await save();
    expect(fixtures.upsert).toHaveBeenCalledWith({ event_id: childId, company_id: companyId,
      modo: "real", percentagem: 0, receita_manual_bruta: null, viragem_real_dias: null }, { onConflict: "event_id" });
  });

  it("sem admin/manager o campo fica desactivado e não há Guardar", () => {
    fixtures.auth.isAdmin = false;
    render(<CoverageScenarioModal eventId={rootId} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Horizonte do BP (dias)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(fixtures.upsert).not.toHaveBeenCalled();
  });

  it("uma falha de gravação não invalida nem fecha o modal", async () => {
    const error = new Error("Falha sintética");
    fixtures.upsert.mockResolvedValue({ error });
    const onClose = vi.fn();
    render(<CoverageScenarioModal eventId={rootId} onClose={onClose} />);
    await save();
    expect(fixtures.errorToast).toHaveBeenCalledWith("Não foi possível guardar", { description: error.message });
    expect(fixtures.invalidateQueries).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("#389 — leitura isolada dos horizontes (critérios 2/3)", () => {
  function options(ids: string[]) {
    renderHook(() => useBpHorizons(ids));
    return fixtures.options.at(-1)!;
  }

  function mockRead(data: unknown, error: Error | null = null) {
    const inIds = vi.fn().mockResolvedValue({ data, error });
    const eq = vi.fn(() => ({ in: inIds }));
    const select = vi.fn(() => ({ eq }));
    fixtures.from.mockReturnValue({ select });
    return { select, eq, inIds };
  }

  it("ordena e deduplica IDs, filtra empresa e raízes, valida linhas e preenche ausências com NULL", async () => {
    const read = mockRead([{ event_id: rootId, bp_horizon_days: 45 }, { event_id: rgId, bp_horizon_days: 0 }]);
    const query = options([rgId, childId, rootId, rootId]);
    expect(query.queryKey).toEqual(["coverage-bp-horizon", companyId, [rootId, rgId, childId]]);
    expect(query.enabled).toBe(true);
    await expect(query.queryFn()).resolves.toEqual({ [rootId]: 45, [rgId]: 0, [childId]: null });
    expect(fixtures.from).toHaveBeenCalledWith("event_coverage_scenarios");
    expect(read.select).toHaveBeenCalledWith("event_id,bp_horizon_days");
    expect(read.eq).toHaveBeenCalledWith("company_id", companyId);
    expect(read.inIds).toHaveBeenCalledWith("event_id", [rootId, rgId, childId]);
  });

  it("nenhuma linha dá NULL por raiz, nunca ausência de dados", async () => {
    mockRead([]);
    await expect(options([rootId]).queryFn()).resolves.toEqual({ [rootId]: null });
    mockRead([{ event_id: rootId, bp_horizon_days: null }]);
    await expect(options([rootId]).queryFn()).resolves.toEqual({ [rootId]: null });
  });

  it.each([
    { event_id: "id-inválido", bp_horizon_days: 30 }, { event_id: rootId, bp_horizon_days: -1 },
    { event_id: rootId, bp_horizon_days: 1.5 }, { event_id: rootId, bp_horizon_days: "45" }, { event_id: rootId },
  ])("rejeita linhas inválidas em vez de inventar um horizonte (%j)", async row => {
    mockRead([row]);
    await expect(options([rootId]).queryFn()).rejects.toThrow();
  });

  it("propaga falhas de leitura em vez de devolver padrões", async () => {
    const error = new Error("Leitura sintética recusada");
    mockRead(null, error);
    await expect(options([rootId]).queryFn()).rejects.toBe(error);
  });

  it("sem empresa ou sem IDs desactiva a query e não lê", async () => {
    const empty = options([]);
    expect(empty.enabled).toBe(false);
    await expect(empty.queryFn()).resolves.toEqual({});
    fixtures.companyId = null;
    const missingCompany = options([rootId]);
    expect(missingCompany.enabled).toBe(false);
    await expect(missingCompany.queryFn()).resolves.toEqual({});
    expect(fixtures.from).not.toHaveBeenCalled();
  });

  it("mudar de empresa muda a chave e o filtro da leitura", async () => {
    const read = mockRead([]);
    const previous = options([rootId]);
    fixtures.companyId = "10000000-0000-4000-8000-000000000002";
    const current = options([rootId]);
    expect(current.queryKey).not.toEqual(previous.queryKey);
    await current.queryFn();
    expect(read.eq).toHaveBeenCalledWith("company_id", fixtures.companyId);
  });
});
