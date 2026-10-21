import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isStale } from "./freshness.ts";
import { alreadyOpen, followed, regularDays, selectSources } from "./eligibility.ts";
import { dailySourceAlerts } from "./freshness.ts";
Deno.test("daily source alerts only after strictly more than 48 hours", () => {
  const captured = "2026-10-05T09:40:04.262Z";
  assertEquals(isStale(captured, Date.parse("2026-10-07T09:40:04.262Z")), false);
  assertEquals(isStale(captured, Date.parse("2026-10-07T09:40:04.263Z")), true);
});
Deno.test("fresh captures and malformed capture dates do not emit stale alerts", () => {
  assertEquals(isStale("2026-10-21T09:40:00Z", Date.parse("2026-10-21T11:25:00Z")), false);
  assertEquals(isStale("invalid", Date.now()), false);
});
Deno.test("daily cadence requires five distinct prior capture days within fourteen days", () => {
  const last = "2026-10-05T09:40:00Z";
  const rows = [22, 23, 24, 25, 26].map((d) => ({ source: "aggregator", captured_at: `2026-09-${d}T09:40:00Z` }));
  assertEquals(regularDays(rows.slice(0, 4), last), 4);
  assertEquals(regularDays(rows, last), 5);
  assertEquals(regularDays([...rows, ...rows], last), 5);
  assertEquals(regularDays([{ source: "aggregator", captured_at: "2026-09-20T09:40:00Z" }], last), 0);
});
Deno.test("one-time reference captures and batched backfills never create daily sources", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ source: "aggregator", metric_date: `2026-09-${i+1}`,
    captured_at: "2026-09-13T15:37:00Z" }));
  assertEquals(regularDays(rows, "2026-09-14T09:40:00Z"), 1);
  assertEquals(regularDays([22,23,24,25,26].map((d) => ({ source: "aggregator", source_ref: "backfill",
    captured_at: `2026-09-${d}T09:40:00Z` })), "2026-10-05T09:40:00Z"), 0);
});
Deno.test("only active tracked songs of active non-reference roster artists qualify", () => {
  const a = { id: "artist", status: "ativo", roster_type: "elenco" };
  const s = { artist_id: "artist", tracking_status: "ativo", is_reference: false };
  assertEquals(followed(s, a), true);
  assertEquals(followed(s, { ...a, status: "inativo" }), false);
  assertEquals(followed(s, { ...a, roster_type: "referencia" }), false);
  assertEquals(followed({ ...s, is_reference: true }, a), false);
  assertEquals(followed({ ...s, tracking_status: "catalogo" }, a), false);
});
const artist = { id: "artist", name: "Litto", status: "ativo", roster_type: "elenco" };
const song = { id: "song", artist_id: "artist", company_id: "company", title: "Roupa De Solteira", tracking_status: "ativo", is_reference: false };
const captures = ["2026-09-22", "2026-09-23", "2026-09-24", "2026-10-03", "2026-10-04", "2026-10-05"].map((d,i) => ({
  id: String(i), song_id: "song", artist_id: "artist", company_id: "company", platform: "tiktok", source: "tiktok_artists", captured_at: `${d}T09:40:00Z`,
}));
Deno.test("Litto is selected while a reference benchmark and single aggregator capture are excluded", () => {
  const rows = selectSources([...captures, { ...captures[0], source: "aggregator" }], [song], [artist], Date.parse("2026-10-21T11:41:00Z"));
  assertEquals(rows.length, 1); assertEquals(rows[0].source, "tiktok_artists"); assertEquals(rows[0].capture_days, 5);
});
Deno.test("source stays deduplicated across days until a newer capture resolves it", () => {
  const row = { key: "source", captured_at: "2026-10-05T09:40:00Z" };
  const history = [{ status: "success", started_at: "2026-10-21T11:36:00Z", details: { keys: ["source"] } }];
  assertEquals(alreadyOpen(row, history), true);
  assertEquals(alreadyOpen({ ...row, captured_at: "2026-10-22T09:40:00Z" }, history), false);
});
Deno.test("multiple missing sources enqueue one summary; existing atomic claim prevents a second enqueue", async () => {
  let calls = 0; let claimed = false;
  const admin = {
    from(table: string) {
      let op = "read";
      const q: any = {
        select() { return q; }, order() { return q; }, range() { return q; }, eq() { return q; }, limit() { return q; },
        maybeSingle() { return Promise.resolve({ data: { token: "local-test-token" }, error: null }); },
        upsert() { op = "claim"; return q; }, update() { op = "update"; return q; },
        then(resolve: any) {
          let data: any = [];
          if (op === "claim") { data = claimed ? [] : [{ id: "claim" }]; claimed = true; }
          else if (table === "artist_song_metrics_daily") data = [...captures, ...captures.map((r) => ({ ...r, source: "other_daily" }))];
          else if (table === "artist_songs") data = [song];
          else if (table === "artists") data = [artist];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      }; return q;
    },
    rpc(_name: string, args: any) { calls++; assertEquals(args.payload.text.split("\n").length, 2); return Promise.resolve({ data: 1, error: null }); },
  };
  assertEquals((await dailySourceAlerts(admin, false)).queued, 1);
  assertEquals((await dailySourceAlerts(admin, false)).queued, 0);
  assertEquals(calls, 1);
});