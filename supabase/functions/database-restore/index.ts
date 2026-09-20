// database-restore — restauro COMPLETO multi-tenant, ATÓMICO (#203, 18/09/2026).
// - Aceita backups v4 (pasta + manifest.json), v3 (scope:"company") e v2 (legacy).
// - Os dados do backup são carregados primeiro na área de carga restore_shadow
//   (uma sombra por tabela, colunas de HOJE, sem constraints/triggers/índices),
//   validados por SQL (contagens do manifesto, FKs, company_id) e só então
//   trocados em produção por restore_apply_from_shadow — uma única transação,
//   com triggers de utilizador desligados e as FKs dos dois ciclos adiadas até
//   ao fim. Qualquer falha desfaz tudo: a produção nunca fica a meio.
// - Tabelas globais NUNCA são tocadas por restores de empresa. Só platform_admin
//   sem active_company_id pode restaurar dados globais.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  LEGACY_TARGET_COMPANY_ERROR,
  isUuid,
  stampLegacyCompanyId,
} from "../_shared/restore-legacy-company.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESTORE_ORDER_TENANT = [
  "account_categories",
  "profiles", "user_roles", "user_permissions",
  "partner_event_access", "push_subscriptions",
  "financial_accounts", "financial_account_access",
  "suppliers", "supplier_documents", "supplier_credits",
  "venues", "venue_reservations",
  "events", "event_dates", "event_sessions",
  "event_implementations",
  "event_ticket_zones", "event_ticket_lots",
  "event_cache_configs", "event_cache_deductions", "event_cache_extras",
  "event_cache_tiers", "event_cache_city_settlements", "event_cache_payments",
  "event_closing_costs",
  "event_partners", "event_partner_extras",
  "event_ticket_office_assignments", "event_ticket_office_advances",
  "ticket_office_settlements",
  "ticket_sales", "ticket_import_logs",
  "transactions", "transaction_documents", "transaction_audit_log",
  "transaction_payments", "supplier_credit_usages",
  "event_forecasts", "event_forecast_partners", "event_forecast_formalidade_log",
  "bp_orphan_attachments", "bp_versions", "bp_version_audit_log",
  "partner_paid_expenses", "partner_advance_expenses",
  "payment_lists", "payment_list_items",
  "quotations", "recurring_transactions",
  "reimbursement_notes", "reimbursement_note_items",
  "camarim_sessions", "camarim_session_events", "camarim_items",
  "camarim_item_documents", "camarim_item_reviews",
  "camarim_integrations", "camarim_fund_moves",
  "accounting_exports", "system_audit_log", "forecast_audit_log",
  "user_activity_log", "trash", "undo_actions",
  "company_invitations",
  "email_send_log", "email_send_state",
  "email_unsubscribe_tokens", "suppressed_emails",
];

const RESTORE_ORDER_GLOBAL = [
  "cities", "companies", "role_permissions",
  "login_attempts", "mfa_recovery_codes", "mfa_trusted_devices",
];

/**
 * Escrita/leitura de uma chave do backup. Chaves com prefixo "crm." vivem no
 * schema crm; as restantes em public.
 */
function tableRef(admin: any, key: string) {
  if (key.startsWith("crm.")) return admin.schema("crm").from(key.slice(4));
  return admin.from(key);
}

/**
 * Lê todas as partes de uma tabela v4 e valida a contagem contra o manifesto.
 * Uma parte em falta ou uma contagem diferente é ERRO — nunca silêncio.
 */
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

/**
 * Abre um backup no formato NOVO (v4: pasta + manifest.json + um ficheiro por
 * tabela) ou no formato ANTIGO (ficheiro backup-*.json solto, v3/v2). No v4 as
 * tabelas são lidas uma a uma, só as que fazem falta.
 */
async function openBackup(admin: any, target: string) {
  if (target.endsWith("/manifest.json")) {
    const { data: f, error } = await admin.storage.from("database-backups").download(target);
    if (error || !f) throw new Error(`Erro ao descarregar manifesto: ${error?.message}`);
    const manifest = JSON.parse(await f.text());
    const folder = target.replace(/\/manifest\.json$/, "");
    const counts: Record<string, number> = manifest.tables ?? {};
    return {
      version: 4 as const,
      meta: manifest,
      count: (t: string) => counts[t] ?? 0,
      getTable: (t: string) => readV4Table(admin, folder, manifest, t),
    };
  }
  const { data: file, error: dlErr } = await admin.storage.from("database-backups").download(target);
  if (dlErr || !file) throw new Error(`Erro ao descarregar backup: ${dlErr?.message}`);
  const backupJson = JSON.parse(await file.text());
  if (!backupJson.tables) throw new Error("Backup inválido: campo 'tables' ausente");
  return {
    version: (backupJson.version ?? 2) as number,
    meta: backupJson,
    count: (t: string) => (backupJson.tables[t]?.length ?? 0),
    getTable: async (t: string) => (backupJson.tables[t] ?? []) as any[],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ---- AUTH ----
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let role: string | null = null;
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      role = payload?.role ?? null;
      userId = payload?.sub ?? null;
    } catch { /* */ }

    const isMachine = role === "service_role";
    let isPlatformAdmin = false;
    let callerCompanyId: string | null = null;

    if (!isMachine) {
      if (!userId) return jsonErr("Não autorizado", 401);
      const { data: roleRow } = await admin
        .from("user_roles").select("role")
        .eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) return jsonErr("Apenas administradores podem restaurar backups", 403);

      const { data: isPaRow } = await admin.rpc("is_platform_admin", { _user_id: userId });
      isPlatformAdmin = Boolean(isPaRow);
      const { data: profile } = await admin
        .from("profiles").select("company_id, active_company_id").eq("id", userId).maybeSingle();
      callerCompanyId = isPlatformAdmin
        ? (profile?.active_company_id ?? profile?.company_id ?? null)
        : (profile?.company_id ?? null);
    }

    const body = await req.json().catch(() => ({} as any));
    const { backup_file, mode } = body ?? {};
    if (!backup_file) return jsonErr("backup_file é obrigatório", 400);
    // Só a máquina pode deixar as sombras de pé (inspecção / ensaio de retrocesso).
    const keepShadow = body?.keep_shadow === true && isMachine;
    const logScope: "restore" | "restore_test" =
      body?.log_scope === "restore_test" ? "restore_test" : "restore";


    const backup = await openBackup(admin, backup_file);
    const backupJson = backup.meta;

    // ---- MULTI-TENANT GUARD ----
    const backupScope: "company" | "global" | "legacy" =
      backupJson.scope === "company" ? "company"
      : backupJson.scope === "global" ? "global"
      : "legacy"; // v2 sem scope
    const backupCompanyId: string | null = backupJson.company_id ?? null;

    if (backupScope === "global") {
      // Só platform_admin sem active_company_id pode restaurar globais
      if (!isMachine && !(isPlatformAdmin && !callerCompanyId)) {
        return jsonErr("Backup global só pode ser restaurado por platform_admin sem empresa ativa", 403);
      }
    } else if (backupScope === "company") {
      // Backup de empresa: tem de ser da company do caller (ou platform_admin com active = essa company)
      if (!isMachine && backupCompanyId !== callerCompanyId) {
        console.warn(`[database-restore] Cross-tenant block: caller=${userId} (${callerCompanyId}) tentou restaurar backup de ${backupCompanyId}`);
        return jsonErr("Este backup pertence a outra empresa", 403);
      }
    } else {
      // Legacy v2: só platform_admin pode restaurar (contém todas as empresas)
      if (!isMachine && !isPlatformAdmin) {
        return jsonErr("Backups antigos (v2) só podem ser restaurados por platform_admin", 403);
      }
    }

    // #96: backups legacy não trazem company_id nas linhas — alvo explícito obrigatório.
    const targetCompanyId: string | null = isUuid(body?.target_company_id) ? body.target_company_id : null;
    if (backupScope === "legacy" && !targetCompanyId) {
      return jsonErr(LEGACY_TARGET_COMPANY_ERROR, 400);
    }

    // Lista de tabelas a restaurar.
    // v4: derivada do manifesto — as conhecidas mantêm a ordem de dependências
    // já existente e as restantes vão no fim, por ordem alfabética.
    const KNOWN_ORDER = backupScope === "global" ? RESTORE_ORDER_GLOBAL : RESTORE_ORDER_TENANT;
    const manifestTables: string[] = backup.version >= 4 ? Object.keys(backupJson.tables ?? {}) : [];
    const RESTORE_ORDER = backup.version >= 4
      ? [
          ...KNOWN_ORDER.filter((t) => manifestTables.includes(t)),
          ...manifestTables.filter((t) => !KNOWN_ORDER.includes(t)).sort(),
        ]
      : KNOWN_ORDER;
    const DELETE_ORDER = [...RESTORE_ORDER].reverse();
    // Nada do manifesto pode ficar de fora em silêncio.
    const notRestored: Record<string, string> = {};
    for (const t of manifestTables) {
      if (!RESTORE_ORDER.includes(t)) notRestored[t] = "não incluída na ordem de restauro";
    }

    // ---- PREVIEW ----
    if (mode === "preview") {
      const preview: Record<string, number> = {};
      const targetCompany = backupScope === "company" ? backupCompanyId
        : (backupScope === "legacy" && callerCompanyId) ? callerCompanyId : null;

      const missingParts: string[] = [];
      if (backup.version >= 4) {
        const folder = backup_file.replace(/\/manifest\.json$/, "");
        const present = new Set<string>();
        for (let off = 0; ; off += 1000) {
          const { data: objs } = await admin.storage.from("database-backups")
            .list(folder, { limit: 1000, offset: off });
          (objs ?? []).forEach((o: any) => present.add(o.name));
          if (!objs || objs.length < 1000) break;
        }
        for (const t of RESTORE_ORDER) {
          const n = backup.count(t);
          if (!n) continue;
          preview[t] = n;
          const nParts: number = backupJson.parts?.[t] ?? 1;
          for (let p = 1; p <= nParts; p++) {
            const name = p === 1 ? `${t}.json` : `${t}.part${p}.json`;
            if (!present.has(name)) missingParts.push(`${folder}/${name}`);
          }
        }
        if (missingParts.length) {
          return jsonErr(`Partes do backup em falta: ${missingParts.join(", ")}`, 422);
        }
      } else {
        for (const t of RESTORE_ORDER) {
          const rows = await backup.getTable(t);
          const filtered = targetCompany
            ? rows.filter((r: any) => r.company_id === targetCompany)
            : rows;
          if (filtered.length) preview[t] = filtered.length;
        }
      }
      return jsonOk({
        mode: "preview",
        version: backup.version,
        scope: backupScope,
        backup_company_id: backupCompanyId,
        caller_company_id: callerCompanyId,
        backup_date: backupJson.created_at,
        tables: preview,
        manifest_rows: backup.version >= 4 ? (backupJson.tables ?? {}) : undefined,
        manifest_parts: backup.version >= 4 ? (backupJson.parts ?? {}) : undefined,
        tables_not_restored: Object.keys(notRestored).length ? notRestored : undefined,
        total_tables_in_backup: backupJson.tables && backup.version >= 4
          ? Object.keys(backupJson.tables).length
          : undefined,
        storage_manifest: backupJson.storage_counts ?? undefined,
      });
    }

    if (mode !== "restore") return jsonErr("mode deve ser 'preview' ou 'restore'", 400);

    // ---- RESTORE ATÓMICO (#203) ----
    // Nada toca em produção antes de estar carregado e validado na área de
    // carga restore_shadow. A troca é uma única transação na base
    // (restore_apply_from_shadow): ou entra tudo, ou a produção não muda.
    const applyScope: "company" | "global" = backupScope === "company" ? "company" : "global";
    const applyCompanyId = backupScope === "company" ? backupCompanyId : null;

    const tablesToRestore = RESTORE_ORDER.filter((t) => backup.count(t) > 0);
    if (tablesToRestore.length === 0) return jsonErr("O backup não tem linhas para restaurar", 422);
    const manifestCounts: Record<string, number> = {};
    for (const t of tablesToRestore) manifestCounts[t] = backup.count(t);
    const rowsTotal = Object.values(manifestCounts).reduce((a, b) => a + b, 0);

    // Linha de auditoria desta corrida de restauro.
    const { data: runRow } = await admin.from("backup_runs").insert({
      run_date: new Date().toISOString().slice(0, 10),
      scope: logScope,
      company_id: applyCompanyId,
      slug: backupJson.company_slug ?? (applyScope === "global" ? "global" : null),
      status: "running",
      folder_path: backup_file.replace(/\/manifest\.json$/, ""),
      tables_count: tablesToRestore.length,
      rows_total: rowsTotal,
    }).select("id").maybeSingle();
    const restoreRunId: string | null = runRow?.id ?? null;
    const closeRun = async (fields: Record<string, unknown>) => {
      if (!restoreRunId) return;
      await admin.from("backup_runs")
        .update({ ...fields, finished_at: new Date().toISOString() })
        .eq("id", restoreRunId);
    };

    try {
      // (b) Sombras com as colunas de HOJE, sem constraints/triggers/índices.
      const { data: prepared, error: prepErr } = await admin
        .rpc("restore_shadow_prepare", { p_tables: tablesToRestore });
      if (prepErr) throw new Error(`restore_shadow_prepare: ${prepErr.message}`);

      // (c) Carga em lotes. Colunas desconhecidas são removidas contra as
      // colunas da sombra (information_schema), nunca por amostra de linha.
      const loaded: Record<string, { rows: number; unknown_cols?: string[] }> = {};
      const stampedLegacy: Record<string, number> = {};
      for (const t of tablesToRestore) {
        const rows = await backup.getTable(t);
        // #96: linhas de backup legacy sem company_id recebem o alvo explícito.
        if (backupScope === "legacy" && targetCompanyId && rows.length) {
          const s = await stampLegacyCompanyId(admin, { [t]: rows }, targetCompanyId);
          if (s[t]) stampedLegacy[t] = s[t];
        }
        let n = 0;
        const unknown = new Set<string>();
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { data: res, error } = await admin.rpc("restore_shadow_load", {
            p_table: t, p_rows: batch,
          });
          if (error) throw new Error(`carga de ${t} (lote ${Math.floor(i / 500)}): ${error.message}`);
          n += Number((res as any)?.inserted ?? 0);
          for (const c of ((res as any)?.unknown_cols ?? [])) unknown.add(c);
        }
        loaded[t] = { rows: n, ...(unknown.size ? { unknown_cols: Array.from(unknown) } : {}) };
      }

      // (d) Validação por SQL: contagens, FKs e company_id. Produção intacta.
      const { data: validation, error: valErr } = await admin.rpc("restore_shadow_validate", {
        p_scope: applyScope, p_company_id: applyCompanyId,
        p_tables: tablesToRestore, p_counts: manifestCounts,
      });
      if (valErr) throw new Error(`restore_shadow_validate: ${valErr.message}`);
      if (!(validation as any)?.ok) {
        await closeRun({ status: "error", error_text: JSON.stringify((validation as any)?.errors ?? []).slice(0, 4000) });
        return jsonOk({
          success: false, mode: "restore", stage: "validation",
          scope: backupScope, backup_file, backup_date: backupJson.created_at,
          shadow_kept: true, loaded, validation,
          message: "Validação falhou — a produção NÃO foi tocada. As sombras ficam em restore_shadow para inspecção.",
        });
      }

      // (e) Troca atómica.
      const { data: applied, error: applyErr } = await admin.rpc("restore_apply_from_shadow", {
        p_scope: applyScope, p_company_id: applyCompanyId, p_tables: tablesToRestore,
      });
      if (applyErr) {
        await closeRun({ status: "error", error_text: `restore_apply_from_shadow: ${applyErr.message}`.slice(0, 4000) });
        return jsonOk({
          success: false, mode: "restore", stage: "apply",
          scope: backupScope, backup_file, shadow_kept: true, loaded,
          error: applyErr.message,
          message: "A aplicação falhou e desfez-se por inteiro — a produção ficou como estava.",
        });
      }

      // (4) Limpeza das sombras + auditoria.
      let shadowsDropped = 0;
      if (!keepShadow) {
        const { data: dropped } = await admin.rpc("restore_shadow_cleanup", { p_tables: tablesToRestore });
        shadowsDropped = Number(dropped ?? 0);
      }
      const insertedTotal = Object.values(((applied as any)?.inserted ?? {}) as Record<string, number>)
        .reduce((a, b) => a + Number(b), 0);
      await closeRun({ status: "ok", rows_total: insertedTotal, tables_count: tablesToRestore.length });

      return jsonOk({
        success: true,
        mode: "restore",
        scope: backupScope,
        log_scope: logScope,
        backup_company_id: backupCompanyId,
        applied_company_id: applyCompanyId,
        backup_file,
        backup_date: backupJson.created_at,
        total_tables: tablesToRestore.length,
        rows_total: insertedTotal,
        shadow_tables: Object.keys((prepared as any) ?? {}).length,
        shadows_dropped: shadowsDropped,
        shadow_kept: keepShadow,
        validation,
        loaded,
        applied,
        tables_not_restored: Object.keys(notRestored).length ? notRestored : undefined,
        backup_run_id: restoreRunId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await closeRun({ status: "error", error_text: msg.slice(0, 4000) });
      return jsonErr(`${msg} — produção NÃO tocada; sombras deixadas para inspecção`, 500);
    }

  } catch (err) {
    console.error("[database-restore] fatal", err);
    return jsonErr(err instanceof Error ? err.message : "Erro desconhecido", 500);
  }
});

function jsonOk(body: any) {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function jsonErr(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
