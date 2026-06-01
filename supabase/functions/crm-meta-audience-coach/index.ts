// cold-start trigger: 2026-06-01-v2 secret rotation
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizeAdAccountId(raw: string): string {
  const c = raw.trim();
  return c.startsWith("act_") ? c : `act_${c}`;
}

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

function sumPurchaseActions(arr: any[] | undefined): number {
  if (!Array.isArray(arr)) return 0;
  const omni = arr.find((a) => a.action_type === "omni_purchase");
  if (omni) return parseInt(omni.value, 10) || 0;
  const std = arr.find((a) => a.action_type === "purchase");
  return std ? parseInt(std.value, 10) || 0 : 0;
}
function sumPurchaseValues(arr: any[] | undefined): number {
  if (!Array.isArray(arr)) return 0;
  const omni = arr.find((a) => a.action_type === "omni_purchase");
  if (omni) return parseFloat(omni.value) || 0;
  const std = arr.find((a) => a.action_type === "purchase");
  return std ? parseFloat(std.value) || 0 : 0;
}

function summarizeTargeting(t: any) {
  if (!t) return { age: "—", genders: ["all"], countries: [], interests: [], custom_audiences: [] };
  const genders = (() => {
    const g = t.genders;
    if (!Array.isArray(g) || g.length === 0) return ["all"];
    const map: any = { 1: "male", 2: "female" };
    return g.map((x: any) => map[x] || String(x));
  })();
  return {
    age: t.age_min && t.age_max ? `${t.age_min}-${t.age_max}` : "—",
    genders,
    countries: t.geo_locations?.countries || [],
    interests: (t.interests || []).map((i: any) => ({ id: i.id, name: i.name })),
    custom_audiences: (t.custom_audiences || []).map((c: any) => ({ id: c.id, name: c.name })),
  };
}

function detectArtist(name: string): string | null {
  if (!name) return null;
  let s = name;
  // strip bracketed prefixes
  s = s.replace(/\[[^\]]+\]/g, " ");
  // strip years
  s = s.replace(/\b(19|20)\d{2}\b/g, " ");
  // strip dates dd/mm or dd-mm
  s = s.replace(/\b\d{1,2}[\/\-\.]\d{1,2}([\/\-\.]\d{2,4})?\b/g, " ");
  // remove generic words
  const generic = ["ensaios","ensaio","tour","show","shows","festival","concerto","concertos","lisboa","porto","cascais","cidade","trafego","tráfego","vendas","soldout","sold","out","f","q","meo","arena","altice","coliseu","retargeting","conversao","conversão","alcance","reach","video","vídeo"];
  const tokens = s.split(/[\s\-_,\|]+/).filter(Boolean).filter(t => {
    const low = t.toLowerCase().replace(/[^\p{L}]/gu, "");
    return low.length > 1 && !generic.includes(low);
  });
  if (tokens.length === 0) return null;
  return tokens.slice(0, 2).join(" ").trim() || null;
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);
  if (!LOVABLE_API_KEY) return json({ error: "missing_lovable_api_key" }, 500);

  let body: { connection_id?: string; ad_account_id?: string; campaign_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { connection_id: connectionId, ad_account_id: rawAcct, campaign_id: campaignId } = body;
  if (!connectionId || !rawAcct || !campaignId) return json({ error: "missing_params" }, 400);
  const adAccountId = normalizeAdAccountId(rawAcct);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
    p_connection_id: connectionId, p_master_key: ENCRYPTION_MASTER_KEY,
  });
  if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
    return json({ error: "connection_not_found_or_unauthorised", detail: tokenErr?.message }, 403);
  }
  const { access_token: accessToken } = tokenRows[0] as { access_token: string };

  // Snapshot da campanha + linked_event
  let snapshot: any = null;
  try {
    const { data } = await (supabase as any).schema("crm")
      .from("meta_campaign_snapshot")
      .select("external_campaign_id,name,objective,status,linked_event_id")
      .eq("connection_id", connectionId)
      .eq("external_campaign_id", campaignId)
      .maybeSingle();
    snapshot = data;
  } catch (e) { console.error("[coach] snapshot err:", e); }

  let event: any = null;
  if (snapshot?.linked_event_id) {
    try {
      const { data } = await supabase.from("events")
        .select("id,name,start_at")
        .eq("id", snapshot.linked_event_id)
        .maybeSingle();
      event = data;
    } catch (e) { console.error("[coach] event err:", e); }
  }

  // Adsets + targeting
  let adsets: any[] = [];
  try {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${campaignId}/adsets`);
    u.searchParams.set("fields", "id,name,targeting,optimization_goal,effective_status");
    u.searchParams.set("limit", "20");
    u.searchParams.set("access_token", accessToken);
    const r = await fetch(u);
    const j = await r.json();
    if (r.ok && !j.error) {
      adsets = (j.data ?? []).map((a: any) => ({
        id: a.id, name: a.name, effective_status: a.effective_status,
        optimization_goal: a.optimization_goal,
        targeting: summarizeTargeting(a.targeting),
      }));
    }
  } catch (e) { console.error("[coach] adsets err:", e); }

  // Métricas 30d da campanha
  const today = new Date();
  const since30 = new Date(today); since30.setUTCDate(since30.getUTCDate() - 30);
  let metrics = { roas: 0, spend_eur: 0, revenue_eur: 0, ctr: 0, frequency: 0 };
  try {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${campaignId}/insights`);
    u.searchParams.set("fields", "spend,actions,action_values,ctr,frequency");
    u.searchParams.set("time_range", JSON.stringify({ since: ymd(since30), until: ymd(today) }));
    u.searchParams.set("access_token", accessToken);
    const r = await fetch(u);
    const j = await r.json();
    if (r.ok && !j.error && Array.isArray(j.data) && j.data[0]) {
      const it = j.data[0];
      const spend = parseFloat(it.spend) || 0;
      const revenue = sumPurchaseValues(it.action_values);
      metrics = {
        spend_eur: spend,
        revenue_eur: revenue,
        roas: spend > 0 ? revenue / spend : 0,
        ctr: it.ctr ? parseFloat(it.ctr) / 100 : 0,
        frequency: it.frequency ? parseFloat(it.frequency) : 0,
      };
    }
  } catch (e) { console.error("[coach] metrics err:", e); }

  // Top performers 90d
  const since90 = new Date(today); since90.setUTCDate(since90.getUTCDate() - 90);
  let topPerformers: any[] = [];
  try {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`);
    u.searchParams.set("level", "campaign");
    u.searchParams.set("fields", "campaign_id,campaign_name,spend,actions,action_values");
    u.searchParams.set("time_range", JSON.stringify({ since: ymd(since90), until: ymd(today) }));
    u.searchParams.set("limit", "500");
    u.searchParams.set("access_token", accessToken);
    const r = await fetch(u);
    const j = await r.json();
    if (r.ok && !j.error) {
      const scored = (j.data ?? []).map((it: any) => {
        const spend = parseFloat(it.spend) || 0;
        const revenue = sumPurchaseValues(it.action_values);
        return { campaign_id: it.campaign_id, campaign_name: it.campaign_name, spend, revenue, roas: spend > 0 ? revenue / spend : 0 };
      }).filter((c: any) => c.roas >= 3).sort((a: any, b: any) => b.roas - a.roas).slice(0, 5);

      topPerformers = await Promise.all(scored.map(async (c: any) => {
        let firstAdset: any = null;
        try {
          const u2 = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${c.campaign_id}/adsets`);
          u2.searchParams.set("fields", "id,name,targeting");
          u2.searchParams.set("limit", "5");
          u2.searchParams.set("access_token", accessToken);
          const r2 = await fetch(u2);
          const j2 = await r2.json();
          if (r2.ok && !j2.error && j2.data?.[0]) {
            firstAdset = { name: j2.data[0].name, targeting: summarizeTargeting(j2.data[0].targeting) };
          }
        } catch {}
        return { ...c, adsets: firstAdset ? [firstAdset] : [] };
      }));
    }
  } catch (e) { console.error("[coach] top performers err:", e); }

  // Detect artist + interests
  const campaignName = snapshot?.name || "";
  const eventName = event?.name || "";
  const detectedArtist = detectArtist(eventName) || detectArtist(campaignName);
  let interests: any[] = [];
  if (detectedArtist) {
    try {
      const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/search`);
      u.searchParams.set("type", "adinterest");
      u.searchParams.set("q", detectedArtist);
      u.searchParams.set("limit", "10");
      u.searchParams.set("locale", "pt_PT");
      u.searchParams.set("access_token", accessToken);
      const r = await fetch(u);
      const j = await r.json();
      if (r.ok && !j.error) {
        interests = (j.data ?? []).map((i: any) => ({
          id: i.id, name: i.name,
          audience_size_lower_bound: i.audience_size_lower_bound ?? null,
          audience_size_upper_bound: i.audience_size_upper_bound ?? null,
        }));
      }
    } catch (e) { console.error("[coach] interests err:", e); }
  }

  // Custom audiences
  let customAudiences: any[] = [];
  try {
    const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/customaudiences`);
    u.searchParams.set("fields", "id,name,description,subtype,approximate_count_lower_bound,approximate_count_upper_bound,is_value_based,time_created");
    u.searchParams.set("limit", "50");
    u.searchParams.set("access_token", accessToken);
    const r = await fetch(u);
    const j = await r.json();
    if (r.ok && !j.error) customAudiences = j.data ?? [];
  } catch (e) { console.error("[coach] custom audiences err:", e); }

  // Build prompt
  const prompt = `És um especialista em targeting de Meta Ads para a indústria de eventos ao vivo (concertos, festivais) em Portugal e Brasil. Analisa a campanha abaixo e sugere otimizações concretas de audiência.

CAMPANHA ALVO
Nome: ${snapshot?.name || "?"}
Objetivo: ${snapshot?.objective || "?"}
Performance últimos 30d: ROAS ${metrics.roas.toFixed(2)}x · Gasto ${metrics.spend_eur.toFixed(2)}€ · Receita ${metrics.revenue_eur.toFixed(2)}€ · CTR ${(metrics.ctr * 100).toFixed(2)}% · Freq ${metrics.frequency.toFixed(2)}

EVENTO LIGADO
${event ? `Nome: ${event.name} · Data: ${event.start_at}` : "Sem evento ligado"}
Artista detetado (parse heurístico): ${detectedArtist || "N/A"}

TARGETING ATUAL DOS ADSETS
${adsets.map((a: any) => `- ${a.name}: idades ${a.targeting.age}, géneros ${a.targeting.genders.join("/")}, países ${a.targeting.countries.join(",")}, interests=${a.targeting.interests.map((i: any) => i.name).join(",") || "—"}, custom_audiences=${a.targeting.custom_audiences.map((c: any) => c.name).join(",") || "—"}`).join("\n") || "(nenhum)"}

TOP PERFORMERS DESTA CONTA (últimos 90d, ROAS > 3)
${topPerformers.map((t: any) => `- ${t.campaign_name}: ROAS ${t.roas.toFixed(2)}x, targeting principal: ${t.adsets[0]?.targeting.interests.map((i: any) => i.name).slice(0, 3).join("+") || "—"}, geo: ${t.adsets[0]?.targeting.countries?.join(",") || "—"}`).join("\n") || "(nenhum)"}

INTERESSES META ENCONTRADOS PARA "${detectedArtist || "—"}"
${interests.map((i: any) => `- ${i.name} (id: ${i.id}, audience: ${i.audience_size_lower_bound}-${i.audience_size_upper_bound})`).join("\n") || "(nenhum)"}

CUSTOM AUDIENCES DISPONÍVEIS NESTA CONTA
${customAudiences.map((c: any) => `- ${c.name} (${c.subtype}, ~${c.approximate_count_lower_bound}-${c.approximate_count_upper_bound} users)`).join("\n") || "(nenhuma)"}

INSTRUÇÕES
Responde APENAS JSON puro com este schema EXATO:
{
  "verdict": "excelente|bom|regular|fraco|mau",
  "summary": "1-2 frases sobre a qualidade do targeting atual",
  "diagnostic": ["observação 1", "observação 2", "observação 3"],
  "missed_opportunities": ["oportunidade 1", "oportunidade 2"],
  "recommendations": [
    {"priority":"high|medium|low","action":"ação curta","rationale":"porquê","how":"como implementar passo a passo"}
  ],
  "suggested_audiences": [
    {"name":"Nome sugerido","type":"interest|custom|lookalike|broad","spec":"descrição técnica","estimated_size":"tamanho estimado"}
  ]
}

Sê crítico e construtivo. Foca em ações concretas. Considera que estamos em Portugal/Brasil. Para eventos ao vivo, fanbase do artista + lookalikes de compradores são geralmente as melhores audiências.`;

  async function callAI() {
    return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "És um especialista em targeting Meta Ads para indústria de eventos. Respondes em português europeu, JSON puro, sem markdown fences." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      }),
    });
  }

  let aiResp = await callAI();
  if (aiResp.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    aiResp = await callAI();
  }
  if (aiResp.status === 429) return json({ error: "rate_limited", message: "Lovable AI rate limit. Tenta novamente daqui a uns segundos." }, 429);
  if (aiResp.status === 402) return json({ error: "payment_required", message: "Créditos Lovable AI esgotados. Adiciona em Settings → Workspace → Usage." }, 402);
  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("[coach] AI gateway err:", aiResp.status, t);
    return json({ error: "ai_gateway_error", detail: t }, 502);
  }

  const aiJson = await aiResp.json();
  const rawContent: string = aiJson?.choices?.[0]?.message?.content || "";
  let coach: any = null;
  try { coach = JSON.parse(stripFences(rawContent)); }
  catch (e) {
    console.error("[coach] failed parse AI JSON:", rawContent);
    return json({ error: "ai_invalid_json", raw: rawContent }, 500);
  }

  return json({
    campaign: { id: campaignId, name: snapshot?.name || null, status: snapshot?.status || null },
    event: event ? { id: event.id, name: event.name, start_at: event.start_at } : null,
    detected_artist: detectedArtist,
    metrics,
    context_used: {
      top_performers_count: topPerformers.length,
      interests_found: interests.length,
      custom_audiences_count: customAudiences.length,
      current_adsets: adsets.length,
    },
    coach,
    generated_at: new Date().toISOString(),
  });
});
