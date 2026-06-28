// Temporary diagnostic probe — Meta Graph recommendations.
// Uses service_role internally; token via RPC crm_get_meta_decrypted_token.
// NOT for production; returns raw Graph JSON.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  const connectionId: string = body.connection_id;
  const campaignId: string = body.campaign_external_id;
  const adAccountId: string = body.ad_account_id; // act_xxx or xxx
  const versions: string[] = body.versions ?? ["v21.0", "v20.0", "v18.0"];

  const admin = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false } });

  const { data: tok, error: tErr } = await admin.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: connectionId, p_master_key: KEY,
  });
  if (tErr || !Array.isArray(tok) || tok.length === 0) return j({ error: "decrypt_failed", detail: tErr?.message }, 500);
  const at = encodeURIComponent((tok[0] as any).access_token);

  const act = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  // Get adsets first (for adset-level probe)
  const out: any = { versions_probed: versions, results: {} };

  for (const v of versions) {
    const base = `https://graph.facebook.com/${v}`;
    const r: any = {};

    // 1. Campaign-level recommendations
    const campResp = await fetch(`${base}/${campaignId}?fields=recommendations,name,objective,status&access_token=${at}`);
    r.campaign = { http: campResp.status, body: await campResp.json().catch(() => null) };

    // 2. Account-level recommendations
    const acctResp = await fetch(`${base}/${act}/recommendations?access_token=${at}`);
    r.account_recommendations_endpoint = { http: acctResp.status, body: await acctResp.json().catch(() => null) };

    // 3. Adsets of this campaign + recommendations
    const adsetsResp = await fetch(`${base}/${campaignId}/adsets?fields=id,name,status,recommendations&limit=10&access_token=${at}`);
    r.adsets = { http: adsetsResp.status, body: await adsetsResp.json().catch(() => null) };

    // 4. Try alternative field names on first adset
    const firstAdsetId = r.adsets?.body?.data?.[0]?.id;
    if (firstAdsetId) {
      const altResp = await fetch(`${base}/${firstAdsetId}?fields=recommendations,issues_info,delivery_estimate&access_token=${at}`);
      r.first_adset_alt_fields = { adset_id: firstAdsetId, http: altResp.status, body: await altResp.json().catch(() => null) };
    }

    out.results[v] = r;
  }

  return j({ ok: true, ...out });
});
