// crm-meta-recon-2025
// READ-ONLY recon. Inspecciona a forma real dos dados Meta 2025 para desenhar o destilador.
// Não escreve em tabelas. Não regista o token. Só GET à Graph API.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const DEFAULT_COMPANY = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function maskId(id: string | undefined): string {
  if (!id) return "";
  if (id.length <= 8) return id;
  return id.slice(0, 4) + "…" + id.slice(-4);
}

async function gfetch(url: string) {
  const r = await fetch(url);
  return await r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let companyId = DEFAULT_COMPANY;
  if (req.method === "POST") {
    try {
      const b = await req.json();
      if (typeof b?.company_id === "string") companyId = b.company_id;
    } catch { /* ignore */ }
  }

  const sb = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });

  const { data: conn, error: connErr } = await sb
    .from("ad_platform_connections")
    .select("id, selected_ad_account_id, status")
    .eq("company_id", companyId).eq("platform", "meta").eq("status", "active")
    .maybeSingle();
  if (connErr || !conn?.selected_ad_account_id) {
    return json({ error: "connection_not_found", detail: connErr?.message }, 404);
  }

  const pub = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: tokRows, error: tokErr } = await pub.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: conn.id, p_master_key: KEY,
  });
  if (tokErr || !Array.isArray(tokRows) || tokRows.length === 0) {
    return json({ error: "token_decrypt_failed", detail: tokErr?.message }, 403);
  }
  const token = (tokRows[0] as { access_token: string }).access_token;
  const adAct = conn.selected_ad_account_id;

  const tr2025 = JSON.stringify({ since: "2025-01-01", until: "2025-12-31" });

  // PASSO 1 — top-5 campanhas por spend em 2025
  const u1 = new URL(`https://graph.facebook.com/${GRAPH}/${adAct}/insights`);
  u1.searchParams.set("level", "campaign");
  u1.searchParams.set("time_range", tr2025);
  u1.searchParams.set("fields", "campaign_id,campaign_name,objective,spend");
  u1.searchParams.set("filtering", JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 0 }]));
  u1.searchParams.set("sort", "spend_descending");
  u1.searchParams.set("limit", "5");
  u1.searchParams.set("access_token", token);
  const j1 = await gfetch(u1.toString());
  if (j1?.error) return json({ step: 1, error: j1.error });

  const campanhas = (j1.data ?? []).map((c: Record<string, unknown>) => ({
    campaign_id_mask: maskId(c.campaign_id as string),
    campaign_id_raw: c.campaign_id,
    campaign_name: c.campaign_name,
    objective: c.objective ?? null,
    spend: c.spend,
  }));

  // Objective da campanha-mãe vem do endpoint /{id}?fields=objective (insights nem sempre devolve)
  // Enriquecer com GET por id para confirmar objective.
  for (const c of campanhas) {
    if (!c.campaign_id_raw) continue;
    const u = new URL(`https://graph.facebook.com/${GRAPH}/${c.campaign_id_raw}`);
    u.searchParams.set("fields", "objective,buying_type,special_ad_categories,smart_promotion_type");
    u.searchParams.set("access_token", token);
    const jj = await gfetch(u.toString());
    if (!jj?.error) {
      c.objective = jj.objective ?? c.objective;
      (c as Record<string, unknown>).buying_type = jj.buying_type;
      (c as Record<string, unknown>).smart_promotion_type = jj.smart_promotion_type ?? null;
      (c as Record<string, unknown>).special_ad_categories = jj.special_ad_categories ?? null;
    }
  }

  // PASSO 2 — adsets da campanha de maior spend, com insights + actions/action_values
  const topRaw = campanhas[0]?.campaign_id_raw as string | undefined;
  let adsetInsightsSample: unknown = null;
  let adsetsRaw: unknown = null;
  let targetingSample: unknown = null;

  if (topRaw) {
    // insights por adset
    const u2 = new URL(`https://graph.facebook.com/${GRAPH}/${topRaw}/insights`);
    u2.searchParams.set("level", "adset");
    u2.searchParams.set("time_range", tr2025);
    u2.searchParams.set(
      "fields",
      "adset_id,adset_name,spend,impressions,reach,clicks,actions,action_values,purchase_roas,cost_per_action_type",
    );
    u2.searchParams.set("limit", "2");
    u2.searchParams.set("access_token", token);
    const j2 = await gfetch(u2.toString());
    adsetInsightsSample = j2?.error ?? j2?.data ?? null;

    // listagem de adsets (endpoint nó da campanha) → optimization_goal + targeting
    const u3 = new URL(`https://graph.facebook.com/${GRAPH}/${topRaw}/adsets`);
    u3.searchParams.set(
      "fields",
      "id,name,optimization_goal,billing_event,bid_strategy,destination_type,promoted_object,targeting",
    );
    u3.searchParams.set("limit", "2");
    u3.searchParams.set("access_token", token);
    const j3 = await gfetch(u3.toString());
    adsetsRaw = j3?.error ?? j3?.data ?? null;

    // PASSO 3 — targeting já vem em j3; pegar o primeiro
    if (Array.isArray(j3?.data) && j3.data.length > 0) {
      const t = j3.data[0]?.targeting ?? null;
      targetingSample = {
        adset_id_mask: maskId(j3.data[0]?.id),
        optimization_goal: j3.data[0]?.optimization_goal ?? null,
        targeting_keys: t ? Object.keys(t) : [],
        targeting_raw: t,
      };
    }
  }

  // PASSO 4 — inventário de action_types presentes no top adset (para mapear purchase)
  let actionTypesInventory: string[] = [];
  if (Array.isArray(adsetInsightsSample)) {
    const seen = new Set<string>();
    for (const row of adsetInsightsSample as Array<Record<string, unknown>>) {
      for (const a of (row.actions ?? []) as Array<{ action_type: string }>) seen.add(a.action_type);
      for (const a of (row.action_values ?? []) as Array<{ action_type: string }>) {
        seen.add(`$${a.action_type}`);
      }
    }
    actionTypesInventory = Array.from(seen).sort();
  }

  return json({
    company_id: companyId,
    ad_account_id: adAct,
    graph_api_version: GRAPH,
    token_decrypted: true,
    passo_1_top5_campanhas_2025: campanhas,
    passo_2_adsets_insights_top_campaign: adsetInsightsSample,
    passo_3_adsets_node_top_campaign: adsetsRaw,
    passo_3_targeting_sample: targetingSample,
    passo_4_action_types_inventory_no_top_adset: actionTypesInventory,
    notas: {
      objective_source: "GET /{campaign_id}?fields=objective (insights raramente devolve objective)",
      purchase_action_types_a_testar: [
        "purchase",
        "omni_purchase",
        "offsite_conversion.fb_pixel_purchase",
        "onsite_web_purchase",
        "web_in_store_purchase",
      ],
      roas_via: "action_values[<purchase>] / spend OU campo purchase_roas devolvido directamente",
    },
  });
});
