import type { PropsWithChildren } from "react";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { BP_FINAL_CLOSE_PREFIX, freezeFinalBpVersion, pickFinalCloseVersions,
  withFinalCloseForecasts, type FinalCloseBpVersion } from "@/lib/bp-final-close";
import { eventCostLines, groupByEvent } from "@/lib/report-event-cost";
import { useFinalCloseBpVersions } from "@/hooks/useFinalCloseBpVersions";
import { CloseEventGuardDialog, EMPTY_BLOCKERS } from "@/components/events/CloseEventGuardDialog";
import { EventEditModal } from "@/components/EventEditModal";
import ReportDRE from "@/components/ReportDRE";
import ReportDREBrasil from "@/components/ReportDREBrasil";
import ReportDREEmpresarial from "@/components/ReportDREEmpresarial";

const fixtures = vi.hoisted(() => ({
  queries: null as Record<string, unknown> | null,
  rpc: vi.fn(), from: vi.fn(), toast: vi.fn(), update: vi.fn(),
  user: { id: "user", email: "fixture@example.test", user_metadata: { full_name: "Utilizador teste" } },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: fixtures.rpc, from: fixtures.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: fixtures.user, isAdmin: true, isManager: false }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { country: "PT", currency: "EUR" }, companyId: "company", isLoading: false, isError: false,
}) }));
vi.mock("@/hooks/use-toast", () => ({ toast: fixtures.toast }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/CityVenueSelector", () => ({ CityVenueSelector: () => null }));
// Dialogs/mutations and the hook use the real query client. Report fixtures replace
// only query data; their rendering and all financial calculations remain real.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: (options: { queryKey: unknown[] }) => fixtures.queries === null
    ? actual.useQuery(options as Parameters<typeof actual.useQuery>[0])
    : { data: fixtures.queries[options.queryKey.join(":")] ?? fixtures.queries[String(options.queryKey[0])], isLoading: false, isError: false },
  };
});

const event = {
  id: "event", company_id: "company", name: "Evento sintético", date: "2026-01-02",
  status: "completed", parent_event_id: null, event_type: "simple", event_nature: "producao_propria",
  partner_calc_basis: "net_result_gross_expenses",
};
const liveLine = {
  id: "forecast", event_id: event.id, type: "expense", category_id: "expense", amount: 500,
  status: "approved", iva_rate: 0, version_id: null, is_overhead: false,
};
const finalLine = { ...liveLine, amount: 300 };
function version(overrides: Partial<FinalCloseBpVersion> = {}): FinalCloseBpVersion {
  return { id: "v2", event_id: event.id, version_number: 2, state: "active", is_final_close: true,
    description: `${BP_FINAL_CLOSE_PREFIX} — 04/11/2026`, snapshot_payload: { forecasts: [finalLine] }, ...overrides };
}

const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(client);
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function mockParent(parentId: string | null = null, error: { message: string } | null = null) {
  fixtures.from.mockImplementation((table: string) => {
    if (table !== "events") throw new Error(`Tabela inesperada: ${table}`);
    return { select: (columns: string) => {
      expect(columns).toBe("parent_event_id");
      return { eq: () => ({ single: async () => ({ data: { parent_event_id: parentId }, error }) }) };
    } };
  });
}
async function openDialog() {
  const onConfirm = vi.fn();
  render(<CloseEventGuardDialog open onOpenChange={vi.fn()} eventId={event.id} eventName={event.name} onConfirm={onConfirm} />, { wrapper: wrapper() });
  await waitFor(() => expect(screen.getByRole("button", { name: "Concluir evento" })).toBeEnabled());
  return onConfirm;
}
const freezeLabel = "Congelar a versão actual do BP como versão final do fecho";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#218: rede proibida"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  fixtures.queries = null;
  fixtures.rpc.mockImplementation(async (name: string) => {
    if (name === "event_close_blockers") return { data: EMPTY_BLOCKERS, error: null };
    if (name === "create_final_close_bp_snapshot") return { data: "snapshot", error: null };
    throw new Error(`RPC inesperada: ${name}`);
  });
  mockParent();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("#218 — seleção e substituição puras (critérios 3/4)", () => {
  it("preserva a referência viva sem finais elegíveis e quando o evento está activo", () => {
    const live = [liveLine];
    expect(withFinalCloseForecasts(live, undefined, [event])).toBe(live);
    expect(withFinalCloseForecasts(live, [version({ state: "draft" }), version({ state: "archived" })], [event])).toBe(live);
    expect(withFinalCloseForecasts(live, [version()], [{ ...event, status: "active" }])).toBe(live);
  });

  it("escolhe a maior final por evento, incluindo superseded, ignorando rascunhos e versões sem marca", () => {
    const older = version({ id: "v1", version_number: 1, snapshot_payload: { forecasts: [{ ...finalLine, amount: 100 }] } });
    const latest = version({ state: "superseded" });
    const versions = [latest, version({ version_number: 9, state: "draft" }), older,
      version({ version_number: 10, state: "archived" }), version({ version_number: 11, state: "working_draft" }),
      version({ version_number: 12, description: "Outro snapshot", is_final_close: false }),
      version({ version_number: 13, description: null, is_final_close: false })];
    expect(pickFinalCloseVersions(versions).get(event.id)).toBe(latest);
    expect(withFinalCloseForecasts([liveLine], versions, [event])).toEqual([finalLine]);
    expect(versions[0]).toBe(latest);
  });

  it("substitui 500 por 300 só no concluído e preserva ids e todas as propriedades do snapshot", () => {
    const other = { ...liveLine, id: "other-line", event_id: "other" };
    const active = { ...event, id: "other", status: "active" };
    const snapshot = { ...finalLine, formula_type: "total", formula_params: { amount: 300 }, transaction_id: "tx" };
    const versions = [version({ snapshot_payload: { forecasts: [snapshot, { ...snapshot, type: "income" }] } }),
      version({ event_id: active.id })];
    const live = [liveLine, other];
    const result = withFinalCloseForecasts(live, versions, [event, active]);
    expect(result).toEqual([other, snapshot]);
    expect(result[1]).toBe(snapshot);
    expect(live).toEqual([liveLine, other]);
    expect(withFinalCloseForecasts(live, versions, [{ ...event, status: "active" }, active])).toBe(live);
  });

  it("um snapshot sem despesas remove as linhas vivas desse evento", () => {
    expect(withFinalCloseForecasts([liveLine], [version({ snapshot_payload: { forecasts: [] } })], [event])).toEqual([]);
  });

  it("Σ eventCostLines é igual ao snapshot, com os ids originais das linhas", () => {
    const second = { ...finalLine, id: "second", category_id: "second-category", amount: 123.45 };
    const forecasts = withFinalCloseForecasts([liveLine], [version({ snapshot_payload: { forecasts: [finalLine, second] } })], [event]);
    const lines = eventCostLines({ eventId: event.id, forecasts: groupByEvent(forecasts).get(event.id)!, transactions: [], mode: "committed" });
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(423.45);
    expect(lines.map((line) => line._forecast_id)).toEqual([finalLine.id, second.id]);
  });
});

describe("#218 — RPC e leitura paginada", () => {
  it("usa a RPC final com descrição prefixada e a identidade de auditoria", async () => {
    await expect(freezeFinalBpVersion(event.id, fixtures.user as any)).resolves.toBe("snapshot");
    expect(supabase.rpc).toHaveBeenCalledWith("create_final_close_bp_snapshot", {
      _event_id: event.id, _description: "Versão final do fecho — 04/11/2026",
      _created_by_label: "Utilizador teste",
    });
  });

  it("o hook filtra finais activas/superseded e percorre mais de 1000 versões sem truncar", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => version({ id: `v${i}` }));
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn() };
    for (const key of ["select", "eq", "in", "order"] as const) query[key].mockReturnValue(query);
    query.range.mockImplementation(async (from: number) => ({ data: from === 0 ? page : [version({ id: "last" })], error: null }));
    fixtures.from.mockReturnValue(query);
    const { result } = renderHook(() => useFinalCloseBpVersions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1001);
    expect(fixtures.from).toHaveBeenCalledWith("bp_versions");
    expect(query.select).toHaveBeenCalledWith("id, event_id, version_number, state, is_final_close, description, snapshot_payload");
    expect(query.eq).toHaveBeenCalledWith("is_final_close", true);
    expect(query.in).toHaveBeenCalledWith("state", ["active", "superseded"]);
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(query.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(clients[clients.length - 1].getQueryData(["bp-final-close-versions"])).toHaveLength(1001);
  });

  it("propaga erros de leitura em vez de os devolver como lista vazia", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn() };
    for (const key of ["select", "eq", "in", "order"] as const) query[key].mockReturnValue(query);
    query.range.mockResolvedValue({ data: null, error: new Error("leitura recusada") });
    fixtures.from.mockReturnValue(query);
    const { result } = renderHook(() => useFinalCloseBpVersions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("leitura recusada");
  });
});

describe("#218 — diálogo de conclusão (critério 2)", () => {
  it("vem marcado e espera a confirmação do snapshot antes de onConfirm", async () => {
    let resolveSnapshot!: (result: { data: string; error: null }) => void;
    fixtures.rpc.mockImplementation((name: string) => name === "event_close_blockers"
      ? Promise.resolve({ data: EMPTY_BLOCKERS, error: null })
      : new Promise((resolve) => { resolveSnapshot = resolve; }));
    const onConfirm = await openDialog();
    expect(screen.getByRole("checkbox", { name: freezeLabel })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Concluir evento" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(fixtures.rpc).toHaveBeenLastCalledWith("create_final_close_bp_snapshot", expect.objectContaining({
      _description: expect.stringMatching(/^Versão final do fecho — \d{2}\/\d{2}\/\d{4}$/),
    }));
    expect(screen.getByRole("button", { name: "A concluir…" })).toBeDisabled();
    resolveSnapshot({ data: "snapshot", error: null });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith();
  });

  it("um erro de permissão mantém o diálogo aberto e não chama onConfirm", async () => {
    fixtures.rpc.mockImplementation(async (name: string) => name === "event_close_blockers"
      ? { data: EMPTY_BLOCKERS, error: null } : { data: null, error: { message: "Sem permissão para congelar", code: "42501" } });
    const onConfirm = await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Concluir evento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão para congelar");
    expect(onConfirm).not.toHaveBeenCalled();
    // A decisão continua disponível depois de um erro; pode concluir sem congelar.
    fireEvent.click(screen.getByRole("checkbox", { name: freezeLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Concluir evento" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(fixtures.rpc.mock.calls.filter(([name]) => name === "create_final_close_bp_snapshot")).toHaveLength(1);
  });

  it("desmarcar conclui sem criar snapshot", async () => {
    const onConfirm = await openDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: freezeLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Concluir evento" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(fixtures.rpc.mock.calls.map(([name]) => name)).toEqual(["event_close_blockers"]);
  });

  it("um sub-evento mostra a indicação e conclui sem checkbox nem snapshot", async () => {
    mockParent("parent");
    const onConfirm = await openDialog();
    expect(screen.getByText("Sub-evento: a versão final congela-se no evento principal.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Concluir evento" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(fixtures.rpc.mock.calls.map(([name]) => name)).toEqual(["event_close_blockers"]);
  });

  it("falha ao ler o pai mantém a conclusão bloqueada", async () => {
    mockParent(null, { message: "Evento indisponível" });
    const onConfirm = vi.fn();
    render(<CloseEventGuardDialog open onOpenChange={vi.fn()} eventId={event.id} eventName={event.name} onConfirm={onConfirm} />, { wrapper: wrapper() });
    expect(await screen.findByText("Evento indisponível")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concluir evento" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("mantém os bloqueios hard e a confirmação explícita das despesas pendentes", async () => {
    fixtures.rpc.mockResolvedValue({ data: { hard: { camarim_sessions: [{ id: "session", title: "Sessão", status: "open" }], card_sessions: [] }, soft: { pending_expenses: [] } }, error: null });
    const { unmount } = render(<CloseEventGuardDialog open onOpenChange={vi.fn()} eventId={event.id} eventName={event.name} onConfirm={vi.fn()} />, { wrapper: wrapper() });
    await screen.findByText("Não é possível fechar o evento");
    expect(screen.getByRole("button", { name: "Concluir evento" })).toBeDisabled();
    unmount();
    fixtures.rpc.mockResolvedValue({ data: { ...EMPTY_BLOCKERS, soft: { pending_expenses: [{ id: "tx", amount: 10, description: "Pendente" }] } }, error: null });
    render(<CloseEventGuardDialog open onOpenChange={vi.fn()} eventId={event.id} eventName={event.name} onConfirm={vi.fn()} />, { wrapper: wrapper() });
    const ack = await screen.findByRole("checkbox", { name: /Fechar mesmo assim/ });
    expect(screen.getByRole("button", { name: "Concluir evento" })).toBeDisabled();
    fireEvent.click(ack);
    expect(screen.getByRole("button", { name: "Concluir evento" })).toBeEnabled();
  });
});

describe("#218 — edição do evento", () => {
  function openEdit(overrides: Record<string, unknown> = {}) {
    fixtures.queries = {};
    fixtures.update.mockImplementation(() => ({ eq: () => ({ select: async () => ({ data: [{ id: event.id }], error: null }) }) }));
    fixtures.from.mockImplementation((table: string) => {
      if (table !== "events") throw new Error(`Tabela inesperada: ${table}`);
      return { update: fixtures.update };
    });
    return render(<EventEditModal event={{ ...event, status: "active", ...overrides }} onClose={vi.fn()} />, { wrapper: wrapper() });
  }
  function selectCompleted() {
    const status = screen.getAllByRole("combobox").find((select) => select.querySelector('option[value="completed"]'))!;
    fireEvent.change(status, { target: { value: "completed" } });
  }

  it("mostra a opção só ao concluir e cria a versão antes de actualizar o estado", async () => {
    openEdit();
    expect(screen.queryByRole("checkbox", { name: freezeLabel })).not.toBeInTheDocument();
    selectCompleted();
    expect(screen.getByRole("checkbox", { name: freezeLabel })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Guardar Alterações" }));
    await waitFor(() => expect(fixtures.update).toHaveBeenCalled());
    expect(fixtures.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(fixtures.rpc.mock.invocationCallOrder[0]).toBeLessThan(fixtures.update.mock.invocationCallOrder[0]);
  });

  it("erro de snapshot aborta a actualização e apresenta o erro existente", async () => {
    openEdit();
    fixtures.rpc.mockResolvedValue({ data: null, error: { message: "Congelamento recusado" } });
    selectCompleted();
    fireEvent.click(screen.getByRole("button", { name: "Guardar Alterações" }));
    await waitFor(() => expect(fixtures.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Congelamento recusado", variant: "destructive" })));
    expect(fixtures.update).not.toHaveBeenCalled();
  });

  it.each(["desmarcada", "sub-evento", "já concluído"])("%s não congela", async (scenario) => {
    openEdit(scenario === "sub-evento" ? { parent_event_id: "parent" }
      : scenario === "já concluído" ? { status: "completed" } : {});
    selectCompleted();
    if (scenario === "desmarcada") fireEvent.click(screen.getByRole("checkbox", { name: freezeLabel }));
    else expect(screen.queryByRole("checkbox", { name: freezeLabel })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar Alterações" }));
    await waitFor(() => expect(fixtures.update).toHaveBeenCalled());
    expect(fixtures.rpc).not.toHaveBeenCalled();
  });
});

describe("#218 — os três DRE usam o snapshot (critérios 3/4)", () => {
  it.each([["DRE", ReportDRE], ["Brasil", ReportDREBrasil], ["Empresarial", ReportDREEmpresarial]] as const)(
    "%s: concluído = 300; reaberto = 500", (_name, Report) => {
      fixtures.queries = {
        events: [event], "bp-final-close-versions": [version()],
        "dre-forecasts-expense": [liveLine], "dre-emp-forecasts-expense": [liveLine],
        "account-categories": [{ id: "expense", code: "2.1.01", name: "Despesa sintética", type: "expense" }],
      };
      const { container, rerender } = render(<Report />, { wrapper: wrapper() });
      expect(container.textContent).toContain("300,00");
      expect(container.textContent).not.toContain("500,00");
      fixtures.queries.events = [{ ...event, status: "active" }];
      rerender(<Report />);
      expect(container.textContent).toContain("500,00");
      expect(container.textContent).not.toContain("300,00");
      expect(fixtures.rpc).not.toHaveBeenCalled();
    },
  );
});
