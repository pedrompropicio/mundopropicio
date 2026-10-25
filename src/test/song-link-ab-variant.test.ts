// @vitest-environment node
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import * as appOpen from "../../supabase/functions/song-link-event/app-open";
import * as ssr from "../../supabase/functions/song-link-event/ssr";
import * as abMod from "../../supabase/functions/song-link-event/ab-variant";
import { abVariantFor } from "../../supabase/functions/song-link-event/ab-variant";

const W = { start: "2026-10-26T00:00:00Z", end: "2026-11-02T00:00:00Z" };
const IN = Date.parse("2026-10-27T12:00:00Z");
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel) Mobile Instagram";

describe("abVariantFor (pura)", () => {
  it("estável por ip_hash e só A/B em iOS", async () => {
    const a = await abVariantFor({ os: "ios", ipHash: "h1", force: null, nowMs: IN, window: W });
    for (let i = 0; i < 5; i++) expect(await abVariantFor({ os: "ios", ipHash: "h1", force: null, nowMs: IN, window: W })).toBe(a);
    expect(["A", "B"]).toContain(a);
  });
  it("aproximadamente 50/50", async () => {
    let b = 0;
    for (let i = 0; i < 2000; i++) if (await abVariantFor({ os: "ios", ipHash: `h${i}`, force: null, nowMs: IN, window: W }) === "B") b++;
    expect(b).toBeGreaterThan(900); expect(b).toBeLessThan(1100);
  });
  it("Android, sem ip_hash, fora da janela ou teste desligado → null", async () => {
    expect(await abVariantFor({ os: "android", ipHash: "h1", force: null, nowMs: IN, window: W })).toBeNull();
    expect(await abVariantFor({ os: "ios", ipHash: null, force: null, nowMs: IN, window: W })).toBeNull();
    expect(await abVariantFor({ os: "ios", ipHash: "h1", force: null, nowMs: Date.parse(W.end), window: W })).toBeNull();
    expect(await abVariantFor({ os: "ios", ipHash: "h1", force: null, nowMs: Date.parse(W.start) - 1, window: W })).toBeNull();
    expect(await abVariantFor({ os: "ios", ipHash: "h1", force: null, nowMs: IN, window: null })).toBeNull();
  });
  it("forçado grava A_forcado/B_forcado; valores inválidos ignorados", async () => {
    expect(await abVariantFor({ os: "android", ipHash: null, force: "A", nowMs: 0, window: null })).toBe("A_forcado");
    expect(await abVariantFor({ os: "ios", ipHash: "h1", force: "B", nowMs: IN, window: W })).toBe("B_forcado");
    expect(await abVariantFor({ os: "ios", ipHash: "h1", force: "b", nowMs: IN, window: null })).toBeNull();
    expect(await abVariantFor({ os: "ios", ipHash: "h1", force: "C", nowMs: IN, window: null })).toBeNull();
  });
  it("janela de produção desligada até ao passo de deploy", () => {
    expect(abMod.AB_IOS_BTN_WINDOW).toBeNull();
  });
});

const source = readFileSync("supabase/functions/song-link-event/index.ts", "utf8")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "");
const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;
const arrivalId = "00000000-0000-4000-8000-000000000001";
const ARR_AT = new Date(Date.now() - 60_000).toISOString();

async function run(ua: string, extra: Record<string, unknown>, event: "arrival" | "choice" = "choice") {
  const sent: { url: string; body: any }[] = [];
  const rpcs: any[] = [];
  const arrival = { id: "arr", origin: "ssr", event: "arrival", link_id: "link-a", created_at: ARR_AT, mode: null, fbclid: "c1", ttclid: "c2" };
  const admin = {
    from(table: string) {
      let write = false; const filters: Record<string, unknown> = {};
      const q: any = {
        select() { return q; }, order() { return q; }, limit() { return q; }, gte() { return q; }, neq() { return q; },
        eq(k: string, v: unknown) { filters[k] = v; return q; },
        insert() { write = true; return q; }, update() { write = true; return q; }, upsert() { write = true; return q; },
        result() {
          if (table === "song_links") return { data: { id: "link-a", active: true, destinations: { spotify: { app: "x" } }, meta_pixel_id: "meta-test", tiktok_pixel_id: "tiktok-test" }, error: null };
          if (table === "song_link_delivery_slots") return { data: [{ arrival_event_id: arrivalId }], error: null };
          if (write) return { data: { id: "new-row" }, error: null };
          if (table === "song_link_events") return { data: arrival.link_id === filters.link_id ? arrival : null, error: null };
          return { data: null, error: null };
        },
        async maybeSingle() { return q.result(); },
        then(r: (v: unknown) => void) { return Promise.resolve(q.result()).then(r); },
      };
      return q;
    },
    async rpc(name: string, args: any) { if (name === "song_link_event_claim") rpcs.push(args.p_payload); return { data: name === "song_link_event_claim" ? "new-row" : null, error: null }; },
  };
  let handler: ((r: Request) => Promise<Response>) | undefined;
  const env: Record<string, string> = { SUPABASE_URL: "https://backend.invalid", SUPABASE_SERVICE_ROLE_KEY: "s", SONG_LINK_IP_SALT: "s", META_CAPI_TOKEN: "s", TIKTOK_EVENTS_ACCESS_TOKEN: "s" };
  const ab = { ...abMod, AB_IOS_BTN_WINDOW: { start: "2000-01-01T00:00:00Z", end: "2100-01-01T00:00:00Z" } };
  const names = ["createClient", "lookupIpGeo", ...Object.keys(ssr), ...Object.keys(appOpen), ...Object.keys(ab), "Deno", "fetch"];
  const values = [() => admin, async () => ({ country: null, region: null, city: null }), ...Object.values(ssr), ...Object.values(appOpen), ...Object.values(ab),
    { env: { get: (k: string) => env[k] }, serve: (fn: typeof handler) => { handler = fn; } },
    async (url: string, o: RequestInit) => { sent.push({ url, body: JSON.parse(String(o.body)) }); return new Response(JSON.stringify(url.includes("facebook") ? { events_received: 1 } : { code: 0 })); }];
  new Function(...names, compiled)(...values);
  const res = await handler!(new Request("https://backend.invalid", { method: "POST",
    headers: { Origin: "https://www.mundopropicio.com", "user-agent": ua, "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({ slug: "synthetic-link", event, destination: "spotify", opened: "app",
      arrival_event_id: arrivalId, event_id: `${arrivalId}:c`, fbp: "fbp", page_url: "https://www.mundopropicio.com/m/synthetic-link", ...extra }) }));
  return { res, body: await res.json(), sent, rpcs };
}
const strip = (sent: { url: string; body: any }[]) => JSON.stringify(sent.map(x => {
  const b = structuredClone(x.body);
  for (const d of b.data ?? []) { delete d.event_time; delete d.timestamp; }
  return { url: x.url, b };
}));

describe("handler song-link-event com A/B", () => {
  it("iOS: variante na resposta e na gravação; payloads Meta/TikTok iguais aos de sem variante/forçado", async () => {
    const plain = await run(IOS, {});
    const forced = await run(IOS, { ab_force: "B" });
    expect(["A", "B"]).toContain(plain.body.ab_variant);
    expect(plain.rpcs[0].ab_variant).toBe(plain.body.ab_variant);
    expect(forced.body.ab_variant).toBe("B_forcado");
    expect(forced.rpcs[0].ab_variant).toBe("B_forcado");
    expect(plain.sent.length).toBe(2);
    expect(strip(forced.sent)).toBe(strip(plain.sent));
    expect(JSON.stringify(plain.sent)).not.toContain("ab_variant");
    expect(JSON.stringify(plain.sent)).not.toContain("_forcado");
  });
  it("cliente não decide a variante: campo ab_variant do corpo é ignorado", async () => {
    const a = await run(IOS, {});
    const b = await run(IOS, { ab_variant: a.body.ab_variant === "A" ? "B" : "A" });
    expect(b.body.ab_variant).toBe(a.body.ab_variant);
  });
  it("Android: sem variante e sem chave ab_variant na gravação", async () => {
    const r = await run(ANDROID, {});
    expect(r.body.ab_variant).toBeNull();
    expect(r.rpcs[0]).not.toHaveProperty("ab_variant");
  });
  it("arrival iOS também recebe variante", async () => {
    const r = await run(IOS, {}, "arrival");
    expect(["A", "B"]).toContain(r.body.ab_variant);
  });
});
