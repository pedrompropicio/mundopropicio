// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { importBackupKey, openBackup, sealBackup, sha256Hex } from "../../supabase/functions/_shared/backup-crypto";
import { createR2Client, signV4 } from "../../supabase/functions/_shared/r2";
import { gfsClasses, offsiteKey, runOffsite, runOffsiteFromEnv } from "../../supabase/functions/database-backup/offsite";

const text = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const NOW = new Date("2026-11-03T06:00:00.000Z");
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(17)));

type Row = Record<string, any>;
function fakeDb(initial?: Row[]) {
  const rows = initial ?? [
    { id: "1", run_date: "2026-11-03", scope: "global", status: "ok", folder_path: "global/run" },
    { id: "2", run_date: "2026-11-03", scope: "company", status: "ok", folder_path: "mp/run" },
  ];
  const originals = new Map([
    ["global/run/infra.json", text('{"crons":[]}')],
    ["global/run/manifest.json", text('{"scope":"global"}')],
    ["mp/run/manifest.json", text('{"scope":"company"}')],
  ]);
  const writes: Row[] = [];
  const reads: { offset: number; end: number }[] = [];
  const from = vi.fn((table: string) => {
    expect(table).toBe("backup_runs");
    const filters: ((r: Row) => boolean)[] = [];
    let change: Row | undefined;
    let insertion: Row | undefined;
    let start = 0, end = Infinity, single = false;
    let ordering: { key: string; ascending: boolean } | undefined;
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return q; },
      order: (key: string, options?: { ascending?: boolean }) => { ordering = { key, ascending: options?.ascending !== false }; return q; },
      range: (a: number, b: number) => { start = a; end = b + 1; reads.push({ offset: a, end: b }); return q; },
      limit: (n: number) => { end = n; return q; },
      maybeSingle: () => { single = true; return q; },
      single: () => { single = true; return q; },
      insert: (r: Row) => { insertion = r; return q; },
      update: (r: Row) => { change = r; return q; },
      then: (resolve: (v: unknown) => unknown, reject: (v: unknown) => unknown) => {
        try {
          if (insertion) {
            const row = { id: `offsite-${writes.length}`, started_at: NOW.toISOString(), ...structuredClone(insertion) };
            rows.push(row); writes.push(structuredClone(row));
            return Promise.resolve(resolve({ data: single ? row : [row], error: null }));
          }
          let found = rows.filter((r) => filters.every((f) => f(r)));
          if (ordering) {
            const { key, ascending } = ordering;
            found.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
          }
          found = found.slice(start, end);
          if (change) for (const r of found) { Object.assign(r, structuredClone(change)); writes.push(structuredClone(r)); }
          return Promise.resolve(resolve({ data: structuredClone(single ? found[0] ?? null : found), error: null }));
        } catch (error) { return Promise.resolve(reject(error)); }
      },
    };
    return q;
  });
  const list = vi.fn(async (folder: string, { offset, limit }: { offset: number; limit: number }) => ({
    data: [...originals.keys()].filter((p) => p.startsWith(`${folder}/`))
      .map((p) => ({ name: p.slice(folder.length + 1), id: p })).sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit),
    error: null,
  }));
  const download = vi.fn(async (path: string) => ({
    data: originals.has(path) ? new Blob([new Uint8Array(originals.get(path)!)]) : null,
    error: originals.has(path) ? null : { message: "ficheiro desaparecido" },
  }));
  const storageFrom = vi.fn((bucket: string) => { expect(bucket).toBe("database-backups"); return { list, download }; });
  return { db: { from, storage: { from: storageFrom } }, rows, originals, writes, reads, list, download };
}

type Stored = { bytes: Uint8Array; meta: Record<string, string> };
function fakeR2() {
  const objects = new Map<string, Stored>();
  const puts: string[] = [], copies: string[] = [], gets: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.host).toBe("acc.eu.r2.cloudflarestorage.com");
    expect(url.pathname.startsWith("/bkt/")).toBe(true);
    const key = decodeURIComponent(url.pathname.slice(5));
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toContain("/auto/s3/aws4_request");
    const object = objects.get(key);
    if (init?.method === "HEAD") return object
      ? new Response(null, { status: 200, headers: { "content-length": String(object.bytes.length),
        ...Object.fromEntries(Object.entries(object.meta).map(([k, v]) => [`x-amz-meta-${k}`, v])) } })
      : new Response(null, { status: 404 });
    if (init?.method === "GET") {
      gets.push(key);
      return object ? new Response(new Uint8Array(object.bytes)) : new Response("missing", { status: 404 });
    }
    expect(init?.method).toBe("PUT");
    expect(headers.get("if-none-match")).toBe("*");
    if (object) return new Response("cannot overwrite", { status: 412 });
    if (headers.has("x-amz-copy-source")) {
      const src = decodeURIComponent(headers.get("x-amz-copy-source")!.slice(5));
      expect(objects.has(src)).toBe(true);
      objects.set(key, structuredClone(objects.get(src)!));
      copies.push(key);
      return new Response("<CopyObjectResult/>");
    }
    const bytes = new Uint8Array(init!.body as Uint8Array);
    expect(headers.get("x-amz-content-sha256")).toBe(await sha256Hex(bytes));
    const meta: Record<string, string> = {};
    headers.forEach((v, k) => { if (k.startsWith("x-amz-meta-")) meta[k.slice(11)] = v; });
    objects.set(key, { bytes, meta }); puts.push(key);
    return new Response(null, { status: 200 });
  });
  const client = createR2Client({ accountId: "acc", accessKeyId: "fixture", secretAccessKey: "fixture-secret",
    bucket: "bkt", fetchImpl, now: () => NOW });
  return { objects, puts, copies, gets, fetchImpl, client };
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede proibida no teste #202"); })); });
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("#202 SigV4 e envelope de backup", () => {
  it("reproduz o vector oficial AWS S3 GET Object sem alterar a assinatura esperada", async () => {
    const signed = await signV4({ method: "GET", url: "https://examplebucket.s3.amazonaws.com/test.txt",
      headers: { Range: "bytes=0-9" }, payloadHash: EMPTY_HASH }, {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1", service: "s3",
    }, "20130524T000000Z");
    expect(signed.authorization).toContain("SignedHeaders=host;range;x-amz-content-sha256;x-amz-date");
    expect(signed.authorization).toContain("Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    expect(Object.keys(signed)).toEqual(Object.keys(signed).sort());
    expect(signed["x-amz-date"]).toBe("20130524T000000Z");
    expect(signed["x-amz-content-sha256"]).toBe(EMPTY_HASH);
    expect(signed.host).toBe("examplebucket.s3.amazonaws.com");
  });
  it("ordena query por chave/valor codificados e normaliza cabeçalhos", async () => {
    const credentials = { accessKeyId: "id", secretAccessKey: "secret", region: "auto", service: "s3" };
    const sign = (url: string, headers: HeadersInit) => signV4({ method: "GET", url, headers, payloadHash: EMPTY_HASH }, credentials, "20130524T000000Z");
    expect(await sign("https://x/a%20b/%C3%A7%24.json?z=2&a=two+words&a=%21", { RANGE: " bytes=0-9  ", "X-Test": "a   b" }))
      .toEqual(await sign("https://x/a%20b/%C3%A7%24.json?a=%21&a=two%20words&z=2", { range: "bytes=0-9", "x-test": "a b" }));
  });
  it("calcula SHA-256, exige 32 bytes e autentica conteúdo e chave", async () => {
    expect(await sha256Hex(text("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    for (const invalid of ["%%%", "", btoa("31"), btoa("x".repeat(33))]) {
      await expect(importBackupKey(invalid)).rejects.toThrow("BACKUP_R2_ENC_KEY tem de ter 32 bytes");
    }
    const key = await importBackupKey(KEY);
    const plain = text('backup ç\n'.repeat(500));
    const iv = new Uint8Array(12).fill(9);
    const sealed = await sealBackup(plain, key, iv);
    expect(sealed.slice(0, 12)).toEqual(iv);
    expect(sealed.length).toBeLessThan(plain.length);
    expect(await openBackup(sealed, key)).toEqual(plain);
    const tampered = sealed.slice(); tampered[tampered.length - 1] ^= 1;
    await expect(openBackup(tampered, key)).rejects.toThrow();
    await expect(openBackup(sealed, await importBackupKey(btoa("x".repeat(32))))).rejects.toThrow();
    await expect(openBackup(new Uint8Array(27), key)).rejects.toThrow("truncado");
    await expect(sealBackup(plain, key, new Uint8Array(11))).rejects.toThrow("12 bytes");
    expect(await sealBackup(plain, key)).not.toEqual(await sealBackup(plain, key));
  });
  it("usa o endpoint UE, codifica os segmentos RFC3986 e copia com origem codificada", async () => {
    const r2 = fakeR2();
    await r2.client.putObject("a b/ç$.json", text("abc"), { sha256: "hash" });
    expect(new URL(String(r2.fetchImpl.mock.calls[0][0])).pathname).toBe("/bkt/a%20b/%C3%A7%24.json");
    expect(await r2.client.headObject("missing")).toBeNull();
    expect(await r2.client.headObject("a b/ç$.json")).toEqual({ size: 3, meta: { sha256: "hash" } });
    expect(await r2.client.getObject("a b/ç$.json")).toEqual(text("abc"));
    await r2.client.copyObject("a b/ç$.json", "copy");
    const call = r2.fetchImpl.mock.calls.at(-1)!;
    expect(new Headers(call[1]!.headers).get("x-amz-copy-source")).toBe("/bkt/a%20b/%C3%A7%24.json");
    expect(await r2.client.getObject("copy")).toEqual(text("abc"));
  });
  it("limita erros HTTP a 200 caracteres e não aceita erros COPY dentro de 200", async () => {
    const fetchImpl = vi.fn(async () => new Response("x".repeat(300), { status: 403 }));
    const client = createR2Client({ accountId: "acc", accessKeyId: "id", secretAccessKey: "secret", bucket: "bkt", fetchImpl });
    await expect(client.putObject("x", text("x"), {})).rejects.toThrow(`R2 PUT 403: ${"x".repeat(200)}`);
    await expect(client.getObject("x")).rejects.toThrow(/^R2 GET 403: x{200}$/);
    await expect(client.headObject("x")).rejects.toThrow(/^R2 HEAD 403 \(sem código\)$/);
    await expect(client.copyObject("x", "y")).rejects.toThrow(/^R2 COPY 403: x{200}$/);
    fetchImpl.mockImplementation(async () => new Response("<Error><Code>Denied</Code></Error>"));
    await expect(client.copyObject("x", "y")).rejects.toThrow("R2 COPY 200");
  });
});

async function setup(initial?: Row[]) {
  const db = fakeDb(initial);
  const r2 = fakeR2();
  const key = await importBackupKey(KEY);
  const deps = { db: db.db, r2: r2.client, key, now: () => NOW };
  return { ...db, r2, key, deps };
}

describe("#202 offsite diário retomável e isolado do dump", () => {
  it("calcula classes UTC e chaves datadas", () => {
    expect(gfsClasses("2026-11-03")).toEqual(["daily"]);
    expect(gfsClasses("2026-11-08")).toEqual(["daily", "weekly"]);
    expect(gfsClasses("2026-11-01")).toEqual(["daily", "weekly", "monthly"]);
    expect(gfsClasses("2026-12-01")).toEqual(["daily", "monthly"]);
    expect(() => gfsClasses("2026-02-30")).toThrow();
    expect(offsiteKey("weekly", "2026-11-08", "global/run", "manifest.json")).toBe("weekly/2026-11-08/global/run/manifest.json.gz.enc");
  });
  it("2 fontes/3 ficheiros fecham ok com 3 PUT + manifesto e readback encriptado", async () => {
    const s = await setup();
    const originals = structuredClone(s.rows);
    expect(await runOffsite(s.deps)).toMatchObject({ status: "ok" });
    expect(s.r2.puts).toHaveLength(4);
    expect(s.r2.copies).toHaveLength(0);
    const run = s.rows.find((r) => r.scope === "offsite")!;
    expect(run).toMatchObject({ status: "ok", folder_path: "daily/2026-11-03", slug: "offsite",
      tables_count: 2, rows_total: 3, finished_at: NOW.toISOString(), error_text: null });
    expect(run.offsite_report).toMatchObject({ gfs: ["daily"], failures: [], verified_at: NOW.toISOString() });
    expect(s.rows.slice(0, 2)).toEqual(originals);
    expect(run.bytes).toBe(Object.values(run.offsite_report.files).reduce((n: number, f: any) => n + f.enc_bytes, 0));
    for (const [path, plain] of s.originals) {
      const object = s.r2.objects.get(`daily/2026-11-03/${path}.gz.enc`)!;
      expect(await openBackup(object.bytes, s.key)).toEqual(plain);
      expect(object.meta).toEqual({ sha256: await sha256Hex(plain), "plain-bytes": String(plain.length), source: path });
      expect(run.offsite_report.files[path]).toMatchObject({ sha256: await sha256Hex(plain), bytes: plain.length, enc_bytes: object.bytes.length, classes: ["daily"] });
    }
    const manifest = JSON.parse(decode(await openBackup(s.r2.objects.get("daily/2026-11-03/_offsite-manifest.json.gz.enc")!.bytes, s.key)));
    expect(manifest.files).toEqual(run.offsite_report.files);
    expect(manifest.sources).toHaveLength(2);
    expect(s.r2.gets).toEqual(["daily/2026-11-03/global/run/manifest.json.gz.enc", "daily/2026-11-03/mp/run/manifest.json.gz.enc", "daily/2026-11-03/_offsite-manifest.json.gz.enc"]);
    const writes = s.writes.length;
    expect(await runOffsite(s.deps)).toMatchObject({ skipped: true });
    expect(s.writes).toHaveLength(writes);
    expect(s.r2.puts).toHaveLength(4);
  });
  it("faz weekly/monthly por COPY e confirma os objetos sem PUT adicional", async () => {
    const s = await setup();
    for (const row of s.rows) row.run_date = "2026-11-01";
    expect(await runOffsite(s.deps, { date: "2026-11-01" })).toMatchObject({ status: "ok" });
    expect(s.r2.puts).toHaveLength(4);
    expect(s.r2.copies).toHaveLength(6);
    for (const cls of ["daily", "weekly", "monthly"]) expect(s.r2.objects.has(`${cls}/2026-11-01/mp/run/manifest.json.gz.enc`)).toBe(true);
    const report = s.rows.at(-1)!.offsite_report;
    expect(Object.values(report.files).every((f: any) => f.classes.join() === "daily,weekly,monthly")).toBe(true);
  });
  it("budgetMs=0 guarda progresso e termina nas invocações seguintes sem repetir PUT", async () => {
    const s = await setup();
    expect(await runOffsite(s.deps, { budgetMs: 0 })).toMatchObject({ continued: true });
    expect(s.r2.puts).toHaveLength(1);
    expect(s.rows.at(-1)!.status).toBe("running");
    expect(Object.keys(s.rows.at(-1)!.offsite_report.files)).toHaveLength(1);
    let result: any;
    for (let i = 0; i < 8; i++) { result = await runOffsite(s.deps, { budgetMs: 0 }); if (!result.continued) break; }
    expect(result).toMatchObject({ status: "ok" });
    expect(s.rows.filter((r) => r.scope === "offsite")).toHaveLength(1);
    expect(s.r2.puts).toHaveLength(4);
    expect(new Set(s.r2.puts).size).toBe(4);
    expect(s.download).toHaveBeenCalledTimes(3);
  });
  it("reconhece um PUT anterior ao checkpoint por HEAD com hash igual", async () => {
    const s = await setup();
    const path = "global/run/infra.json";
    const plain = s.originals.get(path)!;
    s.r2.objects.set(`daily/2026-11-03/${path}.gz.enc`, { bytes: await sealBackup(plain, s.key),
      meta: { sha256: await sha256Hex(plain), "plain-bytes": String(plain.length), source: path } });
    expect(await runOffsite(s.deps)).toMatchObject({ status: "ok" });
    expect(s.r2.puts).toHaveLength(3);
    expect(s.r2.puts).not.toContain(`daily/2026-11-03/${path}.gz.enc`);
  });
  it("hash diferente fecha error sem PUT nem sobrescrita e sem alterar o dump", async () => {
    const s = await setup([{ id: "1", run_date: "2026-11-03", scope: "global", status: "ok", folder_path: "global/run" }]);
    s.originals.delete("global/run/infra.json");
    const collision = "daily/2026-11-03/global/run/manifest.json.gz.enc";
    const existing = { bytes: new Uint8Array(28), meta: { sha256: "different" } };
    s.r2.objects.set(collision, existing);
    expect(await runOffsite(s.deps)).toMatchObject({ status: "error" });
    expect(s.r2.puts).toEqual([]);
    expect(s.rows.at(-1)!.error_text).toContain("existe com hash diferente — não sobrescrever");
    expect(s.rows[0].status).toBe("ok");
    expect(s.r2.objects.get(collision)).toBe(existing);
  });
  it("recusa hash diferente em weekly sem COPY nem sobrescrita", async () => {
    const s = await setup();
    for (const row of s.rows) row.run_date = "2026-11-08";
    s.r2.objects.set("weekly/2026-11-08/global/run/infra.json.gz.enc", { bytes: new Uint8Array(28), meta: { sha256: "different" } });
    expect(await runOffsite(s.deps, { date: "2026-11-08" })).toMatchObject({ status: "error" });
    expect(s.r2.copies).not.toContain("weekly/2026-11-08/global/run/infra.json.gz.enc");
    expect(s.rows.at(-1)!.error_text).toContain("não sobrescrever");
  });
  it("sem global ok ou com dump recente running não escreve nada", async () => {
    const s = await setup();
    s.rows[0].status = "error";
    expect(await runOffsite(s.deps)).toMatchObject({ skipped: true, reason: "no global ok" });
    s.rows[0].status = "ok";
    s.rows.push({ id: "3", run_date: "2026-11-03", scope: "company", status: "running", started_at: "2026-11-03T05:00:00Z" });
    expect(await runOffsite(s.deps)).toMatchObject({ waiting: true });
    expect(s.writes).toEqual([]);
    expect(s.r2.fetchImpl).not.toHaveBeenCalled();
    s.rows.at(-1)!.started_at = "2026-11-02T23:59:59Z";
    expect(await runOffsite(s.deps)).toMatchObject({ status: "ok" });
  });
  it("pagina os ficheiros para além de 1000 antes de declarar a lista completa", async () => {
    const s = await setup();
    for (let i = 0; i < 1000; i++) s.originals.set(`global/run/a${String(i).padStart(4, "0")}.json`, text("[]"));
    expect(await runOffsite(s.deps, { budgetMs: 0 })).toMatchObject({ continued: true });
    expect(s.list.mock.calls.filter(([folder]) => folder === "global/run").map(([, options]) => options.offset)).toEqual([0, 1000]);
    expect(s.r2.puts).toHaveLength(1);
  });
  it("readback adulterado e falha de HEAD dão error e não declaram verificação", async () => {
    const s = await setup();
    const actualGet = s.deps.r2.getObject;
    s.deps.r2.getObject = async (path) => path.includes("global/run/manifest.json")
      ? new Uint8Array(30) : actualGet(path);
    expect(await runOffsite(s.deps)).toMatchObject({ status: "error" });
    expect(s.rows.at(-1)!.offsite_report.verified_at).toBeNull();
    expect(s.r2.puts).toHaveLength(3);
    const other = await setup();
    const actualHead = other.deps.r2.headObject;
    other.deps.r2.headObject = async (path) => {
      const head = await actualHead(path);
      return head ? { ...head, size: head.size + 1 } : null;
    };
    expect(await runOffsite(other.deps)).toMatchObject({ status: "error" });
    expect(other.rows.at(-1)!.error_text).toContain("HEAD não confirmou");
  });
  it("falha persistida com budget zero termina, sem recusar a conclusão para sempre", async () => {
    const s = await setup();
    s.deps.r2.putObject = async () => { throw new Error("write denied"); };
    let result: any;
    for (let i = 0; i < 8; i++) { result = await runOffsite(s.deps, { budgetMs: 0 }); if (!result.continued) break; }
    expect(result).toMatchObject({ status: "error" });
    expect(s.rows.at(-1)!.error_text.length).toBeLessThanOrEqual(4000);
    expect(s.rows[0].status).toBe("ok");
  });
  it("sem manifesto, erro de listagem ou falha da base não produz um ok incompleto", async () => {
    const s = await setup();
    s.originals.delete("global/run/manifest.json");
    expect(await runOffsite(s.deps)).toMatchObject({ status: "error" });
    expect(s.rows.at(-1)!.error_text).toContain("sem manifest.json");
    expect(s.r2.puts).toHaveLength(0);
    const broken = await setup();
    broken.list.mockImplementation(async () => ({ data: null, error: { message: "list failed" } }));
    expect(await runOffsite(broken.deps)).toMatchObject({ status: "error" });
    const noDb = await setup();
    noDb.db.from.mockImplementation(() => { throw new Error("db unavailable"); });
    await expect(runOffsite(noDb.deps)).rejects.toThrow("db unavailable");
    expect(noDb.writes).toHaveLength(0);
  });
  it("segredos ausentes devolvem só nomes e datas inválidas não acedem à base", async () => {
    const s = await setup();
    expect(await runOffsiteFromEnv(s.db, {}, () => undefined)).toEqual({ error: "Configuração offsite incompleta", missing: [
      "BACKUP_R2_ACCOUNT_ID", "BACKUP_R2_ACCESS_KEY_ID", "BACKUP_R2_SECRET_ACCESS_KEY", "BACKUP_R2_BUCKET", "BACKUP_R2_ENC_KEY",
    ] });
    const getEnv = vi.fn(() => "fixture");
    for (const date of ["03/11/2026", "2026-13-01", "2026-11-31", 1, null, "2026-11-03;SQL"]) {
      expect(await runOffsiteFromEnv(s.db, { date }, getEnv)).toHaveProperty("error");
    }
    expect(getEnv).not.toHaveBeenCalled();
    expect(s.db.from).not.toHaveBeenCalled();
    expect(s.writes).toEqual([]);
  });
  it("o ramo offsite exige isSr antes da janela, sem alterar as operações do dump", () => {
    const code = readFileSync("supabase/functions/database-backup/index.ts", "utf8");
    const branch = code.slice(code.indexOf('if (body?.target === "offsite")'), code.indexOf("// Janela 02:00-05:00"));
    expect(branch).toContain('if (!isSr) return json({ error: "Apenas service role" }, 403)');
    expect(branch).toContain('await import("./offsite.ts")');
    expect(branch).toContain("runOffsiteFromEnv(adminClient, body, (n) => Deno.env.get(n))");
    expect(code).toContain("slice(30)");
    expect(readFileSync("supabase/functions/_shared/r2.ts", "utf8")).not.toMatch(/Deno|npm:|\bDELETE\b/);
  });
});
