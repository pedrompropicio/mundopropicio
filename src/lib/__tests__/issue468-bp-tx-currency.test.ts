import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { bpTxCurrencyMetadata } from "../bp-tx-currency";
import { mustWrite } from "../must-write";

// Execute the production mutation and callbacks, without mounting unrelated BP
// panels or importing the real Supabase client. No duplicate payload builder.
const source = readFileSync("src/components/EventForecast.tsx", "utf8");
const start = source.indexOf("const bulkCreateTxMutation = useMutation({");
const end = source.indexOf("\n  // Schedule N installment", start);
const expression = source.slice(start, end).replace("const bulkCreateTxMutation = useMutation(", "const config = (");
const compiled = ts.transpileModule(expression + "\nreturn config;", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness(failure?: { table: string; call: number; empty?: boolean }) {
  const writes: { table: string; payload: any; filters: any[] }[] = [];
  const counts: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    let write: typeof writes[number];
    const query: any = {
      insert: vi.fn((payload) => { write = { table, payload, filters: [] }; writes.push(write); return query; }),
      update: vi.fn((payload) => { write = { table, payload, filters: [] }; writes.push(write); return query; }),
      eq: vi.fn((...args) => { write.filters.push(args); return query; }),
      select: vi.fn(() => query), single: vi.fn(() => query),
      then(resolve: any) {
        counts[table] = (counts[table] ?? 0) + 1;
        const fails = failure?.table === table && counts[table] === failure.call;
        return Promise.resolve(fails
          ? failure?.empty ? { data: [], error: null } : { data: null, error: { message: `falha ${table}` } }
          : { data: table === "transactions" ? { id: `tx-${counts[table]}` } : [{ id: "ok" }], error: null }).then(resolve);
      },
    };
    return query;
  });
  const toast = vi.fn();
  const invalidateQueries = vi.fn();
  const config = new Function("supabase", "bpTxCurrencyMetadata", "mustWrite", "eventId", "eventDate", "user", "queryClient", "setSelectedIds", "toast", "pickFormalidadePromotableIds", "setPendingFechado", compiled)(
    { from }, bpTxCurrencyMetadata, mustWrite, "event-test", "2026-11-02", { email: "synthetic@example.invalid" },
    { invalidateQueries }, vi.fn(), toast, () => [], vi.fn(),
  );
  async function run(lines: any[]) {
    try { const result = await config.mutationFn(lines); config.onSuccess(result, lines); return result; }
    catch (error) { config.onError(error); throw error; }
  }
  return { run, writes, from, toast, counts };
}
const line = (extra: Record<string, unknown> = {}) => ({
  id: "bp-test", type: "expense", description: "Sintético", specification: "spec", amount: 17,
  iva_rate: 23, category_id: "category-test", status: "approved", ordering_partner_id: "partner-test",
  currency: "BRL", original_amount: 100.01, fx_rate: 0.17, fx_rate_source: "manual",
  attachment_refs: [{ url: "https://example.invalid/doc.pdf" }, { url: "invalid" }], ...extra,
});

describe("#468 production BP → TX bulk mutation", () => {
  it.each([100.01, 100.02, 0, "100.0200"])("transports exact original %s and preserves the existing financial payload", async (original) => {
    const h = harness();
    expect(await h.run([line({ original_amount: original })])).toEqual({ created: 1, autoApproved: 1, propagatedAttachments: 1 });
    expect(h.writes[0]).toEqual({ table: "transactions", filters: [], payload: {
      event_id: "event-test", forecast_id: "bp-test", type: "expense", description: "Sintético", specification: "spec",
      amount: 17, iva_rate: 23, category_id: "category-test", date: "2026-11-02", due_date: "2026-11-02",
      status: "approved", ordering_partner_id: "partner-test", currency: "BRL", original_amount: original,
      fx_rate: 0.17, fx_rate_source: "manual",
    } });
    expect(h.counts).toEqual({ transactions: 1, transaction_audit_log: 2, transaction_documents: 1, event_forecasts: 1 });
    expect(h.from).toHaveBeenCalledTimes(5);
    expect(h.writes[3].payload).toEqual([{ transaction_id: "tx-1", name: "doc.pdf", file_url: "ref://https://example.invalid/doc.pdf", doc_type: "outro", uploaded_by: "synthetic@example.invalid", is_accounting: true }]);
    expect(h.writes[4]).toEqual({ table: "event_forecasts", payload: { transaction_id: "tx-1" }, filters: [["id", "bp-test"]] });
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0][0].title).toContain("já aprovada");
  });
  it.each(["USD", "GBP", "EUR"])("copies %s and nullable source without inventing a value", async (currency) => {
    const h = harness(); await h.run([line({ currency, fx_rate_source: null })]);
    expect(h.writes[0].payload).toMatchObject({ currency, original_amount: 100.01, fx_rate: 0.17, fx_rate_source: null });
  });
  it.each([null, undefined, "EUR"])("preserves canonical EUR legacy (%s)", async (currency) => {
    const h = harness(); await h.run([line({ currency, original_amount: null, fx_rate: null, fx_rate_source: null, type: "income", status: "draft", attachment_refs: [], transaction_id: "existing" })]);
    expect(h.writes[0].payload).toMatchObject({ currency: "EUR", amount: 17, original_amount: null, fx_rate: null, fx_rate_source: null, status: "pending", ordering_partner_id: null });
    expect(h.counts).toEqual({ transactions: 1, transaction_audit_log: 1 });
  });
  it.each([
    { amount: NaN }, { amount: Infinity }, { amount: null },
    { original_amount: null }, { original_amount: undefined }, { original_amount: NaN }, { original_amount: Infinity },
    { original_amount: "" }, { fx_rate: null }, { fx_rate: 0 }, { fx_rate: -1 }, { fx_rate: NaN }, { fx_rate: Infinity },
    { fx_rate: " " }, { currency: "ZZZ" }, { currency: "brl" }, { currency: "" }, { currency: null },
  ])("rejects a mixed selection before any write: %j", async (invalid) => {
    const h = harness();
    await expect(h.run([line(), line({ id: "invalid-line", ...invalid })])).rejects.toThrow("invalid-line");
    expect(h.from).not.toHaveBeenCalled(); expect(h.writes).toHaveLength(0);
    expect(h.toast.mock.calls[0][0]).toMatchObject({ variant: "destructive", title: "Erro ao criar transações" });
  });
  it.each([
    { table: "transactions", call: 2, confirmed: 1, completed: 1 },
    { table: "transaction_audit_log", call: 1, confirmed: 1, completed: 0 },
    { table: "transaction_documents", call: 1, confirmed: 1, completed: 0 },
    { table: "event_forecasts", call: 1, confirmed: 1, completed: 0 },
    { table: "event_forecasts", call: 1, empty: true, confirmed: 1, completed: 0 },
  ])("reports partial creation on $table failure without total success", async (failure) => {
    const h = harness(failure);
    await expect(h.run([line(), line({ id: "bp-second" })])).rejects.toThrow(`${failure.confirmed} transação(ões) com criação confirmada; ${failure.completed} linha(s) concluída(s) de 2`);
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0][0]).toMatchObject({ variant: "destructive", title: "Erro ao criar transações" });
    expect(h.counts.transactions).toBe(failure.table === "transactions" ? 2 : 1);
  });
  it("loads paginated BP metadata through the real query and transports it to INSERT", async () => {
    const queryStart = source.indexOf('  const { data: forecastsRaw =');
    const fnStart = source.indexOf('queryFn: ', queryStart) + 'queryFn: '.length;
    const fnEnd = source.indexOf('\n    },\n  });', fnStart) + '\n    }'.length;
    const queryCode = ts.transpileModule('const load = ' + source.slice(fnStart, fnEnd) + '; return load;', {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const query: any = {};
    for (const method of ["select", "in", "eq", "is", "order"]) query[method] = vi.fn(() => query);
    const from = vi.fn(() => query);
    const rows = [line({ original_amount: 100.02 })];
    const paged = vi.fn(async () => ({ data: rows, error: null }));
    const load = new Function("supabase", "forecastEventIds", "selectedVersionId", "fetchAllPagedQuery", queryCode)(
      { from }, ["event-test"], null, paged,
    );
    const loaded = await load();
    expect(from).toHaveBeenCalledWith("event_forecasts");
    expect(query.select).toHaveBeenCalledWith("*, account_categories(code, name, type)");
    expect(query.in).toHaveBeenCalledWith("event_id", ["event-test"]);
    expect(query.is).toHaveBeenCalledWith("version_id", null);
    expect(paged).toHaveBeenCalledTimes(1);
    const h = harness(); await h.run(loaded);
    expect(h.writes[0].payload).toMatchObject({ currency: "BRL", original_amount: 100.02, fx_rate: 0.17, fx_rate_source: "manual" });
  });
  it("retains full metadata loading and selection guards in production", () => {
    expect(source).toContain('.select("*, account_categories(code, name, type)")');
    expect(source).toContain('forecasts.filter((f) => selectedIds.has(f.id) && isEligibleForBulkTx(f))');
    expect(source).toContain('!(transactions ?? []).some((t: any) => t.forecast_id === f.id)');
  });
});
