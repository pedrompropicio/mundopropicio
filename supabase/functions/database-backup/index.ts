import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TABLES_TO_BACKUP = [
  "events",
  "event_dates",
  "event_sessions",
  "event_forecasts",
  "event_cache_configs",
  "event_cache_deductions",
  "event_cache_extras",
  "event_closing_costs",
  "event_ticket_zones",
  "event_ticket_lots",
  "event_ticket_office_assignments",
  "event_partners",
  "event_partner_extras",
  "ticket_sales",
  "ticket_offices",
  "ticket_import_logs",
  "transactions",
  "transaction_documents",
  "transaction_audit_log",
  "account_categories",
  "accounting_exports",
  "suppliers",
  "supplier_documents",
  "financial_accounts",
  "financial_account_access",
  "payment_lists",
  "payment_list_items",
  "quotations",
  "recurring_transactions",
  "reimbursement_notes",
  "reimbursement_note_items",
  "partner_paid_expenses",
  "partner_event_access",
  "cities",
  "venues",
  "venue_reservations",
  "system_audit_log",
  "forecast_audit_log",
  "profiles",
  "user_roles",
  "user_permissions",
  "role_permissions",
  "login_attempts",
  "email_send_log",
  "email_send_state",
  "email_unsubscribe_tokens",
  "suppressed_emails",
];

const STORAGE_BUCKETS = [
  "database-backups",
  "transaction-documents",
  "supplier-documents",
  "partner-extra-documents",
  "cache-extra-documents",
  "closing-cost-documents",
  "import-reports",
];

async function listAllFiles(adminClient: any, bucket: string): Promise<any[]> {
  const allFiles: any[] = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await adminClient.storage
      .from(bucket)
      .list("", { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      allFiles.push(...data);
      offset += data.length;
      if (data.length < limit) hasMore = false;
    }
  }
  return allFiles;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller: service role key, anon key (cron), or admin user
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";
    const isServiceRole = token === serviceRoleKey;
    const isCronCall = token === anonKey;

    if (!isServiceRole && !isCronCall) {
      // Must be a user JWT – verify admin role
      const anonClient = createClient(supabaseUrl, anonKey);
      const {
        data: { user },
        error: authErr,
      } = await anonClient.auth.getUser(token);

      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: roleData, error: roleError } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (roleError) throw new Error(`Erro ao validar permissões: ${roleError.message}`);
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Apenas administradores podem criar backups" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Export all tables
    const backup: Record<string, unknown[]> = {};
    const errors: string[] = [];

    for (const table of TABLES_TO_BACKUP) {
      // Paginate to handle tables >1000 rows
      let allRows: unknown[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await adminClient
          .from(table)
          .select("*")
          .range(from, from + pageSize - 1);
        if (error) {
          errors.push(`${table}: ${error.message}`);
          hasMore = false;
        } else if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allRows = allRows.concat(data);
          from += data.length;
          if (data.length < pageSize) hasMore = false;
        }
      }
      backup[table] = allRows;
    }

    // Export storage manifests
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
        errors.push(`storage/${bucket}: ${e instanceof Error ? e.message : "unknown"}`);
        storageManifest[bucket] = [];
      }
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `backup-${timestamp}.json`;

    const backupData = {
      version: 2,
      created_at: now.toISOString(),
      tables: backup,
      storage_manifest: storageManifest,
      table_counts: Object.fromEntries(
        Object.entries(backup).map(([k, v]) => [k, v.length])
      ),
      storage_counts: Object.fromEntries(
        Object.entries(storageManifest).map(([k, v]) => [k, v.length])
      ),
      errors: errors.length > 0 ? errors : undefined,
    };

    const jsonContent = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });

    // Upload to storage
    const { error: uploadError } = await adminClient.storage
      .from("database-backups")
      .upload(fileName, blob, {
        contentType: "application/json",
        upsert: false,
      });

    if (uploadError) throw new Error(`Erro ao guardar backup: ${uploadError.message}`);

    // Clean up old backups (keep last 30)
    const { data: files } = await adminClient.storage
      .from("database-backups")
      .list("", { sortBy: { column: "created_at", order: "desc" } });

    if (files && files.length > 30) {
      const toDelete = files.slice(30).map((f) => f.name);
      await adminClient.storage.from("database-backups").remove(toDelete);
    }

    return new Response(
      JSON.stringify({
        success: true,
        file: fileName,
        table_counts: backupData.table_counts,
        storage_counts: backupData.storage_counts,
        errors: backupData.errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Backup error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
