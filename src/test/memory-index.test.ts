// Trava: o índice de memória tem de ser exactamente derivado dos ficheiros.
import fs from "node:fs";
import { describe, it, expect } from "vitest";
// @ts-expect-error módulo .mjs sem tipos
import { INDEX_FILE, GEN_COMMAND, listMemoryFiles, indexedKeys } from "../../scripts/memory-index-lib.mjs";

type MemFile = { file: string; key: string; fm: Record<string, string> | null };
const fix = `Corre \`${GEN_COMMAND}\` para regenerar o índice.`;

describe("índice de memória (.lovable/memory/index.md)", () => {
  const files: MemFile[] = listMemoryFiles();
  const index = fs.readFileSync(INDEX_FILE, "utf8");
  const keys = new Set<string>(indexedKeys(index));

  it("todos os ficheiros têm name e description no frontmatter", () => {
    const bad = files
      .map((f) => {
        const miss = [!f.fm && "frontmatter", f.fm && !f.fm.name && "name", f.fm && !f.fm.description && "description"].filter(Boolean);
        return miss.length ? `${f.file}: falta ${miss.join(", ")}` : null;
      })
      .filter(Boolean);
    expect(bad, `Ficheiros de memória sem frontmatter completo:\n${bad.join("\n")}\nAcrescenta-o (a descrição sai do conteúdo) e ${fix}`).toEqual([]);
  });

  it("todos os ficheiros de memória aparecem no índice", () => {
    const missing = files.filter((f) => !keys.has(f.key)).map((f) => `${f.file} não aparece no índice (mem://${f.key})`);
    expect(missing, `${missing.join("\n")}\n${fix}`).toEqual([]);
  });

  it("o índice não refere ficheiros que já não existem", () => {
    const existing = new Set(files.map((f) => f.key));
    const dead = [...keys].filter((k) => !existing.has(k)).map((k) => `mem://${k} referido no índice mas .lovable/memory/${k}.md não existe`);
    expect(dead, `${dead.join("\n")}\n${fix}`).toEqual([]);
  });
});
