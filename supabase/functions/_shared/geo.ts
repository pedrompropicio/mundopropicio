// Resolução de geo por IP via ipinfo.io (D-ERP159). Partilhado por geo-lookup e
// song-link-event. Token: Deno.env IPINFO_TOKEN; senão Vault via get_vault_secret.
// ALTERAR AQUI implica re-deploy das DUAS funções.

export interface Geo { country: string | null; city: string | null; region: string | null }

export function isPrivateOrInvalid(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1") return true;
  const low = ip.toLowerCase();
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // fc00::/7
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const o = m.slice(1, 5).map(Number);
    if (o.some((n) => n < 0 || n > 255)) return true;
    if (o[0] === 10) return true;
    if (o[0] === 127) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 169 && o[1] === 254) return true;
    if (o[0] === 0) return true;
    return false;
  }
  if (ip.includes(":")) return false;
  return true;
}

let _cachedToken: string | null = null;
export async function getIpinfoToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  const env = Deno.env.get("IPINFO_TOKEN");
  if (env) { _cachedToken = env; return env; }
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!srk || !supabaseUrl) return null;
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/get_vault_secret`, {
      method: "POST",
      headers: { apikey: srk, Authorization: `Bearer ${srk}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ _name: "IPINFO_TOKEN" }),
    });
    if (!r.ok) return null;
    const raw = await r.text();
    if (!raw) return null;
    let parsed: any = raw;
    try { parsed = JSON.parse(raw); } catch { /* raw */ }
    let token: string | null = null;
    if (Array.isArray(parsed) && parsed.length > 0) token = String(parsed[0]);
    else if (typeof parsed === "string") token = parsed;
    else if (parsed && typeof parsed === "object" && "get_vault_secret" in parsed) token = String(parsed.get_vault_secret);
    if (token) _cachedToken = token;
    return token;
  } catch {
    return null;
  }
}

const NULL_GEO: Geo = { country: null, city: null, region: null };

// #254: cache em public.ip_geo_cache (só service_role). REGRA: o ipinfo nunca
// se chama sem passar pela cache. Falha da tabela → fail-soft (ipinfo como antes).
export const GEO_CACHE_TTL_MS = 30 * 24 * 3600 * 1000;

function restCfg(): { url: string; key: string } | null {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  return key && url ? { url, key } : null;
}

export function isCacheFresh(resolvedAt: string | null | undefined, now = Date.now()): boolean {
  if (!resolvedAt) return false;
  const t = Date.parse(resolvedAt);
  return Number.isFinite(t) && now - t < GEO_CACHE_TTL_MS;
}

async function cacheGet(ip: string, tag: string): Promise<Geo | null> {
  const c = restCfg();
  if (!c) return null;
  try {
    const r = await fetch(
      `${c.url}/rest/v1/ip_geo_cache?ip=eq.${encodeURIComponent(ip)}&select=country,city,region,resolved_at`,
      { headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, Accept: "application/json" }, signal: AbortSignal.timeout(1500) },
    );
    if (!r.ok) { console.warn(`[${tag}] cache get non-ok`, r.status); return null; }
    const rows: any[] = await r.json();
    const row = rows?.[0];
    if (!row || !isCacheFresh(row.resolved_at)) return null;
    return { country: row.country ?? null, city: row.city ?? null, region: row.region ?? null };
  } catch (e) {
    console.warn(`[${tag}] cache get threw`, String(e));
    return null;
  }
}

async function cachePut(ip: string, g: Geo, tag: string): Promise<void> {
  const c = restCfg();
  if (!c) return;
  try {
    const r = await fetch(`${c.url}/rest/v1/ip_geo_cache?on_conflict=ip`, {
      method: "POST",
      headers: {
        apikey: c.key, Authorization: `Bearer ${c.key}`, "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ ip, ...g, resolved_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) console.warn(`[${tag}] cache put non-ok`, r.status);
  } catch (e) {
    console.warn(`[${tag}] cache put threw`, String(e));
  }
}

/** Resolve o IP (cache 30d → ipinfo). Nunca atira: em qualquer falha devolve nulls. */
export async function lookupIpGeo(ip: string, opts: { timeoutMs?: number; tag?: string } = {}): Promise<Geo> {
  const tag = opts.tag ?? "geo";
  if (!ip || isPrivateOrInvalid(ip)) return NULL_GEO;
  const cached = await cacheGet(ip, tag);
  if (cached) return cached;
  const token = await getIpinfoToken();
  if (!token) {
    console.warn(`[${tag}] IPINFO_TOKEN indisponível — devolve nulls`);
    return NULL_GEO;
  }
  try {
    const r = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${token}`,
      opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : undefined);
    if (!r.ok) {
      console.warn(`[${tag}] ipinfo non-ok`, r.status);
      return NULL_GEO; // erro HTTP (ex.: 429) não se guarda — volta a tentar
    }
    const j: any = await r.json();
    const g: Geo = {
      country: typeof j?.country === "string" ? j.country : null,
      city: typeof j?.city === "string" ? j.city : null,
      region: typeof j?.region === "string" ? j.region : null,
    };
    await cachePut(ip, g, tag); // também com country null (respeita o TTL)
    return g;
  } catch (e) {
    console.warn(`[${tag}] fetch threw`, String(e));
    return NULL_GEO;
  }
}
