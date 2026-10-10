// ticketline-crosscheck — vigia diária: portal de Produtores da Ticketline vs plataforma.
// Uma linha por evento e por dia em ticketline_crosscheck_runs (upsert por config_id+checked_on).
// UMA tentativa de login por corrida; falha → linhas 'erro' e termina. O alerta é a condição (e)
// de check_ticketing_sync_health(). Não toca na captação existente.
import { createClient } from "npm:@supabase/supabase-js@2";
import { ProdutoresSession, venueTokens, type OccupationTotal } from "../_shared/ticketline-produtores.ts";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUDGET_MS = 120_000;

const lisbonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

async function pagedAll(q: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q(f, f + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Mesma regra dos ecrãs (src/lib/ticketline-cutoff.ts): ticket_sales até ao corte + série diária depois. */
async function ourTotals(admin: any, cfg: any): Promise<{ qty: number; value: number }> {
  const zones = (await admin.from("event_ticket_zones").select("id").eq("event_id", cfg.event_id)).data ?? [];
  const zoneIds = zones.map((z: any) => z.id);
  if (zoneIds.length === 0) return { qty: 0, value: 0 };
  const lots = (await admin.from("event_ticket_lots").select("id").in("zone_id", zoneIds)).data ?? [];
  const lotIds = lots.map((l: any) => l.id);
  const orParts = [`zone_id.in.(${zoneIds.join(",")})`];
  if (lotIds.length) orParts.push(`lot_id.in.(${lotIds.join(",")})`);
  const rows = await pagedAll((a, b) => admin.from("ticket_sales").select("id, sale_date, quantity, unit_price, total_value").or(orParts.join(",")).order("id").range(a, b));
  const cut = cfg.promotores_migrated_at && cfg.promotores_cutoff_date ? String(cfg.promotores_cutoff_date).slice(0, 10) : null;
  let qty = 0, value = 0;
  for (const s of rows) {
    if (cut && String(s.sale_date).slice(0, 10) > cut) continue;
    qty += Number(s.quantity || 0);
    value += s.total_value !== null && s.total_value !== undefined ? Number(s.total_value) : Number(s.quantity || 0) * Number(s.unit_price || 0);
  }
  if (cut) {
    const days = (await admin.from("ticketline_daily_sales").select("sale_date, quantity, total_value").eq("event_id", cfg.event_id).gt("sale_date", cut).limit(10000)).data ?? [];
    for (const d of days) { qty += Number(d.quantity || 0); value += Number(d.total_value || 0); }
  }
  return { qty, value: Math.round(value * 100) / 100 };
}

/** Correspondência por data + recinto, nunca pelo nome. */
function matches(cfg: any, occ: OccupationTotal, sameDateCount: number): boolean {
  if (!occ.session || occ.session.slice(0, 10) !== String(cfg.date).slice(0, 10)) return false;
  const ours = venueTokens(cfg.venue);
  if (ours.size === 0) return sameDateCount === 1; // sem recinto nosso: só se for o único na data
  const theirs = venueTokens(occ.venue);
  let common = 0;
  for (const t of ours) if (theirs.has(t)) common++;
  return common >= Math.min(2, ours.size);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  // #283 resto (D-ERP229): service role verificada no Auth (isServiceRoleRequest), nunca pelo payload.
  if (!(await isServiceRoleRequest(req))) {
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "sem sessão" }, 401);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!(roles ?? []).some((r: any) => ["admin", "platform_admin"].includes(r.role))) return json({ error: "sem permissão" }, 403);
  }
  const t0 = Date.now();
  const today = lisbonToday();

  const { data: cfgRows, error: cfgErr } = await admin
    .from("ticketline_sync_config")
    .select("id, company_id, event_id, promotores_migrated_at, promotores_cutoff_date, events!inner(name, date, venues(name))")
    .eq("enabled", true);
  if (cfgErr) return json({ error: cfgErr.message }, 500);
  const cfgs = (cfgRows ?? []).map((c: any) => ({ ...c, name: c.events?.name, date: c.events?.date, venue: c.events?.venues?.name ?? null }));

  const write = async (rows: any[]) => {
    if (!rows.length) return;
    const { error } = await admin.from("ticketline_crosscheck_runs").upsert(rows, { onConflict: "config_id,checked_on" });
    if (error) throw new Error(`gravar: ${error.message}`);
  };
  const base = (c: any) => ({ company_id: c.company_id, config_id: c.id, event_id: c.event_id, checked_on: today, checked_at: new Date().toISOString() });

  const user = Deno.env.get("TICKETLINE_PRODUTORES_USER");
  const pass = Deno.env.get("TICKETLINE_PRODUTORES_PASSWORD");
  const session = new ProdutoresSession();
  try {
    if (!user || !pass) throw new Error("secrets TICKETLINE_PRODUTORES_* em falta");
    await session.login(user, pass); // uma tentativa, sem repetição
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await write(cfgs.map((c) => ({ ...base(c), status: "erro", error_message: msg })));
    return json({ ok: false, login: false, error: msg, configs: cfgs.length });
  }

  const portal = session.listEvents().filter((p) => !/cancelad/i.test(p.nome));
  // Ids já correspondidos em leituras anteriores são tentados primeiro (voltam a ser verificados por data + recinto).
  const { data: prev } = await admin.from("ticketline_crosscheck_runs")
    .select("config_id, produtores_event_id, checked_on").not("produtores_event_id", "is", null)
    .order("checked_on", { ascending: false }).limit(500);
  const hint = new Map<string, string>();
  for (const p of prev ?? []) if (!hint.has(p.config_id)) hint.set(p.config_id, p.produtores_event_id);

  const occCache = new Map<string, OccupationTotal | Error>();
  const readOcc = async (id: string) => {
    if (!occCache.has(id)) {
      try { occCache.set(id, await session.occupation(id)); } catch (e) { occCache.set(id, e as Error); }
    }
    return occCache.get(id)!;
  };
  const found = new Map<string, OccupationTotal>();
  const pending = new Set(cfgs.map((c) => c.id));
  const cfgById = new Map(cfgs.map((c) => [c.id, c]));
  const countSameDate = (date: string) => cfgs.filter((c) => String(c.date).slice(0, 10) === date).length;

  const tryMatch = (occ: OccupationTotal) => {
    const cands = [...pending].map((id) => cfgById.get(id)!).filter((c) => matches(c, occ, countSameDate(String(c.date).slice(0, 10))));
    if (cands.length === 1) { found.set(cands[0].id, occ); pending.delete(cands[0].id); }
  };

  for (const c of cfgs) {
    const h = hint.get(c.id);
    if (!h || !pending.has(c.id)) continue;
    const occ = await readOcc(h);
    if (!(occ instanceof Error)) tryMatch(occ);
  }
  const ordered = [...portal].sort((a, b) => Number(b.id) - Number(a.id));
  let timedOut = false;
  for (const p of ordered) {
    if (pending.size === 0) break;
    if (Date.now() - t0 > BUDGET_MS) { timedOut = true; break; }
    if (occCache.has(p.id)) continue;
    const occ = await readOcc(p.id);
    if (!(occ instanceof Error)) tryMatch(occ);
  }
  // Ambiguidade de portal: o mesmo id do portal nunca serve dois eventos nossos (garantido por tryMatch).

  const rows: any[] = [];
  const summary: any[] = [];
  for (const c of cfgs) {
    const occ = found.get(c.id);
    if (!occ) {
      const row = { ...base(c), status: timedOut ? "erro" : "nao_encontrado", error_message: timedOut ? "tempo esgotado antes de percorrer o portal todo" : null };
      rows.push(row); summary.push({ evento: c.name, status: row.status });
      continue;
    }
    try {
      const ours = await ourTotals(admin, c);
      const dq = ours.qty - occ.qty;
      const dv = Math.round((ours.value - occ.value) * 100) / 100;
      rows.push({ ...base(c), produtores_event_id: occ.id, status: dq === 0 && dv === 0 ? "ok" : "divergente",
        our_qty: ours.qty, our_value: ours.value, portal_qty: occ.qty, portal_value: occ.value, diff_qty: dq, diff_value: dv });
      summary.push({ evento: c.name, portal: occ.id, ours, portal_tot: { qty: occ.qty, value: occ.value }, dq, dv });
    } catch (e) {
      rows.push({ ...base(c), produtores_event_id: occ.id, status: "erro", error_message: String((e as Error).message ?? e).slice(0, 300) });
      summary.push({ evento: c.name, status: "erro" });
    }
  }
  await write(rows);
  return json({ ok: true, checked_on: today, ms: Date.now() - t0, portal_reads: occCache.size, results: summary });
});
