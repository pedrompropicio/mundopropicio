// crm-assisted-assembly-compute
// POST { company_id, event_id, flow, source_campaign_id?, creative_ids[] }
// → motor 100% determinístico da Camada 4 (Montagem Assistida).
//   NÃO chama LLM. Re-correr com os mesmos dados devolve pesos idênticos.
//   Agrupa criativos por gatilho (via Camada 2), calcula ROAS histórico
//   por adset (cadeia meta_creatives → meta_ad_snapshot → meta_ad_insights_daily),
//   aplica gate de fiabilidade por adset e reparte 100% em pesos inteiros.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Constantes do gate e quotas (determinístico, auditável no snapshot)
const MIN_DIAS_FIAVEL = 7;
const MIN_CONVERSOES_FIAVEL = 10;
const QUOTA_GRUPO_FIAVEL = 0.7;
const QUOTA_GRUPO_IMATURO = 0.3;
const JANELA_DIAS_INSIGHTS = 30;

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

type AdsetDraft = {
  trigger_id: string | null;
  trigger_nome: string;
  trigger_tipo: string;
  creative_ids: string[];
  // agregados (preenchidos depois)
  spend_cents: number;
  purchases_value_cents: number;
  conversoes: number;
  dias_dados: number;
  roas_agregado: number | null;
  fiavel: boolean;
};

Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[assisted-assembly] BUILD_VERSION=assembly-compute-v1");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: {
    company_id?: string; event_id?: string; flow?: string;
    source_campaign_id?: string | null; creative_ids?: string[];
  };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { company_id, event_id, flow, source_campaign_id, creative_ids } = body;
  if (!company_id || !event_id || !flow || !Array.isArray(creative_ids) || creative_ids.length === 0) {
    return json({ error: "missing_params", message: "company_id, event_id, flow, creative_ids[] obrigatórios" }, 400);
  }
  if (flow !== "redesign" && flow !== "from_scratch") {
    return json({ error: "invalid_flow", message: "flow tem de ser 'redesign' ou 'from_scratch'" }, 400);
  }

  // Cliente do utilizador para validar pertença ao company via RLS
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: evRow, error: evErr } = await userClient
    .from("events").select("id, company_id").eq("id", event_id).maybeSingle();
  if (evErr) return json({ error: "db_error", detail: evErr.message }, 500);
  if (!evRow || evRow.company_id !== company_id) {
    return json({ error: "forbidden", message: "evento não pertence ao company_id indicado" }, 403);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -----------------------------------------------------------------------
  // 1) Carrega validações da Camada 2 para os criativos pedidos
  // -----------------------------------------------------------------------
  const { data: validations, error: vErr } = await (adminClient as any)
    .schema("crm")
    .from("creative_message_validation")
    .select("creative_id, semaforo, aproveita_gatilhos, gatilhos_snapshot")
    .eq("event_id", event_id)
    .eq("company_id", company_id)
    .in("creative_id", creative_ids);
  if (vErr) return json({ error: "validation_read_failed", detail: vErr.message }, 500);

  const valByCreative = new Map<string, any>();
  for (const v of (validations ?? [])) valByCreative.set(v.creative_id, v);

  // Excluir criativos 🔴 contradiz
  const excluidos_contradiz: string[] = [];
  const elegiveis: string[] = [];
  const semValidacao: string[] = [];
  for (const cid of creative_ids) {
    const v = valByCreative.get(cid);
    if (!v) { semValidacao.push(cid); elegiveis.push(cid); continue; }
    if (v.semaforo === "contradiz") { excluidos_contradiz.push(cid); continue; }
    elegiveis.push(cid);
  }

  if (elegiveis.length === 0) {
    return json({
      error: "no_eligible_creatives",
      message: "Todos os criativos foram excluídos por contradição (🔴) com os gatilhos activos.",
      excluidos_contradiz,
    }, 422);
  }

  // -----------------------------------------------------------------------
  // 2) Agrupa criativos por gatilho (determinístico pela ordem do snapshot.available)
  // -----------------------------------------------------------------------
  // Chave do grupo: trigger_id (string) ou "__genericos__"
  const GENERICOS_KEY = "__genericos__";
  const draftByKey = new Map<string, AdsetDraft>();

  const ensureDraft = (key: string, nome: string, tipo: string, trigger_id: string | null) => {
    if (!draftByKey.has(key)) {
      draftByKey.set(key, {
        trigger_id, trigger_nome: nome, trigger_tipo: tipo,
        creative_ids: [],
        spend_cents: 0, purchases_value_cents: 0, conversoes: 0, dias_dados: 0,
        roas_agregado: null, fiavel: false,
      });
    }
    return draftByKey.get(key)!;
  };

  for (const cid of elegiveis) {
    const v = valByCreative.get(cid);
    if (!v || v.aproveita_gatilhos !== true) {
      const d = ensureDraft(GENERICOS_KEY, "Genéricos", "generico", null);
      d.creative_ids.push(cid);
      continue;
    }
    // Determinístico: usa o 1º gatilho do snapshot.available
    const available = v?.gatilhos_snapshot?.available ?? [];
    const first = Array.isArray(available) && available.length > 0 ? available[0] : null;
    if (!first?.trigger_id) {
      const d = ensureDraft(GENERICOS_KEY, "Genéricos", "generico", null);
      d.creative_ids.push(cid);
      continue;
    }
    const d = ensureDraft(first.trigger_id, first.nome ?? "(sem nome)", first.tipo ?? "generico", first.trigger_id);
    d.creative_ids.push(cid);
  }

  // -----------------------------------------------------------------------
  // 3) Calcula ROAS histórico por adset (janela JANELA_DIAS_INSIGHTS dias)
  //    Cadeia: meta_creatives.id → meta_creative_id → meta_ad_snapshot → external_ad_id → meta_ad_insights_daily
  // -----------------------------------------------------------------------
  const allElegiveis = Array.from(new Set(Array.from(draftByKey.values()).flatMap((d) => d.creative_ids)));

  // meta_creatives.id → meta_creative_id
  const { data: creativesRows, error: crErr } = await (adminClient as any)
    .schema("crm")
    .from("meta_creatives")
    .select("id, meta_creative_id")
    .eq("company_id", company_id)
    .in("id", allElegiveis);
  if (crErr) return json({ error: "creatives_read_failed", detail: crErr.message }, 500);

  const metaCreativeIdByCreativeId = new Map<string, string>();
  for (const r of (creativesRows ?? [])) {
    if (r.meta_creative_id) metaCreativeIdByCreativeId.set(r.id, r.meta_creative_id);
  }

  const allMetaCreativeIds = Array.from(new Set(Array.from(metaCreativeIdByCreativeId.values())));

  // meta_creative_id → external_ad_id (via meta_ad_snapshot)
  const externalAdsByMetaCreative = new Map<string, Set<string>>();
  if (allMetaCreativeIds.length > 0) {
    const { data: adRows, error: adErr } = await (adminClient as any)
      .schema("crm")
      .from("meta_ad_snapshot")
      .select("meta_creative_id, external_ad_id")
      .eq("company_id", company_id)
      .in("meta_creative_id", allMetaCreativeIds);
    if (adErr) return json({ error: "ad_snapshot_read_failed", detail: adErr.message }, 500);
    for (const r of (adRows ?? [])) {
      if (!r.meta_creative_id || !r.external_ad_id) continue;
      if (!externalAdsByMetaCreative.has(r.meta_creative_id)) externalAdsByMetaCreative.set(r.meta_creative_id, new Set());
      externalAdsByMetaCreative.get(r.meta_creative_id)!.add(r.external_ad_id);
    }
  }

  // external_ad_id → insights agregados nos últimos JANELA_DIAS_INSIGHTS dias
  const today = new Date();
  const sinceDate = new Date(today.getTime() - JANELA_DIAS_INSIGHTS * 24 * 3600 * 1000);
  const sinceStr = sinceDate.toISOString().slice(0, 10);

  type AgregadoAd = { spend_cents: number; purchases_value_cents: number; conversoes: number; dias: Set<string> };
  const aggByExternalAd = new Map<string, AgregadoAd>();

  const allExternalAdIds = Array.from(new Set(Array.from(externalAdsByMetaCreative.values()).flatMap((s) => Array.from(s))));
  if (allExternalAdIds.length > 0) {
    const { data: insRows, error: insErr } = await (adminClient as any)
      .schema("crm")
      .from("meta_ad_insights_daily")
      .select("external_ad_id, date_start, spend_cents, purchases_value_cents, purchases_count")
      .eq("company_id", company_id)
      .in("external_ad_id", allExternalAdIds)
      .gte("date_start", sinceStr);
    if (insErr) return json({ error: "insights_read_failed", detail: insErr.message }, 500);
    for (const r of (insRows ?? [])) {
      const k = r.external_ad_id as string;
      if (!aggByExternalAd.has(k)) aggByExternalAd.set(k, { spend_cents: 0, purchases_value_cents: 0, conversoes: 0, dias: new Set() });
      const a = aggByExternalAd.get(k)!;
      a.spend_cents += Number(r.spend_cents ?? 0);
      a.purchases_value_cents += Number(r.purchases_value_cents ?? 0);
      a.conversoes += Number(r.purchases_count ?? 0);
      if (r.date_start) a.dias.add(String(r.date_start));
    }
  }

  // Agrega por adset
  for (const d of draftByKey.values()) {
    const diasSet = new Set<string>();
    for (const cid of d.creative_ids) {
      const mcid = metaCreativeIdByCreativeId.get(cid);
      if (!mcid) continue;
      const exts = externalAdsByMetaCreative.get(mcid);
      if (!exts) continue;
      for (const ext of exts) {
        const a = aggByExternalAd.get(ext);
        if (!a) continue;
        d.spend_cents += a.spend_cents;
        d.purchases_value_cents += a.purchases_value_cents;
        d.conversoes += a.conversoes;
        for (const dia of a.dias) diasSet.add(dia);
      }
    }
    d.dias_dados = diasSet.size;
    d.roas_agregado = d.spend_cents > 0
      ? Math.round((d.purchases_value_cents / d.spend_cents) * 100) / 100
      : null;
    d.fiavel = d.dias_dados >= MIN_DIAS_FIAVEL && d.conversoes >= MIN_CONVERSOES_FIAVEL;
  }

  // -----------------------------------------------------------------------
  // 4) Pesos (determinístico, soma=100)
  //
  // Os pesos brutos não estão na mesma escala: ROAS (~1-8) para os fiáveis vs.
  // contagem de criativos (~1-5) para os imaturos. Para os misturar de forma
  // justa, atribuímos quotas fixas a cada GRUPO (fiáveis ficam com a maior
  // fatia por reflectirem performance real) e DENTRO de cada grupo repartimos
  // a quota proporcionalmente ao peso bruto. Se só houver um grupo, esse grupo
  // leva 100%.
  // -----------------------------------------------------------------------
  const drafts = Array.from(draftByKey.values());
  const fiaveis = drafts.filter((d) => d.fiavel && (d.roas_agregado ?? 0) > 0);
  const imaturos = drafts.filter((d) => !(d.fiavel && (d.roas_agregado ?? 0) > 0));

  type Pesado = { d: AdsetDraft; peso_bruto: number; peso_origem: "roas" | "fallback_criativos"; quota_grupo: number };
  let pesados: Pesado[] = [];

  const haAlgumFiavel = fiaveis.length > 0;
  if (haAlgumFiavel) {
    const haImaturos = imaturos.length > 0;
    const quotaFiavel = haImaturos ? QUOTA_GRUPO_FIAVEL : 1.0;
    const quotaImatura = haImaturos ? QUOTA_GRUPO_IMATURO : 0.0;

    for (const d of fiaveis) pesados.push({ d, peso_bruto: d.roas_agregado ?? 0, peso_origem: "roas", quota_grupo: quotaFiavel });
    for (const d of imaturos) pesados.push({ d, peso_bruto: d.creative_ids.length, peso_origem: "fallback_criativos", quota_grupo: quotaImatura });
  } else {
    // Fallback global: todos por nº de criativos
    for (const d of drafts) pesados.push({ d, peso_bruto: d.creative_ids.length, peso_origem: "fallback_criativos", quota_grupo: 1.0 });
  }

  // Normalização por grupo (com base na quota_grupo)
  const massaPorQuota = new Map<number, number>();
  for (const p of pesados) {
    massaPorQuota.set(p.quota_grupo, (massaPorQuota.get(p.quota_grupo) ?? 0) + p.peso_bruto);
  }

  const pesosFloat: { d: AdsetDraft; peso: number; peso_origem: "roas" | "fallback_criativos" }[] = [];
  for (const p of pesados) {
    const massa = massaPorQuota.get(p.quota_grupo) ?? 0;
    const peso = massa > 0 ? (p.peso_bruto / massa) * p.quota_grupo * 100 : 0;
    pesosFloat.push({ d: p.d, peso, peso_origem: p.peso_origem });
  }

  // Arredonda para int e corrige resto para somar 100 (diferença vai ao maior peso)
  const pesosInt = pesosFloat.map((x) => ({ ...x, peso_pct: Math.round(x.peso) }));
  let soma = pesosInt.reduce((a, b) => a + b.peso_pct, 0);
  if (pesosInt.length > 0 && soma !== 100) {
    const diff = 100 - soma;
    let idxMax = 0;
    for (let i = 1; i < pesosInt.length; i++) {
      if (pesosInt[i].peso_pct > pesosInt[idxMax].peso_pct) idxMax = i;
    }
    pesosInt[idxMax].peso_pct += diff;
    soma = 100;
  }

  // -----------------------------------------------------------------------
  // 5) Constrói payload final de adsets
  // -----------------------------------------------------------------------
  const adsetsOut = pesosInt.map((x) => ({
    trigger_id: x.d.trigger_id,
    trigger_nome: x.d.trigger_nome,
    trigger_tipo: x.d.trigger_tipo,
    creative_ids: x.d.creative_ids,
    peso_pct: x.peso_pct,
    peso_origem: x.peso_origem,
    roas_agregado: x.peso_origem === "roas" ? x.d.roas_agregado : null,
    dias_dados: x.d.dias_dados || null,
    conversoes: x.d.conversoes || null,
    fiavel: x.d.fiavel,
  }));

  const snapshot = {
    build_version: "assembly-compute-v1",
    parametros: {
      MIN_DIAS_FIAVEL,
      MIN_CONVERSOES_FIAVEL,
      QUOTA_GRUPO_FIAVEL,
      QUOTA_GRUPO_IMATURO,
      JANELA_DIAS_INSIGHTS,
    },
    janela_insights: { desde: sinceStr, ate: today.toISOString().slice(0, 10) },
    totais: {
      criativos_input: creative_ids.length,
      elegiveis: elegiveis.length,
      excluidos_contradiz: excluidos_contradiz.length,
      sem_validacao: semValidacao.length,
    },
    sem_validacao_creative_ids: semValidacao,
    excluidos_contradiz_creative_ids: excluidos_contradiz,
    adsets_agregados: adsetsOut.map((a) => ({
      trigger_id: a.trigger_id,
      trigger_nome: a.trigger_nome,
      n_criativos: a.creative_ids.length,
      spend_cents: pesosInt.find((p) => p.d.trigger_id === a.trigger_id && p.d.trigger_nome === a.trigger_nome)?.d.spend_cents ?? 0,
      purchases_value_cents: pesosInt.find((p) => p.d.trigger_id === a.trigger_id && p.d.trigger_nome === a.trigger_nome)?.d.purchases_value_cents ?? 0,
      conversoes: a.conversoes ?? 0,
      dias_dados: a.dias_dados ?? 0,
      roas_agregado: a.roas_agregado,
      fiavel: a.fiavel,
      peso_pct: a.peso_pct,
      peso_origem: a.peso_origem,
    })),
    captured_at: new Date().toISOString(),
  };

  // -----------------------------------------------------------------------
  // 6) Persiste (insert novo — histórico, sem unique)
  // -----------------------------------------------------------------------
  const { data: ins, error: insErr2 } = await (adminClient as any)
    .schema("crm")
    .from("assisted_assembly")
    .insert({
      company_id,
      event_id,
      source_campaign_id: source_campaign_id ?? null,
      flow,
      adsets: adsetsOut,
      total_creatives: adsetsOut.reduce((a, b) => a + b.creative_ids.length, 0),
      snapshot,
    })
    .select("id")
    .single();
  if (insErr2) return json({ error: "persist_failed", detail: insErr2.message }, 500);

  return json({
    assembly_id: ins.id,
    flow,
    adsets: adsetsOut,
    total_creatives: adsetsOut.reduce((a, b) => a + b.creative_ids.length, 0),
    excluidos_contradiz,
    snapshot,
  });
});
