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
// em produtores.bol.pt → MapasProdutor.aspx → postback de seleção do evento →
// postback do botão "M2 - TIPO DE VENDA" (PDF "Ocupação Sessões M2 - Tipo de
// Venda") → extrair texto (unpdf) → parser tolerante → import por SETOR (zonas reais).
//
// A action "discover" continua disponível: faz login e devolve o inventário de
// MapasProdutor.aspx (hidden fields, selects/options, botões, links) para
// depuração caso o postback falhe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseBolM2, extractPdfText } from "../_shared/bol-report-parser.ts";
import { runBolImport } from "../_shared/bol-import-server.ts";

const VERSION = "v1.3_discover_deep";

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

// --- Discover profundo do combo Telerik (v1.3) ---
function collectComboRegions(html: string): string[] {
  const out: Array<{ start: number; end: number }> = [];
  const re = /telerikddlEvento/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const start = Math.max(0, m.index - 1200);
    const end = Math.min(html.length, m.index + 1200);
    const last = out[out.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else out.push({ start, end });
    if (out.length >= 8) break;
  }
  return out.slice(0, 8).map((r) => html.slice(r.start, r.end));
}

function collectComboScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const body = m[1];
    if (!/telerikddlEvento|RadComboBox/i.test(body)) continue;
    out.push(body.slice(0, 4000));
    if (out.length >= 4) break;
  }
  return out;
}

function collectComboItems(html: string): Array<{ text: string; value?: string; attributes?: string }> {
  const items: Array<{ text: string; value?: string; attributes?: string }> = [];
  // 1) itens inline renderizados (ul/li com classes rcb*)
  const liRe = /<li\b([^>]*class="[^"]*rcb[^"]*"[^>]*)>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html)) !== null && items.length < 40) {
    items.push({ text: stripTags(m[2]).slice(0, 200), attributes: m[1].slice(0, 300) });
  }
  // 2) arrays de itens em script: {"Text":"...","Value":"..."}
  const jsonRe = /\{"[^"{}]*?[Tt]ext"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*?"[Vv]alue"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*\}/g;
  while ((m = jsonRe.exec(html)) !== null && items.length < 40) {
    items.push({ text: m[1].slice(0, 200), value: m[2].slice(0, 200) });
  }
  return items.slice(0, 40);
}

function collectHiddenRaw(html: string): string[] {
  const out: string[] = [];
  const re = /<input\b[^>]*type="hidden"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (!/name="[^"]*(?:telerik|Evento)[^"]*"|id="[^"]*(?:telerik|Evento)[^"]*"/i.test(tag)) continue;
    out.push(tag.slice(0, 4000));
    if (out.length >= 20) break;
  }
  return out;
}

const MAX_DISCOVER_BYTES = 80 * 1024;
function capPayload(payload: any) {
  const heavy = ["comboScripts", "comboRegions", "hiddenRaw", "links", "mapLinks"];
  const size = () => JSON.stringify(payload).length;
  if (size() <= MAX_DISCOVER_BYTES) return payload;
  for (const limit of [2000, 1200, 800, 400]) {
    for (const page of payload.pages || []) {
      for (const key of heavy) {
        if (!Array.isArray(page[key])) continue;
        page[key] = page[key].map((x: any) =>
          typeof x === "string" && x.length > limit ? x.slice(0, limit) + "...truncated" : x,
        );
      }
    }
    if (size() <= MAX_DISCOVER_BYTES) return { ...payload, truncated: true };
  }
  for (const page of payload.pages || []) {
    page.links = [];
    page.buttons = (page.buttons || []).slice(0, 10);
    page.comboScripts = (page.comboScripts || []).slice(0, 2);
    page.comboRegions = (page.comboRegions || []).slice(0, 3);
  }
  return { ...payload, truncated: true };
}

// --- Página real de mapas (ASP.NET WebForms) ---
const MAPS_PATH = "/Relatorios/MapasProdutor.aspx";
const MAPS_URL = `${BASE}${MAPS_PATH}`;

interface SelectInfo { name: string; options: Array<{ value: string; text: string }> }

function parseSelects(html: string): SelectInfo[] {
  const out: SelectInfo[] = [];
  const selectRe = /<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi;
  let m: RegExpExecArray | null;
  while ((m = selectRe.exec(html)) !== null) {
    const options: Array<{ value: string; text: string }> = [];
    const optRe = /<option\b[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi;
    let o: RegExpExecArray | null;
    while ((o = optRe.exec(m[2])) !== null) {
      options.push({ value: decodeEntities(o[1]), text: stripTags(o[2]) });
    }
    out.push({ name: m[1], options });
  }
  return out;
}

// --- Combo Telerik do evento (NÃO é um <select>) ---
const TELERIK_TARGET = "ctl00$CPH_Body$telerikddlEvento";
const TELERIK_CLIENTSTATE = "ctl00_CPH_Body_telerikddlEvento_ClientState";
const DDL_SESSAO = "ctl00$CPH_Body$ddlSessao";
const TODAS_EM_VENDA = "0;0;01/01/0001;2";
const M2_TARGET = "ctl00$CPH_Body$itm_MapaOcupacaoSessaoTipoVenda";

/** input de texto do RadMultiColumnComboBox (normalmente SEM name). */
function findTelerikInputName(html: string): string | null {
  const re = /name="(ctl00\$CPH_Body\$telerikddlEvento[^_"]*)"/i;
  return html.match(re)?.[1] ?? null;
}
function readClientState(html: string): string | null {
  const re = new RegExp(`name="${TELERIK_CLIENTSTATE}"[^>]*value="([^"]*)"`, "i");
  const m = html.match(re) ?? html.match(/telerikddlEvento_ClientState"[^>]*value="([^"]*)"/i);
  return m ? decodeEntities(m[1]) : null;
}
function buildClientState(value: string, text: string): string {
  return JSON.stringify({ value, text, enabled: true });
}

/** Excerto do script $create do RadMultiColumnComboBox. */
function telerikCreateScript(html: string): string | null {
  const i = html.search(/\$create\(\s*Telerik\.Web\.UI\.RadMultiColumnComboBox/i);
  if (i < 0) return null;
  return html.slice(i, i + 4000);
}

/** value atual do widget: primeiro "value":"<digits>" ANTES de "itemsData". */
function readWidgetValue(html: string): string | null {
  const script = telerikCreateScript(html);
  if (!script) return null;
  const head = script.split(/"itemsData"/)[0];
  return head.match(/"value"\s*:\s*"(\d+)"/)?.[1] ?? null;
}

/** itemsData inline (não é JSON estrito: contém new Date(...)). */
function readComboItems(html: string): { value: string; text: string }[] {
  const script = telerikCreateScript(html);
  if (!script) return [];
  const idx = script.search(/"itemsData"/);
  if (idx < 0) return [];
  const region = script.slice(idx);
  const out: { value: string; text: string }[] = [];
  const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"value"\s*:\s*"(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region)) !== null) {
    const text = m[1].replace(/\\u0026/gi, "&").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    out.push({ value: m[2], text });
  }
  if (out.length === 0) {
    const re2 = /"value"\s*:\s*"(\d+)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    while ((m = re2.exec(region)) !== null) out.push({ value: m[1], text: m[2] });
  }
  return out;
}

/** Remove prefixo "BOL — " do organization_name. */
const cleanOrgName = (s: string | null | undefined) =>
  String(s || "").replace(/^\s*BOL\s*[—–-]\s*/i, "").trim();

const foldText = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();



/** select "Datas sessões": preferir a opção "*** TODAS EM VENDA ***". */
function findSessionsOption(selects: SelectInfo[]): { name: string; value: string } | null {
  for (const s of selects) {
    const opt = s.options.find((o) => /todas\s+em\s+venda/i.test(o.text));
    if (opt) return { name: s.name, value: opt.value };
  }
  for (const s of selects) {
    if (!/sess/i.test(s.name)) continue;
    const opt = s.options.find((o) => /todas/i.test(o.text));
    if (opt) return { name: s.name, value: opt.value };
  }
  return null;
}

/** Botão "M2 - TIPO DE VENDA". */
function findM2Button(html: string): { name: string; value: string } | null {
  const re = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const type = (tag.match(/\btype="([^"]+)"/i)?.[1] || "").toLowerCase();
    if (type !== "submit" && type !== "button" && type !== "image") continue;
    const name = tag.match(/\bname="([^"]+)"/i)?.[1];
    const value = decodeEntities(tag.match(/\bvalue="([^"]*)"/i)?.[1] ?? "");
    if (!name) continue;
    if (/\bM2\b/i.test(value) || /\bM2\b/i.test(name) || /tipo\s*de\s*venda/i.test(value)) {
      return { name, value };
    }
  }
  // fallback: <button> com M2 no conteúdo
  const btnRe = /<button\b[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/button>/gi;
  while ((m = btnRe.exec(html)) !== null) {
    if (/\bM2\b/i.test(m[2]) || /\bM2\b/i.test(stripTags(m[3])) || /\bM2\b/i.test(m[1])) {
      return { name: m[1], value: decodeEntities(m[2]) };
    }
  }
  return null;
}

async function postForm(
  jar: Jar,
  pageUrl: string,
  html: string,
  overrides: Record<string, string>,
  accept = "text/html,application/xhtml+xml",
): Promise<Response> {
  const fields = parseFormFields(html);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v);
  for (const [k, v] of Object.entries(overrides)) params.set(k, v);
  if (!params.has("__EVENTTARGET")) params.set("__EVENTTARGET", "");
  if (!params.has("__EVENTARGUMENT")) params.set("__EVENTARGUMENT", "");

  const action = findFormAction(html);
  const postUrl = action ? absUrl(pageUrl, action) : pageUrl;
  const resp = await fetchWithTimeout(postUrl, {
    method: "POST", redirect: "manual",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": accept,
      "Cookie": jarToHeader(jar),
      "Origin": BASE,
      "Referer": pageUrl,
    },
    body: params.toString(),
  }, 90000);
  ingestSetCookie(jar, resp);
  return resp;
}

const looksPdf = (buf: Uint8Array) => buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;

async function readAsPdf(jar: Jar, resp: Response, fromUrl: string, tried: any[]): Promise<Uint8Array | null> {
  const ct = resp.headers.get("content-type") || "";
  if (resp.status === 302) {
    const loc = resp.headers.get("location") || "";
    await resp.text().catch(() => null);
    tried.push({ url: fromUrl, status: 302, location: loc.slice(0, 300) });
    if (/Autenticacao/i.test(loc)) {
      throw Object.assign(new Error(`Sessão BOL expirada (302 → ${loc})`), { phase: "session_expired", retriable: true });
    }
    const follow = await getAuthed(jar, absUrl(fromUrl, loc), "application/pdf,*/*");
    const ct2 = follow.headers.get("content-type") || "";
    const buf2 = new Uint8Array(await follow.arrayBuffer());
    if (ct2.includes("pdf") || looksPdf(buf2)) return buf2;
    const d2 = describeHtml(new TextDecoder("utf-8").decode(buf2));
    tried.push({ url: absUrl(fromUrl, loc), status: follow.status, contentType: ct2, title: d2.title, snippet: d2.snippet.slice(0, 200) });
    if (d2.isSignIn) throw Object.assign(new Error("Mapa BOL: login devolvido (sessão expirada)"), { phase: "session_expired", retriable: true });
    return null;
  }
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (ct.includes("pdf") || looksPdf(buf)) return buf;
  const html = new TextDecoder("utf-8").decode(buf);
  const d = describeHtml(html);
  tried.push({ url: fromUrl, status: resp.status, contentType: ct, title: d.title, snippet: d.snippet.slice(0, 200) });
  if (d.isSignIn) throw Object.assign(new Error("Mapa BOL: login devolvido (sessão expirada)"), { phase: "session_expired", retriable: true });
  return null;
}

/**
 * Fluxo real: GET MapasProdutor.aspx → postback Telerik de seleção do evento
 * (RadComboBox: __EVENTTARGET + ClientState) com VALIDAÇÃO de que o combo
 * devolvido reflete o bol_event_id → postback do botão "M2 - TIPO DE VENDA"
 * (__doPostBack) → PDF direto, via 302 ou via URL embutido no HTML.
 */
async function downloadM2Pdf(
  jar: Jar,
  bolEventId: string,
  debug: Record<string, any>,
  eventText = "",
): Promise<{ bytes: Uint8Array; url: string }> {
  const tried: any[] = [];

  const getResp = await getAuthed(jar, MAPS_URL);
  if (getResp.status === 302) {
    const loc = getResp.headers.get("location") || "";
    await getResp.text().catch(() => null);
    throw Object.assign(new Error(`MapasProdutor.aspx redirecionou (302 → ${loc})`), {
      phase: /Autenticacao/i.test(loc) ? "session_expired" : "html_response",
      retriable: /Autenticacao/i.test(loc),
    });
  }
  let html = await getResp.text();
  if (describeHtml(html).isSignIn) {
    throw Object.assign(new Error("MapasProdutor.aspx devolveu login (sessão expirada)"), { phase: "session_expired", retriable: true });
  }

  const comboInput = findTelerikInputName(html);
  debug.combo_input_name = comboInput;
  debug.clientstate_initial = readClientState(html);

  // --- Passo 1: seleção explícita do evento (2 variantes de ClientState) ---
  const variants = [
    { label: "value+empty_text", text: "" },
    { label: "value+event_text", text: eventText },
  ].filter((v, i, arr) => i === 0 || (v.text && v.text !== arr[0].text));

  let selected = false;
  const attempts: any[] = [];
  for (const variant of variants) {
    const clientState = buildClientState(bolEventId, variant.text);
    const overrides: Record<string, string> = {
      __EVENTTARGET: TELERIK_TARGET,
      __EVENTARGUMENT: "",
      [TELERIK_CLIENTSTATE]: clientState,
    };
    if (comboInput) overrides[comboInput] = variant.text;

    const selResp = await postForm(jar, MAPS_URL, html, overrides);
    let body: string;
    if (selResp.status === 302) {
      const loc = selResp.headers.get("location") || "";
      await selResp.text().catch(() => null);
      if (/Autenticacao/i.test(loc)) {
        throw Object.assign(new Error("Sessão BOL expirada na seleção do evento"), { phase: "session_expired", retriable: true });
      }
      const again = await getAuthed(jar, absUrl(MAPS_URL, loc));
      body = await again.text().catch(() => "");
    } else {
      body = await selResp.text().catch(() => "");
    }

    const csBack = readClientState(body);
    const comboBack = comboInput
      ? body.match(new RegExp(`name="${comboInput.replace(/\$/g, "\\$")}"[^>]*value="([^"]*)"`, "i"))?.[1] ?? null
      : null;
    const okById = !!csBack && csBack.includes(bolEventId);
    const distinct = eventText
      ? foldText(eventText).split(/\s+/).filter((t) => t.length >= 4)
      : [];
    const okByText = distinct.length > 0 &&
      distinct.some((t) => foldText(`${csBack || ""} ${comboBack || ""}`).includes(t));

    attempts.push({
      variant: variant.label,
      status: selResp.status,
      clientstate_sent: clientState,
      clientstate_returned: csBack ? csBack.slice(0, 400) : null,
      combo_input_returned: comboBack,
      matched: okById || okByText,
    });

    if (okById || okByText) {
      html = body;
      selected = true;
      break;
    }
    debug.event_select_body_excerpt = stripTags(body).slice(0, 800);
  }
  debug.event_select_attempts = attempts;

  if (!selected) {
    throw Object.assign(
      new Error(`Seleção do evento ${bolEventId} não foi refletida pelo combo Telerik — mapa não gerado (risco de evento errado).`),
      { phase: "event_select_failed", tried: attempts },
    );
  }

  // --- Passo 2: postback do botão M2 ---
  const m2 = findM2Button(html);
  const m2Target = m2?.name || M2_TARGET;
  debug.m2_target = m2Target;

  const sessionsOpt = findSessionsOption(parseSelects(html));
  const sessionField = sessionsOpt?.name || DDL_SESSAO;
  const sessionValue = sessionsOpt?.value || TODAS_EM_VENDA;
  debug.maps_sessions_option = { name: sessionField, value: sessionValue };

  const pdfResp = await postForm(jar, MAPS_URL, html, {
    __EVENTTARGET: m2Target,
    __EVENTARGUMENT: "",
    [TELERIK_CLIENTSTATE]: buildClientState(bolEventId, eventText),
    [sessionField]: sessionValue,
  }, "application/pdf,text/html,*/*");

  // (a) PDF direto | (b) 302 seguido
  const ct = pdfResp.headers.get("content-type") || "";
  if (pdfResp.status === 302) {
    const bytes302 = await readAsPdf(jar, pdfResp, MAPS_URL, tried);
    debug.map_tried = tried;
    if (bytes302) { debug.map_url = MAPS_URL; return { bytes: bytes302, url: MAPS_URL }; }
    throw Object.assign(
      new Error("Redirect do M2 não devolveu PDF."),
      { phase: "map_postback_failed", tried },
    );
  }
  const buf = new Uint8Array(await pdfResp.arrayBuffer());
  if (ct.includes("pdf") || looksPdf(buf)) {
    debug.map_url = MAPS_URL;
    return { bytes: buf, url: MAPS_URL };
  }

  // (c) HTML com URL do PDF embutido (window.open / iframe / redirect JS)
  const bodyHtml = new TextDecoder("utf-8").decode(buf);
  if (describeHtml(bodyHtml).isSignIn) {
    throw Object.assign(new Error("Mapa BOL: login devolvido (sessão expirada)"), { phase: "session_expired", retriable: true });
  }
  const urlMatch = bodyHtml.match(/["']([^"'<>\s]*(?:\.pdf|Relatorios\/[^"'<>\s]*\?[^"'<>\s]+))["']/i);
  if (urlMatch) {
    const pdfUrl = absUrl(MAPS_URL, urlMatch[1]);
    const r = await getAuthed(jar, pdfUrl, "application/pdf,*/*");
    const b2 = new Uint8Array(await r.arrayBuffer());
    if ((r.headers.get("content-type") || "").includes("pdf") || looksPdf(b2)) {
      debug.map_url = pdfUrl;
      return { bytes: b2, url: pdfUrl };
    }
    tried.push({ url: pdfUrl, status: r.status, contentType: r.headers.get("content-type") });
  }

  debug.map_postback = {
    status: pdfResp.status,
    contentType: ct,
    body_excerpt: stripTags(bodyHtml).slice(0, 800),
    embedded_url: urlMatch?.[1] ?? null,
  };
  debug.map_tried = tried;
  throw Object.assign(
    new Error(`Postback do M2 não devolveu PDF (HTTP ${pdfResp.status}, content-type="${ct}").`),
    { phase: "map_postback_failed", tried: [...tried, debug.map_postback] },
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
  const toVisit = [MAPS_URL, `${BASE}/Relatorios/Estatisticas.aspx`, `${BASE}/Relatorios`, `${BASE}/`];
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
      hiddenFields: html ? Object.keys(parseFormFields(html)).slice(0, 40) : [],
      selects: html
        ? parseSelects(html).map((s) => ({ name: s.name, optionCount: s.options.length, options: s.options.slice(0, 40) }))
        : [],
      buttons: html ? (html.match(/<input\b[^>]*type="(?:submit|button|image)"[^>]*>/gi) || []).slice(0, 30) : [],
      m2Button: html ? findM2Button(html) : null,
      telerikComboInput: html ? findTelerikInputName(html) : null,
      telerikClientState: html ? readClientState(html) : null,
      comboRegions: html ? collectComboRegions(html) : [],
      comboScripts: html ? collectComboScripts(html) : [],
      comboItems: html ? collectComboItems(html) : [],
      hiddenRaw: html ? collectHiddenRaw(html) : [],
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
  return json(200, capPayload({ ok: true, version: VERSION, action: "discover", cookies: Array.from(jar.keys()), pages }));
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

    const expectedName = cleanOrgName(cfg.organization_name);
    let pdf: { bytes: Uint8Array; url: string };
    const jar = await getJar(sessions, cfg.vault_secret_name, creds);
    try {
      pdf = await downloadM2Pdf(jar, cfg.bol_event_id, debug, expectedName);
    } catch (e: any) {
      if (e?.retriable) {
        console.log("[bol] self-heal re-login");
        const jar2 = await getJar(sessions, cfg.vault_secret_name, creds, true);
        pdf = await downloadM2Pdf(jar2, cfg.bol_event_id, debug, expectedName);
      } else throw e;
    }

    const fileName = `bol_m2_tipo_venda_${cfg.bol_event_id}.pdf`;
    const filesAudit = [{ name: fileName, size: pdf.bytes.length, url: pdf.url }];

    let text: string;
    try { text = await extractPdfText(pdf.bytes); }
    catch (e: any) {
      throw Object.assign(new Error(`Extração de texto do PDF: ${e?.message || e}`), { phase: "pdf_text_failed", filesAudit });
    }
    debug.pdf_text_chars = text.length;

    let parseRes;
    try { parseRes = parseBolM2(text); }
    catch (e: any) {
      throw Object.assign(new Error(`Parser mapa BOL: ${e?.message || e}`), { phase: "parse_failed", filesAudit });
    }
    debug.sectors = parseRes.rows.length;
    debug.parser = parseRes.debug;
    debug.warnings = parseRes.warnings;

    // Dupla verificação: o rodapé do PDF tem de bater com o evento esperado
    debug.pdf_event_name = parseRes.header.eventName;
    debug.pdf_venue = parseRes.header.venue;
    const tokens = foldText(expectedName).split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
    const pdfHay = foldText(`${parseRes.header.eventName || ""} ${parseRes.header.venue || ""} ${text.slice(0, 4000)}`);
    if (tokens.length > 0 && !tokens.some((t) => pdfHay.includes(t))) {
      throw Object.assign(
        new Error(
          `Evento do PDF ("${parseRes.header.eventName || "?"}" / "${parseRes.header.venue || "?"}") ` +
          `não corresponde ao esperado ("${expectedName}") — import abortado.`,
        ),
        { phase: "event_mismatch", filesAudit, tried: { expected: expectedName, tokens, pdf_event_name: parseRes.header.eventName, pdf_venue: parseRes.header.venue } },
      );
    }


    if (parseRes.rows.length === 0) {
      throw Object.assign(
        new Error("Mapa M2 sem setores reconhecidos (layout inesperado)."),
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
