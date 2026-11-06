import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecurringTransactions from "@/pages/RecurringTransactions";

const f = vi.hoisted(() => {
  // O mês inicial também é calculado à importação da página.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
  return {
    recurring: [] as Record<string, unknown>[],
    writes: [] as { table: string; operation: string; payload?: any; filters: [string, unknown][] }[],
    toast: vi.fn(),
  };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { id: "fixture-company", country: "PT", currency: "EUR" },
  companyId: "fixture-company", isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" },
  isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: f.toast, warning: f.toast, error: f.toast } }));
// Só o transporte é simulado: página, formulários, AlertDialog e React Query são reais.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let write: (typeof f.writes)[number] | undefined;
    const record = (operation: string, payload?: unknown) => {
      write = { table, operation, payload, filters: [] };
      f.writes.push(write);
      return q;
    };
    const q: any = {
      select: () => q, order: () => q, in: () => q,
      eq: (column: string, value: unknown) => { write?.filters.push([column, value]); return q; },
      insert: (payload: unknown) => record("insert", payload),
      update: (payload: unknown) => record("update", payload),
      delete: () => record("delete"),
      single: async () => ({ data: { id: "fixture-created" }, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve({
        data: table === "recurring_transactions" ? f.recurring : [], error: null,
      }).then(resolve, reject),
    };
    return q;
  },
} }));

const template = {
  id: "fixture-template", description: "Renda sintética", type: "expense", amount: 100,
  iva_rate: 23, frequency: "monthly", day_of_month: 1,
  start_date: "2026-11-01", end_date: "2027-10-01", is_active: true,
};
const notice = "Os lançamentos já gerados não são apagados. Para os retirar, use a lista de transações.";
let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  f.recurring = []; f.writes = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#695 E2b: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#695 E2b: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#695 E2b: rede proibida"); } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
  cleanup(); client.clear();
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

function openPage() {
  render(<QueryClientProvider client={client}><RecurringTransactions /></QueryClientProvider>);
}
async function openDelete(description = template.description) {
  const row = (await screen.findByText(description)).closest("tr")!;
  // Os botões de ícone existentes mantêm os mesmos bytes do hash PT.
  fireEvent.click(within(row).getAllByRole("button")[1]);
  return screen.getByRole("alertdialog");
}
async function settle() { await act(async () => {}); }

describe("#695 E2b / C1 — confirmação do template", () => {
  beforeEach(() => { f.recurring = [template]; });

  it("o lixo abre o aviso literal sem qualquer escrita", async () => {
    openPage();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    const dialog = await openDelete();
    expect(within(dialog).getByRole("heading", { name: "Eliminar o template?" })).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription(notice);
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await settle();
    expect(f.writes).toEqual([]);
  });

  it("Cancelar fecha o diálogo e conserva o template sem delete", async () => {
    openPage(); const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await settle();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText(template.description)).toBeInTheDocument();
    expect(f.writes).toEqual([]);
  });

  it("Esc fecha sem apagar", async () => {
    openPage(); const dialog = await openDelete();
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await settle();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(f.writes).toEqual([]);
  });

  it("clicar fora não apaga", async () => {
    openPage(); const dialog = await openDelete();
    const overlay = dialog.previousElementSibling!;
    fireEvent.pointerDown(overlay, { button: 0, pointerType: "mouse" });
    fireEvent.click(overlay);
    await settle();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(f.writes).toEqual([]);
  });

  it("Eliminar usa uma vez o ID seleccionado, invalida a lista e nunca escreve em transactions", async () => {
    const second = { ...template, id: "fixture-second", description: "Seguro sintético" };
    f.recurring.push(second);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    openPage();
    fireEvent.click(within(await openDelete()).getByRole("button", { name: "Cancelar" }));
    const dialog = await openDelete(second.description);
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recurring-transactions"] }));
    expect(f.writes).toEqual([{
      table: "recurring_transactions", operation: "delete", payload: undefined, filters: [["id", second.id]],
    }]);
    expect(f.writes.filter(write => write.table === "transactions")).toEqual([]);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

async function openCreation({ duration = "12", start = "", day = "1", offset = "" } = {}) {
  openPage();
  await screen.findByText("Nenhum template recorrente criado.");
  fireEvent.click(screen.getByRole("button", { name: "Novo Template" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByPlaceholderText("Ex: Renda do escritório"), { target: { value: "Renda fixture" } });
  const numbers = dialog.querySelectorAll('input[type="number"]');
  fireEvent.change(numbers[0], { target: { value: "100" } });
  fireEvent.change(numbers[1], { target: { value: day } });
  if (start) fireEvent.change(dialog.querySelector('input[type="month"]')!, { target: { value: start } });
  fireEvent.change(within(dialog).getByPlaceholderText("Ex: 12"), { target: { value: duration } });
  fireEvent.change(within(dialog).getByLabelText("Vence N dias depois da competência"), { target: { value: offset } });
  return dialog;
}

async function selectOption(current: string, next: string) {
  const trigger = screen.getAllByRole("combobox").find(button => button.textContent === current)!;
  expect(trigger).toBeDefined();
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: next }));
}
async function create() {
  fireEvent.submit(screen.getByRole("button", { name: "Criar Template" }).closest("form")!);
  await waitFor(() => expect(f.toast).toHaveBeenCalledWith("Template criado"));
  const rec = f.writes.find(write => write.table === "recurring_transactions")!.payload;
  const rows = f.writes.find(write => write.table === "transactions")!.payload as { date: string; due_date: string }[];
  return { rec, rows };
}

describe("#695 E2b / C2 — duração em meses de calendário inclusivos", () => {
  it.each<[string, string, string[], string]>([
    ["Mensal", "1", ["2027-01-01"], "2027-01-01"],
    ["Mensal", "2", ["2027-01-01", "2027-02-01"], "2027-02-01"],
    ["Mensal", "12", ["2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01", "2027-05-01", "2027-06-01", "2027-07-01", "2027-08-01", "2027-09-01", "2027-10-01", "2027-11-01", "2027-12-01"], "2027-12-01"],
    ["Trimestral", "12", ["2027-01-01", "2027-04-01", "2027-07-01", "2027-10-01"], "2027-12-01"],
    ["Anual", "12", ["2027-01-01"], "2027-12-01"],
    ["Anual", "24", ["2027-01-01", "2028-01-01"], "2028-12-01"],
  ])("%s, %s meses: gera exactamente as ocorrências do período", async (frequency, duration, dates, end) => {
    await openCreation({ duration, start: "2027-01" });
    if (frequency !== "Mensal") await selectOption("Mensal", frequency);
    const { rec, rows } = await create();
    expect(rec).toMatchObject({ start_date: "2027-01-01", end_date: end });
    expect(rows).toHaveLength(dates.length);
    expect(rows.map(row => row.date)).toEqual(dates);
    expect(rows.map(row => row.due_date)).toEqual(dates);
  });

  it("início no mês actual 11/2026 com duração 1 só gera novembro", async () => {
    const dialog = await openCreation({ duration: "1" });
    expect(dialog.querySelector('input[type="month"]')).toHaveValue("2026-11");
    const { rec, rows } = await create();
    expect(rec).toMatchObject({ start_date: "2026-11-01", end_date: "2026-11-01" });
    expect(rows.map(row => row.date)).toEqual(["2026-11-01"]);
  });

  it("dia 31 continua limitado ao dia 28, incluindo fevereiro", async () => {
    await openCreation({ duration: "2", start: "2027-01", day: "31" });
    const { rec, rows } = await create();
    expect(rec).toMatchObject({ start_date: "2027-01-28", end_date: "2027-02-28", day_of_month: 31 });
    expect(rows.map(row => row.date)).toEqual(["2027-01-28", "2027-02-28"]);
    expect(rows.map(row => row.due_date)).toEqual(["2027-01-28", "2027-02-28"]);
  });

  it("vence 38 dias depois e conserva as competências ao atravessar fevereiro", async () => {
    await openCreation({ duration: "2", start: "2027-01", day: "28", offset: "38" });
    const { rec, rows } = await create();
    expect(rec).not.toHaveProperty("due_offset_days");
    expect(rows.map(row => [row.date, row.due_date])).toEqual([
      ["2027-01-28", "2027-03-07"], ["2027-02-28", "2027-04-07"],
    ]);
  });
});

it("#695 E2b / C3 — até mês X mantém o mês final inclusive", async () => {
  await openCreation({ start: "2026-11", day: "28" });
  await selectOption("Duração em meses", "Mês/Ano final");
  const months = screen.getByRole("dialog").querySelectorAll('input[type="month"]');
  fireEvent.change(months[1], { target: { value: "2027-02" } });
  const { rec, rows } = await create();
  expect(rec.end_date).toBe("2027-02-28");
  expect(rows.map(row => [row.date, row.due_date])).toEqual([
    ["2026-11-28", "2026-11-28"], ["2026-12-28", "2026-12-28"],
    ["2027-01-28", "2027-01-28"], ["2027-02-28", "2027-02-28"],
  ]);
});
