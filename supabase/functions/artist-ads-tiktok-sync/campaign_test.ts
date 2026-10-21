import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CAMPAIGN_REPORT, campaignDay } from "./campaign.ts";
Deno.test("canonical campaign level and cents come directly from API, not adgroup sum", () => {
  const row = campaignDay({ dimensions: { campaign_id: "1877406961537346", stat_time_day: "2026-10-19 00:00:00" },
    metrics: { spend: "100.23", impressions: "2000", clicks: "50", video_watched_6s: "12" } }, "co", "conn", "BRL", "now");
  assertEquals(CAMPAIGN_REPORT.data_level, "AUCTION_CAMPAIGN");
  assertEquals(row.level, "campaign"); assertEquals(row.spend_cents, 10023);
  assertEquals(row.external_campaign_id, "1877406961537346"); assertEquals(row.date_start, "2026-10-19");
  assertEquals(row.video_views_6s, 12);
});
Deno.test("zero spend campaigns with delayed conversions are retained", () => {
  const row = campaignDay({ dimensions: { campaign_id: "1", stat_time_day: "2026-10-19" }, metrics: { spend: "0", conversion: "3" } }, "co", "conn", "BRL", "now");
  assertEquals(row.spend_cents, 0); assertEquals(row.raw.conversion, "3");
});