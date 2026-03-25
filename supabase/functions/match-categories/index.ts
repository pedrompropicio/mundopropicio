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

REGRAS OBRIGATÓRIAS:
- Analise CADA despesa com atenção redobrada à descrição E à especificação (spec) em conjunto.
- A especificação frequentemente contém a informação mais relevante para a classificação.
- Escolha sempre uma categoria FINAL (folha/leaf) da lista — nunca uma categoria pai.
- Nunca invente categorias nem retorne código fora da lista.
- Nunca deixe itens sem resposta; devolva um match para todos os índices.
- Em caso de dúvida entre duas categorias, prefira a mais específica.

MAPEAMENTO DE REFERÊNCIA POR PALAVRAS-CHAVE (use como guia principal):

### 2 — PRODUÇÃO E OPERAÇÃO ###
# 2.1 - Artistas e Talentos
- Cachê, cachês, fee artista, honorário artista → 2.1.01 (Cachê Artístico)
- DJ, DJs, set DJ → 2.1.02 (DJ)
- Participação artística, feat, participação especial → 2.1.03

# 2.2 - Viagens e Hospedagem
- Passagem, passagens, aéreo, voo, bilhete avião → 2.2.01 (Passagens)
- Hotel, hospedagem, alojamento, hospedaria, estadia → 2.2.02 (Hospedagem)
- Transfer, transporte, motorista, carrinha, van, uber, bolt, táxi → 2.2.03 (Transfer)
- Alimentação, catering refeição, refeição, meal, diária alimentação → 2.2.04 (Alimentação)

# 2.3 - Palco e Técnica
- Palco (estrutura), praticável, estrado palco → 2.3.01 (Palco)
- Som, luz, LED (iluminação), ecrã (técnico), house light, áudio, PA → 2.3.02 (Som e Luz)
- Backline, instrumentos, amplificador, bateria musical, teclado → 2.3.03 (Backline)
- Pirotecnia, fogos, efeitos especiais → 2.3.04 (Pirotecnia)

# 2.4 - Infraestrutura
- Gerador, geradores → 2.4.01 (Geradores)
- Energia evento, ligação elétrica, quadro elétrico → 2.4.02 (Energia)
- Banheiro, casa de banho, WC químico, sanitário → 2.4.03 (Banheiros)
- Água → 2.4.04 (Água)
- Vedação, barreira, barreiras anti-pânico, gradeamento → 2.4.05 (Vedações)
- Tenda, tendas, cobertura → 2.4.06 (Tendas)

# 2.5 - Cenografia
- Cenografia palco, decoração palco, set design → 2.5.01 (Cenografia Palco)
- VIP, cenografia VIP, decoração VIP, lounge VIP → 2.5.02 (VIP)
- Sinalização, vinis, faixa, totem, placa sinalética → 2.5.03 (Sinalização)

# 2.6 - Operação Complementar
- Camarim, catering camarim → 2.6.04 (Camarim)
- Locação espaço, aluguel venue, renda espaço → 2.6.05 (Espaço)
- Montagem, desmontagem, rigger, empilhador, plataforma elevatória, estrados → 2.6.06 (Montagem)
- Ticketeira, ticketline, comissão bilheteira, comissão de vendas, comissão emissão convites → 2.6.07 (Ticketeira)
- Despesas extras, despesas diversas, reembolso, outros custos → 2.6.08 (Extras)

# 2.7 - Licenças e Seguros
- Direitos autorais, SPA, PASSMUSIC, ECAD → 2.7.01 (Direitos Autorais)
- Seguro, seguros, apólice → 2.7.02 (Seguros)
- Alfândega, IGAC, licenciamento → 2.7.03 (Alfândega/IGAC)

# 2.8 - Tecnologia
- Wifi, internet evento → 2.8.01
- Equipamento TI, computador → 2.8.02
- CCTV, câmera segurança, videovigilância → 2.8.03
- Rádio comunicação, walkie talkie, intercom → 2.8.04

### 3 — MARKETING/DIVULGAÇÃO ###
# 3.1 - Marketing/Divulgação
- Spot, reels, vídeo, audiovisual, captação, filmagem → 3.1.01 (Audiovisual)
- Social media, conteúdo social, gestão redes → 3.1.02 (Social Media)
- Fotografia, fotógrafo → 3.1.03 (Fotografia)
- Assessoria imprensa, press office, relações públicas → 3.1.04 (Assessoria)
- Instagram, Facebook, Meta Ads, Google Ads, digital, tráfego pago, campanha digital → 3.1.05 (Digital)
- OOH, Out of Home, mupi, mupis, outdoor, outdoors, painel LED (publicitário/rua), ecrã LED (zona comercial), JCDecaux, MOP, Dream Media, flyer, panfletagem, pulseira, merchandising → 3.1.06 (OOH/Material)
- Influencer, criador conteúdo → 3.1.07 (Influencers)
- Rádio (publicidade), TV, Record, Tropical FM, mídia tradicional → 3.1.08 (Rádio/TV)

ATENÇÃO sobre LED/Ecrã:
- LED, ecrã, painel LED em contexto de PALCO ou TÉCNICO → 2.3.02 (Som e Luz)
- LED, ecrã, painel LED em contexto de RUA, PUBLICIDADE, OOH, zona comercial → 3.1.06 (OOH/Material)

### 4 — EQUIPAS E MÃO DE OBRA ###
# 4.1 - Produção
- Produção executiva, equipa produção → 4.1.01
- Direção palco, stage manager → 4.1.02
- Coordenação, coordenador → 4.1.03
- Assistente produção, staff camarim → 4.1.04

# 4.2 - Staff Operacional
- Stagehand, stagehands → 4.2.01
- Runner, runners → 4.2.02
- Credenciamento, recepção, checkin → 4.2.03

# 4.3 - Segurança
- Segurança, segurança privada → 4.3.01
- Controlo acessos, pulseiras acesso → 4.3.02

# 4.4 - Serviços de Apoio
- Limpeza, higienização → 4.4.01
- Brigada médica, ambulância, médico → 4.4.02
- Bombeiros → 4.4.03

### 10 — OPERAÇÕES FINANCEIRAS E ADMINISTRATIVAS ###
- Transferência interna, repasse interno → 10.3
- Ordenados, salários, folha pagamento → 10.4.01
- Segurança social, INSS, TSU → 10.4.02
- Seguro trabalho → 10.4.03
- Benefício, vale, ajuda custo → 10.4.04
- Taxas bancárias, comissões MBWay, tarifa bancária → 10.6.01
- Juros bancários → 10.6.02
- Contabilidade, contabilista → 10.7.04
- Jurídico, advogado → 10.7.05
- Consultoria, consultor → 10.7.06
- Aluguel escritório → 10.7.07
- Energia escritório → 10.7.08
- Internet escritório → 10.7.09
- Software, SaaS, licença software → 10.7.10
- Cloud, hosting, servidor → 10.7.11
- Equipamento, hardware → 10.7.12`
          },
          {
            role: "user",
            content: `Classifique CADA despesa abaixo na categoria mais adequada do plano de contas. Analise cuidadosamente a descrição e a especificação em conjunto.

PLANO DE CONTAS (use apenas categorias finais/folha):
${categoryList}

DESPESAS A CLASSIFICAR:
${descList}

Retorne um match para CADA despesa, na mesma ordem. Não omita nenhum índice.`
          }
        ],
        temperature: 0.05,
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
