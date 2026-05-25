// fetch-ticketline-reports
// Pipeline Devise (Rails) → cookie jar → sale_summary.xlsx + ticket_zone.xlsx → parser → import.
// Multi-evento: se body.configId vier, corre só esse; senão corre todos os configs enabled=true.
// Auth: aceita SERVICE_ROLE (cron) OU JWT de admin/manager/editor/platform_admin (UI).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseTicketlineSaleSummaryXlsx } from "../_shared/ticketline-parser.ts";
import { parseTicketlineZoneXlsx } from "../_shared/ticketline-zone-parser.ts";
import { runTicketlineImport } from "../_shared/ticketline-import-server.ts";

const VERSION = "v1_2026_05_25";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BASE = "https://manager.ticketline.pt";

interface Body { configId?: string; mode?: "manual" | "cron"; triggeredBy?: string }

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 45000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// --- Cookie jar manual ---
type Jar = Map<string, string>;
function jarToHeader(jar: Jar): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}
function ingestSetCookie(jar: Jar, resp: Response) {
  // Deno expõe getSetCookie() em Headers
  const anyHeaders = resp.headers as any;
  const list: string[] = typeof anyHeaders.getSetCookie === "function"
    ? anyHeaders.getSetCookie()
    : (resp.headers.get("set-cookie") ? [resp.headers.get("set-cookie")!] : []);
  for (const raw of list) {
    const eq = raw.indexOf("=");
    if (eq < 0) continue;
    const name = raw.slice(0, eq).trim();
    const rest = raw.slice(eq + 1);
    const semi = rest.indexOf(";");
    const value = (semi >= 0 ? rest.slice(0, semi) : rest).trim();
    if (name) jar.set(name, value);
  }
}

function extractCsrfToken(html: string): string {
  const m = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

interface LoginResult { jar: Jar }

async function loginDevise(email: string, password: string): Promise<LoginResult> {
  const jar: Jar = new Map();
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

  // 1. GET sign_in para CSRF + cookies pré-login
  const getResp = await fetchWithTimeout(`${BASE}/managers/sign_in`, {
    method: "GET",
    redirect: "manual",
    headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml" },
  });
  ingestSetCookie(jar, getResp);
  if (getResp.status >= 400) {
    await getResp.text().catch(() => null);
    throw Object.assign(new Error(`GET sign_in HTTP ${getResp.status}`), { phase: "login_get" });
  }
  const html = await getResp.text();
  const csrf = extractCsrfToken(html);
  if (!csrf) throw Object.assign(new Error("CSRF token não encontrado em GET sign_in"), { phase: "login_csrf" });

  // 2. POST sign_in
  const params = new URLSearchParams();
  params.set("utf8", "✓");
  params.set("authenticity_token", csrf);
  params.set("manager[email]", email);
  params.set("manager[password]", password);
  params.set("manager[kind]", "1");
  params.set("manager[remember_me]", "0");
  params.set("commit", "Entrar");

  const postResp = await fetchWithTimeout(`${BASE}/managers/sign_in?locale=pt`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "User-Agent": ua,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "text/html,application/xhtml+xml",
      "Cookie": jarToHeader(jar),
      "Origin": BASE,
      "Referer": `${BASE}/managers/sign_in`,
    },
    body: params.toString(),
  });
  ingestSetCookie(jar, postResp);
  await postResp.text().catch(() => null);

  // Esperado: 302. Se 200 / 4xx → falhou.
  if (postResp.status !== 302) {
    throw Object.assign(new Error(`POST sign_in HTTP ${postResp.status} (esperava 302)`), { phase: "login_post" });
  }
  if (!jar.get("_session_id")) {
    throw Object.assign(new Error("Login OK mas sem _session_id no jar"), { phase: "login_no_session" });
  }
  return { jar };
}

async function downloadXlsx(jar: Jar, url: string, label: string): Promise<Uint8Array> {
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      "User-Agent": ua,
      "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
      "Cookie": jarToHeader(jar),
      "Referer": `${BASE}/managers`,
    },
  });
  ingestSetCookie(jar, resp);
  // 302 para sign_in = sessão expirou
  if (resp.status === 302) {
    const loc = resp.headers.get("location") || "";
    await resp.text().catch(() => null);
    if (loc.includes("sign_in")) {
      throw Object.assign(new Error(`Sessão expirada (302 → ${loc})`), { phase: "session_expired", retriable: true });
    }
    throw Object.assign(new Error(`XLSX ${label} 302 → ${loc}`), { phase: `xlsx_${label}_redirect` });
  }
  if (!resp.ok) {
    const text = (await resp.text()).slice(0, 300);
    throw Object.assign(new Error(`XLSX ${label} HTTP ${resp.status}: ${text}`), { phase: `xlsx_${label}_http_${resp.status}` });
  }
  const ct = resp.headers.get("content-type") || "";
  const buf = new Uint8Array(await resp.arrayBuffer());
  // Se devolveu HTML (login form), sessão expirou
  if (ct.includes("text/html") || (buf[0] === 0x3c /* '<' */)) {
    throw Object.assign(new Error(`XLSX ${label} devolveu HTML (sessão expirada?)`), { phase: "session_expired", retriable: true });
  }
  if (buf.length < 100 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw Object.assign(new Error(`XLSX ${label} inválido (size=${buf.length})`), { phase: `xlsx_${label}_invalid_magic` });
  }
  return buf;
}

async function downloadBothXlsx(creds: { email: string; password: string }, ticketlineEventId: string) {
  let jar: Jar;
  const { jar: j0 } = await loginDevise(creds.email, creds.password);
  jar = j0;

  const summaryUrl = `${BASE}/managers/events/${encodeURIComponent(ticketlineEventId)}/sale_summary.xlsx?granularity=2`;
  const zoneUrl = `${BASE}/managers/events/${encodeURIComponent(ticketlineEventId)}/ticket_zone.xlsx`;

  const download = async (url: string, label: string): Promise<Uint8Array> => {
    try {
      return await downloadXlsx(jar, url, label);
    } catch (e: any) {
      if (e?.retriable) {
        console.log(`[ticketline] self-heal re-login (${label})`);
        const { jar: j2 } = await loginDevise(creds.email, creds.password);
        jar = j2;
        return await downloadXlsx(jar, url, label);
      }
      throw e;
    }
  };

  const summary = await download(summaryUrl, "sale_summary");
  const zone = await download(zoneUrl, "ticket_zone");
  return { summary, zone };
}

async function updateRun(admin: any, runId: string, patch: Record<string, any>) {
  const { error } = await admin.from("ticketline_sync_runs").update(patch).eq("id", runId);
  if (error) console.error("updateRun:", error.message);
}
async function updateConfig(admin: any, configId: string, patch: Record<string, any>) {
  await admin.from("ticketline_sync_config").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", configId);
}

async function runOneConfig(admin: any, cfg: any, mode: string, triggeredBy: string | null) {
  const { data: run, error: runErr } = await admin.from("ticketline_sync_runs").insert({
    config_id: cfg.id, company_id: cfg.company_id, status: "started",
    mode, triggered_by: triggeredBy,
  }).select("id").single();
  if (runErr || !run) return { ok: false, error: runErr?.message || "create run failed" };
  const runId = run.id;
  const debug: Record<string, any> = { version: VERSION };

  try {
    // 1. Credenciais do Vault
    const { data: secRpc, error: secErr } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
    const raw = (typeof secRpc === "string" ? secRpc : "").trim();
    if (secErr || !raw) {
      throw Object.assign(new Error(`Credenciais Ticketline em falta no Vault (${cfg.vault_secret_name}).`), { phase: "creds_missing" });
    }
    let creds: { email: string; password: string };
    try { creds = JSON.parse(raw); }
    catch { throw Object.assign(new Error("Vault secret não é JSON {email,password}"), { phase: "creds_invalid" }); }
    if (!creds.email || !creds.password) throw Object.assign(new Error("Vault: email/password em falta"), { phase: "creds_invalid" });

    // 2. Pipeline Devise + download
    const { summary, zone } = await downloadBothXlsx(creds, cfg.ticketline_event_id);
    const filesAudit = [
      { name: `sale_summary_${cfg.ticketline_event_id}.xlsx`, size: summary.length },
      { name: `ticket_zone_${cfg.ticketline_event_id}.xlsx`, size: zone.length },
    ];

    // 3. Parsers
    let summaryRes, zoneRes;
    try {
      summaryRes = parseTicketlineSaleSummaryXlsx(summary.buffer as ArrayBuffer);
    } catch (e: any) {
      throw Object.assign(new Error(`Parser sale_summary: ${e?.message || e}`), { phase: "parse_summary_failed", filesAudit });
    }
    try {
      zoneRes = parseTicketlineZoneXlsx(zone.buffer as ArrayBuffer);
    } catch (e: any) {
      console.warn("Parser zone falhou (não-bloqueante):", e?.message);
      zoneRes = null;
    }
    debug.daily_points = summaryRes.daily.length;
    debug.total_qty = summaryRes.totalQty;
    debug.total_value = summaryRes.totalValue;

    // 4. Conta Ticketline
    const { data: tlAcc } = await admin.from("financial_accounts")
      .select("id, name").eq("type", "ticket_office").eq("company_id", cfg.company_id)
      .ilike("name", "%ticketline%").limit(1).maybeSingle();
    if (!tlAcc) {
      throw Object.assign(new Error("Conta financeira Ticketline não encontrada (criar conta tipo bilheteira com 'Ticketline' no nome)."), { phase: "account_missing", filesAudit });
    }

    // 5. Import
    let audit: any;
    try {
      audit = await runTicketlineImport({
        supabase: admin,
        eventId: cfg.event_id,
        ticketlineAccountId: tlAcc.id,
        parseResult: summaryRes,
        zoneSnapshot: zoneRes,
        filenames: {
          summary: `sale_summary_${cfg.ticketline_event_id}.xlsx`,
          zone: `ticket_zone_${cfg.ticketline_event_id}.xlsx`,
        },
      });
    } catch (e: any) {
      throw Object.assign(new Error(`Import: ${e?.message || e}`), { phase: "import_failed", filesAudit });
    }

    await updateRun(admin, runId, {
      status: "success", finished_at: new Date().toISOString(),
      files_downloaded: filesAudit,
      import_audit: { ...audit, debug },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: "success" });
    return { ok: true, runId, audit };
  } catch (e: any) {
    const phase = e?.phase || "failed";
    const msg = e?.message || String(e);
    await updateRun(admin, runId, {
      status: phase, finished_at: new Date().toISOString(),
      error_message: msg, files_downloaded: e?.filesAudit || null,
      import_audit: { debug },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: phase });
    console.error(`[ticketline ${runId}] ${phase}: ${msg}`);
    return { ok: false, runId, phase, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  console.log(`[ticketline-sync] ${VERSION}`);

  // --- Auth: service_role direto OU JWT privilegiado ---
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing authorization" });

  let authorized = false;
  if (token === SERVICE_ROLE) {
    authorized = true;
  } else {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) {
      const admin0 = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: roles } = await admin0.from("user_roles").select("role").eq("user_id", userData.user.id);
      authorized = (roles || []).some((r: any) => ["admin", "manager", "editor", "platform_admin"].includes(r.role));
    }
  }
  if (!authorized) return json(403, { error: "forbidden" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: Body = {};
  try { body = await req.json(); } catch { /* sem body = cron */ }
  const { configId, mode = "manual", triggeredBy = null } = body;

  // Carregar configs
  let cfgs: any[] = [];
  if (configId) {
    const { data, error } = await admin.from("ticketline_sync_config").select("*").eq("id", configId).limit(1);
    if (error) return json(500, { error: error.message });
    cfgs = data || [];
  } else {
    const { data, error } = await admin.from("ticketline_sync_config").select("*").eq("enabled", true);
    if (error) return json(500, { error: error.message });
    cfgs = data || [];
  }
  if (cfgs.length === 0) return json(200, { ok: true, skipped: true, reason: "no configs" });

  const results: any[] = [];
  for (const cfg of cfgs) {
    if (!cfg.enabled && configId) {
      results.push({ configId: cfg.id, ok: false, skipped: true, reason: "disabled" });
      continue;
    }
    const r = await runOneConfig(admin, cfg, mode, triggeredBy);
    results.push({ configId: cfg.id, ...r });
  }
  const allOk = results.every(r => r.ok);
  return json(allOk ? 200 : 500, { ok: allOk, results });
});
