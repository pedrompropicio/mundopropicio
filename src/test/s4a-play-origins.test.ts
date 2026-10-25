import { describe, it, expect } from "vitest";
import { estimateDaily, playlistRows, playlistCategory, responseShape, soundDailySummary, SOURCE_ORIGIN_CAPTURE_ENABLED } from "../../supabase/functions/_shared/s4a-play-origins";
describe("S4A daily playlist origins", () => {
  it("keeps unapproved origin capture disabled", () => expect(SOURCE_ORIGIN_CAPTURE_ENABLED).toBe(false));
  it("uses actual day and period without copying a window to earlier days", () => {
    const { rows } = playlistRows([{ title: "Radio", uri: "spotify:playlist:radio", streams: "36634", author: "Spotify" }], "2026-10-23", 1);
    expect(rows[0]).toMatchObject({ snapshot_date: "2026-10-23", period_days: 1, streams: 36634 });
    expect(playlistCategory(rows[0])).toBe("radio");
  });
  it("deduplicates by URI retaining highest streams, not by truncated title", () => {
    const result = playlistRows([{ title: "Same", uri: "a", streams: 10 }, { title: "Same", uri: "a", streams: 20 }, { title: "Same", uri: "b", streams: 5 }], "2026-10-23", 28);
    expect(result.rows.map(r => r.streams)).toEqual([20, 5]); expect(result.notes).toHaveLength(1);
  });
  it("distinguishes missing streams from genuine zero", () => expect(playlistRows([{ title: "Missing" }, { title: "Zero", streams: "0" }], "2026-10-23", 1).rows.map(r => r.streams)).toEqual([null, 0]));
  it("classifies mixes, other Spotify and listener playlists separately", () => {
    expect(playlistRows([{ title: "Mixes", author: "Spotify" }, { title: "Editorial", author: "Spotify" }, { title: "Radio", author: "Listener" }], "2026-10-23", 1).rows.map(playlistCategory)).toEqual(["mixes", "other_spotify", "listener_playlists"]);
  });
  it("exposes types only in shapes", () => expect(responseShape({ streams: "123", data: [{ isAlgorithmic: true }] })).toEqual({ streams: "string", data: [{ isAlgorithmic: "boolean" }] }));
  it("anchors release boundary to zero before release", () => {
    expect([...estimateDaily(new Map([["2026-09-02", 10], ["2026-09-03", 25]]), "2026-09-02", "2026-09-01", "2026-09-03")]).toEqual([["2026-09-01", 0], ["2026-09-02", 10], ["2026-09-03", 15]]);
  });
  it("adds the exact D-28 daily count", () => {
    const result = estimateDaily(new Map([["2026-09-29", 100], ["2026-09-30", 120]]), "2026-09-02", "2026-09-30", "2026-09-30", new Map([["2026-09-02", 7]]));
    expect(result.get("2026-09-30")).toBe(27);
  });
  it("never interpolates a missing snapshot", () => {
    const result = estimateDaily(new Map([["2026-09-02", 10], ["2026-09-04", 25]]), "2026-09-02", "2026-09-02", "2026-09-04");
    expect([...result.values()]).toEqual([10, null, null]);
  });
  it("missing seed D-28 stays null, not an invented average", () => expect(estimateDaily(new Map([["2026-10-22", 100], ["2026-10-23", 120]]), "2026-09-02", "2026-10-23", "2026-10-23").get("2026-10-23")).toBeNull());
  it("contradictory negative derivation stays unknown", () => expect(estimateDaily(new Map([["2026-09-02", 10], ["2026-09-03", 5]]), "2026-09-02", "2026-09-03", "2026-09-03").get("2026-09-03")).toBeNull());
});
describe("UGC day comparison", () => {
  const row = (day: string, music_id: string, video_count: number, source = "apify") => ({ metric_date: day, music_id, video_count, source });
  it("detects even small decreases and preserves the signed difference", () => {
    expect(soundDailySummary([row("2026-10-18", "synthetic", 100), row("2026-10-19", "synthetic", 99)], "2026-10-19", "2026-10-19")[0]).toMatchObject({ total: 99, new_videos: -1, drop: true, same_sounds: true, same_sources: true });
  });
  it("does not compute growth across missing calendar days", () => expect(soundDailySummary([row("2026-10-17", "a", 2), row("2026-10-19", "a", 5)], "2026-10-18", "2026-10-19").map(r => r.new_videos)).toEqual([null, null]));
  it("flags change of sound set instead of claiming deleted videos", () => expect(soundDailySummary([row("2026-10-18", "a", 100), row("2026-10-19", "b", 10)], "2026-10-19", "2026-10-19")[0]).toMatchObject({ drop: true, same_sounds: false, same_sources: null }));
  it("identifies a changed source", () => expect(soundDailySummary([row("2026-10-18", "a", 100), row("2026-10-19", "a", 50, "platform")], "2026-10-19", "2026-10-19")[0].same_sources).toBe(false));
  it("rejects duplicate readings instead of double counting", () => expect(() => soundDailySummary([row("2026-10-18", "a", 1), row("2026-10-18", "a", 2)], "2026-10-18", "2026-10-18")).toThrow("duplicate_sound_day"));
});