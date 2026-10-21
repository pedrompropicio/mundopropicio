import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isStale } from "./freshness.ts";
Deno.test("daily source alerts only after strictly more than 48 hours", () => {
  const captured = "2026-10-05T09:40:04.262Z";
  assertEquals(isStale(captured, Date.parse("2026-10-07T09:40:04.262Z")), false);
  assertEquals(isStale(captured, Date.parse("2026-10-07T09:40:04.263Z")), true);
});
Deno.test("fresh captures and malformed capture dates do not emit stale alerts", () => {
  assertEquals(isStale("2026-10-21T09:40:00Z", Date.parse("2026-10-21T11:25:00Z")), false);
  assertEquals(isStale("invalid", Date.now()), false);
});