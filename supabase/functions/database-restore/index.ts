import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ORPHAN_CHILD_TABLES_TO_CLEAR = [
  "event_forecast_partners",
  "event_cache_city_settlements",
  "event_cache_tiers",
  "event_ticket_office_advances",
  "ticket_office_settlements",
  "transaction_payments",
  "supplier_credit_usages",
  "supplier_credits",
  "trash",
  "undo_actions",
  "user_activity_log",
  "push_subscriptions",
  "event_implementations",
];

const SINGLETON_INT_PK = new Set(["email_send_state"]);

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
  "event_partners", "event_partner_extras",
  "event_ticket_office_assignments",
  "ticket_sales", "ticket_import_logs",
  // transactions DEVE vir antes de event_forecasts (FK event_forecasts.transaction_id -> transactions.id)
  "transactions", "transaction_documents", "transaction_audit_log",
  "event_forecasts",
  "partner_paid_expenses", "partner_event_access",
  "payment_lists", "payment_list_items",
  "quotations", "recurring_transactions",
  "reimbursement_notes", "reimbursement_note_items",
  "accounting_exports", "system_audit_log",
  // forecast_audit_log depende de event_forecasts
  "forecast_audit_log",
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

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let role: string | null = null;
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      role = payload?.role ?? null;
      userId = payload?.sub ?? null;
    } catch {}

    const isMachine = role === "service_role" || role === "anon";
    if (!isMachine) {
      if (!userId) return jsonErr("Não autorizado", 401);
      const { data: roleRow } = await admin
        .from("user_roles").select("role")
        .eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) return jsonErr("Apenas administradores podem restaurar backups", 403);
    }

    const { backup_file, mode } = await req.json();
    if (!backup_file) return jsonErr("backup_file é obrigatório", 400);

    const { data: file, error: dlErr } = await admin.storage
      .from("database-backups").download(backup_file);
    if (dlErr || !file) return jsonErr(`Erro ao descarregar backup: ${dlErr?.message}`, 400);

    const backupJson = JSON.parse(await file.text());
    const tables = backupJson.tables;
    if (!tables) return jsonErr("Backup inválido: campo 'tables' ausente", 400);

    if (mode === "preview") {
      const preview: Record<string, number> = {};
      for (const t of RESTORE_ORDER) if (tables[t]) preview[t] = tables[t].length;
      return jsonOk({
        mode: "preview",
        backup_date: backupJson.created_at,
        tables: preview,
        orphan_children_to_clear: ORPHAN_CHILD_TABLES_TO_CLEAR,
      });
    }

    if (mode === "debug") {
      // Diagnóstico: identifica linhas problemáticas sem alterar nada
      const ef = tables.event_forecasts || [];
      const efIds = new Set(ef.map((r: any) => r.id));
      const efTxIds = new Set(ef.map((r: any) => r.transaction_id).filter(Boolean));

      // Carregar IDs de transactions atuais (Live)
      const liveTxIds = new Set<string>();
      let from = 0;
      while (true) {
        const { data } = await admin.from("transactions").select("id").range(from, from + 999);
        if (!data || data.length === 0) break;
        data.forEach((r: any) => liveTxIds.add(r.id));
        if (data.length < 1000) break;
        from += 1000;
      }
      const efBad = ef.filter((r: any) => r.transaction_id && !liveTxIds.has(r.transaction_id));

      const fal = tables.forecast_audit_log || [];
      const falBad = fal.filter((r: any) => r.forecast_id && !efIds.has(r.forecast_id));

      const ts = tables.ticket_sales || [];
      const seen = new Map<string, any[]>();
      for (const r of ts) {
        if (r.source !== "import") continue;
        const key = [r.zone_id, r.lot_id ?? "00000000-0000-0000-0000-000000000000", r.sale_date, r.unit_price, r.financial_account_id].join("|");
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key)!.push(r);
      }
      const dupGroups = [...seen.entries()].filter(([, v]) => v.length > 1);

      return jsonOk({
        mode: "debug",
        event_forecasts: {
          total: ef.length,
          with_tx: efTxIds.size,
          live_tx_count: liveTxIds.size,
          bad_count: efBad.length,
          bad_sample: efBad.slice(0, 8).map((r: any) => ({ id: r.id, transaction_id: r.transaction_id, description: r.description, event_id: r.event_id })),
        },
        forecast_audit_log: {
          total: fal.length,
          bad_count: falBad.length,
          bad_sample: falBad.slice(0, 5).map((r: any) => ({ id: r.id, forecast_id: r.forecast_id })),
        },
        ticket_sales: {
          total: ts.length,
          duplicate_groups: dupGroups.length,
          duplicate_total_extras: dupGroups.reduce((s, [, v]) => s + v.length - 1, 0),
          duplicate_sample: dupGroups.slice(0, 5).map(([k, v]) => ({ key: k, count: v.length, ids: v.map((r: any) => r.id) })),
        },
      });
    }

    if (mode !== "restore") return jsonErr("mode deve ser 'preview', 'debug' ou 'restore'", 400);

    const results: Record<string, { deleted: string; inserted: number; skipped_cols?: string[]; error?: string }> = {};

    for (const t of ORPHAN_CHILD_TABLES_TO_CLEAR) {
      try {
        const { error } = await admin.from(t).delete().gte("created_at", "1900-01-01");
        if (error) {
          const { error: e2 } = await admin.from(t).delete().not("id", "is", null);
          results[`__orphan_${t}`] = { deleted: e2 ? "fail" : "all", inserted: 0, error: e2?.message };
        } else {
          results[`__orphan_${t}`] = { deleted: "all", inserted: 0 };
        }
      } catch (e) {
        results[`__orphan_${t}`] = { deleted: "fail", inserted: 0, error: String(e) };
      }
    }

    for (const t of DELETE_ORDER) {
      if (!tables[t]) continue;
      try {
        let error: any = null;
        if (SINGLETON_INT_PK.has(t)) {
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
        results[t] = { deleted: error ? "fail" : "all", inserted: 0, error: error?.message };
      } catch (e) {
        results[t] = { deleted: "fail", inserted: 0, error: String(e) };
      }
    }

    const liveCols = await fetchLiveColumns(admin, RESTORE_ORDER);

    for (const t of RESTORE_ORDER) {
      const rows = tables[t];
      if (!rows || rows.length === 0) {
        if (!results[t]) results[t] = { deleted: "n/a", inserted: 0 };
        continue;
      }
      const cols = liveCols[t];
      let { cleanRows, skipped } = cols
        ? stripUnknownCols(rows, cols)
        : { cleanRows: rows, skipped: [] as string[] };

      // Dedup específico para ticket_sales — constraint uniq_ticket_sales_imported_row
      // foi adicionada após o backup; precisamos remover duplicados antes do upsert.
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
        skipped_cols: skipped.length ? skipped : undefined,
        ...(dedupRemoved > 0 ? { dedup_removed: dedupRemoved } as any : {}),
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
