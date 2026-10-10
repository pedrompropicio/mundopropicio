import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validSsrKey, prefetchDetail, botName } from "../../supabase/functions/song-link-event/ssr";

describe("song link SSR", () => {
  it("requires a configured matching key", async () => {
    expect(await validSsrKey("test-fixture", undefined)).toBe(false);
    expect(await validSsrKey(null, "test-fixture")).toBe(false);
    expect(await validSsrKey("wrong", "test-fixture")).toBe(false);
    expect(await validSsrKey("test-fixture", "test-fixture")).toBe(true);
  });
  it.each(["facebookexternalhit", "Facebot", "WhatsApp", "Twitterbot", "Slackbot", "TelegramBot", "Googlebot", "bingbot"])("excludes %s", ua => {
    expect(botName(ua)).not.toBeNull();
    expect(prefetchDetail(false, null, ua)).toBe(ua);
  });
  it("bounds diagnostics and preserves genuine Meta browsers", () => {
    expect(prefetchDetail(true, "a".repeat(100), "Mozilla")).toHaveLength(60);
    expect(prefetchDetail(false, null, "Mozilla iPhone Instagram FBAV/123")).toBeNull();
    expect(prefetchDetail(true, "prefetch", "Mozilla")).toBe("prefetch");
  });
  it("claims before delivery and stops duplicates", () => {
    const source = readFileSync("supabase/functions/song-link-event/index.ts", "utf8");
    expect(source.indexOf('admin.rpc("song_link_event_claim"')).toBeLessThan(source.indexOf('fetch(`https://graph.facebook.com'));
    expect(source.indexOf('duplicate: true')).toBeLessThan(source.indexOf('fetch(`https://graph.facebook.com'));
    expect(source).toContain('origin: isSsr ? "ssr" : "browser"');
  });
});