// Extract the invoice grand total + ownership signals (event/artist name, date)
// from a PDF/image using Lovable AI (Gemini).
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
  /** Free-text snippet with names mentioned in the document (event, artist, client, project). */
  mentioned_names: string | null;
  /** Best invoice/document date in ISO YYYY-MM-DD if detected. */
  document_date: string | null;
  /** Detected document type: invoice, proforma, quote/proposal, receipt, transfer, contract, other. */
  document_type: string | null;
  /** Concise free-text description of the services/products billed (used for category matching). */
  service_description: string | null;
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
      "You analyze any financial/event document: invoice (fatura/nota fiscal), pro forma, quote/proposal (orçamento/proposta), payment receipt (recibo/comprovante de pagamento), bank transfer proof (comprovativo de transferência), contract (contrato). Extract: (1) the most relevant MONETARY AMOUNT for the document — for invoices/proformas/receipts use GRAND TOTAL incl. VAT ('Total a pagar', 'Valor Total'); for transfer proofs use the transferred amount ('Montante', 'Valor transferido'); for proposals/quotes use the proposed total; for contracts use the contracted fee/cachet (cachê, honorários, valor do contrato). (2) any names that identify WHO/WHAT it refers to (event names, artist/band names, client names, project names, show names, tour names — comma-separated, verbatim); (3) the document/contract/transfer date; (4) the document type; (5) a SHORT description (max ~150 chars, Portuguese) summarising the SERVICES OR PRODUCTS being billed/contracted (e.g. 'Aluguer de som e luz para palco principal', 'Cachê artístico DJ', 'Hospedagem 3 noites hotel X', 'Catering camarim 30 pax'). Use null when truly absent.";

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
                text: "Identify the document type and extract the most relevant monetary amount, mentioned names (event/artist/client/project) and document date. Call the tool exactly once.",
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
              description: "Report document type, most relevant monetary amount, mentioned names and date.",
              parameters: {
                type: "object",
                properties: {
                  total: {
                    type: ["number", "null"],
                    description: "Most relevant monetary amount (incl. VAT for invoices/receipts; transferred amount for transfer proofs; proposed total for quotes; contracted fee for contracts). Use dot as decimal separator. Null if unreadable.",
                  },
                  currency: {
                    type: ["string", "null"],
                    description: "ISO 4217 currency code (EUR, BRL, USD…) or null.",
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "high = amount label clearly visible; medium = inferred from context; low = guessed.",
                  },
                  mentioned_names: {
                    type: ["string", "null"],
                    description: "Comma-separated list of every event/artist/client/project/show/tour name verbatim from the document. Null if none.",
                  },
                  document_date: {
                    type: ["string", "null"],
                    description: "ISO date YYYY-MM-DD of the document (invoice date, transfer date, contract date…). Null if not detected.",
                  },
                  document_type: {
                    type: ["string", "null"],
                    enum: ["invoice", "proforma", "quote", "receipt", "transfer", "contract", "other", null],
                    description: "Document type detected: invoice (fatura/nota fiscal), proforma, quote (orçamento/proposta), receipt (recibo), transfer (comprovativo de transferência), contract (contrato), other.",
                  },
                  service_description: {
                    type: ["string", "null"],
                    description: "Short PT-PT description of the services/products being billed or contracted (max ~150 chars). E.g. 'Aluguer de som e luz', 'Cachê artístico', 'Hospedagem hotel'. Null if unreadable.",
                  },
                  notes: {
                    type: "string",
                    description: "Brief reason — e.g. 'contrato Maiara e Maraisa, cachê 50000€' or 'comprovativo TRF 1234.56€'.",
                  },
                },
                required: ["total", "currency", "confidence", "mentioned_names", "document_date", "document_type", "service_description", "notes"],
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
      return json({ total: null, currency: null, confidence: "low", mentioned_names: null, document_date: null, document_type: null, error: "No tool call returned" } satisfies ExtractResult);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return json({ total: null, currency: null, confidence: "low", mentioned_names: null, document_date: null, document_type: null, error: "Invalid JSON from model", raw: argsStr } satisfies ExtractResult);
    }

    const validTypes = ["invoice", "proforma", "quote", "receipt", "transfer", "contract", "other"];
    const out: ExtractResult = {
      total: typeof parsed.total === "number" && Number.isFinite(parsed.total) ? parsed.total : null,
      currency: typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : null,
      confidence: (["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low") as ExtractResult["confidence"],
      mentioned_names: typeof parsed.mentioned_names === "string" && parsed.mentioned_names.trim() ? parsed.mentioned_names.trim() : null,
      document_date: typeof parsed.document_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.document_date) ? parsed.document_date : null,
      document_type: typeof parsed.document_type === "string" && validTypes.includes(parsed.document_type) ? parsed.document_type : null,
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
