import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";

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
