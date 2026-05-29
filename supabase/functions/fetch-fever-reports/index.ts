// fetch-fever-reports
// v24 — fetch() directo à API Fever + Metabase Embedded. Sem Browserless.
// Fluxo: B2bToken (Vault) → POST /graphs → JWT Metabase → 2× GET xlsx → parser → import.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseFeverXlsxBuffers, groupFeverLots } from "../_shared/fever-parser.ts";
import { runFeverImport } from "../_shared/fever-import-server.ts";

// v28_daily_is_source_of_truth_overflow_to_last_lot_2026_05_29
const VERSION = "v28_daily_is_source_of_truth_overflow_to_last_lot_2026_05_29";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body { configId: string; mode?: "manual" | "cron"; triggeredBy?: string }

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function updateRun(admin: any, runId: string, patch: Record<string, any>) {
  const { error } = await admin.from("fever_sync_runs").update(patch).eq("id", runId);
  if (error) console.error("updateRun error:", error.message);
}
async function updateConfig(admin: any, configId: string, patch: Record<string, any>) {
  await admin.from("fever_sync_config").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", configId);
}

function decodeJwtPayload(jwt: string): any {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("JWT inválido (≠3 segmentos)");
  let p = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (p.length % 4) p += "=";
  return JSON.parse(atob(p));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 30000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

const METABASE_PARAMS = encodeURIComponent(JSON.stringify({
  purchase_date: null,
  event_date: null,
  granularity: ["Day"],
  tag: null,
  ticket_type: ["Exclude add-ons"],
  purchase_channel: null,
}));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  console.log(`[fever-sync] ${VERSION}`);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "invalid json" }); }
  const { configId, mode = "manual", triggeredBy } = body;
  if (!configId) return json(400, { error: "configId required" });

  const { data: cfg, error: cfgErr } = await admin
    .from("fever_sync_config").select("*").eq("id", configId).single();
  if (cfgErr || !cfg) return json(404, { error: "config not found" });
  if (!cfg.enabled) return json(200, { ok: true, skipped: true, reason: "disabled" });

  // Lock anti-concorrência: se já existe um run "started" deste config nos últimos 120s,
  // saltamos para não fazer dois delete+insert em paralelo sobre as mesmas ticket_sales.
  const since = new Date(Date.now() - 120_000).toISOString();
  const { data: inFlight } = await admin
    .from("fever_sync_runs")
    .select("id, started_at")
    .eq("config_id", cfg.id)
    .eq("status", "started")
    .gte("started_at", since)
    .limit(1);
  if (inFlight && inFlight.length > 0) {
    console.log(`[fever-sync] skip: concurrent run ${inFlight[0].id} in flight`);
    return json(200, { ok: true, skipped: true, reason: "concurrent_run", concurrent_run_id: inFlight[0].id });
  }

  const { data: run, error: runErr } = await admin.from("fever_sync_runs").insert({
    config_id: cfg.id, company_id: cfg.company_id, status: "started",
    mode, triggered_by: triggeredBy || null,
  }).select("id").single();
  if (runErr || !run) return json(500, { error: runErr?.message || "could not create run" });
  const runId = run.id;

  const debug: Record<string, any> = { version: VERSION };

  try {
    // 1. B2bToken do Vault (com self-heal)
    if (!cfg.b2b_token_secret_name) {
      throw Object.assign(new Error("b2b_token_secret_name não definido no config"), { phase: "token_missing" });
    }

    async function getValidB2bToken(attempt = 0): Promise<{ token: string; payload: any }> {
      const { data: tokRpc, error: tokErr } = await admin.rpc("get_vault_secret" as any, { _name: cfg.b2b_token_secret_name });
      const tk = (typeof tokRpc === "string" ? tokRpc : "").trim();
      if (tokErr || !tk) {
        throw Object.assign(new Error(`B2bToken não encontrado no Vault (${cfg.b2b_token_secret_name}). Vai a /admin/fever-sync → Token Fever.`), { phase: "token_missing" });
      }
      let pl: any;
      try { pl = decodeJwtPayload(tk); }
      catch (e: any) { throw Object.assign(new Error(`Token Vault inválido: ${e?.message || e}`), { phase: "token_invalid" }); }
      const nowSec = Math.floor(Date.now() / 1000);
      const expSec = pl?.exp || 0;
      // Self-heal: expira em <5min OU já expirou → invocar refresh interno
      if (expSec - nowSec < 300) {
        if (attempt >= 1) {
          throw Object.assign(
            new Error(`B2bToken expirado em ${new Date(expSec * 1000).toISOString()} (refresh self-heal já tentado, ainda inválido).`),
            { phase: "token_expired" },
          );
        }
        console.log(`[fever-sync] token expira em ${expSec - nowSec}s — disparando refresh self-heal`);
        const refreshResp = await fetch(`${SUPABASE_URL}/functions/v1/refresh-fever-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({ configId: cfg.id, triggeredBy: "self-heal-from-sync" }),
        });
        if (!refreshResp.ok) {
          const errText = (await refreshResp.text()).slice(0, 400);
          throw Object.assign(
            new Error(`Refresh self-heal falhou: HTTP ${refreshResp.status} ${errText}`),
            { phase: "token_expired" },
          );
        }
        await refreshResp.text().catch(() => null);
        debug.self_heal_refresh = true;
        return getValidB2bToken(attempt + 1);
      }
      return { token: tk, payload: pl };
    }

    const { token: b2bToken, payload } = await getValidB2bToken();
    debug.token_user = payload.user_email || null;
    debug.token_exp = new Date(payload.exp * 1000).toISOString();

    // 3. POST /graphs
    const graphsUrl = `https://services.feverup.com/b2b-partners/1.0/partners/${cfg.partner_id}/graphs`;
    const graphsResp = await fetchWithTimeout(graphsUrl, {
      method: "POST",
      headers: {
        "Authorization": `B2bToken ${b2bToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
      },
      body: JSON.stringify({ plan_id: Number(cfg.plan_id), group_name: "analytics" }),
    });
    if (!graphsResp.ok) {
      const text = (await graphsResp.text()).slice(0, 400);
      const phase = graphsResp.status === 401 ? "graphs_401" : `graphs_http_${graphsResp.status}`;
      throw Object.assign(new Error(`/graphs ${graphsResp.status}: ${text}`), { phase });
    }
    const graphsJson: any = await graphsResp.json();
    const graphs: any[] = graphsJson?.data?.graphs || graphsJson?.graphs || [];
    debug.graphs_count = graphs.length;

    // 4. Extrair JWT Metabase
    const dashboard = graphs.find((g: any) => Number(g.external_id) === Number(cfg.dashboard_id));
    if (!dashboard) {
      throw Object.assign(new Error(`Dashboard external_id=${cfg.dashboard_id} não encontrado em /graphs (encontrados: ${graphs.map(g => g.external_id).join(",")})`), { phase: "dashboard_not_found" });
    }
    const m = String(dashboard.url || "").match(/\/embed\/dashboard\/([^#?\/]+)/);
    if (!m) {
      throw Object.assign(new Error(`JWT Metabase não extraído. URL=${String(dashboard.url || "").slice(0, 200)}`), { phase: "metabase_jwt_not_extracted" });
    }
    const metabaseJwt = m[1];
    debug.metabase_jwt_len = metabaseJwt.length;

    // 5. Baixar 2 XLSX
    const cards = [
      { dashcard: cfg.card_sales_dashcard, card: cfg.card_sales_card, label: "sales_per_ticket_type", filename: "sales_per_ticket_type_and_ticket_price.xlsx" },
      { dashcard: cfg.card_tickets_dashcard, card: cfg.card_tickets_card, label: "tickets_per_purchase_date", filename: "tickets_per_ticket_type_and_purchase_date.xlsx" },
    ];
    const downloaded: { label: string; filename: string; bytes: Uint8Array }[] = [];
    for (const c of cards) {
      const xlsxUrl = `https://feverzone.metabaseapp.com/api/embed/dashboard/${metabaseJwt}/dashcard/${c.dashcard}/card/${c.card}/xlsx?parameters=${METABASE_PARAMS}&format_rows=true&pivot_results=false`;
      const r = await fetchWithTimeout(xlsxUrl, { headers: { "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } }, 45000);
      if (!r.ok) {
        const text = (await r.text()).slice(0, 300);
        throw Object.assign(new Error(`XLSX ${c.label} ${r.status}: ${text}`), { phase: `xlsx_${c.label}_http_${r.status}` });
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length < 100 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
        throw Object.assign(new Error(`XLSX ${c.label} inválido (size=${buf.length}, magic=${buf[0]?.toString(16)} ${buf[1]?.toString(16)})`), { phase: `xlsx_${c.label}_invalid_magic` });
      }
      downloaded.push({ label: c.label, filename: c.filename, bytes: buf });
      console.log(`[fever-sync] ${c.label} ok size=${buf.length}`);
    }

    const salesXlsx = downloaded.find(d => d.label === "tickets_per_purchase_date")!; // qty + datas
    const pricesXlsx = downloaded.find(d => d.label === "sales_per_ticket_type")!;     // type+price+gross
    const filesAudit = [
      { name: salesXlsx.filename, size: salesXlsx.bytes.length, sheet_name: "sales" },
      { name: pricesXlsx.filename, size: pricesXlsx.bytes.length, sheet_name: "prices" },
    ];

    // 6. Parser
    let parseResult: any, grouped: any;
    try {
      parseResult = parseFeverXlsxBuffers(salesXlsx.bytes.buffer, pricesXlsx.bytes.buffer);
      console.log(`[fever-sync] parsed: lots=${parseResult.lots.length} sales=${parseResult.sales.length} period=${parseResult.totals.periodFrom}→${parseResult.totals.periodTo} qty=${parseResult.totals.totalQty} gross=${parseResult.totals.totalGross} warns=${parseResult.warnings.length}`);
      grouped = groupFeverLots(parseResult.lots);
    } catch (e: any) {
      throw Object.assign(new Error(`Parser: ${e?.message || e}`), { phase: "parse_failed", filesAudit });
    }

    // 7. Conta Fever
    const { data: feverAcc } = await admin.from("financial_accounts")
      .select("id, name").eq("type", "ticket_office").eq("company_id", cfg.company_id)
      .ilike("name", "%fever%").limit(1).maybeSingle();
    if (!feverAcc) {
      throw Object.assign(new Error("Conta financeira Fever não encontrada"), { phase: "import_failed", filesAudit });
    }

    // 8. Import
    let audit: any;
    try {
      audit = await runFeverImport({
        supabase: admin, eventId: cfg.event_id, feverAccountId: feverAcc.id,
        parseResult, grouped, filenames: { sales: salesXlsx.filename, prices: pricesXlsx.filename },
        triggeredBy: triggeredBy || null,
      });
    } catch (e: any) {
      throw Object.assign(new Error(`Import: ${e?.message || e}`), { phase: "import_failed", filesAudit });
    }

    const finalStatus = (audit?.warnings?.length || 0) > 0 ? "success_with_warning" : "success";
    await updateRun(admin, runId, {
      status: finalStatus, finished_at: new Date().toISOString(),
      files_downloaded: filesAudit, import_audit: { ...audit, debug },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: finalStatus });

    return json(200, { ok: true, runId, audit, debug });
  } catch (e: any) {
    const phase = e?.phase || "failed";
    const msg = e?.message || String(e);
    await updateRun(admin, runId, {
      status: phase, finished_at: new Date().toISOString(),
      error_message: msg, files_downloaded: e?.filesAudit || null,
      import_audit: { debug },
    });
    await updateConfig(admin, cfg.id, { last_run_at: new Date().toISOString(), last_run_status: phase });
    console.error(`[fever-sync ${runId}] ${phase}: ${msg}`);
    return json(500, { ok: false, runId, phase, error: msg, debug });
  }
});
