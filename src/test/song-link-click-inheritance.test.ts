// @vitest-environment node
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import * as appOpen from "../../supabase/functions/song-link-event/app-open";
import * as ssr from "../../supabase/functions/song-link-event/ssr";
import * as ab from "../../supabase/functions/song-link-event/ab-variant";

// Execute the actual handler with isolated database/network/runtime adapters.
// No Deno entrypoint import, credentials, hosted data or external delivery.
const source = readFileSync("supabase/functions/song-link-event/index.ts", "utf8")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "");
const compiled = transformSync(source, { loader: "ts", format: "cjs" }).code;
const arrivalId = "00000000-0000-4000-8000-000000000001";
const createdAt = new Date(Date.now() - 60_000).toISOString();
const arrival = { id: "arrival-row", origin: "ssr", event: "arrival", link_id: "link-a",
  created_at: createdAt, mode: null, fbclid: "synthetic-meta-click", ttclid: "synthetic-tiktok-click" };

async function run(event: "choice" | "app_open", row: typeof arrival | null) {
  const sent: { url: string; body: any }[] = [];
  const inserted: any[] = [];
  const admin = {
    from(table: string) {
      let write = false;
      const filters: Record<string, unknown> = {};
      const query: any = {
        select() { return query; }, order() { return query; }, limit() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        insert(value: unknown) { inserted.push(value); write = true; return query; },
        update() { write = true; return query; }, upsert() { write = true; return query; },
        result() {
          if (table === "song_links") return { data: { id: "link-a", active: true,
            destinations: { spotify: { app: "synthetic" } }, meta_pixel_id: "meta-test",
            tiktok_pixel_id: "tiktok-test" }, error: null };
          if (table === "song_link_delivery_slots") return { data: [{ arrival_event_id: arrivalId }], error: null };
          if (write) return { data: { id: "new-row" }, error: null };
          return { data: row && row.link_id === filters.link_id ? row : null, error: null };
        },
        async maybeSingle() { return query.result(); },
        then(resolve: (v: unknown) => void) { return Promise.resolve(query.result()).then(resolve); },
      };
      return query;
    },
    async rpc() { return { data: "new-row", error: null }; },
  };
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const env: Record<string, string> = { SUPABASE_URL: "https://backend.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic",
    SONG_LINK_IP_SALT: "synthetic", META_CAPI_TOKEN: "synthetic", TIKTOK_EVENTS_ACCESS_TOKEN: "synthetic" };
  const names = ["createClient", "lookupIpGeo", ...Object.keys(ssr), ...Object.keys(appOpen), ...Object.keys(ab), "Deno", "fetch"];
  const values = [() => admin, async () => ({ country: null, region: null, city: null }),
    ...Object.values(ssr), ...Object.values(appOpen), ...Object.values(ab),
    { env: { get: (key: string) => env[key] }, serve: (fn: typeof handler) => { handler = fn; } },
    async (url: string, options: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(options.body)) });
      return new Response(JSON.stringify(url.includes("facebook") ? { events_received: 1 } : { code: 0 }));
    }];
  new Function(...names, compiled)(...values);
  if (!handler) throw new Error("handler not registered");
  const response = await handler(new Request("https://backend.invalid", {
    method: "POST", headers: { Origin: "https://www.mundopropicio.com", "user-agent": "Synthetic current device" },
    body: JSON.stringify({ slug: "synthetic-link", event, destination: "spotify", opened: "app",
      arrival_event_id: arrivalId, event_id: `${arrivalId}:open`, elapsed_ms: 100,
      fbclid: "wrong-request-click", ttclid: "wrong-request-click", fbc: "wrong-request-fbc",
      fbp: "current-fbp", ttp: "current-ttp", page_url: "https://www.mundopropicio.com/m/synthetic-link?utm_source=test" }),
  }));
  return { response, sent, inserted };
}

describe("actual song-link handler click inheritance", () => {
  it.each(["app_open", "choice"] as const)("%s sends arrival clicks and keeps current request signals", async event => {
    const { response, sent, inserted } = await run(event, arrival);
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent[0].body.data[0].user_data.fbc).toBe(`fb.1.${Date.parse(createdAt)}.synthetic-meta-click`);
    expect(sent[1].body.data[0].user.ttclid).toBe("synthetic-tiktok-click");
    expect(sent[0].body.data[0].user_data.fbp).toBe("current-fbp");
    expect(sent[0].body.data[0].user_data.client_user_agent).toBe("Synthetic current device");
    expect(sent[0].body.data[0].event_id).toBe(`${arrivalId}:open`);
    expect(sent[1].body.data[0].page.url).toContain("utm_source=test");
    if (event === "app_open") expect(inserted[0]).toMatchObject({ fbclid: arrival.fbclid, ttclid: arrival.ttclid });
  });
  it.each(["app_open", "choice"] as const)("%s without arrival clicks sends without IDs", async event => {
    const { response, sent } = await run(event, { ...arrival, fbclid: "", ttclid: "" });
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent[0].body.data[0].user_data).not.toHaveProperty("fbc");
    expect(sent[1].body.data[0].user).not.toHaveProperty("ttclid");
  });
  it.each([null, { ...arrival, link_id: "other-link" }])("choice missing/cross-link arrival sends without clicks", async row => {
    const { response, sent } = await run("choice", row);
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent[0].body.data[0].user_data).not.toHaveProperty("fbc");
    expect(sent[1].body.data[0].user).not.toHaveProperty("ttclid");
  });
  it("app_open preserves existing invalid-arrival guard", async () => {
    const { response, sent, inserted } = await run("app_open", null);
    expect(response.status).toBe(403);
    expect(sent).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });
});