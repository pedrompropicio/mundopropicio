// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import { generateDocumentAnalysis, safeProviderError } from "../../supabase/functions/_shared/issue333-ai/provider";
import { createResponsesCall } from "../../supabase/functions/_shared/issue333-ai/responses";
import { analysisStream } from "../../supabase/functions/data-entry/analysis-stream";
import { validateAnalysisReport } from "../../supabase/functions/_shared/data-entry-analysis";

const wire = { answer: "Revisão humana necessária.", fields: [], warnings: [] };
const input = { bytes: new Uint8Array([1, 2]), mime: "image/png" as const, message: "Analisa", history: [] };
const context = { document_id: "local-document", document_sha256: "a".repeat(64), company_id: "local-company", company_tax: null };
const request = (signal?: AbortSignal) => new Request("http://local.invalid/analyze", { signal });
const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream", "X-Lovable-AIG-Run-ID": "private-run-marker", "X-Request-ID": "private-request-marker" } });
const events = (text: string) => [
  { type: "response.created", response: { id: "private-response-marker", created_at: 1, model: "openai/gpt-6-astra" } },
  { type: "response.output_item.added", output_index: 0, item: { type: "reasoning", id: "r1", encrypted_content: "private-encrypted-marker" } },
  { type: "response.reasoning_summary_part.added", item_id: "r1", summary_index: 0, part: { type: "summary_text", text: "" } },
  { type: "response.reasoning_summary_text.delta", item_id: "r1", summary_index: 0, delta: "private-thinking-marker" },
  { type: "response.output_item.added", output_index: 1, item: { type: "message", id: "m1" } },
  { type: "response.output_text.delta", item_id: "m1", delta: text },
  { type: "response.completed", response: {} },
];
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("#333 real server SDK offline86", () => {
  it("emits strict Responses schema, configured limits and only validated final UI data", async () => {
    let body: Record<string, any> = {};
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return sse(events(JSON.stringify(wire))); });
    vi.stubGlobal("fetch", fetch);
    const response = analysisStream(request(), { "Access-Control-Allow-Origin": "http://local.invalid" }, async () => validateAnalysisReport(await generateDocumentAnalysis(request(), input, "local-placeholder-not-a-secret"), context));
    const ui = await response.text();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body.model).toBe("openai/gpt-6-astra"); expect(body.stream).toBe(true); expect(body.store).toBe(false); expect(body.max_output_tokens).toBe(6000);
    expect(body.reasoning).toEqual({ effort: "low", summary: "auto" }); expect(body.include).toContain("reasoning.encrypted_content");
    expect(body.tools ?? []).toEqual([]);
    const format = body.text.format; expect(format.type).toBe("json_schema"); expect(format.strict).toBe(true);
    expect(format.schema.additionalProperties).toBe(false); expect(format.schema.required.sort()).toEqual(["answer", "fields", "warnings"]);
    const fields = format.schema.properties.fields.items;
    expect(fields.additionalProperties).toBe(false); expect(fields.required.sort()).toEqual(["confidence", "field", "page", "quote", "uncertainty", "value"]);
    expect(ui).toContain('"type":"data-analysis"'); expect(ui).toContain(wire.answer);
    for (const marker of ["private-thinking-marker", "private-encrypted-marker", "private-response-marker", "private-request-marker", "private-run-marker", "local-placeholder-not-a-secret", "reasoning-start", "responseBody"]) expect(ui).not.toContain(marker);
    expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(response.headers.get("X-Request-ID")).toBeNull();
  });
  it.each([403, 429])("HTTP%s is terminal, safe and never retried", async (status) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: "Bearer local-sensitive-marker https://private.invalid/path?key=local-sensitive-marker", error: { message: "local-sensitive-marker" } }), { status }));
    vi.stubGlobal("fetch", fetch);
    const ui = await analysisStream(request(), {}, async () => validateAnalysisReport(await generateDocumentAnalysis(request(), input, "local-placeholder"), context)).text();
    expect(ui).toContain(`"status":${status}`); expect(ui).not.toContain("local-sensitive-marker"); expect(ui).not.toContain("private.invalid"); expect(ui).not.toContain('"type":"data-analysis"'); expect(fetch).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
  it("maps arbitrary JSON.message without trusting upstream text", () => {
    const e = new APICallError({ message: "local-sensitive-marker", url: "https://private.invalid", requestBodyValues: {}, statusCode: 403, responseBody: '{"message":"local-sensitive-marker"}' });
    expect(safeProviderError(e)).toMatchObject({ status: 403, message: "Acesso ao serviço de análise bloqueado. É necessária revisão pelo responsável." });
  });
  it.each(["", "not-json", '{"answer":"unvalidated","fields":{},"warnings":[]}'])("empty/refused or invalid output fails without success or retries: %s", async (text) => {
    const refusal = { type: "response.refusal.delta", item_id: "m1", output_index: 1, content_index: 0, delta: "private-refusal-marker" };
    const fetch = vi.fn(async () => sse(text ? events(text) : [...events("").slice(0, -1), refusal, { type: "response.completed", response: {} }]));
    vi.stubGlobal("fetch", fetch);
    const ui = await analysisStream(request(), {}, async () => validateAnalysisReport(await generateDocumentAnalysis(request(), input, "local-placeholder"), context)).text();
    expect(ui).toContain('"type":"data-analysis-error"'); expect(ui).not.toContain('"type":"data-analysis"'); expect(ui).not.toContain("private-refusal-marker"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("explicit stop aborts the upstream request and returns499, no retry", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("local-sensitive-marker", "AbortError");
    });
    vi.stubGlobal("fetch", fetch);
    await expect(generateDocumentAnalysis(request(controller.signal), input, "local-placeholder")).rejects.toMatchObject({ status: 499, message: "Análise cancelada." });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("server helper exposes no UI streaming factory", () => {
    const controller = new AbortController(); controller.abort();
    const call = createResponsesCall(request(controller.signal), { baseURL: "http://local.invalid/v1", apiKey: "local-placeholder", model: "openai/gpt-6-astra" }, [{ role: "user", content: "local" }]);
    expect("response" in call).toBe(false);
    void Promise.resolve(call.result.output).catch(() => {});
  });
});