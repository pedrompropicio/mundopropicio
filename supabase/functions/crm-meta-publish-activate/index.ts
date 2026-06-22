// crm-meta-publish-activate (FASE 3)
// POST { company_id, plan_id, acao: 'ativar' | 'pausar' }
//
// Flips de status no Meta:
//   ativar  → BOTTOM-UP: ads → adsets → campanha
//   pausar  → TOP-DOWN:  campanha → adsets → ads
//
// Idempotência: grava meta_status em cada objeto dentro do jsonb adsets à
// medida que confirma o flip. Se um objeto já estiver no status-alvo, salta.
//
// Tratamento de erro: nunca devolve non-2xx por rejeição do Meta. Em falha
// devolve HTTP 200 com { ok:false, error, error_user_msg, resultado:[...] }
// e grava activation_error. NUNCA marca estado='ativo' sem a campanha estar
// ACTIVE no Meta.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
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

type GraphError = { message?: string; code?: number; error_subcode?: number; type?: string; error_user_msg?: string; error_user_title?: string };

async function graphPOST(
  path: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: GraphError | null; raw: any }> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}${path}`;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    params.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  params.set("access_token", accessToken);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) {
    return { ok: false, status: r.status, error: j?.error ?? null, raw: j };
  }
  return { ok: true, data: j };
}

type ResultadoItem = {
  nivel: "ad" | "adset" | "campanha";
  id: string;
  nome?: string | null;
  status: "ACTIVE" | "PAUSED" | "skipped" | "failed";
  detalhe?: string;
};

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[meta-publish-activate] BUILD_VERSION=activate-v2");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error_user_msg: "Método não permitido." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error_user_msg: "Sessão inválida." }, 401);

  let body: { company_id?: string; plan_id?: string; acao?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error_user_msg: "JSON inválido." }, 400); }
  const companyIdIn = body.company_id;
  const planId = body.plan_id;
  const acao = body.acao;
  if (!companyIdIn || !planId || (acao !== "ativar" && acao !== "pausar")) {
    return json({ ok: false, error_user_msg: "Parâmetros em falta (company_id, plan_id, acao=ativar|pausar)." }, 400);
  }
  const targetStatus: "ACTIVE" | "PAUSED" = acao === "ativar" ? "ACTIVE" : "PAUSED";

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Utilizador (para activated_by)
  const { data: userInfo } = await supabase.auth.getUser();
  const userId = userInfo?.user?.id ?? null;

  // 1) Lê o plano (RLS valida pertença ao company)
  const { data: planRow, error: planErr } = await (supabase as any)
    .schema("crm").from("meta_publish_plan")
    .select("id, company_id, estado, meta_campaign_id, adsets")
    .eq("id", planId)
    .maybeSingle();
  if (planErr) return json({ ok: false, error_user_msg: `Falha a ler o plano: ${planErr.message}` }, 200);
  if (!planRow) return json({ ok: false, error_user_msg: "Plano não encontrado." }, 404);
  if (planRow.company_id !== companyIdIn) return json({ ok: false, error_user_msg: "Plano não pertence a esta empresa." }, 403);

  const estado: string = planRow.estado ?? "";
  if (acao === "ativar" && !(estado === "publicado" || estado === "pausado")) {
    return json({ ok: false, error_user_msg: `Não é possível ativar — o plano está no estado "${estado}". Tem de estar "publicado" ou "pausado".` }, 200);
  }
  if (acao === "pausar" && estado !== "ativo") {
    return json({ ok: false, error_user_msg: `Não é possível pausar — o plano está no estado "${estado}". Tem de estar "ativo".` }, 200);
  }

  const metaCampaignId: string | null = planRow.meta_campaign_id ?? null;
  if (!metaCampaignId) {
    return json({ ok: false, error_user_msg: "Plano sem meta_campaign_id. Publica primeiro." }, 200);
  }
  const adsets: any[] = Array.isArray(planRow.adsets) ? planRow.adsets : [];
  if (adsets.length === 0) {
    return json({ ok: false, error_user_msg: "Plano sem adsets." }, 200);
  }

  // Pré-condição: todos os adsets e anúncios têm meta_*_id
  for (const a of adsets) {
    if (!a.meta_adset_id) {
      return json({ ok: false, error_user_msg: `Adset "${a.trigger_nome ?? "?"}" sem meta_adset_id. Não posso ativar — publica primeiro.` }, 200);
    }
    for (const an of (a.anuncios ?? [])) {
      if (!an.meta_ad_id) {
        return json({ ok: false, error_user_msg: `Anúncio em "${a.trigger_nome ?? "?"}" sem meta_ad_id. Não posso ativar — publica primeiro.` }, 200);
      }
    }
  }

  // 2) Conexão Meta ativa
  const { data: linkRow, error: linkErr } = await (supabase as any)
    .schema("crm").from("ad_platform_account_links")
    .select("connection_id, is_primary, enabled")
    .eq("enabled", true)
    .eq("company_id", planRow.company_id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkErr) return json({ ok: false, error_user_msg: `Falha a ler conexão Meta: ${linkErr.message}` }, 200);
  if (!linkRow) return json({ ok: false, error_user_msg: "Sem conexão Meta ativa para esta empresa." }, 200);
  const connectionId = linkRow.connection_id as string;

  // 3) Decifra access_token
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ ok: false, error_user_msg: "Não foi possível decifrar o access token Meta." }, 200);
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;

  // 4) Snapshot mutável para escrever meta_status
  const adsetsOut: any[] = JSON.parse(JSON.stringify(adsets));
  const resultado: ResultadoItem[] = [];

  async function persistAdsets() {
    await (admin as any).schema("crm").from("meta_publish_plan")
      .update({ adsets: adsetsOut }).eq("id", planId);
  }

  async function flip(objectId: string, currentStatus: string | null | undefined): Promise<{ ok: true } | { ok: false; error: any; raw: any }> {
    if (currentStatus === targetStatus) return { ok: true };
    const r = await graphPOST(`/${objectId}`, { status: targetStatus }, accessToken);
    if (!r.ok) return { ok: false, error: r.error, raw: r.raw };
    return { ok: true };
  }

  function metaUserMsg(err: any, raw: any): string {
    return err?.error_user_msg
      || err?.message
      || raw?.error?.error_user_msg
      || raw?.error?.message
      || "O Meta rejeitou a operação.";
  }

  async function failPartial(err: any, raw: any): Promise<Response> {
    await (admin as any).schema("crm").from("meta_publish_plan")
      .update({
        adsets: adsetsOut,
        activation_error: { acao, error: err ?? null, raw: raw ?? null, at: new Date().toISOString() },
      })
      .eq("id", planId);
    return json({
      ok: false,
      error: raw ?? err ?? null,
      error_user_msg: metaUserMsg(err, raw),
      resultado,
    }, 200);
  }

  // 5) Sequência de flips
  if (acao === "ativar") {
    // BOTTOM-UP: ads → adsets → campanha
    for (const a of adsetsOut) {
      for (const an of (a.anuncios ?? [])) {
        const r = await flip(an.meta_ad_id, an.meta_status);
        if (!(r as any).ok) {
          resultado.push({ nivel: "ad", id: an.meta_ad_id, status: "failed", detalhe: metaUserMsg((r as any).error, (r as any).raw) });
          return await failPartial((r as any).error, (r as any).raw);
        }
        an.meta_status = "ACTIVE";
        resultado.push({ nivel: "ad", id: an.meta_ad_id, status: "ACTIVE" });
      }
      await persistAdsets();
    }
    for (const a of adsetsOut) {
      const r = await flip(a.meta_adset_id, a.meta_status);
      if (!(r as any).ok) {
        resultado.push({ nivel: "adset", id: a.meta_adset_id, status: "failed", detalhe: metaUserMsg((r as any).error, (r as any).raw) });
        return await failPartial((r as any).error, (r as any).raw);
      }
      a.meta_status = "ACTIVE";
      resultado.push({ nivel: "adset", id: a.meta_adset_id, nome: a.trigger_nome ?? null, status: "ACTIVE" });
    }
    await persistAdsets();

    const rC = await flip(metaCampaignId, estado === "ativo" ? "ACTIVE" : null);
    if (!(rC as any).ok) {
      resultado.push({ nivel: "campanha", id: metaCampaignId, status: "failed", detalhe: metaUserMsg((rC as any).error, (rC as any).raw) });
      return await failPartial((rC as any).error, (rC as any).raw);
    }
    resultado.push({ nivel: "campanha", id: metaCampaignId, status: "ACTIVE" });

    await (admin as any).schema("crm").from("meta_publish_plan")
      .update({
        estado: "ativo",
        activated_at: new Date().toISOString(),
        activated_by: userId,
        activation_error: null,
        adsets: adsetsOut,
      })
      .eq("id", planId);

    return json({ ok: true, resultado, estado: "ativo" });
  }

  // pausar — TOP-DOWN: campanha → adsets → ads
  const rC = await flip(metaCampaignId, null);
  if (!(rC as any).ok) {
    resultado.push({ nivel: "campanha", id: metaCampaignId, status: "failed", detalhe: metaUserMsg((rC as any).error, (rC as any).raw) });
    return await failPartial((rC as any).error, (rC as any).raw);
  }
  resultado.push({ nivel: "campanha", id: metaCampaignId, status: "PAUSED" });

  for (const a of adsetsOut) {
    const r = await flip(a.meta_adset_id, a.meta_status);
    if (!(r as any).ok) {
      resultado.push({ nivel: "adset", id: a.meta_adset_id, status: "failed", detalhe: metaUserMsg((r as any).error, (r as any).raw) });
      return await failPartial((r as any).error, (r as any).raw);
    }
    a.meta_status = "PAUSED";
    resultado.push({ nivel: "adset", id: a.meta_adset_id, nome: a.trigger_nome ?? null, status: "PAUSED" });
  }
  await persistAdsets();

  for (const a of adsetsOut) {
    for (const an of (a.anuncios ?? [])) {
      const r = await flip(an.meta_ad_id, an.meta_status);
      if (!(r as any).ok) {
        resultado.push({ nivel: "ad", id: an.meta_ad_id, status: "failed", detalhe: metaUserMsg((r as any).error, (r as any).raw) });
        return await failPartial((r as any).error, (r as any).raw);
      }
      an.meta_status = "PAUSED";
      resultado.push({ nivel: "ad", id: an.meta_ad_id, status: "PAUSED" });
    }
    await persistAdsets();
  }

  await (admin as any).schema("crm").from("meta_publish_plan")
    .update({
      estado: "pausado",
      activation_error: null,
      adsets: adsetsOut,
    })
    .eq("id", planId);

  return json({ ok: true, resultado, estado: "pausado" });
});
