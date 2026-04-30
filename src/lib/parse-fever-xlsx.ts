/**
 * Parser dos ficheiros Fever para importação de vendas de bilheteira.
 *
 * Recebe DOIS ficheiros XLSX:
 *  1. SALES   — "tickets_per_ticket_type_and_purchase_date_*.xlsx"
 *               Colunas: Date | Weekday | Ticket Type | Tickets sold
 *  2. PRICES  — "sales_per_ticket_type_and_ticket_price_*.xlsx"
 *               Colunas: Ticket Type | Ticket Price | Is Add-on | Tickets sold
 *                        | Invitations | Total Gross Revenue | Ticket Gross Revenue
 *                        | Surcharge | Discount | User Payment
 *
 * Chave única de "lote": (ticket_type + price). Fever usa o MESMO ticket_type
 * com preços diferentes quando o lote sobe (ex.: "Passe fim de semana ... lote 4"
 * aparece a €95 e a €105).
 *
 * Decisões fixadas com o utilizador (2026-04-30):
 *  - Passes 2 dias  → 1 lote SEM session_id (regra Coala). Receita ao dia da compra.
 *  - Variantes (Revolut, Promo 2x, Early Bird) → cada uma é um lote separado.
 *  - Granularidade temporal → 1 ticket_sales por (purchase_date, lote).
 *  - Reimport → apaga ticket_sales Fever do evento e re-cria.
 */
import * as XLSX from "xlsx";

export const FEVER_IVA_RATE = 6; // bilhetes PT
export const FEVER_DEFAULT_QUANTITY = 0; // capacidade definida depois pelo utilizador

export type FeverZoneKind = "relvado_diario" | "tenda_diario" | "relvado_passe" | "tenda_passe";
export type FeverLotKind = "daily" | "pass";

export interface FeverParsedLot {
  /** chave estável: ticket_type|price */
  key: string;
  /** "Ticket Type" original do Fever */
  ticketType: string;
  /** preço facial original do Fever (coluna Ticket Price) */
  ticketPrice: number;
  /** preço unitário efetivo bruto, derivado de Total Gross Revenue / Tickets sold */
  unitPrice: number;
  /** preço líquido sugerido (sem IVA 6%) — calculado como unitPrice / 1.06 */
  unitPriceNet: number;
  /** nome legível do lote no app */
  lotName: string;
  /** zona derivada: Relvado / Tenda VIP / Relvado (Passe 2 dias) / Tenda VIP (Passe 2 dias) */
  zoneName: string;
  zoneKind: FeverZoneKind;
  /** "daily" → 1 sessão; "pass" → ambas as sessões (zona sem session_id) */
  lotKind: FeverLotKind;
  /** apenas se lotKind="daily": "saturday" ou "sunday" */
  daySlot: "saturday" | "sunday" | null;
  /** totais do ficheiro PRICES */
  totalQty: number;
  totalGross: number;
  totalDiscount: number;
  totalUserPayment: number;
}

export interface FeverParsedSale {
  /** YYYY-MM-DD em hora local */
  purchaseDate: string;
  weekday: string;
  /** chave do lote (ticket_type + preço) */
  lotKey: string;
  ticketType: string;
  unitPrice: number;
  quantity: number;
  /** valor bruto exato da linha, distribuído a partir de Total Gross Revenue */
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

// ---------------- helpers ----------------

const norm = (s: string) =>
  (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

function lotKey(ticketType: string, price: number): string {
  return `${ticketType.trim()}|${Number(price).toFixed(2)}`;
}

function roundCents(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function headerIndex(headers: string[]): Map<string, number> {
  return new Map(headers.map((header, idx) => [norm(header), idx]));
}

function cellByHeader(row: any[], indexes: Map<string, number>, header: string): any {
  const idx = indexes.get(norm(header));
  return idx === undefined ? undefined : row[idx];
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
    // já vem YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return toLocalDate(parsed);
    }
  }
  return null;
}

/**
 * Deriva metadata de um Ticket Type Fever:
 * "Entrada Diária | Relvado Sábado 30 Maio - lote 1"   → daily/relvado/saturday
 * "Lote 3 | Passe Geral Relvado 2 dias"                → pass/relvado
 * "Early Bird | Passe VIP Tenda Revolut 2 dias"        → pass/tenda
 * "Lote 3 | Promo - 2x Passe Geral Relvado 2 dias"     → pass/relvado (Promo 2x)
 */
function deriveLotMeta(ticketType: string): {
  zoneName: string;
  zoneKind: FeverZoneKind;
  lotKind: FeverLotKind;
  daySlot: "saturday" | "sunday" | null;
  lotName: string;
} {
  const t = norm(ticketType);
  const isVIP = t.includes("vip") || t.includes("tenda");
  const isPass = t.includes("2 dias") || t.includes("passe");
  const isDaily = t.includes("entrada diaria") || t.includes("entrada diária");

  let daySlot: "saturday" | "sunday" | null = null;
  if (isDaily) {
    if (t.includes("sabado") || t.includes("sábado")) daySlot = "saturday";
    else if (t.includes("domingo")) daySlot = "sunday";
  }

  let zoneName: string;
  let zoneKind: FeverZoneKind;
  let lotKind: FeverLotKind;

  if (isPass && !isDaily) {
    lotKind = "pass";
    zoneName = isVIP ? "Tenda VIP (Passe 2 dias)" : "Relvado (Passe 2 dias)";
    zoneKind = isVIP ? "tenda_passe" : "relvado_passe";
  } else {
    lotKind = "daily";
    const dayLabel = daySlot === "saturday" ? "Sábado" : daySlot === "sunday" ? "Domingo" : "";
    zoneName = isVIP ? `Tenda VIP — ${dayLabel}` : `Relvado — ${dayLabel}`;
    zoneKind = isVIP ? "tenda_diario" : "relvado_diario";
  }

  // Nome do lote: usa o próprio Ticket Type, removendo "| Passe ..." quando redundante
  const lotName = ticketType.trim();

  return { zoneName, zoneKind, lotKind, daySlot, lotName };
}

// ---------------- detecção de formato ----------------

export function isFeverSalesFormat(headers: string[]): boolean {
  const norm = headers.map((h) => (h || "").toString().trim().toLowerCase());
  return (
    norm.includes("date") &&
    norm.includes("weekday") &&
    norm.includes("ticket type") &&
    norm.includes("tickets sold") &&
    !norm.includes("ticket price")
  );
}

export function isFeverPricesFormat(headers: string[]): boolean {
  const norm = headers.map((h) => (h || "").toString().trim().toLowerCase());
  return (
    norm.includes("ticket type") &&
    norm.includes("ticket price") &&
    norm.includes("total gross revenue")
  );
}

// ---------------- API pública ----------------

/**
 * Lê os 2 ficheiros XLSX e devolve lotes consolidados + vendas por (data, lote).
 * Valida que totals SALES = totals PRICES e que cada Ticket Type tem preço.
 */
export async function parseFeverXlsx(
  salesFile: File,
  pricesFile: File,
): Promise<FeverParseResult> {
  const warnings: string[] = [];

  const [salesBuf, pricesBuf] = await Promise.all([
    salesFile.arrayBuffer(),
    pricesFile.arrayBuffer(),
  ]);

  const salesWb = XLSX.read(salesBuf, { type: "array", cellDates: true });
  const pricesWb = XLSX.read(pricesBuf, { type: "array", cellDates: true });

  const salesSheet = salesWb.Sheets[salesWb.SheetNames[0]];
  const pricesSheet = pricesWb.Sheets[pricesWb.SheetNames[0]];

  const salesRowsRaw = XLSX.utils.sheet_to_json<any>(salesSheet, { header: 1, raw: true });
  const pricesRowsRaw = XLSX.utils.sheet_to_json<any>(pricesSheet, { header: 1, raw: true });

  const salesHeaders = (salesRowsRaw[0] || []) as string[];
  const pricesHeaders = (pricesRowsRaw[0] || []) as string[];

  if (!isFeverSalesFormat(salesHeaders)) {
    throw new Error(
      "Ficheiro de vendas não está no formato Fever esperado (Date | Weekday | Ticket Type | Tickets sold).",
    );
  }
  if (!isFeverPricesFormat(pricesHeaders)) {
    throw new Error(
      "Ficheiro de preços não está no formato Fever esperado (Ticket Type | Ticket Price | ...).",
    );
  }

  // ----- PRICES (uma linha por Ticket Type+preço) -----
  const lotMap = new Map<string, FeverParsedLot>();
  for (let i = 1; i < pricesRowsRaw.length; i++) {
    const row = pricesRowsRaw[i] as any[];
    if (!row || row.length === 0) continue;
    const [ticketType, ticketPrice, _isAddon, sold, _inv, totalGross, _ticketGross, _surcharge, discount, userPayment] = row;
    if (!ticketType) continue;
    const price = Number(ticketPrice);
    if (!Number.isFinite(price)) continue;

    const meta = deriveLotMeta(ticketType);
    const key = lotKey(ticketType, price);

    if (lotMap.has(key)) {
      warnings.push(`Lote duplicado no ficheiro de preços: "${ticketType}" @ €${price}.`);
      continue;
    }

    const soldQty = Number(sold) || 0;
    const grossTotal = Number(totalGross) || 0;
    const effectiveUnitPrice = soldQty > 0 && grossTotal > 0 ? grossTotal / soldQty : price;

    lotMap.set(key, {
      key,
      ticketType: ticketType.trim(),
      ticketPrice: price,
      unitPrice: effectiveUnitPrice,
      unitPriceNet: +(effectiveUnitPrice / (1 + FEVER_IVA_RATE / 100)).toFixed(4),
      lotName: meta.lotName,
      zoneName: meta.zoneName,
      zoneKind: meta.zoneKind,
      lotKind: meta.lotKind,
      daySlot: meta.daySlot,
      totalQty: soldQty,
      totalGross: grossTotal,
      totalDiscount: Number(discount) || 0,
      totalUserPayment: Number(userPayment) || 0,
    });
  }

  const lots = Array.from(lotMap.values());

  // ----- SALES (uma linha por dia × tipo) -----
  // O ficheiro de vendas NÃO traz preço; o de preços diz quantos bilhetes
  // existiram a cada preço. Quando há vários preços para o mesmo Ticket Type
  // (ex.: "Passe fim de semana ... lote 4" a 95€ e 105€) usamos
  // **chronological capacity-fill**: por ordem de data crescente e por ordem
  // de preço crescente, vamos consumindo o "stock" de cada preço (totalQty
  // do ficheiro PRICES). Quando o preço barato esgota, salta para o seguinte.
  // Isto reproduz o que aconteceu na realidade — o lote esgotou e subiu.
  //
  // Em caso de stock insuficiente no último preço, o excedente fica nesse
  // mesmo preço (mais alto) com aviso. O total por tipo bate sempre.

  const lotsByTicketType = new Map<string, FeverParsedLot[]>();
  for (const lot of lots) {
    const arr = lotsByTicketType.get(lot.ticketType) || [];
    arr.push(lot);
    lotsByTicketType.set(lot.ticketType, arr);
  }
  // ordena variantes por preço asc (barato esgota primeiro)
  for (const arr of lotsByTicketType.values()) {
    arr.sort((a, b) => a.unitPrice - b.unitPrice);
  }

  // Coleciona vendas brutas por (ticket_type, date) preservando ordem
  interface RawDailySale { date: string; weekday: string; ticketType: string; qty: number }
  const raw: RawDailySale[] = [];
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  let totalQtySales = 0;

  for (let i = 1; i < salesRowsRaw.length; i++) {
    const row = salesRowsRaw[i] as any[];
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

  // Agrupa por ticket_type, ordena por data crescente, e faz capacity-fill.
  const byType = new Map<string, RawDailySale[]>();
  for (const r of raw) {
    const arr = byType.get(r.ticketType) || [];
    arr.push(r);
    byType.set(r.ticketType, arr);
  }

  const sales: FeverParsedSale[] = [];
  for (const [ticketType, dailyRows] of byType.entries()) {
    const variants = lotsByTicketType.get(ticketType);
    if (!variants || variants.length === 0) {
      const skipped = dailyRows.reduce((s, r) => s + r.qty, 0);
      warnings.push(`Tipo de bilhete "${ticketType}" sem preço associado — ${skipped} bilhete(s) ignorados.`);
      continue;
    }

    if (variants.length === 1) {
      const lot = variants[0];
      for (const r of dailyRows) {
        sales.push({
          purchaseDate: r.date,
          weekday: r.weekday,
          lotKey: lot.key,
          ticketType: lot.ticketType,
          unitPrice: lot.unitPrice,
          quantity: r.qty,
          totalValue: roundCents(r.qty * lot.unitPrice),
        });
      }
      continue;
    }

    // Múltiplos preços → capacity-fill cronológico.
    dailyRows.sort((a, b) => a.date.localeCompare(b.date));
    const remainingByLot = new Map<string, number>(variants.map(v => [v.key, v.totalQty]));
    let cursor = 0; // índice da variante atual (mais barata para mais cara)

    for (const r of dailyRows) {
      let need = r.qty;
      while (need > 0) {
        // avança até encontrar variante com stock
        while (cursor < variants.length && (remainingByLot.get(variants[cursor].key) || 0) <= 0) {
          cursor++;
        }
        if (cursor >= variants.length) {
          // sem stock — atribui tudo ao lote mais caro (último) com aviso
          const fallback = variants[variants.length - 1];
          sales.push({
            purchaseDate: r.date,
            weekday: r.weekday,
            lotKey: fallback.key,
            ticketType: fallback.ticketType,
              unitPrice: fallback.unitPrice,
              quantity: need,
              totalValue: roundCents(need * fallback.unitPrice),
          });
          warnings.push(
            `Excedente de ${need} bilhete(s) "${ticketType}" em ${r.date} sem stock no ficheiro de preços — atribuídos a €${fallback.unitPrice.toFixed(2)}.`,
          );
          need = 0;
          break;
        }
        const lot = variants[cursor];
        const stock = remainingByLot.get(lot.key) || 0;
        const take = Math.min(need, stock);
        sales.push({
          purchaseDate: r.date,
          weekday: r.weekday,
          lotKey: lot.key,
          ticketType: lot.ticketType,
          unitPrice: lot.unitPrice,
          quantity: take,
          totalValue: roundCents(take * lot.unitPrice),
        });
        remainingByLot.set(lot.key, stock - take);
        need -= take;
      }
    }
  }

  // Ajusta resíduos de cêntimos por lote para que Σ total_value = Total Gross Revenue do Fever.
  const salesByLotKey = new Map<string, FeverParsedSale[]>();
  for (const sale of sales) {
    const arr = salesByLotKey.get(sale.lotKey) || [];
    arr.push(sale);
    salesByLotKey.set(sale.lotKey, arr);
  }
  for (const lot of lots) {
    const lotSales = salesByLotKey.get(lot.key) || [];
    if (lotSales.length === 0) continue;
    const importedQty = lotSales.reduce((sum, sale) => sum + sale.quantity, 0);
    const importedGross = roundCents(lotSales.reduce((sum, sale) => sum + sale.totalValue, 0));
    const diff = roundCents(lot.totalGross - importedGross);
    if (importedQty === lot.totalQty && Math.abs(diff) >= 0.01) {
      const lastSale = lotSales[lotSales.length - 1];
      lastSale.totalValue = roundCents(lastSale.totalValue + diff);
    }
  }

  // ----- Validações cruzadas -----
  const totalQtyPrices = lots.reduce((s, l) => s + l.totalQty, 0);
  if (Math.abs(totalQtySales - totalQtyPrices) > 0) {
    warnings.push(
      `Discrepância nos totais: ficheiro de vendas tem ${totalQtySales} bilhetes mas o de preços tem ${totalQtyPrices}.`,
    );
  }

  return {
    lots,
    sales,
    totals: {
      totalQty: totalQtyPrices,
      totalGross: lots.reduce((s, l) => s + l.totalGross, 0),
      totalDiscount: lots.reduce((s, l) => s + l.totalDiscount, 0),
      totalUserPayment: lots.reduce((s, l) => s + l.totalUserPayment, 0),
      periodFrom,
      periodTo,
      distinctTypes: lots.length,
    },
    warnings,
  };
}

/**
 * Agrupa os lotes por zona (para criar event_ticket_zones e os lotes filhos).
 */
export interface FeverZoneGroup {
  zoneName: string;
  zoneKind: FeverZoneKind;
  /** "saturday"/"sunday" para zonas diárias, null para zonas de passe (sem sessão) */
  daySlot: "saturday" | "sunday" | null;
  lots: FeverParsedLot[];
}

export function groupFeverLotsByZone(lots: FeverParsedLot[]): FeverZoneGroup[] {
  const groups = new Map<string, FeverZoneGroup>();
  for (const lot of lots) {
    const k = `${lot.zoneKind}|${lot.daySlot || "nosession"}`;
    if (!groups.has(k)) {
      groups.set(k, {
        zoneName: lot.zoneName,
        zoneKind: lot.zoneKind,
        daySlot: lot.daySlot,
        lots: [],
      });
    }
    groups.get(k)!.lots.push(lot);
  }
  // ordem lógica: Relvado-Sáb, Relvado-Dom, Tenda-Sáb, Tenda-Dom, Passes-Relvado, Passes-Tenda
  const order: FeverZoneKind[] = [
    "relvado_diario",
    "tenda_diario",
    "relvado_passe",
    "tenda_passe",
  ];
  return Array.from(groups.values()).sort((a, b) => {
    const da = order.indexOf(a.zoneKind);
    const db = order.indexOf(b.zoneKind);
    if (da !== db) return da - db;
    // dentro do mesmo kind: Sábado antes de Domingo
    return (a.daySlot || "z").localeCompare(b.daySlot || "z");
  });
}
