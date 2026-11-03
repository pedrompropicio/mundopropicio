import { afterEach, expect, it, vi } from "vitest";
import { createRetomaFixture, command } from "./data-entry-retoma458-fixture";
import { createHandler } from "../../supabase/functions/data-entry/handler";
import { runAssistantTurn, ModelDenied, type ModelStep } from "../../supabase/functions/_shared/assistant-orchestrator";
import { boundedAnalysis } from "../../supabase/functions/data-entry/analysis-deadline";
import { buildGmailQuery, gmailFilterSchema, gmailReadOnly } from "../../supabase/functions/_shared/gmail-readonly";

afterEach(() => vi.useRealTimers());
const filters = { from_date: "2026-10-01", to_date: "2026-10-31", sender: "fechos@example.invalid", page_size: 10 };
const input = { text: command, history: [] };
const search: ModelStep = { type: "tool", name: "gmail_search", args: filters };
const inertTools = () => ({ gmailSearch: vi.fn(async () => ({ messages: [], next_page_token: null })), gmailRead: vi.fn(), erpContext: vi.fn() });

it.each(["timeout", "stop"] as const)("real handler: %s during model, one call and no tools; late result ignored", async cause => {
  const f = await createRetomaFixture(false);
  vi.useFakeTimers();
  let complete!: (x: { step: ModelStep; tokens: number }) => void;
  let forwarded: AbortSignal | undefined;
  const modelNext = vi.fn(async (args: { signal: AbortSignal }) => { forwarded = args.signal; return new Promise<{ step: ModelStep; tokens: number }>(resolve => { complete = resolve; }); });
  f.d.assistant!.model = { next: modelNext };
  const controller = new AbortController();
  const h = createHandler(f.d);
  const request = new Request("http://local.invalid", { method: "POST", headers: { Authorization: "Bearer synthetic-only", "Content-Type": "application/json" }, body: JSON.stringify({ action: "assistant_turn", ...input }) });
  Object.defineProperty(request, "signal", { value: controller.signal });
  const pending = h(request);
  // Flush the real handler's auth/context promises before advancing its deadline.
  await vi.advanceTimersByTimeAsync(0);
  expect(modelNext).toHaveBeenCalledTimes(1);
  if (cause === "stop") controller.abort(); else await vi.advanceTimersByTimeAsync(60000);
  // Preserve provider finalization ordering; even an adapter that ignores abort
  // may settle late, but its result cannot launch a tool.
  complete({ step: search, tokens: 1 });
  const response = await pending;
  if (cause === "stop") expect(response.status).toBe(499);
  else { const wire = await response.json(); expect(wire.status).toBe("limit"); expect(wire.text).not.toContain("Parado a pedido"); expect(wire.text).toContain("incerto"); }
  expect(forwarded?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(modelNext).toHaveBeenCalledTimes(1);
  for (const spy of [f.searchMock, f.readMock, f.attachment, f.scan, f.genericScanner, f.upload, f.receipt]) expect(spy).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([true, false])("real handler: empty search terminates with one model/search, coverage complete=%s", async complete => {
  const f = await createRetomaFixture(false);
  f.searchMock.mockResolvedValueOnce({ messages: [], next_page_token: null, search_info: { mode: "flexible", searched: [], candidates: 0, coverage_complete: complete } } as never);
  const r = await (await f.post({ action: "assistant_turn", ...input })).json();
  expect(r.status).toBe("answer"); expect(r.text).toContain(filters.sender); expect(r.text).toContain(filters.from_date);
  if (!complete) expect(r.text).toContain("cobertura é parcial");
  expect(r.trace).toEqual([{ tool: "gmail_search", ok: true, summary: "0 email(s) encontrado(s)" }]);
  expect(f.next).toHaveBeenCalledTimes(1); expect(f.searchMock).toHaveBeenCalledTimes(1);
  for (const spy of [f.readMock, f.scan, f.upload, f.receipt]) expect(spy).not.toHaveBeenCalled();
});

it("OR is literal in the Gmail schema/query; orchestrator asks explicitly, without searching", async () => {
  const args = { ...filters, subject: "fecho OU apuramento", match: "exact" as const, attachments_only: false };
  expect(gmailFilterSchema.parse(args)).toEqual(args);
  expect(buildGmailQuery(args)).toBe('after:2026/10/01 before:2026/11/01 from:fechos@example.invalid subject:"fecho OU apuramento"');
  const tools = inertTools(); const next = vi.fn(async () => ({ step: { ...search, args }, tokens: 1 }));
  const r = await runAssistantTurn({ next }, tools, input, new AbortController().signal);
  expect(r.status).toBe("clarify"); expect(r.text).toContain("Qual dos assuntos");
  expect(next).toHaveBeenCalledTimes(1); expect(tools.gmailSearch).not.toHaveBeenCalled();
});

it.each(["provider", "gmail", "limit"])("%s: bounded call counts without hidden retries", async kind => {
  const tools = inertTools();
  const next = vi.fn(async () => { if (kind === "provider") throw new ModelDenied(503, "Fornecedor indisponível"); return { step: kind === "limit" ? { type: "tool" as const, name: "unknown", args: {} } : search, tokens: 1 }; });
  if (kind === "gmail") tools.gmailSearch.mockRejectedValueOnce(new Error("Gmail fictício indisponível"));
  const r = await runAssistantTurn({ next }, tools, input, new AbortController().signal);
  expect(r.status).toBe(kind === "provider" ? "denied" : kind === "gmail" ? "error" : "limit");
  expect(next).toHaveBeenCalledTimes(kind === "limit" ? 2 : 1);
  expect(tools.gmailSearch).toHaveBeenCalledTimes(kind === "gmail" ? 1 : 0);
  expect(tools.gmailRead).not.toHaveBeenCalled(); expect(tools.erpContext).not.toHaveBeenCalled();
});

it("deadline discards late Gmail results, propagates Stop classification in orchestrator", async () => {
  vi.useFakeTimers(); const tools = inertTools(); let finish!: (r: { messages: []; next_page_token: null }) => void;
  tools.gmailSearch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const next = vi.fn(async () => ({ step: search, tokens: 1 }));
  const pending = boundedAnalysis(new AbortController().signal, signal => runAssistantTurn({ next }, tools, input, signal));
  await vi.advanceTimersByTimeAsync(60000); expect((await pending).status).toBe("limit");
  finish({ messages: [], next_page_token: null }); await vi.advanceTimersByTimeAsync(0);
  expect(next).toHaveBeenCalledTimes(1); expect(tools.gmailSearch).toHaveBeenCalledTimes(1); expect(tools.gmailRead).not.toHaveBeenCalled();
  const stop = new AbortController(); stop.abort();
  expect((await runAssistantTurn({ next }, tools, input, stop.signal)).status).toBe("stopped"); expect(next).toHaveBeenCalledTimes(1);
});

it("synthetic Gmail transport keeps sender/period on every bounded flexible query with zero matches", async () => {
  const transport = vi.fn(async (_path: string, query: URLSearchParams) => { expect(query.get("q")).toContain("after:2026/10/01 before:2026/11/01 from:fechos@example.invalid"); return new Response(JSON.stringify({ messages: [] })); });
  const result = await gmailReadOnly(transport).search({ ...filters, subject: "apuramento", attachments_only: false });
  expect(result.messages).toEqual([]); expect(result.search_info?.coverage_complete).toBe(true);
  expect(transport).toHaveBeenCalledTimes(2);
});

it.each([
  { ...filters, page_size: 21 },
  { ...filters, from_date: "2026-01-01" },
  { ...filters, sender: "evil.invalid OR elsewhere.invalid" },
])("invalid typed filter never reaches Gmail: %j", async args => {
  const tools = inertTools(); const next = vi.fn(async () => ({ step: { type: "tool" as const, name: "gmail_search", args }, tokens: 1 }));
  const r = await runAssistantTurn({ next }, tools, input, new AbortController().signal);
  expect(r.status).toBe("limit"); expect(next).toHaveBeenCalledTimes(2);
  expect(tools.gmailSearch).not.toHaveBeenCalled(); expect(tools.gmailRead).not.toHaveBeenCalled();
});

it.each(["timeout", "stop"] as const)("cooperative provider abort: %s classification and exactly one model call", async cause => {
  vi.useFakeTimers(); const tools = inertTools(); const caller = new AbortController();
  const next = vi.fn(({ signal }: { signal: AbortSignal }) => new Promise<{ step: ModelStep; tokens: number }>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
  const pending = boundedAnalysis(caller.signal, signal => runAssistantTurn({ next }, tools, input, signal));
  if (cause === "stop") caller.abort(); else await vi.advanceTimersByTimeAsync(60000);
  const r = await pending;
  expect(r.status).toBe(cause === "stop" ? "stopped" : "limit");
  expect(r.text.includes("Parado a pedido")).toBe(cause === "stop");
  expect(next).toHaveBeenCalledTimes(1); expect(tools.gmailSearch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
