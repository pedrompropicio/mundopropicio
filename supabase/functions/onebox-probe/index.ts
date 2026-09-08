// onebox-probe — diagnóstico descartável.
// Mecanismo provado: login por FORMULÁRIO (/login/) com csrf do HTML + cookies.
// NÃO usar /api/v1/security/login (401 nesta instalação).
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

const preview = (text: string, n = 400) => redact(text).slice(0, n);

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
      csrf_token_encontrado: Boolean(csrf),
      cookies_recebidos: cookies,
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
    await res.text();
    loginOk = res.status >= 300 && res.status < 400;
    out.step2_post_login = {
      status: res.status,
      location: res.headers.get("location"),
      cookies_novos: novos,
      login_aceite_provavel: loginOk,
    };
  } catch (e) {
    out.step2_post_login = { status: null, error: String((e as Error)?.message ?? e) };
    return json(200, out);
  }

  if (!loginOk) {
    return json(200, { ...out, aviso: "login não aceite — passos A/B/C saltados" });
  }

  // PASSO A — lista completa de gráficos do dashboard 43
  try {
    const res = await fetch(`${BASE}/api/v1/dashboard/43/charts`, {
      redirect: "manual",
      headers: baseHeaders({
        "Accept": "application/json, text/plain, */*",
        "Referer": `${BASE}/superset/dashboard/43/`,
      }),
    });
    absorbCookies(res);
    const text = await res.text();
    let charts: unknown = null;
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed?.result) ? parsed.result : [];
      charts = list.map((c: Record<string, unknown>) => ({
        id: c?.id ?? (c?.form_data as Record<string, unknown> | undefined)?.slice_id ?? c?.slice_id ?? null,
        slice_name: c?.slice_name ?? (c?.form_data as Record<string, unknown> | undefined)?.slice_name ?? null,
      }));
    } catch (_) {
      // não é JSON — fica o preview
    }
    out.stepA_dashboard_charts = {
      status: res.status,
      content_type: res.headers.get("content-type"),
      total: Array.isArray(charts) ? charts.length : null,
      charts,
      ...(charts === null ? { body_preview: preview(text, 600) } : {}),
    };
  } catch (e) {
    out.stepA_dashboard_charts = { status: null, error: String((e as Error)?.message ?? e) };
  }

  // PASSO B — token CSRF para chamadas de API
  let apiCsrf: string | null = null;
  try {
    const res = await fetch(`${BASE}/api/v1/security/csrf_token/`, {
      redirect: "manual",
      headers: baseHeaders({
        "Accept": "application/json, text/plain, */*",
        "Referer": `${BASE}/superset/dashboard/43/`,
      }),
    });
    absorbCookies(res);
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.result === "string" && parsed.result) apiCsrf = parsed.result;
    } catch (_) { /* ignora */ }
    out.stepB_csrf_token = { status: res.status, result_recebido: Boolean(apiCsrf) };
  } catch (e) {
    out.stepB_csrf_token = { status: null, error: String((e as Error)?.message ?? e) };
  }

  // PASSO C — dados de um gráfico (slice 180)
  const csrfHeader: Record<string, string> = apiCsrf ? { "X-CSRFToken": apiCsrf } : {};
  const attempts: Record<string, unknown>[] = [];
  try {
    const url = `${BASE}/api/v1/chart/data?form_data=${encodeURIComponent(
      JSON.stringify({ slice_id: 180 }),
    )}&dashboard_id=43`;
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: baseHeaders({
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": BASE,
        "Referer": `${BASE}/superset/dashboard/43/`,
        ...csrfHeader,
      }),
      body: JSON.stringify({
        datasource: { id: null, type: "table" },
        queries: [],
        form_data: { slice_id: 180 },
        result_format: "json",
        result_type: "results",
      }),
    });
    const text = await res.text();
    attempts.push({
      metodo: "POST /api/v1/chart/data",
      status: res.status,
      content_type: res.headers.get("content-type"),
      body_preview: preview(text, 600),
    });
  } catch (e) {
    attempts.push({ metodo: "POST /api/v1/chart/data", status: null, error: String((e as Error)?.message ?? e) });
  }

  const primeiro = attempts[0] as { status?: number | null };
  if (!(primeiro.status && primeiro.status >= 200 && primeiro.status < 300)) {
    try {
      const res = await fetch(`${BASE}/api/v1/chart/180/data/?format=json`, {
        redirect: "manual",
        headers: baseHeaders({
          "Accept": "application/json, text/plain, */*",
          "Referer": `${BASE}/superset/dashboard/43/`,
          ...csrfHeader,
        }),
      });
      const text = await res.text();
      attempts.push({
        metodo: "GET /api/v1/chart/180/data/?format=json",
        status: res.status,
        content_type: res.headers.get("content-type"),
        body_preview: preview(text, 600),
      });
    } catch (e) {
      attempts.push({
        metodo: "GET /api/v1/chart/180/data/?format=json",
        status: null,
        error: String((e as Error)?.message ?? e),
      });
    }
  }

  const melhor =
    attempts.find((a) => typeof a.status === "number" && (a.status as number) >= 200 && (a.status as number) < 300) ??
    attempts[attempts.length - 1];
  out.stepC_chart_data = { melhor_tentativa: melhor, todas: attempts };

  return json(200, out);
});
