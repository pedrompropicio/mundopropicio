// Import BOL → zona única "BOL" por evento + ticket_sales source='bol'.
//
// Idempotência: substituição completa por sync — apaga tudo o que existe para
// este evento (zonas do evento) + conta BOL + source='bol' e reinsere.
//   quantity   = coluna "Bilhetes" do dia
//   total_value = TOTAL do dia
//   unit_price = total / qty (2 casas)
import type { BolParseResult } from "./bol-report-parser.ts";

const SOURCE = "bol";
const IVA_RATE = 6;
const ZONE_NAME = "BOL";
const LOT_NAME = "Lote 1";

export interface BolImportInput {
  supabase: any; // service-role client
  eventId: string;
  bolAccountId: string;
  parseResult: BolParseResult;
  fileName: string;
}

export interface BolImportAudit {
  rowsImported: number;
  prevSalesDeleted: number;
  importBatchId: string;
  zoneId: string;
  lotId: string;
  zoneCreated: boolean;
  lotCreated: boolean;
  importLogId: string | null;
  warnings: string[];
  totals: { qty: number; value: number; periodFrom: string | null; periodTo: string | null };
  reportTotalRow: { qty: number; total: number } | null;
  days: Array<{ date: string; qty: number; total: number }>;
}

export async function runBolImport(input: BolImportInput): Promise<BolImportAudit> {
  const { supabase, eventId, bolAccountId, parseResult, fileName } = input;

  const audit: BolImportAudit = {
    rowsImported: 0,
    prevSalesDeleted: 0,
    importBatchId: crypto.randomUUID(),
    zoneId: "",
    lotId: "",
    zoneCreated: false,
    lotCreated: false,
    importLogId: null,
    warnings: [...parseResult.warnings],
    totals: {
      qty: parseResult.totals.qty,
      value: parseResult.totals.total,
      periodFrom: parseResult.header.periodFrom,
      periodTo: parseResult.header.periodTo,
    },
    reportTotalRow: parseResult.totalRow,
    days: parseResult.rows.map((r) => ({ date: r.date, qty: r.qty, total: r.total })),
  };

  const { data: ev, error: evErr } = await supabase
    .from("events").select("company_id").eq("id", eventId).single();
  if (evErr || !ev) throw new Error("Evento não encontrado");
  const companyId = ev.company_id;

  // 1. Zona "BOL" (ensure)
  const { data: zones } = await supabase
    .from("event_ticket_zones").select("id, name, session_id").eq("event_id", eventId);
  let zone = (zones || []).find((z: any) => String(z.name).trim().toLowerCase() === ZONE_NAME.toLowerCase());
  if (!zone) {
    const { data, error } = await supabase.from("event_ticket_zones").insert({
      event_id: eventId, name: ZONE_NAME, session_id: null, total_capacity: 0, company_id: companyId,
    }).select("id").single();
    if (error) throw new Error(`Criar zona BOL: ${error.message}`);
    zone = { id: data!.id, name: ZONE_NAME, session_id: null };
    audit.zoneCreated = true;
  }
  audit.zoneId = zone.id;

  // 2. Lote único (ensure)
  const { data: lots } = await supabase
    .from("event_ticket_lots").select("id, name, lot_number").eq("zone_id", zone.id);
  let lot = (lots || []).find((l: any) => String(l.name).trim().toLowerCase() === LOT_NAME.toLowerCase())
    || (lots || [])[0];
  if (!lot) {
    const { data, error } = await supabase.from("event_ticket_lots").insert({
      zone_id: zone.id, name: LOT_NAME, lot_number: 1,
      lot_type: "regular", lot_kind: "simple",
      is_combo: false, consumes_zone_ids: [],
      price: 0, quantity: 0, iva_rate: IVA_RATE, company_id: companyId,
    }).select("id").single();
    if (error) throw new Error(`Criar lote BOL: ${error.message}`);
    lot = { id: data!.id, name: LOT_NAME, lot_number: 1 };
    audit.lotCreated = true;
  }
  audit.lotId = lot.id;

  // 3. Assignment conta BOL → evento
  const { data: existingAssign } = await supabase
    .from("event_ticket_office_assignments").select("id")
    .eq("event_id", eventId).eq("financial_account_id", bolAccountId).is("event_date_id", null)
    .maybeSingle();
  if (!existingAssign) {
    const { error } = await supabase.from("event_ticket_office_assignments")
      .insert({ event_id: eventId, event_date_id: null, financial_account_id: bolAccountId, company_id: companyId });
    if (error) audit.warnings.push(`Assignment falhou (não-crítico): ${error.message}`);
  }

  // 4. Substituição completa: apagar source='bol' deste evento + conta
  const allZoneIds = (zones || []).map((z: any) => z.id);
  if (!allZoneIds.includes(zone.id)) allZoneIds.push(zone.id);
  const { data: prior } = await supabase.from("ticket_sales").select("id")
    .in("zone_id", allZoneIds).eq("financial_account_id", bolAccountId).eq("source", SOURCE);
  audit.prevSalesDeleted = prior?.length || 0;
  const { error: delErr } = await supabase.from("ticket_sales").delete()
    .in("zone_id", allZoneIds).eq("financial_account_id", bolAccountId).eq("source", SOURCE);
  if (delErr) throw new Error(`Apagar vendas BOL anteriores: ${delErr.message}`);

  // 5. Inserir
  const payload = parseResult.rows
    .filter((r) => r.qty !== 0 || r.total !== 0)
    .map((r) => ({
      zone_id: zone.id,
      lot_id: lot.id,
      sale_date: r.date,
      quantity: r.qty,
      unit_price: r.qty !== 0 ? Math.round((r.total / r.qty) * 100) / 100 : 0,
      total_value: r.total,
      financial_account_id: bolAccountId,
      source: SOURCE,
      notes: `BOL • Mapa Diário de Vendas por Sessão`,
      import_batch_id: audit.importBatchId,
      company_id: companyId,
    }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from("ticket_sales").insert(payload.slice(i, i + 500));
    if (error) throw new Error(`Insert ticket_sales: ${error.message}`);
  }
  audit.rowsImported = payload.length;

  // 6. Log
  const { data: log, error: logErr } = await supabase.from("ticket_import_logs").insert({
    event_id: eventId, financial_account_id: bolAccountId,
    file_name: fileName,
    import_type: "sales",
    period_from: parseResult.header.periodFrom,
    period_to: parseResult.header.periodTo,
    rows_imported: payload.length, rows_skipped: 0,
    zones_created: audit.zoneCreated ? 1 : 0, lots_created: audit.lotCreated ? 1 : 0,
    company_id: companyId,
  }).select("id").single();
  if (logErr) console.warn("ticket_import_logs:", logErr.message);
  else audit.importLogId = log?.id || null;

  return audit;
}
