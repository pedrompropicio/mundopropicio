// crm-google-publish-execute — publicador de campanhas de Pesquisa no Google Ads.
//
// BUILD_VERSION=google-publish-execute-v3-eu-par
//
// Espelho do crm-meta-publish-execute. Regras não-negociáveis:
//  - Tudo nasce em PAUSA (orçamento/campanha/grupo/anúncio).
//  - dry_run é o DEFAULT: só escreve no Google com dry_run:false explícito.
//  - Motor IDEMPOTENTE: cada resource_name é persistido no plano logo após o
//    :mutate; a retoma salta o que já existe. Re-correr nunca duplica.
//  - Lock anti-corrida por publish_started_at (5 min).
//  - Rejeição do Google NUNCA devolve non-2xx: 200 + ok:false + error_user_msg.
//
// Cadeia (v24): campaignBudgets → campaigns → adGroups → adGroupCriteria
//               → campaignCriteria → adGroupAds

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import {
  getGoogleAdsAccessToken,
  googleAdsPost,
  mensagemErroGoogle,
  type GoogleAdsCtx,
} from "../_shared/google-ads.ts";
import { validatePlan, type PlanDraft } from "../_shared/google-rsa-validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
const LOGIN_CID_FALLBACK = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "";

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

const LANGUAGE_CONSTANTS: Record<string, string> = {
  pt: "1014",
  es: "1003",
  en: "1000",
  fr: "1002",
};

type Plan = Record<string, any>;

function ctxFor(plan: Plan, accessToken: string): GoogleAdsCtx {
  return {
    accessToken,
    developerToken: DEVELOPER_TOKEN,
    loginCustomerId: String(plan.login_customer_id || LOGIN_CID_FALLBACK || "").replace(/-/g, ""),
    customerId: String(plan.customer_id || "").replace(/-/g, ""),
  };
}

function budgetPayload(plan: Plan) {
  return {
    operations: [
      {
        create: {
          name: `${plan.nome_campanha} — orçamento ${new Date().toISOString().slice(0, 10)} ${plan.id.slice(0, 8)}`,
          amountMicros: String(plan.orcamento_diario_micros),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    ],
  };
}

function campaignPayload(plan: Plan, budgetResource: string) {
  const create: Record<string, unknown> = {
    name: plan.nome_campanha,
    status: "PAUSED",
    advertisingChannelType: "SEARCH",
    campaignBudget: budgetResource,
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    },
  };
  if (plan.estrategia_lance === "MAXIMIZE_CLICKS") {
    create.targetSpend = {};
  } else {
    create.maximizeConversions = {};
    // NOTA v24: `selective_optimization` só se aplica a campanhas de app
    // (advertising_channel_type = MULTI_CHANNEL). Numa campanha SEARCH a Google
    // rejeita/ignora o campo — a meta de conversão por campanha faz-se em
    // campaignConversionGoals:mutate (fora do âmbito desta fase).
  }
  // v24: o recurso Campaign NÃO tem start_date/end_date. Tem
  // start_date_time / end_date_time, string "yyyy-MM-dd HH:mm:ss" no fuso da
  // conta (sem offset). Granularidade diária => 00:00:00 e 23:59:59.
  if (plan.start_date) create.startDateTime = `${String(plan.start_date).slice(0, 10)} 00:00:00`;
  if (plan.end_date) create.endDateTime = `${String(plan.end_date).slice(0, 10)} 23:59:59`;
  return { operations: [{ create }] };
}

function adGroupPayload(plan: Plan, campaignResource: string, group: any) {
  const create: Record<string, unknown> = {
    name: group.nome,
    campaign: campaignResource,
    status: "PAUSED",
    type: "SEARCH_STANDARD",
  };
  if (group.cpc_max_micros) create.cpcBidMicros = String(group.cpc_max_micros);
  return { operations: [{ create }] };
}

function keywordsPayload(adGroupResource: string, keywords: any[], negative: boolean) {
  return {
    partialFailure: true,
    operations: keywords.map((k) => ({
      create: {
        adGroup: adGroupResource,
        status: "ENABLED",
        negative,
        keyword: { text: String(k.text).trim(), matchType: k.match_type },
      },
    })),
  };
}

function campaignCriteriaPayload(plan: Plan, campaignResource: string) {
  const ops: any[] = [];
  const geo = plan.geo ?? {};
  for (const id of (geo.location_ids ?? []) as string[]) {
    ops.push({
      create: { campaign: campaignResource, location: { geoTargetConstant: `geoTargetConstants/${id}` } },
    });
  }
  for (const lang of (plan.idiomas ?? []) as string[]) {
    const code = LANGUAGE_CONSTANTS[String(lang).toLowerCase()];
    if (code) {
      ops.push({
        create: { campaign: campaignResource, language: { languageConstant: `languageConstants/${code}` } },
      });
    }
  }
  return { partialFailure: true, operations: ops };
}

function adPayload(plan: Plan, adGroupResource: string, ad: any) {
  const rsa: Record<string, unknown> = {
    headlines: (ad.headlines ?? []).map((t: string) => ({ text: String(t).trim() })).filter((h: any) => h.text),
    descriptions: (ad.descriptions ?? []).map((t: string) => ({ text: String(t).trim() })).filter((d: any) => d.text),
  };
  if (ad.path1) rsa.path1 = ad.path1;
  if (ad.path2) rsa.path2 = ad.path2;
  return {
    operations: [
      {
        create: {
          adGroup: adGroupResource,
          status: "PAUSED",
          ad: {
            finalUrls: [ad.final_url || plan.link_destino],
            responsiveSearchAd: rsa,
          },
        },
      },
    ],
  };
}

function firstResourceName(resp: any): string | null {
  const rn = resp?.results?.[0]?.resourceName;
  return typeof rn === "string" ? rn : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  console.log("[google-publish-execute] BUILD_VERSION=google-publish-execute-v2-datetime");

  let body: { plan_id?: string; company_id?: string; dry_run?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error_user_msg: "Pedido inválido." }, 200);
  }
  const dryRun = body.dry_run !== false; // default true
  if (!body.plan_id) return json({ ok: false, error_user_msg: "Falta o plano a publicar." }, 200);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Leitura pela RLS do utilizador → isolamento por empresa garantido pela BD.
  const { data: planRow, error: planErr } = await (userClient as any)
    .schema("crm")
    .from("google_publish_plan")
    .select("*")
    .eq("id", body.plan_id)
    .maybeSingle();
  if (planErr) return json({ ok: false, error_user_msg: "Não foi possível ler o plano.", error: planErr.message }, 200);
  if (!planRow) return json({ ok: false, error_user_msg: "Plano não encontrado nesta empresa." }, 200);
  if (body.company_id && planRow.company_id !== body.company_id) {
    return json({ ok: false, error_user_msg: "O plano não pertence a esta empresa." }, 200);
  }

  const plan: Plan = planRow;

  if (plan.estado === "publicado" || plan.estado === "ativo" || plan.estado === "pausado") {
    if (dryRun) {
      return json({ ok: false, error_user_msg: "Esta campanha já foi publicada." }, 200);
    }
  }
  const estadosRetomaveis = ["rascunho", "pronto_a_publicar", "a_publicar", "falhado"];
  if (!dryRun && !estadosRetomaveis.includes(plan.estado)) {
    return json({ ok: false, error_user_msg: `Estado "${plan.estado}" não permite publicar.` }, 200);
  }

  // Validação a montante — nunca criar campanha e falhar no anúncio.
  const draft: PlanDraft = {
    nome_campanha: plan.nome_campanha,
    orcamento_diario_micros: Number(plan.orcamento_diario_micros),
    link_destino: plan.link_destino,
    objetivo: plan.objetivo,
    estrategia_lance: plan.estrategia_lance,
    conversion_action_ref: plan.conversion_action_ref,
    start_date: plan.start_date,
    end_date: plan.end_date,
    geo: plan.geo ?? {},
    idiomas: plan.idiomas ?? [],
    ad_groups: plan.ad_groups ?? [],
  };
  const erros = validatePlan(draft);
  if (erros.length > 0) {
    return json({ ok: false, error_user_msg: "O plano tem erros que impedem a publicação.", erros }, 200);
  }

  const adGroups: any[] = JSON.parse(JSON.stringify(plan.ad_groups ?? []));
  const resultado: Array<Record<string, unknown>> = [];

  // ---------------------------------------------------------------- DRY RUN
  if (dryRun) {
    const payloads = [
      { passo: 1, recurso: "campaignBudgets:mutate", payload: budgetPayload(plan) },
      { passo: 2, recurso: "campaigns:mutate", payload: campaignPayload(plan, "<budget_resource>") },
      ...adGroups.map((g, i) => ({
        passo: 3,
        recurso: "adGroups:mutate",
        grupo: g.nome,
        payload: adGroupPayload(plan, "<campaign_resource>", g),
        _i: i,
      })),
      ...adGroups.map((g, i) => ({
        passo: 4,
        recurso: "adGroupCriteria:mutate",
        grupo: g.nome,
        payload: {
          positivas: keywordsPayload("<ad_group_resource>", g.keywords ?? [], false),
          negativas: keywordsPayload("<ad_group_resource>", g.negativas ?? [], true),
        },
        _i: i,
      })),
      { passo: 5, recurso: "campaignCriteria:mutate", payload: campaignCriteriaPayload(plan, "<campaign_resource>") },
      ...adGroups.flatMap((g, i) =>
        (g.ads ?? []).map((a: any, ai: number) => ({
          passo: 6,
          recurso: "adGroupAds:mutate",
          grupo: g.nome,
          anuncio: ai,
          payload: adPayload(plan, "<ad_group_resource>", a),
          _i: i,
        })),
      ),
    ];
    return json({
      ok: true,
      dry_run: true,
      conta: String(plan.customer_id),
      total_passos: payloads.length,
      payloads,
    });
  }

  // ------------------------------------------------------- LOCK anti-corrida
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: locked, error: lockErr } = await (admin as any)
    .schema("crm")
    .from("google_publish_plan")
    .update({ estado: "a_publicar", publish_started_at: new Date().toISOString(), publish_error: null })
    .eq("id", plan.id)
    .or(`estado.neq.a_publicar,publish_started_at.lt.${cutoff}`)
    .select("id");
  if (lockErr) return json({ ok: false, error_user_msg: "Não foi possível bloquear o plano.", error: lockErr.message }, 200);
  if (!locked || locked.length === 0) {
    return json({ ok: false, error_user_msg: "Publicação já em curso — espera que termine antes de tentar de novo." }, 200);
  }

  if (!DEVELOPER_TOKEN) {
    await (admin as any).schema("crm").from("google_publish_plan")
      .update({ estado: "falhado", publish_error: { motivo: "missing_developer_token" }, publish_finished_at: new Date().toISOString() })
      .eq("id", plan.id);
    return json({ ok: false, error_user_msg: "Falta a credencial de acesso ao Google Ads." }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAdsAccessToken();
  } catch (e) {
    await (admin as any).schema("crm").from("google_publish_plan")
      .update({ estado: "falhado", publish_error: { motivo: (e as Error).message }, publish_finished_at: new Date().toISOString() })
      .eq("id", plan.id);
    return json({ ok: false, error_user_msg: "Não foi possível autenticar no Google Ads.", error: (e as Error).message }, 200);
  }
  const ctx = ctxFor(plan, accessToken);
  const cid = ctx.customerId;

  let budgetResource: string | null = plan.google_budget_resource ?? null;
  let campaignResource: string | null = plan.google_campaign_resource ?? null;
  let campaignId: string | null = plan.google_campaign_id ?? null;
  let campaignCriteria: any[] = plan.campaign_criteria ?? [];

  const persist = async (extra: Record<string, unknown> = {}) => {
    await (admin as any)
      .schema("crm")
      .from("google_publish_plan")
      .update({
        google_budget_resource: budgetResource,
        google_campaign_resource: campaignResource,
        google_campaign_id: campaignId,
        campaign_criteria: campaignCriteria,
        ad_groups: adGroups,
        ...extra,
      })
      .eq("id", plan.id);
  };

  const falhar = async (etapa: string, e: unknown) => {
    const raw = (e as any)?.raw ?? String((e as Error)?.message ?? e);
    await persist({
      estado: "falhado",
      publish_finished_at: new Date().toISOString(),
      publish_error: { etapa, raw, at: new Date().toISOString() },
    });
    return json(
      { ok: false, etapa, error_user_msg: mensagemErroGoogle(raw), error: raw, resultado },
      200,
    );
  };

  try {
    // 1) Orçamento
    if (!budgetResource) {
      const r = await googleAdsPost<any>(ctx, `/customers/${cid}/campaignBudgets:mutate`, budgetPayload(plan));
      budgetResource = firstResourceName(r);
      await persist();
    }
    resultado.push({ nivel: "orcamento", resource_name: budgetResource });

    // 2) Campanha (PAUSED)
    if (!campaignResource) {
      const r = await googleAdsPost<any>(ctx, `/customers/${cid}/campaigns:mutate`, campaignPayload(plan, budgetResource!));
      campaignResource = firstResourceName(r);
      campaignId = campaignResource ? campaignResource.split("/").pop()! : null;
      await persist();
    }
    resultado.push({ nivel: "campanha", resource_name: campaignResource, id: campaignId, status: "PAUSED" });

    // 3+4) Grupos de anúncios e palavras-chave
    for (const g of adGroups) {
      if (!g.google_ad_group_resource) {
        const r = await googleAdsPost<any>(ctx, `/customers/${cid}/adGroups:mutate`, adGroupPayload(plan, campaignResource!, g));
        g.google_ad_group_resource = firstResourceName(r);
        await persist();
      }
      resultado.push({ nivel: "grupo", nome: g.nome, resource_name: g.google_ad_group_resource, status: "PAUSED" });

      for (const [campo, negativa] of [["keywords", false], ["negativas", true]] as const) {
        const pendentes = (g[campo] ?? []).filter((k: any) => !k.google_criterion_resource);
        if (pendentes.length === 0) continue;
        const r = await googleAdsPost<any>(
          ctx,
          `/customers/${cid}/adGroupCriteria:mutate`,
          keywordsPayload(g.google_ad_group_resource, pendentes, negativa),
        );
        const results = r?.results ?? [];
        const pf = r?.partialFailureError;
        pendentes.forEach((k: any, i: number) => {
          const rn = results[i]?.resourceName;
          if (rn) k.google_criterion_resource = rn;
          else k.erro = "rejeitada pelo Google";
        });
        await persist();
        resultado.push({
          nivel: campo === "keywords" ? "palavras-chave" : "negativas",
          grupo: g.nome,
          criadas: pendentes.filter((k: any) => k.google_criterion_resource).length,
          rejeitadas: pendentes.filter((k: any) => k.erro).length,
          partial_failure: pf ? mensagemErroGoogle(pf) : null,
        });
      }
    }

    // 5) Critérios de campanha (geo + idioma)
    if (!campaignCriteria || campaignCriteria.length === 0) {
      const payload = campaignCriteriaPayload(plan, campaignResource!);
      if (payload.operations.length > 0) {
        const r = await googleAdsPost<any>(ctx, `/customers/${cid}/campaignCriteria:mutate`, payload);
        campaignCriteria = (r?.results ?? [])
          .map((x: any, i: number) => ({
            tipo: payload.operations[i]?.create?.location ? "location" : "language",
            valor:
              payload.operations[i]?.create?.location?.geoTargetConstant ??
              payload.operations[i]?.create?.language?.languageConstant,
            resource_name: x?.resourceName ?? null,
          }))
          .filter((x: any) => x.resource_name);
        await persist();
      }
    }
    resultado.push({ nivel: "segmentacao", criterios: campaignCriteria.length });

    // 6) Anúncios de pesquisa responsivos (PAUSED)
    for (const g of adGroups) {
      for (const a of g.ads ?? []) {
        if (a.google_ad_resource) continue;
        const r = await googleAdsPost<any>(
          ctx,
          `/customers/${cid}/adGroupAds:mutate`,
          adPayload(plan, g.google_ad_group_resource, a),
        );
        a.google_ad_resource = firstResourceName(r);
        await persist();
        resultado.push({ nivel: "anuncio", grupo: g.nome, resource_name: a.google_ad_resource, status: "PAUSED" });
      }
    }

    await persist({
      estado: "publicado",
      publish_error: null,
      publish_finished_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      resumo: {
        grupos: adGroups.length,
        palavras_chave: adGroups.reduce((n, g) => n + (g.keywords?.length ?? 0), 0),
        anuncios: adGroups.reduce((n, g) => n + (g.ads?.length ?? 0), 0),
      },
    });

    return json({
      ok: true,
      dry_run: false,
      estado: "publicado",
      meta_aviso: "Tudo criado EM PAUSA — nada gasta até ativares.",
      google_campaign_id: campaignId,
      resultado,
    });
  } catch (e) {
    return await falhar("publicacao", e);
  }
});
