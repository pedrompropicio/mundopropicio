import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const studyPath = "docs/estudos/socios-e-pagadores/";
const design = readFileSync(`${studyPath}386-conta-corrente-entre-empresas.md`, "utf8");
const readme = readFileSync(`${studyPath}README.md`, "utf8");

describe("#386 desenho da conta corrente entre empresas", () => {
  it("contém as nove secções obrigatórias na ordem do despacho", () => {
    expect(design.match(/^## .+$/gm)).toEqual([
      "## Problema",
      "## Decisões já tomadas",
      "## O que já existe",
      "## Modelo proposto",
      "## Exemplo — H&K Madrid",
      "## Ligação a #85 e D-ERP246",
      "## Proposta de DDL (texto, não aplicada)",
      "## Questões para o Pedro",
      "## Fora de âmbito",
    ]);
  });

  it.each(["353.810,51", "414.677,65", "D-ERP246", "#85", "D-ERP347", "não aplicada"])(
    "preserva a referência obrigatória %s",
    (reference) => expect(design).toContain(reference),
  );

  it("o README apresenta a família, os desenhos por entregar e o limite de autorização", () => {
    for (const filename of [
      "385-aportes-partner-id.md",
      "384-paid-by-pagamento.md",
      "386-conta-corrente-entre-empresas.md",
    ]) {
      expect(readme).toContain(filename);
    }
    expect(readme).toMatch(/385-aportes-partner-id\.md.*por entregar/);
    expect(readme).toMatch(/384-paid-by-pagamento\.md.*por entregar/);
    expect(readme).toContain("Nada nesta pasta autoriza implementar");
    expect(readme.trimEnd().split("\n").length).toBeLessThanOrEqual(15);
  });
});
