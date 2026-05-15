// fetch-fever-reports
// Faz login na Fever via Browserless, baixa 2 relatórios XLSX e importa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseFeverXlsxBuffers, groupFeverLots } from "../_shared/fever-parser.ts";
import { runFeverImport } from "../_shared/fever-import-server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BROWSERLESS_KEY = Deno.env.get("BROWSERLESS_API_KEY");

interface Body {
  configId: string;
  mode?: "manual" | "cron";
  triggeredBy?: string;
}

async function updateRun(admin: any, runId: string, patch: Record<string, any>) {
  const { error } = await admin.from("fever_sync_runs").update(patch).eq("id", runId);
  if (error) console.error("updateRun error:", error.message);
}

async function updateConfig(admin: any, configId: string, patch: Record<string, any>) {
  await admin.from("fever_sync_config").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", configId);
}

/**
 * Playwright script enviado para Browserless via /function endpoint.
 * Devolve { sales: base64, prices: base64, salesName, pricesName }.
 *
 * Selectors: prefere texto visível (PT) ou data-* attributes; CSS evitado.
 */
function buildPuppeteerScript(args: {
  username: string;
  password: string;
  organization: string;
  cityId: string;
  planId: string;
  venueId: string;
}): string {
  const a = JSON.stringify(args);
  return `
export default async function ({ page }) {
  const args = ${a};

  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  });

  const logs = [];
  const log = (m) => { const s = '[' + Date.now() + '] ' + m; logs.push(s); try { console.log(s); } catch (_) {} };
  log('VERSION_MARKER_2026_05_15_v7');

  let lastScreenshot = null;
  const snap = async (label) => {
    try {
      lastScreenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      log('snap ' + label + ' url=' + page.url());
    } catch (e) { log('snap fail: ' + (e && e.message)); }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Capturar URL do download via interceptação de requests
  let lastDownloadUrl = null;
  const downloadUrlRegex = /(\\.xlsx|\\.csv|export|download)/i;
  page.on('request', (req) => {
    const u = req.url();
    if (downloadUrlRegex.test(u) && !u.includes('fonts') && !u.includes('static')) {
      lastDownloadUrl = u;
      log('download url candidato: ' + u);
    }
  });

  const clickByText = async (text, opts = {}) => {
    const exact = opts.exact === true;
    const xp = exact
      ? "//*[normalize-space(text())=" + JSON.stringify(text) + "]"
      : "//*[contains(normalize-space(.), " + JSON.stringify(text) + ")]";
    await page.waitForXPath(xp, { timeout: opts.timeout || 15000 });
    const els = await page.$x(xp);
    if (!els.length) throw new Error('texto nao encontrado: ' + text);
    // pega no mais profundo (último) para evitar clicar em wrapper enorme
    const el = els[els.length - 1];
    await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await el.click();
    return el;
  };

  try {
    // 1. LOGIN
    log('goto login');
    await page.goto('https://partners.feverup.com/login', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(1500);

    const emailSel = 'input[type="email"], input[name="email"], input[id*="email" i]';
    const passSel  = 'input[type="password"], input[name="password"]';
    await page.waitForSelector(emailSel, { timeout: 15000 });
    await page.type(emailSel, args.username, { delay: 80 });
    await page.type(passSel, args.password, { delay: 80 });
    log('credentials filled');
    await snap('pre-submit');
    await sleep(3000);

    // Submit via Enter — robusto contra mudanças de selector do botão
    log('submitting via Enter');
    await Promise.all([
      page.keyboard.press('Enter'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 12000 }).catch((e) => {
        log('no navigation event: ' + (e && e.message));
      }),
    ]);
    log('post-login url=' + page.url());
    await snap('post-login');

    // Se ficámos em /login, capturar o que a página mostra (likely anti-bot)
    if (page.url().includes('/login')) {
      log('still on /login — capturing page text');
      await snap('still-on-login');
      let pageText = '';
      try {
        pageText = await page.evaluate(() => {
          const body = document.body ? document.body.innerText : '';
          return body.slice(0, 3000);
        });
      } catch (_) {}
      log('page text: ' + pageText.replace(/\\n+/g, ' | '));
      throw new Error('login bloqueado: ainda em /login apos submit. Page text: ' + pageText.slice(0, 500));
    }

    log('login successful, url=' + page.url());

    // 2. Org picker (opcional)
    try {
      const xp = "//*[contains(normalize-space(.), " + JSON.stringify(args.organization) + ")]";
      await page.waitForXPath(xp, { timeout: 8000 });
      const els = await page.$x(xp);
      if (els.length) {
        await els[els.length - 1].click();
        log('org clicked: ' + args.organization);
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => {});
      }
    } catch (_) {
      log('no org picker (skip)');
    }

    // 3. Dashboard do plano
    const dashUrl = 'https://partners.feverup.com/plans/dashboard?cityId=' + args.cityId +
                    '&planId=' + args.planId + '&venueId=' + args.venueId;
    log('goto dashboard ' + dashUrl);
    await page.goto(dashUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(2500);
    await snap('dashboard');

    // 4. Aba "Detalhamento de vendas"
    log('click tab Detalhamento de vendas');
    await clickByText('Detalhamento de vendas', { timeout: 20000 });
    await sleep(1500);

    // 5. Sub-aba "Vendas por tipo de ingresso"
    log('click subtab Vendas por tipo de ingresso');
    await clickByText('Vendas por tipo de ingresso', { timeout: 20000 });
    await sleep(2500);
    await snap('subtab');

    async function downloadCard(cardTitle) {
      log('download card: ' + cardTitle);
      const titleXp = "//*[contains(normalize-space(.), " + JSON.stringify(cardTitle) + ")]";
      await page.waitForXPath(titleXp, { timeout: 15000 });
      const titles = await page.$x(titleXp);
      const titleEl = titles[titles.length - 1];
      await titleEl.evaluate(e => e.scrollIntoView({ block: 'center' }));

      // botão "..." na mesma secção (ancestor)
      const menuXp = "ancestor::*[self::section or self::div][1]//button[contains(translate(@aria-label,'OPC','opc'),'opc') or contains(@aria-haspopup,'true') or contains(@class,'menu') or contains(.,'...') or contains(.,'⋯') or contains(.,'⋮')]";
      const menus = await titleEl.$x(menuXp);
      if (!menus.length) throw new Error('menu (...) nao encontrado para card: ' + cardTitle);
      await menus[0].click();
      log('menu clicked');

      // modal "Baixar dados"
      await page.waitForXPath("//*[contains(normalize-space(.), 'Baixar dados')]", { timeout: 10000 });
      await sleep(400);

      // tentar marcar xlsx (default já é xlsx)
      try {
        const xlsx = await page.$x("//label[contains(translate(.,'XLSX','xlsx'),'xlsx')] | //input[@type='radio'][contains(translate(@value,'XLSX','xlsx'),'xlsx')]");
        if (xlsx[0]) await xlsx[0].click().catch(() => {});
      } catch (_) {}

      // limpar a URL capturada anteriormente
      lastDownloadUrl = null;

      // botão Baixar (último, evita o do header)
      const btnXp = "//button[contains(translate(., 'BAIXAR', 'baixar'), 'baixar')]";
      const btns = await page.$x(btnXp);
      if (!btns.length) throw new Error('botao Baixar nao encontrado');
      await btns[btns.length - 1].click();
      log('baixar clicked, aguardar URL');

      // aguardar URL aparecer
      let tries = 0;
      while (!lastDownloadUrl && tries < 120) {
        await sleep(500);
        tries++;
      }
      if (!lastDownloadUrl) {
        await snap('no-download-url');
        throw new Error('URL de download nao foi capturada apos clicar Baixar');
      }

      // fetch dentro do browser context (herda cookies)
      const result = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) throw new Error('fetch ' + r.status + ' ' + url);
        const cd = r.headers.get('content-disposition') || '';
        let filename = 'fever_download.xlsx';
        const m = cd.match(/filename[^;=\\n]*=(?:UTF-\\d['"]*)?([^;\\n"']+)/i);
        if (m && m[1]) filename = decodeURIComponent(m[1].replace(/^["']|["']$/g, '').trim());
        const blob = await r.blob();
        const ab = await blob.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return { b64: btoa(binary), name: filename };
      }, lastDownloadUrl);

      log('downloaded: ' + result.name);

      try { await page.keyboard.press('Escape'); } catch (_) {}
      await sleep(800);
      return result;
    }

    const card1 = await downloadCard('Vendas por tipo de ingresso');
    const card2 = await downloadCard('Ingressos por tipo de ingresso e data de compra');

    return {
      data: {
        sales:      card2.b64,
        salesName:  card2.name,
        prices:     card1.b64,
        pricesName: card1.name,
        logs,
      },
      type: 'application/json',
    };
  } catch (e) {
    const msg = (e && e.message) || String(e);
    log('FATAL: ' + msg);
    await snap('fatal');
    return {
      data: { error: msg, logs, screenshot: lastScreenshot, url: page.url() },
      type: 'application/json',
    };
  }
}
`;
}

async function runBrowserless(script: string): Promise<any> {
  if (!BROWSERLESS_KEY) throw new Error("BROWSERLESS_API_KEY não configurado");
  const url = `https://production-sfo.browserless.io/function?token=${BROWSERLESS_KEY}&stealth=true`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/javascript" },
    body: script,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Browserless ${resp.status}: ${text.slice(0, 500)}`);
  }
  return await resp.json();
}

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: Body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { configId, mode = "manual", triggeredBy } = body;
  if (!configId) {
    return new Response(JSON.stringify({ error: "configId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 1. Carrega config
  const { data: cfg, error: cfgErr } = await admin
    .from("fever_sync_config").select("*").eq("id", configId).single();
  if (cfgErr || !cfg) {
    return new Response(JSON.stringify({ error: "config not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!cfg.enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 2. Cria run
  const { data: run, error: runErr } = await admin.from("fever_sync_runs").insert({
    config_id: cfg.id, company_id: cfg.company_id, status: "started",
    mode, triggered_by: triggeredBy || null,
  }).select("id").single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: runErr?.message || "could not create run" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const runId = run.id;

  try {
    // 3. Lê credenciais do Vault
    const { data: secretRows, error: secErr } = await admin
      .from("vault.decrypted_secrets" as any)
      .select("decrypted_secret").eq("name", cfg.vault_secret_name).maybeSingle();
    let creds: { username: string; password: string } | null = null;
    if (!secErr && secretRows?.decrypted_secret) {
      try { creds = JSON.parse(secretRows.decrypted_secret); } catch { /* ignore */ }
    }
    if (!creds || !creds.username || !creds.password) {
      // fallback via RPC se a SDK não conseguir ler a vault directamente
      const { data: rpcData, error: rpcErr } = await admin.rpc("get_vault_secret" as any, { _name: cfg.vault_secret_name });
      if (!rpcErr && rpcData) {
        try { creds = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData; } catch { /* ignore */ }
      }
    }
    if (!creds || !creds.username || !creds.password) {
      throw Object.assign(new Error(`Credenciais ausentes no Vault (${cfg.vault_secret_name})`), { phase: "auth_failed" });
    }

    // 4. Browserless → Puppeteer → 2 XLSX
    const script = buildPuppeteerScript({
      username: creds.username, password: creds.password,
      organization: cfg.organization_name,
      cityId: cfg.city_id, planId: cfg.plan_id, venueId: cfg.venue_id,
    });

    let downloadResult: any;
    try {
      downloadResult = await runBrowserless(script);
      console.log("[fetch-fever] browserless raw keys:", downloadResult ? Object.keys(downloadResult) : 'null');
      if (typeof downloadResult === 'object' && downloadResult !== null) {
        const summary: Record<string, any> = {};
        for (const [k, v] of Object.entries(downloadResult)) {
          summary[k] = typeof v === 'string' ? `string(len=${v.length})` :
                       Array.isArray(v) ? `array(len=${v.length})` :
                       v === null ? 'null' :
                       typeof v === 'object' ? `object(keys=${Object.keys(v as any).join(',')})` :
                       typeof v;
        }
        console.log("[fetch-fever] browserless raw summary:", JSON.stringify(summary));
      }
    } catch (e: any) {
      throw Object.assign(new Error(e?.message || "Browserless falhou"), { phase: "navigation_failed" });
    }
    // Defensivo: se Browserless envolveu em { data: {...} }, desembrulhar
    if (downloadResult && !downloadResult.sales && !downloadResult.prices && !downloadResult.error && downloadResult.data && typeof downloadResult.data === 'object') {
      console.log("[fetch-fever] desembrulhando downloadResult.data");
      downloadResult = downloadResult.data;
    }
    const browserlessLogs: string[] = Array.isArray(downloadResult?.logs) ? downloadResult.logs : [];
    if (downloadResult?.error) {
      console.error("[fetch-fever] script error:", downloadResult.error);
      console.error("[fetch-fever] last url:", downloadResult.url);
      if (browserlessLogs.length) console.error("[fetch-fever] script logs:\n" + browserlessLogs.join("\n"));
      throw Object.assign(new Error(`Browserless script: ${downloadResult.error}`), {
        phase: "navigation_failed",
        filesAudit: { browserless_logs: browserlessLogs, screenshot_b64: downloadResult.screenshot || null, last_url: downloadResult.url || null },
      });
    }
    let { sales, prices, salesName, pricesName } = downloadResult || {};
    if (!sales || !prices) {
      const rawTruncated = JSON.stringify(downloadResult ?? null).slice(0, 8000);
      console.error("[fetch-fever] raw downloadResult:", rawTruncated);
      throw Object.assign(new Error("Browserless devolveu ficheiros vazios"), {
        phase: "download_failed",
        filesAudit: {
          browserless_logs: browserlessLogs,
          raw_response_truncated: rawTruncated,
          raw_response_keys: downloadResult ? Object.keys(downloadResult) : null,
        },
      });
    }
    if (browserlessLogs.length) console.log("[fetch-fever] browserless logs:\n" + browserlessLogs.join("\n"));

    // Re-mapear por filename pattern (defensivo: caso Fever reordene cards na UI)
    // - sales_per_ticket_type_and_ticket_price_*  → "prices" (Relatório 1: Ticket Type+Price+Gross)
    // - tickets_per_ticket_type_and_purchase_date_* → "sales" (Relatório 2: Date+Weekday+Type+Qty)
    const isPricesName = (n?: string) => !!n && /sales_per_ticket_type_and_ticket_price/i.test(n);
    const isSalesName  = (n?: string) => !!n && /tickets_per_ticket_type_and_purchase_date/i.test(n);
    if (isPricesName(salesName) && isSalesName(pricesName)) {
      console.log("[fetch-fever] swap detectado por filename → trocar sales↔prices");
      [sales, prices] = [prices, sales];
      [salesName, pricesName] = [pricesName, salesName];
    }
    console.log(`[fetch-fever] prices file="${pricesName}" sales file="${salesName}"`);

    const filesAudit = [
      { name: salesName || "fever_sales.xlsx", size: Math.round((sales.length * 3) / 4), sheet_name: "sales" },
      { name: pricesName || "fever_prices.xlsx", size: Math.round((prices.length * 3) / 4), sheet_name: "prices" },
    ];

    // 5. Parser
    let parseResult: any, grouped: any;
    try {
      parseResult = parseFeverXlsxBuffers(b64ToArrayBuffer(sales), b64ToArrayBuffer(prices));
      console.log(`[fetch-fever] parsed: ${parseResult.lots.length} lotes, ${parseResult.sales.length} linhas venda, período ${parseResult.totals.periodFrom}→${parseResult.totals.periodTo}, qty=${parseResult.totals.totalQty}, gross=${parseResult.totals.totalGross}, warnings=${parseResult.warnings.length}`);
      if (parseResult.warnings.length) console.log("[fetch-fever] warnings:", parseResult.warnings.slice(0, 10));
      grouped = groupFeverLots(parseResult.lots);
    } catch (e: any) {
      throw Object.assign(new Error(`Parser: ${e?.message || e}`), { phase: "parse_failed", filesAudit });
    }

    // 6. Resolver fever_account_id (1ª conta ticket_office com 'fever' no nome dentro da company)
    const { data: feverAcc } = await admin.from("financial_accounts")
      .select("id, name").eq("type", "ticket_office").eq("company_id", cfg.company_id)
      .ilike("name", "%fever%").limit(1).maybeSingle();
    if (!feverAcc) {
      throw Object.assign(new Error("Conta financeira Fever não encontrada"), { phase: "import_failed", filesAudit });
    }

    // 7. Import
    let audit: any;
    try {
      audit = await runFeverImport({
        supabase: admin, eventId: cfg.event_id, feverAccountId: feverAcc.id,
        parseResult, grouped, filenames: { sales: salesName || "fever_sales.xlsx", prices: pricesName || "fever_prices.xlsx" },
        triggeredBy: triggeredBy || null,
      });
    } catch (e: any) {
      throw Object.assign(new Error(`Import: ${e?.message || e}`), { phase: "import_failed", filesAudit });
    }

    // 8. Sucesso
    await updateRun(admin, runId, {
      status: "success", finished_at: new Date().toISOString(),
      files_downloaded: filesAudit, import_audit: { ...audit, browserless_logs: browserlessLogs },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: "success" });

    return new Response(JSON.stringify({ ok: true, runId, audit }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    const phase = e?.phase || "navigation_failed";
    const msg = e?.message || String(e);
    await updateRun(admin, runId, {
      status: phase, finished_at: new Date().toISOString(),
      error_message: msg, files_downloaded: e?.filesAudit || null,
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: phase });
    console.error(`[fever-sync ${runId}] ${phase}: ${msg}`);
    return new Response(JSON.stringify({ ok: false, runId, phase, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
