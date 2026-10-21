export type GeoRow = { geo_id: string; country: string; nome: string | null };

/** Region codes for cities/states may be BR-CE; follow parents if absent. */
export function regionCountries(data: unknown): Map<string, GeoRow> {
  const nodes = new Map<string, Record<string, unknown>>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    const x = v as Record<string, unknown>;
    if (x.location_id != null) nodes.set(String(x.location_id), x);
    for (const child of Object.values(x)) walk(child);
  };
  walk(data);
  const out = new Map<string, GeoRow>();
  for (const [id, node] of nodes) {
    let x: Record<string, unknown> | undefined = node;
    const seen = new Set<string>();
    while (x) {
      const iso = String(x.region_code ?? "").toUpperCase().split("-")[0];
      if (/^[A-Z]{2}$/.test(iso)) {
        out.set(id, { geo_id: id, country: iso, nome: typeof node.name === "string" ? node.name : null });
        break;
      }
      const parent = String(x.parent_id ?? "");
      if (seen.has(parent)) break;
      seen.add(parent); x = nodes.get(parent);
    }
  }
  return out;
}

export function marketCountry(ids: string[], map: Map<string, GeoRow>, name: string) {
  if (ids.length) {
    const missing = ids.filter((id) => !map.has(id));
    const countries = [...new Set(ids.map((id) => map.get(id)?.country).filter((x): x is string => !!x))];
    if (missing.length) return { country: null, gap: `segmentação por resolver: ${missing.join(", ")}`, countries };
    if (countries.length !== 1) return { country: null, gap: `segmentação em vários países: ${countries.join(", ")}`, countries };
    return { country: countries[0], gap: null, countries };
  }
  // Fallback only without targeting; never override ambiguous/unknown targeting.
  const tags = [...name.matchAll(/(?:\[|\b)(BR|PT)(?:\]|\b)/gi)].map((x) => x[1].toUpperCase());
  const countries = [...new Set(tags)];
  return countries.length === 1
    ? { country: countries[0], gap: null, countries }
    : { country: null, gap: "sem segmentação nem país inequívoco no nome", countries };
}