/** #333 handler with fake Auth/DB/storage; fetch blocked — no network, provider or Live. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHandler, type Deps, type Bucket } from "../../../../supabase/functions/data-entry/handler";
import { sha256 } from "../../../../supabase/functions/data-entry/core";
import { pdfFixture } from "../../../../src/test/fixtures/documents333";

const C = "11111111-1111-4111-8111-111111111111", S = "22222222-2222-4222-8222-222222222222", D = "33333333-3333-4333-8333-333333333333", P = "44444444-4444-4444-8444-444444444444";
const HASH = "a".repeat(64);
vi.stubGlobal("fetch", () => { throw new Error("egress proibido"); });

type Obj = { bytes: Uint8Array };
function world(opts: { role?: string; execute?: boolean; upload?: boolean } = {}) {
  const store = new Map<string, Obj>(); const calls: string[] = []; const receipts: string[] = [];
  let failUploadOnce = false; let commitError: { code?: string; message?: string } | null = null; let committed = false;
  const doc = { id: D, sha256: "", mime: "application/pdf", path: "", name: "f.pdf" };
  const state = () => ({ session: { id: S, company_id: C }, company: { id: C }, documents: doc.sha256 ? [doc] : [],
    preview: doc.sha256 ? { id: P, snapshot_hash: HASH, document_id: D } : null,
    results: committed ? [{ preview_id: P, result: { invoice_id: "i" } }] : [], capabilities: { execute: opts.execute ?? false } });
  const deps: Deps = {
    cors: {}, uploadEnabled: opts.upload ?? true,
    getUser: async (t) => (t === "good" ? { id: "u" } : null),
    async userRpc(_t, name, args) {
      calls.push(name);
      if (name === "my_effective_permissions") return { data: { role: opts.role ?? "manager", company_id: C }, error: null };
      if (name === "data_entry_session") return { data: state(), error: null };
      if (name === "data_entry_add_document") { doc.sha256 = String(args.p_sha); doc.path = `${C}/${S}/${args.p_sha}`; return { data: { id: D, reused: false }, error: null }; }
      if (name === "data_entry_commit") { if (commitError) return { data: null, error: commitError }; committed = true; return { data: { invoice_id: "i" }, error: null }; }
      if (name === "data_entry_result_check") return { data: { ok: true, result: { invoice_id: "i" }, path: `${C}/assistant333/${D}/${doc.sha256}.pdf`, sha256: doc.sha256 }, error: null };
      if (name === "data_entry_prepare") return { data: { id: P }, error: null };
      return { data: null, error: { code: "XX000", message: "internal secret detail" } };
    },
    recordReceipt: async (b, p, h) => { receipts.push(`${b}:${p}:${h}`); return { data: null, error: null }; },
    storage: {
      async upload(b: Bucket, p, bytes) {
        calls.push(`upload:${b}`);
        if (failUploadOnce) { failUploadOnce = false; store.set(`${b}/${p}`, { bytes }); throw new Error("crash after persist"); }
        if (store.has(`${b}/${p}`)) return { error: { conflict: true } };
        store.set(`${b}/${p}`, { bytes }); return { error: null };
      },
      async download(b, p) { return store.get(`${b}/${p}`)?.bytes ?? null; },
      async remove(b, p) { calls.push(`remove:${b}`); store.delete(`${b}/${p}`); },
    },
  };
  return { handle: createHandler(deps), store, calls, receipts, crashNextUpload: () => (failUploadOnce = true), setCommitError: (e: typeof commitError) => (commitError = e), doc };
}
const json = (body: unknown, token = "good") => new Request("http://x/", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const upload = (bytes: Uint8Array, mime = "application/pdf", extra?: Record<string, string>) => {
  const f = new FormData(); f.set("session_id", S); f.set("file", new File([bytes], "f.pdf", { type: mime }));
  for (const [k, v] of Object.entries(extra ?? {})) f.set(k, v);
  return new Request("http://x/", { method: "POST", headers: { Authorization: "Bearer good" }, body: f });
};
const exec = (hash = HASH) => json({ action: "execute", session_id: S, preview_id: P, snapshot_hash: hash, authorize: true });

describe("#333 handler", () => {
  let w: ReturnType<typeof world>;
  beforeEach(() => { w = world({ execute: true }); });

  it("sem sessão 401; editor 403 (papel vem do servidor)", async () => {
    expect((await w.handle(json({ action: "status" }, "bad"))).status).toBe(401);
    expect((await world({ role: "editor" }).handle(json({ action: "status" }))).status).toBe(403);
  });
  it("upload desactivado: 503 e nada guardado", async () => {
    const x = world({ upload: false });
    const r = await x.handle(upload(pdfFixture()));
    expect(r.status).toBe(503); expect(x.store.size).toBe(0);
  });
  it("PDF válido: caminho determinístico por bytes, recibo e registo; o reenvio não cria outro objecto", async () => {
    const bytes = pdfFixture(); const h = await sha256(bytes);
    expect((await w.handle(upload(bytes))).status).toBe(200);
    expect([...w.store.keys()]).toEqual([`data-entry-staging/${C}/${S}/${h}`]);
    expect((await w.handle(upload(bytes))).status).toBe(200);
    expect(w.store.size).toBe(1); expect(w.receipts.length).toBe(2);
  });
  it("ficheiro truncado ou campo extra recusados antes do armazenamento", async () => {
    expect((await w.handle(upload(new TextEncoder().encode("%PDF-")))).status).toBe(422);
    expect((await w.handle(upload(pdfFixture(), "application/pdf", { owner: "x" }))).status).toBe(400);
    expect(w.store.size).toBe(0);
  });
  it("objecto existente com bytes diferentes: 409 e sem recibo", async () => {
    const bytes = pdfFixture(); const h = await sha256(bytes);
    w.store.set(`data-entry-staging/${C}/${S}/${h}`, { bytes: pdfFixture("outro") });
    expect((await w.handle(upload(bytes))).status).toBe(409); expect(w.receipts.length).toBe(0);
  });
  it("crash do armazenamento após gravar: resposta genérica; retoma confere bytes e continua", async () => {
    w.crashNextUpload();
    const r1 = await w.handle(upload(pdfFixture()));
    expect(r1.status).toBe(503); expect(JSON.stringify(await r1.json())).not.toMatch(/crash/);
    expect((await w.handle(upload(pdfFixture()))).status).toBe(200); expect(w.store.size).toBe(1);
  });
  it("execução não validada: 503 sem cópia final", async () => {
    const x = world({ execute: false }); await x.handle(upload(pdfFixture()));
    expect((await x.handle(exec())).status).toBe(503);
    expect([...x.store.keys()].some((k) => k.startsWith("standalone-invoices"))).toBe(false);
  });
  it("hash da autorização diferente: 409 sem efeitos", async () => {
    await w.handle(upload(pdfFixture()));
    expect((await w.handle(exec("b".repeat(64)))).status).toBe(409);
    expect(w.calls).not.toContain("data_entry_commit");
  });
  it("execução: copia final verificada, commit, conferência do persistido", async () => {
    await w.handle(upload(pdfFixture()));
    const r = await w.handle(exec());
    expect(r.status).toBe(200); expect((await r.json()).status).toBe("conferido");
    expect([...w.store.keys()].filter((k) => k.startsWith("standalone-invoices")).length).toBe(1);
  });
  it("recusa definitiva no commit: cópia final removida, mensagem só do #333", async () => {
    await w.handle(upload(pdfFixture()));
    w.setCommitError({ code: "23505", message: "#333: Fatura já existe no ERP; nenhuma nova ação" });
    const r = await w.handle(exec());
    expect(r.status).toBe(409); expect((await r.json()).error).toBe("Fatura já existe no ERP; nenhuma nova ação");
    expect([...w.store.keys()].some((k) => k.startsWith("standalone-invoices"))).toBe(false);
  });
  it("resultado desconhecido: mantém a cópia, pede retoma; a retoma confere (não repete commit)", async () => {
    await w.handle(upload(pdfFixture()));
    w.setCommitError({ code: "08006", message: "connection lost" });
    const r = await w.handle(exec());
    expect(r.status).toBe(503); expect((await r.json()).status).toBe("por_confirmar");
    w.setCommitError(null); await w.handle(exec());
    const commits = w.calls.filter((c) => c === "data_entry_commit").length;
    const again = await w.handle(exec());
    expect((await again.json()).status).toBe("conferido");
    expect(w.calls.filter((c) => c === "data_entry_commit").length).toBe(commits);
  });
  it("erros internos nunca chegam ao utilizador; prévia com valor em texto é recusada antes do servidor", async () => {
    const r = await w.handle(json({ action: "preview", session_id: S, document_id: D, fields: { total_amount: "1" } }));
    expect(r.status).toBe(400); expect(w.calls).not.toContain("data_entry_prepare");
  });
});
