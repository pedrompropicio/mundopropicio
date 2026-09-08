// onebox-probe — diagnóstico descartável.
// Pergunta única: o login por FORMULÁRIO (/login/) do Superset em
// dash.oneboxtds.com funciona a partir do servidor, mantendo cookies + CSRF?
// Não escreve em tabelas, não cria cron, nunca devolve credenciais/cookies/csrf.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BASE = "https://dash.oneboxtds.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function redact(text: string): string {
  return text
    .replace(/("(?:access_token|refresh_token)"\s*:\s*")[^"]*(")/g, "$1<redacted>$2")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, "$1<redacted>")
    .replace(/(name="csrf_token"[^>]*value=")[^"]*(")/gi, "$1<redacted>$2");
}

const preview = (text: string) => redact(text).slice(0, 400);

// jar simples: nome -> valor
const jar = new Map<string, string>();

function absorbCookies(res: Response): number {
  const raw =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
  let n = 0;
  for (const line of raw) {
    const first = line.split(";")[0];
    const idx = first.indexOf("=");
    if (idx > 0) {
      jar.set(first.slice(0, idx).trim(), first.slice(idx + 1).trim());
      n++;
    }
  }
  return n;
}

const cookieHeader = () =>
  Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
    ...extra,
  };
  const c = cookieHeader();
  if (c) h["Cookie"] = c;
  return h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const username = Deno.env.get("ONEBOX_USERNAME");
  const password = Deno.env.get("ONEBOX_PASSWORD");
  if (!username || !password) {
    return json(500, { error: "ONEBOX_USERNAME / ONEBOX_PASSWORD não configurados" });
  }

  const out: Record<string, unknown> = { modo: "form_login_com_cookies" };
  jar.clear();

  // 1 — GET /login/ para cookies + csrf_token
  let csrf: string | null = null;
  try {
    const res = await fetch(`${BASE}/login/`, { headers: baseHeaders() });
    const html = await res.text();
    const cookies = absorbCookies(res);
    const m =
      html.match(/name="csrf_token"[^>]*value="([^"]+)"/i) ??
      html.match(/value="([^"]+)"[^>]*name="csrf_token"/i);
    csrf = m ? m[1] : null;
    out.step1_get_login = {
      status: res.status,
      content_type: res.headers.get("content-type"),
      csrf_token_encontrado: Boolean(csrf),
      cookies_recebidos: cookies,
      body_preview: preview(html),
    };
  } catch (e) {
    out.step1_get_login = { status: null, error: String((e as Error)?.message ?? e) };
    return json(200, out);
  }

  // 2 — POST /login/ (form), sem seguir redirects
  let loginOk = false;
  try {
    const form = new URLSearchParams({
      username,
      password,
      ...(csrf ? { csrf_token: csrf } : {}),
    });
    const res = await fetch(`${BASE}/login/`, {
      method: "POST",
      redirect: "manual",
      headers: baseHeaders({
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE,
        "Referer": `${BASE}/login/`,
      }),
      body: form.toString(),
    });
    const novos = absorbCookies(res);
    const text = await res.text();
    const location = res.headers.get("location");
    loginOk = res.status >= 300 && res.status < 400;
    out.step2_post_login = {
      status: res.status,
      location,
      cookies_novos: novos,
      csrf_enviado: Boolean(csrf),
      login_aceite_provavel: loginOk,
      body_preview: preview(text),
    };
  } catch (e) {
    out.step2_post_login = { status: null, error: String((e as Error)?.message ?? e) };
  }

  // 3 — GET da página do dashboard com os cookies
  try {
    const url = `${BASE}/superset/dashboard/43/?native_filters_key=YAu04AgWBog&show_filters=0`;
    const res = await fetch(url, { redirect: "manual", headers: baseHeaders() });
    absorbCookies(res);
    const text = await res.text();
    out.step3_dashboard_page = {
      status: res.status,
      location: res.headers.get("location"),
      content_type: res.headers.get("content-type"),
      body_preview: preview(text),
    };
  } catch (e) {
    out.step3_dashboard_page = { status: null, error: String((e as Error)?.message ?? e) };
  }

  // 4 — API do dashboard, só se o login parecer aceite
  if (loginOk) {
    try {
      const res = await fetch(`${BASE}/api/v1/dashboard/43`, {
        redirect: "manual",
        headers: baseHeaders({
          "Accept": "application/json, text/plain, */*",
          "Referer": `${BASE}/superset/dashboard/43/`,
        }),
      });
      const text = await res.text();
      out.step4_api_dashboard = {
        status: res.status,
        content_type: res.headers.get("content-type"),
        body_preview: preview(text),
      };
    } catch (e) {
      out.step4_api_dashboard = { status: null, error: String((e as Error)?.message ?? e) };
    }
  } else {
    out.step4_api_dashboard = { saltado: true, motivo: "login não aceite no passo 2" };
  }

  return json(200, out);
});
