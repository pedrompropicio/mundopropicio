// sepa-compact-descriptions
// Compacta descritivos de transferência SEPA (RmtInf/Ustrd) preservando TODOS
// os números/datas/identificadores. Uma única chamada com o lote de descrições.
// Fallback é responsabilidade do cliente: se isto falhar, ele trunca.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { streamText } from "npm:ai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";

const LIMIT = 70;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "missing LOVABLE_API_KEY" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || items.length === 0) return json({ error: "items must be a non-empty array" }, 400);
  if (items.length > 200) return json({ error: "too many items (max 200)" }, 400);

  const limit = Number.isFinite(body?.limit) ? Math.min(140, Math.max(30, Number(body.limit))) : LIMIT;

  const cleaned = items
    .map((it: any, i: number) => ({
      id: String(it?.id ?? i),
      text: String(it?.text ?? "").slice(0, 500),
    }))
    .filter((it) => it.text.trim().length > 0);

  const prompt = [
    `Compacta cada descritivo de transferencia bancaria para no maximo ${limit} caracteres.`,
    "REGRAS ESTRITAS:",
    `- Preserva TODOS os numeros, datas, meses de referencia e identificadores de fatura, exatamente iguais (nao alteres nem inventes digitos).`,
    "- Usa apenas caracteres ASCII: letras, numeros e / - ? : ( ) . , ' + espaco.",
    "- Abrevia palavras longas em vez de remover informacao numerica.",
    "- Responde em JSON com o formato {\"results\":[{\"id\":\"...\",\"text\":\"...\"}]} e nada mais.",
    "",
    "DESCRITIVOS:",
    JSON.stringify(cleaned),
  ].join("\n");

  try {
    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: {
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });

    const result = streamText({
      model: gateway("google/gemini-3.6-flash"),
      prompt,
    });
    const text = await result.text;

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ results: [] });
    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({ results: [] });
    }
    const results = Array.isArray(parsed?.results)
      ? parsed.results
          .filter((r: any) => r && typeof r.id !== "undefined" && typeof r.text === "string")
          .map((r: any) => ({ id: String(r.id), text: String(r.text) }))
      : [];
    return json({ results });
  } catch (e) {
    console.error("sepa-compact-descriptions failed:", e);
    return json({ error: "ai_failed", detail: String(e) }, 502);
  }
});
