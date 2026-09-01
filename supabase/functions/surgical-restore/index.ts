import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ---- AUTH (admin only) ----
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    let role: string | null = null;
    let userId: string | null = null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      role = payload?.role ?? null;
      userId = payload?.sub ?? null;
    } catch {}

    let isPlatformAdmin = false;
    let callerCompanyId: string | null = null;

    if (role !== "service_role") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleRow } = await adminClient
        .from("user_roles").select("role")
        .eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!roleRow) {
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
    const { backup_file, event_ids } = body;
    console.log("Downloading:", backup_file, "Events:", event_ids);

    // List files first to verify
    const { data: listData } = await adminClient.storage.from("database-backups").list();

    // Download backup
    const { data: fileData, error: downloadErr } = await adminClient.storage
      .from("database-backups")
      .download(backup_file);
    if (downloadErr || !fileData) {
      return new Response(JSON.stringify({ error: `Download: ${downloadErr?.message}`, files: listData?.map((f: any) => f.name) }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const backup = JSON.parse(await fileData.text());

    // ---- MULTI-TENANT GUARD ----
    const backupScope: "company" | "global" | "legacy" =
      backup.scope === "company" ? "company"
      : backup.scope === "global" ? "global"
      : "legacy";
    const backupCompanyId: string | null = backup.company_id ?? null;

    if (backupScope === "global") {
      return new Response(JSON.stringify({ error: "Backup global não suporta surgical-restore" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (backupScope === "company" && role !== "service_role" && backupCompanyId !== callerCompanyId) {
      console.warn(`[surgical-restore] Cross-tenant block: caller=${userId} (${callerCompanyId}) tentou restaurar backup de ${backupCompanyId}`);
      return new Response(JSON.stringify({ error: "Este backup pertence a outra empresa" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (backupScope === "legacy" && role !== "service_role" && !isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "Backups antigos (v2) só por platform_admin" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Adicionalmente: validar que TODOS os event_ids pedidos pertencem à company do caller
    if (callerCompanyId && event_ids?.length) {
      const { data: eventsCheck } = await adminClient
        .from("events").select("id, company_id").in("id", event_ids);
      const wrong = (eventsCheck ?? []).filter((e: any) => e.company_id !== callerCompanyId);
      if (wrong.length > 0) {
        console.warn(`[surgical-restore] Cross-tenant event ids: ${wrong.map((e: any) => e.id).join(",")}`);
        return new Response(JSON.stringify({ error: "Alguns eventos não pertencem à sua empresa" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const tables = backup.tables;
    const results: Record<string, { found: number; inserted: number; error?: string }> = {};

    // 1. Get zone IDs for these events from backup
    const backupZones = (tables.event_ticket_zones || []).filter(
      (z: any) => event_ids.includes(z.event_id)
    );
    const zoneIds = backupZones.map((z: any) => z.id);

    // 2. Get lot IDs from backup for these zones
    const backupLots = (tables.event_ticket_lots || []).filter(
      (l: any) => zoneIds.includes(l.zone_id)
    );

    // 3. Get ticket_sales from backup for these zones/lots
    const lotIds = backupLots.map((l: any) => l.id);
    const backupSales = (tables.ticket_sales || []).filter(
      (s: any) => zoneIds.includes(s.zone_id) || lotIds.includes(s.lot_id)
    );

    // 4. Get ticket_import_logs for these events (if any)
    const backupImportLogs = (tables.ticket_import_logs || []).filter(
      (l: any) => event_ids.includes(l.event_id)
    );

    // Report what we found
    results.event_ticket_zones = { found: backupZones.length, inserted: 0 };
    results.event_ticket_lots = { found: backupLots.length, inserted: 0 };
    results.ticket_sales = { found: backupSales.length, inserted: 0 };
    results.ticket_import_logs = { found: backupImportLogs.length, inserted: 0 };

    if (body.mode === "preview") {
      return new Response(JSON.stringify({ success: true, mode: "preview", results }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === RESTORE ===

    // Delete existing sales for these zones first
    for (const zoneId of zoneIds) {
      await adminClient.from("ticket_sales").delete().eq("zone_id", zoneId);
    }
    // Delete existing lots for these zones
    for (const zoneId of zoneIds) {
      await adminClient.from("event_ticket_lots").delete().eq("zone_id", zoneId);
    }

    // Insert lots
    if (backupLots.length > 0) {
      const batchSize = 200;
      let inserted = 0;
      for (let i = 0; i < backupLots.length; i += batchSize) {
        const batch = backupLots.slice(i, i + batchSize);
        const { error } = await adminClient.from("event_ticket_lots").upsert(batch, { onConflict: "id" });
        if (error) {
          results.event_ticket_lots.error = error.message;
          break;
        }
        inserted += batch.length;
      }
      results.event_ticket_lots.inserted = inserted;
    }

    // Insert sales — strip columns that no longer exist
    const VALID_SALES_COLS = ["id","lot_id","sale_date","quantity","unit_price","notes","created_by","created_at","zone_id","source","sale_date_to","financial_account_id","import_batch_id","total_value","company_id"];
    if (backupSales.length > 0) {
      const cleanSales = backupSales.map((s: any) => {
        const clean: any = {};
        for (const col of VALID_SALES_COLS) {
          if (s[col] !== undefined) clean[col] = s[col];
        }
        return clean;
      });
      const batchSize = 200;
      let inserted = 0;
      for (let i = 0; i < cleanSales.length; i += batchSize) {
        const batch = cleanSales.slice(i, i + batchSize);
        const { error } = await adminClient.from("ticket_sales").upsert(batch, { onConflict: "id" });
        if (error) {
          results.ticket_sales.error = error.message;
          break;
        }
        inserted += batch.length;
      }
      results.ticket_sales.inserted = inserted;
    }

    // Insert import logs
    if (backupImportLogs.length > 0) {
      const { error } = await adminClient.from("ticket_import_logs").upsert(backupImportLogs, { onConflict: "id" });
      results.ticket_import_logs.inserted = error ? 0 : backupImportLogs.length;
      if (error) results.ticket_import_logs.error = error.message;
    }

    return new Response(JSON.stringify({ success: true, mode: "restore", results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Surgical restore error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
