/**
 * #339 B2b — fecho com sócios por CIDADE com receita do Master repartida.
 * ERP (computeEventSettlementTotals, o motor do Acerto) e statement-service
 * (documento/Portal) recebem as MESMAS fatias do leitor único e dão o mesmo número.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPartnerStatement, type StatementBundle } from "@shared/settlement/statement-service.ts";
import { computeEventSettlementTotals } from "@shared/settlement/event-settlement-inputs.ts";
import { loadMasterRevenueSlicesFor } from "@shared/settlement/master-revenue-load.ts";
import { expandMasterRevenueToSplits } from "@shared/settlement/master-revenue-proration.ts";

const M = "m-1";
const L = "c-lis";
const P = "c-por";
const ROOT = "st-root";
const SUP = "sup-b";

const masterLine = (mode: string, params: any = null) => ({
  id: "fm-1", event_id: M, type: "income", amount: 10000, iva_rate: 23, status: "approved",
  description: "Revenue share", is_overhead: false, is_transitory: false, exclude_from_result: false,
  event_settlement_id: "st-master-root", revenue_split_mode: mode, revenue_split_params: params,
  account_categories: { code: "1.3.04", name: "Outras receitas" },
});
const masterTx = {
  id: "tm-1", event_id: M, type: "income", amount: 6000, iva_rate: 23, status: "paid", forecast_id: "fm-1",
  date: "2026-10-05", is_transitory: false, exclude_from_result: false, reversed_at: null, is_hidden: false,
  event_settlement_id: null, description: "Recebido Ticketline", account_id: "acc-master", held_by_supplier_id: null,
  account_categories: { code: "1.3.04", name: "Outras receitas" },
};

/** Cliente falso com a mesma forma do supabase-js (só leitura). */
function fakeClient(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q: any = {
        select: () => q,
        in: (c: string, v: any[]) => { rows = rows.filter((r) => v.includes(r[c])); return q; },
        eq: (c: string, v: any) => { rows = rows.filter((r) => r[c] === v); return q; },
        is: (c: string, v: any) => { rows = rows.filter((r) => (r[c] ?? null) === v); return q; },
        not: (c: string) => { rows = rows.filter((r) => r[c] != null); return q; },
        order: () => q,
        range: async (a: number, b: number) => ({ data: rows.slice(a, b + 1), error: null }),
        then: (res: any) => res({ data: rows, error: null }),
      };
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  };
}

const events = [
  { id: M, parent_event_id: null, date: "2026-01-01", status: "completed" },
  { id: L, parent_event_id: M, date: "2026-10-02", status: "completed" },
  { id: P, parent_event_id: M, date: "2026-10-03", status: "completed" },
];

function cityBundle(city: string, forecastSlices: any[], txSlices: any[]): StatementBundle {
  return {
    eventId: city, eventName: city, eventDate: "2026-10-02", eventLocation: null,
    basis: { withVat: false, includeOverhead: true, expenseSource: "committed" },
    calcBasis: "net_result",
    events: [{ id: city, parent_event_id: M, name: city }],
    transactions: [
      { id: `own-${city}`, description: "Receita local", amount: 1000, iva_rate: 0, type: "income", date: "2026-10-02",
        status: "paid", event_id: city, event_settlement_id: null, account_id: "acc-city", account_categories: { code: "1.3.01", name: "Outras" } },
      ...txSlices,
    ],
    forecasts: [
      { id: `fe-${city}`, event_id: city, description: "Despesa", type: "expense", amount: 2000, iva_rate: 0,
        status: "approved", is_overhead: false, event_settlement_id: null },
      ...forecastSlices,
    ],
    categories: [],
    settlements: [{ id: ROOT, name: "Fechamento", parent_id: null, position: 1, parent_share_pct: null }],
    participants: [
      { id: "p-h", participantId: "p-h", settlement_id: ROOT, settlementName: "Fechamento", supplier_id: null, isHouse: true,
        mode: "settles", percentage: 60, loss_percentage: null, expense_includes_iva: null, transfer_with_vat: false, name: "MUNDO PROPÍCIO" },
      { id: "p-b", participantId: "p-b", settlement_id: ROOT, settlementName: "Fechamento", supplier_id: SUP, isHouse: false,
        mode: "settles", percentage: 40, loss_percentage: null, expense_includes_iva: null, transfer_with_vat: false, name: "SÓCIO B" },
    ] as any,
    paidExpenses: [], extras: [], revenuesHeldRaw: [], grossDisbursementSupplierIds: [],
    ticketSales: [], ticketBreakdown: [], operations: [], participations: [], localeBySupplier: {},
  } as unknown as StatementBundle;
}

async function slicesFor(city: string, line: any) {
  const client = fakeClient({ event_forecasts: [line], transactions: [masterTx], events });
  return loadMasterRevenueSlicesFor(client, [{ id: city, parent_event_id: M }]);
}

describe.each([
  ["equal", null, { [L]: 3000, [P]: 3000 }],
  ["fixed_pct", { [L]: 70, [P]: 30 }, { [L]: 4200, [P]: 1800 }],
])("#339 B2b — regra %s, fechamento por cidade", (mode, params, expectedTxSlice) => {
  it("ERP e statement-service dão o mesmo resultado; cidade recebe a quota do real", async () => {
    for (const city of [L, P]) {
      const s = await slicesFor(city, masterLine(mode as string, params));
      expect(s.transactionSlices).toHaveLength(1);
      expect(Number(s.transactionSlices[0].amount)).toBe((expectedTxSlice as any)[city]);
      const b = cityBundle(city, s.forecastSlices, s.transactionSlices);
      const erp = computeEventSettlementTotals({
        events: b.events, transactions: b.transactions, forecasts: b.forecasts, ticketSales: [],
        basis: { includeOverhead: true, expenseSource: "committed" },
      });
      const res = buildPartnerStatement(b, SUP)!;
      expect(res).not.toBeNull();
      // real do bucket "outros": receita local 1000 + fatia da transação do Master
      const expected = 1000 + (expectedTxSlice as any)[city];
      expect(erp.revenueNet).toBeCloseTo(expected, 2);
      expect(res.cards.revenueNet).toBeCloseTo(erp.revenueNet, 2);
      expect(res.cards.result).toBeCloseTo(expected - 2000, 2);
      expect(res.block.account.share).toBeCloseTo((expected - 2000) * 0.4, 2);
      expect(JSON.stringify(res.doc.revenues)).toContain("via Master");
    }
  });

  it("caixa e receitas em poder não mudam: fatias sem conta nem titular", async () => {
    const s = await slicesFor(L, masterLine(mode as string, params));
    for (const x of [...s.transactionSlices, ...s.forecastSlices]) {
      expect(x.account_id ?? null).toBeNull();
      expect(x.held_by_supplier_id ?? null).toBeNull();
    }
  });

  it("marcação event_settlement_id preservada na fatia da linha", async () => {
    const s = await slicesFor(L, masterLine(mode as string, params));
    expect(s.forecastSlices[0].event_settlement_id).toBe("st-master-root");
  });

  it("raiz (Master no perímetro): a linha conta uma vez, nenhuma fatia entra", async () => {
    const client = fakeClient({ event_forecasts: [masterLine(mode as string, params)], transactions: [masterTx], events });
    const s = await loadMasterRevenueSlicesFor(client, events);
    expect(s.forecastSlices).toHaveLength(0);
    expect(s.transactionSlices).toHaveLength(0);
  });
});

describe("#339 B2b — regra NULL: fecho e documento iguais ao cêntimo (fixtures Live 23/10/2026)", () => {
  const fx = JSON.parse(readFileSync(path.resolve(__dirname, "../lib/__tests__/fixtures/master-revenue-live-2026-10-23.json"), "utf8"));

  it("o leitor não devolve fatias para nenhum evento das 4 famílias", async () => {
    const client = fakeClient({ event_forecasts: fx.forecasts, transactions: fx.transactions, events: fx.events });
    for (const e of fx.events) {
      const s = await loadMasterRevenueSlicesFor(client, [e]);
      expect(s.forecastSlices.length + s.transactionSlices.length).toBe(0);
    }
  });

  it("resultado, parte do sócio e total a transferir de cada evento iguais com e sem o passo", async () => {
    const r = expandMasterRevenueToSplits({ events: fx.events, forecasts: fx.forecasts, transactions: fx.transactions });
    for (const e of fx.events) {
      const own = (rows: any[]) => rows.filter((x) => x.event_id === e.id);
      const mk = (fs: any[], ts: any[]) => ({
        ...cityBundle(e.id, [], []),
        events: [{ id: e.id, parent_event_id: e.parent_event_id }],
        transactions: ts, forecasts: fs,
      }) as unknown as StatementBundle;
      const before = buildPartnerStatement(mk(own(fx.forecasts), own(fx.transactions)), SUP)!;
      const after = buildPartnerStatement(
        mk([...own(fx.forecasts), ...own(r.forecastSlices)], [...own(fx.transactions), ...own(r.transactionSlices)]),
        SUP,
      )!;
      expect(after.cards.result).toBeCloseTo(before.cards.result, 2);
      expect(after.block.account.share).toBeCloseTo(before.block.account.share, 2);
      expect(after.block.account.transferTotal).toBeCloseTo(before.block.account.transferTotal, 2);
    }
  });
});
