/**
 * Guarda: o frontend nunca remove objetos do bucket `transaction-documents`
 * directamente. Um ficheiro serve N linhas (mesmo file_url); só a edge
 * `delete-transaction-document` conta as referências sem RLS, em todas as
 * empresas. Percorre src/ inteiro, no estilo de postgrest-row-limit.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const EXTS = [".ts", ".tsx", ".js", ".jsx"];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

/** #268: os 10 buckets contabilísticos — `.from("<bucket>")` seguido de `.remove(` (quebras de linha incluídas). */
export const GUARDED_BUCKETS = [
  "transaction-documents", "camarim-documents", "card-documents", "closing-cost-documents",
  "standalone-invoices", "supplier-documents", "ticket-office-settlements",
  "bank-statements", "event-forecast-attachments", "event-ab-attachments",
];
const RE = new RegExp(`\\.from\\(\\s*(["'\`])(${GUARDED_BUCKETS.join("|")})\\1\\s*\\)\\s*\\.remove\\s*\\(`, "g");

describe("sem remoção directa em transaction-documents no frontend", () => {
  const files = walk(join(ROOT, "src")).filter((f) => !f.endsWith("no-direct-transaction-document-remove.test.ts"));

  it("encontra ficheiros para analisar", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("nenhuma chamada directa a .remove nos 10 buckets contabilísticos", () => {
    const offences: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      RE.lastIndex = 0;
      while ((m = RE.exec(src))) {
        const line = src.slice(0, m.index).split("\n").length;
        offences.push(`${f.slice(ROOT.length + 1)}:${line}: ${m[2]} — usa deleteTransactionDocument / deleteStorageObject (storage-delete)`);
      }
    }
    expect(offences.join("\n"), `\n${offences.join("\n")}\n`).toBe("");
  });

  it("a guarda apanha o padrão", () => {
    RE.lastIndex = 0;
    expect(RE.test(`supabase.storage\n  .from("transaction-documents")\n  .remove([p])`)).toBe(true);
    RE.lastIndex = 0;
    expect(RE.test(`supabase.storage.from('bank-statements').remove([p])`)).toBe(true);
    RE.lastIndex = 0;
    expect(RE.test(`supabase.storage.from("implementation-files").remove([p])`)).toBe(false);
  });
});
