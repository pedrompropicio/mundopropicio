// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { dumpTable, parseProgress, progressPath, runBackupSlices, type Context, type Cursor, type Deps, type Progress, type SliceInput } from "../../supabase/functions/database-backup/slices";

const DAY = Date.parse("2026-11-04T03:30:00Z");
const input: SliceInput = { scope: "global", companyId: null, slug: "global", force: true };
const target = { schema_name: "public", tbl_name: "large", has_company_id: false };
const context: Context = { ...input, folder: "global/fixture", runId: "fixture" };
const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const cursor = (extra: Partial<Cursor> = {}): Cursor => ({ from: 0, after: null, pageSize: 250, ordered: true, partIndex: 1, rows: 0, bytes: 0, ...extra });

function fixture(count = 2300) {
  vi.useFakeTimers();
  vi.setSystemTime(DAY);
  const source = Array.from({ length: count }, (_, n) => ({ id: uuid(count - n), label: `row-${count - n}` }));
  const sorted = [...source].sort((a, b) => a.id < b.id ? -1 : 1);
  const runs: any[] = [], queues: any[] = [];
  const files = new Map<string, Blob>();
  class Query {
    filters: ((row: any) => boolean)[] = [];
    kind = "read"; values: any; singleRow = false;
    constructor(readonly table: string) {}
    select() { return this; }
    eq(key: string, value: any) { this.filters.push((r) => r[key] === value); return this; }
    is(key: string, value: any) { return this.eq(key, value); }
    order() { return this; }
    update(values: any) { this.kind = "update"; this.values = values; return this; }
    insert(values: any) { this.kind = "insert"; this.values = values; return this; }
    maybeSingle() { this.singleRow = true; return this; }
    single() { this.singleRow = true; return this; }
    then(resolve: any, reject: any) {
      return Promise.resolve().then(() => {
        if (this.table !== "backup_runs") throw new Error(`Unexpected table ${this.table}`);
        let found = runs.filter((r) => this.filters.every((f) => f(r)));
        if (this.kind === "insert") {
          const row = { id: `run-${runs.length}`, started_at: new Date(Date.now()).toISOString(), ...this.values };
          runs.push(row); found = [row];
        } else if (this.kind === "update") for (const row of found) Object.assign(row, this.values);
        return { data: this.singleRow ? found[0] ?? null : found, error: null };
      }).then(resolve, reject);
    }
  }
  const upload = vi.fn(async (path: string, blob: Blob) => { files.set(path, blob); return { error: null }; });
  const db = {
    from: (table: string) => new Query(table),
    storage: { from: () => ({ upload, download: async (path: string) => ({ data: files.get(path), error: null }) }) },
    rpc: vi.fn(async (name: string, args: any) => {
      if (name !== "backup_enqueue_slice") throw new Error(name);
      queues.push(args.p_body); return { data: queues.length, error: null };
    }),
  };
  const reads: Cursor[] = [];
  const deps: Deps = {
    db, now: () => Date.now(),
    prepare: async () => [target],
    readPage: vi.fn(async (_target, c) => {
      reads.push({ ...c });
      vi.setSystemTime(Date.now() + 6000);
      const remaining = c.ordered && c.after !== undefined
        ? sorted.filter((r) => c.after === null || r.id > c.after) : sorted.slice(c.from);
      const page = remaining.slice(0, c.pageSize);
      return { text: JSON.stringify(page), rows: page.length, ordered: c.ordered, lastId: page.at(-1)?.id ?? null };
    }),
    final: async (p) => ({ fields: { rows_total: p.rows_total }, result: { success: true } }),
    rotate: async () => {},
  };
  const checkpoint = async () => JSON.parse(await files.get(progressPath(runs[0].folder_path))!.text()) as Progress;
  const continuation = (): SliceInput => ({ ...input, continuation: { runId: queues.at(-1).run_id, folder: queues.at(-1).folder, seq: queues.at(-1).seq } });
  const exported = async () => (await Promise.all([...files].filter(([path]) => /\/large(?:\.part\d+)?\.json$/.test(path))
    .map(async ([, blob]) => JSON.parse(await blob.text())))).flat();
  return { deps, db, runs, queues, files, upload, source, sorted, reads, checkpoint, continuation, exported };
}

// Capture only the production readPage closure; transports and all service state stay local.
async function transport() {
  let handler: (request: Request) => Promise<Response>;
  let captured: Deps;
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => name === "SUPABASE_URL" ? "https://backup.invalid" : "fixture-no-credential" },
    serve: (fn: typeof handler) => { handler = fn; },
  });
  vi.doMock("npm:@supabase/supabase-js@2", () => ({ createClient: () => ({}) }));
  vi.doMock("../../supabase/functions/_shared/multiTenant.ts", () => ({ isServiceRoleRequest: async () => true }));
  vi.doMock("../../supabase/functions/database-backup/slices.ts", () => ({ runBackupSlices: async (deps: Deps) => { captured = deps; return {}; } }));
  const network = vi.fn(async (_url: string, _init: RequestInit) => new Response("[]"));
  vi.stubGlobal("fetch", network);
  const modulePath = "../../supabase/functions/database-backup/index.ts";
  await import(/* @vite-ignore */ modulePath);
  const renew = async () => {
    await handler(new Request("https://backup.invalid/function", { method: "POST", body: JSON.stringify({ target: "global", force: true }) }));
    return captured.readPage;
  };
  return { network, read: await renew(), renew };
}

afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules();
  vi.doUnmock("npm:@supabase/supabase-js@2");
  vi.doUnmock("../../supabase/functions/_shared/multiTenant.ts");
  vi.doUnmock("../../supabase/functions/database-backup/slices.ts");
});

describe("#202-d chave e checkpoint v1 sem credenciais", () => {
  it("1: exporta 2300 UUIDs inseridos ao contrário, corta e retoma depois do after sem lacunas/duplicados", async () => {
    const s = fixture();
    expect(s.source).not.toEqual(s.sorted);
    expect(await runBackupSlices(s.deps, input)).toMatchObject({ continued: true, phase: "tables" });
    const p = await s.checkpoint();
    expect(p).toMatchObject({ version: 1, cursor: { from: 500, rows: 500, after: uuid(500), partIndex: 2 } });
    expect(await s.exported()).toEqual(s.sorted.slice(0, 500));
    await runBackupSlices(s.deps, s.continuation());
    expect(s.reads[2]).toMatchObject({ after: uuid(500), from: 500 });
    for (let n = 0; n < 10 && (await s.checkpoint()).phase !== "final"; n++) await runBackupSlices(s.deps, s.continuation());
    expect(await s.exported()).toEqual(s.sorted);
    expect(new Set((await s.exported()).map((r) => r.id)).size).toBe(2300);
    expect(await s.checkpoint()).toMatchObject({ version: 1, cursor: null, tables: { large: 2300 }, rows_total: 2300 });
    expect(s.reads.slice(1).every((c) => typeof c.after === "string")).toBe(true);
    expect(await runBackupSlices(s.deps, s.continuation())).toEqual({ success: true });
    expect(s.runs[0].status).toBe("ok");
  });

  it("1: o leitor real pede id=gt. sem OFFSET, preservando conteúdo e ordem dos 2300 UUIDs", async () => {
    const s = fixture(), t = await transport();
    t.network.mockImplementation(async (url) => {
      const q = new URL(url).searchParams;
      const after = q.get("id")?.slice(3);
      const page = s.sorted.filter((r) => !after || r.id > after).slice(0, Number(q.get("limit")));
      vi.setSystemTime(Date.now() + 6000);
      return new Response(JSON.stringify(page));
    });
    s.deps.readPage = t.read;
    await runBackupSlices(s.deps, input);
    for (let n = 0; n < 10 && (await s.checkpoint()).phase !== "final"; n++) {
      s.deps.readPage = await t.renew();
      await runBackupSlices(s.deps, s.continuation());
    }
    const requests = t.network.mock.calls.map(([url]) => new URL(url).searchParams);
    expect(requests[0].has("id")).toBe(false);
    expect(requests.every((q) => q.get("order") === "id.asc" && !q.has("offset"))).toBe(true);
    requests.slice(1).forEach((q, i) => expect(q.get("id")).toBe(`gt.${uuid(Math.min((i + 1) * 250, 2300))}`));
    expect(await s.exported()).toEqual(s.sorted);
    expect(await s.checkpoint()).toMatchObject({ rows_total: 2300, tables: { large: 2300 } });
  });

  it.each([undefined, null, uuid(12)])("1/2: parseProgress conserva after=%s sem converter cursores antigos", (after) => {
    const c = cursor();
    if (after === undefined) delete c.after; else c.after = after;
    const p: Progress = { version: 1, run_id: "fixture", seq: 1, phase: "tables", next_index: 0, cursor: c,
      tables: {}, schemas: {}, errors: [], parts: {}, rows_total: 0, bytes: 0, heartbeat_at: new Date(DAY).toISOString() };
    expect(parseProgress(JSON.parse(JSON.stringify(p)), "fixture")).toEqual(p);
    for (const invalid of [0, false, {}, []]) expect(() => parseProgress({ ...p, cursor: { ...c, after: invalid } }, "fixture")).toThrow("inválido");
  });

  it("2: cursor antigo mantém OFFSET após outro checkpoint e só a próxima tabela usa chave", async () => {
    const s = fixture(1800), t = await transport();
    const old = cursor({ from: 250, rows: 250, partIndex: 2 }); delete old.after;
    const row = { id: "legacy", scope: "global", company_id: null, status: "running", run_date: "2026-11-04",
      started_at: new Date(DAY).toISOString(), folder_path: context.folder, file_name: progressPath(context.folder) };
    s.runs.push(row);
    const p: Progress = { version: 1, run_id: row.id, seq: 1, phase: "tables", next_index: 0, cursor: old,
      tables: {}, schemas: {}, errors: [], parts: {}, rows_total: 0, bytes: 0, heartbeat_at: new Date(DAY).toISOString() };
    s.files.set(progressPath(row.folder_path), new Blob([JSON.stringify(p)]));
    s.files.set(`${row.folder_path}/large.json`, new Blob([JSON.stringify(s.sorted.slice(0, 250))]));
    s.deps.prepare = async () => [target, { ...target, tbl_name: "next_table" }];
    s.deps.readPage = t.read;
    t.network.mockImplementation(async (url) => {
      const u = new URL(url), q = u.searchParams;
      vi.setSystemTime(Date.now() + 6000);
      return new Response(JSON.stringify(u.pathname.endsWith("/large")
        ? s.sorted.slice(Number(q.get("offset")), Number(q.get("offset")) + Number(q.get("limit")))
        : q.has("id") ? [] : [{ id: uuid(1) }]));
    });
    const initial = { ...input, continuation: { runId: row.id, folder: row.folder_path, seq: 1 } };
    await runBackupSlices(s.deps, initial);
    expect((await s.checkpoint()).cursor).not.toHaveProperty("after");
    for (let n = 0; n < 10 && (await s.checkpoint()).phase !== "final"; n++) {
      s.deps.readPage = await t.renew();
      await runBackupSlices(s.deps, s.continuation());
    }
    const requests = t.network.mock.calls.map(([url]) => new URL(url));
    const oldRequests = requests.filter((u) => u.pathname.endsWith("/large"));
    expect(oldRequests.map((u) => Number(u.searchParams.get("offset")))).toEqual([250, 500, 750, 1000, 1250, 1500, 1750]);
    expect(oldRequests.every((u) => !u.searchParams.has("id") && u.searchParams.get("order") === "id.asc")).toBe(true);
    const next = requests.find((u) => u.pathname.endsWith("/next_table"))!;
    expect(next.searchParams.get("order")).toBe("id.asc");
    expect(next.searchParams.has("offset")).toBe(false);
    expect(await s.exported()).toEqual(s.sorted);
    expect(await s.checkpoint()).toMatchObject({ tables: { large: 1800, next_table: 1 } });
  });

  it("1: reduzir o tamanho de página depois de 4 MB conserva a chave", async () => {
    const s = fixture(520);
    const source = s.sorted.map((row) => ({ ...row, padding: "x".repeat(17_000) }));
    const calls: Cursor[] = [];
    s.deps.readPage = async (_target, c) => {
      calls.push({ ...c });
      const page = source.filter((r) => c.after === null || r.id > c.after!).slice(0, c.pageSize);
      return { text: JSON.stringify(page), rows: page.length, ordered: true, lastId: page.at(-1)?.id ?? null };
    };
    const result = await dumpTable(s.deps, target, context, null, () => false);
    expect(result).toMatchObject({ done: true, cursor: { after: uuid(520), from: 520, rows: 520, pageSize: 50 } });
    expect(calls[1]).toMatchObject({ after: uuid(250), from: 250, pageSize: 50 });
    expect(await s.exported()).toEqual(source);
  });

  it("3: 400/42703 sem id passa a OFFSET e retoma sem novas tentativas de ordenar", async () => {
    const s = fixture(600), t = await transport();
    const source = s.source.map(({ label }) => ({ label }));
    t.network.mockImplementation(async (url) => {
      const q = new URL(url).searchParams;
      if (q.has("order")) return new Response('{"code":"42703","message":"column id does not exist"}', { status: 400 });
      const offset = Number(q.get("offset"));
      vi.setSystemTime(Date.now() + 6000);
      return new Response(JSON.stringify(source.slice(offset, offset + Number(q.get("limit")))));
    });
    s.deps.readPage = t.read;
    await runBackupSlices(s.deps, input);
    expect(await s.checkpoint()).toMatchObject({ cursor: { ordered: false, from: 500, after: null } });
    s.deps.readPage = await t.renew();
    await runBackupSlices(s.deps, s.continuation());
    const requests = t.network.mock.calls.map(([url]) => new URL(url).searchParams);
    expect(requests.filter((q) => q.has("order"))).toHaveLength(1);
    expect(requests.slice(1).map((q) => q.get("offset"))).toEqual(["0", "250", "500"]);
    expect(requests.every((q) => !q.has("id"))).toBe(true);
    expect(await s.exported()).toEqual(source);
  });
});

describe("#202-d transporte: falhas, recuo e validação dos ids", () => {
  it.each([502, 503, 429, "network", "body"])("4: %s duas vezes e depois 200 entra na página em três chamadas com recuo 1/2 s", async (failure) => {
    const s = fixture(1), t = await transport();
    const times: number[] = [];
    t.network.mockImplementation(async () => {
      times.push(Date.now() - DAY);
      if (times.length === 3) return new Response(JSON.stringify(s.sorted));
      if (failure === "network") throw new TypeError("fetch failed");
      if (failure === "body") {
        const response = new Response();
        vi.spyOn(response, "text").mockRejectedValue(new TypeError("connection reset"));
        return response;
      }
      return new Response("Bad Gateway (cloudflare)", { status: Number(failure) });
    });
    s.deps.readPage = t.read;
    const pending = runBackupSlices(s.deps, input);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ continued: true, phase: "final" });
    expect(times).toEqual([0, 1000, 3000]);
    expect(t.network).toHaveBeenCalledTimes(3);
    expect(await s.exported()).toEqual(s.sorted);
  });

  it.each([502, "network"])("4: %s persistente desiste após quatro tentativas e o 202-c fecha error", async (failure) => {
    const s = fixture(), t = await transport();
    const times: number[] = [];
    t.network.mockImplementation(async () => {
      times.push(Date.now() - DAY);
      if (failure === "network") throw new TypeError("fetch failed");
      return new Response("Bad Gateway (cloudflare)", { status: Number(failure) });
    });
    s.deps.readPage = t.read;
    const pending = runBackupSlices(s.deps, input);
    await vi.runAllTimersAsync();
    const detail = `${failure === 502 ? "large: 502 Bad Gateway (cloudflare)" : "fetch failed"} após 4 tentativas`;
    expect(await pending).toMatchObject({ error: detail });
    expect(times).toEqual([0, 1000, 3000, 7000]);
    expect(t.network).toHaveBeenCalledTimes(4);
    expect(s.runs[0]).toMatchObject({ status: "error", error_text: `202-c: saída sem conclusão: ${detail}` });
    expect(s.runs[0].finished_at).toBeTruthy();
    expect(s.queues).toHaveLength(0);
  });

  it("4: 400 sem erro de coluna id falha imediatamente, sem recuo", async () => {
    const s = fixture(), t = await transport();
    t.network.mockResolvedValue(new Response("bad query", { status: 400 }));
    s.deps.readPage = t.read;
    expect(await runBackupSlices(s.deps, input)).toMatchObject({ error: "large: 400 bad query" });
    expect(t.network).toHaveBeenCalledTimes(1);
    expect(Date.now()).toBe(DAY);
    expect(s.runs[0].status).toBe("error");
  });

  it("4: prazo durante o recuo grava só a página já lida e a continuação repete a página pendente", async () => {
    const s = fixture(600), t = await transport();
    t.network.mockImplementation(async () => {
      if (t.network.mock.calls.length === 1) {
        vi.setSystemTime(DAY + 6000);
        return new Response(JSON.stringify(s.sorted.slice(0, 250)));
      }
      vi.setSystemTime(DAY + 78_500);
      return new Response("Bad Gateway", { status: 502 });
    });
    s.deps.readPage = t.read;
    const pending = runBackupSlices(s.deps, input);
    // Let the 1 s backoff start, then simulate a delayed timer waking after the page deadline.
    await vi.advanceTimersByTimeAsync(0);
    expect(t.network).toHaveBeenCalledTimes(2);
    vi.setSystemTime(DAY + 80_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ continued: true, phase: "tables" });
    expect(t.network).toHaveBeenCalledTimes(2);
    expect(await s.checkpoint()).toMatchObject({ version: 1, cursor: { after: uuid(250), from: 250, rows: 250 } });
    expect(await s.exported()).toEqual(s.sorted.slice(0, 250));
    expect(s.runs[0].status).toBe("running");
    s.deps.readPage = await t.renew();
    t.network.mockImplementation(async (url) => {
      const q = new URL(url).searchParams, after = q.get("id")!.slice(3);
      return new Response(JSON.stringify(s.sorted.filter((r) => r.id > after).slice(0, Number(q.get("limit")))));
    });
    await runBackupSlices(s.deps, s.continuation());
    expect(new URL(t.network.mock.calls[2][0]).searchParams.get("id")).toBe(`gt.${uuid(250)}`);
    expect(await s.exported()).toEqual(s.sorted);
    expect(await s.checkpoint()).toMatchObject({ rows_total: 600, phase: "final" });
  });

  it("4: recuo que já não cabe deixa tempo para checkpoint e não avança a chave", async () => {
    const s = fixture(), t = await transport();
    t.network.mockImplementation(async () => {
      vi.setSystemTime(DAY + 79_500);
      return new Response("Bad Gateway", { status: 502 });
    });
    s.deps.readPage = t.read;
    expect(await runBackupSlices(s.deps, input)).toMatchObject({ continued: true, phase: "tables" });
    expect(await s.checkpoint()).toMatchObject({ cursor: { from: 0, after: null, rows: 0 } });
    expect(Date.now()).toBeLessThan(DAY + 85_000);
    expect(t.network).toHaveBeenCalledTimes(1);
  });

  it("4: AbortError do prazo não repete e permite checkpoint", async () => {
    const s = fixture(), t = await transport();
    t.network.mockImplementation(async () => {
      vi.setSystemTime(DAY + 80_000);
      throw new DOMException("deadline", "AbortError");
    });
    s.deps.readPage = t.read;
    expect(await runBackupSlices(s.deps, input)).toMatchObject({ continued: true });
    expect(await s.checkpoint()).toMatchObject({ cursor: { from: 0, after: null } });
    expect(t.network).toHaveBeenCalledTimes(1);
    expect(s.runs[0].status).toBe("running");
  });

  it("4: AbortError alheio ao prazo falha sem repetição", async () => {
    fixture(); const t = await transport();
    t.network.mockRejectedValue(new DOMException("cancelled", "AbortError"));
    await expect(t.read(target, cursor(), null)).rejects.toThrow("cancelled");
    expect(t.network).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[{ label: "missing" }], null, "sem id"],
    [[{ id: null }], null, "sem id"],
    [[{ id: 9007199254740992 }], null, "sem id"],
    [[{ id: uuid(1) }, { id: uuid(1) }], null, "não estritamente crescente"],
    [[{ id: uuid(2) }, { id: uuid(1) }], null, "não estritamente crescente"],
    [[{ id: uuid(1) }], uuid(2), "não estritamente crescente"],
  ])("1: ids inválidos ou fora de ordem falham explicitamente (%s)", async (page, after, message) => {
    fixture(); const t = await transport();
    t.network.mockResolvedValue(new Response(JSON.stringify(page)));
    await expect(t.read(target, cursor({ after: after as string | null }), null)).rejects.toThrow(message as string);
    expect(t.network).toHaveBeenCalledTimes(1);
  });

  it("1: ids numéricos atravessam 9→10 e lastId é texto", async () => {
    fixture(); const t = await transport();
    t.network.mockResolvedValue(new Response('[{"id":9},{"id":10},{"id":11}]'));
    expect(await t.read(target, cursor({ after: "8" }), null)).toMatchObject({ rows: 3, lastId: "11", ordered: true });
  });

  it("1: chave é codificada uma vez e conserva os filtros de empresa/schema", async () => {
    fixture(); const t = await transport();
    const after = "a&b+% /?=ç";
    await t.read({ ...target, schema_name: "crm" }, cursor({ from: 500, after }), "company-fixture");
    const [url, init] = t.network.mock.calls[0], q = new URL(url).searchParams;
    expect(url).toContain(`id=gt.${encodeURIComponent(after)}`);
    expect(q.get("id")).toBe(`gt.${after}`);
    expect(q.get("company_id")).toBe("eq.company-fixture");
    expect(q.has("offset")).toBe(false);
    expect(init.headers["Accept-Profile"]).toBe("crm");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
