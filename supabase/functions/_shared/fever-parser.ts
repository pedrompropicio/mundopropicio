// Cópia Deno-compatível de src/lib/parse-fever-xlsx.ts
// (mesma lógica; única diferença é o import XLSX via npm:)
// IMPORTANTE: manter sincronizado com src/lib/parse-fever-xlsx.ts
import * as XLSX from "npm:xlsx@0.18.5";

export const FEVER_IVA_RATE = 6;

export type FeverPhysicalZoneKind = "relvado" | "tenda";
export type FeverZoneKind = "relvado_diario" | "tenda_diario";
export type FeverLotKind = "daily" | "pass";

export interface FeverParsedLot {
  key: string;
  ticketType: string;
  ticketPrice: number;
  unitPrice: number;
  unitPriceNet: number;
  lotName: string;
  zoneName: string;
  physicalZone: FeverPhysicalZoneKind;
  zoneKind: FeverZoneKind | null;
  lotKind: FeverLotKind;
  daySlot: "saturday" | "sunday" | null;
  totalQty: number;
  totalGross: number;
  totalDiscount: number;
  totalUserPayment: number;
}

export interface FeverParsedSale {
  purchaseDate: string;
  weekday: string;
  lotKey: string;
  ticketType: string;
  unitPrice: number;
  quantity: number;
  totalValue: number;
}

export interface FeverParseResult {
  lots: FeverParsedLot[];
  sales: FeverParsedSale[];
  totals: {
    totalQty: number;
    totalGross: number;
    totalDiscount: number;
    totalUserPayment: number;
    periodFrom: string | null;
    periodTo: string | null;
    distinctTypes: number;
  };
  warnings: string[];
}

const norm = (s: string) =>
  (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const lotKey = (t: string, p: number) => `${t.trim()}|${Number(p).toFixed(2)}`;
const roundCents = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

function headerIndex(headers: string[]): Map<string, number> {
  return new Map(headers.map((h, i) => [norm(h), i]));
}
function cellByHeader(row: any[], idx: Map<string, number>, h: string) {
  const i = idx.get(norm(h));
  return i === undefined ? undefined : row[i];
}
function toLocalDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const p = new Date(value);
    if (!isNaN(p.getTime())) return toLocalDate(p);
  }
  return null;
}

function deriveLotMeta(ticketType: string) {
  const t = norm(ticketType);
  const isVIP = t.includes("vip") || t.includes("tenda");
  const isPass = t.includes("2 dias") || t.includes("passe");
  const isDaily = t.includes("entrada diaria") || t.includes("entrada diária");
  let daySlot: "saturday" | "sunday" | null = null;
  if (isDaily) {
    if (t.includes("sabado") || t.includes("sábado")) daySlot = "saturday";
    else if (t.includes("domingo")) daySlot = "sunday";
  }
  const physicalZone: FeverPhysicalZoneKind = isVIP ? "tenda" : "relvado";
  const baseZoneLabel = isVIP ? "Tenda VIP" : "Relvado";
  let zoneName: string, zoneKind: FeverZoneKind | null, lotKind: FeverLotKind;
  if (isPass && !isDaily) {
    lotKind = "pass";
    zoneName = `${baseZoneLabel} — Passe 2 dias`;
    zoneKind = null;
  } else {
    lotKind = "daily";
    const dayLabel = daySlot === "saturday" ? "Sábado" : daySlot === "sunday" ? "Domingo" : "";
    zoneName = `${baseZoneLabel} — ${dayLabel}`;
    zoneKind = isVIP ? "tenda_diario" : "relvado_diario";
  }
  return { zoneName, physicalZone, zoneKind, lotKind, daySlot, lotName: ticketType.trim() };
}

export function isFeverSalesFormat(headers: string[]): boolean {
  const n = headers.map((h) => (h || "").toString().trim().toLowerCase());
  return n.includes("date") && n.includes("weekday") && n.includes("ticket type") && n.includes("tickets sold") && !n.includes("ticket price");
}
export function isFeverPricesFormat(headers: string[]): boolean {
  const n = headers.map((h) => (h || "").toString().trim().toLowerCase());
  return n.includes("ticket type") && n.includes("ticket price") && n.includes("total gross revenue");
}

export function parseFeverXlsxBuffers(salesBuf: ArrayBuffer, pricesBuf: ArrayBuffer): FeverParseResult {
  const warnings: string[] = [];
  const salesWb = XLSX.read(salesBuf, { type: "array", cellDates: true });
  const pricesWb = XLSX.read(pricesBuf, { type: "array", cellDates: true });
  const salesRows = XLSX.utils.sheet_to_json<any>(salesWb.Sheets[salesWb.SheetNames[0]], { header: 1, raw: true });
  const pricesRows = XLSX.utils.sheet_to_json<any>(pricesWb.Sheets[pricesWb.SheetNames[0]], { header: 1, raw: true });

  const salesHeaders = (salesRows[0] || []) as string[];
  const pricesHeaders = (pricesRows[0] || []) as string[];
  const pIdx = headerIndex(pricesHeaders);

  if (!isFeverSalesFormat(salesHeaders)) throw new Error("Ficheiro vendas não está no formato Fever esperado.");
  if (!isFeverPricesFormat(pricesHeaders)) throw new Error("Ficheiro preços não está no formato Fever esperado.");

  const lotMap = new Map<string, FeverParsedLot>();
  for (let i = 1; i < pricesRows.length; i++) {
    const row = pricesRows[i] as any[];
    if (!row || row.length === 0) continue;
    const ticketType = cellByHeader(row, pIdx, "Ticket Type");
    const price = Number(cellByHeader(row, pIdx, "Ticket Price"));
    const sold = Number(cellByHeader(row, pIdx, "Tickets sold")) || 0;
    const promoterGross = Number(cellByHeader(row, pIdx, "Ticket Gross Revenue")) || 0;
    const discount = Number(cellByHeader(row, pIdx, "Discount")) || 0;
    const userPayment = Number(cellByHeader(row, pIdx, "User Payment")) || 0;
    if (!ticketType || !Number.isFinite(price)) continue;
    const meta = deriveLotMeta(ticketType);
    const k = lotKey(ticketType, price);
    if (lotMap.has(k)) { warnings.push(`Lote duplicado: "${ticketType}" @ €${price}`); continue; }
    const eff = sold > 0 && promoterGross > 0 ? promoterGross / sold : price;
    lotMap.set(k, {
      key: k, ticketType: ticketType.trim(), ticketPrice: price,
      unitPrice: eff, unitPriceNet: +(eff / (1 + FEVER_IVA_RATE / 100)).toFixed(4),
      lotName: meta.lotName, zoneName: meta.zoneName, physicalZone: meta.physicalZone,
      zoneKind: meta.zoneKind, lotKind: meta.lotKind, daySlot: meta.daySlot,
      totalQty: sold, totalGross: promoterGross, totalDiscount: discount, totalUserPayment: userPayment,
    });
  }
  const lots = Array.from(lotMap.values());

  const lotsByType = new Map<string, FeverParsedLot[]>();
  for (const l of lots) {
    const a = lotsByType.get(l.ticketType) || [];
    a.push(l); lotsByType.set(l.ticketType, a);
  }
  for (const a of lotsByType.values()) a.sort((x, y) => x.ticketPrice - y.ticketPrice);

  interface Raw { date: string; weekday: string; ticketType: string; qty: number }
  const raw: Raw[] = [];
  let periodFrom: string | null = null, periodTo: string | null = null, totalQtySales = 0;

  for (let i = 1; i < salesRows.length; i++) {
    const row = salesRows[i] as any[];
    if (!row || row.length === 0) continue;
    const [dateRaw, weekday, ticketType, qtyRaw] = row;
    if (!ticketType) continue;
    const date = toLocalDate(dateRaw);
    const qty = Number(qtyRaw) || 0;
    if (!date || qty <= 0) continue;
    if (!periodFrom || date < periodFrom) periodFrom = date;
    if (!periodTo || date > periodTo) periodTo = date;
    totalQtySales += qty;
    raw.push({ date, weekday: String(weekday || ""), ticketType: (ticketType as string).trim(), qty });
  }

  const byType = new Map<string, Raw[]>();
  for (const r of raw) {
    const a = byType.get(r.ticketType) || [];
    a.push(r); byType.set(r.ticketType, a);
  }

  const sales: FeverParsedSale[] = [];
  for (const [ticketType, dailyRows] of byType.entries()) {
    const variants = lotsByType.get(ticketType);
    if (!variants || variants.length === 0) {
      const skipped = dailyRows.reduce((s, r) => s + r.qty, 0);
      warnings.push(`Tipo "${ticketType}" sem preço — ${skipped} ignorados`);
      continue;
    }
    if (variants.length === 1) {
      const lot = variants[0];
      let remaining = lot.totalQty;
      for (const r of dailyRows) {
        if (remaining <= 0) {
          warnings.push(`Descartado ${r.qty} bilhete(s) "${ticketType}" em ${r.date} — não corresponde a vendas confirmadas no relatório sales_per_ticket_type (provavelmente reservas pendentes / refunds posteriores)`);
          continue;
        }
        const take = Math.min(r.qty, remaining);
        sales.push({ purchaseDate: r.date, weekday: r.weekday, lotKey: lot.key, ticketType: lot.ticketType,
          unitPrice: lot.unitPrice, quantity: take, totalValue: roundCents(take * lot.unitPrice) });
        remaining -= take;
        if (r.qty > take) {
          warnings.push(`Descartado ${r.qty - take} bilhete(s) "${ticketType}" em ${r.date} — não corresponde a vendas confirmadas no relatório sales_per_ticket_type (provavelmente reservas pendentes / refunds posteriores)`);
        }
      }
      continue;
    }
    dailyRows.sort((a, b) => a.date.localeCompare(b.date));
    const remaining = new Map(variants.map((v) => [v.key, v.totalQty]));
    let cursor = 0;
    for (const r of dailyRows) {
      let need = r.qty;
      while (need > 0) {
        while (cursor < variants.length && (remaining.get(variants[cursor].key) || 0) <= 0) cursor++;
        if (cursor >= variants.length) {
          warnings.push(`Descartado ${need} bilhete(s) "${ticketType}" em ${r.date} — não corresponde a vendas confirmadas no relatório sales_per_ticket_type (provavelmente reservas pendentes / refunds posteriores)`);
          need = 0;
          break;
        }
        const lot = variants[cursor];
        const stock = remaining.get(lot.key) || 0;
        const take = Math.min(need, stock);
        sales.push({ purchaseDate: r.date, weekday: r.weekday, lotKey: lot.key, ticketType: lot.ticketType,
          unitPrice: lot.unitPrice, quantity: take, totalValue: roundCents(take * lot.unitPrice) });
        remaining.set(lot.key, stock - take);
        need -= take;
      }
    }
  }

  const salesByLotKey = new Map<string, FeverParsedSale[]>();
  for (const s of sales) {
    const a = salesByLotKey.get(s.lotKey) || [];
    a.push(s); salesByLotKey.set(s.lotKey, a);
  }
  for (const lot of lots) {
    const ls = salesByLotKey.get(lot.key) || [];
    if (ls.length === 0) continue;
    const importedQty = ls.reduce((s, x) => s + x.quantity, 0);
    const importedGross = roundCents(ls.reduce((s, x) => s + x.totalValue, 0));
    const diff = roundCents(lot.totalGross - importedGross);
    if (importedQty === lot.totalQty && Math.abs(diff) >= 0.01) {
      ls[ls.length - 1].totalValue = roundCents(ls[ls.length - 1].totalValue + diff);
    }
  }

  const totalQtyPrices = lots.reduce((s, l) => s + l.totalQty, 0);
  if (Math.abs(totalQtySales - totalQtyPrices) > 0) {
    warnings.push(`Discrepância: vendas=${totalQtySales} vs preços=${totalQtyPrices}`);
  }

  return {
    lots, sales,
    totals: {
      totalQty: totalQtyPrices,
      totalGross: lots.reduce((s, l) => s + l.totalGross, 0),
      totalDiscount: lots.reduce((s, l) => s + l.totalDiscount, 0),
      totalUserPayment: lots.reduce((s, l) => s + l.totalUserPayment, 0),
      periodFrom, periodTo, distinctTypes: lots.length,
    },
    warnings,
  };
}

export interface FeverDailyZoneGroup {
  zoneName: string;
  zoneKind: FeverZoneKind;
  physicalZone: FeverPhysicalZoneKind;
  daySlot: "saturday" | "sunday";
  lots: FeverParsedLot[];
}
export interface FeverComboGroup {
  groupLabel: string;
  physicalZone: FeverPhysicalZoneKind;
  lots: FeverParsedLot[];
}
export interface FeverGroupedLots {
  dailyGroups: FeverDailyZoneGroup[];
  comboGroups: FeverComboGroup[];
}

export function groupFeverLots(lots: FeverParsedLot[]): FeverGroupedLots {
  const dailyMap = new Map<string, FeverDailyZoneGroup>();
  const comboMap = new Map<FeverPhysicalZoneKind, FeverComboGroup>();
  for (const lot of lots) {
    if (lot.lotKind === "daily" && lot.zoneKind && lot.daySlot) {
      const k = `${lot.zoneKind}|${lot.daySlot}`;
      if (!dailyMap.has(k)) dailyMap.set(k, { zoneName: lot.zoneName, zoneKind: lot.zoneKind, physicalZone: lot.physicalZone, daySlot: lot.daySlot, lots: [] });
      dailyMap.get(k)!.lots.push(lot);
    } else if (lot.lotKind === "pass") {
      if (!comboMap.has(lot.physicalZone)) comboMap.set(lot.physicalZone, {
        groupLabel: `${lot.physicalZone === "tenda" ? "Tenda VIP" : "Relvado"} — Combo Passe 2 dias`,
        physicalZone: lot.physicalZone, lots: [],
      });
      comboMap.get(lot.physicalZone)!.lots.push(lot);
    }
  }
  const dailyOrder: FeverZoneKind[] = ["relvado_diario", "tenda_diario"];
  const dailyGroups = Array.from(dailyMap.values()).sort((a, b) => {
    const da = dailyOrder.indexOf(a.zoneKind), db = dailyOrder.indexOf(b.zoneKind);
    if (da !== db) return da - db;
    return a.daySlot.localeCompare(b.daySlot);
  });
  const comboOrder: FeverPhysicalZoneKind[] = ["relvado", "tenda"];
  const comboGroups = Array.from(comboMap.values()).sort(
    (a, b) => comboOrder.indexOf(a.physicalZone) - comboOrder.indexOf(b.physicalZone),
  );
  return { dailyGroups, comboGroups };
}
