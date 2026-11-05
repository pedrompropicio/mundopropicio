// @vitest-environment node
// Rede inteiramente simulada e PGlite em memória; sem credenciais ou SQL remoto.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";

const IP = "203.0.113.7";
const SALT = "synthetic-salt";
const KEY = `h:${createHash("sha256").update(`${SALT}:${IP}`).digest("hex")}`;
const MIGRATION = "drizzle/migrations/0330_issue647_ip_geo_cache_hash.sql";
const MANUAL = "supabase/manual/0330_issue647_ip_geo_cache_hash.sql";
const ROLLBACK = "supabase/manual/rollback_0330_issue647_ip_geo_cache_hash_comentado.sql";
const GEO = { country: "BR", city: "São Paulo", region: "São Paulo" };

async function setup(options: { salt?: string | null; vault?: unknown; hit?: boolean; expired?: boolean; vaultError?: boolean; putError?: boolean } = {}) {
  vi.resetModules();
  const requests: { url: string; init?: RequestInit }[] = [];
  const env: Record<string, string> = { SUPABASE_URL: "https://backend.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic",
    IPINFO_TOKEN: "synthetic-ipinfo", SONG_LINK_IP_SALT: options.salt === undefined ? SALT : options.salt ?? "" };
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (url.includes("get_vault_secret")) {
      expect(JSON.parse(String(init?.body))).toEqual({ _name: "SONG_LINK_IP_SALT" });
      if (options.vaultError) throw new Error("synthetic vault unavailable");
      return new Response(JSON.stringify(options.vault ?? null));
    }
    if (url.includes("/ip_geo_cache")) {
      if (init?.method === "POST") return new Response(null, { status: options.putError ? 503 : 201 });
      return new Response(JSON.stringify(options.hit ? [{ ...GEO,
        resolved_at: new Date(Date.now() - (options.expired ? 31 * 86400_000 : 1000)).toISOString(),
      }] : []));
    }
    if (url.startsWith("https://ipinfo.io/")) return new Response(JSON.stringify(GEO));
    throw new Error(`unexpected request ${url}`);
  }));
  const { lookupIpGeo } = await import("../../supabase/functions/_shared/geo");
  return { lookupIpGeo, requests, tableRequests: () => requests.filter(r => r.url.includes("/ip_geo_cache")) };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("#647 critério 3 — cache geo só por hash", () => {
  it("GET usa h:sha256(sal:ip) e hit dispensa ipinfo", async () => {
    const r = await setup({ hit: true });
    expect(await r.lookupIpGeo(IP)).toEqual(GEO);
    expect(r.requests).toHaveLength(1);
    const url = new URL(r.requests[0].url);
    expect(url.searchParams.get("ip")).toBe(`eq.${KEY}`);
    expect(JSON.stringify(r.tableRequests())).not.toContain(IP);
    expect(JSON.stringify(r.tableRequests())).not.toContain(SALT);
  });
  it.each([false, true])("miss/expirada (%s): POST usa a mesma chave e conserva geo/TTL", async expired => {
    const r = await setup({ hit: expired, expired });
    expect(await r.lookupIpGeo(IP)).toEqual(GEO);
    const table = r.tableRequests();
    expect(table).toHaveLength(2);
    expect(new URL(table[0].url).searchParams.get("ip")).toBe(`eq.${KEY}`);
    expect(table[1].url).toBe("https://backend.invalid/rest/v1/ip_geo_cache?on_conflict=ip");
    expect(JSON.parse(String(table[1].init?.body))).toEqual({ ip: KEY, ...GEO, resolved_at: expect.any(String) });
    expect(JSON.stringify(table)).not.toContain(IP);
    expect(JSON.stringify(table)).not.toContain(SALT);
  });
  it.each([SALT, [SALT], { get_vault_secret: SALT }])("sal no Vault (%j) coincide com a chave da SLE", async vault => {
    const r = await setup({ salt: null, vault });
    await r.lookupIpGeo(IP);
    expect(new URL(r.tableRequests()[0].url).searchParams.get("ip")).toBe(`eq.${KEY}`);
    expect(JSON.parse(String(r.tableRequests()[1].init?.body)).ip).toBe(KEY);
  });
  it.each([null, "", [], [null], {}])("sem sal (%j) nunca lê nem escreve a tabela", async vault => {
    const r = await setup({ salt: null, vault });
    expect(await r.lookupIpGeo(IP)).toEqual(GEO);
    expect(r.tableRequests()).toEqual([]);
  });
  it("falha de Vault dispensa cache sem gravar IP", async () => {
    const r = await setup({ salt: null, vaultError: true });
    expect(await r.lookupIpGeo(IP)).toEqual(GEO);
    expect(r.tableRequests()).toEqual([]);
  });
  it("falha de escrita da cache conserva resultado do lookup", async () => {
    const r = await setup({ putError: true });
    expect(await r.lookupIpGeo(IP)).toEqual(GEO);
    expect(JSON.parse(String(r.tableRequests()[1].init?.body)).ip).toBe(KEY);
  });
});

describe("#647 critério 4 — migração 0330 preparada", () => {
  it("manual é cópia byte a byte; rollback integralmente comentado e sem recuperação de IPs", () => {
    expect(readFileSync(MANUAL)).toEqual(readFileSync(MIGRATION));
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain("Classe R2 — PREPARADA, NÃO APLICADA");
    expect(sql).toContain("depois do deploy da SLE e do geo.ts novos");
    expect(sql).toContain("GET DIAGNOSTICS removed = ROW_COUNT");
    expect(sql).toContain("NOT VALID");
    expect(sql).toContain("VALIDATE CONSTRAINT ip_geo_cache_hash_key_check");
    expect(sql).not.toMatch(/song_link_events|cron\./i);
    const rollback = readFileSync(ROLLBACK, "utf8");
    expect(rollback.split("\n").filter(line => line.trim()).every(line => line.startsWith("--"))).toBe(true);
    expect(rollback).toContain("DROP CONSTRAINT IF EXISTS ip_geo_cache_hash_key_check");
    expect(rollback).toContain("COMMENT ON COLUMN public.ip_geo_cache.ip IS NULL");
    expect(rollback).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
  });
  it("DO percorre mais de um lote, retém só h: e valida CHECK", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE public.ip_geo_cache (ip text PRIMARY KEY, country text, city text, region text,
        resolved_at timestamptz NOT NULL DEFAULT now());
        INSERT INTO public.ip_geo_cache(ip) SELECT 'legacy:' || n FROM generate_series(1, 10005) n;
        INSERT INTO public.ip_geo_cache(ip) VALUES ('203.0.113.7'), ('2001:db8::1'), ('h:keep'), ('h:second');`);
      await db.exec(readFileSync(MIGRATION, "utf8"));
      expect((await db.query("SELECT ip FROM public.ip_geo_cache ORDER BY ip")).rows).toEqual([{ ip: "h:keep" }, { ip: "h:second" }]);
      expect((await db.query("SELECT convalidated FROM pg_constraint WHERE conname = 'ip_geo_cache_hash_key_check'")).rows).toEqual([{ convalidated: true }]);
      await expect(db.exec("INSERT INTO public.ip_geo_cache(ip) VALUES ('198.51.100.1')")).rejects.toThrow(/ip_geo_cache_hash_key_check/);
      await expect(db.exec("INSERT INTO public.ip_geo_cache(ip) VALUES ('h:new')")).resolves.toBeDefined();
      expect((await db.query("SELECT col_description('public.ip_geo_cache'::regclass, 1) AS comment")).rows)
        .toEqual([{ comment: "chave = h:<sha256(sal:ip)>; nunca IP em claro" }]);
    } finally { await db.close(); }
  }, 30_000);
});
