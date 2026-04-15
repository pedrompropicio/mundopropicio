import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildPrompt(): string {
  return `Analisa este PDF de bilheteira. Detecta automaticamente o formato (Ticketline, BOL, ou Previsão de Receitas) e extrai os dados.

=== FORMATO 1: TICKETLINE — "Relatório por Zona / Tipo de Bilhete" ===

ESTRUTURA:
- Organizado por ZONAS reais do recinto (ex: "1ª Plateia", "Cadeiras de Orquestra").
- Dentro de cada zona, sub-linhas por TIPO DE BILHETE (ex: "Normal", "Black Friday - 20%").
- Cada sub-linha tem: Preço Unitário (P. UN.), e múltiplas colunas de Qt./Valor.
- 1ª Qt. = bilhetes CARREGADOS/CONFIGURADOS (total).
- 2ª Qt. = bilhetes EFECTIVAMENTE VENDIDOS (pagos).
- Linhas "SOMA" agrupam subtotais — NÃO extrair.
- Linha "TOTAL" no final — extrair para validação.

IMPORTANTE: Se houver duas secções ("Total Geral" e secção com "Data do Evento"), extrair APENAS "Total Geral".

=== FORMATO 2: BOL — "Listagem de Sessão por Sector" ===

ESTRUTURA:
- Tabela com sectores/zonas na primeira coluna (ex: "Cadeiras Orquestra", "1ª Plateia", "Balcão Central Imp").
- Colunas agrupadas: Disponíveis (Qt./Valor), Vendas Inteiras (Qt./Valor), Vendas Desconto (Qt./Valor), Convites (Qt.), Permutas (Qt.), Cartões (Qt./Valor).
- Linha "TOTAL" no final com somas.
- Rodapé indica "Bilhetes" (total) e "Receita" (total €).

REGRAS ESPECÍFICAS BOL:
- "zona" = nome do sector (ex: "1ª Plateia", "Balcão Central Imp").
- Para cada sector, criar UMA ÚNICA linha com tipo_bilhete = "Inteira" para vendas inteiras e UMA linha com tipo_bilhete = "Desconto" para vendas com desconto (se quantidade > 0).
- "preco_unitario" para Inteiras = Valor Inteiras / Qt. Inteiras. Para Descontos = Valor Descontos / Qt. Descontos.
- "quantidade_total" = Qt. Disponíveis + Qt. Vendas Inteiras + Qt. Vendas Desconto + Qt. Convites + Qt. Permutas + Qt. Cartões (todos os bilhetes configurados para o sector).
- "quantidade_vendida" = Qt. da respectiva categoria (Inteiras ou Desconto).
- "valor_vendido" = Valor da respectiva categoria.
- NÃO incluir Convites, Permutas ou Cartões como linhas separadas — são contados no quantidade_total mas não geram receita vendida.
- O total de bilhetes (rodapé "Bilhetes") inclui TUDO: Disponíveis + Vendas + Convites + Permutas + Cartões.
- O total de receita (rodapé "Receita") inclui Vendas Inteiras + Vendas Desconto + Cartões.

=== FORMATO 3: PREVISÃO DE RECEITAS (Planeamento de Bilheteira) ===

ESTRUTURA:
- Documento de planeamento/simulação de receitas para um ou mais eventos.
- Pode ter MÚLTIPLAS PÁGINAS, cada uma correspondendo a uma cidade/evento/venue diferente.
- Cabeçalho por página: "PREVISÃO DE RECEITAS", LOCAL (venue), DATA, HORÁRIO.
- Organizado por ZONAS (ex: "Golden Circle", "Bancadas", "Galerias", "Plateia", "Balcão 1", "Balcão 2").
- Cada zona tem uma capacidade total indicada ao lado do nome.
- Dentro de cada zona, LOTES com: nome (ex: "Lote Promocional", "2 Lote", "3 Lote"), quantidade, convites, preço unitário (bruto c/ IVA), receita.
- Linhas especiais como "PMC", "PMR", "PLUS DE ..." são lotes adicionais.
- Resumo no final: Total, Total sem IVA (6%), Comissão bilhe (2%), Total líquido, Ticket médio.
- Pode haver uma tabela inicial de capacidades (LOCAL, CAPACIDADE, CATIVOS SALA, CONVITES) — extrair para referência.

REGRAS ESPECÍFICAS PREVISÃO DE RECEITAS:
- source = "previsao_receitas"
- Extrair CADA PÁGINA como um elemento separado no array "pages".
- Para cada página: venue_name, event_date (texto original), event_time, total_quantity, total_revenue (bruto), total_revenue_net (sem IVA), iva_rate (normalmente 6), commission_rate (normalmente 2).
- Para cada zona: name, capacity (capacidade total da zona).
- Para cada lote dentro da zona: name, quantity (bilhetes do lote), convites (se indicados, senão 0), price (preço unitário BRUTO c/ IVA), revenue (receita total do lote).
- lot_type: "promo" se contém "PROMOCIONAL" ou "PROMO", senão "regular". Para PMC/PMR/PLUS usar "special".
- Preços são BRUTOS (incluem IVA). Manter como estão.

SAÍDA FORMATO 3:
{
  "source": "previsao_receitas",
  "pages": [
    {
      "venue_name": "CAMPO PEQUENO",
      "event_date": "06 de fev",
      "event_time": "21h00",
      "total_quantity": 6229,
      "total_revenue": 427685.00,
      "total_revenue_net": 403476.42,
      "iva_rate": 6,
      "commission_rate": 2,
      "ticket_medio": 68.66,
      "zones": [
        {
          "name": "Golden Circle",
          "capacity": 2403,
          "lots": [
            { "name": "Lote Promocional", "quantity": 603, "convites": 20, "price": 75.00, "revenue": 43725.00, "lot_type": "promo" },
            { "name": "2 Lote", "quantity": 900, "convites": 0, "price": 85.00, "revenue": 72250.00, "lot_type": "regular" }
          ]
        }
      ]
    }
  ]
}

=== EXTRACÇÃO DO CABEÇALHO (OBRIGATÓRIA — formatos 1 e 2) ===
- Nome do espetáculo/evento → "event_name"
- Período de operações → "period_from" e "period_to" (YYYY-MM-DD)
- Data e hora da sessão → "session_date" (YYYY-MM-DD) e "session_time" (HH:MM)
- Local/Sala → "venue_name"
- Nome da bilheteira (ex: "Ticketline", "BOL") → "ticket_office_name"
- Se algum campo não existir, usar null.

=== FORMATO DE SAÍDA (formatos 1 e 2) ===

Devolve APENAS um JSON válido:
{
  "source": "ticketline" | "bol",
  "event_name": "Illusion Show Com Henry & Klauss",
  "session_date": "2026-04-10",
  "session_time": "21:00",
  "venue_name": "Coliseu de Lisboa",
  "ticket_office_name": "BOL",
  "period_from": null,
  "period_to": null,
  "total_quantity_all": 2204,
  "total_quantity_sold": 1980,
  "total_revenue": 65869.30,
  "rows": [
    {
      "zona": "1ª Plateia",
      "tipo_bilhete": "Inteira",
      "preco_unitario": 38.00,
      "quantidade_total": 468,
      "quantidade_vendida": 320,
      "valor_vendido": 12160.00,
      "iva_rate": 6
    },
    {
      "zona": "1ª Plateia",
      "tipo_bilhete": "Desconto",
      "preco_unitario": 32.25,
      "quantidade_total": 468,
      "quantidade_vendida": 82,
      "valor_vendido": 2644.80,
      "iva_rate": 6
    }
  ]
}

=== REGRAS GERAIS ===
- "iva_rate": se não disponível, usar 6.
- Extrair TODAS as linhas, mesmo com quantidade_vendida = 0.
- DESCARTA linhas com preço unitário inferior a 1,00€.
- Para a linha TOTAL: total_quantity_all, total_quantity_sold (vendidos efectivos), total_revenue.
- VALIDAÇÃO: quantidade_vendida DEVE ser <= quantidade_total. Se não for, corrigir.
- total_quantity_sold = soma de TODAS as vendas (inteiras + desconto + cartões com valor).
- Para formato 3 (Previsão de Receitas): NÃO devolver "rows", devolver "pages" com "zones" e "lots".`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdf_base64 } = await req.json();

    if (!pdf_base64) {
      return new Response(JSON.stringify({ error: "PDF não fornecido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: buildPrompt() },
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
