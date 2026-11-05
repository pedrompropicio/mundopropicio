// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { importBackupKey, openBackup, sealBackup, sha256Hex } from "../../supabase/functions/_shared/backup-crypto";
import { offsiteKey, runOffsite } from "../../supabase/functions/database-backup/offsite";
import type { R2Head } from "../../supabase/functions/_shared/r2";

const MiB = 1024 * 1024;
const PART = 8 * MiB;
const DAY = "2026-11-01"; // Sunday and first of month: all three GFS classes.
const FOLDER = "global/run";
const PATH = `${FOLDER}/manifest.json`;
const DAILY = offsiteKey("daily", DAY, FOLDER, "manifest.json");
const text = (s: string) => new TextEncoder().encode(s);
const suffix = (n: number) => `.part-${String(n).padStart(4, "0")}`;
type Row = Record<string, any>;
type Stored = { bytes: Uint8Array; meta: Record<string, string> };

// Generate each interval independently; the source need not allocate a complete file.
function sourceBytes(start: number, length: number) {
  const bytes = new Uint8Array(length);
  let offset = 0;
  while (offset < length) {
    const position = start + offset;
    const segment = Math.min(length - offset, PART - position % PART);
    const seed = Math.min(251, segment);
    for (let i = 0; i < seed; i++) bytes[offset + i] = ((position + i) * 17 + Math.floor(position / PART) * 29) % 251;
    for (let filled = seed; filled < segment; filled *= 2) {
      bytes.copyWithin(offset + filled, offset, offset + Math.min(filled, segment - filled));
    }
    offset += segment;
  }
  return bytes;
}

async function fixture(size = 40 * MiB, classes: "daily" | "all" = "daily") {
  const day = classes === "all" ? DAY : "2026-11-03";
  const daily = offsiteKey("daily", day, FOLDER, "manifest.json");
  let elapsed = 0;
  const rows: Row[] = [{ id: "source", run_date: day, scope: "global", status: "ok", folder_path: FOLDER }];
  const writes: Row[] = [];
  const from = () => {
    const filters: ((r: Row) => boolean)[] = [];
    let update: Row | undefined, insert: Row | undefined;
    let single = false, start = 0, end = Infinity;
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return q; },
      order: () => q,
      range: (a: number, b: number) => { start = a; end = b + 1; return q; },
      limit: (n: number) => { end = n; return q; },
      maybeSingle: () => { single = true; return q; },
      single: () => { single = true; return q; },
      insert: (value: Row) => { insert = value; return q; },
      update: (value: Row) => { update = value; return q; },
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(() => {
        if (insert) rows.push({ id: "offsite", started_at: `${day}T06:00:00Z`, ...structuredClone(insert) });
        const found = rows.filter((r) => filters.every((filter) => filter(r))).slice(start, end);
        const selected = insert ? [rows.at(-1)!] : found;
        if (update) for (const row of selected) { Object.assign(row, structuredClone(update)); writes.push(structuredClone(row)); }
        return { data: structuredClone(single ? selected[0] ?? null : selected), error: null };
      }).then(resolve, reject),
    };
    return q;
  };
  const sizes = new Map([[PATH, size]]);
  const list = vi.fn(async (folder: string) => ({ data: [...sizes].filter(([path]) => path.startsWith(`${folder}/`))
    .map(([path, bytes]) => ({ name: path.slice(folder.length + 1), id: path, metadata: { size: bytes } })), error: null }));
  const download = vi.fn(async (path: string) => ({ data: new Blob([sourceBytes(0, sizes.get(path)!)]), error: null }));
  const createSignedUrl = vi.fn(async (path: string, _seconds: number) => ({ data: { signedUrl: `https://storage.invalid/${path}` }, error: null }));
  const storage = { list, download, createSignedUrl };
  const ranges: string[] = [];
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("range")!;
    ranges.push(range);
    const match = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!match) throw new Error("Expected a bounded Range");
    const [, a, b] = match.map(Number);
    return new Response(sourceBytes(a, b - a + 1), { status: 206, headers: { "content-length": String(b - a + 1) } });
  });
  const objects = new Map<string, Stored>();
  const r2 = {
    probe: vi.fn(async () => ({ status: 200, code: null })),
    putObject: vi.fn(async (key: string, bytes: Uint8Array, meta: Record<string, string>) => {
      if (objects.has(key)) throw new Error("No overwrite");
      objects.set(key, { bytes: bytes.slice(), meta: { ...meta } });
    }),
    headObject: vi.fn(async (key: string): Promise<R2Head | null> => {
      const object = objects.get(key);
      return object ? { size: object.bytes.length, meta: { ...object.meta } } : null;
    }),
    getObject: vi.fn(async (key: string) => {
      if (!objects.has(key)) throw new Error(`Missing ${key}`);
      return objects.get(key)!.bytes.slice();
    }),
    copyObject: vi.fn(async (source: string, destination: string) => {
      if (objects.has(destination)) throw new Error("No overwrite");
      objects.set(destination, structuredClone(objects.get(source)!));
    }),
  };
  const key = await importBackupKey(btoa("x".repeat(32)));
  const deps = { db: { from, storage: { from: () => storage } }, r2, key, fetchImpl,
    now: () => new Date(new Date(`${day}T06:00:00Z`).getTime() + elapsed) };
  const run = (budgetMs = 60_000) => runOffsite(deps, { date: day, budgetMs });
  return { deps, run, rows, writes, sizes, storage, ranges, objects, r2, key, daily, day,
    advance: (ms: number) => { elapsed += ms; }, report: () => rows.at(-1)!.offsite_report };
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External network forbidden"); })); });
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("#202h bounded offsite parts", () => {
  it.each([20, 32])("C1: %i MiB retains the exact original single-object envelope", async (mb) => {
    const s = await fixture(mb * MiB);
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint8Array).fill(19);
      return array;
    });
    expect(await s.run()).toMatchObject({ status: "ok" });
    const expected = await sealBackup(sourceBytes(0, mb * MiB), s.key, new Uint8Array(12).fill(19));
    expect(Buffer.compare(Buffer.from(s.objects.get(s.daily)!.bytes), Buffer.from(expected))).toBe(0);
    expect(s.r2.putObject.mock.calls.map(([key]) => key)).toEqual([s.daily, `daily/${s.day}/_offsite-manifest.json.gz.enc`]);
    expect(s.storage.download).toHaveBeenCalledExactlyOnceWith(PATH);
    expect(s.deps.fetchImpl).not.toHaveBeenCalled();
    expect(s.storage.createSignedUrl).not.toHaveBeenCalled();
    expect(s.report().files[PATH]).not.toHaveProperty("chunked");
  });

  it("C2: 40 MiB uses five authenticated 8 MiB parts and a sealed index/tree, with no download", async () => {
    const s = await fixture();
    expect(await s.run()).toMatchObject({ status: "ok" });
    expect(s.storage.download).not.toHaveBeenCalled();
    expect(s.storage.createSignedUrl).toHaveBeenCalledExactlyOnceWith(PATH, 600);
    expect(s.ranges).toEqual(Array.from({ length: 5 }, (_, i) => `bytes=${i * PART}-${(i + 1) * PART - 1}`));
    expect(s.r2.putObject.mock.calls.map(([key]) => key)).toEqual([
      ...Array.from({ length: 5 }, (_, i) => s.daily + suffix(i + 1)), s.daily + ".index.json", `daily/${s.day}/_offsite-manifest.json.gz.enc`,
    ]);
    const parts: Uint8Array[] = [];
    const hashes: string[] = [];
    for (let n = 1; n <= 5; n++) {
      const stored = s.objects.get(s.daily + suffix(n))!;
      const plain = await openBackup(stored.bytes, s.key);
      parts.push(plain);
      hashes.push(await sha256Hex(plain));
      expect(stored.meta).toEqual({ part: String(n), of: "5", sha256: hashes[n - 1], "plain-bytes": String(PART), source: PATH });
    }
    const combined = Buffer.concat(parts);
    expect(Buffer.compare(combined, Buffer.from(sourceBytes(0, 40 * MiB)))).toBe(0);
    const tree = await sha256Hex(text(hashes.join("")));
    const index = JSON.parse(new TextDecoder().decode(await openBackup(s.objects.get(s.daily + ".index.json")!.bytes, s.key)));
    expect(index).toEqual({ version: 2, part_bytes: PART, total_bytes: 40 * MiB, sha256_tree: tree,
      parts: hashes.map((sha256, i) => ({ n: i + 1, sha256, plain_bytes: PART, enc_bytes: s.objects.get(s.daily + suffix(i + 1))!.bytes.length })) });
    expect(s.report().files[PATH]).toMatchObject({ chunked: true, parts_done: 5, sha256_tree: tree });
    const manifest = JSON.parse(new TextDecoder().decode(await openBackup(s.objects.get(`daily/${s.day}/_offsite-manifest.json.gz.enc`)!.bytes, s.key)));
    expect(manifest.files[PATH]).toMatchObject({ chunked: true, sha256_tree: tree });
  });

  it("C3: a deadline after part two resumes at part three without re-reading or re-sending completed parts", async () => {
    const s = await fixture();
    const put = s.r2.putObject.getMockImplementation()!;
    s.r2.putObject.mockImplementation(async (...args) => { await put(...args); if (args[0] === s.daily + suffix(2)) s.advance(60_000); });
    expect(await s.run()).toMatchObject({ continued: true });
    expect(s.report().files[PATH]).toMatchObject({ chunked: true, parts_done: 2, classes: [] });
    expect(s.ranges).toHaveLength(2);
    expect(await s.run()).toMatchObject({ status: "ok" });
    expect(s.ranges[2]).toBe(`bytes=${2 * PART}-${3 * PART - 1}`);
    expect(s.ranges).toHaveLength(5);
    for (const n of [1, 2]) expect(s.r2.putObject.mock.calls.filter(([key]) => key === s.daily + suffix(n))).toHaveLength(1);
  });

  it.each([false, true])("C3: an uncheckpointed part is accepted only with the same hash (collision=%s)", async (collision) => {
    const s = await fixture();
    const plain = sourceBytes(0, PART);
    const existing = { bytes: await sealBackup(plain, s.key), meta: { part: "1", of: "5",
      sha256: collision ? "wrong" : await sha256Hex(plain), "plain-bytes": String(PART), source: PATH } };
    s.objects.set(s.daily + suffix(1), existing);
    expect(await s.run()).toMatchObject({ status: collision ? "error" : "ok" });
    expect(s.r2.putObject.mock.calls.map(([key]) => key)).not.toContain(s.daily + suffix(1));
    expect(s.objects.get(s.daily + suffix(1))).toBe(existing);
    if (collision) expect(s.report().failures).toEqual([expect.stringContaining(`${PATH}: existe com hash diferente`)]);
  });

  it.each([false, true])("C3: an uncheckpointed index is accepted only with the same hash (collision=%s)", async (collision) => {
    const s = await fixture();
    const put = s.r2.putObject.getMockImplementation()!;
    s.r2.putObject.mockImplementation(async (...args) => { await put(...args); if (args[0] === s.daily + suffix(5)) s.advance(60_000); });
    expect(await s.run()).toMatchObject({ continued: true });
    const progress = s.report().files[PATH];
    const index = text(JSON.stringify({ version: 2, part_bytes: PART, total_bytes: 40 * MiB,
      parts: progress.parts, sha256_tree: await sha256Hex(text(progress.parts.map((part: any) => part.sha256).join(""))) }));
    s.objects.set(s.daily + ".index.json", { bytes: await sealBackup(index, s.key),
      meta: { sha256: collision ? "wrong" : await sha256Hex(index), "plain-bytes": String(index.length), source: PATH } });
    expect(await s.run()).toMatchObject({ status: collision ? "error" : "ok" });
    expect(s.ranges).toHaveLength(5);
    expect(s.r2.putObject.mock.calls.map(([key]) => key)).not.toContain(s.daily + ".index.json");
    if (collision) expect(s.report().failures).toEqual([expect.stringContaining("existe com hash diferente")]);
  });

  it("C4: weekly and monthly copy every part and index, checking each HEAD", async () => {
    const s = await fixture(40 * MiB, "all");
    expect(s.daily).toBe(DAILY);
    expect(await s.run()).toMatchObject({ status: "ok" });
    expect(s.r2.copyObject).toHaveBeenCalledTimes(12);
    for (const cls of ["weekly", "monthly"] as const) {
      for (const tail of [...Array.from({ length: 5 }, (_, i) => suffix(i + 1)), ".index.json"]) {
        const destination = offsiteKey(cls, DAY, FOLDER, "manifest.json") + tail;
        expect(s.r2.copyObject).toHaveBeenCalledWith(DAILY + tail, destination);
        expect(s.r2.headObject.mock.calls.filter(([key]) => key === destination)).toHaveLength(2);
        expect(s.objects.get(destination)).toEqual(s.objects.get(DAILY + tail));
      }
    }
    expect(s.report().files[PATH].classes).toEqual(["daily", "weekly", "monthly"]);
  });

  it("C4: copy checkpoints resume inside a class, including the index", async () => {
    const s = await fixture(40 * MiB, "all");
    const copy = s.r2.copyObject.getMockImplementation()!;
    s.r2.copyObject.mockImplementation(async (...args) => { await copy(...args); s.advance(60_000); });
    let result: any;
    for (let i = 0; i < 14; i++) { result = await s.run(); if (!result.continued) break; }
    expect(result).toMatchObject({ status: "ok" });
    expect(s.r2.copyObject).toHaveBeenCalledTimes(12);
    expect(s.ranges).toHaveLength(5);
  });

  it("C3/C4: zero budget advances one part, index or readback at a time and terminates", async () => {
    const s = await fixture();
    let result: any;
    for (let i = 0; i < 14; i++) { result = await s.run(0); if (!result.continued) break; }
    expect(result).toMatchObject({ status: "ok" });
    expect(s.ranges).toHaveLength(5);
    expect(s.r2.putObject).toHaveBeenCalledTimes(7);
    expect(s.report().sources[0].manifest_verified_at).toBeTruthy();
  });

  it.each(["daily-size", "daily-meta", "index", "gfs-size", "gfs-meta"])("C4: invalid HEAD %s fails the file", async (fault) => {
    const s = await fixture(40 * MiB, "all");
    const head = s.r2.headObject.getMockImplementation()!;
    s.r2.headObject.mockImplementation(async (key) => {
      const result = await head(key);
      const target = fault.startsWith("gfs") ? key.startsWith("weekly/") : fault === "index" ? key.endsWith(".index.json") : key.endsWith(suffix(1));
      if (result && target) return fault.endsWith("meta") ? { ...result, meta: { ...result.meta, source: "wrong" } } : { ...result, size: result.size + 1 };
      return result;
    });
    expect(await s.run()).toMatchObject({ status: "error" });
    expect(s.report().failures).toEqual([expect.stringContaining("HEAD não confirmou tamanho e metadados")]);
    expect(s.report().verified_at).toBeNull();
  });

  it.each(["200", "416", "short", "oversize", "header"])("C5: invalid Range %s fails the file and proceeds to the next", async (fault) => {
    const s = await fixture();
    s.sizes.set(`${FOLDER}/z-other.json`, 2);
    const cancel = vi.fn();
    s.deps.fetchImpl.mockImplementation(async () => {
      if (fault === "200" || fault === "416") return new Response(new ReadableStream({ cancel }), { status: Number(fault) });
      const bytes = fault === "short" ? PART - 1 : PART + 1;
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); }, cancel }),
        { status: 206, headers: fault === "header" ? { "content-length": "1" } : {} });
    });
    expect(await s.run()).toMatchObject({ status: "error" });
    expect(s.report().failures).toHaveLength(1);
    expect(s.report().failures[0]).toContain(`${PATH}: Storage Range:`);
    expect(s.report().files[`${FOLDER}/z-other.json`].classes).toEqual(["daily"]);
    expect(s.storage.download.mock.calls.map(([path]) => path)).toEqual([`${FOLDER}/z-other.json`]);
    expect(s.objects.has(s.daily + suffix(1))).toBe(false);
    expect(s.objects.has(`daily/${s.day}/_offsite-manifest.json.gz.enc`)).toBe(false);
    if (fault === "200" || fault === "416" || fault === "header") expect(cancel).toHaveBeenCalledOnce();
  });

  it("C2: the last interval can be shorter than 8 MiB", async () => {
    const s = await fixture(32 * MiB + 123);
    expect(await s.run()).toMatchObject({ status: "ok" });
    expect(s.ranges.at(-1)).toBe(`bytes=${32 * MiB}-${32 * MiB + 122}`);
    const last = await openBackup(s.objects.get(s.daily + suffix(5))!.bytes, s.key);
    expect(last.length).toBe(123);
    expect(Buffer.compare(Buffer.from(last), Buffer.from(sourceBytes(32 * MiB, 123)))).toBe(0);
    expect(s.report().files[PATH].parts[4].plain_bytes).toBe(123);
  });

  it("C2: absent list sizes use a signed HEAD before any download", async () => {
    const s = await fixture();
    s.storage.list.mockResolvedValue({ data: [{ name: "manifest.json", id: PATH }], error: null } as any);
    const rangedFetch = s.deps.fetchImpl.getMockImplementation()!;
    s.deps.fetchImpl.mockImplementation(async (url, init) => init?.method === "HEAD"
      ? new Response(null, { headers: { "content-length": String(40 * MiB) } }) : rangedFetch(url, init));
    expect(await s.run()).toMatchObject({ status: "ok" });
    expect(s.deps.fetchImpl.mock.calls[0][1]?.method).toBe("HEAD");
    expect(s.storage.download).not.toHaveBeenCalled();
    expect(s.ranges).toHaveLength(5);
  });
}, 30_000);
