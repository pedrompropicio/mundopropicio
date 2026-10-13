// newgang-portal — API pública do portal newgangfestival.pt (projeto Lovable separado).
// verify_jwt = false: ABERTA por desenho. Usa service_role no servidor; o portal nunca escreve direto.
// Regras: nenhuma resposta devolve totais de atrações; request_access responde igual exista ou não o email.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { assertNoTotals, buildLineup, displayName } from "./lineup.ts";
import { assemblePublic, bundleFrom, lineupFrom, regulationFrom, termsMeta, type Want } from "./public.ts";
import { clubEmail } from "./email.ts";
import { ASSET_BUCKET, PROOF_BUCKET, PROOF_EXT, missionsFrom, normalizeHandle, normalizeProofUrl } from "./missions.ts";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";

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
    "missions", "mission_upload_url", "submit_mission", "profile"]),
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
});
const WRITE_ACTIONS = new Set(["request_access", "guess", "attendance_claim", "confirm_buyer", "session", "mission_upload_url", "submit_mission", "profile"]);

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
  await sb.from("club_member_sessions").insert({
    site_id: siteId, member_id: memberId, token_hash: await sha256(token), purpose: "access", expires_at: expires,
  });
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

/** Enfileira um email do Clube com link pessoal (sessão access de 30 dias; só o hash fica guardado). */
async function sendClubLink(site: { id: string; company_id: string }, m: { id: string; first_name: string | null; email: string },
  kind: "welcome" | "access", messageId: string) {
  const email = m.email.trim().toLowerCase();
  const { token } = await issueSession(site.id, m.id);
  const link = `https://${SITE_DOMAIN}/clube/entrar?t=${encodeURIComponent(token)}`;
  const greet = m.first_name ? `Olá ${m.first_name},` : "Olá,";
  const unsub = await unsubscribeUrls(site.company_id, email);
  const welcome = kind === "welcome";
  const { html, text } = clubEmail({
    greet,
    lines: welcome
      ? ["Falta só um clique para entrares no Clube Newgang. Confirma o teu email e ganha +100 pontos."]
      : ["Entra na tua área do Clube Newgang com o botão abaixo."],
    cta: welcome ? "Confirmar e entrar no Clube" : "Entrar no Clube",
    link, note: `O link é pessoal e válido durante ${SESSION_DAYS} dias.`, unsubscribeUrl: unsub.page,
  });
  const label = welcome ? "newgang_club_welcome" : "newgang_club_access";
  await sb.from("email_send_log").insert({
    message_id: messageId, template_name: label, recipient_email: email, company_id: site.company_id, status: "pending",
    metadata: { member_id: m.id },
  });
  await sb.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId, company_id: site.company_id, to: email,
      from: `Newgang Festival <clube@${SENDER_DOMAIN}>`, sender_domain: SENDER_DOMAIN,
      subject: welcome ? "Confirma a tua entrada no Clube Newgang" : "O teu acesso ao Clube Newgang",
      html, text, purpose: "transactional", label, idempotency_key: messageId,
      unsubscribe_http_url: unsub.oneClick, queued_at: new Date().toISOString(),
    },
  });
}


/** Cron (service_role): email de boas-vindas aos membros novos do formulário, uma vez por membro. */
async function notifyPending(site: { id: string; company_id: string }, memberId?: string) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  let q = sb.from("club_members").select("id, first_name, email")
    .eq("site_id", site.id).eq("source", "formulario").is("confirmed_at", null).gte("created_at", since);
  if (memberId) q = q.eq("id", memberId);
  const { data: members } = await q.order("created_at").limit(50);
  let sent = 0;
  for (const m of members ?? []) {
    const { data: done } = await sb.from("email_send_log").select("id").eq("template_name", "newgang_club_welcome")
      .eq("metadata->>member_id", m.id).limit(1);
    if (done && done.length) continue;
    try { await sendClubLink(site, m, "welcome", `ng-welcome-${m.id}`); sent++; }
    catch (e) { console.error("notify_pending", m.id, (e as Error).message); }
  }
  return sent;
}

async function mySubmissions(memberId: string) {
  const { data: subs } = await sb.from("club_mission_submissions")
    .select("id, mission_id, status, reject_reason, created_at, club_missions(title, kind)")
    .eq("member_id", memberId).order("created_at", { ascending: false }).limit(200);
  const ids = (subs ?? []).map((x: any) => x.id);
  const { data: pts } = ids.length
    ? await sb.from("club_points").select("ref_id, points").eq("member_id", memberId).in("rule_key", ["mission", "mission_finalist", "mission_winner"]).in("ref_id", ids)
    : { data: [] as any[] };
  const by: Record<string, number> = {};
  for (const p of pts ?? []) by[p.ref_id] = (by[p.ref_id] ?? 0) + p.points;
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
  return { site: data, trackers, ticketing, club: { levels: lv ?? [], rules: rl ?? [], terms: termsMeta(tm) } };
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
  return { editions: data ?? [] };
}

// Leitura pública numa só ida à base: o site com o evento, o line-up e o Clube embutidos (FKs),
// em paralelo com a vista pública do site e as edições. Mede-se ~1 ida (~150 ms) em vez de 2–3.
const LINEUP_COLS = "id, reveal_id, artist_name, artist_image_url, artist_bio_pt, artist_bio_en, category, video_url, listen_url, display_order";
async function loadPublic(want: Want) {
  const embed = [
    "id, event_id, brand_key, company_id",
    want.site ? "club_levels(name, min_points, benefit), club_point_rules(rule_key, label, points, active), club_terms(version, published_at, status)" : "",
    `events(${[
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
  return assemblePublic(want, row, pubRows, eds);
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
    if (b?.action !== "notify_pending") return json({ error: "invalid" }, 400);
    const site = await getSite();
    if (!site) return json({ error: "site_not_configured" }, 503);
    return json({ ok: true, sent: await notifyPending(site) });
  }
  if (!originOk(origin)) return json({ error: "origin" }, 403);
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: z.infer<typeof Body>;
  try {
    const pa = performance.now();
    const p = Body.safeParse(await req.json());
    timer.mark("parse", performance.now() - pa);
    if (!p.success) return json({ error: "invalid", fields: p.error.flatten().fieldErrors }, 400);
    body = p.data;
  } catch { return json({ error: "invalid_json" }, 400); }

  if (WRITE_ACTIONS.has(body.action)) {
    const ipHash = await sha256(clientIp(req) + ":ng");
    const { data: ok } = await sb.rpc("portal_rate_hit", { p_bucket: `ng:${body.action}:${ipHash}`, p_max: 20, p_window_seconds: 600 });
    if (ok === false) return json({ error: "rate_limited" }, 429);
  }

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
        if (!body.email) return json({ error: "email" }, 400);
        const email = body.email.trim().toLowerCase();
        const { data: m } = await sb.from("club_members").select("id, first_name, email").eq("site_id", site.id).ilike("email", email).maybeSingle();
        if (m) await sendClubLink(site, { ...m, email }, "access", crypto.randomUUID());
        return json({ ok: true });
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
        return json({
          first_name: member.first_name, member_no: member.member_no,
          points: me?.points ?? 0, level: me?.level_name ?? null, rank: me?.rank_pos ?? null,
          levels: lv ?? [],
          invite_link: `https://${SITE_DOMAIN}/clube?ref=${member.referral_code}`,
          referral_code: member.referral_code,
          instagram_handle: member.instagram_handle ?? null, tiktok_handle: member.tiktok_handle ?? null,
          submissions: await mySubmissions(member.id),
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
        if (res.error) return json({ error: res.error }, res.error === "closed" || res.error === "already_submitted" || res.error === "duplicate" ? 409 : 400);
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
