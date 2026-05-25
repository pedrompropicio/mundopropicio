// Server-side import: curva diária Ticketline → ticket_sales
// Cria/reutiliza zona "Ticketline (Total)" + lote homónimo por evento (idempotente).
// Apaga vendas anteriores com source='ticketline_import' para o (evento, conta) antes de re-inserir.
import type { TicketlineSaleSummaryResult } from "./ticketline-parser.ts";
import type { ZoneReportResult } from "./ticketline-zone-parser.ts";

const TICKETLINE_IVA_RATE = 6;
const TICKETLINE_ZONE_NAME = "Ticketline (Total)";
const TICKETLINE_LOT_NAME = "Ticketline (Total)";
const SOURCE = "ticketline_import";

export interface TicketlineImportInput {
  supabase: any; // service-role
  eventId: string;
  ticketlineAccountId: string;
  parseResult: TicketlineSaleSummaryResult;
  zoneSnapshot?: ZoneReportResult | null;
  filenames: { summary: string; zone: string };
}

export interface TicketlineImportAudit {
  rowsImported: number;
  prevSalesDeleted: number;
  importBatchId: string;
  zoneId: string;
  lotId: string;
  zoneCreated: boolean;
  lotCreated: boolean;
  importLogId: string | null;
  warnings: string[];
  totals: { qty: number; value: number; periodFrom: string; periodTo: string };
  zone_snapshot?: ZoneReportResult | null;
}

export async function runTicketlineImport(input: TicketlineImportInput): Promise<TicketlineImportAudit> {
  const { supabase, eventId, ticketlineAccountId, parseResult, zoneSnapshot, filenames } = input;
  const audit: TicketlineImportAudit = {
    rowsImported: 0, prevSalesDeleted: 0,
    importBatchId: crypto.randomUUID(),
    zoneId: "", lotId: "",
    zoneCreated: false, lotCreated: false,
    importLogId: null,
    warnings: [...parseResult.warnings],
    totals: {
      qty: parseResult.totalQty,
      value: parseResult.totalValue,
      periodFrom: parseResult.header.period_from,
      periodTo: parseResult.header.period_to,
    },
    zone_snapshot: zoneSnapshot || null,
  };

  // 1. company_id do evento
  const { data: ev, error: evErr } = await supabase
    .from("events").select("company_id").eq("id", eventId).single();
  if (evErr || !ev) throw new Error("Evento não encontrado");
  const companyId = ev.company_id;

  // 2. Ensure zona "Ticketline (Total)" (session_id null)
  const { data: existingZone } = await supabase
    .from("event_ticket_zones").select("id")
    .eq("event_id", eventId).is("session_id", null).eq("name", TICKETLINE_ZONE_NAME)
    .maybeSingle();
  let zoneId: string;
  if (existingZone?.id) {
    zoneId = existingZone.id;
  } else {
    const { data, error } = await supabase.from("event_ticket_zones")
      .insert({ event_id: eventId, name: TICKETLINE_ZONE_NAME, session_id: null, total_capacity: 0, company_id: companyId })
      .select("id").single();
    if (error) throw new Error(`Zona Ticketline (Total): ${error.message}`);
    zoneId = data!.id;
    audit.zoneCreated = true;
  }
  audit.zoneId = zoneId;

  // 3. Ensure lote único nessa zona
  const { data: existingLot } = await supabase
    .from("event_ticket_lots").select("id").eq("zone_id", zoneId).eq("name", TICKETLINE_LOT_NAME)
    .maybeSingle();
  let lotId: string;
  if (existingLot?.id) {
    lotId = existingLot.id;
  } else {
    const { data, error } = await supabase.from("event_ticket_lots").insert({
      zone_id: zoneId, name: TICKETLINE_LOT_NAME, lot_number: 1, lot_type: "regular",
      lot_kind: "simple", is_combo: false, consumes_zone_ids: [],
      price: 0, quantity: 0, iva_rate: TICKETLINE_IVA_RATE, company_id: companyId,
    }).select("id").single();
    if (error) throw new Error(`Lote Ticketline (Total): ${error.message}`);
    lotId = data!.id;
    audit.lotCreated = true;
  }
  audit.lotId = lotId;

  // 4. Assignment conta Ticketline → evento (sem date)
  const { data: existingAssign } = await supabase
    .from("event_ticket_office_assignments").select("id")
    .eq("event_id", eventId).eq("financial_account_id", ticketlineAccountId).is("event_date_id", null)
    .maybeSingle();
  if (!existingAssign) {
    const { error } = await supabase.from("event_ticket_office_assignments")
      .insert({ event_id: eventId, event_date_id: null, financial_account_id: ticketlineAccountId, company_id: companyId });
    if (error) throw new Error(`Assignment: ${error.message}`);
  }

  // 5. Apagar vendas anteriores Ticketline neste evento+conta
  const { data: allEventZones } = await supabase
    .from("event_ticket_zones").select("id").eq("event_id", eventId);
  const allEventZoneIds = (allEventZones || []).map((z: any) => z.id);
  if (allEventZoneIds.length > 0) {
    const { data: prior } = await supabase.from("ticket_sales").select("id")
      .in("zone_id", allEventZoneIds).eq("financial_account_id", ticketlineAccountId).eq("source", SOURCE);
    audit.prevSalesDeleted = prior?.length || 0;
    const { error } = await supabase.from("ticket_sales").delete()
      .in("zone_id", allEventZoneIds).eq("financial_account_id", ticketlineAccountId).eq("source", SOURCE);
    if (error) throw new Error(`Apagar vendas anteriores: ${error.message}`);
  }

  // 6. Inserir 1 linha por dia (qty != 0 OR value != 0)
  const payload = parseResult.daily
    .filter(p => p.quantity !== 0 || p.value !== 0)
    .map(p => {
      const unit = p.quantity !== 0 ? Math.round((p.value / p.quantity) * 100) / 100 : 0;
      return {
        zone_id: zoneId,
        lot_id: lotId,
        sale_date: p.date,
        quantity: p.quantity,
        unit_price: unit,
        total_value: p.value,
        financial_account_id: ticketlineAccountId,
        source: SOURCE,
        notes: "Ticketline • sale_summary",
        import_batch_id: audit.importBatchId,
        company_id: companyId,
      };
    });
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { error } = await supabase.from("ticket_sales").insert(chunk);
    if (error) throw new Error(`Insert ticket_sales: ${error.message}`);
  }
  audit.rowsImported = payload.length;

  // 7. Log
  const { data: log, error: logErr } = await supabase.from("ticket_import_logs").insert({
    event_id: eventId, financial_account_id: ticketlineAccountId,
    file_name: `${filenames.summary} + ${filenames.zone}`,
    import_type: "sales",
    period_from: parseResult.header.period_from || null,
    period_to: parseResult.header.period_to || null,
    rows_imported: payload.length, rows_skipped: 0,
    zones_created: audit.zoneCreated ? 1 : 0,
    lots_created: audit.lotCreated ? 1 : 0,
    company_id: companyId,
  }).select("id").single();
  if (logErr) console.warn("ticket_import_logs:", logErr.message);
  else audit.importLogId = log?.id || null;

  return audit;
}
