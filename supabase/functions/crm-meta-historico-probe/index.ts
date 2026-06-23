// crm-meta-historico-probe
// Sonda read-only: mede até onde a Graph API devolve insights históricos.
// NÃO escreve em tabelas. NÃO regista o token. Só agrega.
// Padrão de auth/token espelhado de crm-meta-sync-insights (anon key + forward Authorization).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const DEFAULT_COMPANY_ID = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c"; // MP (retrocompat)

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
  adAccountId: string,
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
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`,
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

  let companyId = DEFAULT_COMPANY_ID;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.company_id === "string" && body.company_id.length > 0) {
        companyId = body.company_id;
      }
    } catch { /* body opcional */ }
  }

  console.log(`[crm-meta-historico-probe] início company_id=${companyId}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });

  // Resolver connection + ad account da empresa pedida
  const { data: connRow, error: connErr } = await supabase
    .from("ad_platform_connections")
    .select("id, selected_ad_account_id, status")
    .eq("company_id", companyId)
    .eq("platform", "meta")
    .eq("status", "active")
    .maybeSingle();

  if (connErr || !connRow) {
    return json({
      error: "connection_not_found",
      company_id: companyId,
      detail: connErr?.message ?? "sem conexão Meta activa",
    }, 404);
  }
  if (!connRow.selected_ad_account_id) {
    return json({ error: "no_selected_ad_account", company_id: companyId, connection_id: connRow.id }, 400);
  }

  const adAccountId: string = connRow.selected_ad_account_id;
  const connectionId: string = connRow.id;

  // Descodificar token (RPC vive em public)
  const publicClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: tokenRows, error: tokenErr } = await publicClient.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    console.error("[crm-meta-historico-probe] decrypt falhou:", tokenErr?.message);
    return json({
      error: "token_decrypt_failed",
      company_id: companyId,
      connection_id: connectionId,
      detail: tokenErr?.message ?? "sem linhas",
      token_decrypted: false,
    }, 403);
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;
  const tokenLooksOk = typeof accessToken === "string" && accessToken.startsWith("EAA");
  console.log(`[crm-meta-historico-probe] token obtido prefixo_ok=${tokenLooksOk}`);

  const resultados: IntervaloResultado[] = [];
  for (const intervalo of INTERVALOS) {
    const r = await sondaIntervalo(accessToken, adAccountId, intervalo);
    resultados.push(r);
    console.log(
      `[probe ${intervalo.id}] n_campanhas=${r.n_campanhas} spend_cents=${r.spend_total_cents} erro=${r.houve_erro}`,
    );
    if (r.throttle_max && r.throttle_max >= 75) {
      await new Promise((res) => setTimeout(res, 5000));
    } else {
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  return json({
    company_id: companyId,
    connection_id: connectionId,
    ad_account_id: adAccountId,
    graph_api_version: GRAPH_API_VERSION,
    token_decrypted: true,
    token_prefix_ok: tokenLooksOk,
    intervalos: resultados,
  });
});
