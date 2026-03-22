import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import logoHorizontal from "@/assets/logo-horizontal.png?inline";
import { formatCurrency } from "@/lib/mock-data";
import type { PLMode } from "@/components/ReportPL";
import { buildCategoryLookup, aggregateByHierarchy, type AggregatedGroup } from "@/lib/category-hierarchy";
import { calculateCacheLinesForPL, type CacheConfig, type CacheDeduction } from "@/lib/cache-pl-helper";
import { compareHierarchicalCodes } from "@/lib/utils";

interface PLLine {
  label: string;
  forecast: number;
  forecastIva: number;
  forecastTotal: number;
  actual: number;
  actualIva: number;
  actualTotal: number;
  variance: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  isGroupHeader?: boolean;
  indent?: boolean;
  subIndent?: boolean;
  isSubTotal?: boolean;
  quantity?: number;
  unitPrice?: number;
  overrideCount?: number;
}

function pl(base: Omit<PLLine, 'forecastIva' | 'forecastTotal' | 'actualIva' | 'actualTotal'> & { forecastIva?: number; forecastTotal?: number; actualIva?: number; actualTotal?: number }): PLLine {
  return {
    ...base,
    forecastIva: base.forecastIva ?? 0,
    forecastTotal: base.forecastTotal ?? base.forecast,
    actualIva: base.actualIva ?? 0,
    actualTotal: base.actualTotal ?? base.actual,
  };
}

function mergeGroupsExport(fGroups: AggregatedGroup[], tGroups: AggregatedGroup[]) {
  const allGroupNames = [...new Set([...fGroups.map((g) => g.groupName), ...tGroups.map((g) => g.groupName)])];
  const fMap = Object.fromEntries(fGroups.map((g) => [g.groupName, g]));
  const tMap = Object.fromEntries(tGroups.map((g) => [g.groupName, g]));

  return allGroupNames.map((name) => {
    const fg = fMap[name];
    const tg = tMap[name];
    const code = fg?.groupCode ?? tg?.groupCode ?? "Z";
    const allDetailNames = [...new Set([...(fg?.details.map((d) => d.name) ?? []), ...(tg?.details.map((d) => d.name) ?? [])])];
    const fDetailMap = Object.fromEntries((fg?.details ?? []).map((d) => [d.name, d]));
    const tDetailMap = Object.fromEntries((tg?.details ?? []).map((d) => [d.name, d]));

    const details = allDetailNames.map((dn) => ({
      name: dn,
      fBase: fDetailMap[dn]?.base ?? 0,
      fIva: fDetailMap[dn]?.iva ?? 0,
      tBase: tDetailMap[dn]?.base ?? 0,
      tIva: tDetailMap[dn]?.iva ?? 0,
    })).sort((a, b) => a.name.localeCompare(b.name));

    return {
      groupName: name,
      groupCode: code,
      fBase: fg?.totalBase ?? 0,
      fIva: fg?.totalIva ?? 0,
      tBase: tg?.totalBase ?? 0,
      tIva: tg?.totalIva ?? 0,
      details,
    };
  }).sort((a, b) => compareHierarchicalCodes(a.groupCode, b.groupCode));
}

interface ExportHierarchyMaps {
  subEventParentMap: Record<string, string>;
  subCountByParent: Record<string, number>;
  childrenByParent: Record<string, string[]>;
}

function buildEventHierarchyMaps(allEvents: any[]): ExportHierarchyMaps {
  const subEventParentMap: Record<string, string> = {};
  const subCountByParent: Record<string, number> = {};
  const childrenByParent: Record<string, string[]> = {};

  allEvents.forEach((event) => {
    if (event.parent_event_id) {
      subEventParentMap[event.id] = event.parent_event_id;
      subCountByParent[event.parent_event_id] = (subCountByParent[event.parent_event_id] || 0) + 1;
      if (!childrenByParent[event.parent_event_id]) childrenByParent[event.parent_event_id] = [];
      childrenByParent[event.parent_event_id].push(event.id);
    }
  });

  return { subEventParentMap, subCountByParent, childrenByParent };
}

function getEffectiveExportData(eventId: string, forecasts: any[], transactions: any[], hierarchy: ExportHierarchyMaps) {
  let evtF = forecasts.filter((f: any) => f.event_id === eventId);
  let evtT = transactions.filter((t: any) => t.event_id === eventId);

  const parentId = hierarchy.subEventParentMap[eventId];
  if (parentId) {
    const siblingCount = hierarchy.subCountByParent[parentId] || 1;
    const parentF = forecasts
      .filter((f: any) => f.event_id === parentId)
      .map((f: any) => ({ ...f, amount: Number(f.amount) / siblingCount }));
    const parentT = transactions
      .filter((t: any) => t.event_id === parentId)
      .map((t: any) => ({ ...t, amount: Number(t.amount) / siblingCount }));
    evtF = [...evtF, ...parentF];
    evtT = [...evtT, ...parentT];
  }

  const children = hierarchy.childrenByParent[eventId];
  if (children?.length) {
    children.forEach((childId) => {
      evtF = [...evtF, ...forecasts.filter((f: any) => f.event_id === childId)];
      evtT = [...evtT, ...transactions.filter((t: any) => t.event_id === childId)];
    });
  }

  return { evtF, evtT };
}

function getRelevantExportEventIds(eventId: string, hierarchy: ExportHierarchyMaps): string[] {
  const ids = [eventId];
  const children = hierarchy.childrenByParent[eventId];
  if (children?.length) ids.push(...children);
  return ids;
}

function buildPLForExport(
  forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[], ticketLots: any[], ticketSales: any[], eventId: string,
  cacheConfigs: CacheConfig[] = [], cacheDeductions: CacheDeduction[] = [],
  relevantEventIds: string[] = [eventId]
): PLLine[] {
  const lookup = buildCategoryLookup(categories);

  const evtZones = ticketZones.filter((z: any) => relevantEventIds.includes(z.event_id));
  let ticketForecastNet = 0;
  let ticketForecastIva = 0;
  const ticketLines: PLLine[] = [];
  let totalTicketQty = 0;
  let totalTicketActualNet = 0;
  let totalTicketActualIva = 0;
  if (evtZones.length > 0) {
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      let zoneNet = 0;
      let zoneIva = 0;
      let zoneQty = 0;
      let zoneActualNet = 0;
      let zoneActualIva = 0;
      zoneLots.forEach((lot: any) => {
        const qty = Number(lot.quantity);
        const grossPrice = Number(lot.price);
        const ivaRate = Number(lot.iva_rate ?? 6);
        const netPrice = grossPrice / (1 + ivaRate / 100);
        const lotNet = netPrice * qty;
        const lotIva = (grossPrice - netPrice) * qty;
        ticketForecastNet += lotNet;
        ticketForecastIva += lotIva;
        zoneNet += lotNet;
        zoneIva += lotIva;
        zoneQty += qty;
        const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
        const lotSoldNet = lotSales.reduce((s: number, sl: any) => {
          const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
          return s + Number(sl.quantity) * saleNet;
        }, 0);
        const lotSoldGross = lotSales.reduce((s: number, sl: any) => s + Number(sl.quantity) * Number(sl.unit_price), 0);
        const lotSoldIva = lotSoldGross - lotSoldNet;
        zoneActualNet += lotSoldNet;
        zoneActualIva += lotSoldIva;
        totalTicketActualNet += lotSoldNet;
        totalTicketActualIva += lotSoldIva;
        ticketLines.push(pl({
          label: `${zone.name} — ${lot.name}`,
          forecast: lotNet,
          actual: lotSoldNet,
          variance: lotSoldNet - lotNet,
          forecastIva: lotIva,
          forecastTotal: lotNet + lotIva,
          actualIva: lotSoldIva,
          actualTotal: lotSoldNet + lotSoldIva,
          subIndent: true,
          quantity: qty,
          unitPrice: grossPrice,
        }));
      });
      totalTicketQty += zoneQty;
      ticketLines.push(pl({
        label: `Subtotal ${zone.name}`,
        forecast: zoneNet,
        actual: zoneActualNet,
        variance: zoneActualNet - zoneNet,
        forecastIva: zoneIva,
        forecastTotal: zoneNet + zoneIva,
        actualIva: zoneActualIva,
        actualTotal: zoneActualNet + zoneActualIva,
        subIndent: true,
        isSubTotal: true,
        quantity: zoneQty,
      }));
    });
    ticketLines.push(pl({
      label: "Total Bilheteira",
      forecast: ticketForecastNet,
      actual: totalTicketActualNet,
      variance: totalTicketActualNet - ticketForecastNet,
      forecastIva: ticketForecastIva,
      forecastTotal: ticketForecastNet + ticketForecastIva,
      actualIva: totalTicketActualIva,
      actualTotal: totalTicketActualNet + totalTicketActualIva,
      subIndent: true,
      isSubTotal: true,
      quantity: totalTicketQty,
    }));
  }

  // Build override tracking by category name
  const overrideByCatName: Record<string, number> = {};
  transactions.filter((t: any) => t.pl_override_note).forEach((t: any) => {
    const catInfo = lookup[t.category_id];
    const catName = catInfo?.name ?? "Sem categoria";
    overrideByCatName[catName] = (overrideByCatName[catName] || 0) + 1;
  });

  const enrichLine = (line: PLLine, detailName: string): PLLine => {
    const cnt = overrideByCatName[detailName];
    return cnt ? { ...line, overrideCount: cnt } : line;
  };

  const fInc = forecasts.filter((f) => f.type === "income");
  const fExp = forecasts.filter((f) => f.type === "expense");
  const tInc = transactions.filter((t) => t.type === "income");
  const tExp = transactions.filter((t) => t.type === "expense");

  const fIncGroups = aggregateByHierarchy(fInc, lookup);
  const fExpGroups = aggregateByHierarchy(fExp, lookup);
  const tIncGroups = aggregateByHierarchy(tInc, lookup);
  const tExpGroups = aggregateByHierarchy(tExp, lookup);

  const eventCacheConfigs = cacheConfigs.filter((c) => relevantEventIds.includes(c.event_id));
  const cachePLLines = calculateCacheLinesForPL(
    eventCacheConfigs,
    cacheDeductions,
    ticketForecastNet,
    forecasts.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) }))
  );
  const totalCacheAmount = cachePLLines.reduce((s, c) => s + c.amount, 0);

  if (totalCacheAmount > 0) {
    const artisticoGroup = fExpGroups.find((g) => g.groupCode === "2.1" || g.groupName === "Artístico");
    if (artisticoGroup) {
      const cachesDetail = artisticoGroup.details.find((d) => d.code === "2.1.01" || d.name === "Cachês");
      if (cachesDetail) {
        cachesDetail.base += totalCacheAmount;
      } else {
        artisticoGroup.details.push({ name: "Cachês", code: "2.1.01", base: totalCacheAmount, iva: 0 });
      }
      artisticoGroup.totalBase += totalCacheAmount;
    } else {
      fExpGroups.push({
        groupName: "Artístico",
        groupCode: "2.1",
        totalBase: totalCacheAmount,
        totalIva: 0,
        details: [{ name: "Cachês", code: "2.1.01", base: totalCacheAmount, iva: 0 }],
      });
    }
  }

  if (ticketForecastNet > 0) {
    const bilhGroup = fIncGroups.find((g) => g.details.some((d) => d.name.toLowerCase().includes("bilhete")));
    if (bilhGroup) {
      const bilhDetail = bilhGroup.details.find((d) => d.name.toLowerCase().includes("bilhete"));
      if (bilhDetail) {
        bilhDetail.base += ticketForecastNet;
        bilhDetail.iva += ticketForecastIva;
      }
      bilhGroup.totalBase += ticketForecastNet;
      bilhGroup.totalIva += ticketForecastIva;
    } else {
      fIncGroups.push({
        groupName: "Bilheteira",
        groupCode: "0.0",
        totalBase: ticketForecastNet,
        totalIva: ticketForecastIva,
        details: [{ name: "Bilheteira", code: "0.0.01", base: ticketForecastNet, iva: ticketForecastIva }],
      });
    }
  }

  const mergedInc = mergeGroupsExport(fIncGroups, tIncGroups);
  const mergedExp = mergeGroupsExport(fExpGroups, tExpGroups);

  const totalFIncBase = mergedInc.reduce((s, g) => s + g.fBase, 0);
  const totalFIncIva = mergedInc.reduce((s, g) => s + g.fIva, 0);
  const totalFExpBase = mergedExp.reduce((s, g) => s + g.fBase, 0);
  const totalFExpIva = mergedExp.reduce((s, g) => s + g.fIva, 0);
  const totalTIncBase = mergedInc.reduce((s, g) => s + g.tBase, 0) + totalTicketActualNet;
  const totalTIncIva = mergedInc.reduce((s, g) => s + g.tIva, 0) + totalTicketActualIva;
  const totalTExpBase = mergedExp.reduce((s, g) => s + g.tBase, 0);
  const totalTExpIva = mergedExp.reduce((s, g) => s + g.tIva, 0);

  const lines: PLLine[] = [];
  let ticketLinesInserted = false;
  lines.push(pl({
    label: "RECEITAS",
    forecast: totalFIncBase,
    actual: totalTIncBase,
    variance: totalTIncBase - totalFIncBase,
    isTotal: true,
    forecastIva: totalFIncIva,
    forecastTotal: totalFIncBase + totalFIncIva,
    actualIva: totalTIncIva,
    actualTotal: totalTIncBase + totalTIncIva,
  }));
  mergedInc.forEach((group) => {
    const hasManyDetails = group.details.length > 1 || (group.details.length === 1 && group.details[0].name !== group.groupName);
    if (hasManyDetails) {
      lines.push(pl({
        label: group.groupName,
        forecast: group.fBase,
        actual: group.tBase,
        variance: group.tBase - group.fBase,
        isGroupHeader: true,
        forecastIva: group.fIva,
        forecastTotal: group.fBase + group.fIva,
        actualIva: group.tIva,
        actualTotal: group.tBase + group.tIva,
      }));
      group.details.forEach((d) => {
        lines.push(enrichLine(pl({
          label: d.name,
          forecast: d.fBase,
          actual: d.tBase,
          variance: d.tBase - d.fBase,
          indent: true,
          forecastIva: d.fIva,
          forecastTotal: d.fBase + d.fIva,
          actualIva: d.tIva,
          actualTotal: d.tBase + d.tIva,
        }), d.name));
        if (d.name.toLowerCase().includes("bilhete") && ticketLines.length > 0) {
          ticketLines.forEach((tl) => lines.push(tl));
          ticketLinesInserted = true;
        }
      });
    } else {
      lines.push(enrichLine(pl({
        label: group.groupName,
        forecast: group.fBase,
        actual: group.tBase,
        variance: group.tBase - group.fBase,
        indent: true,
        forecastIva: group.fIva,
        forecastTotal: group.fBase + group.fIva,
        actualIva: group.tIva,
        actualTotal: group.tBase + group.tIva,
      }), group.groupName));
      if (group.groupName.toLowerCase().includes("bilhete") && ticketLines.length > 0) {
        ticketLines.forEach((tl) => lines.push(tl));
        ticketLinesInserted = true;
      }
    }
  });
  if (!ticketLinesInserted && ticketLines.length > 0) {
    ticketLines.forEach((tl) => lines.push(tl));
  }

  lines.push(pl({
    label: "DESPESAS",
    forecast: totalFExpBase,
    actual: totalTExpBase,
    variance: totalTExpBase - totalFExpBase,
    isTotal: true,
    forecastIva: totalFExpIva,
    forecastTotal: totalFExpBase + totalFExpIva,
    actualIva: totalTExpIva,
    actualTotal: totalTExpBase + totalTExpIva,
  }));
  mergedExp.forEach((group) => {
    const hasManyDetails = group.details.length > 1 || (group.details.length === 1 && group.details[0].name !== group.groupName);
    if (hasManyDetails) {
      lines.push(pl({
        label: group.groupName,
        forecast: group.fBase,
        actual: group.tBase,
        variance: group.tBase - group.fBase,
        isGroupHeader: true,
        forecastIva: group.fIva,
        forecastTotal: group.fBase + group.fIva,
        actualIva: group.tIva,
        actualTotal: group.tBase + group.tIva,
      }));
      group.details.forEach((d) => {
        lines.push(enrichLine(pl({
          label: d.name,
          forecast: d.fBase,
          actual: d.tBase,
          variance: d.tBase - d.fBase,
          indent: true,
          forecastIva: d.fIva,
          forecastTotal: d.fBase + d.fIva,
          actualIva: d.tIva,
          actualTotal: d.tBase + d.tIva,
        }), d.name));
      });
    } else {
      lines.push(enrichLine(pl({
        label: group.groupName,
        forecast: group.fBase,
        actual: group.tBase,
        variance: group.tBase - group.fBase,
        indent: true,
        forecastIva: group.fIva,
        forecastTotal: group.fBase + group.fIva,
        actualIva: group.tIva,
        actualTotal: group.tBase + group.tIva,
      }), group.groupName));
    }
  });

  const fResBase = totalFIncBase - totalFExpBase;
  const fResIva = totalFIncIva - totalFExpIva;
  const tResBase = totalTIncBase - totalTExpBase;
  const tResIva = totalTIncIva - totalTExpIva;
  lines.push(pl({
    label: "RESULTADO LÍQUIDO",
    forecast: fResBase,
    actual: tResBase,
    variance: tResBase - fResBase,
    isGrandTotal: true,
    forecastIva: fResIva,
    forecastTotal: fResBase + fResIva,
    actualIva: tResIva,
    actualTotal: tResBase + tResIva,
  }));

  return lines;
}

export function exportPLToExcel(
  eventsToExport: any[], allEvents: any[], forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[] = [], ticketLots: any[] = [], ticketSales: any[] = [], mode: PLMode = "comparison",
  cacheConfigs: CacheConfig[] = [], cacheDeductions: CacheDeduction[] = []
) {
  const wb = XLSX.utils.book_new();
  const isComparison = mode === "comparison";
  const hierarchy = buildEventHierarchyMaps(allEvents);

  const summaryRows: any[][] = [
    [isComparison ? "RELATÓRIO P&L - PREVISÃO vs REALIZADO" : "RELATÓRIO P&L - PREVISÃO"],
    [],
    isComparison
      ? ["Evento", "Receita Prev.", "Receita Real", "Despesa Prev.", "Despesa Real", "Resultado Prev.", "Resultado Real", "Variação"]
      : ["Evento", "Receita Prev.", "Despesa Prev.", "Resultado Prev."],
  ];

  let gFInc = 0, gFExp = 0, gTInc = 0, gTExp = 0;

  eventsToExport.forEach((evt) => {
    const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
    let fInc = evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const fExpBase = evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const tInc = evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const tExp = evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
    const evtZones = ticketZones.filter((z: any) => relevantEventIds.includes(z.event_id));
    let ticketActualNet = 0;
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => {
        const ivaRate = Number(lot.iva_rate ?? 6);
        const netPrice = Number(lot.price) / (1 + ivaRate / 100);
        fInc += netPrice * Number(lot.quantity);
        const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
        ticketActualNet += lotSales.reduce((sum: number, sl: any) => {
          const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
          return sum + Number(sl.quantity) * saleNet;
        }, 0);
      });
    });
    const cachePLLines = calculateCacheLinesForPL(
      cacheConfigs.filter((c) => relevantEventIds.includes(c.event_id)),
      cacheDeductions,
      evtZones.reduce((sum: number, zone: any) => {
        const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
        return sum + zoneLots.reduce((lotSum: number, lot: any) => {
          const ivaRate = Number(lot.iva_rate ?? 6);
          return lotSum + Number(lot.quantity) * (Number(lot.price) / (1 + ivaRate / 100));
        }, 0);
      }, 0),
      evtF.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) }))
    );
    const totalCache = cachePLLines.reduce((s, c) => s + c.amount, 0);
    const fExp = fExpBase + totalCache;
    const totalTInc = tInc + ticketActualNet;
    gFInc += fInc; gFExp += fExp; gTInc += totalTInc; gTExp += tExp;
    if (isComparison) {
      summaryRows.push([evt.name, fInc, totalTInc, fExp, tExp, fInc - fExp, totalTInc - tExp, (totalTInc - tExp) - (fInc - fExp)]);
    } else {
      summaryRows.push([evt.name, fInc, fExp, fInc - fExp]);
    }
  });

  summaryRows.push([]);
  if (isComparison) {
    summaryRows.push(["TOTAL", gFInc, gTInc, gFExp, gTExp, gFInc - gFExp, gTInc - gTExp, (gTInc - gTExp) - (gFInc - gFExp)]);
  } else {
    summaryRows.push(["TOTAL", gFInc, gFExp, gFInc - gFExp]);
  }

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = isComparison
    ? [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
    : [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Resumo");

  eventsToExport.forEach((evt) => {
    const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
    if (evtF.length === 0 && evtT.length === 0) return;
    const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
    const plLines = buildPLForExport(evtF, evtT, categories, ticketZones, ticketLots, ticketSales, evt.id, cacheConfigs, cacheDeductions, relevantEventIds);
    const rows: any[][] = [
      [`P&L - ${evt.name}`],
      [],
      isComparison
        ? ["Rubrica", "Qtd", "Preço Unit. (€)", "Valor s/ IVA (€)", "IVA (€)", "Total (€)", "Real s/ IVA (€)", "IVA Real (€)", "Total Real (€)", "Variação (€)"]
        : ["Rubrica", "Qtd", "Preço Unit. (€)", "Valor s/ IVA (€)", "IVA (€)", "Total (€)"],
    ];
    plLines.forEach((line) => {
      const prefix = line.subIndent ? "      " : line.indent ? "      " : line.isGroupHeader ? "  " : "";
      const overrideSuffix = (line.overrideCount ?? 0) > 0 ? ` ⚠ (${line.overrideCount} fora do P&L)` : "";
      if (isComparison) {
        rows.push([
          prefix + line.label + overrideSuffix,
          line.quantity != null ? line.quantity : "",
          line.unitPrice != null ? line.unitPrice : "",
          line.forecast,
          line.forecastIva,
          line.forecastTotal,
          line.actual,
          line.actualIva,
          line.actualTotal,
          line.variance,
        ]);
      } else {
        rows.push([
          prefix + line.label + overrideSuffix,
          line.quantity != null ? line.quantity : "",
          line.unitPrice != null ? line.unitPrice : "",
          line.forecast,
          line.forecastIva,
          line.forecastTotal,
        ]);
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = isComparison
      ? [{ wch: 35 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 18 }]
      : [{ wch: 35 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 18 }];
    const sheetName = evt.name.substring(0, 31).replace(/[\\/*?[\]:]/g, "");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, `PL_Relatorio_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportPLToPDF(
  eventsToExport: any[], allEvents: any[], forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[] = [], ticketLots: any[] = [], ticketSales: any[] = [], mode: PLMode = "comparison",
  cacheConfigs: CacheConfig[] = [], cacheDeductions: CacheDeduction[] = []
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 14;
  const isComparison = mode === "comparison";
  const hierarchy = buildEventHierarchyMaps(allEvents);

  const colWidths = isComparison
    ? [contentWidth * 0.18, contentWidth * 0.06, contentWidth * 0.08, contentWidth * 0.11, contentWidth * 0.08, contentWidth * 0.11, contentWidth * 0.11, contentWidth * 0.08, contentWidth * 0.11, contentWidth * 0.08]
    : [contentWidth * 0.30, contentWidth * 0.10, contentWidth * 0.14, contentWidth * 0.18, contentWidth * 0.12, contentWidth * 0.16];
  const colX = [marginLeft];
  for (let i = 1; i < colWidths.length; i++) colX.push(colX[i - 1] + colWidths[i - 1]);

  function checkNewPage(needed: number) {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 14;
    }
  }

  function drawTableHeader() {
    doc.setFillColor(30, 30, 40);
    doc.rect(marginLeft, y, contentWidth, 8, "F");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("Rubrica", colX[0] + 2, y + 5.5);
    doc.text("Qtd", colX[1] + colWidths[1] - 2, y + 5.5, { align: "right" });
    doc.text("Preço Unit.", colX[2] + colWidths[2] - 2, y + 5.5, { align: "right" });
    doc.text("Valor s/ IVA", colX[3] + colWidths[3] - 2, y + 5.5, { align: "right" });
    doc.text("IVA (€)", colX[4] + colWidths[4] - 2, y + 5.5, { align: "right" });
    doc.text("Total (€)", colX[5] + colWidths[5] - 2, y + 5.5, { align: "right" });
    if (isComparison) {
      doc.text("Real s/ IVA", colX[6] + colWidths[6] - 2, y + 5.5, { align: "right" });
      doc.text("IVA Real", colX[7] + colWidths[7] - 2, y + 5.5, { align: "right" });
      doc.text("Total Real", colX[8] + colWidths[8] - 2, y + 5.5, { align: "right" });
      doc.text("Variação", colX[9] + colWidths[9] - 2, y + 5.5, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
    y += 10;
  }

  function fmtVal(v: number): string {
    return v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  try {
    doc.addImage(logoHorizontal, "PNG", marginLeft, y, 78, 22);
    y += 28;
  } catch {
    y += 4;
  }

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(isComparison ? "Relatório P&L — Previsão vs Realizado" : "Relatório P&L — Previsão", marginLeft, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-PT")}`, marginLeft, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  eventsToExport.forEach((evt, evtIdx) => {
    const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
    if (evtF.length === 0 && evtT.length === 0) return;
    const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
    const plLines = buildPLForExport(evtF, evtT, categories, ticketZones, ticketLots, ticketSales, evt.id, cacheConfigs, cacheDeductions, relevantEventIds);

    if (evtIdx > 0) {
      doc.addPage();
      y = 14;
    }

    doc.setFillColor(60, 60, 80);
    doc.roundedRect(marginLeft, y, contentWidth, 10, 1, 1, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(`P&L — ${evt.name}`, marginLeft + 4, y + 7);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${evtF.length} previsões · ${evtT.length} transações`, pageWidth - marginRight - 4, y + 7, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 14;

    drawTableHeader();

    plLines.forEach((line) => {
      checkNewPage(8);
      const rowH = line.subIndent ? 6 : 7;

      if (line.isGrandTotal) {
        doc.setFillColor(230, 240, 255);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
      } else if (line.isTotal) {
        doc.setFillColor(240, 240, 245);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
      } else if (line.isGroupHeader) {
        doc.setFillColor(245, 245, 250);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
      } else if (line.isSubTotal) {
        doc.setFillColor(242, 242, 248);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(80, 80, 80);
      } else if (line.subIndent) {
        doc.setFillColor(248, 248, 252);
        doc.rect(marginLeft, y - 1, contentWidth, rowH + 1, "F");
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6);
        doc.setTextColor(120, 120, 120);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
      }

      const label = line.subIndent ? `       ${line.label}` : line.indent ? `        ${line.label}` : line.isGroupHeader ? `  ${line.label}` : line.label;
      doc.text(label, colX[0] + 2, y + 4);

      if (line.quantity != null) {
        doc.text(line.quantity.toLocaleString("pt-PT"), colX[1] + colWidths[1] - 2, y + 4, { align: "right" });
      }
      if (line.unitPrice != null) {
        doc.text(fmtVal(line.unitPrice), colX[2] + colWidths[2] - 2, y + 4, { align: "right" });
      }

      const showAbs = !line.isGrandTotal;
      doc.text(fmtVal(showAbs ? Math.abs(line.forecast) : line.forecast), colX[3] + colWidths[3] - 2, y + 4, { align: "right" });

      if (!line.subIndent && !line.isSubTotal && !line.isTotal && !line.isGrandTotal && !line.isGroupHeader && !line.indent) {
        doc.text("—", colX[4] + colWidths[4] - 2, y + 4, { align: "right" });
        doc.text("—", colX[5] + colWidths[5] - 2, y + 4, { align: "right" });
      } else {
        doc.text(fmtVal(showAbs ? Math.abs(line.forecastIva) : line.forecastIva), colX[4] + colWidths[4] - 2, y + 4, { align: "right" });
        doc.text(fmtVal(showAbs ? Math.abs(line.forecastTotal) : line.forecastTotal), colX[5] + colWidths[5] - 2, y + 4, { align: "right" });
      }

      if (isComparison) {
        doc.text(fmtVal(showAbs ? Math.abs(line.actual) : line.actual), colX[6] + colWidths[6] - 2, y + 4, { align: "right" });
        doc.text(fmtVal(showAbs ? Math.abs(line.actualIva) : line.actualIva), colX[7] + colWidths[7] - 2, y + 4, { align: "right" });
        doc.text(fmtVal(showAbs ? Math.abs(line.actualTotal) : line.actualTotal), colX[8] + colWidths[8] - 2, y + 4, { align: "right" });
        const v = line.variance;
        if (line.isGrandTotal || line.isTotal) {
          doc.setTextColor(v >= 0 ? 34 : 200, v >= 0 ? 139 : 50, v >= 0 ? 34 : 50);
        }
        doc.text((v >= 0 ? "+" : "") + fmtVal(v), colX[9] + colWidths[9] - 2, y + 4, { align: "right" });
      }
      doc.setTextColor(0, 0, 0);

      y += rowH;
    });

    // "Fora do P&L" override transactions section
    const overrideTxs = evtT.filter((t: any) => t.pl_override_note);
    if (overrideTxs.length > 0) {
      y += 4;
      checkNewPage(12 + overrideTxs.length * 7);

      doc.setFillColor(255, 243, 205);
      doc.rect(marginLeft, y - 1, contentWidth, 8, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(120, 80, 0);
      doc.text(`⚠ Transações Fora do P&L (${overrideTxs.length})`, marginLeft + 2, y + 5);
      doc.setTextColor(0, 0, 0);
      y += 9;

      // Sub-header
      doc.setFillColor(255, 248, 225);
      doc.rect(marginLeft, y - 1, contentWidth, 7, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      const overColW = [contentWidth * 0.30, contentWidth * 0.20, contentWidth * 0.15, contentWidth * 0.35];
      const overColX = [marginLeft];
      for (let i = 1; i < overColW.length; i++) overColX.push(overColX[i - 1] + overColW[i - 1]);
      doc.text("Descrição", overColX[0] + 2, y + 4.5);
      doc.text("Categoria", overColX[1] + 2, y + 4.5);
      doc.text("Valor (€)", overColX[2] + overColW[2] - 2, y + 4.5, { align: "right" });
      doc.text("Justificação", overColX[3] + 2, y + 4.5);
      doc.setTextColor(0, 0, 0);
      y += 7;

      const catMap = Object.fromEntries(categories.map((c: any) => [c.id, c.name]));
      overrideTxs.forEach((t: any) => {
        checkNewPage(7);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.text((t.description || "").substring(0, 45), overColX[0] + 2, y + 4);
        doc.text((catMap[t.category_id] || "—").substring(0, 30), overColX[1] + 2, y + 4);
        doc.text(fmtVal(Number(t.amount)), overColX[2] + overColW[2] - 2, y + 4, { align: "right" });
        doc.setTextColor(100, 100, 100);
        doc.text((t.pl_override_note || "").substring(0, 55), overColX[3] + 2, y + 4);
        doc.setTextColor(0, 0, 0);
        y += 7;
      });
    }

    y += 8;
  });

  doc.addPage();
  y = 14;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo Geral", marginLeft, y);
  y += 10;

  let gFInc = 0, gFExp = 0, gTInc = 0, gTExp = 0;
  eventsToExport.forEach((evt) => {
    const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
    let evtFInc = evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const evtFExpBase = evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
    const evtZones = ticketZones.filter((z: any) => relevantEventIds.includes(z.event_id));
    let ticketActualRevNet = 0;
    let ticketForecastNet = 0;
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => {
        const ivaRate = Number(lot.iva_rate ?? 6);
        const netPrice = Number(lot.price) / (1 + ivaRate / 100);
        const lotForecastNet = netPrice * Number(lot.quantity);
        evtFInc += lotForecastNet;
        ticketForecastNet += lotForecastNet;
        const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
        ticketActualRevNet += lotSales.reduce((sum: number, sl: any) => {
          const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
          return sum + Number(sl.quantity) * saleNet;
        }, 0);
      });
    });
    const totalCache = calculateCacheLinesForPL(
      cacheConfigs.filter((c) => relevantEventIds.includes(c.event_id)),
      cacheDeductions,
      ticketForecastNet,
      evtF.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) }))
    ).reduce((sum, line) => sum + line.amount, 0);
    gFInc += evtFInc;
    gFExp += evtFExpBase + totalCache;
    gTInc += evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0) + ticketActualRevNet;
    gTExp += evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
  });

  const numSumCols = isComparison ? 5 : 4;
  const sumColW = contentWidth / numSumCols;
  doc.setFillColor(30, 30, 40);
  doc.rect(marginLeft, y, contentWidth, 8, "F");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Evento", marginLeft + 2, y + 5.5);
  doc.text("Receitas Prev.", marginLeft + sumColW * 2 - 2, y + 5.5, { align: "right" });
  doc.text("Despesas Prev.", marginLeft + sumColW * 3 - 2, y + 5.5, { align: "right" });
  doc.text("Resultado Prev.", marginLeft + sumColW * 4 - 2, y + 5.5, { align: "right" });
  if (isComparison) {
    doc.text("Resultado Real", marginLeft + sumColW * 5 - 2, y + 5.5, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
  y += 10;

  eventsToExport.forEach((evt) => {
    const { evtF, evtT } = getEffectiveExportData(evt.id, forecasts, transactions, hierarchy);
    let evtFInc = evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const evtFExpBase = evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const evtTInc = evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const evtTExp = evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const relevantEventIds = getRelevantExportEventIds(evt.id, hierarchy);
    const evtZones = ticketZones.filter((z: any) => relevantEventIds.includes(z.event_id));
    let ticketActualNet = 0;
    let ticketForecastNet = 0;
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => {
        const ivaRate = Number(lot.iva_rate ?? 6);
        const netPrice = Number(lot.price) / (1 + ivaRate / 100);
        const lotForecastNet = netPrice * Number(lot.quantity);
        evtFInc += lotForecastNet;
        ticketForecastNet += lotForecastNet;
        const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
        ticketActualNet += lotSales.reduce((sum: number, sl: any) => {
          const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
          return sum + Number(sl.quantity) * saleNet;
        }, 0);
      });
    });
    const evtFExp = evtFExpBase + calculateCacheLinesForPL(
      cacheConfigs.filter((c) => relevantEventIds.includes(c.event_id)),
      cacheDeductions,
      ticketForecastNet,
      evtF.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) }))
    ).reduce((sum, line) => sum + line.amount, 0);
    const fResult = evtFInc - evtFExp;
    const tResult = (evtTInc + ticketActualNet) - evtTExp;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(evt.name, marginLeft + 2, y + 4);
    doc.text(fmtVal(evtFInc), marginLeft + sumColW * 2 - 2, y + 4, { align: "right" });
    doc.text(fmtVal(evtFExp), marginLeft + sumColW * 3 - 2, y + 4, { align: "right" });
    doc.setTextColor(fResult >= 0 ? 34 : 200, fResult >= 0 ? 139 : 50, fResult >= 0 ? 34 : 50);
    doc.text(fmtVal(fResult), marginLeft + sumColW * 4 - 2, y + 4, { align: "right" });
    if (isComparison) {
      doc.setTextColor(tResult >= 0 ? 34 : 200, tResult >= 0 ? 139 : 50, tResult >= 0 ? 34 : 50);
      doc.text(fmtVal(tResult), marginLeft + sumColW * 5 - 2, y + 4, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
    y += 7;
  });

  y += 2;
  doc.setFillColor(230, 240, 255);
  doc.rect(marginLeft, y - 1, contentWidth, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL", marginLeft + 2, y + 5);
  doc.text(fmtVal(gFInc), marginLeft + sumColW * 2 - 2, y + 5, { align: "right" });
  doc.text(fmtVal(gFExp), marginLeft + sumColW * 3 - 2, y + 5, { align: "right" });
  const gFRes = gFInc - gFExp;
  doc.setTextColor(gFRes >= 0 ? 34 : 200, gFRes >= 0 ? 139 : 50, gFRes >= 0 ? 34 : 50);
  doc.text(fmtVal(gFRes), marginLeft + sumColW * 4 - 2, y + 5, { align: "right" });
  if (isComparison) {
    const gTRes = gTInc - gTExp;
    doc.setTextColor(gTRes >= 0 ? 34 : 200, gTRes >= 0 ? 139 : 50, gTRes >= 0 ? 34 : 50);
    doc.text(fmtVal(gTRes), marginLeft + sumColW * 5 - 2, y + 5, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Mundo Propício - Relatório P&L", marginLeft, pageHeight - 8);
    doc.text(`Página ${p}/${totalPages}`, pageWidth - marginRight, pageHeight - 8, { align: "right" });
  }

  doc.save(`PL_Relatorio_${new Date().toISOString().slice(0, 10)}.pdf`);
}
