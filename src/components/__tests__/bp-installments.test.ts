import { describe, it, expect } from "vitest";
import { findMatchingTransactionsForForecast } from "@/components/EventForecast";
import { distributeEvenly, addByInterval } from "@/components/ScheduleInstallmentsModal";

// Helpers --------------------------------------------------------------
const tx = (over: Partial<any> = {}) => ({
  id: crypto.randomUUID(),
  event_id: "evt-1",
  type: "income",
  category_id: "cat-1",
  description: "Patrocínio Marca X",
  amount: 10000,
  iva_rate: 0,
  paid_amount: 0,
  status: "approved",
  ...over,
});

const fcast = (over: Partial<any> = {}) => ({
  id: crypto.randomUUID(),
  event_id: "evt-1",
  type: "income",
  category_id: "cat-1",
  description: "Patrocínio Marca X",
  amount: 30000,
  iva_rate: 0,
  status: "approved",
  transaction_id: null,
  ...over,
});

// =====================================================================
// distributeEvenly — distribuição de valores das parcelas
// =====================================================================
describe("distributeEvenly", () => {
  it("divide igualmente quando o total é divisível", () => {
    expect(distributeEvenly(30000, 3)).toEqual([10000, 10000, 10000]);
  });

  it("distribui o resto em cêntimos nas primeiras parcelas (sem perda)", () => {
    const arr = distributeEvenly(100, 3);
    expect(arr).toEqual([33.34, 33.33, 33.33]);
    expect(arr.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 2);
  });

  it("preserva a soma total mesmo em casos com fração complicada", () => {
    const arr = distributeEvenly(123.45, 7);
    expect(arr.reduce((s, v) => s + v, 0)).toBeCloseTo(123.45, 2);
    expect(arr.length).toBe(7);
  });

  it("retorna um array de tamanho n", () => {
    expect(distributeEvenly(1000, 12).length).toBe(12);
  });
});

// =====================================================================
// addByInterval — datas das parcelas
// =====================================================================
describe("addByInterval", () => {
  const base = new Date(2026, 0, 15); // 2026-01-15

  it("avança 7 dias em weekly", () => {
    expect(addByInterval(base, "weekly", 1).toISOString().slice(0, 10)).toBe("2026-01-22");
    expect(addByInterval(base, "weekly", 4).toISOString().slice(0, 10)).toBe("2026-02-12");
  });

  it("avança 14 dias em biweekly", () => {
    expect(addByInterval(base, "biweekly", 1).toISOString().slice(0, 10)).toBe("2026-01-29");
  });

  it("avança 1 mês em monthly", () => {
    expect(addByInterval(base, "monthly", 1).toISOString().slice(0, 10)).toBe("2026-02-15");
    expect(addByInterval(base, "monthly", 3).toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("step 0 devolve a mesma data", () => {
    expect(addByInterval(base, "monthly", 0).toISOString().slice(0, 10)).toBe("2026-01-15");
  });
});

// =====================================================================
// findMatchingTransactionsForForecast — UNION direct + category
// É AQUI que vivia o bug das parcelas
// =====================================================================
describe("findMatchingTransactionsForForecast — bug regressão das parcelas", () => {
  it("sem transaction_id: matcha por categoria + descrição (caso simples)", () => {
    const f = fcast();
    const t1 = tx({ description: "Patrocínio Marca X (1/3)", amount: 10000 });
    const t2 = tx({ description: "Patrocínio Marca X (2/3)", amount: 10000 });
    const result = findMatchingTransactionsForForecast(f, [t1, t2], [f]);
    // Quando só uma forecast usa a categoria, devolve todas as TXs dela
    expect(result.map((r) => r.id).sort()).toEqual([t1.id, t2.id].sort());
  });

  it("CRÍTICO: forecast com transaction_id retorna a 1ª parcela + as outras N-1 (UNION)", () => {
    const t1 = tx({ description: "Patrocínio Marca X (1/3)", amount: 10000 });
    const t2 = tx({ description: "Patrocínio Marca X (2/3)", amount: 10000 });
    const t3 = tx({ description: "Patrocínio Marca X (3/3)", amount: 10000 });
    const f = fcast({ transaction_id: t1.id });
    const result = findMatchingTransactionsForForecast(f, [t1, t2, t3], [f]);
    // Antes do fix devolvia SÓ t1. Agora deve devolver as 3.
    expect(result.length).toBe(3);
    expect(result.map((r) => r.id).sort()).toEqual([t1.id, t2.id, t3.id].sort());
  });

  it("não duplica a TX direta se também aparece no match por categoria", () => {
    const t1 = tx();
    const f = fcast({ transaction_id: t1.id });
    const result = findMatchingTransactionsForForecast(f, [t1], [f]);
    expect(result.length).toBe(1);
  });

  it("inclui a TX direta mesmo que esteja noutro evento (back-link tem prioridade)", () => {
    const t_other_event = tx({ event_id: "evt-OTHER" });
    const f = fcast({ transaction_id: t_other_event.id });
    const result = findMatchingTransactionsForForecast(f, [t_other_event], [f]);
    expect(result.map((r) => r.id)).toEqual([t_other_event.id]);
  });

  it("ignora TXs de outros eventos no matching por categoria", () => {
    const f = fcast();
    const t_same = tx({ description: "Patrocínio Marca X (1/2)" });
    const t_other = tx({ event_id: "evt-OTHER", description: "Patrocínio Marca X" });
    const result = findMatchingTransactionsForForecast(f, [t_same, t_other], [f]);
    expect(result.map((r) => r.id)).toEqual([t_same.id]);
  });

  it("não matcha TX de tipo diferente (income vs expense)", () => {
    const f = fcast({ type: "income" });
    const t_expense = tx({ type: "expense" });
    const result = findMatchingTransactionsForForecast(f, [t_expense], [f]);
    expect(result).toEqual([]);
  });

  it("com 2 forecasts mesma categoria: distingue por descrição (scoring)", () => {
    const fA = fcast({ description: "Patrocínio Marca X" });
    const fB = fcast({ description: "Patrocínio Marca Y" });
    const tA1 = tx({ description: "Patrocínio Marca X (1/2)" });
    const tA2 = tx({ description: "Patrocínio Marca X (2/2)" });
    const tB1 = tx({ description: "Patrocínio Marca Y (1/3)" });
    const txs = [tA1, tA2, tB1];
    const all = [fA, fB];
    expect(findMatchingTransactionsForForecast(fA, txs, all).map((r) => r.id).sort()).toEqual([tA1.id, tA2.id].sort());
    expect(findMatchingTransactionsForForecast(fB, txs, all).map((r) => r.id)).toEqual([tB1.id]);
  });

  it("com 2 forecasts mesma categoria: TX direta via transaction_id continua incluída mesmo que scoring não a escolha", () => {
    // Cenário em que a TX tem descrição que melhor matcharia outra forecast,
    // mas está back-linked à fA — a UNION deve mantê-la em fA.
    const fA = fcast({ description: "Marca X" });
    const fB = fcast({ description: "Marca Y" });
    const tBackLinked = tx({ description: "Marca Y especial" }); // texto puxa para fB
    const fAWithLink = { ...fA, transaction_id: tBackLinked.id };
    const result = findMatchingTransactionsForForecast(fAWithLink, [tBackLinked], [fAWithLink, fB]);
    // Direct back-link sempre incluído, mesmo que scoring discordasse.
    expect(result.map((r) => r.id)).toContain(tBackLinked.id);
  });
});

// =====================================================================
// Cascade delete — paid vs unpaid sobre N parcelas
// Simula o cálculo que o ForecastRow faz para decidir bloqueio.
// =====================================================================
describe("cascade delete — identificação de parcelas pagas/não-pagas", () => {
  const isPaid = (t: any) => {
    const total = Number(t.amount) * (1 + Number(t.iva_rate) / 100);
    const paid = Number(t.paid_amount ?? 0);
    return t.status === "paid" || paid >= total - 0.01;
  };

  it("3 parcelas pendentes: nenhuma paga, delete em cascata permitido", () => {
    const txs = [
      tx({ status: "approved", paid_amount: 0 }),
      tx({ status: "approved", paid_amount: 0 }),
      tx({ status: "approved", paid_amount: 0 }),
    ];
    expect(txs.filter(isPaid).length).toBe(0);
    expect(txs.filter((t) => !isPaid(t)).length).toBe(3);
  });

  it("3 parcelas, 1 paga: delete bloqueado (paidTransactions.length > 0)", () => {
    const txs = [
      tx({ status: "paid", paid_amount: 10000 }),
      tx({ status: "approved", paid_amount: 0 }),
      tx({ status: "approved", paid_amount: 0 }),
    ];
    expect(txs.filter(isPaid).length).toBe(1);
    expect(txs.filter((t) => !isPaid(t)).length).toBe(2);
  });

  it("considera paga quando paid_amount cobre o total ±0,01€", () => {
    const t = tx({ status: "approved", amount: 100, iva_rate: 23, paid_amount: 122.99 });
    // total = 123,00 — diff 0,01 entra na tolerância
    expect(isPaid(t)).toBe(true);
  });

  it("não considera paga quando faltam mais de 0,01€", () => {
    const t = tx({ status: "approved", amount: 100, iva_rate: 23, paid_amount: 122.5 });
    expect(isPaid(t)).toBe(false);
  });
});
