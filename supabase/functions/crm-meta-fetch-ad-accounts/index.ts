// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-fetch-ad-accounts
//
// POST { connection_id: string }
//
// 1. Auth: usa o JWT do user (Authorization header) para preservar RLS.
// 2. Decifra o token Meta via RPC SECURITY DEFINER crm_get_meta_decrypted_token.
// 3. Chama Graph API /me/adaccounts e filtra pelas que pertencem ao BM da connection.
// 4. Persiste o array (shape limpo) em crm.ad_platform_connections.available_ad_accounts.
// 5. Sincroniza crm.ad_platform_account_links (upsert por (connection_id, ad_account_id))
//    preservando is_primary/enabled definidos manualmente; garante 1 primary por connection.
// 6. Devolve { ad_accounts, business_id, business_name, links_synced }.
//
// Notas:
// - Usa client Supabase com user JWT (não service role) — UPDATE passa pelas policies.
// - verify_jwt fica como default (false a nível de gateway); validamos JWT em código
//   pela presença do Authorization header e pelo facto da RPC exigir current_company_id().

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface GraphAdAccount {
  id: string; // act_xxx
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  business?: { id: string; name?: string };
}

interface GraphAdAccountsResponse {
  data?: GraphAdAccount[];
  paging?: { next?: string };
  error?: { message: string; type: string; code: number };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "missing_authorization" }, 401);
  }

  let body: { connection_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const connectionId = body?.connection_id;
  if (!connectionId || typeof connectionId !== "string") {
    return json({ error: "missing_connection_id" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Decifrar token via RPC (filtra por company do caller)
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );

  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[crm-meta-fetch-ad-accounts] decrypt failed:", tokenErr);
    return json(
      { error: "connection_not_found_or_unauthorised", detail: tokenErr?.message },
      403,
    );
  }
  const {
    access_token: accessToken,
    external_business_id: businessId,
    external_business_name: businessName,
    company_id: companyId,
  } = tokenRows[0] as {
    access_token: string;
    external_business_id: string;
    external_business_name: string;
    company_id: string;
  };

  // 2) Chamar Graph API. TODO: paginação real (>100). Por agora limit=100.
  let graphJson: GraphAdAccountsResponse;
  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/me/adaccounts`,
    );
    url.searchParams.set(
      "fields",
      "id,account_id,name,account_status,currency,timezone_name,business",
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url);
    graphJson = (await res.json()) as GraphAdAccountsResponse;
    if (!res.ok || graphJson.error) {
      console.error(
        "[crm-meta-fetch-ad-accounts] graph error:",
        res.status,
        graphJson.error,
      );
      return json(
        {
          error: "graph_api_error",
          message: graphJson.error?.message ?? `HTTP ${res.status}`,
        },
        502,
      );
    }
  } catch (e) {
    console.error("[crm-meta-fetch-ad-accounts] fetch threw:", e);
    return json({ error: "graph_api_unreachable" }, 502);
  }

  // 3) Filtrar pelas do BM e mapear
  const filtered = (graphJson.data ?? [])
    .filter((a) => a.business?.id === businessId)
    .map((a) => ({
      id: a.id,
      account_id: a.account_id ?? a.id.replace(/^act_/, ""),
      name: a.name ?? "(sem nome)",
      account_status: a.account_status ?? null,
      currency: a.currency ?? null,
      timezone_name: a.timezone_name ?? null,
    }));

  // 4) Persistir (UPDATE via user JWT — RLS aplica-se)
  const { error: updErr } = await supabase
    .schema("crm")
    .from("ad_platform_connections")
    .update({ available_ad_accounts: filtered })
    .eq("id", connectionId);

  if (updErr) {
    console.error("[crm-meta-fetch-ad-accounts] update failed:", updErr);
    // Não bloqueia: devolvemos lista mesmo assim, mas com aviso.
    return json({
      ad_accounts: filtered,
      business_id: businessId,
      business_name: businessName,
      warning: "persist_failed",
      detail: updErr.message,
    });
  }

  // 5) Sincronizar ad_platform_account_links (multi-account source of truth)
  //    Upsert por (connection_id, ad_account_id). Não passamos is_primary/enabled
  //    para preservar valores definidos manualmente pelo user.
  let linksSynced = 0;
  let linksWarning: string | undefined;
  if (filtered.length > 0) {
    const linksToUpsert = filtered.map((a) => ({
      connection_id: connectionId,
      company_id: companyId,
      ad_account_id: a.id,
      ad_account_name: a.name,
      ad_account_currency: a.currency,
      display_label: a.name,
    }));

    const { error: linksErr } = await supabase
      .schema("crm")
      .from("ad_platform_account_links")
      .upsert(linksToUpsert, { onConflict: "connection_id,ad_account_id" });

    if (linksErr) {
      console.error("[crm-meta-fetch-ad-accounts] upsert links failed:", linksErr);
      linksWarning = linksErr.message;
    } else {
      linksSynced = linksToUpsert.length;

      // Garantir 1 primary por connection
      const { data: existingPrimary } = await supabase
        .schema("crm")
        .from("ad_platform_account_links")
        .select("id")
        .eq("connection_id", connectionId)
        .eq("is_primary", true)
        .maybeSingle();

      if (!existingPrimary) {
        await supabase
          .schema("crm")
          .from("ad_platform_account_links")
          .update({ is_primary: true })
          .eq("connection_id", connectionId)
          .eq("ad_account_id", filtered[0].id);
      }
    }
  }

  return json({
    ad_accounts: filtered,
    business_id: businessId,
    business_name: businessName,
    links_synced: linksSynced,
    ...(linksWarning ? { links_warning: linksWarning } : {}),
  });
});
