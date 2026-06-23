// crm-meta-historico-probe
// Sonda read-only: mede até onde a Graph API devolve insights históricos.
// NÃO escreve em tabelas. NÃO regista o token. Só agrega.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const CONNECTION_ID = "3c234235-0ac5-4afc-a06e-259bdea0ae7a";
const AD_ACCOUNT_ID = "act_5094207367314169";

const INTERVALOS = [
  { id: "A", since: "2025-01-01", until: "2025-12-31" },
  { id: "B", since: "2023-07-01", until: "2023-09-30" },
  { id: "C", since: "2023-01-01", until: "2023-03-31" },
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface IntervaloResultado {
  intervalo: string;
  since: string;
  until: string;
  n_campanhas: number;
  spend_total_cents: number;
  paginas: number;
  houve_erro: boolean;
  erro_msg: string | null;
  throttle_max: number | null;
}

async function sondaIntervalo(
  accessToken: string,
  intervalo: { id: string; since: string; until: string },
): Promise<IntervaloResultado> {
  const result: IntervaloResultado = {
    intervalo: intervalo.id,
    since: intervalo.since,
    until: intervalo.until,
    n_campanhas: 0,
    spend_total_cents: 0,
    paginas: 0,
    houve_erro: false,
    erro_msg: null,
    throttle_max: null,
  };

  const campanhasVistas = new Set<string>();
  let url: string | null = (() => {
    const u = new URL(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${AD_ACCOUNT_ID}/insights`,
    );
    u.searchParams.set("level", "campaign");
    u.searchParams.set("time_range", JSON.stringify({ since: intervalo.since, until: intervalo.until }));
    u.searchParams.set("fields", "campaign_id,campaign_name,spend");
    u.searchParams.set(
      "filtering",
      JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 0 }]),
    );
    u.searchParams.set("limit", "200");
    u.searchParams.set("access_token", accessToken);
    return u.toString();
  })();

  try {
    while (url) {
      const resp = await fetch(url);
      const throttleHeader = resp.headers.get("x-fb-ads-insights-throttle");
      if (throttleHeader) {
        try {
          const th = JSON.parse(throttleHeader);
          const maxVal = Math.max(
            Number(th.app_id_util_pct ?? 0),
            Number(th.acc_id_util_pct ?? 0),
            Number(th.ads_api_access_tier ? 0 : 0),
          );
          if (!result.throttle_max || maxVal > result.throttle_max) {
            result.throttle_max = maxVal;
          }
        } catch { /* ignore */ }
      }

      const body = await resp.json();
      if (body?.error) {
        result.houve_erro = true;
        result.erro_msg = `code=${body.error.code} type=${body.error.type} msg=${body.error.message}`;
        console.log(`[probe ${intervalo.id}] erro Meta:`, result.erro_msg);
        break;
      }

      result.paginas += 1;
      const data: Array<{ campaign_id?: string; campaign_name?: string; spend?: string }> = body?.data ?? [];
      for (const row of data) {
        const cid = row.campaign_id ?? row.campaign_name ?? "";
        if (cid) campanhasVistas.add(cid);
        const spendEuros = parseFloat(row.spend ?? "0");
        if (Number.isFinite(spendEuros)) {
          result.spend_total_cents += Math.round(spendEuros * 100);
        }
      }

      url = body?.paging?.next ?? null;
    }
  } catch (e) {
    result.houve_erro = true;
    result.erro_msg = `fetch_exception: ${(e as Error).message}`;
  }

  result.n_campanhas = campanhasVistas.size;
  return result;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log("[crm-meta-historico-probe] início");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await admin.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: CONNECTION_ID, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[crm-meta-historico-probe] decrypt falhou:", tokenErr?.message);
    return json({ error: "token_decrypt_failed", detail: tokenErr?.message ?? "sem linhas" }, 500);
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;
  console.log("[crm-meta-historico-probe] token obtido (não logado)");

  const resultados: IntervaloResultado[] = [];
  for (const intervalo of INTERVALOS) {
    console.log(`[probe] a sondar intervalo ${intervalo.id} (${intervalo.since} → ${intervalo.until})`);
    const r = await sondaIntervalo(accessToken, intervalo);
    resultados.push(r);
    console.log(
      `[probe ${intervalo.id}] n_campanhas=${r.n_campanhas} spend_cents=${r.spend_total_cents} paginas=${r.paginas} erro=${r.houve_erro}`,
    );
    // backoff se throttle alto
    if (r.throttle_max && r.throttle_max >= 75) {
      console.log(`[probe] throttle alto (${r.throttle_max}%), backoff 5s`);
      await new Promise((res) => setTimeout(res, 5000));
    } else {
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  return json({
    ad_account_id: AD_ACCOUNT_ID,
    graph_api_version: GRAPH_API_VERSION,
    intervalos: resultados,
  });
});
