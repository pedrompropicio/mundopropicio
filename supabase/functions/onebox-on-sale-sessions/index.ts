// onebox-on-sale-sessions — passo "Sessões à venda" do PROC-vendas-onebox-madrid.md (#143).
// Lê a página pública do ECI (sem credenciais), marca on_sale nas zonas do H&K Madrid
// cujo nome (DD/MM/AAAA HH:MM) corresponda a uma sessão listada.
// Travas: <5 sessões lidas → não escreve; sessão sem zona no ERP → não cria, assinala;
// regista no import_audit (onebox_sync_runs, mode 'on_sale_edge') listadas/true/false/mudanças.
// Body: { dry_run?: boolean } — por omissão NÃO escreve.
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertCallerRoleInCompany, isServiceRoleRequest, errorResponse } from "../_shared/multiTenant.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PAGE = "https://checkoutentradas2.elcorteingles.es/elcorteingles/events/59508";
const EVENT_ID = "bf9ce2d8-754e-4485-8427-e2d486c39919";
const COMPANY_ID = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const MIN_SESSIONS = 5;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const pad = (n: string | number) => String(n).padStart(2, "0");

/** Extrai sessões "DD/MM/AAAA HH:MM" de texto/JSON (aceita também ISO AAAA-MM-DDTHH:MM). */
export function extractSessions(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})[^0-9<]{0,15}?(\d{1,2}):(\d{2})\b/g)) {
    out.add(`${pad(m[1])}/${pad(m[2])}/${m[3]} ${pad(m[4])}:${m[5]}`);
  }
  for (const m of html.matchAll(/\b(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/g)) {
    out.add(`${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`);
  }
  return [...out].sort();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (!(await isServiceRoleRequest(req))) {
    try { await assertCallerRoleInCompany(req, COMPANY_ID, ["admin", "manager", "platform_admin"]); }
    catch (e) { return errorResponse(e); }
  }
  let body: { dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const dryRun = body.dry_run !== false;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const startedAt = new Date().toISOString();
  const audit: Record<string, unknown> = { passo: "sessoes_a_venda", origem: "edge", dry_run: dryRun, pagina: PAGE };

  const record = async (status: string, error_message: string | null) => {
    if (dryRun) return;
    await admin.from("onebox_sync_runs").insert({
      company_id: COMPANY_ID, started_at: startedAt, finished_at: new Date().toISOString(),
      status, mode: "on_sale_edge", triggered_by: "edge", error_message, import_audit: audit,
    });
  };

  let html = "";
  try {
    const res = await fetch(PAGE, { headers: { "User-Agent": UA, "Accept": "text/html,application/json", "Accept-Language": "es-ES,es;q=0.9" } });
    html = await res.text();
    audit.http_status = res.status;
    audit.bytes = html.length;
    if (!res.ok) {
      audit.cloudflare = /cloudflare/i.test(html);
      await record("failed", `página ECI respondeu ${res.status}`);
      return json({ status: "failed", motivo: `página ECI inalcançável (${res.status})`, audit });
    }
  } catch (e) {
    audit.fetch_error = String(e);
    await record("failed", "página ECI inalcançável");
    return json({ status: "failed", motivo: "página ECI inalcançável", audit });
  }

  const listed = extractSessions(html);
  audit.listadas = listed.length;
  audit.sessoes_lidas = listed;

  const { data: zones, error } = await admin.from("event_ticket_zones")
    .select("id, name, on_sale").eq("event_id", EVENT_ID);
  if (error) return json({ status: "failed", motivo: error.message }, 500);

  const listedSet = new Set(listed);
  const zoneNames = new Set((zones ?? []).map((z) => z.name.trim()));
  const semZona = listed.filter((s) => !zoneNames.has(s));
  const changes = (zones ?? []).map((z) => ({ id: z.id, name: z.name, antes: z.on_sale, depois: listedSet.has(z.name.trim()) }))
    .filter((c) => c.antes !== c.depois);
  audit.sessoes_sem_zona_no_erp = semZona;
  audit.true = (zones ?? []).filter((z) => listedSet.has(z.name.trim())).length;
  audit.false = (zones ?? []).length - (audit.true as number);
  audit.mudancas = changes.map(({ name, antes, depois }) => ({ name, antes, depois }));

  if (listed.length < MIN_SESSIONS) {
    audit.bloqueado = `menos de ${MIN_SESSIONS} sessões lidas — nada escrito`;
    await record("failed", audit.bloqueado as string);
    return json({ status: "blocked", audit });
  }
  if (!dryRun) {
    for (const c of changes) {
      const { error: uErr } = await admin.from("event_ticket_zones").update({ on_sale: c.depois }).eq("id", c.id);
      if (uErr) { audit.erro_escrita = uErr.message; await record("failed", uErr.message); return json({ status: "failed", audit }, 500); }
    }
  }
  await record("success", null);
  return json({ status: dryRun ? "dry_run" : "success", audit });
});
