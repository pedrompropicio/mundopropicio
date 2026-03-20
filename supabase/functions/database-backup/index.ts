import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TABLES_TO_BACKUP = [
  "events",
  "event_dates",
  "event_forecasts",
  "event_cache_configs",
  "event_cache_deductions",
  "event_ticket_zones",
  "event_ticket_lots",
  "ticket_sales",
  "transactions",
  "transaction_documents",
  "transaction_audit_log",
  "account_categories",
  "suppliers",
  "supplier_documents",
  "financial_accounts",
  "payment_lists",
  "payment_list_items",
  "quotations",
  "cities",
  "venues",
  "venue_reservations",
  "profiles",
  "user_roles",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin (if called from frontend)
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader !== `Bearer ${serviceRoleKey}`) {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Check admin role
      const { data: roleData } = await anonClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Apenas administradores podem criar backups" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Export all tables
    const backup: Record<string, unknown[]> = {};
    const errors: string[] = [];

    for (const table of TABLES_TO_BACKUP) {
      const { data, error } = await adminClient.from(table).select("*");
      if (error) {
        errors.push(`${table}: ${error.message}`);
        backup[table] = [];
      } else {
        backup[table] = data || [];
      }
    }

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `backup-${timestamp}.json`;

    const backupData = {
      created_at: now.toISOString(),
      tables: backup,
      table_counts: Object.fromEntries(
        Object.entries(backup).map(([k, v]) => [k, v.length])
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

    if (uploadError) {
      throw new Error(`Erro ao guardar backup: ${uploadError.message}`);
    }

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
