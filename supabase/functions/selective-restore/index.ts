// selective-restore — restauro SELETIVO (tabelas ou eventos) no caminho ATÓMICO
// (18/09/2026, segue a #203/D-ERP89).
//
// Já não apaga por ids e insere depois. O backup é carregado nas sombras
// (restore_shadow.<schema>__<tabela>, colunas de HOJE), validado por SQL
// (contagens, FKs contra a sombra do pai ou contra produção, company_id) e só
// então trocado por restore_apply_from_shadow — uma única transação.
//
//   scope 'tables' → p_scope 'company' (ou 'global' em backups legacy), restrito
//                    às tabelas escolhidas.
//   scope 'events' → pertença derivada do GRAFO (restore_event_scope_json), nunca
//                    de uma lista escrita à mão, e p_scope 'rows'.
//
// Body: { backup_file, mode: 'preview'|'restore', scope: 'tables'|'events',
//         tables?: string[], event_ids?: string[], roots?: string[],
//         keep_shadow?: true, log_scope?: 'restore_test' }   (os dois últimos só service_role)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Lê todas as partes de uma tabela v4 e valida a contagem contra o manifesto. */
async function readV4Table(admin: any, folder: string, manifest: any, t: string) {
  const expected: number = manifest.tables?.[t] ?? 0;
  if (!expected) return [] as any[];
  const nParts: number = manifest.parts?.[t] ?? 1;
  const out: any[] = [];
  for (let p = 1; p <= nParts; p++) {
    const name = p === 1 ? `${t}.json` : `${t}.part${p}.json`;
    const path = `${folder}/${name}`;
    const { data: tf, error: e } = await admin.storage.from("database-backups").download(path);
    if (e || !tf) throw new Error(`Parte do backup em falta ou ilegível: ${path}${e?.message ? ` (${e.message})` : ""}`);
    out.push(...(JSON.parse(await tf.text()) as any[]));
  }
  if (out.length !== expected) {
    throw new Error(`Contagem inconsistente em ${t}: lidas ${out.length} linhas, manifesto diz ${expected}`);
  }
  return out;
}

/** Abre um backup v4 (pasta + manifest.json) ou v2/v3 (ficheiro único). */
async function openBackup(admin: any, target: string) {
  if (target.endsWith("/manifest.json")) {
    const { data: f, error } = await admin.storage.from("database-backups").download(target);
    if (error || !f) throw new Error(`Manifesto: ${error?.message}`);
    const manifest = JSON.parse(await f.text());
    const folder = target.replace(/\/manifest\.json$/, "");
    const cache = new Map<string, any[]>();
    return {
      version: 4 as const,
      meta: manifest,
      tableNames: Object.keys(manifest.tables ?? {}),
      count: (t: string) => manifest.tables?.[t] ?? 0,
      getTable: async (t: string) => {
        if (!cache.has(t)) cache.set(t, await readV4Table(admin, folder, manifest, t));
        return cache.get(t)!;
      },
    };
  }
  const { data: fileData, error: dlErr } = await admin.storage.from("database-backups").download(target);
  if (dlErr || !fileData) throw new Error(`Download: ${dlErr?.message}`);
  const backup = JSON.parse(await fileData.text());
  const all: Record<string, any[]> = backup.tables ?? {};
  return {
    version: (backup.version ?? 2) as number,
    meta: backup,
    tableNames: Object.keys(all),
    count: (t: string) => all[t]?.length ?? 0,
    getTable: async (t: string) => (all[t] ?? []) as any[],
  };
}

interface Link { child: string; parent: string; child_col: string }

/** Fecho descendente do grafo a partir de um conjunto de raízes. */
function descendants(links: Link[], roots: string[]): Set<string> {
  const keep = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of links) {
      if (keep.has(l.parent) && !keep.has(l.child)) { keep.add(l.child); grew = true; }
    }
  }
  return keep;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ---- AUTH (admin, ou máquina com service_role) ----
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let role: string | null = null;
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      role = payload?.role ?? null;
      userId = payload?.sub ?? null;
    } catch { /* não é JWT */ }

    const isMachine = role === "service_role";
    let isPlatformAdmin = false;
    let callerCompanyId: string | null = null;

    if (!isMachine) {
      if (!userId) return json({ error: "Não autorizado" }, 401);
      const { data: roleData } = await admin
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleData) return json({ error: "Apenas administradores podem restaurar" }, 403);
      const { data: isPaRow } = await admin.rpc("is_platform_admin", { _user_id: userId });
      isPlatformAdmin = Boolean(isPaRow);
      const { data: profile } = await admin
        .from("profiles").select("company_id, active_company_id").eq("id", userId).maybeSingle();
      callerCompanyId = isPlatformAdmin
        ? (profile?.active_company_id ?? profile?.company_id ?? null)
        : (profile?.company_id ?? null);
    }

    const body = await req.json().catch(() => ({} as any));
    const {
      backup_file, mode, scope, tables: tablesFilter, event_ids, roots,
    } = body as {
      backup_file?: string;
      mode?: "preview" | "restore";
      scope?: "tables" | "events";
      tables?: string[];
      event_ids?: string[];
      roots?: string[];
    };
    const keepShadow = body?.keep_shadow === true && isMachine;
    const logScope: "restore" | "restore_test" =
      body?.log_scope === "restore_test" && isMachine ? "restore_test" : "restore";

    if (!backup_file || !mode || !scope) {
      return json({ error: "backup_file, mode e scope são obrigatórios" }, 400);
    }
    if (mode !== "preview" && mode !== "restore") {
      return json({ error: "mode deve ser 'preview' ou 'restore'" }, 400);
    }
    if (scope === "tables" && (!tablesFilter || tablesFilter.length === 0)) {
      return json({ error: "Selecione pelo menos uma tabela" }, 400);
    }
    if (scope === "events" && (!event_ids || event_ids.length === 0)) {
      return json({ error: "Selecione pelo menos um evento" }, 400);
    }

    const backup = await openBackup(admin, backup_file);
    const meta = backup.meta;

    // ---- MULTI-TENANT GUARD (inalterado) ----
    const backupScope: "company" | "global" | "legacy" =
      meta.scope === "company" ? "company" : meta.scope === "global" ? "global" : "legacy";
    const backupCompanyId: string | null = meta.company_id ?? null;

    if (backupScope === "global") {
      return json({ error: "Backup global não suporta restore seletivo" }, 400);
    }
    if (backupScope === "company" && !isMachine && backupCompanyId !== callerCompanyId) {
      console.warn(`[selective-restore] Cross-tenant block: caller=${userId} (${callerCompanyId}) tentou restaurar backup de ${backupCompanyId}`);
      return json({ error: "Este backup pertence a outra empresa" }, 403);
    }
    if (backupScope === "legacy" && !isMachine && !isPlatformAdmin) {
      return json({ error: "Backups antigos (v2) só por platform_admin" }, 403);
    }
    if (scope === "events" && callerCompanyId && event_ids?.length) {
      const { data: evCheck } = await admin.from("events").select("id, company_id").in("id", event_ids);
      const wrong = (evCheck ?? []).filter((e: any) => e.company_id !== callerCompanyId);
      if (wrong.length > 0) {
        console.warn(`[selective-restore] Cross-tenant event ids: ${wrong.map((e: any) => e.id).join(",")}`);
        return json({ error: "Alguns eventos não pertencem à sua empresa" }, 403);
      }
    }

    const tenantFilter = backupScope === "company" ? backupCompanyId : null;
    const applyCompanyId = tenantFilter ?? callerCompanyId ?? null;

    // ------------------------------------------------------------------ //
    // Conjunto efetivo de linhas por tabela
    // ------------------------------------------------------------------ //
    const effective: Record<string, any[]> = {};
    /** Chaves REAIS que existem HOJE em produção no âmbito (só scope 'events'). */
    let productionScope: Record<string, Record<string, unknown>[]> = {};
    /** Chave primária real de cada tabela, lida do catálogo (restore_table_pk). */
    let pkMap: Record<string, string[]> = {};
    let scopeCounts: Record<string, number> = {};
    const scopeWithoutBackup: string[] = [];
    const keyStr = (t: string, row: any) =>
      JSON.stringify((pkMap[t] ?? ["id"]).map((c) => row?.[c] ?? null));

    if (scope === "tables") {
      for (const t of tablesFilter!) {
        const rows = await backup.getTable(t);
        if (rows.length === 0) continue;
        effective[t] = tenantFilter ? rows.filter((r: any) => r.company_id === tenantFilter) : rows;
      }
    } else {
      // (a) O que pertence aos eventos HOJE, derivado do grafo.
      const { data: scopeData, error: scopeErr } = await admin.rpc("restore_event_scope_json", {
        p_event_ids: event_ids, p_roots: roots ?? null,
      });
      if (scopeErr) throw new Error(`restore_event_scope_json: ${scopeErr.message}`);
      productionScope = ((scopeData as any)?.keys ?? {}) as Record<string, Record<string, unknown>[]>;
      pkMap = ((scopeData as any)?.pk ?? {}) as Record<string, string[]>;
      scopeCounts = ((scopeData as any)?.counts ?? {}) as Record<string, number>;

      // (b) O que o BACKUP tem para esses eventos: expande-se pelo mesmo grafo,
      //     partindo de events e seguindo as FKs de uma coluna que apontam ao id.
      const { data: linkData, error: linkErr } = await admin.rpc("restore_scope_links", {
        p_tables: backup.tableNames,
      });
      if (linkErr) throw new Error(`restore_scope_links: ${linkErr.message}`);
      const links = ((linkData as any) ?? []) as Link[];
      const reachable = descendants(links, roots?.length ? roots : ["events"]);
      if (!roots?.length) reachable.add("events");
      // Mesmo universo do âmbito em produção: backup_table_inventory menos
      // backup_excluded_tables, só tabelas COM chave primária (qualquer, não só `id`).
      const allowedUniverse = new Set<string>(((scopeData as any)?.allowed ?? []) as string[]);
      const allowed = new Set([...reachable].filter((t) => allowedUniverse.has(t)));

      /** Linhas selecionadas do backup, indexadas pela chave real. */
      const sel: Record<string, Map<string, any>> = {};
      const add = (t: string, row: any) => {
        const m = sel[t] ?? (sel[t] = new Map());
        const k = keyStr(t, row);
        if (m.has(k)) return false;
        m.set(k, row);
        return true;
      };
      const parentIdsOf = (t: string) =>
        new Set([...(sel[t]?.values() ?? [])].map((r: any) => r.id).filter(Boolean));

      const rowsOf = new Map<string, any[]>();
      const tableRows = async (t: string) => {
        if (!rowsOf.has(t)) {
          const rows = await backup.getTable(t).catch(() => [] as any[]);
          rowsOf.set(t, tenantFilter ? rows.filter((r: any) => r.company_id === tenantFilter) : rows);
        }
        return rowsOf.get(t)!;
      };

      const candidates = backup.tableNames.filter((t) => allowed.has(t));
      if (!roots?.length) {
        for (const r of await tableRows("events")) {
          if (event_ids!.includes(r.id)) add("events", r);
        }
      }
      // Tabelas com event_id entram directamente pelos eventos.
      for (const t of candidates) {
        const rows = await tableRows(t);
        if (!rows.length) continue;
        if (rows[0] && Object.prototype.hasOwnProperty.call(rows[0], "event_id")) {
          for (const r of rows) if (r.event_id && event_ids!.includes(r.event_id)) add(t, r);
        }
      }
      // Descida por FK até não crescer mais.
      for (let round = 0; round < 30; round++) {
        let grew = 0;
        for (const l of links) {
          if (!candidates.includes(l.child) || !sel[l.parent]?.size) continue;
          const rows = await tableRows(l.child);
          if (!rows.length) continue;
          const parentIds = parentIdsOf(l.parent);
          if (!parentIds.size) continue;
          for (const r of rows) {
            const v = r[l.child_col];
            if (v && parentIds.has(v) && add(l.child, r)) grew++;
          }
        }
        if (grew === 0) break;
      }

      // Linhas efetivas = as do backup dentro do âmbito.
      const universe = new Set<string>([...Object.keys(sel), ...Object.keys(productionScope)]);
      for (const t of universe) {
        const rows = [...(sel[t]?.values() ?? [])];
        if (rows.length) effective[t] = rows;
        else if (scopeCounts[t]) scopeWithoutBackup.push(t);
      }
    }

    const tablesToRestore = Object.keys(effective).filter((t) => effective[t].length > 0);
    const counts: Record<string, number> = {};
    for (const t of tablesToRestore) counts[t] = effective[t].length;

    // Linhas que hoje existem no âmbito mas o backup não tem → são apagadas.
    // Cada elemento é a CHAVE REAL da linha ({coluna: valor}), não um id solto.
    const extraDeletes: Record<string, Record<string, unknown>[]> = {};
    if (scope === "events") {
      for (const [t, keys] of Object.entries(productionScope)) {
        const keep = new Set((effective[t] ?? []).map((r: any) => keyStr(t, r)));
        const extras = (keys ?? []).filter((k) => !keep.has(keyStr(t, k)));
        if (extras.length) extraDeletes[t] = extras;
      }
    }

    // ---- PREVIEW ----
    if (mode === "preview") {
      const willDelete: Record<string, number> = {};
      if (scope === "events") {
        for (const t of new Set([...Object.keys(productionScope), ...tablesToRestore])) {
          const inScope = (productionScope[t] ?? []).length;
          if (inScope) willDelete[t] = inScope;
        }
      }
      return json({
        success: true,
        mode: "preview",
        scope,
        backup_date: meta.created_at,
        backup_version: backup.version,
        tables: counts,
        total_rows: Object.values(counts).reduce((a, b) => a + b, 0),
        rows_in_scope_today: scope === "events" ? scopeCounts : undefined,
        will_insert: counts,
        will_delete: scope === "events" ? willDelete : undefined,
        will_delete_not_in_backup: scope === "events" && Object.keys(extraDeletes).length
          ? Object.fromEntries(Object.entries(extraDeletes).map(([t, ids]) => [t, ids.length]))
          : undefined,
        scope_tables_missing_from_backup: scopeWithoutBackup.length ? scopeWithoutBackup : undefined,
        note: scope === "events"
          ? "Restaurar o evento a esta data apaga também o que existe hoje e não está no backup."
          : undefined,
      });
    }

    if (tablesToRestore.length === 0 && Object.keys(extraDeletes).length === 0) {
      return json({ error: "O backup não tem linhas para este âmbito" }, 422);
    }

    // ---- RESTAURO ATÓMICO ----
    const rowsTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    const { data: runRow } = await admin.from("backup_runs").insert({
      run_date: new Date().toISOString().slice(0, 10),
      scope: logScope,
      company_id: applyCompanyId,
      slug: meta.company_slug ?? null,
      status: "running",
      folder_path: backup_file.replace(/\/manifest\.json$/, ""),
      tables_count: tablesToRestore.length,
      rows_total: rowsTotal,
    }).select("id").maybeSingle();
    const runId: string | null = runRow?.id ?? null;
    const scopeNote = scope === "events"
      ? `selective:events [${(event_ids ?? []).join(",")}]${roots?.length ? ` roots=${roots.join(",")}` : ""}`
      : `selective:tables [${tablesToRestore.join(",")}]`;
    const closeRun = async (fields: Record<string, unknown>) => {
      if (!runId) return;
      await admin.from("backup_runs")
        .update({ ...fields, finished_at: new Date().toISOString() })
        .eq("id", runId);
    };

    try {
      const { error: prepErr } = await admin.rpc("restore_shadow_prepare", { p_tables: tablesToRestore });
      if (prepErr) throw new Error(`restore_shadow_prepare: ${prepErr.message}`);

      const loaded: Record<string, { rows: number; unknown_cols?: string[] }> = {};
      for (const t of tablesToRestore) {
        const rows = effective[t];
        let n = 0;
        const unknown = new Set<string>();
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { data: res, error } = await admin.rpc("restore_shadow_load", { p_table: t, p_rows: batch });
          if (error) throw new Error(`carga de ${t} (lote ${Math.floor(i / 500)}): ${error.message}`);
          n += Number((res as any)?.inserted ?? 0);
          for (const c of ((res as any)?.unknown_cols ?? [])) unknown.add(c);
        }
        loaded[t] = { rows: n, ...(unknown.size ? { unknown_cols: Array.from(unknown) } : {}) };
      }

      const validateScope = tenantFilter ? "company" : "global";
      // Em scope 'events' valida-se como 'rows': o pai pode estar fora do âmbito
      // e continuar em produção (espelhos, linhas do BP do evento-mãe).
      const { data: validation, error: valErr } = await admin.rpc("restore_shadow_validate", {
        p_scope: scope === "events" ? "rows" : validateScope,
        p_company_id: tenantFilter, p_tables: tablesToRestore, p_counts: counts,
      });
      if (valErr) throw new Error(`restore_shadow_validate: ${valErr.message}`);
      if (!(validation as any)?.ok) {
        await closeRun({
          status: "error",
          error_text: `${scopeNote} | validação: ${JSON.stringify((validation as any)?.errors ?? [])}`.slice(0, 4000),
        });
        return json({
          success: false, mode: "restore", scope, stage: "validation",
          shadow_kept: true, loaded, validation,
          message: "Validação falhou — a produção NÃO foi tocada. As sombras ficam em restore_shadow para inspecção.",
        });
      }

      const applyArgs: Record<string, unknown> = scope === "events"
        ? { p_scope: "rows", p_company_id: tenantFilter, p_tables: tablesToRestore, p_extra_deletes: extraDeletes }
        : { p_scope: validateScope, p_company_id: tenantFilter, p_tables: tablesToRestore };
      const { data: applied, error: applyErr } = await admin.rpc("restore_apply_from_shadow", applyArgs);
      if (applyErr) {
        await closeRun({ status: "error", error_text: `${scopeNote} | apply: ${applyErr.message}`.slice(0, 4000) });
        return json({
          success: false, mode: "restore", scope, stage: "apply",
          shadow_kept: true, loaded, error: applyErr.message,
          message: "A aplicação falhou e desfez-se por inteiro — a produção ficou como estava.",
        });
      }

      let shadowsDropped = 0;
      if (!keepShadow) {
        const { data: dropped } = await admin.rpc("restore_shadow_cleanup", { p_tables: tablesToRestore });
        shadowsDropped = Number(dropped ?? 0);
      }
      const insertedTotal = Object.values(((applied as any)?.inserted ?? {}) as Record<string, number>)
        .reduce((a, b) => a + Number(b), 0);
      await closeRun({
        status: "ok", rows_total: insertedTotal, tables_count: tablesToRestore.length,
        error_text: scopeNote.slice(0, 4000),
      });

      return json({
        success: true,
        mode: "restore",
        scope,
        log_scope: logScope,
        backup_file,
        backup_date: meta.created_at,
        total_tables: tablesToRestore.length,
        rows_total: insertedTotal,
        tables_with_errors: 0,
        validation,
        loaded,
        applied,
        extra_deletes: Object.keys(extraDeletes).length
          ? Object.fromEntries(Object.entries(extraDeletes).map(([t, ids]) => [t, ids.length]))
          : undefined,
        scope_tables_missing_from_backup: scopeWithoutBackup.length ? scopeWithoutBackup : undefined,
        shadows_dropped: shadowsDropped,
        shadow_kept: keepShadow,
        backup_run_id: runId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await closeRun({ status: "error", error_text: `${scopeNote} | ${msg}`.slice(0, 4000) });
      return json({ error: `${msg} — produção NÃO tocada; sombras deixadas para inspecção` }, 500);
    }
  } catch (err) {
    console.error("[selective-restore] fatal", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
