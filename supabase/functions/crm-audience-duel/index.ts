// crm-audience-duel — Duelo Gemini vs GPT para gerar estratégia de campanha MP Audience.
// DR-2026-06-26 ponto 4 + DR-2026-06-26b (D2/D3). Sub-tarefa 4 da #19.
//
// INPUT dual:
//   A) novo: { campaign_id, reference_campaign_id?, caps?, period_days? } → buildCampaignBrief
//   B) legacy: Briefing { cidade, dias_evento, orcamento_eur, objetivo, company_id, ... }
//
// Auth dual-mode: JWT user OU service_role. Sem anon.
// Persistência: 2 candidatos em crm.meta_campaign_strategies (status='candidate', duel_id partilhado, source_model).
// Log operacional continua em crm.audience_duel_runs (+ duel_id + campaign_id).

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { buildCampaignBrief, BudgetCaps, CampaignBrief } from "../_shared/campaign-brief.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const GEMINI_MODEL = "google/gemini-2.5-pro";
const GPT_MODEL = "openai/gpt-5";

const DIAGNOSIS_TRUNCATE_CHARS = 12000; // D4 — caller trunca

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
  company_id?: string; // D3: obrigatório no caminho legacy
};

type NewModeInput = {
  campaign_id: string;
  reference_campaign_id?: string | null;
  caps?: Partial<BudgetCaps>;
  period_days?: number;
};

// ────────────────────────────────────────────────────────────────────────────
// JSON utils
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

// ────────────────────────────────────────────────────────────────────────────
// Prompt
// ────────────────────────────────────────────────────────────────────────────

function summarizeWinners(brief: CampaignBrief): string {
  const w = brief.winners_packet ?? [];
  const winners = w.filter(x => x.label === "winner");
  const losers = w.filter(x => x.label === "loser");
  const inconc = w.filter(x => x.label === "inconclusive").length;
  const fmt = (c: typeof w[number]) => ({
    meta_creative_id: c.meta_creative_id,
    name: c.library?.name ?? c.ad_name ?? null,
    headline: c.library?.headline ?? null,
    body: c.library?.body ?? null,
    cta: c.library?.cta_type ?? null,
    spend_eur: c.performance.spend_eur,
    purchases: c.performance.purchases_count,
    roas: c.performance.roas,
  });
  return JSON.stringify({
    rules: brief.meta.rules,
    winner_roas_threshold: brief.winner_roas_threshold,
    winners: winners.map(fmt),
    losers: losers.map(fmt),
    inconclusive_count: inconc,
  }, null, 2);
}

function buildPromptLegacy(b: Briefing, evCamp: unknown, evPub: unknown, evAud: unknown[]): string {
  const hasEv =
    (evCamp && Object.keys(evCamp as Record<string, unknown>).length > 0) ||
    (evPub && (Array.isArray(evPub) ? (evPub as unknown[]).length > 0 : Object.keys(evPub as Record<string, unknown>).length > 0));

  return `[1 PAPEL]
És estratega sénior de tráfego pago para eventos de música brasileira em Portugal. Respeitas a evidência histórica fornecida e NUNCA inventas números. A tua criatividade está na estratégia, no racional e nos conceitos criativos — não em fabricar métricas.

[2 EVENTO]
${JSON.stringify(b, null, 2)}

[3 EVIDÊNCIA HISTÓRICA — MP Audience]
${hasEv ? "" : "(sem histórico relevante; usar normas gerais do mercado e dizê-lo claramente no racional)"}
- Metade-CAMPANHA (agregados por funil): ${JSON.stringify(evCamp ?? {}, null, 2)}
- Metade-PÚBLICOS (por funil+arquétipo, com top_publicos): ${JSON.stringify(evPub ?? [], null, 2)}

[3b INVENTÁRIO DE AUDIÊNCIAS REAIS DISPONÍVEIS NA CONTA META — PRONTAS A USAR]
Lista priorizada. Trap e infantil excluídos.
audiencias_disponiveis: ${JSON.stringify(evAud ?? [], null, 2)}

[4 PLAYBOOK]
- Frio alimenta quente: sem investir em frio o quente esgota a audiência.
- Retargeting tem teto de saturação rápido — não escala linearmente.
- Quente converte melhor por euro mas depende do volume do frio.
- Lookalike e interesse alimentam frio com escala diferente.
- Evidência fraca → ser conservador no ROAS esperado.
- Escolhe públicos a partir de "audiencias_disponiveis" (nomes e audience_id_meta REAIS).

[5 TAREFA + FORMATO]
Desenha a estrutura completa da campanha. Responde EXCLUSIVAMENTE em JSON válido com este schema:
{
  "estrategia_geral": "string",
  "divisao_orcamento": { "frio_pct": int, "quente_pct": int, "justificacao": "string" },
  "adsets": [
    { "funil": "frio|quente", "arquetipo": "lookalike|interesse|broad|advantage_plus|retargeting",
      "publico": "string", "audience_id_meta": "string|null", "orcamento_dia_eur": number, "racional": "string" }
  ],
  "conceitos_criativos": [ { "angulo": "string", "descricao": "string" } ],
  "roas_esperado": { "frio": number, "quente": number, "blended": number }
}`;
}

// Mapa determinístico classe → postura. Lido de brief.diagnosis_360.source_campaign_class.
// Valores conhecidos: 'fraca' | 'em_maturacao' | 'saudavel_subindo' | 'saudavel_caindo' | null.
function posturaPorClasse(brief: CampaignBrief): { classe: string | null; postura: string } {
  const diag = brief.diagnosis_360 as Record<string, unknown> | null;
  const classe = diag && typeof diag["source_campaign_class"] === "string"
    ? (diag["source_campaign_class"] as string)
    : null;

  switch (classe) {
    case "fraca":
      return { classe, postura:
        "POSTURA (classe=fraca): a campanha-fonte está MAL CONFIGURADA. Redesenha do ZERO. "
        + "Apoia-te sobretudo na campanha-referência (quando exista) e em best-practice de mercado. "
        + "Da campanha atual usa SÓ os vencedores determinísticos do pacote [7]. NÃO preserves a estrutura, "
        + "nº de adsets, audiências ou divisão de verba atuais — provavelmente são parte do problema. "
        + "No racional explica o que estava errado e porquê o novo desenho é melhor." };
    case "em_maturacao":
      return { classe, postura:
        "POSTURA (classe=em_maturacao): a campanha ainda está a aprender. NÃO redesenhes do zero — "
        + "propõe mudanças CIRÚRGICAS. Preserva o que está em fase de aprendizagem; corrige só o que "
        + "está claramente mal. Adicionar/cortar verba é OK; trocar audiências/criativos só com justificação forte." };
    case "saudavel_subindo":
    case "saudavel_caindo":
      return { classe, postura:
        "POSTURA (classe=saudavel): há um motor a funcionar. PRESERVA e ESCALA o que já ganha "
        + "(vencedores do pacote [7], audiências/adsets com ROAS acima do alvo). Muda apenas o que está "
        + "claramente a arrastar a campanha (losers, audiências saturadas). Não redesenhes por redesenhar." };
    default:
      return { classe, postura:
        "POSTURA (SEM diagnóstico determinístico disponível): não há classificação 360 da campanha-fonte. "
        + "Assume postura conservadora: redesenho apoiado na campanha-referência (se existir) e em normas "
        + "gerais de mercado. Diz EXPLICITAMENTE no racional que não há diagnóstico." };
  }
}

function buildPromptFromBrief(brief: CampaignBrief, evCamp: unknown, evPub: unknown, evAud: unknown[]): string {
  // D4: trunca o diagnosis_360 ao serializar
  let diagStr = "(sem diagnóstico 360 — usar normas gerais e indicá-lo no racional)";
  if (brief.diagnosis_360) {
    const full = JSON.stringify(brief.diagnosis_360);
    diagStr = full.length > DIAGNOSIS_TRUNCATE_CHARS
      ? full.slice(0, DIAGNOSIS_TRUNCATE_CHARS) + " /* …truncado… */"
      : full;
  }

  const totalBudgetEur = deriveTotalBudgetEur(brief);
  const { classe, postura } = posturaPorClasse(brief);

  const eventInfo = {
    name: brief.event.name,
    effective_date: brief.event.effective_date,
    days_until: brief.event.days_until,
    location: brief.event.location,
    tickets_total: brief.event.tickets_total,
  };

  return `[1 PAPEL]
És estratega sénior de tráfego pago para eventos de música brasileira em Portugal. Respeitas FACTOS DETERMINÍSTICOS fornecidos e NUNCA inventas números, criativos, audiências ou IDs. A tua criatividade está na ESTRATÉGIA, no RACIONAL e nos conceitos criativos — não em fabricar dados.

[1b ENQUADRAMENTO — EVIDÊNCIA, NÃO MOLDE]
A campanha-fonte e o seu histórico são EVIDÊNCIA do que funcionou e do que falhou — NÃO são um molde a preservar. O OBJETIVO é desenhar a campanha ÓTIMA para o evento, com liberdade TOTAL sobre estrutura, número de adsets, divisão de verba, audiências e criativos.

Ancora APENAS a três fontes:
(1) o pacote de vencedores DETERMINÍSTICO [7] — criativos winner e audience_id_meta reais que converteram;
(2) a campanha-referência [8] quando exista;
(3) boas práticas de mercado e o playbook [12].

NÃO replicar a estrutura/config atuais [2]/[6] só porque existem. Se a configuração atual parece mal montada, DIZ-LO no racional e propõe melhor. P0: usar SÓ meta_creative_id e audience_id_meta REAIS; nunca inventar IDs ou métricas.

[1c POSTURA DETERMINÍSTICA (classe=${classe ?? "n/d"})]
${postura}

[2 CAMPANHA EM FOCO]
${JSON.stringify({
  external_campaign_id: brief.campaign.external_campaign_id,
  name: brief.campaign.name,
  objective: brief.campaign.objective,
  currency: brief.campaign.currency,
  status: brief.campaign.status,
  effective_status: brief.campaign.effective_status,
  daily_budget_cents: brief.campaign.daily_budget_cents,
  lifetime_budget_cents: brief.campaign.lifetime_budget_cents,
}, null, 2)}

[2b CAPS / OBJETIVOS]
${JSON.stringify({
  target_blended_roas: brief.caps.target_blended_roas,
  winner_roas_threshold: brief.winner_roas_threshold,
  total_budget_eur_estimado: totalBudgetEur,
  caps: brief.caps,
}, null, 2)}

[3 EVENTO]
${JSON.stringify(eventInfo, null, 2)}

[4 DIAGNÓSTICO 360 (determinístico, factual)]
${diagStr}

[5 ROAS BUCKETS]
${JSON.stringify(brief.roas_buckets, null, 2)}

[6 ADSETS ATUAIS (referência factual — NÃO molde)]
${JSON.stringify(brief.adsets, null, 2)}

[7 PACOTE DE VENCEDORES (determinístico — P0)]
Os criativos abaixo foram classificados DETERMINISTICAMENTE pela regra rules (ROAS ratio + gates).
NÃO inventes outros criativos. Quando referires um criativo, usa o meta_creative_id REAL.
${summarizeWinners(brief)}

[8 CAMPANHA-REFERÊNCIA (opcional)]
${brief.reference ? JSON.stringify({
  external_campaign_id: brief.reference.external_campaign_id,
  name: brief.reference.name,
  creatives_count: brief.reference.creatives.length,
  adsets_count: brief.reference.adsets.length,
}, null, 2) : "(sem referência)"}

[9 AUDIÊNCIAS DO BRIEF (custom audiences da conta Meta — best-effort)]
${JSON.stringify(brief.audiences ?? [], null, 2)}

[9b INVENTÁRIO DE AUDIÊNCIAS REAIS — fonte alternativa do duelo]
Lista priorizada (artistas/parceiros, depois LAL, depois maiores). Trap e infantil excluídos.
audiencias_disponiveis: ${JSON.stringify(evAud ?? [], null, 2)}

[10 PEERS — outras campanhas do mesmo evento]
${JSON.stringify(brief.peers ?? [], null, 2)}

[11 EVIDÊNCIA AGREGADA HISTÓRICA — MP Audience]
- Metade-CAMPANHA: ${JSON.stringify(evCamp ?? {}, null, 2)}
- Metade-PÚBLICOS: ${JSON.stringify(evPub ?? [], null, 2)}

[12 PLAYBOOK]
- Frio alimenta quente; retargeting satura rápido; lookalike escala.
- Quando a evidência é fraca, ser conservador no ROAS esperado.
- USA APENAS audience_id_meta REAIS das listas [9] ou [9b].
- USA APENAS meta_creative_id REAIS do pacote [7] quando citares criativos.
- NUNCA inventes IDs, nomes ou métricas.

[13 TAREFA + FORMATO]
Desenha a estrutura ÓTIMA da campanha (não a atual). Responde EXCLUSIVAMENTE em JSON válido com este schema:
{
  "estrategia_geral": "string",
  "divisao_orcamento": { "frio_pct": int, "quente_pct": int, "justificacao": "string" },
  "adsets": [
    { "funil": "frio|quente", "arquetipo": "lookalike|interesse|broad|advantage_plus|retargeting",
      "publico": "string", "audience_id_meta": "string|null", "orcamento_dia_eur": number, "racional": "string" }
  ],
  "conceitos_criativos": [ { "angulo": "string", "descricao": "string", "ref_meta_creative_id": "string|null" } ],
  "roas_esperado": { "frio": number, "quente": number, "blended": number }
}`;
}


function deriveTotalBudgetEur(brief: CampaignBrief): number {
  // Heurística determinística para popular goal_revenue_eur:
  // 1) lifetime se existe; 2) daily * days_until (clamp 7..60); 3) soma adsets lifetime; 4) soma adsets daily * days_until; 5) 0
  const days = Math.min(Math.max(brief.event?.days_until ?? 30, 7), 60);
  const camp = brief.campaign;
  if (camp.lifetime_budget_cents && camp.lifetime_budget_cents > 0) return camp.lifetime_budget_cents / 100;
  if (camp.daily_budget_cents && camp.daily_budget_cents > 0) return (camp.daily_budget_cents / 100) * days;
  const adLife = (brief.adsets ?? []).reduce((s, a) => s + (a.lifetime_budget_cents ?? 0), 0);
  if (adLife > 0) return adLife / 100;
  const adDaily = (brief.adsets ?? []).reduce((s, a) => s + (a.daily_budget_cents ?? 0), 0);
  if (adDaily > 0) return (adDaily / 100) * days;
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Audiences inventory (mantido — não tocar)
// ────────────────────────────────────────────────────────────────────────────

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
// Gateway calls
// ────────────────────────────────────────────────────────────────────────────

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
    if (!content) {
      console.error(`[duel][gateway-empty] model=${model} status=${r.status} body=${txt.slice(0, 800)}`);
      return { ok: false, err: `empty_content: ${txt.slice(0, 400)}` };
    }
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
    console.log(`[duel] ${model} attempt ${n}/${maxAttempts} ok=${okUseful}`);
    if (okUseful) return res;
    if (res.ok && isParseErr) {
      const raw = String((res.data as { raw?: string })?.raw ?? "");
      console.error(`[duel][gateway-empty] kind=parse_error model=${model} attempt=${n} raw=${raw.slice(0, 800)}`);
      last = { ok: false, err: `parse_error: ${raw.slice(0, 400)}` };
    } else {
      last = res as { ok: false; err: string };
    }
    if (n < maxAttempts) await new Promise((r) => setTimeout(r, backoffs[n - 1] ?? 3000));
  }
  return last;
}


// ────────────────────────────────────────────────────────────────────────────
// Persistência candidatos
// ────────────────────────────────────────────────────────────────────────────

type CandidateContext = {
  company_id: string;
  connection_id: string | null;
  ad_account_id: string | null;
  event_id: string | null;
  campaign_name: string | null;
  target_roas: number;
  total_budget_eur: number;
  goal_revenue_eur: number;
  days_until_event: number | null;
  source_campaign_id: string | null;
  reference_campaign_id: string | null;
  created_by: string;
  detected_artist: string | null;
};

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
    name: `[Duelo] ${ctx.campaign_name ?? ctx.source_campaign_id ?? "campanha"} — ${source_model}`,
    goal_revenue_eur: ctx.goal_revenue_eur,
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
    pause_original_mode: "manual", // duelo não pausa nada automaticamente
  };
  const { data, error } = await sbCrm.from("meta_campaign_strategies").insert(row as any).select("id").single();
  if (error) return { ok: false, err: error.message };
  return { ok: true, id: (data as any).id as string };
}

// ────────────────────────────────────────────────────────────────────────────
// runDuel (background)
// ────────────────────────────────────────────────────────────────────────────

type RunArgs =
  | { mode: "brief"; brief: CampaignBrief; market: string; created_by: string }
  | { mode: "legacy"; b: Briefing; market: string; created_by: string };

async function runDuel(run_id: string, duel_id: string, args: RunArgs): Promise<void> {
  const sbCrm = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });
  const sbPublic = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // companyId para fetchAudienceInventory + retrieve params
    let companyId: string;
    let retrieveArgs: Record<string, unknown>;
    let prompt: string;
    let ctx: CandidateContext | null = null;

    if (args.mode === "brief") {
      const brief = args.brief;
      companyId = brief.campaign.company_id;
      retrieveArgs = {
        p_artist: null,
        p_music_style: null,
        p_music_styles: null,
        p_entity_type: null,
        p_market_scope: args.market,
      };

      const [rCamp, rPub, evAud] = await Promise.all([
        sbCrm.rpc("audience_retrieve", retrieveArgs),
        sbCrm.rpc("audience_retrieve_publics", retrieveArgs),
        fetchAudienceInventory(sbPublic, companyId),
      ]);
      const evCamp = rCamp.error ? { __err: rCamp.error.message } : rCamp.data;
      const evPub = rPub.error ? { __err: rPub.error.message } : rPub.data;

      prompt = buildPromptFromBrief(brief, evCamp, evPub, evAud as unknown[]);

      const totalBudgetEur = deriveTotalBudgetEur(brief);
      ctx = {
        company_id: companyId,
        connection_id: brief.campaign.connection_id,
        ad_account_id: brief.campaign.ad_account_id,
        event_id: brief.event?.id ?? brief.campaign.linked_event_id ?? null,
        campaign_name: brief.campaign.name,
        target_roas: brief.caps.target_blended_roas,
        total_budget_eur: totalBudgetEur,
        goal_revenue_eur: Math.round(totalBudgetEur * brief.caps.target_blended_roas * 100) / 100,
        days_until_event: brief.event?.days_until ?? null,
        source_campaign_id: brief.campaign.external_campaign_id,
        reference_campaign_id: brief.reference?.external_campaign_id ?? null,
        created_by: args.created_by,
        detected_artist: null,
      };

      await sbCrm.from("audience_duel_runs").update({
        evidencia: { campanha: evCamp, publicos: evPub, audiencias_disponiveis: evAud, brief },
        prompt, duel_id, campaign_id: brief.campaign.external_campaign_id,
      }).eq("id", run_id);
    } else {
      const b = args.b;
      companyId = b.company_id!;
      retrieveArgs = {
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
      prompt = buildPromptLegacy(b, evCamp, evPub, evAud as unknown[]);

      ctx = {
        company_id: companyId,
        connection_id: null,
        ad_account_id: null,
        event_id: null,
        campaign_name: `${b.artist ?? "campanha"} — ${b.cidade}`,
        target_roas: 0,
        total_budget_eur: b.orcamento_eur,
        goal_revenue_eur: 0, // sem target_roas no legacy → 0
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
    }

    // duelo paralelo — simetria: ambos com retry
    const [gem, gpt] = await Promise.all([
      callModelWithRetry(GEMINI_MODEL, prompt, 3),
      callModelWithRetry(GPT_MODEL, prompt, 3),
    ]);

    const gemProposal = gem.ok ? gem.data : null;
    const gemError = gem.ok ? null : gem.err;
    const gptProposal = gpt.ok ? gpt.data : null;
    const gptError = gpt.ok ? null : gpt.err;
    const status = (gem.ok || gpt.ok) ? "done" : "error";

    // Persiste candidatos válidos
    const candidateIds: Record<string, string | null> = { gemini: null, gpt: null };
    const candidateErrors: Record<string, string | null> = { gemini: null, gpt: null };

    if (gem.ok && ctx) {
      const r = await insertCandidate(sbCrm, duel_id, GEMINI_MODEL, gemProposal, ctx);
      if (r.ok) candidateIds.gemini = r.id; else candidateErrors.gemini = r.err;
    }
    if (gpt.ok && ctx) {
      const r = await insertCandidate(sbCrm, duel_id, GPT_MODEL, gptProposal, ctx);
      if (r.ok) candidateIds.gpt = r.id; else candidateErrors.gpt = r.err;
    }

    await sbCrm.from("audience_duel_runs").update({
      gemini_proposal: gemProposal,
      gemini_error: gemError ? `${gemError}` : (candidateErrors.gemini ? `insert: ${candidateErrors.gemini}` : null),
      gpt_proposal: gptProposal,
      gpt_error: gptError ? `${gptError}` : (candidateErrors.gpt ? `insert: ${candidateErrors.gpt}` : null),
      status,
    }).eq("id", run_id);

    console.log(`[duel] run=${run_id} duel=${duel_id} status=${status} gem_ok=${gem.ok} gpt_ok=${gpt.ok} cand_gem=${candidateIds.gemini} cand_gpt=${candidateIds.gpt}`);
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

  // Auth dual-mode (JWT user OU service_role). Sem anon.
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

  // ── Modo NOVO: campaign_id presente ───────────────────────────────────────
  if (typeof body.campaign_id === "string" && body.campaign_id.length > 0) {
    const newBody = body as unknown as NewModeInput & { created_by?: string };
    const caps: BudgetCaps = {
      target_blended_roas: newBody.caps?.target_blended_roas ?? 8,
      daily_budget_cents: newBody.caps?.daily_budget_cents ?? null,
      lifetime_budget_cents: newBody.caps?.lifetime_budget_cents ?? null,
      roas_floor: newBody.caps?.roas_floor ?? null,
      end_time: newBody.caps?.end_time ?? null,
    };
    if (!(caps.target_blended_roas > 0)) return json({ error: "invalid_caps.target_blended_roas" }, 400);

    // created_by: JWT → user.id; service_role → exige body.created_by
    const created_by = userId ?? (typeof newBody.created_by === "string" ? newBody.created_by : null);
    if (!created_by) return json({ error: "missing_created_by", detail: "service_role calls must provide created_by (uuid)" }, 400);

    // Cliente service_role para o brief (campaign-brief precisa cruzar schemas)
    const sbForBrief = createClient(SUPABASE_URL, SRK, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve access_token a partir da connection (como crm-campaign-brief)
    let accessToken: string | null = null;
    try {
      const { data: snap } = await (sbForBrief as any)
        .schema("crm").from("meta_campaign_snapshot")
        .select("connection_id")
        .eq("external_campaign_id", newBody.campaign_id)
        .maybeSingle();
      if (snap?.connection_id) {
        const { data: tokenRows } = await sbForBrief.rpc("crm_get_meta_decrypted_token", {
          p_connection_id: snap.connection_id, p_master_key: ENCRYPTION_MASTER_KEY,
        });
        if (Array.isArray(tokenRows) && tokenRows.length > 0) accessToken = (tokenRows[0] as any).access_token ?? null;
      }
    } catch (e) {
      console.warn("[duel] token_resolve_failed", (e as Error).message);
    }

    let brief: CampaignBrief;
    try {
      brief = await buildCampaignBrief({
        supabase: sbForBrief,
        campaign_id: newBody.campaign_id,
        caps,
        reference_campaign_id: newBody.reference_campaign_id ?? null,
        period_days: newBody.period_days,
        meta_access_token: accessToken,
      });
    } catch (e) {
      return json({ error: "build_brief_failed", detail: (e as Error).message }, 200);
    }

    const duel_id = crypto.randomUUID();
    const { data: ins, error: insErr } = await sbCrmInit.from("audience_duel_runs").insert({
      briefing: { mode: "brief", campaign_id: newBody.campaign_id, caps, reference_campaign_id: newBody.reference_campaign_id ?? null },
      status: "running",
      gemini_model: GEMINI_MODEL,
      gpt_model: GPT_MODEL,
      duel_id,
      campaign_id: newBody.campaign_id,
    }).select("id").single();
    if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 500);
    const run_id = (ins as any).id as string;

    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil(runDuel(run_id, duel_id, { mode: "brief", brief, market, created_by }));

    return json({ run_id, duel_id, status: "running", mode: "brief", gemini_model: GEMINI_MODEL, gpt_model: GPT_MODEL }, 202);
  }

  // ── Modo LEGACY: Briefing ─────────────────────────────────────────────────
  const b = body as unknown as Briefing & { created_by?: string };
  if (!b?.cidade || typeof b.dias_evento !== "number" || typeof b.orcamento_eur !== "number" || !b.objetivo) {
    return json({ error: "missing_fields", required: ["cidade","dias_evento","orcamento_eur","objetivo"] }, 400);
  }
  // D3: company_id obrigatório no legacy — NUNCA default para MP
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
