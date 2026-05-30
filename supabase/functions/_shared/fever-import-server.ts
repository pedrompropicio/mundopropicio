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

  // 2. Sweep TOTAL de lotes Fever do evento.
  //    - (a) lotes em zonas cujo nome bate com as zonas-dia esperadas (caminho histórico);
  //    - (b) lotes que tenham QUALQUER ticket_sale ligado à conta Fever
  //      (apanha phantom lots de runs antigos cujas zonas já não batem,
  //      ex.: cortesias a €300/€900 antes do FEVER_EXCLUDED_PRICES existir).
  const expectedZoneNames = new Set(grouped.dailyGroups.map((g) => norm(g.zoneName)));
  const feverZonesBefore = existingZones.filter((z: any) => expectedZoneNames.has(norm(z.name)));
  const lotIdsToSweep = new Set<string>();

  const feverZoneIdsBefore = feverZonesBefore.map((z: any) => z.id);
  if (feverZoneIdsBefore.length > 0) {
    const { data: lotsByZone } = await supabase.from("event_ticket_lots")
      .select("id").in("zone_id", feverZoneIdsBefore);
    for (const l of (lotsByZone || []) as any[]) lotIdsToSweep.add(l.id);
  }

  const allEventZoneIdsForSweep = existingZones.map((z: any) => z.id);
  if (allEventZoneIdsForSweep.length > 0) {
    // pagina para apanhar todos os lot_ids ligados a vendas Fever
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: rows, error } = await supabase.from("ticket_sales")
        .select("lot_id")
        .in("zone_id", allEventZoneIdsForSweep)
        .eq("financial_account_id", feverAccountId)
        .not("lot_id", "is", null)
        .range(from, from + pageSize - 1);
      if (error) break;
      if (!rows || rows.length === 0) break;
      for (const r of rows as any[]) if (r.lot_id) lotIdsToSweep.add(r.lot_id);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  }

  if (lotIdsToSweep.size > 0) {
    const ids = Array.from(lotIdsToSweep);
    const { error: e1 } = await supabase.from("ticket_sales").delete().in("lot_id", ids);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("event_ticket_lots").delete().in("id", ids);
    if (e2) throw e2;
    audit.warnings.push(`fever_sweep: ${ids.length} lote(s) removido(s) antes do re-import`);
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
    // Ignora erro se a atribuição já existir (corrida ou check anterior falhou silenciosamente)
    if (error && !/duplicate|already|foreign key/i.test(error.message || "")) throw error;
    if (error) audit.warnings.push(`assignment_skipped: ${error.message}`);
  }


  // 6. Apagar ticket_sales Fever existentes do evento (com snapshot prévio por sale_date)
  const { data: allEventZones } = await supabase.from("event_ticket_zones").select("id").eq("event_id", eventId);
  const allEventZoneIds = (allEventZones || []).map((z: any) => z.id);

  // Snapshot agregado por sale_date ANTES do delete (para telemetria byDate)
  const prevByDate: Record<string, { qty: number; rev: number }> = {};
  if (allEventZoneIds.length > 0) {
    // pagina para evitar limite default de 1000
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: rows, error } = await supabase.from("ticket_sales")
        .select("sale_date, quantity, total_value")
        .in("zone_id", allEventZoneIds).eq("financial_account_id", feverAccountId)
        .range(from, from + pageSize - 1);
      if (error) break;
      if (!rows || rows.length === 0) break;
      for (const r of rows as any[]) {
        const d = r.sale_date as string;
        if (!d) continue;
        if (!prevByDate[d]) prevByDate[d] = { qty: 0, rev: 0 };
        prevByDate[d].qty += Number(r.quantity || 0);
        prevByDate[d].rev += Number(r.total_value || 0);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    audit.prevSalesDeleted = Object.values(prevByDate).reduce((s, v) => s + v.qty, 0);

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

  // 7.5 Snapshot agregado por sale_date DEPOIS do insert + cálculo do diff
  const nextByDate: Record<string, { qty: number; rev: number }> = {};
  for (const s of parseResult.sales) {
    const d = s.purchaseDate;
    if (!d) continue;
    if (!nextByDate[d]) nextByDate[d] = { qty: 0, rev: 0 };
    nextByDate[d].qty += Number(s.quantity || 0);
    nextByDate[d].rev += Number(s.totalValue || 0);
  }
  const allDates = new Set<string>([...Object.keys(prevByDate), ...Object.keys(nextByDate)]);
  const diffByDate: Record<string, { qty: number; rev: number }> = {};
  const shrunk: string[] = [];
  for (const d of allDates) {
    const p = prevByDate[d] || { qty: 0, rev: 0 };
    const n = nextByDate[d] || { qty: 0, rev: 0 };
    diffByDate[d] = { qty: n.qty - p.qty, rev: Math.round((n.rev - p.rev) * 100) / 100 };
    if (p.qty > 0 && n.qty < p.qty) shrunk.push(d);
  }
  // Cálculo de "ontem" no fuso UTC (mesmo que o resto do sistema usa YYYY-MM-DD)
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const yISO = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
  const py = prevByDate[yISO] || { qty: 0, rev: 0 };
  const ny = nextByDate[yISO] || { qty: 0, rev: 0 };
  audit.byDate = {
    prev: prevByDate,
    next: nextByDate,
    diff: diffByDate,
    yesterday: {
      date: yISO,
      prev_qty: py.qty, next_qty: ny.qty, delta_qty: ny.qty - py.qty,
      prev_rev: Math.round(py.rev * 100) / 100,
      next_rev: Math.round(ny.rev * 100) / 100,
      delta_rev: Math.round((ny.rev - py.rev) * 100) / 100,
    },
    shrunk_dates: shrunk,
  };
  if (audit.byDate.yesterday && audit.byDate.yesterday.delta_qty < 0) {
    audit.warnings.push(`yesterday_shrunk: ${yISO} qty ${py.qty}→${ny.qty} (Δ${ny.qty - py.qty})`);
  }
  if (shrunk.length > 0) {
    audit.warnings.push(`shrunk_dates: ${shrunk.slice(0, 10).join(",")}${shrunk.length > 10 ? `… (+${shrunk.length - 10})` : ""}`);
  }

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
