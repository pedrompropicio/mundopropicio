import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const guide = readFileSync("docs/guias/guia-posicao-financeira.md", "utf8");
describe("#391 guia", () => {
  it.each(["regras", "a-pagar", "cobertura", "necessidade", "limites"])("tem âncora #%s", (a) => {
    expect(guide).toMatch(new RegExp(`^## .*\\{#${a}\\}\\s*$`, "m"));
  });
  it("usa os valores corrigidos de 28/10/2026", () => {
    expect(guide).toContain("531.934,01");
    expect(guide).toContain("365.397,05");
    expect(guide).not.toContain("532.756,01");
  });
});
