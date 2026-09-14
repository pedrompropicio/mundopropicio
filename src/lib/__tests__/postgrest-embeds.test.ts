/**
 * Trava para o defeito de 14/09/2026: uma FK nova entre `transactions` e
 * `suppliers` tornou ambíguo um embed que já existia (`suppliers(name)`), o
 * PostgREST passou a devolver PGRST201 e o ecrã de Transações ficou vazio para
 * todos os utilizadores.
 *
 * Sempre que existir MAIS DO QUE UMA chave estrangeira entre duas tabelas, o
 * embed tem de nomear a FK (`suppliers!transactions_supplier_id_fkey(...)`).
 * A lista de pares vive em `src/lib/postgrest-ambiguous-pairs.json` e foi
 * apurada em Live a 14/09/2026 com:
 *
 *   select conrelid::regclass::text, confrelid::regclass::text
 *     from pg_constraint
 *    where contype = 'f' and connamespace = 'public'::regnamespace
 *    group by conrelid, confrelid having count(*) > 1;
 *
 * Para atualizar: correr a consulta acima e reescrever o JSON.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import pairs from "../postgrest-ambiguous-pairs.json";

const ROOT = resolve(__dirname, "../../..");
const SCAN_DIRS = ["src", "supabase/functions"];
const EXTS = [".ts", ".tsx"];

/** "a>b" para cada par, em ambos os sentidos. */
const AMBIGUOUS = new Set<string>();
for (const p of pairs as Array<{ from: string; to: string }>) {
  const a = p.from.replace(/^public\./, "");
  const b = p.to.replace(/^public\./, "");
  AMBIGUOUS.add(`${a}>${b}`);
  AMBIGUOUS.add(`${b}>${a}`);
}

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

/** Lê o literal de string que começa em `i` (aspas simples, duplas ou template). */
function readLiteral(src: string, i: number): { value: string; end: number } | null {
  const q = src[i];
  if (q !== '"' && q !== "'" && q !== "`") return null;
  let out = "";
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") {
      out += src[j + 1] ?? "";
      j += 2;
      continue;
    }
    if (c === q) return { value: out, end: j };
    out += c;
    j++;
  }
  return null;
}

/**
 * Pares (tabela-pai, tabela-embutida) sem FK nomeada dentro de uma string de
 * `.select()`. Segue a hierarquia dos parênteses para saber quem é o pai.
 */
function unqualifiedEmbeds(baseTable: string, select: string): Array<{ parent: string; child: string }> {
  const found: Array<{ parent: string; child: string }> = [];
  const stack: string[] = [baseTable];
  const ident = /[A-Za-z0-9_]/;

  let i = 0;
  while (i < select.length) {
    const c = select[i];
    if (c === ")") {
      if (stack.length > 1) stack.pop();
      i++;
      continue;
    }
    if (!ident.test(c)) {
      i++;
      continue;
    }
    // Lê o identificador (que pode ser alias:tabela!fk)
    let j = i;
    while (j < select.length && ident.test(select[j])) j++;
    let name = select.slice(i, j);
    let k = j;
    // alias:tabela
    if (select[k] === ":") {
      k++;
      const s = k;
      while (k < select.length && ident.test(select[k])) k++;
      name = select.slice(s, k);
    }
    // !fk_nomeada
    let qualified = false;
    if (select[k] === "!") {
      qualified = true;
      k++;
      while (k < select.length && ident.test(select[k])) k++;
    }
    // ...!inner / !left não qualificam a FK
    if (qualified) {
      const mod = select.slice(k - 5, k);
      if (/^(inner|left)$/.test(mod.replace(/^[^a-z]*/, ""))) qualified = false;
    }
    if (select[k] === "!") {
      // segundo modificador, ex.: tabela!fk!inner
      const before = select.slice(k);
      const m = /^!([A-Za-z0-9_]+)/.exec(before);
      if (m && !/^(inner|left)$/.test(m[1])) qualified = true;
      k += m ? m[0].length : 1;
    }
    if (select[k] === "(") {
      const parent = stack[stack.length - 1];
      if (!qualified && AMBIGUOUS.has(`${parent}>${name}`)) found.push({ parent, child: name });
      stack.push(name);
      k++;
    }
    i = k > i ? k : i + 1;
  }
  return found;
}

interface Offence {
  file: string;
  parent: string;
  child: string;
}

function scanFile(file: string): Offence[] {
  const src = readFileSync(file, "utf8");
  const offences: Offence[] = [];
  const fromRe = /\.from\(\s*(["'`])([A-Za-z0-9_.]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(src))) {
    const table = m[2].replace(/^public\./, "");
    // A primeira `.select(` depois deste `.from(` na mesma cadeia.
    const rest = src.slice(m.index, m.index + 4000);
    const nextFrom = rest.indexOf(".from(", 1);
    const window = nextFrom > 0 ? rest.slice(0, nextFrom) : rest;
    const selIdx = window.indexOf(".select(");
    if (selIdx < 0) continue;
    let p = m.index + selIdx + ".select(".length;
    while (/\s/.test(src[p])) p++;
    const lit = readLiteral(src, p);
    if (!lit) continue;
    for (const e of unqualifiedEmbeds(table, lit.value)) {
      offences.push({ file: file.slice(ROOT.length + 1), ...e });
    }
  }
  return offences;
}

describe("embeds do PostgREST em pares com FK duplicada", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it("encontra ficheiros para analisar", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("nenhum embed ambíguo sem a FK nomeada", () => {
    const offences = files.filter((f) => !f.endsWith("postgrest-embeds.test.ts")).flatMap(scanFile);
    const msg = offences
      .map(
        (o) =>
          `${o.file}: .from("${o.parent}") embute "${o.child}(" sem nomear a chave estrangeira. ` +
          `Existe mais do que uma FK entre "${o.parent}" e "${o.child}" — escreve ` +
          `"${o.child}:${o.child}!<nome_da_fk>(...)" (ex.: suppliers:suppliers!transactions_supplier_id_fkey(name)).`,
      )
      .join("\n");
    expect(msg, `\n${msg}\n`).toBe("");
  });
});
