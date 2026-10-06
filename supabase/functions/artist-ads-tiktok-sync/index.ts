// artist-ads-tiktok-sync — D-ERP178. Sync TikTok Marketing API (só GET) para as
// MESMAS tabelas da leitura manual D-ERP144 (crm.tiktok_campaign / tiktok_adgroup /
// tiktok_insights_daily), com source 'api'. 'api' prevalece sobre 'manual' na mesma
// chave (connection, level, external_id, dia); histórico manual não é apagado.
// verify_jwt = true; ADS_ROLES ou service_role (all só service_role). Nunca imprime o token.
import { adminClient, authorize, corsHeaders, json } from "../_shared/artist-meta.ts";
import { ADS_ROLES } from "../_shared/artist-ads.ts";
import { loadTikTokConnection, tiktokGET, tiktokHost } from "../_shared/tiktok-ads.ts";
import { deduceTriggerSource, finishSyncRun, resolveStatus, startSyncRun } from "../_shared/sync-run.ts";

const FN = "artist-ads-tiktok-sync";
const METRICS = [
  "spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "video_play_actions",
  "video_watched_2s", "video_watched_6s", "video_views_p25", "video_views_p50", "video_views_p75",
  "video_views_p100", "average_video_play", "likes", "comments", "shares", "follows",
  "profile_visits", "conversion", "cost_per_conversion",
];

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const int = (v: unknown) => { const n = num(v); return n === null ? null : Math.round(n); };
function dayInTz(tz: string, offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  catch { return d.toISOString().slice(0, 10); }
}
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

async function pageAll(host: string, path: string, params: Record<string, string>, tok: string, counter: { calls: number }) {
  const out: any[] = []; let page = 1;
  for (;;) {
    counter.calls++;
    const r = await tiktokGET<any>(host, path, { ...params, page: String(page), page_size: params.page_size ?? "100" }, tok);
    if (!r.ok) return { ok: false as const, error: `${path}: ${r.message} (code ${r.code})`, list: out };
    out.push(...(r.data?.list ?? []));
    const tp = Number(r.data?.page_info?.total_page ?? 1);
    if (page >= tp || page >= 50) break;
    page++;
  }
  return { ok: true as const, list: out };
}

async function syncOne(admin: any, connectionId: string, opts: { days: number; since?: string; dryRun: boolean }) {
  const host = tiktokHost();
  if (!host) return { ok: false, error: "secret TIKTOK_API_HOST em falta" };
  const conn = await loadTikTokConnection(admin, { connectionId, masterKey: Deno.env.get("ENCRYPTION_MASTER_KEY")!, exigirToken: true });
  if (!conn.ok) return { ok: false, error: `${conn.error}: ${conn.message}` };
  if (conn.status !== "active") return { ok: false, error: `ligação não activa (${conn.status})` };
  const tok = conn.accessToken!; const adv = conn.advertiserId; const currency = conn.moedaConta;
  const c = { calls: 0 };
  const { data: cRow } = await admin.schema("crm").from("ad_platform_connections").select("company_id, artist_id").eq("id", connectionId).single();

  c.calls++;
  const info = await tiktokGET<any>(host, "advertiser/info/", { advertiser_ids: JSON.stringify([adv]), fields: JSON.stringify(["name", "currency", "timezone", "display_timezone"]) }, tok);
  const ai = info.ok ? (info.data?.list ?? [])[0] ?? {} : {};
  const tz = ai.timezone ?? ai.display_timezone ?? "UTC";

  const camps = await pageAll(host, "campaign/get/", { advertiser_id: adv }, tok, c);
  if (!camps.ok) return { ok: false, error: camps.error, api_calls: c.calls };
  const groups = await pageAll(host, "adgroup/get/", { advertiser_id: adv }, tok, c);
  if (!groups.ok) return { ok: false, error: groups.error, api_calls: c.calls };
  const ads = await pageAll(host, "ad/get/", { advertiser_id: adv }, tok, c);
  if (!ads.ok) return { ok: false, error: ads.error, api_calls: c.calls };

  // Métricas aceites: tenta todas; se recusar, testa uma a uma.
  const end = dayInTz(tz, 0);
  const start = opts.since ?? addDays(end, -(opts.days - 1));
  const repBase = { advertiser_id: adv, report_type: "BASIC", data_level: "AUCTION_AD", dimensions: JSON.stringify(["ad_id", "stat_time_day"]) };
  let accepted = [...METRICS]; const refused: Record<string, string> = {};
  c.calls++;
  const probe = await tiktokGET<any>(host, "report/integrated/get/", { ...repBase, metrics: JSON.stringify(accepted), start_date: end, end_date: end, page_size: "1" }, tok);
  if (!probe.ok) {
    accepted = [];
    for (const m of METRICS) {
      c.calls++;
      const r = await tiktokGET<any>(host, "report/integrated/get/", { ...repBase, metrics: JSON.stringify([m]), start_date: end, end_date: end, page_size: "1" }, tok);
      if (r.ok) accepted.push(m); else refused[m] = r.message;
    }
  }
  // Relatório em janelas de 30 dias (limite da API).
  const rep: any[] = [];
  for (let s = start; s <= end; s = addDays(s, 30)) {
    const e = addDays(s, 29) < end ? addDays(s, 29) : end;
    const r = await pageAll(host, "report/integrated/get/", { ...repBase, metrics: JSON.stringify(accepted), start_date: s, end_date: e, page_size: "1000" }, tok, c);
    if (!r.ok) return { ok: false, error: r.error, api_calls: c.calls };
    rep.push(...r.list);
  }

  // Mapeamento música: mesmo critério da manual (song_id da campanha manual de nome igual).
  const { data: manualCamps } = await admin.schema("crm").from("tiktok_campaign")
    .select("external_campaign_id, name, linked_song_id, linked_song_locked, source").eq("connection_id", connectionId);
  const byName = new Map<string, any>(); const existing = new Map<string, any>();
  for (const m of manualCamps ?? []) { existing.set(m.external_campaign_id, m); if (m.source === "manual") byName.set(String(m.name).trim(), m); }
  const naoMapeadas: string[] = [];
  const now = new Date().toISOString();

  const campRows = camps.list.map((x: any) => {
    const ex = existing.get(String(x.campaign_id)); const man = byName.get(String(x.campaign_name ?? "").trim());
    const song = ex?.linked_song_id ?? man?.linked_song_id ?? null;
    if (!song) naoMapeadas.push(`${x.campaign_id} ${x.campaign_name}`);
    return {
      company_id: cRow.company_id, connection_id: connectionId, external_campaign_id: String(x.campaign_id),
      name: x.campaign_name, status: x.operation_status ?? x.secondary_status ?? null, objective: x.objective_type ?? null,
      budget_cents: num(x.budget) !== null ? Math.round(Number(x.budget) * 100) : null, currency,
      linked_song_id: song, linked_song_locked: ex?.linked_song_locked ?? (man ? true : false),
      source: "api", last_synced_at: now,
      raw: { operation_status: x.operation_status, secondary_status: x.secondary_status, objective_type: x.objective_type, budget: x.budget, budget_mode: x.budget_mode, create_time: x.create_time },
    };
  });
  const adsByGroup = new Map<string, any[]>(); const adToGroup = new Map<string, { g: string; c: string }>();
  for (const a of ads.list) {
    adToGroup.set(String(a.ad_id), { g: String(a.adgroup_id), c: String(a.campaign_id) });
    const arr = adsByGroup.get(String(a.adgroup_id)) ?? [];
    arr.push({ ad_id: String(a.ad_id), name: a.ad_name, operation_status: a.operation_status, secondary_status: a.secondary_status });
    adsByGroup.set(String(a.adgroup_id), arr);
  }
  const grpRows = groups.list.map((g: any) => ({
    company_id: cRow.company_id, connection_id: connectionId, external_campaign_id: String(g.campaign_id),
    external_adgroup_id: String(g.adgroup_id), name: g.adgroup_name, status: g.operation_status ?? g.secondary_status ?? null,
    budget_cents: num(g.budget) !== null ? Math.round(Number(g.budget) * 100) : null, currency, source: "api", last_synced_at: now,
    raw: {
      operation_status: g.operation_status, secondary_status: g.secondary_status, optimization_goal: g.optimization_goal,
      billing_event: g.billing_event, budget: g.budget, budget_mode: g.budget_mode, schedule_start_time: g.schedule_start_time,
      schedule_end_time: g.schedule_end_time, placements: g.placements, placement_type: g.placement_type, ads: adsByGroup.get(String(g.adgroup_id)) ?? [],
    },
  }));

  // Diário: nível 'ad' (detalhe) + 'adgroup' (o que os relatórios somam, igual à manual).
  type Acc = Record<string, number>;
  const adDays: any[] = []; const grpAgg = new Map<string, { g: string; c: string; d: string; m: Acc }>();
  const semGrupo: string[] = [];
  for (const r of rep) {
    const adId = String(r.dimensions?.ad_id); const d = String(r.dimensions?.stat_time_day ?? "").slice(0, 10);
    const m = r.metrics ?? {}; const map = adToGroup.get(adId);
    if (!map) { semGrupo.push(adId); continue; }
    const row = (lvl: string, ext: string, mm: any) => ({
      company_id: cRow.company_id, connection_id: connectionId, level: lvl, external_id: ext, external_campaign_id: map.c,
      date_start: d, spend_cents: num(mm.spend) === null ? null : Math.round(Number(mm.spend) * 100),
      impressions: int(mm.impressions), clicks: int(mm.clicks), video_views_6s: int(mm.video_watched_6s),
      video_views_2s: int(mm.video_watched_2s), likes: int(mm.likes), follows: int(mm.follows), reach: int(mm.reach),
      currency, source: "api", recorded_at: now, raw: { ...mm, origem: "api" },
    });
    adDays.push(row("ad", adId, m));
    const key = `${map.g}|${d}`; const acc = grpAgg.get(key) ?? { g: map.g, c: map.c, d, m: {} };
    for (const k of ["spend", "impressions", "clicks", "video_watched_6s", "video_watched_2s", "likes", "follows", "comments", "shares", "profile_visits", "video_play_actions", "conversion"]) {
      if (m[k] !== undefined && num(m[k]) !== null) acc.m[k] = (acc.m[k] ?? 0) + Number(m[k]);
    }
    grpAgg.set(key, acc);
  }
  const grpDays = [...grpAgg.values()].map((a) => ({
    company_id: cRow.company_id, connection_id: connectionId, level: "adgroup", external_id: a.g, external_campaign_id: a.c,
    date_start: a.d, spend_cents: a.m.spend === undefined ? null : Math.round(a.m.spend * 100),
    impressions: a.m.impressions ?? null, clicks: a.m.clicks ?? null, video_views_6s: a.m.video_watched_6s ?? null,
    video_views_2s: a.m.video_watched_2s ?? null, likes: a.m.likes ?? null, follows: a.m.follows ?? null, reach: null,
    currency, source: "api", recorded_at: now, raw: { ...a.m, origem: "api", agregado_de: "ad", nota: "reach não é somável entre anúncios" },
  }));

  const counts = { campanhas: campRows.length, grupos: grpRows.length, anuncios: ads.list.length, dias_ad: adDays.length, dias_adgroup: grpDays.length };
  if (opts.dryRun) return { ok: true, dry_run: true, api_calls: c.calls, rows: 0, counts, accepted, refused, nao_mapeadas: naoMapeadas, start, end, tz, conta: ai.name ?? null };

  const crm = admin.schema("crm");
  const chunks = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const [tbl, rows, oc] of [
    ["tiktok_campaign", campRows, "connection_id,external_campaign_id"],
    ["tiktok_adgroup", grpRows, "connection_id,external_adgroup_id"],
    ["tiktok_insights_daily", [...adDays, ...grpDays], "connection_id,level,external_id,date_start"],
  ] as const) {
    for (const ch of chunks(rows as any[])) {
      const { error } = await crm.from(tbl).upsert(ch, { onConflict: oc });
      if (error) return { ok: false, error: `${tbl}: ${error.message}`, api_calls: c.calls, counts };
    }
  }
  // Campanhas manuais substituídas pela API (mesmo nome): re-apontar o que sobrar e esconder; nada é apagado.
  const substituidas: string[] = [];
  for (const cr of campRows) {
    const man = byName.get(String(cr.name ?? "").trim());
    if (!man || man.external_campaign_id === cr.external_campaign_id) continue;
    await crm.from("tiktok_insights_daily").update({ external_campaign_id: cr.external_campaign_id }).eq("connection_id", connectionId).eq("external_campaign_id", man.external_campaign_id);
    await crm.from("tiktok_adgroup").update({ external_campaign_id: cr.external_campaign_id }).eq("connection_id", connectionId).eq("external_campaign_id", man.external_campaign_id);
    await crm.from("tiktok_campaign").update({ status: "REMOVED", raw: { substituida_por_api: cr.external_campaign_id, em: now } })
      .eq("connection_id", connectionId).eq("external_campaign_id", man.external_campaign_id).eq("source", "manual");
    substituidas.push(`${man.external_campaign_id} → ${cr.external_campaign_id}`);
  }
  const rows = campRows.length + grpRows.length + adDays.length + grpDays.length;
  return { ok: true, api_calls: c.calls, rows, counts, accepted, refused, nao_mapeadas: naoMapeadas, anuncios_sem_grupo: [...new Set(semGrupo)], substituidas, start, end, tz, conta: ai.name ?? null, currency };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const admin = adminClient();
  const caller = await authorize(req, admin, ADS_ROLES);
  if (!caller.allowed) return json({ error: caller.reason ?? "not authorized" }, caller.reason === "missing token" ? 401 : 403);
  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body?.days ?? 7) || 7, 1), 120);
  const since = typeof body?.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : undefined;
  const dryRun = body?.dry_run === true;
  if (body?.all && !caller.isServiceRole) return json({ error: "all só para service_role" }, 403);

  let ids: string[] = [];
  if (body?.connection_id) ids = [String(body.connection_id)];
  else {
    const { data } = await (admin as any).schema("crm").from("ad_platform_connections").select("id")
      .eq("platform", "tiktok").eq("status", "active").not("access_token_encrypted", "is", null);
    ids = (data ?? []).map((r: any) => r.id);
  }
  if (!caller.isServiceRole && ids.length) {
    // utilizador: só ligações das empresas onde tem papel
    const { data: conns } = await (admin as any).schema("crm").from("ad_platform_connections").select("id, company_id").in("id", ids);
    const { data: rr } = await admin.from("user_roles").select("role, company_id").eq("user_id", caller.userId!);
    const okCo = new Set((rr ?? []).filter((r: any) => ADS_ROLES.includes(r.role)).map((r: any) => r.company_id));
    const pa = (rr ?? []).some((r: any) => r.role === "platform_admin");
    if (!pa && (conns ?? []).some((c: any) => !okCo.has(c.company_id))) return json({ error: "ligação fora da empresa do utilizador" }, 403);
  }

  const started = Date.now();
  const runId = await startSyncRun(admin, { function_name: FN, trigger_source: deduceTriggerSource(req), dry_run: dryRun });
  const per: Record<string, unknown> = {}; let rows = 0; let errs = 0; let calls = 0;
  for (const id of ids) {
    try {
      const r: any = await syncOne(admin, id, { days, since, dryRun });
      per[id] = r; rows += r.rows ?? 0; calls += r.api_calls ?? 0; if (!r.ok) errs++;
    } catch (e) { per[id] = { ok: false, error: String((e as Error)?.message ?? e) }; errs++; }
  }
  const status = ids.length === 0 ? "no_data" : resolveStatus(rows, errs);
  await finishSyncRun(admin, runId, started, {
    status, api_calls: calls, rows_written: rows, details: { days, since: since ?? null, per_connection: per },
    error_text: errs ? Object.entries(per).filter(([, v]: any) => !v.ok).map(([k, v]: any) => `${k}: ${v.error}`).join("; ").slice(0, 1000) : null,
  });
  return json({ ok: errs === 0, status, rows, per_connection: per });
});
