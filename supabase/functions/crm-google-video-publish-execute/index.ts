// crm-google-video-publish-execute (D-ERP108 — F4, MOTOR ÚNICO, GOOGLE ADS / YOUTUBE)
// POST { company_id, plan_id, dry_run?: boolean (omissão TRUE), preflight?: boolean }
//
// Cria no Google Ads: 1 orçamento + 1 campanha VIDEO + N grupos + M anúncios de
// vídeo — a campanha nasce SEMPRE em PAUSED. A activação é acto separado
// (crm-google-video-publish-activate).
//
// NOME: NÃO reutiliza crm-google-publish-execute, que já existe e publica
// campanhas de PESQUISA (SEARCH) de EVENTOS. São motores diferentes.
//
// Espelho exacto do crm-tiktok-publish-execute:
//   • papéis — dry_run/preflight: sessão OU service_role; publicação real: SESSÃO
//     + public.artist_ads_assert_write (service_role é recusado);
//   • teto por conta re-verificado em public.artist_ads_budget_cap_get (plataforma
//     'google'), na moeda da conta — fechado por omissão (sem teto, recusa);
//   • naming "[MP] [MÚSICA] [Objectivo] AAAA-MM-DD";
//   • ligação campanha→música trancada no espelho (linked_song_locked = true);
//   • plano nasce em 'rascunho' (nunca é criado aqui) e só passa a 'publicado'
//     depois de o Google confirmar;
//   • registo em crm.ads_entity_actions_log (platform='google');
//   • prova por hash dos payloads no dry-run (payloads_sha256);
//   • rejeição do Google devolve 200 + ok:false + código curto em português.
//
// AUTENTICAÇÃO: a do sync — service account (GOOGLE_SA_KEY_JSON), developer
// token e login-customer-id do MCC guardado na ligação. Sem OAuth de utilizador.
//
// CRIATIVO: vídeo do YouTube do artista. O asset é criado por
// youtube_video_asset.youtube_video_id (anuncios[].youtube_video_id, que é o
// post_ref de artist_ads_promotable_posts(p_artist_id,'google')). Em v24 os
// formatos legados de vídeo (in-stream/bumper) não são criáveis por API: o grupo
// é VIDEO_RESPONSIVE e o anúncio video_responsive_ad.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { songObjectiveLabel } from "../_shared/campaign-target.ts";
import {
  ageRangeTypes,
  checkTetoGoogle,
  corsHeaders,
  COUNTRY_GEO_TARGETS,
  dailyFromAdsetsGoogle,
  descreveErroGoogle,
  GOOGLE_ADS_API_VERSION,
  googleAdsPost,
  googleCtx,
  json,
  jwtRole,
  LANGUAGE_CONSTANTS,
  loadGoogleConnection,
  logAdsActionGoogle,
  mapSongObjectiveGoogle,
  payloadsHash,
  suggestGeoTargets,
} from "../_shared/google-video-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MIN_DAILY_CENTS = 500; // Google: mínimo conservador de 5,00/dia por conjunto.

type Aviso = { codigo: string; detalhe?: string; adset?: string | null; ad_idx?: number };

function dataGoogle(d: string | null): string | null {
  return d ? new Date(d).toISOString().slice(0, 10).replace(/-/g, "") : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[google-video-publish-execute] BUILD_VERSION=google-video-execute-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "missing_authorization" }, 401);

  let body: { company_id?: string; plan_id?: string; dry_run?: boolean; preflight?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const companyIdIn = body.company_id;
  const planId = body.plan_id;
  // SALVAGUARDA: dry_run por omissão TRUE. Só escreve no Google com dry_run:false explícito.
  const dryRun = body.dry_run !== false;
  const preflight = body.preflight === true;
  if (!companyIdIn || !planId) {
    return json({ ok: false, error: "missing_params", required: ["company_id", "plan_id"] }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const avisos: Aviso[] = [];

  // 1) Plano (RLS do utilizador valida a pertença à empresa).
  const { data: planRow, error: planErr } = await (supabase as any)
    .schema("crm").from("meta_publish_plan")
    .select(
      "id, company_id, platform, estado, objetivo, moeda, link_destino, adsets, start_time, end_time, artist_id, song_id, connection_id, external_campaign_id, resumo",
    )
    .eq("id", planId)
    .maybeSingle();
  if (planErr) return json({ ok: false, error: "plan_query_failed", detail: planErr.message }, 500);
  if (!planRow) return json({ ok: false, error: "plan_not_found" }, 404);
  if (planRow.company_id !== companyIdIn) return json({ ok: false, error: "company_mismatch" }, 403);
  if (String((planRow as any).platform ?? "meta") !== "google") {
    return json({
      ok: false,
      error: "plano_nao_google",
      message: "Este plano não é de Google Ads — usa o motor da plataforma do plano.",
    }, 422);
  }
  if (!(planRow as any).song_id) {
    return json({
      ok: false,
      error: "plano_sem_musica",
      message: "Este motor publica apenas o alvo artista+música (campanhas de vídeo no YouTube).",
    }, 422);
  }

  // 2) Papéis. Leitura aceita service_role; escrita exige sessão + papel de tráfego.
  const { data: userInfo } = await supabase.auth.getUser();
  const callerUserId = userInfo?.user?.id ?? null;
  const isServiceRole = !callerUserId && jwtRole(authHeader) === "service_role";
  if (!callerUserId && !isServiceRole) {
    return json({ ok: false, error: "sessao_invalida", message: "Sessão inválida." }, 401);
  }
  if (!dryRun && !preflight) {
    if (!callerUserId) {
      return json({
        ok: false,
        error: "service_role_nao_publica_musica",
        message: "A publicação de campanhas de música exige sessão de utilizador com papel de tráfego.",
      }, 403);
    }
    const { error: permErr } = await supabase.rpc("artist_ads_assert_write", { p_company_id: planRow.company_id });
    if (permErr) return json({ ok: false, error: "sem_permissao", detail: permErr.message }, 403);
  }

  // 3) Estado (só no caminho de escrita).
  if (!dryRun && !preflight) {
    if (planRow.estado === "publicado") {
      return json({
        ok: false,
        error: "ja_publicado",
        external_campaign_id: (planRow as any).external_campaign_id,
      }, 409);
    }
    if (!["rascunho", "pronto_a_publicar", "a_publicar", "falhado"].includes(String(planRow.estado))) {
      return json({ ok: false, error: "estado_invalido", estado: planRow.estado }, 409);
    }
  }

  // 4) Ligação Google + conta.
  const conn = await loadGoogleConnection(admin as any, { connectionId: String((planRow as any).connection_id) });
  if (!conn.ok) return json({ ok: false, error: conn.error, message: conn.message }, conn.status);
  const customerId = conn.customerId;
  const connectionId = conn.connectionId;
  const moedaConta = conn.moedaConta;
  if ((!dryRun || preflight) && conn.status !== "active") {
    return json({
      ok: false,
      error: "ligacao_inactiva",
      message: `A ligação do Google Ads não está activa (status=${conn.status}).`,
    }, 422);
  }

  // 5) Credenciais. Sem token o dry-run continua (monta payloads); o resto recusa.
  const ctxRes = await googleCtx(conn);
  if (!ctxRes.ok && (!dryRun || preflight)) {
    return json({ ok: false, error: ctxRes.error, message: ctxRes.message }, 422);
  }
  const ctx = ctxRes.ok ? ctxRes.ctx : null;
  if (!ctx) avisos.push({ codigo: "sem_token_google", detalhe: "dry-run sem chamada à API do Google." });

  // 6) Objectivo. TRAFFIC não existe em campanhas VIDEO sem Demand Gen.
  const objetivoPlano = String(planRow.objetivo ?? "").toUpperCase();
  if (objetivoPlano === "TRAFFIC") {
    return json({
      ok: false,
      error: "objetivo_nao_suportado_google",
      message:
        "Campanhas de vídeo (YouTube) não aceitam o objectivo Tráfego nesta API — usa REACH (alcance) ou VIDEO_VIEWS (visualizações). Tráfego só existe em Demand Gen, fora deste motor.",
    }, 422);
  }
  const g = mapSongObjectiveGoogle(objetivoPlano);
  if (!g) {
    return json({
      ok: false,
      error: "objetivo_invalido",
      message: "O objectivo do plano tem de ser REACH ou VIDEO_VIEWS.",
    }, 422);
  }

  // 7) Janela e orçamentos.
  const planStartTime: string | null = (planRow as any).start_time ?? null;
  const planEndTime: string | null = (planRow as any).end_time ?? null;
  const usaLifetime = !!planEndTime;
  if (usaLifetime && !planStartTime) {
    return json({
      ok: false,
      error: "sem_start_time_para_lifetime",
      message: "Com data de fim é obrigatória a data de início.",
    }, 400);
  }
  if (planStartTime && planEndTime && new Date(planEndTime).getTime() <= new Date(planStartTime).getTime()) {
    return json({ ok: false, error: "janela_invalida", message: "A data de fim tem de ser depois da de início." }, 400);
  }
  const diasJanela = (planStartTime && planEndTime)
    ? Math.max(1, Math.ceil((new Date(planEndTime).getTime() - new Date(planStartTime).getTime()) / 86400000))
    : 1;

  const adsets: any[] = Array.isArray(planRow.adsets) ? planRow.adsets : [];
  if (adsets.length === 0) return json({ ok: false, error: "plano_sem_conjuntos" }, 422);

  const minimoCents = usaLifetime ? MIN_DAILY_CENTS * diasJanela : MIN_DAILY_CENTS;
  const abaixoMin = adsets
    .filter((a) => Math.max(0, Number(a?.orcamento_cents ?? 0)) < minimoCents)
    .map((a) => ({
      adset: a?.trigger_nome ?? null,
      orcamento_cents: Number(a?.orcamento_cents ?? 0),
      minimo_cents: minimoCents,
    }));
  if (abaixoMin.length > 0) {
    if (!dryRun) {
      return json({
        ok: false,
        error: "orcamento_abaixo_minimo",
        adsets: abaixoMin,
        message: `Orçamento abaixo do mínimo (${minimoCents} cents por conjunto${
          usaLifetime ? ` na janela de ${diasJanela} dia(s)` : "/dia"
        }).`,
      }, 412);
    }
    for (const x of abaixoMin) {
      avisos.push({
        codigo: "orcamento_abaixo_minimo",
        adset: x.adset,
        detalhe: `${x.orcamento_cents} < ${x.minimo_cents}`,
      });
    }
  }

  // 8) Geografia obrigatória (país ISO-2 + estados por nome).
  function temGeo(a: any): boolean {
    const geo = a?.publico_sugerido?.geo;
    return Array.isArray(geo) && geo.some((x: any) => typeof x === "string" && x.trim().length > 0);
  }
  const semGeo = adsets.filter((a) => !temGeo(a)).map((a) => a?.trigger_nome ?? null);
  if (semGeo.length > 0) {
    if (!dryRun) {
      return json({
        ok: false,
        error: "sem_geografia",
        adset: semGeo,
        message: 'Cada conjunto tem de indicar pelo menos um país em publico_sugerido.geo (ex.: ["BR"]).',
      }, 422);
    }
    for (const nome of semGeo) avisos.push({ codigo: "sem_geografia", adset: nome });
  }

  // 9) Criativo: vídeo do YouTube em cada anúncio.
  const semVideo: Array<{ adset: string | null; ad_idx: number }> = [];
  for (let i = 0; i < adsets.length; i++) {
    const ans = adsets[i]?.anuncios ?? [];
    for (let k = 0; k < ans.length; k++) {
      const vid = ans[k]?.youtube_video_id;
      if (typeof vid !== "string" || !vid.trim()) {
        semVideo.push({ adset: adsets[i]?.trigger_nome ?? null, ad_idx: k });
      }
    }
  }
  if (semVideo.length > 0) {
    if (!dryRun) {
      return json({
        ok: false,
        error: "sem_video_youtube",
        anuncios: semVideo,
        message: "Cada anúncio exige o vídeo do YouTube do artista (anuncio.youtube_video_id).",
      }, 422);
    }
    for (const x of semVideo) avisos.push({ codigo: "sem_video_youtube", adset: x.adset, ad_idx: x.ad_idx });
  }

  // 10) Teto por conta, na moeda da conta (plataforma 'google').
  const pedidoDiario = dailyFromAdsetsGoogle(adsets, usaLifetime, diasJanela);
  const teto = await checkTetoGoogle(supabase as any, {
    artistId: String((planRow as any).artist_id),
    connectionId,
    moeda: planRow.moeda ?? moedaConta,
    pedidoDiario,
  });
  if (!teto.ok) {
    if (!dryRun && !preflight) {
      return json({
        ok: false,
        error: teto.error,
        teto: teto.teto,
        pedido: teto.pedido,
        ja_comprometido: teto.ja_comprometido,
        disponivel: teto.disponivel,
        moeda: teto.moeda,
        message: teto.error === "sem_teto"
          ? "Esta conta do Google Ads não tem teto de orçamento definido — define o teto antes de publicar."
          : teto.error === "acima_do_teto"
          ? `Acima do teto diário (${teto.teto} ${teto.moeda ?? ""}): pedido ${teto.pedido}, disponível ${teto.disponivel}.`
          : "A moeda do plano/conta não é a do teto.",
      }, 422);
    }
    avisos.push({ codigo: String(teto.error), detalhe: JSON.stringify(teto) });
  }

  // 11) Naming — mesma regra do Meta/TikTok.
  const { data: song } = await (admin as any).from("artist_songs")
    .select("id, title").eq("id", (planRow as any).song_id).maybeSingle();
  const rawTitle = (song as any)?.title ?? "";
  const { data: baseTitle } = await (admin as any).rpc("artist_song_base_title", { _title: rawTitle });
  const tituloBase = String(baseTitle ?? rawTitle ?? "").trim() || "musica";
  const dateLabel = (planStartTime ? new Date(planStartTime) : new Date()).toISOString().slice(0, 10);
  const campaignName = `[MP] [${tituloBase.toUpperCase()}] [${
    songObjectiveLabel(String(planRow.objetivo ?? "REACH"))
  }] ${dateLabel}`;
  const prefixo = "[MP] ";

  // 12) Geografia → geoTargetConstants (país por tabela, estados por suggest).
  const geoPorAdset: string[][] = [];
  for (const a of adsets) {
    const paises: string[] = (a?.publico_sugerido?.geo ?? []).filter((x: any) => typeof x === "string" && x.trim());
    const nomesEstado: string[] = (Array.isArray(a?.publico_sugerido?.geo_regions) ? a.publico_sugerido.geo_regions : [])
      .map((r: any) => (typeof r === "string" ? r : r?.nome))
      .filter((r: any) => typeof r === "string" && r.trim().length > 2);
    const ids: string[] = [];
    if (nomesEstado.length > 0 && ctx) {
      const r = await suggestGeoTargets(ctx, nomesEstado, paises[0] ?? "BR");
      for (const av of r.avisos) avisos.push({ ...av, adset: a?.trigger_nome ?? null });
      ids.push(...r.ids);
    } else if (nomesEstado.length > 0) {
      avisos.push({
        codigo: "geo_nao_resolvida",
        adset: a?.trigger_nome ?? null,
        detalhe: "sem credenciais: estados não resolvidos",
      });
    }
    // Sem estados resolvidos, fica o país.
    if (ids.length === 0) {
      for (const p of paises) {
        const id = COUNTRY_GEO_TARGETS[String(p).toUpperCase()];
        if (id) ids.push(id);
        else avisos.push({ codigo: "pais_sem_geo_target", adset: a?.trigger_nome ?? null, detalhe: String(p) });
      }
    }
    if (ids.length === 0 && !dryRun) {
      return json({
        ok: false,
        error: "geo_nao_resolvida",
        adset: a?.trigger_nome ?? null,
        message: "Não foi possível resolver a geografia do conjunto em geoTargetConstants do Google.",
      }, 422);
    }
    geoPorAdset.push(ids);
  }

  // 13) Payloads (MutateOperations, uma chamada por nível).
  const linkPlano: string | null = typeof planRow.link_destino === "string" && planRow.link_destino
    ? planRow.link_destino
    : null;
  const totalCents = adsets.reduce((s, a) => s + Math.max(0, Number(a?.orcamento_cents ?? 0)), 0);
  const diarioCents = usaLifetime ? Math.floor(totalCents / diasJanela) : totalCents;

  const budgetPayload = {
    operations: [{
      create: {
        name: `${campaignName} — orçamento`,
        amountMicros: String(diarioCents * 10000),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      },
    }],
  };

  function campaignPayload(budgetResource: string) {
    const c: Record<string, unknown> = {
      name: campaignName,
      status: "PAUSED",
      advertisingChannelType: "VIDEO",
      campaignBudget: budgetResource,
      [g!.bidding]: {},
    };
    if (planStartTime) c.startDate = dataGoogle(planStartTime);
    if (planEndTime) c.endDate = dataGoogle(planEndTime);
    return { operations: [{ create: c }] };
  }

  function adGroupsPayload(campaignResource: string) {
    return {
      operations: adsets.map((a, i) => ({
        create: {
          name: `${prefixo}${a?.trigger_nome ?? `Conjunto ${i + 1}`}`,
          campaign: campaignResource,
          type: g!.adGroupType,
          status: "PAUSED",
          ...(g!.bidding === "targetCpv"
            ? { cpvBidMicros: String(Math.max(10000, Math.floor(diarioCents * 10000 / 100))) }
            : { cpmBidMicros: String(Math.max(10000, Math.floor(diarioCents * 10000 / 100))) }),
        },
      })),
    };
  }

  function assetsPayload() {
    const ops: any[] = [];
    for (let i = 0; i < adsets.length; i++) {
      const ans = adsets[i]?.anuncios ?? [];
      for (let k = 0; k < ans.length; k++) {
        ops.push({
          create: {
            name: `${prefixo}${tituloBase} ${ans[k]?.youtube_video_id ?? "?"} ${i}-${k}`.slice(0, 120),
            youtubeVideoAsset: { youtubeVideoId: ans[k]?.youtube_video_id ?? null },
          },
        });
      }
    }
    return { operations: ops };
  }

  function adPayload(a: any, an: any, adGroupResource: string, assetResource: string, idx: number, k: number) {
    const link = (typeof an?.link_destino === "string" && an.link_destino) ||
      (typeof a?.link_destino === "string" && a.link_destino) || linkPlano;
    const texto = String(an?.texto ?? an?.copy ?? tituloBase).slice(0, 90);
    return {
      create: {
        adGroup: adGroupResource,
        status: "PAUSED",
        ad: {
          name: `${prefixo}${a?.trigger_nome ?? `Conjunto ${idx + 1}`} — ${k + 1}`.slice(0, 120),
          ...(link ? { finalUrls: [link] } : {}),
          videoResponsiveAd: {
            videos: [{ asset: assetResource }],
            headlines: [{ text: tituloBase.slice(0, 30) }],
            longHeadlines: [{ text: texto }],
            descriptions: [{ text: texto }],
            callToActions: [{ text: g!.bidding === "targetCpv" ? "Ouvir" : "Ver" }],
          },
        },
      },
    };
  }

  function criteriaPayload(campaignResource: string, adGroupResources: string[]) {
    const campanha: any[] = [];
    const grupos: any[] = [];
    const idiomas = new Set<string>();
    for (let i = 0; i < adsets.length; i++) {
      for (const id of geoPorAdset[i] ?? []) {
        if (!campanha.some((o) => o?.create?.location?.geoTargetConstant === `geoTargetConstants/${id}`)) {
          campanha.push({ create: { campaign: campaignResource, location: { geoTargetConstant: `geoTargetConstants/${id}` } } });
        }
      }
      idiomas.add(LANGUAGE_CONSTANTS.pt);
      const pub = adsets[i]?.publico_sugerido ?? {};
      const faixas = ageRangeTypes(pub?.idade_min ?? pub?.idades?.min, pub?.idade_max ?? pub?.idades?.max);
      for (const t of faixas) {
        grupos.push({ create: { adGroup: adGroupResources[i], ageRange: { type: t } } });
      }
    }
    for (const l of idiomas) {
      campanha.push({ create: { campaign: campaignResource, language: { languageConstant: `languageConstants/${l}` } } });
    }
    return { campanha: { operations: campanha }, grupos: { operations: grupos } };
  }

  // ── PREFLIGHT: só leituras. Não escreve no Google nem no plano. ──────────
  if (preflight) {
    const checks: Array<{ check: string; ok: boolean; detail?: string }> = [];
    let moedaApi = String(moedaConta ?? "").toUpperCase();
    let contaOk = false;
    try {
      const r = await googleAdsPost<any>(ctx!, `/customers/${customerId}/googleAds:search`, {
        query: "SELECT customer.id, customer.currency_code, customer.descriptive_name FROM customer",
      });
      const row = r?.results?.[0]?.customer ?? null;
      contaOk = !!row;
      if (row?.currencyCode) moedaApi = String(row.currencyCode).toUpperCase();
      checks.push({ check: "token_e_conta", ok: contaOk, detail: String(row?.descriptiveName ?? customerId) });
    } catch (e) {
      const d = descreveErroGoogle((e as any)?.raw ?? String(e));
      checks.push({ check: "token_e_conta", ok: false, detail: `${d.codigo}: ${d.mensagem}` });
    }
    checks.push({
      check: "moeda_da_conta",
      ok: !!moedaApi && moedaApi === String(planRow.moeda ?? "").toUpperCase(),
      detail: `conta=${moedaApi || "?"} plano=${String(planRow.moeda ?? "?").toUpperCase()}`,
    });
    checks.push({ check: "teto", ok: !!teto.ok, detail: JSON.stringify(teto) });
    checks.push({
      check: "geografia",
      ok: semGeo.length === 0 && geoPorAdset.every((x) => x.length > 0),
      detail: JSON.stringify(geoPorAdset),
    });
    checks.push({
      check: "video_do_youtube",
      ok: semVideo.length === 0,
      detail: semVideo.length === 0 ? "todos os anúncios têm youtube_video_id" : JSON.stringify(semVideo),
    });
    const tudoOk = checks.every((c) => c.ok);
    return json({
      ok: tudoOk,
      preflight: true,
      plataforma: "google",
      api: GOOGLE_ADS_API_VERSION,
      customer_id: customerId,
      checks,
      avisos,
    }, tudoOk ? 200 : 422);
  }

  // ── DRY-RUN: payloads + diff + prova por hash. Não toca na API nem na BD. ──
  if (dryRun) {
    const crit = criteriaPayload("<CAMPAIGN>", adsets.map((_, i) => `<ADGROUP_${i}>`));
    const dryAds: any[] = [];
    let n = 0;
    for (let i = 0; i < adsets.length; i++) {
      const ans = adsets[i]?.anuncios ?? [];
      for (let k = 0; k < ans.length; k++) {
        dryAds.push({
          adset: adsets[i]?.trigger_nome ?? null,
          ad_idx: k,
          payload: adPayload(adsets[i], ans[k], `<ADGROUP_${i}>`, `<ASSET_${n++}>`, i, k),
        });
      }
    }
    const payloads = {
      campaign_budget: budgetPayload,
      campaign: campaignPayload("<BUDGET>"),
      ad_groups: adGroupsPayload("<CAMPAIGN>"),
      assets: assetsPayload(),
      ads: dryAds,
      campaign_criteria: crit.campanha,
      ad_group_criteria: crit.grupos,
    };
    const diff = {
      campanha: (planRow as any).external_campaign_id ? "existe — seria retomada" : "seria criada",
      grupos: adsets.map((a, i) => ({
        conjunto: a?.trigger_nome ?? `Conjunto ${i + 1}`,
        estado: a?.external_adgroup_id ? "existe — seria retomado" : "seria criado",
        anuncios: (a?.anuncios ?? []).map((an: any, k: number) => ({
          idx: k,
          estado: an?.external_ad_id ? "existe — seria retomado" : "seria criado",
        })),
      })),
    };
    return json({
      ok: true,
      dry_run: true,
      plataforma: "google",
      api: GOOGLE_ADS_API_VERSION,
      customer_id: customerId,
      login_customer_id: conn.loginCustomerId,
      estado_plano: planRow.estado,
      naming: { campaign: campaignName, prefix: prefixo },
      objetivo: { plano: objetivoPlano, bidding: g.bidding, ad_group_type: g.adGroupType, ad: g.adFormat },
      janela: {
        start_time: planStartTime,
        end_time: planEndTime,
        dias: diasJanela,
        budget: usaLifetime ? "diário derivado do total" : "diário",
      },
      teto,
      payloads,
      payloads_sha256: await payloadsHash(payloads),
      diff,
      avisos,
    });
  }

  // ── PUBLICAÇÃO REAL — campanha, grupos e anúncios em PAUSED ─────────────
  const lockCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: locked, error: lockErr } = await (admin as any)
    .schema("crm").from("meta_publish_plan")
    .update({ estado: "a_publicar", publish_error: null, publish_started_at: new Date().toISOString() })
    .eq("id", planId)
    .or(`estado.neq.a_publicar,publish_started_at.lt.${lockCutoff}`)
    .select("id");
  if (lockErr) return json({ ok: false, error: "lock_falhou", detail: lockErr.message }, 500);
  if (!locked || (locked as any[]).length === 0) {
    return json({ ok: false, error: "publicacao_em_curso", message: "Este plano já está a ser publicado." }, 409);
  }

  const adsetsOut: any[] = JSON.parse(JSON.stringify(adsets));
  const resumoBase: Record<string, unknown> = (planRow as any).resumo && typeof (planRow as any).resumo === "object"
    ? { ...(planRow as any).resumo }
    : {};

  async function persist(extra: Record<string, unknown> = {}): Promise<void> {
    await (admin as any).schema("crm").from("meta_publish_plan")
      .update({ adsets: adsetsOut, ...extra }).eq("id", planId);
  }

  async function falha(
    etapa: "campaign_budget" | "campaign" | "adgroup" | "asset" | "ad" | "criteria",
    raw: unknown,
    externalId = "-",
  ): Promise<Response> {
    const d = descreveErroGoogle(raw);
    await persist({
      estado: "falhado",
      publish_error: { etapa, error: d.codigo, message: d.mensagem, at: new Date().toISOString() },
    });
    const logErr = await logAdsActionGoogle(admin as any, {
      company_id: planRow.company_id,
      connection_id: connectionId,
      ad_account_id: customerId,
      plan_id: planId!,
      artist_id: (planRow as any).artist_id,
      song_id: (planRow as any).song_id,
      entity_type: etapa === "ad" ? "ad" : etapa === "adgroup" ? "adgroup" : "campaign",
      external_id: externalId,
      action: "create",
      success: false,
      error_message: d.mensagem,
      performed_by: callerUserId,
    });
    if (logErr) avisos.push({ codigo: "registo_acao_falhou", detalhe: logErr });
    return json({ ok: false, error: d.codigo, etapa, message: d.mensagem, avisos }, 200);
  }

  const base = `/customers/${customerId}`;

  // Orçamento + campanha (idempotente: retoma o que já existir no plano).
  let campaignResource: string | null = (planRow as any).external_campaign_id ?? null;
  let budgetResource: string | null = (resumoBase as any)?.publicacao_google?.budget_resource ?? null;
  if (!campaignResource) {
    if (!budgetResource) {
      try {
        const r = await googleAdsPost<any>(ctx!, `${base}/campaignBudgets:mutate`, budgetPayload);
        budgetResource = r?.results?.[0]?.resourceName ?? null;
      } catch (e) {
        return await falha("campaign_budget", (e as any)?.raw ?? String(e));
      }
      if (!budgetResource) return await falha("campaign_budget", "resposta sem resourceName");
    }
    try {
      const r = await googleAdsPost<any>(ctx!, `${base}/campaigns:mutate`, campaignPayload(budgetResource));
      campaignResource = r?.results?.[0]?.resourceName ?? null;
    } catch (e) {
      return await falha("campaign", (e as any)?.raw ?? String(e));
    }
    if (!campaignResource) return await falha("campaign", "resposta sem resourceName");
    await persist({
      external_campaign_id: campaignResource,
      resumo: {
        ...resumoBase,
        publicacao_google: {
          api: GOOGLE_ADS_API_VERSION,
          budget_resource: budgetResource,
          campaign_resource: campaignResource,
          customer_id: customerId,
        },
      },
    });
    const logErr = await logAdsActionGoogle(admin as any, {
      company_id: planRow.company_id,
      connection_id: connectionId,
      ad_account_id: customerId,
      plan_id: planId!,
      artist_id: (planRow as any).artist_id,
      song_id: (planRow as any).song_id,
      entity_type: "campaign",
      external_id: campaignResource,
      entity_name: campaignName,
      action: "create",
      new_status: "PAUSED",
      updates_jsonb: { alvo: "song", objetivo: objetivoPlano, bidding: g.bidding },
      success: true,
      performed_by: callerUserId,
    });
    if (logErr) avisos.push({ codigo: "registo_acao_falhou", detalhe: logErr });
  }

  // Espelho da campanha com a MÚSICA TRANCADA.
  {
    const { error } = await (admin as any).schema("crm").from("meta_campaign_snapshot").upsert({
      connection_id: connectionId,
      company_id: planRow.company_id,
      ad_account_id: customerId,
      external_campaign_id: campaignResource,
      name: campaignName,
      status: "PAUSED",
      effective_status: "PAUSED",
      objective: objetivoPlano,
      currency: moedaConta ?? planRow.moeda ?? null,
      start_time: planStartTime,
      stop_time: planEndTime,
      raw: { created_by: "crm-google-video-publish-execute", plan_id: planId, platform: "google" },
      last_synced_at: new Date().toISOString(),
      linked_song_id: (planRow as any).song_id,
      linked_song_locked: true,
    }, { onConflict: "connection_id,external_campaign_id" });
    if (error) avisos.push({ codigo: "espelho_campanha_falhou", detalhe: error.message });
  }

  // Grupos — uma só chamada para os que faltam.
  const faltamGrupos = adsetsOut.map((a, i) => ({ a, i })).filter(({ a }) => !a.external_adgroup_id);
  if (faltamGrupos.length > 0) {
    const ops = faltamGrupos.map(({ a, i }) => adGroupsPayload(campaignResource!).operations[i] ?? null).filter(Boolean);
    try {
      const r = await googleAdsPost<any>(ctx!, `${base}/adGroups:mutate`, { operations: ops });
      const res: any[] = r?.results ?? [];
      faltamGrupos.forEach(({ a }, idx) => {
        a.external_adgroup_id = res[idx]?.resourceName ?? null;
        a.google_status = "PAUSED";
      });
    } catch (e) {
      return await falha("adgroup", (e as any)?.raw ?? String(e), campaignResource!);
    }
    if (faltamGrupos.some(({ a }) => !a.external_adgroup_id)) {
      return await falha("adgroup", "resposta sem resourceName", campaignResource!);
    }
    await persist();
    for (const { a } of faltamGrupos) {
      const logErr = await logAdsActionGoogle(admin as any, {
        company_id: planRow.company_id,
        connection_id: connectionId,
        ad_account_id: customerId,
        plan_id: planId!,
        artist_id: (planRow as any).artist_id,
        song_id: (planRow as any).song_id,
        entity_type: "adgroup",
        external_id: a.external_adgroup_id,
        entity_name: `${prefixo}${a?.trigger_nome ?? ""}`,
        action: "create",
        new_status: "PAUSED",
        success: true,
        performed_by: callerUserId,
      });
      if (logErr) avisos.push({ codigo: "registo_acao_falhou", detalhe: logErr });
    }
  }

  // Critérios (geografia + idioma na campanha; idades nos grupos) — uma chamada por nível.
  if (!(resumoBase as any)?.publicacao_google?.criterios_criados) {
    const crit = criteriaPayload(campaignResource!, adsetsOut.map((a) => a.external_adgroup_id));
    try {
      if (crit.campanha.operations.length > 0) {
        await googleAdsPost(ctx!, `${base}/campaignCriteria:mutate`, crit.campanha);
      }
      if (crit.grupos.operations.length > 0) {
        await googleAdsPost(ctx!, `${base}/adGroupCriteria:mutate`, crit.grupos);
      }
    } catch (e) {
      return await falha("criteria", (e as any)?.raw ?? String(e), campaignResource!);
    }
    (resumoBase as any).publicacao_google = {
      ...((resumoBase as any).publicacao_google ?? {}),
      criterios_criados: true,
    };
    await persist({ resumo: resumoBase });
  }

  // Assets dos vídeos + anúncios.
  for (let i = 0; i < adsetsOut.length; i++) {
    const a = adsetsOut[i];
    const ans = a.anuncios ?? [];
    for (let k = 0; k < ans.length; k++) {
      const an = ans[k];
      if (an.external_ad_id) continue;
      if (!an.google_asset_resource) {
        try {
          const r = await googleAdsPost<any>(ctx!, `${base}/assets:mutate`, {
            operations: [{
              create: {
                name: `${prefixo}${tituloBase} ${an.youtube_video_id} ${i}-${k} ${Date.now()}`.slice(0, 120),
                youtubeVideoAsset: { youtubeVideoId: an.youtube_video_id },
              },
            }],
          });
          an.google_asset_resource = r?.results?.[0]?.resourceName ?? null;
        } catch (e) {
          return await falha("asset", (e as any)?.raw ?? String(e), a.external_adgroup_id);
        }
        if (!an.google_asset_resource) return await falha("asset", "resposta sem resourceName", a.external_adgroup_id);
        await persist();
      }
      try {
        const r = await googleAdsPost<any>(ctx!, `${base}/adGroupAds:mutate`, {
          operations: [adPayload(a, an, a.external_adgroup_id, an.google_asset_resource, i, k)],
        });
        an.external_ad_id = r?.results?.[0]?.resourceName ?? null;
      } catch (e) {
        return await falha("ad", (e as any)?.raw ?? String(e), a.external_adgroup_id);
      }
      if (!an.external_ad_id) return await falha("ad", "resposta sem resourceName", a.external_adgroup_id);
      an.google_status = "PAUSED";
      await persist();
      const logErr = await logAdsActionGoogle(admin as any, {
        company_id: planRow.company_id,
        connection_id: connectionId,
        ad_account_id: customerId,
        plan_id: planId!,
        artist_id: (planRow as any).artist_id,
        song_id: (planRow as any).song_id,
        entity_type: "ad",
        external_id: an.external_ad_id,
        action: "create",
        new_status: "PAUSED",
        updates_jsonb: { youtube_video_id: an.youtube_video_id },
        success: true,
        performed_by: callerUserId,
      });
      if (logErr) avisos.push({ codigo: "registo_acao_falhou", detalhe: logErr });
    }
  }

  await persist({
    estado: "publicado",
    published_at: new Date().toISOString(),
    publish_finished_at: new Date().toISOString(),
    publish_error: null,
  });

  return json({
    ok: true,
    plataforma: "google",
    api: GOOGLE_ADS_API_VERSION,
    estado: "publicado",
    external_campaign_id: campaignResource,
    naming: { campaign: campaignName, prefix: prefixo },
    teto,
    grupos: adsetsOut.map((a: any) => ({
      conjunto: a?.trigger_nome ?? null,
      external_adgroup_id: a?.external_adgroup_id ?? null,
      anuncios: (a?.anuncios ?? []).map((x: any) => x?.external_ad_id ?? null),
    })),
    avisos,
  });
});
