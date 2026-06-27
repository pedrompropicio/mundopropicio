// crm-campaign-brief — READ-ONLY.
// Exposição da função buildCampaignBrief (DR-2026-06-26 ponto 3, sub-tarefa 3 de #19).
// Nada na app a chama hoje — inerte por design, para validação isolada.
//
// POST { campaign_id, reference_campaign_id?, caps?, period_days? }
// caps default: { target_blended_roas: 8 }

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { buildCampaignBrief, BudgetCaps } from "../_shared/campaign-brief.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: {
    campaign_id?: string;
    reference_campaign_id?: string | null;
    caps?: Partial<BudgetCaps>;
    period_days?: number;
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const campaignId = body.campaign_id;
  if (!campaignId) return json({ error: "missing_campaign_id" }, 400);

  // Dual-mode auth: aceita JWT do user OU service_role (s2s).
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = SUPABASE_SERVICE_ROLE_KEY != null && token === SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(
    SUPABASE_URL,
    isServiceRole ? SUPABASE_SERVICE_ROLE_KEY! : SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  if (!isServiceRole) {
    const { data: u, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "unauthorized", detail: uErr?.message }, 401);
  }

  // Caps com defaults
  const caps: BudgetCaps = {
    target_blended_roas: body.caps?.target_blended_roas ?? 8,
    daily_budget_cents: body.caps?.daily_budget_cents ?? null,
    lifetime_budget_cents: body.caps?.lifetime_budget_cents ?? null,
    roas_floor: body.caps?.roas_floor ?? null,
    end_time: body.caps?.end_time ?? null,
  };
  if (!(caps.target_blended_roas > 0)) {
    return json({ error: "invalid_caps.target_blended_roas" }, 400);
  }

  // Resolver access_token + ad_account_id a partir da connection (como no new-design).
  // Best-effort: se falhar, segue sem token (audiences ficam vazias com warning).
  let accessToken: string | null = null;
  try {
    const { data: snap } = await (supabase as any)
      .schema("crm").from("meta_campaign_snapshot")
      .select("connection_id")
      .eq("external_campaign_id", campaignId)
      .maybeSingle();
    if (snap?.connection_id) {
      const { data: tokenRows } = await supabase.rpc(
        "crm_get_meta_decrypted_token",
        { p_connection_id: snap.connection_id, p_master_key: ENCRYPTION_MASTER_KEY },
      );
      if (Array.isArray(tokenRows) && tokenRows.length > 0) {
        accessToken = (tokenRows[0] as any).access_token ?? null;
      }
    }
  } catch (e) {
    console.warn("[campaign-brief] token_resolve_failed", (e as Error).message);
  }

  try {
    const brief = await buildCampaignBrief({
      supabase,
      campaign_id: campaignId,
      caps,
      reference_campaign_id: body.reference_campaign_id ?? null,
      period_days: body.period_days,
      meta_access_token: accessToken,
    });
    return json({ ok: true, brief });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error("[campaign-brief] build_failed", msg);
    return json({ ok: false, error: "build_failed", detail: msg }, 200);
  }
});
