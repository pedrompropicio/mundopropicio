import { assertEquals } from "jsr:@std/assert@1";
import { balanceAlert, deliveryStopped, parseAmount, parseMetaDisplayBalance, pickCause } from "./logic.ts";

Deno.test("parseAmount", () => {
  assertEquals(parseAmount("R$4.619,56"), 4619.56);
  assertEquals(parseAmount("€1,234.50"), 1234.5);
  assertEquals(parseAmount("4619,56"), 4619.56);
  assertEquals(parseAmount("4619.56"), 4619.56);
  assertEquals(parseAmount("1.234"), 1234);
});

Deno.test("parseMetaDisplayBalance", () => {
  assertEquals(parseMetaDisplayBalance("Saldo disponível (R$4.619,56 BRL)"), 4619.56);
  assertEquals(parseMetaDisplayBalance("Available balance (€12.30 EUR)"), 12.3);
  assertEquals(parseMetaDisplayBalance("Saldo disponível: R$ 0,00"), 0);
  assertEquals(parseMetaDisplayBalance("Visa *1234"), null);
});

Deno.test("balanceAlert", () => {
  assertEquals(balanceAlert({ source: "postpaid_na", balance: null, daysLeft: null, label: "x", ccy: "EUR" }), null);
  assertEquals(balanceAlert({ source: "bc_sem_permissao", balance: null, daysLeft: null, label: "x", ccy: "BRL" })?.kind, "saldo_ilegivel");
  assertEquals(balanceAlert({ source: "s", balance: 0, daysLeft: 0, label: "x", ccy: "BRL" })?.kind, "saldo_critico");
  assertEquals(balanceAlert({ source: "s", balance: 100, daysLeft: 1.5, label: "x", ccy: "BRL" })?.kind, "saldo_baixo");
  assertEquals(balanceAlert({ source: "s", balance: 100, daysLeft: 5, label: "x", ccy: "BRL" }), null);
});

Deno.test("delivery + cause", () => {
  assertEquals(deliveryStopped({ spendToday: 0, avg3d: 2025.6, frac: 10 / 24 }).stopped, true);
  assertEquals(deliveryStopped({ spendToday: 900, avg3d: 2025.6, frac: 10 / 24 }).stopped, false);
  assertEquals(pickCause({ balanceCritical: true, accountProblem: "x", adsRejectedOrReview: null, budgetExhausted: null }), "saldo esgotado ou crítico");
  assertEquals(pickCause({ balanceCritical: false, accountProblem: null, adsRejectedOrReview: null, budgetExhausted: null }), "sem causa identificada");
});
