import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { validateInstallments } from "@/components/TransactionInstallmentsEditor";
import { calcTotalWithIva } from "../iva";
import { computeInstallmentNets } from "../installment-nets";
import { installmentOriginals, assertEuroInstallmentChange } from "../installment-original";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// Execute the actual production mutation configs, as in #468. Only surrounding
// React state and transport are supplied; no duplicate writer or payload builder.
function config(file: string, name: string, end: string, ctx: Record<string, any>) {
  const source = readFileSync(`src/components/${file}.tsx`, "utf8");
  const start = source.indexOf(`const ${name} = useMutation({`);
  expect(start).toBeGreaterThan(0);
  const finish = source.indexOf(end, start);
  expect(finish).toBeGreaterThan(start);
  const expression = source.slice(start, finish).replace(`const ${name} = useMutation(`, "const config = (");
  const js = ts.transpileModule(expression + "\nreturn config;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(ctx), js)(...Object.values(ctx));
}
function transport(failInsert = 0) {
  const writes: { table: string; kind: string; payload: any }[] = [];
  let inserts = 0;
  const from = vi.fn((table: string) => {
    let kind = "";
    let failed = false;
    const q: any = {
      insert(payload: any) { kind = "insert"; writes.push({ table, kind, payload }); if (table === "transactions") failed = ++inserts === failInsert; return q; },
      update(payload: any) { kind = "update"; writes.push({ table, kind, payload }); return q; },
      select: () => q, single: () => q, eq: () => q,
      then(resolve: any) { return Promise.resolve({ data: { id: `tx-${inserts}` }, error: failed ? new Error("synthetic insert failure") : null }).then(resolve); },
    };
    return q;
  });
  const rpc = vi.fn().mockResolvedValue({ data: "group", error: null });
  return { writes, supabase: { from, rpc }, txInsert: (payload: any) => from("transactions").insert(payload) };
}
const data = {
  description: "Sintético", type: "expense", amount: "100.02", iva_rate: 0, event_id: "evt", category_id: "cat", supplier_id: "sup", account_id: "", date: "2026-11-02", due_date: "2026-11-02", payment_method: "transfer", pl_override_note: "", invoice_ref: "", declared_withholding_rate: "", declared_withholding_amount: "", is_reimbursement: false,
};
function creation(over: Record<string, any> = {}, fail = 0) {
  const t = transport(fail);
  const toast = vi.fn();
  const ctx: any = {
    companyCurrency: "EUR", noIva: false,
    ...t, toast, computeInstallmentNets, installmentOriginals, validateInstallments, calcTotalWithIva,
    useInstallments: true, installmentRows: [33.34, 33.34, 33.34].map(amount => ({ amount, scheduled_date: "2026-11-02" })),
    pendingIvaSplit: null, currency: "BRL", originalAmount: "100.01", fxRate: "0.17", fxRateSource: "manual",
    relevantForecasts: [], forecastBudgetByCategory: {}, usedBudgetByCategory: {},
    selectedForecastId: "", sharedCostAccountId: "", partnerExtraPartialAmount: "", sharedCostThirdValue: "",
    parseDueDateForDb: (d: string) => d, user: { email: "synthetic@example.invalid" },
    findExistingInstallments: vi.fn().mockResolvedValue([]), reinforcementChoice: null,
    friendlyPaymentError: (e: Error) => e.message,
    queryClient: { invalidateQueries: vi.fn() }, onClose: vi.fn(), onCreated: vi.fn(), attachAfterCreateFile: null,
    suppliers: [],
  };
  for (const flag of ["isSplit", "isPartnerExtra", "isPaidByPartner", "effectiveAutoMarkPaid", "sharedCostSplitActive", "autoMarkPaid", "isTransitory", "partnerPaidSettles", "houseOnlyValue", "isExcludeFromResult", "isConfidential", "selectedCategoryIsCapital"]) ctx[flag] = false;
  Object.assign(ctx, over);
  const c = config("TransactionFormModal", "createMutation", "\n  const getRootFlags", ctx);
  const run = async (input = data) => {
    try { return await c.mutationFn(input); }
    catch (e) { c.onError(e); throw e; }
  };
  return { ...t, c, ctx, run, toast };
}

describe("#471 real creation mutation", () => {
  it.each(["BRL", "USD", "GBP", "EUR"])("first TX and sisters preserve %s payload", async currency => {
    const h = creation({ currency });
    await h.run();
    const txs = h.writes.filter(w => w.table === "transactions" && w.kind === "insert").map(w => w.payload);
    expect(txs).toHaveLength(3);
    expect(txs.map(t => t.original_amount)).toEqual(currency === "EUR" ? [null, null, null] : [33.34, 33.34, 33.33]);
    expect(txs.map(t => t.amount)).toEqual([33.34, 33.34, 33.34]);
    expect(txs.every(t => t.currency === currency && t.fx_rate === (currency === "EUR" ? null : 0.17) && t.fx_rate_source === (currency === "EUR" ? null : "manual") && t.iva_rate === 0)).toBe(true);
  });
  it("100.02 sums exactly in the first payload and sisters", async () => {
    const h = creation({ originalAmount: "100.02" }); await h.run();
    const originals = h.writes.filter(w => w.table === "transactions" && w.kind === "insert").map(w => w.payload.original_amount);
    expect(originals).toEqual([33.34, 33.34, 33.34]);
    expect(originals.reduce((s, n) => s + Math.round(n * 100), 0)).toBe(10002);
  });
  it("unequal confirmed EUR bases drive the production original payload", async () => {
    const h = creation({ installmentRows: [10, 30, 60].map(amount => ({ amount, scheduled_date: "2026-11-02" })) });
    await h.run({ ...data, amount: "100" });
    expect(h.writes.filter(w => w.table === "transactions" && w.kind === "insert").map(w => w.payload.original_amount)).toEqual([10, 30, 60.01]);
  });
  it("preserves four-place EUR bases and IVA, weighting originals by those bases", async () => {
    const h = creation({ installmentRows: [8374.94, 8374.93].map(amount => ({ amount, scheduled_date: "2026-11-02" })) });
    await h.run({ ...data, amount: "13617.78", iva_rate: 23 });
    const txs = h.writes.filter(w => w.table === "transactions" && w.kind === "insert").map(w => w.payload);
    expect(txs.map(t => t.amount)).toEqual([6808.8943, 6808.8857]);
    expect(txs.map(t => t.original_amount)).toEqual([50.01, 50]);
    expect(txs.map(t => t.iva_rate)).toEqual([23, 23]);
  });
  it("preserves original zero in actual inserts", async () => {
    const h = creation({ originalAmount: "0" }); await h.run();
    expect(h.writes.filter(w => w.kind === "insert" && w.table === "transactions").map(w => w.payload.original_amount)).toEqual([0, 0, 0]);
  });
  it.each([
    { originalAmount: "" }, { originalAmount: "100.001" }, { originalAmount: "Infinity" },
    { fxRate: "0x10" }, { fxRate: "" }, { fxRate: "0" }, { fxRate: "-1" }, { fxRate: "NaN" }, { fxRate: "Infinity" },
    { installmentRows: [{ amount: Infinity, scheduled_date: "2026-11-02" }] },
    { installmentRows: [{ amount: -1, scheduled_date: "2026-11-02" }] },
    { pendingIvaSplit: [{}, {}] }, { isSplit: true }, { sharedCostSplitActive: true },
  ])("refuses before the first write: %j", async over => {
    const h = creation(over); await expect(h.run()).rejects.toThrow(); expect(h.writes).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });
  it("a sibling failure reports partial risk without integral success", async () => {
    const h = creation({}, 2); await expect(h.run()).rejects.toThrow("synthetic");
    expect(h.writes.filter(w => w.kind === "insert" && w.table === "transactions")).toHaveLength(2);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: expect.stringContaining("parcial") }));
    expect(h.ctx.onClose).not.toHaveBeenCalled();
  });
});

function paidLock(canApprove = false, unlockPaid = false) {
  const source = readFileSync("src/components/TransactionInstallmentGroupEditor.tsx", "utf8");
  const declarations = ["const isPaidRow =", "  const rowLocked ="].map(prefix => source.split("\n").find(line => line.startsWith(prefix))).join("\n");
  const js = ts.transpileModule(declarations + "\nreturn rowLocked;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("canApprove", "unlockPaid", js)(canApprove, unlockPaid);
}
function edit(group: any[], rows: any, extra: any = {}) {
  const t = transport();
  const ctx = { ...t, group, rows, mismatch: false, user: null, canEdit: true, assertEuroInstallmentChange,
    nativeCurrency: "EUR", symbol: "€",
    rowLocked: paidLock(), ...extra };
  const c = config("TransactionInstallmentGroupEditor", "saveMutation", "\n  if (group.length < 2)", ctx);
  return { ...t, run: () => c.mutationFn() };
}
const member = (id: string, currency = "BRL") => ({ id, currency, amount: 6.8089, due_date: "2026-11-02", status: "approved", paid_amount: 0 });
describe("#471 actual group editor preflight", () => {
  it.each(["BRL", "USD", "GBP", null, undefined])("rejects %s monetary changes before an earlier date write", async currency => {
    const h = edit([{ ...member("a"), currency }, { ...member("b"), currency }], { a: { amount: 6.8089, due_date: "2026-11-03" }, b: { amount: 7, due_date: "2026-11-02" } });
    await expect(h.run()).rejects.toThrow(); expect(h.writes).toEqual([]);
  });
  it("isolated foreign dates send no rounded amount/original/FX", async () => {
    const h = edit([member("a")], { a: { amount: 6.8089, due_date: "2026-11-03" } });
    expect(await h.run()).toBe(1);
    expect(h.writes[0]).toEqual({ table: "transactions", kind: "update", payload: { due_date: "2026-11-03" } });
  });
  it("EUR monetary editing remains functional", async () => {
    const h = edit([member("a", "EUR")], { a: { amount: 7, due_date: "2026-11-02" } });
    expect(await h.run()).toBe(1); expect(h.writes[0].payload).toEqual({ amount: 7 });
  });
  it("retains authorized paid unlocking for EUR", async () => {
    const h = edit([{ ...member("a", "EUR"), status: "paid" }], { a: { amount: 7, due_date: "2026-11-02" } }, { rowLocked: paidLock(true, true) });
    expect(await h.run()).toBe(1);
  });
  it("retains the permission guard before writes", async () => {
    const h = edit([member("a", "EUR")], { a: { amount: 7, due_date: "2026-11-02" } }, { canEdit: false });
    await expect(h.run()).rejects.toThrow("permissão"); expect(h.writes).toEqual([]);
  });
  it("a later paid row prevents every write", async () => {
    const h = edit([member("a", "EUR"), { ...member("b", "EUR"), status: "paid" }], { a: { amount: 7, due_date: "2026-11-02" }, b: { amount: 8, due_date: "2026-11-02" } });
    await expect(h.run()).rejects.toThrow("paga travada"); expect(h.writes).toEqual([]);
  });
});

describe("#471 actual renegotiation mutation", () => {
  it.each(["BRL", "USD", "GBP", undefined, "EUR"])("guards %s while retaining the single atomic EUR RPC", async currency => {
    const t = transport();
    const c = config("TransactionRenegotiateInstallmentsModal", "mutation", "\n  return createPortal", {
      nativeCurrency: "EUR", symbol: "€",
      ...t, assertEuroInstallmentChange, transaction: { id: "tx", currency },
      validateInstallments, rows: [{ amount: 50, scheduled_date: "2026-11-02" }, { amount: 50, scheduled_date: "2026-12-02" }],
      computeInstallmentNets, grossTotal: 100, baseTotal: 100, ivaMultiplier: 1, user: null,
    });
    if (currency === "EUR") {
      expect(await c.mutationFn()).toBe(2);
      expect(t.supabase.rpc).toHaveBeenCalledExactlyOnceWith("renegotiate_transaction_installments", { p_transaction_id: "tx", p_changed_by: "sistema", p_installments: [{ amount: 50, due_date: "2026-11-02" }, { amount: 50, due_date: "2026-12-02" }] });
    } else { await expect(c.mutationFn()).rejects.toThrow("estrangeira"); expect(t.supabase.rpc).not.toHaveBeenCalled(); }
    expect(t.writes).toEqual([]);
  });
});


describe("#471 actual submit preflight before budget writes", () => {
  it.each(["", "100.001", "Infinity"])("refuses original %s before offering a budget raise", async originalAmount => {
    const h = creation({ originalAmount });
    const budget = vi.fn().mockResolvedValue([{ forecast_id: "bp" }]);
    const create = vi.fn();
    const ctx = { ...h.ctx, form: data, selectedForecastId: "bp", setShowProrationConfirm: vi.fn(),
      budgetPreflightDoneRef: { current: false }, computeBudgetExcess: budget,
      setBudgetRaisePrompt: vi.fn(), createMutation: { mutate: create },
      require: (name: string) => {
        if (name === "@/components/TransactionInstallmentsEditor") return { validateInstallments };
        throw new Error(`Unexpected dynamic import: ${name}`);
      },
    };
    const source = readFileSync("src/components/TransactionFormModal.tsx", "utf8");
    const start = source.indexOf("  const proceedWithCreate = async");
    const end = source.indexOf("\n  // Reinforcement dialog handler", start);
    const js = ts.transpileModule(source.slice(start, end) + "\nreturn proceedWithCreate;", {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const proceed = new Function(...Object.keys(ctx), js)(...Object.values(ctx));
    await proceed();
    expect(budget).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(h.writes).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Parcelas inválidas", variant: "destructive" }));
  });
});


describe("#498 P2f native BRL production mutations", () => {
  it("creates the first BRL installment and sisters without original/FX and forces zero IVA", async () => {
    const h = creation({ companyCurrency: "BRL", noIva: true, originalAmount: "", fxRate: "" });
    await h.run({ ...data, iva_rate: 23 });
    const txs = h.writes.filter(w => w.table === "transactions" && w.kind === "insert").map(w => w.payload);
    expect(txs).toHaveLength(3);
    expect(txs.map(t => t.amount)).toEqual([33.34, 33.34, 33.34]);
    for (const tx of txs) expect(tx).toMatchObject({ currency: "BRL", original_amount: null, fx_rate: null, fx_rate_source: null, iva_rate: 0 });
  });
  it("edits BRL monetary values under the BR native currency", async () => {
    const h = edit([member("a")], { a: { amount: 7, due_date: "2026-11-02" } }, { nativeCurrency: "BRL", symbol: "R$" });
    expect(await h.run()).toBe(1);
    expect(h.writes[0].payload).toEqual({ amount: 7 });
  });
  it("renegotiates native BRL through the same atomic RPC and native plan", async () => {
    const t = transport();
    const c = config("TransactionRenegotiateInstallmentsModal", "mutation", "\n  return createPortal", {
      ...t, nativeCurrency: "BRL", symbol: "R$", assertEuroInstallmentChange, transaction: { id: "tx", currency: "BRL" },
      validateInstallments, rows: [{ amount: 50, scheduled_date: "2026-11-02" }, { amount: 50, scheduled_date: "2026-12-02" }],
      computeInstallmentNets, grossTotal: 100, baseTotal: 100, ivaMultiplier: 1, user: null,
    });
    expect(await c.mutationFn()).toBe(2);
    expect(t.supabase.rpc).toHaveBeenCalledExactlyOnceWith("renegotiate_transaction_installments", {
      p_transaction_id: "tx", p_changed_by: "sistema",
      p_installments: [{ amount: 50, due_date: "2026-11-02" }, { amount: 50, due_date: "2026-12-02" }],
    });
    expect(t.writes).toEqual([]);
  });
});


describe("#498 P2f foreign creation retains FX requirement", () => {
  it.each(["BRL", "USD", "GBP"])("refuses foreign %s/PT without FX before writes", async currency => {
    const h = creation({ currency, fxRate: "" });
    await expect(h.run()).rejects.toThrow("câmbio");
    expect(h.writes).toEqual([]);
  });
});
