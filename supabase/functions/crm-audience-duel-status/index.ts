// crm-audience-duel-status — DR-2026-06-27d.
// Lê o estado de uma run de duelo (audience_duel_runs) com validação de ownership:
// duel_id -> audience_duel_runs.campaign_id -> meta_campaign_snapshot.external_campaign_id
// -> company_id == company ativa do user. Devolve apenas os campos necessários à UI.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { duel_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const duel_id = body?.duel_id;
  if (!duel_id || typeof duel_id !== "string") {
    return json({ error: "missing_duel_id" }, 400);
  }

  // 1) Resolve user a partir do JWT
  const sbUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await sbUser.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return json({ error: "unauthorized" }, 401);
  }

  // 2) Lê a run via service_role (RLS em audience_duel_runs é apertada)
  const sbAdmin = createClient(SUPABASE_URL, SRK);
  const { data: run, error: runErr } = await sbAdmin
    .schema("crm")
    .from("audience_duel_runs")
    .select(
      "id, duel_id, campaign_id, status, gemini_model, gpt_model, " +
        "gemini_finished_at, gpt_finished_at, gemini_candidate_id, gpt_candidate_id, " +
        "gemini_error, gpt_error, created_at"
    )
    .eq("duel_id", duel_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runErr) return json({ error: "db_error", detail: runErr.message }, 500);
  if (!run) return json({ error: "not_found" }, 404);

  // 3) Valida ownership via company ativa do user
  const { data: companyRow, error: companyErr } = await sbUser.rpc("current_company_id");
  if (companyErr || !companyRow) {
    return json({ error: "no_active_company" }, 403);
  }
  const userCompany = companyRow as string;

  if (!run.campaign_id) {
    return json({ error: "forbidden" }, 403);
  }
  const { data: snap, error: snapErr } = await sbAdmin
    .schema("crm")
    .from("meta_campaign_snapshot")
    .select("company_id")
    .eq("external_campaign_id", run.campaign_id)
    .maybeSingle();
  if (snapErr) return json({ error: "db_error", detail: snapErr.message }, 500);
  if (!snap || snap.company_id !== userCompany) {
    return json({ error: "forbidden" }, 403);
  }

  // 4) Devolve só os campos necessários
  return json({
    status_run: run.status,
    gemini_model: run.gemini_model,
    gpt_model: run.gpt_model,
    gemini_finished_at: run.gemini_finished_at,
    gpt_finished_at: run.gpt_finished_at,
    gemini_candidate_id: run.gemini_candidate_id,
    gpt_candidate_id: run.gpt_candidate_id,
    gemini_error: run.gemini_error,
    gpt_error: run.gpt_error,
    created_at: run.created_at,
  });
});
