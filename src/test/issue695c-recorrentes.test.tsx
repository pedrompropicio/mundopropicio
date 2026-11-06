import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecurringTransactions from "@/pages/RecurringTransactions";

type Write = {
  table: string;
  operation: "insert" | "update" | "delete";
  payload?: any;
  filters: [string, unknown][];
};
const f = vi.hoisted(() => ({
  from: vi.fn(), toast: vi.fn(), records: [] as any[], writes: [] as Write[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" },
  isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { id: "fixture-company", country: "PT", currency: "EUR" },
  companyId: "fixture-company", isLoading: false, isError: false,
}) }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: f.toast, warning: f.toast, error: f.toast } }));

let client: QueryClient;
const warning = "Os lançamentos já gerados não são apagados. Para os retirar, use a lista de transações.";
const record = {
  id: "template-one", description: "Renda sintética", type: "expense", amount: 100, iva_rate: 23,
  frequency: "monthly", day_of_month: 1, start_date: "2026-11-01", end_date: "2027-10-01", is_active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
  f.records = [];
  f.writes = [];
  // Cliente inteiramente em memória; React Query, formulário e AlertDialog são reais.
  f.from.mockImplementation((table: string) => {
    let write: Write | undefined;
    const startWrite = (operation: Write["operation"], payload?: any) => {
      write = { table, operation, ...(payload === undefined ? {} : { payload }), filters: [] };
      f.writes.push(write);
      return query;
    };
    const query: any = {
      select: () => query, order: () => query, in: () => query,
      eq: (column: string, value: unknown) => { write?.filters.push([column, value]); return query; },
      insert: (payload: any) => startWrite("insert", payload),
      update: (payload: any) => startWrite("update", payload),
      delete: () => startWrite("delete"),
      single: async () => ({ data: { id: "created-template" }, error: null }),
      then: (resolve: any, reject: any) => {
        if (write?.operation === "delete" && table === "recurring_transactions") {
          const id = write.filters.find(([column]) => column === "id")?.[1];
          f.records = f.records.filter(row => row.id !== id);
        }
        return Promise.resolve({ data: table === "recurring_transactions" ? f.records : [], error: null })
          .then(resolve, reject);
      },
    };
    return query;
  });
  client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity }, mutations: { retry: false },
  } });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#695c: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", vi.fn(() => { throw new Error("#695c: rede proibida"); }));
  vi.stubGlobal("WebSocket", vi.fn(() => { throw new Error("#695c: rede proibida"); }));
});
afterEach(() => {
  cleanup();
  client.clear();
  expect(fetch).not.toHaveBeenCalled();
  expect(XMLHttpRequest).not.toHaveBeenCalled();
  expect(WebSocket).not.toHaveBeenCalled();
  delete (HTMLElement.prototype as any).scrollIntoView;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function openPage() {
  render(<QueryClientProvider client={client}><RecurringTransactions /></QueryClientProvider>);
}
async function chooseTrash(description = record.description) {
  const row = (await screen.findByText(description)).closest("tr")!;
  fireEvent.click(row.querySelector("svg.lucide-trash2")!.closest("button")!);
  return screen.getByRole("alertdialog", { name: "Eliminar o template?" });
}

describe("#695c — critério 1: eliminar só o template após confirmação", () => {
  beforeEach(() => { f.records = [{ ...record }]; });

  it("o clique abre o aviso literal sem escrever e Cancelar não apaga", async () => {
    openPage();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    const dialog = await chooseTrash();
    expect(within(dialog).getByText(warning)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    expect(f.writes).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(f.writes).toEqual([]);
    expect(screen.getByText(record.description)).toBeInTheDocument();
  });

  it("Esc fecha sem apagar", async () => {
    openPage();
    const dialog = await chooseTrash();
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(f.writes).toEqual([]);
  });

  it("clicar fora não apaga nem confirma o AlertDialog", async () => {
    openPage();
    const dialog = await chooseTrash();
    const overlay = dialog.previousElementSibling!;
    fireEvent.pointerDown(overlay, { button: 0, pointerType: "mouse", ctrlKey: false });
    fireEvent.click(overlay);
    await act(async () => {});
    expect(f.writes).toEqual([]);
    expect(screen.getByRole("alertdialog")).toBe(dialog);
  });

  it("Eliminar apaga uma vez o id escolhido, invalida a lista e não escreve em transactions", async () => {
    f.records.push({ ...record, id: "template-two", description: "Seguro sintético" });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    openPage();
    const first = await chooseTrash();
    fireEvent.click(within(first).getByRole("button", { name: "Cancelar" }));
    const dialog = await chooseTrash("Seguro sintético");
    expect(f.writes).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recurring-transactions"] }));
    expect(f.writes).toEqual([
      { table: "recurring_transactions", operation: "delete", filters: [["id", "template-two"]] },
    ]);
    expect(f.writes.filter(write => write.table === "transactions")).toEqual([]);
    expect(f.toast).toHaveBeenCalledWith("Template eliminado");
    await waitFor(() => expect(screen.queryByText("Seguro sintético")).not.toBeInTheDocument());
    expect(screen.getByText(record.description)).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

type Creation = {
  frequency?: "Mensal" | "Trimestral" | "Anual";
  start?: string;
  months?: number;
  end?: string;
  day?: number;
  offset?: string;
};
function inputAfterLabel(text: string) {
  return screen.getByText(text, { selector: "label" }).parentElement!.querySelector("input")!;
}
async function selectOption(label: string, option: string) {
  fireEvent.click(screen.getByText(label, { selector: "label" }).parentElement!.querySelector('[role="combobox"]')!);
  fireEvent.click(await screen.findByRole("option", { name: option }));
}
async function createTemplate({ frequency = "Mensal", start = "2026-11", months = 1, end, day = 1, offset = "" }: Creation) {
  openPage();
  fireEvent.click(screen.getByRole("button", { name: "Novo Template" }));
  fireEvent.change(screen.getByPlaceholderText("Ex: Renda do escritório"), { target: { value: "Recorrente fixture" } });
  fireEvent.change(inputAfterLabel("Valor (€) *"), { target: { value: "100" } });
  fireEvent.change(inputAfterLabel("Mês/Ano início"), { target: { value: start } });
  fireEvent.change(inputAfterLabel("Dia do mês"), { target: { value: String(day) } });
  fireEvent.change(screen.getByLabelText("Vence N dias depois da competência"), { target: { value: offset } });
  if (frequency !== "Mensal") await selectOption("Frequência", frequency);
  if (end) {
    await selectOption("Fim da recorrência", "Mês/Ano final");
    fireEvent.change(inputAfterLabel("Mês/Ano final"), { target: { value: end } });
  } else {
    fireEvent.change(screen.getByPlaceholderText("Ex: 12"), { target: { value: String(months) } });
  }
  // O limite 28 já existe; submit permite verificar o clamp legado de dia 31.
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
  await waitFor(() => expect(f.toast).toHaveBeenCalledWith("Template criado"));
  const templateWrite = f.writes.find(write => write.table === "recurring_transactions")!;
  const transactionWrites = f.writes.filter(write => write.table === "transactions");
  expect(templateWrite.operation).toBe("insert");
  expect(transactionWrites).toHaveLength(1);
  expect(transactionWrites[0].operation).toBe("insert");
  expect(f.writes).toHaveLength(2);
  return { template: templateWrite.payload, rows: transactionWrites[0].payload as { date: string; due_date: string }[] };
}

describe("#695c — critério 2: duração cobre N meses de calendário, incluindo o início", () => {
  it.each([
    { frequency: "Mensal", months: 1, dates: ["2026-11-01"], end: "2026-11-01" },
    { frequency: "Mensal", months: 2, dates: ["2026-11-01", "2026-12-01"], end: "2026-12-01" },
    { frequency: "Mensal", months: 12, dates: [
      "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01",
      "2027-05-01", "2027-06-01", "2027-07-01", "2027-08-01", "2027-09-01", "2027-10-01",
    ], end: "2027-10-01" },
    { frequency: "Trimestral", months: 12, dates: ["2026-11-01", "2027-02-01", "2027-05-01", "2027-08-01"], end: "2027-10-01" },
    { frequency: "Anual", months: 12, dates: ["2026-11-01"], end: "2027-10-01" },
    { frequency: "Anual", months: 24, dates: ["2026-11-01", "2027-11-01"], end: "2028-10-01" },
  ] as const)("$frequency, duração $months desde 11/2026", async ({ frequency, months, dates, end }) => {
    const { template, rows } = await createTemplate({ frequency, months });
    expect(template).toMatchObject({ start_date: "2026-11-01", end_date: end });
    expect(rows.map(row => row.date)).toEqual(dates);
    expect(rows.map(row => row.due_date)).toEqual(dates);
    expect(f.toast).toHaveBeenCalledWith(`${dates.length} transação(ões) gerada(s) automaticamente`);
  });

  it("dia 31 continua limitado a 28 e vence 38 dias depois, atravessando Fevereiro", async () => {
    const { template, rows } = await createTemplate({ start: "2027-01", months: 3, day: 31, offset: "38" });
    expect(template).toMatchObject({ day_of_month: 31, start_date: "2027-01-28", end_date: "2027-03-28" });
    expect(template).not.toHaveProperty("due_offset_days");
    expect(rows.map(({ date, due_date }) => [date, due_date])).toEqual([
      ["2027-01-28", "2027-03-07"], ["2027-02-28", "2027-04-07"], ["2027-03-28", "2027-05-05"],
    ]);
  });
});

describe("#695c — critério 3: Mês/Ano final conserva o fim inclusivo", () => {
  // Resultados do ramo date em cd7f595e7, anteriores à correção da duração.
  it.each([
    { frequency: "Mensal", end: "2026-11", dates: ["2026-11-28"] },
    { frequency: "Mensal", end: "2027-01", dates: ["2026-11-28", "2026-12-28", "2027-01-28"] },
    { frequency: "Trimestral", end: "2027-02", dates: ["2026-11-28", "2027-02-28"] },
    { frequency: "Anual", end: "2027-11", dates: ["2026-11-28", "2027-11-28"] },
  ] as const)("$frequency até $end mantém as datas anteriores", async ({ frequency, end, dates }) => {
    const { template, rows } = await createTemplate({ frequency, end, day: 28 });
    expect(template.end_date).toBe(`${end}-28`);
    expect(rows.map(row => row.date)).toEqual(dates);
    expect(rows.map(row => row.due_date)).toEqual(dates);
  });
});
