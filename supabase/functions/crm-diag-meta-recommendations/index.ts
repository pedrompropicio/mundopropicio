console.log("[diag-meta-recos] BUILD_VERSION=diag-recos-v2");

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAPH = "https://graph.facebook.com/v18.0";

async function probe(name: string, url: string) {
  try {
    const r = await fetch(url);
    const text = await r.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = text; }
    return { sondagem: name, http_status: r.status, body };
  } catch (e) {
    return { sondagem: name, http_status: 0, erro: String(e) };
  }
}

function summarizeRecs(recs: any): any {
  if (!Array.isArray(recs)) return null;
  return {
    count: recs.length,
    items: recs.slice(0, 20).map((r: any) => ({
      title: r.title ?? null,
      message: r.message ?? null,
      code: r.code ?? null,
      confidence: r.confidence ?? null,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { connection_id, ad_account_id } = await req.json();
    if (!connection_id || !ad_account_id) {
      return new Response(JSON.stringify({ error: "connection_id e ad_account_id obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
    const { data: tokenRows, error: tokErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
      p_connection_id: connection_id,
      p_master_key: masterKey,
    });
    if (tokErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
      return new Response(JSON.stringify({ error: "decrypt_failed", detalhe: tokErr?.message ?? null }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const accessToken = (tokenRows[0] as { access_token: string }).access_token;

    const at = encodeURIComponent(accessToken);
    const acc = ad_account_id;

    // A
    const A = await probe("A_account_recommendations",
      `${GRAPH}/${acc}?fields=recommendations&access_token=${at}`);
    const aRecs = A.body?.recommendations;
    const A_out = {
      sondagem: A.sondagem,
      http_status: A.http_status,
      tem_dados: Array.isArray(aRecs) && aRecs.length > 0,
      resumo: summarizeRecs(aRecs),
      erro: A.body?.error ?? null,
    };

    // B
    const B = await probe("B_campaigns_recommendations",
      `${GRAPH}/${acc}/campaigns?fields=id,name,recommendations&limit=5&access_token=${at}`);
    const bData = B.body?.data;
    const B_out = {
      sondagem: B.sondagem,
      http_status: B.http_status,
      tem_dados: Array.isArray(bData) && bData.some((c: any) => Array.isArray(c.recommendations) && c.recommendations.length > 0),
      resumo: Array.isArray(bData) ? bData.map((c: any) => ({
        id: c.id, name: c.name, recs: summarizeRecs(c.recommendations),
      })) : null,
      erro: B.body?.error ?? null,
    };

    // C
    const C = await probe("C_adsets_recommendations",
      `${GRAPH}/${acc}/adsets?fields=id,name,recommendations&limit=5&access_token=${at}`);
    const cData = C.body?.data;
    const C_out = {
      sondagem: C.sondagem,
      http_status: C.http_status,
      tem_dados: Array.isArray(cData) && cData.some((c: any) => Array.isArray(c.recommendations) && c.recommendations.length > 0),
      resumo: Array.isArray(cData) ? cData.map((c: any) => ({
        id: c.id, name: c.name, recs: summarizeRecs(c.recommendations),
      })) : null,
      erro: C.body?.error ?? null,
    };

    // D1 targetingsuggestions
    const D1 = await probe("D1_targetingsuggestions",
      `${GRAPH}/${acc}/targetingsuggestions?targeting_list=${encodeURIComponent("[]")}&access_token=${at}`);
    const D1_out = {
      sondagem: D1.sondagem,
      http_status: D1.http_status,
      tem_dados: !!D1.body?.data,
      resumo: typeof D1.body === "object" ? JSON.stringify(D1.body).slice(0, 800) : String(D1.body).slice(0, 800),
      erro: D1.body?.error ?? null,
    };

    // D2 delivery_estimate
    const D2 = await probe("D2_delivery_estimate",
      `${GRAPH}/${acc}/delivery_estimate?access_token=${at}`);
    const D2_out = {
      sondagem: D2.sondagem,
      http_status: D2.http_status,
      tem_dados: !!D2.body?.data,
      resumo: typeof D2.body === "object" ? JSON.stringify(D2.body).slice(0, 800) : String(D2.body).slice(0, 800),
      erro: D2.body?.error ?? null,
    };

    // E
    const E = await probe("E_recommendations_node",
      `${GRAPH}/${acc}/recommendations?access_token=${at}`);
    const E_out = {
      sondagem: E.sondagem,
      http_status: E.http_status,
      tem_dados: Array.isArray(E.body?.data) && E.body.data.length > 0,
      resumo: typeof E.body === "object" ? JSON.stringify(E.body).slice(0, 800) : String(E.body).slice(0, 800),
      erro: E.body?.error ?? null,
    };

    return new Response(JSON.stringify({
      ok: true,
      ad_account_id: acc,
      sondagens: [A_out, B_out, C_out, D1_out, D2_out, E_out],
    }, null, 2), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
