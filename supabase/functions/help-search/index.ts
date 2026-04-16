// Pesquisa inteligente no Manual de Orientação.
// Recebe a dúvida do utilizador + lista compacta de tópicos do manual,
// e devolve uma resposta orientativa + ids dos tópicos mais relevantes.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TopicRef {
  id: string; // sectionId::topicIndex
  section: string;
  title: string;
  excerpt: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, topics } = (await req.json()) as {
      question: string;
      topics: TopicRef[];
    };

    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Pergunta demasiado curta." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI key não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Construir índice compacto para o modelo
    const indexText = topics
      .map((t) => `[${t.id}] (${t.section}) ${t.title} — ${t.excerpt}`)
      .join("\n");

    const systemPrompt = `És um assistente do Manual de Orientação da aplicação MP Gestão Eventos.
O utilizador descreve um problema ou dúvida em linguagem natural (português europeu).
A tua tarefa:
1) Identificar os tópicos mais relevantes do manual (até 5).
2) Escrever uma orientação curta, prática e amigável (máx. 6 frases) explicando o que fazer, citando os títulos dos tópicos relevantes.
3) Se a dúvida não tiver correspondência no manual, dizê-lo honestamente e sugerir contactar suporte.

Devolve SEMPRE através da função "answer_help".`;

    const userPrompt = `Dúvida do utilizador:
"""
${question.trim()}
"""

Tópicos disponíveis no manual (id, secção, título, excerto):
${indexText}`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "answer_help",
                description: "Responde à dúvida com orientação e tópicos relevantes do manual.",
                parameters: {
                  type: "object",
                  properties: {
                    answer: {
                      type: "string",
                      description: "Orientação curta em português europeu (máx. 6 frases).",
                    },
                    relevantTopicIds: {
                      type: "array",
                      items: { type: "string" },
                      description: "Lista de até 5 ids de tópicos relevantes, no formato sectionId::topicIndex.",
                    },
                    confidence: {
                      type: "string",
                      enum: ["alta", "media", "baixa"],
                      description: "Quão segura é a resposta face ao manual.",
                    },
                  },
                  required: ["answer", "relevantTopicIds", "confidence"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "answer_help" } },
        }),
      },
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Demasiados pedidos. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos AI esgotados. Contacte o administrador." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "Erro ao consultar a AI." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ error: "Resposta AI inválida." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("help-search error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
