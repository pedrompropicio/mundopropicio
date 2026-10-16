// #321 — a ingestão interna não pode fazer rede, montar payload Meta nem
// abrir a fila CAPI. Verificação estática do corpo SQL versionado.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "drizzle/migrations");
const file = readdirSync(dir).find((f) => f.includes("issue321_crm_ingest_lead_captures"));
const sql = (file ? readFileSync(join(dir, file), "utf8") : "").replace(/--[^\n]*/g, "");

describe("#321 crm_ingest_lead_captures", () => {
  it("migração versionada existe", () => expect(file).toBeTruthy());
  it("sem rede nem CAPI", () => {
    expect(sql).not.toMatch(/net\.http_post|http_request|pixel_id|event_name|capi_dispatch_control/i);
  });
  it("leads novos nascem bloqueados para CAPI", () => {
    expect(sql).toContain("'blocked_no_consent'");
  });
  it("clube_newgang fora do âmbito e sem fallback para MP", () => {
    expect(sql).not.toMatch(/'clube_newgang'\s*[,\]]/);
    expect(sql).not.toMatch(/COALESCE\(lc\.company_id/i);
  });
  it("convite Coala sem interação (D-ERP276)", () => {
    expect(sql).toContain("lc.source = 'coala_early_bird_invite'");
  });
  it("só service_role executa", () => {
    expect(sql).toMatch(/REVOKE ALL .* FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE .* TO service_role/);
  });
});
