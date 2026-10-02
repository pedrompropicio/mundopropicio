// Biblioteca partilhada pelo gerador do índice de memória e pelo teste que o trava.
// O índice .lovable/memory/index.md é DERIVADO: nunca se edita à mão, exceto a
// secção "Por onde começar" entre os marcadores START_MARK / END_MARK.
import fs from "node:fs";
import path from "node:path";

export const MEMORY_DIR = ".lovable/memory";
export const INDEX_FILE = path.join(MEMORY_DIR, "index.md");
export const START_MARK = "<!-- por-onde-comecar:inicio (escrito à mão; o gerador preserva) -->";
export const END_MARK = "<!-- por-onde-comecar:fim -->";
export const GEN_COMMAND = "node scripts/gen-memory-index.mjs";

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return fm;
}

/** Lista os ficheiros de memória (sem o índice), com frontmatter e chave mem://. */
export function listMemoryFiles(root = process.cwd()) {
  const base = path.join(root, MEMORY_DIR);
  return walk(base)
    .filter((p) => path.resolve(p) !== path.resolve(path.join(root, INDEX_FILE)))
    .map((p) => {
      const rel = path.relative(base, p).split(path.sep).join("/");
      const key = rel.replace(/\.md$/, "");
      const fm = parseFrontmatter(fs.readFileSync(p, "utf8"));
      return { file: path.join(MEMORY_DIR, rel), key, folder: key.includes("/") ? key.split("/")[0] : "(raiz)", fm };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function readManualSection(indexText) {
  const s = indexText.indexOf(START_MARK);
  const e = indexText.indexOf(END_MARK);
  if (s === -1 || e === -1 || e < s) return "";
  return indexText.slice(s + START_MARK.length, e).trim();
}

export function buildIndex(files, manual) {
  const lines = [
    "# Project Memory",
    "",
    `> Ficheiro GERADO por \`${GEN_COMMAND}\`. Não editar à mão fora da secção "Por onde começar".`,
    "> Um ficheiro de memória novo só aparece aqui depois de correr o script (o teste memory-index trava).",
    "",
    "## Por onde começar",
    "",
    START_MARK,
    manual,
    END_MARK,
    "",
  ];
  const folders = [...new Set(files.map((f) => f.folder))].sort();
  for (const folder of folders) {
    lines.push(`## ${folder}`, "");
    for (const f of files.filter((x) => x.folder === folder)) {
      const name = f.fm?.name ?? f.key;
      const desc = f.fm?.description ?? "";
      lines.push(`- [${name}](mem://${f.key}) — ${desc}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Chaves mem:// referidas nas linhas geradas (fora da secção manual). */
export function indexedKeys(indexText) {
  const e = indexText.indexOf(END_MARK);
  const body = e === -1 ? indexText : indexText.slice(e);
  return [...body.matchAll(/\]\(mem:\/\/([^)]+)\)/g)].map((m) => m[1]);
}
