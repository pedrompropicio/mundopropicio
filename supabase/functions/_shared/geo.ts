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

/** Resolve o IP no ipinfo. Nunca atira: em qualquer falha devolve nulls. */
export async function lookupIpGeo(ip: string, opts: { timeoutMs?: number; tag?: string } = {}): Promise<Geo> {
  const tag = opts.tag ?? "geo";
  if (!ip || isPrivateOrInvalid(ip)) return NULL_GEO;
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
      return NULL_GEO;
    }
    const j: any = await r.json();
    return {
      country: typeof j?.country === "string" ? j.country : null,
      city: typeof j?.city === "string" ? j.city : null,
      region: typeof j?.region === "string" ? j.region : null,
    };
  } catch (e) {
    console.warn(`[${tag}] fetch threw`, String(e));
    return NULL_GEO;
  }
}
