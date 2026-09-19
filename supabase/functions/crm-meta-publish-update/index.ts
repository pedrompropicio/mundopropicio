// crm-meta-publish-update (D-ERP99)
// POST { company_id, plan_id, alteracoes, dry_run?, triggered_by?, reason_text? }
//
// EDIÇÃO de campanhas Meta JÁ PUBLICADAS com alvo MÚSICA (crm.meta_publish_plan
// com artist_id + song_id). Ao contrário de crm-meta-entity-action (acção de
// baixo nível por id externo), esta função parte do PLANO: resolve a campanha,
// os conjuntos e os anúncios, calcula o diff, re-verifica o teto da ligação de
// artista e mantém crm.meta_publish_plan em sincronia com o que a Meta aceitou.
//
// NUNCA muda estado de entrega (activar/pausar continua em
// crm-meta-publish-activate) e NUNCA toca em planos de evento.
//
// dry_run por omissão TRUE: zero pedidos de escrita à Graph API.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { committedDaily } from "../_shared/artist-ads-teto.ts";

const GRAPH_API_VERSION = "v18.0"; // mesma de crm-meta-publish-execute:31
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

function recusa(codigo: string, msg: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, codigo, error_user_msg: msg, ...extra }, 422);
}

function jwtRole(auth: string | null): string | null {
  try {
    const t = (auth ?? "").replace(/^Bearer\s+/i, "");
    return JSON.parse(atob(t.split(".")[1] ?? ""))?.role ?? null;
  } catch {
    return null;
  }
}

async function metaGet(path: string, token: string, fields: string): Promise<any> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.message ?? `Meta GET ${r.status}`);
  return j;
}

async function metaPost(path: string, token: string, params: Record<string, string>): Promise<any> {
  const r = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`, {
    method: "POST",
    body: new URLSearchParams({ ...params, access_token: token }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.message ?? `Meta POST ${r.status}`);
  return j;
}

const diasEntre = (a: string, b: string) =>
  Math.max(1, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000));

type Resultado = {
  nivel: "campanha" | "conjunto" | "anuncio";
  external_id: string | null;
  campos: string[];
  antes: Record<string, unknown>;
  depois: Record<string, unknown>;
  ok: boolean;
  erro?: string;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, codigo: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, codigo: "sessao_invalida", error_user_msg: "Sessão inválida." }, 401);
  if (jwtRole(authHeader) === "service_role") {
    return json({
      ok: false,
      codigo: "service_role_nao_edita",
      error_user_msg: "A edição de campanhas de música exige sessão de utilizador.",
    }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, codigo: "invalid_json" }, 400);
  }

  const companyIdIn: string | undefined = body?.company_id;
  const planId: string | undefined = body?.plan_id;
  const alteracoes = body?.alteracoes ?? {};
  const dryRun: boolean = body?.dry_run !== false; // omissão TRUE
  const triggeredBy: string = ["user_manual", "cron_auto", "ai_suggestion"].includes(body?.triggered_by)
    ? body.triggered_by
    : "user_manual";
  const reasonText: string | null = typeof body?.reason_text === "string" ? body.reason_text.slice(0, 2000) : null;

  if (!companyIdIn || !planId) {
    return json({ ok: false, codigo: "missing_params", error_user_msg: "Faltam company_id e plan_id." }, 400);
  }

  // ── Fora de âmbito: recusa legível, sem tentar nada ────────────────────────
  if (alteracoes.objetivo !== undefined || alteracoes.buying_type !== undefined) {
    return recusa("exige_campanha_nova", "Mudar o objectivo ou o tipo de compra exige uma campanha nova.");
  }
  if (alteracoes.criativo !== undefined || alteracoes.publicacao !== undefined || alteracoes.anuncios !== undefined) {
    return recusa("nao_suportado_ainda", "Trocar a publicação ou o criativo do anúncio ainda não é possível por aqui.");
  }
  if (alteracoes.estado !== undefined || alteracoes.status !== undefined) {
    return recusa("usar_publish_activate", "Activar ou pausar faz-se no botão de activação, não na edição.");
  }

  const pedeNome = typeof alteracoes.nome === "string" && alteracoes.nome.trim().length > 0;
  const pedeOrc = alteracoes.orcamento && typeof alteracoes.orcamento === "object";
  const pedeDatas = alteracoes.datas && typeof alteracoes.datas === "object";
  const pedeGeo = alteracoes.geografia && Array.isArray(alteracoes.geografia.geo);
  const pedeIdades = alteracoes.idades && typeof alteracoes.idades === "object";
  if (!pedeNome && !pedeOrc && !pedeDatas && !pedeGeo && !pedeIdades) {
    return recusa("sem_alteracoes", "Não há nada para alterar.");
  }
  if (pedeOrc) {
    const tipo = alteracoes.orcamento.tipo;
    if (tipo !== "diario" && tipo !== "vitalicio") {
      return recusa("orcamento_invalido", "O tipo de orçamento tem de ser diário ou vitalício.");
    }
    if (!Number.isFinite(alteracoes.orcamento.total_cents) || alteracoes.orcamento.total_cents <= 0) {
      return recusa("orcamento_invalido", "O valor do orçamento não é válido.");
    }
  }
  if (pedeIdades) {
    const { idade_min, idade_max } = alteracoes.idades;
    if (!Number.isFinite(idade_min) || !Number.isFinite(idade_max) || idade_min < 13 || idade_max > 65 || idade_min > idade_max) {
      return recusa("idades_invalidas", "As idades têm de estar entre 13 e 65, com o mínimo abaixo do máximo.");
    }
  }
  if (pedeGeo && !alteracoes.geografia.geo.some((x: any) => typeof x === "string" && x.trim())) {
    return recusa("geografia_invalida", "A geografia não pode ficar vazia.");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ ok: false, codigo: "sessao_invalida", error_user_msg: "Sessão inválida." }, 401);
  }
  const userId = userData.user.id;

  // ── 1) Plano ───────────────────────────────────────────────────────────────
  const { data: plan, error: planErr } = await (supabase as any)
    .schema("crm").from("meta_publish_plan")
    .select("id, company_id, event_id, artist_id, song_id, connection_id, estado, moeda, objetivo, orcamento_total_cents, start_time, end_time, adsets, meta_campaign_id")
    .eq("id", planId)
    .maybeSingle();
  if (planErr) return json({ ok: false, codigo: "plan_query_failed", error_user_msg: planErr.message }, 500);
  if (!plan) return json({ ok: false, codigo: "plano_nao_encontrado", error_user_msg: "Plano não encontrado." }, 404);
  if (plan.company_id !== companyIdIn) {
    return json({ ok: false, codigo: "company_mismatch", error_user_msg: "Plano de outra empresa." }, 403);
  }
  if (!plan.artist_id || !plan.song_id) {
    return recusa("alvo_nao_suportado", "Esta edição só existe para campanhas de música.");
  }
  if (!["publicado", "ativo", "pausado"].includes(String(plan.estado))) {
    return recusa("estado_nao_editavel", `Um plano em "${plan.estado}" não se edita — publica-o primeiro.`, { estado: plan.estado });
  }
  if (!plan.meta_campaign_id) {
    return recusa("plano_sem_campanha", "Este plano ainda não tem campanha no Meta.");
  }

  const adsetsPlano: any[] = Array.isArray(plan.adsets) ? JSON.parse(JSON.stringify(plan.adsets)) : [];
  const adsetsComId = adsetsPlano.filter((a) => typeof a?.meta_adset_id === "string" && a.meta_adset_id);

  // ── 2) Janela resultante e modo de orçamento pedido ────────────────────────
  const novoStart: string | null = pedeDatas && typeof alteracoes.datas.start_time === "string" ? alteracoes.datas.start_time : null;
  const novoEnd: string | null = pedeDatas && typeof alteracoes.datas.end_time === "string" ? alteracoes.datas.end_time : null;
  const startFinal = novoStart ?? plan.start_time ?? null;
  const endFinal = novoEnd ?? plan.end_time ?? null;
  if (startFinal && endFinal && new Date(endFinal).getTime() <= new Date(startFinal).getTime()) {
    return recusa("janela_invalida", "A data de fim tem de ser depois da data de início.");
  }
  const tipoPedido: "diario" | "vitalicio" | null = pedeOrc ? alteracoes.orcamento.tipo : null;
  const modoAtual: "diario" | "vitalicio" = plan.end_time ? "vitalicio" : "diario";
  const modoFinal: "diario" | "vitalicio" = tipoPedido ?? (endFinal ? "vitalicio" : "diario");
  const dias = modoFinal === "vitalicio" && startFinal && endFinal ? diasEntre(startFinal, endFinal) : 1;
  if (modoFinal === "vitalicio" && !(startFinal && endFinal)) {
    return recusa("vitalicio_sem_janela", "Um orçamento vitalício exige data de início e de fim.");
  }

  // ── 3) Papéis ──────────────────────────────────────────────────────────────
  // Alonga a janela de um vitalício → conta como aumento de gasto.
  const alongaVitalicio = modoFinal === "vitalicio" && !!plan.end_time && !!endFinal &&
    new Date(endFinal).getTime() > new Date(plan.end_time).getTime();
  const precisaAdmin = !!pedeOrc || alongaVitalicio || modoFinal !== modoAtual;
  const guard = precisaAdmin ? "artist_ads_assert_cap_admin" : "artist_ads_assert_write";
  const { error: roleErr } = await supabase.rpc(guard, { p_company_id: plan.company_id });
  if (roleErr) {
    return recusa(
      "sem_permissao",
      precisaAdmin
        ? "Só um administrador pode alterar o orçamento ou alongar a janela desta campanha."
        : "Sem permissão para editar campanhas desta conta de artista.",
    );
  }

  // ── 4) Token + moeda da ligação ────────────────────────────────────────────
  const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: plan.connection_id,
    p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ ok: false, codigo: "token_failed", error_user_msg: "Não foi possível usar a ligação Meta deste artista." }, 403);
  }
  const { access_token: token, company_id: companyId } = tokenRows[0] as { access_token: string; company_id: string };

  // ── 5) Estado actual no Meta ───────────────────────────────────────────────
  let campanhaMeta: any;
  const adsetsMeta: Record<string, any> = {};
  try {
    campanhaMeta = await metaGet(
      String(plan.meta_campaign_id),
      token,
      "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time",
    );
    for (const a of adsetsComId) {
      adsetsMeta[a.meta_adset_id] = await metaGet(
        String(a.meta_adset_id),
        token,
        "id,name,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,targeting",
      );
    }
  } catch (e) {
    return json({
      ok: false,
      error_user_msg: `O Meta não respondeu à leitura da campanha: ${(e as Error).message}`,
      resultado: [],
    }, 200);
  }
  const campanhaTemOrcamento = Number(campanhaMeta?.daily_budget ?? 0) > 0 || Number(campanhaMeta?.lifetime_budget ?? 0) > 0; // CBO

  // ── 6) Orçamento novo por objecto ──────────────────────────────────────────
  const avisos: Array<{ codigo: string; detalhe?: string }> = [];
  const totalPedido = pedeOrc ? Math.round(alteracoes.orcamento.total_cents) : null;
  // Distribuição: proporcional ao orçamento actual de cada conjunto; se não
  // houver referência, parte igual.
  const orcAtualPorAdset: Record<string, number> = {};
  for (const a of adsetsComId) {
    const m = adsetsMeta[a.meta_adset_id];
    orcAtualPorAdset[a.meta_adset_id] = Number(m?.daily_budget ?? 0) || Number(m?.lifetime_budget ?? 0) ||
      Math.max(0, Number(a?.orcamento_cents ?? 0));
  }
  const somaAtual = Object.values(orcAtualPorAdset).reduce((s, v) => s + v, 0);
  const novoOrcPorAdset: Record<string, number> = {};
  if (totalPedido !== null && !campanhaTemOrcamento) {
    const n = adsetsComId.length || 1;
    for (const a of adsetsComId) {
      const parte = somaAtual > 0
        ? Math.round(totalPedido * (orcAtualPorAdset[a.meta_adset_id] / somaAtual))
        : Math.floor(totalPedido / n);
      novoOrcPorAdset[a.meta_adset_id] = Math.max(modoFinal === "vitalicio" ? 100 * dias : 100, parte);
    }
  }

  // Trocar diário↔vitalício num conjunto que já está a entregar → campanha nova.
  if (modoFinal !== modoAtual) {
    const agora = Date.now();
    for (const a of adsetsComId) {
      const m = adsetsMeta[a.meta_adset_id];
      const arrancou = m?.start_time ? new Date(m.start_time).getTime() <= agora : false;
      const aEntregar = String(m?.effective_status ?? m?.status ?? "") === "ACTIVE";
      if (arrancou || aEntregar) {
        return recusa(
          "exige_campanha_nova",
          "Trocar entre orçamento diário e vitalício num conjunto que já está a entregar exige uma campanha nova.",
        );
      }
    }
  }

  // ── 7) Teto (só quando o gasto muda) ───────────────────────────────────────
  if (pedeOrc || alongaVitalicio) {
    const { data: capRows, error: capErr } = await supabase.rpc("artist_ads_budget_cap_get", { p_artist_id: plan.artist_id });
    const cap = (Array.isArray(capRows) ? capRows : []).find(
      (r: any) => r?.connection_id === plan.connection_id,
    );
    if (capErr || !cap) {
      return recusa("sem_teto", "Esta conta de artista não tem teto de orçamento definido.");
    }
    const moedaTeto = String((cap as any).account_currency ?? "").toUpperCase();
    const moedaPlano = String(plan.moeda ?? "").toUpperCase();
    if (moedaPlano && moedaTeto && moedaPlano !== moedaTeto) {
      return recusa("moeda_diferente_do_teto", "A moeda do plano não é a do teto desta conta.");
    }
    const totalFinalCents = totalPedido !== null
      ? totalPedido
      : Object.values(orcAtualPorAdset).reduce((s, v) => s + v, 0);
    const pedidoDiario = (modoFinal === "vitalicio" ? totalFinalCents / dias : totalFinalCents) / 100;
    const outros = await committedDaily(supabase as any, plan.connection_id, plan.id);
    const teto = Number((cap as any).daily_cap);
    if (pedidoDiario + outros > teto + 1e-9) {
      return recusa(
        "acima_do_teto",
        `Acima do teto diário (${teto} ${moedaTeto}): pedido ${pedidoDiario.toFixed(2)}, já comprometido por outros planos ${outros.toFixed(2)}, disponível ${(teto - outros).toFixed(2)}.`,
        { teto, pedido: pedidoDiario, ja_comprometido: outros, disponivel: teto - outros, moeda: moedaTeto },
      );
    }
  }

  // ── 8) Diff por objecto ────────────────────────────────────────────────────
  const nomeBase = pedeNome ? String(alteracoes.nome).trim() : null;
  const resultado: Resultado[] = [];

  // Campanha
  const campParams: Record<string, string> = {};
  const campAntes: Record<string, unknown> = {};
  const campDepois: Record<string, unknown> = {};
  if (nomeBase && nomeBase !== campanhaMeta?.name) {
    campParams.name = nomeBase;
    campAntes.name = campanhaMeta?.name ?? null;
    campDepois.name = nomeBase;
  }
  if (totalPedido !== null) {
    if (campanhaTemOrcamento) {
      if (modoFinal === "vitalicio") {
        campParams.lifetime_budget = String(totalPedido);
        campAntes.lifetime_budget_cents = Number(campanhaMeta?.lifetime_budget ?? 0) || null;
        campDepois.lifetime_budget_cents = totalPedido;
      } else {
        campParams.daily_budget = String(totalPedido);
        campAntes.daily_budget_cents = Number(campanhaMeta?.daily_budget ?? 0) || null;
        campDepois.daily_budget_cents = totalPedido;
      }
    } else {
      avisos.push({ codigo: "orcamento_nos_conjuntos", detalhe: "A campanha não tem orçamento próprio; o valor foi distribuído pelos conjuntos." });
    }
  }
  const campCampos = Object.keys(campDepois);
  if (campCampos.length > 0) {
    resultado.push({
      nivel: "campanha",
      external_id: String(plan.meta_campaign_id),
      campos: campCampos,
      antes: campAntes,
      depois: campDepois,
      ok: dryRun,
    });
  }

  // Conjuntos
  type AdsetPlano = { idx: number; id: string; params: Record<string, string>; antes: any; depois: any; campos: string[]; targeting?: any; geo?: string[]; idades?: { min: number; max: number } };
  const adsetPlanos: AdsetPlano[] = [];
  const agora = Date.now();
  for (let i = 0; i < adsetsPlano.length; i++) {
    const a = adsetsPlano[i];
    if (!a?.meta_adset_id) continue;
    const m = adsetsMeta[a.meta_adset_id];
    const params: Record<string, string> = {};
    const antes: Record<string, unknown> = {};
    const depois: Record<string, unknown> = {};
    const nomeAdset = nomeBase ? `${nomeBase} — ${a.trigger_nome ?? `Conjunto ${i + 1}`}` : null;
    if (nomeAdset && nomeAdset !== m?.name) {
      params.name = nomeAdset;
      antes.name = m?.name ?? null;
      depois.name = nomeAdset;
    }
    if (totalPedido !== null && !campanhaTemOrcamento) {
      const v = novoOrcPorAdset[a.meta_adset_id];
      if (modoFinal === "vitalicio") {
        params.lifetime_budget = String(v);
        antes.lifetime_budget_cents = Number(m?.lifetime_budget ?? 0) || null;
        depois.lifetime_budget_cents = v;
      } else {
        params.daily_budget = String(v);
        antes.daily_budget_cents = Number(m?.daily_budget ?? 0) || null;
        depois.daily_budget_cents = v;
      }
    }
    if (novoStart) {
      const arrancou = m?.start_time ? new Date(m.start_time).getTime() <= agora : false;
      if (arrancou) {
        avisos.push({ codigo: "start_time_ignorado", detalhe: String(a.trigger_nome ?? `Conjunto ${i + 1}`) });
      } else {
        params.start_time = novoStart;
        antes.start_time = m?.start_time ?? null;
        depois.start_time = novoStart;
      }
    }
    if (novoEnd) {
      params.end_time = novoEnd;
      antes.end_time = m?.end_time ?? null;
      depois.end_time = novoEnd;
    }
    // Targeting: parte SEMPRE do objecto actual e muda só as chaves pedidas.
    let targetingNovo: any = null;
    if (pedeGeo || pedeIdades) {
      targetingNovo = JSON.parse(JSON.stringify(m?.targeting ?? {}));
      if (pedeGeo) {
        const paises = alteracoes.geografia.geo
          .filter((x: any) => typeof x === "string" && x.trim())
          .map((x: string) => x.trim().toUpperCase());
        const geoLoc: any = { ...(targetingNovo.geo_locations ?? {}), countries: paises };
        // Estados/regiões: chaves de região já resolvidas (plano ou pedido).
        // countries mantém-se sempre; regiões são substituídas em bloco.
        const regs = Array.isArray(alteracoes.geografia.geo_regions)
          ? alteracoes.geografia.geo_regions
            .map((r: any) => (typeof r === "string" ? r : r?.key))
            .filter((k: any) => typeof k === "string" && k.trim())
            .map((k: string) => ({ key: String(k) }))
          : null;
        if (regs && regs.length > 0) geoLoc.regions = regs;
        else if (regs) delete geoLoc.regions;
        targetingNovo.geo_locations = geoLoc;
        antes.geo = (m?.targeting?.geo_locations?.countries ?? null);
        antes.geo_regions = (m?.targeting?.geo_locations?.regions ?? null);
        depois.geo = paises;
        if (regs) depois.geo_regions = regs;
      }
      if (pedeIdades) {
        targetingNovo.age_min = alteracoes.idades.idade_min;
        targetingNovo.age_max = alteracoes.idades.idade_max;
        antes.idades = { min: m?.targeting?.age_min ?? null, max: m?.targeting?.age_max ?? null };
        depois.idades = { min: alteracoes.idades.idade_min, max: alteracoes.idades.idade_max };
      }
      params.targeting = JSON.stringify(targetingNovo);
    }
    const campos = Object.keys(depois);
    if (campos.length > 0) {
      adsetPlanos.push({
        idx: i,
        id: String(a.meta_adset_id),
        params,
        antes,
        depois,
        campos,
        targeting: targetingNovo,
        geo: pedeGeo ? (depois.geo as string[]) : undefined,
        geo_regions: pedeGeo && depois.geo_regions !== undefined ? alteracoes.geografia.geo_regions : undefined,
        idades: pedeIdades ? { min: alteracoes.idades.idade_min, max: alteracoes.idades.idade_max } : undefined,
      });
      resultado.push({ nivel: "conjunto", external_id: String(a.meta_adset_id), campos, antes, depois, ok: dryRun });
    }
  }

  // Anúncios — nesta versão só nome.
  type AdPlano = { adsetIdx: number; id: string; nome: string };
  const adPlanos: AdPlano[] = [];
  if (nomeBase) {
    for (let i = 0; i < adsetsPlano.length; i++) {
      const a = adsetsPlano[i];
      const ids: string[] = [];
      for (const an of (a?.anuncios ?? [])) {
        const lista = Array.isArray(an?.meta_ad_ids) ? an.meta_ad_ids : (an?.meta_ad_id ? [an.meta_ad_id] : []);
        for (const id of lista) if (typeof id === "string" && id) ids.push(id);
      }
      ids.forEach((id, k) => {
        const nome = `${nomeBase} — ${a.trigger_nome ?? `Conjunto ${i + 1}`} — ${k + 1}`;
        adPlanos.push({ adsetIdx: i, id, nome });
        resultado.push({
          nivel: "anuncio",
          external_id: id,
          campos: ["name"],
          antes: { name: null },
          depois: { name: nome },
          ok: dryRun,
        });
      });
    }
  }

  if (resultado.length === 0) {
    return recusa("sem_alteracoes", "Nada mudou em relação ao que está no Meta.");
  }

  // ── 9) DRY-RUN: devolve o diff sem um único pedido de escrita à Meta ───────
  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      plan_id: plan.id,
      meta_campaign_id: plan.meta_campaign_id,
      modo_orcamento: modoFinal,
      dias_janela: dias,
      cbo: campanhaTemOrcamento,
      avisos,
      resultado,
    });
  }

  // ── 10) Aplicar na Meta, objecto a objecto ─────────────────────────────────
  const changeRows: any[] = [];
  const registar = (
    nivel: Resultado["nivel"],
    id: string,
    campos: string[],
    antes: any,
    depois: any,
  ) => {
    const change_type = campos.some((c) => c.includes("budget"))
      ? "budget"
      : campos.some((c) => c === "geo" || c === "idades")
      ? "targeting"
      : campos.some((c) => c === "start_time" || c === "end_time")
      ? "schedule"
      : campos.includes("name")
      ? "name"
      : "other";
    changeRows.push({
      company_id: companyId,
      connection_id: plan.connection_id,
      external_campaign_id: nivel === "campanha" ? id : String(plan.meta_campaign_id),
      external_adset_id: nivel === "conjunto" ? id : null,
      external_ad_id: nivel === "anuncio" ? id : null,
      change_type,
      before_jsonb: antes,
      after_jsonb: depois,
      reason_text: reasonText,
      triggered_by: triggeredBy,
      applied_by_user_id: userId,
    });
  };

  const marcar = (nivel: Resultado["nivel"], id: string, ok: boolean, erro?: string) => {
    const r = resultado.find((x) => x.nivel === nivel && x.external_id === id);
    if (r) {
      r.ok = ok;
      if (erro) r.erro = erro;
    }
  };

  let algumFalhou = false;
  let campanhaOk = campCampos.length === 0;
  if (campCampos.length > 0) {
    try {
      await metaPost(String(plan.meta_campaign_id), token, campParams);
      campanhaOk = true;
      marcar("campanha", String(plan.meta_campaign_id), true);
      registar("campanha", String(plan.meta_campaign_id), campCampos, campAntes, campDepois);
    } catch (e) {
      algumFalhou = true;
      marcar("campanha", String(plan.meta_campaign_id), false, (e as Error).message);
    }
  }

  const adsetsAplicados = new Set<number>();
  for (const ap of adsetPlanos) {
    try {
      await metaPost(ap.id, token, ap.params);
      adsetsAplicados.add(ap.idx);
      marcar("conjunto", ap.id, true);
      registar("conjunto", ap.id, ap.campos, ap.antes, ap.depois);
    } catch (e) {
      algumFalhou = true;
      marcar("conjunto", ap.id, false, (e as Error).message);
    }
  }

  const adsOk = new Set<string>();
  for (const ad of adPlanos) {
    try {
      await metaPost(ad.id, token, { name: ad.nome });
      adsOk.add(ad.id);
      marcar("anuncio", ad.id, true);
      registar("anuncio", ad.id, ["name"], { name: null }, { name: ad.nome });
    } catch (e) {
      algumFalhou = true;
      marcar("anuncio", ad.id, false, (e as Error).message);
    }
  }

  // ── 11) Plano local em sincronia — só o que a Meta aceitou ─────────────────
  const update: Record<string, unknown> = {};
  for (const ap of adsetPlanos) {
    if (!adsetsAplicados.has(ap.idx)) continue;
    const a = adsetsPlano[ap.idx];
    // `trigger_nome` é o nome semântico do plano — não se reescreve com o nome Meta.
    if (ap.depois.daily_budget_cents !== undefined) a.orcamento_cents = ap.depois.daily_budget_cents;
    if (ap.depois.lifetime_budget_cents !== undefined) a.orcamento_cents = ap.depois.lifetime_budget_cents;
    a.publico_sugerido = a.publico_sugerido ?? {};
    if (ap.geo) a.publico_sugerido.geo = ap.geo;
    if (ap.idades) {
      a.publico_sugerido.idade_min = ap.idades.min;
      a.publico_sugerido.idade_max = ap.idades.max;
    }
  }
  for (let i = 0; i < adsetsPlano.length; i++) {
    for (const an of (adsetsPlano[i]?.anuncios ?? [])) {
      const lista = Array.isArray(an?.meta_ad_ids) ? an.meta_ad_ids : [];
      if (lista.some((id: string) => adsOk.has(id))) an.nome_meta_atualizado_em = new Date().toISOString();
    }
  }
  update.adsets = adsetsPlano;
  if (adsetsAplicados.size > 0) {
    if (novoStart) update.start_time = startFinal;
    if (novoEnd) update.end_time = endFinal;
  }
  if (totalPedido !== null) {
    const aplicouOrcCampanha = campanhaTemOrcamento && campanhaOk && (campDepois.daily_budget_cents !== undefined || campDepois.lifetime_budget_cents !== undefined);
    const aplicouOrcAdsets = !campanhaTemOrcamento && adsetsAplicados.size === adsetPlanos.length && adsetPlanos.length > 0;
    if (aplicouOrcCampanha || aplicouOrcAdsets) update.orcamento_total_cents = totalPedido;
  }
  update.updated_at = new Date().toISOString();
  const { error: planUpErr } = await (supabase as any)
    .schema("crm").from("meta_publish_plan")
    .update(update)
    .eq("id", plan.id);
  if (planUpErr) console.warn("[publish-update] plano não sincronizado:", planUpErr.message);

  // Log best-effort (sem DDL: tabela já existente).
  if (changeRows.length > 0) {
    try {
      const { error: logErr } = await (supabase as any).schema("crm").from("meta_campaign_changes").insert(changeRows);
      if (logErr) console.warn("[publish-update] meta_campaign_changes:", logErr.message);
    } catch (e) {
      console.warn("[publish-update] meta_campaign_changes:", (e as Error).message);
    }
  }

  if (algumFalhou) {
    return json({
      ok: false,
      error_user_msg: "O Meta recusou parte das alterações. O que passou já ficou gravado.",
      plan_id: plan.id,
      avisos,
      resultado,
    }, 200);
  }

  return json({
    ok: true,
    plan_id: plan.id,
    meta_campaign_id: plan.meta_campaign_id,
    modo_orcamento: modoFinal,
    avisos,
    resultado,
  });
});
