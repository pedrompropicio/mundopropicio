// Multi-tenant backup: gera 1 ficheiro por empresa + 1 ficheiro global.
// Cron continua a chamar via anon JWT (sem company_id) → faz loop por todas
// as companies ativas. Admin de empresa pode chamar manualmente → recebe só
// o backup da SUA empresa. Platform_admin pode pedir backup específico.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tabelas tenant-scoped (têm company_id) — backup filtrado por empresa
const TENANT_TABLES = [
  "account_categories",
  "profiles", "user_roles", "user_permissions",
  "partner_event_access", "push_subscriptions",
  "financial_accounts", "financial_account_access",
  "suppliers", "supplier_documents",
  "supplier_credits", "supplier_credit_usages",
  "venues", "venue_reservations",
  "events", "event_dates", "event_sessions",
  "event_implementations",
  "event_ticket_zones", "event_ticket_lots",
  "event_ticket_office_assignments", "event_ticket_office_advances",
  "ticket_office_settlements",
  "event_partners", "event_partner_extras",
  "event_cache_configs", "event_cache_deductions", "event_cache_extras",
  "event_cache_tiers", "event_cache_city_settlements", "event_cache_payments",
  "event_closing_costs",
  "event_forecasts", "event_forecast_partners",
  "event_forecast_formalidade_log",
  "bp_orphan_attachments", "bp_versions", "bp_version_audit_log",
  "ticket_sales", "ticket_import_logs",
  "transactions", "transaction_documents", "transaction_audit_log",
  "transaction_payments",
  "partner_paid_expenses", "partner_advance_expenses",
  "payment_lists", "payment_list_items",
  "quotations", "recurring_transactions",
  "reimbursement_notes", "reimbursement_note_items",
  "camarim_sessions", "camarim_session_events", "camarim_items",
  "camarim_item_documents", "camarim_item_reviews",
  "camarim_integrations", "camarim_fund_moves",
  "accounting_exports",
  "system_audit_log", "forecast_audit_log", "user_activity_log",
  "trash", "undo_actions",
  "company_invitations",
  "email_send_log", "email_send_state",
  "email_unsubscribe_tokens", "suppressed_emails",
];

// Tabelas globais — backup separado, partilhado por todas as companies
const GLOBAL_TABLES = [
  "cities", "companies", "role_permissions",
  "login_attempts", "mfa_recovery_codes", "mfa_trusted_devices",
];

const STORAGE_BUCKETS = [
  "database-backups",
  "transaction-documents", "supplier-documents",
  "partner-extra-documents", "cache-extra-documents",
  "closing-cost-documents", "import-reports",
];

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

async function fetchAllRows(adminClient: any, table: string, filter?: { col: string; val: string }) {
  const rows: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let q = adminClient.from(table).select("*").range(from, from + pageSize - 1);
    if (filter) q = q.eq(filter.col, filter.val);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
    if (data.length < pageSize) break;
  }
  return rows;
}

async function buildCompanyBackup(adminClient: any, companyId: string, companySlug: string) {
  const tables: Record<string, any[]> = {};
  const errors: string[] = [];

  for (const t of TENANT_TABLES) {
    try {
      tables[t] = await fetchAllRows(adminClient, t, { col: "company_id", val: companyId });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      tables[t] = [];
    }
  }

  return {
    version: 3,
    scope: "company",
    company_id: companyId,
    company_slug: companySlug,
    created_at: new Date().toISOString(),
    tables,
    table_counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    errors: errors.length ? errors : undefined,
  };
}

async function buildGlobalBackup(adminClient: any) {
  const tables: Record<string, any[]> = {};
  const errors: string[] = [];
  for (const t of GLOBAL_TABLES) {
    try {
      tables[t] = await fetchAllRows(adminClient, t);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      tables[t] = [];
    }
  }
  // Storage manifest fica no global (é cross-tenant por natureza)
  const storageManifest: Record<string, any[]> = {};
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

  return {
    version: 3,
    scope: "global",
    created_at: new Date().toISOString(),
    tables,
    storage_manifest: storageManifest,
    table_counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    storage_counts: Object.fromEntries(Object.entries(storageManifest).map(([k, v]) => [k, v.length])),
    errors: errors.length ? errors : undefined,
  };
}

async function uploadBackup(adminClient: any, fileName: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const { error } = await adminClient.storage
    .from("database-backups")
    .upload(fileName, blob, { contentType: "application/json", upsert: false });
  if (error) throw new Error(`upload ${fileName}: ${error.message}`);
}

/**
 * Mantém os últimos 30 backups POR EMPRESA (e 30 globais).
 * Detecta scope/empresa pelo prefixo do nome:
 *   - backup-global-YYYY...json
 *   - backup-<slug>-YYYY...json   (empresa)
 *   - backup-YYYY...json          (legacy v2 — tratado como "_legacy")
 */
async function rotateOldBackups(adminClient: any) {
  const { data: files } = await adminClient.storage
    .from("database-backups")
    .list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (!files) return;

  const groups = new Map<string, any[]>();
  for (const f of files) {
    const name: string = f.name;
    let key = "_legacy";
    if (name.startsWith("backup-global-")) key = "global";
    else {
      // backup-<slug>-<timestamp>.json — slug pode conter "-"
      const m = name.match(/^backup-(.+)-\d{4}-\d{2}-\d{2}T/);
      if (m) key = m[1];
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const toDelete: string[] = [];
  for (const [, list] of groups) {
    list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    if (list.length > 30) toDelete.push(...list.slice(30).map((f) => f.name));
  }
  if (toDelete.length) {
    await adminClient.storage.from("database-backups").remove(toDelete);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

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

    // Resolver scope: cron (machine) ou admin específico de empresa
    let targetCompanyIds: string[] = [];
    let isPlatformAdmin = false;

    if (isMachine) {
      // Cron gate: janela 02:00-05:00 Europe/Lisbon (cobre inverno UTC+0 e
      // verão UTC+1 quando o cron dispara às 03:00 UTC). Sem bypass — execuções
      // manuais devem usar role admin via UI/CLI, não JWT anon.
      const lisbonHour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false,
        }).format(new Date()),
      );
      if (lisbonHour < 2 || lisbonHour > 5) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "outside backup window (Europe/Lisbon 02:00-05:00)", lisbonHour }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Guarda idempotente: se já existe um backup-global de hoje (UTC), saltar
      const todayUtc = new Date().toISOString().slice(0, 10);
      const { data: existingToday } = await adminClient.storage
        .from("database-backups")
        .list("", { limit: 1000, search: `backup-global-${todayUtc}` });
      if ((existingToday ?? []).some((f: any) => f.name?.startsWith(`backup-global-${todayUtc}`))) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "already ran today", date: todayUtc }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Cron faz backup de TODAS as empresas ativas
      const { data: companies } = await adminClient
        .from("companies").select("id").eq("status", "active");
      targetCompanyIds = (companies ?? []).map((c: any) => c.id);
    } else {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Admin role check
      const { data: roleData } = await adminClient
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Apenas administradores podem criar backups" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: isPaRow } = await adminClient.rpc("is_platform_admin", { _user_id: userId });
      isPlatformAdmin = Boolean(isPaRow);

      const { data: profile } = await adminClient
        .from("profiles").select("company_id, active_company_id").eq("id", userId).maybeSingle();
      const callerCompanyId = isPlatformAdmin
        ? (profile?.active_company_id ?? profile?.company_id ?? null)
        : (profile?.company_id ?? null);

      // Platform admin com active_company_id: backup só dessa company
      // Platform admin sem active: backup de todas
      // Admin normal: só a sua company
      if (isPlatformAdmin && !callerCompanyId) {
        const { data: companies } = await adminClient
          .from("companies").select("id").eq("status", "active");
        targetCompanyIds = (companies ?? []).map((c: any) => c.id);
      } else if (callerCompanyId) {
        targetCompanyIds = [callerCompanyId];
      } else {
        return new Response(JSON.stringify({ error: "Sem empresa associada" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Resolver slugs das companies alvo
    const { data: companyRows } = await adminClient
      .from("companies").select("id, slug").in("id", targetCompanyIds);
    const slugById = new Map<string, string>(
      (companyRows ?? []).map((c: any) => [c.id, c.slug]),
    );

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const summary: any = { backups: [], errors: [] as string[] };

    // 1) Global (uma vez por execução)
    try {
      const globalData = await buildGlobalBackup(adminClient);
      const globalName = `backup-global-${ts}.json`;
      await uploadBackup(adminClient, globalName, globalData);
      summary.backups.push({
        scope: "global", file: globalName,
        table_counts: globalData.table_counts,
        storage_counts: globalData.storage_counts,
      });
    } catch (e) {
      summary.errors.push(`global: ${e instanceof Error ? e.message : "?"}`);
    }

    // 2) Por empresa
    for (const companyId of targetCompanyIds) {
      const slug = slugById.get(companyId) ?? companyId.slice(0, 8);
      try {
        const data = await buildCompanyBackup(adminClient, companyId, slug);
        const fileName = `backup-${slug}-${ts}.json`;
        await uploadBackup(adminClient, fileName, data);
        summary.backups.push({
          scope: "company", company_id: companyId, slug, file: fileName,
          table_counts: data.table_counts,
        });
      } catch (e) {
        summary.errors.push(`${slug}: ${e instanceof Error ? e.message : "?"}`);
      }
    }

    // 3) Rotação 30 últimos por grupo
    try {
      await rotateOldBackups(adminClient);
    } catch (e) {
      summary.errors.push(`rotation: ${e instanceof Error ? e.message : "?"}`);
    }

    return new Response(
      JSON.stringify({
        success: summary.errors.length === 0,
        ...summary,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Backup error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
