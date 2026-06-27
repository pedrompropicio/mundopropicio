// crm-audience-duel — DR-2026-06-27c.
// Modo canónico: invoca crm-meta-campaign-redesign ×2 (1 modelo por chamada, dry_run:true),
// captura os 2 planos canónicos e persiste 2 candidatos em crm.meta_campaign_strategies
// (status='candidate', duel_id partilhado, source_model, reference_campaign_id).
//
// Modo legacy mantido para retrocompat (Briefing sem campaign_id) — continua a usar o
// gerador anterior baseado em prompt directo ao gateway. Será desligado na sub-tarefa 6.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const GEMINI_MODEL = "google/gemini-2.5-pro";
const GPT_MODEL = "openai/gpt-5";

const REDESIGN_URL = `${SUPABASE_URL}/functions/v1/crm-meta-campaign-redesign`;
const REDESIGN_TIMEOUT_MS = 290_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

type BudgetCaps = {
  target_blended_roas: number;
  daily_budget_cents?: number | null;
  lifetime_budget_cents?: number | null;
  roas_floor?: number | null;
  end_time?: string | null;
};

type CanonicalInput = {
  campaign_id: string;
  reference_campaign_id?: string | null;
  caps?: Partial<BudgetCaps>;
  constraints?: Record<string, unknown>;
  period_days?: number;
};

type Briefing = {
  artist?: string;
  music_style?: string;
  music_styles?: string[];
  entity_type?: string;
  cidade: string;
  dias_evento: number;
  orcamento_eur: number;
  objetivo: string;
  market_scope?: string;
  company_id?: string;
};

type CandidateContext = {
  company_id: string;
  connection_id: string | null;
  ad_account_id: string | null;
  event_id: string | null;
  campaign_name: string | null;
  target_roas: number | null;
  total_budget_eur: number | null;
  goal_revenue_eur: number | null;
  days_until_event: number | null;
  source_campaign_id: string | null;
  reference_campaign_id: string | null;
  created_by: string;
  detected_artist: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Legacy: JSON utils + prompt + gateway call (preservados intactos)
// ────────────────────────────────────────────────────────────────────────────

function cleanJsonText(t: string): string {
  let s = t.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return s;
}
function parseProposal(raw: string): unknown {
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(cleanJsonText(raw)); } catch {}
  return { __parse_error: true, raw: raw.slice(0, 2000) };
}

function buildPromptLegacy(b: Briefing, evCamp: unknown, evPub: unknown, evAud: unknown[]): string {
  const hasEv =
    (evCamp && Object.keys(evCamp as Record<string, unknown>).length > 0) ||
    (evPub && (Array.isArray(evPub) ? (evPub as unknown[]).length > 0 : Object.keys(evPub as Record<string, unknown>).length > 0));

  return `[1 PAPEL]
És estratega sénior de tráfego pago para eventos de música brasileira em Portugal. Respeitas a evidência histórica fornecida e NUNCA inventas números.

[2 EVENTO]
${JSON.stringify(b, null, 2)}

[3 EVIDÊNCIA HISTÓRICA — MP Audience]
${hasEv ? "" : "(sem histórico relevante; usar normas gerais do mercado e dizê-lo claramente no racional)"}
- Metade-CAMPANHA: ${JSON.stringify(evCamp ?? {}, null, 2)}
- Metade-PÚBLICOS: ${JSON.stringify(evPub ?? [], null, 2)}

[3b INVENTÁRIO DE AUDIÊNCIAS REAIS]
audiencias_disponiveis: ${JSON.stringify(evAud ?? [], null, 2)}

[5 TAREFA + FORMATO]
Responde EXCLUSIVAMENTE em JSON com:
{
  "estrategia_geral": "string",
  "divisao_orcamento": { "frio_pct": int, "quente_pct": int, "justificacao": "string" },
  "adsets": [ { "funil": "frio|quente", "arquetipo": "lookalike|interesse|broad|advantage_plus|retargeting", "publico": "string", "audience_id_meta": "string|null", "orcamento_dia_eur": number, "racional": "string" } ],
  "conceitos_criativos": [ { "angulo": "string", "descricao": "string" } ],
  "roas_esperado": { "frio": number, "quente": number, "blended": number }
}`;
}

async function callModel(model: string, prompt: string, timeoutMs = 280000): Promise<{ ok: true; data: unknown } | { ok: false; err: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Responde exclusivamente em JSON válido conforme o schema dado. Sem markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    const txt = await r.text();
    if (!r.ok) return { ok: false, err: `HTTP ${r.status}: ${txt.slice(0, 800)}` };
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(txt); } catch { return { ok: false, err: `bad_gateway_json: ${txt.slice(0, 400)}` }; }
    const content = (parsed?.choices as Array<{message?:{content?:string}}>)?.[0]?.message?.content ?? "";
    if (!content) return { ok: false, err: `empty_content: ${txt.slice(0, 400)}` };
    return { ok: true, data: parseProposal(content) };
  } catch (e) {
    return { ok: false, err: (e as Error)?.message ?? String(e) };
  } finally { clearTimeout(t); }
}

async function callModelWithRetry(model: string, prompt: string, maxAttempts = 3): Promise<{ ok: true; data: unknown } | { ok: false; err: string }> {
  let last: { ok: true; data: unknown } | { ok: false; err: string } = { ok: false, err: "no_attempt" };
  const backoffs = [1500, 3000, 6000];
  for (let n = 1; n <= maxAttempts; n++) {
    const res = await callModel(model, prompt);
    const isParseErr = res.ok && res.data && typeof res.data === "object" && (res.data as { __parse_error?: boolean }).__parse_error === true;
    const okUseful = res.ok && !isParseErr;
    if (okUseful) return res;
    last = res.ok && isParseErr
      ? { ok: false, err: `parse_error: ${String((res.data as { raw?: string })?.raw ?? "").slice(0, 400)}` }
      : (res as { ok: false; err: string });
    if (n < maxAttempts) await new Promise((r) => setTimeout(r, backoffs[n - 1] ?? 3000));
  }
  return last;
}

const PRIORITY_PATTERNS = ["ivete","anitta","simone","maiara","zeca","coala","mundo propicio","mundopropicio","eventosportugal","ticketline"];
const EXCLUDE_PATTERNS = ["sotrap","só trap","so trap","veigh","matheus e kauan","luccas neto"];

async function fetchAudienceInventory(sbPublic: ReturnType<typeof createClient>, companyId: string): Promise<unknown[]> {
  const { data, error } = await sbPublic
    .from("meta_custom_audiences")
    .select("name, audience_id_meta, filters, total_records_meta")
    .eq("company_id", companyId)
    .eq("enabled", true)
    .not("audience_id_meta", "is", null)
    .filter("filters->delivery_status->>code", "eq", "200")
    .order("total_records_meta", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error || !data) return [];

  type Row = { name: string; audience_id_meta: string; filters: Record<string, unknown> | null; total_records_meta: number | null };
  const rows = (data as unknown as Row[]).filter((r) => {
    const n = (r.name ?? "").toLowerCase();
    return !EXCLUDE_PATTERNS.some((p) => n.includes(p));
  });
  const map = (r: Row) => ({
    name: r.name, audience_id_meta: r.audience_id_meta,
    subtype: (r.filters as Record<string, unknown> | null)?.["subtype"] ?? null,
    tamanho: r.total_records_meta ?? null,
  });
  const seen = new Set<string>();
  const out: ReturnType<typeof map>[] = [];
  const push = (r: Row) => { if (seen.has(r.audience_id_meta)) return; seen.add(r.audience_id_meta); out.push(map(r)); };
  for (const r of rows) { if (out.length >= 35) break; const n = (r.name ?? "").toLowerCase(); if (PRIORITY_PATTERNS.some((p) => n.includes(p))) push(r); }
  for (const r of rows) { if (out.length >= 35) break; const sub = String((r.filters as Record<string, unknown> | null)?.["subtype"] ?? "").toUpperCase(); if (sub === "LOOKALIKE") push(r); }
  for (const r of rows) { if (out.length >= 35) break; push(r); }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Persistência de candidatos
// ────────────────────────────────────────────────────────────────────────────

async function insertCandidate(
  sbCrm: ReturnType<typeof createClient>,
  duel_id: string,
  source_model: string,
  proposal: unknown,
  ctx: CandidateContext,
): Promise<{ ok: true; id: string } | { ok: false; err: string }> {
  const row = {
    duel_id,
    source_model,
    status: "candidate",
    company_id: ctx.company_id,
    connection_id: ctx.connection_id,
    ad_account_id: ctx.ad_account_id,
    event_id: ctx.event_id,
    name: `[Duelo] ${ctx.campaign_name ?? ctx.source_campaign_id ?? "campanha"} — ${source_model}`.slice(0, 200),
    goal_revenue_eur: ctx.goal_revenue_eur ?? 0,
    total_budget_eur: ctx.total_budget_eur || null,
    target_roas: ctx.target_roas,
    days_until_event: ctx.days_until_event,
    detected_artist: ctx.detected_artist,
    generated_plan: proposal as any,
    generation_model: source_model,
    generated_at: new Date().toISOString(),
    source_campaign_id: ctx.source_campaign_id,
    reference_campaign_id: ctx.reference_campaign_id,
    created_by: ctx.created_by,
    pause_original_mode: "manual",
  };
  const { data, error } = await sbCrm.from("meta_campaign_strategies").insert(row as any).select("id").single();
  if (error) return { ok: false, err: error.message };
  return { ok: true, id: (data as any).id as string };
}

// ────────────────────────────────────────────────────────────────────────────
// Canonical: invoca crm-meta-campaign-redesign ×2 (dry_run)
// ────────────────────────────────────────────────────────────────────────────

type RedesignResult =
  | { ok: true; plan: unknown; rationale: string | null; viability: unknown }
  | { ok: false; err: string };

async function callRedesign(authHeader: string, payload: Record<string, unknown>): Promise<RedesignResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REDESIGN_TIMEOUT_MS);
  try {
    const r = await fetch(REDESIGN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": authHeader },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const txt = await r.text();
    if (!r.ok) return { ok: false, err: `HTTP ${r.status}: ${txt.slice(0, 800)}` };
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(txt); } catch { return { ok: false, err: `bad_json: ${txt.slice(0, 400)}` }; }
    const plan = parsed?.generated_plan ?? null;
    if (!plan) return { ok: false, err: `no_generated_plan: ${txt.slice(0, 400)}` };
    return {
      ok: true,
      plan,
      rationale: (parsed?.redesign_rationale as string | null) ?? null,
      viability: parsed?.viability_analysis ?? null,
    };
  } catch (e) {
    return { ok: false, err: (e as Error)?.message ?? String(e) };
  } finally { clearTimeout(t); }
}

type CanonicalRunArgs = {
  mode: "canonical";
  authHeader: string;
  input: CanonicalInput;
  created_by: string;
};

type LegacyRunArgs = {
  mode: "legacy";
  b: Briefing;
  market: string;
  created_by: string;
};

type RunArgs = CanonicalRunArgs | LegacyRunArgs;

async function runDuel(run_id: string, duel_id: string, args: RunArgs): Promise<void> {
  const sbCrm = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });

  try {
    if (args.mode === "canonical") {
      const { authHeader, input, created_by } = args;
      const basePayload: Record<string, unknown> = { campaign_id: input.campaign_id, dry_run: true };
      if (input.constraints) basePayload.constraints = input.constraints;
      if (typeof input.period_days === "number") basePayload.period_days = input.period_days;

      const [gem, gpt] = await Promise.all([
        callRedesign(authHeader, { ...basePayload, model: GEMINI_MODEL }),
        callRedesign(authHeader, { ...basePayload, model: GPT_MODEL }),
      ]);

      // Resolve contexto da campanha-fonte para persistir candidatos
      const { data: snap } = await (sbCrm as any)
        .from("meta_campaign_snapshot")
        .select("company_id, connection_id, ad_account_id, linked_event_id, name")
        .eq("external_campaign_id", input.campaign_id)
        .maybeSingle();

      if (!snap) {
        await sbCrm.from("audience_duel_runs").update({
          status: "error",
          gemini_error: gem.ok ? "snapshot_missing" : gem.err,
          gpt_error: gpt.ok ? "snapshot_missing" : gpt.err,
        }).eq("id", run_id);
        return;
      }

      const adAccountId = (snap as any).ad_account_id?.startsWith?.("act_")
        ? (snap as any).ad_account_id
        : (snap as any).ad_account_id ? `act_${(snap as any).ad_account_id}` : null;

      const targetRoas = input.caps?.target_blended_roas ?? null;
      // Plano canónico traz summary.recommended_total_budget_eur e summary.expected_revenue_eur
      const extractBudget = (plan: unknown): number | null => {
        const s = (plan as { summary?: { recommended_total_budget_eur?: number } })?.summary;
        return typeof s?.recommended_total_budget_eur === "number" ? s.recommended_total_budget_eur : null;
      };
      const extractRevenue = (plan: unknown): number | null => {
        const s = (plan as { summary?: { expected_revenue_eur?: number } })?.summary;
        return typeof s?.expected_revenue_eur === "number" ? s.expected_revenue_eur : null;
      };
      const extractRoas = (plan: unknown): number | null => {
        const s = (plan as { summary?: { expected_overall_roas?: number } })?.summary;
        return typeof s?.expected_overall_roas === "number" ? s.expected_overall_roas : null;
      };

      const mkCtx = (plan: unknown): CandidateContext => ({
        company_id: (snap as any).company_id,
        connection_id: (snap as any).connection_id ?? null,
        ad_account_id: adAccountId,
        event_id: (snap as any).linked_event_id ?? null,
        campaign_name: (snap as any).name ?? null,
        target_roas: extractRoas(plan) ?? targetRoas,
        total_budget_eur: extractBudget(plan),
        goal_revenue_eur: extractRevenue(plan),
        days_until_event: null,
        source_campaign_id: input.campaign_id,
        reference_campaign_id: input.reference_campaign_id ?? null,
        created_by,
        detected_artist: null,
      });

      const candidateIds: Record<string, string | null> = { gemini: null, gpt: null };
      const candidateErrors: Record<string, string | null> = { gemini: null, gpt: null };

      if (gem.ok) {
        const r = await insertCandidate(sbCrm, duel_id, GEMINI_MODEL, gem.plan, mkCtx(gem.plan));
        if (r.ok) candidateIds.gemini = r.id; else candidateErrors.gemini = r.err;
      }
      if (gpt.ok) {
        const r = await insertCandidate(sbCrm, duel_id, GPT_MODEL, gpt.plan, mkCtx(gpt.plan));
        if (r.ok) candidateIds.gpt = r.id; else candidateErrors.gpt = r.err;
      }

      const persistedAny = !!(candidateIds.gemini || candidateIds.gpt);
      const status = persistedAny ? "done" : "failed";

      await sbCrm.from("audience_duel_runs").update({
        gemini_proposal: gem.ok ? { generated_plan: gem.plan, redesign_rationale: gem.rationale, viability_analysis: gem.viability } : null,
        gemini_error: gem.ok ? (candidateErrors.gemini ? `insert: ${candidateErrors.gemini}` : null) : gem.err,
        gpt_proposal: gpt.ok ? { generated_plan: gpt.plan, redesign_rationale: gpt.rationale, viability_analysis: gpt.viability } : null,
        gpt_error: gpt.ok ? (candidateErrors.gpt ? `insert: ${candidateErrors.gpt}` : null) : gpt.err,
        status,
      }).eq("id", run_id);

      console.log(`[duel] canonical run=${run_id} duel=${duel_id} status=${status} gem_ok=${gem.ok} gpt_ok=${gpt.ok} cand_gem=${candidateIds.gemini} cand_gpt=${candidateIds.gpt}`);
      return;
    }

    // ── LEGACY ────────────────────────────────────────────────────────────
    const sbPublic = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });
    const b = args.b;
    const companyId = b.company_id!;
    const retrieveArgs = {
      p_artist: b.artist ?? null,
      p_music_style: b.music_style ?? null,
      p_music_styles: b.music_styles ?? null,
      p_entity_type: b.entity_type ?? null,
      p_market_scope: args.market,
    };
    const [rCamp, rPub, evAud] = await Promise.all([
      sbCrm.rpc("audience_retrieve", retrieveArgs),
      sbCrm.rpc("audience_retrieve_publics", retrieveArgs),
      fetchAudienceInventory(sbPublic, companyId),
    ]);
    const evCamp = rCamp.error ? { __err: rCamp.error.message } : rCamp.data;
    const evPub = rPub.error ? { __err: rPub.error.message } : rPub.data;
    const prompt = buildPromptLegacy(b, evCamp, evPub, evAud as unknown[]);

    const ctx: CandidateContext = {
      company_id: companyId,
      connection_id: null,
      ad_account_id: null,
      event_id: null,
      campaign_name: `${b.artist ?? "campanha"} — ${b.cidade}`,
      target_roas: null,
      total_budget_eur: b.orcamento_eur,
      goal_revenue_eur: 0,
      days_until_event: b.dias_evento,
      source_campaign_id: null,
      reference_campaign_id: null,
      created_by: args.created_by,
      detected_artist: b.artist ?? null,
    };

    await sbCrm.from("audience_duel_runs").update({
      evidencia: { campanha: evCamp, publicos: evPub, audiencias_disponiveis: evAud },
      prompt, duel_id,
    }).eq("id", run_id);

    const [gem, gpt] = await Promise.all([
      callModelWithRetry(GEMINI_MODEL, prompt, 3),
      callModelWithRetry(GPT_MODEL, prompt, 3),
    ]);

    const candidateIds: Record<string, string | null> = { gemini: null, gpt: null };
    const candidateErrors: Record<string, string | null> = { gemini: null, gpt: null };
    if (gem.ok) { const r = await insertCandidate(sbCrm, duel_id, GEMINI_MODEL, gem.data, ctx); if (r.ok) candidateIds.gemini = r.id; else candidateErrors.gemini = r.err; }
    if (gpt.ok) { const r = await insertCandidate(sbCrm, duel_id, GPT_MODEL, gpt.data, ctx); if (r.ok) candidateIds.gpt = r.id; else candidateErrors.gpt = r.err; }

    await sbCrm.from("audience_duel_runs").update({
      gemini_proposal: gem.ok ? gem.data : null,
      gemini_error: gem.ok ? (candidateErrors.gemini ? `insert: ${candidateErrors.gemini}` : null) : gem.err,
      gpt_proposal: gpt.ok ? gpt.data : null,
      gpt_error: gpt.ok ? (candidateErrors.gpt ? `insert: ${candidateErrors.gpt}` : null) : gpt.err,
      status: (gem.ok || gpt.ok) ? "done" : "error",
    }).eq("id", run_id);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error(`[duel] run ${run_id} crashed:`, msg);
    await sbCrm.from("audience_duel_runs").update({
      status: "error",
      gemini_error: `runDuel_crash: ${msg}`,
      gpt_error: `runDuel_crash: ${msg}`,
    }).eq("id", run_id);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP entry
// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = token === SRK;

  let userId: string | null = null;
  if (!isServiceRole) {
    const sbAuth = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error: uErr } = await sbAuth.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "unauthorized", detail: uErr?.message ?? "invalid_token" }, 401);
    userId = u.user.id;
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json_body" }, 400); }

  const sbCrmInit = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });
  const market = (body.market_scope as string) ?? "PT";

  // ── Modo CANÓNICO: campaign_id presente → redesign ×2 ────────────────────
  if (typeof body.campaign_id === "string" && body.campaign_id.length > 0) {
    if (isServiceRole) {
      return json({ error: "canonical_requires_user_jwt", detail: "DR-2026-06-27c: redesign exige Bearer do utilizador" }, 400);
    }
    const newBody = body as unknown as CanonicalInput;
    const caps: BudgetCaps = {
      target_blended_roas: newBody.caps?.target_blended_roas ?? 8,
      daily_budget_cents: newBody.caps?.daily_budget_cents ?? null,
      lifetime_budget_cents: newBody.caps?.lifetime_budget_cents ?? null,
      roas_floor: newBody.caps?.roas_floor ?? null,
      end_time: newBody.caps?.end_time ?? null,
    };
    if (!(caps.target_blended_roas > 0)) return json({ error: "invalid_caps.target_blended_roas" }, 400);

    const duel_id = crypto.randomUUID();
    const { data: ins, error: insErr } = await sbCrmInit.from("audience_duel_runs").insert({
      briefing: {
        mode: "canonical",
        campaign_id: newBody.campaign_id,
        reference_campaign_id: newBody.reference_campaign_id ?? null,
        caps,
        constraints: newBody.constraints ?? null,
        period_days: newBody.period_days ?? null,
      },
      status: "running",
      gemini_model: GEMINI_MODEL,
      gpt_model: GPT_MODEL,
      duel_id,
      campaign_id: newBody.campaign_id,
    }).select("id").single();
    if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 500);
    const run_id = (ins as any).id as string;

    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil(runDuel(run_id, duel_id, {
      mode: "canonical",
      authHeader,
      input: { ...newBody, caps },
      created_by: userId!,
    }));

    return json({
      run_id, duel_id, status: "running", mode: "canonical",
      gemini_model: GEMINI_MODEL, gpt_model: GPT_MODEL,
    }, 202);
  }

  // ── Modo LEGACY ──────────────────────────────────────────────────────────
  const b = body as unknown as Briefing & { created_by?: string };
  if (!b?.cidade || typeof b.dias_evento !== "number" || typeof b.orcamento_eur !== "number" || !b.objetivo) {
    return json({ error: "missing_fields", required: ["cidade","dias_evento","orcamento_eur","objetivo"] }, 400);
  }
  if (!b.company_id || typeof b.company_id !== "string") {
    return json({ error: "missing_company_id", detail: "legacy Briefing must include company_id (D3)" }, 400);
  }
  const created_by = userId ?? (typeof b.created_by === "string" ? b.created_by : null);
  if (!created_by) return json({ error: "missing_created_by", detail: "service_role calls must provide created_by (uuid)" }, 400);

  const duel_id = crypto.randomUUID();
  const { data: ins, error: insErr } = await sbCrmInit.from("audience_duel_runs").insert({
    briefing: b, status: "running",
    gemini_model: GEMINI_MODEL, gpt_model: GPT_MODEL,
    duel_id,
  }).select("id").single();
  if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 500);
  const run_id = (ins as any).id as string;

  // @ts-ignore EdgeRuntime
  EdgeRuntime.waitUntil(runDuel(run_id, duel_id, { mode: "legacy", b, market, created_by }));
  return json({ run_id, duel_id, status: "running", mode: "legacy", gemini_model: GEMINI_MODEL, gpt_model: GPT_MODEL }, 202);
});
