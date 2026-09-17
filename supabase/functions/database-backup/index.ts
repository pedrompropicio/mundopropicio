// Backup multi-tenant: UM ALVO POR INVOCAÇÃO.
//   { "target": "global" }        -> backup global (+ rotação dos 30 por grupo)
//   { "company_id": "<uuid>" }    -> backup de uma empresa
//   sem corpo                      -> comportamento antigo do botão da UI (admin -> a sua empresa)
// Qualquer um aceita { "force": true } (só com JWT service_role) para ignorar a janela horária.
//
// Porque mudou: fazia global + loop por TODAS as empresas na mesma execução e
// excedia o tempo. A guarda de idempotência olhava para o storage e o global era
// escrito primeiro, logo a segunda tentativa do dia saía sem fazer nada. O cron
// nunca lia a resposta. Resultado a 17/09/2026: dias só com backup-global e
// empresas sem backup há uma semana. Agora cada invocação registra-se em
// public.backup_runs e a invariante `backup_empresa_em_falta` vigia.
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

/**
 * Serializa uma tabela DIRECTO para pedaços de texto, página a página.
 * Nunca guarda a tabela inteira em memória: era isso que rebentava o limite de
 * memória na empresa maior (mundo-propicio) e deixava o backup a meio, sem aviso.
 */
async function streamTable(
  adminClient: any, parts: string[], table: string, filter?: { col: string; val: string },
): Promise<number> {
  parts.push("[");
  let from = 0;
  let count = 0;
  const pageSize = 1000;
  while (true) {
    let q = adminClient.from(table).select("*").range(from, from + pageSize - 1);
    if (filter) q = q.eq(filter.col, filter.val);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    // Uma serialização por página (não por linha): menos CPU e menos memória.
    if (count > 0) parts.push(",");
    parts.push(JSON.stringify(data).slice(1, -1));
    count += data.length;
    from += data.length;
    if (data.length < pageSize) break;
  }
  parts.push("]");
  return count;
}



interface BuiltBackup {
  parts: string[];
  tableCounts: Record<string, number>;
  rowsTotal: number;
  errors: string[];
  storageCounts?: Record<string, number>;
}

async function buildCompanyBackup(adminClient: any, companyId: string, companySlug: string): Promise<BuiltBackup> {
  const parts: string[] = [];
  const tableCounts: Record<string, number> = {};
  const errors: string[] = [];
  let rowsTotal = 0;

  parts.push(JSON.stringify({
    version: 3, scope: "company", company_id: companyId,
    company_slug: companySlug, created_at: new Date().toISOString(),
  }).slice(0, -1)); // abre o objeto sem a "}" final
  parts.push(',"tables":{');

  let first = true;
  for (const t of TENANT_TABLES) {
    if (!first) parts.push(",");
    first = false;
    parts.push(`${JSON.stringify(t)}:`);
    const mark = parts.length;
    try {
      const n = await streamTable(adminClient, parts, t, { col: "company_id", val: companyId });
      tableCounts[t] = n;
      rowsTotal += n;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      parts.length = mark;   // descarta o que ficou meio escrito
      parts.push("[]");
      tableCounts[t] = 0;
    }
  }
  parts.push("}");
  parts.push(`,"table_counts":${JSON.stringify(tableCounts)}`);
  if (errors.length) parts.push(`,"errors":${JSON.stringify(errors)}`);
  parts.push("}");

  return { parts, tableCounts, rowsTotal, errors };
}

async function buildGlobalBackup(adminClient: any): Promise<BuiltBackup> {
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

  const tableCounts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  const storageCounts = Object.fromEntries(Object.entries(storageManifest).map(([k, v]) => [k, v.length]));

  const doc = {
    version: 3,
    scope: "global",
    created_at: new Date().toISOString(),
    tables,
    storage_manifest: storageManifest,
    table_counts: tableCounts,
    storage_counts: storageCounts,
    errors: errors.length ? errors : undefined,
  };

  return {
    parts: [JSON.stringify(doc)],
    tableCounts,
    rowsTotal: Object.values(tableCounts).reduce((a, b) => a + Number(b), 0),
    errors,
    storageCounts,
  };
}

/** Sobe o ficheiro e devolve o tamanho em bytes do JSON. */
async function uploadBackup(adminClient: any, fileName: string, parts: string[]): Promise<number> {
  const blob = new Blob(parts, { type: "application/json" });
  const { error } = await adminClient.storage
    .from("database-backups")
    .upload(fileName, blob, { contentType: "application/json", upsert: false });
  if (error) throw new Error(`upload ${fileName}: ${error.message}`);
  return blob.size;
}


/**
 * Mantém os últimos 30 backups POR EMPRESA (e 30 globais).
 * Corre SÓ na invocação do global, para não haver cinco rotações concorrentes.
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Linha em backup_runs desta invocação — o catch de topo TEM de a fechar.
  let runId: string | null = null;
  const closeRun = async (fields: Record<string, unknown>) => {
    if (!runId) return;
    await adminClient.from("backup_runs").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", runId);
  };

  try {
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

    let body: any = {};
    try { body = await req.json(); } catch { /* sem corpo */ }
    const force = body?.force === true && role === "service_role";
    const wantsGlobal = body?.target === "global";
    const wantedCompanyId: string | null =
      typeof body?.company_id === "string" && body.company_id ? body.company_id : null;

    // Janela 02:00-05:00 Europe/Lisbon para chamadas de máquina.
    // force=true só vale com service_role (nunca anon).
    if (isMachine && !force) {
      const lisbonHour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false,
        }).format(new Date()),
      );
      if (lisbonHour < 2 || lisbonHour > 5) {
        return json({ skipped: true, reason: "outside backup window (Europe/Lisbon 02:00-05:00)", lisbonHour });
      }
    }

    // ---- Resolver o ALVO ÚNICO desta invocação ----
    let scope: "global" | "company";
    let companyId: string | null = null;

    if (isMachine) {
      if (wantedCompanyId) {
        scope = "company";
        companyId = wantedCompanyId;
      } else {
        // target='global' ou chamada sem alvo -> global.
        scope = "global";
      }
    } else {
      if (!userId) return json({ error: "Não autorizado" }, 401);

      const { data: roleData } = await adminClient
        .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleData) return json({ error: "Apenas administradores podem criar backups" }, 403);

      const { data: isPaRow } = await adminClient.rpc("is_platform_admin", { _user_id: userId });
      const isPlatformAdmin = Boolean(isPaRow);

      const { data: profile } = await adminClient
        .from("profiles").select("company_id, active_company_id").eq("id", userId).maybeSingle();
      const callerCompanyId = isPlatformAdmin
        ? (profile?.active_company_id ?? profile?.company_id ?? null)
        : (profile?.company_id ?? null);

      if (wantsGlobal) {
        // O global é cross-tenant: só platform_admin (ou o sistema) o pede.
        if (!isPlatformAdmin) return json({ error: "Apenas platform_admin pode pedir o backup global" }, 403);
        scope = "global";
      } else if (wantedCompanyId) {
        if (!isPlatformAdmin && wantedCompanyId !== callerCompanyId) {
          return json({ error: "Sem acesso a essa empresa" }, 403);
        }
        scope = "company";
        companyId = wantedCompanyId;
      } else {
        // Botão "Criar Backup" da UI: admin -> a sua própria empresa.
        if (!callerCompanyId) return json({ error: "Sem empresa associada" }, 403);
        scope = "company";
        companyId = callerCompanyId;
      }
    }


    let slug: string | null = scope === "global" ? "global" : null;
    if (scope === "company" && companyId) {
      const { data: companyRow } = await adminClient
        .from("companies").select("slug").eq("id", companyId).maybeSingle();
      slug = companyRow?.slug ?? companyId.slice(0, 8);
    }

    const runDate = new Date().toISOString().slice(0, 10);

    // ---- Guarda de idempotência: por backup_runs, não pelo storage ----
    {
      let q = adminClient
        .from("backup_runs")
        .select("id, file_name")
        .eq("run_date", runDate)
        .eq("scope", scope)
        .eq("status", "ok");
      q = companyId ? q.eq("company_id", companyId) : q.is("company_id", null);
      const { data: already, error: alreadyErr } = await q.maybeSingle();
      if (alreadyErr && alreadyErr.code !== "PGRST116") throw new Error(`backup_runs: ${alreadyErr.message}`);
      if (already) {
        return json({ skipped: true, reason: "already ok today", scope, slug, date: runDate, file: already.file_name });
      }
    }

    // ---- Abrir a linha 'running' ----
    {
      const { data: runRow, error: runErr } = await adminClient
        .from("backup_runs")
        .insert({ run_date: runDate, scope, company_id: companyId, slug, status: "running" })
        .select("id")
        .single();
      if (runErr) throw new Error(`backup_runs insert: ${runErr.message}`);
      runId = runRow.id;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    if (scope === "global") {
      const built = await buildGlobalBackup(adminClient);
      const fileName = `backup-global-${ts}.json`;
      const bytes = await uploadBackup(adminClient, fileName, built.parts);

      // Rotação só aqui, para não haver rotações concorrentes.
      let rotationError: string | null = null;
      try { await rotateOldBackups(adminClient); }
      catch (e) { rotationError = e instanceof Error ? e.message : "?"; }

      await closeRun({
        status: "ok",
        file_name: fileName,
        tables_count: Object.keys(built.tableCounts).length,
        rows_total: built.rowsTotal,
        bytes,
        error_text: rotationError ? `rotation: ${rotationError}` : null,
      });

      return json({
        success: true, scope: "global", file: fileName, bytes,
        table_counts: built.tableCounts, storage_counts: built.storageCounts,
        rotation_error: rotationError ?? undefined,
      });
    }

    const built = await buildCompanyBackup(adminClient, companyId!, slug!);
    const fileName = `backup-${slug}-${ts}.json`;
    const bytes = await uploadBackup(adminClient, fileName, built.parts);

    await closeRun({
      status: "ok",
      file_name: fileName,
      tables_count: Object.keys(built.tableCounts).length,
      rows_total: built.rowsTotal,
      bytes,
      error_text: built.errors.length ? built.errors.join(" | ").slice(0, 4000) : null,
    });

    return json({
      success: true, scope: "company", company_id: companyId, slug,
      file: fileName, bytes, table_counts: built.tableCounts,
      errors: built.errors.length ? built.errors : undefined,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("Backup error:", err);
    // Nunca deixar 'running' pendurado.
    try { await closeRun({ status: "error", error_text: msg.slice(0, 4000) }); } catch { /* ignore */ }
    return json({ error: msg }, 500);
  }
});
