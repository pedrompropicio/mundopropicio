import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Ordered by dependency (parents first, children last)
const RESTORE_ORDER = [
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
  "event_closing_costs",
  "event_forecasts",
  "event_partners",
  "event_partner_extras",
  "event_ticket_office_assignments",
  "ticket_sales",
  "ticket_import_logs",
  "transactions",
  "transaction_documents",
  "transaction_audit_log",
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
  "login_attempts",
  "email_send_log",
  "email_send_state",
  "email_unsubscribe_tokens",
  "suppressed_emails",
];

// Delete in reverse order (children first)
const DELETE_ORDER = [...RESTORE_ORDER].reverse();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      const anonClient = createClient(supabaseUrl, anonKey);
      const token = authHeader.replace("Bearer ", "");
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

      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        return new Response(JSON.stringify({ error: "Apenas administradores podem restaurar backups" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { backup_file, mode } = body;

    if (!backup_file) {
      return new Response(JSON.stringify({ error: "Nome do ficheiro de backup é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download backup file from storage
    const { data: fileData, error: downloadErr } = await adminClient.storage
      .from("database-backups")
      .download(backup_file);

    if (downloadErr || !fileData) {
      return new Response(JSON.stringify({ error: `Erro ao descarregar backup: ${downloadErr?.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const backupJson = JSON.parse(await fileData.text());
    const tables = backupJson.tables;

    if (!tables) {
      return new Response(JSON.stringify({ error: "Formato de backup inválido: campo 'tables' não encontrado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode: "preview" just returns counts, "restore" does the actual restore
    if (mode === "preview") {
      const preview: Record<string, { backup_rows: number }> = {};
      for (const table of RESTORE_ORDER) {
        if (tables[table]) {
          preview[table] = { backup_rows: tables[table].length };
        }
      }
      return new Response(
        JSON.stringify({
          success: true,
          mode: "preview",
          backup_date: backupJson.created_at,
          version: backupJson.version ?? 1,
          tables: preview,
          storage_manifest: backupJson.storage_manifest
            ? Object.fromEntries(
                Object.entries(backupJson.storage_manifest).map(([k, v]: [string, any]) => [k, v.length])
              )
            : null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode !== "restore") {
      return new Response(JSON.stringify({ error: "Mode deve ser 'preview' ou 'restore'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === RESTORE MODE ===
    const results: Record<string, { deleted: boolean; inserted: number; error?: string }> = {};

    // Step 1: Delete all data in reverse dependency order
    for (const table of DELETE_ORDER) {
      if (!tables[table]) continue;
      try {
        // Use a broad delete: delete where id is not null (all rows)
        const { error: delErr } = await adminClient
          .from(table)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
        
        if (delErr) {
          // Some tables may use different PKs; try with created_at
          const { error: delErr2 } = await adminClient
            .from(table)
            .delete()
            .gte("created_at", "1900-01-01");
          if (delErr2) {
            results[table] = { deleted: false, inserted: 0, error: `delete: ${delErr2.message}` };
            continue;
          }
        }
        results[table] = { deleted: true, inserted: 0 };
      } catch (e) {
        results[table] = { deleted: false, inserted: 0, error: `delete: ${e instanceof Error ? e.message : "unknown"}` };
      }
    }

    // Step 2: Insert data in dependency order
    for (const table of RESTORE_ORDER) {
      const rows = tables[table];
      if (!rows || rows.length === 0) {
        if (!results[table]) results[table] = { deleted: true, inserted: 0 };
        continue;
      }

      try {
        // Insert in batches of 500
        let inserted = 0;
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const { error: insertErr } = await adminClient
            .from(table)
            .upsert(batch, { onConflict: "id", ignoreDuplicates: false });
          if (insertErr) {
            results[table] = {
              ...results[table],
              inserted,
              error: `insert batch ${Math.floor(i / batchSize)}: ${insertErr.message}`,
            };
            break;
          }
          inserted += batch.length;
        }
        if (results[table]) {
          results[table].inserted = inserted;
        } else {
          results[table] = { deleted: true, inserted };
        }
      } catch (e) {
        results[table] = {
          ...(results[table] || { deleted: false }),
          inserted: 0,
          error: `insert: ${e instanceof Error ? e.message : "unknown"}`,
        };
      }
    }

    const totalErrors = Object.values(results).filter((r) => r.error).length;

    return new Response(
      JSON.stringify({
        success: totalErrors === 0,
        mode: "restore",
        backup_file,
        backup_date: backupJson.created_at,
        results,
        total_tables: Object.keys(results).length,
        tables_with_errors: totalErrors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Restore error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
