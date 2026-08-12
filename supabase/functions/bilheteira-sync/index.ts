// bilheteira-sync v1
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
  buildTicketLots,
  looksSane,
  type ParseResult,
  type TicketLotItem,
} from "../_shared/bilheteira-parsers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const VERSION = "v1_2026_08_12";
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

async function fetchHtml(url: string): Promise<{ ok: boolean; status: number; html: string }> {
  const r = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9" },
  });
  const html = await r.text();
  return { ok: r.ok, status: r.status, html };
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

async function scrape(provider: Provider, ticketingUrl: string): Promise<ParseResult> {
  if (provider === "ticketline") {
    let target = ticketingUrl;
    if (!/\/sessao\//i.test(target)) {
      const page = await fetchHtml(target);
      if (!page.ok) throw new Error(`HTTP ${page.status} na página do evento`);
      const sess = findTicketlineSessionUrl(page.html, target);
      if (!sess) throw new Error("Não foi possível encontrar o link da sessão ('Escolha de lugares')");
      target = sess;
    }
    const res = await fetchHtml(target);
    if (!res.ok) throw new Error(`HTTP ${res.status} na página da sessão`);
    const parsed = parseTicketlineSession(res.html, target);
    if (parsed.zones.length === 0) throw new Error("HTML inesperado: nenhuma zona encontrada");
    return parsed;
  }

  // BOL
  const res = await fetchHtml(ticketingUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} na página BOL`);
  const parsed = parseBolSectores(res.html, ticketingUrl);
  if (parsed.zones.length === 0) throw new Error("HTML inesperado: nenhum sector encontrado");
  return parsed;
}

const sameLots = (a: TicketLotItem[] | null, b: TicketLotItem[]) =>
  JSON.stringify(a ?? []) === JSON.stringify(b);

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
    .select("id, name, date, ticketing_url, ticketing_provider, portal_visible")
    .eq("portal_visible", true)
    .not("ticketing_url", "is", null)
    .gte("date", today);
  if (body.eventId) q = admin
    .from("events")
    .select("id, name, date, ticketing_url, ticketing_provider, portal_visible")
    .eq("id", body.eventId);

  const { data: events, error: evErr } = await q;
  if (evErr) return json({ error: evErr.message }, 500);

  const ids = (events ?? []).map((e) => e.id);
  const { data: marketing } = ids.length
    ? await admin
        .from("event_marketing")
        .select("event_id, lots_locked, ticket_lots, offer_price_min, offer_availability")
        .in("event_id", ids)
    : { data: [] as any[] };
  const mkByEvent = new Map((marketing ?? []).map((m: any) => [m.event_id, m]));

  const results: unknown[] = [];

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

      if (built.possibleSoldOut) {
        // REGRA CRÍTICA: nunca marcar esgotado automaticamente.
        logRow.changes = { possible_soldout: true, applied: false };
        results.push({ event: ev.name, status: "possible_soldout", applied: false });
        await admin.from("bilheteira_sync_log").insert(logRow);
        continue;
      }

      const changes: Record<string, unknown> = {};
      if (!sameLots(mk?.ticket_lots ?? null, built.ticketLots)) {
        changes.ticket_lots = { from: mk?.ticket_lots ?? null, to: built.ticketLots };
      }
      if (built.offerPriceMin !== null && Number(mk?.offer_price_min ?? NaN) !== built.offerPriceMin) {
        changes.offer_price_min = { from: mk?.offer_price_min ?? null, to: built.offerPriceMin };
      }

      if (Object.keys(changes).length === 0) {
        logRow.changes = { applied: false, reason: "sem alterações" };
        results.push({ event: ev.name, status: "unchanged" });
        await admin.from("bilheteira_sync_log").insert(logRow);
        continue;
      }

      if (!dryRun) {
        const payload: Record<string, unknown> = {
          event_id: ev.id,
          ticket_lots: built.ticketLots,
          offer_price_min: built.offerPriceMin,
          updated_at: new Date().toISOString(),
        };
        const { error: upErr } = mk
          ? await admin.from("event_marketing").update(payload).eq("event_id", ev.id)
          : await admin.from("event_marketing").insert(payload);
        if (upErr) throw new Error(`Falha ao gravar: ${upErr.message}`);
      }

      logRow.changes = { applied: !dryRun, dry_run: dryRun, ...changes };
      results.push({ event: ev.name, status: dryRun ? "would_update" : "updated", changes });
    } catch (e) {
      logRow.error = e instanceof Error ? e.message : String(e);
      results.push({ event: ev.name, status: "error", error: logRow.error });
    }

    await admin.from("bilheteira_sync_log").insert(logRow);
  }

  return json({
    version: VERSION,
    triggered_by: body.triggeredBy ?? "manual",
    dry_run: dryRun,
    scanned: (events ?? []).length,
    results,
  });
});
