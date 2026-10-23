// @vitest-environment node
/**
 * #333 12j — seleção → leitura única → anexos reais → revisão existente.
 * Fixture SINTÉTICA reproduzindo a forma da tentativa real de 23/10/2026 02:10 UTC (só metadados:
 * corpo não truncado de ~3.659 caracteres, 4 PDFs, o modelo volta a pedir gmail_read do mesmo id).
 * Sem rede, sem Gmail/IA reais, sem SQL.
 */
import { describe, expect, it, vi } from "vitest";
import { runAssistantTurn, resolveTextMessage, attachmentItems, type AssistantModel, type ModelStep } from "../../supabase/functions/_shared/assistant-orchestrator";
import { createAssistantModel } from "../../supabase/functions/_shared/issue333-ai/assistant-model";
import { durableProviderControl, type ControlRecord, type ControlStore } from "../../supabase/functions/_shared/issue333-ai/control";
import { signContinuation, verifyContinuation, requestHash } from "../../supabase/functions/_shared/assistant-continuation";
import { createHandler, type Deps } from "../../supabase/functions/data-entry/handler";

const pdfs = (tag: string) => [1, 2, 3, 4].map(j => ({ part_id: `${j}`, filename: `${tag}-documento-${j}.pdf`, mime: "application/pdf", size_bytes: 40000 + j }));
// Três emails com o MESMO assunto (nomes repetidos), distinguidos só por hora/remetente.
const emails = [
  { message_id: "msgAAAA01", subject: "RE: Fecho sintético X", from: "Remetente A <a@example.invalid>", date: "2026-10-09T11:28:39Z", attachments: pdfs("a") },
  { message_id: "msgAAAA02", subject: "RE: Fecho sintético X", from: "Remetente A <a@example.invalid>", date: "2026-10-09T10:05:00Z", attachments: pdfs("b") },
  { message_id: "msgAAAA03", subject: "Fecho sintético X", from: "Remetente B <b@example.invalid>", date: "2026-10-08T09:00:00Z", attachments: [{ part_id: "1", filename: "a-documento-1.pdf", mime: "application/pdf", size_bytes: 10 }] },
];
const filters = { from_date: "2026-09-23", to_date: "2026-10-23", sender: "example.invalid", page_size: 20 };
const resume = (message: string | null = null) => ({ user: "local", company: "local", expires: Date.now() + 60000, requestHash: "synthetic", filters, messages: emails.map(m => m.message_id), events: [], message });
const body = (truncated = false) => ({ message_id: emails[0].message_id, subject: emails[0].subject, from: emails[0].from, date: emails[0].date, kind: "plain" as const, body_text: "Corpo sintético. ".repeat(215), truncated });
const read = (id = emails[0].message_id): ModelStep => ({ type: "tool", name: "gmail_read", args: { message_id: id } });
const signal = () => new AbortController().signal;
const tools = (over: Record<string, unknown> = {}) => ({ gmailSearch: vi.fn(async () => ({ messages: emails, next_page_token: null })), gmailRead: vi.fn(async () => body()), erpContext: vi.fn(), ...over });
const ASK = "Lê o email de a@example.invalid de 09/10/2026 às 12:28 com o assunto RE: Fecho sintético X. Mostra os quatro PDFs para revisão, sem lançamentos.";

describe("#333 12j leitura única e anexos reais", () => {
  it("reprodução do teste real: o modelo repete gmail_read; servidor lê 1 vez e termina com anexos reais e revisão", async () => {
    const next = vi.fn<AssistantModel["next"]>(async () => ({ step: read(), tokens: 1 }));
    const t = tools();
    const r = await runAssistantTurn({ next }, { resume: resume(), ...t }, { text: ASK, history: [], selection: { message_id: emails[0].message_id } }, signal());
    expect(t.gmailRead).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2); // leitura + pedido repetido (antes: 7 chamadas e Parar)
    expect(r.status).toBe("answer");
    expect(r.trace.map(x => x.summary).join("|")).not.toMatch(/Limite de leituras/);
    expect(r.review_message_id).toBe(emails[0].message_id);
    expect(r.attachments?.map(a => [a.n, a.part_id, a.filename])).toEqual([[1, "1", "a-documento-1.pdf"], [2, "2", "a-documento-2.pdf"], [3, "3", "a-documento-3.pdf"], [4, "4", "a-documento-4.pdf"]]);
    expect(r.text).toContain("4. a-documento-4.pdf · application/pdf");
    expect(r.proposal).toBeUndefined(); expect(t.erpContext).not.toHaveBeenCalled();
  });
  it("corpo completo: o modelo recebe metadados reais dos anexos (sem part_id nem conteúdo) e a resposta final mantém a lista do servidor", async () => {
    const steps: ModelStep[] = [read(), { type: "final", text: "Encontrei 7 PDFs: 1) fatura inventada 999 €" }];
    const next = vi.fn<AssistantModel["next"]>(async () => ({ step: steps.shift()!, tokens: 1 }));
    const r = await runAssistantTurn({ next }, { resume: resume(), ...tools() }, { text: ASK, history: [], selection: { message_id: emails[0].message_id } }, signal());
    const ctx = JSON.stringify(next.mock.calls[1][0].messages);
    expect(ctx).toContain("a-documento-4.pdf"); expect(ctx).not.toContain("b-documento"); expect(ctx).not.toContain("part_id");
    expect(r.status).toBe("answer");
    // O texto do modelo é só texto; a lista e a revisão vêm do servidor.
    expect(r.attachments).toHaveLength(4); expect(r.review_message_id).toBe(emails[0].message_id);
    expect(r.text).not.toMatch(/7 PDFs|999|inventada/); expect(r.text).toContain("4. a-documento-4.pdf");
  });
  it("resposta final sem números nem anexos após leitura é mantida, com a revisão do servidor", async () => {
    const steps: ModelStep[] = [read(), { type: "final", text: "Li o email escolhido; usa a revisão." }];
    const r = await runAssistantTurn({ next: vi.fn(async () => ({ step: steps.shift()!, tokens: 1 })) }, { resume: resume(), ...tools() }, { text: ASK, history: [], selection: { message_id: emails[0].message_id } }, signal());
    expect(r.text).toBe("Li o email escolhido; usa a revisão."); expect(r.attachments).toHaveLength(4);
  });
  it("corpo truncado: termina sem nova chamada, com anexos reais e revisão existente", async () => {
    const next = vi.fn<AssistantModel["next"]>(async () => ({ step: read(), tokens: 1 }));
    const r = await runAssistantTurn({ next }, { resume: resume(), ...tools({ gmailRead: vi.fn(async () => body(true)) }) }, { text: ASK, history: [], selection: { message_id: emails[0].message_id } }, signal());
    expect(next).toHaveBeenCalledTimes(1); expect(r.status).toBe("answer");
    expect(r.text).toMatch(/cortado/); expect(r.text).toContain("a-documento-1.pdf"); expect(r.attachments).toHaveLength(4); expect(r.proposal).toBeUndefined();
  });
  it("recusa idêntica repetida termina sem loop (limite honesto, sem nova chamada)", async () => {
    const next = vi.fn<AssistantModel["next"]>(async () => ({ step: read(emails[1].message_id), tokens: 1 }));
    const t = tools();
    const r = await runAssistantTurn({ next }, { resume: resume(), ...t }, { text: ASK, history: [], selection: { message_id: emails[0].message_id } }, signal());
    expect(next).toHaveBeenCalledTimes(2); expect(t.gmailRead).not.toHaveBeenCalled();
    expect(r.status).toBe("limit"); expect(r.text).toMatch(/repetiu um passo recusado/);
    expect(r.review_message_id).toBe(emails[0].message_id); // escolha revalidada preservada
  });
  it("nomes repetidos: numeração e anexos pertencem ao seletor assinado, nunca a uma tabela do modelo", async () => {
    const reversed = { ...resume(), messages: [...emails].reverse().map(m => m.message_id) };
    const next = vi.fn<AssistantModel["next"]>(async () => ({ step: { type: "final", text: "| nº | email |\n|---|---|\n| 4 | x |" }, tokens: 1 }));
    const r = await runAssistantTurn({ next }, { resume: reversed, ...tools() }, { text: "Lê o email", history: [], continuation_text: ASK }, signal());
    expect(r.status).toBe("select_message"); expect(next).not.toHaveBeenCalled();
    expect(r.options?.map(o => o.id)).toEqual(reversed.messages);
    expect(r.options?.[0].label.startsWith("1. Fecho sintético X")).toBe(true);
    expect(r.options?.map(o => o.label).join("\n")).toMatch(/12:28/);
    const r2 = await runAssistantTurn({ next: vi.fn(async () => ({ step: read(emails[1].message_id), tokens: 1 })) }, { resume: reversed, ...tools({ gmailRead: vi.fn(async () => ({ ...body(), message_id: emails[1].message_id })) }) }, { text: "2", history: [] }, signal());
    expect(r2.review_message_id).toBe(emails[1].message_id);
    expect(r2.attachments?.[0].filename).toBe("b-documento-1.pdf");
    expect(resolveTextMessage("4", emails)).toBeNull();
    expect(attachmentItems(emails[2]).map(a => a.n)).toEqual([1]);
  });
  it("continuação após a revisão: o pedido original acompanha o turno seguinte sem nova pesquisa livre", async () => {
    const next = vi.fn<AssistantModel["next"]>(async () => ({ step: { type: "final", text: "Usa a revisão." }, tokens: 1 }));
    const t = tools();
    const r = await runAssistantTurn({ next }, { resume: resume(emails[0].message_id), ...t }, { text: "E o terceiro PDF?", history: [{ role: "assistant", text: "histórico".repeat(500) }], continuation_text: ASK }, signal());
    const ctx = JSON.stringify(next.mock.calls[0][0].messages);
    expect(ctx).toContain("original_request"); expect(ctx).toContain("quatro PDFs"); expect(ctx).not.toContain("históricohistórico");
    expect(t.gmailSearch).toHaveBeenCalledTimes(1); expect(r.review_message_id).toBe(emails[0].message_id); expect(r.attachments).toHaveLength(4);
  });
  it("handler: assinatura segue a revisão e continua presa ao pedido ORIGINAL; texto novo sem assinatura não autoriza", async () => {
    const user = "22222222-2222-4222-8222-222222222222", company = "11111111-1111-4111-8111-111111111111", secret = "local-synthetic-secret-only-32-chars";
    const token = await signContinuation({ ...resume(), user, company, requestHash: await requestHash(ASK) }, secret);
    const steps: ModelStep[] = [read(), { type: "final", text: "Lista mostrada." }];
    const model: AssistantModel = { next: async () => ({ step: steps.shift() ?? { type: "final", text: "ok" }, tokens: 1 }) };
    const search = vi.fn(async () => ({ messages: emails, next_page_token: null })); const rd = vi.fn(async () => body());
    const d: Deps = { uploadEnabled: false, pilotScoped: true, cors: {}, getUser: async () => ({ id: user }), userRpc: async (_t, n) => ({ data: n === "my_effective_permissions" ? { role: "manager", company_id: company } : { preparation: false, execute: false }, error: null }), recordReceipt: vi.fn(), storage: { upload: vi.fn(), download: vi.fn() }, assistantEnabled: true, assistantScopeAllowed: async () => true, continuationSecret: secret, assistant: { model, erpContext: vi.fn() }, gmail: { reader: async () => ({ search, read: rd, attachment: vi.fn(), attachments: vi.fn(async () => []) }) } } as Deps;
    const req = (b: Record<string, unknown>) => new Request("http://local.invalid", { method: "POST", headers: { Authorization: "Bearer local-only", "Content-Type": "application/json" }, body: JSON.stringify({ action: "assistant_turn", history: [], ...b }) });
    const h = createHandler(d);
    const out = await (await h(req({ text: ASK, selection: { message_id: emails[0].message_id }, continuation: token, continuation_text: ASK }))).json();
    expect(out.attachments).toHaveLength(4); expect(out.review_message_id).toBe(emails[0].message_id); expect(rd).toHaveBeenCalledTimes(1);
    expect(typeof out.continuation).toBe("string");
    const state = await verifyContinuation(out.continuation, secret, { user, company }, ASK);
    expect(state.message).toBe(emails[0].message_id);
    await expect(verifyContinuation(out.continuation, secret, { user, company }, "E o terceiro PDF?")).rejects.toThrow();
    const follow = await h(req({ text: "E o terceiro PDF?", continuation: out.continuation, continuation_text: ASK }));
    expect(follow.status).toBe(200); expect((await follow.json()).review_message_id).toBe(emails[0].message_id);
    expect((await h(req({ text: "E o terceiro PDF?", continuation: out.continuation }))).status).toBe(409);
    expect(d.storage.upload).not.toHaveBeenCalled();
  });
});

// Double is NOT a concurrency proof (PostgreSQL tests provide that); it mirrors the reviewed transition contract.
function controlHarness(onClaim?: () => void) {
  const row: ControlRecord = { revision: "1", state: "ready", enabled: true, reviewed: true, claim: null, stage: "idle", reason: "none", status: null };
  const transition = vi.fn<ControlStore["transition"]>(async (op, claim, revision, outcome, status) => {
    if (op === "read") return { ...row };
    if (revision !== row.revision || op === "claim" && (row.claim !== null || row.state !== "ready") || op !== "claim" && row.claim !== claim) throw Error("fenced");
    row.revision = String(BigInt(row.revision) + 1n);
    if (op === "claim") { row.claim = claim ?? null; row.stage = "claimed"; onClaim?.(); }
    if (op === "post") row.stage = "post_started";
    if (op === "finish") {
      row.reason = outcome ?? "none"; row.status = status ?? null;
      if (["transport_uncertain", "cancelled_after_post"].includes(outcome ?? "")) { row.state = "unavailable"; row.enabled = false; row.stage = "uncertain"; }
      else { row.claim = null; row.stage = "idle"; }
    }
    return { ...row };
  });
  return { control: durableProviderControl({ transition }), row, transition };
}
const sse = (text: string) => {
  const item = { type: "message", id: "m", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] };
  const f = [{ type: "response.created", response: { id: "r", model: "openai/gpt-6-astra", created_at: 0 } }, { type: "response.output_item.added", output_index: 0, item }, { type: "response.content_part.added", item_id: "m", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } }, { type: "response.output_text.delta", item_id: "m", output_index: 0, content_index: 0, delta: text }, { type: "response.output_item.done", output_index: 0, item }, { type: "response.completed", response: { id: "r", model: "openai/gpt-6-astra", output: [item], usage: { input_tokens: 600, output_tokens: 40, total_tokens: 640, output_tokens_details: { reasoning_tokens: 0 } } } }];
  return new Response(f.map(x => `data: ${JSON.stringify(x)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
};
const toolJson = (id: string) => JSON.stringify({ type: "tool", name: "gmail_read", args_json: JSON.stringify({ message_id: id }), text: null });

describe("#333 12j Parar antes/depois do POST com controlo durável (duplo local)", () => {
  it("Parar DEPOIS do POST: stopped, claim preservado em uncertain; turno seguinte não faz POST nem reset", async () => {
    const h = controlHarness(); const ac = new AbortController(); let posts = 0;
    const fetch = vi.fn(async () => { posts++; if (posts === 2) { ac.abort(); throw new DOMException("aborted", "AbortError"); } return sse(toolJson(emails[0].message_id)); });
    const model = createAssistantModel({ apiKey: "local-not-a-key", validateContext: async () => {}, fetch: fetch as unknown as typeof globalThis.fetch, control: h.control });
    const r = await runAssistantTurn(model, { resume: resume(), ...tools() }, { text: ASK, history: [], selection: { message_id: emails[0].message_id } }, ac.signal);
    expect(r.status).toBe("stopped"); expect(r.text).toMatch(/Nada foi gravado/);
    expect(h.row).toMatchObject({ state: "unavailable", stage: "uncertain", reason: "cancelled_after_post", enabled: false }); expect(h.row.claim).not.toBeNull();
    const claim = h.row.claim, rev = h.row.revision;
    const m2 = createAssistantModel({ apiKey: "local-not-a-key", validateContext: async () => {}, fetch: fetch as unknown as typeof globalThis.fetch, control: h.control });
    const r2 = await runAssistantTurn(m2, { resume: resume(), ...tools() }, { text: ASK, history: [], selection: { message_id: emails[0].message_id } }, signal());
    expect(r2.status).toBe("error"); expect(fetch).toHaveBeenCalledTimes(2);
    expect(h.row.claim).toBe(claim); expect(h.row.revision).toBe(rev); expect(h.row.stage).toBe("uncertain");
  });
  it("Parar ANTES do POST: cancelled_before_post, sem HTTP e sem estado incerto", async () => {
    const ac = new AbortController(); const h = controlHarness(() => ac.abort()); const fetch = vi.fn();
    const model = createAssistantModel({ apiKey: "local-not-a-key", validateContext: async () => {}, fetch: fetch as unknown as typeof globalThis.fetch, control: h.control });
    const r = await runAssistantTurn(model, { resume: resume(), ...tools() }, { text: ASK, history: [], selection: { message_id: emails[0].message_id } }, ac.signal);
    expect(r.status).toBe("stopped"); expect(fetch).not.toHaveBeenCalled();
    expect(h.row).toMatchObject({ stage: "idle", claim: null, reason: "cancelled_before_post" });
  });
});
