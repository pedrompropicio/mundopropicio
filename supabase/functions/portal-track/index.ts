// portal-track (#254) — beacon público do portal: grava redirect_log / lead_capture
// no servidor, com IP + geo lidos do x-forwarded-for (só com consent=true).
// O cliente NUNCA envia ip/geo. Allowlist de Origin = molde geo-lookup.
// Aceita text/plain (sendBeacon, sem preflight) e application/json.
// verify_jwt = false (config.toml) — ABERTA por desenho.
import { isPrivateOrInvalid, lookupIpGeo } from "../_shared/geo.ts";

const ALLOWED_ORIGINS = new Set<string>([
  "https://www.mundopropicio.com",
  "https://mundopropicio.com",
  "https://propicio-stage-portal.lovable.app",
  "https://coalafestival.pt",
  "https://www.coalafestival.pt",
  "https://coalafestival.lovable.app",
]);
const PORTAL_PREVIEW_SUFFIXES = [
  `--26b95793-17b6-478c-a6e8-745c0cfb7ed9.lovable.app`,
  `--bef9c59c-c2a4-453d-9aec-dae7d16c9171.lovable.app`,
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    return PORTAL_PREVIEW_SUFFIXES.some((s) => u.hostname.endsWith(s));
  } catch { return false; }
}

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": isOriginAllowed(origin) ? origin! : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (b: unknown, s: number, o: string | null) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), "Content-Type": "application/json" } });

const FIELDS: Record<string, Record<string, number | "bool" | "json">> = {
  redirect: {
    event_slug: 200, fbc: 500, fbp: 500, utm_source: 300, utm_medium: 300, utm_campaign: 300,
    utm_content: 300, client_event_id: 200, user_agent: 1000, referrer: 2000, destination_url: 2000,
  },
  lead: {
    name: 300, email: 320, phone: 50, consent_email: "bool", consent_whatsapp: "bool", event_slug: 200,
    source: 200, utm_source: 300, utm_medium: 300, utm_campaign: 300, utm_content: 300, fbc: 500,
    fbp: 500, user_agent: 1000, client_event_id: 200, raw: "json",
  },
};
const TABLE: Record<string, string> = { redirect: "redirect_log", lead: "lead_capture" };

function pick(kind: string, p: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!p || typeof p !== "object") return out;
  for (const [k, spec] of Object.entries(FIELDS[kind])) {
    const v = p[k];
    if (v === undefined || v === null) continue;
    if (spec === "bool") out[k] = v === true;
    else if (spec === "json") {
      if (typeof v === "object" && JSON.stringify(v).length <= 20000) out[k] = v;
    } else if (typeof v === "string" || typeof v === "number") out[k] = String(v).slice(0, spec);
  }
  return out; // ip_inet / geo_* nunca vêm do corpo
}

function extractIp(req: Request): string | null {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (!isOriginAllowed(origin)) return json({ ok: false, error: "forbidden_origin" }, 403, origin);
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);

  let body: any;
  try { body = JSON.parse(await req.text()); } catch { return json({ ok: false, error: "invalid_json" }, 400, origin); }
  const kind = body?.kind;
  if (kind !== "redirect" && kind !== "lead") return json({ ok: false, error: "unknown_kind" }, 400, origin);

  const row: Record<string, unknown> = pick(kind, body.payload);
  if (body.consent === true) {
    const ip = extractIp(req);
    if (ip && !isPrivateOrInvalid(ip)) {
      const g = await lookupIpGeo(ip, { timeoutMs: 2500, tag: "portal-track" });
      row.ip_inet = ip;
      row.geo_country = g.country;
      row.geo_city = g.city;
      row.geo_region = g.region;
    }
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const r = await fetch(`${url}/rest/v1/${TABLE[kind]}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      console.error("[portal-track] insert", TABLE[kind], r.status, await r.text());
      return json({ ok: false }, 500, origin);
    }
  } catch (e) {
    console.error("[portal-track] insert threw", String(e));
    return json({ ok: false }, 500, origin);
  }
  return json({ ok: true }, 200, origin);
});
