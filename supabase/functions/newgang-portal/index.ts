// newgang-portal — API pública do portal newgangfestival.pt (projeto Lovable separado).
// verify_jwt = false: ABERTA por desenho. Usa service_role no servidor; o portal nunca escreve direto.
// Regras: nenhuma resposta devolve totais de atrações; request_access responde igual exista ou não o email.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { assertNoTotals, buildLineup, displayName } from "./lineup.ts";
import { assemblePublic, bundleFrom, lineupFrom, regulationFrom, termsMeta, type Want } from "./public.ts";
import { clubEmail } from "./email.ts";
import { ASSET_BUCKET, PROOF_BUCKET, PROOF_EXT, missionsFrom, normalizeHandle, normalizeProofUrl, submitErrorStatus } from "./missions.ts";
import { buildHistory, subjectRef } from "./history.ts";
import { profileConfirm, profileMe, profilePreferences, profileCountries, profileRuleRead } from "./profile.ts";
import { consentMe, consentPreferences } from "./person-consent.ts";
import { publicEditions } from "./videos.ts";
import { CREW_LINK, crewErrorStatus, crewView } from "./crews.ts";
import { crewPendingAction, memberByEmail, mePendingCrew, PENDING_OPS } from "./pending.ts";
import { requestAccessAction, PENDING_WINDOW_MS } from "./request-access.ts";
import * as GW from "./wallet-google.ts";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";
import { PreSendError, sendWelcomeOnce } from "./welcome.ts";
// #327: leituras canónicas (nível com piso, conquistas, montra de regras) — mesma fonte para site, me, ranking e Wallet.
import { levelFromPoints, memberLevel, referralProgress, rulesPublic, type MemberLevel, type RulesView } from "./club-canon.ts";
const rpc = (fn: string, a: Record<string, unknown>) => sb.rpc(fn, a) as any;
// Fórmula antiga (soma + club_levels) — só usada se club_member_level estiver ausente (reversão SQL #327 já aplicada).
async function legacyLevel(memberId: string, siteId: string): Promise<MemberLevel> {
  const { data: rows, error: e1 } = await sb.from("club_points").select("points").eq("member_id", memberId).limit(10000);
  if (e1) throw new Error("legacy points: " + e1.message);
  const pts = ((rows ?? []) as any[]).reduce((s, r) => s + r.points, 0);
  const { data: lv, error: e2 } = await sb.from("club_levels").select("name, min_points").eq("site_id", siteId);
  if (e2) throw new Error("legacy levels: " + e2.message);
  return levelFromPoints(pts, (lv ?? []) as any);
}
const legacyRules = (rl: unknown): RulesView => ({ rules: ((rl ?? []) as any[]).filter((r) => r.active)
  .map((r) => ({ rule_key: r.rule_key, label: r.label, points: Number(r.points), cap: null, scope: null })), unavailable: [], edition: null, version: null });

// Preview do projeto Lovable do portal (1a915f50-…).
const PREVIEW_SUFFIXES: string[] = ["--1a915f50-55ca-4bb6-9abe-8f241c54647a.lovable.app"];
const ALLOWED_ORIGINS = new Set<string>([
  "https://newgangfestival.pt",
  "https://www.newgangfestival.pt",
  "https://newgang-fest-portal.lovable.app",
]);
const SITE_DOMAIN = "newgangfestival.pt";
const SENDER_DOMAIN = "news.newgangfestival.pt";
const SESSION_DAYS = 30;

function originOk(o: string | null): boolean {
  if (!o) return false;
  if (ALLOWED_ORIGINS.has(o)) return true;
  try {
    const u = new URL(o);
    return u.protocol === "https:" && PREVIEW_SUFFIXES.some((s) => u.hostname.endsWith(s));
  } catch { return false; }
}
function cors(o: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": originOk(o) ? o! : "https://newgangfestival.pt",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const MOD_T0 = performance.now();
let coldStart = true;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "none";
}

const Body = z.object({
  action: z.enum(["bundle", "regulation", "site", "lineup", "history", "ranking", "request_access", "session", "me", "guess", "attendance_claim", "confirm_buyer", "notify_pending",
    "missions", "mission_upload_url", "submit_mission", "profile", "profile_confirm", "profile_preferences", "profile_countries", "crew_create", "crew_join", "crew_leave", "crew_pending", "wallet_google"]),
  profile_payload: z.unknown().optional(),
  preferences_payload: z.unknown().optional(),
  token: z.string().min(20).max(200).optional(),
  email: z.string().email().max(254).optional(),
  reveal_id: z.string().uuid().optional(),
  guess: z.string().trim().min(1).max(120).optional(),
  year: z.number().int().min(2023).max(2100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  mission_id: z.string().uuid().optional(),
  proof_url: z.string().trim().max(500).optional(),
  proof_image_path: z.string().trim().max(300).optional(),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  instagram_handle: z.string().max(80).nullable().optional(),
  tiktok_handle: z.string().max(80).nullable().optional(),
  name: z.string().trim().min(1).max(60).optional(),
  code: z.string().trim().min(4).max(12).optional(),
  new_owner_short: z.number().int().min(0).max(20).optional(),
  op: z.enum(PENDING_OPS).optional(),
});
const WRITE_ACTIONS = new Set(["request_access", "guess", "attendance_claim", "confirm_buyer", "session", "mission_upload_url", "submit_mission", "profile", "profile_confirm", "profile_preferences", "crew_create", "crew_join", "crew_leave", "crew_pending", "wallet_google"]);

// Cache por instância (60 s): a configuração do site muda raramente; evita uma ida à base por pedido.
const SITE_TTL_MS = 60_000;
let siteCache: { at: number; data: any } | null = null;
async function getSite() {
  if (siteCache && Date.now() - siteCache.at < SITE_TTL_MS) return siteCache.data;
  const { data } = await sb.from("portal_sites").select("*").eq("domain", SITE_DOMAIN).eq("active", true).maybeSingle();
  if (data) siteCache = { at: Date.now(), data };
  return data;
}

async function memberFromToken(siteId: string, token?: string) {
  if (!token) return null;
  const { data } = await sb.from("club_member_sessions").select("id, member_id, expires_at, purpose")
    .eq("token_hash", await sha256(token)).eq("site_id", siteId).eq("purpose", "access").maybeSingle();
  if (!data || !data.member_id || new Date(data.expires_at) < new Date()) return null;
  const { data: m } = await sb.from("club_members").select("*").eq("id", data.member_id).maybeSingle();
  return m;
}

async function issueSession(siteId: string, memberId: string) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  const { error } = await sb.from("club_member_sessions").insert({
    site_id: siteId, member_id: memberId, token_hash: await sha256(token), purpose: "access", expires_at: expires,
  });
  if (error) throw new PreSendError("session_insert_failed");
  return { token, expires_at: expires };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

async function unsubscribeUrls(companyId: string, email: string) {
  const { data: ex } = await sb.from("email_unsubscribe_tokens").select("token").eq("email", email).eq("company_id", companyId).maybeSingle();
  let token = ex?.token as string | undefined;
  if (!token) {
    token = newToken();
    await sb.from("email_unsubscribe_tokens").upsert({ token, email, company_id: companyId }, { onConflict: "email,company_id", ignoreDuplicates: true });
    const { data: again } = await sb.from("email_unsubscribe_tokens").select("token").eq("email", email).eq("company_id", companyId).maybeSingle();
    token = (again?.token as string) ?? token;
  }
  return {
    page: `https://${SITE_DOMAIN}/descadastrar?token=${encodeURIComponent(token)}`,
    oneClick: `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
  };
}

/** Enfileira um email do Clube com link pessoal (sessão access de 30 dias; só o hash fica guardado).
 *  Erros antes do enfileiramento -> PreSendError; erro/incerteza no enfileiramento -> Error (resultado desconhecido). */
async function sendClubLink(site: { id: string; company_id: string }, m: { id: string; first_name: string | null; email: string },
  kind: "welcome" | "access", messageId: string) {
  const email = m.email.trim().toLowerCase();
  let html: string, text: string, unsub: { page: string; oneClick: string }, link: string;
  try {
    const { token } = await issueSession(site.id, m.id);
    link = `https://${SITE_DOMAIN}/clube/entrar?t=${encodeURIComponent(token)}`;
    unsub = await unsubscribeUrls(site.company_id, email);
  } catch (e) { throw new PreSendError((e as Error).message); }
  const greet = m.first_name ? `Olá ${m.first_name},` : "Olá,";
  const welcome = kind === "welcome";
  try { ({ html, text } = clubEmail({
    greet,
    lines: welcome
      ? ["Falta só um clique para entrares no Clube Newgang. Confirma o teu email e ganha +100 pontos."]
      : ["Entra na tua área do Clube Newgang com o botão abaixo."],
    cta: welcome ? "Confirmar e entrar no Clube" : "Entrar no Clube",
    link, note: `O link é pessoal e válido durante ${SESSION_DAYS} dias.`, unsubscribeUrl: unsub.page,
  })); } catch { throw new PreSendError("email_render_failed"); }
  const label = welcome ? "newgang_club_welcome" : "newgang_club_access";
  const { error: logErr } = await sb.from("email_send_log").insert({
    message_id: messageId, template_name: label, recipient_email: email, company_id: site.company_id, status: "pending",
    metadata: { member_id: m.id },
  });
  if (logErr) throw new PreSendError(`email_send_log: ${logErr.message}`);
  const { error: qErr } = await sb.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId, company_id: site.company_id, to: email,
      from: `Newgang Festival <clube@${SENDER_DOMAIN}>`, sender_domain: SENDER_DOMAIN,
      subject: welcome ? "Confirma a tua entrada no Clube Newgang" : "O teu acesso ao Clube Newgang",
      html, text, purpose: "transactional", label, idempotency_key: messageId,
      unsubscribe_http_url: unsub.oneClick, queued_at: new Date().toISOString(),
    },
  });
  if (qErr) throw new Error(`enqueue_email: ${qErr.message}`);
}


/** Welcome aos membros novos do formulário: uma vez por membro, via reserva atómica (#321). */
async function notifyPending(site: { id: string; company_id: string }, memberId?: string) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  let q = sb.from("club_members").select("id, first_name, email")
    .eq("site_id", site.id).eq("source", "formulario").is("confirmed_at", null).gte("created_at", since);
  if (memberId) q = q.eq("id", memberId);
  const { data: members } = await q.order("created_at").limit(50);
  let sent = 0;
  for (const m of members ?? []) {
    const r = await sendWelcomeOnce({
      reserve: async (id, mid) => {
        const { data, error } = await sb.rpc("club_welcome_reserve",
          { p_company_id: site.company_id, p_site_id: site.id, p_member_id: id, p_message_id: mid });
        if (error) throw new Error(error.message);
        return data === true;
      },
      mark: async (id, st, err) => {
        const { error } = await sb.rpc("club_welcome_mark", { p_member_id: id, p_status: st, p_error: err ?? null });
        if (error) throw new Error(error.message);
      },
      send: (_id, mid) => sendClubLink(site, m, "welcome", mid),
      log: (msg, id, detail) => console.error(msg, id, detail ?? ""),
    }, m.id);
    if (r === "sent") sent++;
  }
  return sent;
}

// ---------- Google Wallet ----------
// issuerId vem do secret GOOGLE_WALLET_ISSUER_ID (GET /issuer devolve lista vazia para a conta de serviço).
async function walletIssuer(_sa: GW.SaKey): Promise<string> {
  const id = Deno.env.get("GOOGLE_WALLET_ISSUER_ID");
  if (!id) throw new Error("wallet_issuer_not_configured");
  return id;
}
let classReady = false;
async function walletMember(siteId: string, memberId: string, pts?: number, lvl?: string | null): Promise<GW.WalletMember | null> {
  const { data: m } = await sb.from("club_members").select("id, member_no, first_name, confirmed_at").eq("id", memberId).maybeSingle();
  if (!m?.confirmed_at) return null;
  let points = pts, level = lvl;
  if (points === undefined) {
    // #327: nível canónico (pontos + piso do cutover); erro de RPC propaga (walletSave falha, walletSync grava last_error).
    // Compatível com a reversão SQL: só se a RPC deixar de existir (PGRST202/42883) usa a fórmula antiga.
    const lv = await memberLevel(rpc, memberId, { legacy: () => legacyLevel(memberId, siteId) });
    points = lv.points; level = lv.level;
  }
  const crew = await myCrew(siteId, memberId);
  return { id: m.id, member_no: m.member_no, first_name: m.first_name, points: points!, level: level ?? null, crew: crew?.name ?? null };
}
async function walletSave(site: any, memberId: string): Promise<string | null> {
  const sa = GW.readSaKey(Deno.env.get("GOOGLE_WALLET_SA_KEY"));
  const issuer = await walletIssuer(sa);
  const wm = await walletMember(site.id, memberId);
  if (!wm) return null;
  if (!classReady) { await GW.ensureClass(sa, issuer, GW.buildClass(issuer)); classReady = true; }
  const obj = GW.buildObject(issuer, wm);
  await GW.upsertObject(sa, obj);
  await sb.from("club_wallet_passes").upsert({
    company_id: site.company_id, member_id: memberId, platform: "google", object_id: obj.id,
    last_points: wm.points, last_level: wm.level, last_error: null, updated_at: new Date().toISOString(),
  }, { onConflict: "member_id,platform" });
  const jwt = await GW.signJwt(GW.saveClaims(sa.client_email, obj.id), await GW.saSigner(sa));
  return GW.saveUrl(jwt);
}
/** Cron: PATCH só aos passes cujo pontos/nível mudou. Erros ficam em last_error; nunca tocam nos pontos. */
async function walletSync(limit = 200) {
  const { data } = await sb.rpc("club_wallet_due", { p_limit: limit });
  const due = (data ?? []) as Array<{ pass_id: string; member_id: string; site_id: string; points: number; level_name: string | null }>;
  if (!due.length) return { due: 0, ok: 0, failed: 0 };
  const sa = GW.readSaKey(Deno.env.get("GOOGLE_WALLET_SA_KEY"));
  const issuer = await walletIssuer(sa);
  let ok = 0, failed = 0;
  for (const d of due) {
    try {
      const wm = await walletMember(d.site_id, d.member_id, Number(d.points), d.level_name);
      if (!wm) continue;
      await GW.patchObject(sa, GW.buildObject(issuer, wm));
      await sb.from("club_wallet_passes").update({ last_points: wm.points, last_level: wm.level, last_error: null, updated_at: new Date().toISOString() }).eq("id", d.pass_id);
      ok++;
    } catch (e) {
      failed++;
      await sb.from("club_wallet_passes").update({ last_error: (e as Error).message.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", d.pass_id);
    }
  }
  return { due: due.length, ok, failed };
}

async function crewMembersOf(crewId: string) {
  const { data } = await sb.from("club_crew_members").select("member_id, joined_at, club_members(first_name, confirmed_at)").eq("crew_id", crewId).order("joined_at");
  return ((data ?? []) as any[]).map((x) => ({ member_id: x.member_id, joined_at: x.joined_at, first_name: x.club_members?.first_name ?? null, confirmed_at: x.club_members?.confirmed_at ?? null }));
}

async function myCrew(siteId: string, memberId: string) {
  const { data: cm } = await sb.from("club_crew_members").select("crew_id").eq("site_id", siteId).eq("member_id", memberId).maybeSingle();
  if (!cm) return null;
  const [{ data: crew }, members, { data: cfg }] = await Promise.all([
    sb.from("club_crews").select("id, name, code, owner_member_id, completed_at").eq("id", cm.crew_id).maybeSingle(),
    crewMembersOf(cm.crew_id),
    sb.rpc("club_crew_cfg", { p_site: siteId }),
  ]);
  if (!crew) return null;
  const c = Array.isArray(cfg) ? cfg[0] : cfg;
  return crewView(SITE_DOMAIN, crew as any, members, { min: c?.min_m ?? 4, max: c?.max_m ?? 6 });
}

async function myHistory(siteId: string, memberId: string) {
  const [{ data: rows }, { data: rules }] = await Promise.all([
    sb.from("club_points").select("rule_key, points, ref_id, created_at, reason").eq("member_id", memberId).order("created_at", { ascending: false }).limit(5000),
    sb.from("club_point_rules").select("rule_key, label").eq("site_id", siteId),
  ]);
  const pts = (rows ?? []) as any[];
  const friendIds = [...new Set(pts.filter((r) => r.rule_key.startsWith("friend_") && r.ref_id).map((r) => r.ref_id))];
  const subIds = [...new Set(pts.filter((r) => r.rule_key.startsWith("mission") && r.ref_id).map((r) => subjectRef(r)))];
  const crewIds = [...new Set(pts.filter((r) => r.rule_key === "crew_complete" && r.ref_id).map((r) => r.ref_id))];
  const [{ data: friends }, { data: subs }, { data: crewRows }] = await Promise.all([
    friendIds.length ? sb.from("club_members").select("id, first_name, referred_by_member_id").in("id", friendIds).eq("referred_by_member_id", memberId) : Promise.resolve({ data: [] as any[] }),
    subIds.length ? sb.from("club_mission_submissions").select("id, club_missions(title)").in("id", subIds).eq("member_id", memberId) : Promise.resolve({ data: [] as any[] }),
    crewIds.length ? sb.from("club_crews").select("id, name").in("id", crewIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const crews: Record<string, string> = {};
  for (const c of (crewRows ?? []) as any[]) crews[c.id] = c.name;
  const missions: Record<string, string> = {};
  for (const s of (subs ?? []) as any[]) if (s.club_missions?.title) missions[s.id] = s.club_missions.title;
  const ruleLabels: Record<string, string> = {};
  for (const r of (rules ?? []) as any[]) ruleLabels[r.rule_key] = r.label;
  return buildHistory(memberId, pts, { ruleLabels, friends: (friends ?? []) as any[], missions, crews });
}

async function mySubmissions(memberId: string) {
  const { data: subs } = await sb.from("club_mission_submissions")
    .select("id, mission_id, status, reject_reason, created_at, club_missions(title, kind)")
    .eq("member_id", memberId).order("created_at", { ascending: false }).limit(200);
  const ids = (subs ?? []).map((x: any) => x.id);
  const { data: pts } = ids.length
    ? await sb.from("club_points").select("rule_key, ref_id, points").eq("member_id", memberId).or("rule_key.like.mission%,and(rule_key.eq.void,ref_id.like.mission%)").limit(5000)
    : { data: [] as any[] };
  const by: Record<string, number> = {};
  for (const p of (pts ?? []) as any[]) { const k = subjectRef(p); by[k] = (by[k] ?? 0) + p.points; }
  return (subs ?? []).map((x: any) => ({
    mission_id: x.mission_id, mission_title: x.club_missions?.title ?? null, kind: x.club_missions?.kind ?? null,
    status: x.status, reject_reason: x.reject_reason, points: by[x.id] ?? 0, submitted_at: x.created_at,
  }));
}

const auth0 = (req: Request) => (req.headers.get("authorization") ?? "").startsWith("Bearer ");

async function rankingFor(siteId: string, limit = 100) {
  const { data } = await sb.rpc("club_ranking", { p_site: siteId, p_limit: 100000 });
  const rows = (data ?? []) as Array<{ member_id: string; first_name: string | null; email: string; points: number; level_name: string | null; rank_pos: number }>;
  return { rows, top: rows.slice(0, limit) };
}

// ---------- Leituras públicas (partilhadas por site/lineup/history/bundle) ----------
type Timer = { mark: (k: string, ms: number) => void };
const timed = async <T>(t: Timer, k: string, p: PromiseLike<T>): Promise<T> => {
  const a = performance.now(); const r = await p; t.mark(k, performance.now() - a); return r;
};

async function profileRule(siteId: string) {
  return profileRuleRead(() => sb.from("club_profile_settings").select("enabled, version").eq("site_id", siteId).maybeSingle());
}
async function loadSitePayload(site: any) {
  const ev = site.event_id;
  const none = Promise.resolve({ data: null });
  const [{ data }, { data: t }, { data: evRow }, { data: em }, { data: lv }, { data: rl }, { data: tm }] = await Promise.all([
    sb.from("portal_sites_public").select("*").eq("id", site.id).maybeSingle(),
    ev ? sb.from("event_trackers").select("platform, tracker_id").eq("event_id", ev) : none,
    ev ? sb.from("events").select("ticketing_url").eq("id", ev).maybeSingle() : none,
    ev ? sb.from("event_marketing").select("ticket_lots").eq("event_id", ev).maybeSingle() : none,
    sb.from("club_levels").select("name, min_points, benefit").eq("site_id", site.id).order("min_points"),
    sb.from("club_point_rules").select("rule_key, label, points").eq("site_id", site.id).eq("active", true).order("points"),
    sb.from("club_terms").select("version, published_at, status").eq("site_id", site.id).eq("status", "publicada").order("version", { ascending: false }).limit(1),
  ] as const) as any;
  const trackers: unknown[] = ev ? (t ?? []) : [];
  const ticketing: unknown = ev ? { url: evRow?.ticketing_url ?? null, lots: em?.ticket_lots ?? null } : null;
  // #327: a montra usa club_rules_public (valores pagos agora + disponibilidade); club_point_rules cru só se a RPC estiver ausente (reversão).
  const rv = await rulesPublic(rpc, site.id, async () => legacyRules(rl));
  return { site: data, trackers, ticketing, club: { levels: lv ?? [], rules: rv.rules, rules_unavailable: rv.unavailable, terms: termsMeta(tm), profile_mission: await profileRule(site.id) } };
}

async function loadLineupRaw(site: any) {
  if (!site.event_id) return null;
  const [{ data: reveals }, { data: acts }, { data: em }] = await Promise.all([
    sb.from("event_lineup_reveals").select("id, club_at, public_at, clues, status").eq("event_id", site.event_id),
    sb.from("event_lineups").select("id, reveal_id, artist_name, artist_image_url, artist_bio_pt, artist_bio_en, category, video_url, listen_url, display_order").eq("event_id", site.event_id).not("reveal_id", "is", null),
    sb.from("event_marketing").select("lineup_complete").eq("event_id", site.event_id).maybeSingle(),
  ]);
  return { reveals: reveals ?? [], acts: acts ?? [], lineupComplete: !!em?.lineup_complete };
}

async function loadHistoryPayload(site: any) {
  const { data } = await sb.from("festival_editions_public").select("*").eq("brand_key", site.brand_key)
    .order("year", { ascending: false }).order("sort");
  return { editions: publicEditions(data) };
}

// Leitura pública numa só ida à base: o site com o evento, o line-up e o Clube embutidos (FKs),
// em paralelo com a vista pública do site e as edições. Mede-se ~1 ida (~150 ms) em vez de 2–3.
const LINEUP_COLS = "id, reveal_id, artist_name, artist_image_url, artist_bio_pt, artist_bio_en, category, video_url, listen_url, display_order";
async function loadPublic(want: Want) {
  const embed = [
    "id, event_id, brand_key, company_id",
    want.site ? "club_levels(name, min_points, benefit), club_point_rules(rule_key, label, points, active), club_terms(version, published_at, status)" : "",
    `events!portal_sites_event_id_fkey(${[
      want.site ? "ticketing_url, event_trackers(platform, tracker_id)" : "",
      "event_marketing(ticket_lots, lineup_complete)",
      want.lineup ? `event_lineup_reveals(id, club_at, public_at, clues, status), event_lineups(${LINEUP_COLS})` : "",
    ].filter(Boolean).join(", ")})`,
  ].filter(Boolean).join(", ");
  const none = Promise.resolve({ data: null }) as any;
  const [{ data: row }, { data: pubRows }, { data: eds }] = await Promise.all([
    sb.from("portal_sites").select(embed).eq("domain", SITE_DOMAIN).eq("active", true).maybeSingle(),
    want.site ? sb.from("portal_sites_public").select("*").eq("domain", SITE_DOMAIN) : none,
    want.history ? sb.from("festival_editions_public").select("*").order("year", { ascending: false }).order("sort") : none,
  ]) as any;
  if (!row) return null;
  const out = assemblePublic(want, row, pubRows, eds);
  if (want.site && out.site) {
    const club = (out.site as any).club;
    const rv = await rulesPublic(rpc, row.id, async () => legacyRules(club.rules)); // #327: mesma montra canónica do payload "site"
    club.rules = rv.rules; club.rules_unavailable = rv.unavailable;
    club.profile_mission = await profileRule(row.id);
  }
  return out;
}

Deno.serve(async (req) => {
  const T0 = performance.now();
  const timings: Array<[string, number]> = [];
  if (coldStart) { timings.push(["boot", T0 - MOD_T0]); coldStart = false; }
  const timer: Timer = { mark: (k, ms) => timings.push([k, ms]) };
  const origin = req.headers.get("origin");
  const h = cors(origin);
  if (req.method === "OPTIONS") return new Response(originOk(origin) ? "ok" : "forbidden", { status: originOk(origin) ? 200 : 403, headers: h });
  const json = (b: unknown, status = 200) => {
    assertNoTotals(b);
    const st = [...timings, ["total", performance.now() - T0] as [string, number]]
      .map(([k, ms]) => `${k};dur=${ms.toFixed(1)}`).join(", ");
    return new Response(JSON.stringify(b), {
      status, headers: { ...h, "Content-Type": "application/json", "Server-Timing": st, "Timing-Allow-Origin": "*" },
    });
  };
  // Envio imediato (trigger da base via pg_net): sem Origin nem segredo. Só envia o welcome, uma única vez,
  // a um membro por confirmar do formulário criado há menos de 7 dias; a resposta não expõe dados.
  if (!origin && req.method === "POST" && !auth0(req)) {
    const b = await req.clone().json().catch(() => ({}));
    if (b?.action === "notify_member") {
      const id = typeof b.member_id === "string" && /^[0-9a-f-]{36}$/i.test(b.member_id) ? b.member_id : null;
      if (!id) return json({ error: "invalid" }, 400);
      const site = await getSite();
      if (!site) return json({ error: "site_not_configured" }, 503);
      await notifyPending(site, id);
      return json({ ok: true });
    }
  }
  // Cron interno: sem Origin, só com a chave de serviço.
  const auth = req.headers.get("authorization") ?? "";
  if (!origin && req.method === "POST" && auth.startsWith("Bearer ") && await isServiceRoleRequest(req)) {
    const b = await req.json().catch(() => ({}));
    const site = await getSite();
    if (!site) return json({ error: "site_not_configured" }, 503);
    try {
      if (b?.action === "wallet_sync") return json({ ok: true, ...(await walletSync()) });
      // Aplicação pontual, exclusivamente service_role; não devolve chave, JWT ou save_url.
      if (b?.action === "wallet_artwork_apply" && typeof b.member_id === "string" && /^[0-9a-f-]{36}$/i.test(b.member_id)) {
        const sa = GW.readSaKey(Deno.env.get("GOOGLE_WALLET_SA_KEY"));
        const issuer = await walletIssuer(sa);
        const wm = await walletMember(site.id, b.member_id);
        if (!wm) return json({ error: "no_member" }, 404);
        await GW.patchClassLogo(sa, issuer);
        await GW.patchObject(sa, GW.buildObject(issuer, wm));
        const [clsResponse, objResponse] = await Promise.all([
          GW.walletFetch(sa, `/loyaltyClass/${encodeURIComponent(GW.classId(issuer))}`),
          GW.walletFetch(sa, `/loyaltyObject/${encodeURIComponent(GW.objectId(issuer, wm.id))}`),
        ]);
        if (!clsResponse.ok) throw new Error(`wallet_class_verify ${clsResponse.status} ${await clsResponse.text()}`);
        if (!objResponse.ok) throw new Error(`wallet_object_verify ${objResponse.status} ${await objResponse.text()}`);
        const cls = await clsResponse.json(), obj = await objResponse.json();
        return json({ ok: true, member_no: wm.member_no, logo_matches: cls.programLogo?.sourceUri?.uri === GW.WALLET_ARTWORK_URLS.logo,
          hero_matches: obj.heroImage?.sourceUri?.uri === GW.levelArtwork(wm.level).heroImage.sourceUri.uri,
          color: obj.hexBackgroundColor, points: obj.loyaltyPoints?.balance?.int, level: obj.secondaryLoyaltyPoints?.balance?.string,
          event_matches: obj.textModulesData?.some((t: { id: string; body: string }) => t.id === "evento" && t.body === GW.EVENT_LINE),
          qr_matches: obj.barcode?.value === GW.barcodeValue(wm.member_no) });
      }
      if (b?.action === "wallet_test_url" && typeof b.member_id === "string") return json({ save_url: await walletSave(site, b.member_id) });
    } catch (e) { console.error("wallet", (e as Error).message); return json({ error: "wallet", detail: (e as Error).message }, 502); }
    if (b?.action !== "notify_pending") return json({ error: "invalid" }, 400);
    return json({ ok: true, sent: await notifyPending(site) });
  }
  if (!originOk(origin)) return json({ error: "origin" }, 403);
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: z.infer<typeof Body>;
  try {
    const pa = performance.now();
    const raw = await req.json();
    if (["profile_confirm", "profile_preferences"].includes(raw?.action) && Object.keys(raw).some(k => !["action", "token", "profile_payload", "preferences_payload"].includes(k))) return json({ error: "profile_payload" }, 400);
    const p = Body.safeParse(raw);
    timer.mark("parse", performance.now() - pa);
    if (!p.success && ["me", "profile_confirm", "profile_preferences"].includes(raw?.action) && typeof raw?.token === "string" && (raw.token.length < 20 || raw.token.length > 200)) return json({error:"no_session"},401);
    if (!p.success) return json({ error: "invalid", fields: p.error.flatten().fieldErrors }, 400);
    body = p.data;
  } catch { return json({ error: "invalid_json" }, 400); }

  if (WRITE_ACTIONS.has(body.action)) {
    const ipHash = await sha256(clientIp(req) + ":ng");
    const { data: ok, error: rateError } = await sb.rpc("portal_rate_hit", { p_bucket: `ng:${body.action}:${ipHash}`, p_max: 20, p_window_seconds: 600 });
    if (["profile_confirm", "profile_preferences"].includes(body.action) && (rateError || typeof ok !== "boolean")) return json({ error: "rate_unavailable" }, 503);
    if (ok === false) {
      if (body.action === "request_access") console.log(JSON.stringify({ action: "request_access", reason: "limitado", ip_hash: ipHash.slice(0, 12) }));
      return json({ error: "rate_limited" }, 429);
    }
  }

  if (body.action === "profile_countries") return json({ countries: profileCountries(), version: "iso-3166-1-2026-10" });

  // Regulamento publicado (rascunhos nunca saem).
  if (body.action === "regulation") {
    try {
      const { data } = await timed(timer, "db", sb.from("portal_sites")
        .select("id, club_terms(version, published_at, status, body_md)")
        .eq("domain", SITE_DOMAIN).eq("active", true).maybeSingle()) as any;
      if (!data) return json({ error: "site_not_configured" }, 503);
      const r = regulationFrom(data.club_terms);
      return r ? json(r) : json({ error: "not_found" }, 404);
    } catch (e) {
      console.error("newgang-portal regulation", (e as Error).message);
      return json({ error: "internal" }, 500);
    }
  }

  // Missões ativas dentro do prazo (sem contagens).
  if (body.action === "missions") {
    try {
      const { data } = await timed(timer, "db", sb.from("portal_sites")
        .select("id, club_missions(id, kind, title, description, network, points, proof_type, mention, hashtag, caption_suggestion, assets, starts_at, ends_at, status, sort, finalist_points, winner_points, judging_until)")
        .eq("domain", SITE_DOMAIN).eq("active", true).eq("club_missions.status", "ativa").maybeSingle()) as any;
      if (!data) return json({ error: "site_not_configured" }, 503);
      return json(missionsFrom(data.club_missions, (p) => sb.storage.from(ASSET_BUCKET).getPublicUrl(p).data.publicUrl));
    } catch (e) {
      console.error("newgang-portal missions", (e as Error).message);
      return json({ error: "internal" }, 500);
    }
  }

  // Leituras públicas sem token: caminho rápido, sem getSite() à parte.
  const PUBLIC = { site: { site: true }, history: { history: true }, lineup: { lineup: true },
    bundle: { site: true, lineup: true, history: true } } as Record<string, Parameters<typeof loadPublic>[0]>;
  if (PUBLIC[body.action] && (body.action !== "lineup" || !body.token)) {
    try {
      const r = await timed(timer, "db", loadPublic(PUBLIC[body.action]));
      if (!r) return json({ error: "site_not_configured" }, 503);
      if (body.action === "site") return json(r.site);
      if (body.action === "history") return json(r.history);
      if (body.action === "lineup") return json(lineupFrom(r.lineupRaw ?? null, false));
      return json(bundleFrom(r));
    } catch (e) {
      console.error("newgang-portal", body.action, (e as Error).message);
      return json({ error: "internal" }, 500);
    }
  }

  const site = await timed(timer, "getSite", getSite());
  if (!site) return json({ error: "site_not_configured" }, 503);
  const member = body.action === "bundle" ? null : await timed(timer, "member", memberFromToken(site.id, body.token));

  if (["me", "profile_confirm", "profile_preferences"].includes(body.action) && (!member || member.site_id !== site.id || member.company_id !== site.company_id)) return json({ error: "no_session" }, 401);

  try {
    switch (body.action) {
      case "site":
        return json(await timed(timer, "db", loadSitePayload(site)));
      case "lineup":
        return json(lineupFrom((await timed(timer, "db", loadLineupRaw(site))) as any, !!member?.confirmed_at));
      case "history":
        return json(await timed(timer, "db", loadHistoryPayload(site)));
      case "bundle": {
        // Tudo de uma vez; line-up sempre na versão pública (sem token).
        const [s1, lr, hi] = await timed(timer, "db", Promise.all([loadSitePayload(site), loadLineupRaw(site), loadHistoryPayload(site)]));
        return json({ site: s1, lineup: lineupFrom(lr as any, false), history: hi });
      }
      case "ranking": {
        const { rows, top } = await rankingFor(site.id, body.limit ?? 20);
        const me = member ? rows.find((r) => r.member_id === member.id) : null;
        return json({
          top: top.map((r) => ({ name: displayName(r.first_name, r.email), points: r.points, level: r.level_name, rank: r.rank_pos })),
          me: me ? { rank: me.rank_pos, points: me.points, level: me.level_name } : null,
        });
      }
      case "request_access": {
        // #328: comparação exata com email normalizado. #332: resposta diferencia sent vs not_member, com log por motivo.
        const r = await requestAccessAction(site.id, body.email,
          async (sid, email) => (await memberByEmail(() => sb.from("club_members").select("id, first_name, email") as any, sid, email)).data ?? null,
          async (m) => { try { await sendClubLink(site, m, "access", crypto.randomUUID()); } catch (e) { console.error("request_access send:", (e as Error).message); } },
          (reason) => console.log(JSON.stringify({ action: "request_access", reason })),
          async (sid, email) => {
            const now = new Date();
            const { data, error } = await sb.rpc("club_pending_capture_exists", {
              p_site_id: sid, p_email: email,
            });
            if (error || typeof data !== "boolean") throw new Error("pending_lookup_unavailable");
            return data;
          });
        return json(r.body, r.status);
      }
      case "session": {
        if (!member) return json({ valid: false });
        if (!member.confirmed_at) await sb.rpc("club_confirm_member", { p_member: member.id });
        return json({ valid: true, first_name: member.first_name });
      }
      case "me": {
        if (!member) return json({ error: "no_session" }, 401);
        const { rows } = await rankingFor(site.id);
        const me = rows.find((r) => r.member_id === member.id);
        const { data: lv } = await sb.from("club_levels").select("name, min_points, benefit").eq("site_id", site.id).order("min_points");
        const cl: MemberLevel = await memberLevel(rpc, member.id, { legacy: () => legacyLevel(member.id, site.id) }); // #327: nível/piso/próximo nível canónicos
        // RPC session rejection is authoritative; optional infrastructure errors alone are isolated.
        const profileView = member.confirmed_at && body.token ? await profileMe(rpc, site.id, await sha256(body.token)) : {profile:null,profile_status:"not_confirmed"};
        if(profileView.profile_status === "no_session") return json({error:"no_session"},401);
        const consentView = member.confirmed_at && body.token ? await consentMe(rpc, site.id, await sha256(body.token)) : {consents:null,consents_status:"not_confirmed"};
        if(consentView.consents_status === "no_session") return json({error:"no_session"},401);
        return json({
          first_name: member.first_name, member_no: member.member_no,
          points: cl.points, level: cl.level, rank: me?.rank_pos ?? null,
          level_protected: cl.protected, next_level: cl.next_level, next_level_min: cl.next_level_min,
          referrals: await referralProgress(rpc, member.id),
          ...profileView,
          ...consentView,
          levels: lv ?? [],
          invite_link: `https://${SITE_DOMAIN}/clube?ref=${member.referral_code}`,
          referral_code: member.referral_code,
          instagram_handle: member.instagram_handle ?? null, tiktok_handle: member.tiktok_handle ?? null,
          submissions: await mySubmissions(member.id),
          history: await myHistory(site.id, member.id),
          crew: await myCrew(site.id, member.id),
          ...(member.confirmed_at ? await mePendingCrew((fn, a) => sb.rpc(fn, a) as any, member.id) : { pending_crew: null }),
        });
      }
      case "guess": {
        if (!member?.confirmed_at) return json({ error: "no_session" }, 401);
        if (!body.reveal_id || !body.guess) return json({ error: "invalid" }, 400);
        const { data: r } = await sb.from("event_lineup_reveals").select("id, club_at, event_id, status").eq("id", body.reveal_id).maybeSingle();
        if (!r || r.event_id !== site.event_id || r.status !== "agendada") return json({ error: "reveal" }, 404);
        if (new Date(r.club_at) <= new Date()) return json({ error: "closed" }, 409);
        const { error } = await sb.from("club_guesses").insert({ company_id: site.company_id, member_id: member.id, reveal_id: r.id, guess: body.guess });
        if (error) return json({ error: "already_guessed" }, 409);
        return json({ ok: true });
      }
      case "attendance_claim": {
        if (!member?.confirmed_at) return json({ error: "no_session" }, 401);
        if (!body.year || body.year >= new Date().getFullYear() + 1) return json({ error: "year" }, 400);
        const { data: st } = await sb.rpc("club_claim_attendance", { p_member: member.id, p_year: body.year });
        return json({ status: st });
      }
      case "wallet_google": {
        if (!member?.confirmed_at) return json({ error: "no_session" }, 401);
        try {
          const url = await walletSave(site, member.id);
          if (!url) return json({ error: "no_session" }, 401);
          return json({ save_url: url });
        } catch (e) {
          console.error("wallet_google", (e as Error).message);
          return json({ error: "wallet_unavailable" }, 503);
        }
      }
      case "crew_create":
      case "crew_join":
      case "crew_leave": {
        if (!member?.confirmed_at) return json({ error: "no_session" }, 401);
        let r: any;
        if (body.action === "crew_create") {
          if (!body.name) return json({ error: "crew_name" }, 400);
          r = await sb.rpc("club_crew_create", { p_member: member.id, p_name: body.name });
        } else if (body.action === "crew_join") {
          if (!body.code) return json({ error: "crew_not_found" }, 404);
          r = await sb.rpc("club_crew_join", { p_member: member.id, p_code: body.code });
        } else {
          // Transferência: índice (0-based) na lista members do "me".crew — nunca ids de outros membros.
          let newOwner: string | null = null;
          if (body.new_owner_short !== undefined) {
            const { data: cm } = await sb.from("club_crew_members").select("crew_id").eq("member_id", member.id).maybeSingle();
            if (cm) newOwner = (await crewMembersOf(cm.crew_id))[body.new_owner_short]?.member_id ?? null;
          }
          r = await sb.rpc("club_crew_leave", { p_member: member.id, p_new_owner: newOwner });
        }
        if (r.error) return json({ error: "crew" }, 500);
        const out = r.data ?? {};
        if (out.error) return json({ error: out.error }, crewErrorStatus(out.error));
        if (body.action === "crew_create") return json({ id: out.id, name: out.name, code: out.code, invite_link: CREW_LINK(SITE_DOMAIN, out.code) });
        if (body.action === "crew_join") return json({ ok: true, crew: await myCrew(site.id, member.id) });
        return json({ ok: true });
      }
      case "crew_pending": {
        // #328: member vem do token da sessão; qualquer member_id no payload é ignorado (Body não o declara).
        const r = await crewPendingAction((fn, a) => sb.rpc(fn, a) as any, member, { op: body.op });
        return json(r.body, r.status);
      }
      case "profile_confirm": {
        if (!member?.confirmed_at || !body.token) return json({ error: "no_session" }, 401);
        const r = await profileConfirm(rpc, site.id, await sha256(body.token), body.profile_payload);
        return json(r.body, r.status);
      }
      case "profile_preferences": {
        if (!member?.confirmed_at || !body.token) return json({ error: "no_session" }, 401);
        const r = body.preferences_payload
          ? await consentPreferences(rpc, site.id, await sha256(body.token), body.preferences_payload)
          : profilePreferences();
        return json(r.body, r.status);
      }
      case "profile": {
        if (!member?.confirmed_at) return json({ error: "no_session" }, 401);
        let ig: string | null, tt: string | null;
        try {
          ig = body.instagram_handle === undefined ? member.instagram_handle : normalizeHandle(body.instagram_handle, "instagram");
          tt = body.tiktok_handle === undefined ? member.tiktok_handle : normalizeHandle(body.tiktok_handle, "tiktok");
        } catch { return json({ error: "handle" }, 400); }
        const { error } = await sb.from("club_members").update({ instagram_handle: ig, tiktok_handle: tt, updated_at: new Date().toISOString() }).eq("id", member.id);
        if (error) return json({ error: "handle" }, 400);
        return json({ ok: true, instagram_handle: ig, tiktok_handle: tt });
      }
      case "mission_upload_url": {
        if (!member?.confirmed_at) return json({ error: "no_session" }, 401);
        const ext = PROOF_EXT[body.content_type ?? ""];
        if (!ext) return json({ error: "content_type" }, 400);
        const path = `${member.company_id}/${member.id}/${crypto.randomUUID()}.${ext}`;
        const { data, error } = await sb.storage.from(PROOF_BUCKET).createSignedUploadUrl(path);
        if (error || !data) return json({ error: "upload" }, 500);
        return json({ path, upload_url: data.signedUrl, token: data.token, max_bytes: 5 * 1024 * 1024 });
      }
      case "submit_mission": {
        if (!member?.confirmed_at) return json({ error: "no_session" }, 401);
        if (!body.mission_id) return json({ error: "invalid" }, 400);
        const url = body.proof_url ? normalizeProofUrl(body.proof_url) : null;
        if (body.proof_url && !url) return json({ error: "url" }, 400);
        const img = body.proof_image_path || null;
        if (img) {
          const dir = img.split("/").slice(0, -1).join("/"), file = img.split("/").pop()!;
          const { data: objs } = await sb.storage.from(PROOF_BUCKET).list(dir, { search: file, limit: 1 });
          if (!objs?.some((o: any) => o.name === file)) return json({ error: "image" }, 400);
        }
        const { data: r, error } = await sb.rpc("club_mission_submit", { p_member: member.id, p_mission: body.mission_id, p_url: url, p_image: img });
        if (error) throw error;
        const res = r as { status?: string; error?: string };
        if (res.error) return json({ error: res.error }, submitErrorStatus(res.error));
        return json({ status: res.status });
      }
      case "confirm_buyer": {
        if (!body.token) return json({ error: "token" }, 400);
        const { data: s } = await sb.from("club_member_sessions").select("id, email, expires_at, used_at")
          .eq("token_hash", await sha256(body.token)).eq("site_id", site.id).eq("purpose", "buyer_confirm").maybeSingle();
        if (!s || !s.email || new Date(s.expires_at) < new Date()) return json({ valid: false });
        const { data: fb } = await sb.from("fever_buyers").select("first_name").eq("company_id", site.company_id).ilike("email", s.email).limit(1).maybeSingle();
        const { data: c } = await sb.from("contacts").select("id").eq("company_id", site.company_id).ilike("email", s.email).limit(1).maybeSingle();
        const { data: mid } = await sb.rpc("club_upsert_member", {
          p_site: site.id, p_email: s.email, p_first_name: fb?.first_name ?? null, p_phone: null,
          p_contact: c?.id ?? null, p_referral: null, p_source: "confirmacao_1_clique",
        });
        if (!mid) return json({ valid: false });
        await sb.rpc("club_confirm_member", { p_member: mid });
        if (!s.used_at) await sb.from("club_member_sessions").update({ used_at: new Date().toISOString(), member_id: mid }).eq("id", s.id);
        const sess = await issueSession(site.id, mid as string);
        return json({ valid: true, ...sess });
      }
    }
  } catch (e) {
    console.error("newgang-portal", body.action, (e as Error).message);
    return json({ error: "internal" }, 500);
  }
  return json({ error: "unknown" }, 400);
});
