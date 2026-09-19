// crm-tiktok-publish-execute (D-ERP102 — F5, MOTOR ÚNICO, plataforma TIKTOK)
// POST { company_id, plan_id, dry_run?: boolean (omissão TRUE), preflight?: boolean }
//
// Cria no TikTok: 1 campanha + N adgroups + M anúncios — SEMPRE operation_status
// = DISABLE (em pausa). A activação é um acto separado (crm-tiktok-publish-activate).
//
// Prefixo crm-* porque fala com API externa e lê crm.ad_platform_connections.
// A fronteira das funções artist-* mantém-se intacta: nada aqui é chamado por elas.
//
// Mesmas regras do Meta, reaproveitando o motor:
//   • papéis — dry_run/preflight: sessão OU service_role; publicação real: SESSÃO
//     + public.artist_ads_assert_write (service_role é recusado);
//   • teto por conta re-verificado em public.artist_ads_budget_cap_get, na moeda
//     da conta, plataforma 'tiktok' (fechado por omissão: sem teto, recusa);
//   • naming "[MP] [MÚSICA] [Objectivo] AAAA-MM-DD";
//   • ligação campanha→música trancada no espelho (linked_song_locked = true);
//   • plano nasce em 'rascunho' (nunca é criado aqui) e só passa a 'publicado'
//     depois de o TikTok confirmar;
//   • registo em crm.ads_entity_actions_log (platform='tiktok');
//   • prova por hash dos payloads no dry-run (payloads_sha256).
//
// HOST por ambiente (TIKTOK_API_HOST). Sandbox:
//   https://sandbox-ads.tiktok.com/open_api/v1.3/
// Sem OAuth: token + advertiser_id da ligação. Em falta → erro identificável.
//
// CRIATIVO: vídeo do próprio artista (ad_format=SINGLE_VIDEO). NÃO há imagem
// estática neste motor. Duas vias:
//   1) vídeo já carregado na conta de anúncios — anuncio.tiktok_video_id (esta versão);
//   2) SPARK ADS (promover a publicação orgânica do artista) — via a usar quando
//      a ligação tiver identity de tipo BC_AUTH_TT: o anúncio levaria
//      identity_type: "BC_AUTH_TT", identity_id: <tt_user_id>, identity_authorized_bc_id
//      e tiktok_item_id: <id do post> em vez de video_id. NESTA VERSÃO NÃO É
//      EXERCITADA (sem identity autorizada na ligação do piloto).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { songObjectiveLabel } from "../_shared/campaign-target.ts";
import {
  TIKTOK_SANDBOX_HOST,
  checkTetoTikTok,
  corsHeaders,
  dailyFromAdsetsTikTok,
  json,
  jwtRole,
  loadTikTokConnection,
  logAdsAction,
  mapSongObjectiveTikTok,
  payloadsHash,
  resolveLocationIds,
  tiktokGET,
  tiktokHost,
  tiktokPOST,
} from "../_shared/tiktok-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const MIN_DAILY_CENTS = 2000; // TikTok: mínimo conservador de 20,00/dia por adgroup.

type Aviso = { codigo: string; detalhe?: string; adset?: string | null; ad_idx?: number };

function iso(d: string | null): string | null {
  return d ? new Date(d).toISOString().slice(0, 19).replace("T", " ") : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[tiktok-publish-execute] BUILD_VERSION=tiktok-execute-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "missing_authorization" }, 401);

  let body: { company_id?: string; plan_id?: string; dry_run?: boolean; preflight?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const companyIdIn = body.company_id;
  const planId = body.plan_id;
  // SALVAGUARDA: dry_run por omissão TRUE. Só escreve no TikTok com dry_run:false explícito.
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
    .select("id, company_id, platform, estado, objetivo, moeda, link_destino, adsets, start_time, end_time, artist_id, song_id, connection_id, external_campaign_id, meta_campaign_id")
    .eq("id", planId)
    .maybeSingle();
  if (planErr) return json({ ok: false, error: "plan_query_failed", detail: planErr.message }, 500);
  if (!planRow) return json({ ok: false, error: "plan_not_found" }, 404);
  if (planRow.company_id !== companyIdIn) return json({ ok: false, error: "company_mismatch" }, 403);
  if (String((planRow as any).platform ?? "meta") !== "tiktok") {
    return json({ ok: false, error: "plano_nao_tiktok", message: "Este plano não é de TikTok — usa o motor da plataforma do plano." }, 422);
  }
  if (!(planRow as any).song_id) {
    return json({ ok: false, error: "plano_sem_musica", message: "O motor TikTok publica apenas o alvo artista+música." }, 422);
  }

  // 2) Papéis. Igual ao Meta: leitura aceita service_role; escrita exige sessão + papel.
  const { data: userInfo } = await supabase.auth.getUser();
  const callerUserId = userInfo?.user?.id ?? null;
  const isServiceRole = !callerUserId && jwtRole(authHeader) === "service_role";
  if (!callerUserId && !isServiceRole) {
    return json({ ok: false, error: "sessao_invalida", message: "Sessão inválida." }, 401);
  }
  if (!dryRun && !preflight) {
    if (!callerUserId) {
      return json({
        ok: false, error: "service_role_nao_publica_musica",
        message: "A publicação de campanhas de música exige sessão de utilizador com papel de tráfego.",
      }, 403);
    }
    const { error: permErr } = await supabase.rpc("artist_ads_assert_write", { p_company_id: planRow.company_id });
    if (permErr) return json({ ok: false, error: "sem_permissao", detail: permErr.message }, 403);
  }

  // 3) Estado (só no caminho de escrita — dry-run e preflight são leitura pura).
  if (!dryRun && !preflight) {
    if (planRow.estado === "publicado") {
      return json({ ok: false, error: "ja_publicado", external_campaign_id: (planRow as any).external_campaign_id }, 409);
    }
    if (!["rascunho", "pronto_a_publicar", "a_publicar", "falhado"].includes(String(planRow.estado))) {
      return json({ ok: false, error: "estado_invalido", estado: planRow.estado }, 409);
    }
  }

  // 4) Host por ambiente — nunca por condicional no código.
  const host = tiktokHost();
  if (!host) {
    return json({
      ok: false, error: "sem_tiktok_api_host",
      message: `Falta a variável de ambiente TIKTOK_API_HOST (sandbox: ${TIKTOK_SANDBOX_HOST}).`,
    }, 500);
  }

  // 5) Ligação TikTok + token/advertiser_id. Sem token, o dry-run continua
  //    (monta payloads e devolve o hash); a publicação real recusa.
  const conn = await loadTikTokConnection(admin as any, {
    connectionId: String((planRow as any).connection_id),
    masterKey: ENCRYPTION_MASTER_KEY,
    exigirToken: !dryRun || preflight,
  });
  if (!conn.ok) return json({ ok: false, error: conn.error, message: conn.message }, conn.status);
  if ((!dryRun || preflight) && conn.status !== "active") {
    return json({ ok: false, error: "ligacao_inactiva", message: `A ligação TikTok não está activa (status=${conn.status}).` }, 422);
  }
  if (!conn.accessToken) avisos.push({ codigo: "sem_token_tiktok", detalhe: "dry-run sem chamada à API: a ligação ainda não tem token." });

  // 6) Objectivo.
  const goal = mapSongObjectiveTikTok(String(planRow.objetivo ?? ""));
  if (!goal) {
    return json({
      ok: false, error: "objetivo_invalido",
      message: "O objectivo do plano tem de ser AWARENESS, TRAFFIC ou ENGAGEMENT.",
    }, 422);
  }

  // 7) Janela e orçamentos.
  const planStartTime: string | null = (planRow as any).start_time ?? null;
  const planEndTime: string | null = (planRow as any).end_time ?? null;
  const usaLifetime = !!planEndTime;
  if (usaLifetime && !planStartTime) {
    return json({ ok: false, error: "sem_start_time_para_lifetime", message: "Com data de fim é obrigatória a data de início." }, 400);
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
    .map((a) => ({ adset: a?.trigger_nome ?? null, orcamento_cents: Number(a?.orcamento_cents ?? 0), minimo_cents: minimoCents }));
  if (abaixoMin.length > 0) {
    if (!dryRun) {
      return json({
        ok: false, error: "orcamento_abaixo_minimo", adsets: abaixoMin,
        message: `Orçamento abaixo do mínimo TikTok (${minimoCents} cents por conjunto${usaLifetime ? ` na janela de ${diasJanela} dia(s)` : "/dia"}).`,
      }, 412);
    }
    for (const x of abaixoMin) avisos.push({ codigo: "orcamento_abaixo_minimo", adset: x.adset, detalhe: `${x.orcamento_cents} < ${x.minimo_cents}` });
  }

  // 8) Geografia obrigatória — mesma forma do plano (publico_sugerido.geo ISO-2
  //    e, quando existir, publico_sugerido.geo_regions).
  function temGeo(a: any): boolean {
    const g = a?.publico_sugerido?.geo;
    return Array.isArray(g) && g.some((x: any) => typeof x === "string" && x.trim().length > 0);
  }
  const semGeo = adsets.filter((a) => !temGeo(a)).map((a) => a?.trigger_nome ?? null);
  if (semGeo.length > 0) {
    if (!dryRun) {
      return json({
        ok: false, error: "sem_geografia", adset: semGeo,
        message: "Cada conjunto tem de indicar pelo menos um país em publico_sugerido.geo (ex.: [\"BR\"]).",
      }, 422);
    }
    for (const nome of semGeo) avisos.push({ codigo: "sem_geografia", adset: nome });
  }

  // 9) Criativo: vídeo do artista. Sem tiktok_video_id não há anúncio possível
  //    (Spark Ads fica para quando houver identity BC_AUTH_TT — ver cabeçalho).
  const semVideo: Array<{ adset: string | null; ad_idx: number }> = [];
  for (let i = 0; i < adsets.length; i++) {
    const ans = adsets[i]?.anuncios ?? [];
    for (let k = 0; k < ans.length; k++) {
      const vid = ans[k]?.tiktok_video_id;
      if (typeof vid !== "string" || !vid.trim()) semVideo.push({ adset: adsets[i]?.trigger_nome ?? null, ad_idx: k });
    }
  }
  if (semVideo.length > 0) {
    if (!dryRun) {
      return json({
        ok: false, error: "sem_video_tiktok", anuncios: semVideo,
        message: "Cada anúncio TikTok exige o vídeo do artista já carregado na conta (anuncio.tiktok_video_id). Não há imagem estática neste motor.",
      }, 422);
    }
    for (const x of semVideo) avisos.push({ codigo: "sem_video_tiktok", adset: x.adset, ad_idx: x.ad_idx });
  }

  // 10) Teto por conta, na moeda da conta (plataforma 'tiktok').
  const pedidoDiario = dailyFromAdsetsTikTok(adsets, usaLifetime, diasJanela);
  const teto = await checkTetoTikTok(supabase as any, {
    artistId: String((planRow as any).artist_id),
    connectionId: conn.connectionId,
    moeda: planRow.moeda ?? conn.moedaConta,
    pedidoDiario,
  });
  if (!teto.ok) {
    if (!dryRun && !preflight) {
      return json({
        ok: false, error: teto.error, teto: teto.teto, pedido: teto.pedido,
        ja_comprometido: teto.ja_comprometido, disponivel: teto.disponivel, moeda: teto.moeda,
        message: teto.error === "sem_teto"
          ? "Esta conta TikTok não tem teto de orçamento definido — define o teto antes de publicar."
          : teto.error === "acima_do_teto"
          ? `Acima do teto diário (${teto.teto} ${teto.moeda ?? ""}): pedido ${teto.pedido}, disponível ${teto.disponivel}.`
          : "A moeda do plano/conta não é a do teto.",
      }, 422);
    }
    avisos.push({ codigo: String(teto.error), detalhe: JSON.stringify(teto) });
  }

  // 11) Naming — mesma regra do Meta ("[MP] [MÚSICA] [Objectivo] AAAA-MM-DD").
  const { data: song } = await (admin as any).from("artist_songs")
    .select("id, title").eq("id", (planRow as any).song_id).maybeSingle();
  const rawTitle = (song as any)?.title ?? "";
  const { data: baseTitle } = await (admin as any).rpc("artist_song_base_title", { _title: rawTitle });
  const tituloBase = String(baseTitle ?? rawTitle ?? "").trim() || "musica";
  const dateLabel = (planStartTime ? new Date(planStartTime) : new Date()).toISOString().slice(0, 10);
  const campaignName = `[MP] [${tituloBase.toUpperCase()}] [${songObjectiveLabel(String(planRow.objetivo ?? "TRAFFIC"))}] ${dateLabel}`;
  const prefixo = "[MP] ";

  // 12) Geografia → location_ids (só com token; sem token o dry-run devolve placeholders).
  const geoPorAdset: string[][] = [];
  for (const a of adsets) {
    const pais = (a?.publico_sugerido?.geo ?? []).filter((x: any) => typeof x === "string" && x.trim());
    const regs = Array.isArray(a?.publico_sugerido?.geo_regions) ? a.publico_sugerido.geo_regions : [];
    if (!conn.accessToken) {
      geoPorAdset.push([]);
      avisos.push({ codigo: "geo_nao_resolvida", adset: a?.trigger_nome ?? null, detalhe: "sem token: location_ids não resolvidos" });
      continue;
    }
    const r = await resolveLocationIds(host, conn.accessToken, conn.advertiserId, goal.objective_type, pais, regs);
    for (const av of r.avisos) avisos.push({ ...av, adset: a?.trigger_nome ?? null });
    if (r.location_ids.length === 0 && !dryRun) {
      return json({
        ok: false, error: "geo_nao_resolvida", adset: a?.trigger_nome ?? null,
        message: "Não foi possível resolver a geografia do conjunto em location_ids do TikTok.",
      }, 422);
    }
    geoPorAdset.push(r.location_ids);
  }

  // 13) Payloads.
  const linkPlano: string | null = typeof planRow.link_destino === "string" && planRow.link_destino ? planRow.link_destino : null;
  const campaignPayload: Record<string, unknown> = {
    advertiser_id: conn.advertiserId,
    campaign_name: campaignName,
    objective_type: goal.objective_type,
    budget_mode: "BUDGET_MODE_INFINITE", // orçamento por adgroup (equivalente ao ABO do Meta)
    operation_status: "DISABLE",
  };

  function adgroupPayload(a: any, idx: number, campaignId: string): Record<string, unknown> {
    const orc = Math.max(0, Number(a?.orcamento_cents ?? 0)) / 100;
    const p: Record<string, unknown> = {
      advertiser_id: conn.advertiserId,
      campaign_id: campaignId,
      adgroup_name: `${prefixo}${a?.trigger_nome ?? `Conjunto ${idx + 1}`}`,
      promotion_type: goal.promotion_type,
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: geoPorAdset[idx] ?? [],
      optimization_goal: goal.optimization_goal,
      billing_event: goal.billing_event,
      bid_type: "BID_TYPE_NO_BID",
      budget_mode: usaLifetime ? "BUDGET_MODE_TOTAL" : "BUDGET_MODE_DAY",
      budget: orc,
      schedule_type: usaLifetime ? "SCHEDULE_START_END" : "SCHEDULE_FROM_NOW",
      operation_status: "DISABLE",
    };
    if (planStartTime) p.schedule_start_time = iso(planStartTime);
    if (usaLifetime) p.schedule_end_time = iso(planEndTime);
    const idade = a?.publico_sugerido?.idades;
    if (idade?.min != null || idade?.max != null) {
      p.audience_note_idades = { min: idade?.min ?? null, max: idade?.max ?? null };
    }
    return p;
  }

  function adPayload(a: any, an: any, adgroupId: string, idx: number, k: number): Record<string, unknown> {
    const link = (typeof an?.link_destino === "string" && an.link_destino) || (typeof a?.link_destino === "string" && a.link_destino) || linkPlano;
    return {
      advertiser_id: conn.advertiserId,
      adgroup_id: adgroupId,
      creatives: [{
        ad_name: `${prefixo}${a?.trigger_nome ?? `Conjunto ${idx + 1}`} — ${k + 1}`,
        ad_format: "SINGLE_VIDEO",
        // Vídeo do artista já na conta de anúncios. SPARK ADS (via BC_AUTH_TT)
        // substituiria video_id por tiktok_item_id + identity_id — não nesta versão.
        video_id: an?.tiktok_video_id ?? null,
        identity_type: "CUSTOMIZED_USER",
        ad_text: String(an?.texto ?? an?.copy ?? tituloBase).slice(0, 100),
        call_to_action: goal.objective_type === "TRAFFIC" ? "LISTEN_NOW" : "WATCH_NOW",
        landing_page_url: link,
        operation_status: "DISABLE",
      }],
    };
  }

  // ── PREFLIGHT: só GETs. Não escreve no TikTok nem no plano. ─────────────
  if (preflight) {
    const checks: Array<{ check: string; ok: boolean; detail?: string }> = [];
    const adv = await tiktokGET(host, "advertiser/info/", {
      advertiser_ids: JSON.stringify([conn.advertiserId]),
    }, conn.accessToken!);
    const info = (adv.ok ? (adv.data as any)?.list?.[0] : null) ?? null;
    checks.push({ check: "token_e_conta", ok: adv.ok, detail: adv.ok ? String(info?.name ?? conn.advertiserId) : (adv as any).message });
    const moedaConta = String(info?.currency ?? conn.moedaConta ?? "").toUpperCase();
    checks.push({
      check: "moeda_da_conta",
      ok: !!moedaConta && moedaConta === String(planRow.moeda ?? "").toUpperCase(),
      detail: `conta=${moedaConta || "?"} plano=${String(planRow.moeda ?? "?").toUpperCase()}`,
    });
    checks.push({ check: "teto", ok: !!teto.ok, detail: JSON.stringify(teto) });
    checks.push({ check: "geografia", ok: semGeo.length === 0 && geoPorAdset.every((g) => g.length > 0), detail: JSON.stringify(geoPorAdset) });
    checks.push({ check: "video_do_artista", ok: semVideo.length === 0, detail: semVideo.length === 0 ? "todos os anúncios têm tiktok_video_id" : JSON.stringify(semVideo) });
    const tudoOk = checks.every((c) => c.ok);
    return json({ ok: tudoOk, preflight: true, plataforma: "tiktok", advertiser_id: conn.advertiserId, checks, avisos }, tudoOk ? 200 : 422);
  }

  // ── DRY-RUN: payloads + diff + prova por hash. Não toca na API nem na BD. ──
  if (dryRun) {
    const dryAdgroups: any[] = [];
    const dryAds: any[] = [];
    for (let i = 0; i < adsets.length; i++) {
      const a = adsets[i];
      dryAdgroups.push({ trigger_nome: a?.trigger_nome ?? null, payload: adgroupPayload(a, i, "<CAMPAIGN_ID>") });
      const ans = a?.anuncios ?? [];
      for (let k = 0; k < ans.length; k++) {
        dryAds.push({ adset: a?.trigger_nome ?? null, ad_idx: k, payload: adPayload(a, ans[k], "<ADGROUP_ID>", i, k) });
      }
    }
    const payloads = { campaign: campaignPayload, adgroups: dryAdgroups, ads: dryAds };
    // Diff = o que já existe no TikTok (ids guardados no plano) vs o que seria criado.
    const diff = {
      campanha: (planRow as any).external_campaign_id ? "existe — seria retomada" : "seria criada",
      adgroups: adsets.map((a, i) => ({
        conjunto: a?.trigger_nome ?? `Conjunto ${i + 1}`,
        estado: a?.external_adgroup_id ? "existe — seria retomado" : "seria criado",
        anuncios: (a?.anuncios ?? []).map((an: any, k: number) => ({
          idx: k, estado: an?.external_ad_id ? "existe — seria retomado" : "seria criado",
        })),
      })),
    };
    return json({
      ok: true,
      dry_run: true,
      plataforma: "tiktok",
      host,
      estado_plano: planRow.estado,
      advertiser_id: conn.advertiserId,
      naming: { campaign: campaignName, prefix: prefixo },
      janela: { start_time: planStartTime, end_time: planEndTime, dias: diasJanela, budget_mode: usaLifetime ? "total" : "daily" },
      teto,
      payloads,
      payloads_sha256: await payloadsHash(payloads),
      diff,
      avisos,
    });
  }

  // ── PUBLICAÇÃO REAL — tudo em pausa (operation_status=DISABLE) ──────────
  // Lock anti-corrida (mesmo padrão do Meta/Google).
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

  async function persist(extra: Record<string, unknown> = {}): Promise<void> {
    await (admin as any).schema("crm").from("meta_publish_plan")
      .update({ adsets: adsetsOut, ...extra }).eq("id", planId);
  }

  async function falha(etapa: string, err: { message: string; code: number | null; raw?: any }, externalId = "-"): Promise<Response> {
    await persist({ estado: "falhado", publish_error: { etapa, error: err.message, code: err.code, at: new Date().toISOString() } });
    const logErr = await logAdsAction(admin as any, {
      company_id: planRow.company_id, connection_id: conn.connectionId, ad_account_id: conn.advertiserId,
      plan_id: planId!, artist_id: (planRow as any).artist_id, song_id: (planRow as any).song_id,
      entity_type: etapa === "campaign" ? "campaign" : etapa === "adgroup" ? "adgroup" : "ad",
      external_id: externalId, action: "create", success: false, error_message: err.message,
      platform_response_jsonb: err.raw ?? null, performed_by: callerUserId,
    });
    if (logErr) avisos.push({ codigo: "registo_acao_falhou", detalhe: logErr });
    return json({ ok: false, error: "tiktok_rejeitou", etapa, code: err.code, message: err.message, avisos }, 200);
  }

  // Campanha (idempotente: retoma se já existir).
  let campaignId: string | null = (planRow as any).external_campaign_id ?? null;
  if (!campaignId) {
    const r = await tiktokPOST<{ campaign_id: string }>(host, "campaign/create/", campaignPayload, conn.accessToken!);
    if (!r.ok) return await falha("campaign", r);
    campaignId = String((r.data as any)?.campaign_id ?? "");
    if (!campaignId) return await falha("campaign", { message: "resposta sem campaign_id", code: null, raw: r.data });
    await persist({ external_campaign_id: campaignId });
    const logErr = await logAdsAction(admin as any, {
      company_id: planRow.company_id, connection_id: conn.connectionId, ad_account_id: conn.advertiserId,
      plan_id: planId!, artist_id: (planRow as any).artist_id, song_id: (planRow as any).song_id,
      entity_type: "campaign", external_id: campaignId, entity_name: campaignName, action: "create",
      new_status: "DISABLE", updates_jsonb: { alvo: "song", objetivo: planRow.objetivo }, success: true,
      performed_by: callerUserId,
    });
    if (logErr) avisos.push({ codigo: "registo_acao_falhou", detalhe: logErr });
  }

  // Espelho da campanha com a MÚSICA TRANCADA (nunca se desliga aqui).
  {
    const { error } = await (admin as any).schema("crm").from("meta_campaign_snapshot").upsert({
      connection_id: conn.connectionId,
      company_id: planRow.company_id,
      ad_account_id: conn.advertiserId,
      external_campaign_id: campaignId,
      name: campaignName,
      status: "DISABLE",
      effective_status: "DISABLE",
      objective: goal.objective_type,
      currency: conn.moedaConta ?? planRow.moeda ?? null,
      start_time: planStartTime,
      stop_time: planEndTime,
      raw: { created_by: "crm-tiktok-publish-execute", plan_id: planId, platform: "tiktok" },
      last_synced_at: new Date().toISOString(),
      linked_song_id: (planRow as any).song_id,
      linked_song_locked: true,
    }, { onConflict: "connection_id,external_campaign_id" });
    if (error) avisos.push({ codigo: "espelho_campanha_falhou", detalhe: error.message });
  }

  // Adgroups + anúncios.
  for (let i = 0; i < adsetsOut.length; i++) {
    const a = adsetsOut[i];
    if (!a.external_adgroup_id) {
      const r = await tiktokPOST<{ adgroup_id: string }>(host, "adgroup/create/", adgroupPayload(a, i, campaignId!), conn.accessToken!);
      if (!r.ok) return await falha("adgroup", r, campaignId!);
      a.external_adgroup_id = String((r.data as any)?.adgroup_id ?? "");
      if (!a.external_adgroup_id) return await falha("adgroup", { message: "resposta sem adgroup_id", code: null, raw: r.data }, campaignId!);
      a.tiktok_status = "DISABLE";
      await persist();
      const logErr = await logAdsAction(admin as any, {
        company_id: planRow.company_id, connection_id: conn.connectionId, ad_account_id: conn.advertiserId,
        plan_id: planId!, artist_id: (planRow as any).artist_id, song_id: (planRow as any).song_id,
        entity_type: "adgroup", external_id: a.external_adgroup_id, entity_name: `${prefixo}${a?.trigger_nome ?? ""}`,
        action: "create", new_status: "DISABLE", success: true, performed_by: callerUserId,
      });
      if (logErr) avisos.push({ codigo: "registo_acao_falhou", detalhe: logErr });
    }

    const ans = a.anuncios ?? [];
    for (let k = 0; k < ans.length; k++) {
      const an = ans[k];
      if (an.external_ad_id) continue;
      const r = await tiktokPOST<{ ad_ids: string[] }>(host, "ad/create/", adPayload(a, an, a.external_adgroup_id, i, k), conn.accessToken!);
      if (!r.ok) return await falha("ad", r, a.external_adgroup_id);
      const novo = String(((r.data as any)?.ad_ids ?? [])[0] ?? "");
      if (!novo) return await falha("ad", { message: "resposta sem ad_ids", code: null, raw: r.data }, a.external_adgroup_id);
      an.external_ad_id = novo;
      an.tiktok_status = "DISABLE";
      await persist();
      const logErr = await logAdsAction(admin as any, {
        company_id: planRow.company_id, connection_id: conn.connectionId, ad_account_id: conn.advertiserId,
        plan_id: planId!, artist_id: (planRow as any).artist_id, song_id: (planRow as any).song_id,
        entity_type: "ad", external_id: novo, action: "create", new_status: "DISABLE", success: true,
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
    plataforma: "tiktok",
    estado: "publicado",
    external_campaign_id: campaignId,
    naming: { campaign: campaignName, prefix: prefixo },
    teto,
    adgroups: adsetsOut.map((a: any) => ({
      conjunto: a?.trigger_nome ?? null,
      external_adgroup_id: a?.external_adgroup_id ?? null,
      anuncios: (a?.anuncios ?? []).map((x: any) => x?.external_ad_id ?? null),
    })),
    avisos,
  });
});
