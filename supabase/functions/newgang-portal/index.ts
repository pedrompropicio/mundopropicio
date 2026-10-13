// newgang-portal — API pública do portal newgangfestival.pt (projeto Lovable separado).
// verify_jwt = false: ABERTA por desenho. Usa service_role no servidor; o portal nunca escreve direto.
// Regras: nenhuma resposta devolve totais de atrações; request_access responde igual exista ou não o email.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { assertNoTotals, buildLineup, displayName } from "./lineup.ts";

// Pedro: preencher o preview do projeto novo (ex.: "--<projectId>.lovable.app").
const PREVIEW_SUFFIXES: string[] = [];
const ALLOWED_ORIGINS = new Set<string>([
  "https://newgangfestival.pt",
  "https://www.newgangfestival.pt",
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
  action: z.enum(["site", "lineup", "history", "ranking", "request_access", "session", "me", "guess", "attendance_claim", "confirm_buyer"]),
  token: z.string().min(20).max(200).optional(),
  email: z.string().email().max(254).optional(),
  reveal_id: z.string().uuid().optional(),
  guess: z.string().trim().min(1).max(120).optional(),
  year: z.number().int().min(2023).max(2100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
const WRITE_ACTIONS = new Set(["request_access", "guess", "attendance_claim", "confirm_buyer", "session"]);

async function getSite() {
  const { data } = await sb.from("portal_sites").select("*").eq("domain", SITE_DOMAIN).eq("active", true).maybeSingle();
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

async function rankingFor(siteId: string, limit = 100) {
  const { data } = await sb.rpc("club_ranking", { p_site: siteId, p_limit: 100000 });
  const rows = (data ?? []) as Array<{ member_id: string; first_name: string | null; email: string; points: number; level_name: string | null; rank_pos: number }>;
  return { rows, top: rows.slice(0, limit) };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  const json = (b: unknown, status = 200) => {
    assertNoTotals(b);
    return new Response(JSON.stringify(b), { status, headers: { ...h, "Content-Type": "application/json" } });
  };
  if (!originOk(origin)) return json({ error: "origin" }, 403);
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: z.infer<typeof Body>;
  try {
    const p = Body.safeParse(await req.json());
    if (!p.success) return json({ error: "invalid", fields: p.error.flatten().fieldErrors }, 400);
    body = p.data;
  } catch { return json({ error: "invalid_json" }, 400); }

  if (WRITE_ACTIONS.has(body.action)) {
    const ipHash = await sha256(clientIp(req) + ":ng");
    const { data: ok } = await sb.rpc("portal_rate_hit", { p_bucket: `ng:${body.action}:${ipHash}`, p_max: 20, p_window_seconds: 600 });
    if (ok === false) return json({ error: "rate_limited" }, 429);
  }

  const site = await getSite();
  if (!site) return json({ error: "site_not_configured" }, 503);
  const member = await memberFromToken(site.id, body.token);

  try {
    switch (body.action) {
      case "site": {
        const { data } = await sb.from("portal_sites_public").select("*").eq("id", site.id).maybeSingle();
        let trackers: unknown[] = [];
        let ticketing: unknown = null;
        if (site.event_id) {
          // Trackers do evento associado ao site, sempre (independente de events.portal_visible).
          const { data: t } = await sb.from("event_trackers").select("platform, tracker_id").eq("event_id", site.event_id);
          trackers = t ?? [];
          const { data: ev } = await sb.from("events").select("ticketing_url").eq("id", site.event_id).maybeSingle();
          const { data: em } = await sb.from("event_marketing").select("ticket_lots").eq("event_id", site.event_id).maybeSingle();
          ticketing = { url: ev?.ticketing_url ?? null, lots: em?.ticket_lots ?? null };
        }
        return json({ site: data, trackers, ticketing });
      }
      case "lineup": {
        if (!site.event_id) return json({ state: "expectativa", latest_reveal: null, confirmed: [], next_reveal: null });
        const [{ data: reveals }, { data: acts }, { data: em }] = await Promise.all([
          sb.from("event_lineup_reveals").select("id, club_at, public_at, clues, status").eq("event_id", site.event_id),
          sb.from("event_lineups").select("id, reveal_id, artist_name, artist_image_url, artist_bio_pt, artist_bio_en, category, video_url, listen_url, display_order").eq("event_id", site.event_id).not("reveal_id", "is", null),
          sb.from("event_marketing").select("lineup_complete").eq("event_id", site.event_id).maybeSingle(),
        ]);
        return json(buildLineup({
          reveals: reveals ?? [], acts: acts ?? [], now: new Date(), isMember: !!member?.confirmed_at,
          lineupComplete: !!em?.lineup_complete,
        }));
      }
      case "history": {
        const { data } = await sb.from("festival_editions_public").select("*").eq("brand_key", site.brand_key)
          .order("year", { ascending: false }).order("sort");
        return json({ editions: data ?? [] });
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
        const { data: m } = await sb.from("club_members").select("id, first_name").eq("site_id", site.id).ilike("email", email).maybeSingle();
        if (m) {
          const { token } = await issueSession(site.id, m.id);
          const link = `https://${SITE_DOMAIN}/clube/entrar?t=${encodeURIComponent(token)}`;
          const messageId = crypto.randomUUID();
          const greet = m.first_name ? `Olá ${m.first_name},` : "Olá,";
          await sb.from("email_send_log").insert({ message_id: messageId, template_name: "newgang_club_access", recipient_email: email, company_id: site.company_id, status: "pending" });
          await sb.rpc("enqueue_email", {
            queue_name: "transactional_emails",
            payload: {
              message_id: messageId, company_id: site.company_id, to: email,
              from: `Newgang Festival <clube@${SENDER_DOMAIN}>`, sender_domain: SENDER_DOMAIN,
              subject: "O teu acesso ao Clube Newgang",
              html: `<p>${greet}</p><p>Entra na tua área do Clube Newgang:</p><p><a href="${link}">Entrar no Clube</a></p><p>O link é pessoal e válido durante ${SESSION_DAYS} dias.</p>`,
              text: `${greet}\n\nEntra na tua área do Clube Newgang: ${link}\n\nO link é pessoal e válido durante ${SESSION_DAYS} dias.`,
              purpose: "transactional", label: "newgang_club_access", idempotency_key: messageId,
              queued_at: new Date().toISOString(),
            },
          });
        }
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
