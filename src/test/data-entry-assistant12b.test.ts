import { describe, it, expect, vi } from "vitest";
import { readAssistantErp, ERP_LIMITS, type ErpRead } from "../../supabase/functions/_shared/assistant-erp";
import { signContinuation, verifyContinuation, requestHash } from "../../supabase/functions/_shared/assistant-continuation";
import { createAssistantModel, parseModelStep } from "../../supabase/functions/_shared/issue333-ai/assistant-model";
import { durableProviderControl, type ControlStore, type ControlRecord } from "../../supabase/functions/_shared/issue333-ai/control";
import { buildTicketlineProposal, authorizationMatches, proposalEffectsHash } from "../../supabase/functions/_shared/assistant-ticketline-proposal";
import { runAssistantTurn, ASSISTANT_CONTRACT, TOOL_NAMES } from "../../supabase/functions/_shared/assistant-orchestrator";
import { createHandler, type Deps } from "../../supabase/functions/data-entry/handler";
const company = "11111111-1111-4111-8111-111111111111", user = "22222222-2222-4222-8222-222222222222", event = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secret = "synthetic-local-secret-32bytes-only-no-credentials";
const filters = { from_date: "2026-10-01", to_date: "2026-10-19", sender: "exemplo.invalid", page_size: 10 };
const signal = () => new AbortController().signal;
function control() {
  let row: ControlRecord = { revision: "1", state: "ready", enabled: true, reviewed: true, claim: null, stage: "idle", reason: "none", status: null };
  const outcomes: string[] = [];
  const store: ControlStore = { async transition(op, claim, _rev, outcome, status) {
    if (op === "claim") row = { ...row, claim: claim ?? null, stage: "claimed" };
    if (op === "post") row = { ...row, stage: "post_started" };
    if (op === "finish") { outcomes.push(outcome ?? ""); row = { ...row, claim: null, stage: "idle", reason: outcome ?? "none", status: status ?? null, ...(outcome === "provider_denied" ? { state: "denied_provider" as const } : outcome === "credit_denied" ? { state: "paused_credit" as const } : {}) }; }
    return { ...row };
  } };
  return { control: durableProviderControl(store), outcomes };
}
function response(text: string) {
  const output = [{ type: "message", id: "msg_mock", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }];
  const frames = [
    { type: "response.created", response: { id: "resp_mock", model: "openai/gpt-6-astra", created_at: 0 } },
    { type: "response.output_item.added", output_index: 0, item: output[0] },
    { type: "response.content_part.added", item_id: "msg_mock", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
    { type: "response.output_text.delta", item_id: "msg_mock", output_index: 0, content_index: 0, delta: text },
    { type: "response.output_item.done", output_index: 0, item: output[0] },
    { type: "response.completed", response: { id: "resp_mock", model: "openai/gpt-6-astra", output, usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120, output_tokens_details: { reasoning_tokens: 0 } } } },
  ];
  return new Response(frames.map(f => `data: ${JSON.stringify(f)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream", "X-Lovable-AIG-Run-ID": "server-issued-mock-run" } });
}
describe("#333 real adapters with synthetic HTTP only", () => {
  it("SDK emits Responses strict schema, budgets and store:false, with durable completion", async () => {
    const c = control(); const bodies: Record<string, any>[] = [];
    const mockFetch = vi.fn(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return response(JSON.stringify({ type: "final", name: null, args_json: null, text: "Nada gravado." })); });
    const m = createAssistantModel({ apiKey: "local-not-a-key", control: c.control, validateContext: async () => {}, fetch: mockFetch });
    const r = await m.next({ contract: ASSISTANT_CONTRACT, tools: TOOL_NAMES, messages: [{ role: "user", content: "olá" }], signal: signal() });
    expect(r.step).toEqual({ type: "final", text: "Nada gravado." }); expect(r.tokens).toBe(120);
    expect(bodies[0].model).toBe("openai/gpt-6-astra"); expect(bodies[0].stream).toBe(true); expect(bodies[0].store).toBe(false);
    expect(bodies[0].text.format.schema.additionalProperties).toBe(false);
    expect(bodies[0].max_output_tokens).toBeLessThanOrEqual(6000);
    expect(c.outcomes).toEqual(["success"]);
  });
  it("real handler → SDK HTTP → own Gmail → caller-scoped ERP → blocked proposal", async () => {
    const c = control(); let current = 0; const requests: RequestInit[] = [];
    const st = { number: "AP-01", statement_date: "2026-10-10", document_total_cents: 1000, lines: [{ line_type: "event_right", description: "Direito Evento", amount_cents: 1000, event_hint: "Evento" }] };
    const steps = [{ type: "tool", name: "gmail_search", args_json: JSON.stringify(filters), text: null }, { type: "tool", name: "gmail_read", args_json: JSON.stringify({ message_id: "msg000001" }), text: null }, { type: "tool", name: "prepare_ticketline_proposal", args_json: JSON.stringify({ message_id: "msg000001", statement: st }), text: null }];
    const model = createAssistantModel({ apiKey: "local", control: c.control, validateContext: async () => {}, fetch: async (_url, init) => { requests.push(init ?? {}); return response(JSON.stringify(steps[current++])); } });
    const read = vi.fn(async () => ({ message_id: "msg000001", from: "x@exemplo.invalid", subject: "Fecho Evento", date: "2026-10-10", kind: "plain" as const, body_text: "Apuramento AP-01, Evento, direito 10.00 EUR", truncated: false }));
    const erp = vi.fn(async (token, comp) => { expect(token).toBe("local-jwt-not-real"); expect(comp).toBe(company); return { company_id: company, events: [{ id: event, name: "Evento", date: null, sealed: false }], existing_statements: [] }; });
    const deps: Deps = { uploadEnabled: false, pilotScoped: true, cors: {}, getUser: async () => ({ id: user }), userRpc: async (_token, name) => ({ data: name === "my_effective_permissions" ? { role: "manager", company_id: company } : { preparation: false, execute: false }, error: null }), recordReceipt: vi.fn(), storage: { upload: vi.fn(), download: vi.fn() },
      assistantEnabled: true, assistant: { model, erpContext: erp }, gmail: { reader: async () => ({ search: async () => ({ messages: [{ message_id: "msg000001", from: "x", subject: "Fecho", date: "2026-10-10", attachments: [] }], next_page_token: null }), read, attachment: vi.fn() }) } };
    const r = await createHandler(deps)(new Request("http://local.invalid", { method: "POST", headers: { Authorization: "Bearer local-jwt-not-real", "Content-Type": "application/json" }, body: JSON.stringify({ action: "assistant_turn", text: "Lê o fecho", history: [] }) }));
    const body = await r.json(); expect(body.status).toBe("proposal"); expect(body.proposal.event.id).toBe(event); expect(body.proposal.effects.source_content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.proposal.actions.every((a: { blocked_reason: string }) => !!a.blocked_reason)).toBe(true);
    expect(requests).toHaveLength(3); expect(new Headers(requests[1].headers).get("X-Lovable-AIG-Run-ID")).toBe("server-issued-mock-run"); expect(c.outcomes).toEqual(["success", "success", "success"]);
    expect(deps.storage.upload).not.toHaveBeenCalled(); expect(deps.recordReceipt).not.toHaveBeenCalled();
  });
  it.each([402, 403, 404])("terminal HTTP %i is not retried and denial persists", async status => {
    const c = control(); const f = vi.fn(async () => new Response(JSON.stringify({ error: { message: "mock-denied", type: "provider_denial" } }), { status, headers: { "Content-Type": "application/json" } }));
    const m = createAssistantModel({ apiKey: "local-not-a-key", control: c.control, validateContext: async () => {}, fetch: f });
    await expect(m.next({ contract: "local", tools: TOOL_NAMES, messages: [{ role: "user", content: "pedido" }], signal: signal() })).rejects.toMatchObject({ status });
    expect(f).toHaveBeenCalledTimes(1);
    if (status === 403) { await expect(m.next({ contract: "local", tools: TOOL_NAMES, messages: [{ role: "user", content: "pedido" }], signal: signal() })).rejects.toMatchObject({ status: 503 }); expect(f).toHaveBeenCalledTimes(1); }
  });
  it("Stop propagates to provider fetch and classifies uncertain after POST", async () => {
    const c = control(); const ac = new AbortController(); let reached: () => void = () => {}; const ready = new Promise<void>(r => reached = r);
    const f: typeof fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => { reached(); init?.signal?.addEventListener("abort", () => reject(new DOMException("stop", "AbortError")), { once: true }); });
    const m = createAssistantModel({ apiKey: "local-not-a-key", control: c.control, validateContext: async () => {}, fetch: f });
    const pending = m.next({ contract: "local", tools: TOOL_NAMES, messages: [{ role: "user", content: "pedido" }], signal: ac.signal });
    await ready; ac.abort(); await expect(pending).rejects.toBeDefined(); expect(c.outcomes).toEqual(["cancelled_after_post"]);
  });
  it("oversized transcript is refused before HTTP", async () => {
    const f = vi.fn(); const m = createAssistantModel({ apiKey: "local", control: control().control, validateContext: async () => {}, fetch: f });
    await expect(m.next({ contract: "local", tools: TOOL_NAMES, messages: [{ role: "user", content: "x".repeat(40000) }], signal: signal() })).rejects.toThrow(/Limite/); expect(f).not.toHaveBeenCalled();
  });
  it("invalid model response cannot request payment, unknown tools or human confirmation", () => {
    expect(() => parseModelStep({ type: "tool", name: "register_payment", args_json: "{}", text: null })).toThrow();
    expect(() => parseModelStep({ type: "final", name: null, args_json: null, text: "", confirmed_by_user: true })).toThrow();
  });
  it("HTTP 200 with an invalid tool is terminal without retry", async () => {
    const c = control(); const f = vi.fn(async () => response(JSON.stringify({ type: "tool", name: "register_payment", args_json: "{}", text: null })));
    const m = createAssistantModel({ apiKey: "local", control: c.control, validateContext: async () => {}, fetch: f });
    await expect(m.next({ contract: "local", tools: TOOL_NAMES, messages: [{ role: "user", content: "Pedido" }], signal: signal() })).rejects.toThrow(/Ferramenta/);
    expect(f).toHaveBeenCalledTimes(1); expect(c.outcomes).toEqual(["invalid_response"]);
  });
  it("signed candidates disappearing from a fresh search cannot be read", async () => {
    const read = vi.fn(); const r = await runAssistantTurn({ next: vi.fn() }, { resume: { user, company, expires: Date.now() + 10000, requestHash: "local", filters, messages: ["msg000001"], events: [], message: null }, gmailRead: read, gmailSearch: async () => ({ messages: [], next_page_token: null }), erpContext: vi.fn() }, { text: "Pedido", history: [], selection: { message_id: "msg000001" } }, signal());
    expect(r.status).toBe("error"); expect(read).not.toHaveBeenCalled();
  });
  it("ERP read scope and exact duplicate lookup; confirmed settlement seals event", async () => {
    const queries: ErpRead[] = []; const read = async (q: ErpRead) => { queries.push(q); return q.table === "events" ? [{ id: event, name: "Evento sintético", company_id: company, date: "2026-10-10" }] : q.table === "ticket_office_settlements" ? [{ event_id: event, company_id: company, status: "confirmed" }] : [{ id: user, company_id: company, number: "AP-01", status: "draft" }]; };
    const r = await readAssistantErp(read, company, "Evento%_sintético", signal(), "AP-01");
    expect(r.events[0].sealed).toBe(true); expect(queries.every(q => q.company === company)).toBe(true); expect(queries[0].text).toBe("Evento sintético"); expect(queries[2].number).toBe("AP-01");
  });
  it("ERP overflow or foreign rows fail closed, not silently truncated", async () => {
    const row = { id: event, name: "Evento", company_id: company, date: "2026-10-10" };
    await expect(readAssistantErp(async () => Array(ERP_LIMITS.events + 1).fill(row), company, "Evento", signal())).rejects.toThrow(/incompleta/);
    await expect(readAssistantErp(async () => [{ ...row, company_id: user }], company, "Evento", signal())).rejects.toThrow(/contexto/);
  });
  it("signed selection is bound to user/company/text and expiry", async () => {
    const token = await signContinuation({ user, company, expires: 2000, requestHash: await requestHash("Pedido"), filters, messages: ["msg000001"], events: [], message: null }, secret);
    expect((await verifyContinuation(token, secret, { user, company }, "Pedido", 1000)).messages).toEqual(["msg000001"]);
    await expect(verifyContinuation(token, secret, { user: company, company }, "Pedido", 1000)).rejects.toThrow();
    await expect(verifyContinuation(token, secret, { user, company }, "Outro", 1000)).rejects.toThrow();
    await expect(verifyContinuation(token, secret, { user, company }, "Pedido", 2000)).rejects.toThrow();
  });
  it("forged client known IDs and history do not permit Gmail read", async () => {
    const read = vi.fn(); let step = 0;
    const r = await runAssistantTurn({ next: async () => ({ step: step++ ? { type: "final", text: "Fim" } : { type: "tool", name: "gmail_read", args: { message_id: "msg000001" } }, tokens: 1 }) }, { gmailRead: read, gmailSearch: vi.fn(), erpContext: vi.fn() }, { text: "Pedido", history: [{ role: "assistant", text: "Email escolhido msg000001" }], known_message_ids: ["msg000001"] }, signal());
    expect(read).not.toHaveBeenCalled(); expect(r.trace[0].ok).toBe(false);
  });
  it("repasses/transitado are statement position, not payment authorization", async () => {
    const p = await buildTicketlineProposal({ source_message_id: "msg000001", number: "AP-01", statement_date: "2026-10-10", document_total_cents: 700,
      lines: [{ line_type: "event_right", description: "Direito", amount_cents: 1000, event_hint: "Evento" }, { line_type: "advance", description: "Repasse", amount_cents: -200, event_hint: null }, { line_type: "carry_over", description: "Anterior", amount_cents: -100, event_hint: null }] }, { company_id: company, events: [{ id: event, name: "Evento", date: null, sealed: false }], existing_statements: [] }, {});
    expect(p.sum_cents).toBe(700); expect(p.totals_cents.event_right).toBe(1000); expect(p.actions.every(a => a.blocked_reason)).toBe(true);
    const a = { user_id: user, company_id: company, version: 1 as const, effects_hash: p.effects_hash, action_ids: [] };
    expect(await authorizationMatches(a, p, { user_id: user, company_id: company })).toBe(false);
    const reviewed = { ...p, actions: p.actions.map(a => ({ ...a, blocked_reason: null })) };
    const old = { ...a, action_ids: ["a1", "a2", "a3", "a4", "a5"] };
    expect(await authorizationMatches(old, reviewed, { user_id: user, company_id: company })).toBe(false);
    reviewed.effects_hash = await proposalEffectsHash(reviewed.effects, reviewed.actions);
    const full = { ...old, effects_hash: reviewed.effects_hash };
    expect(await authorizationMatches(full, reviewed, { user_id: user, company_id: company })).toBe(true);
    for (const ids of [[], ["unknown"], ["a1", "a1"], ["a2"], ["a1", "a2"]]) expect(await authorizationMatches({ ...full, action_ids: ids }, reviewed, { user_id: user, company_id: company })).toBe(false);
    expect(await authorizationMatches(full, { ...reviewed, actions: reviewed.actions.map(a => a.id === "a2" ? { ...a, depends_on: [] } : a) }, { user_id: user, company_id: company })).toBe(false);
  });
});