// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0335_issue664_supplier_country_required.sql");
const manual = readFileSync("supabase/manual/0335_issue664_supplier_country_required.sql");
const rollback = readFileSync("supabase/manual/rollback_0335_issue664_supplier_country_required_comentado.sql", "utf8");
const split = migration.indexOf("-- PARTE 2 —");
const part1 = migration.subarray(0, split);
const part2 = migration.subarray(split).toString("utf8");
const executable = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("#664c — PARTE 2 preserva o CHECK de país da 0104", () => {
  it("mantém as duas cópias da 0335 byte a byte iguais", () => {
    expect(manual).toEqual(migration);
  });

  it("mantém o md5 da PARTE 1 já aplicada, incluindo o cabeçalho", () => {
    expect(split).toBeGreaterThan(0);
    expect(createHash("md5").update(part1).digest("hex"))
      .toBe("6e395b5dc30487a7a53b032de0fde392");
  });

  it("documenta o CHECK existente e não acrescenta, valida ou remove constraints na PARTE 2", () => {
    const historical = readFileSync("drizzle/migrations/0104_0104_derp_246_partner_country_and_refund.sql", "utf8");
    expect(executable(historical)).toContain("ADD CONSTRAINT suppliers_country_iso2 CHECK (country ~ '^[A-Z]{2}$')");
    expect(part2).toMatch(/^-- .*suppliers_country_iso2.*0104/m);
    expect(executable(part2)).not.toMatch(/\b(?:ADD|VALIDATE|DROP)\s+CONSTRAINT\b/i);
    expect(part2).not.toContain("suppliers_country_iso2_check");
  });

  it("conserva a precondição NOT NULL/sem DEFAULT e retira o trigger e a função de fallback", () => {
    const precondition = /DO \$country_precondition\$[\s\S]*?\$country_precondition\$;/;
    const originalGuard = part1.toString("utf8").match(precondition)?.[0];
    expect(originalGuard).toBeDefined();
    expect(part2.match(precondition)?.[0]).toBe(originalGuard);
    const sql = executable(part2);
    expect(sql).toContain("DROP TRIGGER suppliers_default_country_trigger ON public.suppliers;");
    expect(sql).toContain("DROP FUNCTION public.suppliers_default_country();");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER\s+TABLE)\b/i);
  });

  it("mantém o rollback comentado sem remover o CHECK da 0104 nem o duplicado retirado", () => {
    expect(rollback.split("\n").filter(line => line.trim()).every(line => line.startsWith("--"))).toBe(true);
    const sql = executable(rollback.replace(/^-- ?/gm, ""));
    expect(sql).not.toMatch(/\b(?:ADD|VALIDATE|DROP)\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?suppliers_country_iso2(?:_check)?\b/i);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.suppliers_default_country()");
    expect(sql).toContain("CREATE TRIGGER suppliers_default_country_trigger");
  });
});
