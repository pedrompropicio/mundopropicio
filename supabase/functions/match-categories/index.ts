import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { descriptions, categories } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const categoryList = categories
      .map((c: any) => `${c.code} - ${c.name}`)
      .join("\n");

    const descList = descriptions
      .map((d: any, i: number) => `${i}: "${d.description}"${d.specification ? ` (spec: "${d.specification}")` : ""}`)
      .join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em contabilidade de eventos musicais e espetáculos em Portugal. Seu trabalho é classificar despesas de acordo com o plano de contas fornecido.

Regras:
- Escolha sempre uma categoria FINAL da lista fornecida (sem filhos), mesmo que o código tenha apenas 2 níveis.
- Nunca invente categorias nem retorne código fora da lista.
- Nunca deixe itens sem resposta; devolva um match para todos os índices.
- Use descrição e especificação em conjunto para decidir.
- Cachê, cachês de artistas → 2.1.01
- DJ → 2.1.02
- Passagens, aéreo, voos → 2.2.01
- Hotel, hospedagem → 2.2.02
- Transfer, carrinha, transporte, motorista → 2.2.03
- Alimentação, diária alimentação, catering refeições equipe → 2.2.04
- Palco (estrutura) → 2.3.01
- Som, luz, LED, ecran → 2.3.02
- Backline → 2.3.03
- Pirotecnia → 2.3.04
- Geradores → 2.4.01
- Energia → 2.4.02
- Banheiros → 2.4.03
- Água → 2.4.04
- Vedações → 2.4.05
- Tendas → 2.4.06
- Cenografia palco → 2.5.01
- VIP, cenografia VIP → 2.5.02
- Sinalização, vinis → 2.5.03
- Camarim, catering camarim → 2.6.04
- Locação espaço, aluguel venue → 2.6.05
- Montagem, rigger, empilhador, plataforma elevatória, estrados → 2.6.06
- Ticketeira, comissão ticketline, comissão de vendas bilhetes, comissão emissão convites → 2.6.07
- Despesas extras, despesas diversas, reembolso → 2.6.08
- Direitos autorais, SPA, PASSMUSIC → 2.7.01
- Seguros → 2.7.02
- Alfândega, IGAC → 2.7.03
- Anúncios Instagram/Facebook, digital → 3.2.01
- Campanha mupis, outdoors, OOH, JCDecaux, MOP, Dream Media → 3.2.02
- Rádio, TV, Record, Tropical FM → 3.2.04
- Spot, reels, audiovisual → 3.1.01
- Panfletagem, flyer, confecção flyer → 3.2.02
- Pulseiras, merchandising → 3.2.02
- Equipa de produção, produção executiva → 4.1.01
- Stage hands, stagehands → 4.2.01
- Staff camarins, assistentes → 4.1.04
- Segurança → 4.3.01
- Controlo de acessos, assistentes pulseiras → 4.3.02
- Limpeza → 4.4.01
- Brigada médica → 4.4.02
- Bombeiros → 4.4.03
- Bolt (transfer) → 2.2.03
- Barreiras anti-pânico → 2.4.05
- Transferência interna, repasse interno → 10.3
- Ordenados, salários, folha → 10.4.01
- Taxas bancárias, comissões MBWay → 10.6.01
- Contabilidade → 10.7.04
- Jurídico, advogado → 10.7.05
- Consultoria → 10.7.06
- Softwares, SaaS, licenças → 10.7.10
- Cloud, hosting, servidor → 10.7.11`
          },
          {
            role: "user",
            content: `Classifique cada despesa abaixo na categoria mais adequada do plano de contas.

PLANO DE CONTAS (use apenas categorias finais listadas abaixo):
${categoryList}

DESPESAS A CLASSIFICAR:
${descList}

 Retorne um match para cada despesa, na mesma ordem.`
          }
        ],
        temperature: 0.1,
        tools: [
          {
            type: "function",
            function: {
              name: "classify_expenses",
              description: "Return category codes for each expense",
              parameters: {
                type: "object",
                properties: {
                  matches: {
                    type: "array",
                    minItems: descriptions.length,
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        category_code: { type: "string" },
                      },
                      required: ["index", "category_code"],
                      additionalProperties: false,
                    }
                  }
                },
                required: ["matches"],
                additionalProperties: false,
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "classify_expenses" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No tool call in response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("match-categories error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
