import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("npm:zod@3", async () => import("zod"));
import { createGmailConnection, hashNonce, openKey, sealKey, type GmailConnectionStore } from "../../supabase/functions/_shared/gmail-app-user";
import { createHandler, type Deps } from "../../supabase/functions/data-entry/handler";

const A = "22222222-2222-4222-8222-222222222222", B = "44444444-4444-4444-8444-444444444444";
const C1 = "11111111-1111-4111-8111-111111111111", C2 = "55555555-5555-4555-8555-555555555555";
const SECRET = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const ORIGIN = "https://mpgestaoeventos.com";
const NONCE = "n".repeat(43);

function memStore() {
  const pending = new Map<string, { user: string; company: string; exp: Date }>();
  const rows = new Map<string, { ciphertext: string; reconnect_required: boolean }>();
  const k = (u: string, c: string) => `${u}:${c}`;
  const store: GmailConnectionStore = {
    async createPending(user, company, h, exp) { pending.set(h, { user, company, exp }); },
    async consumePending(user, company, h, now) { const p = pending.get(h); if (!p || p.user !== user || p.company !== company || p.exp <= now) return false; pending.delete(h); return true; },
    async save(u, c, ciphertext) { rows.set(k(u, c), { ciphertext, reconnect_required: false }); },
    async load(u, c) { return rows.get(k(u, c)) ?? null; },
    async markReconnect(u, c) { const r = rows.get(k(u, c)); if (r) r.reconnect_required = true; },
    async remove(u, c) { rows.delete(k(u, c)); },
  };
  return { store, rows, pending };
}
let authEmail = "own@example.invalid";
let confirmed = true;
type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let gateway: (url: string, init: RequestInit) => Response;
beforeEach(() => {
  calls = []; authEmail = "own@example.invalid"; confirmed = true;
  vi.stubGlobal("Deno", { env: { get: (n: string) => n === "LOVABLE_API_KEY" ? "local-only-not-a-key" : undefined } });
  gateway = (url) => url.endsWith("/oauth2/authorize") ? Response.json({ authorization_url: "https://accounts.google.invalid/consent" })
    : url.endsWith("/oauth2/exchange") ? Response.json({ api_key: "lovack_local_fixture_key", connector_id: "google_mail" })
    : url.includes("/users/me/profile") ? Response.json({ emailAddress: "own@example.invalid" })
    : url.endsWith("/app-users/connection") ? new Response("{}") : Response.json({ messages: [] });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return gateway(url, init); }));
});
afterEach(() => vi.unstubAllGlobals());
let now = new Date("2026-10-19T20:00:00Z");
const conn = (s = memStore()) => ({ s, g: createGmailConnection({ store: s.store, clientApiKey: "client-local", encryptionSecret: SECRET, resolveAuth: async () => ({ email: authEmail, email_confirmed_at: confirmed ? "2026-10-01" : null }), now: () => now, nonce: () => NONCE }) });
const linked = async () => { const x = conn(); await x.g.start(A, C1, ORIGIN); await x.g.complete(A, C1, NONCE, "code-1"); return x; };

describe("#333 fase11b ligação Gmail por utilizador+empresa", () => {
  beforeEach(() => { now = new Date("2026-10-19T20:00:00Z"); });
  it("início pede só gmail.readonly, liga ao utilizador verificado e recusa origem fora da lista", async () => {
    const { g } = conn();
    await expect(g.start(A, C1, "https://evil.invalid")).rejects.toThrow(/endereço oficial/);
    await g.start(A, C1, ORIGIN);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.credentials_configuration.scopes).toEqual(["https://www.googleapis.com/auth/gmail.readonly"]);
    expect(body.app_user_id).toBe(A);
    expect(body.return_url).toBe(`${ORIGIN}/oauth/gmail/return?binding=${NONCE}`);
  });
  it("retorno de outro utilizador, outra empresa, repetido ou expirado nunca troca código", async () => {
    let x = conn(); await x.g.start(A, C1, ORIGIN);
    await expect(x.g.complete(B, C1, NONCE, "c")).rejects.toThrow(/expirou ou já foi usado/);
    await expect(x.g.complete(A, C2, NONCE, "c")).rejects.toThrow(/expirou ou já foi usado/);
    await x.g.complete(A, C1, NONCE, "c");
    await expect(x.g.complete(A, C1, NONCE, "c")).rejects.toThrow(/expirou ou já foi usado/);
    x = conn(); await x.g.start(A, C1, ORIGIN); now = new Date(now.getTime() + 11 * 60000);
    const exchanges = calls.filter((c) => c.url.endsWith("/exchange")).length;
    await expect(x.g.complete(A, C1, NONCE, "c")).rejects.toThrow(/expirou/);
    expect(calls.filter((c) => c.url.endsWith("/exchange")).length).toBe(exchanges);
  });
  it("conector diferente do Gmail é recusado e nada é guardado", async () => {
    gateway = (url) => url.endsWith("/exchange") ? Response.json({ api_key: "lovack_x", connector_id: "google_drive" }) : Response.json({ authorization_url: "https://accounts.google.invalid/c" });
    const x = conn(); await x.g.start(A, C1, ORIGIN);
    await expect(x.g.complete(A, C1, NONCE, "c")).rejects.toThrow(/diferente do Gmail/);
    expect(x.s.rows.size).toBe(0);
  });
  it("chave guardada só cifrada e presa ao par user+empresa", async () => {
    const x = await linked();
    const row = x.s.rows.get(`${A}:${C1}`)!;
    expect(row.ciphertext).not.toContain("lovack");
    await expect(openKey(SECRET, B, C1, row.ciphertext)).rejects.toBeTruthy();
    expect(await openKey(SECRET, A, C1, await sealKey(SECRET, A, C1, "k"))).toBe("k");
    // Outro utilizador/empresa não tem leitor, mesmo com a mesma loja.
    expect(await x.g.reader(B, C1)).toBeNull();
    expect(await x.g.reader(A, C2)).toBeNull();
    x.s.rows.set(`${B}:${C1}`, row); // linha copiada para outro utilizador
    expect(await x.g.reader(B, C1)).toBeNull();
  });
  it("leitura usa só GET, a chave do próprio e exige o escopo de leitura", async () => {
    const x = await linked();
    await (await x.g.reader(A, C1))!.search({ from_date: "2026-10-01", to_date: "2026-10-19", sender: "a@b.invalid", page_size: 5 });
    const read = calls.find(c => c.url.includes("/messages?"));
    if (!read) throw new Error("no mailbox read");
    expect(read.url).toMatch(/^https:\/\/connector-gateway\.lovable\.dev\/google_mail\/gmail\/v1\/users\/me\/messages\?/);
    expect(read.init.method).toBe("GET");
    const h = new Headers(read.init.headers);
    expect(h.get("X-Connection-Api-Key")).toBe("lovack_local_fixture_key");
    expect(h.get("X-Lovable-Required-Scopes")).toBe("https://www.googleapis.com/auth/gmail.readonly");
  });
  it("renovação falhada/escopo antigo marca reconexão e bloqueia leituras seguintes", async () => {
    const x = await linked();
    const reader = await x.g.reader(A, C1);
    gateway = () => Response.json({ type: "credential_refresh_token_expired" }, { status: 401 });
    if (!reader) throw new Error("missing reader");
    await expect(reader.search({ from_date: "2026-10-01", to_date: "2026-10-19", subject: "x", page_size: 5 })).rejects.toThrow(/renovada/);
    expect(await x.g.status(A, C1)).toEqual({ linked: false, reconnect_required: true });
    await expect(x.g.reader(A, C1)).rejects.toThrow(/renovada/);
  });
  it("desligar apaga a chave local antes de revogar e impede leituras, mesmo se a revogação falhar", async () => {
    const x = await linked();
    gateway = (url) => url.endsWith("/app-users/connection") ? new Response("down", { status: 503 }) : Response.json({});
    expect(await x.g.disconnect(A, C1)).toEqual({ revoked_at_google: false });
    expect(await x.g.reader(A, C1)).toBeNull();
    expect(calls.some((c) => c.init.method === "DELETE" && !c.url.endsWith("/app-users/connection"))).toBe(false);
  });
  it("mismatch não guarda chave, revoga só nova ligação e nunca lê mensagens", async () => {
    const x = conn(); await x.g.start(A, C1, ORIGIN);
    const previous = gateway;
    gateway = (url, init) => url.includes("/profile") ? Response.json({ emailAddress: "colleague@example.invalid" }) : previous(url, init);
    await expect(x.g.complete(A, C1, NONCE, "c")).rejects.toThrow(/mesmo email/);
    expect(x.s.rows.size).toBe(0);
    expect(calls.filter(c => c.init.method === "DELETE")).toHaveLength(1);
    expect(calls.some(c => c.url.includes("/messages"))).toBe(false);
  });
  it("identidade Google ausente recusa antes de persistir", async () => {
    const x = conn(); await x.g.start(A, C1, ORIGIN);
    const previous = gateway;
    gateway = (url, init) => url.includes("/profile") ? Response.json({}) : previous(url, init);
    await expect(x.g.complete(A, C1, NONCE, "c")).rejects.toThrow(/mesmo email/);
    expect(x.s.rows.size).toBe(0);
  });
  it("Auth não confirmado recusa sem chamar Google", async () => {
    confirmed = false;
    await expect(conn().g.start(A, C1, ORIGIN)).rejects.toThrow(/mesmo email/);
    expect(calls).toHaveLength(0);
  });
  it("email Auth alterado bloqueia leitor já obtido e status", async () => {
    const x = await linked(); const reader = await x.g.reader(A, C1);
    if (!reader) throw new Error("missing reader");
    authEmail = "changed@example.invalid"; calls = [];
    await expect(reader.attachment("msgLOCAL01", "1")).rejects.toThrow(/mesmo email/);
    expect(await x.g.status(A, C1)).toEqual({ linked: false, reconnect_required: true });
    expect(calls.some(c => c.url.includes("/messages"))).toBe(false);
  });
  it("não remove pontos nem +tags; caixa verificada só própria no status", async () => {
    const x = await linked();
    expect(await x.g.status(A, C1)).toEqual({ linked: true, reconnect_required: false, mailbox_email: "own@example.invalid" });
    authEmail = "o.wn+tag@example.invalid";
    await expect(x.g.reader(A, C1)).rejects.toThrow(/mesmo email/);
  });
  it("desligar invalida leitor em curso sem acesso ao anexo", async () => {
    const x = await linked(); const reader = await x.g.reader(A, C1);
    if (!reader) throw new Error("missing reader");
    await x.g.disconnect(A, C1); calls = [];
    await expect(reader.attachment("msgLOCAL01", "1")).rejects.toThrow(/mesmo email/);
    expect(calls).toHaveLength(0);
  });
  it("hash do vínculo, nunca o nonce, fica guardado", async () => {
    const x = conn(); await x.g.start(A, C1, ORIGIN);
    expect([...x.s.pending.keys()]).toEqual([await hashNonce(NONCE)]);
  });
});

describe("#333 fase11b assistente", () => {
  const send = (deps: Partial<Deps>, body: object) => createHandler({ pilotScoped: true, uploadEnabled: false, cors: {}, getUser: async () => ({ id: A }),
    userRpc: async (_t, name) => name === "my_effective_permissions" ? { data: { role: "manager", company_id: C1 }, error: null } : { data: { preparation: false, execute: false }, error: null },
    recordReceipt: async () => ({ data: null, error: null }), storage: { upload: async () => ({ error: null }), download: async () => null }, ...deps } as Deps)(
    new Request("http://local.invalid", { method: "POST", headers: { Authorization: "Bearer local-fixture", "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  it("sem ligação configurada as ações respondem indisponível", async () => {
    expect((await send({}, { action: "gmail_connection" })).status).toBe(503);
  });
  it("usa sempre utilizador e empresa do servidor, nunca do pedido", async () => {
    const g = { ...conn().g }; const status = vi.spyOn(g, "status");
    await send({ gmail: g }, { action: "gmail_connection" });
    expect(status).toHaveBeenCalledWith(A, C1);
    expect((await send({ gmail: g }, { action: "gmail_connection", user_id: B })).status).toBe(400);
  });
  it("vínculo mal formado é recusado antes de qualquer troca", async () => {
    expect((await send({ gmail: conn().g }, { action: "gmail_connect_complete", binding: "x", code: "c" })).status).toBe(400);
    expect(calls.length).toBe(0);
  });
});
