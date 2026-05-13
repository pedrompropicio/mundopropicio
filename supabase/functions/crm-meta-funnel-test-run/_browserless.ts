// Browserless v2 integration for Funnel Test 360.
// Mantém UMA sessão Puppeteer para toda a navegação e devolve steps estruturados.
// Lighthouse é obtido depois via /performance endpoint para URLs-chave.

import { browserlessPuppeteerScript } from "./_puppeteer_script.ts";

export type StepName =
  | "navigate_home"
  | "click_event"
  | "select_ticket"
  | "add_to_cart"
  | "open_cart"
  | "begin_checkout";

export interface PixelEvent {
  event: string;
  fired_at_ms: number;
  value?: number | null;
  currency?: string | null;
  content_ids?: string[] | null;
  raw_url: string;
}

export interface ConsoleEntry {
  level: "error" | "warn";
  message: string;
  source?: string;
}

export interface LighthouseScore {
  lcp: number | null;
  tbt: number | null;
  tti: number | null;
  cls: number | null;
  performance: number | null;
}

export interface FailureContext {
  full_screenshot_b64: string | null;
  dom_b64: string | null;
  recent_console: ConsoleEntry[];
}

export interface SessionStepResult {
  name: StepName;
  step_status: "passed" | "failed" | "skipped";
  duration_ms: number;
  url_at_step: string | null;
  screenshot_b64: string | null;
  pixel_events: PixelEvent[];
  console_errors: ConsoleEntry[];
  notes?: string | null;
  failure_context?: FailureContext | null;
}

export interface SessionResult {
  steps: SessionStepResult[];
}

const STEP_SEQUENCE: StepName[] = [
  "navigate_home",
  "click_event",
  "select_ticket",
  "add_to_cart",
  "open_cart",
  "begin_checkout",
];

// Puppeteer script enviado para Browserless /function.
// É serializado como string — não tem closures sobre Deno.
const PUPPETEER_SCRIPT = `export default ${browserlessPuppeteerScript.toString()}`;

const DEFAULT_BROWSERLESS_BASES = [
  "https://production-lon.browserless.io",
  "https://production-sfo.browserless.io",
];

export function normalizeBrowserlessApiKey(value: string): string {
  let token = String(value ?? "").trim();

  if (/^BROWSERLESS_API_KEY\s*=/.test(token)) {
    token = token.replace(/^BROWSERLESS_API_KEY\s*=\s*/, "");
  }

  try {
    if (/^https?:\/\//i.test(token)) {
      const parsed = new URL(token);
      token = parsed.searchParams.get("token") ?? token;
    }
  } catch (_) {
    // Keep raw token if it is not a valid URL.
  }

  return token
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "");
}

function browserlessBases(): string[] {
  const configured = (globalThis as any).Deno?.env?.get?.("BROWSERLESS_BASE_URL")?.trim?.() ?? "";
  return Array.from(new Set([configured, ...DEFAULT_BROWSERLESS_BASES].filter(Boolean)));
}

function browserlessEndpoint(base: string, path: "function" | "performance", apiKey: string): string {
  const token = normalizeBrowserlessApiKey(apiKey);
  if (!token) throw new Error("BROWSERLESS_API_KEY empty after normalization");
  return `${base}/${path}?token=${encodeURIComponent(token)}`;
}

async function postBrowserlessFunction(
  code: string,
  context: Record<string, unknown>,
  apiKey: string,
): Promise<{ base: string; status: number; text: string; ok: boolean }> {
  // Hierarquia de timeouts para evitar 408 opaco do Browserless v2:
  //   Patch C — AbortController 55s (corte local, primeira linha de defesa)
  //   Patch E.1 — ?timeout=60000 (cap do plano cloud-unit actual; valores
  //               acima são rejeitados com 400 apesar do error message
  //               enganoso dizer "between 1 and 60,000 seconds" — bug de
  //               redação documentado em browserless#4860; o cap real é
  //               60.000 ms = 60s. Default v2 interno coincide com este
  //               cap; setamos explícito para autodocumentar nos logs e
  //               proteger contra alterações silenciosas do default.)
  //   Hierarquia activa: 55s local < 60s plan cap (não 75s/120s do plano
  //   anterior assumido).
  let last: { base: string; status: number; text: string; ok: boolean } | null = null;
  for (const base of browserlessBases()) {
    try {
      const baseUrl = browserlessEndpoint(base, "function", apiKey);
      // Patch E.1: append idempotente — usa & se já há query string, ? se não.
      // (browserlessEndpoint actualmente sempre adiciona ?token, mas mantemos defensivo.)
      const url = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "timeout=60000";
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, context }),
        signal: AbortSignal.timeout(55000),
      });
      const text = await resp.text();
      console.log(`[funnel-test] browserless /function base=${base} status=${resp.status} body=${text.slice(0, 300)}`);
      last = { base, status: resp.status, text, ok: resp.ok };
      if (resp.ok) return last;
      if (![401, 403, 429, 500, 502, 503, 504].includes(resp.status)) return last;
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === "TimeoutError";
      const msg = isAbort
        ? "Browserless excedeu 55s. Script atingiu limite local antes do cap 60s do plano. Verificar logs Supabase para identificar step lento ou hang em Puppeteer."
        : (e instanceof Error ? e.message : String(e));
      console.error(`[funnel-test] browserless /function base=${base} threw: ${msg}`);
      last = { base, status: isAbort ? 408 : 0, text: msg, ok: false };
      // Tenta a base seguinte só se for um erro transitório
      if (!isAbort) continue;
    }
  }
  return last!;
}

export async function runBrowserlessSession(
  targetUrl: string,
  apiKey: string,
): Promise<SessionResult> {
  const normalized = normalizeBrowserlessApiKey(apiKey);
  console.log(`[funnel-test] runBrowserlessSession start raw_key_len=${apiKey.trim().length} key_len=${normalized.length} normalized=${normalized !== apiKey.trim()} bases=${browserlessBases().join(",")} target=${targetUrl}`);
  const result = await postBrowserlessFunction(PUPPETEER_SCRIPT, { targetUrl }, normalized);
  const text = result.text;
  if (!result.ok) {
    throw new Error(`Browserless /function ${result.status} (${result.base}): ${text.slice(0, 300)}`);
  }
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`Browserless /function invalid JSON: ${e instanceof Error ? e.message : String(e)} body=${text.slice(0, 300)}`);
  }
  // Browserless wraps as { data: {...} } when we set type=application/json,
  // but some configurations return the body directly. Handle both.
  const payload = data?.data?.steps ? data.data : data;
  const steps: SessionStepResult[] = payload?.steps ?? [];
  return { steps };
}

export async function pingBrowserless(apiKey: string): Promise<Array<{ base: string; status: number; ok: boolean; body: string }>> {
  const code = `export default async function({ page }) {
    await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 15000 });
    return { data: { title: await page.title(), url: page.url() }, type: "application/json" };
  }`;
  const out = [];
  for (const base of browserlessBases()) {
    const resp = await fetch(browserlessEndpoint(base, "function", apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, context: {} }),
    });
    const body = await resp.text();
    console.log(`[funnel-test] browserless ping base=${base} status=${resp.status} body=${body.slice(0, 300)}`);
    out.push({ base, status: resp.status, ok: resp.ok, body: body.slice(0, 500) });
  }
  return out;
}

export async function fetchLighthouse(
  url: string,
  apiKey: string,
): Promise<LighthouseScore | null> {
  try {
    const base = browserlessBases()[0];
    const resp = await fetch(browserlessEndpoint(base, "performance", apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        config: {
          extends: "lighthouse:default",
          settings: { onlyCategories: ["performance"] },
        },
      }),
    });
    if (!resp.ok) {
      console.warn("[funnel-test] lighthouse skipped", resp.status, url);
      return null;
    }
    const data = await resp.json();
    const audits = data?.data?.lighthouseResult?.audits ?? data?.lighthouseResult?.audits ?? data?.audits;
    const cats = data?.data?.lighthouseResult?.categories ?? data?.lighthouseResult?.categories ?? data?.categories;
    if (!audits) return null;
    return {
      lcp: audits["largest-contentful-paint"]?.numericValue ?? null,
      tbt: audits["total-blocking-time"]?.numericValue ?? null,
      tti: audits["interactive"]?.numericValue ?? null,
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      performance: cats?.performance?.score ?? null,
    };
  } catch (e) {
    console.warn("[funnel-test] lighthouse threw", e);
    return null;
  }
}

export { STEP_SEQUENCE };
