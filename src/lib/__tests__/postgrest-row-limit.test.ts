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

/**
 * Devolve o encadeamento a partir de `start` (o `.from(`) até ao FIM DO
 * STATEMENT: o `;` ao nível de topo, uma vírgula ao nível de topo, um fecho de
 * parêntesis/chaveta que já não é nosso, ou um novo `.from(`.
 */
function forwardChain(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) return src.slice(start, i);
      depth--;
    } else if (depth === 0 && (ch === ";" || ch === ",")) return src.slice(start, i);
    else if (i > start && depth === 0 && src.startsWith(".from(", i)) return src.slice(start, i);
  }
  return src.slice(start);
}

function scanFile(file: string): Offence[] {
  const src = readFileSync(file, "utf8");
  const offences: Offence[] = [];
  const fromRe = /\.from\(\s*(["'`])([A-Za-z0-9_.]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(src))) {
    const table = m[2].replace(/^(public|crm)\./, "");
    if (!WATCHED.has(table)) continue;

    // Encadeamento = SÓ o desta query.
    // Para trás, até ao limite do statement, para reconhecer o embrulho
    // `fetchAllPagedQuery(supabase.from(...))`.
    const head = src.slice(0, m.index);
    const begin = Math.max(
      head.lastIndexOf(";"),
      head.lastIndexOf(".from("),
      head.lastIndexOf("{"),
      head.lastIndexOf("}"),
    );
    // Para a frente, até ao FIM DO STATEMENT — nunca até ao próximo `.from(`,
    // senão um `.limit(`/`.range(`/`fetchAllPaged` de outra query mais abaixo
    // no mesmo ficheiro dava escape por engano (#206, ResultsAnalysis.tsx).
    const chain = src.slice(begin + 1, m.index) + forwardChain(src, m.index);

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
