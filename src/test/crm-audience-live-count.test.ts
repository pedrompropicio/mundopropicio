/** D-ERP277 — audiências filtram e contam pelo critério atual na base. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURES, ALL_FEATURE_KEYS } from "@/lib/features";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("D-ERP277 listas por critério atual", () => {
  const list = read("src/pages/crm-admin/contactos/ContactosList.tsx");
  const query = read("src/pages/crm-admin/contactos/contactsQuery.ts");
  it("tabela e CSV usam a RPC crm_contacts_by_audience", () => {
    expect(query).toContain('"crm_contacts_by_audience"');
    expect(list).toContain("fetchAudiencePage");
    expect(list).toContain("exportContactsCsv(filters, currentList?.name ?? \"todos\", listaId)");
  });
  it("seletor mostra live_count, não o snapshot", () => {
    expect(list).toContain("l.live_count");
    expect(list).not.toContain("sem snapshot");
  });
  it("chave exclusiva crm-coala-eb27 registada", () => {
    expect(FEATURES.CRM_COALA_EB27).toBe("crm-coala-eb27");
    expect(ALL_FEATURE_KEYS).toContain("crm-coala-eb27");
  });
});
