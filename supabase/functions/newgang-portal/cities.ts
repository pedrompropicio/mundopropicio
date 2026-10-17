import { optionalRead, type Rpc } from "./profile.ts";
type Municipality = { code: string; name: string; region: string };
type Cities = { country: "PT"; version: string; cities: Municipality[] };
export function createCitiesReader(rpc: Rpc, now: () => number = Date.now) {
  let cache: { at: number; data: Cities } | null = null;
  return async () => {
    if (cache && now() - cache.at < 60_000) return { status: 200, body: cache.data };
    try {
      const { data, error } = await optionalRead(() => rpc("club_cities", {}));
      if (error || !data || typeof data !== "object") throw new Error("cities_unavailable");
      const value = data as Partial<Cities>;
      if (value.country !== "PT" || value.version !== "caop-2025" || !Array.isArray(value.cities) || value.cities.length !== 308) throw new Error("cities_unavailable");
      const cities: Municipality[] = [];
      for (const row of value.cities) {
        if (!row || typeof row.code !== "string" || !/^\d{4}$/.test(row.code) || typeof row.name !== "string" || !row.name || !["Continente", "Açores", "Madeira"].includes(row.region)) throw new Error("cities_unavailable");
        cities.push({ code: row.code, name: row.name, region: row.region });
      }
      if (new Set(cities.map(row => row.code)).size !== 308) throw new Error("cities_unavailable");
      const body: Cities = { country: "PT", version: "caop-2025", cities };
      cache = { at: now(), data: body };
      return { status: 200, body };
    } catch { return { status: 503, body: { error: "cities_unavailable" } }; }
  };
}
