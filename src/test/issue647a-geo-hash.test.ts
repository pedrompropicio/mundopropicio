// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/_shared/geo.ts", "utf8").replace(/^export /gm, "");
const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;
const IP = "203.0.113.7";
const SALT = "synthetic-salt";
const KEY = "h:" + createHash("sha256").update(`${SALT}:${IP}`).digest("hex");
const geo = { country: "BR", city: "Fortaleza", region: "Ceará" };

function harness(options: { envSalt?: string | null; vault?: unknown; vaultFails?: boolean; hit?: boolean } = {}) {
  const calls: { url: string; method: string; body: any }[] = [];
  const env: Record<string, string> = { SUPABASE_URL: "https://backend.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic",
    IPINFO_TOKEN: "synthetic-ipinfo", SONG_LINK_IP_SALT: options.envSalt === undefined ? SALT : options.envSalt ?? "" };
  const module = new Function("Deno", "fetch", `${compiled}\nreturn { lookupIpGeo };`)(
    { env: { get: (key: string) => env[key] } },
    async (url: string, request: RequestInit = {}) => {
      calls.push({ url, method: request.method ?? "GET", body: request.body ? JSON.parse(String(request.body)) : null });
      if (url.includes("get_vault_secret")) {
        if (options.vaultFails) throw new Error("synthetic vault failure");
        return new Response(JSON.stringify(options.vault ?? null));
      }
      if (url.includes("/ip_geo_cache")) return new Response(JSON.stringify(options.hit ? [{ ...geo, resolved_at: new Date().toISOString() }] : []));
      if (url.startsWith("https://ipinfo.io/")) return new Response(JSON.stringify(geo));
      throw new Error(`unexpected fake URL ${url}`);
    });
  return { calls, lookup: module.lookupIpGeo as (ip: string) => Promise<typeof geo> };
}

describe("#647 critério 3 — geo.ts mantém API e só usa chaves hash", () => {
  it("GET e POST usam a mesma chave h:<sha256(sal:ip)> da SLE", async () => {
    const { lookup, calls } = harness();
    expect(await lookup(IP)).toEqual(geo);
    const table = calls.filter(call => call.url.includes("/ip_geo_cache"));
    expect(table).toHaveLength(2);
    expect(new URL(table[0].url).searchParams.get("ip")).toBe(`eq.${KEY}`);
    expect(table[1].body).toMatchObject({ ip: KEY, ...geo });
    expect(JSON.stringify(table)).not.toContain(IP);
    expect(JSON.stringify(table)).not.toContain(SALT);
    expect(calls.some(call => call.url.includes("ipinfo.io"))).toBe(true);
  });
  it("hit por hash mantém o comportamento da cache e não chama ipinfo", async () => {
    const { lookup, calls } = harness({ hit: true });
    expect(await lookup(IP)).toEqual(geo);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).searchParams.get("ip")).toBe(`eq.${KEY}`);
  });
  it.each([SALT, [SALT], { get_vault_secret: SALT }])("resolve o mesmo sal pelo Vault (%j)", async vault => {
    const { lookup, calls } = harness({ envSalt: null, vault });
    await lookup(IP);
    expect(calls[0].body).toEqual({ _name: "SONG_LINK_IP_SALT" });
    expect(calls.filter(call => call.url.includes("get_vault_secret"))).toHaveLength(1);
    const table = calls.filter(call => call.url.includes("/ip_geo_cache"));
    expect(new URL(table[0].url).searchParams.get("ip")).toBe(`eq.${KEY}`);
    expect(table[1].body.ip).toBe(KEY);
    expect(JSON.stringify(table)).not.toContain(IP);
  });
  it.each([{}, { vault: "" }, { vault: [] }, { vaultFails: true }])("sem sal nunca lê/escreve a tabela (%j)", async extra => {
    const { lookup, calls } = harness({ envSalt: null, ...extra });
    expect(await lookup(IP)).toEqual(geo);
    expect(calls.filter(call => call.url.includes("/ip_geo_cache"))).toHaveLength(0);
    expect(calls.filter(call => call.url.includes("ipinfo.io"))).toHaveLength(1);
  });
});

const migrationPath = "drizzle/migrations/0330_issue647_ip_geo_cache_hash.sql";
const migration = readFileSync(migrationPath, "utf8");
describe("#647 critério 4 — migração preparada, ensaio só PGlite isolado", () => {
  it("manual é cópia byte a byte e o rollback é só comentado", () => {
    expect(readFileSync("supabase/manual/0330_issue647_ip_geo_cache_hash.sql")).toEqual(readFileSync(migrationPath));
    const rollback = readFileSync("supabase/manual/rollback_0330_issue647_ip_geo_cache_hash_comentado.sql", "utf8");
    expect(rollback.split("\n").every(line => !line.trim() || line.startsWith("--"))).toBe(true);
    expect(rollback).toContain("DROP CONSTRAINT IF EXISTS ip_geo_cache_hash_key_check");
    expect(rollback).toContain("COMMENT ON COLUMN public.ip_geo_cache.ip IS NULL");
    expect(migration).toContain("Classe R2 — PREPARADA, NÃO APLICADA");
    expect(migration).toContain("DEPOIS do deploy da SLE");
    expect(migration).toContain("GET DIAGNOSTICS deleted_count = ROW_COUNT");
  });
  it("apaga só IPs antigos em mais de um lote, valida CHECK e rejeita novos IPs em claro", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE public.ip_geo_cache (ip text PRIMARY KEY, country text);
        INSERT INTO public.ip_geo_cache VALUES ('${KEY}', 'BR'), ('h:legacy-hash', 'DE');
        INSERT INTO public.ip_geo_cache SELECT '192.0.' || n, 'PT' FROM generate_series(1, 10003) n;`);
      await db.exec(migration);
      expect((await db.query("SELECT ip FROM public.ip_geo_cache ORDER BY ip")).rows).toEqual([{ ip: KEY }, { ip: "h:legacy-hash" }]);
      expect((await db.query("SELECT convalidated FROM pg_constraint WHERE conname = 'ip_geo_cache_hash_key_check'")).rows)
        .toEqual([{ convalidated: true }]);
      expect((await db.query("SELECT col_description('public.ip_geo_cache'::regclass, 1) AS description")).rows)
        .toEqual([{ description: "chave = h:<sha256(sal:ip)>; nunca IP em claro" }]);
      await expect(db.exec("INSERT INTO public.ip_geo_cache (ip) VALUES ('203.0.113.8')")).rejects.toMatchObject({ code: "23514" });
      await db.exec("INSERT INTO public.ip_geo_cache (ip) VALUES ('h:new-hash')");
      expect((await db.query("SELECT count(*)::integer AS count FROM public.ip_geo_cache")).rows).toEqual([{ count: 3 }]);
    } finally {
      await db.close();
    }
  }, 20000);
});
