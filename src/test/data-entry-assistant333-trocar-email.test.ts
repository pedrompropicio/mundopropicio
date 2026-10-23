// @vitest-environment node
/**
 * #333 corretivo — voltar aos resultados e escolher outro email sem "Nova conversa" e sem reler o email anterior.
 * Fixtures 100% SINTÉTICAS (metadados inventados); sem rede, Gmail, IA, scanner ou SQL reais.
 * Tempos medidos são de MOCKS locais: não provam latência em produção.
 */
import { describe, expect, it, vi } from "vitest";
import { runAssistantTurn, resolveTextMessage, isListRequest, attachmentCounts, type AssistantModel, type ModelStep } from "../../supabase/functions/_shared/assistant-orchestrator";
import { signContinuation, verifyContinuation, requestHash } from "../../supabase/functions/_shared/assistant-continuation";
import { createHandler, type Deps } from "../../supabase/functions/data-entry/handler";

const imgs = Array.from({ length: 14 }, (_, j) => ({ part_id: `${j + 1}`, filename: `foto-${j + 1}.jpg`, mime: "image/jpeg", size_bytes: 2000 + j }));
const pdfs = Array.from({ length: 4 }, (_, j) => ({ part_id: `${j + 1}`, filename: `fecho-${j + 1}.pdf`, mime: "application/pdf", size_bytes: 40000 + j }));
const A = { message_id: "msgSINTA1", subject: "Fecho sintético Alfa", from: "Remetente <r@example.invalid>", date: "2026-10-09T10:05:00Z", attachments: imgs };
const B = { message_id: "msgSINTB2", subject: "Fecho sintético Beta", from: "Remetente <r@example.invalid>", date: "2026-10-09T13:28:00Z", attachments: pdfs };
const C = { message_id: "msgSINTC3", subject: "Outro assunto sintético", from: "Outro <o@example.invalid>", date: "2026-10-08T09:00:00Z", attachments: [] };
const emails = [A, B, C];
const filters = { from_date: "2026-09-23", to_date: "2026-10-23", sender: "example.invalid", page_size: 20 };
const ORIGINAL = "Procura o fecho sintético de example.invalid do último mês e mostra os PDFs para revisão.";
const resume = (message: string | null) => ({ user: "u", company: "c", expires: Date.now() + 60000, requestHash: "h", filters, messages: emails.map(m => m.message_id), events: [], message });
const bodyOf = (m: typeof A) => ({ message_id: m.message_id, subject: m.subject, from: m.from, date: m.date, kind: "plain" as const, body_text: "Corpo sintético.", truncated: false });
const read = (id: string): ModelStep => ({ type: "tool", name: "gmail_read", args: { message_id: id } });
const sig = () => new AbortController().signal;
const tools = () => ({
  gmailSearch: vi.fn(async () => ({ messages: emails, next_page_token: null })),
  gmailRead: vi.fn(async (id: string) => bodyOf(emails.find(m => m.message_id === id)!)),
  erpContext: vi.fn(),
});
/** Model that reads whatever chosen_message says, then finishes; counts calls. */
const readingModel = () => vi.fn<AssistantModel["next"]>(async ({ messages }) => {
  const toolMsg = messages.filter(m => m.role === "tool").at(-1)?.content ?? "";
  if (/gmail_read/.test(messages.at(-1)?.tool ?? "")) return { step: { type: "final", text: "Usa a revisão." }, tokens: 1 };
  const chosen = /"chosen_message":"([A-Za-z0-9]+)"/.exec(toolMsg)?.[1];
  return { step: chosen ? read(chosen) : read(A.message_id), tokens: 1 };
});

describe("#333 voltar aos resultados e trocar de email", () => {
  it("A (0 PDF, 14 imagens) → pedir lista: 3 cartões com contagens reais, sem reler A e sem chamada de IA", async () => {
    const t = tools(); const next = readingModel();
    const t0 = performance.now();
    const r = await runAssistantTurn({ next }, { resume: resume(A.message_id), ...t }, { text: "Mostra as mensagens encontradas para eu selecionar a de 14:28", history: [], continuation_text: ORIGINAL }, sig());
    const ms = performance.now() - t0;
    expect(r.status).toBe("select_message");
    expect(next).toHaveBeenCalledTimes(0); expect(t.gmailRead).toHaveBeenCalledTimes(0); expect(t.gmailSearch).toHaveBeenCalledTimes(1);
    expect(r.options?.map(o => o.id)).toEqual([A.message_id, B.message_id, C.message_id]);
    expect(r.options?.map(o => o.attachments)).toEqual([{ total: 14, pdf: 0, images: 14, other: 0 }, { total: 4, pdf: 4, images: 0, other: 0 }, { total: 0, pdf: 0, images: 0, other: 0 }]);
    expect(r.options?.[0].label).toMatch(/Anexos: 14 imagens$/); expect(r.options?.[1].label).toMatch(/Anexos: 4 PDF$/); expect(r.options?.[2].label).toMatch(/Sem anexos$/);
    expect(r.review_message_id).toBeUndefined();
    expect(r.continuation_state?.message).toBeNull();
    expect(r.continuation_state?.messages).toEqual(emails.map(m => m.message_id));
    expect(ms).toBeLessThan(1000); // mock local apenas
  });
  it("ação explícita intent=list funciona com qualquer texto e sem assinatura é recusada", async () => {
    const t = tools(); const next = readingModel();
    const r = await runAssistantTurn({ next }, { resume: resume(A.message_id), ...t }, { text: "Escolher outro email", history: [], intent: "list", continuation_text: ORIGINAL }, sig());
    expect(r.status).toBe("select_message"); expect(next).not.toHaveBeenCalled(); expect(t.gmailRead).not.toHaveBeenCalled();
    const bad = await runAssistantTurn({ next }, { ...tools() }, { text: "Escolher outro email", history: [], intent: "list" }, sig());
    expect(bad.status).toBe("error"); expect(next).not.toHaveBeenCalled();
  });
  it("escolher B depois da lista → review_id B e anexos reais de B; A não é lido", async () => {
    const t = tools(); const next = readingModel();
    const r = await runAssistantTurn({ next }, { resume: resume(null), ...t }, { text: ORIGINAL, history: [], selection: { message_id: B.message_id }, continuation_text: ORIGINAL }, sig());
    expect(r.review_message_id).toBe(B.message_id);
    expect(r.attachments?.map(a => a.filename)).toEqual(pdfs.map(p => p.filename));
    expect(t.gmailRead).toHaveBeenCalledTimes(1); expect(t.gmailRead).toHaveBeenCalledWith(B.message_id);
    expect(r.continuation_state?.message).toBe(B.message_id);
  });
  it("texto inequívoco por assunto ou só pela hora supera a escolha anterior A", async () => {
    for (const text of ["Lê antes o Fecho sintético Beta", "lê a mensagem das 14:28"]) {
      const t = tools(); const next = readingModel();
      const r = await runAssistantTurn({ next }, { resume: resume(A.message_id), ...t }, { text, history: [], continuation_text: ORIGINAL }, sig());
      expect(r.review_message_id).toBe(B.message_id);
      expect(t.gmailRead.mock.calls.map(c => c[0])).toEqual([B.message_id]);
    }
    expect(resolveTextMessage("a das 11:05", emails)).toBe(A.message_id);
    expect(resolveTextMessage("a das 15:00", emails)).toBeNull();
  });
  it("pedido novo após rever A nunca relê A em silêncio; assunto novo faz nova pesquisa e liga a assinatura ao texto atual", async () => {
    const t = tools();
    const next = vi.fn<AssistantModel["next"]>(async () => ({ step: read(A.message_id), tokens: 1 }));
    const r = await runAssistantTurn({ next }, { resume: resume(A.message_id), ...t }, { text: "E o total?", history: [], continuation_text: ORIGINAL }, sig());
    expect(t.gmailRead).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledTimes(1);
    expect(r.review_message_id).toBe(A.message_id); expect(r.text).toMatch(/não o volto a ler/);
    expect(JSON.stringify(next.mock.calls[0][0].messages)).toContain("previous_message");
    expect(JSON.stringify(next.mock.calls[0][0].messages)).not.toContain(`"chosen_message":"${A.message_id}"`);
    const other = [{ ...C, message_id: "msgNOVO01", subject: "Assunto novo sintético" }, { ...C, message_id: "msgNOVO02", subject: "Assunto novo sintético 2" }];
    const t2 = { ...tools(), gmailSearch: vi.fn().mockResolvedValueOnce({ messages: emails, next_page_token: null }).mockResolvedValueOnce({ messages: other, next_page_token: null }) };
    const next2 = vi.fn<AssistantModel["next"]>(async () => ({ step: { type: "tool", name: "gmail_search", args: { ...filters, subject: "assunto novo" } }, tokens: 1 }));
    const r2 = await runAssistantTurn({ next: next2 }, { resume: resume(A.message_id), ...t2 }, { text: "Agora procura o assunto novo", history: [], continuation_text: ORIGINAL }, sig());
    expect(r2.status).toBe("select_message"); expect(r2.continuation_rebound).toBe(true);
    expect(r2.options?.map(o => o.id)).toEqual(["msgNOVO01", "msgNOVO02"]); expect(r2.review_message_id).toBeUndefined();
    expect(r2.continuation_state?.message).toBeNull(); expect(t2.gmailRead).not.toHaveBeenCalled();
  });
  it("seleção forjada fora dos candidatos atuais é recusada; email que desapareceu da pesquisa não é usado", async () => {
    const t = tools(); const next = readingModel();
    const forged = await runAssistantTurn({ next }, { resume: resume(null), ...t }, { text: ORIGINAL, history: [], selection: { message_id: "msgFORJADO" } }, sig());
    expect(forged.status).toBe("error"); expect(t.gmailRead).not.toHaveBeenCalled();
    const t2 = { ...tools(), gmailSearch: vi.fn(async () => ({ messages: [B, C, { ...A, message_id: "msgEXTRA1" }], next_page_token: null })) };
    const gone = await runAssistantTurn({ next }, { resume: resume(null), ...t2 }, { text: ORIGINAL, history: [], selection: { message_id: A.message_id } }, sig());
    expect(gone.status).toBe("error");
    const list = await runAssistantTurn({ next }, { resume: resume(A.message_id), ...t2 }, { text: "x", history: [], intent: "list" }, sig());
    expect(list.options?.map(o => o.id)).toEqual([B.message_id, C.message_id]); // msgEXTRA1 não assinado nunca aparece
    expect(list.continuation_state?.messages).toEqual([B.message_id, C.message_id]);
    expect(isListRequest("qual é o total?")).toBe(false); expect(isListRequest("escolhi o email errado")).toBe(true);
    expect(attachmentCounts(undefined).total).toBe(0);
  });
  it("handler: lista exige assinatura válida; expirada, de outra empresa ou forjada recusada; hash original preservado", async () => {
    const user = "22222222-2222-4222-8222-222222222222", company = "11111111-1111-4111-8111-111111111111", secret = "local-synthetic-secret-only-32-chars";
    const next = vi.fn<AssistantModel["next"]>(async () => ({ step: { type: "final", text: "ok" }, tokens: 1 }));
    const search = vi.fn(async () => ({ messages: emails, next_page_token: null })); const rd = vi.fn();
    const d: Deps = { uploadEnabled: false, pilotScoped: true, cors: {}, getUser: async () => ({ id: user }), userRpc: async (_t, n) => ({ data: n === "my_effective_permissions" ? { role: "manager", company_id: company } : { preparation: false, execute: false }, error: null }), recordReceipt: vi.fn(), storage: { upload: vi.fn(), download: vi.fn() }, assistantEnabled: true, assistantScopeAllowed: async () => true, continuationSecret: secret, assistant: { model: { next }, erpContext: vi.fn() }, gmail: { reader: async () => ({ search, read: rd, attachment: vi.fn(), attachments: vi.fn(async () => []) }) } } as Deps;
    const req = (b: Record<string, unknown>) => new Request("http://local.invalid", { method: "POST", headers: { Authorization: "Bearer local-only", "Content-Type": "application/json" }, body: JSON.stringify({ action: "assistant_turn", history: [], ...b }) });
    const h = createHandler(d);
    const token = await signContinuation({ ...resume(A.message_id), user, company, requestHash: await requestHash(ORIGINAL) }, secret);
    const ok = await h(req({ text: "Escolher outro email", intent: "list", continuation: token, continuation_text: ORIGINAL }));
    expect(ok.status).toBe(200);
    const out = await ok.json();
    expect(out.status).toBe("select_message"); expect(out.options).toHaveLength(3); expect(next).not.toHaveBeenCalled(); expect(rd).not.toHaveBeenCalled();
    const st = await verifyContinuation(out.continuation, secret, { user, company }, ORIGINAL);
    expect(st.message).toBeNull(); expect(st.messages).toEqual(emails.map(m => m.message_id));
    expect((await h(req({ text: "Escolher outro email", intent: "list" }))).status).toBe(409);
    const expired = await signContinuation({ ...resume(A.message_id), user, company, expires: Date.now() - 1, requestHash: await requestHash(ORIGINAL) }, secret);
    expect((await h(req({ text: "x", intent: "list", continuation: expired, continuation_text: ORIGINAL }))).status).toBe(409);
    const foreign = await signContinuation({ ...resume(A.message_id), user, company: "33333333-3333-4333-8333-333333333333", requestHash: await requestHash(ORIGINAL) }, secret);
    expect((await h(req({ text: "x", intent: "list", continuation: foreign, continuation_text: ORIGINAL }))).status).toBe(409);
    const [payload] = token.split(".");
    const tampered = `${btoa(JSON.stringify({ ...resume(A.message_id), user, company, messages: ["msgFORJADO"], requestHash: await requestHash(ORIGINAL) })).replace(/=+$/, "")}.${token.split(".")[1]}`;
    expect(payload).not.toBe(tampered.split(".")[0]);
    expect((await h(req({ text: "x", intent: "list", continuation: tampered, continuation_text: ORIGINAL }))).status).toBe(409);
    expect((await h(req({ text: "x", intent: "list", continuation: token, continuation_text: "outro pedido" }))).status).toBe(409);
    expect(search).toHaveBeenCalledTimes(1);
    expect(d.storage.upload).not.toHaveBeenCalled();
  });
  it("contagem de chamadas no percurso (mocks): antes 1 pesquisa + 2 IA + 1 leitura de A; agora 1 pesquisa, 0 IA, 0 leituras", async () => {
    // "Antes" reproduz o comportamento anterior: chosen=resume.message ⇒ modelo pedia gmail_read de A.
    const t = tools(); const next = readingModel();
    await runAssistantTurn({ next }, { resume: resume(A.message_id), ...t }, { text: "Mostra as mensagens encontradas", history: [], continuation_text: ORIGINAL }, sig());
    expect({ searches: t.gmailSearch.mock.calls.length, model: next.mock.calls.length, reads: t.gmailRead.mock.calls.length }).toEqual({ searches: 1, model: 0, reads: 0 });
  });
});
