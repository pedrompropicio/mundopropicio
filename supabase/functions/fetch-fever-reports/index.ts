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
function buildPlaywrightScript(args: {
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

  // 1. LOGIN
  await page.goto('https://partners.feverup.com/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // tentar campos comuns: email + password
  const emailSel = 'input[type="email"], input[name="email"], input[id*="email" i]';
  const passSel  = 'input[type="password"], input[name="password"]';
  await page.waitForSelector(emailSel, { timeout: 15000 });
  await page.fill(emailSel, args.username);
  await page.fill(passSel, args.password);

  // submit
  const submitSel = 'button[type="submit"]';
  await page.click(submitSel);

  // 2. Tela de seleção de organização
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  // procura card pelo nome da organização (texto visível)
  try {
    await page.getByText(args.organization, { exact: false }).first().click({ timeout: 12000 });
  } catch (e) {
    // se já estiver dentro de uma org sem prompt de seleção, ignorar
    console.log('no org picker:', e?.message || e);
  }

  // 3. Navegar para o dashboard do plano
  const url = 'https://partners.feverup.com/plans/dashboard?cityId=' + args.cityId +
              '&planId=' + args.planId + '&venueId=' + args.venueId;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);

  // 4. Aba "Detalhamento de vendas"
  await page.getByText('Detalhamento de vendas', { exact: false }).first().click({ timeout: 15000 });
  await page.waitForTimeout(1500);

  // 5. Sub-aba "Vendas por tipo de ingresso"
  await page.getByText('Vendas por tipo de ingresso', { exact: false }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);

  // 6. Helper para baixar XLSX de um card pelo título
  async function downloadCard(cardTitle) {
    // localizar card pelo título e clicar nos "..."
    const card = page.locator('div', { hasText: cardTitle }).filter({
      has: page.locator('button[aria-label*="opc" i], button:has-text("...")')
    }).first();

    // fallback: localizar o "..." mais próximo do título
    const titleLoc = page.getByText(cardTitle, { exact: true }).first();
    await titleLoc.scrollIntoViewIfNeeded();
    // procura o botão de menu (3 pontos) na mesma secção
    const menuBtn = titleLoc.locator('xpath=ancestor::*[self::section or self::div][1]//button[contains(@aria-label,"opc") or contains(@aria-label,"Opc") or contains(.,"...") or contains(@class,"menu") or contains(@aria-haspopup,"true")]').first();
    await menuBtn.click({ timeout: 10000 });

    // Modal "Baixar dados" → seleciona .xlsx (default) → "Baixar"
    await page.getByText('Baixar dados', { exact: false }).first().waitFor({ timeout: 10000 });

    // garantir radio xlsx (default)
    const xlsxRadio = page.locator('input[type="radio"][value*="xlsx" i], label:has-text(".xlsx")').first();
    try { await xlsxRadio.click({ timeout: 3000 }); } catch (_) {}

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.getByRole('button', { name: /baixar/i }).last().click(),
    ]);

    const path = await download.path();
    const buf = await Deno.readFile(path);
    const b64 = btoa(String.fromCharCode(...buf));
    const name = download.suggestedFilename();
    // fechar modal se ainda estiver aberto
    try { await page.keyboard.press('Escape'); } catch (_) {}
    await page.waitForTimeout(1000);
    return { b64, name };
  }

  const card1 = await downloadCard('Vendas por tipo de ingresso');
  const card2 = await downloadCard('Ingressos por tipo de ingresso e data de compra');

  return {
    data: {
      sales:      card2.b64,  // tickets_per_ticket_type_and_purchase_date
      salesName:  card2.name,
      prices:     card1.b64,  // sales_per_ticket_type_and_ticket_price
      pricesName: card1.name,
    },
    type: 'application/json',
  };
}
`;
}

async function runBrowserless(script: string): Promise<{ sales: string; prices: string; salesName: string; pricesName: string }> {
  if (!BROWSERLESS_KEY) throw new Error("BROWSERLESS_API_KEY não configurado");
  const url = `https://production-sfo.browserless.io/function?token=${BROWSERLESS_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/javascript" },
    body: script,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Browserless ${resp.status}: ${text.slice(0, 500)}`);
  }
  const data = await resp.json();
  return data;
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

    // 4. Browserless → Playwright → 2 XLSX
    const script = buildPlaywrightScript({
      username: creds.username, password: creds.password,
      organization: cfg.organization_name,
      cityId: cfg.city_id, planId: cfg.plan_id, venueId: cfg.venue_id,
    });

    let downloadResult: any;
    try {
      downloadResult = await runBrowserless(script);
    } catch (e: any) {
      throw Object.assign(new Error(e?.message || "Browserless falhou"), { phase: "navigation_failed" });
    }
    let { sales, prices, salesName, pricesName } = downloadResult || {};
    if (!sales || !prices) {
      throw Object.assign(new Error("Browserless devolveu ficheiros vazios"), { phase: "download_failed" });
    }

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
      files_downloaded: filesAudit, import_audit: audit,
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
