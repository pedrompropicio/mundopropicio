import { importBackupKey, openBackup, sealBackup, sha256Hex } from "../_shared/backup-crypto.ts";
import { createR2Client, type R2Head } from "../_shared/r2.ts";

type GfsClass = "daily" | "weekly" | "monthly";
type FileProgress = { sha256: string; bytes: number; enc_bytes: number; classes: GfsClass[] };
type Source = { id: string; scope: string; folder_path: string; manifest_verified_at?: string };
type Report = {
  gfs: GfsClass[]; sources: Source[]; files: Record<string, FileProgress>;
  failures: string[]; verified_at: string | null;
};
// Structural boundary: the service-role Supabase client and credential-free test doubles.
export type OffsiteDb = {
  from(table: "backup_runs"): any;
  storage: { from(bucket: string): {
    list(folder: string, options: { limit: number; offset: number; sortBy: { column: string; order: string } }): PromiseLike<{
      data: { name: string; id?: string | null }[] | null; error: { message: string } | null;
    }>;
    download(path: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
  } };
};
type Deps = { db: OffsiteDb; r2: ReturnType<typeof createR2Client>; key: CryptoKey; now: () => Date };
const PAGE = 1000;

function utcDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date tem de ser YYYY-MM-DD");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("date inválida");
  return date;
}

export function gfsClasses(day: string): GfsClass[] {
  const date = utcDate(day);
  return ["daily", ...(date.getUTCDay() === 0 ? ["weekly" as const] : []),
    ...(date.getUTCDate() === 1 ? ["monthly" as const] : [])];
}

export function offsiteKey(cls: GfsClass, day: string, folderPath: string, file: string) {
  return `${cls}/${day}/${folderPath}/${file}.gz.enc`;
}

function checked<T>(result: { data: T; error: { message: string } | null }, operation: string): T {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
}

function sameHash(head: R2Head, hash: string) {
  if (head.meta.sha256 !== hash) throw new Error("existe com hash diferente — não sobrescrever");
}

function verifyHead(head: R2Head | null, size: number, meta: Record<string, string>) {
  if (!head || head.size !== size || Object.entries(meta).some(([k, v]) => head.meta[k] !== v)) {
    throw new Error("HEAD não confirmou tamanho e metadados");
  }
}

export async function runOffsite({ db, r2, key, now }: Deps, { date, budgetMs = 60_000 }: { date?: string; budgetMs?: number } = {}) {
  const started = now();
  const day = date ?? started.toISOString().slice(0, 10);
  const gfs = gfsClasses(day);
  const already = checked<any>(await db.from("backup_runs").select("id").eq("scope", "offsite")
    .eq("run_date", day).eq("status", "ok").maybeSingle(), "offsite lookup");
  if (already) return { skipped: true, reason: "already ok", date: day };

  const sourceRows: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = checked<any[]>(await db.from("backup_runs").select("id, scope, folder_path, status, started_at")
      .eq("run_date", day).in("scope", ["global", "company"]).in("status", ["ok", "running"])
      .order("id").range(offset, offset + PAGE - 1), "backup sources");
    sourceRows.push(...page);
    if (page.length < PAGE) break;
  }
  if (!sourceRows.some((s) => s.scope === "global" && s.status === "ok")) {
    return { skipped: true, reason: "no global ok", date: day };
  }
  if (sourceRows.some((s) => s.status === "running" && new Date(s.started_at).getTime() > started.getTime() - 6 * 3_600_000)) {
    return { waiting: true, reason: "backup running", date: day };
  }
  const sources: Source[] = sourceRows.filter((s) => s.status === "ok")
    .map(({ id, scope, folder_path }) => ({ id, scope, folder_path }));
  const running = checked<any>(await db.from("backup_runs").select("id, offsite_report")
    .eq("scope", "offsite").eq("run_date", day).eq("status", "running")
    .order("started_at", { ascending: false }).limit(1).maybeSingle(), "offsite running");
  const run = running ?? checked<any>(await db.from("backup_runs").insert({
    run_date: day, scope: "offsite", company_id: null, slug: "offsite", status: "running", folder_path: `daily/${day}`,
  }).select("id").single(), "offsite insert");
  const report: Report = running?.offsite_report ?? { gfs, sources, files: {}, failures: [], verified_at: null };
  const save = async (finished = false) => {
    const error = report.failures.length > 0;
    const data = checked<any>(await db.from("backup_runs").update({
      status: finished ? (error ? "error" : "ok") : "running",
      offsite_report: report, error_text: report.failures.join(" | ").slice(0, 4000) || null,
      tables_count: report.sources.length, rows_total: Object.keys(report.files).length,
      bytes: Object.values(report.files).reduce((sum, f) => sum + f.enc_bytes, 0),
      ...(finished ? { finished_at: now().toISOString(), file_name: `daily/${day}/_offsite-manifest.json.gz.enc` } : {}),
    }).eq("id", run.id).select("id").single(), "offsite progress");
    if (!data) throw new Error("offsite progress: linha ausente");
  };
  const expired = () => now().getTime() - started.getTime() >= budgetMs;
  const continueRun = async () => { await save(); return { continued: true, run_id: run.id, date: day }; };

  try {
    const identity = (ss: Source[]) => JSON.stringify(ss.map(({ id, scope, folder_path }) => ({ id, scope, folder_path })));
    if (identity(report.sources) !== identity(sources)) throw new Error("As fontes mudaram durante a cópia offsite");
    const storage = db.storage.from("database-backups");
    const items: { source: Source; file: string; path: string }[] = [];
    for (const source of report.sources) {
      if (!source.folder_path) throw new Error(`Fonte ${source.id} sem folder_path`);
      const sourceFiles: string[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = checked(await storage.list(source.folder_path, {
          limit: PAGE, offset, sortBy: { column: "name", order: "asc" },
        }), "storage list");
        if (!page) throw new Error("storage list: resposta ausente");
        for (const entry of page) {
          if (entry.id === null) throw new Error(`Pasta inesperada em ${source.folder_path}/${entry.name}`);
          sourceFiles.push(entry.name);
          items.push({ source, file: entry.name, path: `${source.folder_path}/${entry.name}` });
        }
        if (page.length < PAGE) break;
      }
      if (!sourceFiles.includes("manifest.json")) throw new Error(`Fonte ${source.id} sem manifest.json`);
    }

    for (const { source, file, path } of items) {
      if (report.failures.some((failure) => failure.startsWith(`${path}: `))) continue;
      if (report.files[path]?.classes.length === gfs.length) continue;
      try {
        let progress = report.files[path];
        const daily = offsiteKey("daily", day, source.folder_path, file);
        if (!progress) {
          const blob = checked(await storage.download(path), "storage download");
          if (!blob) throw new Error("storage download: conteúdo ausente");
          const plain = new Uint8Array(await blob.arrayBuffer());
          const hash = await sha256Hex(plain);
          const sealed = await sealBackup(plain, key);
          const meta = { sha256: hash, "plain-bytes": String(plain.length), source: path };
          let head = await r2.headObject(daily);
          if (head) {
            sameHash(head, hash);
          } else {
            await r2.putObject(daily, sealed, meta);
            head = await r2.headObject(daily);
            verifyHead(head, sealed.length, meta);
          }
          if (!head || head.size < 28) throw new Error("Envelope encriptado inválido");
          progress = { sha256: hash, bytes: plain.length, enc_bytes: head.size, classes: ["daily"] };
          report.files[path] = progress;
          await save();
        }
        for (const cls of gfs.slice(1)) {
          if (progress.classes.includes(cls)) continue;
          const destination = offsiteKey(cls, day, source.folder_path, file);
          let head = await r2.headObject(destination);
          if (head) sameHash(head, progress.sha256);
          else {
            await r2.copyObject(daily, destination);
            head = await r2.headObject(destination);
          }
          verifyHead(head, progress.enc_bytes, {
            sha256: progress.sha256, "plain-bytes": String(progress.bytes), source: path,
          });
          progress.classes.push(cls);
          await save();
        }
      } catch (error) {
        report.failures.push(`${path}: ${error instanceof Error ? error.message : "falha de cópia"}`);
      }
      if (expired()) return await continueRun(); // Source readback and the final manifest are still pending.
    }

    for (const source of report.sources) {
      if (source.manifest_verified_at) continue;
      const path = `${source.folder_path}/manifest.json`;
      if (report.failures.some((failure) => failure.startsWith(`${path}: `))) continue;
      try {
        const expected = report.files[path];
        if (!expected) throw new Error("Manifesto não copiado");
        const plain = await openBackup(await r2.getObject(offsiteKey("daily", day, source.folder_path, "manifest.json")), key);
        if (await sha256Hex(plain) !== expected.sha256) throw new Error("Hash de readback divergente");
        source.manifest_verified_at = now().toISOString();
      } catch (error) {
        report.failures.push(`${path}: ${error instanceof Error ? error.message : "falha de readback"}`);
      }
      await save();
      if (expired()) return await continueRun();
    }

    if (!report.failures.length) {
      // Deterministic content permits recovery after a PUT whose checkpoint was interrupted.
      const manifest = new TextEncoder().encode(JSON.stringify({ version: 1, date: day, gfs,
        sources: report.sources.map(({ id, scope, folder_path }) => ({ id, scope, folder_path })), files: report.files }));
      const sealed = await sealBackup(manifest, key);
      const hash = await sha256Hex(manifest);
      const manifestKey = `daily/${day}/_offsite-manifest.json.gz.enc`;
      const meta = { sha256: hash, "plain-bytes": String(manifest.length), source: `daily/${day}/_offsite-manifest.json` };
      const existing = await r2.headObject(manifestKey);
      if (existing) sameHash(existing, hash);
      else {
        await r2.putObject(manifestKey, sealed, meta);
        verifyHead(await r2.headObject(manifestKey), sealed.length, meta);
      }
      if (await sha256Hex(await openBackup(await r2.getObject(manifestKey), key)) !== hash) throw new Error("Hash do manifesto offsite divergente");
      report.verified_at = now().toISOString();
    }
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : "Falha offsite");
  }
  await save(true);
  return { status: report.failures.length ? "error" : "ok", run_id: run.id, date: day };
}

export async function runOffsiteFromEnv(admin: OffsiteDb, body: { date?: unknown }, getEnv: (name: string) => string | undefined) {
  if (body.date !== undefined) {
    if (typeof body.date !== "string") return { error: "date tem de ser YYYY-MM-DD" };
    try { utcDate(body.date); } catch (error) { return { error: (error as Error).message }; }
  }
  const names = ["BACKUP_R2_ACCOUNT_ID", "BACKUP_R2_ACCESS_KEY_ID", "BACKUP_R2_SECRET_ACCESS_KEY", "BACKUP_R2_BUCKET", "BACKUP_R2_ENC_KEY"] as const;
  const values = names.map((name) => getEnv(name));
  const missing = names.filter((_, i) => !values[i]);
  if (missing.length) return { error: "Configuração offsite incompleta", missing };
  const [accountId, accessKeyId, secretAccessKey, bucket, encodedKey] = values as string[];
  const key = await importBackupKey(encodedKey);
  return runOffsite({ db: admin, r2: createR2Client({ accountId, accessKeyId, secretAccessKey, bucket }),
    key, now: () => new Date() }, { date: body.date as string | undefined });
}
