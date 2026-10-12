// D-ERP237 (aceite 2026-10-12).
// Muda o orçamento DIÁRIO de uma campanha / adset / adgroup de artista, depois de o
// utilizador confirmar no front. O clique é a aprovação. Só admin da empresa
// (ou platform_admin); nunca service role vinda do browser.
//
// Fluxo: valida → reserva request_id (idempotência) → lê na plataforma → valida teto
// (crm.artist_ads_budget_caps via artist_ads_budget_cap_get) e role_budget_limits →
// escreve → volta a ler → grava antes/depois confirmados → devolve.
// dry_run=true: lê e valida, não escreve na plataforma (o registo fica status='dry_run').
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertCallerRoleInCompany, isServiceRoleRequest, corsHeaders, jsonResponse } from "../_shared/multiTenant.ts";
import { tiktokHost, tiktokPOST, tiktokGET, loadTikTokConnection } from "../_shared/tiktok-ads.ts";
import { getGoogleAdsAccessToken, googleAdsPost, googleAdsSearch, mensagemErroGoogle, type GoogleAdsCtx } from "../_shared/google-ads.ts";
import { GRAPH } from "../_shared/artist-meta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const DEV_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
const LOGIN_CID_FALLBACK = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "";

type Platform = "meta" | "tiktok" | "google";
type Level = "campaign" | "adset" | "adgroup";
type Read = { daily: number | null; mode: string; name: string | null; raw: unknown };
class Refuse extends Error { constructor(public code: string, msg: string, public status = 422) { super(msg); } }

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  // Nunca service role: esta função só serve cliques de utilizadores.
  if (await isServiceRoleRequest(req)) return jsonResponse({ ok: false, error: "service_role_recusada" }, 403);

  let b: any;
  try { b = await req.json(); } catch { return jsonResponse({ ok: false, error: "invalid_json" }, 400); }
  // Só leitura: verifica permissões de escrita do token (sem escrever nada, sem expor o token).
  if (b?.action === "check_permissions") return await checkPermissions(req, String(b?.connection_id ?? ""));
  const platform = b?.platform as Platform;
  const level = b?.level as Level;
  const externalId = String(b?.external_id ?? "").trim();
  const newDaily = Number(b?.new_daily_budget);
  const currency = String(b?.currency ?? "").toUpperCase();
  const reason = String(b?.reason ?? "").trim();
  const requestId = String(b?.request_id ?? "");
  const dryRun = b?.dry_run === true;
  const bad: string[] = [];
  if (!UUID.test(String(b?.connection_id ?? ""))) bad.push("connection_id");
  if (!["meta", "tiktok", "google"].includes(platform)) bad.push("platform");
  if (!["campaign", "adset", "adgroup"].includes(level)) bad.push("level");
  if (!/^[0-9A-Za-z_]{3,40}$/.test(externalId)) bad.push("external_id");
  if (!Number.isFinite(newDaily) || newDaily <= 0 || newDaily > 1e6) bad.push("new_daily_budget");
  if (!/^[A-Z]{3}$/.test(currency)) bad.push("currency");
  if (reason.length < 3 || reason.length > 500) bad.push("reason");
  if (!UUID.test(requestId)) bad.push("request_id");
  if (platform === "meta" && level === "adgroup") bad.push("level (Meta usa adset)");
  if (platform !== "meta" && level === "adset") bad.push("level (TikTok/Google usam adgroup)");
  if (platform === "google" && level !== "campaign") bad.push("level (Google: só campaign)");
  if (bad.length) return jsonResponse({ ok: false, error: "invalid_input", fields: bad }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: conn } = await (admin as any).schema("crm").from("ad_platform_connections")
    .select("id, company_id, platform, status, artist_id, selected_ad_account_id, selected_ad_account_currency, login_customer_id")
    .eq("id", b.connection_id).maybeSingle();
  if (!conn) return jsonResponse({ ok: false, error: "ligacao_nao_encontrada" }, 404);
  if (conn.platform !== platform) return jsonResponse({ ok: false, error: "plataforma_diferente_da_ligacao" }, 422);
  if (!conn.artist_id) return jsonResponse({ ok: false, error: "ligacao_sem_artista" }, 422);

  let ctx;
  try { ctx = await assertCallerRoleInCompany(req, conn.company_id, ["admin"]); }
  catch (e) { return jsonResponse({ ok: false, error: "sem_permissao", message: (e as Error).message }, 403); }
  const userId = ctx.caller.id;

  const accountCurrency = String(conn.selected_ad_account_currency ?? "").toUpperCase();
  if (accountCurrency && currency !== accountCurrency) {
    return jsonResponse({ ok: false, error: "moeda_diferente_da_conta", account_currency: accountCurrency }, 422);
  }

  // ── Idempotência: reserva o request_id ANTES de tocar na plataforma ──
  const log = (admin as any).schema("crm").from("artist_ads_budget_changes");
  const { data: prev } = await log.select("*").eq("company_id", conn.company_id).eq("request_id", requestId).maybeSingle();
  if (prev) return jsonResponse({ ok: prev.status === "applied" || prev.status === "dry_run", idempotent_replay: true, change: prev });
  const { data: row, error: insErr } = await log.insert({
    company_id: conn.company_id, artist_id: conn.artist_id, connection_id: conn.id, platform, level,
    external_id: externalId, ad_account_id: conn.selected_ad_account_id, currency,
    requested_daily_budget: newDaily, reason, request_id: requestId, requested_by: userId,
    status: "pending", dry_run: dryRun,
  }).select("id").single();
  if (insErr) {
    if (insErr.code === "23505") {
      const { data: again } = await log.select("*").eq("company_id", conn.company_id).eq("request_id", requestId).maybeSingle();
      return jsonResponse({ ok: false, idempotent_replay: true, change: again }, 409);
    }
    return jsonResponse({ ok: false, error: "auditoria_falhou", message: insErr.message }, 500);
  }
  const finish = async (patch: Record<string, unknown>) => {
    await log.update({ ...patch, finished_at: new Date().toISOString() }).eq("id", row.id);
    const { data } = await log.select("*").eq("id", row.id).single();
    return data;
  };

  try {
    // Teto do artista (crm.artist_ads_budget_caps) — mesma RPC do motor (D-ERP95).
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false },
    });
    const { data: caps, error: capErr } = await userClient.rpc("artist_ads_budget_cap_get", { p_artist_id: conn.artist_id });
    if (capErr) throw new Refuse("teto_query_falhou", capErr.message, 500);
    const cap = ((caps ?? []) as any[]).find((r) => r.platform === platform && String(r.connection_id) === conn.id);
    if (!cap || cap.has_cap !== true) throw new Refuse("sem_teto", "Esta ligação não tem teto diário definido. Define o teto antes de alterar orçamentos.");
    if (String(cap.cap_currency ?? "").toUpperCase() !== currency) throw new Refuse("moeda_do_teto_diferente", `O teto está em ${cap.cap_currency}.`);
    // Teto validado ANTES de tocar na plataforma.
    const adapter = await makeAdapter(admin, conn, platform, level, externalId);
    const before = await adapter.read();
    if (before.mode !== "DAILY") throw new Refuse("orcamento_nao_diario", `O orçamento desta entidade não é diário (${before.mode}). Não é alterado por aqui.`);
    if (before.daily == null) throw new Refuse("sem_orcamento_neste_nivel", "Esta entidade não tem orçamento próprio (está no nível acima, ex.: CBO na campanha).");

    const capVal = Number(cap.daily_cap);
    const committed = cap.committed_daily == null ? null : Number(cap.committed_daily);
    const projected = committed == null ? newDaily : committed - before.daily + newDaily;
    if (newDaily > capVal + 1e-9 || projected > capVal + 1e-9) {
      throw new Refuse("acima_do_teto", `Acima do teto diário (${capVal} ${currency}). Comprometido depois da mudança: ${projected.toFixed(2)}.`);
    }
    // role_budget_limits (€/dia) — só comparável em EUR; admin/platform_admin = sem limite.
    const { data: roleCap } = await userClient.rpc("get_user_max_daily_budget_eur", { _user_id: userId });
    if (currency === "EUR" && roleCap !== null && roleCap !== undefined) {
      if (Number(roleCap) === 0 || newDaily > Number(roleCap)) throw new Refuse("acima_do_limite_do_papel", `O teu papel permite até ${roleCap} €/dia.`, 403);
    }

    if (dryRun) {
      const c = await finish({ status: "dry_run", before_daily_budget: before.daily, cap_daily: capVal, committed_daily: committed, platform_response: before.raw });
      return jsonResponse({ ok: true, dry_run: true, change: c, before: before.daily, after_planned: newDaily, cap: capVal, committed_after: projected });
    }

    const resp = await adapter.write(newDaily);
    const after = await adapter.read();
    const confirmed = after.daily != null && Math.abs(after.daily - newDaily) < 0.01;
    const c = await finish({
      status: confirmed ? "applied" : "unconfirmed",
      before_daily_budget: before.daily, after_daily_budget: after.daily, entity_name: after.name ?? before.name,
      cap_daily: capVal, committed_daily: committed, platform_response: { write: resp, read_after: after.raw },
      error_message: confirmed ? null : "A plataforma aceitou o pedido mas a releitura não mostra o novo valor.",
    });
    return jsonResponse({ ok: confirmed, change: c, before: before.daily, after: after.daily });
  } catch (e) {
    const refuse = e instanceof Refuse;
    const msg = refuse ? e.message : mensagemErroGoogle((e as any)?.raw ?? (e as Error).message);
    const c = await finish({ status: refuse ? "refused" : "failed", error_code: refuse ? (e as Refuse).code : "erro_plataforma", error_message: msg, platform_response: (e as any)?.raw ?? null });
    return jsonResponse({ ok: false, error: refuse ? (e as Refuse).code : "erro_plataforma", message: msg, change: c }, refuse ? (e as Refuse).status : 502);
  }
});

async function makeAdapter(admin: SupabaseClient, conn: any, platform: Platform, level: Level, id: string) {
  if (platform === "meta") {
    const { data: rows } = await (admin as any).rpc("crm_get_meta_decrypted_token", { p_connection_id: conn.id, p_master_key: MASTER_KEY });
    const token = Array.isArray(rows) && rows[0]?.access_token;
    if (!token) throw new Refuse("token_meta_indecifravel", "Não foi possível ler o token Meta da ligação.");
    return {
      async read(): Promise<Read> {
        const r = await fetch(`${GRAPH}/${id}?fields=name,daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`);
        const j: any = await r.json();
        if (!r.ok) throw Object.assign(new Error(j?.error?.message ?? `HTTP ${r.status}`), { raw: j });
        const life = Number(j.lifetime_budget ?? 0);
        const daily = j.daily_budget ? Number(j.daily_budget) / 100 : null; // cêntimos → unidades
        return { daily, mode: life > 0 ? "LIFETIME" : "DAILY", name: j.name ?? null, raw: j };
      },
      async write(v: number) {
        const r = await fetch(`${GRAPH}/${id}`, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ daily_budget: String(Math.round(v * 100)), access_token: token }),
        });
        const j: any = await r.json();
        if (!r.ok || j?.success === false) throw Object.assign(new Error(j?.error?.message ?? `HTTP ${r.status}`), { raw: j });
        return j;
      },
    };
  }

  if (platform === "tiktok") {
    const host = tiktokHost();
    if (!host) throw new Refuse("tiktok_host_em_falta", "TIKTOK_API_HOST não configurado.", 500);
    const c = await loadTikTokConnection(admin, { connectionId: conn.id, masterKey: MASTER_KEY, exigirToken: true });
    if (!c.ok) throw new Refuse(c.error, c.message, c.status);
    const adv = c.advertiserId, tok = c.accessToken!;
    const kind = level === "campaign" ? "campaign" : "adgroup";
    const idField = `${kind}_ids`;
    let smartPlus = false;
    const get = async (sp: boolean) => {
      const path = sp ? `smart_plus/${kind}/get/` : `${kind}/get/`;
      const r = await tiktokGET(host, path, { advertiser_id: adv, filtering: JSON.stringify({ [idField]: [id] }) } as any, tok);
      if (!r.ok) throw Object.assign(new Error(r.message), { raw: r.raw });
      return ((r.data as any)?.list ?? [])[0] ?? null;
    };
    return {
      async read(): Promise<Read> {
        let it = await get(smartPlus);
        if (!it && !smartPlus) { smartPlus = true; it = await get(true); }
        if (!it) throw new Refuse("entidade_nao_encontrada", "A TikTok não devolveu esta entidade nesta conta.", 404);
        const mode = String(it.budget_mode ?? "");
        return {
          daily: it.budget == null ? null : Number(it.budget),
          mode: mode === "BUDGET_MODE_DAY" || mode === "BUDGET_MODE_DYNAMIC_DAILY_BUDGET" ? "DAILY" : mode || "UNKNOWN",
          name: it[`${kind}_name`] ?? null, raw: { smart_plus: smartPlus, item: it },
        };
      },
      async write(v: number) {
        // Smart+: /smart_plus/adgroup/budget/update/ e /smart_plus/campaign/update/.
        // Normal: /adgroup/budget/update/ e /campaign/update/.
        const path = kind === "adgroup"
          ? (smartPlus ? "smart_plus/adgroup/budget/update/" : "adgroup/budget/update/")
          : (smartPlus ? "smart_plus/campaign/update/" : "campaign/update/");
        const body = kind === "adgroup"
          ? { advertiser_id: adv, budget: [{ adgroup_id: id, budget: v }] }
          : { advertiser_id: adv, campaign_id: id, budget: v };
        const r = await tiktokPOST(host, path, body, tok);
        if (!r.ok) throw Object.assign(new Error(r.message), { raw: r.raw });
        return r.data;
      },
    };
  }

  // Google — só campanha; orçamento DAILY e não partilhado.
  const ctx: GoogleAdsCtx = {
    accessToken: await getGoogleAdsAccessToken(), developerToken: DEV_TOKEN,
    loginCustomerId: String(conn.login_customer_id || LOGIN_CID_FALLBACK).replace(/-/g, ""),
    customerId: String(conn.selected_ad_account_id ?? "").replace(/-/g, ""),
  };
  let budgetRes = "";
  return {
    async read(): Promise<Read> {
      const rows = await googleAdsSearch(ctx,
        `SELECT campaign.name, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.period, ` +
        `campaign_budget.total_amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.id = ${id}`);
      const r = rows[0];
      if (!r) throw new Refuse("entidade_nao_encontrada", "O Google não devolveu esta campanha nesta conta.", 404);
      const bud = r.campaignBudget ?? {};
      if (bud.explicitlyShared) throw new Refuse("orcamento_partilhado", "O orçamento é partilhado com outras campanhas — mudá-lo afecta todas. Não é alterado por aqui.");
      budgetRes = bud.resourceName;
      const total = bud.totalAmountMicros != null && Number(bud.totalAmountMicros) > 0;
      return {
        daily: bud.amountMicros == null ? null : Number(bud.amountMicros) / 1e6,
        mode: total ? "TOTAL" : String(bud.period ?? "DAILY"), name: r.campaign?.name ?? null, raw: r,
      };
    },
    async write(v: number) {
      return await googleAdsPost(ctx, `/customers/${ctx.customerId}/campaignBudgets:mutate`, {
        operations: [{ update: { resourceName: budgetRes, amountMicros: String(Math.round(v * 100) * 10000) }, updateMask: "amount_micros" }],
      });
    },
  };
}

async function checkPermissions(req: Request, connectionId: string) {
  if (!UUID.test(connectionId)) return jsonResponse({ ok: false, error: "invalid_input", fields: ["connection_id"] }, 400);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: conn } = await (admin as any).schema("crm").from("ad_platform_connections")
    .select("id, company_id, platform, selected_ad_account_id, scopes").eq("id", connectionId).maybeSingle();
  if (!conn) return jsonResponse({ ok: false, error: "ligacao_nao_encontrada" }, 404);
  try { await assertCallerRoleInCompany(req, conn.company_id, ["admin"]); }
  catch (e) { return jsonResponse({ ok: false, error: "sem_permissao", message: (e as Error).message }, 403); }
  if (conn.platform === "meta") {
    const { data: rows } = await (admin as any).rpc("crm_get_meta_decrypted_token", { p_connection_id: conn.id, p_master_key: MASTER_KEY });
    const token = Array.isArray(rows) && rows[0]?.access_token;
    if (!token) return jsonResponse({ ok: false, error: "token_meta_indecifravel" }, 422);
    const d: any = await (await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`)).json();
    const acc: any = await (await fetch(`${GRAPH}/${conn.selected_ad_account_id}?fields=name,currency,account_status,user_tasks&access_token=${encodeURIComponent(token)}`)).json();
    const scopes: string[] = d?.data?.scopes ?? [];
    const gs = (d?.data?.granular_scopes ?? []).find((g: any) => g.scope === "ads_management");
    return jsonResponse({ ok: true, platform: "meta", ad_account: conn.selected_ad_account_id,
      token: { type: d?.data?.type ?? null, is_valid: d?.data?.is_valid ?? null, expires_at: d?.data?.expires_at ?? null, scopes, error: d?.error?.message ?? null },
      ads_management: scopes.includes("ads_management"), ads_management_targets: gs?.target_ids ?? null,
      account: { name: acc?.name ?? null, currency: acc?.currency ?? null, status: acc?.account_status ?? null, user_tasks: acc?.user_tasks ?? null, error: acc?.error?.message ?? null },
      can_write: scopes.includes("ads_management") && Array.isArray(acc?.user_tasks) && (acc.user_tasks.includes("MANAGE") || acc.user_tasks.includes("ADVERTISE")) });
  }
  if (conn.platform === "tiktok") {
    const host = tiktokHost();
    const c = await loadTikTokConnection(admin, { connectionId: conn.id, masterKey: MASTER_KEY, exigirToken: true });
    if (!c.ok || !host) return jsonResponse({ ok: false, error: c.ok ? "tiktok_host_em_falta" : c.error }, 422);
    const info = await tiktokGET<any>(host, "advertiser/info/", { advertiser_ids: JSON.stringify([c.advertiserId]), fields: JSON.stringify(["name", "currency", "status", "role"]) } as any, c.accessToken!);
    const it = ((info.data as any)?.list ?? [])[0] ?? null;
    return jsonResponse({ ok: info.ok, platform: "tiktok", advertiser_id: c.advertiserId, stored_scopes: conn.scopes ?? null,
      advertiser: it, error: info.ok ? null : info.message });
  }
  return jsonResponse({ ok: false, error: "so_meta_ou_tiktok" }, 422);
}
