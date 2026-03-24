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
        ? `Analisa este PDF de vendas diárias de bilhetes (formato Ticketline). Extrai os dados e devolve APENAS um JSON válido com a seguinte estrutura:
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
        : `Analisa este PDF de bilheteira no formato "Relatório por Zona / Tipo de Bilhete" da Ticketline.

ESTRUTURA DO RELATÓRIO TICKETLINE:
- O relatório apresenta colunas em pares de Qt./Valor.
- 1ª Qt. = quantidade TOTAL de bilhetes carregados/configurados para o lote.
- 1º Valor = valor total das vendas realizadas (NÃO é qt × preço, é apenas das vendas).
- 2ª Qt. = quantidade de bilhetes VENDIDOS.
- 2º Valor = confirmação do valor vendido.
- Colunas seguintes: quebra por canal de venda (online, presencial, etc.).
- Últimas colunas de Qt sem Valor: bilhetes não vendidos (reservados, cortesias, não atribuídos, etc.).
- A diferença entre 1ª Qt e 2ª Qt são os bilhetes não vendidos.

REGRAS DE AGRUPAMENTO TICKETLINE:
- Cada lote é identificado como "Zona - Lote" (ex: "Balcão 1 - Lote 2").
- As linhas "SOMA" agrupam lotes. Se uma "SOMA" agrupa múltiplas linhas, TODAS pertencem à MESMA ZONA.
- Linhas com nomes como "Campanha | Colaboradores" ou "Campanha | [nome]" que apareçam DENTRO de um grupo SOMA com outros lotes da mesma zona, devem ser tratadas como um LOTE dessa zona (ex: se agrupado com "Balcão 2 - Lote Promoc.", a zona é "Balcão 2" e o lote é "Campanha Colaboradores").
- O "Tipo de Bilhete" (ex: "Normal", "Worten") é o tipo do bilhete e NÃO deve ser incluído no nome do lote.
- Se uma zona não tem " - " no nome (ex: "Mobilidade Reduzida"), usa o nome completo como zona e "Lote 1" como lote.

Devolve APENAS um JSON válido com a seguinte estrutura:
{
  "rows": [
    { "zona": "Balcão 1", "lote": "Lote 2", "quantidade_total": 354, "quantidade_vendida": 348, "preco": 68.00, "iva_rate": 6 }
  ]
}

CAMPOS:
- "zona": nome da zona (parte antes do " - ")
- "lote": nome do lote (parte depois do " - ", ou "Campanha Colaboradores" para campanhas)
- "quantidade_total": 1ª coluna Qt. (total de bilhetes configurados)
- "quantidade_vendida": 2ª coluna Qt. (bilhetes efectivamente vendidos)
- "preco": P. UN. (preço unitário)
- "iva_rate": taxa de IVA (se não disponível, usa 6)

REGRAS:
- Extrai TODOS os lotes, mesmo com quantidade 0.
- Ignora linhas "SOMA" e "TOTAL" (são subtotais).
- DESCARTA lotes com preço unitário inferior a 1,00€ (ex: 0,01€ são bilhetes de cortesia/camarotes sem venda real).
- quantidade_vendida pode ser MENOR ou IGUAL a quantidade_total.
- O valor (Valor) no relatório corresponde APENAS aos bilhetes vendidos, NÃO ao total × preço.`;



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
