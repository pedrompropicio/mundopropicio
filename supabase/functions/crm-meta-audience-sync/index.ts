// crm-meta-audience-sync: sincroniza users (email/phone hashed) para uma Custom Audience Meta
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v19.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const BATCH_SIZE = 10000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const normEmail = (e: string | null) => (e ? e.trim().toLowerCase() : "");
const normPhone = (p: string | null) => {
  if (!p) return "";
  const cleaned = p.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { audience_id?: string; dry_run?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.audience_id) return json({ error: "missing_audience_id" }, 400);
  const dryRun = body.dry_run === true;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Carregar audience (RLS valida acesso do user)
  const { data: aud, error: audErr } = await userClient
    .from("meta_custom_audiences")
    .select("id, name, connection_id, audience_id_meta, company_id, enabled")
    .eq("id", body.audience_id)
    .maybeSingle();
  if (audErr || !aud) return json({ error: "audience_not_found_or_forbidden", detail: audErr?.message }, 404);
  if (!aud.audience_id_meta) return json({ error: "audience_not_linked_to_meta", hint: "Call crm-meta-audience-create first" }, 400);

  // Recolher leads via RPC SECURITY DEFINER
  const { data: leads, error: leadsErr } = await userClient.rpc("crm_meta_audience_collect_leads", {
    p_audience_id: aud.id,
  });
  if (leadsErr) return json({ error: "collect_leads_failed", detail: leadsErr.message }, 500);

  const rows = (leads ?? []) as Array<{ email: string | null; phone: string | null }>;
  const totalLocal = rows.length;

  if (dryRun) {
    const sample = rows.slice(0, 5).map((r) => {
      if (r.email) {
        const [u, d] = r.email.split("@");
        return `${(u ?? "").slice(0, 1)}***@${d ?? ""}`;
      }
      const p = normPhone(r.phone);
      return p ? `***${p.slice(-4)}` : "—";
    });
    return json({ ok: true, dry_run: true, total_records_local: totalLocal, sample });
  }

  // Start log
  const { data: logRow } = await admin
    .from("meta_audience_sync_log")
    .insert({ audience_id: aud.id, status: "started" })
    .select("id")
    .single();
  const logId = logRow?.id as string | undefined;

  // Mark syncing
  await admin.from("meta_custom_audiences").update({ last_sync_status: "syncing" }).eq("id", aud.id);

  // Token
  const { data: linkData, error: linkErr } = await (userClient as any)
    .schema("crm").from("ad_platform_account_links")
    .select("connection_id").eq("id", aud.connection_id).maybeSingle();
  if (linkErr || !linkData) {
    await admin.from("meta_audience_sync_log").update({ status: "error", error_message: "link_not_found", finished_at: new Date().toISOString() }).eq("id", logId!);
    await admin.from("meta_custom_audiences").update({ last_sync_status: "error", last_sync_error: "link_not_found" }).eq("id", aud.id);
    return json({ error: "link_not_found" }, 404);
  }
  const { data: tokenRows, error: tokErr } = await userClient.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: linkData.connection_id, p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    await admin.from("meta_audience_sync_log").update({ status: "error", error_message: "token_decrypt_failed", finished_at: new Date().toISOString() }).eq("id", logId!);
    await admin.from("meta_custom_audiences").update({ last_sync_status: "error", last_sync_error: "token_decrypt_failed" }).eq("id", aud.id);
    return json({ error: "token_decrypt_failed" }, 403);
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;

  // Hash todos os pares (dedupe por email|phone hash combo)
  const seen = new Set<string>();
  const data: [string, string][] = [];
  for (const r of rows) {
    const e = normEmail(r.email);
    const p = normPhone(r.phone);
    const eh = e ? await sha256(e) : "";
    const ph = p ? await sha256(p) : "";
    if (!eh && !ph) continue;
    const key = `${eh}|${ph}`;
    if (seen.has(key)) continue;
    seen.add(key);
    data.push([eh, ph]);
  }

  // Enviar em batches
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${aud.audience_id_meta}/users`;
  let processed = 0;
  let totalMeta: number | undefined;
  let lastResp: any = null;
  const errors: string[] = [];

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const chunk = data.slice(i, i + BATCH_SIZE);
    const payload = {
      schema: ["EMAIL_SHA256", "PHONE_SHA256"],
      data: chunk,
    };
    const params = new URLSearchParams({
      payload: JSON.stringify(payload),
      access_token: accessToken,
    });
    try {
      const r = await fetch(url, { method: "POST", body: params });
      lastResp = await r.json();
      if (!r.ok || lastResp.error) {
        errors.push(`batch ${i}: ${lastResp.error?.message ?? `HTTP ${r.status}`}`);
        continue;
      }
      processed += (lastResp.num_received ?? chunk.length);
      if (typeof lastResp.audience_approximate_count === "number") {
        totalMeta = lastResp.audience_approximate_count;
      }
    } catch (e) {
      errors.push(`batch ${i}: ${String(e)}`);
    }
  }

  const status = errors.length === 0 ? "ok" : (processed > 0 ? "partial" : "error");
  const errMsg = errors.length ? errors.slice(0, 3).join(" | ") : null;

  await admin.from("meta_audience_sync_log").update({
    status, records_processed: processed,
    error_message: errMsg, meta_response: lastResp,
    finished_at: new Date().toISOString(),
  }).eq("id", logId!);

  await admin.from("meta_custom_audiences").update({
    last_synced_at: new Date().toISOString(),
    last_sync_status: status,
    last_sync_error: errMsg,
    total_records_local: totalLocal,
    total_records_meta: totalMeta ?? null,
  }).eq("id", aud.id);

  return json({ ok: status !== "error", status, total_records_local: totalLocal, records_processed: processed, total_records_meta: totalMeta, errors });
});
