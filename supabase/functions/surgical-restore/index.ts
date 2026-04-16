import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const body = await req.json();
    const { backup_file, event_ids } = body;

    // Download backup
    const { data: fileData, error: downloadErr } = await adminClient.storage
      .from("database-backups")
      .download(backup_file);
    if (downloadErr || !fileData) {
      return new Response(JSON.stringify({ error: `Download: ${downloadErr?.message}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const backup = JSON.parse(await fileData.text());
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

    // Insert sales
    if (backupSales.length > 0) {
      const batchSize = 200;
      let inserted = 0;
      for (let i = 0; i < backupSales.length; i += batchSize) {
        const batch = backupSales.slice(i, i + batchSize);
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
