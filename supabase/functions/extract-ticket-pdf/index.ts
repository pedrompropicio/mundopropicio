import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const headerInstruction = `

EXTRACÇÃO DO CABEÇALHO (OBRIGATÓRIA):
- O cabeçalho do PDF contém o período do relatório (ex: "01/04/2026 a 05/04/2026", "Período: 01-04-2026 - 05-04-2026", "De 01/04/2026 Até 05/04/2026").
- Extrai as datas de início e fim do período e inclui-as no JSON como "period_from" e "period_to" no formato "YYYY-MM-DD".
- Se o período contiver apenas uma data, usa-a tanto como "period_from" como "period_to".
- Se não encontrares período no cabeçalho, usa "period_from": null e "period_to": null.

IDENTIFICAÇÃO DA BILHETEIRA (OBRIGATÓRIA):
- O PDF contém geralmente o nome/logotipo da bilheteira (ex: "Ticketline", "BOL", "Blueticket", "ETES", "Fever", "Seetickets", "Eventbrite", "Worten Bilhetes").
- Extrai o nome da bilheteira e inclui no JSON como "ticket_office_name".
- Se não conseguires identificar, usa "ticket_office_name": null.

IDENTIFICAÇÃO DO EVENTO (OBRIGATÓRIA):
- O cabeçalho do PDF contém o nome do espetáculo/evento (ex: "Mágicos Henry & Klaus", "Ana Moura - Noite de Fado").
- Extrai o nome do evento e inclui no JSON como "event_name".
- Se não encontrares, usa "event_name": null.

IDENTIFICAÇÃO DA DATA E HORA DO EVENTO (OBRIGATÓRIA):
- O cabeçalho pode conter a data do espetáculo (ex: "04/04/2026", "Sábado, 5 de Abril 2026").
- Extrai a data no formato "YYYY-MM-DD" e inclui como "event_date".
- Se não encontrares, usa "event_date": null.
- O cabeçalho pode conter a hora do espetáculo (ex: "21:00", "21h00", "19:30").
- Extrai a hora no formato "HH:MM" e inclui como "event_time".
- Se não encontrares, usa "event_time": null.`;

const totalLineInstruction = `

EXTRACÇÃO DA LINHA TOTAL (OBRIGATÓRIA PARA VALIDAÇÃO):
- A última linha do relatório é sempre "TOTAL" com os somatórios de todas as colunas.
- Extrai os seguintes campos da linha TOTAL:
  - "total_quantity_all": 1ª Qt. da linha TOTAL (total geral de bilhetes carregados/configurados)
  - "total_quantity_sold": 2ª Qt. da linha TOTAL (total de bilhetes EFECTIVAMENTE VENDIDOS)
  - "total_revenue": Valor da linha TOTAL correspondente às vendas (2º Valor ou Valor de Vendas)
- Estes campos são OBRIGATÓRIOS e servem para validação cruzada com as linhas extraídas.
- Se não encontrares a linha TOTAL, usa null para todos.`;

function buildDailySalesPrompt(): string {
  return `Analisa este PDF de vendas diárias de bilhetes (formato Ticketline). Extrai os dados e devolve APENAS um JSON válido com a seguinte estrutura:
{
  "period_from": "2026-04-01",
  "period_to": "2026-04-05",
  "total_quantity_sold": 1618,
  "total_revenue": 54933.90,
  "rows": [
    { "zona": "nome da zona", "lote": "nome do lote", "quantidade": 100, "preco_unitario": 25.00 }
  ]
}
REGRAS IMPORTANTES:
- Cada linha do relatório que NÃO seja "SOMA" ou "TOTAL" é um lote a extrair.
- A "Zona" é a parte antes do " - " no nome (ex: "Balcão 1 - Lote 2" → zona="Balcão 1", lote="Lote 2").
- Se o nome não tiver " - ", usa o nome completo como zona e "Lote 1" como lote.

ATENÇÃO ESPECIAL ÀS COLUNAS DE QUANTIDADE:
- O relatório Ticketline tem MÚLTIPLAS colunas de Qt. (quantidade).
- A 1ª coluna Qt. é o TOTAL de bilhetes CARREGADOS/CONFIGURADOS (inclui cortesias, não vendidos, etc.).
- A 2ª coluna Qt. é a quantidade de bilhetes EFECTIVAMENTE VENDIDOS (PAGOS).
- DEVES usar SEMPRE a 2ª coluna Qt. (bilhetes vendidos/pagos) para o campo "quantidade".
- NUNCA uses a 1ª coluna Qt. (total carregado) - essa é apenas informativa.
- A diferença entre 1ª e 2ª Qt. são bilhetes não vendidos (reservados, cortesias, devoluções).

- "P. UN." é o preço unitário.
- Ignora linhas com quantidade vendida 0.
- DESCARTA linhas com preço unitário inferior a 1,00€ (cortesias/camarotes sem venda real).
- Extrai TODOS os dados de vendas que encontrares no documento.
${headerInstruction}
${totalLineInstruction}`;
}

function buildSetupPrompt(): string {
  return `Analisa este PDF de bilheteira no formato "Relatório por Zona / Tipo de Bilhete" da Ticketline.

ESTRUTURA DO RELATÓRIO TICKETLINE:
- O relatório apresenta colunas em pares de Qt./Valor.
- 1ª Qt. = quantidade TOTAL de bilhetes carregados/configurados para o lote (NÃO são vendas).
- 1º Valor = valor total das vendas realizadas (NÃO é qt × preço, é apenas das vendas).
- 2ª Qt. = quantidade de bilhetes EFECTIVAMENTE VENDIDOS (PAGOS).
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
  "period_from": "2026-04-01",
  "period_to": "2026-04-05",
  "total_quantity_all": 1845,
  "total_quantity_sold": 1618,
  "total_revenue": 54933.90,
  "rows": [
    { "zona": "Balcão 1", "lote": "Lote 2", "quantidade_total": 354, "quantidade_vendida": 318, "preco": 68.00, "iva_rate": 6 }
  ]
}

CAMPOS:
- "zona": nome da zona (parte antes do " - ")
- "lote": nome do lote (parte depois do " - ", ou "Campanha Colaboradores" para campanhas)
- "quantidade_total": 1ª coluna Qt. (total de bilhetes CARREGADOS/CONFIGURADOS - NÃO são vendas)
- "quantidade_vendida": 2ª coluna Qt. (bilhetes EFECTIVAMENTE VENDIDOS/PAGOS - é ESTE o valor de vendas reais)
- "preco": P. UN. (preço unitário)
- "iva_rate": taxa de IVA (se não disponível, usa 6)

VALIDAÇÃO CRÍTICA:
- quantidade_vendida DEVE ser MENOR ou IGUAL a quantidade_total.
- Se quantidade_vendida > quantidade_total, inverteste as colunas — corrige.
- O cálculo correcto de receita é: quantidade_vendida × preco (NÃO quantidade_total × preco).
- O "Valor" mostrado no relatório deve ser aproximadamente igual a quantidade_vendida × preco.

REGRAS:
- Extrai TODOS os lotes, mesmo com quantidade 0.
- Ignora linhas "SOMA" e "TOTAL" (são subtotais) para as ROWS — mas extrai os valores da linha "TOTAL" para os campos total_quantity_all, total_quantity_sold e total_revenue.
- DESCARTA lotes com preço unitário inferior a 1,00€ (ex: 0,01€ são bilhetes de cortesia/camarotes sem venda real).
- O valor (Valor) no relatório corresponde APENAS aos bilhetes vendidos, NÃO ao total × preço.
${headerInstruction}
${totalLineInstruction}`;
}

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

    const systemPrompt = extraction_type === "daily_sales"
      ? buildDailySalesPrompt()
      : buildSetupPrompt();

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
