// @vitest-environment node
// Guarda estrutural (D-ERP328 corretivo): o Promise.all de index.ts tinha a
// desestruturação desalinhada com o array (futureCoverage/participations
// trocados), o que derrubava a edge function com 500 em Live. Este teste lê o
// fonte e verifica que cada nome desestruturado corresponde ao loader na mesma
// posição do array.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = readFileSync("supabase/functions/financial-position/index.ts", "utf8");

// Mapeamento obrigatório nome desestruturado → loader esperado na mesma posição.
const EXPECTED: Array<[string, string]> = [
  ["structure", "loadStructure("],
  ["paidContracts", "loadPaidContracts("],
  ["participations", "loadParticipations("],
  ["futureCoverage", "loadIndependentFutureCoverage("],
];

function extractPromiseAllBlock(src: string): { names: string[]; entries: string[] } {
  const m = src.match(/const \[([^\]]+)\] = await Promise\.all\(\[([\s\S]*?)\n\s*\]\);/);
  if (!m) throw new Error("bloco Promise.all não encontrado em index.ts");
  const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  // Entradas do array: uma por linha de chamada (comentários ignorados).
  const entries = m[2]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .map((l) => l.replace(/,$/, ""));
  return { names, entries };
}

describe("financial-position index.ts — correspondência nome↔posição no Promise.all", () => {
  it("cada nome desestruturado casa com o loader na mesma posição do array", () => {
    const { names, entries } = extractPromiseAllBlock(SRC);
    expect(names.length).toBe(EXPECTED.length);
    for (let i = 0; i < EXPECTED.length; i++) {
      const [name, loader] = EXPECTED[i];
      expect(names[i], `posição ${i}: nome`).toBe(name);
      expect(entries[i], `posição ${i}: ${name} deve vir de ${loader}`).toContain(loader);
    }
  });

  it("o 5.º elemento (workers dos eventos) não é desestruturado para uma variável errada", () => {
    const { names, entries } = extractPromiseAllBlock(SRC);
    expect(entries.length).toBe(names.length + 1);
    expect(entries[entries.length - 1]).toContain("Promise.all(");
  });
});
