import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tables ordered by dependency (parents first). Used for both per-table and per-event restore.
const TABLE_ORDER = [
  "cities",
  "venues",
  "venue_reservations",
  "account_categories",
  "role_permissions",
  "profiles",
  "user_roles",
  "user_permissions",
  "financial_accounts",
  "financial_account_access",
  "suppliers",
  "supplier_documents",
  "events",
  "event_dates",
  "event_sessions",
  "event_ticket_zones",
  "event_ticket_lots",
  "event_cache_configs",
  "event_cache_deductions",
  "event_cache_extras",
  "event_cache_payments",
  "event_cache_tiers",
  "event_cache_city_settlements",
  "event_closing_costs",
  "event_forecasts",
  "event_forecast_partners",
  "event_partners",
  "event_partner_extras",
  "event_ticket_office_assignments",
  "event_ticket_office_advances",
  "ticket_sales",
  "ticket_import_logs",
  "transactions",
  "transaction_documents",
  "transaction_audit_log",
  "transaction_payments",
  "partner_paid_expenses",
  "partner_event_access",
  "payment_lists",
  "payment_list_items",
  "quotations",
  "recurring_transactions",
  "reimbursement_notes",
  "reimbursement_note_items",
  "accounting_exports",
  "system_audit_log",
  "forecast_audit_log",
  "bp_orphan_attachments",
  "event_implementations",
];

// Schema fingerprint of expected columns per table (last validated 2026-04-20)
// Used to strip columns that no longer exist in current schema before insert.
const COLUMN_WHITELIST: Record<string, string[]> = {
  ticket_sales: ["id","lot_id","sale_date","quantity","unit_price","notes","created_by","created_at","zone_id","source","sale_date_to","financial_account_id","import_batch_id","total_value","company_id"],
};

/**
 * For a given backup, return the IDs of every row that belongs (directly or transitively)
 * to the selected events. Returns a map of table_name -> Set<id>.
 */
function collectEventScopedIds(
  tables: Record<string, any[]>,
  eventIds: string[],
): Record<string, Set<string>> {
  const eventIdSet = new Set(eventIds);
  const scoped: Record<string, Set<string>> = {};
  const idsOf = (rows: any[]) => new Set(rows.map((r: any) => r.id).filter(Boolean));

  // Direct event_id match
  const directTables = [
    "event_dates",
    "event_sessions",
    "event_ticket_zones",
    "event_cache_configs",
    "event_cache_extras",
    "event_cache_city_settlements",
    "event_cache_payments",
    "event_closing_costs",
    "event_forecasts",
    "event_partners",
    "event_partner_extras",
    "event_ticket_office_assignments",
    "event_ticket_office_advances",
    "ticket_import_logs",
    "transactions",
    "partner_paid_expenses",
    "partner_event_access",
    "quotations",
    "bp_orphan_attachments",
    "event_implementations",
  ];

  for (const t of directTables) {
    const rows = (tables[t] || []).filter((r: any) => eventIdSet.has(r.event_id));
    scoped[t] = idsOf(rows);
  }
  scoped["events"] = new Set(eventIds);

  // Children via parent FK
  const zoneIds = new Set(
    (tables.event_ticket_zones || [])
      .filter((z: any) => eventIdSet.has(z.event_id))
      .map((z: any) => z.id),
  );
  const lots = (tables.event_ticket_lots || []).filter((l: any) => zoneIds.has(l.zone_id));
  scoped["event_ticket_lots"] = idsOf(lots);
  const lotIds = new Set(lots.map((l: any) => l.id));
  const sales = (tables.ticket_sales || []).filter(
    (s: any) => zoneIds.has(s.zone_id) || lotIds.has(s.lot_id),
  );
  scoped["ticket_sales"] = idsOf(sales);

  const cacheConfigIds = new Set(
    (tables.event_cache_configs || [])
      .filter((c: any) => eventIdSet.has(c.event_id))
      .map((c: any) => c.id),
  );
  scoped["event_cache_deductions"] = idsOf(
    (tables.event_cache_deductions || []).filter((d: any) => cacheConfigIds.has(d.cache_config_id)),
  );
  scoped["event_cache_tiers"] = idsOf(
    (tables.event_cache_tiers || []).filter((t: any) => cacheConfigIds.has(t.cache_config_id)),
  );

  const forecastIds = new Set(
    (tables.event_forecasts || [])
      .filter((f: any) => eventIdSet.has(f.event_id))
      .map((f: any) => f.id),
  );
  scoped["event_forecast_partners"] = idsOf(
    (tables.event_forecast_partners || []).filter((fp: any) => forecastIds.has(fp.forecast_id)),
  );
  scoped["forecast_audit_log"] = idsOf(
    (tables.forecast_audit_log || []).filter((a: any) => forecastIds.has(a.forecast_id)),
  );

  const txIds = new Set(
    (tables.transactions || [])
      .filter((t: any) => eventIdSet.has(t.event_id))
      .map((t: any) => t.id),
  );
  scoped["transaction_documents"] = idsOf(
    (tables.transaction_documents || []).filter((d: any) => txIds.has(d.transaction_id)),
  );
  scoped["transaction_audit_log"] = idsOf(
    (tables.transaction_audit_log || []).filter((a: any) => txIds.has(a.transaction_id)),
  );
  scoped["transaction_payments"] = idsOf(
    (tables.transaction_payments || []).filter((p: any) => txIds.has(p.transaction_id)),
  );
  scoped["payment_list_items"] = idsOf(
    (tables.payment_list_items || []).filter((p: any) => txIds.has(p.transaction_id)),
  );

  return scoped;
}

function cleanRow(table: string, row: any): any {
  const whitelist = COLUMN_WHITELIST[table];
  if (!whitelist) return row;
  const clean: any = {};
  for (const col of whitelist) if (row[col] !== undefined) clean[col] = row[col];
  return clean;
}

async function deleteByIds(adminClient: any, table: string, ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const batchSize = 200;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { error } = await adminClient.from(table).delete().in("id", batch);
    if (error) return error.message;
  }
  return null;
}

async function deleteAllInTable(adminClient: any, table: string): Promise<string | null> {
  const { error } = await adminClient.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    // Fallback for tables without `id` PK
    const { error: e2 } = await adminClient.from(table).delete().gte("created_at", "1900-01-01");
    if (e2) return e2.message;
  }
  return null;
}

async function insertRows(
  adminClient: any,
  table: string,
  rows: any[],
): Promise<{ inserted: number; error?: string }> {
  if (rows.length === 0) return { inserted: 0 };
  const batchSize = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map((r) => cleanRow(table, r));
    const { error } = await adminClient.from(table).upsert(batch, { onConflict: "id" });
    if (error) return { inserted, error: error.message };
    inserted += batch.length;
  }
  return { inserted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth: must be admin user (no cron access for restore)
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";

    let role: string | null = null;
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      role = payload?.role ?? null;
      userId = payload?.sub ?? null;
    } catch { /* not a JWT */ }

    let isPlatformAdmin = false;
    let callerCompanyId: string | null = null;
    if (role !== "service_role") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await adminClient
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Apenas administradores podem restaurar" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isPaRow } = await adminClient.rpc("is_platform_admin", { _user_id: userId });
      isPlatformAdmin = Boolean(isPaRow);
      const { data: profile } = await adminClient
        .from("profiles").select("company_id, active_company_id").eq("id", userId).maybeSingle();
      callerCompanyId = isPlatformAdmin
        ? (profile?.active_company_id ?? profile?.company_id ?? null)
        : (profile?.company_id ?? null);
    }

    const body = await req.json();
    const { backup_file, mode, scope, tables: tablesFilter, event_ids } = body as {
      backup_file: string;
      mode: "preview" | "restore";
      scope: "tables" | "events";
      tables?: string[];
      event_ids?: string[];
    };

    if (!backup_file || !mode || !scope) {
      return new Response(JSON.stringify({ error: "backup_file, mode e scope são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (scope === "tables" && (!tablesFilter || tablesFilter.length === 0)) {
      return new Response(JSON.stringify({ error: "Selecione pelo menos uma tabela" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (scope === "events" && (!event_ids || event_ids.length === 0)) {
      return new Response(JSON.stringify({ error: "Selecione pelo menos um evento" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download backup
    const { data: fileData, error: dlErr } = await adminClient.storage
      .from("database-backups").download(backup_file);
    if (dlErr || !fileData) {
      return new Response(JSON.stringify({ error: `Download: ${dlErr?.message}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const backup = JSON.parse(await fileData.text());
    const allTables: Record<string, any[]> = backup.tables || {};

    // ---- MULTI-TENANT GUARD ----
    const backupScope: "company" | "global" | "legacy" =
      backup.scope === "company" ? "company"
      : backup.scope === "global" ? "global"
      : "legacy";
    const backupCompanyId: string | null = backup.company_id ?? null;

    if (backupScope === "global") {
      return new Response(JSON.stringify({ error: "Backup global não suporta restore seletivo" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (backupScope === "company" && role !== "service_role" && backupCompanyId !== callerCompanyId) {
      console.warn(`[selective-restore] Cross-tenant block: caller=${userId} (${callerCompanyId}) tentou restaurar backup de ${backupCompanyId}`);
      return new Response(JSON.stringify({ error: "Este backup pertence a outra empresa" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (backupScope === "legacy" && role !== "service_role" && !isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "Backups antigos (v2) só por platform_admin" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filtro tenant aplicado a todas as rows efetivas
    const tenantFilter = backupScope === "company" ? backupCompanyId : null;

    // Build effective row sets per table
    const effective: Record<string, any[]> = {};

    if (scope === "tables") {
      for (const t of tablesFilter!) {
        if (allTables[t]) {
          effective[t] = tenantFilter
            ? allTables[t].filter((r: any) => r.company_id === tenantFilter)
            : allTables[t];
        }
      }
    } else {
      const scoped = collectEventScopedIds(allTables, event_ids!);
      for (const [t, idSet] of Object.entries(scoped)) {
        if (!allTables[t]) continue;
        const rows = allTables[t].filter((r: any) => idSet.has(r.id));
        effective[t] = tenantFilter
          ? rows.filter((r: any) => r.company_id === tenantFilter)
          : rows;
      }
    }

    // Preview mode → just counts
    if (mode === "preview") {
      const preview: Record<string, number> = {};
      for (const t of TABLE_ORDER) if (effective[t]) preview[t] = effective[t].length;
      return new Response(JSON.stringify({
        success: true, mode: "preview", scope,
        backup_date: backup.created_at,
        tables: preview,
        total_rows: Object.values(preview).reduce((a, b) => a + b, 0),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === RESTORE ===
    const results: Record<string, { deleted: number | "all"; inserted: number; error?: string }> = {};
    const orderedTables = TABLE_ORDER.filter((t) => effective[t] && effective[t].length > 0);

    // Step 1: delete (children first → reverse)
    // Quando há tenantFilter, NUNCA apaga _all_ — apaga só linhas dessa company.
    for (const table of [...orderedTables].reverse()) {
      try {
        if (scope === "tables") {
          if (tenantFilter) {
            const { error } = await adminClient.from(table).delete().eq("company_id", tenantFilter);
            results[table] = { deleted: "all", inserted: 0, ...(error ? { error: `delete: ${error.message}` } : {}) };
          } else {
            const err = await deleteAllInTable(adminClient, table);
            results[table] = { deleted: "all", inserted: 0, ...(err ? { error: `delete: ${err}` } : {}) };
          }
        } else {
          const ids = effective[table].map((r: any) => r.id).filter(Boolean);
          const err = await deleteByIds(adminClient, table, ids);
          results[table] = { deleted: ids.length, inserted: 0, ...(err ? { error: `delete: ${err}` } : {}) };
        }
      } catch (e) {
        results[table] = { deleted: 0, inserted: 0, error: `delete: ${e instanceof Error ? e.message : "?"}` };
      }
    }

    // Step 2: insert (parents first)
    for (const table of orderedTables) {
      if (results[table]?.error) continue;
      const { inserted, error } = await insertRows(adminClient, table, effective[table]);
      results[table] = { ...results[table], inserted, ...(error ? { error: `insert: ${error}` } : {}) };
    }

    const errCount = Object.values(results).filter((r) => r.error).length;
    return new Response(JSON.stringify({
      success: errCount === 0,
      mode: "restore", scope,
      backup_file, backup_date: backup.created_at,
      results,
      total_tables: Object.keys(results).length,
      tables_with_errors: errCount,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("selective-restore error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
