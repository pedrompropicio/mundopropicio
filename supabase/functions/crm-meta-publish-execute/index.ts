// crm-meta-publish-execute (FASE 2)
// POST { company_id, plan_id, dry_run?: boolean }
//
// Cria no Meta: 1 campanha + N adsets + M anúncios — TUDO status=PAUSED.
// ABO: orçamento nos adsets, campanha sem budget.
// Idempotência: se já existir meta_campaign_id / meta_adset_id / meta_ad_id
// guardados no plano, NÃO recria — retoma. Re-correr após falha parcial
// retoma de onde parou e NUNCA duplica.
// Dry-run: monta payloads e devolve-os sem chamar a Meta Graph API.

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

function normalizeAdAccountId(raw: string): string {
  const c = raw.trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

// Meta exige códigos ISO-2 em geo_locations.countries.
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  "portugal": "PT",
  "brasil": "BR", "brazil": "BR",
  "espanha": "ES", "spain": "ES",
  "frança": "FR", "franca": "FR", "france": "FR",
  "reino unido": "GB", "united kingdom": "GB",
  "alemanha": "DE", "germany": "DE",
  "itália": "IT", "italia": "IT", "italy": "IT",
};
function normalizeCountries(
  arr: unknown,
  warn?: (codigo: string, detalhe: string) => void,
): string[] {
  if (!Array.isArray(arr) || arr.length === 0) return ["PT"];
  const out: string[] = [];
  for (const raw of arr) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const v = raw.trim();
    if (/^[A-Z]{2}$/.test(v)) { out.push(v); continue; }
    const key = v.toLowerCase();
    if (COUNTRY_NAME_TO_ISO2[key]) { out.push(COUNTRY_NAME_TO_ISO2[key]); continue; }
    const fallback = v.slice(0, 2).toUpperCase();
    warn?.("geo_nao_normalizada", v);
    out.push(fallback);
  }
  return out.length > 0 ? out : ["PT"];
}

// Meta é rígido. Defaults seguros.
function mapObjective(objetivo: string): { optimization_goal: string; billing_event: string } {
  switch (objetivo) {
    case "OUTCOME_SALES":
      // OFFSITE_CONVERSIONS exige pixel+evento. Sem isso a criação rebenta.
      // Aqui assumimos que o gestor preparou pixel; se não houver, há fallback abaixo.
      return { optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "IMPRESSIONS" };
    case "OUTCOME_TRAFFIC":
      return { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" };
    case "OUTCOME_AWARENESS":
      return { optimization_goal: "REACH", billing_event: "IMPRESSIONS" };
    case "OUTCOME_ENGAGEMENT":
      return { optimization_goal: "POST_ENGAGEMENT", billing_event: "IMPRESSIONS" };
    default:
      return { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" };
  }
}

type GraphError = { message?: string; code?: number; error_subcode?: number; type?: string };

async function graphPOST(path: string, body: Record<string, unknown>, accessToken: string): Promise<{ ok: true; data: any } | { ok: false; status: number; error: GraphError | null; raw: any }> {
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

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[meta-publish-execute] BUILD_VERSION=publish-execute-v10");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { company_id?: string; plan_id?: string; dry_run?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const companyIdIn = body.company_id;
  const planId = body.plan_id;
  // SALVAGUARDA P0: dry_run default = TRUE. Só escreve no Meta se vier explicitamente false.
  const dryRun = body.dry_run !== false;
  if (!companyIdIn || !planId) {
    return json({ error: "missing_params", required: ["company_id", "plan_id"] }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Lê o plano (RLS user — valida pertença ao company)
  const { data: planRow, error: planErr } = await (supabase as any)
    .schema("crm").from("meta_publish_plan")
    .select("id, company_id, event_id, design_id, objetivo, orcamento_total_cents, moeda, link_destino, adsets, estado, meta_campaign_id")
    .eq("id", planId)
    .maybeSingle();
  if (planErr) return json({ error: "plan_query_failed", detail: planErr.message }, 500);
  if (!planRow) return json({ error: "plan_not_found" }, 404);
  if (planRow.company_id !== companyIdIn) return json({ error: "company_mismatch" }, 403);

  if (planRow.estado === "publicado") {
    return json({ error: "ja_publicado", meta_campaign_id: planRow.meta_campaign_id }, 409);
  }
  if (!["rascunho", "pronto_a_publicar", "a_publicar", "falhado"].includes(planRow.estado)) {
    return json({ error: "estado_invalido", estado: planRow.estado }, 409);
  }

  // 2) Conexão Meta ativa para este company → connection_id + ad_account_id.
  //    Pegamos o link primário enabled (mesma origem que MetaPublishPanel/Setup usa).
  const { data: linkRow, error: linkErr } = await (supabase as any)
    .schema("crm").from("ad_platform_account_links")
    .select("connection_id, ad_account_id, is_primary, enabled")
    .eq("enabled", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkErr) return json({ error: "ad_account_query_failed", detail: linkErr.message }, 500);
  if (!linkRow) return json({ error: "no_active_meta_connection" }, 412);

  const connectionId = linkRow.connection_id as string;
  const adAccountId = normalizeAdAccountId(linkRow.ad_account_id as string);
  const adAccountNumeric = adAccountId.replace(/^act_/, "");

  // 2b) Página de Facebook e (opcional) Instagram associados à conexão.
  //     Sem page_id NÃO conseguimos criar criativo novo (object_story_spec exige page_id).
  //     Falhamos cedo, ANTES de qualquer escrita no Meta.
  const { data: connRow, error: connErr } = await (admin as any)
    .schema("crm").from("ad_platform_connections")
    .select("selected_page_id, selected_instagram_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (connErr) return json({ error: "connection_query_failed", detail: connErr.message }, 500);
  const selectedPageId: string | null = (connRow as any)?.selected_page_id ?? null;
  const selectedInstagramId: string | null = (connRow as any)?.selected_instagram_id ?? null;
  if (!selectedPageId) {
    return json({ error: "sem_pagina_facebook", message: "A conexão Meta não tem página de Facebook selecionada." }, 412);
  }

  // 2c) Link de destino do plano. Se faltar e nenhum adset tiver override, falha cedo.
  const planoLinkDestino: string | null = typeof planRow.link_destino === "string" && planRow.link_destino.length > 0
    ? planRow.link_destino
    : null;
  const adsetsPreview: any[] = Array.isArray(planRow.adsets) ? planRow.adsets : [];
  const algumLink = adsetsPreview.some((a) => typeof a?.link_destino === "string" && a.link_destino.length > 0);
  if (!planoLinkDestino && !algumLink) {
    return json({ error: "sem_link_destino", message: "Define o link de destino no painel (https://...) antes de publicar." }, 412);
  }

  // 3) Decifra access_token (idêntico ao crm-meta-sync-creatives).
  const { data: tokenRows, error: tokenErr } = await supabase.rpc(
    "crm_get_meta_decrypted_token",
    { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
  );
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "decrypt_failed", detail: tokenErr?.message ?? null }, 403);
  }
  const accessToken = (tokenRows[0] as { access_token: string }).access_token;

  // 4) Dados do evento (para nome da campanha + pixel para conversões).
  const { data: eventRow, error: eventErr } = await admin
    .from("events").select("name, date, meta_pixel_id").eq("id", planRow.event_id).maybeSingle();
  console.log("[publish-execute] EVENT_DEBUG", JSON.stringify({
    event_id_usado: planRow.event_id,
    eventRow_raw: eventRow,
    eventErr: eventErr ?? "no_error",
    admin_schema_note: "admin createClient sem db.schema => default public",
  }));
  // Fallback explícito a public caso por algum motivo venha vazio sem erro
  let eventRowFinal: any = eventRow;
  if (!eventRow && !eventErr) {
    const { data: eventRowPub, error: eventErrPub } = await (admin as any)
      .schema("public").from("events")
      .select("name, date, meta_pixel_id").eq("id", planRow.event_id).maybeSingle();
    console.log("[publish-execute] EVENT_DEBUG_PUBLIC_FALLBACK", JSON.stringify({
      eventRowPub, eventErrPub: eventErrPub ?? "no_error",
    }));
    eventRowFinal = eventRowPub;
  }
  const nomeEvento = (eventRowFinal as any)?.name ?? "Evento";
  const dataEvento = (eventRowFinal as any)?.date ?? "";
  const eventPixelId: string | null = (eventRowFinal as any)?.meta_pixel_id ?? null;

  const adsets: any[] = Array.isArray(planRow.adsets) ? planRow.adsets : [];
  const avisos: Array<{ codigo: string; detalhe?: string; adset?: string; ad_idx?: number }> = [];

  // 5) Resolução creative_id (uuid interno) → meta_creative_id.
  //    Recolher TODOS os ids únicos para uma query só.
  const creativeUuidSet = new Set<string>();
  for (const a of adsets) {
    for (const an of (a.anuncios ?? [])) {
      for (const cid of (an.creative_ids ?? [])) {
        if (typeof cid === "string" && cid) creativeUuidSet.add(cid);
      }
    }
  }
  const creativeUuids = Array.from(creativeUuidSet);
  type CreativeInfo = { meta_creative_id: string | null; meta_image_hash: string | null; type: string | null };
  const resolvedCreatives = new Map<string, CreativeInfo>();
  if (creativeUuids.length > 0) {
    const { data: rows, error: cErr } = await (admin as any)
      .schema("crm").from("meta_creatives")
      .select("id, meta_creative_id, meta_image_hash, type")
      .in("id", creativeUuids);
    if (cErr) return json({ error: "creatives_query_failed", detail: cErr.message }, 500);
    for (const r of (rows ?? [])) {
      resolvedCreatives.set(r.id as string, {
        meta_creative_id: (r as any).meta_creative_id ?? null,
        meta_image_hash: (r as any).meta_image_hash ?? null,
        type: (r as any).type ?? null,
      });
    }
    for (const u of creativeUuids) {
      if (!resolvedCreatives.has(u)) resolvedCreatives.set(u, { meta_creative_id: null, meta_image_hash: null, type: null });
    }
  }

  // 6) Monta payloads.
  const objetivo = planRow.objetivo ?? "OUTCOME_TRAFFIC";
  let { optimization_goal, billing_event } = mapObjective(objetivo);

  const campaignPayload = {
    name: `[MP Audience] ${nomeEvento}${dataEvento ? ` - ${dataEvento}` : ""}`,
    objective: objetivo,
    status: "PAUSED",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  };

  function buildAdsetPayload(a: any, campaignIdParaPayload: string): { payload: Record<string, unknown>; goal_used: string; sem_pixel?: boolean } {
    const pub = a.publico_sugerido ?? {};
    const countries = normalizeCountries(
      Array.isArray(pub.geo) && pub.geo.length > 0 ? pub.geo : ["PT"],
      (codigo, detalhe) => avisos.push({ codigo, adset: a.trigger_nome, detalhe }),
    );
    const targeting: Record<string, unknown> = {
      geo_locations: { countries },
      age_min: Number.isFinite(pub.idade_min) ? pub.idade_min : 18,
      age_max: Number.isFinite(pub.idade_max) ? pub.idade_max : 65,
      targeting_automation: { advantage_audience: 0 },
    };
    if (a.publico_custom_audience_id) {
      targeting.custom_audiences = [{ id: String(a.publico_custom_audience_id) }];
    }
    let goal = optimization_goal;
    const payload: Record<string, unknown> = {
      name: a.trigger_nome || "Adset",
      campaign_id: campaignIdParaPayload,
      daily_budget: Math.max(0, Number(a.orcamento_cents ?? 0)),
      billing_event,
      optimization_goal: goal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      status: "PAUSED",
      targeting,
    };
    let sem_pixel = false;
    if (goal === "OFFSITE_CONVERSIONS") {
      if (eventPixelId) {
        payload.promoted_object = { pixel_id: eventPixelId, custom_event_type: "PURCHASE" };
      } else {
        sem_pixel = true;
      }
    }
    return { payload, goal_used: goal, sem_pixel };
  }

  // Resolve link efetivo: override do adset > link do plano.
  function resolveLink(a: any): string | null {
    if (typeof a?.link_destino === "string" && a.link_destino.length > 0) return a.link_destino;
    return planoLinkDestino;
  }

  const META_VALID_CTAS = new Set(["BOOK_TRAVEL","CONTACT_US","DONATE","DONATE_NOW","DOWNLOAD","GET_DIRECTIONS","LEARN_MORE","SEE_DETAILS","SIGN_UP","SHOP_NOW","SUBSCRIBE","BUY_TICKETS","GET_EVENT_TICKETS","BUY_NOW","ORDER_NOW","GET_OFFER","BOOK_NOW","LISTEN_NOW","WATCH_MORE","APPLY_NOW","GET_QUOTE","NO_BUTTON","SEE_MENU"]);
  const CTA_ALIASES: Record<string, string> = {
    "GET_TICKETS": "BUY_TICKETS",
    "BUY_TICKET": "BUY_TICKETS",
    "TICKETS": "BUY_TICKETS",
    "GET_EVENT_TICKET": "GET_EVENT_TICKETS",
    "COMPRAR": "SHOP_NOW",
    "COMPRAR_AGORA": "SHOP_NOW",
    "SABER_MAIS": "LEARN_MORE",
  };
  function normalizeCta(raw: string): string {
    const v = String(raw || "").toUpperCase().trim();
    if (META_VALID_CTAS.has(v)) return v;
    if (CTA_ALIASES[v]) return CTA_ALIASES[v];
    return "SHOP_NOW";
  }

  function buildAdPayload(adsetIdParaPayload: string, anuncio: any, link: string): { payload: Record<string, unknown> | null; aviso?: { codigo: string; detalhe?: string } } {
    const firstCid = (anuncio.creative_ids ?? [])[0];
    if (!firstCid) return { payload: null, aviso: { codigo: "creative_sem_id" } };
    const info = resolvedCreatives.get(firstCid);
    if (!info || !info.meta_creative_id) {
      return { payload: null, aviso: { codigo: "creative_sem_meta_id", detalhe: firstCid } };
    }
    const cta = normalizeCta(anuncio.cta || "LEARN_MORE");
    const isImagem = (info.type ?? "").toLowerCase() === "image";

    // Caminho preferido: criativo NOVO com copy+link aplicados ao anúncio.
    if (isImagem && info.meta_image_hash) {
      const linkData: Record<string, unknown> = {
        image_hash: info.meta_image_hash,
        message: String(anuncio.corpo ?? "").slice(0, 2000),
        name: String(anuncio.headline ?? "").slice(0, 200),
        link,
        call_to_action: { type: cta, value: { link } },
      };
      const objectStorySpec: Record<string, unknown> = {
        page_id: selectedPageId,
        link_data: linkData,
      };
      if (selectedInstagramId) objectStorySpec.instagram_actor_id = selectedInstagramId;

      return {
        payload: {
          name: (anuncio.headline ?? "Anúncio").slice(0, 200),
          adset_id: adsetIdParaPayload,
          status: "PAUSED",
          creative: { object_story_spec: objectStorySpec },
        },
      };
    }

    // Fallback: vídeo, ou imagem sem image_hash → reutiliza creative inteiro.
    return {
      payload: {
        name: (anuncio.headline ?? "Anúncio").slice(0, 200),
        adset_id: adsetIdParaPayload,
        status: "PAUSED",
        creative: { creative_id: info.meta_creative_id },
      },
      aviso: { codigo: "copy_e_link_nao_aplicados", detalhe: "criativo reutilizado inteiro" },
    };
  }


  // ─── DRY-RUN ─────────────────────────────────────────────────────────
  if (dryRun) {
    const dryAdsets: any[] = [];
    const dryAds: any[] = [];
    for (let i = 0; i < adsets.length; i++) {
      const a = adsets[i];
      const linkEf = resolveLink(a);
      const { payload: adsetPayload, goal_used, sem_pixel } = buildAdsetPayload(a, "<CAMPAIGN_ID>");
      if (sem_pixel) avisos.push({ codigo: "sem_pixel_para_conversoes", adset: a.trigger_nome, detalhe: "objetivo Vendas exige meta_pixel_id no evento" });
      dryAdsets.push({ trigger_nome: a.trigger_nome, optimization_goal_used: goal_used, link_destino_efetivo: linkEf, payload: adsetPayload });
      for (let k = 0; k < (a.anuncios ?? []).length; k++) {
        const an = a.anuncios[k];
        if (!linkEf) {
          avisos.push({ codigo: "sem_link_destino", adset: a.trigger_nome, ad_idx: k });
          continue;
        }
        const { payload, aviso } = buildAdPayload("<ADSET_ID>", an, linkEf);
        if (aviso) avisos.push({ ...aviso, adset: a.trigger_nome, ad_idx: k });
        if (payload) dryAds.push({ adset: a.trigger_nome, ad_idx: k, payload });
      }
    }
    return json({
      dry_run: true,
      ad_account_id: adAccountId,
      payloads: {
        campaign: campaignPayload,
        adsets: dryAdsets,
        ads: dryAds,
      },
      resolved_creative_ids: Object.fromEntries(resolvedCreatives),
      avisos,
    });
  }

  // ─── ESCRITA REAL ───────────────────────────────────────────────────
  // Pré-check: se objetivo é conversões e o evento não tem pixel, falha ANTES de qualquer escrita.
  if (optimization_goal === "OFFSITE_CONVERSIONS" && !eventPixelId) {
    return json({
      error: "sem_pixel_para_conversoes",
      message: "Objetivo Vendas exige pixel; o evento não tem meta_pixel_id. Usa Tráfego ou configura o pixel.",
    }, 412);
  }

  // Estado: a_publicar
  await (admin as any).schema("crm").from("meta_publish_plan")
    .update({ estado: "a_publicar", publish_error: null, publish_started_at: new Date().toISOString() }).eq("id", planId);

  async function failAndStop(passo: string, err: any, extra?: Record<string, unknown>): Promise<Response> {
    const payload = { passo, error: err, ...(extra ?? {}) };
    await (admin as any).schema("crm").from("meta_publish_plan")
      .update({ estado: "falhado", publish_error: payload }).eq("id", planId);
    return json({ ok: false, passo, error: err, ...(extra ?? {}) }, 502);
  }

  // 7a) Campanha (idempotente)
  let metaCampaignId: string | null = planRow.meta_campaign_id ?? null;
  if (!metaCampaignId) {
    const r = await graphPOST(`/${adAccountId}/campaigns`, campaignPayload, accessToken);
    if (!r.ok) return await failAndStop("create_campaign", r.error ?? { message: `HTTP ${r.status}` }, { raw: r.raw });
    metaCampaignId = r.data.id as string;
    const { error: upErr } = await (admin as any).schema("crm").from("meta_publish_plan")
      .update({ meta_campaign_id: metaCampaignId }).eq("id", planId);
    if (upErr) return await failAndStop("persist_campaign_id", { message: upErr.message });
  }

  // 7b) Adsets + Ads (idempotente — escreve back ao adsets jsonb após cada sucesso)
  const adsetsOut: any[] = JSON.parse(JSON.stringify(adsets));
  const respAdsets: Array<{ trigger_nome: string; meta_adset_id: string; ads: string[] }> = [];

  for (let i = 0; i < adsetsOut.length; i++) {
    const a = adsetsOut[i];
    if (!a.anuncios || a.anuncios.length === 0) {
      avisos.push({ codigo: "adset_sem_anuncios", adset: a.trigger_nome });
      continue;
    }
    // Adset
    let metaAdsetId: string | null = a.meta_adset_id ?? null;
    if (!metaAdsetId) {
      const { payload, goal_used } = buildAdsetPayload(a, metaCampaignId!);
      if (goal_used !== optimization_goal) {
        avisos.push({ codigo: "optimization_goal_fallback", adset: a.trigger_nome, detalhe: goal_used });
      }
      const r = await graphPOST(`/${adAccountId}/adsets`, payload, accessToken);
      if (!r.ok) {
        // Persiste o que já temos antes de falhar (para idempotência futura)
        await (admin as any).schema("crm").from("meta_publish_plan")
          .update({ adsets: adsetsOut }).eq("id", planId);
        return await failAndStop("create_adset", r.error ?? { message: `HTTP ${r.status}` }, { adset: a.trigger_nome, raw: r.raw });
      }
      metaAdsetId = r.data.id as string;
      a.meta_adset_id = metaAdsetId;
      await (admin as any).schema("crm").from("meta_publish_plan")
        .update({ adsets: adsetsOut }).eq("id", planId);
    }

    // Ads
    const adsIds: string[] = [];
    const linkEf = resolveLink(a);
    if (!linkEf) {
      avisos.push({ codigo: "sem_link_destino", adset: a.trigger_nome });
      respAdsets.push({ trigger_nome: a.trigger_nome, meta_adset_id: metaAdsetId!, ads: adsIds });
      continue;
    }
    for (let k = 0; k < a.anuncios.length; k++) {
      const an = a.anuncios[k];
      if (an.meta_ad_id) { adsIds.push(an.meta_ad_id); continue; }
      const { payload, aviso } = buildAdPayload(metaAdsetId!, an, linkEf);
      if (aviso) avisos.push({ ...aviso, adset: a.trigger_nome, ad_idx: k });
      if (!payload) continue;
      const r = await graphPOST(`/${adAccountId}/ads`, payload, accessToken);
      if (!r.ok) {
        await (admin as any).schema("crm").from("meta_publish_plan")
          .update({ adsets: adsetsOut }).eq("id", planId);
        return await failAndStop("create_ad", r.error ?? { message: `HTTP ${r.status}` }, { adset: a.trigger_nome, ad_idx: k, raw: r.raw });
      }
      an.meta_ad_id = r.data.id as string;
      adsIds.push(an.meta_ad_id);
      await (admin as any).schema("crm").from("meta_publish_plan")
        .update({ adsets: adsetsOut }).eq("id", planId);
    }

    respAdsets.push({ trigger_nome: a.trigger_nome, meta_adset_id: metaAdsetId!, ads: adsIds });
  }

  // 7c) Estado final
  await (admin as any).schema("crm").from("meta_publish_plan")
    .update({ estado: "publicado", published_at: new Date().toISOString(), publish_finished_at: new Date().toISOString(), publish_error: null, adsets: adsetsOut })
    .eq("id", planId);

  return json({
    ok: true,
    meta_campaign_id: metaCampaignId,
    ad_account_id: adAccountId,
    ad_account_numeric: adAccountNumeric,
    adsets: respAdsets,
    avisos,
  });
});
