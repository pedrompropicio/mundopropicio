// crm-audience-duel — Duelo Gemini vs GPT para gerar estratégia de campanha MP Audience
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Modelos escolhidos (catálogo Lovable AI Gateway): melhor Gemini Pro + melhor GPT chat.
const GEMINI_MODEL = "google/gemini-2.5-pro";
const GPT_MODEL = "openai/gpt-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Briefing = {
  artist?: string;
  music_style?: string;
  entity_type?: string;
  cidade: string;
  dias_evento: number;
  orcamento_eur: number;
  objetivo: string;
  market_scope?: string;
};

function cleanJsonText(t: string): string {
  let s = t.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // tenta extrair primeiro objeto {...}
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

function buildPrompt(b: Briefing, evCamp: unknown, evPub: unknown, evAud: unknown[]): string {
  const hasEv =
    (evCamp && Object.keys(evCamp as Record<string, unknown>).length > 0) ||
    (evPub && Array.isArray(evPub) ? (evPub as unknown[]).length > 0 : evPub && Object.keys(evPub as Record<string, unknown>).length > 0);

  return `[1 PAPEL]
És estratega sénior de tráfego pago para eventos de música brasileira em Portugal. Respeitas a evidência histórica fornecida e NUNCA inventas números. A tua criatividade está na estratégia, no racional e nos conceitos criativos — não em fabricar métricas.

[2 EVENTO]
${JSON.stringify(b, null, 2)}

[3 EVIDÊNCIA HISTÓRICA — MP Audience]
${hasEv ? "" : "(sem histórico relevante; usar normas gerais do mercado e dizê-lo claramente no racional)"}
- Metade-CAMPANHA (agregados por funil): ${JSON.stringify(evCamp ?? {}, null, 2)}
- Metade-PÚBLICOS (por funil+arquétipo, com top_publicos): ${JSON.stringify(evPub ?? [], null, 2)}

[3b INVENTÁRIO DE AUDIÊNCIAS REAIS DISPONÍVEIS NA CONTA META — PRONTAS A USAR]
Lista priorizada (eventos/artistas/parceiros alinhados primeiro, depois lookalikes, depois grandes públicos de engajamento). Trap e infantil já foram excluídos por desalinhamento.
audiencias_disponiveis: ${JSON.stringify(evAud ?? [], null, 2)}

[4 PLAYBOOK]
- Frio alimenta quente: sem investir em frio o quente esgota a audiência.
- Retargeting tem teto de saturação rápido — não escala linearmente com orçamento.
- Quente converte melhor por euro mas depende do volume gerado pelo frio.
- Lookalike e interesse alimentam frio com escala diferente.
- Quando a evidência for fraca, ser conservador no ROAS esperado.
- Escolhe os públicos a partir da lista "audiencias_disponiveis" fornecida (usa os nomes e audience_id_meta REAIS). Só propõe 'broad'/'interesses'/'advantage+' quando nenhuma audiência real servir. Para cada adset, quando usares uma audiência real, devolve o audience_id_meta correspondente no campo audience_id_meta.

[5 TAREFA + FORMATO]
Desenha a estrutura completa da campanha. Responde EXCLUSIVAMENTE em JSON válido (sem markdown, sem comentários) com este schema exato:
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

const MP_COMPANY_ID = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const PRIORITY_PATTERNS = ["ivete","anitta","simone","maiara","zeca","coala","mundo propicio","mundopropicio","eventosportugal","ticketline"];
const EXCLUDE_PATTERNS = ["sotrap","só trap","so trap","veigh","matheus e kauan","luccas neto"];

async function fetchAudienceInventory(sbPublic: ReturnType<typeof createClient>): Promise<unknown[]> {
  const { data, error } = await sbPublic
    .from("meta_custom_audiences")
    .select("name, audience_id_meta, filters, total_records_meta")
    .eq("company_id", MP_COMPANY_ID)
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
    name: r.name,
    audience_id_meta: r.audience_id_meta,
    subtype: (r.filters as Record<string, unknown> | null)?.["subtype"] ?? null,
    tamanho: r.total_records_meta ?? null,
  });

  const seen = new Set<string>();
  const out: ReturnType<typeof map>[] = [];
  const push = (r: Row) => {
    if (seen.has(r.audience_id_meta)) return;
    seen.add(r.audience_id_meta);
    out.push(map(r));
  };

  // 1) prioridade: nomes que casam com artistas/parceiros do evento
  for (const r of rows) {
    if (out.length >= 60) break;
    const n = (r.name ?? "").toLowerCase();
    if (PRIORITY_PATTERNS.some((p) => n.includes(p))) push(r);
  }
  // 2) lookalikes
  for (const r of rows) {
    if (out.length >= 60) break;
    const sub = String((r.filters as Record<string, unknown> | null)?.["subtype"] ?? "").toUpperCase();
    if (sub === "LOOKALIKE") push(r);
  }
  // 3) completa com as maiores
  for (const r of rows) {
    if (out.length >= 60) break;
    push(r);
  }
  return out;
}

async function callModel(model: string, prompt: string, timeoutMs = 110000): Promise<{ ok: true; data: unknown } | { ok: false; err: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
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
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let b: Briefing;
  try { b = await req.json(); } catch { return json({ error: "invalid_json_body" }, 400); }
  if (!b?.cidade || typeof b.dias_evento !== "number" || typeof b.orcamento_eur !== "number" || !b.objetivo) {
    return json({ error: "missing_fields", required: ["cidade","dias_evento","orcamento_eur","objetivo"] }, 400);
  }
  const market = b.market_scope ?? "PT";

  const sbCrm = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });
  const sbPublic = createClient(SUPABASE_URL, SRK, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // a) retrieval (evidência histórica + inventário real de audiências)
  const [rCamp, rPub, evAud] = await Promise.all([
    sbCrm.rpc("audience_retrieve", {
      p_artist: b.artist ?? null,
      p_music_style: b.music_style ?? null,
      p_entity_type: b.entity_type ?? null,
      p_market_scope: market,
    }),
    sbCrm.rpc("audience_retrieve_publics", {
      p_artist: b.artist ?? null,
      p_music_style: b.music_style ?? null,
      p_entity_type: b.entity_type ?? null,
      p_market_scope: market,
    }),
    fetchAudienceInventory(sbPublic),
  ]);

  const evCamp = rCamp.error ? { __err: rCamp.error.message } : rCamp.data;
  const evPub = rPub.error ? { __err: rPub.error.message } : rPub.data;
  const evidencia = { campanha: evCamp, publicos: evPub, audiencias_disponiveis: evAud };

  // b) prompt
  const prompt = buildPrompt(b, evCamp, evPub, evAud);

  // c) duelo paralelo
  const [gem, gpt] = await Promise.all([
    callModel(GEMINI_MODEL, prompt),
    callModel(GPT_MODEL, prompt),
  ]);

  const gemProposal = gem.ok ? gem.data : null;
  const gemError = gem.ok ? null : gem.err;
  const gptProposal = gpt.ok ? gpt.data : null;
  const gptError = gpt.ok ? null : gpt.err;

  // e) gravar
  const { data: ins, error: insErr } = await sbCrm.from("audience_duel_runs").insert({
    briefing: b,
    evidencia,
    prompt,
    gemini_model: GEMINI_MODEL,
    gemini_proposal: gemProposal,
    gemini_error: gemError,
    gpt_model: GPT_MODEL,
    gpt_proposal: gptProposal,
    gpt_error: gptError,
  }).select("id").single();

  if (insErr) return json({ error: "insert_failed", detail: insErr.message, ok_gemini: gem.ok, ok_gpt: gpt.ok }, 500);

  return json({
    run_id: ins.id,
    gemini_model: GEMINI_MODEL,
    gpt_model: GPT_MODEL,
    ok_gemini: gem.ok,
    ok_gpt: gpt.ok,
    ...(gemError ? { gemini_error: gemError } : {}),
    ...(gptError ? { gpt_error: gptError } : {}),
  });
});
