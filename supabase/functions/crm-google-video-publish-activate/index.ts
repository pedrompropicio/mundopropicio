// crm-google-video-publish-activate (D-ERP108 — F4, MOTOR ÚNICO, GOOGLE ADS / YOUTUBE)
// POST { company_id, plan_id, acao: 'ativar' | 'pausar', approval_note? }
//
// Mesmo ciclo do TikTok/Meta:
//   ativar  → BOTTOM-UP: anúncios → grupos → campanha
//   pausar  → TOP-DOWN:  campanha → grupos → anúncios
//
// Google Ads: status ENABLED | PAUSED, por :mutate com updateMask=status.
//
// NOME: NÃO reutiliza crm-google-publish-activate, que já existe para as
// campanhas de PESQUISA de eventos.
//
// Regras iguais ao TikTok: sessão obrigatória (service_role recusado), activar só
// com artist_ads_assert_cap_admin e pausar com artist_ads_assert_write, teto
// re-verificado ao activar (plataforma 'google', moeda da conta), registo em
// crm.ads_entity_actions_log, espelho da campanha actualizado sem NUNCA tocar em
// linked_song_id / linked_song_locked. Rejeição do Google devolve HTTP 200 com
// { ok:false, ... } — nunca excepção.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import {
  checkTetoGoogle,
  corsHeaders,
  dailyFromAdsetsGoogle,
  descreveErroGoogle,
  GOOGLE_ADS_API_VERSION,
  googleAdsPost,
  googleCtx,
  json,
  loadGoogleConnection,
  logAdsActionGoogle,
} from "../_shared/google-video-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ResultadoItem = {
  nivel: "ad" | "adgroup" | "campanha";
  id: string;
  nome?: string | null;
  status: "ENABLED" | "PAUSED" | "skipped" | "failed";
  detalhe?: string;
};

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[google-video-publish-activate] BUILD_VERSION=google-video-activate-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error_user_msg: "Método não permitido." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error_user_msg: "Sessão inválida." }, 401);

  let body: { company_id?: string; plan_id?: string; acao?: string; approval_note?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error_user_msg: "JSON inválido." }, 400);
  }
  const companyIdIn = body.company_id;
  const planId = body.plan_id;
  const acao = body.acao;
  const approvalNote = typeof body.approval_note === "string" ? body.approval_note.slice(0, 2000) : null;
  if (!companyIdIn || !planId || (acao !== "ativar" && acao !== "pausar")) {
    return json({ ok: false, error_user_msg: "Parâmetros em falta (company_id, plan_id, acao=ativar|pausar)." }, 400);
  }
  const target: "ENABLED" | "PAUSED" = acao === "ativar" ? "ENABLED" : "PAUSED";

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userInfo } = await supabase.auth.getUser();
  const userId = userInfo?.user?.id ?? null;

  // 1) Plano.
  const { data: planRow, error: planErr } = await (supabase as any)
    .schema("crm").from("meta_publish_plan")
    .select(
      "id, company_id, platform, estado, external_campaign_id, adsets, song_id, artist_id, connection_id, moeda, start_time, end_time",
    )
    .eq("id", planId)
    .maybeSingle();
  if (planErr) return json({ ok: false, error_user_msg: `Falha a ler o plano: ${planErr.message}` }, 200);
  if (!planRow) return json({ ok: false, error_user_msg: "Plano não encontrado." }, 404);
  if (planRow.company_id !== companyIdIn) {
    return json({ ok: false, error_user_msg: "Plano não pertence a esta empresa." }, 403);
  }
  if (String((planRow as any).platform ?? "meta") !== "google") {
    return json({ ok: false, error: "plano_nao_google", error_user_msg: "Este plano não é de Google Ads." }, 422);
  }
  if (!(planRow as any).song_id) {
    return json({
      ok: false,
      error: "plano_sem_musica",
      error_user_msg: "Este motor só trata o alvo artista+música.",
    }, 422);
  }

  // 2) Papéis — service_role nunca activa nem pausa.
  if (!userId) return json({ ok: false, error: "sem_sessao", error_user_msg: "É necessária sessão de utilizador." }, 401);
  const guard = acao === "ativar" ? "artist_ads_assert_cap_admin" : "artist_ads_assert_write";
  const { error: roleErr } = await supabase.rpc(guard, { p_company_id: planRow.company_id });
  if (roleErr) {
    return json({
      ok: false,
      error: "sem_permissao",
      error_user_msg: acao === "ativar"
        ? "Só um administrador pode activar campanhas de música."
        : "Sem permissão para pausar campanhas desta empresa.",
    }, 403);
  }

  // 3) Estado.
  const estado: string = planRow.estado ?? "";
  if (acao === "ativar" && !(estado === "publicado" || estado === "pausado")) {
    return json({
      ok: false,
      error_user_msg: `Não é possível activar — o plano está "${estado}" (tem de estar "publicado" ou "pausado").`,
    }, 200);
  }
  if (acao === "pausar" && estado !== "ativo") {
    return json({
      ok: false,
      error_user_msg: `Não é possível pausar — o plano está "${estado}" (tem de estar "ativo").`,
    }, 200);
  }

  const campaignResource: string | null = (planRow as any).external_campaign_id ?? null;
  if (!campaignResource) {
    return json({
      ok: false,
      error: "plano_sem_campanha",
      error_user_msg: "Plano sem campanha no Google. Publica primeiro.",
    }, 200);
  }

  const adsets: any[] = Array.isArray(planRow.adsets) ? planRow.adsets : [];
  if (adsets.length === 0) return json({ ok: false, error_user_msg: "Plano sem conjuntos." }, 200);
  for (const a of adsets) {
    if (!a.external_adgroup_id) {
      return json({
        ok: false,
        error_user_msg: `Conjunto "${a.trigger_nome ?? "?"}" sem grupo no Google. Publica primeiro.`,
      }, 200);
    }
    for (const an of (a.anuncios ?? [])) {
      if (!an.external_ad_id) {
        return json({
          ok: false,
          error_user_msg: `Anúncio em "${a.trigger_nome ?? "?"}" sem id no Google. Publica primeiro.`,
        }, 200);
      }
    }
  }

  // 4) Ligação + credenciais (erros identificáveis, nunca excepção).
  const conn = await loadGoogleConnection(admin as any, { connectionId: String((planRow as any).connection_id) });
  if (!conn.ok) return json({ ok: false, error: conn.error, error_user_msg: conn.message }, 200);
  if (conn.status !== "active") {
    return json({
      ok: false,
      error: "ligacao_inactiva",
      error_user_msg: `A ligação do Google Ads não está activa (status=${conn.status}).`,
    }, 200);
  }
  const ctxRes = await googleCtx(conn);
  if (!ctxRes.ok) return json({ ok: false, error: ctxRes.error, error_user_msg: ctxRes.message }, 200);
  const ctx = ctxRes.ctx;
  const customerId = conn.customerId;
  const base = `/customers/${customerId}`;

  // 5) Teto (só ao activar), na moeda da conta.
  if (acao === "ativar") {
    const usaLifetime = !!(planRow as any).end_time;
    const dias = ((planRow as any).end_time && (planRow as any).start_time)
      ? Math.max(
        1,
        Math.ceil(
          (new Date((planRow as any).end_time).getTime() - new Date((planRow as any).start_time).getTime()) / 86400000,
        ),
      )
      : 1;
    const teto = await checkTetoGoogle(supabase as any, {
      artistId: String((planRow as any).artist_id),
      connectionId: conn.connectionId,
      moeda: (planRow as any).moeda ?? conn.moedaConta,
      pedidoDiario: dailyFromAdsetsGoogle(adsets, usaLifetime, dias),
    });
    if (!teto.ok) {
      return json({
        ok: false,
        error: teto.error,
        teto: teto.teto,
        pedido: teto.pedido,
        ja_comprometido: teto.ja_comprometido,
        disponivel: teto.disponivel,
        moeda: teto.moeda,
        error_user_msg: teto.error === "sem_teto"
          ? "Esta conta do Google Ads não tem teto de orçamento definido — define o teto antes de activar."
          : teto.error === "acima_do_teto"
          ? `Acima do teto diário (${teto.teto} ${teto.moeda ?? ""}): pedido ${teto.pedido}, disponível ${teto.disponivel}.`
          : "A moeda do plano/conta não é a do teto.",
      }, 422);
    }
  }

  const adsetsOut: any[] = JSON.parse(JSON.stringify(adsets));
  const resultado: ResultadoItem[] = [];

  async function persist(extra: Record<string, unknown> = {}) {
    await (admin as any).schema("crm").from("meta_publish_plan")
      .update({ adsets: adsetsOut, ...extra }).eq("id", planId);
  }

  async function flip(
    nivel: "campaign" | "adgroup" | "ad",
    resourceName: string,
    current: string | null | undefined,
  ): Promise<{ ok: true; skipped: boolean } | { ok: false; codigo: string; message: string }> {
    if (current === target) return { ok: true, skipped: true };
    const path = nivel === "campaign"
      ? `${base}/campaigns:mutate`
      : nivel === "adgroup"
      ? `${base}/adGroups:mutate`
      : `${base}/adGroupAds:mutate`;
    try {
      await googleAdsPost(ctx, path, {
        operations: [{ update: { resourceName, status: target }, updateMask: "status" }],
      });
      return { ok: true, skipped: false };
    } catch (e) {
      const d = descreveErroGoogle((e as any)?.raw ?? String(e));
      return { ok: false, codigo: d.codigo, message: d.mensagem };
    }
  }

  async function logAcao(success: boolean, errMsg?: string | null) {
    const err = await logAdsActionGoogle(admin as any, {
      company_id: planRow.company_id,
      connection_id: conn.ok ? conn.connectionId : "",
      ad_account_id: customerId,
      plan_id: planId!,
      artist_id: (planRow as any).artist_id,
      song_id: (planRow as any).song_id,
      entity_type: "campaign",
      external_id: campaignResource!,
      action: acao === "ativar" ? "activate" : "pause",
      prev_status: estado === "ativo" ? "ENABLED" : "PAUSED",
      new_status: success ? target : null,
      updates_jsonb: { plan_id: planId, alvo: "song", approval_note: approvalNote, api: GOOGLE_ADS_API_VERSION },
      success,
      error_message: success ? null : (errMsg ?? null),
      performed_by: userId,
      approved_by: userId,
    });
    if (err) console.warn("[google-video-publish-activate] registo falhou:", err);
  }

  async function espelhaStatus() {
    // NÃO toca em linked_song_id / linked_song_locked.
    const { error } = await (admin as any).schema("crm").from("meta_campaign_snapshot")
      .update({ status: target, effective_status: target, last_synced_at: new Date().toISOString() })
      .eq("connection_id", conn.ok ? conn.connectionId : "")
      .eq("external_campaign_id", campaignResource);
    if (error) console.warn("[google-video-publish-activate] espelho falhou:", error.message);
  }

  async function falhaParcial(
    nivel: ResultadoItem["nivel"],
    id: string,
    e: { codigo: string; message: string },
  ): Promise<Response> {
    resultado.push({ nivel, id, status: "failed", detalhe: e.message });
    await persist({
      activation_error: { acao, plataforma: "google", error: e.codigo, message: e.message, at: new Date().toISOString() },
    });
    await logAcao(false, e.message);
    return json({ ok: false, error: e.codigo, error_user_msg: e.message, resultado }, 200);
  }

  if (acao === "ativar") {
    // BOTTOM-UP: anúncios → grupos → campanha.
    for (const a of adsetsOut) {
      for (const an of (a.anuncios ?? [])) {
        const r = await flip("ad", an.external_ad_id, an.google_status);
        if (!r.ok) return await falhaParcial("ad", an.external_ad_id, r);
        an.google_status = target;
        resultado.push({ nivel: "ad", id: an.external_ad_id, status: r.skipped ? "skipped" : target });
      }
      await persist();
    }
    for (const a of adsetsOut) {
      const r = await flip("adgroup", a.external_adgroup_id, a.google_status);
      if (!r.ok) return await falhaParcial("adgroup", a.external_adgroup_id, r);
      a.google_status = target;
      resultado.push({
        nivel: "adgroup",
        id: a.external_adgroup_id,
        nome: a.trigger_nome ?? null,
        status: r.skipped ? "skipped" : target,
      });
      await persist();
    }
    const rc = await flip("campaign", campaignResource, estado === "ativo" ? "ENABLED" : "PAUSED");
    if (!rc.ok) return await falhaParcial("campanha", campaignResource, rc);
    resultado.push({ nivel: "campanha", id: campaignResource, status: rc.skipped ? "skipped" : target });
    await persist({ estado: "ativo", activated_at: new Date().toISOString(), activated_by: userId, activation_error: null });
  } else {
    // TOP-DOWN: campanha → grupos → anúncios.
    const rc = await flip("campaign", campaignResource, estado === "ativo" ? "ENABLED" : "PAUSED");
    if (!rc.ok) return await falhaParcial("campanha", campaignResource, rc);
    resultado.push({ nivel: "campanha", id: campaignResource, status: rc.skipped ? "skipped" : target });
    for (const a of adsetsOut) {
      const r = await flip("adgroup", a.external_adgroup_id, a.google_status);
      if (!r.ok) return await falhaParcial("adgroup", a.external_adgroup_id, r);
      a.google_status = target;
      resultado.push({
        nivel: "adgroup",
        id: a.external_adgroup_id,
        nome: a.trigger_nome ?? null,
        status: r.skipped ? "skipped" : target,
      });
      await persist();
    }
    for (const a of adsetsOut) {
      for (const an of (a.anuncios ?? [])) {
        const r = await flip("ad", an.external_ad_id, an.google_status);
        if (!r.ok) return await falhaParcial("ad", an.external_ad_id, r);
        an.google_status = target;
        resultado.push({ nivel: "ad", id: an.external_ad_id, status: r.skipped ? "skipped" : target });
      }
      await persist();
    }
    await persist({ estado: "pausado", activation_error: null });
  }

  await espelhaStatus();
  await logAcao(true);

  return json({
    ok: true,
    plataforma: "google",
    api: GOOGLE_ADS_API_VERSION,
    acao,
    estado: acao === "ativar" ? "ativo" : "pausado",
    external_campaign_id: campaignResource,
    resultado,
  });
});
