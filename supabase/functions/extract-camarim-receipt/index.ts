import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Analisa esta foto de talão / recibo / fatura de uma compra de camarim (alimentação, bebidas, snacks, descartáveis, frutas, etc.) e devolve APENAS um JSON válido com a seguinte estrutura:

{
  "supplier_name": "Nome do estabelecimento (ex: Pingo Doce, Continente, Café Central)",
  "supplier_nif": "NIF/contribuinte do fornecedor emitente (só dígitos, se visível)",
  "document_number": "Nº do talão/fatura/recibo (se visível)",
  "document_type": "invoice" | "receipt" | "simplified_invoice" | "other",
  "document_date": "YYYY-MM-DD (data da compra)",
  "total_amount": 12.45,
  "iva_amount": 0.69,
  "iva_rate": 6,
  "currency": "EUR",
  "service_description": "Resumo curto dos itens (ex: Águas, refrigerantes, frutas)",
  "analytic_tag": "bebidas" | "comida" | "higiene" | "equipa" | "outros" | null,
  "confidence": "high" | "medium" | "low",
  "notes": "Observações relevantes (ex: talão ilegível, falta NIF)"
}

REGRAS:
- Em Portugal o IVA do camarim é normalmente 6% (alimentação) ou 23% (outros).
- Se não conseguires ler um campo, devolve null nesse campo.
- "confidence" reflecte a qualidade da extracção (high se talão nítido com totais claros).
- "supplier_nif" é o NIF DO EMITENTE (fornecedor), nunca o NIF do cliente/adquirente. Se só existir o NIF do cliente, devolve null.
- Não inventes valores. Se incerto, devolve null e usa "low" em confidence.
- "analytic_tag" classifica o talão para análise interna (NÃO afeta a categoria contabilística):
  · "bebidas": águas, refrigerantes, sumos, álcool, café/chá engarrafado.
  · "comida": pratos quentes, refeições, take-away, sandes, sopa, doces, frutas frescas, frutos secos, snacks salgados/doces, mercearia leve.
  · "higiene": toalhas, copos, talheres descartáveis, gelo, papel, sabonete.
  · "equipa": despesas pessoais da equipa de camarim (refeições/bebidas só para a crew).
  · "outros": qualquer outro caso (ou se não tens certeza).
  Se não conseguires inferir, devolve null em vez de adivinhar.
- Devolve APENAS o JSON, sem markdown, sem explicações.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_base64, mime_type } = await req.json();

    if (!image_base64) {
      return new Response(JSON.stringify({ error: "Imagem não fornecida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const dataUrl = `data:${mime_type ?? "image/jpeg"};base64,${image_base64}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrai os dados deste talão de camarim." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de pedidos excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para OCR. Adicione créditos nas configurações." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      const objMatch = content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          const parsed = JSON.parse(objMatch[0]);
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch {
          // fallthrough
        }
      }
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair dados estruturados.", raw: content }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("extract-camarim-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
