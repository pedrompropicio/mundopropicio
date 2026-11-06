import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import RecurringTransactions from "@/pages/RecurringTransactions";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>, writes: [] as { table: string; payload: any }[],
  mutations: [] as Promise<any>[], toast: vi.fn(), invoke: vi.fn(), close: vi.fn(),
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { id: "company", country: "PT", currency: "EUR" }, companyId: "company", isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: f.queries[queryKey[0]], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: any) => ({ isPending: false, mutate: (input: any) => {
    const result = Promise.resolve().then(() => options.mutationFn(input)).then(async value => {
      await options.onSuccess?.(value, input); return value;
    });
    f.mutations.push(result); result.catch(options.onError);
  } }),
}));
// Transportes exclusivamente em memória: nenhuma credencial nem serviço MP.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: f.invoke },
  from: (table: string) => {
    const q: any = {
      insert: (payload: any) => { f.writes.push({ table, payload }); return q; },
      update: (payload: any) => { f.writes.push({ table, payload }); return q; },
      select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q,
      single: async () => ({ data: { id: "created" }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    }; return q;
  },
} }));
vi.mock("@/hooks/use-toast", () => ({ toast: f.toast, useToast: () => ({ toast: f.toast }) }));
vi.mock("sonner", () => ({ toast: { success: f.toast, warning: f.toast, error: f.toast } }));
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
vi.mock("@/lib/invoice-group", () => ({
  autoGroupInvoiceForTransaction: async () => null, fetchInvoiceSiblings: async () => [], clearInvoiceGroupForTransaction: vi.fn(),
}));
vi.mock("@/lib/image-upload", () => ({ isHeicFile: () => false, normalizeImageFile: async (file: File) => file, HEIC_ACCEPT: "" }));
// A conversão/compressão é fronteira externa; o FileReader e o handler OCR são reais.
vi.mock("@/lib/pdf-first-page-to-jpeg", () => ({ pdfFirstPageToJpeg: async () => new File(["fixture"], "invoice.jpg", { type: "image/jpeg" }) }));
vi.mock("@/lib/storage", () => ({ uploadToCompanyBucket: async () => ({ path: "fixture/invoice.pdf", error: null }) }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/AccountantReviewBadge", () => ({ AccountantReviewBlock: () => null }));
vi.mock("@/components/ui/overlay-layer", async () => {
  const { forwardRef } = await import("react");
  return { OverlayLayer: forwardRef<HTMLDivElement, { children: React.ReactNode }>(({ children }, ref) => <div ref={ref}>{children}</div>) };
});

const today = "2026-11-05";
const help = "Mês a que a despesa/receita pertence (data da fatura ou do serviço), não o dia em que lança.";
const invoiceWarning = /a fatura foi lida com outra data/i;
const monthsWarning = /competência e o vencimento estão separados por mais de 2 meses/i;
type Kind = "criação" | "edição";
const transaction = {
  id: "transaction", description: "Fixture", amount: 100, date: today, supplier_id: "supplier",
  type: "expense", status: "pending", currency: "EUR", event_id: null, category_id: null,
  account_id: null, iva_rate: 0, is_transitory: false, is_confidential: false, is_reimbursement: false,
  excluded_from_partner_settlement: false, exclude_from_result: false, payment_method: "transfer",
  declared_withholding_rate: null, declared_withholding_amount: null,
};
function open(kind: Kind, overrides = {}) {
  return render(kind === "criação"
    ? <TransactionFormModal onClose={f.close} defaults={{ description: "Fixture", amount: "100", date: today, supplier_id: "supplier", type: "expense", iva_rate: 0, ...overrides }} />
    : <MemoryRouter><TransactionEditModal onClose={f.close} canApprove transaction={{ ...transaction, ...overrides }} /></MemoryRouter>);
}
function competence(value: string) {
  fireEvent.change(screen.getByLabelText("Data de competência"), { target: { value } });
}
async function submit() {
  const button = document.body.querySelector('button[type="submit"]')!;
  expect(button).not.toBeDisabled();
  fireEvent.click(button);
  await waitFor(() => expect(f.mutations).toHaveLength(1));
  await act(async () => { await Promise.all(f.mutations); });
}
async function readInvoice(date: string) {
  f.invoke.mockResolvedValueOnce({ data: { document_date: date, total: 100 }, error: null });
  const input = document.body.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File(["invoice"], "invoice.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect(f.invoke).toHaveBeenCalledWith("extract-invoice-total", expect.anything()));
  await waitFor(() => expect(screen.queryByText("A ler…")).not.toBeInTheDocument());
}
beforeEach(() => {
  vi.clearAllMocks(); f.queries = { "event-iva-country": ["Portugal"] }; f.writes = []; f.mutations = [];
  f.invoke.mockResolvedValue({ data: {}, error: null });
  f.toast.mockReturnValue({ dismiss: vi.fn() });
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(`${today}T12:00:00Z`));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#695: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#695: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#695: rede proibida"); } });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("#695 — competência nos modais reais", () => {
  it.each<Kind>(["criação", "edição"])("%s mostra rótulo, ajuda e DatePicker sem aviso por defeito", kind => {
    open(kind);
    expect(screen.getByLabelText("Data de competência")).toHaveValue("05/11/2026");
    expect(screen.getByText(help)).toBeInTheDocument();
    expect(screen.queryByText(invoiceWarning)).not.toBeInTheDocument();
    expect(screen.queryByText(monthsWarning)).not.toBeInTheDocument();
  });
  it.each<Kind>(["criação", "edição"])("%s avisa para 3 meses em ambos os sentidos e grava sem confirmação extra", async kind => {
    open(kind, { date: "2026-12-31", due_date: kind === "criação" ? "01/03/2027" : "2027-03-01" });
    expect(screen.getByText(monthsWarning)).toHaveAttribute("role", "status");
    competence("01/06/2027");
    expect(screen.getByText(monthsWarning)).toBeInTheDocument();
    await submit();
    if (kind === "criação") expect(f.writes.find(w => w.table === "transactions")?.payload).toMatchObject({ date: "2027-06-01", due_date: "2027-03-01" });
    else expect(f.invoke).toHaveBeenCalledWith("update-transaction", expect.objectContaining({ body: expect.objectContaining({ updates: expect.objectContaining({ date: "2027-06-01", due_date: "2027-03-01" }) }) }));
    expect(f.close).toHaveBeenCalled();
  });
  it.each<Kind>(["criação", "edição"])("%s não avisa com 2 meses, mês igual, data ausente ou inválida", kind => {
    open(kind, { date: "2026-12-31", due_date: kind === "criação" ? "01/02/2027" : "2027-02-01" });
    expect(screen.queryByText(monthsWarning)).not.toBeInTheDocument();
    competence("01/02/2027");
    expect(screen.queryByText(monthsWarning)).not.toBeInTheDocument();
    cleanup(); open(kind, { date: "", due_date: kind === "criação" ? "99/99/2027" : "invalid" });
    expect(screen.queryByText(monthsWarning)).not.toBeInTheDocument();
  });
});

describe("#695 — igualdade com a regra OCR actual", () => {
  it.each(["", today, "2026-10-20"])("competência %s antes da leitura mantém a regra actual", async date => {
    open("criação", { date });
    await readInvoice("2026-09-12");
    expect(screen.getByLabelText("Data de competência")).toHaveValue(date && date !== today ? "20/10/2026" : "12/09/2026");
    expect(screen.queryByText(invoiceWarning)).not.toBeInTheDocument();
  });
  it("também substitui hoje escolhido à mão (comportamento existente)", async () => {
    open("criação", { date: "2026-10-20" }); competence("05/11/2026");
    await readInvoice("2026-09-12");
    expect(screen.getByLabelText("Data de competência")).toHaveValue("12/09/2026");
  });
  it("avisa ao voltar a hoje após ler outra data, sem impedir a criação e o anexo", async () => {
    open("criação"); await readInvoice("2026-11-04"); competence("05/11/2026");
    expect(screen.getByText(invoiceWarning)).toHaveAttribute("role", "status");
    fireEvent.change(screen.getByTitle("Anexar documento — será associado após criar a transação").querySelector("input")!, {
      target: { files: [new File(["invoice"], "invoice.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(screen.getByText("Anexado")).toBeInTheDocument());
    await submit();
    expect(f.writes.find(w => w.table === "transactions")?.payload.date).toBe(today);
    expect(f.writes.some(w => w.table === "transaction_documents")).toBe(true);
    expect(f.close).toHaveBeenCalled();
  });
  it("não avisa se a data lida é hoje; limpar a fatura remove o aviso", async () => {
    open("criação"); await readInvoice(today);
    expect(screen.queryByText(invoiceWarning)).not.toBeInTheDocument();
    cleanup(); f.invoke.mockClear(); open("criação"); await readInvoice("2026-10-31"); competence("05/11/2026");
    expect(screen.getByText(invoiceWarning)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Limpar fatura lida/));
    expect(screen.queryByText(invoiceWarning)).not.toBeInTheDocument();
  });
  it("nova leitura sem data não reutiliza a data da fatura anterior", async () => {
    open("criação"); await readInvoice("2026-10-31"); competence("05/11/2026");
    expect(screen.getByText(invoiceWarning)).toBeInTheDocument();
    f.invoke.mockClear(); await readInvoice("");
    expect(screen.queryByText(invoiceWarning)).not.toBeInTheDocument();
  });
  it("conserva literalmente a condição actual do OCR", () => {
    expect(readFileSync("src/components/TransactionFormModal.tsx", "utf8"))
      .toContain("if (readDate && (!f.date || f.date === todayIso)) next.date = readDate;");
  });
});

async function openRecurring(offset = "") {
  render(<RecurringTransactions />);
  fireEvent.click(screen.getByRole("button", { name: "Novo Template" }));
  fireEvent.change(screen.getByPlaceholderText("Ex: Renda do escritório"), { target: { value: "Renda fixture" } });
  const numbers = document.body.querySelectorAll('input[type="number"]');
  fireEvent.change(numbers[0], { target: { value: "100" } });
  fireEvent.change(numbers[1], { target: { value: "28" } });
  fireEvent.change(document.body.querySelector('input[type="month"]')!, { target: { value: "2027-01" } });
  // O limite existente é inclusivo: 11 meses de distância = 12 ocorrências.
  fireEvent.change(screen.getByPlaceholderText("Ex: 12"), { target: { value: "11" } });
  fireEvent.change(screen.getByLabelText("Vence N dias depois da competência"), { target: { value: offset } });
}
// Executa a geração anterior (corpo capturado de HEAD antes da mudança) com fixtures.
function legacyOccurrences() {
  // Captura literal de 4c2d9154db711a406317d3683d9fbd7e8319c28a; não deriva do código alterado.
  const legacy = String.raw`  const generateAllTransactions = async (rec: {
    description: string; type: string; amount: number; iva_rate: number;
    category_id: string | null; event_id: string | null; supplier_id: string | null;
    account_id: string | null; specification: string | null;
    frequency: string; day_of_month: number; start_date: string; end_date: string | null;
    id: string;
  }) => {
    if (!rec.end_date) return 0;

    // Parse dates in local timezone to avoid UTC offset issues
    const [sy, sm, sd] = rec.start_date.split("-").map(Number);
    const [ey, em, ed] = rec.end_date.split("-").map(Number);
    const endDate = new Date(ey, em - 1, ed);

    const freqMonths = rec.frequency === "yearly" ? 12 : rec.frequency === "quarterly" ? 3 : 1;
    const transactions: any[] = [];
    let occurrenceIndex = 0;

    while (true) {
      const occurrenceDate = new Date(sy, sm - 1 + occurrenceIndex * freqMonths, sd);
      if (occurrenceDate > endDate) break;

      const dateStr = formatDateStr(occurrenceDate);
      transactions.push({
        description: rec.description,
        type: rec.type,
        amount: rec.amount,
        iva_rate: rec.iva_rate,
        category_id: rec.category_id,
        event_id: rec.event_id,
        supplier_id: rec.supplier_id,
        account_id: rec.account_id,
        specification: rec.specification,
        date: dateStr,
        due_date: dateStr,
        status: "pending",
      });

      occurrenceIndex += 1;
    }

    if (transactions.length > 0) {
      const { error } = await supabase.from("transactions").insert(transactions);
      if (error) throw error;
    }

    return transactions.length;
  };
`;
  const js = ts.transpileModule(legacy + "\nreturn generateAllTransactions;", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const writes: any[] = [];
  const generate = new Function("supabase", "formatDateStr", js)({ from: () => ({ insert: async (rows: any[]) => { writes.push(...rows); return { error: null }; } }) },
    (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  return { generate, writes };
}
describe("#695 — vencimento das recorrentes só na geração", () => {
  it.each(["", "0"])("N=%s mantém igualdade integral com a geração anterior em 12 meses", async offset => {
    await openRecurring(offset); await submit();
    const rec = f.writes.find(w => w.table === "recurring_transactions")!.payload;
    expect(rec).not.toHaveProperty("due_offset_days");
    const legacy = legacyOccurrences(); await legacy.generate({ ...rec, id: "created" });
    const rows = f.writes.find(w => w.table === "transactions")!.payload;
    expect(rows).toHaveLength(12); expect(rows).toEqual(legacy.writes);
  });
  it("N=38 atravessa Fevereiro e meses de 30/31 dias sem alterar competências nem o modelo", async () => {
    await openRecurring("38"); await submit();
    const rows = f.writes.find(w => w.table === "transactions")!.payload;
    expect(rows.map((row: any) => [row.date, row.due_date])).toEqual([
      ["2027-01-28", "2027-03-07"], ["2027-02-28", "2027-04-07"], ["2027-03-28", "2027-05-05"],
      ["2027-04-28", "2027-06-05"], ["2027-05-28", "2027-07-05"], ["2027-06-28", "2027-08-05"],
      ["2027-07-28", "2027-09-04"], ["2027-08-28", "2027-10-05"], ["2027-09-28", "2027-11-05"],
      ["2027-10-28", "2027-12-05"], ["2027-11-28", "2028-01-05"], ["2027-12-28", "2028-02-04"],
    ]);
    expect(f.writes.find(w => w.table === "recurring_transactions")!.payload).not.toHaveProperty("due_offset_days");
  });
  it.each(["-1", "121", "1.5"])("recusa N=%s antes de qualquer escrita", async offset => {
    await openRecurring(offset);
    expect(screen.getByLabelText("Vence N dias depois da competência")).toBeInvalid();
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await expect(f.mutations[0]).rejects.toThrow(/inteiro de 0 a 120/);
    expect(f.writes).toEqual([]);
  });
  it("N=120 gera o vencimento no limite permitido", async () => {
    await openRecurring("120"); await submit();
    const rows = f.writes.find(w => w.table === "transactions")!.payload;
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ date: "2027-01-28", due_date: "2027-05-28" });
    expect(rows[11]).toMatchObject({ date: "2027-12-28", due_date: "2028-04-26" });
  });
  it("limpar o prazo volta a zero na geração", async () => {
    await openRecurring("120"); expect(screen.getByLabelText("Vence N dias depois da competência")).toBeValid();
    fireEvent.change(screen.getByLabelText("Vence N dias depois da competência"), { target: { value: "" } });
    await submit();
    expect(f.writes.find(w => w.table === "transactions")!.payload.every((row: any) => row.due_date === row.date)).toBe(true);
  });
  it("editar um modelo não apresenta prazo temporário e não gera novamente", async () => {
    f.queries["recurring-transactions"] = [{ id: "rec", description: "Renda fixture", type: "expense", amount: 100,
      iva_rate: 0, frequency: "monthly", day_of_month: 28, start_date: "2027-01-28", end_date: "2027-12-28", is_active: true }];
    render(<RecurringTransactions />);
    fireEvent.click(document.body.querySelector('svg.lucide-pencil')!.closest("button")!);
    expect(screen.queryByLabelText("Vence N dias depois da competência")).not.toBeInTheDocument();
    await submit(); expect(f.writes).toHaveLength(1); expect(f.writes[0].table).toBe("recurring_transactions");
  });
});
