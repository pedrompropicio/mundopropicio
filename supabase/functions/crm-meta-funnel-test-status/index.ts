// crm-meta-funnel-test-status
// Devolve estado actual do run + steps. Frontend faz polling 2s.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let runId: string | null = null;
  if (req.method === "GET") {
    runId = new URL(req.url).searchParams.get("run_id");
  } else if (req.method === "POST") {
    try {
      const body = await req.json();
      runId = body?.run_id ?? null;
    } catch { /* noop */ }
  } else {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (!runId) return json({ error: "missing_run_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: run, error: runErr } = await (supabase as any)
    .schema("crm")
    .from("funnel_test_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  if (runErr) return json({ error: "fetch_failed", detail: runErr.message }, 500);
  if (!run) return json({ error: "not_found" }, 404);

  const { data: steps } = await (supabase as any)
    .schema("crm")
    .from("funnel_test_steps")
    .select("*")
    .eq("run_id", runId)
    .order("step_index", { ascending: true });

  return json({ run, steps: steps ?? [] });
});
