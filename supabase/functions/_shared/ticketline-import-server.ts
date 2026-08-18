// Server-side import Ticketline → zonas/lotes/vendas reais.
// Entrada: OperationsParseResult (secção 2 do sale_summary.xlsx, parsed
// por ticketline-operations-parser).
//
// Por cada (dia × zona × lote × tipo de ingresso) cria 1 linha em ticket_sales
// usando o par TOTAL VENDAS (qty, valor). "TOTAL GERAL" fica no audit.
//
// Idempotência:
//   - zonas e lotes: ensure por nome (não apagar, podem ter outras fontes).
//   - ticket_sales: APAGAR antes de inserir tudo o que já existia para este
//     evento+conta+source='ticketline_import', e re-inserir do zero. Mesmo
//     padrão da Fever.
//
// Notas:
//   - tipo de ingresso (" | Mob.Reduzida" etc.) é representado como variação
//     do lote: nome do lote = `${lot} | ${ticketType}` quando ticketType ≠ null.
//     Mantém a mesma zona e permite o utilizador distinguir nas tabelas.
//   - iva_rate default = 6 (mesmo da Fever Portugal).
import type { OperationsParseResult } from "./ticketline-operations-parser.ts";

const SOURCE = "ticketline_import";
const IVA_RATE = 6;

export interface TicketlineImportInput {
  supabase: any; // service-role client
  eventId: string;
  ticketlineAccountId: string;
  parseResult: OperationsParseResult;
  filenames: { summary: string };
}

export interface TicketlineImportAudit {
  rowsImported: number;
  prevSalesDeleted: number;
  importBatchId: string;
  zonesCreated: number;
  lotsCreated: number;
  zonesReused: number;
  lotsReused: number;
  importLogId: string | null;
  warnings: string[];
  /** 'section2' = layout normal (ZONA); 'section1_daily' = fallback pelos totais diários. */
  dataSource: "section2" | "section1_daily" | "none";
  totals: {
    qtyVendas: number; valueVendas: number;
    qtyGeral: number; valueGeral: number;
    periodFrom: string; periodTo: string;
  };
  section1Daily: any[];
  section2DailyTotals: any[];
  zoneLotMap: Array<{ zone: string; lot: string; zoneId: string; lotId: string }>;
}


function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function runTicketlineImport(input: TicketlineImportInput): Promise<TicketlineImportAudit> {
  const { supabase, eventId, ticketlineAccountId, parseResult, filenames } = input;
  const audit: TicketlineImportAudit = {
    rowsImported: 0, prevSalesDeleted: 0,
    importBatchId: crypto.randomUUID(),
    zonesCreated: 0, lotsCreated: 0, zonesReused: 0, lotsReused: 0,
    importLogId: null,
    warnings: [...parseResult.warnings],
    dataSource: "section2",
    totals: {
      qtyVendas: 0, valueVendas: 0, qtyGeral: 0, valueGeral: 0,
      periodFrom: parseResult.header.period_from,
      periodTo: parseResult.header.period_to,
    },
    section1Daily: parseResult.section1Daily,
    section2DailyTotals: parseResult.section2DailyTotals,
    zoneLotMap: [],
  };

  // 1. company_id
  const { data: ev, error: evErr } = await supabase
    .from("events").select("company_id").eq("id", eventId).single();
  if (evErr || !ev) throw new Error("Evento não encontrado");
  const companyId = ev.company_id;

  // 2. Carregar zonas existentes do evento (todas) + lotes
  const { data: existingZones } = await supabase
    .from("event_ticket_zones").select("id, name, session_id").eq("event_id", eventId);
  const zonesByNorm = new Map<string, { id: string; name: string }>();
  for (const z of existingZones || []) {
    // preferir zonas sem session_id (zonas globais do evento, padrão Ticketline)
    const k = normalizeName(z.name);
    if (!zonesByNorm.has(k) || !z.session_id) {
      zonesByNorm.set(k, { id: z.id, name: z.name });
    }
  }

  // 2b. FALLBACK: layouts sem secção 2 (sem header "ZONA") → importar os
  // totais diários da secção 1 para uma zona/lote default do evento.
  let rows = parseResult.rows;
  if (rows.length === 0) {
    const daily = (parseResult.section1Daily || []).filter(
      (d: any) => d.vendasQty !== 0 || d.vendasValue !== 0 || d.geralQty !== 0 || d.geralValue !== 0,
    );
    if (daily.length > 0) {
      const zonesList = (existingZones || []) as Array<{ id: string; name: string }>;
      let zoneName = "Geral";
      let lotName = "Lote 1";
      if (zonesList.length === 1) {
        zoneName = zonesList[0].name;
        const { data: zLots } = await supabase
          .from("event_ticket_lots").select("name").eq("zone_id", zonesList[0].id);
        if ((zLots || []).length === 1) lotName = zLots![0].name;
      }
      rows = daily.map((d: any) => ({
        date: d.date,
        zone: zoneName,
        lot: lotName,
        ticketType: null,
        rawLabel: `Total diário ${d.date}`,
        totalGeralQty: d.geralQty,
        totalGeralValue: d.geralValue,
        totalVendasQty: d.vendasQty !== 0 ? d.vendasQty : d.geralQty,
        totalVendasValue: d.vendasValue !== 0 ? d.vendasValue : d.geralValue,
      }));
      audit.dataSource = "section1_daily";
      audit.warnings.push(
        `Secção 2 (ZONA) ausente no ficheiro — importados ${rows.length} dias a partir dos totais diários da secção 1 para "${zoneName} / ${lotName}".`,
      );
    } else {
      audit.dataSource = "none";
    }
  }

  for (const r of rows) {
    audit.totals.qtyVendas += r.totalVendasQty;
    audit.totals.valueVendas += r.totalVendasValue;
    audit.totals.qtyGeral += r.totalGeralQty;
    audit.totals.valueGeral += r.totalGeralValue;
  }
  audit.totals.valueVendas = Math.round(audit.totals.valueVendas * 100) / 100;
  audit.totals.valueGeral = Math.round(audit.totals.valueGeral * 100) / 100;

  // 3. Resolver / criar zonas necessárias
  const neededZones = Array.from(new Set(rows.map(r => r.zone)));

  const zoneIdByName = new Map<string, string>();
  for (const zName of neededZones) {
    const k = normalizeName(zName);
    const found = zonesByNorm.get(k);
    if (found) {
      zoneIdByName.set(zName, found.id);
      audit.zonesReused++;
      continue;
    }
    // FRONTEIRA: zona criada pela sync é apenas âncora técnica das vendas —
    // sync_generated=true mantém-na fora do planeamento (previsão) do ERP.
    const { data, error } = await supabase.from("event_ticket_zones").insert({
      event_id: eventId, name: zName, session_id: null, total_capacity: 0, company_id: companyId,
      sync_generated: true,
    }).select("id").single();
    if (error) throw new Error(`Criar zona "${zName}": ${error.message}`);
    zoneIdByName.set(zName, data!.id);
    zonesByNorm.set(k, { id: data!.id, name: zName });
    audit.zonesCreated++;
  }

  // 4. Carregar lotes existentes dessas zonas
  const allZoneIds = Array.from(zoneIdByName.values());
  const lotsByKey = new Map<string, string>(); // `${zoneId}::${normName}` → lotId
  const lotMaxNumberByZone = new Map<string, number>();
  if (allZoneIds.length > 0) {
    const { data: lots } = await supabase
      .from("event_ticket_lots").select("id, zone_id, name, lot_number").in("zone_id", allZoneIds);
    for (const l of lots || []) {
      lotsByKey.set(`${l.zone_id}::${normalizeName(l.name)}`, l.id);
      const prev = lotMaxNumberByZone.get(l.zone_id) || 0;
      if ((l.lot_number || 0) > prev) lotMaxNumberByZone.set(l.zone_id, l.lot_number || 0);
    }
  }

  // 5. Resolver / criar lotes
  // chave de lote = lot + ( | ticketType) — mantém a separação Mob.Reduzida etc.
  const lotIdByRowKey = new Map<string, string>(); // `${zone}::${lotName}` → lotId
  for (const r of rows) {
    const zoneId = zoneIdByName.get(r.zone)!;
    const lotName = r.ticketType ? `${r.lot} | ${r.ticketType}` : r.lot;
    const rowKey = `${r.zone}::${lotName}`;
    if (lotIdByRowKey.has(rowKey)) continue;
    const dbKey = `${zoneId}::${normalizeName(lotName)}`;
    const existing = lotsByKey.get(dbKey);
    if (existing) {
      lotIdByRowKey.set(rowKey, existing);
      audit.lotsReused++;
      continue;
    }
    const nextNum = (lotMaxNumberByZone.get(zoneId) || 0) + 1;
    lotMaxNumberByZone.set(zoneId, nextNum);
    const { data, error } = await supabase.from("event_ticket_lots").insert({
      zone_id: zoneId, name: lotName, lot_number: nextNum,
      lot_type: "regular", lot_kind: "simple",
      is_combo: false, consumes_zone_ids: [],
      price: 0, quantity: 0, iva_rate: IVA_RATE, company_id: companyId,
    }).select("id").single();
    if (error) throw new Error(`Criar lote "${lotName}" em zona "${r.zone}": ${error.message}`);
    lotIdByRowKey.set(rowKey, data!.id);
    lotsByKey.set(dbKey, data!.id);
    audit.lotsCreated++;
  }

  for (const [k, lotId] of lotIdByRowKey.entries()) {
    const [zone, lot] = k.split("::");
    audit.zoneLotMap.push({ zone, lot, zoneId: zoneIdByName.get(zone)!, lotId });
  }

  // 6. Assignment conta Ticketline → evento (sem date)
  const { data: existingAssign } = await supabase
    .from("event_ticket_office_assignments").select("id")
    .eq("event_id", eventId).eq("financial_account_id", ticketlineAccountId).is("event_date_id", null)
    .maybeSingle();
  if (!existingAssign) {
    const { error } = await supabase.from("event_ticket_office_assignments")
      .insert({ event_id: eventId, event_date_id: null, financial_account_id: ticketlineAccountId, company_id: companyId });
    if (error) audit.warnings.push(`Assignment falhou (não-crítico): ${error.message}`);
  }

  // 7. Apagar vendas Ticketline anteriores deste evento+conta
  if (allZoneIds.length > 0) {
    const { data: prior } = await supabase.from("ticket_sales").select("id")
      .in("zone_id", allZoneIds).eq("financial_account_id", ticketlineAccountId).eq("source", SOURCE);
    audit.prevSalesDeleted = prior?.length || 0;
    const { error } = await supabase.from("ticket_sales").delete()
      .in("zone_id", allZoneIds).eq("financial_account_id", ticketlineAccountId).eq("source", SOURCE);
    if (error) throw new Error(`Apagar vendas anteriores: ${error.message}`);
  }

  // 8. Inserir ticket_sales (1 linha por row TOTAL VENDAS ≠ 0)
  const payload = rows
    .filter(r => r.totalVendasQty !== 0 || r.totalVendasValue !== 0)
    .map(r => {
      const lotName = r.ticketType ? `${r.lot} | ${r.ticketType}` : r.lot;
      const lotId = lotIdByRowKey.get(`${r.zone}::${lotName}`);
      const zoneId = zoneIdByName.get(r.zone);
      const unit = r.totalVendasQty !== 0 ? Math.round((r.totalVendasValue / r.totalVendasQty) * 100) / 100 : 0;
      return {
        zone_id: zoneId, lot_id: lotId,
        sale_date: r.date,
        quantity: r.totalVendasQty,
        unit_price: unit,
        total_value: r.totalVendasValue,
        financial_account_id: ticketlineAccountId,
        source: SOURCE,
        notes: `Ticketline • ${r.rawLabel}`,
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

  // 9. Log
  const { data: log, error: logErr } = await supabase.from("ticket_import_logs").insert({
    event_id: eventId, financial_account_id: ticketlineAccountId,
    file_name: filenames.summary,
    import_type: "sales",
    period_from: parseResult.header.period_from || null,
    period_to: parseResult.header.period_to || null,
    rows_imported: payload.length, rows_skipped: 0,
    zones_created: audit.zonesCreated, lots_created: audit.lotsCreated,
    company_id: companyId,
  }).select("id").single();
  if (logErr) console.warn("ticket_import_logs:", logErr.message);
  else audit.importLogId = log?.id || null;

  return audit;
}
