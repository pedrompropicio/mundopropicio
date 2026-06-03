// Resolução determinística pós-LLM de geo "raio à volta de cidade".
// O LLM gera por vezes geo_locations.custom_locations=[{address_string, distance}]
// SEM latitude/longitude — a Meta rejeita com HTTP 500 "unknown error". Este
// helper resolve a cidade via Graph /search?type=adgeolocation e substitui in-place
// por geo_locations.cities=[{key, radius, distance_unit}] (formato Meta-válido).
//
// custom_locations COM lat/lng são válidos — NÃO são tocados.
//
// Defensivo: se accessToken é null OU /search falha OU não há match, NUNCA deixa
// address_string cru chegar à Meta — faz fallback para geo_locations.countries
// derivado do país do address_string (ou ["PT"]) com warning.
//
// Partilhado por crm-meta-campaign-strategy-generate e crm-meta-campaign-redesign.
// ALTERAR AQUI implica re-deploy das DUAS funções.

import type { ResolveCtx } from "./resolve-interests.ts";

interface MetaCity { key: string; radius: number; distance_unit: string }

// Meta cities radius: 1–80 km (ou 1–50 milhas). Aqui normalizamos a km.
function clampRadius(n: any): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 25; // default sensato
  return Math.min(80, Math.max(1, Math.round(v)));
}

// "Lisboa, Portugal" → { city: "Lisboa", country: "Portugal" }
function parseAddress(addr: any): { city: string | null; country: string | null } {
  if (typeof addr !== "string" || !addr.trim()) return { city: null, country: null };
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, country: null };
  return {
    city: parts[0] || null,
    country: parts.length > 1 ? parts[parts.length - 1] : null,
  };
}

// "Portugal"→PT, "Brasil"/"Brazil"→BR, já-ISO "PT"/"BR" passam. Senão null.
function isoFromCountry(country: string | null): string | null {
  if (!country) return null;
  const c = country.trim().toLowerCase();
  if (c === "portugal" || c === "pt") return "PT";
  if (c === "brasil" || c === "brazil" || c === "br") return "BR";
  return null;
}

function hasCoords(item: any): boolean {
  return item && typeof item === "object" &&
    item.latitude != null && item.longitude != null &&
    Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
}

async function searchCity(city: string, iso: string | null, ctx: ResolveCtx): Promise<string | null> {
  if (!ctx.accessToken) return null;
  try {
    const u = new URL(`https://graph.facebook.com/${ctx.apiVersion}/search`);
    u.searchParams.set("type", "adgeolocation");
    u.searchParams.set("location_types", '["city"]');
    u.searchParams.set("q", city);
    u.searchParams.set("limit", "10");
    u.searchParams.set("locale", ctx.locale ?? "pt_PT");
    u.searchParams.set("access_token", ctx.accessToken);
    const r = await fetch(u.toString());
    const j: any = await r.json();
    if (!r.ok || j?.error) {
      console.warn("[resolve-geo] /search non-ok", j?.error?.message ?? r.status);
      return null;
    }
    const data: any[] = Array.isArray(j?.data) ? j.data : [];
    if (data.length === 0) return null;
    // Preferir match cujo country_code bata com o país do address_string.
    if (iso) {
      const byCountry = data.find((d: any) =>
        typeof d?.key === "string" && d.key &&
        String(d?.country_code ?? "").toUpperCase() === iso);
      if (byCountry) return String(byCountry.key);
    }
    const first = data.find((d: any) => typeof d?.key === "string" && d.key);
    return first ? String(first.key) : null;
  } catch (e) {
    console.warn("[resolve-geo] /search threw", String(e));
    return null;
  }
}

export async function resolveCustomLocationsInPlace(plan: any, ctx: ResolveCtx): Promise<string[]> {
  const warnings: string[] = [];
  if (!plan || typeof plan !== "object") return warnings;
  const cache = new Map<string, string | null>(); // cidadeLower → key|null

  if (!ctx.accessToken) {
    warnings.push("geo resolution skipped: meta access token unavailable (custom_locations → countries fallback defensivo)");
  }

  for (const c of plan.recommended_campaigns ?? []) {
    for (const a of c.adsets ?? []) {
      const t = a?.targeting_json;
      if (!t || typeof t !== "object") continue;
      const geo = t.geo_locations;
      if (!geo || typeof geo !== "object" || !Array.isArray(geo.custom_locations)) continue;
      const adsetCtx = `adset "${a?.adset_name ?? "?"}"`;

      const keepCoordItems: any[] = [];
      const citiesToAdd: MetaCity[] = [];
      const fallbackIsos = new Set<string>();
      let touched = false;

      for (const loc of geo.custom_locations) {
        // custom_location com coords reais → válido, preservar intacto.
        if (hasCoords(loc)) { keepCoordItems.push(loc); continue; }

        const { city, country } = parseAddress(loc?.address_string);
        const iso = isoFromCountry(country);
        const radius = clampRadius(loc?.distance ?? loc?.radius);

        if (!city) {
          // Sem address_string utilizável nem coords → não há como resolver.
          touched = true;
          if (iso) fallbackIsos.add(iso);
          warnings.push(`${adsetCtx} geo: custom_location sem cidade utilizável (${JSON.stringify(loc)?.slice(0, 80)}) — fallback countries`);
          continue;
        }

        touched = true;
        const key = city.toLowerCase();
        let resolved = cache.get(key);
        if (resolved === undefined) {
          resolved = await searchCity(city, iso, ctx);
          cache.set(key, resolved);
        }

        if (resolved) {
          citiesToAdd.push({ key: resolved, radius, distance_unit: "kilometer" });
        } else {
          if (iso) fallbackIsos.add(iso);
          warnings.push(`${adsetCtx} geo: cidade "${city}" não resolvida na Meta — fallback countries`);
        }
      }

      if (!touched) continue; // só itens com coords → nada a fazer

      // Reescrever geo_locations.custom_locations: manter só os de coords reais.
      if (keepCoordItems.length > 0) {
        geo.custom_locations = keepCoordItems;
      } else {
        delete geo.custom_locations;
      }

      // Acrescentar cidades resolvidas (coexistem bem com countries/regions na Meta).
      if (citiesToAdd.length > 0) {
        const existing = Array.isArray(geo.cities) ? geo.cities : [];
        geo.cities = [...existing, ...citiesToAdd];
      }

      // Fallback countries para o que não resolveu (NUNCA address_string cru).
      if (fallbackIsos.size > 0) {
        const existing = Array.isArray(geo.countries) ? geo.countries : [];
        const merged = new Set<string>([...existing, ...fallbackIsos]);
        geo.countries = [...merged];
      } else if (!geo.cities && !geo.countries && !geo.regions && !geo.custom_locations) {
        // Defensivo extremo: geo ficou vazio (nada resolveu, sem país) → não deixar
        // geo_locations vazio (Meta exige pelo menos um critério).
        geo.countries = ["PT"];
        warnings.push(`${adsetCtx} geo: sem critério resolúvel — countries=["PT"] por defeito`);
      }
    }
  }

  return warnings;
}
