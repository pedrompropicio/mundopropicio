// Portal de Produtores da Ticketline (produtores.ticketline.pt) — ASP.NET com login próprio.
// Helper partilhado: sessão (UMA tentativa de login), lista de eventos, Mapa de Ocupação em PDF
// e parsing do total de vendas. Nunca expõe palavra-passe nem cookies.
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const BASE = "https://produtores.ticketline.pt/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const EVT = "ctl00$ContentPlaceHolder2$cboEvento";

const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

class Jar {
  m = new Map<string, string>();
  take(res: Response) {
    for (const c of ((res.headers as any).getSetCookie?.() ?? []) as string[]) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      if (i > 0) this.m.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
  }
  header() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
}

const hidden = (html: string, name: string) =>
  html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))?.[1] ?? null;

function formFields(html: string): Record<string, string> {
  const f: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]*type="(hidden|text)"[^>]*>/gi)) {
    const n = m[0].match(/name="([^"]+)"/)?.[1];
    if (n) f[n] = decode(m[0].match(/value="([^"]*)"/)?.[1] ?? "");
  }
  for (const m of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    f[m[1]] = m[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/i)?.[1] ?? m[2].match(/<option[^>]*value="([^"]*)"/i)?.[1] ?? "";
  }
  return f;
}

export interface PortalEvent { id: string; nome: string }
export interface OccupationTotal {
  id: string;
  venue: string | null;
  session: string | null; // "YYYY-MM-DD HH:MM"
  qty: number;
  value: number;
}

export class ProdutoresSession {
  private jar = new Jar();
  private page = { url: BASE, html: "" };

  private async get(url: string): Promise<{ url: string; html: string; status: number }> {
    const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: this.jar.header() }, redirect: "manual", signal: AbortSignal.timeout(20000) });
    this.jar.take(r);
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) return this.get(new URL(loc, url).toString());
    return { url, html: await r.text(), status: r.status };
  }

  private async post(extra: Record<string, string>) {
    const r = await fetch(this.page.url, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(30000),
      headers: { "User-Agent": UA, Cookie: this.jar.header(), "Content-Type": "application/x-www-form-urlencoded", Referer: this.page.url },
      body: new URLSearchParams({ ...formFields(this.page.html), ...extra }).toString(),
    });
    this.jar.take(r);
    return { status: r.status, location: r.headers.get("location"), html: await r.text() };
  }

  /** UMA única tentativa. Lança Error com mensagem se falhar — o chamador não repete. */
  async login(user: string, pass: string): Promise<void> {
    const p1 = await this.get(BASE);
    const vs = hidden(p1.html, "__VIEWSTATE"), vg = hidden(p1.html, "__VIEWSTATEGENERATOR"), ev = hidden(p1.html, "__EVENTVALIDATION");
    if (!vs || !ev) throw new Error(`login: campos ASP.NET em falta (HTTP ${p1.status})`);
    const action = new URL(decode(p1.html.match(/<form[^>]*action="([^"]*)"/i)?.[1] ?? "./"), p1.url).toString();
    const r = await fetch(action, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": UA, Cookie: this.jar.header(), "Content-Type": "application/x-www-form-urlencoded", Referer: p1.url, Origin: "https://produtores.ticketline.pt" },
      body: new URLSearchParams({
        __VIEWSTATE: vs, __VIEWSTATEGENERATOR: vg ?? "", __EVENTVALIDATION: ev,
        "ctl00$ContentPlaceHolder1$txtUsername": user,
        "ctl00$ContentPlaceHolder1$txtPassword": pass,
        "ctl00$ContentPlaceHolder1$btnLogin": "entrar",
      }).toString(),
    });
    this.jar.take(r);
    const loc = r.headers.get("location");
    const body = await r.text();
    if (!(r.status >= 300 && loc) && /txtPassword/.test(body)) throw new Error(`login recusado (HTTP ${r.status})`);
    if (!loc) throw new Error(`login sem redirect (HTTP ${r.status})`);
    const home = await this.get(new URL(loc, action).toString());
    this.page = { url: home.url, html: home.html };
  }

  listEvents(): PortalEvent[] {
    const s = this.page.html.match(/<select[^>]*name="[^"]*cboEvento"[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
    return [...s.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => ({ id: o[1], nome: strip(o[2]) }));
  }

  /** Escolhe o evento, carrega "Ocupação", segue até ao PDF e devolve o total de vendas. */
  async occupation(id: string): Promise<OccupationTotal> {
    const sel = await this.post({ __EVENTTARGET: EVT, __EVENTARGUMENT: "", [EVT]: id });
    this.page = { url: this.page.url, html: sel.html };
    const r = await this.post({ "ctl00$ContentPlaceHolder2$btnOcupacao": "x" });
    if (!r.location) throw new Error(`ocupação ${id}: sem redirect para relatório`);
    const rel = await fetch(new URL(r.location, this.page.url).toString(), { headers: { "User-Agent": UA, Cookie: this.jar.header() }, signal: AbortSignal.timeout(30000) });
    this.jar.take(rel);
    const relHtml = await rel.text();
    const pdfPath = relHtml.match(/["']([^"']*TempReports\/[^"']+\.pdf)["']/i)?.[1];
    if (!pdfPath) throw new Error(`ocupação ${id}: PDF não encontrado`);
    const pdf = await fetch(new URL(pdfPath, rel.url).toString(), { signal: AbortSignal.timeout(30000) });
    const buf = new Uint8Array(await pdf.arrayBuffer());
    const { text } = await extractText(await getDocumentProxy(buf), { mergePages: true });
    return { id, ...parseOccupationText(String(text)) };
  }
}

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/**
 * Texto do Mapa de Ocupação → local, sessão e total de vendas.
 * Na linha TOTAL, os três primeiros pares "qtd valor" são postos, internet e bilheteira;
 * a soma é o total de vendas, sem convites nem cativos.
 */
export function parseOccupationText(t: string): Omit<OccupationTotal, "id"> {
  const venue = t.match(/Local Espect[^:]*:\s*(.*?)\s+POSTOS/)?.[1]?.trim() ?? null;
  const session = t.match(/Sess[ãa]o:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/)?.[1] ?? null;
  const at = t.lastIndexOf("TOTAL ");
  if (at < 0) throw new Error("mapa de ocupação: linha TOTAL não encontrada");
  const pairs = [...t.slice(at).matchAll(/(\d[\d.]*) (\d[\d.]*,\d\d)/g)].slice(0, 3);
  if (pairs.length < 3) throw new Error("mapa de ocupação: TOTAL sem os 3 canais");
  const qty = pairs.reduce((s, p) => s + Number(p[1].replace(/\./g, "")), 0);
  const value = Math.round(pairs.reduce((s, p) => s + num(p[2]), 0) * 100) / 100;
  return { venue, session, qty, value };
}

const STOP = new Set(["do", "da", "de", "dos", "das", "centro", "grande", "sala", "salao", "auditorio", "pavilhao", "pav"]);
export function venueTokens(v: string | null | undefined): Set<string> {
  return new Set(
    (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}
