// cold-start trigger: 2026-06-01-v2 secret rotation
// TEMP read-only diagnostic. GET-only against Graph API. No mutations.
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const CONN_ID = "3c234235-0ac5-4afc-a06e-259bdea0ae7a";
const IDS = [
  "120253192608000595",
  "120253192741880595",
  "120252475946740595",
  "120253192833730595",
  "120252475860980595",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (!MASTER_KEY) {
      return new Response(JSON.stringify({
        error: "missing_master_key",
        env_keys: Object.keys(Deno.env.toObject()).filter(k => !k.includes("SUPABASE")),
      }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: rows, error } = await admin.rpc("crm_get_meta_decrypted_token", {
      p_connection_id: CONN_ID,
      p_master_key: MASTER_KEY,
    });
    if (error || !rows || (Array.isArray(rows) && rows.length === 0)) {
      return new Response(JSON.stringify({ error: "rpc_failed", detail: error?.message, rows }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const token = (Array.isArray(rows) ? rows[0] : rows).access_token as string;

    const fields = "id,name,subtype,description,retention_days,operation_status,approximate_count_lower_bound,approximate_count_upper_bound,lookalike_spec";
    const results: any[] = [];
    for (const id of IDS) {
      const u = `https://graph.facebook.com/v18.0/${id}?fields=${fields}&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(u); // GET only
      const j = await r.json();
      results.push({ id, http_status: r.status, data: j });
    }
    return new Response(JSON.stringify({ results }, null, 2), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
