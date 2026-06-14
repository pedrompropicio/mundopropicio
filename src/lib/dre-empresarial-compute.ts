/**
 * Cálculo do DRE Empresarial — fonte única de verdade.
 *
 * Extraído de `src/components/ReportDREEmpresarial.tsx` para ser partilhado
 * entre a vista anual (matriz 12 meses) e a Folha de Síntese Mensal
 * (`/relatorios/dre-geral-mensal`). NÃO recalcula nada de novo — devolve
 * exactamente os mesmos arrays mensais que o componente já renderiza.
 *
 * Regras (idênticas ao componente original):
 *  - Tudo s/IVA (líquido).
 *  - Exclui `is_transitory` e `exclude_from_result`.
 *  - Bilheteira convertida via taxa do lote quando `ticketRevenueSource = "ticket_sales"`.
 *  - Categorias 10.x = Custos Corporativos / Movimentos Financeiros.
 *  - Group 10 absorvido por eventos activos é excluído (via `buildAbsorptionMap`).
 *  - Distribuição de sócios calculada por evento (gross_revenue | net_result | net_result+IVA expense).
 */
import { buildCategoryLookup } from "@/lib/category-hierarchy";
import { buildAbsorptionMap } from "@/lib/admin-cost-allocation";

export type TicketRevenueSource = "transactions" | "ticket_sales";

export interface DREEmpresarialInput {
  year: number;
  transactions: any[];
  categories: any[];
  events: any[];
  eventPartners: any[];
  ticketZones: any[];
  ticketLots: any[];
  ticketSales: any[];
  ticketRevenueSource: TicketRevenueSource;
}

export interface DREEmpresarialMonthly {
  eventIncomeMonthly: number[];
  eventExpenseMonthly: number[];
  eventResultMonthly: number[];
  partnerDistMonthly: number[];
  retainedMonthly: number[];
  hasPartners: boolean;
  corpGroups: { name: string; code: string; monthly: number[] }[];
  totalCorpMonthly: number[];
  empresaResultMonthly: number[];
  finGroups: { name: string; code: string; monthly: number[] }[];
  totalFinMonthly: number[];
  posicaoMonthly: number[];
}

const corporateIncomeLeafCodes = ["10.6.03"];

function getMonthIndex(dateStr: string): number {
  return new Date(dateStr).getMonth();
}
function calcAmountWithIva(amount: number, ivaRate: number): number {
  return amount * (1 + ivaRate / 100);
}

export function computeDREEmpresarialMonthly(input: DREEmpresarialInput): DREEmpresarialMonthly {
  const { year, transactions, categories, events, eventPartners, ticketZones, ticketLots, ticketSales, ticketRevenueSource } = input;

  const lookup = buildCategoryLookup(categories);
  const useTicketSales = ticketRevenueSource === "ticket_sales";

  const ticketCategoryId = categories.find(
    (c: any) => c.name.toLowerCase().includes("venda de bilhete") ||
      c.name.toLowerCase().includes("bilhetes") ||
      c.name.toLowerCase().includes("bilheteira")
  )?.id ?? null;

  const corporateCatIds = new Set(categories.filter((c: any) => c.code.startsWith("10")).map((c: any) => c.id));
  const corporateExpenseCatIds = new Set(
    categories
      .filter((c: any) => c.code.startsWith("10") && c.type === "expense" && !corporateIncomeLeafCodes.includes(c.code))
      .map((c: any) => c.id)
  );
  const corporateIncomeCatIds = new Set(
    categories
      .filter((c: any) => c.code.startsWith("10") && (c.type === "income" || corporateIncomeLeafCodes.includes(c.code)))
      .map((c: any) => c.id)
  );

  const yearTx = transactions.filter((t: any) => {
    const d = t.payment_date || t.date;
    return d && d.startsWith(String(year));
  });

  const eventTx = yearTx.filter((t: any) => t.event_id && !corporateCatIds.has(t.category_id || ""));
  const absorptionMap = buildAbsorptionMap(yearTx as any, categories as any, events as any);
  const corpTxAll = yearTx.filter(
    (t: any) => corporateCatIds.has(t.category_id || "") && !absorptionMap.has(t.id)
  );

  // ── EVENTOS ──
  const eventIncomeMonthly = new Array(12).fill(0);
  const eventExpenseMonthly = new Array(12).fill(0);

  eventTx.forEach((t: any) => {
    const d = t.payment_date || t.date;
    if (!d) return;
    const mi = getMonthIndex(d);
    if (t.type === "income" && !t.is_transitory && !t.exclude_from_result) {
      if (useTicketSales && ticketCategoryId && t.category_id === ticketCategoryId) return;
      eventIncomeMonthly[mi] += Number(t.amount);
    } else if (t.type === "expense" && !t.is_transitory && !t.exclude_from_result) {
      eventExpenseMonthly[mi] += Number(t.amount);
    }
  });

  if (useTicketSales) {
    ticketSales.forEach((s: any) => {
      const sd: string = s.sale_date;
      if (!sd || !sd.startsWith(String(year))) return;
      const lot = ticketLots.find((l: any) => l.id === s.lot_id);
      if (!lot) return;
      const zone = ticketZones.find((z: any) => z.id === (lot as any).zone_id);
      if (!zone) return;
      const rate = Number((lot as any).iva_rate ?? 6);
      const gross = (s.total_value !== null && s.total_value !== undefined && s.total_value !== "")
        ? Number(s.total_value)
        : Number(s.quantity || 0) * Number(s.unit_price || 0);
      const net = gross / (1 + rate / 100);
      const mi = getMonthIndex(sd);
      eventIncomeMonthly[mi] += net;
    });
  }

  const eventResultMonthly = eventIncomeMonthly.map((inc, i) => inc - eventExpenseMonthly[i]);

  // ── DISTRIBUIÇÃO SÓCIOS ──
  const partnerDistMonthly = new Array(12).fill(0);
  const yearEvents = events.filter((e: any) => e.date && e.date.startsWith(String(year)));
  yearEvents.forEach((evt: any) => {
    const partners = eventPartners.filter((p: any) => p.event_id === evt.id);
    if (partners.length === 0) return;
    const evtTx = eventTx.filter((t: any) => t.event_id === evt.id);
    let inc = evtTx
      .filter((t: any) => t.type === "income" && !t.is_transitory && !t.exclude_from_result)
      .filter((t: any) => !(useTicketSales && ticketCategoryId && t.category_id === ticketCategoryId))
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    if (useTicketSales) {
      const evtZoneIds = ticketZones.filter((z: any) => z.event_id === evt.id).map((z: any) => z.id);
      const evtLotIds = ticketLots.filter((l: any) => evtZoneIds.includes((l as any).zone_id)).map((l: any) => l.id);
      const evtSales = ticketSales.filter((s: any) => evtLotIds.includes(s.lot_id));
      const ticketNet = evtSales.reduce((sum: number, s: any) => {
        const lot = ticketLots.find((l: any) => l.id === s.lot_id);
        const rate = Number((lot as any)?.iva_rate ?? 6);
        const gross = (s.total_value !== null && s.total_value !== undefined && s.total_value !== "")
          ? Number(s.total_value)
          : Number(s.quantity || 0) * Number(s.unit_price || 0);
        return sum + gross / (1 + rate / 100);
      }, 0);
      inc += ticketNet;
    }
    const exp = evtTx.filter((t: any) => t.type === "expense" && !t.is_transitory && !t.exclude_from_result)
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const netResult = inc - exp;
    const calcBasis = (evt as any).partner_calc_basis || "net_result";
    const mi = getMonthIndex(evt.date);
    partners.forEach((p: any) => {
      let base: number;
      if (calcBasis === "gross_revenue") base = inc;
      else if (p.expense_includes_iva) {
        const expInc = evtTx.filter((t: any) => t.type === "expense" && !t.is_transitory && !t.exclude_from_result)
          .reduce((s: number, t: any) => s + calcAmountWithIva(Number(t.amount), Number(t.iva_rate ?? 23)), 0);
        base = inc - expInc;
      } else base = netResult;
      partnerDistMonthly[mi] += base * (Number(p.percentage) / 100);
    });
  });

  const retainedMonthly = eventResultMonthly.map((r, i) => r - partnerDistMonthly[i]);
  const hasPartners = partnerDistMonthly.some((v) => v !== 0);

  // ── CORPORATIVOS ──
  const corpExpTx = corpTxAll.filter(
    (t: any) => t.type === "expense" && !t.is_transitory && !t.exclude_from_result && corporateExpenseCatIds.has(t.category_id || "")
  );
  const corpGroupMonthly: Record<string, { name: string; code: string; monthly: number[] }> = {};
  corpExpTx.forEach((t: any) => {
    const catInfo = (lookup as any)[t.category_id || ""];
    const groupName = catInfo?.groupName ?? "Sem categoria";
    const groupCode = catInfo?.groupCode ?? "Z";
    if (!corpGroupMonthly[groupCode]) corpGroupMonthly[groupCode] = { name: groupName, code: groupCode, monthly: new Array(12).fill(0) };
    const d = t.payment_date || t.date;
    if (!d) return;
    corpGroupMonthly[groupCode].monthly[getMonthIndex(d)] += Number(t.amount);
  });
  const corpGroups = Object.values(corpGroupMonthly).sort((a, b) => a.code.localeCompare(b.code));
  const totalCorpMonthly = new Array(12).fill(0);
  corpGroups.forEach((g) => g.monthly.forEach((v, i) => (totalCorpMonthly[i] += v)));

  const baseForResult = hasPartners ? retainedMonthly : eventResultMonthly;
  const empresaResultMonthly = baseForResult.map((r, i) => r - totalCorpMonthly[i]);

  // ── MOVIMENTOS FINANCEIROS ──
  const corpIncTx = corpTxAll.filter(
    (t: any) => t.type === "income" && !t.is_transitory && !t.exclude_from_result && corporateIncomeCatIds.has(t.category_id || "")
  );
  const finGroupMonthly: Record<string, { name: string; code: string; monthly: number[] }> = {};
  corpIncTx.forEach((t: any) => {
    const catInfo = (lookup as any)[t.category_id || ""];
    const groupName = catInfo?.groupName ?? "Sem categoria";
    const groupCode = catInfo?.groupCode ?? "Z";
    if (!finGroupMonthly[groupCode]) finGroupMonthly[groupCode] = { name: groupName, code: groupCode, monthly: new Array(12).fill(0) };
    const d = t.payment_date || t.date;
    if (!d) return;
    finGroupMonthly[groupCode].monthly[getMonthIndex(d)] += Number(t.amount);
  });
  const finGroups = Object.values(finGroupMonthly).sort((a, b) => a.code.localeCompare(b.code));
  const totalFinMonthly = new Array(12).fill(0);
  finGroups.forEach((g) => g.monthly.forEach((v, i) => (totalFinMonthly[i] += v)));
  const posicaoMonthly = empresaResultMonthly.map((r, i) => r + totalFinMonthly[i]);

  return {
    eventIncomeMonthly,
    eventExpenseMonthly,
    eventResultMonthly,
    partnerDistMonthly,
    retainedMonthly,
    hasPartners,
    corpGroups,
    totalCorpMonthly,
    empresaResultMonthly,
    finGroups,
    totalFinMonthly,
    posicaoMonthly,
  };
}
