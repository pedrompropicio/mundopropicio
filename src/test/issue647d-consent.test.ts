// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as consent from "../../supabase/functions/song-link-event/consent";
import * as zone from "../../supabase/functions/_shared/protected-zone";
import * as appOpen from "../../supabase/functions/song-link-event/app-open";
import * as ssr from "../../supabase/functions/song-link-event/ssr";
import * as ab from "../../supabase/functions/song-link-event/ab-variant";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const ID = "00000000-0000-4000-8000-000000000001";
const IP = "203.0.113.7";
const HASH = createHash("sha256").update(`synthetic-salt:${IP}`).digest("hex");
const VERSION = "647d-v1";
const compiled = transformSync(readFileSync("supabase/functions/song-link-event/index.ts", "utf8")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, ""), { loader: "ts", format: "cjs" }).code;
const identifierKeys = ["ip_hash", "fbclid", "ttclid", "capi_fbp", "capi_fbc", "capi_external_id"];
const noIdentifiers = (row: Record<string, unknown>) => {
  for (const key of identifierKeys) expect(row[key] ?? null, key).toBeNull();
};

// Adapter models the canonical claim's explicit columns (0252): it DOES NOT
// persist consent_* or caller delivery statuses, so the edge must update them.
function runtime(options: { arrival?: Record<string, unknown>; failUpdate?: boolean; failSlot?: boolean;
  marked?: boolean; token?: boolean; holdDelivery?: boolean; localGeo?: { country: string; region: string; city: string } } = {}) {
  const rows: Record<string, any>[] = options.arrival ? [{ ...options.arrival }] : [];
  const slots = new Map<string, Record<string, unknown>>();
  const sent: { url: string; body: any }[] = [];
  const writes: { table: string; op: string; value: any }[] = [];
  const secretReads: string[] = [];
  const seeds: unknown[] = [];
  let paidGeo = 0;
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op = "select", value: any;
      const q: any = {
        select() { return q; }, order() { return q; }, limit() { return q; },
        gte() { return q; }, neq() { return q; },
        eq(k: string, v: unknown) { filters[k] = v; return q; },
        update(v: unknown) { op = "update"; value = v; return q; },
        insert(v: unknown) { op = "insert"; value = v; return q; },
        upsert(v: unknown) { op = "upsert"; value = v; return q; },
        result() {
          if (op !== "select") writes.push({ table, op, value: structuredClone(value) });
          if (table === "song_links") return { data: { id: "link", company_id: "company", artist_id: "artist",
            song_id: "song", title: "Synthetic", active: true, destinations: { spotify: { app: "synthetic" } },
            meta_pixel_id: "meta-synthetic", tiktok_pixel_id: "tt-synthetic" }, error: null };
          if (table === "song_link_delivery_slots") {
            if (options.failSlot) return { data: null, error: { message: "synthetic slot failure" } };
            const key = `${value?.arrival_event_id ?? filters.arrival_event_id}:${value?.provider ?? filters.provider}:${value?.event_name ?? filters.event_name}`;
            if (op === "upsert") {
              if (slots.has(key)) return { data: [], error: null };
              slots.set(key, { ...value, status: "reserved" });
              return { data: [{ arrival_event_id: value.arrival_event_id }], error: null };
            }
            if (op === "update") Object.assign(slots.get(key)!, value);
            return { data: null, error: null };
          }
          if (table === "song_link_events") {
            const matches = rows.filter(r => Object.entries(filters).every(([k, v]) => r[k] === v));
            if (op === "update") {
              if (options.failUpdate) return { data: null, error: { message: "synthetic update failure" } };
              for (const row of matches) Object.assign(row, value);
              return { data: null, error: null };
            }
            if (op === "insert") {
              const row = { id: `row-${rows.length}`, created_at: new Date(NOW).toISOString(), ...value };
              rows.push(row); return { data: { id: row.id }, error: null };
            }
            // No recentDuplicate hit unless the query explicitly identifies the arrival.
            return { data: filters.event_id ? structuredClone(matches[0] ?? null) : null, error: null };
          }
          return { data: null, error: null };
        },
        async maybeSingle() { return q.result(); },
        then(resolve: (value: unknown) => void) { return Promise.resolve(q.result()).then(resolve); },
      };
      return q;
    },
    rpc(name: string, args: any) {
      let result: unknown = name === "ip_city_lookup" && options.localGeo ? [options.localGeo] : null;
      if (name === "song_link_event_claim") {
        const payload = { ...args.p_payload };
        writes.push({ table: "claim", op: "rpc", value: structuredClone(payload) });
        if (!rows.some(r => r.event_id === payload.event_id && r.event === payload.event)) {
          for (const key of ["consent_status", "consent_at", "consent_version"]) delete payload[key];
          const row = { ...payload, id: `row-${rows.length}`, created_at: new Date(NOW - 60_000).toISOString(),
            capi_status: "pendente", tiktok_status: "pendente" };
          rows.push(row); result = row.id;
        }
      }
      return { abortSignal() { return this; }, then(resolve: (v: unknown) => void) {
        return Promise.resolve({ data: result, error: null }).then(resolve);
      } };
    },
  };
  let handler: (request: Request) => Promise<Response>;
  const env: Record<string, string> = { SUPABASE_URL: "https://backend.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic",
    SONG_LINK_IP_SALT: "synthetic-salt", SONG_LINK_SSR_KEY: "synthetic-ssr",
    META_CAPI_TOKEN: options.token === false ? "" : "synthetic-meta",
    TIKTOK_EVENTS_ACCESS_TOKEN: options.token === false ? "" : "synthetic-tt" };
  const abModule = { ...ab, abVariantFor: async (input: Parameters<typeof ab.abVariantFor>[0]) => {
    seeds.push(input.ipHash); return ab.abVariantFor(input);
  } };
  const modules = { ...zone, ...appOpen, ...ssr, ...abModule, ...consent };
  const deliveryWaiters: { url: string; resolve: () => void }[] = [];
  new Function("createClient", "lookupIpGeo", ...Object.keys(modules), "Deno", "fetch", compiled)(
    () => admin, async () => { paidGeo++; return { country: null, city: null, region: null }; },
    ...Object.values(modules), { serve: (fn: typeof handler) => { handler = fn; }, env: { get: (key: string) => {
      secretReads.push(key); return env[key];
    } } }, async (url: string, init: RequestInit) => {
      if (url.includes("get_vault_secret")) return new Response("null");
      sent.push({ url, body: JSON.parse(String(init.body)) });
      if (options.holdDelivery) await new Promise<void>(resolve => deliveryWaiters.push({ url, resolve }));
      return new Response(JSON.stringify(url.includes("facebook") ? { events_received: 1 } : { code: 0 }));
    });
  async function invoke(body: Record<string, unknown> = {}, country = "BR", isSsr = false) {
    const headers: Record<string, string> = { "user-agent": "Mozilla iPhone Instagram", "x-forwarded-for": IP,
      "cf-ipcountry": country, "cf-ipcity": "Fortaleza", "cf-region": "CE" };
    if (isSsr) headers["x-song-link-ssr-key"] = "synthetic-ssr";
    else headers.Origin = "https://www.mundopropicio.com";
    const response = await handler!(new Request("https://backend.invalid", { method: "POST", headers,
      body: JSON.stringify({ slug: "synthetic-link", event: "arrival", event_id: ID,
        utm_source: "instagram", utm_medium: "paid", utm_campaign: "campaign", utm_content: "creative", utm_term: "term",
        destination: "spotify", fbclid: "synthetic-fb", ttclid: "synthetic-tt", fbp: "synthetic-fbp", fbc: "synthetic-fbc",
        consent_version: VERSION, ...(options.marked ? { mode: "teste_aj19" } : {}),
        ...(isSsr ? { ssr: true, prefetch: false, client_ip: IP, client_ua: "Mozilla iPhone Instagram",
          client_geo: { country, city: "Fortaleza", region: "CE" } } : {}), ...body }) }));
    return { response, body: await response.json() };
  }
  return { invoke, rows, slots, sent, writes, secretReads, seeds, paidGeo: () => paidGeo,
    release: (provider: "meta" | "tiktok") => {
      const match = deliveryWaiters.findIndex(w => provider === "meta" ? w.url.includes("facebook") : w.url.includes("tiktok"));
      if (match < 0) throw new Error(`no held delivery for ${provider}`);
      deliveryWaiters.splice(match, 1)[0].resolve();
    } };
}
const grant = { event: "consent", arrival_event_id: ID, consent: "granted" };

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => vi.restoreAllMocks());

describe("#647-d C1: zona × consentimento × evento (puro)", () => {
  for (const protectedZone of [true, false]) for (const signal of [undefined, "pending", "denied", "granted", "invalid"]) {
    it.each(["arrival", "choice", "app_open", "consent"] as const)(`${protectedZone}/${signal}/%s`, event => {
      const expected = protectedZone ? "not_applicable" : signal === "granted" || signal === "denied" ? signal : "pending";
      expect(consent.consentPolicy(protectedZone, signal, event)).toEqual({
        storeIdentifiers: expected === "granted", send: expected === "granted", status: expected,
        deliveryStatus: protectedZone ? "nao_aplicavel_zona_protegida" : expected === "granted" ? "pendente"
          : expected === "denied" ? "recusado_consentimento" : "aguarda_consentimento",
      });
    });
  }
  it.each(["pending", "denied", "granted"])("SSR %s é sempre pending", signal => {
    expect(consent.consentPolicy(false, signal, "arrival", true)).toMatchObject({ status: "pending", send: false, storeIdentifiers: false });
  });
  it.each([undefined, null, 7, "", " ", "x".repeat(41)])("versão inválida %j", value => expect(consent.consentVersion(value)).toBeNull());
  it("versão até 40 caracteres", () => expect(consent.consentVersion("x".repeat(40))).toHaveLength(40));
});

describe("#647-d C2: handler real, dependências simuladas", () => {
  it.each([undefined, "pending", "denied"])("BR SSR %s sem identificadores, envios, slots nem tokens", async signal => {
    const r = runtime();
    expect((await r.invoke({ consent: signal }, "BR", true)).response.status).toBe(200);
    noIdentifiers(r.rows[0]);
    expect(r.rows[0]).toMatchObject({ consent_status: "pending", consent_version: VERSION, consent_at: null,
      capi_status: "aguarda_consentimento", tiktok_status: "aguarda_consentimento", country: "BR", city: "Fortaleza",
      region: "CE", device: "mobile", os: "ios", utm_source: "instagram", utm_campaign: "campaign", utm_medium: "paid",
      utm_content: "creative", utm_term: "term", event: "arrival", origin: "ssr" });
    expect(r.sent).toEqual([]); expect(r.slots.size).toBe(0); expect(r.paidGeo()).toBe(0);
    expect(r.secretReads).not.toContain("META_CAPI_TOKEN"); expect(r.secretReads).not.toContain("TIKTOK_EVENTS_ACCESS_TOKEN");
    expect(r.seeds).toEqual([ID]);
  });
  it("BR pending conserva cidade DB-IP local sem cache por hash nem API paga", async () => {
    const r = runtime({ localGeo: { country: "BR", city: "Fortaleza", region: "CE" } });
    await r.invoke({ consent: "pending", client_geo: { country: "BR", region: null, city: null } }, "BR", true);
    expect(r.rows[0]).toMatchObject({ country: "BR", city: "Fortaleza", region: "CE", consent_status: "pending" });
    noIdentifiers(r.rows[0]); expect(r.paidGeo()).toBe(0); expect(r.sent).toEqual([]); expect(r.slots.size).toBe(0);
    expect(r.writes.filter(w => w.table === "ip_geo_cache")).toEqual([]);
  });
  it("SSR granted não antecipa o consentimento do browser", async () => {
    const r = runtime(); await r.invoke({ consent: "granted" }, "BR", true);
    noIdentifiers(r.rows[0]); expect(r.sent).toEqual([]); expect(r.rows[0].consent_status).toBe("pending");
  });
  it("BR consent granted completa chegada, entrega ViewContent com tempo original e não reenvia", async () => {
    const r = runtime(); await r.invoke({ consent: "pending" }, "BR", true);
    const original = structuredClone(r.rows[0]);
    expect((await r.invoke(grant)).response.status).toBe(200);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ consent_status: "granted", consent_version: VERSION,
      consent_at: new Date(NOW).toISOString(), ip_hash: HASH, fbclid: "synthetic-fb", ttclid: "synthetic-tt",
      capi_fbp: true, capi_fbc: true, capi_external_id: true, capi_status: "enviado", tiktok_status: "enviado",
      event: "arrival", origin: original.origin, event_id: ID, created_at: original.created_at });
    expect(r.sent).toHaveLength(2);
    for (const { body } of r.sent) expect(body.data[0]).toMatchObject({ event_id: ID, event_time: Date.parse(original.created_at) / 1000 });
    expect(r.sent[0].body.data[0]).toMatchObject({ event_name: "ViewContent", user_data: { fbp: "synthetic-fbp" } });
    expect(r.sent[1].body.data[0]).toMatchObject({ event: "ViewContent", user: { ttclid: "synthetic-tt" } });
    expect(r.slots.size).toBe(2);
    expect([...r.slots.values()].every(s => s.event_name === "ViewContent" && s.status === "delivered")).toBe(true);
    const after = structuredClone(r.rows[0]);
    await r.invoke(grant); expect(r.sent).toHaveLength(2); expect(r.rows[0]).toEqual(after);
    // The new slots leave both opening slots available.
    await r.invoke({ event: "app_open", event_id: `${ID}:open`, arrival_event_id: ID,
      destination: "spotify", opened: "app", consent: "granted" });
    expect(r.sent).toHaveLength(4);
    expect([...r.slots.values()].map(s => s.event_name).sort()).toEqual(["CompleteRegistration", "ListenClick", "ViewContent", "ViewContent"]);
  });
  it("BR consent denied regista a decisão e mantém medição própria sem publicidade", async () => {
    const r = runtime(); await r.invoke({ consent: "pending" }, "BR", true);
    await r.invoke({ ...grant, consent: "denied" });
    expect(r.rows).toHaveLength(1); noIdentifiers(r.rows[0]);
    expect(r.rows[0]).toMatchObject({ consent_status: "denied", consent_at: new Date(NOW).toISOString(),
      consent_version: VERSION, capi_status: "recusado_consentimento", tiktok_status: "recusado_consentimento", city: "Fortaleza" });
    expect(r.sent).toEqual([]); expect(r.slots.size).toBe(0);
  });
  it.each(["pending", "denied", undefined])("BR choice %s guarda só medição própria", async signal => {
    const r = runtime(); await r.invoke({ event: "choice", consent: signal });
    noIdentifiers(r.rows[0]); expect(r.sent).toEqual([]); expect(r.slots.size).toBe(0);
    expect(r.rows[0].consent_status).toBe(signal === "denied" ? "denied" : "pending");
    expect(r.seeds).toEqual([ID]);
  });
  it("BR choice granted conserva envios e fbp actual", async () => {
    const r = runtime(); await r.invoke({ event: "choice", consent: "granted" });
    expect(r.sent).toHaveLength(2); expect(r.seeds).toEqual([HASH]);
    expect(r.sent[0].body.data[0]).toMatchObject({ event_name: "ListenClick", user_data: { fbp: "synthetic-fbp" } });
    expect(r.sent[1].body.data[0].event).toBe("ClickButton");
    expect(r.rows[0]).toMatchObject({ ip_hash: HASH, capi_fbp: true, consent_status: "granted" });
  });
  it("PT granted ignora o sinal, também no evento consent", async () => {
    const r = runtime(); await r.invoke({ consent: "granted" }, "PT", true);
    await r.invoke(grant, "PT");
    noIdentifiers(r.rows[0]); expect(r.sent).toEqual([]); expect(r.slots.size).toBe(0);
    expect(r.rows[0]).toMatchObject({ consent_status: "not_applicable", consent_at: null, consent_version: null,
      capi_status: "nao_aplicavel_zona_protegida", tiktok_status: "nao_aplicavel_zona_protegida" });
  });
  it.each([
    { link_id: "other-link" }, { event: "choice" }, { created_at: new Date(NOW - 7200_000).toISOString() },
    { created_at: new Date(NOW - 7200_001).toISOString() }, { created_at: new Date(NOW + 1).toISOString() }, { created_at: "invalid" },
  ])("recusa chegada inválida/expirada %j", async changes => {
    const r = runtime({ arrival: { id: "arr", event_id: ID, link_id: "link", country: "BR", event: "arrival",
      created_at: new Date(NOW - 1000).toISOString(), ...changes } });
    expect((await r.invoke(grant)).response.status).toBe(403);
    expect(r.sent).toEqual([]); expect(r.writes).toEqual([]); expect(r.slots.size).toBe(0);
  });
  it("aceita chegada browser um ms antes de 2 h", async () => {
    const r = runtime({ arrival: { id: "arr", event_id: ID, origin: "browser", link_id: "link", country: "BR", event: "arrival",
      created_at: new Date(NOW - 7200_000 + 1).toISOString() } });
    expect((await r.invoke(grant)).response.status).toBe(200); expect(r.sent).toHaveLength(2);
  });
  it.each([{ consent: "pending" }, { consent: "invalid" }, { consent_version: undefined },
    { consent_version: "x".repeat(41) }, { arrival_event_id: "invalid" }])("recusa corpo consent inválido %j", async changes => {
    const r = runtime(); expect((await r.invoke({ ...grant, ...changes })).response.status).toBe(400);
    expect(r.rows).toEqual([]); expect(r.sent).toEqual([]);
  });
  it("SSR nunca aceita event consent", async () => {
    const r = runtime(); expect((await r.invoke(grant, "BR", true)).response.status).toBe(400); expect(r.rows).toEqual([]);
  });
  it("falha na gravação do consentimento fecha os envios", async () => {
    const r = runtime({ failUpdate: true });
    expect((await r.invoke({ event: "choice", consent: "granted" })).response.status).toBe(500);
    expect(r.sent).toEqual([]); expect(r.slots.size).toBe(0);
  });
  it("slot indisponível fecha entrega; marca de teste suprime antes de slots/tokens", async () => {
    for (const options of [{ failSlot: true }, { marked: true }]) {
      const r = runtime(options); await r.invoke({ consent: "pending" }, "BR", true); await r.invoke(grant);
      expect(r.sent).toEqual([]); expect(r.slots.size).toBe(0);
      expect(r.secretReads).not.toContain("META_CAPI_TOKEN"); expect(r.secretReads).not.toContain("TIKTOK_EVENTS_ACCESS_TOKEN");
    }
  });
  it("beacon arrival pending atrasado não apaga decisão nem identificadores já consentidos", async () => {
    const r = runtime(); await r.invoke({ consent: "pending" }, "BR", true); await r.invoke(grant);
    const after = structuredClone(r.rows[0]);
    await r.invoke({ consent: "pending" });
    expect(r.rows[0]).toMatchObject({ consent_status: "granted", ip_hash: HASH, capi_fbp: true,
      capi_status: "enviado", consent_at: after.consent_at }); expect(r.sent).toHaveLength(2);
  });
  it("consent concorrente não duplica nem sobrescreve recibos do outro pedido", async () => {
    const r = runtime({ holdDelivery: true }); await r.invoke({ consent: "pending" }, "BR", true);
    const first = r.invoke(grant);
    await vi.waitFor(() => expect(r.sent).toHaveLength(1));
    const second = r.invoke(grant);
    await vi.waitFor(() => expect(r.sent).toHaveLength(2));
    r.release("tiktok"); await second;
    r.release("meta"); await first;
    expect(r.sent).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ capi_status: "enviado", tiktok_status: "enviado", capi_fbp: true, capi_fbc: true });
    expect([...r.slots.values()].every(s => s.status === "delivered")).toBe(true);
  });
  it("sem fbp no corpo não inventa cookie a partir dos headers", async () => {
    const r = runtime(); await r.invoke({ event: "choice", consent: "granted", fbp: undefined });
    expect(r.sent[0].body.data[0].user_data).not.toHaveProperty("fbp");
    expect(r.rows[0].capi_fbp).toBe(false);
  });
});
