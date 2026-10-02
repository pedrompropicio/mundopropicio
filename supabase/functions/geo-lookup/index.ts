// geo-lookup — resolve country/city/region a partir do IP do visitante via
// ipinfo.io. Chamada pública pelos portais (mundopropicio.com e
// coalafestival.pt) com o consentimento já validado client-side. Não escreve
// em BD — apenas devolve geo.
//
// Padrão de Vault token alinhado com capi-meta-events (Deno.env não acede a
// secrets neste projeto → fallback para get_vault_secret via PostgREST).
// CORS + Origin allowlist alinhado com crm-google-click-ingest.
//
// verify_jwt = false (config.toml).

import { isPrivateOrInvalid, lookupIpGeo } from "../_shared/geo.ts";

const ALLOWED_ORIGINS = new Set<string>([
  "https://www.mundopropicio.com",
  "https://mundopropicio.com",
  "https://propicio-stage-portal.lovable.app",
  "https://coalafestival.pt",
  "https://www.coalafestival.pt",
  "https://coalafestival.lovable.app",
]);

const PORTAL_PREVIEW_SUFFIXES: string[] = [
  `--26b95793-17b6-478c-a6e8-745c0cfb7ed9.lovable.app`, // portal MP
  `--bef9c59c-c2a4-453d-9aec-dae7d16c9171.lovable.app`, // portal Coala
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    for (const suffix of PORTAL_PREVIEW_SUFFIXES) {
      if (u.hostname.endsWith(suffix)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed = isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
  }

  if (!isOriginAllowed(origin)) {
    return json({ error: "forbidden_origin" }, 403, origin);
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const ip = extractIp(req);
  if (!ip || isPrivateOrInvalid(ip)) {
    return json({ ip: null, country: null, city: null, region: null }, 200, origin);
  }

  const g = await lookupIpGeo(ip, { tag: "geo-lookup" });
  if (g.country || g.city || g.region) {
    console.log("[geo-lookup] resolved", { country: g.country, has_city: !!g.city, has_region: !!g.region });
  }
  return json({ ip, country: g.country, city: g.city, region: g.region }, 200, origin);
});
