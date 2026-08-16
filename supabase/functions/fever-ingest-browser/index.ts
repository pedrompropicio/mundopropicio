// fever-ingest-browser
// Ingestão disparada do browser do Pedro (bookmarklet no FeverZone).
// A Fever bloqueia a API a partir de IPs de datacenter (issue #48): o browser entrega
// apenas o JWT do Metabase; o servidor descarrega os XLSX e corre o parser/importador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { downloadFeverXlsx, runFeverPipeline, FEVER_CLIENT_VERSION_FALLBACK } from "../_shared/fever-metabase.ts";

const VERSION = "v1_browser_ingest_2026_08_16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

async function updateRun(admin: any, runId: string, patch: Record<string, any>) {
  const { error } = await admin.from("fever_sync_runs").update(patch).eq("id", runId);
  if (error) console.error("updateRun error:", error.message);
}
async function updateConfig(admin: any, configId: string, patch: Record<string, any>) {
  await admin.from("fever_sync_config").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", configId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  console.log(`[fever-ingest-browser] ${VERSION}`);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: { configId?: string; metabaseJwt?: string };
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }
  const configId = body.configId;
  const metabaseJwt = (body.metabaseJwt || "").trim();
  if (!configId || !metabaseJwt) return json(400, { error: "configId e metabaseJwt são obrigatórios" });

  const secret = req.headers.get("x-ingest-secret") || "";
  if (!secret) return json(401, { error: "invalid ingest secret" });

  const { data: cfg, error: cfgErr } = await admin
    .from("fever_sync_config").select("*").eq("id", configId).single();
  if (cfgErr || !cfg) return json(404, { error: "config not found" });
  if (!cfg.ingest_secret || !timingSafeEqual(secret, String(cfg.ingest_secret))) {
    return json(401, { error: "invalid ingest secret" });
  }
  if (!cfg.enabled) return json(200, { ok: true, skipped: true, reason: "disabled" });

  // Lock anti-concorrência (igual ao fetch-fever-reports)
  const since = new Date(Date.now() - 120_000).toISOString();
  const { data: inFlight } = await admin
    .from("fever_sync_runs").select("id, started_at")
    .eq("config_id", cfg.id).eq("status", "started").gte("started_at", since).limit(1);
  if (inFlight && inFlight.length > 0) {
    return json(200, { ok: true, skipped: true, reason: "concurrent_run", concurrent_run_id: inFlight[0].id });
  }

  const clientVersion = cfg.client_version || FEVER_CLIENT_VERSION_FALLBACK;
  const { data: run, error: runErr } = await admin.from("fever_sync_runs").insert({
    config_id: cfg.id, company_id: cfg.company_id, status: "started",
    mode: "browser", triggered_by: "bookmarklet", client_version_used: clientVersion,
  }).select("id").single();
  if (runErr || !run) return json(500, { error: runErr?.message || "could not create run" });
  const runId = run.id;

  const debug: Record<string, any> = { version: VERSION, metabase_jwt_len: metabaseJwt.length, client_version: clientVersion };

  try {
    const downloaded = await downloadFeverXlsx(cfg, metabaseJwt);
    const { filesAudit, audit } = await runFeverPipeline({ admin, cfg, downloaded, triggeredBy: "bookmarklet" });

    const finalStatus = (audit?.warnings?.length || 0) > 0 ? "success_with_warning" : "success";
    await updateRun(admin, runId, {
      status: finalStatus, finished_at: new Date().toISOString(),
      files_downloaded: filesAudit, import_audit: { ...audit, debug },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: finalStatus });

    return json(200, { ok: true, runId, audit, debug });
  } catch (e: any) {
    const phase = e?.phase || "failed";
    const msg = e?.message || String(e);
    await updateRun(admin, runId, {
      status: phase, finished_at: new Date().toISOString(),
      error_message: msg, files_downloaded: e?.filesAudit || null, import_audit: { debug },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: phase });
    console.error(`[fever-ingest-browser ${runId}] ${phase}: ${msg}`);
    return json(500, { ok: false, runId, phase, error: msg, debug });
  }
});
