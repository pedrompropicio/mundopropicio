// onebox-auth-probe — diagnóstico descartável.
// Testa autenticação programática (JWT) na Onebox/Superset.
// Nunca devolve credenciais nem tokens. Não escreve em tabelas.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BASE = "https://dash.oneboxtds.com";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function tokenInfo(t: unknown) {
  if (typeof t !== "string" || !t) return { existe: false };
  return { existe: true, comprimento: t.length, primeiros_3: t.slice(0, 3) };
}

async function tryLogin(username: string, password: string, provider: string) {
  try {
    const res = await fetch(`${BASE}/api/v1/security/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ username, password, provider, refresh: true }),
    });
    const text = await res.text();
    let access: unknown = null;
    let refresh: unknown = null;
    try {
      const parsed = JSON.parse(text);
      access = parsed?.access_token ?? null;
      refresh = parsed?.refresh_token ?? null;
    } catch (_) { /* não é JSON */ }
    const ok = typeof access === "string" && access.length > 0;
    return {
      report: {
        provider_usado: provider,
        status: res.status,
        access_token: tokenInfo(access),
        refresh_token: tokenInfo(refresh),
        ...(ok ? {} : { body_preview: text.slice(0, 200) }),
      },
      accessToken: ok ? (access as string) : null,
    };
  } catch (e) {
    return {
      report: { provider_usado: provider, status: null, error: String((e as Error)?.message ?? e) },
      accessToken: null,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const username = Deno.env.get("ONEBOX_USERNAME");
  const password = Deno.env.get("ONEBOX_PASSWORD");
  if (!username || !password) {
    return json(500, { error: "ONEBOX_USERNAME / ONEBOX_PASSWORD não configurados" });
  }

  const out: Record<string, unknown> = {};

  // 1 — login provider db
  const db = await tryLogin(username, password, "db");
  out.step1_login_db = db.report;
  let token = db.accessToken;

  // 3 — fallback ldap
  if (!token) {
    const ldap = await tryLogin(username, password, "ldap");
    out.step3_login_ldap = ldap.report;
    token = ldap.accessToken;
  }

  // 2 — chart/data com Bearer
  if (token) {
    try {
      const url =
        `${BASE}/api/v1/chart/data?form_data=%7B%22slice_id%22%3A180%7D&dashboard_id=43`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          queries: [{}],
          form_data: { slice_id: 180 },
          result_format: "json",
          result_type: "results",
        }),
      });
      const text = await res.text();
      if (res.status === 200) {
        let linhas: number | null = null;
        let colunas: string[] | null = null;
        try {
          const parsed = JSON.parse(text);
          const r = Array.isArray(parsed?.result) ? parsed.result[0] : null;
          const data = Array.isArray(r?.data) ? r.data : [];
          linhas = data.length;
          colunas = Array.isArray(r?.colnames)
            ? r.colnames
            : data.length > 0
              ? Object.keys(data[0])
              : [];
        } catch (_) { /* ignora */ }
        out.step2_chart_data = { status: 200, linhas, colunas };
      } else {
        out.step2_chart_data = { status: res.status, body_preview: text.slice(0, 200) };
      }
    } catch (e) {
      out.step2_chart_data = { status: null, error: String((e as Error)?.message ?? e) };
    }
  } else {
    out.step2_chart_data = { saltado: "sem access_token" };
  }

  // 4 — GET /api/v1/me/
  try {
    const res = await fetch(`${BASE}/api/v1/me/`, {
      headers: {
        "Accept": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
    });
    const text = await res.text();
    out.step4_me = {
      status: res.status,
      com_bearer: Boolean(token),
      ...(res.status === 200 ? {} : { body_preview: text.slice(0, 200) }),
    };
  } catch (e) {
    out.step4_me = { status: null, error: String((e as Error)?.message ?? e) };
  }

  return json(200, out);
});
