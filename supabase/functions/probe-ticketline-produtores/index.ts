// probe-ticketline-produtores — sonda DESCARTÁVEL do portal novo de Produtores da Ticketline.
// Só leitura: não escreve em tabelas, sem crons. UMA única tentativa de login.
// Nunca devolve palavra-passe nem cookies (só nomes de cookies).
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const BASE = "https://produtores.ticketline.pt/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

class Jar {
  m = new Map<string, string>();
  take(res: Response) {
    const list = (res.headers as any).getSetCookie?.() ?? [];
    for (const c of list) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      if (i > 0) this.m.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
  }
  header() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
  names() { return [...this.m.keys()]; }
}

const hidden = (html: string, name: string) =>
  html.match(new RegExp(`name="${name.replace(/\$/g, "\\$")}"[^>]*value="([^"]*)"`))?.[1] ??
  html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`))?.[1] ?? null;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function summarize(html: string, url: string) {
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const links: { text: string; href: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decode(m[1]);
    if (/^javascript:/i.test(href) && !/__doPostBack/.test(href)) continue;
    links.push({ text: strip(m[2]).slice(0, 80), href: href.slice(0, 200) });
  }
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].slice(0, 5).map((t) => {
    const head = [...t[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((h) => strip(h[1]));
    const rows = [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)];
    const firstRows = rows.slice(0, 4).map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]).slice(0, 40)));
    return { th: head, n_rows: rows.length, amostra: firstRows };
  });
  const selects = [...html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)].map((s) => ({
    name: s[1],
    options: [...s[2].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)].slice(0, 40).map((o) => `${o[1]} = ${strip(o[2])}`),
  }));
  const inputs = [...html.matchAll(/<input[^>]*name="([^"]+)"[^>]*>/gi)].map((i) => i[1]).filter((n) => !n.startsWith("__")).slice(0, 30);
  const text = strip(html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, ""));
  const kw = ["zona", "sector", "setor", "lote", "ocupa", "tipo de bilhete", "relat", "export", "xls", "csv", "ghanem"]
    .filter((k) => text.toLowerCase().includes(k));
  return { url, title, keywords: kw, links: links.slice(0, 60), tables, selects, inputs, texto: text.slice(0, 1200) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Só admin / platform_admin.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "sem sessão" }, 401);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
  if (!(roles ?? []).some((r: any) => r.role === "admin" || r.role === "platform_admin")) return json({ error: "sem permissão" }, 403);

  const user = Deno.env.get("TICKETLINE_PRODUTORES_USER");
  const pass = Deno.env.get("TICKETLINE_PRODUTORES_PASSWORD");
  if (!user || !pass) return json({ error: "secrets em falta" }, 500);

  const jar = new Jar();
  const out: Record<string, unknown> = {};
  const get = async (url: string) => {
    const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: jar.header() }, redirect: "manual", signal: AbortSignal.timeout(20000) });
    jar.take(r);
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) return get(new URL(loc, url).toString());
    return { status: r.status, url, html: await r.text(), ctype: r.headers.get("content-type") };
  };

  // 1 — GET login
  const p1 = await get(BASE);
  const vs = hidden(p1.html, "__VIEWSTATE"), vg = hidden(p1.html, "__VIEWSTATEGENERATOR"), ev = hidden(p1.html, "__EVENTVALIDATION");
  const action = new URL(decode(p1.html.match(/<form[^>]*action="([^"]*)"/i)?.[1] ?? "./"), p1.url).toString();
  out.step1_get_login = { status: p1.status, cookies: jar.names(), viewstate: !!vs, viewstategenerator: !!vg, eventvalidation: !!ev, action };
  if (!vs || !ev) return json({ ...out, parado: "campos ASP.NET em falta — POST não feito" });

  // 2 — POST login (uma vez)
  const form = new URLSearchParams({
    __VIEWSTATE: vs, __VIEWSTATEGENERATOR: vg ?? "", __EVENTVALIDATION: ev,
    "ctl00$ContentPlaceHolder1$txtUsername": user,
    "ctl00$ContentPlaceHolder1$txtPassword": pass,
    "ctl00$ContentPlaceHolder1$btnLogin": "entrar",
  });
  const before = new Set(jar.names());
  const r2 = await fetch(action, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": UA, Cookie: jar.header(), "Content-Type": "application/x-www-form-urlencoded", Referer: p1.url, Origin: "https://produtores.ticketline.pt" },
    body: form.toString(),
  });
  jar.take(r2);
  const loc2 = r2.headers.get("location");
  const body2 = await r2.text();
  const newCookies = jar.names().filter((n) => !before.has(n));
  const stillLogin = /txtPassword/.test(body2);
  const errMsg = stillLogin ? strip(body2.match(/class="[^"]*(erro|error|alert|msg)[^"]*"[^>]*>([\s\S]*?)<\//i)?.[2] ?? "").slice(0, 200) : null;
  out.step2_post_login = { status: r2.status, redirect: loc2, cookies_novos: newCookies, pagina_ainda_de_login: stillLogin, mensagem: errMsg };
  const loggedIn = (r2.status >= 300 && !!loc2) || (!stillLogin && r2.status === 200);
  if (!loggedIn) return json({ ...out, autenticou: false, parado: "login falhou — não repetido" });

  const reqBody = await req.json().catch(() => ({}));
  if (reqBody?.mode === "sweep") {
    // Varredura só-leitura: lista eventos do portal e, para os pedidos, lê o texto do PDF de Ocupação.
    const { extractText, getDocumentProxy } = await import("npm:unpdf@0.12.1");
    let page = loc2 ? await get(new URL(loc2, action).toString()) : { status: 200, url: action, html: body2, ctype: null };
    const fields = (html: string) => {
      const f: Record<string, string> = {};
      for (const m of html.matchAll(/<input[^>]*type="(hidden|text)"[^>]*>/gi)) {
        const n = m[0].match(/name="([^"]+)"/)?.[1]; if (!n) continue;
        f[n] = decode(m[0].match(/value="([^"]*)"/)?.[1] ?? "");
      }
      for (const m of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
        f[m[1]] = m[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/i)?.[1] ?? m[2].match(/<option[^>]*value="([^"]*)"/i)?.[1] ?? "";
      }
      return f;
    };
    const post = async (html: string, url: string, extra: Record<string, string>) => {
      const r = await fetch(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(30000),
        headers: { "User-Agent": UA, Cookie: jar.header(), "Content-Type": "application/x-www-form-urlencoded", Referer: url },
        body: new URLSearchParams({ ...fields(html), ...extra }).toString() });
      jar.take(r);
      return { status: r.status, location: r.headers.get("location"), html: await r.text() };
    };
    const opts = (html: string, name: string) => {
      const s = html.match(new RegExp(`<select[^>]*name="[^"]*${name}"[^>]*>([\\s\\S]*?)<\\/select>`, "i"))?.[1] ?? "";
      return [...s.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => ({ id: o[1], nome: strip(o[2]) }));
    };
    const eventos = opts(page.html, "cboEvento");
    if (reqBody.debug) return json({ status: page.status, url: page.url, snip: page.html.slice(Math.max(0, page.html.indexOf("cboEvento") - 300), page.html.indexOf("cboEvento") + 1500) });
    const results: any[] = [];
    for (const id of (reqBody.eventos ?? []) as string[]) {
      try {
        const sel = await post(page.html, page.url, { "__EVENTTARGET": "ctl00$ContentPlaceHolder2$cboEvento", "__EVENTARGUMENT": "", "ctl00$ContentPlaceHolder2$cboEvento": id });
        page = { status: sel.status, url: page.url, html: sel.html, ctype: null };
        const sessoes = opts(sel.html, "cboSessao");
        const r = await post(page.html, page.url, { "ctl00$ContentPlaceHolder2$btnOcupacao": "x" });
        if (!r.location) { results.push({ id, sessoes, erro: "sem redirect para relatório" }); continue; }
        const rel = await fetch(new URL(r.location, page.url).toString(), { headers: { "User-Agent": UA, Cookie: jar.header() }, signal: AbortSignal.timeout(30000) });
        jar.take(rel);
        const relHtml = await rel.text();
        const pdfPath = relHtml.match(/["']([^"']*TempReports\/[^"']+\.pdf)["']/i)?.[1];
        if (!pdfPath) { results.push({ id, sessoes, erro: "PDF não encontrado" }); continue; }
        const buf = new Uint8Array(await (await fetch(new URL(pdfPath, rel.url).toString(), { signal: AbortSignal.timeout(30000) })).arrayBuffer());
        const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
        const t = String(text);
        results.push({ id, sessoes, linhas_total: t.split("\n").filter((l) => /total/i.test(l)).slice(0, 6), fim: t.slice(-900) });
      } catch (e) { results.push({ id, erro: String(e).slice(0, 200) }); }
    }
    return json({ ...out, autenticou: true, modo: "sweep", eventos, results });
  }
  if (reqBody?.mode === "reports") {
    // Postbacks ASP.NET sobre a página principal: escolher evento e carregar botões de relatório.
    let page = loc2 ? await get(new URL(loc2, action).toString()) : { status: 200, url: action, html: body2, ctype: null };
    const fields = (html: string) => {
      const f: Record<string, string> = {};
      for (const m of html.matchAll(/<input[^>]*type="(hidden|text)"[^>]*>/gi)) {
        const n = m[0].match(/name="([^"]+)"/)?.[1]; if (!n) continue;
        f[n] = decode(m[0].match(/value="([^"]*)"/)?.[1] ?? "");
      }
      for (const m of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
        f[m[1]] = m[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/i)?.[1] ?? m[2].match(/<option[^>]*value="([^"]*)"/i)?.[1] ?? "";
      }
      return f;
    };
    const post = async (html: string, url: string, extra: Record<string, string>) => {
      const f = { ...fields(html), ...extra };
      const r = await fetch(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(30000),
        headers: { "User-Agent": UA, Cookie: jar.header(), "Content-Type": "application/x-www-form-urlencoded", Referer: url },
        body: new URLSearchParams(f).toString() });
      jar.take(r);
      const ctype = r.headers.get("content-type") ?? "";
      const disp = r.headers.get("content-disposition");
      const buf = new Uint8Array(await r.arrayBuffer());
      return { status: r.status, ctype, disp, buf, location: r.headers.get("location") };
    };
    const describe = (res: any) => {
      const base: any = { status: res.status, content_type: res.ctype, content_disposition: res.disp, bytes: res.buf.length, redirect: res.location };
      const isHtml = /html/i.test(res.ctype);
      if (!isHtml && res.buf.length > 0) {
        try {
          const wb = XLSX.read(res.buf, { type: "array" });
          base.sheets = wb.SheetNames.map((n: string) => {
            const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false });
            return { nome: n, linhas: rows.length, primeiras: rows.slice(0, 12).map((r) => r.map((c) => String(c ?? "").slice(0, 40))) };
          });
        } catch (e) { base.parse_erro = String(e); base.inicio = new TextDecoder().decode(res.buf.slice(0, 300)); }
      } else {
        const html = new TextDecoder().decode(res.buf);
        const sm = summarize(html, page.url);
        base.title = sm.title; base.tables = sm.tables; base.keywords = sm.keywords; base.texto = sm.texto.slice(0, 600);
        base.iframes_ou_links = [...html.matchAll(/(?:src|href|window\.open\()\s*=?\s*["']([^"']*(?:xls|csv|pdf|aspx|report|relat)[^"']*)["']/gi)].map((m) => m[1]).slice(0, 15);
      }
      return base;
    };
    const ids: string[] = reqBody.eventos ?? [];
    const results: any[] = [];
    for (const id of ids) {
      const sel = await post(page.html, page.url, { "__EVENTTARGET": "ctl00$ContentPlaceHolder2$cboEvento", "__EVENTARGUMENT": "", "ctl00$ContentPlaceHolder2$cboEvento": id });
      const html = new TextDecoder().decode(sel.buf);
      const sm = summarize(html, page.url);
      const entry: any = { evento: id, status: sel.status, selects: sm.selects.filter((s: any) => !/cboEvento/.test(s.name)), datas: fields(html)["ctl00$ContentPlaceHolder2$hdfDatas"]?.slice(0, 200) };
      page = { status: sel.status, url: page.url, html, ctype: sel.ctype };
      if ((reqBody.relatorios_para ?? []).includes(id)) {
        entry.relatorios = {};
        for (const btn of (reqBody.botoes ?? ["btnOcupacao", "btnTipoBilhete", "btnOperacoes"])) {
          const r = await post(page.html, page.url, { [`ctl00$ContentPlaceHolder2$${btn}`]: "x" });
          entry.relatorios[btn] = describe(r);
          if (r.location) {
            const g = await fetch(new URL(r.location, page.url).toString(), { headers: { "User-Agent": UA, Cookie: jar.header() }, signal: AbortSignal.timeout(30000) });
            jar.take(g);
            entry.relatorios[btn].seguido = describe({ status: g.status, ctype: g.headers.get("content-type") ?? "", disp: g.headers.get("content-disposition"), buf: new Uint8Array(await g.arrayBuffer()), location: null });
          }
        }
      }
      results.push(entry);
    }
    return json({ ...out, autenticou: true, modo: "reports", results });
  }

  // 3 — percorrer
  const home = loc2 ? await get(new URL(loc2, action).toString()) : { status: r2.status, url: action, html: body2, ctype: null };
  const homeSum = summarize(home.html, home.url);
  out.step3_home = { status: home.status, ...homeSum };

  const seen = new Set<string>([home.url]);
  const pages: unknown[] = [];
  const queue = homeSum.links
    .map((l) => { try { return { ...l, abs: new URL(l.href, home.url).toString() }; } catch { return null; } })
    .filter((l): l is any => !!l && l.abs.startsWith("https://produtores.ticketline.pt") && !/logout|sair|logoff|signout/i.test(l.abs + l.text));
  for (const l of queue) {
    if (seen.has(l.abs) || pages.length >= 20) continue;
    seen.add(l.abs);
    try {
      const p = await get(l.abs);
      const s = summarize(p.html, p.url);
      pages.push({ menu: l.text, status: p.status, ctype: p.ctype, title: s.title, keywords: s.keywords, tables: s.tables, selects: s.selects, inputs: s.inputs, links: s.links.slice(0, 25), texto: s.texto.slice(0, 500) });
    } catch (e) { pages.push({ menu: l.text, url: l.abs, erro: String(e) }); }
  }
  out.step3_paginas = pages;

  // 4 — Raphael Ghanem Lisboa (procura no texto das páginas visitadas)
  const hits: unknown[] = [];
  for (const p of [homeSum, ...pages] as any[]) {
    const all = JSON.stringify(p);
    if (/ghanem/i.test(all)) hits.push({ pagina: p.title ?? p.menu, url: p.url, links: (p.links ?? []).filter((x: any) => /ghanem|68025/i.test(x.text + x.href)), selects: (p.selects ?? []).map((s: any) => ({ name: s.name, opts: s.options.filter((o: string) => /ghanem|68025/i.test(o)) })) });
  }
  out.step4_ghanem = hits.length ? hits : "não encontrado nas páginas percorridas";
  out.autenticou = true;
  return json(out);
});
