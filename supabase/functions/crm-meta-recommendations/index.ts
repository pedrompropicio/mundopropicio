// crm-meta-recommendations
// POST { company_id, ad_account_id?, campaign_external_id? }
//
// Lê recomendações vivas da Meta Graph API:
//   1) /{ad_account_id}/recommendations      (recomendações ao nível da conta)
//   2) /{campaign_external_id}?fields=recommendations  (se passado)
//   3) /{campaign_external_id}/adsets?fields=recommendations,name  (se passado)
//
// NÃO persiste nada. NÃO escreve no Meta. Apenas leitura.
// Erros por sondagem são isolados — uma falhar não rebenta as outras.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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

function normalizeAdAccountId(raw: string): string {
  const c = String(raw).trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

type Recomendacao = {
  tipo: string | null;
  titulo: string | null;
  corpo: string | null;
  lift_estimate: string | null;
  stage: string | null;
  url: string | null;
  time: string | null;
  aplicavel: boolean;
  acao_sugerida: { campo: string; valor: string } | null;
  raw?: unknown;
};

function classify(r: Record<string, unknown>): Pick<Recomendacao, "aplicavel" | "acao_sugerida"> {
  const tipo = String((r as any).type ?? (r as any).recommendation_type ?? "").toUpperCase();
  const content = (r as any).recommendation_content ?? {};
  const corpo = String(content.body ?? (r as any).body ?? "").toLowerCase();
  const titulo = String(content.title ?? (r as any).title ?? "").toLowerCase();
  const texto = `${titulo} ${corpo}`;

  const mencionaConversoes =
    tipo.includes("OFFSITE_CONVERSION") ||
    tipo.includes("CONVERSION") ||
    texto.includes("conversões") ||
    texto.includes("conversoes") ||
    texto.includes("conversions") ||
    texto.includes("maximizar o número de conversões") ||
    texto.includes("optimize for conversions");

  if (mencionaConversoes) {
    return { aplicavel: true, acao_sugerida: { campo: "objetivo", valor: "OUTCOME_SALES" } };
  }
  return { aplicavel: false, acao_sugerida: null };
}

function normalize(r: Record<string, unknown>): Recomendacao {
  const content = ((r as any).recommendation_content ?? {}) as Record<string, unknown>;
  const tipo = (r as any).type ?? (r as any).recommendation_type ?? null;
  const titulo = (content.title as string | undefined) ?? ((r as any).title as string | undefined) ?? null;
  const corpo = (content.body as string | undefined) ?? ((r as any).body as string | undefined) ?? null;
  const lift = (content.lift_estimate as string | undefined) ?? null;
  const stage = ((r as any).recommendation_stage as string | undefined) ?? null;
  const url = ((r as any).url as string | undefined) ?? (content.url as string | undefined) ?? null;
  const time = ((r as any).recommendation_time as string | undefined) ?? null;
  const klass = classify(r);
  return {
    tipo: tipo ? String(tipo) : null,
    titulo,
    corpo,
    lift_estimate: lift,
    stage,
    url,
    time,
    ...klass,
  };
}

async function safeGet(url: string): Promise<{ ok: boolean; status: number; data: any | null; error: any | null }> {
  try {
    const r = await fetch(url);
    const j = await r.json().catch(() => null);
    if (!r.ok || (j && (j as any).error)) {
      return { ok: false, status: r.status, data: null, error: (j as any)?.error ?? { message: `HTTP ${r.status}` } };
    }
    return { ok: true, status: r.status, data: j, error: null };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: { message: (e as Error)?.message ?? "fetch_failed" } };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[meta-recommendations] BUILD_VERSION=recommendations-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { company_id?: string; ad_account_id?: string; campaign_external_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const companyId = body.company_id;
  if (!companyId) return json({ error: "missing_params", required: ["company_id"] }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Resolve ad_account_id + connection_id (mesma origem que crm-meta-publish-execute usa)
  let adAccountId = body.ad_account_id ? normalizeAdAccountId(body.ad_account_id) : null;
  let connectionId: string | null = null;
  {
    const { data: linkRow, error: linkErr } = await (supabase as any)
      .schema("crm").from("ad_platform_account_links")
      .select("connection_id, ad_account_id, is_primary, enabled")
      .eq("enabled", true)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (linkErr) return json({ error: "ad_account_query_failed", detail: linkErr.message }, 500);
    if (!linkRow) return json({ error: "no_active_meta_connection" }, 412);
    connectionId = linkRow.connection_id as string;
    if (!adAccountId) adAccountId = normalizeAdAccountId(linkRow.ad_account_id as string);
  }

  // 2) Decifra token (mesmo padrão que crm-meta-sync-creatives / publish-execute)
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "decrypt_failed", detail: tokenErr?.message ?? null }, 403);
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;
  if (!accessToken || typeof accessToken !== "string") {
    return json({ error: "decrypt_failed", detail: "empty_token" }, 403);
  }
  const at = encodeURIComponent(accessToken);

  const base = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
  const campaignExternalId = body.campaign_external_id ?? null;

  // 3) Sondagem CONTA
  const contaRes = await safeGet(`${base}/${adAccountId}/recommendations?access_token=${at}`);
  let conta: Recomendacao[] = [];
  let contaErro: any = null;
  if (contaRes.ok) {
    const arr: any[] = [];
    const data = (contaRes.data as any)?.data;
    if (Array.isArray(data)) {
      for (const row of data) {
        // /act_xxx/recommendations devolve { recommendations: [...] } por objeto
        const recs = Array.isArray((row as any).recommendations) ? (row as any).recommendations : [row];
        for (const r of recs) arr.push(r);
      }
    } else if (Array.isArray((contaRes.data as any)?.recommendations)) {
      for (const r of (contaRes.data as any).recommendations) arr.push(r);
    }
    conta = arr.map(normalize);
  } else {
    contaErro = contaRes.error;
  }

  // 4) Sondagem CAMPANHA + ADSETS (opcionais)
  let campanha: Recomendacao[] = [];
  let campanhaErro: any = null;
  let adsets: Array<{ adset_id: string; nome: string | null; recomendacoes: Recomendacao[] }> = [];
  let adsetsErro: any = null;

  if (campaignExternalId) {
    const campRes = await safeGet(`${base}/${campaignExternalId}?fields=recommendations&access_token=${at}`);
    if (campRes.ok) {
      const recs = (campRes.data as any)?.recommendations;
      if (Array.isArray(recs)) campanha = recs.map(normalize);
    } else {
      campanhaErro = campRes.error;
    }

    const adsetsRes = await safeGet(`${base}/${campaignExternalId}/adsets?fields=recommendations,name&limit=50&access_token=${at}`);
    if (adsetsRes.ok) {
      const data = (adsetsRes.data as any)?.data;
      if (Array.isArray(data)) {
        for (const row of data) {
          const recs = Array.isArray((row as any).recommendations) ? (row as any).recommendations.map(normalize) : [];
          if (recs.length > 0) {
            adsets.push({
              adset_id: String((row as any).id ?? ""),
              nome: ((row as any).name as string | undefined) ?? null,
              recomendacoes: recs,
            });
          }
        }
      }
    } else {
      adsetsErro = adsetsRes.error;
    }
  }

  return json({
    ok: true,
    ad_account_id: adAccountId,
    campaign_external_id: campaignExternalId,
    conta,
    campanha,
    adsets,
    erros: {
      conta: contaErro,
      campanha: campanhaErro,
      adsets: adsetsErro,
    },
    gerado_em: new Date().toISOString(),
  });
});
