// TEMPORÁRIO — arnês de validação da credencial Google Ads.
// Chama crm-google-sync-campaigns e crm-google-publish-lookups do lado do
// servidor (usa o service role do runtime) para permitir validar a nova
// GOOGLE_SA_KEY_JSON sem sessão de utilizador. APAGAR após a validação.
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

  if (body.acao === "sync") {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/crm-google-sync-campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        connection_id: "c0000000-0000-4000-a000-000022000431",
        company_id: "7c858982-6ccd-47ca-bd65-e0dd3eebf01c",
        mode: "incremental",
        days_back: 30,
        triggered_by: "manual-validation",
      }),
    });
    out.status = resp.status;
    out.body = await resp.text();
    return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
  }

  // acao=conversions: lê as conversion actions reais da conta
  try {
    const ctx: GoogleAdsCtx = {
      accessToken: await getGoogleAdsAccessToken(),
      developerToken: DEV_TOKEN,
      loginCustomerId: LOGIN_CID,
      customerId: (body.customer_id ?? "2200043144").replace(/-/g, ""),
    };
    const rows = await googleAdsSearch(
      ctx,
      `SELECT conversion_action.id, conversion_action.name, conversion_action.type,
              conversion_action.status, conversion_action.category,
              conversion_action.primary_for_goal, conversion_action.resource_name
       FROM conversion_action WHERE conversion_action.status != 'REMOVED'`,
    );
    out.ok = true;
    out.acoes = rows.map((r) => r.conversionAction ?? r);
  } catch (e) {
    out.ok = false;
    out.erro = (e as Error).message;
    out.raw = (e as any)?.raw ?? null;
  }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
