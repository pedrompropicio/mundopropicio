// fetch-bol-reports
// Sync de bilheteira BOL (produtores.bol.pt) — mesma espinha da
// fetch-ticketline-reports v2.8:
//   - auth: service role estrito OU jwtRole()=='service_role' OU JWT de
//     admin/manager/editor/platform_admin
//   - sem configId → fan-out sequencial (1 sub-invocação por config)
//   - com configId → corre um só
//   - cache de sessão por vault_secret_name (conta única 'bol_master')
//   - diagnóstico de HTML (html_response vs session_expired)
//
// Fluxo por config: creds {email,password} do Vault → login ASP.NET WebForms
// em produtores.bol.pt → Mapa Diário de Vendas por Sessão (PDF) do
// bol_event_id → extrair texto (unpdf) → parser tolerante → import idempotente.
//
// NOTA DE CALIBRAÇÃO: a página MAPAS do backoffice é autenticada, pelo que o
// caminho exato do relatório não é determinável sem credenciais. A action
// "discover" faz login e lista os links/forms/eventos visíveis, para calibrar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseBolDailyMap, extractPdfText } from "../_shared/bol-report-parser.ts";
import { runBolImport } from "../_shared/bol-import-server.ts";

const VERSION = "v1.0_2026_08_14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BASE = "https://produtores.bol.pt";
const LOGIN_PATH = "/Utilizadores/Autenticacao.aspx";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

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

interface Body {
  configId?: string;
  mode?: "manual" | "cron";
  triggeredBy?: string;
  action?: "sync" | "discover";
}

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
const jarToHeader = (jar: Jar) => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
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
function describeHtml(html: string) {
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = tm ? stripTags(tm[1]).slice(0, 200) : "(sem title)";
  const snippet = stripTags(html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html).slice(0, 300);
  const isSignIn = /Autenticacao\.aspx|Login1\$Password|placeholder="Password"|Recuperar Password/i.test(html);
  return { title, snippet, isSignIn };
}

// --- Campos de um WebForm ASP.NET ---
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function parseFormFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const inputRe = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    const name = tag.match(/\bname="([^"]+)"/i)?.[1];
    if (!name) continue;
    const type = (tag.match(/\btype="([^"]+)"/i)?.[1] || "text").toLowerCase();
    if (type === "submit" || type === "button" || type === "image") continue;
    const value = tag.match(/\bvalue="([^"]*)"/i)?.[1] ?? "";
    out[name] = decodeEntities(value);
  }
  // selects: valor da option selecionada
  const selectRe = /<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi;
  while ((m = selectRe.exec(html)) !== null) {
    const name = m[1];
    const sel = m[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/i)?.[1]
      ?? m[2].match(/<option[^>]*value="([^"]*)"/i)?.[1] ?? "";
    out[name] = decodeEntities(sel);
  }
  return out;
}
function findInputName(html: string, suffix: string): string | null {
  const re = new RegExp(`<input\\b[^>]*name="([^"]*${suffix})"`, "i");
  return html.match(re)?.[1] ?? null;
}
function findFormAction(html: string): string | null {
  return html.match(/<form\b[^>]*action="([^"]*)"/i)?.[1] ?? null;
}
function absUrl(base: string, href: string): string {
  try { return new URL(decodeEntities(href), base).toString(); } catch { return href; }
}

// --- Login ASP.NET WebForms ---
async function loginBol(email: string, password: string, returnUrl = "/Relatorios"): Promise<Jar> {
  const jar: Jar = new Map();
  const loginUrl = `${BASE}${LOGIN_PATH}?ReturnUrl=${encodeURIComponent(returnUrl)}`;

  const getResp = await fetchWithTimeout(loginUrl, {
    method: "GET", redirect: "manual",
    headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
  });
  ingestSetCookie(jar, getResp);
  if (getResp.status >= 400) {
    await getResp.text().catch(() => null);
    throw Object.assign(new Error(`GET login HTTP ${getResp.status}`), { phase: "login_get" });
  }
  const html = await getResp.text();

  const fields = parseFormFields(html);
  const userField = findInputName(html, "\\$UserName");
  const passField = findInputName(html, "\\$Password");
  const submitName = html.match(/<input\b[^>]*name="([^"]*submitLoginBtn)"/i)?.[1] ?? null;
  if (!userField || !passField) {
    const { title } = describeHtml(html);
    throw Object.assign(
      new Error(`Campos de login não encontrados na página BOL (title="${title}")`),
      { phase: "login_form" },
    );
  }
  if (!fields.__VIEWSTATE) {
    throw Object.assign(new Error("__VIEWSTATE ausente na página de login BOL"), { phase: "login_viewstate" });
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v);
  params.set(userField, email);
  params.set(passField, password);
  if (submitName) params.set(submitName, "Entrar");

  const action = findFormAction(html);
  const postUrl = action ? absUrl(loginUrl, action) : loginUrl;

  const postResp = await fetchWithTimeout(postUrl, {
    method: "POST", redirect: "manual",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "text/html,application/xhtml+xml",
      "Cookie": jarToHeader(jar),
      "Origin": BASE,
      "Referer": loginUrl,
    },
    body: params.toString(),
  });
  ingestSetCookie(jar, postResp);
  const postBody = postResp.status === 302 ? "" : await postResp.text().catch(() => "");

  const authCookie = Array.from(jar.keys()).find((k) => /ASPXAUTH|ASPXFORMSAUTH|Autentica/i.test(k));
  if (postResp.status === 302 || authCookie) {
    if (!jar.get("ProdutoresBOLSession") && !authCookie) {
      throw Object.assign(new Error("Login BOL sem cookie de sessão"), { phase: "login_no_session" });
    }
    return jar;
  }

  // Sem redirect e sem cookie de auth → credenciais recusadas (ou validação)
  const msg = stripTags(postBody).match(/(utilizador|password|inv[áa]lid|incorrect)[^.]{0,120}/i)?.[0]
    || describeHtml(postBody).snippet.slice(0, 160);
  throw Object.assign(
    new Error(`Login BOL falhou (HTTP ${postResp.status}). ${msg}`),
    { phase: "login_post" },
  );
}

// --- Cache de sessão por vault_secret_name ---
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
  const jar = await loginBol(creds.email, creds.password);
  sessions.set(secretName, jar);
  console.log(`[bol] login (${force ? "re-login" : "novo"}) secret=${secretName}`);
  return jar;
}

async function getAuthed(jar: Jar, url: string, accept = "text/html,application/xhtml+xml"): Promise<Response> {
  const resp = await fetchWithTimeout(url, {
    method: "GET", redirect: "manual",
    headers: { "User-Agent": UA, "Accept": accept, "Cookie": jarToHeader(jar), "Referer": BASE },
  });
  ingestSetCookie(jar, resp);
  return resp;
}

// --- Descoberta de links/forms (calibração) ---
function collectLinks(html: string, base: string) {
  const out: Array<{ href: string; text: string }> = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (/^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    out.push({ href: absUrl(base, href), text: stripTags(m[2]).slice(0, 120) });
  }
  return out.slice(0, 200);
}

/**
 * Candidatos ao Mapa Diário de Vendas por Sessão. A BOL usa rotas amigáveis
 * sob /Relatorios; sondamos as variantes conhecidas com o bol_event_id.
 */
function mapCandidates(bolEventId: string): string[] {
  const id = encodeURIComponent(bolEventId);
  return [
    `${BASE}/Relatorios/MapaDiarioVendasSessao?evento=${id}&formato=pdf`,
    `${BASE}/Relatorios/MapaDiarioVendasSessao?IdEvento=${id}`,
    `${BASE}/Relatorios/MapaDiarioVendas?IdEvento=${id}`,
    `${BASE}/Relatorios/MapaVendas?IdEvento=${id}`,
    `${BASE}/Relatorios/Mapas?IdEvento=${id}`,
    `${BASE}/Relatorios?IdEvento=${id}`,
  ];
}

async function downloadMapPdf(jar: Jar, bolEventId: string, debug: Record<string, any>): Promise<{ bytes: Uint8Array; url: string }> {
  const tried: any[] = [];
  for (const url of mapCandidates(bolEventId)) {
    const resp = await getAuthed(jar, url, "application/pdf,*/*");
    const ct = resp.headers.get("content-type") || "";
    if (resp.status === 302) {
      const loc = resp.headers.get("location") || "";
      await resp.text().catch(() => null);
      tried.push({ url, status: 302, location: loc.slice(0, 200) });
      if (/Autenticacao/i.test(loc)) {
        throw Object.assign(new Error(`Sessão BOL expirada (302 → ${loc})`), { phase: "session_expired", retriable: true });
      }
      continue;
    }
    if (!resp.ok) {
      await resp.text().catch(() => null);
      tried.push({ url, status: resp.status });
      continue;
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    const isPdf = ct.includes("pdf") || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46);
    if (isPdf) {
      debug.map_url = url;
      debug.map_tried = tried;
      return { bytes: buf, url };
    }
    const html = new TextDecoder("utf-8").decode(buf);
    const d = describeHtml(html);
    tried.push({ url, status: 200, contentType: ct, title: d.title, snippet: d.snippet.slice(0, 160) });
    if (d.isSignIn) {
      throw Object.assign(new Error(`Mapa BOL: página de login devolvida (sessão expirada)`), { phase: "session_expired", retriable: true });
    }
  }
  debug.map_tried = tried;
  throw Object.assign(
    new Error(
      "Mapa Diário de Vendas por Sessão não encontrado nos caminhos conhecidos do backoffice BOL — " +
      "correr a action \"discover\" com credenciais válidas para calibrar o URL/form do relatório.",
    ),
    { phase: "html_response", tried },
  );
}

async function loadCreds(admin: any, secretName: string): Promise<{ email: string; password: string }> {
  const { data: secRpc } = await admin.rpc("get_vault_secret" as any, { _name: secretName });
  const raw = (typeof secRpc === "string" ? secRpc : "").trim();
  if (!raw) {
    throw Object.assign(new Error(`Credenciais em falta no Vault (${secretName})`), { phase: "creds_missing" });
  }
  let creds: { email: string; password: string };
  try { creds = JSON.parse(raw); }
  catch { throw Object.assign(new Error("Vault secret não é JSON {email,password}"), { phase: "creds_invalid" }); }
  if (!creds.email || !creds.password) {
    throw Object.assign(new Error("Vault: email/password em falta"), { phase: "creds_invalid" });
  }
  return creds;
}

// --- Discover: login + inventário da área de relatórios/MAPAS ---
async function runDiscover(admin: any, configId?: string) {
  let q = admin.from("bol_sync_config").select("*");
  q = configId ? q.eq("id", configId) : q.eq("enabled", true);
  const { data: cfgs, error } = await q;
  if (error) return json(500, { error: error.message });
  const cfg = (cfgs || [])[0];
  if (!cfg) return json(200, { ok: false, reason: "no configs" });

  const creds = await loadCreds(admin, cfg.vault_secret_name);
  const jar = await loginBol(creds.email, creds.password);

  const pages: any[] = [];
  const toVisit = [`${BASE}/`, `${BASE}/Relatorios`, `${BASE}/Eventos`];
  const visited = new Set<string>();
  for (const url of toVisit) {
    if (visited.has(url)) continue;
    visited.add(url);
    const resp = await getAuthed(jar, url);
    const status = resp.status;
    const loc = resp.headers.get("location");
    const html = status === 302 ? "" : await resp.text().catch(() => "");
    const links = html ? collectLinks(html, url) : [];
    pages.push({
      url, status, location: loc,
      title: html ? describeHtml(html).title : null,
      forms: html ? (html.match(/<form\b[^>]*>/gi) || []).slice(0, 5) : [],
      selects: html ? (html.match(/<select\b[^>]*name="[^"]+"/gi) || []).slice(0, 20) : [],
      mapLinks: links.filter((l) => /mapa|relat|vend|sess/i.test(`${l.href} ${l.text}`)).slice(0, 60),
      links: links.slice(0, 60),
    });
    // segue links de mapas encontrados (1 nível)
    for (const l of links.filter((x) => /mapa/i.test(`${x.href} ${x.text}`)).slice(0, 3)) {
      if (visited.has(l.href)) continue;
      visited.add(l.href);
      const r2 = await getAuthed(jar, l.href);
      const h2 = r2.status === 302 ? "" : await r2.text().catch(() => "");
      pages.push({
        url: l.href, status: r2.status, location: r2.headers.get("location"),
        title: h2 ? describeHtml(h2).title : null,
        forms: h2 ? (h2.match(/<form\b[^>]*>/gi) || []).slice(0, 5) : [],
        selects: h2 ? (h2.match(/<select\b[^>]*name="[^"]+"/gi) || []).slice(0, 20) : [],
        eventIdsSeen: h2 ? Array.from(new Set((h2.match(/\b17\d{4}|\b18\d{4}/g) || []))).slice(0, 40) : [],
        links: h2 ? collectLinks(h2, l.href).slice(0, 80) : [],
      });
    }
  }
  return json(200, { ok: true, version: VERSION, action: "discover", cookies: Array.from(jar.keys()), pages });
}

async function updateRun(admin: any, runId: string, patch: Record<string, any>) {
  const { error } = await admin.from("bol_sync_runs").update(patch).eq("id", runId);
  if (error) console.error("updateRun:", error.message);
}
async function updateConfig(admin: any, configId: string, patch: Record<string, any>) {
  await admin.from("bol_sync_config").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", configId);
}

async function runOneConfig(admin: any, cfg: any, mode: string, triggeredBy: string | null, sessions: SessionCache) {
  const { data: run, error: runErr } = await admin.from("bol_sync_runs").insert({
    config_id: cfg.id, company_id: cfg.company_id, status: "started", mode, triggered_by: triggeredBy,
  }).select("id").single();
  if (runErr || !run) return { ok: false, error: runErr?.message || "create run failed" };
  const runId = run.id;
  const debug: Record<string, any> = { version: VERSION, bol_event_id: cfg.bol_event_id };

  try {
    const creds = await loadCreds(admin, cfg.vault_secret_name);

    let pdf: { bytes: Uint8Array; url: string };
    const jar = await getJar(sessions, cfg.vault_secret_name, creds);
    try {
      pdf = await downloadMapPdf(jar, cfg.bol_event_id, debug);
    } catch (e: any) {
      if (e?.retriable) {
        console.log("[bol] self-heal re-login");
        const jar2 = await getJar(sessions, cfg.vault_secret_name, creds, true);
        pdf = await downloadMapPdf(jar2, cfg.bol_event_id, debug);
      } else throw e;
    }

    const fileName = `mapa_diario_${cfg.bol_event_id}.pdf`;
    const filesAudit = [{ name: fileName, size: pdf.bytes.length, url: pdf.url }];

    let text: string;
    try { text = await extractPdfText(pdf.bytes); }
    catch (e: any) {
      throw Object.assign(new Error(`Extração de texto do PDF: ${e?.message || e}`), { phase: "pdf_text_failed", filesAudit });
    }
    debug.pdf_text_chars = text.length;

    let parseRes;
    try { parseRes = parseBolDailyMap(text); }
    catch (e: any) {
      throw Object.assign(new Error(`Parser mapa BOL: ${e?.message || e}`), { phase: "parse_failed", filesAudit });
    }
    debug.days = parseRes.rows.length;
    debug.parser = parseRes.debug;
    debug.warnings = parseRes.warnings;

    if (parseRes.rows.length === 0) {
      throw Object.assign(
        new Error("Mapa BOL sem linhas diárias reconhecidas (layout inesperado)."),
        { phase: "parse_failed", filesAudit },
      );
    }

    // Conta financeira BOL (ensure)
    let { data: acc } = await admin.from("financial_accounts")
      .select("id, name").eq("type", "ticket_office").eq("company_id", cfg.company_id)
      .ilike("name", "%bol%").limit(1).maybeSingle();
    if (!acc) {
      const { data: created, error: accErr } = await admin.from("financial_accounts").insert({
        name: "Bilheteira BOL", type: "ticket_office", company_id: cfg.company_id,
      }).select("id, name").single();
      if (accErr) {
        throw Object.assign(new Error(`Criar conta Bilheteira BOL: ${accErr.message}`), { phase: "account_missing", filesAudit });
      }
      acc = created;
      debug.account_created = true;
    }

    let audit: any;
    try {
      audit = await runBolImport({
        supabase: admin, eventId: cfg.event_id, bolAccountId: acc!.id,
        parseResult: parseRes, fileName,
      });
    } catch (e: any) {
      throw Object.assign(new Error(`Import: ${e?.message || e}`), { phase: "import_failed", filesAudit });
    }

    const silentEmpty = (audit?.rowsImported || 0) === 0;
    const finalStatus = silentEmpty ? "warning" : "success";
    const warnMsg = silentEmpty ? "Parser leu o mapa mas 0 linhas importadas — verificar layout do relatório." : null;

    await updateRun(admin, runId, {
      status: finalStatus, finished_at: new Date().toISOString(),
      files_downloaded: filesAudit, error_message: warnMsg,
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
      import_audit: { debug, tried: e?.tried || null },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: phase });
    console.error(`[bol ${runId}] ${phase}: ${msg}`);
    return { ok: false, runId, phase, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  console.log(`[bol-sync] ${VERSION}`);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing authorization" });

  let authorized = false;
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
  const { configId, mode = "manual", triggeredBy = null, action = "sync" } = body;

  if (action === "discover") {
    try { return await runDiscover(admin, configId); }
    catch (e: any) { return json(500, { ok: false, phase: e?.phase || "discover_failed", error: e?.message || String(e) }); }
  }

  // Fan-out: mãe só faz I/O, uma sub-invocação por config (evita WORKER_RESOURCE_LIMIT
  // no parse de vários PDFs no mesmo worker).
  if (!configId) {
    const { data, error } = await admin.from("bol_sync_config").select("id, organization_name").eq("enabled", true);
    if (error) return json(500, { error: error.message });
    const list = data || [];
    if (list.length === 0) return json(200, { ok: true, skipped: true, reason: "no configs" });

    const selfUrl = `${SUPABASE_URL}/functions/v1/fetch-bol-reports`;
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
        if (sub) results.push(sub);
        else results.push({ configId: cfg.id, ok: false, phase: "fanout_bad_response", httpStatus: resp.status, error: (text || "").slice(0, 300) });
      } catch (e: any) {
        results.push({
          configId: cfg.id, ok: false,
          phase: e?.name === "AbortError" ? "fanout_timeout" : "fanout_failed",
          error: e?.message || String(e),
        });
      }
    }
    const allOkFan = results.every((r) => r.ok);
    return json(allOkFan ? 200 : 500, { ok: allOkFan, version: VERSION, mode: "fanout", results });
  }

  const { data: cfgs, error: cfgErr } = await admin.from("bol_sync_config").select("*").eq("id", configId).limit(1);
  if (cfgErr) return json(500, { error: cfgErr.message });
  if ((cfgs || []).length === 0) return json(200, { ok: true, skipped: true, reason: "no configs" });

  const sessions: SessionCache = new Map();
  const results: any[] = [];
  for (const cfg of cfgs!) {
    const r = await runOneConfig(admin, cfg, mode, triggeredBy, sessions);
    results.push({ configId: cfg.id, ...r });
  }
  const allOk = results.every((r) => r.ok);
  return json(allOk ? 200 : 500, { ok: allOk, version: VERSION, results });
});
