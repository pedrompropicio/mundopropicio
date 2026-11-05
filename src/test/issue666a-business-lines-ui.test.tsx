import type { ReactNode } from "react";
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessLinesCard } from "@/components/BusinessLinesCard";
import { EventEditModal } from "@/components/EventEditModal";
import Events from "@/pages/Events";
import { useBusinessLines, type BusinessLine } from "@/hooks/useBusinessLines";

const f = vi.hoisted(() => ({
  companyId: "company-a" as string | null,
  isAdmin: true, isManager: false,
  lines: [] as BusinessLine[],
  from: vi.fn(), toast: vi.fn(),
  reads: [] as { filters: Record<string, unknown>; orders: string[] }[],
  writes: [] as { table: string; kind: string; values: Record<string, unknown> }[],
  writeError: null as { code?: string; message: string } | null,
  readError: null as { message: string } | null,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user" }, isAdmin: f.isAdmin, isManager: f.isManager,
}) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  companyId: f.companyId, company: { country: "PT", currency: "EUR" }, isLoading: false, isError: false,
}) }));
vi.mock("@/hooks/use-toast", () => ({ toast: f.toast }));
vi.mock("@/components/CityVenueSelector", () => ({ CityVenueSelector: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
// Só os reads alheios à dimensão são fixtures; query, mutation, invalidação e UI
// das linhas de negócio são reais. Todos os acessos externos falham neste teste.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: (options: Parameters<typeof actual.useQuery>[0]) => {
    if (options.queryKey[0] === "business-lines") return actual.useQuery(options);
    const reads: Record<string, unknown> = {
      "company-default-budget-mode": "with_bp", events_full: [], cities_map: {}, venues_map: {},
      "admin-windows": [], festival_dates_edit: [], "event-stage-list": {},
    };
    return { data: reads[String(options.queryKey[0])], isLoading: false, isError: false };
  } };
});

const event = {
  id: "master", company_id: "company-a", name: "Master sintético", date: "2026-11-05",
  status: "active", event_type: "multi_day", event_nature: "producao_propria",
  business_line_id: "line-a", parent_event_id: null,
};
const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
  </QueryClientProvider>;
}

/** PostgREST local com filtros/ordem reais, sem replicar os componentes ou hooks. */
function fakeFrom(table: string) {
  if (!["business_lines", "events"].includes(table)) throw new Error(`Tabela inesperada: ${table}`);
  const filters: Record<string, unknown> = {};
  const orders: string[] = [];
  let kind = "select";
  let values: Record<string, unknown> = {};
  let from = 0, to = Infinity;
  const execute = () => {
    if (table === "events") {
      f.writes.push({ table, kind, values });
      return { data: kind === "insert" ? { id: "new-event" } : [{ id: event.id }], error: null };
    }
    if (kind !== "select") {
      f.writes.push({ table, kind, values });
      if (f.writeError) return { data: null, error: f.writeError };
      if (kind === "insert") {
        const row = { id: "created-line", is_active: true, ...values } as BusinessLine;
        f.lines.push(row);
        return { data: [{ id: row.id }], error: null };
      }
      const rows = f.lines.filter((line) => Object.entries(filters).every(([key, val]) => line[key as keyof BusinessLine] === val));
      rows.forEach((row) => Object.assign(row, values));
      return { data: rows.map((row) => ({ id: row.id })), error: null };
    }
    f.reads.push({ filters: { ...filters }, orders: [...orders] });
    if (f.readError) return { data: null, error: f.readError };
    const rows = f.lines.filter((line) => Object.entries(filters).every(([key, val]) => line[key as keyof BusinessLine] === val));
    rows.sort((left, right) => {
      for (const key of orders) {
        const a = left[key as keyof BusinessLine], b = right[key as keyof BusinessLine];
        if (a !== b) return a < b ? -1 : 1;
      }
      return 0;
    });
    return { data: rows.slice(from, to + 1).map((row) => ({ ...row })), error: null };
  };
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters[key] = value; return query; },
    order: (key: string) => { orders.push(key); return query; },
    range: (start: number, end: number) => { from = start; to = end; return query; },
    insert: (payload: Record<string, unknown>) => { kind = "insert"; values = payload; return query; },
    update: (payload: Record<string, unknown>) => { kind = "update"; values = payload; return query; },
    single: async () => execute(),
    then: (resolve: (result: ReturnType<typeof execute>) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(execute).then(resolve, reject),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  f.companyId = "company-a"; f.isAdmin = true; f.isManager = false;
  f.writes = []; f.reads = []; f.writeError = null; f.readError = null;
  f.lines = [
    { id: "line-b", company_id: "company-a", name: "Social Esporte", sort_order: 1, is_active: true },
    { id: "line-a", company_id: "company-a", name: "Social Eventos", sort_order: 0, is_active: true },
    { id: "inactive", company_id: "company-a", name: "Administração", sort_order: 2, is_active: false },
    { id: "other-tenant", company_id: "company-b", name: "Outra empresa", sort_order: 0, is_active: true },
  ];
  f.from.mockImplementation(fakeFrom);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#666: rede proibida"); }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

describe("#666 — catálogo e hook da empresa activa", () => {
  it("ordena, filtra activas e muda de empresa sem reutilizar a lista anterior", async () => {
    const { result, rerender } = renderHook(() => useBusinessLines(true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.map((line) => line.id)).toEqual(["line-a", "line-b"]));
    expect(f.reads[0]).toEqual({ filters: { company_id: "company-a", is_active: true }, orders: ["sort_order", "name", "id"] });
    f.companyId = "company-b"; rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.map((line) => line.id)).toEqual(["other-tenant"]));
  });

  it("não consulta sem empresa activa", () => {
    f.companyId = null;
    const { result } = renderHook(() => useBusinessLines(), { wrapper: wrapper() });
    expect(result.current.data).toBeUndefined();
    expect(f.from).not.toHaveBeenCalled();
  });

  it("critério 3: cria, renomeia, reordena nos dois sentidos, desactiva e reactiva", async () => {
    render(<BusinessLinesCard />, { wrapper: wrapper() });
    await screen.findByText("Social Eventos");
    expect(screen.queryByText("Outra empresa")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Nome da nova linha de negócio" }), { target: { value: "  Carreira  " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar linha" }));
    await screen.findByText("Carreira");
    expect(f.writes).toContainEqual({ table: "business_lines", kind: "insert", values: { company_id: "company-a", name: "Carreira", sort_order: 3 } });
    fireEvent.click(screen.getByRole("button", { name: "Renomear Carreira" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Novo nome de Carreira" }), { target: { value: "Shows" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Shows");
    fireEvent.click(screen.getByRole("button", { name: "Subir Social Esporte" }));
    await waitFor(() => expect(within(screen.getAllByRole("listitem")[0]).getByText("Social Esporte")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Descer Social Esporte" }));
    await waitFor(() => expect(within(screen.getAllByRole("listitem")[0]).getByText("Social Eventos")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Desactivar Shows" }));
    await screen.findByText("Shows (inactiva)");
    fireEvent.click(screen.getByRole("button", { name: "Activar Shows" }));
    await screen.findByText("Shows");
    expect(f.lines.find((line) => line.id === "created-line")).toMatchObject({ name: "Shows", is_active: true });
  });

  it("critério 3: viewer só vê; manager pode editar", async () => {
    f.isAdmin = false;
    const view = render(<BusinessLinesCard />, { wrapper: wrapper() });
    await screen.findByText("Social Eventos");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(f.writes).toEqual([]);
    f.isManager = true; view.rerender(<BusinessLinesCard />);
    expect(screen.getByRole("button", { name: "Criar linha" })).toBeInTheDocument();
  });

  it("critério 3: duplicado devolve uma mensagem legível e conserva o nome escrito", async () => {
    render(<BusinessLinesCard />, { wrapper: wrapper() });
    await screen.findByText("Social Eventos");
    f.writeError = { code: "23505", message: 'duplicate key value violates unique constraint "business_lines_company_name_unique"' };
    const input = screen.getByRole("textbox", { name: "Nome da nova linha de negócio" });
    fireEvent.change(input, { target: { value: " SOCIAL EVENTOS " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar linha" }));
    await waitFor(() => expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Já existe uma linha de negócio com este nome nesta empresa.", variant: "destructive" })));
    expect(input).toHaveValue(" SOCIAL EVENTOS ");
  });
});

describe("#666 — criação e edição do evento", () => {
  it.each(["line-b", ""])("critério 3: wizard mostra activas e envia business_line_id %s no INSERT", async (lineId) => {
    render(<Events />, { wrapper: wrapper() });
    fireEvent.click(screen.getByRole("button", { name: "Novo Evento" }));
    await screen.findByRole("option", { name: "Social Esporte" });
    const select = screen.getByRole("combobox", { name: "Linha de negócio" });
    expect(within(select).getByRole("option", { name: "Sem linha" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: /Administração|Outra empresa/ })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: lineId } });
    fireEvent.change(screen.getByPlaceholderText("Ex: Festival de Verão 2026"), { target: { value: "Novo evento" } });
    const nature = screen.getAllByRole("combobox").find((field) => field.querySelector('option[value="producao_propria"]'))!;
    fireEvent.change(nature, { target: { value: "producao_propria" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Evento" }));
    await waitFor(() => expect(f.writes).toContainEqual(expect.objectContaining({ table: "events", kind: "insert", values: expect.objectContaining({ business_line_id: lineId || null }) })));
  });

  it("critério 3: Master avisa antes de guardar e envia a nova linha", async () => {
    render(<EventEditModal event={event} onClose={vi.fn()} />, { wrapper: wrapper() });
    await screen.findByRole("option", { name: "Social Esporte" });
    const select = screen.getByRole("combobox", { name: "Linha de negócio" });
    expect(select).toHaveValue("line-a");
    fireEvent.change(select, { target: { value: "line-b" } });
    expect(screen.getByText("Ao guardar, esta linha será herdada por todos os sub-eventos do Master.")).toBeInTheDocument();
    expect(f.writes).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar Alterações" }));
    await waitFor(() => expect(f.writes).toContainEqual(expect.objectContaining({ table: "events", kind: "update", values: expect.objectContaining({ business_line_id: "line-b" }) })));
  });

  it("critério 3: evento simples conserva a linha inactiva marcada e permite limpar", async () => {
    render(<EventEditModal event={{ ...event, event_type: "simple", business_line_id: "inactive" }} onClose={vi.fn()} />, { wrapper: wrapper() });
    await screen.findByRole("option", { name: "Administração (inactiva)" });
    const select = screen.getByRole("combobox", { name: "Linha de negócio" });
    expect(select).toHaveValue("inactive");
    fireEvent.change(select, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar Alterações" }));
    await waitFor(() => expect(f.writes[0]?.values.business_line_id).toBeNull());
  });

  it("critério 3: sub-evento só lê a herança e nunca envia uma cópia desactualizada no UPDATE", async () => {
    render(<EventEditModal event={{ ...event, id: "child", parent_event_id: event.id, event_type: "simple" }} onClose={vi.fn()} />, { wrapper: wrapper() });
    await screen.findByText("Linha herdada do Master: Social Eventos");
    expect(screen.queryByRole("combobox", { name: "Linha de negócio" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar Alterações" }));
    await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].values).not.toHaveProperty("business_line_id");
  });

  it("mostra falha de leitura sem apagar o ID já gravado", async () => {
    f.readError = { message: "indisponível" };
    render(<EventEditModal event={event} onClose={vi.fn()} />, { wrapper: wrapper() });
    await screen.findByText("Não foi possível carregar as linhas de negócio.");
    expect(screen.getByRole("combobox", { name: "Linha de negócio" })).toHaveValue("line-a");
    fireEvent.click(screen.getByRole("button", { name: "Guardar Alterações" }));
    await waitFor(() => expect(f.writes[0]?.values.business_line_id).toBe("line-a"));
  });
});
