// Backup multi-tenant v4: UMA PASTA POR CORRIDA, UM FICHEIRO POR TABELA.
//   { "target": "global" }        -> backup global (tabelas sem company_id) + rotação
//   { "company_id": "<uuid>" }    -> backup de uma empresa (tabelas com company_id)
//   sem corpo                      -> botão da UI (admin -> a sua empresa)
// Qualquer um aceita { "force": true } (só com JWT service_role) para ignorar a janela horária.
//
// Caminho no bucket database-backups:
//   <slug>/<YYYY-MM-DDTHH-mm-ss>/<tabela>.json          (tabelas do schema public)
//   <slug>/<YYYY-MM-DDTHH-mm-ss>/crm.<tabela>.json      (tabelas do schema crm)
//   <slug>/<YYYY-MM-DDTHH-mm-ss>/manifest.json
//
// Porque mudou (17/09/2026): a lista de tabelas era escrita à mão (75 de 269) e
// o ficheiro único juntava tudo em memória. Agora a lista é DERIVADA por SQL
// (public.backup_table_inventory) e cada tabela é subida assim que termina,
// libertando a memória antes da seguinte.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BACKUP_VERSION = 4;

const STORAGE_BUCKETS = [
  "database-backups",
  "transaction-documents", "supplier-documents",
  "partner-extra-documents", "cache-extra-documents",
  "closing-cost-documents", "import-reports",
];

interface InventoryRow { schema_name: string; tbl_name: string; has_company_id: boolean }

async function listAllFiles(adminClient: any, bucket: string): Promise<any[]> {
  const allFiles: any[] = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const { data, error } = await adminClient.storage
      .from(bucket)
      .list("", { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data || data.length === 0) break;
    allFiles.push(...data);
    offset += data.length;
    if (data.length < limit) break;
  }
  return allFiles;
}

/**
 * Serializa uma tabela DIRECTO para pedaços de texto, página a página, e sobe-a.
 * Nunca guarda a tabela inteira nem o conjunto todo em memória.
 */
async function dumpTable(
  client: any,
  admin: any,
  folder: string,
  fileKey: string,
  table: string,
  filter?: { col: string; val: string },
): Promise<{ rows: number; bytes: number; parts: number }> {
  // Tabelas grandes (ex.: ticketline_sync_runs, 89 MB) não cabem em memória
  // num só ficheiro: passam a ser gravadas em pedaços
  //   <key>.json, <key>.part2.json, <key>.part3.json, ...
  // e o manifesto guarda quantos pedaços tem cada tabela.
  const PART_LIMIT_BYTES = 8_000_000;
  let parts: string[] = [];
  let partBytes = 0;
  let partIndex = 1;
  let count = 0;
  let bytes = 0;
  let from = 0;
  const pageSize = 1000;

  const flush = async () => {
    if (parts.length === 0) return;
    const blob = new Blob(["[", ...parts, "]"], { type: "application/json" });
    parts = [];
    partBytes = 0;
    const path = partIndex === 1
      ? `${folder}/${fileKey}.json`
      : `${folder}/${fileKey}.part${partIndex}.json`;
    const { error: upErr } = await admin.storage
      .from("database-backups")
      .upload(path, blob, { contentType: "application/json", upsert: true });
    if (upErr) throw new Error(`upload ${path}: ${upErr.message}`);
    bytes += blob.size;
    partIndex += 1;
  };

  while (true) {
    let q = client.from(table).select("*").range(from, from + pageSize - 1);
    if (filter) q = q.eq(filter.col, filter.val);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    const chunk = JSON.stringify(data).slice(1, -1);
    if (parts.length > 0) parts.push(",");
    parts.push(chunk);
    partBytes += chunk.length;
    count += data.length;
    from += data.length;
    if (partBytes >= PART_LIMIT_BYTES) await flush();
    if (data.length < pageSize) break;
  }
  await flush();

  if (count === 0) return { rows: 0, bytes: 0, parts: 0 }; // tabelas vazias não geram ficheiro
  return { rows: count, bytes, parts: partIndex - 1 };
}

async function uploadJson(admin: any, path: string, doc: unknown): Promise<number> {
  const blob = new Blob([JSON.stringify(doc)], { type: "application/json" });
  const { error } = await admin.storage
    .from("database-backups")
    .upload(path, blob, { contentType: "application/json", upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return blob.size;
}

/** Lista as pastas de corrida de um slug. */
async function listRunFolders(admin: any, slug: string): Promise<string[]> {
  const { data } = await admin.storage.from("database-backups").list(slug, { limit: 1000 });
  return (data ?? []).filter((e: any) => e.id === null).map((e: any) => e.name);
}

async function removeFolder(admin: any, folder: string) {
  const { data } = await admin.storage.from("database-backups").list(folder, { limit: 1000 });
  const paths = (data ?? []).map((f: any) => `${folder}/${f.name}`);
  if (paths.length) await admin.storage.from("database-backups").remove(paths);
}

/**
 * Mantém as últimas 30 CORRIDAS por slug. Ficheiros soltos do formato antigo
 * (backup-<slug>-*.json) contam para o mesmo grupo do slug respectivo.
 * Corre SÓ na invocação do global, para não haver rotações concorrentes.
 */
async function rotateOldBackups(admin: any) {
  const { data: root } = await admin.storage
    .from("database-backups")
    .list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (!root) return;

  type Item = { key: string; sort: string; folder?: string; file?: string };
  const items: Item[] = [];

  for (const e of root) {
    const name: string = e.name;
    if (e.id === null) {
      // pasta de slug -> cada subpasta é uma corrida
      const runs = await listRunFolders(admin, name);
      for (const run of runs) items.push({ key: name, sort: run, folder: `${name}/${run}` });
      continue;
    }
    if (!name.endsWith(".json")) continue;
    let key = "_legacy";
    if (name.startsWith("backup-global-")) key = "global";
    else {
      const m = name.match(/^backup-(.+)-\d{4}-\d{2}-\d{2}T/);
      if (m) key = m[1];
    }
    const sort = String(e.created_at ?? "").replace(/[:.]/g, "-").slice(0, 19);
    items.push({ key, sort, file: name });
  }

  const groups = new Map<string, Item[]>();
  for (const it of items) {
    if (!groups.has(it.key)) groups.set(it.key, []);
    groups.get(it.key)!.push(it);
  }

  const filesToDelete: string[] = [];
  for (const [, list] of groups) {
    list.sort((a, b) => b.sort.localeCompare(a.sort));
    for (const extra of list.slice(30)) {
      if (extra.folder) await removeFolder(admin, extra.folder);
      else if (extra.file) filesToDelete.push(extra.file);
    }
  }
  if (filesToDelete.length) await admin.storage.from("database-backups").remove(filesToDelete);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const crmClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "crm" as never },
  });

  // Linha em backup_runs desta invocação — o catch de topo TEM de a fechar.
  let runId: string | null = null;
  const closeRun = async (fields: Record<string, unknown>) => {
    if (!runId) return;
    await adminClient.from("backup_runs").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", runId);
  };

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";

    let role: string | null = null;
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      role = payload?.role ?? null;
      userId = payload?.sub ?? null;
    } catch { /* not a JWT */ }

    const isMachine = role === "service_role" || role === "anon";

    let body: any = {};
    try { body = await req.json(); } catch { /* sem corpo */ }
    const force = body?.force === true && role === "service_role";
    const wantsGlobal = body?.target === "global";
    const wantedCompanyId: string | null =
      typeof body?.company_id === "string" && body.company_id ? body.company_id : null;

    // Janela 02:00-05:00 Europe/Lisbon para chamadas de máquina.
    if (isMachine && !force) {
      const lisbonHour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false,
        }).format(new Date()),
      );
      if (lisbonHour < 2 || lisbonHour > 5) {
        return json({ skipped: true, reason: "outside backup window (Europe/Lisbon 02:00-05:00)", lisbonHour });
      }
    }

    // ---- Resolver o ALVO ÚNICO desta invocação ----
    let scope: "global" | "company";
    let companyId: string | null = null;

    if (isMachine) {
      if (wantedCompanyId) { scope = "company"; companyId = wantedCompanyId; }
      else scope = "global";
    } else {
      if (!userId) return json({ error: "Não autorizado" }, 401);

      const { data: roleData } = await adminClient
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleData) return json({ error: "Apenas administradores podem criar backups" }, 403);

      const { data: isPaRow } = await adminClient.rpc("is_platform_admin", { _user_id: userId });
      const isPlatformAdmin = Boolean(isPaRow);

      const { data: profile } = await adminClient
        .from("profiles").select("company_id, active_company_id").eq("id", userId).maybeSingle();
      const callerCompanyId = isPlatformAdmin
        ? (profile?.active_company_id ?? profile?.company_id ?? null)
        : (profile?.company_id ?? null);

      if (wantsGlobal) {
        if (!isPlatformAdmin) return json({ error: "Apenas platform_admin pode pedir o backup global" }, 403);
        scope = "global";
      } else if (wantedCompanyId) {
        if (!isPlatformAdmin && wantedCompanyId !== callerCompanyId) {
          return json({ error: "Sem acesso a essa empresa" }, 403);
        }
        scope = "company";
        companyId = wantedCompanyId;
      } else {
        if (!callerCompanyId) return json({ error: "Sem empresa associada" }, 403);
        scope = "company";
        companyId = callerCompanyId;
      }
    }

    let slug: string | null = scope === "global" ? "global" : null;
    if (scope === "company" && companyId) {
      const { data: companyRow } = await adminClient
        .from("companies").select("slug").eq("id", companyId).maybeSingle();
      slug = companyRow?.slug ?? companyId.slice(0, 8);
    }

    const runDate = new Date().toISOString().slice(0, 10);

    // ---- Continuação de uma corrida já aberta (fatiamento por CPU) ----
    const cont = body?.run_id && body?.folder && role === "service_role"
      ? {
          runId: String(body.run_id),
          folder: String(body.folder),
          startIndex: Number(body.start_index ?? 0),
          progress: body.progress ?? {},
        }
      : null;

    // ---- Guarda de idempotência: por backup_runs ----
    // force=true (só service_role) refaz a corrida mesmo que já haja uma ok hoje.
    if (cont) {
      // nada a validar: a corrida já foi aberta pela primeira fatia
    } else if (!force) {
      let q = adminClient
        .from("backup_runs")
        .select("id, file_name, folder_path")
        .eq("run_date", runDate)
        .eq("scope", scope)
        .eq("status", "ok");
      q = companyId ? q.eq("company_id", companyId) : q.is("company_id", null);
      const { data: already, error: alreadyErr } = await q.maybeSingle();
      if (alreadyErr && alreadyErr.code !== "PGRST116") throw new Error(`backup_runs: ${alreadyErr.message}`);
      if (already) {
        return json({
          skipped: true, reason: "already ok today", scope, slug, date: runDate,
          file: already.file_name, folder: already.folder_path,
        });
      }
    } else {
      // Corrida forçada: a anterior 'ok' do mesmo dia/alvo passa a 'superseded'
      // (o índice único só admite uma linha 'ok' por dia e por alvo).
      let u = adminClient
        .from("backup_runs")
        .update({ status: "superseded" })
        .eq("run_date", runDate)
        .eq("scope", scope)
        .eq("status", "ok");
      u = companyId ? u.eq("company_id", companyId) : u.is("company_id", null);
      const { error: supErr } = await u;
      if (supErr) throw new Error(`backup_runs supersede: ${supErr.message}`);
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const folder = cont ? cont.folder : `${slug}/${ts}`;

    // ---- Abrir a linha 'running' (só na primeira fatia) ----
    if (cont) {
      runId = cont.runId;
    } else {
      const { data: runRow, error: runErr } = await adminClient
        .from("backup_runs")
        .insert({ run_date: runDate, scope, company_id: companyId, slug, status: "running", folder_path: folder })
        .select("id")
        .single();
      if (runErr) throw new Error(`backup_runs insert: ${runErr.message}`);
      runId = runRow.id;
    }

    // ---- Lista de tabelas DERIVADA por SQL ----
    const { data: inventory, error: invErr } = await adminClient.rpc("backup_table_inventory");
    if (invErr) throw new Error(`backup_table_inventory: ${invErr.message}`);
    const rowsInv = (inventory ?? []) as InventoryRow[];
    const targets = rowsInv.filter((r) =>
      scope === "company" ? r.has_company_id : !r.has_company_id,
    );

    const tables: Record<string, number> = { ...(cont?.progress?.tables ?? {}) };
    const schemas: Record<string, string> = { ...(cont?.progress?.schemas ?? {}) };
    const errors: string[] = [...(cont?.progress?.errors ?? [])];
    const partsMap: Record<string, number> = { ...(cont?.progress?.parts ?? {}) };
    let rowsTotal = Number(cont?.progress?.rows_total ?? 0);
    let bytes = Number(cont?.progress?.bytes ?? 0);

    // Orçamento de CPU por invocação: ao esgotar, continua noutra invocação.
    const SLICE_BUDGET_MS = 12_000;
    const sliceStart = Date.now();
    let nextIndex = cont?.startIndex ?? 0;

    for (let i = nextIndex; i < targets.length; i++) {
      const t = targets[i];
      const key = t.schema_name === "crm" ? `crm.${t.tbl_name}` : t.tbl_name;
      schemas[key] = t.schema_name;
      const client = t.schema_name === "crm" ? crmClient : adminClient;
      try {
        const res = await dumpTable(
          client, adminClient, folder, key, t.tbl_name,
          scope === "company" ? { col: "company_id", val: companyId! } : undefined,
        );
        tables[key] = res.rows;
        rowsTotal += res.rows;
        bytes += res.bytes;
      } catch (e) {
        tables[key] = 0;
        errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      }
      nextIndex = i + 1;
      if (nextIndex < targets.length && Date.now() - sliceStart > SLICE_BUDGET_MS) {
        // Passa a bola à fatia seguinte (a linha em backup_runs fica 'running').
        // Disparo desacoplado pela base de dados (pg_net): a fatia seguinte
        // não depende desta invocação continuar viva. Esperar pela resposta
        // mantinha a cadeia toda a arder e batia no limite de tempo; abortar
        // o fetch cancelava a fatia seguinte.
        const { error: enqErr } = await adminClient.rpc("backup_enqueue_slice", {
          p_body: {
            company_id: companyId,
            ...(scope === "global" ? { target: "global" } : {}),
            force: true, run_id: runId, folder,
            start_index: nextIndex,
            progress: { tables, schemas, errors, rows_total: rowsTotal, bytes },
          },
        });
        if (enqErr) throw new Error(`backup_enqueue_slice: ${enqErr.message}`);
        return json({
          continued: true, folder, next_index: nextIndex, total_targets: targets.length,
        });
      }
    }


    // Manifesto de storage: cross-tenant por natureza, fica no global.
    let storageManifest: Record<string, any[]> | undefined;
    let storageCounts: Record<string, number> | undefined;
    if (scope === "global") {
      storageManifest = {};
      for (const bucket of STORAGE_BUCKETS) {
        try {
          const files = await listAllFiles(adminClient, bucket);
          storageManifest[bucket] = files.map((f) => ({
            name: f.name,
            size: f.metadata?.size ?? null,
            mimetype: f.metadata?.mimetype ?? null,
            created_at: f.created_at,
            updated_at: f.updated_at,
          }));
        } catch (e) {
          errors.push(`storage/${bucket}: ${e instanceof Error ? e.message : "?"}`);
          storageManifest[bucket] = [];
        }
      }
      storageCounts = Object.fromEntries(
        Object.entries(storageManifest).map(([k, v]) => [k, v.length]),
      );
    }

    const manifestPath = `${folder}/manifest.json`;
    bytes += await uploadJson(adminClient, manifestPath, {
      version: BACKUP_VERSION,
      scope,
      company_id: companyId,
      company_slug: slug,
      created_at: new Date().toISOString(),
      tables,
      rows_total: rowsTotal,
      schemas,
      ...(storageManifest ? { storage_manifest: storageManifest, storage_counts: storageCounts } : {}),
      ...(errors.length ? { errors } : {}),
    });

    // Rotação só na invocação do global.
    let rotationError: string | null = null;
    if (scope === "global") {
      try { await rotateOldBackups(adminClient); }
      catch (e) { rotationError = e instanceof Error ? e.message : "?"; }
    }

    const errorText = [
      ...errors,
      ...(rotationError ? [`rotation: ${rotationError}`] : []),
    ].join(" | ").slice(0, 4000);

    await closeRun({
      status: "ok",
      file_name: manifestPath,
      folder_path: folder,
      tables_count: Object.keys(tables).length,
      rows_total: rowsTotal,
      bytes,
      error_text: errorText || null,
    });

    return json({
      success: true,
      version: BACKUP_VERSION,
      scope,
      company_id: companyId,
      slug,
      folder,
      manifest: manifestPath,
      tables_count: Object.keys(tables).length,
      tables_with_rows: Object.values(tables).filter((n) => n > 0).length,
      rows_total: rowsTotal,
      bytes,
      table_counts: tables,
      storage_counts: storageCounts,
      errors: errors.length ? errors : undefined,
      rotation_error: rotationError ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("Backup error:", err);
    try { await closeRun({ status: "error", error_text: msg.slice(0, 4000) }); } catch { /* ignore */ }
    return json({ error: msg }, 500);
  }
});
