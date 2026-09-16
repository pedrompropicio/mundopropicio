import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SERVICE_PAYMENT_FIELDS_MESSAGE,
  isServicePaymentCheckViolation,
  validateServicePaymentFields,
} from "@/lib/payment-methods";

/**
 * O domínio de `payment_method` existe em dois sítios (o `src/` não é publicado
 * com as edge functions): a fonte é `src/lib/payment-methods.ts` e o espelho
 * está em `supabase/functions/update-transaction/index.ts`. Este teste garante
 * que não divergem — divergir desarma o trigger
 * `trg_force_no_account_on_compensation`, que compara a string exactamente.
 */
describe("domínio de payment_method", () => {
  it("os cinco valores esperados, sem mais", () => {
    expect([...PAYMENT_METHODS].sort()).toEqual(
      ["compensation", "direct_debit", "service_payment", "state_payment", "transfer"],
    );
  });

  it("todos têm rótulo em pt-PT", () => {
    for (const m of PAYMENT_METHODS) {
      expect(PAYMENT_METHOD_LABELS[m]).toBeTruthy();
    }
  });

  it("o espelho da edge function update-transaction é igual", () => {
    const src = readFileSync("supabase/functions/update-transaction/index.ts", "utf8");
    const block = src.match(/export const PAYMENT_METHODS = \[([\s\S]*?)\] as const;/);
    expect(block).toBeTruthy();
    const mirrored = [...block![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(mirrored.sort()).toEqual([...PAYMENT_METHODS].sort());
  });
});

/**
 * Pagamento de Serviços exige referência MB completa — ESPELHO do CHECK
 * `transactions_service_payment_requires_mb` e da verificação em
 * `supabase/functions/update-transaction/index.ts`.
 */
describe("validateServicePaymentFields", () => {
  it("aceita entidade de 5 e referência de 9 dígitos", () => {
    expect(
      validateServicePaymentFields({
        payment_method: "service_payment",
        payment_entity: "10611",
        payment_reference: "123456789",
      }),
    ).toBeNull();
  });

  it("recusa entidade ou referência com dimensão errada, ou vazias", () => {
    for (const [entity, reference] of [
      ["1061", "123456789"],
      ["106111", "123456789"],
      ["10611", "12345678"],
      ["10611", ""],
      ["", ""],
      ["1061a", "123456789"],
    ]) {
      expect(
        validateServicePaymentFields({
          payment_method: "service_payment",
          payment_entity: entity,
          payment_reference: reference,
        }),
      ).toBe(SERVICE_PAYMENT_FIELDS_MESSAGE);
    }
  });

  it("nos outros métodos não valida nada", () => {
    for (const m of PAYMENT_METHODS.filter((x) => x !== "service_payment")) {
      expect(validateServicePaymentFields({ payment_method: m, payment_entity: null, payment_reference: null })).toBeNull();
    }
  });

  it("reconhece a rejeição do CHECK da base", () => {
    expect(
      isServicePaymentCheckViolation({
        code: "23514",
        message: 'new row violates check constraint "transactions_service_payment_requires_mb"',
      }),
    ).toBe(true);
    expect(isServicePaymentCheckViolation({ code: "23514", message: "outro check" })).toBe(false);
  });

  it("o espelho da edge function update-transaction tem a mesma regra e mensagem", () => {
    const src = readFileSync("supabase/functions/update-transaction/index.ts", "utf8");
    expect(src).toContain(SERVICE_PAYMENT_FIELDS_MESSAGE);
    expect(src).toContain("/^\\d{5}$/");
    expect(src).toContain("/^\\d{9}$/");
  });
});
