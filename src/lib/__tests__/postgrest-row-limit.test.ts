/**
 * Trava para a barreira dos 1.000 registos do PostgREST (#206).
 *
 * O PostgREST devolve no máximo 1.000 linhas por pedido. Uma leitura sem
 * `.range()` numa tabela grande fica truncada EM SILÊNCIO — foi assim que o
 * saldo da Ticketline deu −3,2 M€ (#129) e que o DRE da Mundo Propício perdeu
 * 197 transações (789.161,63 €) a 18/09/2026.
 *
 * Este teste percorre `src/**` e `supabase/functions/**` e falha se encontrar
 * `.from("<tabela grande>")` sem, no mesmo encadeamento, uma destas saídas:
 * `.range(`, `fetchAllPaged`, `.single(`, `.maybeSingle(`, `count:`, `.limit(`
 * ou `.rpc(`. A lista de tabelas vive em `src/lib/postgrest-large-tables.json`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import largeTables from "../postgrest-large-tables.json";

const ROOT = resolve(__dirname, "../../..");
const SCAN_DIRS = ["src", "supabase/functions"];
const EXTS = [".ts", ".tsx"];

const WATCHED = new Set<string>((largeTables as { tables: string[] }).tables);

/** Escapes de paginação aceites no mesmo encadeamento. */
const ESCAPES = [".range(", "fetchAllPaged", ".single(", ".maybeSingle(", "count:", ".limit(", ".rpc("];

/** Escritas — não são leituras truncáveis. */
const WRITES = [".insert(", ".update(", ".upsert(", ".delete("];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

interface Offence {
  file: string;
  line: number;
  table: string;
}

function scanFile(file: string): Offence[] {
  const src = readFileSync(file, "utf8");
  const offences: Offence[] = [];
  const fromRe = /\.from\(\s*(["'`])([A-Za-z0-9_.]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(src))) {
    const table = m[2].replace(/^(public|crm)\./, "");
    if (!WATCHED.has(table)) continue;

    // Encadeamento = daqui até ao próximo `.from(` (ou 4000 caracteres).
    const rest = src.slice(m.index, m.index + 4000);
    const nextFrom = rest.indexOf(".from(", 1);
    const chain = nextFrom > 0 ? rest.slice(0, nextFrom) : rest;

    if (WRITES.some((w) => chain.includes(w))) continue;
    if (ESCAPES.some((e) => chain.includes(e))) continue;

    const line = src.slice(0, m.index).split("\n").length;
    offences.push({ file: file.slice(ROOT.length + 1), line, table });
  }
  return offences;
}

describe("barreira dos 1.000 registos do PostgREST", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).filter(
    (f) => !f.endsWith("postgrest-row-limit.test.ts"),
  );

  it("encontra ficheiros para analisar", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("nenhuma leitura de tabela grande sem paginação", () => {
    const offences = files.flatMap(scanFile);
    const msg = offences
      .map(
        (o) =>
          `${o.file}:${o.line}: .from("${o.table}") sem paginação. ` +
          `Usa fetchAllPaged de src/lib/supabase-paging.ts (com .order("id") no build), ` +
          `ou .range()/.single()/.maybeSingle()/count:/.limit()/RPC de agregação.`,
      )
      .join("\n");
    expect(msg, `\n${msg}\n`).toBe("");
  });
});
