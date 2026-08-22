// TEMPORÁRIO — arnês de validação da credencial Google Ads. APAGAR após uso.
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { getGoogleAdsAccessToken, googleAdsSearch, type GoogleAdsCtx } from "../_shared/google-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEV_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
const LOGIN_CID = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/-/g, "");

Deno.serve(async (req) => {
  const out: Record<string, unknown> = {};
  let body: { acao?: string; customer_id?: string } = {};
  try {
    body = await req.json();
  } catch { /* sem corpo */ }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (body.acao === "sync") {
    // usa a chave que os crons usam (formato JWT), não a do runtime
    const { data: keyRow } = await (admin as any).rpc("get_vault_secret", {
      p_name: "email_queue_service_role_key",
    });
    const cronKey = typeof keyRow === "string" ? keyRow : SERVICE_ROLE;
    const { data: conn } = await (admin as any)
      .schema("crm")
      .from("ad_platform_connections")
      .select("id, company_id")
      .eq("platform", "google")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/crm-google-sync-campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cronKey}` },
      body: JSON.stringify({
        connection_id: conn?.id,
        company_id: conn?.company_id,
        mode: "incremental",
        days_back: 30,
        triggered_by: "manual-validation",
      }),
    });
    out.conn = conn;
    out.status = resp.status;
    out.body = await resp.text();
    return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
  }

  try {
    const { data: conn } = await (admin as any)
      .schema("crm")
      .from("ad_platform_connections")
      .select("id, company_id, selected_ad_account_id, login_customer_id")
      .eq("platform", "google")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const ctx: GoogleAdsCtx = {
      accessToken: await getGoogleAdsAccessToken(),
      developerToken: DEV_TOKEN,
      loginCustomerId: String(conn?.login_customer_id || LOGIN_CID).replace(/-/g, ""),
      customerId: String(body.customer_id ?? conn?.selected_ad_account_id ?? "2200043144").replace(/-/g, ""),
    };
    const rows = await googleAdsSearch(
      ctx,
      `SELECT conversion_action.id, conversion_action.name, conversion_action.type,
              conversion_action.status, conversion_action.category,
              conversion_action.primary_for_goal, conversion_action.resource_name
       FROM conversion_action WHERE conversion_action.status != 'REMOVED'`,
    );
    out.ok = true;
    out.conta = ctx.customerId;
    out.acoes = rows.map((r) => r.conversionAction ?? r);

    // espelha em crm.google_conversion_action
    if (out.acoes && (out.acoes as any[]).length) {
      await (admin as any).schema("crm").from("google_conversion_action").upsert(
        (out.acoes as any[]).map((a) => ({
          company_id: conn?.company_id,
          connection_id: conn?.id,
          customer_id: ctx.customerId,
          resource_name: a.resourceName,
          external_id: String(a.id ?? ""),
          name: a.name,
          type: a.type,
          status: a.status,
          category: a.category,
          primary_for_goal: a.primaryForGoal ?? null,
          raw: a,
          last_synced_at: new Date().toISOString(),
        })),
        { onConflict: "company_id,customer_id,resource_name" },
      );
    }
  } catch (e) {
    out.ok = false;
    out.erro = (e as Error).message;
    out.raw = (e as any)?.raw ?? null;
  }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
