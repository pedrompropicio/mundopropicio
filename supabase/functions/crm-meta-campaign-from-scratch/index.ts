// crm-meta-campaign-from-scratch (sub-tarefa 8, Fase 2)
// Gera um plano de campanha DO ZERO para um evento, opcionalmente usando
// uma campanha de referência vencedora como molde inspirador.
//
// Função SEPARADA do crm-meta-campaign-redesign (DR-2026-06-27e). Reusa
// PADRÕES (auth, callAI com retry, max_completion_tokens por modelo,
// sanitizeJsonEscapes, normalizePlanInPlace, persistência) mas tem fluxo
// próprio. NÃO toca no crm-meta-campaign-redesign.
//
// P0 mantido: o LLM NUNCA decide ROAS. expected_overall_roas vem do
// anchoring (histórico da referência ou meta do utilizador) — sobrescrito
// pós-LLM. Idem feasibility.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { normalizePlanInPlace } from "../_shared/plan-normalize.ts";
import { buildCampaignBrief, type CampaignBrief } from "../_shared/campaign-brief.ts";

// ─────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const GRAPH_API_VERSION = "v18.0";

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const MODEL_ALLOWLIST = new Set([
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "openai/gpt-5",
  "openai/gpt-5-mini",
]);
const TEMPERATURE = 0.3;

// Anchoring constants
const REF_ANCHOR_BAND = 0.15;            // ±15% em torno do ROAS real da ref
const BLANK_BUDGET_FLOOR_EUR = 2000;     // floor estatístico sobre budget planeado
const ANCHORED_AVG_TICKET_FALLBACK_EUR = 50;

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

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return t.trim();
}

// Endurecimento do parse: corrige escapes \u malformados sem tocar nos válidos.
// (mesmo helper do redesign — duplicado deliberadamente para não tocar nele).
function sanitizeJsonEscapes(s: string): string {
  let out = s;
  out = out.replace(/\\u[0-9a-fA-F]{0,3}$/g, "");
  out = out.replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u");
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Tipos do body
// ─────────────────────────────────────────────────────────────────────────
type EventManual = {
  name: string;
  date: string;                  // YYYY-MM-DD
  location?: string | null;
  tickets_total?: number | null;
  goal_revenue_eur?: number | null;
};

type Body = {
  source_mode?: "from_scratch_ref" | "from_scratch_blank";
  event_id?: string | null;
  event_manual?: EventManual | null;
  goal_revenue_eur?: number | null;
  reference_campaign_id?: string | null;
  target_roas?: number;
  total_budget_eur?: number | null;
  country_codes?: string[] | null;
  connection_id?: string | null;
  model?: string | null;
  dry_run?: boolean;
  // Eixo "momento de campanha" (fase comercial do EVENTO). Molda a FORMA
  // do plano (que fases incluir, com que tom). NÃO toca em números nem no
  // anchoring (P0). Default funil_completo = comportamento clássico.
  campaign_moment?: "lancamento" | "escassez" | "funil_completo" | "reta_final";
  // Para futuro duelo from-scratch (mesma mecânica do redesign):
  async_persist?: boolean;
  duel_id?: string | null;
  source_model?: string | null;
};

const ALLOWED_MOMENTS = new Set<string>([
  "lancamento", "escassez", "funil_completo", "reta_final",
]);

// MOMENT_BLOCKS — texto injetado no prompt por cada momento.
// Molda a FORMA do plano (fases, tom). Nada aqui mexe em números (P0).
const MOMENT_BLOCKS: Record<string, string> = {
  lancamento: `== MOMENTO DA CAMPANHA: LANÇAMENTO (1º lote) ==
O evento ACABOU DE ABRIR vendas. Funil CURTO e DIRETO. Inclui apenas 2 fases: awareness LEVE (1 adset, baixo budget — só para anunciar que abriu) + conversion/sales (a maior fatia do budget desde já). NÃO inclui consideration nem retargeting profundo — ainda não há audiência morna suficiente. Tom dos criativos: NOVIDADE, "abriu", "primeiro lote disponível", "garante o teu". Headlines com data de abertura. Evita urgência falsa — ainda não é escasso.`,
  escassez: `== MOMENTO DA CAMPANHA: ESCASSEZ (virada de lote) ==
O lote atual está quase esgotado e o preço vai subir. Foco em conversão + retargeting agressivo. SEM awareness de marca / prospeção fria larga (nada de interesses largos no topo). MAS mantém uma parcela MÍNIMA de aquisição fria QUALIFICADA — só lookalikes quentes (semelhantes a compradores), até 20% do budget no máximo (tu decides a % exata abaixo desse teto, conforme fizer sentido). O grosso vai para retargeting (visitantes + carrinho abandonado dos últimos 14d, ≥40%) e conversão sobre audiências mornas. Tom dos criativos: URGÊNCIA REAL — 'últimos do lote', 'preço sobe em X dias', 'garante antes de subir'. CTAs hard. A parcela de lookalike serve para alimentar o retargeting dos dias seguintes, não para notoriedade.`,
  funil_completo: `== MOMENTO DA CAMPANHA: FUNIL COMPLETO (default) ==
Comportamento padrão: awareness → consideration → conversion → retargeting ao longo do tempo até ao evento. Distribuição equilibrada de budget pelas 4 fases conforme dias para o evento (mais awareness se >60d, mais conversion+retargeting se <30d). Tom variado por fase (descoberta → benefício → ação → recuperação).`,
  reta_final: `== MOMENTO DA CAMPANHA: RETA FINAL ==
Faltam poucos dias para o evento. SEM prospeção fria — nenhum adset de aquisição (nem interesses, nem lookalikes). Apenas 2 frentes: conversão/vendas forte + retargeting PESADO (≥50% do budget) sobre TODAS as audiências mornas dos últimos 30-60d (visitantes, vídeo-viewers, engajamento, carrinho). Tom dos criativos: 'É JÁ', 'última chamada', 'este fim de semana', 'estás a tempo'. Headlines com contagem decrescente de dias. CTAs hard. Vídeos curtos e statics diretos — sem criativos de descoberta.`,
};




type EventCtx = {
  id: string | null;
  name: string;
  date: string | null;
  daysUntil: number | null;
  location: string | null;
  tickets_total: number | null;
  goal_revenue_eur: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  console.log("[from-scratch] BUILD_VERSION=from-scratch-v1", new Date().toISOString());
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  // ── 1) Parse + validação básica ───────────────────────────────────────
  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const sourceMode = body.source_mode;
  if (sourceMode !== "from_scratch_ref" && sourceMode !== "from_scratch_blank") {
    return json({ error: "invalid_source_mode", allowed: ["from_scratch_ref", "from_scratch_blank"] }, 400);
  }
  if (!body.event_id && !body.event_manual) {
    return json({ error: "missing_event", message: "event_id ou event_manual é obrigatório" }, 400);
  }
  if (body.event_id && body.event_manual) {
    return json({ error: "event_id_and_event_manual_exclusive" }, 400);
  }
  if (sourceMode === "from_scratch_ref" && !body.reference_campaign_id) {
    return json({ error: "missing_reference_campaign_id" }, 400);
  }
  if (typeof body.target_roas !== "number" || !Number.isFinite(body.target_roas) || body.target_roas <= 0) {
    return json({ error: "missing_or_invalid_target_roas" }, 400);
  }

  // Eixo "momento de campanha" — escolha manual (default: funil_completo).
  // TODO(auto-suggest): no futuro, sugerir automaticamente a partir do ritmo
  // de vendas do evento (tickets_sold / days_until / sell-through). Por agora
  // é só input manual.
  if (body.campaign_moment !== undefined && !ALLOWED_MOMENTS.has(String(body.campaign_moment))) {
    return json({ error: "invalid_campaign_moment", allowed: Array.from(ALLOWED_MOMENTS) }, 400);
  }
  const campaignMoment: "lancamento" | "escassez" | "funil_completo" | "reta_final" =
    (body.campaign_moment && ALLOWED_MOMENTS.has(body.campaign_moment))
      ? body.campaign_moment
      : "funil_completo";


  const requestedModel = (typeof body.model === "string" && body.model.trim()) ? body.model.trim() : null;
  const modelId = requestedModel && MODEL_ALLOWLIST.has(requestedModel) ? requestedModel : DEFAULT_MODEL;
  const dryRun = body.dry_run === true;
  const asyncPersist = body.async_persist === true;
  const asyncDuelId = typeof body.duel_id === "string" ? body.duel_id.trim() : "";
  const asyncSourceModel = typeof body.source_model === "string" ? body.source_model.trim() : "";
  if (asyncPersist && dryRun) return json({ error: "async_persist_and_dry_run_exclusive" }, 400);
  if (asyncPersist && (!asyncDuelId || !asyncSourceModel)) {
    return json({ error: "missing_async_persist_fields", required: ["duel_id", "source_model"] }, 400);
  }

  // ── 2) Auth + company ─────────────────────────────────────────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized", detail: userErr?.message }, 401);
  const userId = userData.user.id;

  const { data: companyIdRaw, error: companyErr } = await supabase.rpc("current_company_id");
  if (companyErr || !companyIdRaw) {
    return json({ error: "no_company_for_user", detail: companyErr?.message }, 403);
  }
  const companyId = String(companyIdRaw);

  // ── 3) Connection Meta da company (assume 1 por company) ──────────────
  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bodyConnectionId = typeof body.connection_id === "string" && body.connection_id.trim()
    ? body.connection_id.trim()
    : null;

  let conn: any = null;
  let connErr: any = null;
  if (bodyConnectionId) {
    const r = await (sbAdmin as any)
      .schema("crm").from("ad_platform_connections")
      .select("id, status, selected_ad_account_id, selected_ad_account_currency, selected_ad_account_name")
      .eq("company_id", companyId)
      .eq("platform", "meta")
      .eq("id", bodyConnectionId)
      .maybeSingle();
    conn = r.data; connErr = r.error;
    if (connErr || !conn) {
      return json({ error: "connection_not_found", detail: connErr?.message }, 404);
    }
    if (conn.status !== "active") {
      return json({ error: "connection_not_active", status: conn.status }, 422);
    }
  } else {
    const r = await (sbAdmin as any)
      .schema("crm").from("ad_platform_connections")
      .select("id, status, selected_ad_account_id, selected_ad_account_currency, selected_ad_account_name")
      .eq("company_id", companyId)
      .eq("platform", "meta")
      .eq("status", "active");
    connErr = r.error;
    const conns: any[] = Array.isArray(r.data) ? r.data : [];
    if (connErr) {
      return json({ error: "failed_to_load_connections", detail: connErr?.message }, 500);
    }
    if (conns.length === 0) {
      return json({ error: "no_meta_connection_for_company" }, 422);
    }
    if (conns.length === 1) {
      conn = conns[0];
    } else {
      const eurOnly = conns.filter((c) => c.selected_ad_account_currency === "EUR");
      if (eurOnly.length === 1) {
        conn = eurOnly[0];
      } else {
        return json({
          error: "multiple_meta_connections",
          message: "Especifica connection_id no body",
          connections: conns.map((c) => ({
            id: c.id,
            selected_ad_account_id: c.selected_ad_account_id,
            selected_ad_account_name: c.selected_ad_account_name,
            selected_ad_account_currency: c.selected_ad_account_currency,
          })),
        }, 409);
      }
    }
  }
  const connectionId: string = conn.id;
  // ad_account_id: coluna fiável é selected_ad_account_id (já vem com prefixo act_).
  const selectedAcct: string | null = typeof conn.selected_ad_account_id === "string" && conn.selected_ad_account_id.trim()
    ? conn.selected_ad_account_id.trim()
    : null;
  if (!selectedAcct) {
    return json({ error: "no_selected_ad_account_on_connection", connection_id: connectionId }, 422);
  }
  const adAccountId = selectedAcct.startsWith("act_") ? selectedAcct : `act_${selectedAcct}`;

  // ── 4) Resolver evento ────────────────────────────────────────────────
  let eventCtx: EventCtx;
  if (body.event_id) {
    const { data: e, error: eErr } = await supabase
      .from("events")
      .select("id, name, date, location, tickets_total")
      .eq("id", body.event_id)
      .maybeSingle();
    if (eErr || !e) return json({ error: "event_not_found", detail: eErr?.message }, 404);
    const eDateMs = e.date ? new Date(e.date).getTime() : NaN;
    const daysUntil = Number.isFinite(eDateMs)
      ? Math.max(0, Math.round((eDateMs - Date.now()) / 86400000))
      : null;
    eventCtx = {
      id: e.id,
      name: e.name ?? "Evento",
      date: e.date ?? null,
      daysUntil,
      location: (e as any).location ?? null,
      tickets_total: (e as any).tickets_total ?? null,
      goal_revenue_eur: Number(body.goal_revenue_eur ?? 0) || 0,
    };

  } else {
    const em = body.event_manual!;
    if (!em.name || !em.date) {
      return json({ error: "event_manual_missing_fields", required: ["name", "date"] }, 400);
    }
    const eDateMs = new Date(em.date).getTime();
    if (!Number.isFinite(eDateMs)) return json({ error: "event_manual_invalid_date" }, 400);
    eventCtx = {
      id: null,
      name: em.name,
      date: em.date,
      daysUntil: Math.max(0, Math.round((eDateMs - Date.now()) / 86400000)),
      location: em.location ?? null,
      tickets_total: em.tickets_total ?? null,
      goal_revenue_eur: Number(em.goal_revenue_eur ?? 0) || 0,
    };
  }

  const targetRoas = body.target_roas as number;
  const totalBudgetEur = typeof body.total_budget_eur === "number" ? body.total_budget_eur : null;
  const countries = Array.isArray(body.country_codes) ? body.country_codes.filter(Boolean) : [];

  // ── 5) Access token (best-effort para audiences reais via Graph) ──────
  let accessToken: string | null = null;
  try {
    const { data: tokenRows, error: tokenErr } = await (supabase as any).rpc(
      "crm_get_meta_decrypted_token",
      { p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY },
    );
    if (!tokenErr && Array.isArray(tokenRows) && tokenRows.length > 0) {
      accessToken = (tokenRows[0] as { access_token: string }).access_token ?? null;
    } else if (tokenErr) {
      console.warn("[from-scratch] token decrypt failed (non-fatal):", tokenErr.message);
    }
  } catch (e) {
    console.warn("[from-scratch] token decrypt threw (non-fatal):", String(e));
  }

  // ── 6) Custom audiences (best-effort) ─────────────────────────────────
  let customAudienceList: Array<{ id: string; name: string }> = [];
  if (accessToken) {
    try {
      const caUrl = new URL(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/customaudiences`,
      );
      caUrl.searchParams.set("fields", "id,name");
      caUrl.searchParams.set("limit", "100");
      caUrl.searchParams.set("access_token", accessToken);
      const caResp = await fetch(caUrl.toString());
      const caJson = await caResp.json();
      if (caResp.ok && Array.isArray(caJson.data)) {
        customAudienceList = caJson.data
          .filter((c: any) => c?.id && c?.name)
          .map((c: any) => ({ id: String(c.id), name: String(c.name) }));
      }
    } catch (e) {
      console.warn("[from-scratch] CA fetch threw (non-fatal):", String(e));
    }
  }
  const customAudiencesBlock = customAudienceList.length > 0
    ? `\n== CUSTOM AUDIENCES disponíveis nesta ad account ==\n` +
      customAudienceList.map((c) => `- id="${c.id}" name="${c.name}"`).join("\n") +
      `\n(usa estes ids VERBATIM em targeting_json.custom_audiences[].id e exclusions.custom_audiences[].id)\n`
    : `\n== CUSTOM AUDIENCES ==\n(nenhuma audience disponível — NÃO uses custom_audiences nem exclusions com ids inventados)\n`;

  // ── 7) Brief (reference_only OU blank) ────────────────────────────────
  let brief: CampaignBrief | null = null;
  try {
    brief = await buildCampaignBrief({
      supabase,
      campaign_id: null,
      caps: { target_blended_roas: targetRoas },
      mode: sourceMode === "from_scratch_ref" ? "reference_only" : "blank",
      reference_campaign_id: sourceMode === "from_scratch_ref" ? body.reference_campaign_id! : null,
      event_id: eventCtx.id,
      ad_account_id: adAccountId,
      company_id: companyId,
      meta_access_token: accessToken ?? undefined,
    });
  } catch (e) {
    console.warn(`[from-scratch] brief build failed: ${(e as Error).message}`);
    brief = null;
  }

  // ── 8) Anchoring (P0 — número nunca vem do LLM) ───────────────────────
  // ─────────────────────────────────────────────────────────────────────
  let anchored: {
    expected_overall_roas: number | null;     // ROAS projetado (null em blank)
    expected_revenue_eur: number;
    expected_total_purchases: number;
    band: { lo: number; hi: number } | null;
    feasibility: "ok" | "stretch" | "impossible" | "starting_structure";
    confidence: "high" | "medium" | "low";
    anchor_source: "reference_real_roas" | "user_target_only";
    reference_roas: number | null;
    reference_period_days: number | null;
    reference_spend_eur: number | null;
    reference_revenue_eur: number | null;
    notes: string[];
  };

  if (sourceMode === "from_scratch_ref") {
    // Calcula ROAS real da referência via insights agregados (90d).
    const PERIOD_DAYS = 90;
    const fromIso = new Date(Date.now() - PERIOD_DAYS * 86400000).toISOString().slice(0, 10);
    const { data: insRows } = await (supabase as any)
      .schema("crm").from("meta_campaign_insights_daily")
      .select("spend_cents, purchases_count, purchases_value_cents")
      .eq("external_campaign_id", body.reference_campaign_id!)
      .gte("date_start", fromIso);
    let spendCents = 0, valueCents = 0, purchases = 0;
    for (const r of insRows ?? []) {
      spendCents += Number((r as any).spend_cents ?? 0);
      valueCents += Number((r as any).purchases_value_cents ?? 0);
      purchases += Number((r as any).purchases_count ?? 0);
    }
    const refRoas = spendCents > 0 ? (valueCents / spendCents) : null;
    const refSpendEur = spendCents / 100;
    const refRevEur = valueCents / 100;

    if (refRoas == null) {
      // Sem dados — degrada para starting_structure com nota.
      anchored = {
        expected_overall_roas: null,
        expected_revenue_eur: eventCtx.goal_revenue_eur,
        expected_total_purchases: Math.max(1, Math.round(eventCtx.goal_revenue_eur / ANCHORED_AVG_TICKET_FALLBACK_EUR)),
        band: null,
        feasibility: "starting_structure",
        confidence: "low",
        anchor_source: "user_target_only",
        reference_roas: null,
        reference_period_days: PERIOD_DAYS,
        reference_spend_eur: refSpendEur,
        reference_revenue_eur: refRevEur,
        notes: ["referência sem insights nos últimos 90d — sem âncora histórica"],
      };
    } else {
      const lo = +(refRoas * (1 - REF_ANCHOR_BAND)).toFixed(2);
      const hi = +(refRoas * (1 + REF_ANCHOR_BAND)).toFixed(2);
      const expected = +refRoas.toFixed(2);
      // Feasibility: ok se target_roas <= hi; stretch se entre hi e hi*1.2; impossible acima.
      const feas: "ok" | "stretch" | "impossible" =
        targetRoas <= hi ? "ok" :
        targetRoas <= hi * 1.2 ? "stretch" : "impossible";
      const expectedRevenue = eventCtx.goal_revenue_eur > 0
        ? eventCtx.goal_revenue_eur
        : (totalBudgetEur != null ? +(totalBudgetEur * expected).toFixed(2) : 0);
      const expectedPurch = Math.max(
        1,
        Math.round(expectedRevenue / ANCHORED_AVG_TICKET_FALLBACK_EUR),
      );
      anchored = {
        expected_overall_roas: expected,
        expected_revenue_eur: expectedRevenue,
        expected_total_purchases: expectedPurch,
        band: { lo, hi },
        feasibility: feas,
        confidence: refSpendEur >= 500 ? "high" : refSpendEur >= 100 ? "medium" : "low",
        anchor_source: "reference_real_roas",
        reference_roas: expected,
        reference_period_days: PERIOD_DAYS,
        reference_spend_eur: +refSpendEur.toFixed(2),
        reference_revenue_eur: +refRevEur.toFixed(2),
        notes: [`âncora = ROAS real da referência (${expected.toFixed(2)}x em ${PERIOD_DAYS}d)`],
      };
    }
  } else {
    // blank: SEM âncora histórica. expected_overall_roas = null.
    // target_roas é marcado como meta_do_utilizador (não projeção).
    // Gate: floor estatístico sobre BUDGET planeado (não sobre histórico).
    const budgetOk = totalBudgetEur == null || totalBudgetEur >= BLANK_BUDGET_FLOOR_EUR;
    anchored = {
      expected_overall_roas: null,
      expected_revenue_eur: eventCtx.goal_revenue_eur,
      expected_total_purchases: Math.max(
        1,
        Math.round((eventCtx.goal_revenue_eur || 0) / ANCHORED_AVG_TICKET_FALLBACK_EUR),
      ),
      band: null,
      feasibility: "starting_structure",
      confidence: "low",
      anchor_source: "user_target_only",
      reference_roas: null,
      reference_period_days: null,
      reference_spend_eur: null,
      reference_revenue_eur: null,
      notes: budgetOk
        ? ["estrutura de arranque — sem histórico; target_roas é meta do utilizador, não projeção"]
        : [`estrutura de arranque — sem histórico; aviso: budget planeado (${totalBudgetEur}€) abaixo do floor estatístico (${BLANK_BUDGET_FLOOR_EUR}€)`],
    };
  }

  // ── 9) Bloco brief.reference compacto (só no modo ref) ────────────────
  const referenceBlock: string = (() => {
    if (sourceMode !== "from_scratch_ref" || !brief?.reference) return "";
    const ref = brief.reference;
    const lines: string[] = [];
    lines.push("== ESTRUTURA VENCEDORA DA REFERÊNCIA (inspiração, não cópia) ==");
    lines.push(
      `Esta é a estrutura de uma campanha que FUNCIONOU (ROAS real ${anchored.reference_roas?.toFixed(2) ?? "n/a"}x). ` +
      "Aprende o PADRÃO (audiências, formatos, ângulos) e ADAPTA ao evento novo — não copies cegamente.",
    );
    const winners = (ref.creatives ?? []).filter((c: any) => c.label === "winner");
    if (winners.length) {
      lines.push("");
      lines.push("-- CRIATIVOS VENCEDORES DA REFERÊNCIA --");
      for (const w of winners.slice(0, 5)) {
        const roas = w.performance?.roas != null ? `${w.performance.roas.toFixed(2)}x` : "n/a";
        const type = w.library?.type ?? "?";
        const head = w.library?.headline ? ` | hook="${w.library.headline}"` : "";
        lines.push(`- type=${type} | roas=${roas}${head}`);
      }
    }
    const ads = ref.adsets ?? [];
    if (ads.length) {
      lines.push("");
      lines.push("-- ADSETS DA REFERÊNCIA --");
      for (const a of ads.slice(0, 5)) {
        lines.push(`- "${a.name ?? a.external_adset_id}" | objective=${a.optimization_goal ?? "?"}`);
      }
    }
    return lines.join("\n");
  })();

  // ── 10) Prompt de raiz ────────────────────────────────────────────────
  const targetRevenue = eventCtx.goal_revenue_eur > 0
    ? eventCtx.goal_revenue_eur
    : (totalBudgetEur != null ? totalBudgetEur * targetRoas : 0);
  const eventBlock = [
    "== EVENTO-ALVO ==",
    `Nome: ${eventCtx.name}`,
    `Data: ${eventCtx.date ?? "n/a"} (${eventCtx.daysUntil ?? "?"} dias)`,
    eventCtx.location ? `Local: ${eventCtx.location}` : null,
    eventCtx.tickets_total != null ? `Bilhetes total: ${eventCtx.tickets_total}` : null,
    `Meta de receita: €${targetRevenue.toFixed(2)}`,
    `Target ROAS (input do utilizador): ${targetRoas.toFixed(2)}x`,
    totalBudgetEur != null ? `Budget total disponível: €${totalBudgetEur.toFixed(2)}` : null,
    countries.length > 0 ? `Países: ${countries.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const modeBlock = sourceMode === "from_scratch_ref"
    ? "Esta é uma campanha NOVA, mas tens uma referência vencedora como molde. Inspira-te na estrutura dela; adapta ao contexto deste evento."
    : "Esta é uma campanha NOVA, SEM referência histórica. Desenha a partir de boas práticas de marketing de eventos ao vivo. O plano é uma ESTRUTURA DE ARRANQUE (não é uma projeção — é um ponto de partida que vais calibrar com dados reais).";

  const prompt = `És um especialista sênior em Meta Ads para eventos ao vivo. Tens de desenhar uma campanha NOVA, do zero, para o evento abaixo.

${modeBlock}

${eventBlock}
${MOMENT_BLOCKS[campaignMoment]}
${customAudiencesBlock}
${referenceBlock}

INSTRUÇÕES CRÍTICAS:
0. RESPEITA o MOMENTO DA CAMPANHA acima — ele define quantas fases inclui (pode ser 2 em vez de 3-4), quais phase_ids escolhes e o tom dos criativos. NÃO incluas fases que o momento exclui. O budget_share das fases tem de respeitar os limites do momento (ex.: escassez → lookalike frio ≤ 0.20; reta_final → zero adsets de aquisição fria; retargeting ≥ os mínimos indicados).
1. NÃO inventes números de ROAS. expected_overall_roas será SOBRESCRITO depois da tua resposta (vem do anchoring determinístico). Foca-te em ESTRUTURA e LINGUAGEM.
2. O JSON deve seguir o schema canónico abaixo, em PT-BR, sem fences.
3. Sê conciso. Top 2-5 fases (o momento pode pedir só 2). Top 5 audiences/criativos por fase.
4. Se source_mode='from_scratch_blank', marca claramente o plano como "estrutura de arranque" no summary.notes.


Schema de saída (JSON puro):
{
  "summary": {
    "expected_overall_roas": <number>,
    "expected_revenue_eur": <number>,
    "expected_total_purchases": <number>,
    "feasibility": "ok|stretch|impossible|starting_structure",
    "confidence": "high|medium|low",
    "recommended_total_budget_eur": <number>,
    "notes": ["..."]
  },
  "phases": [
    {
      "phase_id": "awareness|consideration|conversion|retargeting|...",
      "phase_label": "<PT-BR>",
      "start_days_before_event": <int>,
      "duration_days": <int>,
      "budget_share": <0..1>,
      "objective_meta": "OUTCOME_SALES|OUTCOME_AWARENESS|OUTCOME_TRAFFIC|...",
      "rationale": "<PT-BR, 2-3 frases>"
    }
  ],
  "recommended_campaigns": [
    {
      "campaign_label": "<PT-BR>",
      "phase_id": "...",
      "objective_meta": "...",
      "daily_budget_eur": <number>,
      "adsets": [
        {
          "name": "<PT-BR>",
          "budget_weight": <number 0..1 — peso RELATIVO dentro desta campanha; ver instrução crítica BUDGET_WEIGHT>,
          "audience_description": "<PT-BR>",
          "targeting_json": {
            "custom_audiences": [{"id": "<id verbatim>", "name": "<name>"}],
            "exclusions": {"custom_audiences": [{"id": "<id>"}]},
            "interests": [{"name": "<...>"}],
            "geo_locations": {"countries": ["PT","BR",...]}
          },
          "placements": ["..."],
          "creatives": [
            {
              "type": "image|video|carousel|reels",
              "angle": "<PT-BR>",
              "headline_suggestion": "<PT-BR>",
              "primary_text_suggestion": "<PT-BR>",
              "cta_suggestion": "GET_TICKETS|LEARN_MORE|SHOP_NOW|SIGN_UP"
            }
          ]
        }
      ]
    }
  ],
  "scaling_rules": [
    {"trigger": "...", "action": "...", "rationale": "..."}
  ],
  "kpis_global": {
    "expected_total_impressions": <number>,
    "expected_total_reach": <number>,
    "expected_total_clicks": <number>,
    "expected_avg_frequency": <number>,
    "expected_total_purchases": <number>
  },
  "budget_recommendation": {
    "total_eur": <number>,
    "by_phase_eur": {"<phase_id>": <number>}
  },
  "risks_and_warnings": [
    {"severity": "high|medium|low", "title": "...", "description": "..."}
  ],
  "creative_brief": {
    "primary_message": "<PT-BR>",
    "tone": "<PT-BR>",
    "must_include": ["..."],
    "avoid": ["..."]
  },
  "redesign_rationale": "<PT-BR, 3-6 frases explicando a estratégia desenhada>"
}`;

  // ── 11) LLM call (com retry) ──────────────────────────────────────────
  const modelSupportsTemperature = (m: string): boolean => {
    const id = (m || "").toLowerCase();
    if (id.includes("gpt-5") || id.startsWith("openai/")) return false;
    return true;
  };

  const buildAiBody = () => {
    const b: Record<string, unknown> = {
      model: modelId,
      messages: [
        { role: "system", content: "És um especialista sênior em Meta Ads para eventos ao vivo. Respondes SEMPRE com JSON puro (sem fences) e em PT-BR." },
        { role: "user", content: prompt },
      ],
    };
    if (modelSupportsTemperature(modelId)) b.temperature = TEMPERATURE;
    const mid = (modelId || "").toLowerCase();
    if (mid.startsWith("openai/")) b.max_completion_tokens = 24000;
    else if (mid.startsWith("google/gemini")) b.max_tokens = 12000;
    return JSON.stringify(b);
  };

  const callAI = () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: buildAiBody(),
  });

  const isAsyncMode = asyncPersist;
  const maxAttempts = isAsyncMode ? 2 : 3;
  const RETRY_BACKOFF_MS = [1500, 3000, 6000];

  const runPipeline = async (): Promise<
    | { ok: true; plan: any; usageTokens: number | null }
    | { ok: false; status: number; error: string; detail?: string }
  > => {
    let aiResp: Response | null = null;
    let aiJson: any = null;
    let content = "";
    let usageTokens: number | null = null;
    let lastDetail = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      aiResp = await callAI();
      const st = aiResp.status;
      if (st === 402) return { ok: false, status: 402, error: "credits_exhausted" };
      if (st === 429) {
        lastDetail = (await aiResp.text().catch(() => "")).slice(0, 200);
        if (attempt < maxAttempts) { await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1])); continue; }
        return { ok: false, status: 429, error: "rate_limit", detail: lastDetail };
      }
      if (st >= 500) {
        lastDetail = (await aiResp.text().catch(() => "")).slice(0, 200);
        if (attempt < maxAttempts) { await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1])); continue; }
        return { ok: false, status: 502, error: "ai_failed", detail: lastDetail };
      }
      if (!aiResp.ok) {
        lastDetail = (await aiResp.text().catch(() => "")).slice(0, 200);
        return { ok: false, status: 502, error: "ai_failed", detail: lastDetail };
      }
      aiJson = await aiResp.json();
      content = aiJson?.choices?.[0]?.message?.content ?? "";
      usageTokens = aiJson?.usage?.total_tokens ?? null;
      if (!content) {
        if (attempt < maxAttempts) { await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1])); continue; }
        return { ok: false, status: 502, error: "ai_empty_response" };
      }
      break;
    }

    let plan: any;
    try {
      plan = JSON.parse(stripJsonFences(content));
    } catch {
      try {
        plan = JSON.parse(sanitizeJsonEscapes(stripJsonFences(content)));
        console.log("[from-scratch] json recuperado via sanitize de escapes");
      } catch (e2) {
        console.error("[from-scratch] parse error:", e2, content.slice(0, 500));
        return { ok: false, status: 502, error: "ai_invalid_json", detail: content.slice(0, 200) };
      }
    }

    // Normalização determinística pós-LLM (mesmo helper do redesign).
    try {
      normalizePlanInPlace(plan);
    } catch (e) {
      console.warn("[from-scratch] normalize failed (non-fatal):", String(e));
    }

    // ────── P0: SOBRESCREVER NÚMEROS PÓS-LLM (LLM não decide ROAS) ─────
    plan.summary = plan.summary ?? {};
    plan.summary.expected_overall_roas = anchored.expected_overall_roas;
    plan.summary.expected_revenue_eur = anchored.expected_revenue_eur;
    plan.summary.expected_total_purchases = anchored.expected_total_purchases;
    plan.summary.feasibility = anchored.feasibility;
    plan.summary.confidence = anchored.confidence;
    plan.summary.recommended_total_budget_eur = totalBudgetEur ?? plan.summary.recommended_total_budget_eur ?? null;
    const prevNotes = Array.isArray(plan.summary.notes) ? plan.summary.notes : [];
    plan.summary.notes = [...prevNotes, ...anchored.notes];

    // Anchored metadata em bloco dedicado (audit trail).
    plan.anchored_numbers = {
      source_mode: sourceMode,
      anchor_source: anchored.anchor_source,
      target_roas_input: targetRoas,
      expected_overall_roas: anchored.expected_overall_roas,
      band: anchored.band,
      reference_campaign_id: body.reference_campaign_id ?? null,
      reference_roas: anchored.reference_roas,
      reference_period_days: anchored.reference_period_days,
      reference_spend_eur: anchored.reference_spend_eur,
      reference_revenue_eur: anchored.reference_revenue_eur,
      llm_decides_numbers: false,
      campaign_moment: campaignMoment,

    };

    return { ok: true, plan, usageTokens };
  };

  // ── 12) Async persist (futuro duelo from-scratch) ─────────────────────
  if (asyncPersist) {
    const isAsyncGem = asyncSourceModel.toLowerCase().includes("gemini");
    const isAsyncGpt = asyncSourceModel.toLowerCase().includes("gpt");
    const updateModelCol = async (
      sb: ReturnType<typeof createClient>,
      fields: { candidate_id?: string | null; error?: string | null },
    ) => {
      const fin = new Date().toISOString();
      const upd: Record<string, unknown> = {};
      if (isAsyncGem) {
        upd.gemini_finished_at = fin;
        if (fields.candidate_id !== undefined) upd.gemini_candidate_id = fields.candidate_id;
        if (fields.error !== undefined) upd.gemini_error = fields.error;
      } else if (isAsyncGpt) {
        upd.gpt_finished_at = fin;
        if (fields.candidate_id !== undefined) upd.gpt_candidate_id = fields.candidate_id;
        if (fields.error !== undefined) upd.gpt_error = fields.error;
      }
      if (Object.keys(upd).length === 0) return;
      await (sb as any).schema("crm").from("audience_duel_runs")
        .update(upd).eq("duel_id", asyncDuelId);
    };

    console.log(`[from-scratch][async] start duel=${asyncDuelId} model=${asyncSourceModel}`);
    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil((async () => {
      try {
        const result = await runPipeline();
        if (!result.ok) {
          await updateModelCol(sbAdmin, { error: `${result.error}: ${result.detail ?? ""}`.slice(0, 500) });
          return;
        }
        const { plan } = result;
        const stratName = `[Duelo from-scratch] ${eventCtx.name} — ${asyncSourceModel}`.slice(0, 200);
        const row = {
          duel_id: asyncDuelId,
          source_model: asyncSourceModel,
          status: "candidate",
          company_id: companyId,
          connection_id: connectionId,
          ad_account_id: adAccountId,
          event_id: eventCtx.id,
          name: stratName,
          goal_revenue_eur: anchored.expected_revenue_eur,
          total_budget_eur: totalBudgetEur,
          target_roas: anchored.expected_overall_roas ?? targetRoas,
          days_until_event: eventCtx.daysUntil ?? null,
          country_codes: countries.length > 0 ? countries : null,
          generated_plan: plan,
          generation_model: asyncSourceModel,
          generation_tokens_used: result.usageTokens,
          generated_at: new Date().toISOString(),
          source_mode: sourceMode,
          source_campaign_id: null,
          reference_campaign_id: body.reference_campaign_id ?? null,
          redesign_rationale: String((plan as any)?.redesign_rationale ?? "").slice(0, 4000),
          pause_original_mode: "manual",
          applied_constraints: { campaign_moment: campaignMoment },
          created_by: userId,

        };
        const { data: insData, error: insErr } = await (sbAdmin as any)
          .schema("crm").from("meta_campaign_strategies").insert(row).select("id").single();
        if (insErr) throw new Error(`insert_failed: ${insErr.message}`);
        await updateModelCol(sbAdmin, { candidate_id: (insData as any)?.id, error: null });
        console.log(`[from-scratch][async] ok duel=${asyncDuelId} candidate=${(insData as any)?.id}`);
      } catch (e) {
        const msg = ((e as Error)?.message ?? String(e)).slice(0, 500);
        console.error(`[from-scratch][async] erro duel=${asyncDuelId}: ${msg}`);
        try { await updateModelCol(sbAdmin, { error: msg }); } catch { /* noop */ }
      }
    })());
    return json({ accepted: true, duel_id: asyncDuelId, source_model: asyncSourceModel }, 202);
  }

  // ── 13) Síncrono ──────────────────────────────────────────────────────
  const result = await runPipeline();
  if (!result.ok) {
    return json({ error: result.error, detail: result.detail }, result.status);
  }
  const { plan, usageTokens } = result;

  if (dryRun) {
    return json({
      generated_plan: plan,
      anchored_numbers: (plan as any).anchored_numbers,
      source: { source_mode: sourceMode, event: eventCtx, reference_campaign_id: body.reference_campaign_id ?? null },
    });
  }

  // ── 14) Persistência em crm.meta_campaign_strategies ──────────────────
  const stratName = sourceMode === "from_scratch_ref"
    ? `From-scratch (ref) — ${eventCtx.name}`.slice(0, 200)
    : `From-scratch — ${eventCtx.name}`.slice(0, 200);

  const { data: inserted, error: insErr } = await (supabase as any)
    .schema("crm").from("meta_campaign_strategies")
    .insert({
      company_id: companyId,
      connection_id: connectionId,
      ad_account_id: adAccountId,
      event_id: eventCtx.id,
      name: stratName,
      goal_revenue_eur: anchored.expected_revenue_eur,
      ticket_avg_eur: null,
      total_budget_eur: totalBudgetEur,
      target_roas: anchored.expected_overall_roas ?? targetRoas,
      days_until_event: eventCtx.daysUntil ?? null,
      country_codes: countries.length > 0 ? countries : null,
      user_notes: `From-scratch (${sourceMode}) — evento "${eventCtx.name}"`,
      detected_artist: null,
      generated_plan: plan,
      generation_model: modelId,
      generation_tokens_used: usageTokens,
      generated_at: new Date().toISOString(),
      status: "generated",
      source_mode: sourceMode,
      source_campaign_id: null,
      reference_campaign_id: body.reference_campaign_id ?? null,
      redesign_rationale: String((plan as any)?.redesign_rationale ?? "").slice(0, 4000),
      pause_original_mode: "manual",
      applied_constraints: { campaign_moment: campaignMoment },
      created_by: userId,

    })
    .select("id").single();

  if (insErr || !inserted) {
    console.error("[from-scratch] persist failed", insErr);
    return json({ error: "persist_failed", detail: insErr?.message, plan }, 500);
  }

  return json({
    strategy_id: (inserted as any).id,
    generated_plan: plan,
    anchored_numbers: (plan as any).anchored_numbers,
    source: { source_mode: sourceMode, event: eventCtx, reference_campaign_id: body.reference_campaign_id ?? null },
  });
});
