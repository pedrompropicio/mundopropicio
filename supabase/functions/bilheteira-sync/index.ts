// bilheteira-sync v1.1
// Varredura diária das páginas públicas das bilheteiras (Ticketline, BOL) para
// atualizar event_marketing.ticket_lots e offer_price_min do portal.
//
// POST {} | { eventId?: string, dryRun?: boolean, triggeredBy?: string }
//
// Auth: service_role (cron, via JWT do Vault ou env) OU JWT de admin/platform_admin.
//
// GUARDRAILS
//  - Só eventos com portal_visible=true, data futura, ticketing_url preenchido e
//    event_marketing.lots_locked=false.
//  - NUNCA marca esgotado automaticamente: se nenhuma zona relevante estiver
//    disponível, não escreve nada (log com possible_soldout).
//  - HTML inesperado / preços estranhos / preço 0 → não escreve, loga erro.
//  - Zonas de mobilidade condicionada/reduzida são ignoradas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  findTicketlineSessionUrl,
  parseTicketlineSession,
  parseBolSectores,
  findBolSectoresUrl,
  buildTicketLots,
  looksSane,
  parseEventInfo,
  type ParseResult,
  type ParsedEventInfo,
  type TicketLotItem,
} from "../_shared/bilheteira-parsers.ts";
import { tolerantFetch } from "../_shared/tolerant-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const VERSION = "v1_4_2026_08_12";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const jwtRole = (authHeader: string | null): string | null => {
  const token = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))?.role ?? null;
  } catch {
    return null;
  }
};

async function fetchHtml(url: string): Promise<{ ok: boolean; status: number; html: string; url: string }> {
  const r = await tolerantFetch(url);
  return { ok: r.ok, status: r.status, html: r.html, url: r.url };
}

type Provider = "ticketline" | "bol";

function detectProvider(url: string, stored: string | null): Provider | null {
  const s = (stored ?? "").toLowerCase();
  if (s === "ticketline" || s === "bol") return s as Provider;
  const u = url.toLowerCase();
  if (u.includes("ticketline.pt")) return "ticketline";
  if (u.includes("bol.pt")) return "bol";
  return null;
}

type Scraped = ParseResult & { info: ParsedEventInfo };

const EMPTY_INFO: ParsedEventInfo = { ageRating: null, doorsTime: null };
/** Info da 1ª página lida (evento) tem prioridade; a da sessão serve de fallback. */
const mergeInfo = (a: ParsedEventInfo, b: ParsedEventInfo): ParsedEventInfo => ({
  ageRating: a.ageRating ?? b.ageRating,
  doorsTime: a.doorsTime ?? b.doorsTime,
});

async function scrape(provider: Provider, ticketingUrl: string): Promise<Scraped> {
  let info = EMPTY_INFO;

  if (provider === "ticketline") {
    let target = ticketingUrl;
    if (!/\/sessao\//i.test(target)) {
      const page = await fetchHtml(target);
      if (!page.ok) throw new Error(`HTTP ${page.status} na página do evento`);
      info = parseEventInfo(page.html);
      const sess = findTicketlineSessionUrl(page.html, page.url);
      if (!sess) throw new Error("Não foi possível encontrar o link da sessão ('Escolha de lugares')");
      target = sess;
    }
    const res = await fetchHtml(target);
    if (!res.ok) throw new Error(`HTTP ${res.status} na página da sessão`);
    const parsed = parseTicketlineSession(res.html, res.url);
    if (parsed.zones.length === 0) throw new Error("HTML inesperado: nenhuma zona encontrada");
    info = mergeInfo(info, parseEventInfo(res.html));
    // Quando o ticketing_url já é a sessão, a info editorial vive na página do
    // evento — segue o link /evento/ da sessão para a ler.
    if (!info.ageRating && !info.doorsTime) {
      const evLink = res.html.match(/href="([^"]*\/evento\/[^"]+)"/i);
      if (evLink) {
        try {
          const evAbs = new URL(evLink[1], res.url).toString();
          const evPage = await fetchHtml(evAbs);
          if (evPage.ok) info = mergeInfo(info, parseEventInfo(evPage.html));
        } catch {
          /* info é best-effort */
        }
      }
    }
    return { ...parsed, info };
  }

  // BOL — o ticketing_url pode ser a página de Sectores, de Sessões ou do evento.
  let target = ticketingUrl;
  for (let hop = 0; hop < 3 && !/\/Sectores\b/i.test(target); hop++) {
    const page = await fetchHtml(target);
    if (!page.ok) throw new Error(`HTTP ${page.status} em ${page.url}`);
    info = mergeInfo(info, parseEventInfo(page.html));
    const next = findBolSectoresUrl(page.html, page.url);
    if (!next) throw new Error("Não foi possível encontrar o link de Sectores na página BOL");
    target = next.url;
    if (!next.needsSessoes) break;
  }
  if (!/\/Sectores\b/i.test(target)) throw new Error("Não foi possível chegar à página de Sectores da BOL");

  const res = await fetchHtml(target);
  if (!res.ok) throw new Error(`HTTP ${res.status} na página BOL`);
  const parsed = parseBolSectores(res.html, res.url);
  if (parsed.zones.length === 0) throw new Error("HTML inesperado: nenhum sector encontrado");
  return { ...parsed, info: mergeInfo(info, parseEventInfo(res.html)) };
}

// Comparação estável (o jsonb do Postgres reordena as chaves).
const normLots = (l: TicketLotItem[] | null) =>
  JSON.stringify(
    (l ?? []).map((x) => [x.label_pt, x.label_en, x.price ?? null, x.status]),
  );
const sameLots = (a: TicketLotItem[] | null, b: TicketLotItem[]) => normLots(a) === normLots(b);

// ---------------------------------------------------------------------------
// Notificação (v1.1) — digest por execução. A sync NUNCA falha por causa do e-mail.
// ---------------------------------------------------------------------------
const PORTAL_BASE = "https://www.mundopropicio.com";
const APP_BASE = Deno.env.get("APP_URL") ?? "https://mpgestaoeventos.com";

interface DigestEvent {
  eventId: string;
  name: string;
  portalUrl: string | null;
  crmUrl: string;
  lines: string[];
  possibleSoldOut?: boolean;
}

const fmtPrice = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : `${Number(v).toLocaleString("pt-PT")} €`;

const lotLabel = (l: TicketLotItem) =>
  l.price ? `${l.label_pt} à venda ${fmtPrice(l.price)}` : l.label_pt;

/** Constrói as linhas legíveis das mudanças aplicadas a um evento. */
function describeChanges(
  changes: Record<string, any>,
): string[] {
  const lines: string[] = [];
  if (changes.offer_price_min) {
    lines.push(
      `Preço mínimo: ${fmtPrice(changes.offer_price_min.from)} → ${fmtPrice(changes.offer_price_min.to)}`,
    );
  }
  if (changes.age_rating) {
    lines.push(`Classificação: ${changes.age_rating.from ?? "—"} → ${changes.age_rating.to ?? "—"}`);
  }
  if (changes.doors_time) {
    lines.push(`Abertura de portas: ${changes.doors_time.from ?? "—"} → ${changes.doors_time.to ?? "—"}`);
  }
  if (changes.ticket_lots) {
    const before = lines.length;
    const from: TicketLotItem[] = changes.ticket_lots.from ?? [];
    const to: TicketLotItem[] = changes.ticket_lots.to ?? [];
    const fromByLabel = new Map(from.map((l) => [l.label_pt, l]));
    const toByLabel = new Map(to.map((l) => [l.label_pt, l]));

    for (const l of to) {
      const prev = fromByLabel.get(l.label_pt);
      if (!prev) {
        lines.push(l.status === "esgotado" ? `${l.label_pt} esgotou` : `Novo: ${lotLabel(l)}`);
      } else if (prev.status !== l.status) {
        lines.push(
          l.status === "esgotado" ? `${l.label_pt} esgotou` : `${lotLabel(l)} (antes: ${prev.status})`,
        );
      } else if (Number(prev.price ?? 0) !== Number(l.price ?? 0)) {
        lines.push(`${l.label_pt}: ${fmtPrice(prev.price)} → ${fmtPrice(l.price)}`);
      }
    }
    for (const l of from) {
      if (!toByLabel.has(l.label_pt)) lines.push(`Removido: ${l.label_pt}`);
    }
    if (lines.length === before) lines.push("Régua de lotes atualizada");
  }
  return lines;
}

async function sendDigest(
  admin: {
    functions: {
      invoke: (name: string, opts: { body: Record<string, unknown> }) => Promise<{ error: unknown }>;
    };
  },
  events: DigestEvent[],
): Promise<{ sent: boolean; reason?: string; recipients?: string[] }> {
  const to = (Deno.env.get("BILHETEIRA_SYNC_NOTIFY_TO") ?? "").trim();
  const cc = (Deno.env.get("BILHETEIRA_SYNC_NOTIFY_CC") ?? "").trim();
  if (!to) {
    console.log("[bilheteira-sync] BILHETEIRA_SYNC_NOTIFY_TO não configurado — e-mail não enviado");
    return { sent: false, reason: "no_recipient_secret" };
  }

  const runAt = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
  const templateData = {
    runAt,
    updatedCount: events.filter((e) => !e.possibleSoldOut).length,
    alertCount: events.filter((e) => e.possibleSoldOut).length,
    events: events.map((e) => ({
      name: e.name,
      portalUrl: e.portalUrl,
      crmUrl: e.crmUrl,
      lines: e.lines,
      possibleSoldOut: e.possibleSoldOut === true,
    })),
  };

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const recipients = cc ? [to, cc] : [to];
  let sent = false;
  let reason: string | undefined;

  for (const rcpt of recipients) {
    try {
      const { error } = await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "bilheteira-sync-digest",
          recipientEmail: rcpt,
          idempotencyKey: `bilheteira-sync-${stamp}-${rcpt}`,
          templateData,
        },
      });
      if (error) throw error;
      sent = true;
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
      console.error(`[bilheteira-sync] falha ao enviar e-mail para ${rcpt}: ${reason}`);
    }
  }
  return { sent, reason, recipients };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  const isServiceRole = auth === `Bearer ${SERVICE_ROLE}` || jwtRole(auth) === "service_role";

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  if (!isServiceRole) {
    // JWT de utilizador → tem de ser admin/platform_admin
    const token = auth?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Não autenticado" }, 401);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const ok = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "platform_admin");
    if (!ok) return json({ error: "Sem permissão" }, 403);
  }

  let body: { eventId?: string; dryRun?: boolean; triggeredBy?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* corpo vazio = corrida completa */
  }
  const dryRun = body.dryRun === true;

  const today = new Date().toISOString().slice(0, 10);

  let q = admin
    .from("events")
    .select("id, name, slug, date, ticketing_url, ticketing_provider, portal_visible")
    .eq("portal_visible", true)
    .not("ticketing_url", "is", null)
    .gte("date", today);
  if (body.eventId) q = admin
    .from("events")
    .select("id, name, slug, date, ticketing_url, ticketing_provider, portal_visible")
    .eq("id", body.eventId);

  const { data: events, error: evErr } = await q;
  if (evErr) return json({ error: evErr.message }, 500);

  const ids = (events ?? []).map((e) => e.id);
  const { data: marketing } = ids.length
    ? await admin
        .from("event_marketing")
        .select("event_id, lots_locked, ticket_lots, offer_price_min, offer_availability, age_rating, doors_time")
        .in("event_id", ids)
    : { data: [] as any[] };
  const mkByEvent = new Map((marketing ?? []).map((m: any) => [m.event_id, m]));

  const results: unknown[] = [];
  const digest: DigestEvent[] = [];
  // Logs adiados: só são inseridos depois de sabermos se o e-mail seguiu.
  const pendingLogs: Record<string, unknown>[] = [];

  for (const ev of events ?? []) {
    const mk = mkByEvent.get(ev.id);
    if (mk?.lots_locked) {
      results.push({ event: ev.name, skipped: "lots_locked" });
      continue;
    }
    if (!ev.ticketing_url) {
      results.push({ event: ev.name, skipped: "sem ticketing_url" });
      continue;
    }
    const provider = detectProvider(ev.ticketing_url, ev.ticketing_provider);
    if (!provider) {
      results.push({ event: ev.name, skipped: `provider não suportado (${ev.ticketing_provider ?? "—"})` });
      continue;
    }

    const logRow: Record<string, unknown> = {
      event_id: ev.id,
      provider,
      url: ev.ticketing_url,
      parse_ok: false,
      raw_summary: null,
      changes: null,
      error: null,
    };

    try {
      const parsed = await scrape(provider, ev.ticketing_url);
      const rawSummary = {
        version: VERSION,
        read_url: parsed.url,
        event_title: parsed.eventTitle ?? null,
        zones: parsed.zones,
      };
      logRow.raw_summary = rawSummary;
      logRow.url = parsed.url;
      logRow.parse_ok = true;

      if (!looksSane(parsed.zones)) {
        logRow.parse_ok = false;
        logRow.error = "Valores implausíveis (preço 0 ou fora de gama) — nada escrito";
        results.push({ event: ev.name, status: "insane_values" });
        await admin.from("bilheteira_sync_log").insert(logRow);
        continue;
      }

      const built = buildTicketLots(parsed.zones);

      const changes: Record<string, unknown> = {};
      const payload: Record<string, unknown> = { event_id: ev.id };

      // Info editorial (v1.4): classificação etária e abertura de portas.
      if (parsed.info.ageRating && (mk?.age_rating ?? null) !== parsed.info.ageRating) {
        changes.age_rating = { from: mk?.age_rating ?? null, to: parsed.info.ageRating };
        payload.age_rating = parsed.info.ageRating;
      }
      if (parsed.info.doorsTime && (mk?.doors_time ?? null) !== parsed.info.doorsTime) {
        changes.doors_time = { from: mk?.doors_time ?? null, to: parsed.info.doorsTime };
        payload.doors_time = parsed.info.doorsTime;
      }

      if (built.possibleSoldOut) {
        // REGRA CRÍTICA: nunca marcar esgotado automaticamente (lotes/preço intactos).
        if (!dryRun && Object.keys(payload).length > 1) {
          payload.updated_at = new Date().toISOString();
          const { error: upErr } = mk
            ? await admin.from("event_marketing").update(payload).eq("event_id", ev.id)
            : await admin.from("event_marketing").insert(payload);
          if (upErr) throw new Error(`Falha ao gravar: ${upErr.message}`);
        }
        logRow.changes = { possible_soldout: true, applied: false, dry_run: dryRun, ...changes };
        results.push({ event: ev.name, status: "possible_soldout", applied: false, changes });
        digest.push({
          eventId: ev.id,
          name: ev.name,
          portalUrl: ev.slug ? `${PORTAL_BASE}/eventos/${ev.slug}` : null,
          crmUrl: `${APP_BASE}/crm/eventos/${ev.id}`,
          lines: describeChanges(changes),
          possibleSoldOut: true,
        });
        pendingLogs.push(logRow);
        continue;
      }

      if (!sameLots(mk?.ticket_lots ?? null, built.ticketLots)) {
        changes.ticket_lots = { from: mk?.ticket_lots ?? null, to: built.ticketLots };
        payload.ticket_lots = built.ticketLots;
      }
      if (built.offerPriceMin !== null && Number(mk?.offer_price_min ?? NaN) !== built.offerPriceMin) {
        changes.offer_price_min = { from: mk?.offer_price_min ?? null, to: built.offerPriceMin };
        payload.offer_price_min = built.offerPriceMin;
      }

      if (Object.keys(changes).length === 0) {
        logRow.changes = { applied: false, reason: "sem alterações" };
        results.push({ event: ev.name, status: "unchanged" });
        await admin.from("bilheteira_sync_log").insert(logRow);
        continue;
      }

      if (!dryRun) {
        payload.updated_at = new Date().toISOString();
        const { error: upErr } = mk
          ? await admin.from("event_marketing").update(payload).eq("event_id", ev.id)
          : await admin.from("event_marketing").insert(payload);
        if (upErr) throw new Error(`Falha ao gravar: ${upErr.message}`);
      }

      logRow.changes = { applied: !dryRun, dry_run: dryRun, ...changes };
      results.push({ event: ev.name, status: dryRun ? "would_update" : "updated", changes });
      digest.push({
        eventId: ev.id,
        name: ev.name,
        portalUrl: ev.slug ? `${PORTAL_BASE}/eventos/${ev.slug}` : null,
        crmUrl: `${APP_BASE}/crm/eventos/${ev.id}`,
        lines: describeChanges(changes),
      });
    } catch (e) {
      logRow.error = e instanceof Error ? e.message : String(e);
      results.push({ event: ev.name, status: "error", error: logRow.error });
    }

    pendingLogs.push(logRow);
  }

  // ---- Notificação: só quando há mudanças aplicadas OU alerta possible_soldout ----
  let email: { sent: boolean; reason?: string; recipients?: string[] } = { sent: false, reason: "no_changes" };
  if (digest.length > 0 && !dryRun) {
    email = await sendDigest(admin, digest);
  } else if (dryRun && digest.length > 0) {
    email = { sent: false, reason: "dry_run" };
  }

  const notifiedIds = new Set(digest.map((d) => d.eventId));
  for (const row of pendingLogs) {
    if (notifiedIds.has(row.event_id as string)) {
      row.changes = {
        ...((row.changes as Record<string, unknown>) ?? {}),
        email_sent: email.sent,
        ...(email.sent ? {} : { email_skip_reason: email.reason ?? null }),
      };
    }
    await admin.from("bilheteira_sync_log").insert(row);
  }

  return json({
    version: VERSION,
    triggered_by: body.triggeredBy ?? "manual",
    dry_run: dryRun,
    scanned: (events ?? []).length,
    email_sent: email.sent,
    email_reason: email.sent ? undefined : email.reason,
    results,
  });
});
