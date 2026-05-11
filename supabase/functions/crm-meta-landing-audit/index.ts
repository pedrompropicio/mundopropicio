// crm-meta-landing-audit (Fase 5)
// POST { url, strategy?: 'mobile'|'desktop' }
// Corre Google PageSpeed Insights v5, persiste em crm.landing_audit_results.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PSI_KEY = Deno.env.get("GOOGLE_PAGESPEED_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function isValidUrl(u: string): boolean {
  try { const p = new URL(u); return p.protocol === "http:" || p.protocol === "https:"; } catch { return false; }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { url?: string; strategy?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const url = (body.url ?? "").trim();
  const strategy = body.strategy === "desktop" ? "desktop" : "mobile";
  if (!url || !isValidUrl(url)) return json({ error: "invalid_url" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // companyId via RPC
  let companyId: string | null = null;
  let userId: string | null = null;
  try {
    const { data: u } = await supabase.auth.getUser();
    userId = u?.user?.id ?? null;
    const { data: cid } = await supabase.rpc("current_company_id");
    companyId = (cid as string) ?? null;
  } catch { /* noop */ }
  if (!companyId) return json({ error: "no_company_context" }, 403);

  // PSI call
  const psiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  psiUrl.searchParams.set("url", url);
  psiUrl.searchParams.set("strategy", strategy);
  for (const c of ["PERFORMANCE", "SEO", "BEST_PRACTICES", "ACCESSIBILITY"]) psiUrl.searchParams.append("category", c);
  psiUrl.searchParams.set("locale", "pt-PT");
  if (PSI_KEY) psiUrl.searchParams.set("key", PSI_KEY);

  let psi: any;
  try {
    const resp = await fetch(psiUrl, { method: "GET" });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[landing-audit] PSI error", resp.status, t.slice(0, 300));
      if (resp.status === 429) return json({ error: "psi_rate_limit", message: "Quota PageSpeed atingida. Tenta mais tarde ou configura GOOGLE_PAGESPEED_API_KEY." }, 429);
      if (resp.status === 400) return json({ error: "psi_invalid_url", detail: t.slice(0, 200) }, 400);
      return json({ error: "psi_failed", detail: t.slice(0, 200) }, 502);
    }
    psi = await resp.json();
  } catch (e) {
    console.error("[landing-audit] PSI threw", e);
    return json({ error: "psi_unreachable", detail: String(e).slice(0, 200) }, 502);
  }

  const cats = psi?.lighthouseResult?.categories ?? {};
  const audits = psi?.lighthouseResult?.audits ?? {};
  const perfScore = cats.performance?.score != null ? Math.round(cats.performance.score * 100) : null;
  const a11yScore = cats.accessibility?.score != null ? Math.round(cats.accessibility.score * 100) : null;
  const seoScore = cats.seo?.score != null ? Math.round(cats.seo.score * 100) : null;
  const bpScore = cats["best-practices"]?.score != null ? Math.round(cats["best-practices"].score * 100) : null;

  const numVal = (k: string): number | null => {
    const v = audits?.[k]?.numericValue;
    return typeof v === "number" ? Math.round(v) : null;
  };
  const lcp = numVal("largest-contentful-paint");
  const fcp = numVal("first-contentful-paint");
  const tbt = numVal("total-blocking-time");
  const tti = numVal("interactive");
  const si = numVal("speed-index");
  const ttfb = numVal("server-response-time");
  const clsRaw = audits?.["cumulative-layout-shift"]?.numericValue;
  const cls = typeof clsRaw === "number" ? Number(clsRaw.toFixed(3)) : null;

  const region = psi?.lighthouseResult?.environment?.hostUserAgent ? null : null;

  let insertedId: string | null = null;
  try {
    const { data: ins, error: insErr } = await (supabase as any)
      .schema("crm")
      .from("landing_audit_results")
      .insert({
        company_id: companyId,
        url,
        audit_source: "pagespeed",
        strategy,
        region,
        performance_score: perfScore,
        accessibility_score: a11yScore,
        seo_score: seoScore,
        best_practices_score: bpScore,
        lcp_ms: lcp,
        fcp_ms: fcp,
        tbt_ms: tbt,
        tti_ms: tti,
        si_ms: si,
        ttfb_ms: ttfb,
        cls,
        raw_jsonb: psi,
        audited_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (insErr) console.error("[landing-audit] persist err", insErr);
    insertedId = ins?.id ?? null;
  } catch (e) {
    console.error("[landing-audit] persist threw", e);
  }

  return json({
    id: insertedId,
    url,
    strategy,
    scores: {
      performance: perfScore,
      accessibility: a11yScore,
      seo: seoScore,
      best_practices: bpScore,
    },
    metrics: { lcp_ms: lcp, fcp_ms: fcp, tbt_ms: tbt, tti_ms: tti, si_ms: si, ttfb_ms: ttfb, cls },
    audited_at: new Date().toISOString(),
  });
});
