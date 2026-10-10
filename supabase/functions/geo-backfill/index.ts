// geo-backfill (#254) — enche geo_country/city/region em redirect_log e
// lead_capture (últimos 7 dias, ip_inet preenchido, geo_country null) via
// lookupIpGeo cacheado. Só service_role (molde portal-media-import).
// Corpo: {"dry_run": boolean} — default TRUE; o cron tem de mandar false explícito.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";
import { lookupIpGeo } from "../_shared/geo.ts";

const TABLES = ["redirect_log", "lead_capture"] as const;
const BATCH = 200;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await isServiceRoleRequest(req))) {
    return json({ error: "Não autorizado — esta função só aceita a service_role key." }, 401);
  }
  let body: any = {};
  try { body = (await req.json()) ?? {}; } catch { /* vazio */ }
  const dryRun = body.dry_run !== false;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const out: Record<string, { candidates: number; filled: number; unresolved: number }> = {};

  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select("id, ip_inet")
      .gte("created_at", since).not("ip_inet", "is", null).is("geo_country", null)
      .order("created_at", { ascending: false }).range(0, BATCH - 1);
    if (error) { out[t] = { candidates: -1, filled: 0, unresolved: 0 }; console.error("[geo-backfill]", t, error.message); continue; }
    let filled = 0, unresolved = 0;
    for (const row of data ?? []) {
      const ip = String(row.ip_inet).replace(/\/\d+$/, "");
      const g = await lookupIpGeo(ip, { timeoutMs: 3000, tag: "geo-backfill" });
      if (!g.country) { unresolved++; continue; }
      if (!dryRun) {
        const { error: ue } = await sb.from(t)
          .update({ geo_country: g.country, geo_city: g.city, geo_region: g.region })
          .eq("id", row.id).is("geo_country", null);
        if (ue) { console.error("[geo-backfill] update", t, ue.message); continue; }
      }
      filled++;
    }
    out[t] = { candidates: data?.length ?? 0, filled, unresolved };
  }
  console.log("[geo-backfill]", JSON.stringify({ dryRun, out }));
  return json({ ok: true, dry_run: dryRun, tables: out });
});
