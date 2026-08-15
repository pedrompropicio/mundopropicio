// fetch-ticketline-reports
// Pipeline Devise (Rails) → cookie jar → sale_summary.xlsx?granularity=2 →
// parser de operações por dia × zona → import zonas/lotes/vendas reais.
// Multi-evento: se body.configId vier, corre só esse; senão corre todos os configs enabled=true.
// Auth: aceita SERVICE_ROLE (cron) OU JWT de admin/manager/editor/platform_admin (UI).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseTicketlineOperationsXlsx } from "../_shared/ticketline-operations-parser.ts";
import { runTicketlineImport } from "../_shared/ticketline-import-server.ts";

const VERSION = "v2.10_probe2_2026_08_15";

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

interface Body { configId?: string; compareConfigId?: string; mode?: "manual" | "cron"; triggeredBy?: string; action?: "sync" | "discover" | "probe" }

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
): Promise<ProbeAttempt & { chain: Array<{ url: string; status: number; location: string | null }>; bytes?: Uint8Array }> {
  const chain: Array<{ url: string; status: number; location: string | null }> = [];
  let current = url;
  for (let hop = 0; hop <= followMax; hop++) {
    let resp: Response;
    try {
      resp = await fetchWithTimeout(current, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": UA_PROBE, Accept: accept, Cookie: jarToHeader(jar), Referer: `${BASE}/managers` },
      }, 30000);
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
    hits: variants.filter((v) => v.looksXlsx).map((v) => v.url),
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

async function downloadSummary(
  creds: { email: string; password: string },
  secretName: string,
  sessions: SessionCache,
  ticketlineEventId: string,
  filterStartDDMMYYYY: string,
  filterEndDDMMYYYY: string,
) {
  const jar = await getJar(sessions, secretName, creds);
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
      const jar2 = await getJar(sessions, secretName, creds, true);
      return await downloadXlsx(jar2, url, "sale_summary");
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
    const filterEnd = fmtDDMMYYYY(new Date());
    debug.filter_start_date = filterStart;
    debug.filter_end_date = filterEnd;
    debug.sales_start_date_source = cfg.sales_start_date ? "config" : "fallback_2025_01_01";

    const summary = await downloadSummary(creds, cfg.vault_secret_name, sessions, cfg.ticketline_event_id, filterStart, filterEnd);
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

  if (action === "probe") {
    try {
      return await runProbe(admin, configId, compareConfigId);
    } catch (e: any) {
      return json(500, { ok: false, phase: e?.phase || "probe_failed", error: e?.message || String(e) });
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
