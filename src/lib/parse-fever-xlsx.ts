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
  /** preço unitário bruto (com surcharge ≈ proporcional) */
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

    lotMap.set(key, {
      key,
      ticketType: ticketType.trim(),
      unitPrice: price,
      unitPriceNet: +(price / (1 + FEVER_IVA_RATE / 100)).toFixed(4),
      lotName: meta.lotName,
      zoneName: meta.zoneName,
      zoneKind: meta.zoneKind,
      lotKind: meta.lotKind,
      daySlot: meta.daySlot,
      totalQty: Number(sold) || 0,
      totalGross: Number(totalGross) || 0,
      totalDiscount: Number(discount) || 0,
      totalUserPayment: Number(userPayment) || 0,
    });
  }

  const lots = Array.from(lotMap.values());

  // ----- SALES (uma linha por dia × tipo) -----
  // Como o ficheiro de vendas NÃO tem preço, e podem existir vários preços para
  // o mesmo Ticket Type, atribuímos cada venda ao lote do MESMO ticket_type
  // proporcionalmente ao peso de cada preço. Na prática quase todos os tipos
  // só têm 1 preço — o caso especial é "Passe fim de semana ... lote 4" (95/105).
  //
  // Estratégia: para cada Ticket Type, somar qty diária por preço usando o peso
  // (qty desse preço / qty total desse tipo no ficheiro de PRICES).

  const lotsByTicketType = new Map<string, FeverParsedLot[]>();
  for (const lot of lots) {
    const arr = lotsByTicketType.get(lot.ticketType) || [];
    arr.push(lot);
    lotsByTicketType.set(lot.ticketType, arr);
  }

  // Total qty por ticket type (do ficheiro PRICES)
  const totalQtyByType = new Map<string, number>();
  for (const lot of lots) {
    totalQtyByType.set(lot.ticketType, (totalQtyByType.get(lot.ticketType) || 0) + lot.totalQty);
  }

  const sales: FeverParsedSale[] = [];
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

    const variants = lotsByTicketType.get((ticketType as string).trim());
    if (!variants || variants.length === 0) {
      warnings.push(`Tipo de bilhete "${ticketType}" sem preço associado — venda ignorada (${qty} bilhetes em ${date}).`);
      continue;
    }

    if (variants.length === 1) {
      const lot = variants[0];
      sales.push({
        purchaseDate: date,
        weekday: String(weekday || ""),
        lotKey: lot.key,
        ticketType: lot.ticketType,
        unitPrice: lot.unitPrice,
        quantity: qty,
      });
    } else {
      // Múltiplos preços para o mesmo Ticket Type → distribuir por peso.
      // Evita arredondamentos: distribui sequencialmente e ajusta no último.
      const totalForType = totalQtyByType.get((ticketType as string).trim()) || 0;
      let remaining = qty;
      for (let j = 0; j < variants.length; j++) {
        const lot = variants[j];
        const isLast = j === variants.length - 1;
        const share = isLast
          ? remaining
          : Math.round((qty * lot.totalQty) / totalForType);
        if (share > 0) {
          sales.push({
            purchaseDate: date,
            weekday: String(weekday || ""),
            lotKey: lot.key,
            ticketType: lot.ticketType,
            unitPrice: lot.unitPrice,
            quantity: share,
          });
          remaining -= share;
        }
      }
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
