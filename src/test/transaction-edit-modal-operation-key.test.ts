import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Issue #242 — a chave de operação não pode voltar a sair do payload da edição.
 *
 * O defeito: `operationKeyField` era construído mas nunca espalhado em `updates`,
 * em nenhum dos dois ramos (paidLocked e normal). O ecrã dizia "gravado" e o
 * valor nunca saía do browser. Este teste lê o fonte do modal e falha se o
 * spread desaparecer de qualquer um dos ramos.
 */
describe("TransactionEditModal — operation_key no payload (Issue #242)", () => {
  const src = readFileSync("src/components/TransactionEditModal.tsx", "utf8");

  it("constrói operationKeyField a partir do formulário", () => {
    expect(src).toContain("const operationKeyField = { operation_key: form.operation_key.trim() || null };");
  });

  it("espalha operationKeyField nos DOIS ramos do payload (paidLocked e normal)", () => {
    const spreads = src.match(/\.\.\.operationKeyField/g) ?? [];
    expect(
      spreads.length,
      "operationKeyField tem de ser espalhado nos dois ramos do payload (paidLocked e normal)",
    ).toBeGreaterThanOrEqual(2);
  });

  it("operation_key consta dos campos editáveis de uma transação paga", () => {
    expect(src).toContain('"operation_key"');
  });
});
