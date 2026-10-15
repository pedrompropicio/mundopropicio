// Issue #320 — diagnósticos HTTP/logs não podem expor fragmentos de segredos nem respostas do Vault.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMissingTokenDiag } from "../../supabase/functions/_shared/capi-guard";

const FILES = ["capi-meta-events", "process-leads-capi", "process-lead-capture", "process-redirect-log"]
  .map((f) => `supabase/functions/${f}/index.ts`);

describe("buildMissingTokenDiag", () => {
  it("só expõe chaves seguras e tipos primitivos", () => {
    const d = buildMissingTokenDiag({ srkPresent: true, supabaseUrlPresent: true, envTokenPresent: false, rpcHttpStatus: 200, fetchFailed: false });
    expect(Object.keys(d).sort()).toEqual(["env_token_present", "rpc_http_status", "srk_present", "supabase_url_present", "vault_fetch_failed"]);
    for (const v of Object.values(d)) expect(["boolean", "number"]).toContain(typeof v);
  });
  it("um valor de segredo injectado nunca aparece no resultado", () => {
    const secret = "sb_secret_ABCDEFGHIJKLMNOP_EAAB123";
    const d = buildMissingTokenDiag({ srkPresent: secret as any, supabaseUrlPresent: true, envTokenPresent: secret as any, rpcHttpStatus: secret as any, fetchFailed: secret as any });
    const s = JSON.stringify(d);
    expect(s).not.toContain("sb_secret");
    expect(s).not.toContain("EAAB");
  });
});

describe("código-fonte dos 4 consumidores CAPI", () => {
  for (const f of FILES) {
    const src = readFileSync(f, "utf8");
    it(`${f}: sem prefixos/comprimentos de segredo nem preview do corpo do Vault`, () => {
      expect(src).not.toMatch(/srk_prefix|rpc_body_preview|body_preview|token_len|srk_len/);
      expect(src).not.toMatch(/\b(srk|SERVICE_ROLE_KEY|accessToken|_CAPI_TOKEN_BOOT)\s*\.\s*(slice|substring|substr|length)\b/);
      expect(src).not.toMatch(/rawText\s*\.\s*slice/);
    });
  }
});
