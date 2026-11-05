// #202-c: resumable v4 table dumps. No runtime globals or credentials: all I/O is injected.
export interface Cursor {
  from: number; pageSize: number; ordered: boolean; partIndex: number; rows: number; bytes: number;
  after?: string | null; // Absent only on legacy checkpoints: finish that table by OFFSET.
}
export interface Progress {
  version: 1; run_id: string; seq: number; phase: "tables" | "final"; next_index: number;
  cursor: Cursor | null; tables: Record<string, number>; schemas: Record<string, string>;
  errors: string[]; parts: Record<string, number>; rows_total: number; bytes: number; heartbeat_at: string;
}
export interface Target { schema_name: string; tbl_name: string; has_company_id: boolean }
export interface Context { scope: "global" | "company"; companyId: string | null; slug: string; folder: string; runId: string }
export interface SliceInput {
  scope: Context["scope"]; companyId: string | null; slug: string; force: boolean;
  continuation?: { runId: string; folder: string; seq: number };
}
export interface Deps {
  db: any;
  closeDb?: any;
  now: () => number;
  readPage: (target: Target, cursor: Cursor, companyId: string | null) => Promise<{ text: string; rows: number; ordered: boolean }>;
  prepare: (scope: Context["scope"]) => Promise<Target[]>;
  final: (progress: Progress, context: Context) => Promise<{ fields: Record<string, unknown>; result: Record<string, unknown> } | undefined>;
  rotate: () => Promise<void>;
  sliceBudgetMs?: number;
}

function checked<T>(response: { data: T; error: any }, label: string): T {
  if (response.error) throw new Error(`${label}: ${response.error.message}`);
  return response.data;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const natural = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
export const progressPath = (folder: string) => `${folder}/_progress.json`;
export function markedRun(row: any): boolean {
  return typeof row.folder_path === "string" && row.file_name === progressPath(row.folder_path);
}
export function runningAction(row: any, progress: Progress | null, now: number, day: string) {
  if (!markedRun(row)) return "legacy";
  if (now - Date.parse(row.started_at) > 2 * 60 * 60 * 1000) return "abandoned";
  if (row.run_date === day && progress && now - Date.parse(progress.heartbeat_at) > 3 * 60 * 1000) return "resume";
  return "running";
}
export function parseProgress(value: unknown, runId: string): Progress {
  const p = value as Progress;
  const counts = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(natural);
  if (!p || p.version !== 1 || p.run_id !== runId || !natural(p.seq) || !natural(p.next_index) ||
      !["tables", "final"].includes(p.phase) || !counts(p.tables) || !counts(p.parts) ||
      !counts({ rows: p.rows_total, bytes: p.bytes }) || !Array.isArray(p.errors) || !p.errors.every((e) => typeof e === "string") ||
      !p.schemas || Array.isArray(p.schemas) || typeof p.schemas !== "object" || !Object.values(p.schemas).every((v) => typeof v === "string") ||
      !Number.isFinite(Date.parse(p.heartbeat_at)) ||
      (p.cursor !== null && (!p.cursor || !counts({ from: p.cursor.from, pageSize: p.cursor.pageSize,
        partIndex: p.cursor.partIndex, rows: p.cursor.rows, bytes: p.cursor.bytes }) ||
        p.cursor.pageSize < 1 || p.cursor.pageSize > 250 || p.cursor.partIndex < 1 || typeof p.cursor.ordered !== "boolean" ||
        (p.cursor.after !== undefined && p.cursor.after !== null && typeof p.cursor.after !== "string"))) ||
      (p.phase === "final" && p.cursor !== null)) throw new Error("_progress.json inválido");
  return p;
}
async function upload(db: any, path: string, blob: Blob) {
  checked(await db.storage.from("database-backups").upload(path, blob, { contentType: "application/json", upsert: true }), `upload ${path}`);
}

/** Flush before saving the offset. Counters for a table commit only when that table finishes. */
export async function dumpTable(deps: Deps, target: Target, context: Context, cursor: Cursor | null, expired: () => boolean) {
  const c: Cursor = cursor ? { ...cursor } : { from: 0, after: null, pageSize: 250, ordered: true, partIndex: 1, rows: 0, bytes: 0 };
  const key = target.schema_name === "public" ? target.tbl_name : `${target.schema_name}.${target.tbl_name}`;
  let chunks: string[] = [];
  let size = 0;
  const flush = async () => {
    if (!chunks.length) return;
    const blob = new Blob(["[", chunks.join(","), "]"], { type: "application/json" });
    const name = c.partIndex === 1 ? `${key}.json` : `${key}.part${c.partIndex}.json`;
    await upload(deps.db, `${context.folder}/${name}`, blob);
    c.bytes += blob.size;
    c.partIndex++;
    chunks = []; size = 0;
  };
  while (true) {
    if (expired()) { await flush(); return { done: false, cursor: c }; }
    let page: { text: string; rows: number; ordered: boolean; lastId?: string | null };
    try {
      page = await deps.readPage(target, { ...c }, context.companyId);
    } catch (error) {
      // The transport leaves time to flush/checkpoint; the failed page is read again next slice.
      if (error instanceof Error && error.name === "BackupPageDeadline") {
        await flush(); return { done: false, cursor: c };
      }
      throw error;
    }
    if (!natural(page.rows) || page.rows > c.pageSize) throw new Error(`${key}: contagem de página inválida`);
    c.ordered = page.ordered;
    if (page.rows) {
      if (!page.text.startsWith("[") || !page.text.endsWith("]")) throw new Error(`${key}: página inválida`);
      if (c.ordered && c.after !== undefined) {
        // Keep the injected legacy reader contract usable; production returns the validated lastId.
        const lastId = page.lastId === undefined ? JSON.parse(page.text)[page.rows - 1]?.id : page.lastId;
        if (typeof lastId !== "string" && (typeof lastId !== "number" || !Number.isSafeInteger(lastId))) {
          throw new Error(`${key}: último id da página inválido`);
        }
        c.after = String(lastId);
      }
      const chunk = page.text.slice(1, -1);
      chunks.push(chunk); size += chunk.length;
      c.rows += page.rows; c.from += page.rows;
      const full = page.rows === c.pageSize;
      if (chunk.length > 4_000_000 && c.pageSize > 20) c.pageSize = Math.max(20, Math.floor(c.pageSize / 5));
      if (size >= 4_000_000) await flush();
      // Even a short last page is checkpointed if the deadline has arrived.
      if (expired()) { await flush(); return { done: false, cursor: c }; }
      if (full) continue;
    }
    await flush();
    return { done: true, cursor: c };
  }
}

export async function runBackupSlices(deps: Deps, input: SliceInput): Promise<Record<string, unknown>> {
  const { db, now } = deps;
  const started = now();
  const day = new Date(started).toISOString().slice(0, 10);
  const expired = () => now() - started >= (deps.sliceBudgetMs ?? 12_000);
  let runId: string | null = null;
  let completed = false;
  let passed = false;
  let reason = "retorno sem conclusão";
  const close = async (id: string, fields: Record<string, unknown>) => {
    const data = checked(await (deps.closeDb ?? db).from("backup_runs").update({ ...fields, finished_at: new Date(now()).toISOString() })
      .eq("id", id).eq("status", "running").select("id").maybeSingle(), "backup_runs close");
    if (!data) throw new Error("backup_runs close: linha running ausente");
  };
  const load = async (row: any) => {
    const blob = checked<Blob>(await db.storage.from("database-backups").download(progressPath(row.folder_path)), "progress download");
    if (!blob) throw new Error("_progress.json ausente");
    return parseProgress(JSON.parse(await blob.text()), row.id);
  };
  try {
    let row: any;
    let progress: Progress | undefined;
    if (input.continuation) {
      const cont = input.continuation;
      row = checked(await db.from("backup_runs").select("*").eq("id", cont.runId).maybeSingle(), "backup_runs continuation");
      if (!row || row.status !== "running" || !markedRun(row) || row.folder_path !== cont.folder ||
          row.scope !== input.scope || row.company_id !== input.companyId) return { skipped: true, reason: "invalid continuation" };
      // Invalid stored state belongs to this run and must fail it. A stale seq never owns the run.
      try { progress = await load(row); } catch (error) { runId = row.id; throw error; }
      if (!natural(cont.seq) || cont.seq !== progress.seq) return { skipped: true, reason: "seq" };
      runId = row.id;
    } else {
      if (input.scope === "global") {
        const running = checked<any[]>(await db.from("backup_runs").select("*").eq("scope", "global")
          .eq("status", "running").order("started_at", { ascending: false }), "backup_runs running") ?? [];
        // Close every marked abandoned run, even if a newer run is still healthy.
        const active: any[] = [];
        for (const candidate of running) {
          const action = runningAction(candidate, null, now(), day);
          if (action === "legacy") continue;
          if (action === "abandoned") {
            await close(candidate.id, { status: "error", error_text: "202-c: saída sem conclusão: abandonada (> 2 h)" });
          } else active.push(candidate);
        }
        for (const candidate of active) {
          try { progress = await load(candidate); } catch (error) { runId = candidate.id; throw error; }
          if (runningAction(candidate, progress, now(), day) !== "resume") return { skipped: true, reason: "running" };
          row = candidate; runId = row.id;
          break;
        }
      }
      if (!row) {
        let q = db.from("backup_runs").select("id, file_name, folder_path").eq("run_date", day).eq("scope", input.scope).eq("status", "ok");
        q = input.companyId ? q.eq("company_id", input.companyId) : q.is("company_id", null);
        if (!input.force) {
          const already = checked<{ file_name: string | null; folder_path: string | null } | null>(await q.maybeSingle(), "backup_runs already");
          if (already) return { skipped: true, reason: "already ok today", scope: input.scope,
            slug: input.slug, date: day, file: already.file_name, folder: already.folder_path };
        } else {
          let u = db.from("backup_runs").update({ status: "superseded" }).eq("run_date", day).eq("scope", input.scope).eq("status", "ok");
          u = input.companyId ? u.eq("company_id", input.companyId) : u.is("company_id", null);
          checked(await u, "backup_runs supersede");
        }
        const ts = new Date(now()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const folder = `${input.slug}/${ts}`;
        row = checked(await db.from("backup_runs").insert({ run_date: day, scope: input.scope, company_id: input.companyId,
          slug: input.slug, status: "running", folder_path: folder, file_name: progressPath(folder) }).select("*").single(), "backup_runs insert");
        if (!row?.id) throw new Error("backup_runs insert: id ausente");
        runId = row.id;
        progress = { version: 1, run_id: runId!, seq: 0, phase: "tables", next_index: 0, cursor: null,
          tables: {}, schemas: {}, errors: [], parts: {}, rows_total: 0, bytes: 0, heartbeat_at: new Date(now()).toISOString() };
        await upload(db, progressPath(folder), new Blob([JSON.stringify(progress)], { type: "application/json" }));
      }
    }
    const p = progress!;
    const context: Context = { scope: input.scope, companyId: input.companyId, slug: input.slug, folder: row.folder_path, runId: runId! };
    const targets = (await deps.prepare(input.scope)).sort((a, b) => `${a.schema_name}.${a.tbl_name}`.localeCompare(`${b.schema_name}.${b.tbl_name}`));
    if (p.next_index > targets.length || (p.cursor && p.next_index === targets.length)) throw new Error("cursor fora do inventário");
    const handoff = async () => {
      p.seq++; p.heartbeat_at = new Date(now()).toISOString();
      await upload(db, progressPath(context.folder), new Blob([JSON.stringify(p)], { type: "application/json" }));
      const receipt = checked(await db.rpc("backup_enqueue_slice", { p_body: { run_id: runId, folder: context.folder, seq: p.seq, force: true,
        ...(input.scope === "global" ? { target: "global" } : { company_id: input.companyId }) } }), "backup_enqueue_slice");
      if (!receipt || !Number.isFinite(Number(receipt))) throw new Error("backup_enqueue_slice: confirmação ausente");
      passed = true;
      return { continued: true, run_id: runId, folder: context.folder, seq: p.seq, phase: p.phase, next_index: p.next_index };
    };
    if (p.phase === "tables") {
      for (; p.next_index < targets.length; p.next_index++) {
        const target = targets[p.next_index];
        const key = target.schema_name === "public" ? target.tbl_name : `${target.schema_name}.${target.tbl_name}`;
        const dumped = await dumpTable(deps, target, context, p.cursor, expired);
        p.cursor = dumped.cursor;
        if (!dumped.done) return await handoff();
        p.tables[key] = p.cursor.rows; p.schemas[key] = target.schema_name;
        if (p.cursor.partIndex > 2) p.parts[key] = p.cursor.partIndex - 1;
        p.rows_total += p.cursor.rows; p.bytes += p.cursor.bytes; p.cursor = null;
      }
      p.phase = "final";
      return await handoff(); // Always a fresh invocation for manifests, infra and identities.
    }
    if (p.errors.length) throw new Error(p.errors.join(" | "));
    const final = await deps.final(p, context);
    if (!final) return { error: "finalização sem resultado" }; // finally closes every incomplete exit.
    await close(runId!, { ...final.fields, status: "ok" });
    completed = true;
    // Best effort, after the confirmed close. Rotation can never keep a completed run running.
    if (input.scope === "global") {
      try { await deps.rotate(); } catch { /* bounded maintenance must not invalidate the backup */ }
    }
    return final.result;
  } catch (error) {
    reason = message(error);
    return { error: reason, run_id: runId };
  } finally {
    if (runId && !completed && !passed) {
      await close(runId, { status: "error", error_text: `202-c: saída sem conclusão: ${reason}`.slice(0, 4000) });
    }
  }
}
