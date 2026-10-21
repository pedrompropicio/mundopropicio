// artist-ads-balance-check (D-ERP267) — só service_role.
// mode=balance  : lê saldo de cada ligação de artista activa, grava crm.artist_ads_balance_readings,
//                 abre/fecha saldo_baixo | saldo_critico | saldo_ilegivel.
// mode=delivery : compara o gasto de hoje (leitura rápida na API) com o esperado para a hora
//                 (média 3 dias × fração do dia em Fortaleza); abre/fecha entrega_parada com causa.
// mode=simulate : sem escrita; recalcula ambos para um dia/horas passados a partir dos insights gravados.
// Nunca devolve tokens.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";
import { tiktokGET, tiktokHost } from "../_shared/tiktok-ads.ts";
import { getGoogleAdsAccessToken, googleAdsSearch, type GoogleAdsCtx } from "../_shared/google-ads.ts";
import { balanceAlert, dayFraction, deliveryStopped, parseMetaDisplayBalance, pickCause } from "./logic.ts";
import { campaignActive, timestampDay } from '../_shared/campaign-activity.ts';

const MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY") ?? "";
const GRAPH = "https://graph.facebook.com/v25.0";
const TZ = "America/Fortaleza";
const TIKTOK_ILEGIVEL = "Saldo TikTok ilegível: reautorizar a ligação com um admin/financeiro do BC";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Conn = { id: string; platform: string; selected_ad_account_id: string; selected_ad_account_currency: string | null;
  login_customer_id: string | null; artist_id: string; company_id: string; oauth_meta: any };

function ymd(d: Date, tz = TZ) { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d); }
function addDays(s: string, n: number) { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

async function token(admin: any, c: Conn) {
  if (c.platform !== "meta" && c.platform !== "tiktok") return "";
  const rpc = c.platform === "meta" ? "crm_get_meta_decrypted_token" : "crm_get_tiktok_decrypted_token";
  const { data } = await admin.rpc(rpc, { p_connection_id: c.id, p_master_key: MASTER_KEY });
  return Array.isArray(data) && data[0]?.access_token ? String(data[0].access_token) : "";
}
const scrubber = (tok: string) => (v: unknown) => { const s = JSON.stringify(v ?? null); return JSON.parse(tok ? s.split(tok).join("***") : s); };

/** Gasto diário gravado (por dia) entre [from, to]. */
async function dailySpend(admin: any, c: Conn, from: string, to: string, campaigns?: string[]): Promise<Record<string, number>> {
  const t = c.platform === "tiktok" ? "tiktok_insights_daily_carreira" : c.platform === "meta" ? "meta_campaign_insights_daily" : "google_campaign_insights_daily";
  let q = admin.schema("crm").from(t).select("date_start, spend_cents").eq("connection_id", c.id).gte("date_start", from).lte("date_start", to);
  if (c.platform === "tiktok") q = q.eq("level", "adgroup");
  if (campaigns) q = q.in('external_campaign_id', campaigns);
  const { data } = await q.limit(5000);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.date_start] = (out[r.date_start] ?? 0) + Number(r.spend_cents ?? 0) / 100;
  return out;
}
async function avg3d(admin: any, c: Conn, today: string, campaigns?: string[]) {
  const s = await dailySpend(admin, c, addDays(today, -3), addDays(today, -1), campaigns);
  const days = [1, 2, 3].map((i) => s[addDays(today, -i)] ?? 0);
  return { avg: days.reduce((a, b) => a + b, 0) / 3, days: Object.fromEntries([1, 2, 3].map((i) => [addDays(today, -i), s[addDays(today, -i)] ?? 0])) };
}

function googleCtx(c: Conn): Promise<GoogleAdsCtx> {
  return getGoogleAdsAccessToken().then((accessToken) => ({
    accessToken,
    developerToken: Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
    loginCustomerId: String(c.login_customer_id || Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") || "").replace(/-/g, ""),
    customerId: String(c.selected_ad_account_id ?? "").replace(/-/g, ""),
  }));
}

// ---------------------------------------------------------------- saldo
async function readBalance(c: Conn, tok: string): Promise<{ balance: number | null; source: string; raw: any; ilegivelMsg?: string; accountProblem?: string | null }> {
  const scrub = scrubber(tok);
  if (c.platform === "tiktok") {
    const host = tiktokHost();
    if (!host) return { balance: null, source: "tiktok_sem_host", raw: null, ilegivelMsg: "TIKTOK_API_HOST em falta" };
    const adv = c.selected_ad_account_id;
    const raw: any = {};
    // BCs a tentar: o guardado na ligação e os que o token vê.
    const bcIds = new Set<string>();
    if (c.oauth_meta?.bc_id) bcIds.add(String(c.oauth_meta.bc_id));
    const bcs = await tiktokGET<any>(host, "bc/get/", { page_size: "50" }, tok);
    raw.bc_get = scrub(bcs);
    if (bcs.ok) for (const b of bcs.data?.list ?? []) if (b?.bc_info?.bc_id) bcIds.add(String(b.bc_info.bc_id));
    for (const bc of bcIds) {
      const r = await tiktokGET<any>(host, "advertiser/balance/get/", { bc_id: bc, filtering: JSON.stringify({ advertiser_ids: [adv] }), page_size: "10" }, tok);
      raw[`balance_bc_${bc}`] = scrub(r);
      if (r.ok) {
        const row = (r.data?.advertiser_account_list ?? []).find((x: any) => String(x.advertiser_id) === adv);
        // Portfolio PARTILHADO: o saldo vive no portfolio, o account_balance do anunciante fica 0 mesmo a gastar.
        if (row && String(row.payment_portfolio_type ?? "").toUpperCase() === "SHARED") {
          return { balance: null, source: "tiktok_portfolio_partilhado", raw,
            ilegivelMsg: `Saldo TikTok ilegível: a conta usa o Payment Portfolio partilhado ${row.payment_portfolio_id ?? ""} (o saldo por anunciante vem 0)` };
        }
        const v = row?.account_balance ?? row?.valid_account_balance ?? row?.cash_balance;
        if (v !== undefined && v !== null && Number.isFinite(Number(v))) return { balance: Number(v), source: "tiktok_bc_balance", raw };
      }
    }
    const info = await tiktokGET<any>(host, "advertiser/info/", { advertiser_ids: JSON.stringify([adv]), fields: JSON.stringify(["balance", "status", "currency"]) }, tok);
    raw.advertiser_info = scrub(info);
    return { balance: null, source: "bc_sem_permissao", raw, ilegivelMsg: TIKTOK_ILEGIVEL };
  }
  if (c.platform === "meta") {
    const u = new URL(`${GRAPH}/${c.selected_ad_account_id}`);
    u.searchParams.set("fields", "funding_source_details,balance,amount_spent,spend_cap,account_status,disable_reason,currency,is_prepay_account");
    u.searchParams.set("access_token", tok);
    const r = await fetch(u); const body = await r.json().catch(() => null);
    const raw = scrub({ status: r.status, body });
    if (!r.ok || !body) return { balance: null, source: "meta_erro_api", raw, ilegivelMsg: `Meta API ${r.status}` };
    const accountProblem = Number(body.account_status) !== 1 ? `account_status ${body.account_status}, disable_reason ${body.disable_reason ?? 0}` : null;
    if (!body.is_prepay_account) return { balance: null, source: "postpaid_na", raw, accountProblem };
    const v = parseMetaDisplayBalance(body.funding_source_details?.display_string);
    if (v === null) return { balance: null, source: "meta_parse_falhou", raw, accountProblem, ilegivelMsg: "Saldo Meta ilegível (display_string não reconhecido)" };
    return { balance: v, source: "meta_funding_display_string", raw, accountProblem };
  }
  if (c.platform === "google") {
    try {
      const rows = await googleAdsSearch(await googleCtx(c),
        "SELECT account_budget.status, account_budget.approved_spending_limit_micros, account_budget.adjusted_spending_limit_micros, account_budget.amount_served_micros FROM account_budget WHERE account_budget.status = 'APPROVED'");
      const b = rows[0]?.accountBudget;
      const lim = Number(b?.adjustedSpendingLimitMicros ?? b?.approvedSpendingLimitMicros);
      if (b && Number.isFinite(lim)) return { balance: (lim - Number(b.amountServedMicros ?? 0)) / 1e6, source: "google_account_budget", raw: rows };
      return { balance: null, source: "postpaid_na", raw: rows };
    } catch (e) {
      return { balance: null, source: "postpaid_na", raw: { erro: String(e).slice(0, 500) } };
    }
  }
  return { balance: null, source: "plataforma_desconhecida", raw: null };
}

const label = (c: Conn) => `${c.platform === "tiktok" ? "TikTok" : c.platform === "meta" ? "Meta" : "Google"} ${c.selected_ad_account_id}`;

async function runBalance(admin: any, conns: Conn[]) {
  const today = ymd(new Date());
  const alerts: any[] = []; const out: any[] = [];
  for (const c of conns) {
    const tok = await token(admin, c);
    const b = await readBalance(c, tok);
    const a = await avg3d(admin, c, today);
    const daysLeft = b.balance !== null && a.avg > 0 ? b.balance / a.avg : null;
    const ccy = (c.selected_ad_account_currency ?? "").toUpperCase();
    await admin.schema("crm").from("artist_ads_balance_readings").insert({
      connection_id: c.id, company_id: c.company_id, artist_id: c.artist_id, platform: c.platform, account_id: c.selected_ad_account_id,
      currency: ccy, balance: b.balance, balance_source: b.source, avg_spend_3d: Number(a.avg.toFixed(2)),
      days_left: daysLeft === null ? null : Number(daysLeft.toFixed(2)), raw: { ...((b.raw && typeof b.raw === "object") ? { api: b.raw } : {}), avg_days: a.days },
    });
    const al = balanceAlert({ source: b.source, balance: b.balance, daysLeft, label: label(c), ccy, ilegivelMsg: b.ilegivelMsg });
    if (al) alerts.push({ connection_id: c.id, ...al, days_left: daysLeft === null ? null : Number(daysLeft.toFixed(2)) });
    out.push({ connection_id: c.id, conta: label(c), balance: b.balance, balance_source: b.source, avg_spend_3d: Number(a.avg.toFixed(2)), days_left: daysLeft, alerta: al?.kind ?? null });
  }
  const { data, error } = await admin.rpc("artist_ads_balance_alerts_apply", { p_scope: "balance", p_connections: conns.map((c) => c.id), p_alerts: alerts });
  return { leituras: out, aplicado: data, erro: error?.message ?? null };
}

// ---------------------------------------------------------------- entrega
async function accountTimezone(admin: any, c: Conn): Promise<string> {
  let tz: string | undefined;
  if (c.platform === 'google') {
    const rows = await googleAdsSearch(await googleCtx(c), 'SELECT customer.time_zone FROM customer LIMIT 1');
    tz = rows[0]?.customer?.timeZone;
  } else if (c.platform === 'meta') {
    const tok = await token(admin, c);
    const r = await fetch(`${GRAPH}/${c.selected_ad_account_id}?fields=timezone_name`, { headers: { Authorization: `Bearer ${tok}` } });
    const b = await r.json();
    if (r.ok && !b.error) tz = b.timezone_name;
  } else {
    const host = tiktokHost(); if (!host) throw new Error('tiktok_host_missing');
    const r = await tiktokGET<any>(host, 'advertiser/info/', { advertiser_ids: JSON.stringify([c.selected_ad_account_id]), fields: JSON.stringify(['timezone', 'display_timezone']) }, await token(admin, c));
    if (r.ok) tz = r.data?.list?.[0]?.timezone ?? r.data?.list?.[0]?.display_timezone;
  }
  if (!tz) throw new Error('account_timezone_missing');
  ymd(new Date(), tz); // validate IANA timezone before writes
  const { error } = await admin.schema('crm').from('ad_platform_connections').update({ oauth_meta: { ...c.oauth_meta, account_timezone: tz } }).eq('id', c.id);
  if (error) throw new Error('account_timezone_write_failed');
  return tz;
}
async function activeCampaigns(admin: any, c: Conn, tz: string, now: Date): Promise<string[]> {
  const crm = admin.schema("crm");
  const table = c.platform === 'google' ? 'google_campaign' : c.platform === 'meta' ? 'meta_campaign_snapshot' : 'tiktok_campaign_carreira';
  const camps: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await crm.from(table).select('*').eq('connection_id', c.id).order('id').range(offset, offset + 999);
    if (error) throw new Error('campaign_read_failed');
    camps.push(...data); if (data.length < 1000) break;
  }
  if (c.platform === 'tiktok') {
    const groups: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await crm.from('tiktok_adgroup').select('external_campaign_id,status,raw').eq('connection_id', c.id).order('id').range(offset, offset + 999);
      if (error) throw new Error('adgroup_read_failed');
      groups.push(...data); if (data.length < 1000) break;
    }
    return camps.filter(x => ['ENABLE','ACTIVE'].includes(String(x.status).toUpperCase()) && groups.some(g => g.external_campaign_id === x.external_campaign_id && campaignActive(g.status ?? '', timestampDay(g.raw?.schedule_start_time ?? null, tz, true), timestampDay(g.raw?.schedule_end_time ?? null, tz, true), tz, now))).map(x => x.external_campaign_id);
  }
  return camps.filter(x => campaignActive(x.effective_status ?? x.status ?? '', c.platform === 'meta' ? timestampDay(x.start_time, tz) : x.start_date, c.platform === 'meta' ? timestampDay(x.stop_time, tz) : x.end_date, tz, now)).map(x => x.external_campaign_id);
}

async function liveToday(c: Conn, tok: string, today: string): Promise<{ spend: number | null; status: any; problems: { account: string | null; ads: string | null; budget: string | null } }> {
  const problems = { account: null as string | null, ads: null as string | null, budget: null as string | null };
  try {
    if (c.platform === "tiktok") {
      const host = tiktokHost()!; const adv = c.selected_ad_account_id;
      const rep = await tiktokGET<any>(host, "report/integrated/get/", { advertiser_id: adv, report_type: "BASIC", data_level: "AUCTION_ADVERTISER",
        dimensions: JSON.stringify(["advertiser_id"]), metrics: JSON.stringify(["spend"]), start_date: today, end_date: today }, tok);
      const spend = rep.ok ? Number(rep.data?.list?.[0]?.metrics?.spend ?? 0) : null;
      const info = await tiktokGET<any>(host, "advertiser/info/", { advertiser_ids: JSON.stringify([adv]), fields: JSON.stringify(["status"]) }, tok);
      const st = info.ok ? info.data?.list?.[0]?.status : null;
      if (st && st !== "STATUS_ENABLE") problems.account = `status ${st}`;
      const g = await tiktokGET<any>(host, "adgroup/get/", { advertiser_id: adv, page_size: "200", fields: JSON.stringify(["adgroup_id", "secondary_status", "operation_status"]) }, tok);
      const secs: string[] = g.ok ? (g.data?.list ?? []).filter((x: any) => x.operation_status === "ENABLE").map((x: any) => String(x.secondary_status ?? "")) : [];
      if (secs.some((s) => /BALANCE_EXCEED|BALANCE_INSUFFICIENT/.test(s))) problems.account = problems.account ?? "saldo insuficiente (adgroup BALANCE_EXCEED)";
      const rej = secs.filter((s) => /REJECT|NOT_PASS|AUDIT|REVIEW/.test(s));
      if (rej.length) problems.ads = [...new Set(rej)].join(", ");
      const bud = secs.filter((s) => /CAMPAIGN_EXCEED|BUDGET_EXCEED|ADGROUP_EXCEED/.test(s));
      if (bud.length) problems.budget = [...new Set(bud)].join(", ");
      return { spend, status: { advertiser_status: st, adgroups: secs }, problems };
    }
    if (c.platform === "meta") {
      const u = new URL(`${GRAPH}/${c.selected_ad_account_id}`);
      u.searchParams.set("fields", "account_status,disable_reason,insights.date_preset(today){spend}");
      u.searchParams.set("access_token", tok);
      const r = await fetch(u); const b = await r.json().catch(() => null);
      if (!r.ok || !b) return { spend: null, status: { http: r.status }, problems };
      if (Number(b.account_status) !== 1) problems.account = `account_status ${b.account_status}, disable_reason ${b.disable_reason ?? 0}`;
      const ua = new URL(`${GRAPH}/${c.selected_ad_account_id}/ads`);
      ua.searchParams.set("fields", "effective_status"); ua.searchParams.set("limit", "200");
      ua.searchParams.set("filtering", JSON.stringify([{ field: "effective_status", operator: "IN", value: ["DISAPPROVED", "PENDING_REVIEW", "WITH_ISSUES"] }]));
      ua.searchParams.set("access_token", tok);
      const ra = await fetch(ua); const ba = await ra.json().catch(() => null);
      const n = ra.ok ? (ba?.data ?? []).length : 0;
      if (n) problems.ads = `${n} anúncio(s) rejeitado(s)/em revisão`;
      return { spend: Number(b.insights?.data?.[0]?.spend ?? 0), status: { account_status: b.account_status }, problems };
    }
    const rows = await googleAdsSearch(await googleCtx(c), "SELECT metrics.cost_micros FROM customer WHERE segments.date DURING TODAY");
    return { spend: rows.reduce((a, r) => a + Number(r.metrics?.costMicros ?? 0), 0) / 1e6, status: null, problems };
  } catch (e) {
    return { spend: null, status: { erro: String(e).slice(0, 300) }, problems };
  }
}

async function runDelivery(admin: any, conns: Conn[]) {
  const now = new Date();
  const alerts: any[] = []; const out: any[] = []; const evaluated: string[] = [];
  for (const c of conns) {
    const tz = await accountTimezone(admin, c);
    const today = ymd(now, tz); const frac = dayFraction(now, tz);
    const nAct = await activeCampaigns(admin, c, tz, now);
    if (!nAct.length) { evaluated.push(c.id); out.push({ conta: label(c), sem_campanhas_activas: true }); continue; }
    const tok = await token(admin, c);
    const live = await liveToday(c, tok, today);
    let spend = live.spend; let fonte = "api_hoje";
    if (spend === null) {
      const s = await dailySpend(admin, c, today, today); spend = s[today] ?? null; fonte = "insights_gravados";
      if (spend === null) { out.push({ conta: label(c), ignorado: "sem gasto de hoje legível", live: scrubber(tok)(live.status) }); continue; }
    }
    evaluated.push(c.id);
    const a = await avg3d(admin, c, today, nAct);
    const d = deliveryStopped({ spendToday: spend, avg3d: a.avg, frac });
    const { data: lastR } = await admin.schema("crm").from("artist_ads_balance_readings").select("balance, days_left, read_at")
      .eq("connection_id", c.id).gte("read_at", new Date(now.getTime() - 13 * 3600e3).toISOString()).order("read_at", { ascending: false }).limit(1);
    const lr = lastR?.[0];
    const balanceCritical = !!lr && lr.balance !== null && (Number(lr.balance) <= 0 || (lr.days_left !== null && Number(lr.days_left) < 1));
    const cause = pickCause({ balanceCritical: balanceCritical || /saldo insuficiente/.test(live.problems.account ?? ""),
      accountProblem: live.problems.account, adsRejectedOrReview: live.problems.ads, budgetExhausted: live.problems.budget });
    const ccy = (c.selected_ad_account_currency ?? "").toUpperCase();
    if (d.stopped) {
      alerts.push({ connection_id: c.id, kind: "entrega_parada", severity: "alta",
        message: `${label(c)}: entrega parada — gasto hoje ${spend.toFixed(2)} ${ccy} vs ${d.expected.toFixed(2)} ${ccy} esperados até agora (média 3 dias ${a.avg.toFixed(2)}). Causa provável: ${cause}.`,
        days_left: lr?.days_left ?? null });
    }
    out.push({ conta: label(c), fonte, gasto_hoje: spend, esperado: Number(d.expected.toFixed(2)), media_3d: Number(a.avg.toFixed(2)), parada: d.stopped, causa: d.stopped ? cause : null, estado: scrubber(tok)(live.status) });
  }
  const { data, error } = await admin.rpc("artist_ads_balance_alerts_apply", { p_scope: "delivery", p_connections: evaluated, p_alerts: alerts });
  return { contas: out, aplicado: data, erro: error?.message ?? null };
}

// ---------------------------------------------------------------- simulação (sem escrita)
async function runSimulate(admin: any, c: Conn, body: any) {
  const day: string = body.date; const hours: number[] = body.hours ?? [10, 13, 17];
  const bal: number | null = body.balance_override ?? null;
  const ccy = (c.selected_ad_account_currency ?? "").toUpperCase();
  // Leitura de saldo das 21:00 de Fortaleza da véspera: média dos 3 dias completos anteriores à véspera.
  const prev = addDays(day, -1);
  const aPrev = await avg3d(admin, c, prev);
  const dlPrev = bal !== null && aPrev.avg > 0 ? bal / aPrev.avg : null;
  const balPrev = balanceAlert({ source: "simulacao", balance: bal, daysLeft: dlPrev, label: label(c), ccy, ilegivelMsg: TIKTOK_ILEGIVEL });
  const a = await avg3d(admin, c, day);
  const s = await dailySpend(admin, c, day, day);
  const dayTotal = s[day] ?? 0;
  const { data: groups } = await admin.schema("crm").from("tiktok_adgroup").select("status, raw").eq("connection_id", c.id);
  const secs = (groups ?? []).filter((g: any) => String(g.status).toUpperCase() === "ENABLE").map((g: any) => String(g.raw?.secondary_status ?? ""));
  const bud = [...new Set(secs.filter((x: string) => /CAMPAIGN_EXCEED|BUDGET_EXCEED|ADGROUP_EXCEED/.test(x)))].join(", ") || null;
  const checks = hours.map((h) => {
    const frac = h / 24;
    const d = deliveryStopped({ spendToday: dayTotal, avg3d: a.avg, frac });
    return { hora_fortaleza: `${String(h).padStart(2, "0")}:00`, gasto_ate_hora_max: dayTotal, esperado: Number(d.expected.toFixed(2)), parada: d.stopped,
      causa_cenario_saldo0: pickCause({ balanceCritical: bal !== null && bal <= 0, accountProblem: null, adsRejectedOrReview: null, budgetExhausted: bud }),
      causa_sem_leitura_saldo: pickCause({ balanceCritical: false, accountProblem: null, adsRejectedOrReview: null, budgetExhausted: bud }) };
  });
  return {
    conta: label(c), dia: day,
    leitura_saldo_vespera_21h: { dias_media: aPrev.days, avg_spend_3d: Number(aPrev.avg.toFixed(2)), saldo_usado: bal, days_left: dlPrev, alerta: balPrev?.kind ?? null },
    entrega: { dias_media: a.days, media_3d: Number(a.avg.toFixed(2)), gasto_total_do_dia: dayTotal, estados_adgroup_gravados: secs, verificacoes: checks },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!(await isServiceRoleRequest(req))) return json({ error: "service_role_only" }, 403);
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode;
  if (!["balance", "delivery", "simulate"].includes(mode)) return json({ error: "mode: balance | delivery | simulate" }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let q = (admin as any).schema("crm").from("ad_platform_connections")
    .select("id, platform, selected_ad_account_id, selected_ad_account_currency, login_customer_id, artist_id, company_id, oauth_meta")
    .eq("connection_scope", "artist").eq("status", "active").not("artist_id", "is", null).not("selected_ad_account_id", "is", null);
  if (typeof body.connection_id === "string") q = q.eq("id", body.connection_id);
  const { data: conns, error } = await q;
  if (error) return json({ error: error.message }, 500);
  try {
    if (mode === "simulate") {
      if (!conns?.[0] || typeof body.date !== "string") return json({ error: "connection_id + date" }, 400);
      return json({ ok: true, mode, simulacao: await runSimulate(admin, conns[0], body) });
    }
    const res = mode === "balance" ? await runBalance(admin, conns ?? []) : await runDelivery(admin, conns ?? []);
    return json({ ok: true, mode, ...res });
  } catch (e) {
    console.error("artist-ads-balance-check", e);
    return json({ ok: false, error: String(e).slice(0, 500) }, 500);
  }
});
