import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  PAYMENT_METHODS, BR_PAYMENT_METHODS, BOLETO_FIELDS_MESSAGE,
  isPaymentMethod, validatePaymentMethodFields,
} from "../payment-methods";
import * as sharedPaymentMethods from "../../../supabase/functions/_shared/payment-methods.ts";

// O teste legado lê apenas os literais PT da lista; este avalia também os spreads
// e o handler real, sem importar Deno nem permitir rede, credenciais ou SQL.
const edgeSource = readFileSync("supabase/functions/update-transaction/index.ts", "utf8");
const edgeCode = ts.transpileModule(edgeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function edgeFixture(stored: Record<string, unknown> = {}) {
  let handler: (req: Request) => Promise<Response>;
  const writes = vi.fn();
  const transaction = { id: "tx", company_id: "company", status: "pending", payment_method: "transfer", ...stored };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "actor", user_metadata: {} } }, error: null }) },
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => {
      const data = table === "transactions" ? transaction
        : table === "user_roles" ? [{ role: "admin" }]
        : table === "profiles" ? { company_id: "company" } : [];
      const result = { data, error: null };
      const q = {
        select: () => q, eq: () => q, in: () => q,
        single: async () => result, maybeSingle: async () => result,
        update: (value: unknown) => { writes(table, value); return q; },
        insert: (value: unknown) => { writes(table, value); return q; },
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return q;
    },
  };
  const exports: { PAYMENT_METHODS?: readonly string[] } = {};
  runInNewContext(edgeCode, {
    exports, Response, console,
    Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "inert-fixture" } },
    require: (name: string) => {
      if (name === "npm:@supabase/supabase-js@2") return { createClient: () => client };
      if (name === "../_shared/paging.ts") return { fetchAllPagedQuery: async () => ({ data: [] }) };
      if (name === "../_shared/payment-methods.ts") return sharedPaymentMethods;
      throw new Error(`Importação não autorizada: ${name}`);
    },
  });
  return {
    methods: Array.from(exports.PAYMENT_METHODS!), writes,
    update: (updates: Record<string, unknown>) => handler!(new Request("https://fixture.invalid", {
      method: "POST", headers: { Authorization: "Bearer inert-fixture" },
      body: JSON.stringify({ transaction_id: "tx", updates }),
    })),
  };
}

describe("#498 — domínio e validação reais de update-transaction", () => {
  it("frontend e edge aceitam os mesmos sete valores, na ordem canónica", () => {
    const { methods } = edgeFixture();
    expect(methods).toEqual(["transfer", "service_payment", "direct_debit", "state_payment", "compensation", "pix", "boleto"]);
    expect(methods).toEqual([...new Set([...PAYMENT_METHODS, ...BR_PAYMENT_METHODS])]);
    for (const value of [...methods, "PIX", "cash", "", null, 1]) {
      expect(isPaymentMethod(value)).toBe(typeof value === "string" && methods.includes(value));
    }
  });

  const references = [null, "", "1".repeat(46), "0".repeat(47), "0".repeat(48), "1".repeat(49),
    ` ${"1".repeat(47)}`, `${"1".repeat(47)} `, `${"1".repeat(47)}\n`, `${"1".repeat(47)}\r\n`,
    `a${"1".repeat(46)}`, "１".repeat(47), "1".repeat(23) + " " + "1".repeat(23)];
  it.each(references)("o contrato do boleto exige só 47/48 dígitos ASCII: %j", reference => {
    const valid = reference === "0".repeat(47) || reference === "0".repeat(48);
    expect(validatePaymentMethodFields({ payment_method: "boleto", payment_reference: reference }))
      .toBe(valid ? null : BOLETO_FIELDS_MESSAGE);
  });
  it.each(references)("boleto %j tem a mesma decisão e mensagem no handler e frontend", async reference => {
    const edge = edgeFixture();
    const updates = { payment_method: "boleto", payment_reference: reference };
    const expected = validatePaymentMethodFields(updates);
    const response = await edge.update(updates);
    expect(response.status).toBe(expected ? 400 : 200);
    if (expected) {
      expect(await response.json()).toEqual({ error: BOLETO_FIELDS_MESSAGE });
      expect(edge.writes).not.toHaveBeenCalled();
    } else expect(edge.writes).toHaveBeenCalledWith("transactions", updates);
  });

  it("valida o valor efetivo em alterações parciais e não bloqueia descrições antigas", async () => {
    const edge = edgeFixture({ payment_method: "boleto", payment_reference: "1".repeat(47) });
    expect((await edge.update({ payment_reference: "1".repeat(46) })).status).toBe(400);
    expect((await edge.update({ payment_entity: null })).status).toBe(200);
    expect((await edgeFixture({ payment_reference: "1".repeat(48) }).update({ payment_method: "boleto" })).status).toBe(200);
    const invalid = edgeFixture({ payment_method: "boleto", payment_reference: null });
    expect((await invalid.update({ payment_entity: "" })).status).toBe(400);
    expect((await invalid.update({ description: "edição permitida" })).status).toBe(200);
  });

  it("aceita Pix sem referência e recusa métodos fora do domínio antes de escrever", async () => {
    const edge = edgeFixture({ payment_method: "boleto", payment_reference: null });
    expect((await edge.update({ payment_method: "pix" })).status).toBe(200);
    for (const payment_method of ["PIX", "cash", ""]) {
      const invalid = edgeFixture();
      expect((await invalid.update({ payment_method })).status).toBe(400);
      expect(invalid.writes).not.toHaveBeenCalled();
    }
  });

  it.each([["10611", "123456789"], [" 10611 ", " 123456789 "], ["1061", "123456789"], ["10611", null]])(
    "mantém a regra MB e a mensagem PT: %j / %j", async (payment_entity, payment_reference) => {
      const updates = { payment_method: "service_payment", payment_entity, payment_reference };
      const expected = validatePaymentMethodFields(updates);
      const response = await edgeFixture().update(updates);
      expect(response.status).toBe(expected ? 400 : 200);
      if (expected) expect(await response.json()).toEqual({ error: expected });
    },
  );
});

describe("#498 — preparação 0305, sem executar SQL", () => {
  const sql = readFileSync("drizzle/migrations/0305_issue498_supplier_columns_acl.sql", "utf8");
  const [forward, rollback] = sql.split("-- ROLLBACK COMENTADO");

  it("tem cópia manual byte-idêntica e documenta os objetos e migrações de origem", () => {
    expect(sql).toBe(readFileSync("supabase/manual/0305_issue498_supplier_columns_acl.sql", "utf8"));
    for (const source of ["20260819174233_d18ca020-c68d-4cb5-8868-bc3ea9f550c4.sql",
      "20260820110300_8d3e952c-1cd0-4229-9ecc-f022a95904a8.sql",
      "20260820123647_3c8bae6d-6f1b-424d-afb9-182fabf93183.sql",
      "20260911000848_829d57de-eff8-4584-96e2-db36cc0888fa.sql",
      "public.can_view_supplier_bank_data()", "PREPARAÇÃO"]) expect(forward).toContain(source);
  });

  it("acrescenta só os três campos à RPC e mantém o corpo e guardas anteriores", () => {
    const source = readFileSync("supabase/migrations/20260819174233_d18ca020-c68d-4cb5-8868-bc3ea9f550c4.sql", "utf8");
    const original = source.split("-- 3) Single read path for bank data: role check + tenant isolation.\n")[1]
      .split("\nREVOKE EXECUTE")[0].trim();
    const prepared = forward.slice(forward.indexOf("CREATE OR REPLACE FUNCTION"), forward.indexOf("\n\n-- Fechar"));
    expect(prepared.replace("  swift_bic_3 text,\n  foreign_bank_accounts jsonb,\n  tax_id_foreign text,\n  tax_id_type text\n", "  swift_bic_3 text\n")
      .replace("s.iban_3, s.swift_bic_3,\n         s.foreign_bank_accounts, s.tax_id_foreign, s.tax_id_type\n", "s.iban_3, s.swift_bic_3\n")).toBe(original);
    const uncommented = rollback.split("\n").slice(1).map(line => line.replace(/^-- ?/, "")).join("\n");
    expect(uncommented).toContain(original);
    expect(rollback.split("\n").slice(1).filter(Boolean).every(line => line.startsWith("--"))).toBe(true);
  });

  it("conserva owner/ACL e só dá SELECT cadastral e de conta a authenticated", () => {
    const statements = forward.split("\n").filter(line => !line.startsWith("--")).join("\n");
    expect(statements).toContain("DROP FUNCTION public.get_supplier_bank_details(uuid[]) RESTRICT;");
    expect(statements).toContain("SELECT proowner, proacl");
    expect(statements).toContain("ALTER FUNCTION public.get_supplier_bank_details(uuid[]) OWNER TO %I");
    expect(statements).toContain("acldefault('f', v_owner)");
    expect(statements).toContain("WITH GRANT OPTION");
    expect(statements.match(/GRANT SELECT[^;]+;/g)).toEqual([
      "GRANT SELECT (tax_id_foreign, tax_id_type) ON public.suppliers TO authenticated;",
      "GRANT SELECT (bank_details_br) ON public.financial_accounts TO authenticated;",
    ]);
    expect(statements).not.toMatch(/CASCADE|CREATE POLICY|ALTER POLICY|^\s*(INSERT|UPDATE|DELETE)\s/im);
  });
});
