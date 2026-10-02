#!/usr/bin/env node
// Regenera .lovable/memory/index.md a partir do frontmatter de .lovable/memory/**/*.md.
// Preserva apenas a secção manual "Por onde começar" (entre marcadores).
import fs from "node:fs";
import { INDEX_FILE, listMemoryFiles, readManualSection, buildIndex } from "./memory-index-lib.mjs";

const current = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, "utf8") : "";
const files = listMemoryFiles();
const missing = files.filter((f) => !f.fm?.name || !f.fm?.description);
fs.writeFileSync(INDEX_FILE, buildIndex(files, readManualSection(current)));
console.log(`index.md regenerado: ${files.length} ficheiros.`);
if (missing.length) {
  console.warn("Sem name/description no frontmatter:");
  for (const f of missing) console.warn(" - " + f.file);
  process.exitCode = 1;
}
