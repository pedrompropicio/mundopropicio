// HARDENED RESTORE — corrige bugs do database-restore antigo
// 1) Limpa tabelas filhas (criadas após o backup) antes de apagar pais
// 2) email_send_state usa filtro inteiro
// 3) Strip de colunas obsoletas / inexistentes por tabela
// 4) Continua mesmo que uma tabela falhe — relata tudo

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tabelas filhas/novas no Live que dependem de tabelas do backup —
// devem ser limpas ANTES dos pais para libertar FKs.
const ORPHAN_CHILD_TABLES_TO_CLEAR = [
  "event_forecast_partners",      // FK -> event_forecasts
  "event_cache_city_settlements", // FK -> event_cache_configs / events
  "event_cache_tiers",            // FK -> event_cache_configs
  "event_ticket_office_advances", // FK -> events
  "ticket_office_settlements",    // FK -> events / financial_accounts
  "transaction_payments",         // FK -> transactions
  "supplier_credit_usages",       // FK -> supplier_credits / transactions
  "supplier_credits",             // FK -> suppliers
  "trash",                        // referencia entidades
  "undo_actions",                 // referencia entidades
  "user_activity_log",            // referencia user
  "push_subscriptions",           // referencia user
  "event_implementations",        // FK -> events
];

// Tabelas com PK não-uuid (ex.: integer)
const SINGLETON_INT_PK = new Set(["email_send_state"]);

// Ordem de inserção — pais primeiro, filhos depois
const RESTORE_ORDER = [
  "cities", "venues", "venue_reservations",
  "account_categories", "role_permissions",
  "profiles", "user_roles", "user_permissions",
  "financial_accounts", "financial_account_access",
  "suppliers", "supplier_documents",
  "events", "event_dates", "event_sessions",
  "event_ticket_zones", "event_ticket_lots",
  "event_cache_configs", "event_cache_deductions", "event_cache_extras",
  "event_closing_costs",
  "event_forecasts", "event_partners", "event_partner_extras",
  "event_ticket_office_assignments",
  "ticket_sales", "ticket_import_logs",
  "transactions", "transaction_documents", "transaction_audit_log",
  "partner_paid_expenses", "partner_event_access",
  "payment_lists", "payment_list_items",
  "quotations", "recurring_transactions",
  "reimbursement_notes", "reimbursement_note_items",
  "accounting_exports", "system_audit_log", "forecast_audit_log",
  "login_attempts",
  "email_send_log", "email_send_state", "email_unsubscribe_tokens",
  "suppressed_emails",
];

const DELETE_ORDER = [...RESTORE_ORDER].reverse();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Auth — aceita service_role / anon (chamada de máquina) ou admin user
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let role: string | null = null;
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      role = payload?.role ?? null;
      userId = payload?.sub ?? null;
    } catch { /* not jwt */ }

    // SECURITY: only service_role (cron / internal) OR an authenticated admin user.
    // 'anon' role is a public JWT and MUST NOT bypass admin gate.
    const isMachine = role === "service_role";
    if (!isMachine) {
      if (!userId) return jsonErr("Não autorizado", 401);
      const { data: roleRow } = await admin
        .from("user_roles").select("role")
        .eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) return jsonErr("Apenas administradores podem restaurar backups", 403);
    }

    const { backup_file, mode } = await req.json();
    if (!backup_file) return jsonErr("backup_file é obrigatório", 400);

    // Descarregar backup
    const { data: file, error: dlErr } = await admin.storage
      .from("database-backups").download(backup_file);
    if (dlErr || !file) return jsonErr(`Erro ao descarregar backup: ${dlErr?.message}`, 400);

    const backupJson = JSON.parse(await file.text());
    const tables = backupJson.tables;
    if (!tables) return jsonErr("Backup inválido: campo 'tables' ausente", 400);

    // PREVIEW
    if (mode === "preview") {
      const preview: Record<string, number> = {};
      for (const t of RESTORE_ORDER) if (tables[t]) preview[t] = tables[t].length;
      return jsonOk({
        mode: "preview", backup_date: backupJson.created_at,
        tables: preview,
        orphan_children_to_clear: ORPHAN_CHILD_TABLES_TO_CLEAR,
      });
    }
    if (mode !== "restore") return jsonErr("mode deve ser 'preview' ou 'restore'", 400);

    // === RESTORE ===
    const results: Record<string, { deleted: string; inserted: number; skipped_cols?: string[]; error?: string }> = {};

    // STEP 0 — Apagar tabelas filhas/novas que segurariam FKs
    for (const t of ORPHAN_CHILD_TABLES_TO_CLEAR) {
      try {
        // tenta apagar tudo via timestamp (cobre tanto PK uuid como int)
        const { error } = await admin.from(t).delete().gte("created_at", "1900-01-01");
        if (error) {
          // fallback: por id != uuid sentinela
          const { error: e2 } = await admin.from(t).delete().not("id", "is", null);
          results[`__orphan_${t}`] = { deleted: e2 ? "fail" : "all", inserted: 0, error: e2?.message };
        } else {
          results[`__orphan_${t}`] = { deleted: "all", inserted: 0 };
        }
      } catch (e) {
        results[`__orphan_${t}`] = { deleted: "fail", inserted: 0, error: String(e) };
      }
    }

    // STEP 1 — Apagar tabelas do backup em ordem reversa
    for (const t of DELETE_ORDER) {
      if (!tables[t]) continue;
      try {
        let error: any = null;
        if (SINGLETON_INT_PK.has(t)) {
          const { error: e } = await admin.from(t).delete().gte("id", -2147483648);
          error = e;
        } else {
          const { error: e } = await admin.from(t).delete()
            .neq("id", "00000000-0000-0000-0000-000000000000");
          error = e;
          if (error) {
            const { error: e2 } = await admin.from(t).delete().gte("created_at", "1900-01-01");
            error = e2;
          }
        }
        results[t] = { deleted: error ? "fail" : "all", inserted: 0, error: error?.message };
      } catch (e) {
        results[t] = { deleted: "fail", inserted: 0, error: String(e) };
      }
    }

    // STEP 2 — Descobrir colunas reais de cada tabela (para strip de obsoletas)
    const liveCols = await fetchLiveColumns(admin, RESTORE_ORDER);

    // STEP 3 — Inserir tabelas em ordem de dependência
    for (const t of RESTORE_ORDER) {
      const rows = tables[t];
      if (!rows || rows.length === 0) {
        if (!results[t]) results[t] = { deleted: "n/a", inserted: 0 };
        continue;
      }
      const cols = liveCols[t];
      const { cleanRows, skipped } = cols
        ? stripUnknownCols(rows, cols)
        : { cleanRows: rows, skipped: [] as string[] };

      let inserted = 0;
      const batchSize = 500;
      let lastErr: string | undefined;
      for (let i = 0; i < cleanRows.length; i += batchSize) {
        const batch = cleanRows.slice(i, i + batchSize);
        const onConflict = SINGLETON_INT_PK.has(t) ? "id" : "id";
        const { error } = await admin.from(t).upsert(batch, { onConflict, ignoreDuplicates: false });
        if (error) {
          lastErr = `batch ${Math.floor(i / batchSize)}: ${error.message}`;
          // continua próximas tabelas; não paramos tudo
          break;
        }
        inserted += batch.length;
      }
      results[t] = {
        ...(results[t] ?? { deleted: "n/a", inserted: 0 }),
        inserted,
        skipped_cols: skipped.length ? skipped : undefined,
        error: lastErr ?? results[t]?.error,
      };
    }

    const errors = Object.entries(results).filter(([, r]) => r.error);
    return jsonOk({
      success: errors.length === 0,
      mode: "restore",
      backup_file,
      backup_date: backupJson.created_at,
      total_tables: Object.keys(results).length,
      tables_with_errors: errors.length,
      results,
    });
  } catch (err) {
    console.error("[restore-v2] fatal", err);
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
  // 1 chamada agregada via RPC seria ideal, mas como não temos, fazemos PostgREST batch:
  const out: Record<string, Set<string>> = {};
  // A forma mais simples e estável: chamar information_schema via REST não é trivial.
  // Em vez disso, lemos 1 linha (ou nenhuma) de cada tabela para inferir as colunas.
  for (const t of tableNames) {
    try {
      const { data, error } = await admin.from(t).select("*").limit(1);
      if (!error && data) {
        const cols = new Set<string>();
        if (data.length > 0) {
          Object.keys(data[0]).forEach((k) => cols.add(k));
        } else {
          // Se a tabela está vazia, fazemos um insert dummy → não. Em vez disso, deixamos undefined
          // e o upsert apanha o erro se houver coluna desconhecida (improvável: o schema é o mesmo do Test).
        }
        if (cols.size > 0) out[t] = cols;
      }
    } catch { /* ignore */ }
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
