// Testes do helper computePerAdsetCents — corre com `deno test --allow-none`.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computePerAdsetCents } from "./budget-split.ts";

Deno.test("(a) weighted: 10€ × [0.5,0.3,0.2] → [500,300,200]", () => {
  const r = computePerAdsetCents({
    daily_budget_eur: 10,
    adsets: [{ budget_weight: 0.5 }, { budget_weight: 0.3 }, { budget_weight: 0.2 }],
  });
  assertEquals(r.mode, "weighted");
  assertEquals(r.perAdsetCents, [500, 300, 200]);
  assertEquals(r.sumFinal, 1000);
  assertEquals(r.totalCents, 1000);
  assertEquals(r.warnings.length, 0);
});

Deno.test("(b) equal/fallback: 10€ sem pesos → [334,333,333]", () => {
  const r = computePerAdsetCents({
    daily_budget_eur: 10,
    adsets: [{ name: "a" }, { name: "b" }, { name: "c" }],
  });
  assertEquals(r.mode, "equal");
  assertEquals(r.perAdsetCents, [334, 333, 333]);
  assertEquals(r.sumFinal, 1000);
});

Deno.test("(c) pesos parciais: só 1/3 com peso → weighted + sem-peso ao mínimo", () => {
  const r = computePerAdsetCents({
    daily_budget_eur: 10,
    adsets: [{ budget_weight: 1.0 }, { name: "b" }, { name: "c" }],
  });
  assertEquals(r.mode, "weighted");
  // adset 0 levou tudo (1000), 1 e 2 sobem ao mínimo (100), donor 0 cede 200 → 800.
  assertEquals(r.perAdsetCents, [800, 100, 100]);
  assertEquals(r.sumFinal, 1000);
  assert(r.warnings.some((w) => w.includes("pesos parciais")), `esperava warning de pesos parciais; got ${JSON.stringify(r.warnings)}`);
});

Deno.test("(d) budget pequeno: 2€ × 3 adsets → todos no mínimo, soma 300 > 200, warn", () => {
  const r = computePerAdsetCents({
    daily_budget_eur: 2,
    adsets: [{ name: "a" }, { name: "b" }, { name: "c" }],
  });
  assertEquals(r.perAdsetCents, [100, 100, 100]);
  assertEquals(r.sumFinal, 300);
  assertEquals(r.totalCents, 200);
  assert(r.warnings.some((w) => w.includes("budget pequeno demais")), `esperava warning; got ${JSON.stringify(r.warnings)}`);
});

Deno.test("(e) 1 adset → recebe tudo", () => {
  const r = computePerAdsetCents({
    daily_budget_eur: 25,
    adsets: [{ name: "solo" }],
  });
  assertEquals(r.perAdsetCents, [2500]);
  assertEquals(r.sumFinal, 2500);
});

Deno.test("extra: pesos inválidos (NaN/negativos/zero) → fallback equal", () => {
  const r = computePerAdsetCents({
    daily_budget_eur: 10,
    adsets: [{ budget_weight: -1 }, { budget_weight: 0 }, { budget_weight: "abc" as any }],
  });
  assertEquals(r.mode, "equal");
  assertEquals(r.sumFinal, 1000);
});

Deno.test("extra: pesos somam 1.3 (denormalizados) → renormalizados", () => {
  const r = computePerAdsetCents({
    daily_budget_eur: 10,
    adsets: [{ budget_weight: 0.65 }, { budget_weight: 0.65 }],
  });
  assertEquals(r.mode, "weighted");
  assertEquals(r.sumFinal, 1000);
  // 0.65/1.3 = 0.5 cada → 500/500
  assertEquals(r.perAdsetCents, [500, 500]);
});

Deno.test("extra: 0 adsets → empty", () => {
  const r = computePerAdsetCents({ daily_budget_eur: 10, adsets: [] });
  assertEquals(r.mode, "empty");
  assertEquals(r.perAdsetCents, []);
});
