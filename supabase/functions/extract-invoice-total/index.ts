// Extract the invoice grand total (and currency) from a PDF using Lovable AI (Gemini).
// Returns { total: number | null, currency: string | null, confidence: "high"|"medium"|"low", raw?: string }
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

interface ReqBody {
  /** Base64-encoded PDF bytes (no data URL prefix). */
  fileBase64: string;
  /** Original filename — only used for logging. */
  fileName?: string;
  /** Optional MIME (defaults to application/pdf). Images are also accepted. */
  mimeType?: string;
}

interface ExtractResult {
  total: number | null;
  currency: string | null;
  confidence: "high" | "medium" | "low";
  raw?: string;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const body = (await req.json()) as ReqBody;
    if (!body?.fileBase64 || typeof body.fileBase64 !== "string") {
      return json({ error: "fileBase64 required" }, 400);
    }
    const mime = body.mimeType || "application/pdf";

    const systemPrompt =
      "You extract the GRAND TOTAL amount payable from invoices/receipts (Portuguese 'Total a pagar', 'Valor Total', 'Total fatura'; Brazilian 'Valor Total', 'Total Geral'; English 'Total', 'Amount Due'). Always pick the FINAL total INCLUDING VAT, not subtotals or VAT-only lines. Use null if the document is not an invoice or no total is found.";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              {
                type: "text",
                text: "Extract the invoice grand total. Call the tool exactly once.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${mime};base64,${body.fileBase64}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_invoice_total",
              description: "Report the invoice grand total payable.",
              parameters: {
                type: "object",
                properties: {
                  total: {
                    type: ["number", "null"],
                    description: "Grand total INCLUDING VAT, as a number (use dot as decimal separator). Null if not an invoice or unreadable.",
                  },
                  currency: {
                    type: ["string", "null"],
                    description: "ISO 4217 currency code (EUR, BRL, USD…) or null.",
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "high = total label clearly visible; medium = inferred from context; low = guessed.",
                  },
                  notes: {
                    type: "string",
                    description: "Brief reason — e.g. 'found Total a Pagar 1234.56€' or 'no invoice detected'.",
                  },
                },
                required: ["total", "currency", "confidence", "notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_invoice_total" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "Rate limit excedido. Tenta novamente em alguns segundos." }, 429);
      if (aiResp.status === 402) return json({ error: "Créditos esgotados na Lovable AI." }, 402);
      const errText = await aiResp.text().catch(() => "");
      console.error("AI gateway error", aiResp.status, errText);
      return json({ error: `AI gateway error (${aiResp.status})` }, 502);
    }

    const data = await aiResp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      return json({ total: null, currency: null, confidence: "low", error: "No tool call returned" } satisfies ExtractResult);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return json({ total: null, currency: null, confidence: "low", error: "Invalid JSON from model", raw: argsStr } satisfies ExtractResult);
    }

    const out: ExtractResult = {
      total: typeof parsed.total === "number" && Number.isFinite(parsed.total) ? parsed.total : null,
      currency: typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : null,
      confidence: (["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low") as ExtractResult["confidence"],
      raw: typeof parsed.notes === "string" ? parsed.notes : undefined,
    };
    return json(out);
  } catch (err) {
    console.error("extract-invoice-total error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
