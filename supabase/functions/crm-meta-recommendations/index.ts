// crm-meta-recommendations
// POST { company_id, ad_account_id?, campaign_external_id? }
//
// Fonte ÚNICA primária: /act_<id>/recommendations (v21.0).
// As vias /<campaign_id>?fields=recommendations e /<campaign_id>/adsets?fields=recommendations
// foram comprovadamente vazias na sonda — descontinuadas.
//
// Persiste em public.meta_campaign_recommendations (upsert idempotente):
//   - explode object_ids → 1 linha por adset afetado
//   - resolve external_campaign_id via crm.meta_adset_snapshot quando possível
//   - preserva status/decided_at/decided_by da decisão do utilizador
// Devolve também o JSON para a UI existente (MetaPublishPanel) continuar a funcionar.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v21.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

type RecomendacaoUI = {
  tipo: string | null;
  titulo: string | null;
  corpo: string | null;
  lift_estimate: string | null;
  stage: string | null;
  url: string | null;
  time: string | null;
  aplicavel: boolean;
  acao_sugerida: { campo: string; valor: string } | null;
};

function classify(r: Record<string, unknown>): Pick<RecomendacaoUI, "aplicavel" | "acao_sugerida"> {
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

function normalizeUI(r: Record<string, unknown>): RecomendacaoUI {
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
    titulo, corpo, lift_estimate: lift, stage, url, time, ...klass,
  };
}

function parseOpportunityScoreLift(content: Record<string, unknown>): number | null {
  const candidates = [
    (content as any).opportunity_score_lift,
    (content as any).opportunity_score,
    (content as any).score_lift,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string") {
      const m = c.match(/-?\d+(\.\d+)?/);
      if (m) {
        const n = parseFloat(m[0]);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

function parseRecommendationTime(r: Record<string, unknown>): string | null {
  const t = (r as any).recommendation_time;
  if (!t) return null;
  if (typeof t === "number") return new Date(t * 1000).toISOString();
  const d = new Date(String(t));
  return isNaN(d.getTime()) ? null : d.toISOString();
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
  console.log("[meta-recommendations] BUILD_VERSION=recommendations-v2-persist");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { company_id?: string; ad_account_id?: string; campaign_external_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const companyId = body.company_id;
  if (!companyId) return json({ error: "missing_params", required: ["company_id"] }, 400);

  // Cliente "user" (para RPC do token, respeita auth)
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Cliente "service" (para upsert na tabela protegida)
  const supabaseSvc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Resolve ad_account_id + connection_id — AGORA filtrado por company_id
  let adAccountId = body.ad_account_id ? normalizeAdAccountId(body.ad_account_id) : null;
  let connectionId: string | null = null;
  {
    let q = (supabaseSvc as any).schema("crm").from("ad_platform_account_links")
      .select("connection_id, ad_account_id, is_primary, enabled, company_id")
      .eq("enabled", true)
      .eq("company_id", companyId);
    if (adAccountId) {
      const bare = adAccountId.replace(/^act_/, "");
      q = q.or(`ad_account_id.eq.${adAccountId},ad_account_id.eq.${bare}`);
    }
    const { data: linkRow, error: linkErr } = await q
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (linkErr) return json({ error: "ad_account_query_failed", detail: linkErr.message }, 500);
    if (!linkRow) return json({ error: "no_active_meta_connection_for_company" }, 412);
    connectionId = linkRow.connection_id as string;
    if (!adAccountId) adAccountId = normalizeAdAccountId(linkRow.ad_account_id as string);
  }

  // 2) Decifra token
  const { data: tokenRows, error: tokenErr } = await supabaseUser.rpc(
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

  // 3) Sondagem CONTA — fonte primária
  const fields = "recommendations{recommendation_content,object_ids,recommendation_stage,recommendation_time,type,url,title}";
  const contaRes = await safeGet(`${base}/${adAccountId}?fields=${encodeURIComponent(fields)}&access_token=${at}`);
  // fallback antigo (alguns AT devolvem na rota dedicada)
  let recsRaw: any[] = [];
  let contaErro: any = null;
  if (contaRes.ok) {
    const recs = (contaRes.data as any)?.recommendations?.data
      ?? (contaRes.data as any)?.recommendations
      ?? [];
    if (Array.isArray(recs)) recsRaw = recs;
  } else {
    contaErro = contaRes.error;
    // tenta a rota legacy /recommendations
    const legacy = await safeGet(`${base}/${adAccountId}/recommendations?access_token=${at}`);
    if (legacy.ok) {
      const ld = (legacy.data as any)?.data;
      if (Array.isArray(ld)) {
        for (const row of ld) {
          const rs = Array.isArray((row as any).recommendations) ? (row as any).recommendations : [row];
          for (const r of rs) recsRaw.push(r);
        }
      }
      contaErro = null;
    }
  }

  // 4) Pré-carrega mapa adset_id → campaign_id (para resolver external_campaign_id)
  const adsetIds = new Set<string>();
  for (const r of recsRaw) {
    const ids = (r as any).object_ids;
    if (Array.isArray(ids)) for (const id of ids) adsetIds.add(String(id));
  }
  const adsetToCampaign = new Map<string, string>();
  if (adsetIds.size > 0) {
    const { data: snaps } = await (supabaseSvc as any).schema("crm")
      .from("meta_adset_snapshot")
      .select("external_adset_id, external_campaign_id")
      .in("external_adset_id", Array.from(adsetIds));
    if (Array.isArray(snaps)) {
      for (const s of snaps) {
        if (s.external_adset_id && s.external_campaign_id) {
          adsetToCampaign.set(String(s.external_adset_id), String(s.external_campaign_id));
        }
      }
    }
  }

  // 5) Constrói linhas explodidas e faz upsert
  const nowIso = new Date().toISOString();
  type Row = {
    company_id: string;
    connection_id: string;
    ad_account_id: string;
    external_campaign_id: string | null;
    external_adset_id: string | null;
    recommendation_type: string;
    body: string | null;
    lift_estimate: string | null;
    opportunity_score_lift: number | null;
    recommendation_stage: string | null;
    recommendation_time: string | null;
    url: string | null;
    raw: unknown;
    last_seen_at: string;
  };
  const rows: Row[] = [];
  for (const r of recsRaw) {
    const content = ((r as any).recommendation_content ?? {}) as Record<string, unknown>;
    const tipo = String((r as any).type ?? (r as any).recommendation_type ?? "").trim();
    if (!tipo) continue;
    const objIds: string[] = Array.isArray((r as any).object_ids) && (r as any).object_ids.length > 0
      ? (r as any).object_ids.map((x: unknown) => String(x))
      : [];
    const corpo = (content.body as string | undefined) ?? ((r as any).body as string | undefined) ?? null;
    const lift = (content.lift_estimate as string | undefined) ?? null;
    const stage = ((r as any).recommendation_stage as string | undefined) ?? null;
    const url = ((r as any).url as string | undefined) ?? (content.url as string | undefined) ?? null;
    const score = parseOpportunityScoreLift(content);
    const recTime = parseRecommendationTime(r as any);
    const baseRow = {
      company_id: companyId,
      connection_id: connectionId!,
      ad_account_id: adAccountId!,
      recommendation_type: tipo,
      body: corpo,
      lift_estimate: lift,
      opportunity_score_lift: score,
      recommendation_stage: stage,
      recommendation_time: recTime,
      url,
      raw: r,
      last_seen_at: nowIso,
    } as const;
    if (objIds.length === 0) {
      rows.push({ ...baseRow, external_campaign_id: null, external_adset_id: null });
    } else {
      for (const oid of objIds) {
        const camp = adsetToCampaign.get(oid) ?? null;
        rows.push({ ...baseRow, external_campaign_id: camp, external_adset_id: oid });
      }
    }
  }

  let upsertedCount = 0;
  let upsertError: any = null;
  if (rows.length > 0) {
    // onConflict pelo índice único (company_id, ad_account_id, dedupe_object_key, recommendation_type).
    // dedupe_object_key é GENERATED a partir de external_adset_id, logo upsert "natural" com estes 3 + tipo.
    const { error, count } = await supabaseSvc
      .from("meta_campaign_recommendations")
      .upsert(rows, {
        onConflict: "company_id,ad_account_id,dedupe_object_key,recommendation_type",
        ignoreDuplicates: false,
        count: "exact",
      } as any);
    if (error) {
      upsertError = { message: error.message, details: (error as any).details ?? null };
    } else {
      upsertedCount = count ?? rows.length;
    }
  }

  // 6) Mantém o retorno antigo para a UI existente (MetaPublishPanel) continuar a funcionar
  const conta: RecomendacaoUI[] = recsRaw.map(normalizeUI);

  return json({
    ok: true,
    ad_account_id: adAccountId,
    campaign_external_id: campaignExternalId,
    conta,
    campanha: [],   // descontinuado — sempre vazio (Graph não devolve a este nível)
    adsets: [],     // descontinuado
    erros: { conta: contaErro, campanha: null, adsets: null },
    persistencia: {
      linhas_construidas: rows.length,
      linhas_persistidas: upsertedCount,
      erro: upsertError,
    },
    gerado_em: nowIso,
  });
});
