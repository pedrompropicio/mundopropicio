// fetch-ticketline-reports
// Pipeline Devise (Rails) → cookie jar → sale_summary.xlsx?granularity=2 →
// parser de operações por dia × zona → import zonas/lotes/vendas reais.
// Multi-evento: se body.configId vier, corre só esse; senão corre todos os configs enabled=true.
// Auth: aceita SERVICE_ROLE (cron) OU JWT de admin/manager/editor/platform_admin (UI).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseTicketlineOperationsXlsx } from "../_shared/ticketline-operations-parser.ts";
import { runTicketlineImport } from "../_shared/ticketline-import-server.ts";

const VERSION = "v2.5_2026_08_11_discover_html_diag";

// Formata YYYY-MM-DD (date) ou Date para DD-MM-YYYY (UTC).
function fmtDDMMYYYY(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
function salesStartToDDMMYYYY(salesStart: string | null | undefined): string {
  if (!salesStart) return "01-01-2025";
  // Espera YYYY-MM-DD do Postgres
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(salesStart);
  if (!m) return "01-01-2025";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BASE = "https://manager.ticketline.pt";

interface Body { configId?: string; mode?: "manual" | "cron"; triggeredBy?: string; action?: "sync" | "discover" }

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

  const getResp = await fetchWithTimeout(`${BASE}/managers/sign_in`, {
    method: "GET", redirect: "manual",
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

  const params = new URLSearchParams();
  params.set("utf8", "✓");
  params.set("authenticity_token", csrf);
  params.set("manager[email]", email);
  params.set("manager[password]", password);
  params.set("manager[kind]", "1");
  params.set("manager[remember_me]", "0");
  params.set("commit", "Entrar");

  const postResp = await fetchWithTimeout(`${BASE}/managers/sign_in?locale=pt`, {
    method: "POST", redirect: "manual",
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

  if (postResp.status !== 302) {
    throw Object.assign(new Error(`POST sign_in HTTP ${postResp.status} (esperava 302)`), { phase: "login_post" });
  }
  if (!jar.get("_session_id")) {
    throw Object.assign(new Error("Login OK mas sem _session_id no jar"), { phase: "login_no_session" });
  }
  return { jar };
}

// --- Diagnóstico de respostas HTML ---
function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
function describeHtml(html: string): { title: string; snippet: string; isSignIn: boolean } {
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = tm ? stripTags(tm[1]).slice(0, 200) : "(sem title)";
  const body = html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const snippet = stripTags(body).slice(0, 200);
  const isSignIn = /managers\/sign_in|manager\[password\]|manager_password|Iniciar sess|Entrar/i.test(html);
  return { title, snippet, isSignIn };
}

// --- Discover: lista eventos visíveis pela conta ---
async function fetchEventsPage(jar: Jar, page: number): Promise<string> {
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const url = page > 1 ? `${BASE}/managers/events?page=${page}` : `${BASE}/managers/events`;
  const resp = await fetchWithTimeout(url, {
    method: "GET", redirect: "manual",
    headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml", "Cookie": jarToHeader(jar), "Referer": `${BASE}/managers` },
  });
  ingestSetCookie(jar, resp);
  if (resp.status === 302) {
    const loc = resp.headers.get("location") || "";
    await resp.text().catch(() => null);
    throw Object.assign(new Error(`GET /managers/events 302 → ${loc}`), { phase: "discover_redirect" });
  }
  if (!resp.ok) {
    const text = (await resp.text()).slice(0, 300);
    throw Object.assign(new Error(`GET /managers/events HTTP ${resp.status}: ${text}`), { phase: "discover_http" });
  }
  return await resp.text();
}

function parseEventsFromHtml(html: string): Array<{ ticketline_event_id: string; nome: string; data: string | null }> {
  const out = new Map<string, { ticketline_event_id: string; nome: string; data: string | null }>();
  const linkRe = /<a[^>]+href=["'][^"']*\/managers\/events\/(\d+)(?:[/?#][^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const id = m[1];
    const text = stripTags(m[2]);
    const prev = out.get(id);
    if (!prev || (!prev.nome && text) || (text.length > prev.nome.length && text.length < 160)) {
      out.set(id, { ticketline_event_id: id, nome: text.slice(0, 160), data: prev?.data ?? null });
    }
  }
  // Tenta apanhar uma data na mesma linha/tr do link
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(html)) !== null) {
    const row = r[0];
    const idm = row.match(/\/managers\/events\/(\d+)/);
    if (!idm) continue;
    const ent = out.get(idm[1]);
    if (!ent || ent.data) continue;
    const dm = stripTags(row).match(/(\d{2}[-/]\d{2}[-/]\d{4})|(\d{4}-\d{2}-\d{2})/);
    if (dm) ent.data = dm[0];
  }
  return Array.from(out.values());
}

function hasNextPage(html: string, page: number): boolean {
  return new RegExp(`href=["'][^"']*\\/managers\\/events\\?[^"']*page=${page + 1}\\b`, "i").test(html);
}

async function runDiscover(admin: any, configId?: string) {
  let cfgQuery = admin.from("ticketline_sync_config").select("*");
  cfgQuery = configId ? cfgQuery.eq("id", configId) : cfgQuery.eq("enabled", true);
  const { data: cfgs, error: cfgErr } = await cfgQuery;
  if (cfgErr) return json(500, { error: cfgErr.message });
  const baseCfg = (cfgs || [])[0];
  if (!baseCfg) return json(200, { ok: false, reason: "no configs" });

  const { data: secRpc } = await admin.rpc("get_vault_secret" as any, { _name: baseCfg.vault_secret_name });
  const raw = (typeof secRpc === "string" ? secRpc : "").trim();
  if (!raw) return json(500, { error: `Credenciais em falta no Vault (${baseCfg.vault_secret_name})` });
  let creds: { email: string; password: string };
  try { creds = JSON.parse(raw); } catch { return json(500, { error: "Vault secret não é JSON {email,password}" }); }

  const { jar } = await loginDevise(creds.email, creds.password);

  const events: Array<{ ticketline_event_id: string; nome: string; data: string | null }> = [];
  const seen = new Set<string>();
  let pagesFetched = 0;
  for (let page = 1; page <= 10; page++) {
    const html = await fetchEventsPage(jar, page);
    pagesFetched++;
    const found = parseEventsFromHtml(html);
    for (const e of found) if (!seen.has(e.ticketline_event_id)) { seen.add(e.ticketline_event_id); events.push(e); }
    if (!hasNextPage(html, page)) break;
  }

  // Cruzamento com TODOS os configs enabled (independente do configId usado p/ credenciais)
  const { data: allCfgs } = await admin
    .from("ticketline_sync_config")
    .select("id, ticketline_event_id, event_id, enabled, last_run_status, vault_secret_name, events(name)")
    .eq("enabled", true);

  const configsSemMatch = (allCfgs || [])
    .filter((c: any) => !seen.has(String(c.ticketline_event_id)))
    .map((c: any) => ({
      config_id: c.id,
      ticketline_event_id: c.ticketline_event_id,
      event_id: c.event_id,
      event_name: c.events?.name ?? null,
      last_run_status: c.last_run_status,
      vault_secret_name: c.vault_secret_name,
    }));

  const cfgIds = new Set((allCfgs || []).map((c: any) => String(c.ticketline_event_id)));
  const eventsSemConfig = events.filter(e => !cfgIds.has(e.ticketline_event_id));

  return json(200, {
    ok: true,
    version: VERSION,
    credentials_from: { config_id: baseCfg.id, vault_secret_name: baseCfg.vault_secret_name },
    pages_fetched: pagesFetched,
    events_visible: events,
    configs_sem_match: configsSemMatch,
    events_sem_config: eventsSemConfig,
  });
}

async function downloadXlsx(jar: Jar, url: string, label: string): Promise<Uint8Array> {
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const resp = await fetchWithTimeout(url, {
    method: "GET", redirect: "manual",
    headers: {
      "User-Agent": ua,
      "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
      "Cookie": jarToHeader(jar),
      "Referer": `${BASE}/managers`,
    },
  });
  ingestSetCookie(jar, resp);
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
  if (ct.includes("text/html") || buf[0] === 0x3c) {
    const html = new TextDecoder("utf-8").decode(buf);
    const { title, snippet, isSignIn } = describeHtml(html);
    if (isSignIn) {
      throw Object.assign(
        new Error(`XLSX ${label}: página de login devolvida (sessão expirada). title="${title}"`),
        { phase: "session_expired", retriable: true },
      );
    }
    throw Object.assign(
      new Error(`XLSX ${label}: HTML em vez de XLSX — title="${title}" | trecho: ${snippet}`),
      { phase: "html_response", retriable: false, htmlTitle: title, htmlSnippet: snippet },
    );
  }
  if (buf.length < 100 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw Object.assign(new Error(`XLSX ${label} inválido (size=${buf.length})`), { phase: `xlsx_${label}_invalid_magic` });
  }
  return buf;
}

async function downloadSummary(
  creds: { email: string; password: string },
  ticketlineEventId: string,
  filterStartDDMMYYYY: string,
  filterEndDDMMYYYY: string,
) {
  let jar: Jar;
  const { jar: j0 } = await loginDevise(creds.email, creds.password);
  jar = j0;
  const qs = new URLSearchParams();
  qs.set("utf8", "✓");
  qs.set("granularity", "2");
  qs.set("bulk_event_ids", "");
  qs.set("filter_start_date", filterStartDDMMYYYY);
  qs.set("filter_end_date", filterEndDDMMYYYY);
  qs.set("post_render_content", "data");
  qs.set("_", String(Date.now()));
  const url = `${BASE}/managers/events/${encodeURIComponent(ticketlineEventId)}/sale_summary.xlsx?${qs.toString()}`;
  try {
    return await downloadXlsx(jar, url, "sale_summary");
  } catch (e: any) {
    if (e?.retriable) {
      console.log(`[ticketline] self-heal re-login (sale_summary)`);
      const { jar: j2 } = await loginDevise(creds.email, creds.password);
      jar = j2;
      return await downloadXlsx(jar, url, "sale_summary");
    }
    throw e;
  }
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
    const { data: secRpc, error: secErr } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
    const raw = (typeof secRpc === "string" ? secRpc : "").trim();
    if (secErr || !raw) {
      throw Object.assign(new Error(`Credenciais Ticketline em falta no Vault (${cfg.vault_secret_name}).`), { phase: "creds_missing" });
    }
    let creds: { email: string; password: string };
    try { creds = JSON.parse(raw); }
    catch { throw Object.assign(new Error("Vault secret não é JSON {email,password}"), { phase: "creds_invalid" }); }
    if (!creds.email || !creds.password) throw Object.assign(new Error("Vault: email/password em falta"), { phase: "creds_invalid" });

    const filterStart = salesStartToDDMMYYYY(cfg.sales_start_date);
    const filterEnd = fmtDDMMYYYY(new Date());
    debug.filter_start_date = filterStart;
    debug.filter_end_date = filterEnd;
    debug.sales_start_date_source = cfg.sales_start_date ? "config" : "fallback_2025_01_01";

    const summary = await downloadSummary(creds, cfg.ticketline_event_id, filterStart, filterEnd);
    const filesAudit = [
      { name: `sale_summary_${cfg.ticketline_event_id}.xlsx`, size: summary.length },
    ];

    let parseRes;
    try {
      parseRes = parseTicketlineOperationsXlsx(summary.buffer as ArrayBuffer);
    } catch (e: any) {
      throw Object.assign(new Error(`Parser sale_summary: ${e?.message || e}`), { phase: "parse_failed", filesAudit });
    }
    debug.rows = parseRes.rows.length;
    debug.unique_zones = new Set(parseRes.rows.map(r => r.zone)).size;
    debug.section1_days = parseRes.section1Daily.length;
    debug.section2_days = parseRes.section2DailyTotals.length;
    debug.warnings = parseRes.warnings.length;
    debug.parser = parseRes.debug;

    const { data: tlAcc } = await admin.from("financial_accounts")
      .select("id, name").eq("type", "ticket_office").eq("company_id", cfg.company_id)
      .ilike("name", "%ticketline%").limit(1).maybeSingle();
    if (!tlAcc) {
      throw Object.assign(new Error("Conta financeira Ticketline não encontrada (criar conta tipo bilheteira com 'Ticketline' no nome)."), { phase: "account_missing", filesAudit });
    }

    let audit: any;
    try {
      audit = await runTicketlineImport({
        supabase: admin,
        eventId: cfg.event_id,
        ticketlineAccountId: tlAcc.id,
        parseResult: parseRes,
        filenames: { summary: `sale_summary_${cfg.ticketline_event_id}.xlsx` },
      });
    } catch (e: any) {
      throw Object.assign(new Error(`Import: ${e?.message || e}`), { phase: "import_failed", filesAudit });
    }

    // Fim do sucesso silencioso: se o parser viu vendas mas nada foi importado,
    // a run não pode ficar 'success'.
    const s1HasSales = (parseRes.section1Daily || []).some(
      (d: any) => d.vendasQty !== 0 || d.vendasValue !== 0 || d.geralQty !== 0 || d.geralValue !== 0,
    );
    const silentEmpty = (audit?.rowsImported || 0) === 0 && s1HasSales;
    const finalStatus = silentEmpty ? "warning" : "success";
    const warnMsg = silentEmpty
      ? "Parser encontrou vendas na secção 1 mas 0 linhas foram importadas — verificar layout do relatório."
      : null;
    debug.data_source = audit?.dataSource || null;

    await updateRun(admin, runId, {
      status: finalStatus, finished_at: new Date().toISOString(),
      files_downloaded: filesAudit,
      error_message: warnMsg,
      import_audit: { ...audit, debug, silentEmpty },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: finalStatus });
    return { ok: !silentEmpty, runId, audit, status: finalStatus, warning: warnMsg };

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
  const { configId, mode = "manual", triggeredBy = null, action = "sync" } = body;

  if (action === "discover") {
    try {
      return await runDiscover(admin, configId);
    } catch (e: any) {
      return json(500, { ok: false, phase: e?.phase || "discover_failed", error: e?.message || String(e) });
    }
  }



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
