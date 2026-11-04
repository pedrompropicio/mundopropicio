// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as appOpen from "../../supabase/functions/song-link-event/app-open";
import * as ssr from "../../supabase/functions/song-link-event/ssr";
import * as ab from "../../supabase/functions/song-link-event/ab-variant";
import * as zone from "../../supabase/functions/_shared/protected-zone";

const source = readFileSync("supabase/functions/song-link-event/index.ts", "utf8")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "");
const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;
const NOW = Date.parse("2026-10-27T12:00:00Z");
const IP = "203.0.113.7";
const SALT = "synthetic-salt";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const IP_HASH = sha(`${SALT}:${IP}`);
const ARRIVAL_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";
const pageUrl = "https://www.mundopropicio.com/m/synthetic-link";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram";
const arrival = { id: "arrival-row", origin: "ssr", event: "arrival", link_id: "link-a",
  created_at: new Date(NOW - 60_000).toISOString(), mode: null, fbclid: "arrival-fb", ttclid: "arrival-tt" };

type Call = { table: string; action: string; payload?: any; filters: Record<string, unknown> };
type Options = {
  headers?: Record<string, string>; body?: Record<string, unknown>; cache?: any; local?: any;
  duplicate?: boolean; existing?: any; secret?: string | null; localError?: boolean; repeat?: boolean;
};

// Molde dos testes existentes: executa o handler real com DB, rede e Deno
// simulados. Nenhum segredo, SQL, dado alojado ou entrega externa.
async function run(options: Options = {}) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const calls: Call[] = [];
  const rpcs: { name: string; args: any }[] = [];
  const sent: { url: string; body: string }[] = [];
  const paidGeo = vi.fn(async () => ({ country: "US", region: null, city: null }));
  const admin = {
    from(table: string) {
      const call: Call = { table, action: "select", filters: {} };
      const query: any = {
        select() { return query; }, order() { return query; }, limit() { return query; },
        gte() { return query; }, neq() { return query; },
        eq(key: string, value: unknown) { call.filters[key] = value; return query; },
        insert(payload: any) { call.action = "insert"; call.payload = payload; return query; },
        update(payload: any) { call.action = "update"; call.payload = payload; return query; },
        upsert(payload: any) { call.action = "upsert"; call.payload = payload; return query; },
        result() {
          calls.push(call);
          let data: any = null;
          if (table === "song_links") data = { id: "link-a", company_id: "company-a", artist_id: "artist-a", song_id: "song-a",
            link_type: "song", title: "Synthetic title", active: true, destinations: { spotify: { app: "synthetic" } },
            meta_pixel_id: "meta-test", tiktok_pixel_id: "tiktok-test" };
          else if (table === "ip_geo_cache" && call.action === "select") data = options.cache ?? null;
          else if (table === "song_link_delivery_slots") data = [{ arrival_event_id: ARRIVAL_ID }];
          else if (table === "song_link_events" && call.action === "insert") data = { id: "row-a" };
          else if (table === "song_link_events" && call.filters.event_id === ARRIVAL_ID) data = arrival;
          else if (table === "song_link_events" && call.filters.event_id) data = options.existing ?? null;
          return { data, error: null };
        },
        async maybeSingle() { return query.result(); },
        then(resolve: (value: unknown) => void) { return Promise.resolve(query.result()).then(resolve); },
      };
      return query;
    },
    rpc(name: string, args: any) {
      rpcs.push({ name, args });
      const result = async () => {
        if (name === "ip_city_lookup" && options.localError) throw new Error("synthetic local failure");
        return { data: name === "song_link_event_claim" ? (options.duplicate ? null : "row-a") : options.local ?? null, error: null };
      };
      return { abortSignal: () => ({ then: (resolve: any, reject: any) => result().then(resolve, reject) }),
        then: (resolve: any, reject: any) => result().then(resolve, reject) };
    },
  };
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const env: Record<string, string> = { SUPABASE_URL: "https://backend.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic",
    SONG_LINK_IP_SALT: options.secret === undefined ? SALT : options.secret ?? "",
    SONG_LINK_SSR_KEY: "synthetic-ssr", META_CAPI_TOKEN: "synthetic-meta", TIKTOK_EVENTS_ACCESS_TOKEN: "synthetic-tt" };
  const modules = { ...ssr, ...appOpen, ...ab, ...zone };
  new Function("createClient", "lookupIpGeo", ...Object.keys(modules), "Deno", "fetch", compiled)(
    () => admin, paidGeo, ...Object.values(modules),
    { env: { get: (key: string) => env[key] }, serve: (fn: typeof handler) => { handler = fn; } },
    async (url: string, options: RequestInit) => {
      sent.push({ url, body: String(options.body) });
      return new Response(JSON.stringify(url.includes("facebook") ? { events_received: 1 } : url.includes("tiktok") ? { code: 0 } : null));
    });
  const request = () => new Request("https://backend.invalid", {
    method: "POST", headers: { Origin: "https://www.mundopropicio.com", "user-agent": UA, "x-forwarded-for": IP, ...options.headers },
    body: JSON.stringify({ slug: "synthetic-link", event: "arrival", event_id: EVENT_ID,
      utm_source: "meta", utm_medium: "paid", utm_campaign: "campaign", utm_content: "content", utm_term: "term",
      fbclid: "request-fb", ttclid: "request-tt", fbc: "request-fbc", fbp: "request-fbp", ttp: "request-ttp",
      page_url: pageUrl, ...options.body }),
  });
  const response = await handler!(request());
  if (options.repeat) await handler!(request());
  return { response, body: await response.json(), calls, rpcs, sent, paidGeo,
    claim: rpcs.find(call => call.name === "song_link_event_claim")?.args.p_payload };
}
afterEach(() => vi.useRealTimers());

describe("#647 critério 1 — zona protegida pura", () => {
  const countries = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH".split(" ");
  it("contém exactamente os 32 países decididos", () => {
    expect([...zone.PROTECTED_ZONE].sort()).toEqual([...countries].sort());
  });
  it.each(countries)("protege %s e normaliza minúsculas", country => {
    expect(zone.isProtectedZone(country)).toBe(true);
    expect(zone.isProtectedZone(` ${country.toLowerCase()} `)).toBe(true);
  });
  it.each([null, undefined, "", " ", "XX", "xx", "T1", "ZZ", "BRA", "???"])("protege país desconhecido %j", country => {
    expect(zone.isProtectedZone(country)).toBe(true);
  });
  it.each(["BR", "US", "AR", "br", "us", "ar", " JP "])("mantém fora da zona %s", country => {
    expect(zone.isProtectedZone(country)).toBe(false);
  });
});

describe("#647 critério 2 — paridade BR fixada antes da alteração da SLE", () => {
  it("fixa bytes do claim e dos dois envios no handler anterior", async () => {
    const result = await run({ headers: { "cf-ipcountry": "BR", "cf-region": "Ceará", "cf-ipcity": "Fortaleza" } });
    expect(result.response.status).toBe(200);
    expect(result.sent).toHaveLength(2);
    // SHA-256 dos bytes JSON reais, capturados antes de modificar index.ts.
    expect(sha(JSON.stringify(result.claim))).toBe("53f08ba2efc8453eaf01e25320fdfc6047f385f8dbb8eff60e09e9d21a7563e4");
    expect(sha(JSON.stringify(result.sent))).toBe("175e10ba2d915485ad8741f8af97da0f04cabe692df86ccf787e369b3392f9d3");
  });
});

const emptyIdentifiers = { ip_hash: null, fbclid: null, ttclid: null, capi_fbp: null, capi_fbc: null, capi_external_id: null };
const protectedStatus = { capi_status: "nao_aplicavel_zona_protegida", tiktok_status: "nao_aplicavel_zona_protegida" };
const cache = (country: string, resolvedAt = NOW - 60_000) => ({ country, city: "Synthetic city", region: "Synthetic region",
  resolved_at: new Date(resolvedAt).toISOString() });
function expectProtected(result: Awaited<ReturnType<typeof run>>) {
  expect(result.response.status).toBe(200);
  if (result.claim) expect(result.claim).toMatchObject(emptyIdentifiers);
  const writes = result.calls.filter(call => call.table === "song_link_events" && call.action !== "select");
  for (const call of writes) {
    for (const name of Object.keys(emptyIdentifiers)) {
      if (name in call.payload) expect(call.payload[name], `${call.action}.${name}`).toBeNull();
    }
  }
  expect(writes.some(call => call.payload.capi_status === protectedStatus.capi_status)).toBe(true);
  expect(result.sent.filter(call => /graph\.facebook\.com|business-api\.tiktok\.com/.test(call.url))).toHaveLength(0);
  expect(result.calls.filter(call => call.table === "song_link_delivery_slots")).toHaveLength(0);
  expect(result.calls.filter(call => "fbclid" in call.filters || "ttclid" in call.filters)).toHaveLength(0);
  expect(result.paidGeo).not.toHaveBeenCalled();
  const secrets = result.sent.filter(call => call.url.includes("get_vault_secret")).map(call => JSON.parse(call.body)._name);
  expect(secrets).not.toContain("META_CAPI_TOKEN");
  expect(secrets).not.toContain("TIKTOK_EVENTS_ACCESS_TOKEN");
}

describe("#647 critério 2 — handler real com dependências simuladas", () => {
  it.each(["PT", "pt", "GB", "CH"])("%s por header: conta sem identificadores nem entregas", async country => {
    const result = await run({ headers: { "cf-ipcountry": country } });
    expectProtected(result);
    expect(result.claim.country).toBe(country.toUpperCase());
    expect(result.rpcs.map(call => call.name)).toEqual(["song_link_event_claim"]);
    expect(result.calls.filter(call => call.table === "ip_geo_cache")).toHaveLength(0);
  });
  it.each(["x-vercel-ip-country", "x-country"])("respeita o header alternativo %s", async header => {
    expectProtected(await run({ headers: { [header]: "PT" } }));
  });
  it("respeita client_geo SSR em vez dos headers de infraestrutura", async () => {
    const result = await run({ headers: { "x-song-link-ssr-key": "synthetic-ssr", "cf-ipcountry": "BR" },
      body: { ssr: true, prefetch: false, client_ip: IP, client_ua: UA, client_geo: { country: "PT", city: "Lisboa" } } });
    expectProtected(result);
    expect(result.claim).toMatchObject({ origin: "ssr", country: "PT", city: "Lisboa" });
  });
  it("DE apenas na cache: consulta h:<hash> antes do claim", async () => {
    const result = await run({ cache: cache("DE") });
    expectProtected(result);
    expect(result.claim.country).toBe("DE");
    expect(result.calls.find(call => call.table === "ip_geo_cache")?.filters.ip).toBe(`h:${IP_HASH}`);
    expect(result.rpcs.map(call => call.name)).toEqual(["song_link_event_claim"]);
  });
  it("memória evita nova consulta à tabela/RPC depois da resolução local", async () => {
    const result = await run({ local: [{ country: "DE", city: "Berlin", region: "Berlin" }], repeat: true });
    expectProtected(result);
    expect(result.rpcs.filter(call => call.name === "ip_city_lookup")).toHaveLength(1);
    expect(result.calls.filter(call => call.table === "ip_geo_cache" && call.action === "select")).toHaveLength(1);
  });
  it.each([null, {}, { country: "XX" }])("país desconhecido após caminhos rápidos %j: falha fechada", async local => {
    const result = await run({ local });
    expectProtected(result);
    expect(result.claim.country).toBeNull();
    expect(result.rpcs.map(call => call.name)).toEqual(["ip_city_lookup", "song_link_event_claim"]);
  });
  it("falha na RPC local conserva o clique sem entrega nem ipinfo", async () => {
    expectProtected(await run({ localError: true }));
  });
  it.each([cache("DE", NOW - 24 * 3600_000), { ...cache("DE"), resolved_at: "invalid" }])
    ("cache expirada/inválida não classifica o visitante %j", async stale => {
      const result = await run({ cache: stale });
      expectProtected(result);
      expect(result.claim.country).toBeNull();
      expect(result.rpcs[0].name).toBe("ip_city_lookup");
    });
  it("header desconhecido tenta cache e depois DB-IP; país local sozinho basta", async () => {
    const result = await run({ headers: { "cf-ipcountry": "XX" }, local: { country: "pt" } });
    expectProtected(result);
    expect(result.claim).toMatchObject({ country: "PT", city: null });
  });
  it("BR apenas no DB-IP já permite o caminho de entrega existente", async () => {
    const result = await run({ local: { country: "BR", region: "Ceará", city: "Fortaleza" } });
    expect(result.claim).toMatchObject({ country: "BR", ip_hash: IP_HASH, fbclid: "request-fb", ttclid: "request-tt" });
    expect(sha(JSON.stringify(result.sent))).toBe("175e10ba2d915485ad8741f8af97da0f04cabe692df86ccf787e369b3392f9d3");
  });
  it.each(["choice", "app_open"])("%s não herda click IDs e não reserva slots", async event => {
    const result = await run({ headers: { "cf-ipcountry": "PT" }, body: { event, destination: "spotify", opened: "app",
      arrival_event_id: ARRIVAL_ID, event_id: `${ARRIVAL_ID}:open`, elapsed_ms: 100 } });
    expectProtected(result);
    if (event === "app_open") expect(result.calls.find(call => call.action === "insert")?.payload)
      .toMatchObject({ ...emptyIdentifiers, ...protectedStatus, arrival_event_id: ARRIVAL_ID });
  });
  it("recuperação de event_id não volta a guardar identificadores", async () => {
    const result = await run({ headers: { "cf-ipcountry": "PT" }, duplicate: true });
    expectProtected(result);
    expect(result.body.recovered).toBe(true);
    expect(result.calls.find(call => call.action === "insert")?.payload).toMatchObject({ ...emptyIdentifiers, ...protectedStatus });
  });
  it("enriquecimento SSR não ressuscita capi_fbp nem outros IDs", async () => {
    const result = await run({ headers: { "cf-ipcountry": "PT" }, duplicate: true,
      existing: { id: "existing-row", origin: "ssr", country: null, capi_fbp: false } });
    expectProtected(result);
    expect(result.body.enriched).toBe(true);
    expect(result.calls.find(call => call.action === "update")?.payload).toMatchObject({ ...emptyIdentifiers, ...protectedStatus });
  });
  it("A/B protegido usa event_id mesmo sem sal, nunca ip_hash", async () => {
    const result = await run({ headers: { "cf-ipcountry": "PT" }, secret: null });
    expectProtected(result);
    expect(result.body.ab_variant).toBe(await ab.abVariantFor({ os: "ios", ipHash: EVENT_ID,
      force: null, nowMs: NOW, window: ab.AB_IOS_BTN_WINDOW }));
    expect(["A", "B"]).toContain(result.body.ab_variant);
  });
  it("SSR sem IP/país não usa o IP de infraestrutura nem uma quota global", async () => {
    const result = await run({ headers: { "x-song-link-ssr-key": "synthetic-ssr", "cf-ipcountry": "BR" },
      body: { ssr: true, prefetch: false, client_ip: null } });
    expectProtected(result);
    expect(result.claim.country).toBeNull();
    expect(result.rpcs.map(call => call.name)).toEqual(["song_link_event_claim"]);
  });
  it("marcadores de teste não permitem entregas na zona protegida", async () => {
    expectProtected(await run({ headers: { "cf-ipcountry": "PT" },
      body: { mode: "teste_aj19", meta_test_event_code: "SYNTHMETA", tiktok_test_event_code: "SYNTHTT" } }));
  });
});
