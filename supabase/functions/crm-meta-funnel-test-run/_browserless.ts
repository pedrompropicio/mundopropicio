// Browserless v2 integration for Funnel Test 360.
// Mantém UMA sessão Puppeteer para toda a navegação e devolve steps estruturados.
// Lighthouse é obtido depois via /performance endpoint para URLs-chave.

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

export interface SessionStepResult {
  name: StepName;
  step_status: "passed" | "failed" | "skipped";
  duration_ms: number;
  url_at_step: string | null;
  screenshot_b64: string | null;
  pixel_events: PixelEvent[];
  console_errors: ConsoleEntry[];
  notes?: string | null;
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
const PUPPETEER_SCRIPT = `
export default async function ({ page, context }) {
  const { targetUrl } = context;
  const sessionStart = Date.now();
  const allPixel = [];
  const allConsole = [];

  // ---- INTERCEPTORS ----
  page.on('request', (req) => {
    try {
      const url = req.url();
      if (url.includes('facebook.com/tr') || url.includes('connect.facebook.net/signals')) {
        const u = new URL(url);
        const ev = u.searchParams.get('ev');
        if (ev) {
          let contentIds = null;
          const cidRaw = u.searchParams.get('cd[content_ids]');
          if (cidRaw) {
            try { contentIds = JSON.parse(cidRaw); } catch (_) { contentIds = [cidRaw]; }
          }
          const valueStr = u.searchParams.get('cd[value]');
          allPixel.push({
            event: ev,
            fired_at_ms: Date.now() - sessionStart,
            value: valueStr ? parseFloat(valueStr) : null,
            currency: u.searchParams.get('cd[currency]'),
            content_ids: contentIds,
            raw_url: url,
            _ts: Date.now(),
          });
        }
      }
    } catch (_) { /* noop */ }
  });

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      allConsole.push({
        level: t === 'warning' ? 'warn' : 'error',
        message: msg.text().slice(0, 500),
        source: msg.location()?.url,
        _ts: Date.now(),
      });
    }
  });
  page.on('pageerror', (err) => {
    allConsole.push({ level: 'error', message: String(err).slice(0, 500), _ts: Date.now() });
  });

  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  // ---- HELPERS ----
  const sliceSince = (arrName, sinceTs) => {
    const arr = arrName === 'pixel' ? allPixel : allConsole;
    return arr.filter(x => x._ts >= sinceTs).map(({_ts, ...r}) => r);
  };

  const screenshot = async () => {
    try {
      const buf = await page.screenshot({ type: 'png', fullPage: false });
      return buf.toString('base64');
    } catch (_) { return null; }
  };

  const trySelectors = async (selectors, timeoutMs = 8000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const sel of selectors) {
        try {
          // Suporte para has-text via XPath quando aplicável
          if (sel.includes(':has-text(')) {
            const m = sel.match(/^([a-z]+):has-text\\("(.+)"\\)$/i);
            if (m) {
              const tag = m[1]; const text = m[2];
              const xp = \`//\${tag}[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÀÂÊÔÃÕÇ', 'abcdefghijklmnopqrstuvwxyzáéíóúàâêôãõç'), '\${text.toLowerCase()}')]\`;
              const handles = await page.$x(xp);
              if (handles.length) return handles[0];
              continue;
            }
          }
          const handle = await page.$(sel);
          if (handle) return handle;
        } catch (_) { /* try next */ }
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  };

  const SELECTORS = {
    click_event: ['a[href*="/evento/"]','a[href*="/event/"]','.event-card a','article a[href*="/"]','a:has(img)'],
    select_ticket: ['button:has-text("Comprar")','button:has-text("Bilhetes")','a:has-text("Comprar")','[data-testid*="ticket"]','button.btn-primary'],
    add_to_cart: ['button:has-text("Adicionar")','button:has-text("Cesto")','button:has-text("Cart")','[data-testid*="add"]','input[type="submit"][value*="dicionar"]'],
    open_cart: ['a[href*="/cesto"]','a[href*="/cart"]','a[href*="/carrinho"]','[aria-label*="cart" i]'],
    begin_checkout: ['button:has-text("Continuar")','button:has-text("Finalizar")','a:has-text("Checkout")','button[type="submit"]'],
  };

  const steps = [];
  const STEP_SEQ = ['navigate_home','click_event','select_ticket','add_to_cart','open_cart','begin_checkout'];

  for (const name of STEP_SEQ) {
    const stepStart = Date.now();
    const sinceTs = stepStart;
    let status = 'passed';
    let note = null;
    try {
      if (name === 'navigate_home') {
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      } else {
        const handle = await trySelectors(SELECTORS[name], 8000);
        if (!handle) {
          status = 'failed';
          note = 'selector_not_found';
        } else {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => null),
            handle.click().catch(() => null),
          ]);
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    } catch (e) {
      status = 'failed';
      note = String(e).slice(0, 300);
    }
    const stepEnd = Date.now();
    const shot = await screenshot();
    const url = page.url();
    steps.push({
      name,
      step_status: status,
      duration_ms: stepEnd - stepStart,
      url_at_step: url,
      screenshot_b64: shot,
      pixel_events: sliceSince('pixel', sinceTs),
      console_errors: sliceSince('console', sinceTs),
      notes: note,
    });
  }

  return {
    data: { steps },
    type: 'application/json',
  };
}
`;

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
  let last: { base: string; status: number; text: string; ok: boolean } | null = null;
  for (const base of browserlessBases()) {
    const resp = await fetch(browserlessEndpoint(base, "function", apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, context }),
    });
    const text = await resp.text();
    console.log(`[funnel-test] browserless /function base=${base} status=${resp.status} body=${text.slice(0, 300)}`);
    last = { base, status: resp.status, text, ok: resp.ok };
    if (resp.ok) return last;
    if (![401, 403, 429, 500, 502, 503, 504].includes(resp.status)) return last;
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
