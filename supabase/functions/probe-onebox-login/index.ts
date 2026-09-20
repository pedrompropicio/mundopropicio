// probe-onebox-login — sonda DESCARTÁVEL de diagnóstico (#Onebox Superset).
//
// Só mede se uma edge function consegue autenticar-se sozinha no painel
// Superset da Onebox (dash.oneboxtds.com). NÃO escreve em tabela nenhuma,
// NÃO toca na captação existente, e faz UMA única tentativa de login
// (nunca repete o POST — a conta pode ser bloqueada por tentativas).
//
// Nunca devolve a password nem o valor dos cookies — só se existem.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const HOST = "https://dash.oneboxtds.com";
const LOGIN_URL = `${HOST}/login/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

type Step = {
  passo: string;
  url: string;
  http: number | null;
  content_type: string | null;
  location: string | null;
  cookies_recebidos: string[];
  cookie_de_sessao: boolean;
  bloqueio_por_ip: boolean;
  corpo_inicio?: string;
  nota?: string;
};

// Guarda apenas nome=valor dos cookies (valores nunca saem na resposta).
class Jar {
  private map = new Map<string, string>();
  absorb(res: Response): string[] {
    const raw = (res.headers as any).getSetCookie?.() ??
      (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
    const names: string[] = [];
    for (const line of raw as string[]) {
      const first = line.split(";")[0];
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!value || value === "null" || value === '""') {
        this.map.delete(name);
      } else {
        this.map.set(name, value);
      }
      names.push(name);
    }
    return names;
  }
  header(): string {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  hasSession(): boolean {
    return [...this.map.keys()].some((k) => /session/i.test(k));
  }
  names(): string[] {
    return [...this.map.keys()];
  }
}

function looksBlocked(status: number, body: string): boolean {
  if (status === 403) return true;
  return /just a moment|cf-browser-verification|Attention Required|you have been blocked|__cf_chl/i
    .test(body);
}

function extractCsrf(html: string): string | null {
  const patterns = [
    /name="csrf_token"[^>]*value="([^"]+)"/i,
    /id="csrf_token"[^>]*value="([^"]+)"/i,
    /value="([^"]+)"[^>]*name="csrf_token"/i,
    /"csrf_token"\s*:\s*"([^"]+)"/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 2), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const user = Deno.env.get("ONEBOX_DASH_USER");
  const pass = Deno.env.get("ONEBOX_DASH_PASSWORD");
  if (!user || !pass) {
    return json({ error: "segredos_em_falta", tem_user: !!user, tem_password: !!pass }, 400);
  }

  const jar = new Jar();
  const steps: Step[] = [];
  let csrf: string | null = null;

  // ── Passo 1: GET /login/ ────────────────────────────────────────────────
  let html = "";
  try {
    const res = await fetch(LOGIN_URL, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,pt-PT;q=0.8",
      },
    });
    const names = jar.absorb(res);
    html = await res.text();
    csrf = extractCsrf(html);
    steps.push({
      passo: "1_get_login",
      url: LOGIN_URL,
      http: res.status,
      content_type: res.headers.get("content-type"),
      location: res.headers.get("location"),
      cookies_recebidos: names,
      cookie_de_sessao: jar.hasSession(),
      bloqueio_por_ip: looksBlocked(res.status, html),
      corpo_inicio: html.slice(0, 600),
      nota: csrf ? "csrf_token encontrado no HTML" : "csrf_token NÃO encontrado no HTML",
    });
  } catch (e) {
    steps.push({
      passo: "1_get_login",
      url: LOGIN_URL,
      http: null,
      content_type: null,
      location: null,
      cookies_recebidos: [],
      cookie_de_sessao: false,
      bloqueio_por_ip: false,
      nota: `erro de rede: ${(e as Error).message}`,
    });
    return json({ csrf_encontrado: false, passos: steps, veredito: "falhou no passo 1" });
  }

  // ── Passo 2: POST /login/ — UMA única tentativa ─────────────────────────
  let loginStatus: number | null = null;
  let loginLocation: string | null = null;
  let loginBody = "";
  if (!csrf) {
    steps.push({
      passo: "2_post_login",
      url: LOGIN_URL,
      http: null,
      content_type: null,
      location: null,
      cookies_recebidos: [],
      cookie_de_sessao: jar.hasSession(),
      bloqueio_por_ip: false,
      nota: "não tentado: sem csrf_token o POST seria recusado e gastaria uma tentativa",
    });
  } else {
    const form = new URLSearchParams({ username: user, password: pass, csrf_token: csrf });
    const res = await fetch(LOGIN_URL, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": HOST,
        "Referer": LOGIN_URL,
        "Cookie": jar.header(),
      },
      body: form.toString(),
    });
    const names = jar.absorb(res);
    loginBody = await res.text();
    loginStatus = res.status;
    loginLocation = res.headers.get("location");
    const backToLogin = (loginLocation ?? "").includes("/login") ||
      /name="csrf_token"/i.test(loginBody);
    steps.push({
      passo: "2_post_login",
      url: LOGIN_URL,
      http: res.status,
      content_type: res.headers.get("content-type"),
      location: loginLocation,
      cookies_recebidos: names,
      cookie_de_sessao: jar.hasSession(),
      bloqueio_por_ip: looksBlocked(res.status, loginBody),
      corpo_inicio: loginBody.slice(0, 600),
      nota: backToLogin
        ? "voltou ao /login/ (falha de autenticação ou CSRF)"
        : "redirecionamento fora do /login/ (indício de sucesso)",
    });
  }

  // ── Passo 3: GET /api/v1/me/ ────────────────────────────────────────────
  const meUrl = `${HOST}/api/v1/me/`;
  let meStatus: number | null = null;
  let meUser: string | null = null;
  {
    const res = await fetch(meUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        "Accept": "application/json",
        "Referer": `${HOST}/superset/welcome/`,
        "Cookie": jar.header(),
      },
    });
    const body = await res.text();
    meStatus = res.status;
    try {
      const j = JSON.parse(body);
      meUser = j?.result?.username ?? j?.result?.email ?? null;
    } catch { /* não é JSON */ }
    steps.push({
      passo: "3_api_me",
      url: meUrl,
      http: res.status,
      content_type: res.headers.get("content-type"),
      location: res.headers.get("location"),
      cookies_recebidos: jar.absorb(res),
      cookie_de_sessao: jar.hasSession(),
      bloqueio_por_ip: looksBlocked(res.status, body),
      corpo_inicio: body.slice(0, 600),
      nota: res.status === 200 ? `utilizador: ${meUser ?? "(sem username no JSON)"}` : undefined,
    });
  }

  // ── Passo 4: GET /api/v1/dashboard/43 — só se o passo 3 deu 200 ─────────
  const dashUrl = `${HOST}/api/v1/dashboard/43`;
  if (meStatus === 200) {
    const res = await fetch(dashUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        "Accept": "application/json",
        "Referer": `${HOST}/superset/dashboard/43/`,
        "Cookie": jar.header(),
      },
    });
    const body = await res.text();
    steps.push({
      passo: "4_api_dashboard_43",
      url: dashUrl,
      http: res.status,
      content_type: res.headers.get("content-type"),
      location: res.headers.get("location"),
      cookies_recebidos: jar.absorb(res),
      cookie_de_sessao: jar.hasSession(),
      bloqueio_por_ip: looksBlocked(res.status, body),
      corpo_inicio: body.slice(0, 600),
    });
  } else {
    steps.push({
      passo: "4_api_dashboard_43",
      url: dashUrl,
      http: null,
      content_type: null,
      location: null,
      cookies_recebidos: [],
      cookie_de_sessao: jar.hasSession(),
      bloqueio_por_ip: false,
      nota: "não tentado: /api/v1/me/ não devolveu 200",
    });
  }

  const blocked = steps.some((s) => s.bloqueio_por_ip);
  return json({
    host: HOST,
    csrf_encontrado: !!csrf,
    login_http: loginStatus,
    login_redirecionou_para: loginLocation,
    me_http: meStatus,
    me_utilizador: meUser,
    cookies_finais: jar.names(),
    bloqueio_por_ip_detetado: blocked,
    autentica_sozinha: meStatus === 200,
    passos: steps,
  });
});
