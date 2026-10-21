import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { marketCountry, regionCountries } from "./geo.ts";
Deno.test("Fortaleza API confirms BR even if local map was empty", () => {
  const map = regionCountries({ region_info: [{ location_id: "3399415", name: "Fortaleza", region_code: "BR" }] });
  assertEquals(marketCountry(["3399415"], map, "[PT]").country, "BR");
});
Deno.test("multiple countries remain NULL with an explicit gap", () => {
  const map = regionCountries([{ location_id: "1", region_code: "BR" }, { location_id: "2", region_code: "PT" }]);
  const result = marketCountry(["1", "2"], map, "[BR]");
  assertEquals(result.country, null); assertEquals(result.gap, "segmentação em vários países: BR, PT");
});
Deno.test("unresolved location cannot fall back to campaign name", () => {
  assertEquals(marketCountry(["unknown"], new Map(), "[BR]").country, null);
});
Deno.test("region follows parent country; name fallback only without targeting", () => {
  const map = regionCountries([{ location_id: "1", region_code: "BR" }, { location_id: "2", parent_id: "1" }]);
  assertEquals(marketCountry(["2"], map, "").country, "BR");
  assertEquals(marketCountry([], map, "[PT]").country, "PT");
});