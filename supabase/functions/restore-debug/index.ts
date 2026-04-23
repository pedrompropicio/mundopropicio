// Diagnóstico do backup — identifica registos problemáticos sem inserir nada
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { backup_file } = await req.json();
  const { data: file, error } = await admin.storage.from("database-backups").download(backup_file);
  if (error) return json({ error: error.message }, 400);

  const backup = JSON.parse(await file.text());
  const tables = backup.tables;

  // 1) event_forecasts: que transaction_ids referenciam que não existem em Live?
  const ef = tables.event_forecasts || [];
  const refTxIds = new Set(ef.map((r: any) => r.transaction_id).filter(Boolean));
  const liveTxIds = new Set<string>();
  let from = 0;
  while (true) {
    const { data } = await admin.from("transactions").select("id").range(from, from + 999);
    if (!data || data.length === 0) break;
    data.forEach((r: any) => liveTxIds.add(r.id));
    if (data.length < 1000) break;
    from += 1000;
  }
  const missingTx = [...refTxIds].filter((id) => !liveTxIds.has(id));
  const efBadRows = ef.filter((r: any) => r.transaction_id && !liveTxIds.has(r.transaction_id));

  // 2) forecast_audit_log: que forecast_ids do backup não existem (em event_forecasts do backup)?
  const efIds = new Set(ef.map((r: any) => r.id));
  const fal = tables.forecast_audit_log || [];
  const falBad = fal.filter((r: any) => r.forecast_id && !efIds.has(r.forecast_id));

  // 3) ticket_sales: duplicados pela constraint única
  const ts = tables.ticket_sales || [];
  const seen = new Map<string, any[]>();
  for (const r of ts) {
    if (r.source !== "import") continue;
    const key = [r.zone_id, r.lot_id ?? "00000000-0000-0000-0000-000000000000", r.sale_date, r.unit_price, r.financial_account_id].join("|");
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(r);
  }
  const dupGroups = [...seen.entries()].filter(([, v]) => v.length > 1);

  return json({
    event_forecasts: {
      total_in_backup: ef.length,
      with_transaction_id: refTxIds.size,
      missing_transaction_ids_count: missingTx.length,
      missing_sample: missingTx.slice(0, 10),
      bad_rows_count: efBadRows.length,
      bad_rows_sample: efBadRows.slice(0, 5).map((r: any) => ({ id: r.id, transaction_id: r.transaction_id, description: r.description })),
    },
    forecast_audit_log: {
      total_in_backup: fal.length,
      bad_rows_count: falBad.length,
      bad_rows_sample: falBad.slice(0, 5).map((r: any) => ({ id: r.id, forecast_id: r.forecast_id })),
    },
    ticket_sales: {
      total_in_backup: ts.length,
      import_rows: ts.filter((r: any) => r.source === "import").length,
      duplicate_groups: dupGroups.length,
      duplicate_sample: dupGroups.slice(0, 5).map(([k, v]) => ({ key: k, count: v.length, ids: v.map((r: any) => r.id) })),
    },
  });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
