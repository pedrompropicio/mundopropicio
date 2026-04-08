import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildPrompt(): string {
  return `Analisa este PDF de bilheteira no formato "Relatório por Zona / Tipo de Bilhete" da Ticketline.

ESTRUTURA DO RELATÓRIO:
- O relatório está organizado por ZONAS reais do recinto (ex: "1ª Plateia", "Cadeiras de Orquestra", "Tribuna 1 Impar", "Galeria sem marcação").
- Dentro de cada zona, existem sub-linhas por TIPO DE BILHETE (ex: "Normal", "Black Friday - 20%", "Promocode | Luiza", "Campanha Dia dos Namorados").
- Cada sub-linha tem: Preço Unitário (P. UN.), e múltiplas colunas de Qt./Valor.
- 1ª Qt. = bilhetes CARREGADOS/CONFIGURADOS (total).
- 2ª Qt. = bilhetes EFECTIVAMENTE VENDIDOS (pagos).
- Linhas "SOMA" agrupam os subtotais de uma zona — NÃO extrair linhas SOMA.
- Linha "TOTAL" no final — extrair para validação.

IMPORTANTE: O PDF pode ter DUAS SECÇÕES:
- "Total Geral" (sem filtro de data) — páginas iniciais
- Uma secção com "Data do Evento" específica — páginas seguintes
- Se houver duas secções, extrair APENAS a secção "Total Geral" (primeira secção, que tem TODOS os dados acumulados).
- Se houver apenas uma secção, extrair essa.

EXTRACÇÃO DO CABEÇALHO (OBRIGATÓRIA):
- Nome do espetáculo/evento (ex: "Illusion Show Com Henry & Klauss") → "event_name"
- Período de operações (ex: "Operações de 23-10-2025 a 05-04-2026") → "period_from" e "period_to" (formato YYYY-MM-DD)
- Data e hora da sessão (ex: "Sessão: 05-04-2026 16:00") → "session_date" (YYYY-MM-DD) e "session_time" (HH:MM)
- Local/Sala (ex: "COLISEU PORTO AGEAS") → "venue_name"
- Nome da bilheteira (ex: "Ticketline") → "ticket_office_name"
- Se algum campo não existir, usar null.

Devolve APENAS um JSON válido:
{
  "event_name": "Illusion Show Com Henry & Klauss",
  "session_date": "2026-04-05",
  "session_time": "16:00",
  "venue_name": "COLISEU PORTO AGEAS",
  "ticket_office_name": "Ticketline",
  "period_from": "2025-10-23",
  "period_to": "2026-04-05",
  "total_quantity_all": 1982,
  "total_quantity_sold": 1755,
  "total_revenue": 59015.50,
  "rows": [
    {
      "zona": "1ª Plateia",
      "tipo_bilhete": "Normal",
      "preco_unitario": 38.00,
      "quantidade_total": 345,
      "quantidade_vendida": 317,
      "valor_vendido": 12046.00,
      "iva_rate": 6
    }
  ]
}

REGRAS:
- Cada linha de dados (NÃO "SOMA", NÃO "TOTAL") é uma row a extrair.
- "zona" = nome da zona real do recinto (ex: "1ª Plateia", "Camarote 1ª Impar", "Tribuna 2 Par").
- "tipo_bilhete" = tipo/campanha do bilhete (ex: "Normal", "Black Friday - 20%", "Promocode | Luiza").
- "preco_unitario" = P. UN. da linha.
- "quantidade_total" = 1ª coluna Qt. (total carregado).
- "quantidade_vendida" = 2ª coluna Qt. (vendidos efectivos).
- "valor_vendido" = 2º Valor (receita das vendas).
- "iva_rate" = taxa IVA (se não disponível, usar 6).
- Extrair TODAS as linhas, mesmo com quantidade_vendida = 0.
- DESCARTA linhas com preço unitário inferior a 1,00€.
- Para a linha TOTAL: extrair total_quantity_all (1ª Qt), total_quantity_sold (2ª Qt), total_revenue (2º Valor).
- VALIDAÇÃO: quantidade_vendida DEVE ser <= quantidade_total. Se não for, as colunas estão invertidas — corrigir.`;
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
