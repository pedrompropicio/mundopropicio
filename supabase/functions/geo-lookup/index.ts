// geo-lookup — resolve country/city/region a partir do IP do visitante via
// ipinfo.io. Chamada pública pelo portal (mundopropicio.com) com o consentimento
// já validado client-side. Não escreve em BD — apenas devolve geo.
//
// Padrão de Vault token alinhado com capi-meta-events (Deno.env não acede a
// secrets neste projeto → fallback para get_vault_secret via PostgREST).
// CORS + Origin allowlist alinhado com crm-google-click-ingest.
//
// verify_jwt = false (config.toml).

const ALLOWED_ORIGINS = new Set<string>([
  "https://www.mundopropicio.com",
  "https://mundopropicio.com",
  "https://propicio-stage-portal.lovable.app",
]);

const PORTAL_PROJECT_ID = "26b95793-17b6-478c-a6e8-745c0cfb7ed9";
const PORTAL_PREVIEW_SUFFIX = `--${PORTAL_PROJECT_ID}.lovable.app`;

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    if (u.hostname.endsWith(PORTAL_PREVIEW_SUFFIX)) return true;
  } catch {
    return false;
  }
  return false;
}

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed = isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
  });
}

function extractIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return null;
}

function isPrivateOrInvalid(ip: string): boolean {
  if (!ip) return true;
  // IPv6 loopback / unique local
  if (ip === "::1") return true;
  const low = ip.toLowerCase();
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // fc00::/7
  // IPv4
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const o = m.slice(1, 5).map(Number);
    if (o.some((n) => n < 0 || n > 255)) return true;
    if (o[0] === 10) return true;
    if (o[0] === 127) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 169 && o[1] === 254) return true; // link-local
    if (o[0] === 0) return true;
    return false;
  }
  // IPv6 básico
  if (ip.includes(":")) return false;
  return true; // não é v4 nem v6
}

let _cachedToken: string | null = null;
async function getIpinfoToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  const env = Deno.env.get("IPINFO_TOKEN");
  if (env) { _cachedToken = env; return env; }

  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!srk || !supabaseUrl) return null;

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/get_vault_secret`, {
      method: "POST",
      headers: {
        "apikey": srk,
        "Authorization": `Bearer ${srk}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
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
    else if (parsed && typeof parsed === "object" && "get_vault_secret" in parsed) {
      token = String((parsed as any).get_vault_secret);
    }
    if (token) _cachedToken = token;
    return token;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
  }

  if (!isOriginAllowed(origin)) {
    return json({ error: "forbidden_origin" }, 403, origin);
  }

  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const ip = extractIp(req);
  if (!ip || isPrivateOrInvalid(ip)) {
    return json({ ip: null, country: null, city: null, region: null }, 200, origin);
  }

  const token = await getIpinfoToken();
  if (!token) {
    console.warn("[geo-lookup] IPINFO_TOKEN indisponível — devolve nulls");
    return json({ ip, country: null, city: null, region: null }, 200, origin);
  }

  try {
    const r = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${token}`);
    if (!r.ok) {
      console.warn("[geo-lookup] ipinfo non-ok", r.status);
      return json({ ip, country: null, city: null, region: null }, 200, origin);
    }
    const j: any = await r.json();
    const country = typeof j?.country === "string" ? j.country : null;
    const city = typeof j?.city === "string" ? j.city : null;
    const region = typeof j?.region === "string" ? j.region : null;
    console.log("[geo-lookup] resolved", { country, has_city: !!city, has_region: !!region });
    return json({ ip, country, city, region }, 200, origin);
  } catch (e) {
    console.warn("[geo-lookup] fetch threw", String(e));
    return json({ ip, country: null, city: null, region: null }, 200, origin);
  }
});
