// crm-meta-publish-execute (FASE 2)
// POST { company_id, plan_id, dry_run?: boolean, preflight?: boolean }
//
// Cria no Meta: 1 campanha + N adsets + M anúncios — TUDO status=PAUSED.
// ABO: orçamento nos adsets, campanha sem budget.
// Idempotência: se já existir meta_campaign_id / meta_adset_id / meta_ad_id
// guardados no plano, NÃO recria — retoma. Re-correr após falha parcial
// retoma de onde parou e NUNCA duplica.
// Dry-run: monta payloads e devolve-os sem chamar a Meta Graph API, sem escrever
// em nenhuma tabela e sem mudar estado. Default = TRUE (salvaguarda P0 herdada):
// só escreve no Meta com dry_run:false explícito. D-ERP95 F2a: o dry-run é
// permitido em QUALQUER estado do plano (incluindo 'publicado'), e a construção
// dos payloads é a MESMA do caminho real (buildAdsetPayload/buildAdPayloads).
//
// D-ERP95 F2b — MOTOR ÚNICO, DOIS ALVOS:
//   • evento — inalterado byte a byte (mesmas validações, mesma resolução de
//     conta/pixel, mesmo naming, mesma ordem de escrita, mesmas respostas).
//   • artista+música (song_id) — conta/token/Página/Instagram da ligação do
//     artista, sem pixel, objectivos AWARENESS|TRAFFIC|ENGAGEMENT, teto de
//     orçamento obrigatório, naming "[MP] …", UTMs geradas pelo motor, posts
//     existentes, lock anti-corrida, espelho da campanha com a música trancada
//     e registo das criações em crm.meta_entity_actions_log.
// Modo preflight: só GETs à Graph API, devolve { ok, preflight, checks[] }.
// O alvo é resolvido por _shared/campaign-target.ts (resolvedor único).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { fetchAllPagedQuery } from "../_shared/paging.ts";
import { resolveTarget, utmSlug } from "../_shared/campaign-target.ts";
import { checkTetoPlano, type TetoInfo } from "../_shared/artist-ads-teto.ts";

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

async function graphGET(path: string, params: Record<string, string>, accessToken: string): Promise<{ ok: boolean; data: any; status: number }> {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  const r = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}${path}?${qs.toString()}`);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !j?.error, data: j, status: r.status };
}

// Papel declarado no JWT do pedido (sem validar assinatura — serve apenas para
// distinguir service_role de sessão de utilizador; a autoridade é o getUser()).
function jwtRole(authHeader: string): string | null {
  try {
    const tok = authHeader.replace(/^Bearer\s+/i, "");
    const p = tok.split(".")[1];
    if (!p) return null;
    const pad = p.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(pad + "=".repeat((4 - pad.length % 4) % 4)));
    return typeof claims?.role === "string" ? claims.role : null;
  } catch { return null; }
}

// ALVO MÚSICA (D-ERP95 F2b) — objectivos ODAX sem pixel.
// Fonte: Meta Marketing API, Ad Set "destination_type" + combinações objectivo ×
// optimization_goal (developers.facebook.com/docs/marketing-api/adset/destination_type/).
//   AWARENESS   → OUTCOME_AWARENESS  + REACH            (sem destination_type)
//   TRAFFIC     → OUTCOME_TRAFFIC    + LINK_CLICKS      + destination_type WEBSITE
//   ENGAGEMENT  → OUTCOME_ENGAGEMENT + THRUPLAY         + destination_type ON_VIDEO
// ON_VIDEO aceita THRUPLAY / TWO_SECOND_CONTINUOUS_VIDEO_VIEWS e, ao contrário
// de ON_POST, não exige promoted_object. Nunca há promoted_object de pixel.
function mapSongObjective(objetivo: string): { objective: string; optimization_goal: string; billing_event: string; destination_type?: string } | null {
  switch (String(objetivo).toUpperCase()) {
    case "AWARENESS":
      return { objective: "OUTCOME_AWARENESS", optimization_goal: "REACH", billing_event: "IMPRESSIONS" };
    case "TRAFFIC":
      return { objective: "OUTCOME_TRAFFIC", optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS", destination_type: "WEBSITE" };
    case "ENGAGEMENT":
      return { objective: "OUTCOME_ENGAGEMENT", optimization_goal: "THRUPLAY", billing_event: "IMPRESSIONS", destination_type: "ON_VIDEO" };
    default:
      return null;
  }
}



Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[meta-publish-execute] BUILD_VERSION=publish-execute-v15-fix-thumbnail");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { company_id?: string; plan_id?: string; dry_run?: boolean; preflight?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const companyIdIn = body.company_id;
  const planId = body.plan_id;
  // SALVAGUARDA P0: dry_run default = TRUE. Só escreve no Meta se vier explicitamente false.
  const dryRun = body.dry_run !== false;
  // Preflight (D-ERP95 F2b): só GETs à Graph API; não escreve na Meta nem no plano.
  const preflight = body.preflight === true;
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

  // 0) IDENTIDADE DO CHAMADOR (D-ERP127).
  //    Causa do defeito: getUser() era chamado SEM o token, contando com o header
  //    Authorization global do cliente. Nessa forma o supabase-js procura uma
  //    sessão guardada (que aqui não existe, persistSession:false) e devolve null
  //    — daí o 401 sessao_invalida com sessões perfeitamente válidas. O token vai
  //    agora explícito, validado pelo cliente ADMIN, como em
  //    _shared/artist-meta.ts → authorize().
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = jwtRole(authHeader) === "service_role";
  let callerUserId: string | null = null;
  if (!isServiceRole) {
    const { data: userInfo, error: userErr } = await admin.auth.getUser(bearer);
    callerUserId = userInfo?.user?.id ?? null;
    if (!callerUserId) {
      return json({ ok: false, error: "sessao_invalida", message: "Sessão inválida ou expirada.", detail: userErr?.message ?? null }, 401);
    }
  }

  // 1) Lê o plano com o cliente ADMIN e valida a pertença por PAPEL na empresa
  //    do plano (nunca por profiles.active_company_id — era o que fazia a mesma
  //    chamada devolver 404 plan_not_found quando a empresa activa do utilizador
  //    era outra). Mesma regra de public.artist_ads_assert_write/access:
  //    platform_admin passa sempre; os restantes precisam de linha em
  //    public.user_roles para a company_id do plano.
  const { data: planRow, error: planErr } = await (admin as any)
    .schema("crm").from("meta_publish_plan")
    .select("id, company_id, event_id, design_id, objetivo, orcamento_total_cents, moeda, link_destino, adsets, estado, meta_campaign_id, start_time, end_time, artist_id, song_id, connection_id")
    .eq("id", planId)
    .maybeSingle();
  if (planErr) return json({ error: "plan_query_failed", detail: planErr.message }, 500);
  if (!planRow) return json({ error: "plan_not_found" }, 404);
  if (planRow.company_id !== companyIdIn) return json({ error: "company_mismatch" }, 403);

  if (callerUserId) {
    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("role, company_id")
      .eq("user_id", callerUserId);
    if (roleErr) return json({ error: "role_query_failed", detail: roleErr.message }, 500);
    const rows = (roleRows ?? []) as Array<{ role: string; company_id: string | null }>;
    const isPlatformAdmin = rows.some((r) => r.role === "platform_admin");
    const pertence = isPlatformAdmin || rows.some((r) => r.company_id === planRow.company_id);
    if (!pertence) {
      return json({
        ok: false,
        error: "sem_acesso_empresa",
        message: "A tua conta não tem papel na empresa deste plano.",
      }, 403);
    }
  }

  const isSong = !!(planRow as any).song_id;

  // 2a) Autorização do alvo música (D-ERP95 F2b). Nada disto corre para eventos.
  //     dry_run/preflight: sessão de utilizador OU service_role (já garantido).
  //     Publicação real: SESSÃO + papel de tráfego (public.artist_ads_assert_write).
  if (isSong) {
    if (!dryRun && !preflight) {
      if (!callerUserId) {
        return json({
          ok: false, error: "service_role_nao_publica_musica",
          message: "A publicação de campanhas de música exige sessão de utilizador com papel de tráfego.",
        }, 403);
      }
      const { error: permErr } = await supabase.rpc("artist_ads_assert_write", { p_company_id: planRow.company_id });
      if (permErr) {
        return json({ ok: false, error: "sem_permissao", detail: permErr.message }, 403);
      }
    }
  }

  // Guardas de estado: só no caminho de escrita. O dry-run e o preflight são
  // leitura pura e são permitidos em QUALQUER estado (incluindo 'publicado')
  // — servem de prova por hash e de verificação prévia.
  if (!dryRun && !preflight) {
    if (planRow.estado === "publicado") {
      return json({ error: "ja_publicado", meta_campaign_id: planRow.meta_campaign_id }, 409);
    }
    if (!["rascunho", "pronto_a_publicar", "a_publicar", "falhado"].includes(planRow.estado)) {
      return json({ error: "estado_invalido", estado: planRow.estado }, 409);
    }
  }

  // 1b) Janela de datas e regra orçamento: com end_time → lifetime_budget; sem → daily_budget.
  const planStartTime: string | null = (planRow as any).start_time ?? null;
  const planEndTime: string | null = (planRow as any).end_time ?? null;
  const usaLifetime = !!planEndTime;
  if (usaLifetime && !planStartTime) {
    return json({
      error: "sem_start_time_para_lifetime",
      message: "Campanha com data de fim exige também data de início (o Meta requer start_time + end_time quando o adset usa lifetime_budget).",
    }, 400);
  }
  if (planStartTime && planEndTime && new Date(planEndTime).getTime() <= new Date(planStartTime).getTime()) {
    return json({ error: "janela_invalida", message: "end_time tem de ser depois de start_time" }, 400);
  }
  // Nº de dias da janela (mínimo 1) — usado para mínimo de lifetime_budget.
  const diasJanela = (planStartTime && planEndTime)
    ? Math.max(1, Math.ceil((new Date(planEndTime).getTime() - new Date(planStartTime).getTime()) / 86400000))
    : 1;
  // Mínimo Meta conservador: 1€/dia (100 cents). Para lifetime, 100 cents × dias.
  const MIN_DAILY_CENTS = 100;
  const MIN_LIFETIME_CENTS = MIN_DAILY_CENTS * diasJanela;

  // 2) RESOLVEDOR ÚNICO DE ALVO (_shared/campaign-target.ts, D-ERP95 F2b).
  //    Alvo evento: extracção literal dos antigos passos 2 / 2b / 3 / 4 —
  //    mesmas queries, mesma ordem, mesmos erros, mesmos valores. O antigo
  //    passo 2c (sem_link_destino) corria entre a Página e o token, e continua
  //    a correr exactamente aí, através de onAccountResolved.
  const planoLinkDestino: string | null = typeof planRow.link_destino === "string" && planRow.link_destino.length > 0
    ? planRow.link_destino
    : null;
  const adsetsPreview: any[] = Array.isArray(planRow.adsets) ? planRow.adsets : [];
  const algumLink = adsetsPreview.some((a) => typeof a?.link_destino === "string" && a.link_destino.length > 0);
  const usaBiblioteca = adsetsPreview.some((a) => (a?.anuncios ?? []).some((an: any) => Array.isArray(an?.creative_ids) && an.creative_ids.length > 0));

  const resolved = await resolveTarget(admin as any, planRow as any, {
    user: supabase as any,
    masterKey: ENCRYPTION_MASTER_KEY,
    graphVersion: GRAPH_API_VERSION,
    // Resolver e gravar Página/Instagram na ligação nunca acontece em dry_run.
    allowWrites: preflight || !dryRun,
    onAccountResolved: () => {
      // 2c) Link de destino do plano. Se faltar e nenhum adset tiver override, falha cedo.
      if (!planoLinkDestino && !algumLink) {
        return json({ error: "sem_link_destino", message: "Define o link de destino no painel (https://...) antes de publicar." }, 412);
      }
      return null;
    },
  });
  if (!resolved.ok) return resolved.response;
  const target = resolved.target;
  const connectionId = target.connection_id;
  const adAccountId = target.ad_account_id;
  const adAccountNumeric = target.ad_account_numeric;
  const selectedPageId: string | null = target.page_id;
  const selectedInstagramId: string | null = target.instagram_user_id;
  const accessToken = target.access_token;
  const eventPixelId: string | null = target.pixel_id;

  // 2c-bis) Alvo música: o link só é obrigatório em Tráfego ou quando algum
  //         anúncio usa a biblioteca de criativos (o criativo exige link).
  if (isSong) {
    const precisaLink = String(planRow.objetivo ?? "").toUpperCase() === "TRAFFIC" || usaBiblioteca;
    if (precisaLink && !planoLinkDestino && !algumLink) {
      return json({ ok: false, error: "sem_link_destino", message: "Define o link de destino do plano (ou o smart link da música) antes de publicar." }, 412);
    }
    if (usaBiblioteca && !selectedPageId) {
      return json({ ok: false, error: "sem_pagina_facebook", message: "Não foi possível determinar a Página de Facebook da ligação do artista." }, 412);
    }
  }

  const adsets: any[] = Array.isArray(planRow.adsets) ? planRow.adsets : [];
  const avisos: Array<{ codigo: string; detalhe?: string; adset?: string; ad_idx?: number; group_idx?: number }> = [];

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
  type CreativeInfo = { meta_creative_id: string | null; meta_image_hash: string | null; meta_video_id: string | null; type: string | null; file_url: string | null; width: number | null; height: number | null };
  const resolvedCreatives = new Map<string, CreativeInfo>();
  if (creativeUuids.length > 0) {
    const { data: rows, error: cErr } = await (admin as any)
      .schema("crm").from("meta_creatives")
      .select("id, meta_creative_id, meta_image_hash, meta_video_id, type, file_url, width, height")
      .in("id", creativeUuids);
    if (cErr) return json({ error: "creatives_query_failed", detail: cErr.message }, 500);
    for (const r of (rows ?? [])) {
      resolvedCreatives.set(r.id as string, {
        meta_creative_id: (r as any).meta_creative_id ?? null,
        meta_image_hash: (r as any).meta_image_hash ?? null,
        meta_video_id: (r as any).meta_video_id ?? null,
        type: (r as any).type ?? null,
        file_url: (r as any).file_url ?? null,
        width: typeof (r as any).width === "number" ? (r as any).width : null,
        height: typeof (r as any).height === "number" ? (r as any).height : null,
      });
    }
    for (const u of creativeUuids) {
      if (!resolvedCreatives.has(u)) resolvedCreatives.set(u, { meta_creative_id: null, meta_image_hash: null, meta_video_id: null, type: null, file_url: null, width: null, height: null });
    }
  }

  // 6) Monta payloads.
  const objetivo = planRow.objetivo ?? "OUTCOME_TRAFFIC";
  const objetivoUpper = String(objetivo).toUpperCase();
  let { optimization_goal, billing_event } = mapObjective(objetivo);

  // Alvo música: objectivos sem pixel (D-ERP95 F2b). Conversões não são aceites.
  const songGoal = isSong ? mapSongObjective(objetivo) : null;
  if (isSong && !songGoal) {
    return json({
      ok: false, error: "objetivo_invalido", objetivo,
      message: "Campanhas de música só aceitam AWARENESS (Alcance), TRAFFIC (Tráfego) ou ENGAGEMENT (Visualizações).",
    }, 422);
  }
  if (songGoal) {
    optimization_goal = songGoal.optimization_goal;
    billing_event = songGoal.billing_event;
  }

  const campaignPayload = {
    name: target.naming.campaign,
    objective: songGoal ? songGoal.objective : objetivo,
    status: "PAUSED",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  };

  // 6.a) Inclusões e exclusões de custom_audiences por adset (calculadas UMA vez).
  //
  // Inclusão: a.audiencias[].audience_id_meta (N por adset). Fallback retrocompat:
  //   publico_custom_audience_id (1). Vazio → broad (sem custom_audiences).
  // Exclusões — hierarquia:
  //   R1 — quente exclui inclusões de quentes com prioridade SUPERIOR (mais cedo no array).
  //   R2 — frio exclui inclusões de TODOS os quentes.
  //   R3 — todos os adsets excluem o conjunto COMPRADORES.
  //   Dedup: nunca incluir e excluir o mesmo id no mesmo adset.
  //   Interesses/IG sem audience_id_meta são ignorados (só custom audiences).
  const COMPRADOR_ID_FIXO = "120235894428940595";
  const inclusionsByIdx: string[][] = adsets.map((a) => {
    const fromAudiencias: string[] = Array.isArray(a?.audiencias)
      ? a.audiencias
          .map((x: any) => (x && x.audience_id_meta != null ? String(x.audience_id_meta) : null))
          .filter((x: string | null): x is string => x !== null && x.length > 0)
      : [];
    if (fromAudiencias.length > 0) return Array.from(new Set(fromAudiencias));
    if (a?.publico_custom_audience_id) return [String(a.publico_custom_audience_id)];
    return [];
  });
  // Recolhe nomes (de a.audiencias[].nome quando existir, fallback DB).
  const idsForNameLookup = new Set<string>();
  for (let i = 0; i < adsets.length; i++) {
    const a = adsets[i];
    if (Array.isArray(a?.audiencias)) {
      for (const x of a.audiencias) {
        if (x?.audience_id_meta != null) idsForNameLookup.add(String(x.audience_id_meta));
      }
    }
    for (const id of inclusionsByIdx[i]) idsForNameLookup.add(id);
  }
  const nameByMetaId = new Map<string, string>();
  for (const a of adsets) {
    if (Array.isArray(a?.audiencias)) {
      for (const x of a.audiencias) {
        if (x?.audience_id_meta != null && typeof x.nome === "string" && !nameByMetaId.has(String(x.audience_id_meta))) {
          nameByMetaId.set(String(x.audience_id_meta), x.nome);
        }
      }
    }
  }
  const missingNames = Array.from(idsForNameLookup).filter((id) => !nameByMetaId.has(id));
  if (missingNames.length > 0) {
    const { data: audRows } = await fetchAllPagedQuery((admin as any)
      .schema("crm").from("meta_custom_audiences")
      .select("audience_id_meta, nome")
      .in("audience_id_meta", missingNames));
    for (const r of (audRows ?? [])) {
      if (r?.audience_id_meta) nameByMetaId.set(String(r.audience_id_meta), String(r.nome ?? ""));
    }
  }
  function isCompradorId(id: string): boolean {
    if (id === COMPRADOR_ID_FIXO) return true;
    const nome = (nameByMetaId.get(id) ?? "").toLowerCase();
    if (!nome) return false;
    if (nome.includes("[lista] clientes mundo propicio - ticketline")) return true;
    if (nome.includes("[compra]") && nome.includes("ivete")) return true;
    return false;
  }
  const compradoresSet = new Set<string>();
  for (const id of idsForNameLookup) if (isCompradorId(id)) compradoresSet.add(id);
  compradoresSet.add(COMPRADOR_ID_FIXO);
  // Índices ordenados dos quentes (ordem = prioridade; primeiro = mais prioritário).
  const hotIdxOrder: number[] = adsets
    .map((a, i) => ({ i, funil: a?.funil }))
    .filter((x) => x.funil === "quente")
    .map((x) => x.i);
  const exclusionsByIdx: Set<string>[] = adsets.map((a, idx) => {
    const incl = new Set(inclusionsByIdx[idx]);
    const excluded = new Set<string>();
    const funil = a?.funil;
    if (funil === "quente") {
      // R1 — cascata: exclui as inclusões dos quentes ANTES deste na ordem.
      const myPos = hotIdxOrder.indexOf(idx);
      for (let k = 0; k < myPos; k++) {
        for (const id of inclusionsByIdx[hotIdxOrder[k]]) excluded.add(id);
      }
    } else {
      // R2 — frio (ou qualquer não-quente): exclui inclusões de TODOS os quentes.
      for (const hIdx of hotIdxOrder) {
        for (const id of inclusionsByIdx[hIdx]) excluded.add(id);
      }
    }
    // R3 — compradores em todos.
    for (const id of compradoresSet) excluded.add(id);
    // Dedup com a própria inclusão.
    for (const id of incl) excluded.delete(id);
    return excluded;
  });
  for (let i = 0; i < adsets.length; i++) {
    console.log("[meta-publish-execute] ADSET_AUDIENCES", JSON.stringify({
      idx: i,
      trigger_nome: adsets[i]?.trigger_nome ?? "",
      funil: adsets[i]?.funil ?? null,
      custom_audiences: inclusionsByIdx[i],
      excluded_custom_audiences: Array.from(exclusionsByIdx[i]),
    }));
  }

  // Geografia explícita do conjunto (contrato do plano: publico_sugerido.geo,
  // lista de países ISO-2 ou nomes normalizáveis).
  function temGeo(a: any): boolean {
    const g = a?.publico_sugerido?.geo;
    return Array.isArray(g) && g.some((x: any) => typeof x === "string" && x.trim().length > 0);
  }

  function buildAdsetPayload(a: any, campaignIdParaPayload: string, adsetIdx: number): { payload: Record<string, unknown>; goal_used: string; sem_pixel?: boolean; budget_mode: "lifetime" | "daily"; abaixo_minimo?: { minimo_cents: number; orcamento_cents: number } } {
    const pub = a.publico_sugerido ?? {};
    // Alvo música (D-ERP95 F2b correcção): NUNCA há geografia por omissão —
    // sem publico_sugerido.geo o payload sai sem geo_locations (e a publicação
    // real / preflight já recusaram antes com 'sem_geografia').
    const semGeo = isSong && !temGeo(a);
    const targeting: Record<string, unknown> = {};
    if (!semGeo) {
      const geoLocations: Record<string, unknown> = {
        countries: normalizeCountries(
          Array.isArray(pub.geo) && pub.geo.length > 0 ? pub.geo : ["PT"],
          (codigo, detalhe) => avisos.push({ codigo, adset: a.trigger_nome, detalhe }),
        ),
      };
      // Estados/regiões: chaves de região da Meta já resolvidas na geração do
      // plano (publico_sugerido.geo_regions = [{nome, key}]). countries mantém-se.
      const regs = Array.isArray(pub.geo_regions)
        ? pub.geo_regions
          .map((r: any) => (typeof r === "string" ? r : r?.key))
          .filter((k: any) => typeof k === "string" && k.trim().length > 0)
          .map((k: string) => ({ key: String(k) }))
        : [];
      if (regs.length > 0) geoLocations.regions = regs;
      targeting.geo_locations = geoLocations;
    }
    targeting.age_min = Number.isFinite(pub.idade_min) ? pub.idade_min : 18;
    targeting.age_max = Number.isFinite(pub.idade_max) ? pub.idade_max : 65;
    targeting.targeting_automation = { advantage_audience: 0 };
    // Públicos MP (inclusões/exclusões) são do alvo evento: uma campanha de
    // música não herda nem exclui os públicos de compradores da empresa.
    const incl = isSong ? [] : (inclusionsByIdx[adsetIdx] ?? []);
    if (incl.length > 0) {
      targeting.custom_audiences = incl.map((id) => ({ id: String(id) }));
    }
    const excl = isSong ? undefined : exclusionsByIdx[adsetIdx];
    if (excl && excl.size > 0) {
      targeting.excluded_custom_audiences = Array.from(excl).map((id) => ({ id: String(id) }));
    }
    let goal = optimization_goal;
    const orcCents = Math.max(0, Number(a.orcamento_cents ?? 0));
    const payload: Record<string, unknown> = {
      name: target.naming.prefix + (a.trigger_nome || "Adset"),
      campaign_id: campaignIdParaPayload,
      billing_event,
      optimization_goal: goal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      status: "PAUSED",
      targeting,
    };
    // Alvo música: destino do objectivo (ODAX). Chave acrescentada no fim,
    // depois de todas as do caminho de evento — esse payload fica intacto.
    if (songGoal?.destination_type) payload.destination_type = songGoal.destination_type;
    let abaixo_minimo: { minimo_cents: number; orcamento_cents: number } | undefined;
    if (usaLifetime) {
      payload.lifetime_budget = orcCents;
      // Meta exige start_time + end_time (ISO 8601) com lifetime_budget.
      payload.start_time = planStartTime;
      payload.end_time = planEndTime;
      if (orcCents < MIN_LIFETIME_CENTS) {
        abaixo_minimo = { minimo_cents: MIN_LIFETIME_CENTS, orcamento_cents: orcCents };
      }
    } else {
      payload.daily_budget = orcCents;
      // Sem end_time, start_time é opcional; envia se existir (campanha agendada open-ended).
      if (planStartTime) payload.start_time = planStartTime;
      if (orcCents < MIN_DAILY_CENTS) {
        abaixo_minimo = { minimo_cents: MIN_DAILY_CENTS, orcamento_cents: orcCents };
      }
    }
    let sem_pixel = false;
    if (goal === "OFFSITE_CONVERSIONS") {
      if (eventPixelId) {
        payload.promoted_object = { pixel_id: eventPixelId, custom_event_type: "PURCHASE" };
        // Attribution window explícita para compra de bilhetes: 7d clique + 1d view.
        // SÓ aplicável a adsets de conversão (OFFSITE_CONVERSIONS); para
        // LINK_CLICKS / REACH / POST_ENGAGEMENT o Meta rejeita este campo.
        payload.attribution_spec = [
          { event_type: "CLICK_THROUGH", window_days: 7 },
          { event_type: "VIEW_THROUGH",  window_days: 1 },
        ];
      } else {
        sem_pixel = true;
      }
    }
    // NOTA: frequency_control_specs NÃO é adicionado intencionalmente.
    // O Meta só aceita esse campo em adsets com optimization_goal=REACH
    // (e variantes ligadas). Em OFFSITE_CONVERSIONS / LINK_CLICKS a API
    // rejeita o adset inteiro com "Invalid parameter". Controlo de
    // frequência aqui = via (i) algoritmo de otimização, (ii) duração +
    // orçamento, ou (iii) campanha REACH separada.
    return { payload, goal_used: goal, sem_pixel, budget_mode: usaLifetime ? "lifetime" : "daily", abaixo_minimo };
  }


  // Resolve link efetivo: override do adset > link do plano.
  function resolveLink(a: any): string | null {
    if (typeof a?.link_destino === "string" && a.link_destino.length > 0) return a.link_destino;
    return planoLinkDestino;
  }

  const META_VALID_CTAS = new Set(["BOOK_TRAVEL","CONTACT_US","DONATE","DONATE_NOW","DOWNLOAD","GET_DIRECTIONS","LEARN_MORE","SEE_DETAILS","SEE_MORE","SIGN_UP","SHOP_NOW","SUBSCRIBE","BUY_TICKETS","GET_EVENT_TICKETS","BUY_NOW","ORDER_NOW","GET_OFFER","BOOK_NOW","LISTEN_NOW","WATCH_MORE","APPLY_NOW","GET_QUOTE","NO_BUTTON","SEE_MENU","SEND_MESSAGE","WHATSAPP_MESSAGE","CALL_NOW"]);
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
    if (CTA_ALIASES[v]) return CTA_ALIASES[v];
    if (META_VALID_CTAS.has(v)) return v;
    return "SHOP_NOW";
  }

  // Classificação por rácio: vertical = h/w ≥ 1.6 (cobre 9:16=1.778). Resto = feed.
  // Sem width/height → "feed" (fallback seguro: feeds aceitam 1:1 e 4:5).
  function classifyRatio(w: number | null, h: number | null): "vertical" | "feed" {
    if (!w || !h || w <= 0 || h <= 0) return "feed";
    return (h / w) >= 1.6 ? "vertical" : "feed";
  }

  // Constrói object_story_spec single-asset (caminho v12 inalterado).
  function buildSingleAssetCreative(info: CreativeInfo, cta: string, msg: string, title: string, link: string): { creative: Record<string, unknown> | null; aviso?: { codigo: string; detalhe?: string } } {
    const tipoLower = (info.type ?? "").toLowerCase();
    const isImagem = tipoLower === "image";
    const isVideo = tipoLower === "video";

    if (isImagem && info.meta_image_hash) {
      const linkData: Record<string, unknown> = {
        image_hash: info.meta_image_hash,
        message: msg,
        name: title,
        link,
        call_to_action: { type: cta, value: { link } },
      };
      const oss: Record<string, unknown> = { page_id: selectedPageId, link_data: linkData };
      if (selectedInstagramId) oss.instagram_actor_id = selectedInstagramId;
      return { creative: { object_story_spec: oss } };
    }
    if (isVideo && info.meta_video_id) {
      const videoData: Record<string, unknown> = {
        video_id: info.meta_video_id,
        message: msg,
        title,
        call_to_action: { type: cta, value: { link } },
      };
      // image_url/image_hash omitidos de propósito: não temos thumbnail dedicado e o file_url do vídeo é o .mp4 (não serve como imagem). Meta gera a capa automaticamente a partir do video_id. Ver roteiro C4.
      const oss: Record<string, unknown> = { page_id: selectedPageId, video_data: videoData };
      if (selectedInstagramId) oss.instagram_actor_id = selectedInstagramId;
      return { creative: { object_story_spec: oss }, aviso: { codigo: "video_em_processamento", detalhe: "se Graph rejeitar com 'vídeo não pronto', re-publicar mais tarde" } };
    }
    if (info.meta_creative_id) {
      return { creative: { creative_id: info.meta_creative_id }, aviso: { codigo: "copy_e_link_nao_aplicados", detalhe: "criativo reutilizado inteiro" } };
    }
    return { creative: null, aviso: { codigo: "creative_sem_meta_id" } };
  }

  // Constrói o creative multi-placement (asset_feed_spec feed+story do MESMO tipo).
  // BYTE-IGUAL ao bloco asset_feed_spec da v13 — apenas extraído para função.
  function buildMultiPlacementCreative(
    feedInfo: CreativeInfo, vertInfo: CreativeInfo, mediaType: "image" | "video",
    cta: string, msg: string, title: string, link: string,
  ): Record<string, unknown> {
    const LABEL_FEED = "mp_feed";
    const LABEL_STORY = "mp_story";
    const assetFeedSpec: Record<string, unknown> = {
      bodies: [{ text: msg }],
      titles: [{ text: title }],
      link_urls: [{ website_url: link }],
      call_to_action_types: [cta],
      ad_formats: [mediaType === "video" ? "SINGLE_VIDEO" : "SINGLE_IMAGE"],
      asset_customization_rules: [
        {
          customization_spec: {
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["feed"],
            instagram_positions: ["stream"],
          },
          ...(mediaType === "image" ? { image_label: { name: LABEL_FEED } } : { video_label: { name: LABEL_FEED } }),
        },
        {
          customization_spec: {
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["story"],
            instagram_positions: ["story", "reels"],
          },
          ...(mediaType === "image" ? { image_label: { name: LABEL_STORY } } : { video_label: { name: LABEL_STORY } }),
        },
      ],
    };
    if (mediaType === "image") {
      assetFeedSpec.images = [
        { hash: feedInfo.meta_image_hash, adlabels: [{ name: LABEL_FEED }] },
        { hash: vertInfo.meta_image_hash, adlabels: [{ name: LABEL_STORY }] },
      ];
    } else {
      const v1: Record<string, unknown> = { video_id: feedInfo.meta_video_id, adlabels: [{ name: LABEL_FEED }] };
      const v2: Record<string, unknown> = { video_id: vertInfo.meta_video_id, adlabels: [{ name: LABEL_STORY }] };
      assetFeedSpec.videos = [v1, v2];
    }
    return {
      object_story_spec: {
        page_id: selectedPageId,
        ...(selectedInstagramId ? { instagram_actor_id: selectedInstagramId } : {}),
      },
      asset_feed_spec: assetFeedSpec,
    };
  }

  // Agrupa criativos utilizáveis em "ads a criar":
  // - Empareha 1 feed + 1 vertical do MESMO tipo → grupo multi-placement (1 ad com asset_feed_spec).
  // - Sobras de feed/vertical (sem par do mesmo tipo) → cada uma vira grupo single-asset.
  // - "other" (sem hash/video_id mas com meta_creative_id) → cada um vira grupo reused.
  // Ordem determinística pela ordem original em creative_ids.
  type Usable = { cid: string; info: CreativeInfo; tipo: "image" | "video" | "other"; bucket: "vertical" | "feed" };
  type Group =
    | { kind: "multi"; mediaType: "image" | "video"; feed: Usable; vert: Usable }
    | { kind: "single"; pick: Usable }
    | { kind: "reused"; pick: Usable };

  function groupAssets(usable: Usable[]): Group[] {
    const groups: Group[] = [];
    const used = new Set<string>();
    for (const mediaType of ["image", "video"] as const) {
      // Emparelha por ordem: para cada feed do tipo, procura primeiro vertical livre do mesmo tipo.
      const feeds = usable.filter((u) => u.tipo === mediaType && u.bucket === "feed");
      const verts = usable.filter((u) => u.tipo === mediaType && u.bucket === "vertical");
      let vi = 0;
      for (const f of feeds) {
        // avança até próximo vertical livre
        while (vi < verts.length && used.has(verts[vi].cid)) vi++;
        if (vi >= verts.length) break;
        const v = verts[vi++];
        used.add(f.cid); used.add(v.cid);
        groups.push({ kind: "multi", mediaType, feed: f, vert: v });
      }
    }
    // Sobras na ordem original
    for (const u of usable) {
      if (used.has(u.cid)) continue;
      if (u.tipo === "other") groups.push({ kind: "reused", pick: u });
      else groups.push({ kind: "single", pick: u });
    }
    return groups;
  }

  type AdBuild = { payload: Record<string, unknown> | null; aviso?: { codigo: string; detalhe?: string }; avisos_extra?: Array<{ codigo: string; detalhe?: string }> };

  // Publicações promovíveis validadas para o alvo música (preenchido mais abaixo).
  const postRefOk = new Set<string>();
  const postRefBad: string[] = [];

  // url_tags do criativo (só alvo música): UTMs geradas pelo motor.
  // Só há UTMs quando há destino efectivo: sem link, url_tags não vai no payload.
  function urlTagsFor(nomeAd: string, link: string | null): string | null {
    if (!target.utm || !link) return null;
    return `${target.utm}&utm_content=${utmSlug(nomeAd)}`;
  }

  // Devolve UM ARRAY de payloads (1 por grupo). Mantém a semântica anterior em estruturas
  // single (sem regressão nos quentes G=1).
  function buildAdPayloads(adsetIdParaPayload: string, anuncio: any, link: string | null): AdBuild[] {
    const cta = normalizeCta(anuncio.cta || "LEARN_MORE");
    const msg = String(anuncio.corpo ?? "").slice(0, 2000);
    const title = String(anuncio.headline ?? "").slice(0, 200);
    const baseNome = String(anuncio.headline ?? "Anúncio");

    // ── Alvo música: post existente (D-ERP95 F2b). Nunca corre para eventos.
    const ep = isSong ? anuncio?.existing_post : null;
    if (ep && typeof ep.post_ref === "string" && ep.post_ref) {
      const postRef: string = ep.post_ref;
      const kind = ep.kind === "instagram_media" ? "instagram_media" : "object_story";
      if (!postRefOk.has(postRef)) {
        return [{ payload: null, aviso: { codigo: "post_nao_promovivel", detalhe: postRef } }];
      }
      const nomeAdEp = target.naming.prefix + baseNome.slice(0, 200);
      const avisosEp: Array<{ codigo: string; detalhe?: string }> = [];
      let creative: Record<string, unknown>;
      if (kind === "instagram_media") {
        if (!selectedInstagramId) {
          return [{ payload: null, aviso: { codigo: "sem_conta_instagram", detalhe: postRef } }];
        }
        creative = { source_instagram_media_id: postRef, instagram_user_id: selectedInstagramId };
        // CTA com link só faz sentido (e só é aceite) em Tráfego com link.
        if (objetivoUpper === "TRAFFIC" && link) {
          (creative as any).call_to_action = { type: cta, value: { link } };
        }
      } else {
        creative = { object_story_id: postRef };
        if (objetivoUpper === "TRAFFIC") {
          avisosEp.push({ codigo: "cta_nao_aplicada_em_post_existente", detalhe: "publicação de Página é promovida como está — o botão do post original é o que fica" });
        }
      }
      const tags = urlTagsFor(nomeAdEp, link);
      if (tags) (creative as any).url_tags = tags;
      return [{
        payload: { name: nomeAdEp, adset_id: adsetIdParaPayload, status: "PAUSED", creative },
        aviso: { codigo: "post_existente", detalhe: `${kind}:${postRef}` },
        avisos_extra: avisosEp.length > 0 ? avisosEp : undefined,
      }];
    }

    const cids: string[] = Array.isArray(anuncio.creative_ids) ? anuncio.creative_ids.filter((x: any) => typeof x === "string" && x) : [];
    if (cids.length === 0) return [{ payload: null, aviso: { codigo: "creative_sem_id" } }];
    if (!link) return [{ payload: null, aviso: { codigo: "sem_link_destino" } }];


    const usable: Usable[] = [];
    for (const cid of cids) {
      const info = resolvedCreatives.get(cid);
      if (!info) continue;
      const tipoLower = (info.type ?? "").toLowerCase();
      const tipo: "image" | "video" | "other" =
        (tipoLower === "image" && info.meta_image_hash) ? "image" :
        (tipoLower === "video" && info.meta_video_id) ? "video" : "other";
      if (tipo === "other" && !info.meta_creative_id) continue;
      usable.push({ cid, info, tipo, bucket: classifyRatio(info.width, info.height) });
    }
    if (usable.length === 0) return [{ payload: null, aviso: { codigo: "creative_sem_meta_id", detalhe: cids[0] } }];

    const groups = groupAssets(usable);
    const multiCount = groups.length;

    // Guard tecto Meta (50 ads/adset). Truncamos ao limite com aviso.
    const META_MAX_ADS_PER_ADSET = 50;
    let truncated = false;
    let effectiveGroups = groups;
    if (multiCount > META_MAX_ADS_PER_ADSET) {
      effectiveGroups = groups.slice(0, META_MAX_ADS_PER_ADSET);
      truncated = true;
    }

    const out: AdBuild[] = [];
    const G = effectiveGroups.length;
    for (let gi = 0; gi < G; gi++) {
      const g = effectiveGroups[gi];
      const sufixo = G > 1 ? ` · g${gi + 1}` : "";
      // headline limitado a 180 quando há sufixo para caber "· gN".
      const nomeAd = target.naming.prefix + (G > 1 ? baseNome.slice(0, 180) : baseNome.slice(0, 200)) + sufixo;
      const avisosExtra: Array<{ codigo: string; detalhe?: string }> = [];
      if (truncated && gi === G - 1) {
        avisosExtra.push({ codigo: "ads_truncados_limite_meta", detalhe: `gerados ${multiCount} grupos; truncado a ${META_MAX_ADS_PER_ADSET}` });
      }
      // Alvo música: UTMs geradas pelo motor (no evento fica null e nada é acrescentado).
      const tags = urlTagsFor(nomeAd, link);

      if (g.kind === "multi") {
        const creative = buildMultiPlacementCreative(g.feed.info, g.vert.info, g.mediaType, cta, msg, title, link);
        if (tags) (creative as any).url_tags = tags;
        out.push({
          payload: { name: nomeAd, adset_id: adsetIdParaPayload, status: "PAUSED", creative },
          aviso: { codigo: "multiformato_asset_feed_spec", detalhe: `media=${g.mediaType}; feed=${g.feed.cid}; vertical=${g.vert.cid}` },
          avisos_extra: avisosExtra.length > 0 ? avisosExtra : undefined,
        });
      } else {
        // single ou reused → ambos passam por buildSingleAssetCreative (que decide o caminho certo)
        const { creative, aviso } = buildSingleAssetCreative(g.pick.info, cta, msg, title, link);
        if (!creative) {
          out.push({ payload: null, aviso: aviso ?? { codigo: "creative_sem_meta_id", detalhe: g.pick.cid }, avisos_extra: avisosExtra.length > 0 ? avisosExtra : undefined });
          continue;
        }
        if (tags) (creative as any).url_tags = tags;
        out.push({
          payload: { name: nomeAd, adset_id: adsetIdParaPayload, status: "PAUSED", creative },
          aviso,
          avisos_extra: avisosExtra.length > 0 ? avisosExtra : undefined,
        });
      }
    }
    return out;
  }

  // ─── ALVO MÚSICA: teto, posts promovíveis, registo, espelho, preflight ──
  // (D-ERP95 F2b). Nada aqui corre para planos de evento.
  // O teto vive em _shared/artist-ads-teto.ts (D-ERP95 F3): a MESMA regra é
  // usada pela publicação, pela activação e pelo entity-action.
  async function checkTeto(): Promise<TetoInfo> {
    return await checkTetoPlano(admin as any, {
      connectionId: connectionId!,
      moeda: planRow.moeda,
      adsets,
      usaLifetime,
      diasJanela,
      planId: planId!,
    });
  }

  async function logCreate(entity: "campaign" | "adset" | "ad", externalId: string, nome: string): Promise<void> {
    const { error } = await (admin as any).schema("crm").from("meta_entity_actions_log").insert({
      company_id: planRow.company_id,
      connection_id: connectionId,
      ad_account_id: adAccountId,
      entity_type: entity,
      external_id: externalId,
      entity_name: nome || null,
      action: "create",
      new_status: "PAUSED",
      updates_jsonb: { plan_id: planId, alvo: "song", song_id: (planRow as any).song_id, artist_id: (planRow as any).artist_id },
      success: true,
      performed_by: callerUserId,
    });
    if (error) avisos.push({ codigo: "registo_acao_falhou", detalhe: error.message });
  }

  async function upsertSongSnapshot(campaignId: string): Promise<void> {
    const { error } = await (admin as any).schema("crm").from("meta_campaign_snapshot").upsert({
      connection_id: connectionId,
      company_id: planRow.company_id,
      ad_account_id: adAccountId,
      external_campaign_id: campaignId,
      name: campaignPayload.name,
      status: "PAUSED",
      effective_status: "PAUSED",
      objective: campaignPayload.objective,
      currency: target.currency ?? "EUR",
      start_time: planStartTime,
      stop_time: planEndTime,
      raw: { created_by: "crm-meta-publish-execute", plan_id: planId },
      last_synced_at: new Date().toISOString(),
      linked_song_id: (planRow as any).song_id,
      linked_song_locked: true,
    }, { onConflict: "connection_id,external_campaign_id" });
    if (error) avisos.push({ codigo: "espelho_campanha_falhou", detalhe: error.message });
  }

  // Posts existentes referidos no plano × o que é promovível para este artista.
  let tetoInfo: TetoInfo | null = null;
  const postRefsPlano: string[] = [];
  if (isSong) {
    for (const a of adsets) {
      for (const an of (a?.anuncios ?? [])) {
        const pr = an?.existing_post?.post_ref;
        if (typeof pr === "string" && pr && !postRefsPlano.includes(pr)) postRefsPlano.push(pr);
      }
    }
    if (postRefsPlano.length > 0) {
      const { data: promo, error: promoErr } = await admin.rpc("artist_ads_promotable_posts", { p_artist_id: (planRow as any).artist_id });
      if (promoErr) return json({ ok: false, error: "posts_promoviveis_falhou", detail: promoErr.message }, 500);
      for (const row of ((promo ?? []) as any[])) {
        if (row?.post_ref && row?.meta_ready === true) postRefOk.add(String(row.post_ref));
      }
      for (const pr of postRefsPlano) if (!postRefOk.has(pr)) postRefBad.push(pr);
      if (postRefBad.length > 0 && !dryRun && !preflight) {
        return json({
          ok: false, error: "post_nao_promovivel", posts: postRefBad,
          message: "Há publicações no plano que não constam das publicações promovíveis do artista (ou cujo identificador não é utilizável pela Marketing API).",
        }, 422);
      }
      if (postRefBad.length > 0) avisos.push({ codigo: "post_nao_promovivel", detalhe: postRefBad.join(", ") });
    }

    // Geografia obrigatória no alvo música: sem país, o motor recusa.
    const semGeoAdsets = (adsets as any[]).filter((a) => !temGeo(a)).map((a) => a?.trigger_nome ?? null);
    if (semGeoAdsets.length > 0) {
      if (!dryRun) {
        return json({
          ok: false, error: "sem_geografia", adset: semGeoAdsets,
          message: "Cada conjunto de uma campanha de música tem de indicar pelo menos um país em publico_sugerido.geo (ex.: [\"BR\"]).",
        }, 422);
      }
      for (const nome of semGeoAdsets) avisos.push({ codigo: "sem_geografia", adset: nome });
    }

    tetoInfo = await checkTeto();
    if (!tetoInfo.ok) {
      if (!dryRun && !preflight) {
        return json({ ok: false, error: tetoInfo.error, teto: tetoInfo.teto, pedido: tetoInfo.pedido, ja_comprometido: tetoInfo.ja_comprometido, moeda: tetoInfo.moeda }, 422);
      }
      avisos.push({ codigo: tetoInfo.error!, detalhe: JSON.stringify(tetoInfo) });
    }
  }

  // ─── PREFLIGHT (só GETs; não escreve na Meta nem no plano) ───────────
  if (preflight) {
    const checks: Array<{ check: string; ok: boolean; detail?: string }> = [];
    const me = await graphGET("/me", { fields: "id,name" }, accessToken);
    checks.push({ check: "token_valido", ok: me.ok, detail: me.ok ? String(me.data?.name ?? me.data?.id ?? "") : JSON.stringify(me.data?.error ?? me.data) });
    const perms = await graphGET("/me/permissions", {}, accessToken);
    const granted = new Set<string>(((perms.data?.data ?? []) as any[]).filter((p) => p?.status === "granted").map((p) => String(p.permission)));
    checks.push({ check: "scope_ads_management", ok: granted.has("ads_management"), detail: granted.size > 0 ? Array.from(granted).join(",") : "sem lista de permissões" });
    const acc = await graphGET(`/${adAccountId}`, { fields: "account_status,currency,name" }, accessToken);
    checks.push({ check: "conta_activa", ok: acc.ok && Number(acc.data?.account_status) === 1, detail: acc.ok ? `status=${acc.data?.account_status} ${acc.data?.name ?? ""}` : JSON.stringify(acc.data?.error ?? acc.data) });
    const moedaPlano = String(planRow.moeda ?? "").toUpperCase();
    checks.push({ check: "moeda_da_conta", ok: acc.ok && String(acc.data?.currency ?? "").toUpperCase() === moedaPlano, detail: `conta=${acc.data?.currency ?? "?"} plano=${moedaPlano || "?"}` });
    if (selectedPageId) {
      const pg = await graphGET(`/${selectedPageId}`, { fields: "id,name" }, accessToken);
      checks.push({ check: "pagina_acessivel", ok: pg.ok, detail: pg.ok ? `${selectedPageId} ${pg.data?.name ?? ""}` : JSON.stringify(pg.data?.error ?? pg.data) });
    } else {
      checks.push({ check: "pagina_acessivel", ok: false, detail: "sem Página de Facebook determinada" });
    }
    checks.push({ check: "instagram_resolvido", ok: !!selectedInstagramId, detail: selectedInstagramId ?? "não resolvido" });
    // Criativos reutilizados (D-ERP106): o criativo do gestor externo traz a
    // Página/Instagram do dono. Se não for a da ligação, a publicação sai com
    // outra identidade — o preflight compara e avisa antes de publicar.
    for (const [uuid, info] of resolvedCreatives) {
      if (!info.meta_creative_id || info.meta_image_hash || info.meta_video_id) continue;
      const cr = await graphGET(
        `/${info.meta_creative_id}`,
        { fields: "id,object_story_spec{page_id,instagram_actor_id,instagram_user_id},effective_object_story_id" },
        accessToken,
      );
      if (!cr.ok) {
        checks.push({
          check: `criativo_owner_${uuid}`,
          ok: true,
          detail: `aviso: não foi possível ler o criativo ${info.meta_creative_id} — ${JSON.stringify(cr.data?.error ?? cr.data).slice(0, 300)}`,
        });
        continue;
      }
      const spec = (cr.data?.object_story_spec ?? {}) as any;
      const pageDoCriativo = spec.page_id ? String(spec.page_id) : null;
      const igDoCriativo = spec.instagram_actor_id
        ? String(spec.instagram_actor_id)
        : (spec.instagram_user_id ? String(spec.instagram_user_id) : null);
      const pageDifere = !!pageDoCriativo && !!selectedPageId && pageDoCriativo !== String(selectedPageId);
      const igDifere = !!igDoCriativo && !!selectedInstagramId && igDoCriativo !== String(selectedInstagramId);
      const detalhe = `criativo=${info.meta_creative_id} pagina=${pageDoCriativo ?? "?"} instagram=${igDoCriativo ?? "?"}` +
        ` | ligacao pagina=${selectedPageId ?? "?"} instagram=${selectedInstagramId ?? "?"}` +
        (pageDifere ? " — PÁGINA DIFERENTE da ligação" : "") +
        (igDifere ? " — INSTAGRAM DIFERENTE da ligação" : "") +
        (!pageDoCriativo && !igDoCriativo ? " — sem identidade no criativo (aviso)" : "");
      checks.push({ check: `criativo_owner_${uuid}`, ok: !(pageDifere || igDifere), detail: detalhe });
    }
    if (isSong) {
      for (const pr of postRefsPlano) {
        let okPost = postRefOk.has(pr);
        let detalhe = okPost ? "promovível" : "não consta das publicações promovíveis do artista ou o identificador não é utilizável pela Marketing API";
        if (okPost) {
          const g = await graphGET(`/${pr}`, { fields: "id" }, accessToken);
          okPost = g.ok;
          if (!g.ok) detalhe = JSON.stringify(g.data?.error ?? g.data);
        }
        checks.push({ check: `post_${pr}`, ok: okPost, detail: detalhe });
      }
      // Geografia: o preflight tem de ser fiel à publicação real (F3).
      const semGeoPre = (adsets as any[]).filter((a) => !temGeo(a)).map((a) => a?.trigger_nome ?? "?");
      checks.push({
        check: "geografia",
        ok: semGeoPre.length === 0,
        detail: semGeoPre.length === 0
          ? "todos os conjuntos têm país em publico_sugerido.geo"
          : `sem país: ${semGeoPre.join(", ")}`,
      });
      checks.push({ check: "teto", ok: !!tetoInfo?.ok, detail: JSON.stringify(tetoInfo) });
    }
    const tudoOk = checks.every((c) => c.ok);
    return json({ ok: tudoOk, preflight: true, alvo: target.kind, ad_account_id: adAccountId, checks }, tudoOk ? 200 : 422);
  }


  // ─── DRY-RUN ─────────────────────────────────────────────────────────
  if (dryRun) {
    const dryAdsets: any[] = [];
    const dryAds: any[] = [];
    for (let i = 0; i < adsets.length; i++) {
      const a = adsets[i];
      const linkEf = resolveLink(a);
      const { payload: adsetPayload, goal_used, sem_pixel, budget_mode, abaixo_minimo } = buildAdsetPayload(a, "<CAMPAIGN_ID>", i);
      if (sem_pixel) avisos.push({ codigo: "sem_pixel_para_conversoes", adset: a.trigger_nome, detalhe: "objetivo Vendas exige meta_pixel_id no evento" });
      if (abaixo_minimo) avisos.push({ codigo: "orcamento_abaixo_minimo", adset: a.trigger_nome, detalhe: `${budget_mode}=${abaixo_minimo.orcamento_cents} cents < mínimo ${abaixo_minimo.minimo_cents} cents (janela ${diasJanela} dia(s))` });
      dryAdsets.push({ trigger_nome: a.trigger_nome, optimization_goal_used: goal_used, budget_mode, link_destino_efetivo: linkEf, payload: adsetPayload });
      for (let k = 0; k < (a.anuncios ?? []).length; k++) {
        const an = a.anuncios[k];
        if (!linkEf && !(isSong && an?.existing_post)) {
          avisos.push({ codigo: "sem_link_destino", adset: a.trigger_nome, ad_idx: k });
          continue;
        }
        const builds = buildAdPayloads("<ADSET_ID>", an, linkEf);
        for (let gi = 0; gi < builds.length; gi++) {
          const { payload, aviso, avisos_extra } = builds[gi];
          if (aviso) avisos.push({ ...aviso, adset: a.trigger_nome, ad_idx: k, group_idx: gi });
          if (avisos_extra) for (const ax of avisos_extra) avisos.push({ ...ax, adset: a.trigger_nome, ad_idx: k, group_idx: gi });
          if (payload) dryAds.push({ adset: a.trigger_nome, ad_idx: k, group_idx: gi, payload });
        }
      }
    }
    return json({
      ok: true,
      dry_run: true,
      estado_plano: planRow.estado,
      ad_account_id: adAccountId,
      janela: { start_time: planStartTime, end_time: planEndTime, dias: diasJanela, budget_mode: usaLifetime ? "lifetime" : "daily" },
      payloads: {
        campaign: campaignPayload,
        adsets: dryAdsets,
        ads: dryAds,
      },
      resolved_creative_ids: Object.fromEntries(resolvedCreatives),
      avisos,
      // Campos extra só no alvo música: a resposta de evento fica intacta.
      ...(isSong ? { alvo: "song", teto: tetoInfo, naming: target.naming, utm: target.utm } : {}),
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

  // Pré-check: orçamentos por adset abaixo do mínimo (lifetime ou daily). Falha cedo com lista clara.
  const adsetsAbaixoMin: Array<{ adset: string; orcamento_cents: number; minimo_cents: number; modo: string }> = [];
  for (const a of (adsets as any[])) {
    const orc = Math.max(0, Number(a.orcamento_cents ?? 0));
    if (usaLifetime) {
      if (orc < MIN_LIFETIME_CENTS) adsetsAbaixoMin.push({ adset: a.trigger_nome, orcamento_cents: orc, minimo_cents: MIN_LIFETIME_CENTS, modo: "lifetime" });
    } else {
      if (orc < MIN_DAILY_CENTS) adsetsAbaixoMin.push({ adset: a.trigger_nome, orcamento_cents: orc, minimo_cents: MIN_DAILY_CENTS, modo: "daily" });
    }
  }
  if (adsetsAbaixoMin.length > 0) {
    return json({
      error: "orcamento_abaixo_minimo",
      message: `Algum(s) adset(s) têm orçamento abaixo do mínimo Meta (${usaLifetime ? `lifetime min ≈ ${MIN_LIFETIME_CENTS} cents para janela de ${diasJanela} dia(s)` : `daily min ≈ ${MIN_DAILY_CENTS} cents`}). Aumenta o total ou redistribui os pesos.`,
      adsets: adsetsAbaixoMin,
      janela: { start_time: planStartTime, end_time: planEndTime, dias: diasJanela, budget_mode: usaLifetime ? "lifetime" : "daily" },
    }, 412);
  }


  // Estado: a_publicar
  if (isSong) {
    // Lock anti-corrida (só alvo música nesta fase — padrão do crm-google-publish-execute).
    const lockCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: locked, error: lockErr } = await (admin as any)
      .schema("crm").from("meta_publish_plan")
      .update({ estado: "a_publicar", publish_error: null, publish_started_at: new Date().toISOString() })
      .eq("id", planId)
      .or(`estado.neq.a_publicar,publish_started_at.lt.${lockCutoff}`)
      .select("id");
    if (lockErr) return json({ ok: false, error: "lock_falhou", detail: lockErr.message }, 500);
    if (!locked || locked.length === 0) {
      return json({ error: "ja_em_publicacao", message: "Publicação já em curso — espera que termine antes de tentar de novo." }, 409);
    }
  } else {
    await (admin as any).schema("crm").from("meta_publish_plan")
      .update({ estado: "a_publicar", publish_error: null, publish_started_at: new Date().toISOString() }).eq("id", planId);
  }

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
    // Alvo música: espelho + trinco da ligação à música, sem esperar pelo cron.
    if (isSong) {
      await upsertSongSnapshot(metaCampaignId);
      await logCreate("campaign", metaCampaignId, campaignPayload.name);
    }
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
      const { payload, goal_used } = buildAdsetPayload(a, metaCampaignId!, i);
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
      if (isSong) await logCreate("adset", metaAdsetId, String((payload as any)?.name ?? ""));
    }

    // Ads
    const adsIds: string[] = [];
    const linkEf = resolveLink(a);
    // Alvo música: adsets cujos anúncios são posts existentes não precisam de link.
    const temPostExistente = isSong && (a.anuncios ?? []).some((x: any) => x?.existing_post);
    if (!linkEf && !temPostExistente) {
      avisos.push({ codigo: "sem_link_destino", adset: a.trigger_nome });
      respAdsets.push({ trigger_nome: a.trigger_nome, meta_adset_id: metaAdsetId!, ads: adsIds });
      continue;
    }
    for (let k = 0; k < a.anuncios.length; k++) {
      const an = a.anuncios[k];
      // Idempotência: meta_ad_ids (novo, array) > meta_ad_id (legado, single).
      const jaCriados: string[] = Array.isArray(an.meta_ad_ids) ? an.meta_ad_ids.filter((x: any) => typeof x === "string" && x) : [];
      const builds = buildAdPayloads(metaAdsetId!, an, linkEf);
      // Se já tem ads criados e a contagem bate com os grupos actuais → skip total.
      if (jaCriados.length > 0 && jaCriados.length >= builds.length) {
        for (const id of jaCriados) adsIds.push(id);
        continue;
      }
      // Legado: meta_ad_id single + sem meta_ad_ids → assume 1 ad já criado (grupo 0).
      const seedLegado = (!an.meta_ad_ids && an.meta_ad_id) ? [an.meta_ad_id as string] : [...jaCriados];
      const criados: string[] = [...seedLegado];
      for (let gi = 0; gi < builds.length; gi++) {
        if (criados[gi]) { adsIds.push(criados[gi]); continue; }
        const { payload, aviso, avisos_extra } = builds[gi];
        if (aviso) avisos.push({ ...aviso, adset: a.trigger_nome, ad_idx: k, group_idx: gi });
        if (avisos_extra) for (const ax of avisos_extra) avisos.push({ ...ax, adset: a.trigger_nome, ad_idx: k, group_idx: gi });
        if (!payload) continue;
        const r = await graphPOST(`/${adAccountId}/ads`, payload, accessToken);
        if (!r.ok) {
          an.meta_ad_ids = criados;
          await (admin as any).schema("crm").from("meta_publish_plan")
            .update({ adsets: adsetsOut }).eq("id", planId);
          return await failAndStop("create_ad", r.error ?? { message: `HTTP ${r.status}` }, { adset: a.trigger_nome, ad_idx: k, group_idx: gi, raw: r.raw });
        }
        const novoId = r.data.id as string;
        criados[gi] = novoId;
        adsIds.push(novoId);
        an.meta_ad_ids = criados;
        if (gi === 0) an.meta_ad_id = novoId; // back-compat
        await (admin as any).schema("crm").from("meta_publish_plan")
          .update({ adsets: adsetsOut }).eq("id", planId);
        if (isSong) await logCreate("ad", novoId, String((payload as any)?.name ?? ""));
      }
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
