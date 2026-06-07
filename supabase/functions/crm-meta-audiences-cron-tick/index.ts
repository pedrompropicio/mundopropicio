// crm-meta-audiences-cron-tick: itera audiences enabled e chama crm-meta-audience-sync para cada
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rows, error } = await admin
    .from("meta_custom_audiences")
    .select("id, name")
    .eq("enabled", true)
    .not("audience_id_meta", "is", null);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const results: any[] = [];
  for (const r of rows ?? []) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/crm-meta-audience-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        body: JSON.stringify({ audience_id: r.id }),
      });
      const j = await resp.json();
      results.push({ id: r.id, name: r.name, status: resp.status, body: j });
    } catch (e) {
      results.push({ id: r.id, name: r.name, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
