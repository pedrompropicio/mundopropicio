// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseProgress, progressPath, runBackupSlices, type Deps, type Progress, type SliceInput } from "../../supabase/functions/database-backup/slices";

const DAY = Date.parse("2026-11-04T03:30:00Z");
const input: SliceInput = { scope: "global", companyId: null, slug: "global", force: true };

function fixture(count = 1253) {
  let clock = DAY;
  const rows: any[] = [];
  const files = new Map<string, Blob>();
  const mutations: any[] = [];
  const queues: any[] = [];
  const source = Array.from({ length: count }, (_, id) => ({ id, label: `row-${id}` }));
  const targets = [{ schema_name: "public", tbl_name: "large", has_company_id: false }];
  class Query {
    filters: ((r: any) => boolean)[] = [];
    kind = "read"; values: any; singleRow = false; sort?: string;
    constructor(public table: string) {}
    select() { return this; }
    eq(key: string, value: any) { this.filters.push((r) => r[key] === value); return this; }
    is(key: string, value: any) { return this.eq(key, value); }
    order(key: string) { this.sort = key; return this; }
    update(values: any) { this.kind = "update"; this.values = values; return this; }
    insert(values: any) { this.kind = "insert"; this.values = values; return this; }
    maybeSingle() { this.singleRow = true; return this; }
    single() { this.singleRow = true; return this; }
    abortSignal() { return this; }
    then(resolve: (value: any) => any, reject?: (error: any) => any) {
      return Promise.resolve().then(() => {
        if (this.table === "backup_excluded_tables") return { data: [], error: null };
        if (this.table !== "backup_runs") throw new Error(`Unexpected table ${this.table}`);
        let found = rows.filter((r) => this.filters.every((f) => f(r)));
        if (this.kind === "insert") {
          const row = { id: `run-${rows.length + 1}`, started_at: new Date(clock).toISOString(), ...this.values };
          rows.push(row); found = [row]; mutations.push({ insert: structuredClone(row) });
        } else if (this.kind === "update") {
          for (const r of found) { Object.assign(r, this.values); mutations.push({ id: r.id, update: structuredClone(this.values) }); }
        }
        if (this.sort) found.sort((a, b) => String(b[this.sort!]).localeCompare(String(a[this.sort!])));
        return { data: this.singleRow ? found[0] ?? null : found, error: null };
      }).then(resolve, reject);
    }
  }
  const upload = vi.fn(async (path: string, blob: Blob) => {
    files.set(path, blob); mutations.push({ upload: path }); return { data: { path }, error: null };
  });
  const download = vi.fn(async (path: string) => ({ data: files.get(path) ?? null, error: null }));
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://storage.invalid/unused" }, error: null }));
  const storage = { upload, download, createSignedUrl, list: vi.fn(async (_path: string): Promise<{ data: any[]; error: any }> => ({ data: [], error: null })), remove: vi.fn() };
  const rpc = vi.fn((name: string, args?: any) => {
    const execute = async () => {
      if (name === "backup_enqueue_slice") { queues.push(args.p_body); return { data: queues.length, error: null }; }
      if (name === "backup_table_inventory") return { data: targets, error: null };
      if (name === "backup_storage_manifest") return { data: { documents: { objects: 2, bytes: 100, files: ["a", "b"] } }, error: null };
      if (name === "backup_infra_snapshot") return { data: { contagens: { crons: 1 } }, error: null };
      if (name === "backup_identities_snapshot") return { data: { contagens: { utilizadores: 2, identidades: 2 } }, error: null };
      throw new Error(name);
    };
    return { then: (resolve: any, reject: any) => execute().then(resolve, reject), abortSignal: vi.fn(() => execute()) };
  });
  const db = { from: (table: string) => new Query(table), storage: { from: () => storage }, rpc };
  const deps: Deps = {
    db, now: () => clock,
    readPage: vi.fn(async (_target, cursor) => {
      clock += 6000;
      const page = source.slice(cursor.from, cursor.from + cursor.pageSize);
      return { text: JSON.stringify(page), rows: page.length, ordered: cursor.ordered };
    }),
    prepare: vi.fn(async () => [...targets]),
    final: vi.fn(async (p, c) => {
      const manifest = `${c.folder}/manifest.json`;
      await upload(manifest, new Blob([JSON.stringify({ version: 4, tables: p.tables, parts: p.parts, rows_total: p.rows_total })]));
      return { fields: { file_name: manifest, rows_total: p.rows_total, bytes: p.bytes }, result: { success: true } };
    }),
    rotate: vi.fn(async () => {}),
  };
  const checkpoint = async () => JSON.parse(await files.get(progressPath(rows.at(-1)!.folder_path))!.text()) as Progress;
  const continuation = (body = queues.at(-1)): SliceInput => ({ ...input, continuation: { runId: body.run_id, folder: body.folder, seq: body.seq } });
  const seed = (options: any = {}, pOptions: Partial<Progress> = {}) => {
    const row = { id: `seed-${rows.length}`, scope: "global", company_id: null, status: "running", run_date: "2026-11-04",
      started_at: new Date(DAY - 60 * 60_000).toISOString(), folder_path: `global/seed-${rows.length}`, ...options };
    if (!Object.prototype.hasOwnProperty.call(options, "file_name")) row.file_name = progressPath(row.folder_path);
    rows.push(row);
    const p: Progress = { version: 1, run_id: row.id, seq: 4, phase: "tables", next_index: 0, cursor: null,
      tables: {}, schemas: {}, errors: [], parts: {}, rows_total: 0, bytes: 0, heartbeat_at: new Date(DAY - 4 * 60_000).toISOString(), ...pOptions };
    files.set(progressPath(row.folder_path), new Blob([JSON.stringify(p)]));
    return row;
  };
  return { deps, rows, files, mutations, queues, source, targets, db, upload, storage, checkpoint, continuation, seed,
    advance: (ms: number) => { clock += ms; }, setClock: (ms: number) => { clock = ms; } };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); vi.doUnmock("npm:@supabase/supabase-js@2"); vi.doUnmock("../../supabase/functions/_shared/multiTenant.ts"); });

describe("#202-c fatias puras, sem credenciais nem serviços", () => {
  it("corta dentro da tabela, retoma sem duplicar linhas/contagens e finaliza numa fatia própria", async () => {
    const s = fixture();
    expect(await runBackupSlices(s.deps, input)).toMatchObject({ continued: true, phase: "tables", seq: 1 });
    expect(s.rows[0].file_name).toBe(progressPath(s.rows[0].folder_path));
    expect(await s.checkpoint()).toMatchObject({ next_index: 0, cursor: { from: 500, rows: 500, partIndex: 2 }, rows_total: 0 });
    expect(s.deps.final).not.toHaveBeenCalled();
    for (let attempt = 0; attempt < 10 && (await s.checkpoint()).phase !== "final"; attempt++) await runBackupSlices(s.deps, s.continuation());
    expect(s.deps.final).not.toHaveBeenCalled();
    const p = await s.checkpoint();
    expect(p).toMatchObject({ phase: "final", next_index: 1, cursor: null, tables: { large: 1253 }, rows_total: 1253, parts: { large: 3 } });
    const dumpFiles = [...s.files].filter(([path]) => /\/large(?:\.part\d+)?\.json$/.test(path));
    const actual = (await Promise.all(dumpFiles.map(async ([, b]) => JSON.parse(await b.text())))).flat();
    expect(actual).toEqual(s.source);
    expect(new Set(actual.map((r) => r.id)).size).toBe(1253);
    expect(p.bytes).toBe(dumpFiles.reduce((sum, [, b]) => sum + b.size, 0));
    expect(await runBackupSlices(s.deps, s.continuation())).toEqual({ success: true });
    expect(s.rows[0]).toMatchObject({ status: "ok", rows_total: 1253, file_name: `${s.rows[0].folder_path}/manifest.json` });
    expect(s.queues.every((q) => q.force && q.target === "global" && !q.progress && !q.start_index)).toBe(true);
    expect(s.deps.rotate).toHaveBeenCalledOnce();
  });
  it("seq duplicado ou futuro não escreve nem lê páginas e não fecha a corrida do sucessor", async () => {
    const s = fixture();
    await runBackupSlices(s.deps, input);
    const old = s.continuation();
    await runBackupSlices(s.deps, old);
    const writes = s.mutations.length, calls = vi.mocked(s.deps.readPage).mock.calls.length;
    expect(await runBackupSlices(s.deps, old)).toEqual({ skipped: true, reason: "seq" });
    expect(await runBackupSlices(s.deps, { ...old, continuation: { ...old.continuation!, seq: 999 } })).toEqual({ skipped: true, reason: "seq" });
    expect(s.mutations).toHaveLength(writes);
    expect(s.deps.readPage).toHaveBeenCalledTimes(calls);
    expect(s.rows[0].status).toBe("running");
  });
  it.each(["prepare", "readPage", "final"] as const)("exceção em %s fecha error com motivo", async (stage) => {
    const s = fixture(0);
    if (stage === "final") { s.seed({}, { phase: "final", next_index: 1 }); }
    s.deps[stage] = vi.fn(async () => { throw new Error(`falha ${stage}`); }) as any;
    expect(await runBackupSlices(s.deps, input)).toMatchObject({ error: `falha ${stage}` });
    expect(s.rows[0]).toMatchObject({ status: "error", error_text: `202-c: saída sem conclusão: falha ${stage}` });
    expect(s.rows[0].finished_at).toBeTruthy();
  });
  it("retorno final sem conclusão é fechado pelo finally", async () => {
    const s = fixture(0); s.seed({}, { phase: "final", next_index: 1 });
    s.deps.final = async () => undefined;
    expect(await runBackupSlices(s.deps, input)).toHaveProperty("error");
    expect(s.rows[0]).toMatchObject({ status: "error", error_text: "202-c: saída sem conclusão: retorno sem conclusão" });
  });
  it.each(["upload", "enqueue", "receipt"])("falha de %s não conta como passagem confirmada", async (stage) => {
    const s = fixture();
    if (stage === "upload") s.upload.mockResolvedValue({ data: null, error: { message: "storage down" } } as any);
    else s.deps.db.rpc = vi.fn(async () => ({ data: null, error: stage === "enqueue" ? { message: "enqueue down" } : null }));
    expect(await runBackupSlices(s.deps, input)).toHaveProperty("error");
    expect(s.rows[0].status).toBe("error");
    expect(s.rows[0].error_text).toContain("202-c: saída sem conclusão:");
  });
  it("global abandonada com marca fecha error; histórica sem marca permanece byte a byte", async () => {
    const s = fixture(0);
    const old = s.seed({ started_at: new Date(DAY - 3 * 3600_000).toISOString() });
    const legacy = s.seed({ file_name: null, started_at: new Date(DAY - 20 * 3600_000).toISOString() });
    const original = structuredClone(legacy);
    expect(await runBackupSlices(s.deps, input)).toMatchObject({ continued: true, phase: "final" });
    expect(old).toMatchObject({ status: "error", error_text: "202-c: saída sem conclusão: abandonada (> 2 h)" });
    expect(legacy).toEqual(original);
    expect(s.rows).toHaveLength(3);
  });
  it("fecha abandonadas com marca mesmo quando uma corrida mais recente ainda está ativa", async () => {
    const s = fixture();
    const abandoned = s.seed({ started_at: new Date(DAY - 3 * 3600_000).toISOString() });
    const active = s.seed({}, { heartbeat_at: new Date(DAY - 60_000).toISOString() });
    expect(await runBackupSlices(s.deps, input)).toEqual({ skipped: true, reason: "running" });
    expect(abandoned.status).toBe("error");
    expect(active.status).toBe("running");
    expect(s.rows).toHaveLength(2);
  });
  it("heartbeat recente impede nova corrida mesmo com force; heartbeat antigo de hoje retoma", async () => {
    const busy = fixture(); busy.seed({}, { heartbeat_at: new Date(DAY - 2 * 60_000).toISOString() });
    expect(await runBackupSlices(busy.deps, input)).toEqual({ skipped: true, reason: "running" });
    expect(busy.mutations).toEqual([]);
    const stale = fixture(); stale.seed({}, { cursor: { from: 250, rows: 250, bytes: 8, partIndex: 2, pageSize: 250, ordered: false } });
    expect(await runBackupSlices(stale.deps, input)).toMatchObject({ continued: true, seq: 5 });
    expect(stale.rows).toHaveLength(1);
    expect(vi.mocked(stale.deps.readPage).mock.calls[0][1]).toMatchObject({ from: 250, ordered: false });
  });
  it("estado corrompido fecha a dona; continuação com alvo/pasta errados não escreve", async () => {
    const s = fixture(); const row = s.seed();
    s.files.set(progressPath(row.folder_path), new Blob(['{"version":2}']));
    expect(await runBackupSlices(s.deps, { ...input, continuation: { runId: row.id, folder: row.folder_path, seq: 4 } })).toHaveProperty("error");
    expect(row.status).toBe("error");
    const other = fixture(); const r = other.seed();
    expect(await runBackupSlices(other.deps, { ...input, continuation: { runId: r.id, folder: "other/run", seq: 4 } })).toMatchObject({ skipped: true });
    expect(await runBackupSlices(other.deps, { ...input, scope: "company", companyId: "foreign", continuation: { runId: r.id, folder: r.folder_path, seq: 4 } })).toMatchObject({ skipped: true });
    expect(other.mutations).toEqual([]);
    expect(() => parseProgress({ version: 1 }, r.id)).toThrow("inválido");
  });
  it("falha de rotação ocorre depois do ok e não impede o fecho", async () => {
    const s = fixture(0); s.seed({}, { phase: "final", next_index: 1 });
    s.deps.rotate = async () => { expect(s.rows[0].status).toBe("ok"); throw new Error("rotation timeout"); };
    expect(await runBackupSlices(s.deps, input)).toEqual({ success: true });
    expect(s.rows[0].status).toBe("ok");
  });
  it("empresa retoma com company_id e conserva o formato v4 sem rotação global", async () => {
    const s = fixture(2);
    const company: SliceInput = { ...input, scope: "company", companyId: "company-a", slug: "company-a" };
    await runBackupSlices(s.deps, company);
    expect(s.queues[0]).toMatchObject({ company_id: "company-a", force: true });
    expect(s.queues[0]).not.toHaveProperty("target");
    expect(vi.mocked(s.deps.readPage).mock.calls[0][2]).toBe("company-a");
    await runBackupSlices(s.deps, { ...company, continuation: s.continuation().continuation });
    expect(s.rows[0].status).toBe("ok");
    expect(s.deps.rotate).not.toHaveBeenCalled();
  });
  it("helper não depende de Deno/npm e ramo offsite/janela permanecem literais", () => {
    const code = readFileSync("supabase/functions/database-backup/index.ts", "utf8");
    expect(readFileSync("supabase/functions/database-backup/slices.ts", "utf8")).not.toMatch(/\bDeno\b|npm:/);
    expect(code).toContain(`    if (body?.target === "offsite") {
      if (!isSr) return json({ error: "Apenas service role" }, 403);
      const { runOffsiteFromEnv } = await import("./offsite.ts");
      return json(await runOffsiteFromEnv(adminClient, body, (n) => Deno.env.get(n)));
    }

    // Janela 02:00-05:00 Europe/Lisbon para chamadas de máquina.`);
  });
});

async function handlerFixture() {
  const s = fixture(2);
  let handler: (request: Request) => Promise<Response>;
  const clientFactory = vi.fn((_url: string, _key: string, _options?: any) => s.db);
  vi.stubGlobal("Deno", { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://backup.invalid" : "fixture-no-credential" }, serve: (h: any) => { handler = h; } });
  vi.doMock("npm:@supabase/supabase-js@2", () => ({ createClient: clientFactory }));
  vi.doMock("../../supabase/functions/_shared/multiTenant.ts", () => ({ isServiceRoleRequest: async () => true }));
  const network = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(s.source), { status: 200, headers: { "content-range": "0-1/*" } }));
  vi.stubGlobal("fetch", network);
  vi.spyOn(Date, "now").mockImplementation(s.deps.now);
  const modulePath = "../../supabase/functions/database-backup/index.ts";
  await import(/* @vite-ignore */ modulePath);
  const call = (body: any) => handler(new Request("https://backup.invalid/function", { method: "POST", body: JSON.stringify(body) }));
  return { ...s, call, network, clientFactory };
}

describe("#202-c integração do handler com transportes locais", () => {
  it("página usa timeout, final corre separada e o manifesto v4 fecha backup_runs", async () => {
    const s = await handlerFixture();
    expect(await (await s.call({ target: "global", force: true })).json()).toMatchObject({ continued: true, phase: "final" });
    expect(s.files.has(`${s.rows[0].folder_path}/manifest.json`)).toBe(false);
    expect(s.network.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    const response = await s.call(s.queues[0]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, version: 4, rows_total: 2 });
    const manifest = JSON.parse(await s.files.get(`${s.rows[0].folder_path}/manifest.json`)!.text());
    expect(manifest).toMatchObject({ version: 4, tables: { large: 2 }, storage_manifest: "storage-manifest.json", infra: "infra.json", identities: "identities.json" });
    expect(s.rows[0]).toMatchObject({ status: "ok", rows_total: 2 });
  });
  it("transportes usam o tempo restante e reservam 15 s dentro do teto de 100 s", async () => {
    const s = await handlerFixture();
    await s.call({ target: "global", force: true });
    const transports = s.clientFactory.mock.calls.filter((call) => call[2]?.global?.fetch).map((call) => call[2].global.fetch);
    // closeClient is created first; the work client is installed after the unchanged offsite branch.
    const [closeFetch, workFetch] = transports;
    const timeout = vi.spyOn(AbortSignal, "timeout");
    s.advance(84_000);
    await workFetch("https://backup.invalid/transport", {});
    expect(timeout).toHaveBeenLastCalledWith(1000);
    s.advance(2000);
    expect(() => workFetch("https://backup.invalid/transport", {})).toThrow("prazo");
    await closeFetch("https://backup.invalid/close", {});
    expect(timeout).toHaveBeenLastCalledWith(14_000);
    s.advance(14_001);
    expect(() => closeFetch("https://backup.invalid/close", {})).toThrow("prazo");
  });
  it("rotação elimina no máximo 20 pastas e só depois de confirmar ok", async () => {
    const s = await handlerFixture();
    await s.call({ target: "global", force: true });
    s.storage.list.mockImplementation(async (path: string) => {
      expect(s.rows[0].status).toBe("ok");
      return { data: path === "" ? ["a", "b", "c"].map((name) => ({ name, id: null }))
        : path.includes("/") ? [{ id: "object", name: "manifest.json" }]
        : Array.from({ length: 45 }, (_, i) => ({ id: null, name: String(i).padStart(3, "0") })), error: null };
    });
    expect(await (await s.call(s.queues[0])).json()).toMatchObject({ success: true });
    expect(s.storage.remove).toHaveBeenCalledTimes(20);
    expect(s.rows[0].status).toBe("ok");
  });
  it("timeout de RPC final termina error, preserva o canal reservado de fecho e não roda retenção", async () => {
    const s = await handlerFixture();
    await s.call({ target: "global", force: true });
    const originalRpc = s.db.rpc.getMockImplementation()!;
    s.db.rpc.mockImplementation((name: string, args: any) => name === "backup_storage_manifest"
      ? ({ abortSignal: async () => ({ data: null, error: { message: `timeout ${name}` } }) }) as any
      : originalRpc(name, args));
    const response = await s.call(s.queues[0]);
    expect(response.status).toBe(500);
    expect(s.rows[0]).toMatchObject({ status: "error", error_text: "202-c: saída sem conclusão: backup_storage_manifest: timeout backup_storage_manifest" });
    expect(s.storage.list).not.toHaveBeenCalled();
  });
});
