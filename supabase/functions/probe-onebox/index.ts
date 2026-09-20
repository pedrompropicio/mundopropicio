// probe-onebox — sonda de diagnóstico DESCARTÁVEL.
// Não escreve em tabela nenhuma, não cria crons, não toca noutras funções.
// Faz uma série de GETs ao OneBox (canal eci_teatroalbeniz, evento 59508) e
// devolve, por tentativa: URL, headers enviados, HTTP, content-type e os
// primeiros 1500 chars do corpo.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const HOST = "https://tickets.oneboxtds.com";
const CHANNEL = "eci_teatroalbeniz";
const EVENT_ID = "59508";
const PUBLIC_PAGE = `${HOST}/${CHANNEL}/events/${EVENT_ID}`;
const QS = "limit=8&offset=0&type=SESSION";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const browserHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Accept": "application/json, text/plain, */*",
  "User-Agent": UA,
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  "Referer": PUBLIC_PAGE,
  "Origin": HOST,
  ...extra,
});

interface Attempt {
  label: string;
  url: string;
  headers: Record<string, string>;
  status: number | null;
  contentType: string | null;
  bodyPreview: string;
  verdict: string;
  error?: string;
  sessionsFound?: number;
  sampleSession?: unknown;
}

function verdictFor(status: number, ct: string, body: string, out: Attempt) {
  if (status >= 400) return `erro HTTP ${status}`;
  if (/json/i.test(ct) || body.trimStart().startsWith("{") || body.trimStart().startsWith("[")) {
    try {
      const j = JSON.parse(body);
      const arr = Array.isArray(j) ? j : (j.items ?? j.content ?? j.data ?? j.sessions ?? j.results);
      if (Array.isArray(arr)) {
        out.sessionsFound = arr.length;
        out.sampleSession = arr[0];
        return `JSON com ${arr.length} sessões`;
      }
      return "JSON sem lista de sessões";
    } catch {
      return "corpo tipo JSON ilegível";
    }
  }
  if (/<html/i.test(body)) return "HTML da app";
  return `resposta ${status} (${ct || "sem content-type"})`;
}

async function attempt(
  label: string,
  url: string,
  headers: Record<string, string>,
  fullBody = false,
): Promise<Attempt> {
  const out: Attempt = {
    label, url, headers, status: null, contentType: null, bodyPreview: "", verdict: "",
  };
  try {
    const res = await fetch(url, { headers, redirect: "follow" });
    const body = await res.text();
    out.status = res.status;
    out.contentType = res.headers.get("content-type");
    out.verdict = verdictFor(res.status, out.contentType ?? "", body, out);
    out.bodyPreview = body.slice(0, fullBody ? 200000 : 1500);
  } catch (e) {
    out.error = String((e as Error)?.message ?? e);
    out.verdict = `falha de rede: ${out.error}`;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const attempts: Attempt[] = [];
  const apiPath = `/channels-api/v1/catalog/events/${EVENT_ID}/sessions?${QS}`;

  // 1 — tal e qual, sem headers
  attempts.push(await attempt("1_nu", `${HOST}${apiPath}`, {}));

  // 2 — headers de browser
  attempts.push(await attempt("2_browser", `${HOST}${apiPath}`, browserHeaders()));

  // 3 — canal no prefixo do caminho
  attempts.push(await attempt("3_canal_no_path", `${HOST}/${CHANNEL}${apiPath}`, browserHeaders()));

  // 4/5/6 — canal em cabeçalho
  for (const h of ["x-channel", "channel", "channelId"]) {
    attempts.push(await attempt(`4_header_${h}`, `${HOST}${apiPath}`, browserHeaders({ [h]: CHANNEL })));
  }

  // 7/8/9 — canal em query
  for (const q of ["channel", "channelId", "channelCode"]) {
    attempts.push(
      await attempt(`5_query_${q}`, `${HOST}${apiPath}&${q}=${CHANNEL}`, browserHeaders()),
    );
  }

  // 10 — página pública do evento (HTML), corpo completo para procurar tokens
  const page = await attempt("6_pagina_publica", PUBLIC_PAGE, {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": UA,
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  }, true);
  const html = page.bodyPreview;
  page.bodyPreview = html.slice(0, 1500);
  attempts.push(page);

  // pistas na página
  const hints: Record<string, string[]> = {};
  const patterns: Record<string, RegExp> = {
    window_globals: /window\.__[A-Za-z_]+/g,
    channelId: /["']?channel(?:Id|Code)?["']?\s*[:=]\s*["'][\w.-]+["']/gi,
    apiKey: /["']?api[_-]?key["']?\s*[:=]\s*["'][\w.-]+["']/gi,
    token: /["']?(?:access_?)?token["']?\s*[:=]\s*["'][\w.\-]{8,}["']/gi,
    scripts: /<script[^>]+src="([^"]+)"/g,
    channels_api: /channels-api[^"'\s]*/g,
  };
  for (const [k, re] of Object.entries(patterns)) {
    const found = [...new Set((html.match(re) ?? []).map((s) => s.slice(0, 160)))].slice(0, 12);
    if (found.length) hints[k] = found;
  }

  // 11 — se a página revelar um identificador de canal, repetir com ele
  const idMatch = html.match(/channel(?:Id|Code)?["']?\s*[:=]\s*["']([\w.-]+)["']/i);
  if (idMatch) {
    const found = idMatch[1];
    attempts.push(
      await attempt(
        `7_id_da_pagina_${found}`,
        `${HOST}${apiPath}&channelId=${encodeURIComponent(found)}`,
        browserHeaders({ "x-channel": found }),
      ),
    );
  }

  const success = attempts.filter((a) => (a.sessionsFound ?? 0) > 0);

  return new Response(
    JSON.stringify(
      {
        canal: CHANNEL,
        evento: EVENT_ID,
        pistas_na_pagina: hints,
        tentativas: attempts,
        sucesso: success.length > 0,
        tentativas_com_sessoes: success.map((s) => s.label),
        exemplo_sessao: success[0]?.sampleSession ?? null,
      },
      null,
      2,
    ),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
