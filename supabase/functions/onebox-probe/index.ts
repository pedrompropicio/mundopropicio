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

  // PASSO C1 — metadados do gráfico 180
  let queryContext: unknown = null;
  try {
    const res = await fetch(`${BASE}/api/v1/chart/180`, {
      redirect: "manual",
      headers: baseHeaders({
        "Accept": "application/json, text/plain, */*",
        "Referer": `${BASE}/superset/dashboard/43/`,
      }),
    });
    absorbCookies(res);
    const text = await res.text();
    let info: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(text);
      const r = (parsed?.result ?? {}) as Record<string, unknown>;
      const qc = r?.query_context;
      if (typeof qc === "string" && qc.trim()) {
        try { queryContext = JSON.parse(qc); } catch (_) { queryContext = null; }
      } else if (qc && typeof qc === "object") {
        queryContext = qc;
      }
      info = {
        datasource_id: r?.datasource_id ?? null,
        datasource_type: r?.datasource_type ?? null,
        query_context_existe: Boolean(queryContext),
      };
    } catch (_) {
      info = { body_preview: preview(text, 400) };
    }
    out.stepC1_chart_meta = { status: res.status, ...info };
  } catch (e) {
    out.stepC1_chart_meta = { status: null, error: String((e as Error)?.message ?? e) };
  }

  if (!queryContext) {
    return json(200, { ...out, aviso: "sem query_context — C2/C3 saltados" });
  }

  const postQueryContext = async (withCsrf: boolean) => {
    const res = await fetch(`${BASE}/api/v1/chart/data`, {
      method: "POST",
      redirect: "manual",
      headers: baseHeaders({
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": BASE,
        "Referer": `${BASE}/superset/dashboard/43/`,
        ...(withCsrf && csrf ? { "X-CSRFToken": csrf } : {}),
      }),
      body: JSON.stringify(queryContext),
    });
    const text = await res.text();
    return {
      status: res.status,
      content_type: res.headers.get("content-type"),
      body_preview: preview(text, 800),
    };
  };

  // PASSO C2 — POST com o query_context tal e qual
  let c2: Awaited<ReturnType<typeof postQueryContext>> | null = null;
  try {
    c2 = await postQueryContext(false);
    out.stepC2_chart_data = c2;
  } catch (e) {
    out.stepC2_chart_data = { status: null, error: String((e as Error)?.message ?? e) };
  }

  // PASSO C3 — uma única repetição com X-CSRFToken do HTML do login
  if (c2 && c2.status === 400 && /csrf/i.test(c2.body_preview) && csrf) {
    try {
      out.stepC3_chart_data_com_csrf = await postQueryContext(true);
    } catch (e) {
      out.stepC3_chart_data_com_csrf = { status: null, error: String((e as Error)?.message ?? e) };
    }
  }

  return json(200, out);
});
