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
import { isServiceRoleRequest } from "../_shared/multiTenant.ts";
import { runBackupSlices, type Cursor, type Target } from "./slices.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BACKUP_VERSION = 4;


interface InventoryRow { schema_name: string; tbl_name: string; has_company_id: boolean }

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

async function removeFolder(admin: any, folder: string, expired: () => boolean) {
  if (expired()) return;
  const { data } = await admin.storage.from("database-backups").list(folder, { limit: 1000 });
  if (expired()) return;
  const paths = (data ?? []).map((f: any) => `${folder}/${f.name}`);
  if (paths.length) await admin.storage.from("database-backups").remove(paths);
}

/**
 * Mantém as últimas 30 CORRIDAS por slug. Ficheiros soltos do formato antigo
 * (backup-<slug>-*.json) contam para o mesmo grupo do slug respectivo.
 * Corre SÓ na invocação do global, para não haver rotações concorrentes.
 */
async function rotateOldBackups(admin: any, expired: () => boolean) {
  if (expired()) return;
  let removedFolders = 0;
  const { data: root } = await admin.storage
    .from("database-backups")
    .list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (!root) return;

  type Item = { key: string; sort: string; folder?: string; file?: string };
  const items: Item[] = [];

  for (const e of root) {
    if (expired()) return;
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
      if (expired() || removedFolders >= 20) return;
      if (extra.folder) { await removeFolder(admin, extra.folder, expired); removedFolders++; }
      else if (extra.file) filesToDelete.push(extra.file);
    }
  }
  if (!expired() && filesToDelete.length) await admin.storage.from("database-backups").remove(filesToDelete);
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
  const invocationStart = Date.now();
  const workDeadline = invocationStart + 85_000; // 15 s reserved for a confirmed terminal write.
  const hardDeadline = invocationStart + 100_000;
  const signalUntil = (deadline: number) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("202-c: prazo da invocação esgotado");
    return AbortSignal.timeout(remaining);
  };
  const timedClient = (deadline: number) => createClient(supabaseUrl, serviceRoleKey, {
    global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal
      ? AbortSignal.any([init.signal, signalUntil(deadline)]) : signalUntil(deadline) }) },
  });
  let adminClient = createClient(supabaseUrl, serviceRoleKey);
  const closeClient = timedClient(hardDeadline);

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

    // #283 resto (D-ERP229): service role verificada no Auth (isServiceRoleRequest), nunca pelo payload.
    const isSr = await isServiceRoleRequest(req);
    const isMachine = isSr || role === "anon";

    let body: any = {};
    try { body = await req.json(); } catch { /* sem corpo */ }
    const force = body?.force === true && isSr;
    const wantsGlobal = body?.target === "global";
    const wantedCompanyId: string | null =
      typeof body?.company_id === "string" && body.company_id ? body.company_id : null;

    if (body?.target === "offsite_probe") {
      if (!isSr) return json({ error: "Apenas service role" }, 403);
      try {
        const { createR2Client } = await import("../_shared/r2.ts");
        const accountId = Deno.env.get("BACKUP_R2_ACCOUNT_ID") ?? "";
        const bucket = Deno.env.get("BACKUP_R2_BUCKET") ?? "";
        const options = { accountId, bucket,
          accessKeyId: Deno.env.get("BACKUP_R2_ACCESS_KEY_ID") ?? "",
          secretAccessKey: Deno.env.get("BACKUP_R2_SECRET_ACCESS_KEY") ?? "",
        };
        const [eu, defaultEndpoint] = await Promise.all([
          createR2Client({ ...options, endpointKind: "eu" }).probe(),
          createR2Client({ ...options, endpointKind: "default" }).probe(),
        ]);
        return json({ eu, default: defaultEndpoint, bucket_set: Boolean(bucket),
          account_id_format_ok: /^[0-9a-f]{32}$/.test(accountId) });
      } catch {
        // Transport errors may contain URLs or credentials; never forward or log them.
        return json({ error: "Sonda offsite indisponível" }, 500);
      }
    }

    if (body?.target === "offsite") {
      if (!isSr) return json({ error: "Apenas service role" }, 403);
      const { runOffsiteFromEnv } = await import("./offsite.ts");
      return json(await runOffsiteFromEnv(adminClient, body, (n) => Deno.env.get(n)));
    }

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

    adminClient = timedClient(workDeadline);

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
      // (Issue #241) Empresa activa = active_company_id ?? company_id, para todos.
      const callerCompanyId = profile?.active_company_id ?? profile?.company_id ?? null;

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

    // Continuations never trust client counters: only the storage checkpoint belongs to the run.
    if ((body?.run_id || body?.folder || body?.seq !== undefined) && !isSr) {
      return json({ error: "Apenas service role pode continuar uma corrida" }, 403);
    }
    if ((body?.run_id || body?.folder || body?.seq !== undefined) &&
        (typeof body.run_id !== "string" || typeof body.folder !== "string" || !Number.isSafeInteger(body.seq) || body.seq < 0)) {
      return json({ error: "Continuação 202-c inválida" }, 400);
    }
    let excluded: { schema: string; table: string; reason: string }[] = [];
    const outcome = await runBackupSlices({
      db: {
        from: (table: string) => adminClient.from(table),
        storage: adminClient.storage,
        rpc: (name: string, args: any) => adminClient.rpc(name, args).abortSignal(signalUntil(workDeadline)),
      },
      closeDb: closeClient,
      now: () => Date.now(),
      prepare: async () => {
        const { data: inventory, error: invErr } = await adminClient.rpc("backup_table_inventory").abortSignal(signalUntil(workDeadline));
        if (invErr) throw new Error(`backup_table_inventory: ${invErr.message}`);
        if (!Array.isArray(inventory)) throw new Error("backup_table_inventory: inventário ausente");
        const { data: exclRows, error: exclErr } = await adminClient.from("backup_excluded_tables").select("schema_name, table_name, reason");
        if (exclErr) throw new Error(`backup_excluded_tables: ${exclErr.message}`);
        excluded = (exclRows ?? []).map((r: any) => ({ schema: r.schema_name, table: r.table_name, reason: r.reason }));
        const excludedKeys = new Set(excluded.map((e) => `${e.schema}.${e.table}`));
        return (inventory as InventoryRow[])
          .filter((r) => scope === "company" ? r.has_company_id : !r.has_company_id)
          .filter((r) => !excludedKeys.has(`${r.schema_name}.${r.tbl_name}`));
      },
      readPage: async (target: Target, cursor: Cursor, filterCompany: string | null) => {
        let ordered = cursor.ordered;
        let attempts = 0;
        // The checkpoint uses the work client too: retain 5 s before its deadline for the handoff.
        const pageDeadline = workDeadline - 5000;
        const yieldPage = (): never => {
          throw Object.assign(new Error("202-d: prazo da página esgotado"), { name: "BackupPageDeadline" });
        };
        while (true) {
          if (Date.now() >= pageDeadline) yieldPage();
          const qs = new URLSearchParams({ select: "*", limit: String(cursor.pageSize) });
          if (filterCompany) qs.set("company_id", `eq.${filterCompany}`);
          if (ordered) qs.set("order", "id.asc");
          if (!ordered || cursor.after === undefined) qs.set("offset", String(cursor.from));
          // Encode exactly once, including ids containing query-string separators.
          const after = ordered && cursor.after != null ? `&id=gt.${encodeURIComponent(cursor.after)}` : "";
          const signal = signalUntil(pageDeadline);
          let response: Response | undefined;
          let text = "";
          let failure = "";
          attempts++;
          try {
            response = await fetch(`${supabaseUrl}/rest/v1/${target.tbl_name}?${qs}${after}`, {
              headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`,
                "Accept-Profile": target.schema_name, Prefer: "count=none" },
              signal,
            });
            text = await response.text();
          } catch (error) {
            if (signal.aborted || Date.now() >= pageDeadline) yieldPage();
            if (error instanceof Error && error.name === "AbortError") throw error;
            failure = error instanceof Error ? error.message : String(error);
          }
          // Only the missing-id error permits the legacy unordered fallback.
          if (!failure && response) {
            if (response.status === 400 && ordered && /42703/.test(text) && /\bid\b/.test(text)) {
              ordered = false; attempts = 0; continue;
            }
            if (response.ok) {
              const page = JSON.parse(text || "[]");
              if (!Array.isArray(page)) throw new Error(`${target.tbl_name}: página inválida`);
              let lastId: string | null = null;
              let previous = cursor.after ?? null;
              if (ordered) for (const row of page) {
                const id = row?.id;
                if (typeof id !== "string" && (typeof id !== "number" || !Number.isSafeInteger(id))) {
                  throw new Error(`${target.tbl_name}: linha sem id válido`);
                }
                if (previous !== null && !(typeof id === "number" ? id > Number(previous) : id > previous)) {
                  throw new Error(`${target.tbl_name}: ordem id não estritamente crescente`);
                }
                previous = lastId = String(id);
              }
              return { text, rows: page.length, ordered, lastId };
            }
            failure = `${target.tbl_name}: ${response.status} ${text.slice(0, 200)}`;
            if (response.status !== 429 && response.status < 500) throw new Error(failure);
          }
          if (attempts >= 4) throw new Error(`${failure} após ${attempts} tentativas`);
          const delay = 1000 * 2 ** (attempts - 1);
          if (Date.now() + delay >= pageDeadline) yieldPage();
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      },
      final: async (progress, context) => {
        const { folder } = context;
        const { tables, schemas, errors, parts: partsMap, rows_total: rowsTotal } = progress;
        let bytes = progress.bytes;
        // Manifesto de storage: cross-tenant por natureza, fica no global.
        // #202: TODOS os buckets (lista dinâmica de storage.buckets, menos database-backups),
        // recursivo, com contagem e bytes por bucket (RPC backup_storage_manifest).
        let storageManifest: Record<string, any[]> | undefined;
        let storageCounts: Record<string, number> | undefined;
        let storageReport: Record<string, { objects: number; bytes: number; mb: number; trash_objects: number; trash_bytes: number }> | undefined;
        if (scope === "global") {
          const { data: sm, error: smErr } = await adminClient.rpc("backup_storage_manifest").abortSignal(signalUntil(workDeadline));
          if (smErr) throw new Error(`backup_storage_manifest: ${smErr.message}`);
          if (!sm || typeof sm !== "object" || Array.isArray(sm)) throw new Error("backup_storage_manifest: resultado ausente");
          storageManifest = {};
          storageReport = {};
          for (const [bucket, v] of Object.entries((sm ?? {}) as Record<string, any>)) {
            storageManifest[bucket] = v.files ?? [];
            storageReport[bucket] = {
              objects: Number(v.objects ?? 0), bytes: Number(v.bytes ?? 0),
              mb: Math.round((Number(v.bytes ?? 0) / 1048576) * 100) / 100,
              trash_objects: Number(v.trash_objects ?? 0), trash_bytes: Number(v.trash_bytes ?? 0),
            };
          }
          storageCounts = Object.fromEntries(Object.entries(storageReport).map(([k, v]) => [k, v.objects]));
          bytes += await uploadJson(adminClient, `${folder}/storage-manifest.json`, storageManifest);
        }

        // ---- Infraestrutura e identidades: só no global, e obrigatórias ----
        // Crons, buckets, políticas de storage, extensões, migrações e o
        // INVENTÁRIO dos segredos do vault (nomes, nunca valores) + contas de
        // utilizador sem hashes nem tokens. Se qualquer das duas recolhas falhar,
        // a corrida global fica 'error' (o throw cai no catch de topo).
        let infraCounts: Record<string, number> | undefined;
        let identityCounts: Record<string, number> | undefined;
        if (scope === "global") {
          const { data: infra, error: infraErr } = await adminClient.rpc("backup_infra_snapshot").abortSignal(signalUntil(workDeadline));
          if (infraErr) throw new Error(`backup_infra_snapshot: ${infraErr.message}`);
          if (!infra) throw new Error("backup_infra_snapshot: resultado ausente");
          bytes += await uploadJson(adminClient, `${folder}/infra.json`, infra);
          infraCounts = (infra as any)?.contagens ?? undefined;

          const { data: ident, error: identErr } = await adminClient.rpc("backup_identities_snapshot").abortSignal(signalUntil(workDeadline));
          if (identErr) throw new Error(`backup_identities_snapshot: ${identErr.message}`);
          if (!ident) throw new Error("backup_identities_snapshot: resultado ausente");
          bytes += await uploadJson(adminClient, `${folder}/identities.json`, ident);
          identityCounts = (ident as any)?.contagens ?? undefined;
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
          excluded,
          ...(Object.keys(partsMap).length ? { parts: partsMap } : {}),
          ...(storageReport ? { storage_manifest: "storage-manifest.json", storage_counts: storageCounts, storage_report: storageReport } : {}),
          ...(infraCounts || identityCounts
            ? {
                infra: "infra.json",
                identities: "identities.json",
                infra_counts: {
                  crons: infraCounts?.crons ?? 0,
                  buckets: infraCounts?.buckets ?? 0,
                  politicas_storage: infraCounts?.politicas_storage ?? 0,
                  migracoes: infraCounts?.migracoes ?? 0,
                  segredos_vault: infraCounts?.segredos_vault ?? 0,
                  utilizadores: identityCounts?.utilizadores ?? 0,
                  identidades: identityCounts?.identidades ?? 0,
                },
              }
            : {}),
          ...(errors.length ? { errors } : {}),
        });

        return { fields: {
          file_name: manifestPath, folder_path: folder, tables_count: Object.keys(tables).length,
          rows_total: rowsTotal, bytes, error_text: null, ...(storageReport ? { storage_report: storageReport } : {}),
        }, result: {
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
          excluded,
          storage_counts: storageCounts,
          infra_counts: infraCounts,
          identity_counts: identityCounts,
          errors: errors.length ? errors : undefined,
        } };
      },
      rotate: () => rotateOldBackups(adminClient, () => Date.now() >= workDeadline),
    }, { scope, companyId, slug: slug!, force,
      ...(body?.run_id ? { continuation: { runId: body.run_id, folder: body.folder, seq: body.seq } } : {}),
    });
    return json(outcome, outcome.error ? 500 : 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("Backup error:", err);
    return json({ error: msg }, 500);
  }
});
