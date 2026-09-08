// onebox-probe — diagnóstico descartável.
// Pergunta única: a API do Superset em dash.oneboxtds.com aceita login de um
// cliente não-browser, ou a Cloudflare bloqueia?
// Não escreve em tabelas, não cria cron, não devolve credenciais nem tokens.

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

// Remove qualquer valor de token do preview antes de sair da função.
function redact(text: string): string {
  return text
    .replace(/("(?:access_token|refresh_token)"\s*:\s*")[^"]*(")/g, "$1<redacted>$2")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, "$1<redacted>");
}

const preview = (text: string) => redact(text).slice(0, 300);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const username = Deno.env.get("ONEBOX_USERNAME");
  const password = Deno.env.get("ONEBOX_PASSWORD");
  if (!username || !password) {
    return json(500, { error: "ONEBOX_USERNAME / ONEBOX_PASSWORD não configurados" });
  }

  let provider = "db";
  try {
    const body = await req.json();
    if (typeof body?.provider === "string" && body.provider.trim()) {
      provider = body.provider.trim();
    }
  } catch (_) {
    // sem corpo ou corpo inválido → mantém o default
  }

  const out: Record<string, unknown> = { provider_usado: provider };

  let loginText = "";
  try {
    const res = await fetch(`${BASE}/api/v1/security/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        "User-Agent": UA,
        "Origin": BASE,
        "Referer": `${BASE}/login/`,
      },
      body: JSON.stringify({ username, password, provider, refresh: true }),
    });
    loginText = await res.text();
    out.login_status = res.status;
    out.login_content_type = res.headers.get("content-type");
    out.login_body_preview = preview(loginText);
  } catch (e) {
    out.login_status = null;
    out.login_error = String((e as Error)?.message ?? e);
    return json(200, { ...out, token_recebido: false });
  }

  let token: string | null = null;
  try {
    const parsed = JSON.parse(loginText);
    if (typeof parsed?.access_token === "string" && parsed.access_token) {
      token = parsed.access_token;
    }
  } catch (_) {
    // corpo não é JSON (provável HTML de desafio Cloudflare)
  }
  out.token_recebido = Boolean(token);

  if (token) {
    try {
      const res = await fetch(`${BASE}/api/v1/dashboard/43`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json, text/plain, */*",
          "User-Agent": UA,
          "Referer": `${BASE}/superset/dashboard/43/`,
        },
      });
      const text = await res.text();
      out.dashboard_status = res.status;
      out.dashboard_body_preview = preview(text);
    } catch (e) {
      out.dashboard_status = null;
      out.dashboard_error = String((e as Error)?.message ?? e);
    }
  }

  return json(200, out);
});
