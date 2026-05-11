// crm-meta-creative-analyze
// POST { creative_id } → analisa criativo (imagem) via Gemini 2.5 Flash Vision,
// persiste análise em crm.meta_creatives.analysis_jsonb + analyzed_at + analysis_model.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { creative_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { creative_id } = body;
  if (!creative_id) return json({ error: "missing_creative_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: "unauthorized", detail: userErr?.message }, 401);
  }

  const { data: creative, error: creErr } = await (supabase as any)
    .schema("crm")
    .from("meta_creatives")
    .select("id, type, file_url, file_mime_type, name, headline, body, cta_type, link_url, width, height")
    .eq("id", creative_id)
    .maybeSingle();
  if (creErr) return json({ error: "db_error", detail: creErr.message }, 500);
  if (!creative) return json({ error: "creative_not_found" }, 404);

  if (creative.type !== "image") {
    return json({
      error: "unsupported_type",
      message: "Análise por IA disponível apenas para imagens nesta versão. Suporte a vídeo em breve.",
      detail: `type=${creative.type}`,
    }, 400);
  }

  let imageBase64: string;
  const imageMime = creative.file_mime_type || "image/jpeg";
  try {
    const imgResp = await fetch(creative.file_url);
    if (!imgResp.ok) {
      return json({ error: "image_fetch_failed", status: imgResp.status }, 502);
    }
    const arrayBuf = await imgResp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    imageBase64 = btoa(binary);
  } catch (e) {
    return json({ error: "image_download_failed", detail: String(e) }, 502);
  }

  const prompt = `És um especialista em Meta Ads creative analysis com 10 anos de experiência em campanhas de eventos ao vivo (concertos, festivais) em Portugal e Brasil.

CONTEXTO DESTE CRIATIVO:
- Nome interno: ${creative.name}
- Headline definido: ${creative.headline || "(vazio)"}
- Body definido: ${creative.body || "(vazio)"}
- CTA escolhido: ${creative.cta_type || "(vazio)"}
- Dimensões: ${creative.width}×${creative.height}px

TAREFA: analisa rigorosamente esta imagem e avalia:

1. META COMPLIANCE — texto na imagem (estima %), sensacionalismo, antes/depois, promessas exageradas, claims sobre saúde/dinheiro
2. QUALIDADE VISUAL — composição, regra dos terços, contraste, legibilidade, hierarquia, foco/exposição/ruído
3. MENSAGEM — clareza em < 3s, alinhamento com público alvo de eventos, coerência com headline/body fornecidos
4. CTA E BRANDING — CTA visualmente presente, marca/logo visível, tipo de evento percetível
5. SUGESTÕES CONCRETAS — 3 a 5 melhorias acionáveis

REGRAS:
- Sê crítico e direto, não diplomata
- Scores 0-100; >80 excelente, 60-80 bom, 40-60 fraco, <40 mau
- Verdict "ready" só se score overall >= 75 sem issues high
- Aponta problemas reais, não invente

Responde APENAS com JSON puro (sem markdown fences):

{
  "scores": {
    "overall": <number 0-100>,
    "meta_compliance": <number 0-100>,
    "visual_quality": <number 0-100>,
    "message_clarity": <number 0-100>,
    "cta_presence": <number 0-100>,
    "branding": <number 0-100>
  },
  "detected": {
    "text_in_image_pct": <number 0-100>,
    "text_content": "texto visível ou null",
    "primary_message": "mensagem detetada em 1 frase",
    "has_cta": <boolean>,
    "cta_text": "texto do CTA visível ou null",
    "has_brand": <boolean>,
    "brand_visibility": "high|medium|low|none",
    "event_type_detected": "concert|festival|show|other|unclear",
    "primary_colors": ["#hex1", "#hex2"],
    "composition_quality": "excellent|good|fair|poor"
  },
  "issues": [
    {"severity": "high|medium|low", "category": "compliance|quality|clarity|branding", "title": "título curto", "description": "explicação 1 frase"}
  ],
  "suggestions": [
    {"priority": "high|medium|low", "title": "título curto", "description": "o que fazer", "impact": "porquê melhora performance"}
  ],
  "alignment_with_copy": {
    "headline_match": <number 0-100>,
    "body_match": <number 0-100>,
    "notes": "1-2 frases sobre alinhamento entre imagem e texto"
  },
  "verdict": "ready|needs_minor_changes|needs_major_changes|reject",
  "verdict_reason": "1-2 frases"
}`;

  const callGemini = async (): Promise<Response> => {
    return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.2,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${imageMime};base64,${imageBase64}` } },
          ],
        }],
      }),
    });
  };

  let aiResp = await callGemini();
  if (aiResp.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    aiResp = await callGemini();
  }
  if (aiResp.status === 429) return json({ error: "rate_limited", message: "Tenta novamente em alguns segundos." }, 429);
  if (aiResp.status === 402) return json({ error: "credits_exhausted", message: "Sem créditos no Lovable AI." }, 402);
  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("[ai] error", aiResp.status, t);
    return json({ error: "ai_gateway_error", status: aiResp.status, detail: t.slice(0, 500) }, 502);
  }

  const aiJson = await aiResp.json();
  const rawText: string = aiJson?.choices?.[0]?.message?.content ?? "";
  const usageTokens: number | null = aiJson?.usage?.total_tokens ?? null;

  let analysis: any;
  try {
    analysis = JSON.parse(stripJsonFences(rawText));
  } catch (e) {
    console.error("[ai] invalid JSON", e, rawText.slice(0, 500));
    return json({ error: "ai_invalid_json", raw_preview: rawText.slice(0, 800) }, 502);
  }

  const analyzedAt = new Date().toISOString();
  const { error: upErr } = await (supabase as any)
    .schema("crm")
    .from("meta_creatives")
    .update({
      analysis_jsonb: { ...analysis, _tokens: usageTokens },
      analyzed_at: analyzedAt,
      analysis_model: "google/gemini-2.5-flash",
    })
    .eq("id", creative_id);

  if (upErr) {
    return json({ error: "persist_failed", detail: upErr.message, analysis }, 500);
  }

  return json({ analysis, analyzed_at: analyzedAt });
});
