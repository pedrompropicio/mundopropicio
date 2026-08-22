// fetch-ticketline-reports
// Pipeline Devise (Rails) → cookie jar → sale_summary.xlsx?granularity=2 →
// parser de operações por dia × zona → import zonas/lotes/vendas reais.
// Multi-evento: se body.configId vier, corre só esse; senão corre todos os configs enabled=true.
// Auth: aceita SERVICE_ROLE (cron) OU JWT de admin/manager/editor/platform_admin (UI).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { parseTicketlineOperationsXlsx } from "../_shared/ticketline-operations-parser.ts";
// (parser SJR por-evento mantido em _shared para as sondas; o sync usa a série diária do dashboard)
import {
  parseDashboardDailySjr,
  type DashboardDailyResult,
} from "../_shared/ticketline-dashboard-daily-parser.ts";
import { runTicketlineImport } from "../_shared/ticketline-import-server.ts";

const VERSION = "v2.33_dashboard_today_incremental";

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
/** Hoje em Europe/Lisbon como YYYY-MM-DD (regra de timezone do projecto). */
function lisbonTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function isoToDDMMYYYY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}
function ddmmyyyyToIso(s: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Helper jwtRole — mesmo padrão da sync-coala-from-drive: decodifica o payload
// do JWT sem verificação de assinatura e lê o claim "role". Permite aceitar o
// service role JWT do Vault (email_queue_service_role_key) que o cron envia,
// em vez da igualdade estrita `token === SERVICE_ROLE` (env) que nunca bate.
const jwtRole = (authHeader: string | null): string | null => {
  const token = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))?.role ?? null;
  } catch {
    return null;
  }
};

const BASE = "https://manager.ticketline.pt";

interface Body { urls?: string[]; configId?: string; compareConfigId?: string; mode?: "manual" | "cron"; triggeredBy?: string; action?: "sync" | "discover" | "probe" | "dump" | "matrix" | "form" | "text" | "postfilter" | "probe_nova_area" | "probe_params" | "sjr" }

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

// ============================================================================
// PROBE (v2.9) — diagnóstico da "área nova de Promotores".
// Não altera o fluxo de download. Objetivo: descobrir onde vive o relatório
// para eventos migrados (ex.: 68027 Almada, 68026 Santarém) que devolvem a
// landing HTML no endpoint antigo, enquanto os outros 10 respondem em XLSX.
// ============================================================================
const UA_PROBE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

interface ProbeAttempt {
  url: string;
  status: number | null;
  contentType: string | null;
  location?: string | null;
  looksXlsx: boolean;
  size?: number;
  snippet?: string;
  error?: string;
}

async function probeGet(
  jar: Jar,
  url: string,
  accept: string,
  followMax = 4,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 30000,
): Promise<ProbeAttempt & { chain: Array<{ url: string; status: number; location: string | null }>; bytes?: Uint8Array }> {
  const chain: Array<{ url: string; status: number; location: string | null }> = [];
  let current = url;
  for (let hop = 0; hop <= followMax; hop++) {
    let resp: Response;
    try {
      resp = await fetchWithTimeout(current, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": UA_PROBE, Accept: accept, Cookie: jarToHeader(jar), Referer: `${BASE}/managers`, ...extraHeaders },
      }, timeoutMs);
    } catch (e: any) {
      return { url: current, status: null, contentType: null, looksXlsx: false, error: e?.message || String(e), chain };
    }
    ingestSetCookie(jar, resp);
    const loc = resp.headers.get("location");
    chain.push({ url: current, status: resp.status, location: loc });
    if (resp.status >= 300 && resp.status < 400 && loc && hop < followMax) {
      await resp.text().catch(() => null);
      current = new URL(loc, current).toString();
      continue;
    }
    const ct = resp.headers.get("content-type");
    const bytes = new Uint8Array(await resp.arrayBuffer().catch(() => new ArrayBuffer(0)));
    const looksXlsx = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    const snippet = looksXlsx ? undefined : new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 3000)).slice(0, 800);
    return { url: current, status: resp.status, contentType: ct, location: loc, looksXlsx, size: bytes.length, snippet, chain, bytes };
  }
  return { url: current, status: null, contentType: null, looksXlsx: false, error: "too many redirects", chain };
}

/** Extrai URLs candidatas de relatório do HTML/JS inline de uma página. */
function extractReportUrls(html: string, cap = 40): string[] {
  const out = new Set<string>();
  const kw = /(api|report|export|xlsx|xls|sales|resumo|operacoes|opera[cç][õo]es|sale_summary|download)/i;
  const urlRe = /(?:href|src|action|data-url|url)\s*[=:]\s*["'`]([^"'`\s>]{4,300})["'`]/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(html)) !== null) {
    const u = m[1];
    if (kw.test(u)) out.add(u);
    if (out.size >= cap) return Array.from(out);
  }
  // strings soltas em JS (fetch("..."), axios.get('...'), template paths)
  const strRe = /["'`](\/[a-z0-9_\-/.{}$:%]{3,200})["'`]/gi;
  while ((m = strRe.exec(html)) !== null) {
    const u = m[1];
    if (kw.test(u)) out.add(u);
    if (out.size >= cap) break;
  }
  return Array.from(out).slice(0, cap);
}

function extractScriptSrcs(html: string, cap = 25): string[] {
  const out: string[] = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < cap) out.push(m[1]);
  return out;
}

/** Extrai tags cruas (href/data-url/action) relevantes para export. */
function extractExportTags(html: string, cap = 30): string[] {
  const out: string[] = [];
  const kw = /(xlsx|export|download|csv|sale_summary)/i;
  const tagRe = /<(?:a|form|button|link)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null && out.length < cap) {
    const tag = m[0];
    if (/(href|data-url|action|data-href)\s*=/i.test(tag) && kw.test(tag)) out.push(tag.slice(0, 300));
  }
  return out;
}

/** URLs de export em strings soltas do HTML/JS inline. */
function extractExportUrlStrings(html: string, cap = 30): string[] {
  const out = new Set<string>();
  const kw = /(xlsx|export|download|csv|sale_summary)/i;
  const re = /["'`]([^"'`\s<>]{4,300})["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.size < cap) {
    const u = m[1];
    if (kw.test(u) && (/^https?:\/\//i.test(u) || u.startsWith("/") || /\.(xlsx|csv)/i.test(u))) out.add(u);
  }
  return Array.from(out);
}

const XLSX_ACCEPT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ---------------------------------------------------------------------------
// v2.11 (probe3) — extração de padrões AJAX/export do JS inline + data-*
// ---------------------------------------------------------------------------
/** Strings com pinta de URL/AJAX no HTML cru, com contexto (200 chars). */
function extractJsUrlPatterns(html: string, cap = 50): Array<{ match: string; context: string }> {
  const seen = new Set<string>();
  const out: Array<{ match: string; context: string }> = [];
  const re = /(\/managers\/[^\s"'`<>]{2,200}|["'`][^"'`\s<>]{0,200}\.(?:json|xlsx)[^"'`\s<>]{0,80}["'`]|export[A-Za-z_]*\s*[:=(][^\n]{0,80}|ajax\s*[:(][^\n]{0,80}|url\s*:\s*["'`][^"'`]{2,200}["'`]|fetch\(\s*["'`][^"'`]{2,200}["'`]|\$\.get\(\s*["'`][^"'`]{2,200}["'`]|\$\.ajax\(\s*\{[^\n]{0,120})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < cap) {
    const match = m[0].slice(0, 200);
    const key = match.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const start = Math.max(0, m.index - 60);
    out.push({ match, context: html.slice(start, start + 200).replace(/\s+/g, " ") });
  }
  return out;
}

/** ids dos <div> principais (zona de conteúdo). */
function extractDivIds(html: string, cap = 40): string[] {
  const out = new Set<string>();
  const re = /<div\b[^>]*\bid\s*=\s*["']([^"']{2,80})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.size < cap) out.add(m[1]);
  return Array.from(out);
}

/** data-* attributes que apontem para URLs/endpoints. */
function extractDataAttrUrls(html: string, cap = 30): string[] {
  const out = new Set<string>();
  const re = /\bdata-[a-z-]{2,30}\s*=\s*["']([^"']{4,250})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.size < cap) {
    const v = m[1];
    if (/^\/|^https?:\/\/|\.json|\.xlsx|export|ajax/i.test(v)) out.add(v.slice(0, 250));
  }
  return Array.from(out);
}

/** Sequência fixa de sondas AJAX/export da área nova (ponto 2 do pedido). */
async function probeAjaxSequence(jar: Jar, id: string, query: string, startDD: string, endDD: string): Promise<ProbeAttempt[]> {
  const XHR = { "X-Requested-With": "XMLHttpRequest" };
  const targets: Array<{ url: string; headers?: Record<string, string>; accept?: string; label?: string }> = [
    { url: `${BASE}/managers/events/${id}/sale_summary.xlsx`, headers: XHR, label: "sale_summary.xlsx +XHR" },
    { url: `${BASE}/managers/events/${id}/sale_summary.xlsx?${query}`, headers: XHR, label: "sale_summary.xlsx?params +XHR" },
    { url: `${BASE}/managers/events/${id}/sale_summary.json`, accept: "application/json,*/*", label: "sale_summary.json" },
    { url: `${BASE}/managers/events/${id}/sale_summary.json?${query}`, accept: "application/json,*/*", headers: XHR, label: "sale_summary.json?params +XHR" },
    { url: `${BASE}/managers/dashboard/sales_per_event.xlsx?event_id=${id}&filter_start_date=${startDD}&filter_end_date=${endDD}`, label: "dashboard sales_per_event.xlsx event_id" },
    { url: `${BASE}/managers/dashboard/sales_per_event.xlsx?bulk_event_ids=${id}&filter_start_date=${startDD}&filter_end_date=${endDD}`, label: "dashboard sales_per_event.xlsx bulk_event_ids" },
    { url: `${BASE}/managers/dashboard/sales_per_event.json?event_id=${id}&filter_start_date=${startDD}&filter_end_date=${endDD}`, accept: "application/json,*/*", headers: XHR, label: "dashboard sales_per_event.json event_id" },
    { url: `${BASE}/managers/dashboard/sales_per_event.json?bulk_event_ids=${id}&filter_start_date=${startDD}&filter_end_date=${endDD}`, accept: "application/json,*/*", headers: XHR, label: "dashboard sales_per_event.json bulk_event_ids" },
  ];
  const out: ProbeAttempt[] = [];
  for (const t of targets) {
    const r = await probeGet(jar, t.url, t.accept ?? `${XLSX_ACCEPT},*/*`, 3, t.headers ?? {});
    out.push({
      url: `${t.url}${t.label ? ` [${t.label}]` : ""}`,
      status: r.status, contentType: r.contentType, location: r.chain.at(-1)?.location ?? null,
      looksXlsx: r.looksXlsx, size: r.size,
      snippet: r.looksXlsx ? undefined : (r.snippet || "").slice(0, 200),
      error: r.error,
    });
  }
  return out;
}

/** Baixa e parseia as primeiras 30 linhas do internet_sales.xlsx. */
async function probeInternetSales(jar: Jar, id: string, query: string) {
  const url = `${BASE}/managers/events/${id}/internet_sales.xlsx?${query}`;
  const r = await probeGet(jar, url, `${XLSX_ACCEPT},*/*`, 3);
  const base = {
    url, status: r.status, contentType: r.contentType, looksXlsx: r.looksXlsx, size: r.size, error: r.error,
    snippet: r.looksXlsx ? undefined : (r.snippet || "").slice(0, 200),
  };
  if (!r.looksXlsx || !r.bytes) return { ...base, sheets: null, rows: null };
  try {
    const wb = XLSX.read(r.bytes, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false }) as any[][])
      .slice(0, 30)
      .map((row) => (row || []).slice(0, 20).map((c) => (c == null ? "" : String(c).slice(0, 60))));
    return { ...base, sheets: wb.SheetNames, rows };
  } catch (e: any) {
    return { ...base, sheets: null, rows: null, parseError: e?.message || String(e) };
  }
}

async function probeConfig(admin: any, configId: string) {
  const { data: cfgs, error: cfgErr } = await admin.from("ticketline_sync_config").select("*").eq("id", configId).limit(1);
  if (cfgErr) throw new Error(cfgErr.message);
  const cfg = (cfgs || [])[0];
  if (!cfg) throw new Error(`config ${configId} não encontrado`);

  const { data: secRpc } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
  const raw = (typeof secRpc === "string" ? secRpc : "").trim();
  if (!raw) throw new Error(`Credenciais em falta no Vault (${cfg.vault_secret_name})`);
  let creds: { email: string; password: string };
  try { creds = JSON.parse(raw); } catch { throw new Error("Vault secret não é JSON {email,password}"); }

  const { jar } = await loginDevise(creds.email, creds.password);

  const id = String(cfg.ticketline_event_id);
  const startDD = salesStartToDDMMYYYY(cfg.sales_start_date);
  const endDD = fmtDDMMYYYY(new Date());
  const qs = new URLSearchParams();
  qs.set("utf8", "✓");
  qs.set("granularity", "2");
  qs.set("bulk_event_ids", "");
  qs.set("filter_start_date", startDD);
  qs.set("filter_end_date", endDD);
  qs.set("post_render_content", "data");
  const query = qs.toString();

  // (a) MESMO URL do fluxo atual
  const currentUrl = `${BASE}/managers/events/${encodeURIComponent(id)}/sale_summary.xlsx?${query}&_=${Date.now()}`;
  const a = await probeGet(jar, currentUrl, `${XLSX_ACCEPT},*/*`);
  const currentFlow = {
    url: currentUrl,
    status: a.status,
    contentType: a.contentType,
    redirectChain: a.chain,
    looksXlsx: a.looksXlsx,
    size: a.size,
    snippet: a.snippet,
    error: a.error,
  };

  // (b) página do evento
  const eventPageUrl = `${BASE}/managers/events/${encodeURIComponent(id)}`;
  const b = await probeGet(jar, eventPageUrl, "text/html,application/xhtml+xml");
  const bHtml = b.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(b.bytes) : "";
  const eventPage = {
    url: eventPageUrl,
    status: b.status,
    finalUrl: b.url,
    contentType: b.contentType,
    redirectChain: b.chain,
    title: bHtml ? describeHtml(bHtml).title : null,
    scripts: extractScriptSrcs(bHtml),
    candidateUrls: extractReportUrls(bHtml),
    snippet: bHtml ? stripTags(bHtml).slice(0, 800) : b.snippet,
  };

  // (b2) v2.10 — a PÁGINA HTML /sale_summary (sem .xlsx)
  const summaryPageUrl = `${BASE}/managers/events/${encodeURIComponent(id)}/sale_summary`;
  const sp = await probeGet(jar, summaryPageUrl, "text/html,application/xhtml+xml");
  const spHtml = sp.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(sp.bytes) : "";
  const summaryPage = {
    url: summaryPageUrl,
    status: sp.status,
    finalUrl: sp.url,
    contentType: sp.contentType,
    redirectChain: sp.chain,
    title: spHtml ? describeHtml(spHtml).title : null,
    exportTags: extractExportTags(spHtml),
    exportUrlStrings: extractExportUrlStrings(spHtml),
    scripts: extractScriptSrcs(spHtml, 15),
    bodyText: spHtml ? stripTags(spHtml).slice(0, 1000) : (sp.snippet || "").slice(0, 1000),
    // v2.11 (probe3): padrões AJAX/export do JS inline + data-* + ids de divs
    jsUrlPatterns: extractJsUrlPatterns(spHtml),
    dataAttrUrls: extractDataAttrUrls(spHtml),
    divIds: extractDivIds(spHtml),
  };


  // (c) variantes: URLs de export descobertos + variantes diretas
  const fromSummary: string[] = [];
  const rawCands = [
    ...summaryPage.exportUrlStrings,
    ...summaryPage.exportTags
      .map((t) => t.match(/(?:href|action|data-url|data-href)\s*=\s*["']([^"']+)["']/i)?.[1] ?? null)
      .filter((u): u is string => !!u),
  ];
  for (const u of rawCands) {
    try { fromSummary.push(new URL(u.replace(/:id|\{id\}|\$\{id\}/g, id), BASE).toString()); } catch { /* ignora */ }
  }

  const suggested = eventPage.candidateUrls
    .filter((u) => /xlsx|export|sale|resumo|operac|report/i.test(u))
    .map((u) => {
      try { return new URL(u.replace(/:id|\{id\}|\$\{id\}/g, id), BASE).toString(); } catch { return null; }
    })
    .filter((u): u is string => !!u);

  const directVariants = [
    `${BASE}/managers/events/${id}/sale_summary.xlsx`,
    `${BASE}/managers/events/${id}/sale_summary.xlsx?filter_start_date=${startDD}&filter_end_date=${endDD}`,
  ];

  const patterns = [
    `${BASE}/promoters/events/${id}/sale_summary.xlsx?${query}`,
    `${BASE}/api/managers/events/${id}/sale_summary.xlsx?${query}`,
    `${BASE}/managers/events/${id}/reports/sale_summary.xlsx?${query}`,
    `${BASE}/managers/events/${id}/sale_summary?${query}&format=xlsx`,
  ];

  const tried = new Set<string>([currentUrl]);
  const variants: ProbeAttempt[] = [];
  for (const u of [...fromSummary, ...directVariants, ...suggested, ...patterns]) {
    if (tried.has(u) || variants.length >= 20) continue;
    tried.add(u);
    const r = await probeGet(jar, u, `${XLSX_ACCEPT},*/*`, 3);
    variants.push({
      url: u, status: r.status, contentType: r.contentType, location: r.chain.at(-1)?.location ?? null,
      looksXlsx: r.looksXlsx, size: r.size,
      snippet: r.looksXlsx ? undefined : (r.snippet || "").slice(0, 200),
      error: r.error,
    });
  }

  // Accept estrito no URL canónico
  const strict = await probeGet(jar, `${BASE}/managers/events/${id}/sale_summary.xlsx?${query}`, XLSX_ACCEPT, 3);
  variants.push({
    url: `${BASE}/managers/events/${id}/sale_summary.xlsx?${query} [Accept estrito]`,
    status: strict.status, contentType: strict.contentType, location: strict.chain.at(-1)?.location ?? null,
    looksXlsx: strict.looksXlsx, size: strict.size,
    snippet: strict.looksXlsx ? undefined : (strict.snippet || "").slice(0, 200),
    error: strict.error,
  });

  // v2.11 — sondas AJAX/JSON/dashboard + internet_sales.xlsx como fallback
  const ajaxProbes = await probeAjaxSequence(jar, id, query, startDD, endDD);
  const internetSales = await probeInternetSales(jar, id, query);

  return {
    config: {
      id: cfg.id,
      event_id: cfg.event_id,
      ticketline_event_id: id,
      organization_name: cfg.organization_name,
      vault_secret_name: cfg.vault_secret_name,
      sales_start_date: cfg.sales_start_date,
      filter_start_date: startDD,
      filter_end_date: endDD,
    },
    currentFlow,
    eventPage,
    summaryPage,
    variants,
    ajaxProbes,
    internetSales,
    hits: [...variants, ...ajaxProbes].filter((v) => v.looksXlsx).map((v) => v.url),
  };
}

function shrinkProbe(p: any, hard = false) {
  if (!p) return p;
  p.eventPage.scripts = p.eventPage.scripts.slice(0, hard ? 3 : 10);
  p.eventPage.candidateUrls = p.eventPage.candidateUrls.slice(0, hard ? 10 : 25);
  p.eventPage.snippet = (p.eventPage.snippet || "").slice(0, hard ? 200 : 400);
  p.summaryPage.scripts = p.summaryPage.scripts.slice(0, hard ? 3 : 10);
  p.summaryPage.bodyText = (p.summaryPage.bodyText || "").slice(0, hard ? 400 : 1000);
  if (hard) p.summaryPage.exportTags = p.summaryPage.exportTags.slice(0, 15);
  for (const v of p.variants) if (v.snippet) v.snippet = v.snippet.slice(0, hard ? 80 : 150);
  // v2.11
  if (p.summaryPage.jsUrlPatterns) {
    p.summaryPage.jsUrlPatterns = p.summaryPage.jsUrlPatterns
      .slice(0, hard ? 20 : 50)
      .map((x: any) => ({ match: x.match, context: hard ? String(x.context).slice(0, 80) : x.context }));
  }
  if (p.summaryPage.divIds) p.summaryPage.divIds = p.summaryPage.divIds.slice(0, hard ? 15 : 40);
  if (p.ajaxProbes) for (const v of p.ajaxProbes) if (v.snippet) v.snippet = v.snippet.slice(0, hard ? 80 : 150);
  if (p.internetSales?.rows) p.internetSales.rows = p.internetSales.rows.slice(0, hard ? 12 : 30);
  return p;
}

async function runProbe(admin: any, configId?: string, compareConfigId?: string) {
  if (!configId) return json(400, { error: "probe requer configId" });

  const target = await probeConfig(admin, configId);
  let compare: any = null;
  if (compareConfigId && compareConfigId !== configId) {
    try { compare = await probeConfig(admin, compareConfigId); }
    catch (e: any) { compare = { error: e?.message || String(e) }; }
  }

  const payload: any = { ok: true, version: VERSION, probe: { target, compare } };

  let out = JSON.stringify(payload);
  if (out.length > 60000) {
    shrinkProbe(payload.probe.target);
    if (payload.probe.compare && !payload.probe.compare.error) shrinkProbe(payload.probe.compare);
    out = JSON.stringify(payload);
  }
  if (out.length > 60000) {
    shrinkProbe(payload.probe.target, true);
    if (payload.probe.compare && !payload.probe.compare.error) shrinkProbe(payload.probe.compare, true);
    out = JSON.stringify(payload);
  }
  return new Response(out.slice(0, 60000), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================================================
// PROBE_NOVA_AREA (v2.21) — mapeia a "nova área de Promotores".
// Fase 1: apenas inventário. NÃO altera o fluxo de sync.
// ============================================================================

/** Carrega config + credenciais do Vault (helper partilhado pelas probes novas). */
async function loadCfgAndCreds(admin: any, configId: string) {
  const { data: cfgs, error } = await admin.from("ticketline_sync_config").select("*").eq("id", configId).limit(1);
  if (error) throw new Error(error.message);
  const cfg = (cfgs || [])[0];
  if (!cfg) throw new Error("config não encontrado");
  const { data: secRpc } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
  const raw = (typeof secRpc === "string" ? secRpc : "").trim();
  if (!raw) throw new Error(`Credenciais em falta no Vault (${cfg.vault_secret_name})`);
  const creds = JSON.parse(raw) as { email: string; password: string };
  return { cfg, creds };
}

const HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/** Inventário completo de uma página HTML: links, forms, redirects JS, hosts externos. */
function inventoryPage(html: string) {
  const links: Array<{ href: string; text: string }> = [];
  const linkRe = /<a\b([^>]*)>([\s\S]{0,400}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && links.length < 200) {
    const href = m[1].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    links.push({ href: href.slice(0, 400), text: stripTags(m[2]).slice(0, 160) });
  }

  const forms: Array<{ action: string | null; method: string | null; inputs: string[] }> = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  while ((m = formRe.exec(html)) !== null && forms.length < 20) {
    const attrs = m[1];
    const inputs: string[] = [];
    const inRe = /<(?:input|select|textarea)\b[^>]*>/gi;
    let i: RegExpExecArray | null;
    while ((i = inRe.exec(m[2])) !== null && inputs.length < 40) inputs.push(i[0].slice(0, 200));
    forms.push({
      action: attrs.match(/action\s*=\s*["']([^"']*)["']/i)?.[1] ?? null,
      method: attrs.match(/method\s*=\s*["']([^"']*)["']/i)?.[1] ?? null,
      inputs,
    });
  }

  const metaRefresh: string[] = [];
  const mrRe = /<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*>/gi;
  while ((m = mrRe.exec(html)) !== null && metaRefresh.length < 5) metaRefresh.push(m[0].slice(0, 300));

  const jsRedirects: string[] = [];
  const jsRe = /(?:window\.location(?:\.href|\.replace)?\s*(?:=|\()\s*|Turbo\.visit\(\s*|location\.assign\(\s*)["'`]([^"'`]{2,300})["'`]/gi;
  while ((m = jsRe.exec(html)) !== null && jsRedirects.length < 30) jsRedirects.push(m[1]);

  const externalHosts = new Set<string>();
  const hostRe = /https?:\/\/([a-z0-9.-]+)/gi;
  while ((m = hostRe.exec(html)) !== null) {
    const h = m[1].toLowerCase();
    if (h !== "manager.ticketline.pt") externalHosts.add(h);
    if (externalHosts.size > 60) break;
  }

  const suspects = new Set<string>();
  const suspectRe = /["'`]?((?:https?:\/\/[a-z0-9.-]*ticketline[a-z0-9.-]*)?\/?(?:promoters|promotores|promotor|v2|novosite|new)[^"'`\s<>]{0,200})["'`]?/gi;
  while ((m = suspectRe.exec(html)) !== null && suspects.size < 60) suspects.add(m[1].slice(0, 240));

  return {
    title: html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1]?.trim() ?? null,
    links,
    forms,
    metaRefresh,
    jsRedirects,
    externalHosts: Array.from(externalHosts),
    suspects: Array.from(suspects),
    reportUrls: extractReportUrls(html, 60),
    exportTags: extractExportTags(html),
  };
}

/** Heurística: esta página é a landing da "nova área de Promotores"? */
function looksLikeNovaArea(snippet: string | undefined): boolean {
  if (!snippet) return false;
  return /nova\s+[áa]rea\s+de\s+Promotores|encontrar\s+os\s+meus\s+relat[óo]rios|Mais organizada, mais informativa/i.test(snippet);
}

async function runProbeNovaArea(admin: any, configId?: string) {
  if (!configId) return json(400, { error: "probe_nova_area requer configId" });

  const { cfg, creds } = await loadCfgAndCreds(admin, configId);
  const id = String(cfg.ticketline_event_id);
  const { jar } = await loginDevise(creds.email, creds.password);

  const startDD = salesStartToDDMMYYYY(cfg.sales_start_date);
  const endDD = fmtDDMMYYYY(new Date());
  const query = `granularity=2&filter_start_date=${startDD}&filter_end_date=${endDD}&bulk_event_ids=&post_render_content=data`;

  const out: any = {
    ok: true,
    version: VERSION,
    config: { id: cfg.id, ticketline_event_id: id, organization_name: cfg.organization_name, vault_secret_name: cfg.vault_secret_name },
    window: { startDD, endDD },
    pages: [] as any[],
    followed: [] as any[],
    candidates: [] as any[],
  };

  // ---- (a) páginas base: /managers/events/<id> e o sale_summary.xlsx ----
  const basePages: Array<{ label: string; url: string; accept: string }> = [
    { label: "event_page", url: `${BASE}/managers/events/${encodeURIComponent(id)}`, accept: HTML_ACCEPT },
    { label: "sale_summary_xlsx", url: `${BASE}/managers/events/${encodeURIComponent(id)}/sale_summary.xlsx?${query}`, accept: `${XLSX_ACCEPT},*/*` },
    { label: "sale_summary_page", url: `${BASE}/managers/events/${encodeURIComponent(id)}/sale_summary`, accept: HTML_ACCEPT },
  ];

  const followSeeds = new Map<string, string>(); // url absoluto → texto/motivo

  for (const p of basePages) {
    const r = await probeGet(jar, p.url, p.accept, 4);
    const html = r.looksXlsx || !r.bytes ? "" : new TextDecoder("utf-8", { fatal: false }).decode(r.bytes);
    const entry: any = {
      label: p.label,
      requested: p.url,
      finalUrl: r.url,
      status: r.status,
      contentType: r.contentType,
      size: r.size,
      looksXlsx: r.looksXlsx,
      chain: r.chain,
      novaArea: looksLikeNovaArea(r.snippet ?? html.slice(0, 3000)),
      htmlFull: html ? html.slice(0, 120000) : null,
      htmlLength: html.length,
      inventory: html ? inventoryPage(html) : null,
    };
    out.pages.push(entry);

    if (entry.inventory) {
      const wanted = /promot|relat[óo]ri|report|nova\s+[áa]rea|v2/i;
      for (const l of entry.inventory.links as Array<{ href: string; text: string }>) {
        if (!wanted.test(l.href) && !wanted.test(l.text)) continue;
        if (/^(mailto:|tel:|javascript:|#)/i.test(l.href)) continue;
        try { followSeeds.set(new URL(l.href, r.url).toString(), l.text || l.href); } catch { /* href inválido */ }
      }
      for (const s of entry.inventory.jsRedirects as string[]) {
        try { followSeeds.set(new URL(s, r.url).toString(), "js-redirect"); } catch { /* ignora */ }
      }
    }
  }

  // ---- (b) seguir 1 nível os links da área nova / relatórios ----
  let followed = 0;
  for (const [url, reason] of followSeeds) {
    if (followed >= 10) break;
    followed++;
    const r = await probeGet(jar, url, HTML_ACCEPT, 4);
    const html = r.looksXlsx || !r.bytes ? "" : new TextDecoder("utf-8", { fatal: false }).decode(r.bytes);
    out.followed.push({
      seed: url,
      reason: reason.slice(0, 160),
      finalUrl: r.url,
      status: r.status,
      contentType: r.contentType,
      size: r.size,
      looksXlsx: r.looksXlsx,
      chain: r.chain,
      novaArea: looksLikeNovaArea(r.snippet ?? html.slice(0, 3000)),
      inventory: html ? inventoryPage(html) : null,
      snippet: r.looksXlsx ? undefined : (r.snippet ?? html.slice(0, 800)),
    });
  }

  // ---- (c) candidatos óbvios do caminho novo ----
  const candidateUrls: Array<{ label: string; url: string; accept: string }> = [
    { label: "promoters_event_xlsx", url: `${BASE}/promoters/events/${id}/sale_summary.xlsx?${query}`, accept: `${XLSX_ACCEPT},*/*` },
    { label: "promotores_event_xlsx", url: `${BASE}/promotores/events/${id}/sale_summary.xlsx?${query}`, accept: `${XLSX_ACCEPT},*/*` },
    { label: "managers_v2_xlsx", url: `${BASE}/managers/v2/events/${id}/sale_summary.xlsx?${query}`, accept: `${XLSX_ACCEPT},*/*` },
    { label: "v2_managers_xlsx", url: `${BASE}/v2/managers/events/${id}/sale_summary.xlsx?${query}`, accept: `${XLSX_ACCEPT},*/*` },
    { label: "promoters_reports", url: `${BASE}/promoters/events/${id}/reports`, accept: HTML_ACCEPT },
    { label: "promoters_event_page", url: `${BASE}/promoters/events/${id}`, accept: HTML_ACCEPT },
    { label: "promoters_root", url: `${BASE}/promoters`, accept: HTML_ACCEPT },
    { label: "promotores_root", url: `${BASE}/promotores`, accept: HTML_ACCEPT },
    { label: "reports_root", url: `${BASE}/managers/reports`, accept: HTML_ACCEPT },
    { label: "event_reports", url: `${BASE}/managers/events/${id}/reports`, accept: HTML_ACCEPT },
    { label: "host_promotor", url: `https://promotor.ticketline.pt/events/${id}`, accept: HTML_ACCEPT },
    { label: "host_promotores", url: `https://promotores.ticketline.pt/events/${id}`, accept: HTML_ACCEPT },
    { label: "host_promoters", url: `https://promoters.ticketline.pt/events/${id}`, accept: HTML_ACCEPT },
  ];

  for (const c of candidateUrls) {
    const r = await probeGet(jar, c.url, c.accept, 3, {}, 20000);
    out.candidates.push({
      label: c.label,
      url: c.url,
      finalUrl: r.url,
      status: r.status,
      contentType: r.contentType,
      size: r.size,
      looksXlsx: r.looksXlsx,
      chain: r.chain,
      novaArea: looksLikeNovaArea(r.snippet),
      snippet: r.snippet?.slice(0, 400),
      error: r.error,
    });
  }

  // ---- cap de tamanho (padrão do discover/probe) ----
  let text = JSON.stringify(out);
  if (text.length > 90000) {
    for (const p of out.pages) if (p.htmlFull) p.htmlFull = p.htmlFull.slice(0, 40000);
    text = JSON.stringify(out);
  }
  if (text.length > 90000) {
    for (const p of out.pages) if (p.htmlFull) p.htmlFull = p.htmlFull.slice(0, 15000);
    for (const f of out.followed) if (f.inventory) f.inventory.links = (f.inventory.links || []).slice(0, 40);
    out.truncated = true;
    text = JSON.stringify(out);
  }
  return new Response(text.slice(0, 95000), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

// Cache de sessão por vault_secret_name. Com credencial única (ticketline_master)
// partilhada por todos os configs, uma corrida do cron faz 1 login Devise em vez
// de 13. O self-heal continua a existir: se o download falhar com session_expired
// (retriable), refaz login, actualiza o cache e repete uma vez.
type SessionCache = Map<string, Jar>;

async function getJar(
  sessions: SessionCache,
  secretName: string,
  creds: { email: string; password: string },
  force = false,
): Promise<Jar> {
  if (!force) {
    const cached = sessions.get(secretName);
    if (cached) return cached;
  }
  const { jar } = await loginDevise(creds.email, creds.password);
  sessions.set(secretName, jar);
  console.log(`[ticketline] login Devise (${force ? "re-login" : "novo"}) para secret=${secretName}`);
  return jar;
}

/** Query comum ao .xlsx e à página do relatório (mesmo contrato do form). */
function saleSummaryQuery(filterStartDDMMYYYY: string, filterEndDDMMYYYY: string): string {
  const qs = new URLSearchParams();
  qs.set("utf8", "✓");
  qs.set("granularity", "2");
  qs.set("bulk_event_ids", "");
  qs.set("filter_start_date", filterStartDDMMYYYY);
  qs.set("filter_end_date", filterEndDDMMYYYY);
  return qs.toString();
}

const SJR_ACCEPT =
  "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.01";

/**
 * Fallback SJR: para eventos migrados o .xlsx devolve sempre a landing HTML.
 * Reproduz o pedido do bundle da Ticketline
 * (Managers.Events.EventSaleSummary#requestPostRender):
 *   1. GET da página do relatório (HTML) → csrf-token
 *   2. GET da MESMA URL + post_render_content=data&_=<ts>, Accept text/javascript
 *      e X-Requested-With: XMLHttpRequest (obrigatório — sem ele volta a landing).
 */
async function downloadSummarySjr(
  jar: Jar,
  ticketlineEventId: string,
  filterStartDDMMYYYY: string,
  filterEndDDMMYYYY: string,
): Promise<{ js: string; debug: Record<string, any> }> {
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const query = saleSummaryQuery(filterStartDDMMYYYY, filterEndDDMMYYYY);
  const pageUrl = `${BASE}/managers/events/${encodeURIComponent(ticketlineEventId)}/sale_summary?${query}`;

  const pageResp = await fetchWithTimeout(pageUrl, {
    method: "GET", redirect: "manual",
    headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,*/*", Cookie: jarToHeader(jar), Referer: `${BASE}/managers` },
  });
  ingestSetCookie(jar, pageResp);
  const pageHtml = await pageResp.text().catch(() => "");
  if (pageResp.status >= 300 && pageResp.status < 400) {
    const loc = pageResp.headers.get("location") || "";
    if (loc.includes("sign_in")) {
      throw Object.assign(new Error(`SJR: sessão expirada (302 → ${loc})`), { phase: "session_expired", retriable: true });
    }
    throw Object.assign(new Error(`SJR: página do relatório 302 → ${loc}`), { phase: "sjr_page_redirect" });
  }
  if (!pageResp.ok) {
    throw Object.assign(new Error(`SJR: página do relatório HTTP ${pageResp.status}`), { phase: `sjr_page_http_${pageResp.status}` });
  }
  const csrf = extractCsrfToken(pageHtml) || "";

  const dataUrl = `${pageUrl}&post_render_content=data&_=${Date.now()}`;
  const dataResp = await fetchWithTimeout(dataUrl, {
    method: "GET", redirect: "manual",
    headers: {
      "User-Agent": ua,
      Accept: SJR_ACCEPT,
      Cookie: jarToHeader(jar),
      Referer: pageUrl,
      "X-Requested-With": "XMLHttpRequest",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
  }, 90000);
  ingestSetCookie(jar, dataResp);
  if (dataResp.status >= 300 && dataResp.status < 400) {
    const loc = dataResp.headers.get("location") || "";
    await dataResp.text().catch(() => null);
    if (loc.includes("sign_in")) {
      throw Object.assign(new Error(`SJR: sessão expirada (302 → ${loc})`), { phase: "session_expired", retriable: true });
    }
    throw Object.assign(new Error(`SJR: fragmento 302 → ${loc}`), { phase: "sjr_data_redirect" });
  }
  const ct = dataResp.headers.get("content-type") || "";
  const js = await dataResp.text();
  if (!dataResp.ok) {
    throw Object.assign(new Error(`SJR: fragmento HTTP ${dataResp.status}`), { phase: `sjr_data_http_${dataResp.status}` });
  }
  const hasTable = /<table|\\u003ctable|<\\\/table>/i.test(js);
  if (!hasTable) {
    const { title, snippet, isSignIn } = describeHtml(js);
    if (isSignIn) {
      throw Object.assign(new Error("SJR: página de login devolvida (sessão expirada)"), { phase: "session_expired", retriable: true });
    }
    throw Object.assign(
      new Error(`SJR: resposta sem tabelas (content-type=${ct}, size=${js.length}) — title="${title}" | ${snippet}`),
      { phase: "sjr_no_tables", sjrDebug: { pageUrl, dataUrl, contentType: ct, size: js.length, csrfFound: !!csrf } },
    );
  }
  return {
    js,
    debug: {
      pageUrl, dataUrl, contentType: ct, size: js.length,
      csrfFound: !!csrf, pageSize: pageHtml.length,
    },
  };
}

export type SummaryDownload =
  | { mode: "xlsx"; bytes: Uint8Array }
  | { mode: "dashboard_today"; series: DashboardDailyResult; debug: Record<string, any> };

async function downloadSummary(
  creds: { email: string; password: string },
  secretName: string,
  sessions: SessionCache,
  ticketlineEventId: string,
  filterStartDDMMYYYY: string,
  filterEndDDMMYYYY: string,
): Promise<SummaryDownload> {
  const jar = await getJar(sessions, secretName, creds);
  const qs = new URLSearchParams(saleSummaryQuery(filterStartDDMMYYYY, filterEndDDMMYYYY));
  qs.set("post_render_content", "data");
  qs.set("_", String(Date.now()));
  const url = `${BASE}/managers/events/${encodeURIComponent(ticketlineEventId)}/sale_summary.xlsx?${qs.toString()}`;
  // Evento migrado: export .xlsx bloqueado (devolve a landing) → captura
  // INCREMENTAL do dia corrente no dashboard. A captura exige SESSÃO FRESCA
  // (period default "Hoje"), por isso pede sempre um login novo.
  const todayCapture = async (xlsxError: any) => {
    const freshJar = await getJar(sessions, secretName, creds, true);
    return await dashboardTodayCapture(freshJar, ticketlineEventId, filterStartDDMMYYYY, filterEndDDMMYYYY, xlsxError);
  };
  try {
    return { mode: "xlsx", bytes: await downloadXlsx(jar, url, "sale_summary") };
  } catch (e: any) {
    if (e?.retriable) {
      console.log(`[ticketline] self-heal re-login (sale_summary)`);
      const jar2 = await getJar(sessions, secretName, creds, true);
      try {
        return { mode: "xlsx", bytes: await downloadXlsx(jar2, url, "sale_summary") };
      } catch (e2: any) {
        if (e2?.phase !== "html_response") throw e2;
        return await todayCapture(e2);
      }
    }
    if (e?.phase !== "html_response") throw e;
    return await todayCapture(e);
  }
}


// ============================================================================
// Captura incremental do dia corrente (v2.33)
// Eventos migrados: /managers/events/<id>/sale_summary vem a zeros (sondas v2.27)
// e o export .xlsx devolve a landing. O dashboard global TEM os números reais,
// mas NÃO combina intervalo de datas com filtro de evento: assim que a sessão
// guarda um `period`, o GET SJR ignora `bulk_event_ids` e re-renderiza a conta
// inteira (provado v2.30–v2.32). Em sessão FRESCA (period default "Hoje") o GET
// SJR com `bulk_event_ids` filtra corretamente e devolve o dia corrente.
// Desenho: capturar só HOJE, em incremental (UPSERT), e nunca fazer POST de
// period. O histórico anterior é backfilled por SQL a partir do ticket_sales.
// ============================================================================

const DASH_URL = `${BASE}/managers/dashboard/sale_summary`;

function dashSjrUrl(
  id: string | null,
  startDD: string,
  endDD: string,
  opts?: { eventParam?: "scalar" | "array"; noDates?: boolean },
): string {
  const qs = new URLSearchParams();
  if (!opts?.noDates) qs.set("utf8", "✓");
  qs.set("granularity", "2");
  if (id) qs.set(opts?.eventParam === "array" ? "bulk_event_ids[]" : "bulk_event_ids", id);
  if (!opts?.noDates) {
    qs.set("filter_start_date", startDD);
    qs.set("filter_end_date", endDD);
  }
  qs.set("post_render_content", "data");
  qs.set("_", String(Date.now()));
  return `${DASH_URL}?${qs.toString()}`;
}

async function dashGetHtml(jar: Jar): Promise<{ html: string; token: string }> {
  const resp = await fetchWithTimeout(DASH_URL, {
    method: "GET", redirect: "manual",
    headers: { "User-Agent": UA_PROBE, Accept: "text/html,application/xhtml+xml,*/*", Cookie: jarToHeader(jar), Referer: `${BASE}/managers` },
  }, 60000);
  ingestSetCookie(jar, resp);
  const html = await resp.text().catch(() => "");
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location") || "";
    if (loc.includes("sign_in")) {
      throw Object.assign(new Error(`dashboard: sessão expirada (302 → ${loc})`), { phase: "session_expired", retriable: true });
    }
    throw Object.assign(new Error(`dashboard: página 302 → ${loc}`), { phase: "dashboard_page_redirect" });
  }
  if (!resp.ok) {
    throw Object.assign(new Error(`dashboard: página HTTP ${resp.status}`), { phase: `dashboard_page_http_${resp.status}` });
  }
  const token = /name="authenticity_token"\s+value="([^"]+)"/.exec(html)?.[1] || extractCsrfToken(html) || "";
  return { html, token };
}

/**
 * Fixa o período do dashboard por POST (period=5 + datas; evento opcional).
 * ⚠️ v2.33: FORA do caminho de sync. Guardar period na sessão faz o servidor
 * ignorar `bulk_event_ids` no GET SJR (a resposta passa a ser a conta inteira).
 * Mantida apenas para sondas manuais.
 */
async function dashPostPeriod(jar: Jar, token: string, startDD: string, endDD: string, id?: string) {
  const form = new URLSearchParams({
    utf8: "✓",
    authenticity_token: token,
    period: "5",
    filter_start_date: startDD,
    filter_end_date: endDD,
  });
  if (id) {
    form.set("bulk_event_ids", id);
    form.append("bulk_event_ids[]", id);
  }
  const resp = await fetchWithTimeout(DASH_URL, {
    method: "POST", redirect: "manual",
    headers: {
      "User-Agent": UA_PROBE,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,*/*",
      Cookie: jarToHeader(jar),
      Referer: DASH_URL,
      Origin: BASE,
    },
    body: form.toString(),
  }, 90000);
  ingestSetCookie(jar, resp);
  await resp.text().catch(() => null);
  return { status: resp.status, location: resp.headers.get("location") };
}

/** Lê a série diária do dashboard via SJR. */
async function dashFetchSeries(
  jar: Jar,
  token: string,
  id: string | null,
  startDD: string,
  endDD: string,
  opts?: { eventParam?: "scalar" | "array"; noDates?: boolean },
): Promise<{ series: DashboardDailyResult; url: string; size: number; contentType: string }> {
  const url = dashSjrUrl(id, startDD, endDD, opts);
  const resp = await fetchWithTimeout(url, {
    method: "GET", redirect: "manual",
    headers: {
      "User-Agent": UA_PROBE,
      Accept: SJR_ACCEPT,
      Cookie: jarToHeader(jar),
      Referer: DASH_URL,
      "X-Requested-With": "XMLHttpRequest",
      ...(token ? { "X-CSRF-Token": token } : {}),
    },
  }, 110000);
  ingestSetCookie(jar, resp);
  const ct = resp.headers.get("content-type") || "";
  const body = await resp.text().catch(() => "");
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location") || "";
    if (loc.includes("sign_in")) {
      throw Object.assign(new Error(`dashboard SJR: sessão expirada (302 → ${loc})`), { phase: "session_expired", retriable: true });
    }
    throw Object.assign(new Error(`dashboard SJR: 302 → ${loc}`), { phase: "dashboard_sjr_redirect" });
  }
  if (!resp.ok) {
    throw Object.assign(new Error(`dashboard SJR: HTTP ${resp.status}`), { phase: `dashboard_sjr_http_${resp.status}` });
  }
  if (!/<table|\\u003ctable/i.test(body)) {
    const { title, snippet, isSignIn } = describeHtml(body);
    if (isSignIn) {
      throw Object.assign(new Error("dashboard SJR: página de login (sessão expirada)"), { phase: "session_expired", retriable: true });
    }
    throw Object.assign(
      new Error(`dashboard SJR: resposta sem tabelas (ct=${ct}, size=${body.length}) — title="${title}" | ${snippet}`),
      { phase: "dashboard_sjr_no_tables" },
    );
  }
  const series = parseDashboardDailySjr(body);
  return { series, url, size: body.length, contentType: ct };
}

/** ISO YYYY-MM-DD do dia anterior (aritmética date-only, segura em UTC). */
function isoMinusDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
}

const TODAY_MAX_DATE_ROWS = 3;
const TODAY_MAX_QTY_PER_ROW = 5000;
const TODAY_BASELINE_MIN_QTY = 200;

/**
 * Captura INCREMENTAL do dia corrente para eventos migrados.
 *
 * Requisitos absolutos (v2.33):
 * - NUNCA fazer POST de `period` — a sessão tem de ficar no default "Hoje";
 *   qualquer period guardado faz o servidor ignorar `bulk_event_ids`.
 * - Só um GET SJR filtrado + um GET SJR de baseline (conta inteira) por run.
 * - Rejeitar (sem gravar nada) se a resposta não parecer o dia corrente do
 *   evento: datas fora de [hoje−1, hoje], demasiadas linhas, qty absurda, ou
 *   totais idênticos à conta inteira (filtro ignorado).
 */
async function dashboardTodayCapture(
  jar: Jar,
  ticketlineEventId: string,
  filterStart: string,
  filterEnd: string,
  xlsxError: any,
): Promise<SummaryDownload> {
  const todayIso = lisbonTodayIso();
  const yesterdayIso = isoMinusDays(todayIso, 1);
  console.log(`[ticketline] .xlsx devolveu landing — captura do dia corrente (evento ${ticketlineEventId}, ${todayIso})`);

  const debug: Record<string, any> = {
    strategy: "dashboard_today",
    filterStart,
    filterEnd,
    todayIso,
    acceptedRange: [yesterdayIso, todayIso],
    usedUrl: null,
    rows: null,
    baselineToday: null,
    validations: {} as Record<string, any>,
  };

  try {
    const { html, token } = await dashGetHtml(jar);
    debug.tokenFound = !!token;
    debug.pageSize = html.length;

    // ---- GET SJR filtrado pelo evento (sessão fresca, period default "Hoje") ----
    const got = await dashFetchSeries(jar, token, ticketlineEventId, filterStart, filterEnd);
    debug.usedUrl = got.url;
    debug.size = got.size;
    debug.contentType = got.contentType;
    debug.parser = got.series.debug;
    debug.headerRange = got.series.headerRange;
    debug.totalRow = got.series.totalRow;
    debug.rows = got.series.rows;
    debug.sums = got.series.sums;

    // ---- Baseline de identidade: mesma sessão, SEM bulk_event_ids ----
    const baselineFetch = await dashFetchSeries(jar, token, null, filterStart, filterEnd);
    const baselineToday = {
      url: baselineFetch.url,
      size: baselineFetch.size,
      days: baselineFetch.series.rows.length,
      sums: baselineFetch.series.sums,
      totalRow: baselineFetch.series.totalRow,
      headerRange: baselineFetch.series.headerRange,
    };
    debug.baselineToday = baselineToday;

    const rows = got.series.rows;
    const reject = (phase: string, msg: string) => {
      throw Object.assign(new Error(`dashboard today: ${msg}`), { phase, dashDebug: debug });
    };

    // (a) todas as datas dentro de [hoje−1, hoje] em Europe/Lisbon
    const outside = rows.filter((r) => r.sale_date < yesterdayIso || r.sale_date > todayIso).map((r) => r.sale_date);
    debug.validations.datesOutsideRange = outside;
    if (outside.length > 0) {
      reject(
        "dashboard_today_unexpected_range",
        `datas fora de [${yesterdayIso}..${todayIso}]: ${outside.join(",")} — sessão contaminada (period aplicado)`,
      );
    }

    // (b) nº de linhas de data ≤ 3
    debug.validations.dateRowCount = rows.length;
    if (rows.length > TODAY_MAX_DATE_ROWS) {
      reject(
        "dashboard_today_unexpected_range",
        `${rows.length} linhas de data (máx ${TODAY_MAX_DATE_ROWS}) — sessão contaminada (period aplicado)`,
      );
    }

    // (c) qty por linha ≤ 5000
    const insane = rows.filter((r) => r.quantity > TODAY_MAX_QTY_PER_ROW);
    debug.validations.rowsOverQtyLimit = insane.map((r) => ({ sale_date: r.sale_date, quantity: r.quantity }));
    if (insane.length > 0) {
      reject(
        "dashboard_today_sanity",
        `qty por dia acima do limite de sanidade (${insane.map((r) => `${r.sale_date}=${r.quantity}`).join(",")} > ${TODAY_MAX_QTY_PER_ROW})`,
      );
    }

    // (d) identidade: totais iguais à conta inteira → filtro ignorado
    const sameQty = got.series.sums.qty === baselineToday.sums.qty;
    const sameValue = Math.abs(got.series.sums.value - baselineToday.sums.value) < 0.01;
    const identityRejected = sameQty && sameValue && baselineToday.sums.qty > TODAY_BASELINE_MIN_QTY;
    debug.validations.identity = { event: got.series.sums, baseline: baselineToday.sums, sameQty, sameValue, rejected: identityRejected };
    if (identityRejected) {
      reject(
        "dashboard_today_filter_ignored",
        `totais idênticos à conta inteira (qty=${got.series.sums.qty}, valor=${got.series.sums.value})`,
      );
    }

    return { mode: "dashboard_today", series: got.series, debug };
  } catch (e: any) {
    if (e?.retriable) throw e;
    if (
      ["dashboard_today_unexpected_range", "dashboard_today_sanity", "dashboard_today_filter_ignored"].includes(e?.phase)
    ) throw e;
    // Captura também falhou → mantém o erro html_response original + debug.
    throw Object.assign(new Error(`${xlsxError.message} | captura dia corrente falhou: ${e?.message || e}`), {
      phase: "html_response",
      retriable: false,
      htmlTitle: xlsxError.htmlTitle,
      htmlSnippet: xlsxError.htmlSnippet,
      dashPhase: e?.phase || "dashboard_today_failed",
      dashDebug: debug,
    });
  }
}





// ============================================================================
// Área nova de Promotores — relatório sales_per_event.xlsx
// Para eventos migrados (68027 Almada, 68026 Santarém) o sale_summary.xlsx
// devolve HTML; o XLSX válido vive em /managers/dashboard/sales_per_event.xlsx.
// ============================================================================
function salesPerEventUrl(id: string, startDD: string, endDD: string): string {
  const qs = new URLSearchParams();
  qs.set("event_id", id);
  qs.set("filter_start_date", startDD);
  qs.set("filter_end_date", endDD);
  qs.set("_", String(Date.now()));
  return `${BASE}/managers/dashboard/sales_per_event.xlsx?${qs.toString()}`;
}

// ============================================================================
// action "probe_params" (v2.22) — matriz de variantes de parâmetros do
// sale_summary.xlsx no MESMO login. Objetivo: descobrir qual o contrato de
// parâmetros aceito pelos eventos migrados (que caem na landing "nova área").
// NÃO altera o fluxo de sync.
// ============================================================================
function summarizeAttempt(label: string, url: string, r: any) {
  const out: any = {
    label,
    url,
    finalUrl: r.url,
    status: r.status,
    contentType: r.contentType,
    size: r.size ?? null,
    looksXlsx: !!r.looksXlsx,
    novaArea: looksLikeNovaArea(r.snippet),
    chain: (r.chain || []).map((c: any) => `${c.status} ${c.url}${c.location ? ` -> ${c.location}` : ""}`),
    error: r.error ?? null,
  };
  if (!r.looksXlsx) out.snippet = (r.snippet || "").slice(0, 400);
  if (r.looksXlsx && r.bytes) {
    try {
      const d = dumpXlsx(r.bytes, 8, 14);
      out.xlsx = {
        sheetNames: d.sheetNames,
        headRows: d.sheets.map((s: any) => ({ name: s.name, ref: s.ref, rows: s.rows.slice(0, 8) })),
      };
    } catch (e: any) {
      out.xlsxParseError = e?.message || String(e);
    }
  }
  return out;
}

/** Constrói a query tal como o <form> de filtros real da página submete. */
function buildQueryFromForm(form: any, startDD: string, endDD: string) {
  const params = new URLSearchParams();
  const granularityOptions: string[] = (form.options || []).map((o: any) => o.value);
  for (const f of form.fields || []) {
    if (!f.name) continue;
    const t = (f.type || "").toLowerCase();
    if (t === "submit" || t === "button" || t === "file") continue;
    let value = f.value ?? "";
    if (/filter_start_date|start_date/i.test(f.name)) value = startDD;
    else if (/filter_end_date|end_date/i.test(f.name)) value = endDD;
    params.set(f.name, String(value));
  }
  const numeric = granularityOptions.filter((v) => /^\d+$/.test(v));
  const gran = numeric.includes("2") ? "2" : (numeric.sort((a, b) => Number(b) - Number(a))[0] ?? "2");
  params.set("granularity", gran);
  if (!params.has("utf8")) params.set("utf8", "\u2713");
  return { query: params.toString(), granularityOptions, granularityUsed: gran };
}

/** Limpa texto de célula HTML (tags, entidades, espaços). */
function cleanCellText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Extrai estrutura das tabelas do relatório HTML: headers (<th>), primeiras
 * linhas de células e marcadores de secção (h2/h3/caption) antes de cada tabela.
 */
function extractHtmlTables(html: string, maxTables = 8, maxRows = 6, maxCols = 20) {
  const tables: any[] = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(html)) && tables.length < maxTables) {
    idx++;
    const inner = m[1];
    const before = html.slice(Math.max(0, m.index - 1500), m.index);
    const markers = Array.from(before.matchAll(/<(h1|h2|h3|h4|legend|caption)\b[^>]*>([\s\S]*?)<\/\1>/gi))
      .map((x) => cleanCellText(x[2]))
      .filter(Boolean)
      .slice(-3);
    const caption = Array.from(inner.matchAll(/<caption\b[^>]*>([\s\S]*?)<\/caption>/gi)).map((x) => cleanCellText(x[1]));

    const trs = Array.from(inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((x) => x[1]);
    const headerRows: string[][] = [];
    const bodyRows: string[][] = [];
    for (const tr of trs) {
      const cells = Array.from(tr.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi));
      if (cells.length === 0) continue;
      const isHeader = cells.every((c) => c[1].toLowerCase() === "th");
      const vals = cells.slice(0, maxCols).map((c) => {
        const attrs = c[2] || "";
        const span = attrs.match(/colspan\s*=\s*["']?(\d+)/i);
        const txt = cleanCellText(c[3]);
        return span && Number(span[1]) > 1 ? `${txt}[colspan=${span[1]}]` : txt;
      });
      if (isHeader && bodyRows.length === 0) headerRows.push(vals);
      else if (bodyRows.length < maxRows) bodyRows.push(vals);
    }
    const allText = headerRows.concat(bodyRows).flat().join(" ").toUpperCase();
    tables.push({
      index: idx,
      sectionMarkers: markers,
      caption,
      totalRows: trs.length,
      headerRows,
      firstRows: bodyRows,
      looksZoneReport: /ZONA|SETOR/.test(allText),
      looksDaily: /\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2}/.test(headerRows.concat(bodyRows).flat().join(" ")),
    });
  }
  return { tablesFound: idx, tables };
}

/** Resumo de uma tentativa binária (PDF/CSV) — magic bytes + primeiros bytes. */
function summarizeBinaryAttempt(label: string, url: string, r: any) {
  const bytes: Uint8Array | undefined = r.bytes;
  const head = bytes ? Array.from(bytes.slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join(" ") : null;
  const asText = bytes ? new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 300)) : "";
  return {
    label,
    url,
    finalUrl: r.url,
    status: r.status,
    contentType: r.contentType,
    size: r.size ?? null,
    looksPdf: !!bytes && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46,
    looksHtml: /<!doctype html|<html/i.test(asText),
    looksCsv: !/^</.test(asText.trim()) && /[;,]/.test(asText.split("\n")[0] ?? ""),
    novaArea: looksLikeNovaArea(r.snippet ?? asText),
    firstBytesHex: head,
    firstChars: asText.slice(0, 200),
    chain: (r.chain || []).map((c: any) => `${c.status} ${c.url}${c.location ? ` -> ${c.location}` : ""}`),
    error: r.error ?? null,
  };
}

/** Inteligência sobre a página do relatório: assets próprios, blobs JSON, data-urls, contextos. */
function extractPageIntel(html: string, baseUrl: string) {
  const abs = (u: string) => {
    try { return new URL(u, baseUrl).toString(); } catch { return u; }
  };
  const isCdn = (u: string) => /(cdn|googleapis|cloudflare|jquery|bootstrapcdn|unpkg|jsdelivr|gstatic|fontawesome)/i.test(u);

  const scripts = Array.from(html.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/gi))
    .map((m) => abs(m[1])).filter((u) => !isCdn(u));
  const styles = Array.from(html.matchAll(/<link[^>]+rel\s*=\s*["']stylesheet["'][^>]*>/gi))
    .map((m) => m[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1] ?? "")
    .filter(Boolean).map(abs).filter((u) => !isCdn(u));

  const jsonBlobs: Array<{ kind: string; preview: string }> = [];
  const pushBlob = (kind: string, s: string) => {
    if (!s) return;
    if (jsonBlobs.length >= 20) return;
    jsonBlobs.push({ kind, preview: s.slice(0, 1500) });
  };
  for (const m of html.matchAll(/window\.(__[A-Za-z0-9_$]+|[A-Za-z0-9_$]+)\s*=\s*(\{[\s\S]{0,4000}?\}|\[[\s\S]{0,4000}?\]);/g)) {
    pushBlob(`window.${m[1]}`, m[2]);
  }
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    pushBlob("script[type=application/json]", m[1].trim());
  }
  for (const attr of ["data-react-props", "data-page", "data-props", "data-json"]) {
    for (const m of html.matchAll(new RegExp(`${attr}\\s*=\\s*["']([\\s\\S]{0,4000}?)["']`, "gi"))) {
      pushBlob(attr, m[1]);
    }
  }
  for (const m of html.matchAll(/gon\.([A-Za-z0-9_$]+)\s*=\s*([\s\S]{0,2000}?);/g)) {
    pushBlob(`gon.${m[1]}`, m[2]);
  }
  for (const m of html.matchAll(/JSON\.parse\(\s*(['"])([\s\S]{0,4000}?)\1\s*\)/g)) {
    pushBlob("JSON.parse", m[2]);
  }

  const dataUrls = Array.from(
    new Set(
      Array.from(html.matchAll(/data-(url|endpoint|source|remote|href|path)\s*=\s*["']([^"']+)["']/gi)).map(
        (m) => `${m[1]}=${m[2]}`,
      ),
    ),
  ).slice(0, 40);

  const contexts: Array<{ needle: string; at: number; text: string }> = [];
  for (const needle of ["sale_summary", "post_render"]) {
    let from = 0;
    let found = 0;
    while (found < 10) {
      const i = html.indexOf(needle, from);
      if (i < 0) break;
      contexts.push({ needle, at: i, text: html.slice(Math.max(0, i - 80), i + 120).replace(/\s+/g, " ") });
      from = i + needle.length;
      found++;
    }
  }

  return {
    size: html.length,
    ownScripts: Array.from(new Set(scripts)).slice(0, 30),
    ownStylesheets: Array.from(new Set(styles)).slice(0, 20),
    jsonBlobs,
    dataUrls,
    contexts: contexts.slice(0, 20),
  };
}


/** Desescapa HTML embutido em JS (SJR). */
function unescapeJsHtml(body: string): string {
  return body
    .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\u0026/gi, "&")
    .replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\//g, "/");
}

/** Conta células numéricas != 0 e devolve uma linha-exemplo. */
function nonZeroStats(html: string): { nonZeroNumbers: number; nonZeroSampleRow: string | null } {
  const cellRe = /<t[dh][^>]*>\s*([^<]*?)\s*<\/t[dh]>/gi;
  let nonZero = 0;
  let m: RegExpExecArray | null;
  const isNum = (t: string) => /^[-+()\d\s.,€%]+$/.test(t) && /[1-9]/.test(t.replace(/[^\d]/g, ""));
  while ((m = cellRe.exec(html)) !== null) {
    const txt = (m[1] || "").replace(/&nbsp;|\u00a0/g, " ").trim();
    if (isNum(txt)) nonZero++;
  }
  let sampleRow: string | null = null;
  if (nonZero > 0) {
    for (const row of html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []) {
      const cells = Array.from(row.matchAll(/<t[dh][^>]*>\s*([^<]*?)\s*<\/t[dh]>/gi)).map((c) =>
        (c[1] || "").replace(/&nbsp;|\u00a0/g, " ").trim(),
      );
      if (cells.some(isNum)) { sampleRow = cells.join(" | ").slice(0, 300); break; }
    }
  }
  return { nonZeroNumbers: nonZero, nonZeroSampleRow: sampleRow };
}

// ============================================================================
// action "sjr" (v2.33) — GET cru de URLs do dashboard com os headers SJR.
// Login FRESCO (sessão no period default "Hoje") + página do dashboard só para
// o csrf; nenhum POST de period. Serve para testar variantes de parâmetros
// (ex.: period=1 "Ontem" a conviver com bulk_event_ids) sem gravar nada.
// ============================================================================
async function runProbeSjr(admin: any, configId?: string, urls?: string[]) {
  if (!configId) return json(400, { error: "sjr requer configId" });
  if (!urls || urls.length === 0) return json(400, { error: "sjr requer urls: string[]" });

  const { cfg, creds } = await loadCfgAndCreds(admin, configId);
  const { jar } = await loginDevise(creds.email, creds.password);
  const { html: dashHtml, token } = await dashGetHtml(jar);

  const out: any = {
    ok: true,
    version: VERSION,
    configId,
    ticketline_event_id: String(cfg.ticketline_event_id),
    todayIso: lisbonTodayIso(),
    tokenFound: !!token,
    dashPageSize: dashHtml.length,
    results: [] as any[],
  };

  for (const url of urls) {
    const entry: any = { url };
    try {
      const resp = await fetchWithTimeout(url, {
        method: "GET", redirect: "manual",
        headers: {
          "User-Agent": UA_PROBE,
          Accept: SJR_ACCEPT,
          Cookie: jarToHeader(jar),
          Referer: DASH_URL,
          "X-Requested-With": "XMLHttpRequest",
          ...(token ? { "X-CSRF-Token": token } : {}),
        },
      }, 110000);
      ingestSetCookie(jar, resp);
      const body = await resp.text().catch(() => "");
      entry.status = resp.status;
      entry.location = resp.headers.get("location");
      entry.contentType = resp.headers.get("content-type") || "";
      entry.size = body.length;
      const unescaped = unescapeJsHtml(body);
      entry.novaArea = looksLikeNovaArea(unescaped.slice(0, 3000));
      entry.hasTableMarkup = /<table/i.test(unescaped);
      if (entry.hasTableMarkup) {
        Object.assign(entry, extractHtmlTables(unescaped, 8, 10, 20));
      } else {
        const { title, snippet, isSignIn } = describeHtml(body);
        entry.title = title;
        entry.snippet = snippet;
        entry.isSignIn = isSignIn;
      }
    } catch (e: any) {
      entry.error = e?.message || String(e);
      entry.phase = e?.phase || null;
    }
    out.results.push(entry);
  }

  return new Response(JSON.stringify(out), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


async function runProbeParams(admin: any, configId?: string) {

  if (!configId) return json(400, { error: "probe_params requer configId" });

  const { cfg, creds } = await loadCfgAndCreds(admin, configId);
  const id = String(cfg.ticketline_event_id);
  const { jar } = await loginDevise(creds.email, creds.password);

  const startDD = salesStartToDDMMYYYY(cfg.sales_start_date);
  const endDD = fmtDDMMYYYY(new Date());
  const evBase = `${BASE}/managers/events/${encodeURIComponent(id)}`;
  const XA = `${XLSX_ACCEPT},*/*`;

  const out: any = {
    ok: true,
    version: VERSION,
    configId,
    ticketline_event_id: id,
    organization_name: cfg.organization_name,
    window: { startDD, endDD, sales_start_date: cfg.sales_start_date ?? null },
    variants: [] as any[],
    formSubmission: null as any,
  };

  const variants: Array<{ label: string; url: string }> = [
    { label: "a_granularity_0", url: `${evBase}/sale_summary.xlsx?granularity=0` },
    { label: "b_granularity_2_only", url: `${evBase}/sale_summary.xlsx?granularity=2` },
    { label: "c_gran2_filters_no_post_render", url: `${evBase}/sale_summary.xlsx?granularity=2&filter_start_date=${startDD}&filter_end_date=${endDD}` },
    { label: "d_gran2_filters_utf8", url: `${evBase}/sale_summary.xlsx?utf8=%E2%9C%93&granularity=2&filter_start_date=${startDD}&filter_end_date=${endDD}` },
    { label: "z_current_sync_request", url: `${evBase}/sale_summary.xlsx?granularity=2&filter_start_date=${startDD}&filter_end_date=${endDD}&bulk_event_ids=&post_render_content=data` },
    { label: "y_granularity_1", url: `${evBase}/sale_summary.xlsx?granularity=1` },
    { label: "x_gran0_filters", url: `${evBase}/sale_summary.xlsx?granularity=0&filter_start_date=${startDD}&filter_end_date=${endDD}` },
  ];

  for (const v of variants) {
    const r = await probeGet(jar, v.url, XA, 3, { Referer: `${evBase}/sale_summary` });
    out.variants.push(summarizeAttempt(v.label, v.url, r));
  }

  const pageUrl = `${evBase}/sale_summary`;
  const page = await probeGet(jar, pageUrl, HTML_ACCEPT, 3);
  const pageHtml = page.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(page.bytes) : "";
  const forms = extractForms(pageHtml);
  const candidate =
    forms.find((f: any) => (f.fields || []).some((x: any) => /filter_start_date/i.test(x.name || ""))) ??
    forms.find((f: any) => /sale_summary/i.test(f.action || "")) ??
    forms[0] ?? null;

  const formInfo: any = {
    pageUrl,
    pageStatus: page.status,
    pageContentType: page.contentType,
    pageSize: page.size ?? null,
    pageNovaArea: looksLikeNovaArea(page.snippet),
    formsFound: forms.length,
    forms: forms.map((f: any) => ({ action: f.action, method: f.method, fields: f.fields, options: f.options })),
    xlsxLinksOnPage: Array.from(
      new Set(Array.from(pageHtml.matchAll(/(?:href|action)\s*=\s*["']([^"']*sale_summary[^"']*)["']/gi)).map((x) => x[1])),
    ).slice(0, 20),
  };

  if (candidate) {
    const built = buildQueryFromForm(candidate, startDD, endDD);
    const actionPath = candidate.action && candidate.action.trim() ? candidate.action.trim() : `/managers/events/${id}/sale_summary`;
    const actionAbs = new URL(actionPath, `${BASE}/`).toString();
    const xlsxAction = /\.xlsx($|\?)/.test(actionAbs) ? actionAbs : actionAbs.replace(/(\/sale_summary)(?=$|\?)/, "$1.xlsx");

    formInfo.chosenForm = { action: candidate.action, method: candidate.method };
    formInfo.granularityOptions = built.granularityOptions;
    formInfo.granularityUsed = built.granularityUsed;

    const attempts: any[] = [];
    const u1 = `${actionAbs}?${built.query}`;
    attempts.push(summarizeAttempt("e1_form_query_html", u1, await probeGet(jar, u1, HTML_ACCEPT, 3, { Referer: pageUrl })));
    const u2 = `${xlsxAction}?${built.query}`;
    attempts.push(summarizeAttempt("e2_form_query_xlsx", u2, await probeGet(jar, u2, XA, 3, { Referer: pageUrl })));
    const q3 = new URLSearchParams(built.query);
    q3.delete("utf8");
    const u3 = `${xlsxAction}?${q3.toString()}`;
    attempts.push(summarizeAttempt("e3_form_query_xlsx_no_utf8", u3, await probeGet(jar, u3, XA, 3, { Referer: pageUrl })));

    formInfo.attempts = attempts;

    // ---- htmlTable: estrutura das tabelas do relatório server-rendered (e1) ----
    const e1 = await probeGet(jar, u1, HTML_ACCEPT, 3, { Referer: pageUrl });
    const e1Html = e1.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(e1.bytes) : "";
    out.htmlTable = {
      url: u1,
      status: e1.status,
      contentType: e1.contentType,
      size: e1.size ?? null,
      novaArea: looksLikeNovaArea(e1.snippet),
      ...extractHtmlTables(e1Html),
    };

    // ---- PDF / CSV: escaparam ao bloqueio do export? ----
    const pdfCsvBase = actionAbs.replace(/\.(xlsx|html)$/i, "");
    const binVariants: Array<{ label: string; url: string; accept: string }> = [
      { label: "pdf_granularity_0", url: `${pdfCsvBase}.pdf?granularity=0`, accept: "application/pdf,*/*" },
      { label: "pdf_gran2_filters", url: `${pdfCsvBase}.pdf?${built.query}`, accept: "application/pdf,*/*" },
      { label: "csv_granularity_0", url: `${pdfCsvBase}.csv?granularity=0`, accept: "text/csv,*/*" },
      { label: "csv_gran2_filters", url: `${pdfCsvBase}.csv?${built.query}`, accept: "text/csv,*/*" },
    ];
    const binOut: any[] = [];
    for (const b of binVariants) {
      const r = await probeGet(jar, b.url, b.accept, 3, { Referer: pageUrl });
      binOut.push(summarizeBinaryAttempt(b.label, b.url, r));
    }
    out.pdfCsv = binOut;

    // ---- fragment: pedido assíncrono (post_render_content=data), com e sem XHR header ----
    const fragUrl = `${u1}${u1.includes("?") ? "&" : "?"}post_render_content=data`;
    const fragVariants: Array<{ label: string; headers: Record<string, string> }> = [
      { label: "f1_fragment_xhr", headers: { Referer: pageUrl, "X-Requested-With": "XMLHttpRequest" } },
      { label: "f2_fragment_no_xhr", headers: { Referer: pageUrl } },
    ];
    const fragOut: any[] = [];
    for (const f of fragVariants) {
      const r = await probeGet(jar, fragUrl, `text/html,application/json,text/javascript,*/*`, 3, f.headers);
      const body = r.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(r.bytes) : "";
      const entry: any = {
        label: f.label,
        url: fragUrl,
        finalUrl: r.url,
        status: r.status,
        contentType: r.contentType,
        size: r.size ?? null,
        novaArea: looksLikeNovaArea(r.snippet ?? body),
        hasTable: /<table/i.test(body),
        looksJson: /^\s*[[{]/.test(body),
        content: body.slice(0, 4000),
        error: r.error ?? null,
      };
      if (entry.hasTable) entry.tables = extractHtmlTables(body);
      fragOut.push(entry);
    }
    out.fragment = fragOut;

    // ---- g_js_flow: réplica EXACTA do pedido que o bundle da Ticketline faz ----
    // manager-*.js: Managers.Events.EventSaleSummary#requestPostRender()
    //   $.get({ url: window.location.href, data: { post_render_content: "data" }, dataType: "script" })
    // jQuery com dataType:"script" => Accept text/javascript..., X-Requested-With: XMLHttpRequest,
    // e cache:false (acrescenta `_=<timestamp>`).
    const JS_ACCEPT = "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.01";
    const XHR_HEADERS: Record<string, string> = { Referer: u1, "X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": extractCsrfToken(e1Html || pageHtml) || "" };
    const ts = Date.now();
    // h1/h2/h3: variações do parâmetro bulk_event_ids (hipótese: vazio => grelha a zeros)
    const withBulk = (mode: "single" | "array" | "absent") => {
      const q = new URLSearchParams(built.query);
      q.delete("bulk_event_ids");
      q.delete("bulk_event_ids[]");
      if (mode === "single") q.set("bulk_event_ids", String(id));
      if (mode === "array") q.append("bulk_event_ids[]", String(id));
      q.set("post_render_content", "data");
      q.set("_", String(ts));
      return `${actionAbs}?${q.toString()}`;
    };
    const jsVariants: Array<{ label: string; url: string; accept: string; headers: Record<string, string> }> = [
      { label: "g1_js_flow_exact", url: `${u1}&post_render_content=data&_=${ts}`, accept: JS_ACCEPT, headers: XHR_HEADERS },
      { label: "g2_js_flow_no_cachebuster", url: `${u1}&post_render_content=data`, accept: JS_ACCEPT, headers: XHR_HEADERS },
      { label: "g3_js_format_ext", url: `${actionAbs.replace(/(\/sale_summary)(?=$|\?)/, "$1.js")}?${built.query}&post_render_content=data&_=${ts}`, accept: JS_ACCEPT, headers: XHR_HEADERS },
      { label: "g4_js_flow_no_xhr_header", url: `${u1}&post_render_content=data&_=${ts}`, accept: JS_ACCEPT, headers: { Referer: u1 } },
      { label: "h1_bulk_event_ids_single", url: withBulk("single"), accept: JS_ACCEPT, headers: XHR_HEADERS },
      { label: "h2_bulk_event_ids_array", url: withBulk("array"), accept: JS_ACCEPT, headers: XHR_HEADERS },
      { label: "h3_bulk_event_ids_absent", url: withBulk("absent"), accept: JS_ACCEPT, headers: XHR_HEADERS },
    ];
    const jsOut: any[] = [];
    for (const g of jsVariants) {
      const r = await probeGet(jar, g.url, g.accept, 3, g.headers);
      const body = r.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(r.bytes) : "";
      const entry: any = {
        label: g.label,
        url: g.url,
        finalUrl: r.url,
        status: r.status,
        contentType: r.contentType,
        size: r.size ?? null,
        novaArea: looksLikeNovaArea(r.snippet ?? body),
        looksJs: /(?:^|\n)\s*(?:\$\(|window\.|Managers\.|jQuery)/.test(body) || /postRender/i.test(body),
        hasTableMarkup: /<table|<\\\/table>|\\u003ctable/i.test(body),
        head: body.slice(0, 3000),
        error: r.error ?? null,
      };
      // O SJR devolve JS que injeta HTML escapado; tenta desescapar e extrair tabelas.
      const unescaped = body
        .replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\u0026/gi, "&")
        .replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\//g, "/");
      if (entry.hasTableMarkup) entry.tables = extractHtmlTables(unescaped);
      // ---- nonZeroNumbers: há mesmo números != 0 nas células? ----
      const cellRe = /<t[dh][^>]*>\s*([^<]*?)\s*<\/t[dh]>/gi;
      let nonZero = 0;
      let sampleRow: string | null = null;
      let m: RegExpExecArray | null;
      while ((m = cellRe.exec(unescaped)) !== null) {
        const txt = (m[1] || "").replace(/&nbsp;|\u00a0/g, " ").trim();
        if (/[1-9]/.test(txt.replace(/[^\d]/g, "")) && /^[-+()\d\s.,€%]+$/.test(txt)) nonZero++;
      }
      if (nonZero > 0) {
        for (const row of unescaped.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []) {
          const cells = Array.from(row.matchAll(/<t[dh][^>]*>\s*([^<]*?)\s*<\/t[dh]>/gi)).map((c) =>
            (c[1] || "").replace(/&nbsp;|\u00a0/g, " ").trim(),
          );
          if (cells.some((t) => /^[-+()\d\s.,€%]+$/.test(t) && /[1-9]/.test(t.replace(/[^\d]/g, "")))) {
            sampleRow = cells.join(" | ").slice(0, 300);
            break;
          }
        }
      }
      entry.nonZeroNumbers = nonZero;
      entry.nonZeroSampleRow = sampleRow;
      jsOut.push(entry);
    }
    out.jsFlow = jsOut;



    // ---- pageIntel: como é que a página de 70KB monta o relatório ----
    const intelHtml = e1Html && e1Html.length > 1000 ? e1Html : pageHtml;
    out.pageIntel = { source: intelHtml === e1Html ? "e1_report_page" : "sale_summary_page", ...extractPageIntel(intelHtml, pageUrl) };
  }


  // -------------------------------------------------------------------------
  // dashFlow (v2.28) — o relatório do DASHBOARD global da conta
  // Hipótese: nos eventos migrados o sale_summary POR EVENTO vem a zeros, mas
  // /managers/dashboard/sale_summary (com bulk_event_ids) continua vivo.
  // -------------------------------------------------------------------------
  try {
    const JS_ACCEPT_D = "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.01";
    const dashBase = `${BASE}/managers/dashboard/sale_summary`;
    const dashOut: any = { pageUrl: dashBase, variants: [] as any[] };

    // d4 primeiro: página HTML do dashboard → csrf + form real
    const dPage = await probeGet(jar, dashBase, HTML_ACCEPT, 4);
    const dHtml = dPage.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(dPage.bytes) : "";
    const dForms = extractForms(dHtml);
    dashOut.d4_page = {
      label: "d4_dashboard_page_html",
      url: dashBase,
      finalUrl: dPage.url,
      status: dPage.status,
      contentType: dPage.contentType,
      size: dPage.size ?? null,
      novaArea: looksLikeNovaArea(dPage.snippet ?? dHtml),
      hasTableMarkup: /<table/i.test(dHtml),
      csrfFound: !!extractCsrfToken(dHtml),
      formsFound: dForms.length,
      forms: dForms.map((f: any) => ({ action: f.action, method: f.method, fields: f.fields, options: f.options })),
      saleSummaryLinks: Array.from(
        new Set(Array.from(dHtml.matchAll(/(?:href|action)\s*=\s*["']([^"']*sale_summary[^"']*)["']/gi)).map((x) => x[1])),
      ).slice(0, 20),
      ...nonZeroStats(dHtml),
      ...(/<table/i.test(dHtml) ? extractHtmlTables(dHtml) : {}),
      head: dHtml.slice(0, 3000),
      error: dPage.error ?? null,
    };

    const dCsrf = extractCsrfToken(dHtml) || "";
    const DXHR: Record<string, string> = { Referer: dashBase, "X-Requested-With": "XMLHttpRequest", "X-CSRF-Token": dCsrf };
    const tsD = Date.now();
    const baseQ = `utf8=%E2%9C%93&granularity=2&filter_start_date=${startDD}&filter_end_date=${endDD}`;

    const dashVariants: Array<{ label: string; url: string }> = [
      { label: "d1_dash_sjr_single", url: `${dashBase}?${baseQ}&bulk_event_ids=${encodeURIComponent(id)}&post_render_content=data&_=${tsD}` },
      { label: "d2_dash_sjr_array", url: `${dashBase}?${baseQ}&bulk_event_ids%5B%5D=${encodeURIComponent(id)}&post_render_content=data&_=${tsD}` },
    ];
    for (const d of dashVariants) {
      const r = await probeGet(jar, d.url, JS_ACCEPT_D, 3, DXHR, 90000);
      const body = r.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(r.bytes) : "";
      const unescaped = unescapeJsHtml(body);
      const entry: any = {
        label: d.label,
        url: d.url,
        finalUrl: r.url,
        status: r.status,
        contentType: r.contentType,
        size: r.size ?? null,
        novaArea: looksLikeNovaArea(r.snippet ?? body),
        looksXlsx: !!r.looksXlsx,
        looksJs: /(?:^|\n)\s*(?:\$\(|window\.|Managers\.|jQuery)/.test(body) || /postRender/i.test(body),
        hasTableMarkup: /<table|<\\\/table>|\\u003ctable/i.test(body),
        ...nonZeroStats(unescaped),
        head: body.slice(0, 3000),
        error: r.error ?? null,
      };
      if (entry.hasTableMarkup) entry.tables = extractHtmlTables(unescaped);
      dashOut.variants.push(entry);
    }

    // d3: XLSX directo no dashboard
    const d3Url = `${dashBase}.xlsx?granularity=2&bulk_event_ids=${encodeURIComponent(id)}&filter_start_date=${startDD}&filter_end_date=${endDD}`;
    const r3 = await probeGet(jar, d3Url, `${XLSX_ACCEPT},*/*`, 3, { Referer: dashBase }, 90000);
    const d3: any = summarizeBinaryAttempt("d3_dash_xlsx", d3Url, r3);
    if (r3.looksXlsx && r3.bytes) {
      try {
        const d = dumpXlsx(r3.bytes, 8, 24);
        d3.sheetNames = d.sheetNames;
        d3.sheets = d.sheets;
      } catch (e: any) {
        d3.dumpError = e?.message || String(e);
      }
    } else if (r3.bytes) {
      const t = new TextDecoder("utf-8", { fatal: false }).decode(r3.bytes);
      Object.assign(d3, nonZeroStats(t), { hasTableMarkup: /<table/i.test(t) });
      if (/<table/i.test(t)) d3.tables = extractHtmlTables(t);
    }
    dashOut.variants.push(d3);

    out.dashFlow = dashOut;
  } catch (e: any) {
    out.dashFlow = { error: e?.message || String(e) };
  }


  out.formSubmission = formInfo;
  out.winners = [
    ...out.variants.filter((v: any) => v.looksXlsx).map((v: any) => v.label),
    ...((formInfo.attempts || []).filter((a: any) => a.looksXlsx).map((a: any) => a.label)),
    ...((out.pdfCsv || []).filter((p: any) => p.looksPdf || (p.looksCsv && !p.looksHtml)).map((p: any) => p.label)),
    ...((out.jsFlow || []).filter((g: any) => !g.novaArea && (g.hasTableMarkup || g.looksJs)).map((g: any) => g.label)),
    ...(((out.dashFlow || {}).variants || []).filter((d: any) => d.looksXlsx || (d.nonZeroNumbers || 0) > 0).map((d: any) => d.label)),
  ];
  return json(200, out);
}

/** Dump de células de um XLSX para calibrar parsers (action "dump"). */
function dumpXlsx(bytes: Uint8Array, maxRows = 80, maxCols = 24) {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: true }) as any[][])
      .slice(0, maxRows)
      .map((row) => (row || []).slice(0, maxCols).map((c) => (c == null ? "" : String(c).slice(0, 80))));
    return { name, ref: ws["!ref"] ?? null, merges: (ws["!merges"] || []).length, rows };
  });
  return { sheetNames: wb.SheetNames, sheets };
}

async function runDump(admin: any, configId?: string, compareConfigId?: string) {
  const ids = [configId, compareConfigId].filter(Boolean) as string[];
  if (ids.length === 0) return json(400, { error: "configId obrigatório" });
  const { data: cfgs } = await admin.from("ticketline_sync_config").select("*").in("id", ids);
  const sessions: SessionCache = new Map();
  const out: any[] = [];
  for (const id of ids) {
    const cfg = (cfgs || []).find((c: any) => c.id === id);
    if (!cfg) { out.push({ configId: id, error: "config não encontrado" }); continue; }
    const { data: secRpc } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
    const creds = JSON.parse((typeof secRpc === "string" ? secRpc : "").trim());
    const jar = await getJar(sessions, cfg.vault_secret_name, creds);
    const startDD = salesStartToDDMMYYYY(cfg.sales_start_date);
    const endDD = fmtDDMMYYYY(new Date());
    const entry: any = { configId: id, ticketline_event_id: cfg.ticketline_event_id, startDD, endDD };
    // sales_per_event (área nova)
    const spe = await probeGet(jar, salesPerEventUrl(cfg.ticketline_event_id, startDD, endDD), `${XLSX_ACCEPT},*/*`, 3);
    entry.sales_per_event = { url: spe.url, status: spe.status, contentType: spe.contentType, size: spe.size, looksXlsx: spe.looksXlsx, snippet: spe.snippet };
    if (spe.looksXlsx && spe.bytes) {
      try { entry.sales_per_event.dump = dumpXlsx(spe.bytes); }
      catch (e: any) { entry.sales_per_event.parseError = e?.message || String(e); }
    }
    // sale_summary (fluxo antigo) para comparação de layout
    const qs = new URLSearchParams({ utf8: "✓", granularity: "2", bulk_event_ids: "", filter_start_date: startDD, filter_end_date: endDD, post_render_content: "data" });
    const ss = await probeGet(jar, `${BASE}/managers/events/${cfg.ticketline_event_id}/sale_summary.xlsx?${qs.toString()}`, `${XLSX_ACCEPT},*/*`, 3);
    entry.sale_summary = { status: ss.status, contentType: ss.contentType, size: ss.size, looksXlsx: ss.looksXlsx, snippet: ss.snippet };
    if (ss.looksXlsx && ss.bytes) {
      try { entry.sale_summary.dump = dumpXlsx(ss.bytes, 40, 20); }
      catch (e: any) { entry.sale_summary.parseError = e?.message || String(e); }
    }
    out.push(entry);
  }
  return new Response(JSON.stringify({ ok: true, version: VERSION, dumps: out }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Matriz de candidatos para o relatório de operações na área nova. */
async function runMatrix(admin: any, configId?: string, customUrls?: string[]) {
  if (!configId) return json(400, { error: "configId obrigatório" });
  const { data: cfgs } = await admin.from("ticketline_sync_config").select("*").eq("id", configId).limit(1);
  const cfg = (cfgs || [])[0];
  if (!cfg) return json(404, { error: "config não encontrado" });
  const { data: secRpc } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
  const creds = JSON.parse((typeof secRpc === "string" ? secRpc : "").trim());
  const sessions: SessionCache = new Map();
  const jar = await getJar(sessions, cfg.vault_secret_name, creds);
  const id = String(cfg.ticketline_event_id);
  const startDD = salesStartToDDMMYYYY(cfg.sales_start_date);
  const endDD = fmtDDMMYYYY(new Date());
  const dates = `filter_start_date=${startDD}&filter_end_date=${endDD}`;
  const g = `utf8=%E2%9C%93&granularity=2&${dates}&post_render_content=data`;
  const altIds = ["106160", "127631"]; // códigos internos vistos no sales_per_event (Almada)
  const urls: string[] = [
    `${BASE}/managers/dashboard/sale_summary.xlsx?bulk_event_ids=${id}&${g}`,
    `${BASE}/managers/dashboard/sale_summary.xlsx?event_id=${id}&${g}`,
    `${BASE}/managers/dashboard/sales_per_event.xlsx?bulk_event_ids=${id}&${g}`,
    `${BASE}/managers/dashboard/sales_per_session.xlsx?event_id=${id}&${g}`,
    `${BASE}/managers/dashboard/sales_per_zone.xlsx?event_id=${id}&${g}`,
    `${BASE}/managers/events/${id}/sale_summary.xlsx?bulk_event_ids=${id}&${g}`,
    ...altIds.flatMap((a) => [
      `${BASE}/managers/events/${a}/sale_summary.xlsx?${g}`,
      `${BASE}/managers/dashboard/sale_summary.xlsx?bulk_event_ids=${a}&${g}`,
    ]),
    `${BASE}/managers/events/${id}/ticket_zone.xlsx?${g}`,
    `${BASE}/managers/events/${id}/internet_sales.xlsx?${g}`,
  ];
  const out: any[] = [];
  for (const url of (customUrls && customUrls.length ? customUrls : urls)) {
    const r = await probeGet(jar, url, `${XLSX_ACCEPT},*/*`, 3);
    const entry: any = { url, status: r.status, contentType: r.contentType, size: r.size, looksXlsx: r.looksXlsx };
    if (r.looksXlsx && r.bytes) {
      try {
        const d = dumpXlsx(r.bytes, 26, 12);
        entry.sheetNames = d.sheetNames;
        entry.ref = d.sheets[0]?.ref;
        entry.rows = d.sheets[0]?.rows;
      } catch (e: any) { entry.parseError = e?.message || String(e); }
    } else {
      entry.snippet = (r.snippet || "").replace(/\s+/g, " ").slice(0, 160);
    }
    out.push(entry);
  }
  return new Response(JSON.stringify({ ok: true, version: VERSION, ticketline_event_id: id, attempts: out }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Extrai formulários (action/method) e campos (name/value/options) do HTML. */
function extractForms(html: string) {
  const forms: any[] = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = formRe.exec(html)) !== null && forms.length < 8) {
    const attrs = m[1];
    const inner = m[2];
    const action = /action\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? null;
    const method = /method\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "get";
    const fields: any[] = [];
    const fieldRe = /<(input|select|textarea)\b([^>]*)>/gi;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(inner)) !== null && fields.length < 40) {
      const a = f[2];
      const name = /name\s*=\s*["']([^"']*)["']/i.exec(a)?.[1];
      if (!name) continue;
      fields.push({
        tag: f[1],
        name,
        type: /type\s*=\s*["']([^"']*)["']/i.exec(a)?.[1] ?? null,
        value: (/value\s*=\s*["']([^"']*)["']/i.exec(a)?.[1] ?? null)?.slice(0, 60) ?? null,
      });
    }
    const options = Array.from(inner.matchAll(/<option[^>]*value\s*=\s*["']([^"']{1,40})["'][^>]*>([^<]{0,60})/gi))
      .slice(0, 25).map((o) => ({ value: o[1], label: o[2].trim() }));
    forms.push({ action, method, fields, options });
  }
  return forms;
}

async function runFormProbe(admin: any, configId?: string, urls?: string[]) {
  if (!configId) return json(400, { error: "configId obrigatório" });
  const { data: cfgs } = await admin.from("ticketline_sync_config").select("*").eq("id", configId).limit(1);
  const cfg = (cfgs || [])[0];
  if (!cfg) return json(404, { error: "config não encontrado" });
  const { data: secRpc } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
  const creds = JSON.parse((typeof secRpc === "string" ? secRpc : "").trim());
  const sessions: SessionCache = new Map();
  const jar = await getJar(sessions, cfg.vault_secret_name, creds);
  const id = String(cfg.ticketline_event_id);
  const targets = urls && urls.length
    ? urls
    : [`${BASE}/managers/dashboard/sale_summary`, `${BASE}/managers/events/${id}/sale_summary`];
  const out: any[] = [];
  for (const url of targets) {
    const r = await probeGet(jar, url, "text/html,*/*", 3);
    const html = r.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(r.bytes) : "";
    out.push({
      url,
      status: r.status,
      contentType: r.contentType,
      size: r.size,
      title: /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null,
      forms: extractForms(html),
      xlsxLinks: Array.from(new Set(Array.from(html.matchAll(/["'\(]([^"'\)\s]*(?:xlsx|export|\.json)[^"'\)\s]*)["'\)]/gi)).map((x) => x[1]).filter((u) => u.length < 220))).slice(0, 25),
    });
  }
  return new Response(JSON.stringify({ ok: true, version: VERSION, ticketline_event_id: id, pages: out }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Devolve o texto (sem tags) e as tabelas de uma página HTML autenticada. */
async function runTextProbe(admin: any, configId?: string, urls?: string[], offset = 0, body_rawFrom = 0, body_rawLen = 0) {
  if (!configId) return json(400, { error: "configId obrigatório" });
  const { data: cfgs } = await admin.from("ticketline_sync_config").select("*").eq("id", configId).limit(1);
  const cfg = (cfgs || [])[0];
  if (!cfg) return json(404, { error: "config não encontrado" });
  const { data: secRpc } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
  const creds = JSON.parse((typeof secRpc === "string" ? secRpc : "").trim());
  const sessions: SessionCache = new Map();
  const jar = await getJar(sessions, cfg.vault_secret_name, creds);
  const out: any[] = [];
  for (const url of urls || []) {
    const r = await probeGet(jar, url, "text/html,*/*", 3);
    const html = r.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(r.bytes) : "";
    const tables = Array.from(html.matchAll(/<table\b[\s\S]*?<\/table>/gi)).map((t) => t[0]);
    const rowsOf = (tbl: string) =>
      Array.from(tbl.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)).map((tr) =>
        Array.from(tr[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)).map((c) =>
          c[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)
        )
      );
    out.push({
      url,
      status: r.status,
      size: r.size,
      tableCount: tables.length,
      raw: (body_rawLen > 0 ? html.slice(body_rawFrom, body_rawFrom + body_rawLen) : undefined),
      hitIndexes: ["ZONA", "Qt.", "TOTAL VENDAS", "sale_summary", "series", "data:", "Lote"].map((k) => ({ k, i: html.indexOf(k) })),
      tables: tables.slice(offset, offset + 3).map((t) => ({ rows: rowsOf(t).slice(0, 40) })),
    });
  }
  return new Response(JSON.stringify({ ok: true, version: VERSION, pages: out }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** POST no formulário de filtro do Resumo de Operações global + GET do XLSX. */
async function runPostFilter(admin: any, configId?: string, startDD?: string, endDD?: string, needle?: string, span = 70) {
  if (!configId) return json(400, { error: "configId obrigatório" });
  const { data: cfgs } = await admin.from("ticketline_sync_config").select("*").eq("id", configId).limit(1);
  const cfg = (cfgs || [])[0];
  if (!cfg) return json(404, { error: "config não encontrado" });
  const { data: secRpc } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
  const creds = JSON.parse((typeof secRpc === "string" ? secRpc : "").trim());
  const sessions: SessionCache = new Map();
  const jar = await getJar(sessions, cfg.vault_secret_name, creds);
  const pageUrl = `${BASE}/managers/dashboard/sale_summary`;
  const page = await probeGet(jar, pageUrl, "text/html,*/*", 3);
  const html = page.bytes ? new TextDecoder("utf-8", { fatal: false }).decode(page.bytes) : "";
  const token = /name="authenticity_token"\s+value="([^"]+)"/.exec(html)?.[1]
    ?? /<meta name="csrf-token" content="([^"]+)"/.exec(html)?.[1] ?? "";
  const form = new URLSearchParams({
    utf8: "✓",
    authenticity_token: token,
    period: "5",
    filter_start_date: startDD || "01-01-2026",
    filter_end_date: endDD || fmtDDMMYYYY(new Date()),
  });
  const postResp = await fetchWithTimeout(pageUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      "User-Agent": UA_PROBE,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,*/*",
      Cookie: jarToHeader(jar),
      Referer: pageUrl,
      Origin: BASE,
    },
    body: form.toString(),
  }, 60000);
  ingestSetCookie(jar, postResp);
  const postInfo = { status: postResp.status, location: postResp.headers.get("location") };
  await postResp.text().catch(() => null);
  const attempts: any[] = [];
  for (const u of [`${BASE}/managers/dashboard/sale_summary.xlsx?granularity=2`]) {
    const r = await probeGet(jar, u, `${XLSX_ACCEPT},*/*`, 3, {}, 110000);
    const e: any = { url: u, status: r.status, size: r.size, looksXlsx: r.looksXlsx };
    if (r.looksXlsx && r.bytes) {
      const d = dumpXlsx(r.bytes, 4000, 8);
      const all: any[][] = d.sheets[0]?.rows || [];
      e.ref = d.sheets[0]?.ref;
      e.totalRows = all.length;
      if (needle) {
        const up = needle.toUpperCase();
        const idx = all.findIndex((row) => row.some((c) => typeof c === "string" && c.toUpperCase().includes(up)));
        e.needleRow = idx;
        e.rows = idx >= 0 ? all.slice(Math.max(0, idx - 3), idx + span) : all.slice(0, 30);
      } else {
        e.rows = all.slice(0, 30);
      }
      e.eventHeaders = all.filter((row) => row.some((c) => typeof c === "string" && c.startsWith("Evento:"))).map((row) => String(row.find((c) => typeof c === "string" && c.startsWith("Evento:"))).slice(0, 90));
    } else e.snippet = (r.snippet || "").slice(0, 120);
    attempts.push(e);
  }
  return new Response(JSON.stringify({ ok: true, version: VERSION, tokenFound: !!token, postInfo, attempts }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function updateRun(admin: any, runId: string, patch: Record<string, any>) {
  const { error } = await admin.from("ticketline_sync_runs").update(patch).eq("id", runId);
  if (error) console.error("updateRun:", error.message);
}
async function updateConfig(admin: any, configId: string, patch: Record<string, any>) {
  await admin.from("ticketline_sync_config").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", configId);
}

async function runOneConfig(admin: any, cfg: any, mode: string, triggeredBy: string | null, sessions: SessionCache) {
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
    const filterEnd = isoToDDMMYYYY(lisbonTodayIso());
    debug.filter_start_date = filterStart;
    debug.filter_end_date = filterEnd;
    debug.sales_start_date_source = cfg.sales_start_date ? "config" : "fallback_2025_01_01";

    const summary = await downloadSummary(creds, cfg.vault_secret_name, sessions, cfg.ticketline_event_id, filterStart, filterEnd);
    const sourceMode = summary.mode;
    debug.source_mode = sourceMode;

    // -------- Caminho evento migrado: captura incremental do dia corrente --------
    if (summary.mode === "dashboard_today") {
      debug.dashboard_today = summary.debug;
      const series = summary.series;
      // Grava TODAS as datas capturadas (incluindo 0/0: um dia pode ser corrigido
      // para baixo). O histórico anterior vive na mesma tabela e nunca é apagado.
      const rows = series.rows;
      const sums = {
        qty: rows.reduce((s, r) => s + r.quantity, 0),
        value: Math.round(rows.reduce((s, r) => s + Number(r.total_value), 0) * 100) / 100,
      };
      const filesAuditDash = [{
        name: `dashboard_sale_summary_${cfg.ticketline_event_id}.sjr.js`,
        size: Number(summary.debug?.size || 0),
      }];

      let upserted = 0;
      if (rows.length > 0) {
        const payload = rows.map((r) => ({
          company_id: cfg.company_id,
          event_id: cfg.event_id,
          sale_date: r.sale_date,
          quantity: r.quantity,
          total_value: r.total_value,
        }));
        // UPSERT — NUNCA apagar outras datas (histórico backfilled por SQL).
        const { error: upErr } = await admin
          .from("ticketline_daily_sales")
          .upsert(payload, { onConflict: "event_id,sale_date" });
        if (upErr) throw Object.assign(new Error(`Import diário (upsert): ${upErr.message}`), { phase: "import_failed", filesAudit: filesAuditDash });
        upserted = payload.length;
      }
      await updateConfig(admin, cfg.id, {
        daily_fallback_active: true,
        last_run_at: new Date().toISOString(),
        last_run_status: "success",
      });
      const auditDash = {
        dataSource: "dashboard_today",
        daysParsed: rows.length,
        daysImported: upserted,
        totalQty: sums.qty,
        totalValue: sums.value,
        totalRow: series.totalRow,
        headerRange: series.headerRange,
        capturedDates: rows.map((r) => r.sale_date),
        firstDay: rows[0]?.sale_date ?? null,
        lastDay: rows[rows.length - 1]?.sale_date ?? null,
        baselineToday: summary.debug?.baselineToday ?? null,
      };
      await updateRun(admin, runId, {
        status: "success", finished_at: new Date().toISOString(),
        files_downloaded: filesAuditDash,
        error_message: null,
        import_audit: { ...auditDash, debug, source_mode: "dashboard_today" },
      });
      console.log(`[ticketline ${runId}] dashboard_today: ${upserted} dia(s), qty=${sums.qty}, valor=${sums.value}`);
      return { ok: true, runId, audit: auditDash, status: "success", source_mode: "dashboard_today" };
    }


    const filesAudit = [{ name: `sale_summary_${cfg.ticketline_event_id}.xlsx`, size: summary.bytes.length }];

    let parseRes;
    try {
      parseRes = parseTicketlineOperationsXlsx(summary.bytes.buffer as ArrayBuffer);
    } catch (e: any) {
      throw Object.assign(new Error(`Parser sale_summary (${sourceMode}): ${e?.message || e}`), { phase: "parse_failed", filesAudit });
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
        filenames: { summary: filesAudit[0].name },
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
      import_audit: { ...audit, debug, silentEmpty, source_mode: sourceMode },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: finalStatus, daily_fallback_active: false });
    return { ok: !silentEmpty, runId, audit, status: finalStatus, warning: warnMsg };

  } catch (e: any) {
    const phase = e?.phase || "failed";
    const msg = e?.message || String(e);
    if (e?.dashDebug) debug.dashboard_today = e.dashDebug;
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
  // Caminho cron: service role. Aceita igualdade estrita (env) OU JWT cujo
  // payload tenha role "service_role" — mesmo padrão da sync-coala-from-drive,
  // que é o que destrava o cron diário (Bearer + service role do Vault).
  if (token === SERVICE_ROLE || jwtRole(authHeader) === "service_role") {
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
  const { configId, compareConfigId, mode = "manual", triggeredBy = null, action = "sync" } = body;

  if (action === "sjr") {
    try {
      return await runProbeSjr(admin, configId, body.urls);
    } catch (e: any) {
      return json(500, { ok: false, phase: e?.phase || "probe_sjr_failed", error: e?.message || String(e) });
    }
  }

  if (action === "probe_params") {
    try {
      return await runProbeParams(admin, configId);
    } catch (e: any) {
      return json(500, { ok: false, phase: e?.phase || "probe_params_failed", error: e?.message || String(e) });
    }
  }

  if (action === "probe_nova_area") {
    try {
      return await runProbeNovaArea(admin, configId);
    } catch (e: any) {
      return json(500, { ok: false, phase: e?.phase || "probe_nova_area_failed", error: e?.message || String(e) });
    }
  }

  if (action === "probe") {
    try {
      return await runProbe(admin, configId, compareConfigId);
    } catch (e: any) {
      return json(500, { ok: false, phase: e?.phase || "probe_failed", error: e?.message || String(e) });
    }
  }

  if (action === "postfilter") {
    try {
      return await runPostFilter(admin, configId, (body as any).startDD, (body as any).endDD, (body as any).needle, (body as any).span || 70);
    } catch (e: any) {
      return json(500, { ok: false, phase: "postfilter_failed", error: e?.message || String(e) });
    }
  }

  if (action === "text") {
    try {
      return await runTextProbe(admin, configId, body.urls, (body as any).offset || 0, (body as any).rawFrom || 0, (body as any).rawLen || 0);
    } catch (e: any) {
      return json(500, { ok: false, phase: "text_failed", error: e?.message || String(e) });
    }
  }

  if (action === "form") {
    try {
      return await runFormProbe(admin, configId, body.urls);
    } catch (e: any) {
      return json(500, { ok: false, phase: "form_failed", error: e?.message || String(e) });
    }
  }

  if (action === "matrix") {
    try {
      return await runMatrix(admin, configId, body.urls);
    } catch (e: any) {
      return json(500, { ok: false, phase: "matrix_failed", error: e?.message || String(e) });
    }
  }

  if (action === "dump") {
    try {
      return await runDump(admin, configId, compareConfigId);
    } catch (e: any) {
      return json(500, { ok: false, phase: e?.phase || "dump_failed", error: e?.message || String(e) });
    }
  }

  if (action === "discover") {
    try {
      return await runDiscover(admin, configId);
    } catch (e: any) {
      return json(500, { ok: false, phase: e?.phase || "discover_failed", error: e?.message || String(e) });
    }
  }

  // ---- Modo cron/all (sem configId): orquestrar via fan-out ----
  // Processar todos os configs inline estoura o WORKER_RESOURCE_LIMIT (parse de N XLSX
  // no mesmo worker). A mãe só faz I/O: uma sub-invocação por config, sequencial.
  if (!configId) {
    const { data, error } = await admin.from("ticketline_sync_config").select("id, organization_name").eq("enabled", true);
    if (error) return json(500, { error: error.message });
    const list = data || [];
    if (list.length === 0) return json(200, { ok: true, skipped: true, reason: "no configs" });

    const selfUrl = `${SUPABASE_URL}/functions/v1/fetch-ticketline-reports`;
    const results: any[] = [];
    for (const cfg of list) {
      console.log(`[fanout] -> ${cfg.id} (${cfg.organization_name})`);
      try {
        const resp = await fetchWithTimeout(selfUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({ configId: cfg.id, mode, triggeredBy }),
        }, 120000);
        const text = await resp.text();
        console.log(`[fanout] <- ${cfg.id} http=${resp.status} len=${text.length}`);

        let payload: any = null;
        try { payload = JSON.parse(text); } catch { /* não-JSON */ }
        const sub = payload?.results?.[0];
        if (sub) {
          results.push(sub);
        } else {
          results.push({
            configId: cfg.id, ok: false, phase: "fanout_bad_response",
            httpStatus: resp.status, error: (text || "").slice(0, 300),
          });
        }
      } catch (e: any) {
        results.push({
          configId: cfg.id, ok: false,
          phase: e?.name === "AbortError" ? "fanout_timeout" : "fanout_failed",
          error: e?.message || String(e),
        });
      }
    }
    const allOkFan = results.every(r => r.ok);
    return json(allOkFan ? 200 : 500, { ok: allOkFan, version: VERSION, mode: "fanout", results });
  }

  let cfgs: any[] = [];
  {
    const { data, error } = await admin.from("ticketline_sync_config").select("*").eq("id", configId).limit(1);
    if (error) return json(500, { error: error.message });
    cfgs = data || [];
  }
  if (cfgs.length === 0) return json(200, { ok: true, skipped: true, reason: "no configs" });


  const results: any[] = [];
  // 1 login por vault_secret_name em toda a corrida (credencial única partilhada).
  const sessions: SessionCache = new Map();
  for (const cfg of cfgs) {
    if (!cfg.enabled && configId) {
      results.push({ configId: cfg.id, ok: false, skipped: true, reason: "disabled" });
      continue;
    }
    const r = await runOneConfig(admin, cfg, mode, triggeredBy, sessions);
    results.push({ configId: cfg.id, ...r });
  }
  const allOk = results.every(r => r.ok);
  return json(allOk ? 200 : 500, { ok: allOk, results });
});
