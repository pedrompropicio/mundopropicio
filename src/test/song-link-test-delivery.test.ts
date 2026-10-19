import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { metaReceipt, testDeliveryPolicy } from "../../supabase/functions/song-link-event/app-open";

describe.each(["arrival", "app_open", "choice"])("test isolation %s", event => {
  it("inherits the test arrival marker, suppressing both real providers", () => {
    expect(testDeliveryPolicy(event === "arrival" ? "teste_aj19" : "android_intent",
      event === "arrival" ? null : "teste_aj19", null, null))
      .toEqual({ mode: "teste_aj19", suppressMeta: true, suppressTikTok: true });
  });
  it("Meta test code suppresses TikTok without its own code", () => {
    expect(testDeliveryPolicy(null, null, "SYNTHETICMETA", null).suppressTikTok).toBe(true);
  });
  it("explicit codes permit only test delivery", () => {
    expect(testDeliveryPolicy("teste_aj19", null, "SYNTHETICMETA", "SYNTHETICTT"))
      .toEqual({ mode: "teste_aj19", suppressMeta: false, suppressTikTok: false });
  });
  it("real traffic retains Meta and TikTok", () => {
    expect(testDeliveryPolicy("android_intent", null, null, null))
      .toEqual({ mode: "android_intent", suppressMeta: false, suppressTikTok: false });
  });
});
it("marked ViewContent never becomes real when only TikTok has a test code", () => {
  expect(testDeliveryPolicy("teste_aj19", null, null, "SYNTHETICTT").suppressMeta).toBe(true);
});
it("Meta receipt keeps event counts and trace, excluding codes and tokens", () => {
  expect(metaReceipt(JSON.stringify({ events_received: 1, fbtrace_id: "synthetic_trace",
    test_event_code: "SYNTHETICMETA", access_token: "synthetic-secret" })))
    .toEqual({ events_received: 1, fbtrace_id: "synthetic_trace" });
});
it.each(["null", "[]", "broken", '{"events_received":-1,"fbtrace_id":"bad trace"}'])
  ("malformed receipt fails safely: %s", raw => {
    expect(metaReceipt(raw)).toEqual({ events_received: null, fbtrace_id: null });
  });
it("suppression precedes tokens and reservation; inherited mode is used for claiming", () => {
  const src = readFileSync("supabase/functions/song-link-event/index.ts", "utf8");
  const meta = src.slice(src.indexOf('if (testPolicy.suppressMeta)'));
  const tt = src.slice(src.indexOf('if (testPolicy.suppressTikTok)'));
  expect(meta.indexOf('reserveSlot')).toBeGreaterThan(0);
  expect(tt.indexOf('reserveSlot')).toBeGreaterThan(0);
  expect(src.indexOf('const testPolicy =')).toBeLessThan(src.indexOf('admin.rpc("song_link_event_claim"'));
  expect(src).toContain('mode: testPolicy.mode');
  expect(src).toContain('event_id: metaEventId, ...metaReceipt(rt)');
});