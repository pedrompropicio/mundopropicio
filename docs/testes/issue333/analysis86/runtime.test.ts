/** Real Deno execution, default-deny network/env permissions, synthetic bytes only. */
import { generateDocumentAnalysis } from "../../../../supabase/functions/_shared/issue333-ai/provider.ts";
import { validateAnalysisReport } from "../../../../supabase/functions/_shared/data-entry-analysis.ts";
import { analysisStream } from "../../../../supabase/functions/data-entry/analysis-stream.ts";

function assert(value: boolean, message: string) { if (!value) throw new Error(message); }
Deno.test("86 real Deno SDK Responses → validation → final-only SSE, zero egress", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init && "body" in init ? init.body : undefined));
    assert(body.stream === true && body.store === false && body.max_output_tokens === 6000, "request limits");
    assert(body.text.format.type === "json_schema" && body.text.format.strict === true, "strict schema");
    const raw = { answer: "Revisão humana.", fields: [], warnings: [] };
    const events = [
      { type: "response.created", response: { id: "local-private-id", created_at: 1, model: "openai/gpt-6-astra" } },
      { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "m1" } },
      { type: "response.output_text.delta", item_id: "m1", delta: JSON.stringify(raw) },
      { type: "response.completed", response: {} },
    ];
    return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const request = new Request("http://local.invalid");
    const ui = await analysisStream(request, {}, async () => validateAnalysisReport(await generateDocumentAnalysis(request, { bytes: new Uint8Array([1, 2]), mime: "image/png", message: "Analisa", history: [] }, "local-placeholder"), { document_id: "local-doc", document_sha256: "a".repeat(64), company_id: "local-company", company_tax: null })).text();
    assert(calls === 1, "exactly one request");
    assert(ui.includes('"type":"data-analysis"') && ui.includes("Revisão humana."), "final report");
    assert(!ui.includes("local-private-id") && !ui.includes("local-placeholder"), "no metadata or credentials");
  } finally { globalThis.fetch = original; }
});