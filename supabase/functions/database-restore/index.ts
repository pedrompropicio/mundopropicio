// database-restore — restauro COMPLETO multi-tenant.
// - Aceita backups v3 (scope:"company") OU v2 (legacy, sem company_id no JSON).
// - Caller resolve a sua company_id; só restaura linhas que tenham essa company_id.
// - Tabelas globais (cities/companies/role_permissions/login_attempts/mfa_*) NUNCA
//   são tocadas por restores de empresa. Só platform_admin sem active_company_id
//   pode restaurar dados globais (via ficheiro backup-global-*).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ORPHAN_CHILD_TABLES_TO_CLEAR = ["event_cache_payments"];
const SINGLETON_INT_PK = new Set(["email_send_state"]);

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

    const { backup_file, mode } = await req.json();
    if (!backup_file) return jsonErr("backup_file é obrigatório", 400);

    const { data: file, error: dlErr } = await admin.storage
      .from("database-backups").download(backup_file);
    if (dlErr || !file) return jsonErr(`Erro ao descarregar backup: ${dlErr?.message}`, 400);

    const backupJson = JSON.parse(await file.text());
    const tables = backupJson.tables;
    if (!tables) return jsonErr("Backup inválido: campo 'tables' ausente", 400);

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

    // Lista de tabelas a restaurar
    const RESTORE_ORDER = backupScope === "global" ? RESTORE_ORDER_GLOBAL : RESTORE_ORDER_TENANT;
    const DELETE_ORDER = [...RESTORE_ORDER].reverse();

    // ---- PREVIEW ----
    if (mode === "preview") {
      const preview: Record<string, number> = {};
      const targetCompany = backupScope === "company" ? backupCompanyId
        : (backupScope === "legacy" && callerCompanyId) ? callerCompanyId : null;

      for (const t of RESTORE_ORDER) {
        const rows = tables[t] ?? [];
        const filtered = targetCompany
          ? rows.filter((r: any) => r.company_id === targetCompany)
          : rows;
        if (filtered.length) preview[t] = filtered.length;
      }
      return jsonOk({
        mode: "preview",
        scope: backupScope,
        backup_company_id: backupCompanyId,
        caller_company_id: callerCompanyId,
        backup_date: backupJson.created_at,
        tables: preview,
      });
    }

    if (mode !== "restore") return jsonErr("mode deve ser 'preview' ou 'restore'", 400);

    // ---- RESTORE ----
    // Determina que company_id usar para filtragem.
    // - scope=company → sempre o do JSON
    // - scope=legacy (platform_admin) → não filtra (restaura tudo do JSON)
    // - scope=global → não filtra
    const filterCompany = backupScope === "company" ? backupCompanyId : null;

    const results: Record<string, any> = {};

    // Limpa tabelas órfãs (só relevantes para tenant)
    if (backupScope !== "global") {
      for (const t of ORPHAN_CHILD_TABLES_TO_CLEAR) {
        try {
          let q = admin.from(t).delete().gte("created_at", "1900-01-01");
          if (filterCompany) q = admin.from(t).delete().eq("company_id", filterCompany);
          const { error } = await q;
          results[`__orphan_${t}`] = { deleted: error ? "fail" : (filterCompany ? "company" : "all"), inserted: 0, error: error?.message };
        } catch (e) {
          results[`__orphan_${t}`] = { deleted: "fail", inserted: 0, error: String(e) };
        }
      }
    }

    // DELETE — só apaga linhas com company_id do caller (quando aplicável)
    for (const t of DELETE_ORDER) {
      if (!tables[t]) continue;
      try {
        let error: any = null;
        if (filterCompany) {
          // Apaga só linhas dessa empresa
          const { error: e } = await admin.from(t).delete().eq("company_id", filterCompany);
          error = e;
        } else if (SINGLETON_INT_PK.has(t)) {
          const { error: e } = await admin.from(t).delete().gte("id", -2147483648);
          error = e;
        } else {
          const { error: e } = await admin.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          error = e;
          if (error) {
            const { error: e2 } = await admin.from(t).delete().gte("created_at", "1900-01-01");
            error = e2;
          }
        }
        results[t] = { deleted: error ? "fail" : (filterCompany ? "company" : "all"), inserted: 0, error: error?.message };
      } catch (e) {
        results[t] = { deleted: "fail", inserted: 0, error: String(e) };
      }
    }

    const liveCols = await fetchLiveColumns(admin, RESTORE_ORDER);

    // INSERT — só insere linhas com company_id correto
    for (const t of RESTORE_ORDER) {
      const rowsRaw = tables[t];
      if (!rowsRaw || rowsRaw.length === 0) {
        if (!results[t]) results[t] = { deleted: "n/a", inserted: 0 };
        continue;
      }

      // Filtro multi-tenant
      const rows = filterCompany
        ? rowsRaw.filter((r: any) => r.company_id === filterCompany)
        : rowsRaw;
      const droppedByTenant = rowsRaw.length - rows.length;

      const cols = liveCols[t];
      let { cleanRows, skipped } = cols
        ? stripUnknownCols(rows, cols)
        : { cleanRows: rows, skipped: [] as string[] };

      // Dedup ticket_sales
      let dedupRemoved = 0;
      if (t === "ticket_sales") {
        const seen = new Set<string>();
        const deduped: any[] = [];
        for (const r of cleanRows) {
          if (r.source === "import") {
            const key = [r.zone_id, r.lot_id ?? "00000000-0000-0000-0000-000000000000", r.sale_date, r.unit_price, r.financial_account_id].join("|");
            if (seen.has(key)) { dedupRemoved++; continue; }
            seen.add(key);
          }
          deduped.push(r);
        }
        cleanRows = deduped;
      }

      let inserted = 0;
      const batchSize = 500;
      let lastErr: string | undefined;
      for (let i = 0; i < cleanRows.length; i += batchSize) {
        const batch = cleanRows.slice(i, i + batchSize);
        const { error } = await admin.from(t).upsert(batch, { onConflict: "id", ignoreDuplicates: false });
        if (error) {
          lastErr = `batch ${Math.floor(i / batchSize)}: ${error.message}`;
          break;
        }
        inserted += batch.length;
      }
      results[t] = {
        ...(results[t] ?? { deleted: "n/a", inserted: 0 }),
        inserted,
        ...(droppedByTenant > 0 ? { dropped_by_tenant_filter: droppedByTenant } : {}),
        skipped_cols: skipped.length ? skipped : undefined,
        ...(dedupRemoved > 0 ? { dedup_removed: dedupRemoved } : {}),
        error: lastErr ?? results[t]?.error,
      };
    }

    const errors = Object.entries(results).filter(([, r]) => (r as any).error);
    return jsonOk({
      success: errors.length === 0,
      mode: "restore",
      scope: backupScope,
      backup_company_id: backupCompanyId,
      filtered_company_id: filterCompany,
      backup_file,
      backup_date: backupJson.created_at,
      total_tables: Object.keys(results).length,
      tables_with_errors: errors.length,
      results,
    });
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
async function fetchLiveColumns(admin: any, tableNames: string[]) {
  const out: Record<string, Set<string>> = {};
  for (const t of tableNames) {
    try {
      const { data, error } = await admin.from(t).select("*").limit(1);
      if (!error && data) {
        const cols = new Set<string>();
        if (data.length > 0) Object.keys(data[0]).forEach((k) => cols.add(k));
        if (cols.size > 0) out[t] = cols;
      }
    } catch {}
  }
  return out;
}
function stripUnknownCols(rows: any[], allowed: Set<string>) {
  const skipped = new Set<string>();
  const cleanRows = rows.map((r) => {
    const o: any = {};
    for (const k of Object.keys(r)) {
      if (allowed.has(k)) o[k] = r[k];
      else skipped.add(k);
    }
    return o;
  });
  return { cleanRows, skipped: Array.from(skipped) };
}
