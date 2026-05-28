// Server-side port da lógica de import do FeverImportModal (mutationFn).
// IMPORTANTE: manter alinhado com src/components/FeverImportModal.tsx
import type { FeverParseResult, FeverGroupedLots } from "./fever-parser.ts";
import { FEVER_IVA_RATE } from "./fever-parser.ts";

const norm = (s: string) =>
  (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

interface ImportInput {
  supabase: any; // service-role client
  eventId: string;
  feverAccountId: string;
  parseResult: FeverParseResult;
  grouped: FeverGroupedLots;
  filenames: { sales: string; prices: string };
  triggeredBy?: string | null;
}

export interface ImportAudit {
  rowsImported: number;
  zonesCreated: number;
  zonesReused: number;
  lotsCreated: number;
  lotsUpdated: number;
  prevSalesDeleted: number;
  importBatchId: string;
  importLogId: string | null;
  warnings: string[];
  // Telemetria por sale_date (prev vs new após o delete+insert).
  byDate?: {
    prev: Record<string, { qty: number; rev: number }>;
    next: Record<string, { qty: number; rev: number }>;
    diff: Record<string, { qty: number; rev: number }>;
    yesterday?: { date: string; prev_qty: number; next_qty: number; delta_qty: number; prev_rev: number; next_rev: number; delta_rev: number };
    shrunk_dates: string[]; // datas onde qty caiu vs run anterior
  };
}

export async function runFeverImport(input: ImportInput): Promise<ImportAudit> {
  const { supabase, eventId, feverAccountId, parseResult, grouped, filenames, triggeredBy } = input;
  const audit: ImportAudit = {
    rowsImported: 0, zonesCreated: 0, zonesReused: 0, lotsCreated: 0, lotsUpdated: 0,
    prevSalesDeleted: 0, importBatchId: crypto.randomUUID(), importLogId: null,
    warnings: [...parseResult.warnings],
  };

  const { data: ev, error: evErr } = await supabase
    .from("events").select("company_id, date").eq("id", eventId).single();
  if (evErr || !ev) throw new Error("Evento não encontrado");
  const companyId = ev.company_id;

  const [datesRes, sessionsRes, zonesRes] = await Promise.all([
    supabase.from("event_dates").select("id, date, label").eq("event_id", eventId).order("date"),
    supabase.from("event_sessions").select("id, date, label").eq("event_id", eventId).order("date"),
    supabase.from("event_ticket_zones").select("id, name, session_id, total_capacity").eq("event_id", eventId),
  ]);
  const existingDates = datesRes.data || [];
  const existingSessions = sessionsRes.data || [];
  const existingZones = zonesRes.data || [];

  // 1. Datas Sáb/Dom
  let saturdayDate: string, sundayDate: string;
  if (existingDates.length >= 2) {
    const sorted = [...existingDates].sort((a: any, b: any) => a.date.localeCompare(b.date));
    saturdayDate = sorted[0].date; sundayDate = sorted[1].date;
  } else {
    const base = new Date(ev.date + "T00:00:00");
    const next = new Date(base.getTime() + 86400000);
    saturdayDate = ev.date;
    sundayDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  }

  const upsertDate = async (date: string, label: string) => {
    const found = existingDates.find((d: any) => d.date === date);
    if (found) return found;
    const { data, error } = await supabase
      .from("event_dates").insert({ event_id: eventId, date, label, company_id: companyId })
      .select("id, date, label").single();
    if (error) throw error;
    return data!;
  };
  const upsertSession = async (date: string, label: string, sortOrder: number) => {
    const found = existingSessions.find((s: any) => s.date === date);
    if (found) return found;
    const { data, error } = await supabase
      .from("event_sessions").insert({ event_id: eventId, date, label, sort_order: sortOrder, company_id: companyId })
      .select("id, date, label").single();
    if (error) throw error;
    return data!;
  };

  await upsertDate(saturdayDate, "Sábado");
  await upsertDate(sundayDate, "Domingo");
  const satSession = await upsertSession(saturdayDate, "Sábado", 1);
  const sunSession = await upsertSession(sundayDate, "Domingo", 2);

  // 1.5 limpar zonas órfãs "(Passe 2 dias)"
  const orphanZones = existingZones.filter((z: any) => /\(passe 2 dias\)/i.test(z.name || ""));
  if (orphanZones.length > 0) {
    const orphanIds = orphanZones.map((z: any) => z.id);
    const { data: orphanLots } = await supabase.from("event_ticket_lots").select("id").in("zone_id", orphanIds);
    const orphanLotIds = (orphanLots || []).map((l: any) => l.id);
    if (orphanLotIds.length > 0) {
      await supabase.from("ticket_sales").delete().in("lot_id", orphanLotIds);
      await supabase.from("event_ticket_lots").delete().in("id", orphanLotIds);
    }
    await supabase.from("event_ticket_zones").delete().in("id", orphanIds);
  }

  // 2. Zonas-dia (reset de lotes Fever existentes nessas zonas)
  const expectedZoneNames = new Set(grouped.dailyGroups.map((g) => norm(g.zoneName)));
  const feverZonesBefore = existingZones.filter((z: any) => expectedZoneNames.has(norm(z.name)));
  const feverZoneIdsBefore = feverZonesBefore.map((z: any) => z.id);
  if (feverZoneIdsBefore.length > 0) {
    const { data: feverLotsBefore } = await supabase.from("event_ticket_lots").select("id").in("zone_id", feverZoneIdsBefore);
    const feverLotIdsBefore = (feverLotsBefore || []).map((l: any) => l.id);
    if (feverLotIdsBefore.length > 0) {
      const { error: e1 } = await supabase.from("ticket_sales").delete().in("lot_id", feverLotIdsBefore);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("event_ticket_lots").delete().in("id", feverLotIdsBefore);
      if (e2) throw e2;
    }
  }

  const zoneIdByKindDay = new Map<string, string>();
  for (const g of grouped.dailyGroups) {
    const sessionId = g.daySlot === "saturday" ? satSession.id : sunSession.id;
    const match = existingZones.find((z: any) => norm(z.name) === norm(g.zoneName) && z.session_id === sessionId);
    let zoneId: string;
    if (match) { zoneId = match.id; audit.zonesReused++; }
    else {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .insert({ event_id: eventId, name: g.zoneName, session_id: sessionId, total_capacity: 0, company_id: companyId })
        .select("id").single();
      if (error) throw error;
      zoneId = data!.id; audit.zonesCreated++;
    }
    zoneIdByKindDay.set(`${g.physicalZone}|${g.daySlot}`, zoneId);
  }

  // 3. Lotes
  const resolvedLotIds: Record<string, string> = {};
  const lotZoneByKey = new Map<string, string>();
  const ensureLot = async (zoneId: string, lot: any, opts: { isCombo: boolean; consumesZoneIds: string[]; lotNumber: number }) => {
    const { data: existingLots } = await supabase.from("event_ticket_lots").select("id, name, price").eq("zone_id", zoneId);
    const found = (existingLots || []).find((l: any) =>
      norm(l.name) === norm(lot.lotName) &&
      (Math.abs(Number(l.price) - lot.unitPrice) < 0.01 || Math.abs(Number(l.price) - lot.ticketPrice) < 0.01),
    );
    if (found) {
      await supabase.from("event_ticket_lots").update({
        price: lot.unitPrice, quantity: lot.totalQty, iva_rate: FEVER_IVA_RATE,
        is_combo: opts.isCombo, lot_kind: opts.isCombo ? "combo" : "simple",
        consumes_zone_ids: opts.isCombo ? opts.consumesZoneIds : [],
      }).eq("id", found.id);
      resolvedLotIds[lot.key] = found.id;
      audit.lotsUpdated++;
    } else {
      const { data, error } = await supabase.from("event_ticket_lots").insert({
        zone_id: zoneId, name: lot.lotName, lot_number: opts.lotNumber, lot_type: "regular",
        lot_kind: opts.isCombo ? "combo" : "simple", is_combo: opts.isCombo,
        consumes_zone_ids: opts.isCombo ? opts.consumesZoneIds : [],
        price: lot.unitPrice, quantity: lot.totalQty, iva_rate: FEVER_IVA_RATE, company_id: companyId,
      }).select("id").single();
      if (error) throw error;
      resolvedLotIds[lot.key] = data!.id;
      audit.lotsCreated++;
    }
    lotZoneByKey.set(lot.key, zoneId);
  };

  for (const g of grouped.dailyGroups) {
    const zoneId = zoneIdByKindDay.get(`${g.physicalZone}|${g.daySlot}`)!;
    let n = 1;
    for (const lot of g.lots) await ensureLot(zoneId, lot, { isCombo: false, consumesZoneIds: [], lotNumber: n++ });
  }
  for (const g of grouped.comboGroups) {
    const satZoneId = zoneIdByKindDay.get(`${g.physicalZone}|saturday`);
    const sunZoneId = zoneIdByKindDay.get(`${g.physicalZone}|sunday`);
    if (!satZoneId || !sunZoneId) throw new Error(`Combo "${g.groupLabel}" precisa de zonas Sáb+Dom da família ${g.physicalZone}.`);
    let n = 1;
    for (const lot of g.lots) await ensureLot(satZoneId, lot, { isCombo: true, consumesZoneIds: [satZoneId, sunZoneId], lotNumber: n++ });
  }

  // 5. Assignment Fever → evento
  const { data: existingAssign } = await supabase
    .from("event_ticket_office_assignments")
    .select("id").eq("event_id", eventId).eq("financial_account_id", feverAccountId).is("event_date_id", null).maybeSingle();
  if (!existingAssign) {
    const { error } = await supabase.from("event_ticket_office_assignments")
      .insert({ event_id: eventId, event_date_id: null, financial_account_id: feverAccountId, company_id: companyId });
    if (error) throw error;
  }

  // 6. Apagar ticket_sales Fever existentes do evento
  const { data: allEventZones } = await supabase.from("event_ticket_zones").select("id").eq("event_id", eventId);
  const allEventZoneIds = (allEventZones || []).map((z: any) => z.id);
  if (allEventZoneIds.length > 0) {
    const { data: priorSales } = await supabase.from("ticket_sales").select("id", { count: "exact" })
      .in("zone_id", allEventZoneIds).eq("financial_account_id", feverAccountId);
    audit.prevSalesDeleted = priorSales?.length || 0;
    const { error } = await supabase.from("ticket_sales").delete()
      .in("zone_id", allEventZoneIds).eq("financial_account_id", feverAccountId);
    if (error) throw error;
  }

  // 7. Inserir ticket_sales
  const salesPayload = parseResult.sales.map((s) => ({
    zone_id: lotZoneByKey.get(s.lotKey)!,
    lot_id: resolvedLotIds[s.lotKey],
    sale_date: s.purchaseDate,
    quantity: s.quantity,
    unit_price: s.unitPrice,
    total_value: s.totalValue,
    financial_account_id: feverAccountId,
    source: "fever_import",
    notes: `Fever • ${s.weekday} • ${s.ticketType}`,
    import_batch_id: audit.importBatchId,
    company_id: companyId,
  }));
  for (let i = 0; i < salesPayload.length; i += 500) {
    const chunk = salesPayload.slice(i, i + 500);
    const { error } = await supabase.from("ticket_sales").insert(chunk);
    if (error) throw error;
  }
  audit.rowsImported = salesPayload.length;

  // 8. Log
  const { data: log, error: logErr } = await supabase.from("ticket_import_logs").insert({
    event_id: eventId, financial_account_id: feverAccountId,
    file_name: `${filenames.sales} + ${filenames.prices}`,
    import_type: "sales",
    period_from: parseResult.totals.periodFrom, period_to: parseResult.totals.periodTo,
    rows_imported: salesPayload.length, rows_skipped: 0, zones_created: audit.zonesCreated, lots_created: audit.lotsCreated,
    company_id: companyId,
  }).select("id").single();
  if (logErr) console.warn("ticket_import_logs insert failed:", logErr.message);
  else audit.importLogId = log?.id || null;

  return audit;
}
