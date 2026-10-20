import { describe, expect, it, vi } from "vitest";
vi.mock("npm:zod@3", async () => import("zod"));
import { createHandler, type Deps } from "../../supabase/functions/data-entry/handler";
import {
  buildGmailQuery, cleanBodyText, decodeBase64UrlCapped, gmailFilterSchema, gmailReadOnly, htmlToText,
  GMAIL_READ_MAX_BYTES, GMAIL_READ_MAX_CHARS, GMAIL_READ_TIMEOUT_MS, GmailUnavailable, type GmailReader,
} from "../../supabase/functions/_shared/gmail-readonly";

const owner = "22222222-2222-4222-8222-222222222222";
const company = "11111111-1111-4111-8111-111111111111";
const session = "33333333-3333-4333-8333-333333333333";
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const filters = { from_date: "2026-10-01", to_date: "2026-10-19", sender: "faturas@exemplo.invalid", page_size: 10 };

const readMessage = (bodyData: string, mime = "text/plain") => ({
  id: "msgREAD001", internalDate: "1760000000000",
  payload: { headers: [{ name: "From", value: "Fornecedor <faturas@exemplo.invalid>" }, { name: "Subject", value: "Fatura de outubro" }], mimeType: mime, body: { data: bodyData, size: 100 } },
});
function fakeReader(payload: unknown, opts?: { readTimeoutMs?: number }) {
  const calls: { path: string; q: URLSearchParams }[] = [];
  const transport = vi.fn(async (path: string, q: URLSearchParams) => {
    calls.push({ path, q });
    return Response.json(payload);
  });
  return { reader: gmailReadOnly(transport, opts), calls };
}
function harness(reader: GmailReader | null, preparation = false) {
  const upload = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async (_t: string, name: string, _args?: Record<string, unknown>) => name === "my_effective_permissions" ? { data: { role: "manager", company_id: company }, error: null }
    : name === "data_entry_pilot8_capabilities" ? { data: { preparation, execute: false }, error: null }
    : { data: { session: { id: session }, company: { id: company }, documents: [], preview: null, results: [], capabilities: { execute: false } }, error: null });
  const deps: Deps = { pilotScoped: true, uploadEnabled: false, cors: {}, getUser: async () => ({ id: owner }), userRpc: rpc,
    recordReceipt: vi.fn(async () => ({ data: null, error: null })), scopedReceipt: vi.fn(async () => ({ data: null, error: null })),
    storage: { upload, download: async () => null }, gmail: { reader: vi.fn(async () => reader) } };
  const h = createHandler(deps);
  const send = (body: object) => h(new Request("http://local.invalid", { method: "POST", headers: { Authorization: "Bearer local-fixture", "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { send, rpc, upload, deps };
}

describe("#333 fase11e leitura de corpo Gmail (puro)", () => {
  it("pesquisa para leitura não exige anexo; fluxo de importação mantém has:attachment", () => {
    expect(buildGmailQuery(gmailFilterSchema.parse({ ...filters, attachments_only: false }))).not.toContain("has:attachment");
    expect(buildGmailQuery(gmailFilterSchema.parse(filters))).toContain("has:attachment");
  });
  it("limites explícitos de leitura", () => {
    expect(GMAIL_READ_MAX_BYTES).toBe(200 * 1024);
    expect(GMAIL_READ_MAX_CHARS).toBe(4000);
    expect(GMAIL_READ_TIMEOUT_MS).toBe(15000);
  });
  it("descodificação limitada sinaliza truncagem sem ler o corpo inteiro", () => {
    const big = b64("a".repeat(GMAIL_READ_MAX_BYTES + 5000));
    const d = decodeBase64UrlCapped(big, GMAIL_READ_MAX_BYTES);
    expect(d.truncated).toBe(true);
    expect(d.bytes.length).toBeLessThanOrEqual(GMAIL_READ_MAX_BYTES);
    expect(decodeBase64UrlCapped(b64("curto"), 1024)).toEqual({ bytes: new TextEncoder().encode("curto"), truncated: false });
  });
  it("HTML malicioso vira texto: sem script, sem tags, sem recursos remotos, entidades decodificadas", () => {
    const html = `<p>Ol&aacute; &amp; bem-vindo</p><script>alert(document.cookie)</script><style>body{display:none}</style><img src="https://evil.invalid/x.png" onerror="steal()"><a href="https://x.invalid">liga&ccedil;&atilde;o</a><div>linha dois</div>`;
    const text = cleanBodyText(htmlToText(html)).text;
    expect(text).toContain("Olá & bem-vindo");
    expect(text).toContain("ligação");
    expect(text).toContain("linha dois");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("http");
    expect(text).not.toContain("<");
    expect(text).not.toContain("onerror");
  });
  it("leitura de texto simples devolve metadados e corpo", async () => {
    const { reader, calls } = fakeReader(readMessage(b64("Primeira linha\nSegunda linha")));
    const body = await reader.read("msgREAD001");
    expect(body).toMatchObject({ message_id: "msgREAD001", kind: "plain", truncated: false, from: "Fornecedor <faturas@exemplo.invalid>", subject: "Fatura de outubro" });
    expect(body.body_text).toBe("Primeira linha\nSegunda linha");
    // Só a mensagem escolhida é lida; nunca anexos nem outras mensagens.
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/users/me/messages/msgREAD001");
    expect(calls.some((c) => c.path.includes("/attachments/"))).toBe(false);
  });
  it("prefere text/plain a text/html no mesmo email", async () => {
    const payload = { id: "msgREAD001", internalDate: "1760000000000", payload: { headers: [], mimeType: "multipart/alternative", parts: [
      { mimeType: "text/html", body: { data: b64("<b>html</b>"), size: 10 } },
      { mimeType: "text/plain", body: { data: b64("texto simples"), size: 10 } },
    ] } };
    const body = await fakeReader(payload).reader.read("msgREAD001");
    expect(body.kind).toBe("plain");
    expect(body.body_text).toBe("texto simples");
  });
  it("mensagem sem parte de texto (só anexos) devolve kind none, sem erro", async () => {
    const payload = { id: "msgREAD001", internalDate: "1760000000000", payload: { headers: [], mimeType: "multipart/mixed", parts: [
      { mimeType: "application/pdf", filename: "f.pdf", body: { attachmentId: "A1", size: 100 } },
    ] } };
    const body = await fakeReader(payload).reader.read("msgREAD001");
    expect(body).toMatchObject({ kind: "none", body_text: "", truncated: false });
  });
  it("parte de texto além da profundidade máxima não é lida", async () => {
    let part: unknown = { mimeType: "text/plain", body: { data: b64("escondido"), size: 10 } };
    for (let i = 0; i < 8; i++) part = { mimeType: "multipart/mixed", parts: [part] };
    const payload = { id: "msgREAD001", internalDate: "1760000000000", payload: { headers: [], mimeType: "multipart/mixed", parts: [part] } };
    const body = await fakeReader(payload).reader.read("msgREAD001");
    expect(body.kind).toBe("none");
  });
  it("corpo longo é cortado com truncagem sinalizada", async () => {
    const body = await fakeReader(readMessage(b64("palavra ".repeat(1000)))).reader.read("msgREAD001");
    expect(body.truncated).toBe(true);
    expect(body.body_text.length).toBeLessThanOrEqual(GMAIL_READ_MAX_CHARS + 1);
    expect(body.body_text.endsWith("…")).toBe(true);
  });
  it("prazo de leitura: resposta tardia é descartada e erro é explícito", async () => {
    const never = () => new Promise<Response>(() => undefined);
    await expect(gmailReadOnly(never, { readTimeoutMs: 20 }).read("msgREAD001")).rejects.toBeInstanceOf(GmailUnavailable);
    await expect(gmailReadOnly(never, { readTimeoutMs: 20 }).read("msgREAD001")).rejects.toThrow("demorou demasiado");
  });
});

describe("#333 fase11e leitura Gmail no assistente", () => {
  it("leitura funciona com envio documental e preparação FECHADOS; importação continua bloqueada", async () => {
    const h = harness(fakeReader(readMessage(b64("corpo legível"))).reader, false);
    const read = await h.send({ action: "gmail_read", message_id: "msgREAD001" });
    expect(read.status).toBe(200);
    expect((await read.json()).body_text).toBe("corpo legível");
    const search = await h.send({ action: "gmail_search", filters });
    expect(search.status).toBe(200);
    const imp = await h.send({ action: "gmail_import", session_id: session, selection: { message_id: "msgREAD001", part_id: "1" } });
    expect(imp.status).toBe(503);
    expect(h.upload).not.toHaveBeenCalled();
  });
  it("sessão trocada durante a leitura recusa e não devolve o corpo", async () => {
    const g = fakeReader(readMessage(b64("segredo")));
    const h = harness(g.reader);
    let user = owner;
    h.deps.getUser = async () => ({ id: user });
    const original = g.reader.read;
    g.reader.read = async (...args) => { const r = await original(...args); user = "44444444-4444-4444-8444-444444444444"; return r; };
    const response = await h.send({ action: "gmail_read", message_id: "msgREAD001" });
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("segredo");
  });
  it("sem ligação própria a leitura é recusada, sem usar outra conta", async () => {
    const h = harness(null);
    expect((await h.send({ action: "gmail_read", message_id: "msgREAD001" })).status).toBe(409);
    expect(h.deps.gmail!.reader).toHaveBeenCalledWith(owner, company);
  });
  it("identificador de mensagem inválido é recusado pelo contrato", async () => {
    const h = harness(fakeReader(readMessage(b64("x"))).reader);
    expect((await h.send({ action: "gmail_read", message_id: "../../etc" })).status).toBe(400);
  });
});
