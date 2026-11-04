// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as zone from "../../supabase/functions/_shared/protected-zone";
import * as appOpen from "../../supabase/functions/song-link-event/app-open";
import * as consent from "../../supabase/functions/song-link-event/consent";
import * as ssr from "../../supabase/functions/song-link-event/ssr";
import * as ab from "../../supabase/functions/song-link-event/ab-variant";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const ARRIVAL_ID = "00000000-0000-4000-8000-000000000001";
const IP = "203.0.113.7";
const SALT = "synthetic-salt";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const IP_HASH = sha(`${SALT}:${IP}`);
const SOURCE = readFileSync("supabase/functions/song-link-event/index.ts", "utf8");
const compile = (source: string) => transformSync(source.replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, ""),
  { loader: "ts", format: "cjs" }).code;
const COMPILED = compile(SOURCE);

type Options = {
  country?: string | null; cacheCountry?: string | null; memoryCountry?: string;
  rpcCountry?: string | null; rpcCity?: string | null; rpcError?: boolean; expiredCache?: boolean;
  event?: "arrival" | "choice" | "app_open"; duplicate?: "recover" | "enrich";
  ssr?: boolean; noSalt?: boolean; eventId?: string; ip?: string;
  mode?: string; compiled?: string; consent?: "granted";
};

async function runtime(options: Options = {}) {
  const sent: { url: string; body: unknown }[] = [];
  const writes: { table: string; op: string; value: any }[] = [];
  const reads: { table: string; filters: Record<string, unknown> }[] = [];
  const rpcs: { name: string; args: any }[] = [];
  const calls: string[] = [];
  const secrets: string[] = [];
  const abInputs: Parameters<typeof ab.abVariantFor>[0][] = [];
  const arrival = { id: "arrival-row", origin: "ssr", link_id: "link-a", event: "arrival", mode: null,
    created_at: new Date(NOW - 60_000).toISOString(), fbclid: "arrival-fb", ttclid: "arrival-tt" };
  const link = { id: "link-a", company_id: "company-a", artist_id: "artist-a", song_id: "song-a",
    active: true, destinations: { spotify: { app: "spotify:track:synthetic" } },
    title: "Synthetic song", meta_pixel_id: "meta-test", tiktok_pixel_id: "tt-test" };
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let write = false;
      const q: any = {
        select() { return q; }, order() { return q; }, limit() { return q; }, gte() { return q; }, neq() { return q; },
        eq(k: string, v: unknown) { filters[k] = v; return q; },
        insert(v: unknown) { return mutation("insert", v); },
        update(v: unknown) { return mutation("update", v); },
        upsert(v: unknown) { return mutation("upsert", v); },
        result() {
          if (!write) { reads.push({ table, filters: { ...filters } }); calls.push(`read:${table}`); }
          if (table === "song_links") return { data: link, error: null };
          if (table === "song_link_delivery_slots") return { data: [{ arrival_event_id: ARRIVAL_ID }], error: null };
          if (write) return { data: { id: "new-row" }, error: null };
          if (table === "ip_geo_cache") return { data: options.cacheCountry ? {
            country: options.cacheCountry, region: "Cache region", city: "Cache city",
            resolved_at: new Date(NOW - (options.expiredCache ? 25 * 3600_000 : 60_000)).toISOString(),
          } : null, error: null };
          if (table === "song_link_events" && filters.event_id) return { data: options.duplicate === "recover" ? null
            : { ...arrival, country: "PT", capi_fbp: null }, error: null };
          return { data: null, error: null };
        },
        async maybeSingle() { return q.result(); },
        then(resolve: (v: unknown) => void) { return Promise.resolve(q.result()).then(resolve); },
      };
      function mutation(op: string, value: unknown) {
        write = true; writes.push({ table, op, value }); calls.push(`${op}:${table}`); return q;
      }
      return q;
    },
    rpc(name: string, args: any) {
      rpcs.push({ name, args }); calls.push(`rpc:${name}`);
      const result = name === "song_link_event_claim" ? { data: options.duplicate ? null : "new-row", error: null }
        : { data: options.rpcCountry ? [{ country: options.rpcCountry, region: "RPC region", city: options.rpcCity ?? null }] : null,
          error: options.rpcError ? { message: "synthetic timeout" } : null };
      return { abortSignal() { return this; }, then(resolve: (v: unknown) => void) { return Promise.resolve(result).then(resolve); } };
    },
  };
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let paidGeo = 0;
  const env: Record<string, string> = { SUPABASE_URL: "https://backend.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic",
    SONG_LINK_IP_SALT: options.noSalt ? "" : SALT, SONG_LINK_SSR_KEY: "synthetic-ssr",
    META_CAPI_TOKEN: "synthetic-meta", TIKTOK_EVENTS_ACCESS_TOKEN: "synthetic-tt" };
  const abModule = { ...ab, abVariantFor: async (input: Parameters<typeof ab.abVariantFor>[0]) => {
    abInputs.push(input); return ab.abVariantFor(input);
  } };
  const names = ["createClient", "lookupIpGeo", ...Object.keys(consent), ...Object.keys(zone), ...Object.keys(ssr), ...Object.keys(appOpen),
    ...Object.keys(abModule), "Deno", "fetch"];
  const values = [() => admin, async () => { paidGeo++; return { country: "BR", city: null, region: null }; },
    ...Object.values(consent), ...Object.values(zone), ...Object.values(ssr), ...Object.values(appOpen), ...Object.values(abModule),
    { env: { get: (key: string) => { secrets.push(key); return env[key]; } }, serve: (fn: typeof handler) => { handler = fn; } },
    async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (url.includes("get_vault_secret")) return new Response("null");
      sent.push({ url, body }); calls.push(`fetch:${url}`);
      return new Response(JSON.stringify(url.includes("facebook") ? { events_received: 1 } : { code: 0 }));
    }];
  new Function(...names, (options.compiled ?? COMPILED) + (options.memoryCountry
    ? `\ngeoCache.set(${JSON.stringify(IP_HASH)}, {at: Date.now(), geo: {country: ${JSON.stringify(options.memoryCountry)}, city: 'Memory city', region: null}});` : ""))(...values);
  const invoke = async (changes: Partial<Options> = {}) => {
    const o = { ...options, ...changes };
    const event = o.event ?? "choice";
    const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 iPhone Instagram", "x-forwarded-for": o.ip ?? IP };
    if (o.ssr) headers["x-song-link-ssr-key"] = "synthetic-ssr";
    else { headers.Origin = "https://www.mundopropicio.com"; if (o.country) headers["cf-ipcountry"] = o.country; }
    const response = await handler!(new Request("https://backend.invalid", { method: "POST", headers,
      body: JSON.stringify({ slug: "synthetic-link", event, consent: o.consent, destination: "spotify", opened: "app",
        event_id: o.eventId ?? (event === "app_open" ? `${ARRIVAL_ID}:open` : ARRIVAL_ID),
        ...(event === "arrival" ? {} : { arrival_event_id: ARRIVAL_ID }), elapsed_ms: 100,
        fbclid: "current-fb", ttclid: "current-tt", fbc: "current-fbc", fbp: "current-fbp", ttp: "current-ttp",
        utm_source: "synthetic", utm_campaign: "campaign", mode: o.mode,
        page_url: "https://www.mundopropicio.com/m/synthetic-link?utm_source=synthetic",
        ...(o.ssr ? { ssr: true, prefetch: false, client_ip: o.ip ?? IP, client_ua: "Mozilla/5.0 iPhone Instagram",
          client_geo: { country: o.country ?? null, city: null, region: null } } : {}),
      }) }));
    return { response, body: await response.json() };
  };
  return { invoke, sent, writes, reads, rpcs, calls, secrets, abInputs, paidGeo: () => paidGeo };
}

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => vi.restoreAllMocks());

describe("#647 critério 1 — zona protegida pura", () => {
  const countries = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH".split(" ");
  it("contém exactamente os 32 códigos decididos", () => expect([...zone.PROTECTED_ZONE].sort()).toEqual(countries.sort()));
  it.each(countries)("%s e minúsculas são protegidos", code => {
    expect(zone.isProtectedZone(code)).toBe(true); expect(zone.isProtectedZone(` ${code.toLowerCase()} `)).toBe(true);
  });
  it.each(["BR", "US", "AR"])("%s fica fora", code => {
    expect(zone.isProtectedZone(code)).toBe(false); expect(zone.isProtectedZone(code.toLowerCase())).toBe(false);
  });
  it.each([null, undefined, "", " ", "XX", "ZZ", "T1", "BRA", "unknown"])("%j fecha por defeito", code => {
    expect(zone.isProtectedZone(code)).toBe(true);
  });
});

const PERSONAL_FIELDS = ["ip_hash", "fbclid", "ttclid", "capi_fbp", "capi_fbc", "capi_external_id"];
function expectNoIdentifiers(value: Record<string, unknown>) {
  for (const key of PERSONAL_FIELDS) expect(value[key] ?? null, key).toBeNull();
}
function expectNoDelivery(r: Awaited<ReturnType<typeof runtime>>) {
  expect(r.sent).toEqual([]);
  expect(r.paidGeo()).toBe(0);
  expect(r.writes.filter(w => w.table === "song_link_delivery_slots")).toEqual([]);
  expect(r.secrets).not.toContain("META_CAPI_TOKEN");
  expect(r.secrets).not.toContain("TIKTOK_EVENTS_ACCESS_TOKEN");
}

describe("#647 critério 2 — gravação protegida sem publicidade", () => {
  const paths: [string, Options][] = [
    ["header PT", { country: "PT" }], ["header normalizado", { country: "pt" }],
    ["cache hash DE", { cacheCountry: "DE" }], ["memória CH", { memoryCountry: "CH" }],
    ["RPC PT sem cidade", { rpcCountry: "PT" }], ["desconhecido", {}],
    ["header XX", { country: "XX" }], ["cache expirada", { cacheCountry: "BR", expiredCache: true }],
    ["RPC indisponível", { rpcError: true }], ["sem sal", { noSalt: true }],
  ];
  describe.each(paths)("%s", (_name, options) => {
    it.each(["arrival", "choice", "app_open"] as const)("%s conserva só contagem e dados não identificadores", async event => {
      const r = await runtime({ ...options, event });
      expect((await r.invoke()).response.status).toBe(200);
      const claim = r.rpcs.find(c => c.name === "song_link_event_claim");
      const inserts = r.writes.filter(w => w.table === "song_link_events" && w.op === "insert");
      expect(claim ? [claim] : inserts).toHaveLength(1);
      if (claim) expectNoIdentifiers(claim.args.p_payload);
      for (const write of r.writes.filter(w => w.table === "song_link_events")) expectNoIdentifiers(write.value);
      const final = r.writes.filter(w => w.table === "song_link_events" && w.op === "update").at(-1)!.value;
      expect(final).toMatchObject({ capi_status: "nao_aplicavel_zona_protegida", tiktok_status: "nao_aplicavel_zona_protegida" });
      expectNoDelivery(r);
      if (options.cacheCountry && !options.expiredCache) {
        expect(r.reads.find(c => c.table === "ip_geo_cache")?.filters.ip).toBe(`h:${IP_HASH}`);
        expect(r.calls.indexOf("read:ip_geo_cache")).toBeLessThan(r.calls.indexOf(event === "app_open" ? "insert:song_link_events" : "rpc:song_link_event_claim"));
      }
    });
  });
  it.each(["recover", "enrich"] as const)("duplicado %s não grava cookies nem cliques", async duplicate => {
    const r = await runtime({ country: "PT", duplicate });
    const { response, body } = await r.invoke();
    expect(response.status).toBe(200); expect(body.duplicate).toBe(true);
    if (duplicate === "recover") expect(body.recovered).toBe(true);
    else expect(body.enriched).toBe(true);
    for (const w of r.writes.filter(w => w.table === "song_link_events")) expectNoIdentifiers(w.value);
    expectNoDelivery(r);
  });
  it("client_geo SSR tem prioridade e nunca usa o IP da infraestrutura", async () => {
    const r = await runtime({ ssr: true, event: "arrival", country: "PT", cacheCountry: "BR" });
    expect((await r.invoke()).response.status).toBe(200);
    expect(r.rpcs.find(c => c.name === "song_link_event_claim")?.args.p_payload.country).toBe("PT");
    expect(r.reads.some(c => c.table === "ip_geo_cache")).toBe(false);
    expectNoDelivery(r);
  });
  it("header conhecido precede cache e RPC", async () => {
    const r = await runtime({ country: "PT", cacheCountry: "BR", rpcCountry: "BR" });
    await r.invoke();
    expect(r.reads.some(c => c.table === "ip_geo_cache")).toBe(false);
    expect(r.rpcs.map(c => c.name)).toEqual(["song_link_event_claim"]);
    expectNoDelivery(r);
  });
  it("cache válida precede o RPC", async () => {
    const r = await runtime({ cacheCountry: "DE", rpcCountry: "BR" });
    await r.invoke();
    expect(r.rpcs.map(c => c.name)).toEqual(["song_link_event_claim"]);
    expectNoDelivery(r);
  });
  it("cache desconhecida deixa o RPC rápido resolver BR", async () => {
    const r = await runtime({ cacheCountry: "XX", rpcCountry: "BR", rpcCity: "São Paulo", consent: "granted" });
    await r.invoke();
    expect(r.sent).toHaveLength(2);
    expect(r.rpcs.find(c => c.name === "song_link_event_claim")?.args.p_payload).toMatchObject({ country: "BR", ip_hash: IP_HASH });
    expect(r.calls.indexOf("rpc:ip_city_lookup")).toBeLessThan(r.calls.indexOf("rpc:song_link_event_claim"));
  });
  it("A/B protegido usa event_id e não a identidade do visitante", async () => {
    const r = await runtime({ country: "PT" });
    const first = await r.invoke();
    await r.invoke({ ip: "198.51.100.99" });
    await r.invoke({ eventId: "another-event" });
    expect(r.abInputs.map(i => i.ipHash)).toEqual([ARRIVAL_ID, ARRIVAL_ID, "another-event"]);
    expect(first.body.ab_variant).toBe(await ab.abVariantFor({ ...r.abInputs[0], ipHash: ARRIVAL_ID }));
    expect(r.abInputs.some(i => i.ipHash === IP_HASH)).toBe(false);
    expectNoDelivery(r);
  });
  it("A/B BR conserva a semente por ip_hash", async () => {
    const r = await runtime({ country: "BR", consent: "granted" });
    await r.invoke();
    expect(r.abInputs[0].ipHash).toBe(IP_HASH);
  });
});

describe("#647 critério 2 — paridade BR fixada antes da alteração da SLE", () => {
  it.each(["arrival", "choice", "app_open"] as const)("%s: claim/insert e envios byte a byte", async event => {
    const r = await runtime({ country: "BR", event, consent: "granted" });
    expect((await r.invoke()).response.status).toBe(200);
    const payload = r.rpcs.find(c => c.name === "song_link_event_claim")?.args.p_payload
      ?? r.writes.find(w => w.table === "song_link_events" && w.op === "insert")?.value;
    expect(r.sent).toHaveLength(2);
    // Capturados no main 2512bd39, antes de editar index.ts (#647 E2b).
    const expected = {
      arrival: "3d6c8f84d104ce9f23c8f0b61b7d8e37b437f791ddf1a68c5789e08a9d4a7c4e",
      choice: "9b4f7eee3f8bfd1688f5f3782a156a598409d82ad6a207fc9c64a04a38baa094",
      app_open: "350e4d98bfd0cec431cb9e7043d738ccb4298db981870be45a39ed8e50379852",
    };
    expect(sha(JSON.stringify({ payload, sent: r.sent }))).toBe(expected[event]);
  });
});
