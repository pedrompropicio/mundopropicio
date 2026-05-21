import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditRow {
  source: "bp" | "tx";
  id: string;
  description: string;
  specification?: string | null;
  current_category_code: string | null;
  current_category_name: string | null;
  event_label?: string | null;
}

interface CategoryLite {
  id: string;
  code: string;
  name: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { rows, categories }: { rows: AuditRow[]; categories: CategoryLite[] } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!rows?.length) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const categoryList = categories.map((c) => `${c.code} - ${c.name}`).join("\n");
    const rowList = rows
      .map((r, i) => {
        const ev = r.event_label ? ` [evento: ${r.event_label}]` : "";
        const spec = r.specification ? ` (spec: "${r.specification}")` : "";
        const cur = r.current_category_code ? ` <atual: ${r.current_category_code}>` : " <atual: SEM CATEGORIA>";
        return `${i}: "${r.description}"${spec}${ev}${cur}`;
      })
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
            content: `Você é um auditor contabilístico de eventos musicais em Portugal. Avalie se a categoria atual de cada despesa está correta. Caso esteja errada ou ambígua, sugira uma melhor da lista (sempre uma categoria FOLHA/leaf). Devolva sempre o código sugerido (mesmo que seja igual ao atual) e um nível de confiança 0..1, mais um motivo curto (≤120 chars). Nunca invente códigos fora da lista. Considere descrição + spec + nome do evento em conjunto. Seja conservador APENAS quando a linha já tem categoria atribuída — prefira manter se houver dúvida razoável. CRÍTICO: linhas marcadas <atual: SEM CATEGORIA> NÃO têm classificação real (são placeholders "A Classificar"); para essas, é OBRIGATÓRIO sugerir a melhor categoria folha possível com base na descrição, mesmo com confiança baixa — nunca devolvas vazio nem mantenhas "sem categoria".`,
          },
          {
            role: "user",
            content: `PLANO DE CONTAS (apenas categorias folha permitidas como sugestão):\n${categoryList}\n\nLINHAS A AUDITAR:\n${rowList}\n\nDevolva uma sugestão para CADA índice.`,
          },
        ],
        temperature: 0.05,
        tools: [
          {
            type: "function",
            function: {
              name: "audit_classifications",
              description: "Return audit suggestion for each row",
              parameters: {
                type: "object",
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        suggested_code: { type: "string" },
                        confidence: { type: "number" },
                        reason: { type: "string" },
                      },
                      required: ["index", "suggested_code", "confidence", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["matches"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "audit_classifications" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados — adicione créditos ao workspace Lovable AI." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: `AI gateway error ${response.status}`, detail: t.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const toolCall = message?.tool_calls?.[0];

    let result: { matches: unknown[] } = { matches: [] };
    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch (err) {
        console.error("Failed to parse tool_call arguments:", err, toolCall.function.arguments?.slice?.(0, 300));
      }
    } else if (typeof message?.content === "string") {
      // Fallback: model returned JSON in content instead of tool_call
      try {
        const m = message.content.match(/\{[\s\S]*\}/);
        if (m) result = JSON.parse(m[0]);
      } catch (err) {
        console.error("Failed to parse content JSON fallback:", err);
      }
    }

    if (!Array.isArray(result.matches)) result.matches = [];

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("audit-categories error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
