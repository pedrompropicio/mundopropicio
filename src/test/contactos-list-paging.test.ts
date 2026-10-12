/** #308 — Contactos não pode voltar a ler `contacts` com .limit(1000) nem filtrar no cliente. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeSearch } from "@/pages/crm-admin/contactos/contactsQuery";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("#308 Contactos paginado no servidor", () => {
  const list = read("src/pages/crm-admin/contactos/ContactosList.tsx");
  const query = read("src/pages/crm-admin/contactos/contactsQuery.ts");

  it("sem .limit(1000) nem .from('contacts') directo no ecrã", () => {
    expect(list).not.toMatch(/\.limit\(\s*1000\s*\)/);
    expect(query).not.toMatch(/\.limit\(\s*1000\s*\)/);
    expect(list).not.toMatch(/\.from\(\s*["']contacts["']/);
  });

  it("página com total exacto, range e lista via audience_members", () => {
    expect(query).toContain('count: "exact"');
    expect(query).toContain(".range(");
    expect(query).toContain("audience_members!inner");
    expect(query).toContain("fetchAllPagedQuery");
    expect(list).toContain("crm_contact_sources");
  });

  it("pesquisa saneada para .or()", () => {
    expect(sanitizeSearch(" a,b(c)*% ")).toBe("a b c");
  });
});
