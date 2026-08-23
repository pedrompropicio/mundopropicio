// crm-google-click-ingest — endpoint público chamado pelo portal
// www.mundopropicio.com para registar cliques Google Ads (gclid/gbraid/wbraid
// + UTM + consent) em crm.google_click.
//
// Padrão alinhado com capi-meta-events: verify_jwt=false (config.toml), CORS
// estrito com allowlist de Origin, SERVICE_ROLE auto-injetada para o insert,
// validação Zod no body. company_id é FIXO no servidor — nunca aceitar do
// payload (defesa contra forja entre tenants).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const ALLOWED_ORIGINS = new Set<string>([
  "https://www.mundopropicio.com",
  "https://mundopropicio.com",
  "https://propicio-stage-portal.lovable.app",
]);

const PORTAL_PROJECT_ID = "26b95793-17b6-478c-a6e8-745c0cfb7ed9";
const PORTAL_PREVIEW_SUFFIX = `--${PORTAL_PROJECT_ID}.lovable.app`;

const DEFAULT_COMPANY_ID =
  Deno.env.get("PORTAL_DEFAULT_COMPANY_ID") ??
  "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";

const MAX_BODY_BYTES = 4 * 1024;

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Lovable preview do portal: https://<anything>--<projectId>.lovable.app
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const PayloadSchema = z
  .object({
    gclid: z.string().max(255).nullable().optional(),
    gbraid: z.string().max(255).nullable().optional(),
    wbraid: z.string().max(255).nullable().optional(),
    utm_source: z.string().max(255).nullable().optional(),
    utm_medium: z.string().max(255).nullable().optional(),
    utm_campaign: z.string().max(255).nullable().optional(),
    utm_content: z.string().max(255).nullable().optional(),
    utm_term: z.string().max(255).nullable().optional(),
    landing_url: z.string().url(),
    referrer: z.string().url().nullable().optional(),
    user_agent: z.string().max(1000).nullable().optional(),
    consent_granted: z.boolean(),
    event_id: z.string().uuid().nullable().optional(),
    client_event_id: z.string().uuid(),
    lead_capture_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (d) =>
      [d.gclid, d.gbraid, d.wbraid].filter((v) => typeof v === "string" && v.length > 0).length === 1,
    { message: "exactly one of gclid/gbraid/wbraid required", path: ["gclid"] },
  );

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "";

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(origin)) {
      console.warn("[gclick] preflight rejected", { origin, ip });
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
  }

  if (!isOriginAllowed(origin)) {
    console.warn("[gclick] origin rejected", { origin, ip });
    return json({ error: "forbidden_origin" }, 403, origin);
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  // Body size guard
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    console.warn("[gclick] body too large", { origin, ip, bytes: raw.length });
    return json({ error: "payload_too_large" }, 413, origin);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  const parsed = PayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return json(
      { error: "validation_failed", details: parsed.error.flatten().fieldErrors },
      400,
      origin,
    );
  }
  const p = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "crm" } },
  );

  const row = {
    company_id: DEFAULT_COMPANY_ID,
    gclid: p.gclid ?? null,
    gbraid: p.gbraid ?? null,
    wbraid: p.wbraid ?? null,
    utm_source: p.utm_source ?? null,
    utm_medium: p.utm_medium ?? null,
    utm_campaign: p.utm_campaign ?? null,
    utm_content: p.utm_content ?? null,
    utm_term: p.utm_term ?? null,
    landing_url: p.landing_url,
    referrer: p.referrer ?? null,
    user_agent: p.user_agent ?? null,
    consent_granted: p.consent_granted,
    event_id: p.event_id ?? null,
    client_event_id: p.client_event_id,
    lead_capture_id: p.lead_capture_id ?? null,
  };

  const { error } = await supabase.from("google_click").insert(row);
  if (error) {
    console.error("[gclick] insert failed", { code: error.code, message: error.message, ip });
    return json({ error: "insert_failed" }, 500, origin);
  }

  return json({ ok: true }, 200, origin);
});
