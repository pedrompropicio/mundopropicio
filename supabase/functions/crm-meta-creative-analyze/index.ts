// crm-meta-creative-analyze
// POST { creative_id } → analisa criativo:
//   - image: via Lovable AI Gateway (Gemini 2.5 Flash Vision)
//   - video: via Gemini API direto (Google AI Studio) — vídeo + áudio nativos
// Persiste em crm.meta_creatives.analysis_jsonb + analyzed_at + analysis_model.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

async function fetchVideoBytes(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Video fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const mime = resp.headers.get("content-type") || "video/mp4";
  return { bytes: new Uint8Array(buf), mime };
}

async function uploadToGeminiFileAPI(bytes: Uint8Array, mime: string): Promise<{ uri: string; name: string }> {
  const initResp = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": bytes.byteLength.toString(),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "creative_video" } }),
  });
  if (!initResp.ok) throw new Error(`File API init failed: ${initResp.status} ${await initResp.text()}`);
  const uploadUrl = initResp.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("File API missing upload URL");

  const uploadResp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": bytes.byteLength.toString(),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!uploadResp.ok) throw new Error(`File API upload failed: ${uploadResp.status} ${await uploadResp.text()}`);
  const fileData = await uploadResp.json();
  return { uri: fileData.file.uri, name: fileData.file.name };
}

async function waitForFileActive(name: string, maxWaitMs = 120000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${GEMINI_API_KEY}`);
    if (!resp.ok) throw new Error(`File state check failed: ${resp.status}`);
    const data = await resp.json();
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new Error("Video processing failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Video processing timeout (120s)");
}

async function callGeminiVideo(prompt: string, videoPart: any): Promise<any> {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          videoPart,
          { text: prompt },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini API error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini returned empty content");
  return JSON.parse(stripJsonFences(text));
}

function buildImagePrompt(creative: any): string {
  return `És um especialista em Meta Ads creative analysis com 10 anos de experiência em campanhas de eventos ao vivo (concertos, festivais) em Portugal e Brasil.

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
}

function buildVideoPrompt(creative: any): string {
  return `És um especialista em Meta Ads creative analysis com 10 anos de experiência em campanhas de eventos ao vivo (concertos, festivais) em Portugal e Brasil.

CONTEXTO DESTE CRIATIVO:
- Nome interno: ${creative.name}
- Headline definido: ${creative.headline || "(vazio)"}
- Body definido: ${creative.body || "(vazio)"}
- CTA escolhido: ${creative.cta_type || "(vazio)"}
- Duração: ${creative.duration_seconds ? creative.duration_seconds + "s" : "?"}
- Dimensões: ${creative.width}×${creative.height}px

TAREFA: analisa rigorosamente este VÍDEO (visual + áudio) e avalia:

1. HOOK (primeiros 3 segundos) — força do gancho visual/auditivo, captura atenção, evita scroll-away
2. PACING / RITMO — cortes, dinamismo, sustentação da atenção, evita arrastamento
3. CTA — presença visual e auditiva, clareza, posicionamento no tempo, último frame leva à ação
4. TEXTO ON-SCREEN — legibilidade, tamanho, compliance Meta (<20% area total), promessas exageradas
5. ÁUDIO — música (género), locução (clareza, percetibilidade), balance, sound design
6. TRANSCRIÇÃO — transcreve fielmente o que é dito em PT (PT-PT ou PT-BR)
7. ARTISTAS / EVENTO — identifica artistas, banda, festival, género musical se reconhecível
8. ALINHAMENTO COM CAMPANHA — headline/body/CTA fornecidos batem com o vídeo
9. SUGESTÕES — 3-5 melhorias concretas e priorizadas para campanhas Meta Ads

REGRAS:
- Sê crítico e direto, não diplomata
- Scores 0-100; >80 excelente, 60-80 bom, 40-60 fraco, <40 mau
- Verdict "ready" só se overall >=75 sem issues high
- Aponta problemas reais, não inventes

Responde APENAS com JSON puro (sem markdown fences):

{
  "scores": {
    "overall": 0-100,
    "hook": 0-100,
    "pacing": 0-100,
    "cta_clarity": 0-100,
    "audio_quality": 0-100,
    "meta_compliance": 0-100,
    "alignment_with_copy": 0-100
  },
  "detected": {
    "hook_description": "1 frase a descrever o que se vê e ouve nos primeiros 3s",
    "cuts_count_estimate": <number>,
    "has_cta_visual": <boolean>,
    "has_cta_voice": <boolean>,
    "cta_appears_at_second": <number ou null>,
    "text_on_screen_pct_estimate": 0-100,
    "text_content_snippets": ["texto1", "texto2"],
    "has_music": <boolean>,
    "music_genre": "género (pop, electrónica, hip-hop, sertanejo, etc)",
    "has_voiceover": <boolean>,
    "voiceover_transcript": "transcrição completa do que é dito",
    "detected_artists": ["artista1", "artista2"],
    "detected_event_type": "concert|festival|show|other|unclear",
    "primary_colors": ["#hex"],
    "production_quality": "excellent|good|fair|poor"
  },
  "issues": [
    {"severity": "high|medium|low", "category": "hook|pacing|cta|compliance|audio|alignment", "title": "...", "description": "..."}
  ],
  "suggestions": [
    {"priority": "high|medium|low", "title": "...", "description": "o que fazer", "impact": "porque melhora performance"}
  ],
  "alignment_with_copy": {
    "headline_match": 0-100,
    "body_match": 0-100,
    "notes": "1-2 frases sobre alinhamento entre vídeo e texto"
  },
  "verdict": "ready|needs_minor_changes|needs_major_changes|reject",
  "verdict_reason": "1-2 frases"
}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

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
    .select("id, type, file_url, file_mime_type, name, headline, body, cta_type, link_url, width, height, duration_seconds")
    .eq("id", creative_id)
    .maybeSingle();
  if (creErr) return json({ error: "db_error", detail: creErr.message }, 500);
  if (!creative) return json({ error: "creative_not_found" }, 404);

  // ────────────────────────────────────────────────────────────
  // IMAGE — via Lovable AI Gateway (inalterado)
  // ────────────────────────────────────────────────────────────
  if (creative.type === "image") {
    if (!LOVABLE_API_KEY) return json({ error: "lovable_ai_not_configured" }, 500);

    let imageBase64: string;
    const imageMime = creative.file_mime_type || "image/jpeg";
    try {
      const imgResp = await fetch(creative.file_url);
      if (!imgResp.ok) {
        return json({ error: "image_fetch_failed", status: imgResp.status }, 502);
      }
      const arrayBuf = await imgResp.arrayBuffer();
      imageBase64 = bytesToBase64(new Uint8Array(arrayBuf));
    } catch (e) {
      return json({ error: "image_download_failed", detail: String(e) }, 502);
    }

    const prompt = buildImagePrompt(creative);

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
  }

  // ────────────────────────────────────────────────────────────
  // VIDEO — via Gemini API direto (Google AI Studio)
  // ────────────────────────────────────────────────────────────
  if (creative.type === "video") {
    if (!GEMINI_API_KEY) {
      return json({
        error: "gemini_not_configured",
        message: "Configura GEMINI_API_KEY nos secrets do Supabase para análise de vídeo.",
      }, 500);
    }

    let analysis: any;
    const modelUsed = "google/gemini-2.5-flash";
    try {
      const { bytes, mime } = await fetchVideoBytes(creative.file_url);
      const sizeMb = bytes.byteLength / (1024 * 1024);
      console.log(`[video] size=${sizeMb.toFixed(2)}MB mime=${mime}`);

      const prompt = buildVideoPrompt(creative);
      let videoPart: any;

      if (sizeMb < 19) {
        console.log("[video] using inline base64");
        const base64 = bytesToBase64(bytes);
        videoPart = { inline_data: { mime_type: mime, data: base64 } };
      } else {
        console.log("[video] using File API");
        const uploaded = await uploadToGeminiFileAPI(bytes, mime);
        await waitForFileActive(uploaded.name);
        videoPart = { file_data: { mime_type: mime, file_uri: uploaded.uri } };
      }

      analysis = await callGeminiVideo(prompt, videoPart);
    } catch (e) {
      console.error("[video] analysis failed", e);
      return json({ error: "video_analysis_failed", detail: String(e) }, 502);
    }

    const analyzedAt = new Date().toISOString();
    const { error: upErr } = await (supabase as any)
      .schema("crm")
      .from("meta_creatives")
      .update({
        analysis_jsonb: analysis,
        analyzed_at: analyzedAt,
        analysis_model: modelUsed,
      })
      .eq("id", creative_id);
    if (upErr) return json({ error: "persist_failed", detail: upErr.message, analysis }, 500);

    return json({ analysis, analyzed_at: analyzedAt });
  }

  return json({
    error: "unsupported_type",
    message: `Análise IA ainda não suporta type=${creative.type}`,
  }, 400);
});
