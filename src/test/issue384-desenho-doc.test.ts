import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const document = readFileSync(
  "docs/estudos/socios-e-pagadores/384-paid-by-pagamento.md",
  "utf8",
);

describe("#384 desenho do pagador por pagamento", () => {
  it("contém exatamente as oito secções obrigatórias", () => {
    expect(document.match(/^## .+$/gm)).toEqual([
      "## Problema",
      "## O que já existe",
      "## Modelo proposto",
      "## Coerência com D-ERP290, #385 e #386",
      "## Proposta de DDL (texto, não aplicada)",
      "## Backfill e efeito na cobertura",
      "## Questões para o Pedro",
      "## Fora de âmbito",
    ]);
  });

  it.each([
    "D-ERP290",
    "154.275,00",
    "53.720,00",
    "paying_partner_id",
    "não aplicada",
  ])("preserva a referência obrigatória %s", (reference) => {
    expect(document).toContain(reference);
  });
});
