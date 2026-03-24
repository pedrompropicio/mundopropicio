import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdf_base64, extraction_type } = await req.json();

    if (!pdf_base64) {
      return new Response(JSON.stringify({ error: "PDF não fornecido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const systemPrompt =
      extraction_type === "daily_sales"
        ? `Analisa este PDF de vendas de bilhetes. Extrai os dados e devolve APENAS um JSON válido com a seguinte estrutura:
{
  "rows": [
    { "zona": "nome da zona", "lote": "nome do lote", "quantidade": 100, "preco_unitario": 25.00 }
  ]
}
REGRAS IMPORTANTES:
- Cada linha do relatório que NÃO seja "SOMA" ou "TOTAL" é um lote a extrair.
- A "Zona" é a parte antes do " - " no nome (ex: "Balcão 1 - Lote 2" → zona="Balcão 1", lote="Lote 2").
- Se o nome não tiver " - ", usa o nome completo como zona e "Lote 1" como lote.
- "Qt." vendida é a quantidade de bilhetes efectivamente vendidos (coluna de vendas, não a coluna total/disponível).
- "P. UN." é o preço unitário.
- Ignora linhas com quantidade 0.
- Extrai TODOS os dados de vendas que encontrares no documento.`
        : `Analisa este PDF de bilheteira/relatório de vendas (ex: Ticketline). Extrai os dados de zonas, lotes, quantidades e preços. Devolve APENAS um JSON válido com a seguinte estrutura:
{
  "rows": [
    { "zona": "nome da zona", "lote": "nome do lote", "quantidade": 1000, "quantidade_vendida": 800, "preco": 30.00, "iva_rate": 6 }
  ]
}
REGRAS IMPORTANTES:
- Cada linha do relatório que NÃO seja "SOMA" ou "TOTAL" é um lote a extrair.
- A "Zona" é a parte antes do " - " no nome (ex: "Balcão 1 - Lote 2" → zona="Balcão 1", lote="Lote 2"). Se tiver "Lote Promoc." ou "Lote Prom." mantém esse nome.
- Se o nome não tiver " - ", usa o nome completo como zona e o "Tipo de Bilhete" como nome do lote (ex: "Campanha | Colaboradores" → zona="Campanha", lote="Colaboradores").
- NÃO incluas o "Tipo de Bilhete" (ex: "Normal", "Worten") no nome do lote.
- "Qt." na PRIMEIRA coluna é o número TOTAL de bilhetes disponíveis para esse lote ("quantidade").
- A SEGUNDA coluna "Qt." é o número de bilhetes VENDIDOS ("quantidade_vendida"). Pode ser menor ou igual à quantidade total.
- "P. UN." é o preço unitário.
- Se a taxa de IVA não estiver disponível, usa 6.
- Extrai TODOS os lotes, mesmo os com quantidade 0.
- IMPORTANTE: quantidade e quantidade_vendida são valores DIFERENTES. A quantidade é a capacidade total, a quantidade_vendida é quantos foram efectivamente vendidos.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrai os dados deste PDF de bilhetes." },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${pdf_base64}` },
              },
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
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos nas configurações." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      // Try to find JSON object in the text
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
        JSON.stringify({ error: "Não foi possível extrair dados estruturados do PDF.", raw: content }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("extract-ticket-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
