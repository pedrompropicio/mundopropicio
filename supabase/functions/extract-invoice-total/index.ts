// Extract the invoice grand total + ownership signals (event/artist name, date)
// from a PDF/image using Lovable AI (Gemini).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


interface ReqBody {
  /** Base64-encoded PDF bytes (no data URL prefix). */
  fileBase64: string;
  /** Original filename — only used for logging. */
  fileName?: string;
  /** Optional MIME (defaults to application/pdf). Images are also accepted. */
  mimeType?: string;
}

interface VatBreakdownRow {
  /** IVA rate as integer percentage: 0, 6, 13, 23. */
  rate: number;
  /** Sum of bases (excl. VAT) at this rate. */
  base: number;
  /** VAT amount at this rate. */
  iva: number;
  /** Total incl. VAT at this rate (base + iva). */
  total: number;
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
  /** Subtotals per VAT rate (footer "Resumo do IVA / Base por taxa"). Empty when single-rate. */
  vat_breakdown: VatBreakdownRow[];
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
      "You analyze any financial/event document: invoice (fatura/nota fiscal), pro forma, quote/proposal (orçamento/proposta), payment receipt (recibo/comprovante de pagamento), bank transfer proof (comprovativo de transferência), contract (contrato). Extract: (1) the most relevant MONETARY AMOUNT for the document — for invoices/proformas/receipts use GRAND TOTAL incl. VAT ('Total a pagar', 'Valor Total'); for transfer proofs use the transferred amount ('Montante', 'Valor transferido'); for proposals/quotes use the proposed total; for contracts use the contracted fee/cachet (cachê, honorários, valor do contrato). (2) any names that identify WHO/WHAT it refers to (event names, artist/band names, client names, project names, show names, tour names — comma-separated, verbatim); (3) the document/contract/transfer date; (4) the document type; (5) a SHORT description (max ~150 chars, Portuguese) summarising the SERVICES OR PRODUCTS being billed/contracted (e.g. 'Aluguer de som e luz para palco principal', 'Cachê artístico DJ', 'Hospedagem 3 noites hotel X', 'Catering camarim 30 pax'); (6) the VAT BREAKDOWN footer (Portuguese invoices always show 'Resumo do IVA' / 'Base tributável' / 'Taxa' / 'IVA' / 'Total' summarised by rate at the bottom). For EACH VAT rate present (0, 6, 13, 23) report: rate (integer %), base (sum of bases excl. VAT at that rate), iva (VAT amount at that rate), total (base + iva). If the document only has a single rate, return ONE row anyway. If no VAT info is visible (e.g. transfer proof, contract without breakdown), return an empty array. Use null for amounts when truly absent.";

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
                  vat_breakdown: {
                    type: "array",
                    description: "Subtotals per VAT rate from the document footer ('Resumo do IVA'/'Base por taxa'). One row per distinct rate present (0/6/13/23). Empty array if no VAT info visible.",
                    items: {
                      type: "object",
                      properties: {
                        rate: { type: "number", description: "VAT rate as integer percent: 0, 6, 13 or 23." },
                        base: { type: "number", description: "Sum of bases (excl. VAT) at this rate. Dot decimal." },
                        iva: { type: "number", description: "VAT amount at this rate." },
                        total: { type: "number", description: "base + iva at this rate." },
                      },
                      required: ["rate", "base", "iva", "total"],
                      additionalProperties: false,
                    },
                  },
                  notes: {
                    type: "string",
                    description: "Brief reason — e.g. 'contrato Maiara e Maraisa, cachê 50000€' or 'comprovativo TRF 1234.56€'.",
                  },
                },
                required: ["total", "currency", "confidence", "mentioned_names", "document_date", "document_type", "service_description", "vat_breakdown", "notes"],
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
      return json({ total: null, currency: null, confidence: "low", mentioned_names: null, document_date: null, document_type: null, service_description: null, vat_breakdown: [], error: "No tool call returned" } satisfies ExtractResult);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      return json({ total: null, currency: null, confidence: "low", mentioned_names: null, document_date: null, document_type: null, service_description: null, vat_breakdown: [], error: "Invalid JSON from model", raw: argsStr } satisfies ExtractResult);
    }

    const validTypes = ["invoice", "proforma", "quote", "receipt", "transfer", "contract", "other"];
    const allowedRates = [0, 6, 13, 23];
    const rawBreakdown = Array.isArray(parsed.vat_breakdown) ? parsed.vat_breakdown : [];
    const vat_breakdown: VatBreakdownRow[] = rawBreakdown
      .map((r: any) => {
        const rate = Math.round(Number(r?.rate));
        const base = Number(r?.base);
        const iva = Number(r?.iva);
        const total = Number(r?.total);
        if (!allowedRates.includes(rate)) return null;
        if (![base, iva, total].every((n) => Number.isFinite(n))) return null;
        return { rate, base: Math.round(base * 100) / 100, iva: Math.round(iva * 100) / 100, total: Math.round(total * 100) / 100 };
      })
      .filter((r: VatBreakdownRow | null): r is VatBreakdownRow => r !== null)
      // dedupe by rate, keep largest base if duplicated
      .reduce((acc: VatBreakdownRow[], row: VatBreakdownRow) => {
        const existing = acc.find((x) => x.rate === row.rate);
        if (!existing) acc.push(row);
        else if (row.base > existing.base) Object.assign(existing, row);
        return acc;
      }, [])
      .sort((a: VatBreakdownRow, b: VatBreakdownRow) => a.rate - b.rate);

    const out: ExtractResult = {
      total: typeof parsed.total === "number" && Number.isFinite(parsed.total) ? parsed.total : null,
      currency: typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : null,
      confidence: (["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low") as ExtractResult["confidence"],
      mentioned_names: typeof parsed.mentioned_names === "string" && parsed.mentioned_names.trim() ? parsed.mentioned_names.trim() : null,
      document_date: typeof parsed.document_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.document_date) ? parsed.document_date : null,
      document_type: typeof parsed.document_type === "string" && validTypes.includes(parsed.document_type) ? parsed.document_type : null,
      service_description: typeof parsed.service_description === "string" && parsed.service_description.trim() ? parsed.service_description.trim().slice(0, 200) : null,
      vat_breakdown,
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
