import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  expandMasterRevenueToSplits,
  masterRevenueView,
  allocateCents,
  validateFixedPct,
} from "@/lib/master-revenue-proration";
import { computeRevenueBasisFromRows } from "@/lib/event-revenue-basis";
import { computeSettlementRevenue } from "@shared/settlement/settlement-revenue.ts";
import { masterTxAmountForCity } from "@/hooks/useMasterRevenueSplit";

const M = "master";
const L = "lisboa";
const P = "porto";
const F = "faro";
const events = [
  { id: M, parent_event_id: null, date: "2026-01-01" },
  { id: L, parent_event_id: M, date: "2026-10-02" },
  { id: P, parent_event_id: M, date: "2026-10-03" },
  { id: F, parent_event_id: M, date: "2026-10-04" },
];
const line = (over: any = {}) => ({
  id: "fc1", event_id: M, type: "income", amount: 1000, iva_rate: 23, status: "approved",
  is_overhead: false, exclude_from_result: false, is_transitory: false, event_settlement_id: null,
  account_categories: { code: "1.3.04" }, revenue_split_mode: "equal", revenue_split_params: null,
  ...over,
});
const sum = (xs: any[]) => Math.round(xs.reduce((s, x) => s + Number(x.amount), 0) * 100) / 100;
const noSponsor: any = { hasTargets: false, currentNet: null, currentGross: null, realNet: 0, realGross: 0, excludedForecastIds: [] };
const zero = { net: 0, gross: 0 };

describe("#339 B — expandMasterRevenueToSplits", () => {
  it("equal: Σ fatias = linha ao cêntimo e resto na última cidade", () => {
    const r = expandMasterRevenueToSplits({ events, forecasts: [line()] });
    expect(r.forecastSlices.map((s) => s.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(sum(r.forecastSlices)).toBe(1000);
    expect(r.forecastSlices[2].event_id).toBe(F);
  });

  it("fixed_pct: Σ = linha; inválido não reparte e avisa", () => {
    const ok = expandMasterRevenueToSplits({
      events, forecasts: [line({ amount: 4200.75, revenue_split_mode: "fixed_pct", revenue_split_params: { [L]: 50, [P]: 30, [F]: 20 } })],
    });
    expect(ok.forecastSlices.map((s) => s.amount)).toEqual([2100.38, 1260.22, 840.15]);
    expect(sum(ok.forecastSlices)).toBe(4200.75);

    const bad1 = expandMasterRevenueToSplits({ events, forecasts: [line({ revenue_split_mode: "fixed_pct", revenue_split_params: { [L]: 50, [P]: 30 } })] });
    const bad2 = expandMasterRevenueToSplits({ events, forecasts: [line({ revenue_split_mode: "fixed_pct", revenue_split_params: { [L]: 50, [P]: 30, x: 20 } })] });
    for (const b of [bad1, bad2]) {
      expect(b.forecastSlices).toHaveLength(0);
      expect(b.warnings[0].code).toBe("fixed_pct_invalido");
    }
    expect(validateFixedPct({ [L]: 33.33, [P]: 33.33, [F]: 33.34 }, [L, P, F]).ok).toBe(true);
  });

  it("ticket_share: previsto enquanto há cidades por realizar, real quando todas realizadas, base zero não reparte", () => {
    const ts = line({ revenue_split_mode: "ticket_share" });
    const tb = { forecastByEvent: { [L]: 100, [P]: 300, [F]: 600 }, realByEvent: { [L]: 500, [P]: 500, [F]: 0 } };
    const prev = expandMasterRevenueToSplits({ events, forecasts: [ts], ticketBasis: { ...tb, realizedEventIds: [L, P] } });
    expect(prev.ticketBasisUsed.fc1).toBe("forecast");
    expect(prev.forecastSlices.map((s) => s.amount)).toEqual([100, 300, 600]);
    const real = expandMasterRevenueToSplits({ events, forecasts: [ts], ticketBasis: { ...tb, realizedEventIds: [L, P, F] } });
    expect(real.ticketBasisUsed.fc1).toBe("real");
    expect(real.forecastSlices.map((s) => s.amount)).toEqual([500, 500, 0]);
    expect(sum(real.forecastSlices)).toBe(1000);
    const z = expandMasterRevenueToSplits({ events, forecasts: [ts], ticketBasis: { forecastByEvent: {}, realizedEventIds: [] } });
    expect(z.forecastSlices).toHaveLength(0);
    expect(z.warnings[0].code).toBe("ticket_share_base_zero");
  });

  it("sem regra, overhead/excluída/transitória ou sem cidades: não reparte", () => {
    for (const f of [
      line({ revenue_split_mode: null }),
      line({ is_overhead: true }),
      line({ exclude_from_result: true }),
      line({ is_transitory: true }),
      line({ event_id: L }),
    ]) expect(expandMasterRevenueToSplits({ events, forecasts: [f] }).forecastSlices).toHaveLength(0);
  });

  it("transações ligadas seguem a regra; sem linha ficam no Master; caixa fora da fatia; marcação preservada", () => {
    const r = expandMasterRevenueToSplits({
      events,
      forecasts: [line({ event_settlement_id: "st1" })],
      transactions: [
        { id: "t1", event_id: M, type: "income", amount: 99.99, forecast_id: "fc1", account_id: "acc", event_settlement_id: "st1" },
        { id: "t2", event_id: M, type: "income", amount: 50, forecast_id: null, account_id: "acc" },
      ],
    });
    expect(r.transactionSlices).toHaveLength(3);
    expect(sum(r.transactionSlices)).toBe(99.99);
    expect(r.transactionSlices.every((s: any) => s.account_id === null)).toBe(true);
    expect(r.transactionSlices.every((s: any) => s.event_settlement_id === "st1")).toBe(true);
    expect(r.forecastSlices.every((s: any) => s.event_settlement_id === "st1")).toBe(true);
    expect(r.sourceTransactionIds.has("t2")).toBe(false);
    expect(masterTxAmountForCity(r as any, { id: "t1" }, P, 33.33)).toBe(33.33);
    expect(masterTxAmountForCity(r as any, { id: "t2" }, P, 16.67)).toBe(16.67);
  });

  it("allocateCents nunca perde cêntimos", () => {
    expect(allocateCents(0.01, [1, 1, 1])).toEqual([0, 0, 0.01]);
    expect(allocateCents(5278.875, [1, 1])).toEqual([2639.44, 2639.44]);
  });
});

describe("#339 B — perímetro: raiz uma vez, cidade só a fatia", () => {
  const forecasts = [line(), line({ id: "own-l", event_id: L, amount: 200, revenue_split_mode: null })];
  const r = expandMasterRevenueToSplits({ events, forecasts });
  const split = { sourceIds: r.sourceForecastIds, slices: r.forecastSlices as any[] };

  it("raiz: receita igual antes/depois de ligar a regra", () => {
    const before = computeSettlementRevenue({ incomeForecasts: forecasts.map((f) => ({ ...f, revenue_split_mode: null })) });
    const after = computeSettlementRevenue({ incomeForecasts: masterRevenueView([...forecasts, ...split.slices], split, "root") });
    expect(after.revenueNet).toBe(before.revenueNet);
    expect(after.revenueNet).toBeCloseTo(1200, 2);
  });

  it("cada cidade recebe a sua quota; Σ cidades + Master = raiz (sem dupla contagem)", () => {
    const per = (id: string) =>
      computeSettlementRevenue({ incomeForecasts: masterRevenueView(forecasts.filter((f) => f.event_id === id), split, "event", [id]) }).revenueNet;
    expect(per(L)).toBeCloseTo(533.33, 2);
    expect(per(P)).toBeCloseTo(333.33, 2);
    expect(per(F)).toBeCloseTo(333.34, 2);
    expect(per(M)).toBeCloseTo(0, 2);
    expect(Math.round((per(L) + per(P) + per(F) + per(M)) * 100) / 100).toBeCloseTo(1200, 2);
  });

  it("event-revenue-basis: a fatia conta uma vez no bucket outros da cidade", () => {
    const rows = masterRevenueView(forecasts.filter((f) => f.event_id === L), split, "event", [L]);
    const b = computeRevenueBasisFromRows({ ticket: zero, incomeTx: [], incomeForecasts: rows, sponsorship: noSponsor });
    expect(b.currentForecast.buckets.outros?.net).toBeCloseTo(533.33, 2);
    expect(b.real.total.net).toBe(0);
  });

  it("real da cidade: transação do Master repartida conta só a fatia", () => {
    const rt = expandMasterRevenueToSplits({
      events, forecasts: [line()],
      transactions: [{ id: "t1", event_id: M, type: "income", amount: 900, forecast_id: "fc1", status: "paid", account_categories: { code: "1.3.04" } }],
    });
    const b = computeRevenueBasisFromRows({
      ticket: zero, incomeTx: rt.transactionSlices.filter((s) => s.event_id === P), incomeForecasts: [], sponsorship: noSponsor,
    });
    expect(b.real.total.net).toBe(300);
  });

  it("base do cachê não lê receitas de BP nem transações (só ticket_sales)", () => {
    const src = readFileSync(path.resolve(__dirname, "../real-cache-calc.ts"), "utf8");
    expect(src.includes("income")).toBe(false);
    expect(src.includes("revenue_split")).toBe(false);
  });
});

describe("#339 B — regressão Live (23/10/2026, só leitura): regra NULL não muda nada", () => {
  const fx = JSON.parse(readFileSync(path.resolve(__dirname, "fixtures/master-revenue-live-2026-10-23.json"), "utf8"));
  const r = expandMasterRevenueToSplits({ events: fx.events, forecasts: fx.forecasts, transactions: fx.transactions });
  const roots = ["5e56f568-506f-4469-8802-050182c6d479", "76250aba-2a10-4b3f-8482-c1db200d497f", "c1a2b3c4-2026-4000-8000-000000000001", "fdfb39fe-45f2-43f5-9ec9-7cb536360ae1"];

  it("todas as linhas em Live têm revenue_split_mode NULL → zero fatias", () => {
    expect(fx.forecasts.every((f: any) => f.revenue_split_mode == null)).toBe(true);
    expect(r.forecastSlices).toHaveLength(0);
    expect(r.transactionSlices).toHaveLength(0);
  });

  it.each(roots)("família %s: receita da raiz e de cada evento iguais ao cêntimo", (root) => {
    const fam = new Set(fx.events.filter((e: any) => e.id === root || e.parent_event_id === root).map((e: any) => e.id));
    const fs = fx.forecasts.filter((f: any) => fam.has(f.event_id));
    const ts = fx.transactions.filter((t: any) => fam.has(t.event_id));
    const before = computeSettlementRevenue({ incomeTransactions: ts, incomeForecasts: fs });
    const after = computeSettlementRevenue({
      incomeTransactions: masterRevenueView(ts, { sourceIds: r.sourceTransactionIds, slices: r.transactionSlices as any[] }, "root"),
      incomeForecasts: masterRevenueView(fs, { sourceIds: r.sourceForecastIds, slices: r.forecastSlices as any[] }, "root"),
    });
    expect(after.revenueNet).toBeCloseTo(before.revenueNet, 2);
    expect(after.revenueGross).toBeCloseTo(before.revenueGross, 2);
    for (const id of fam) {
      const one = (rows: any[]) => rows.filter((x) => x.event_id === id);
      const b = computeSettlementRevenue({ incomeTransactions: one(ts), incomeForecasts: one(fs) });
      const a = computeSettlementRevenue({
        incomeTransactions: masterRevenueView(one(ts), { sourceIds: r.sourceTransactionIds, slices: r.transactionSlices as any[] }, "event", [id as string]),
        incomeForecasts: masterRevenueView(one(fs), { sourceIds: r.sourceForecastIds, slices: r.forecastSlices as any[] }, "event", [id as string]),
      });
      expect(a.revenueNet).toBeCloseTo(b.revenueNet, 2);
    }
  });
});
