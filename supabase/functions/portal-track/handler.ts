// portal-track (#254) — beacon público do portal: grava redirect_log / lead_capture
// no servidor, com IP + geo lidos do x-forwarded-for (só com consent=true).
// O cliente NUNCA envia ip/geo. Allowlist de Origin = molde geo-lookup.
// Aceita text/plain (sendBeacon, sem preflight) e application/json.
// verify_jwt = false (config.toml) — ABERTA por desenho.
import { consentRecordResponse, interpretBind, parseConsentDecision, portalForOrigin, readConsentReceipt, readConsentToken, stripMetaIdentifiers } from "../_shared/consent-contract.ts";
import { hasConsentVersionFields, resolveConsentVersions } from "./consent-versions.ts";

export type Deps = {
  fetch: typeof fetch;
  env: (k: string) => string | undefined;
  lookupIpGeo: (ip: string, o: { timeoutMs: number; tag: string }) => Promise<{ country: string | null; city: string | null; region: string | null }>;
  isPrivateOrInvalid: (ip: string) => boolean;
};

const ALLOWED_ORIGINS = new Set<string>([
  "https://www.mundopropicio.com",
  "https://mundopropicio.com",
  "https://propicio-stage-portal.lovable.app",
  "https://coalafestival.pt",
  "https://www.coalafestival.pt",
  "https://coalafestival.lovable.app",
  "https://newgangfestival.pt",
  "https://www.newgangfestival.pt",
  "https://newgang-fest-portal.lovable.app",
]);
const PORTAL_PREVIEW_SUFFIXES = [
  `--26b95793-17b6-478c-a6e8-745c0cfb7ed9.lovable.app`,
  `--bef9c59c-c2a4-453d-9aec-dae7d16c9171.lovable.app`,
  `--1a915f50-55ca-4bb6-9abe-8f241c54647a.lovable.app`, // portal Newgang
];

// #306 fase 1: company_id é do servidor, derivado do Origin validado — o corpo nunca o define.
const MP_COMPANY = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const COALA_COMPANY = "7d831e59-6e82-427b-95a0-64904aae5dd2";
const ORIGIN_COMPANY: Record<string, string> = {
  "https://mundopropicio.com": MP_COMPANY,
  "https://www.mundopropicio.com": MP_COMPANY,
  "https://coalafestival.pt": COALA_COMPANY,
  "https://www.coalafestival.pt": COALA_COMPANY,
  "https://coalafestival.lovable.app": COALA_COMPANY,
  "https://newgangfestival.pt": MP_COMPANY,
  "https://www.newgangfestival.pt": MP_COMPANY,
  "https://newgang-fest-portal.lovable.app": MP_COMPANY,
};
const PREVIEW_COMPANY: Array<[string, string]> = [
  [`--26b95793-17b6-478c-a6e8-745c0cfb7ed9.lovable.app`, MP_COMPANY],
  [`--bef9c59c-c2a4-453d-9aec-dae7d16c9171.lovable.app`, COALA_COMPANY],
  [`--1a915f50-55ca-4bb6-9abe-8f241c54647a.lovable.app`, MP_COMPANY],
];
// Só lead_capture tem company_id (redirect_log não tem — verificado em information_schema, 11/10/2026).
const TABLES_WITH_COMPANY = new Set<string>(["lead_capture"]);

function companyForOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (ORIGIN_COMPANY[origin]) return ORIGIN_COMPANY[origin];
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return null;
    for (const [suf, c] of PREVIEW_COMPANY) if (u.hostname.endsWith(suf)) return c;
  } catch { /* noop */ }
  return null;
}

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

// song_link_client_fail: aviso anónimo do Portal quando o browser falha a confirmar
// a chegada (D-ERP234 adenda 3). Grava em song_link_diag, sem IP nem UA completo.
const CLIENT_FAIL_REASONS = new Set(["send_failed", "left_before_confirm"]);
const DIAG_KINDS = new Set([
  "shown", "tap_button", "tap_other", "hidden", "visible", "pagehide", "redirect", "prefetch",
  "feedback_shown", "tap_repeat_blocked",
]);

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  if (typeof out.client_event_id === "string" && !UUID_RE.test(out.client_event_id)) delete out.client_event_id;
  // Portal Newgang (F1): referral_code e ttclid de topo ficam em raw (lead e redirect não têm colunas próprias).
  if (kind === "lead") {
    const extra: Record<string, string> = {};
    for (const k of ["referral_code", "ttclid"]) {
      const v = p[k];
      if (typeof v === "string" && v.trim()) extra[k] = v.trim().slice(0, k === "ttclid" ? 500 : 32);
    }
    if (Object.keys(extra).length) out.raw = { ...((out.raw as Record<string, unknown>) ?? {}), ...extra };
  }
  return out; // ip_inet / geo_* nunca vêm do corpo
}

function extractIp(req: Request): string | null {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || null;
}

export function createHandler(deps: Deps) {
const { fetch, lookupIpGeo, isPrivateOrInvalid } = deps;
return async (req: Request): Promise<Response> => {
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
  if (kind !== "redirect" && kind !== "lead" && kind !== "song_link_client_fail" && kind !== "consent" && kind !== "diag" && kind !== "song_link_diag") {
    return json({ ok: false, error: "unknown_kind" }, 400, origin);
  }

  const url = deps.env("SUPABASE_URL")!;
  const key = deps.env("SUPABASE_SERVICE_ROLE_KEY")!;

  // #322: decisão de consentimento marketing (Meta). Empresa e portal vêm do Origin; o corpo nunca os define.
  if (kind === "consent") {
    const company = companyForOrigin(origin);
    const portal = portalForOrigin(origin);
    if (!company || !portal) return json({ ok: false, error: "origin_unscoped", marketing_allowed: false }, 403, origin);
    const d = parseConsentDecision(body.payload);
    if (d.ok === false) return json({ ok: false, error: d.error, marketing_allowed: false }, 400, origin);
    const v = d.value;
    let data: unknown = null; let httpOk = false;
    try {
      const r = await fetch(`${url}/rest/v1/rpc/marketing_consent_record`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_company: company, p_portal: portal, p_token: v.subject_token, p_state: v.state, p_purpose: v.purpose,
          p_policy: v.policy_version, p_banner: v.banner_version, p_seq: v.client_seq, p_client_at: v.client_decided_at,
          p_idem: v.idempotency_key, p_origin: origin, p_path: v.path, p_expected_revision: v.expected_revision }),
      });
      httpOk = r.ok;
      data = httpOk ? await r.json() : null;
      if (!httpOk) console.error("[portal-track] consent rpc", r.status);
    } catch (e) { console.error("[portal-track] consent rpc threw", String(e)); }
    const out = consentRecordResponse(data, httpOk);
    return json(out.body, out.status, origin);
  }

  if (kind === "diag" || kind === "song_link_diag") {
    const p = body.payload && typeof body.payload === "object" ? body.payload : {};
    const slug = typeof p.slug === "string" ? p.slug.trim().slice(0, 80) : "";
    if (!slug || !DIAG_KINDS.has(p.kind) ||
        (p.ms != null && (!Number.isInteger(p.ms) || p.ms < 0 || p.ms > 86400000)) ||
        (p.in_app != null && !["tiktok", "instagram", "facebook", "other"].includes(p.in_app)) ||
        (p.arrival_event_id != null && (typeof p.arrival_event_id !== "string" || !UUID_RE.test(p.arrival_event_id)))) {
      return json({ ok: false, error: "invalid_payload" }, 400, origin);
    }
    const row = {
      kind: p.kind, slug, ms: p.ms ?? null,
      in_app: typeof p.in_app === "string" ? p.in_app.slice(0, 40) : null,
      detail: typeof p.detail === "string" ? p.detail.slice(0, 60) : null,
      arrival_event_id: p.arrival_event_id ?? null,
    };
    try {
      const r = await fetch(`${url}/rest/v1/song_link_diag`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
      if (!r.ok) {
        console.error("[portal-track] insert diag", r.status);
        return json({ ok: false }, 500, origin);
      }
    } catch {
      return json({ ok: false }, 500, origin);
    }
    return json({ ok: true }, 200, origin);
  }

  if (kind === "song_link_client_fail") {
    const p = body.payload && typeof body.payload === "object" ? body.payload : {};
    const slug = typeof p.slug === "string" ? p.slug.trim().slice(0, 80) : "";
    const reason = typeof p.reason === "string" ? p.reason.trim() : "";
    if (!slug || !CLIENT_FAIL_REASONS.has(reason)) {
      return json({ ok: false, error: "invalid_payload" }, 400, origin);
    }
    const inApp = typeof p.in_app === "string" ? p.in_app.slice(0, 40) : null;
    const row = {
      kind: "redirect",
      slug,
      in_app: inApp,
      detail: `client_fail:${reason}`.slice(0, 60),
    };
    try {
      const r = await fetch(`${url}/rest/v1/song_link_diag`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
      if (!r.ok) {
        console.error("[portal-track] insert song_link_diag", r.status, await r.text());
        return json({ ok: false }, 500, origin);
      }
    } catch (e) {
      console.error("[portal-track] insert threw", String(e));
      return json({ ok: false }, 500, origin);
    }
    return json({ ok: true }, 200, origin);
  }

  let row: Record<string, unknown> = pick(kind, body.payload);
  if (TABLES_WITH_COMPANY.has(TABLE[kind])) {
    const company = companyForOrigin(origin);
    if (company) row.company_id = company;
  }
  // #322: vínculo à prova de consentimento. Sem prova válida (ou falha) o registo entra na mesma, sem identificadores Meta.
  let bindAccepted = false;
  {
    const company = companyForOrigin(origin);
    const portal = portalForOrigin(origin);
    const token = readConsentToken(body);
    const receipt = readConsentReceipt(body);
    if (company && portal && token && receipt) {
      try {
        const r = await fetch(`${url}/rest/v1/rpc/marketing_consent_bind`, {
          method: "POST",
          headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_company: company, p_portal: portal, p_token: token, p_receipt: receipt }),
        });
        const b = interpretBind(r.ok ? await r.json() : null, r.ok);
        if (b.proof) {
          bindAccepted = true;
          row.consent_subject_id = b.subject_id;
          row.consent_event_id = b.event_id;
          row.consent_portal = portal;
          if (kind === "redirect") row.consent_company_id = company;
        }
      } catch (e) { console.error("[portal-track] consent bind threw", String(e)); }
    }
    if (!bindAccepted) row = stripMetaIdentifiers(row);
  }
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

  // #359: versão do texto das caixas. Só com campos de versão no payload; sem eles o row fica igual ao de hoje.
  if (kind === "lead" && hasConsentVersionFields(body.payload)) {
    const res = await resolveConsentVersions(
      { payload: body.payload, company: companyForOrigin(origin), now: new Date() },
      async (company, versions) => {
        const list = versions.map(v => `"${v}"`).join(",");
        const r = await fetch(`${url}/rest/v1/consent_text_versions?select=version,locale,channel,valid_from,valid_to&company_id=eq.${company}&version=in.(${list})`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        if (!r.ok) throw new Error(`lookup ${r.status}`);
        return await r.json();
      },
    );
    if (res.applies) {
      Object.assign(row, res.columns);
      if (Object.keys(res.raw).length) row.raw = { ...((row.raw as Record<string, unknown>) ?? {}), ...res.raw };
      if (Array.isArray(res.raw.consent_version_warnings)) console.warn("[portal-track] consent version", res.raw.consent_version_warnings);
    }
  }

  // #322: marketing_bound reflete o que ficou PERSISTIDO (o trigger revalida sob lock e pode retirar o vínculo).
  // Só se pede de volta a coluna consent_event_id (sem PII).
  let marketingBound = false;
  try {
    const r = await fetch(`${url}/rest/v1/${TABLE[kind]}?select=consent_event_id`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
        Prefer: bindAccepted ? "return=representation" : "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      console.error("[portal-track] insert", TABLE[kind], r.status);
      return json({ ok: false }, 500, origin);
    }
    if (bindAccepted) {
      try {
        const rows = await r.json();
        marketingBound = Array.isArray(rows) && rows.length === 1 && typeof rows[0]?.consent_event_id === "number";
      } catch { marketingBound = false; }
    }
  } catch (e) {
    console.error("[portal-track] insert threw", String(e));
    return json({ ok: false }, 500, origin);
  }
  return json({ ok: true, marketing_bound: marketingBound }, 200, origin);
};
}
