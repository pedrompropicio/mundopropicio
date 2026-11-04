import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const doc = readFileSync("docs/estudos/socios-e-pagadores/385-aportes-partner-id.md", "utf8");
const sections = [
  "Problema",
  "O que já existe",
  "Opções",
  "Proposta de DDL (texto, não aplicada)",
  "Plano de backfill — H&K Madrid",
  "Efeito na cobertura",
  "Questões para o Pedro",
  "Fora de âmbito",
];

describe("#385 E2b — desenho dos aportes por sócio", () => {
  it("contém exatamente as oito secções obrigatórias", () => {
    expect(doc.match(/^## .+$/gm)).toEqual(sections.map((section) => `## ${section}`));
  });

  it.each(["353.810,51", "414.677,65", "249.000,00", "partner_capital_moves", "não aplicada"])(
    "preserva a referência obrigatória %s",
    (reference) => {
      expect(doc).toContain(reference);
    },
  );
});
