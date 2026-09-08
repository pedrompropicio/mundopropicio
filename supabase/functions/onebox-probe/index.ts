// onebox-probe — diagnóstico descartável.
// Pergunta única: o acesso anónimo ao dashboard público 43 em dash.oneboxtds.com
// funciona a partir do servidor, ou depende de cookie/CSRF de browser?
// Não escreve em tabelas, não cria cron, não devolve credenciais nem tokens.
// Nota: os secrets ONEBOX_USERNAME/ONEBOX_PASSWORD já não são usados.

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

const preview = (text: string) => redact(text).slice(0, 400);

const TARGETS: { name: string; url: string }[] = [
  { name: "dashboard_43", url: `${BASE}/api/v1/dashboard/43` },
  { name: "dashboard_43_charts", url: `${BASE}/api/v1/dashboard/43/charts` },
  { name: "chart_180_data", url: `${BASE}/api/v1/chart/180/data/?format=json` },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const out: Record<string, unknown> = { modo: "anonimo_sem_auth" };

  for (const t of TARGETS) {
    try {
      const res = await fetch(t.url, {
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
          "User-Agent": UA,
          "Referer": `${BASE}/superset/dashboard/43/`,
        },
      });
      const text = await res.text();
      out[t.name] = {
        url: t.url,
        status: res.status,
        content_type: res.headers.get("content-type"),
        body_preview: preview(text),
      };
    } catch (e) {
      out[t.name] = {
        url: t.url,
        status: null,
        error: String((e as Error)?.message ?? e),
      };
    }
  }

  return json(200, out);
});
