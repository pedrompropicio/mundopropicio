// Import BOL (mapa M2 - Tipo de Venda) → uma zona por SETOR + ticket_sales source='bol'.
//
// Modelo igual ao Ticketline: cada setor do mapa vira uma zona real do evento
// (event_ticket_zones, session_id=null) com total_capacity = Lotação Qt, e um
// lote único "Lote 1" por zona.
//
//   quantity    = Total Vendas Qt
//   total_value = Total Vendas Valor
//   unit_price  = total / qty (2 casas) quando qty > 0
//
// Idempotência: substituição completa por sync — apaga source='bol' do evento e reinsere.
// Setores sem vendas (qty=0 e valor=0) criam/mantêm a zona mas não geram venda
// (mesmo critério do import Ticketline).
//
// Validação: a soma das zonas tem de bater com a linha TOTAL do relatório; se
// não bater, o import falha (nunca importa dados errados).
import type { BolParseResult } from "./bol-report-parser.ts";

const SOURCE = "bol";
const IVA_RATE = 6;
const LOT_NAME = "Lote 1";

export interface BolImportInput {
  supabase: any; // service-role client
  eventId: string;
  bolAccountId: string;
  parseResult: BolParseResult;
  fileName: string;
  /** Data a atribuir ao snapshot de vendas (YYYY-MM-DD). */
  saleDate?: string;
}

export interface BolImportAudit {
  rowsImported: number;
  prevSalesDeleted: number;
  importBatchId: string;
  saleDate: string;
  zonesCreated: number;
  lotsCreated: number;
  importLogId: string | null;
  warnings: string[];
  totals: { qty: number; value: number; capacity: number };
  reportTotalRow: { qty: number; value: number; capacity: number } | null;
  sectors: Array<{ sector: string; zoneId: string; qty: number; value: number; capacity: number }>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "14|08|2026 23:12 GMT Standard Time" → "2026-08-14" */
export function saleDateFromGeneratedAt(generatedAt: string | null | undefined): string | null {
  const m = generatedAt ? /(\d{2})[|/](\d{2})[|/](\d{4})/.exec(generatedAt) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const norm = (s: string) => String(s).trim().toLowerCase();

export async function runBolImport(input: BolImportInput): Promise<BolImportAudit> {
  const { supabase, eventId, bolAccountId, parseResult, fileName } = input;
  const saleDate = input.saleDate || saleDateFromGeneratedAt(parseResult.header.generatedAt) || todayIso();

  const audit: BolImportAudit = {
    rowsImported: 0,
    prevSalesDeleted: 0,
    importBatchId: crypto.randomUUID(),
    saleDate,
    zonesCreated: 0,
    lotsCreated: 0,
    importLogId: null,
    warnings: [...parseResult.warnings],
    totals: parseResult.totals,
    reportTotalRow: parseResult.totalRow
      ? { qty: parseResult.totalRow.totalQty, value: parseResult.totalRow.totalValue, capacity: parseResult.totalRow.capacity }
      : null,
    sectors: [],
  };

  // 0. Validação contra a linha TOTAL — bloqueante
  if (!parseResult.totalRow) {
    throw new Error("Mapa M2 sem linha TOTAL — impossível validar o import.");
  }
  if (parseResult.totalRow.totalQty !== parseResult.totals.qty) {
    throw new Error(
      `Validação falhou: TOTAL do relatório = ${parseResult.totalRow.totalQty} bilhetes, soma dos setores = ${parseResult.totals.qty}.`,
    );
  }
  if (Math.abs(parseResult.totalRow.totalValue - parseResult.totals.value) > 0.02) {
    throw new Error(
      `Validação falhou: TOTAL do relatório = ${parseResult.totalRow.totalValue} €, soma dos setores = ${parseResult.totals.value} €.`,
    );
  }

  const { data: ev, error: evErr } = await supabase
    .from("events").select("company_id").eq("id", eventId).single();
  if (evErr || !ev) throw new Error("Evento não encontrado");
  const companyId = ev.company_id;

  // 1. Zonas por setor (ensure) + lote único por zona
  const { data: existingZones } = await supabase
    .from("event_ticket_zones").select("id, name, session_id, total_capacity").eq("event_id", eventId);
  const zonesByName = new Map<string, any>((existingZones || []).map((z: any) => [norm(z.name), z]));
  const allZoneIds: string[] = (existingZones || []).map((z: any) => z.id);

  const zoneLot = new Map<string, string>(); // zoneId → lotId

  for (const row of parseResult.rows) {
    let zone = zonesByName.get(norm(row.sector));
    if (!zone) {
      // FRONTEIRA: zona criada pela sync é âncora técnica das vendas — fora do planeamento.
      const { data, error } = await supabase.from("event_ticket_zones").insert({
        event_id: eventId, name: row.sector, session_id: null,
        total_capacity: row.capacity || 0, company_id: companyId,
        sync_generated: true,
      }).select("id, name, total_capacity").single();
      if (error) throw new Error(`Criar zona "${row.sector}": ${error.message}`);
      zone = data;
      zonesByName.set(norm(row.sector), zone);
      allZoneIds.push(zone.id);
      audit.zonesCreated++;
    } else if (row.capacity && Number(zone.total_capacity || 0) !== row.capacity) {
      await supabase.from("event_ticket_zones").update({ total_capacity: row.capacity }).eq("id", zone.id);
    }

    const { data: lots } = await supabase
      .from("event_ticket_lots").select("id, name").eq("zone_id", zone.id);
    let lot = (lots || []).find((l: any) => norm(l.name) === norm(LOT_NAME)) || (lots || [])[0];
    if (!lot) {
      const { data, error } = await supabase.from("event_ticket_lots").insert({
        zone_id: zone.id, name: LOT_NAME, lot_number: 1,
        lot_type: "regular", lot_kind: "simple",
        is_combo: false, consumes_zone_ids: [],
        price: 0, quantity: row.capacity || 0, iva_rate: IVA_RATE, company_id: companyId,
        sync_generated: true,
      }).select("id, name").single();
      if (error) throw new Error(`Criar lote da zona "${row.sector}": ${error.message}`);
      lot = data;
      audit.lotsCreated++;
    }
    zoneLot.set(zone.id, lot.id);

    audit.sectors.push({
      sector: row.sector, zoneId: zone.id,
      qty: row.totalQty, value: row.totalValue, capacity: row.capacity,
    });
  }

  // 2. Assignment conta BOL → evento
  const { data: existingAssign } = await supabase
    .from("event_ticket_office_assignments").select("id")
    .eq("event_id", eventId).eq("financial_account_id", bolAccountId).is("event_date_id", null)
    .maybeSingle();
  if (!existingAssign) {
    const { error } = await supabase.from("event_ticket_office_assignments")
      .insert({ event_id: eventId, event_date_id: null, financial_account_id: bolAccountId, company_id: companyId });
    if (error) audit.warnings.push(`Assignment falhou (não-crítico): ${error.message}`);
  }

  // 3. Substituição completa: apagar source='bol' deste evento + conta
  if (allZoneIds.length > 0) {
    const { data: prior } = await supabase.from("ticket_sales").select("id")
      .in("zone_id", allZoneIds).eq("financial_account_id", bolAccountId).eq("source", SOURCE);
    audit.prevSalesDeleted = prior?.length || 0;
    const { error: delErr } = await supabase.from("ticket_sales").delete()
      .in("zone_id", allZoneIds).eq("financial_account_id", bolAccountId).eq("source", SOURCE);
    if (delErr) throw new Error(`Apagar vendas BOL anteriores: ${delErr.message}`);
  }

  // 4. Inserir (setores com vendas)
  const payload = parseResult.rows
    .filter((r) => r.totalQty !== 0 || r.totalValue !== 0)
    .map((r) => {
      const zone = zonesByName.get(norm(r.sector))!;
      return {
        zone_id: zone.id,
        lot_id: zoneLot.get(zone.id)!,
        sale_date: saleDate,
        quantity: r.totalQty,
        unit_price: r.totalQty !== 0 ? Math.round((r.totalValue / r.totalQty) * 100) / 100 : 0,
        total_value: r.totalValue,
        financial_account_id: bolAccountId,
        source: SOURCE,
        notes: `BOL • Ocupação Sessões M2 - Tipo de Venda`,
        import_batch_id: audit.importBatchId,
        company_id: companyId,
      };
    });
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from("ticket_sales").insert(payload.slice(i, i + 500));
    if (error) throw new Error(`Insert ticket_sales: ${error.message}`);
  }
  audit.rowsImported = payload.length;

  // 5. Log
  const { data: log, error: logErr } = await supabase.from("ticket_import_logs").insert({
    event_id: eventId, financial_account_id: bolAccountId,
    file_name: fileName,
    import_type: "sales",
    period_from: saleDate,
    period_to: saleDate,
    rows_imported: payload.length, rows_skipped: parseResult.rows.length - payload.length,
    zones_created: audit.zonesCreated, lots_created: audit.lotsCreated,
    company_id: companyId,
  }).select("id").single();
  if (logErr) console.warn("ticket_import_logs:", logErr.message);
  else audit.importLogId = log?.id || null;

  return audit;
}
