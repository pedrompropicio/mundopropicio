import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Download, BarChart3, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportPLToPDF, exportPLToExcel } from "@/lib/export-pl";
import { buildCategoryLookup, aggregateByHierarchy, type AggregatedGroup } from "@/lib/category-hierarchy";
import { calculateCacheLinesForPL, type CacheConfig, type CacheDeduction } from "@/lib/cache-pl-helper";
import { compareHierarchicalCodes } from "@/lib/utils";

export type PLMode = "forecast" | "comparison";

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
}

function plLine(base: Omit<PLLine, 'forecastIva' | 'forecastTotal' | 'actualIva' | 'actualTotal'> & { forecastIva?: number; forecastTotal?: number; actualIva?: number; actualTotal?: number }): PLLine {
  return {
    ...base,
    forecastIva: base.forecastIva ?? 0,
    forecastTotal: base.forecastTotal ?? base.forecast,
    actualIva: base.actualIva ?? 0,
    actualTotal: base.actualTotal ?? base.actual,
  };
}

function mergeGroups(fGroups: AggregatedGroup[], tGroups: AggregatedGroup[]): { groupName: string; groupCode: string; fBase: number; fIva: number; tBase: number; tIva: number; details: { name: string; fBase: number; fIva: number; tBase: number; tIva: number }[] }[] {
  const allGroupNames = [...new Set([...fGroups.map(g => g.groupName), ...tGroups.map(g => g.groupName)])];
  const fMap = Object.fromEntries(fGroups.map(g => [g.groupName, g]));
  const tMap = Object.fromEntries(tGroups.map(g => [g.groupName, g]));

  return allGroupNames.map(name => {
    const fg = fMap[name];
    const tg = tMap[name];
    const code = fg?.groupCode ?? tg?.groupCode ?? "Z";
    const allDetailNames = [...new Set([...(fg?.details.map(d => d.name) ?? []), ...(tg?.details.map(d => d.name) ?? [])])];
    const fDetailMap = Object.fromEntries((fg?.details ?? []).map(d => [d.name, d]));
    const tDetailMap = Object.fromEntries((tg?.details ?? []).map(d => [d.name, d]));

    const details = allDetailNames.map(dn => ({
      name: dn,
      fBase: fDetailMap[dn]?.base ?? 0,
      fIva: fDetailMap[dn]?.iva ?? 0,
      tBase: tDetailMap[dn]?.base ?? 0,
      tIva: tDetailMap[dn]?.iva ?? 0,
    })).sort((a, b) => a.name.localeCompare(b.name));

    return {
      groupName: name, groupCode: code,
      fBase: fg?.totalBase ?? 0, fIva: fg?.totalIva ?? 0,
      tBase: tg?.totalBase ?? 0, tIva: tg?.totalIva ?? 0,
      details,
    };
  }).sort((a, b) => compareHierarchicalCodes(a.groupCode, b.groupCode));
}

function buildPL(
  forecasts: any[], transactions: any[], categories: any[],
  ticketZones: any[], ticketLots: any[], ticketSales: any[], eventId: string,
  cacheConfigs: CacheConfig[] = [], cacheDeductions: CacheDeduction[] = [],
  relevantEventIds: string[] = [eventId]
): PLLine[] {
  const lookup = buildCategoryLookup(categories);

  // Calculate ticket lot revenue for this event
  // Prices include IVA ("por dentro") — extract net values
  const evtZones = ticketZones; // Already filtered by caller
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
        const lotSoldGross = lotSales.reduce((s: number, sl: any) => s + Number(sl.quantity) * Number(sl.unit_price), 0);
        const lotSoldNet = lotSales.reduce((s: number, sl: any) => {
          const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
          return s + Number(sl.quantity) * saleNet;
        }, 0);
        const lotSoldIva = lotSoldGross - lotSoldNet;
        zoneActualNet += lotSoldNet;
        zoneActualIva += lotSoldIva;
        totalTicketActualNet += lotSoldNet;
        totalTicketActualIva += lotSoldIva;
        ticketLines.push(plLine({
          label: `${zone.name} — ${lot.name}`,
          forecast: lotNet, actual: lotSoldNet, variance: lotSoldNet - lotNet,
          forecastIva: lotIva, forecastTotal: lotNet + lotIva,
          actualIva: lotSoldIva, actualTotal: lotSoldNet + lotSoldIva,
          subIndent: true, quantity: qty, unitPrice: grossPrice,
        }));
      });
      totalTicketQty += zoneQty;
      ticketLines.push(plLine({
        label: `Subtotal ${zone.name}`,
        forecast: zoneNet, actual: zoneActualNet, variance: zoneActualNet - zoneNet,
        forecastIva: zoneIva, forecastTotal: zoneNet + zoneIva,
        actualIva: zoneActualIva, actualTotal: zoneActualNet + zoneActualIva,
        subIndent: true, isSubTotal: true, quantity: zoneQty,
      }));
    });
    ticketLines.push(plLine({
      label: `Total Bilheteira`,
      forecast: ticketForecastNet, actual: totalTicketActualNet,
      variance: totalTicketActualNet - ticketForecastNet,
      forecastIva: ticketForecastIva, forecastTotal: ticketForecastNet + ticketForecastIva,
      actualIva: totalTicketActualIva, actualTotal: totalTicketActualNet + totalTicketActualIva,
      subIndent: true, isSubTotal: true, quantity: totalTicketQty,
    }));
  }

  const fInc = forecasts.filter((f) => f.type === "income");
  const fExp = forecasts.filter((f) => f.type === "expense");
  const tInc = transactions.filter((t) => t.type === "income");
  const tExp = transactions.filter((t) => t.type === "expense");

  const fIncGroups = aggregateByHierarchy(fInc, lookup);
  const fExpGroups = aggregateByHierarchy(fExp, lookup);
  const tIncGroups = aggregateByHierarchy(tInc, lookup);
  const tExpGroups = aggregateByHierarchy(tExp, lookup);

  // Calculate cachê lines and inject into expense hierarchy under "Artístico" > "Cachês" (2.1.01)
  const eventCacheConfigs = cacheConfigs.filter((c) => relevantEventIds.includes(c.event_id));
  const cacheLines = calculateCacheLinesForPL(
    eventCacheConfigs,
    cacheDeductions,
    ticketForecastNet,
    forecasts.map((f) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) }))
  );
  const totalCacheAmount = cacheLines.reduce((s, c) => s + c.amount, 0);

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

  // Add ticket lot net revenue to forecast Bilheteira
  if (ticketForecastNet > 0) {
    const bilhGroup = fIncGroups.find(g => g.details.some(d => d.name.toLowerCase().includes("bilhete")));
    if (bilhGroup) {
      const bilhDetail = bilhGroup.details.find(d => d.name.toLowerCase().includes("bilhete"));
      if (bilhDetail) {
        bilhDetail.base += ticketForecastNet;
        bilhDetail.iva += ticketForecastIva;
      }
      bilhGroup.totalBase += ticketForecastNet;
      bilhGroup.totalIva += ticketForecastIva;
    } else {
      fIncGroups.push({
        groupName: "Bilheteira", groupCode: "0.0",
        totalBase: ticketForecastNet, totalIva: ticketForecastIva,
        details: [{ name: "Bilheteira", code: "0.0.01", base: ticketForecastNet, iva: ticketForecastIva }],
      });
    }
  }

  const mergedInc = mergeGroups(fIncGroups, tIncGroups);
  const mergedExp = mergeGroups(fExpGroups, tExpGroups);

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

  lines.push(plLine({
    label: "RECEITAS", forecast: totalFIncBase, actual: totalTIncBase, variance: totalTIncBase - totalFIncBase, isTotal: true,
    forecastIva: totalFIncIva, forecastTotal: totalFIncBase + totalFIncIva,
    actualIva: totalTIncIva, actualTotal: totalTIncBase + totalTIncIva,
  }));
  mergedInc.forEach((group) => {
    const hasManyDetails = group.details.length > 1 || (group.details.length === 1 && group.details[0].name !== group.groupName);
    if (hasManyDetails) {
      lines.push(plLine({
        label: group.groupName, forecast: group.fBase, actual: group.tBase, variance: group.tBase - group.fBase, isGroupHeader: true,
        forecastIva: group.fIva, forecastTotal: group.fBase + group.fIva,
        actualIva: group.tIva, actualTotal: group.tBase + group.tIva,
      }));
      group.details.forEach((d) => {
        lines.push(plLine({
          label: d.name, forecast: d.fBase, actual: d.tBase, variance: d.tBase - d.fBase, indent: true,
          forecastIva: d.fIva, forecastTotal: d.fBase + d.fIva,
          actualIva: d.tIva, actualTotal: d.tBase + d.tIva,
        }));
        if (d.name.toLowerCase().includes("bilhete") && ticketLines.length > 0) {
          ticketLines.forEach((tl) => lines.push(tl));
          ticketLinesInserted = true;
        }
      });
    } else {
      lines.push(plLine({
        label: group.groupName, forecast: group.fBase, actual: group.tBase, variance: group.tBase - group.fBase, indent: true,
        forecastIva: group.fIva, forecastTotal: group.fBase + group.fIva,
        actualIva: group.tIva, actualTotal: group.tBase + group.tIva,
      }));
      if (group.groupName.toLowerCase().includes("bilhete") && ticketLines.length > 0) {
        ticketLines.forEach((tl) => lines.push(tl));
        ticketLinesInserted = true;
      }
    }
  });
  // Fallback: if ticket lines weren't inserted via category matching, add them after income groups
  if (!ticketLinesInserted && ticketLines.length > 0) {
    ticketLines.forEach((tl) => lines.push(tl));
  }

  lines.push(plLine({
    label: "DESPESAS", forecast: totalFExpBase, actual: totalTExpBase, variance: totalTExpBase - totalFExpBase, isTotal: true,
    forecastIva: totalFExpIva, forecastTotal: totalFExpBase + totalFExpIva,
    actualIva: totalTExpIva, actualTotal: totalTExpBase + totalTExpIva,
  }));
  mergedExp.forEach((group) => {
    const hasManyDetails = group.details.length > 1 || (group.details.length === 1 && group.details[0].name !== group.groupName);
    if (hasManyDetails) {
      lines.push(plLine({
        label: group.groupName, forecast: group.fBase, actual: group.tBase, variance: group.tBase - group.fBase, isGroupHeader: true,
        forecastIva: group.fIva, forecastTotal: group.fBase + group.fIva,
        actualIva: group.tIva, actualTotal: group.tBase + group.tIva,
      }));
      group.details.forEach((d) => {
        lines.push(plLine({
          label: d.name, forecast: d.fBase, actual: d.tBase, variance: d.tBase - d.fBase, indent: true,
          forecastIva: d.fIva, forecastTotal: d.fBase + d.fIva,
          actualIva: d.tIva, actualTotal: d.tBase + d.tIva,
        }));
      });
    } else {
      lines.push(plLine({
        label: group.groupName, forecast: group.fBase, actual: group.tBase, variance: group.tBase - group.fBase, indent: true,
        forecastIva: group.fIva, forecastTotal: group.fBase + group.fIva,
        actualIva: group.tIva, actualTotal: group.tBase + group.tIva,
      }));
    }
  });

  const fResultBase = totalFIncBase - totalFExpBase;
  const fResultIva = totalFIncIva - totalFExpIva;
  const tResultBase = totalTIncBase - totalTExpBase;
  const tResultIva = totalTIncIva - totalTExpIva;
  lines.push(plLine({
    label: "RESULTADO LÍQUIDO", forecast: fResultBase, actual: tResultBase, variance: tResultBase - fResultBase, isGrandTotal: true,
    forecastIva: fResultIva, forecastTotal: fResultBase + fResultIva,
    actualIva: tResultIva, actualTotal: tResultBase + tResultIva,
  }));

  return lines;
}

export default function ReportPL() {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [mode, setMode] = useState<PLMode>("forecast");

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: forecasts = [] } = useQuery({
    queryKey: ["all-forecasts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_forecasts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketZones = [] } = useQuery({
    queryKey: ["all-ticket-zones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketLots = [] } = useQuery({
    queryKey: ["all-ticket-lots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_lots").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketSales = [] } = useQuery({
    queryKey: ["all-ticket-sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_sales").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: allCacheConfigs = [] } = useQuery({
    queryKey: ["all-cache-configs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_configs").select("*");
      if (error) throw error;
      return data as CacheConfig[];
    },
  });

  const { data: allCacheDeductions = [] } = useQuery({
    queryKey: ["all-cache-deductions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_deductions").select("*");
      if (error) throw error;
      return data as CacheDeduction[];
    },
  });

  // Build proration map
  const subEventParentMap: Record<string, string> = {};
  const subCountByParent: Record<string, number> = {};
  const childrenByParent: Record<string, string[]> = {};
  events.forEach((e: any) => {
    if (e.parent_event_id) {
      subEventParentMap[e.id] = e.parent_event_id;
      subCountByParent[e.parent_event_id] = (subCountByParent[e.parent_event_id] || 0) + 1;
      if (!childrenByParent[e.parent_event_id]) childrenByParent[e.parent_event_id] = [];
      childrenByParent[e.parent_event_id].push(e.id);
    }
  });

  // Mutual exclusion: selecting parent deselects children and vice versa
  const toggleEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      let next = [...prev, id];
      const children = childrenByParent[id];
      if (children) {
        next = next.filter((x) => !children.includes(x));
      }
      const parentId = subEventParentMap[id];
      if (parentId) {
        next = next.filter((x) => x !== parentId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedEventIds((prev) => prev.length === events.length ? [] : events.map((e) => e.id));
  };

  const activeEvents = selectedEventIds.length > 0 ? events.filter((e) => selectedEventIds.includes(e.id)) : events;

  // Helper: get effective transactions/forecasts for an event (with proration)
  function getEffectiveData(eventId: string) {
    let evtF = forecasts.filter((f: any) => f.event_id === eventId);
    let evtT = transactions.filter((t: any) => t.event_id === eventId);
    const parentId = subEventParentMap[eventId];
    if (parentId) {
      const siblingCount = subCountByParent[parentId] || 1;
      const parentF = forecasts
        .filter((f: any) => f.event_id === parentId)
        .map((f: any) => ({ ...f, amount: Number(f.amount) / siblingCount }));
      const parentT = transactions
        .filter((t: any) => t.event_id === parentId)
        .map((t: any) => ({ ...t, amount: Number(t.amount) / siblingCount }));
      evtF = [...evtF, ...parentF];
      evtT = [...evtT, ...parentT];
    }
    const children = childrenByParent[eventId];
    if (children && children.length > 0) {
      children.forEach((childId) => {
        const childF = forecasts.filter((f: any) => f.event_id === childId);
        const childT = transactions.filter((t: any) => t.event_id === childId);
        evtF = [...evtF, ...childF];
        evtT = [...evtT, ...childT];
      });
    }
    return { evtF, evtT };
  }

  // Helper: get all event IDs relevant for ticket data (self + children for parent events)
  const getTicketEventIds = (eventId: string): string[] => {
    const ids = [eventId];
    const children = childrenByParent[eventId];
    if (children) ids.push(...children);
    return ids;
  };

  const eventSummaries = activeEvents.map((e) => {
    const { evtF, evtT } = getEffectiveData(e.id);
    const fInc = evtF.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const fExp = evtF.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
    const tInc = evtT.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const tExp = evtT.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const ticketEventIds = getTicketEventIds(e.id);
    const evtZones = ticketZones.filter((z: any) => ticketEventIds.includes(z.event_id));
    let ticketRev = 0;
    let ticketActualRev = 0;
    evtZones.forEach((zone: any) => {
      const zoneLots = ticketLots.filter((l: any) => l.zone_id === zone.id);
      zoneLots.forEach((lot: any) => {
        const ivaRate = Number(lot.iva_rate ?? 6);
        const netPrice = Number(lot.price) / (1 + ivaRate / 100);
        ticketRev += netPrice * Number(lot.quantity);
        const lotSales = ticketSales.filter((s: any) => s.lot_id === lot.id);
        ticketActualRev += lotSales.reduce((sum: number, sl: any) => {
          const saleNet = Number(sl.unit_price) / (1 + ivaRate / 100);
          return sum + Number(sl.quantity) * saleNet;
        }, 0);
      });
    });
    const totalFInc = fInc + ticketRev;
    const totalTInc = tInc + ticketActualRev;
    const eventCaches = allCacheConfigs.filter((c) => ticketEventIds.includes(c.event_id));
    const cacheLines = calculateCacheLinesForPL(
      eventCaches,
      allCacheDeductions,
      ticketRev,
      evtF.map((f: any) => ({ type: f.type, category_id: f.category_id, amount: Number(f.amount) }))
    );
    const totalCache = cacheLines.reduce((s, c) => s + c.amount, 0);
    const totalFExp = fExp + totalCache;
    const overrideTxs = evtT.filter((t: any) => t.pl_override_note);
    return {
      ...e,
      fInc: totalFInc, fExp: totalFExp, tInc: totalTInc, tExp,
      fResult: totalFInc - totalFExp,
      tResult: totalTInc - tExp,
      forecastCount: evtF.length,
      txCount: evtT.length,
      overrideCount: overrideTxs.length,
    };
  });

  const gFInc = eventSummaries.reduce((s, e) => s + e.fInc, 0);
  const gFExp = eventSummaries.reduce((s, e) => s + e.fExp, 0);
  const gTInc = eventSummaries.reduce((s, e) => s + e.tInc, 0);
  const gTExp = eventSummaries.reduce((s, e) => s + e.tExp, 0);
  const gFResult = gFInc - gFExp;
  const gTResult = gTInc - gTExp;

  const toggle = (id: string) => setExpandedEvent((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-6">
      {/* Mode selector + Event selector */}
      <div className="glass rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium whitespace-nowrap">Tipo de Relatório</label>
          <Select value={mode} onValueChange={(v) => setMode(v as PLMode)}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="forecast">Apenas Previsão</SelectItem>
              <SelectItem value="comparison">Previsão vs Realizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="border-t border-border/30 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Selecionar Eventos</p>
            <button onClick={toggleAll} className="text-xs text-primary hover:underline">
              {selectedEventIds.length === events.length ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {events.filter((e) => !e.parent_event_id).map((e) => {
              const children = events.filter((c) => c.parent_event_id === e.id);
              const isParent = children.length > 0;
              return (
                <div key={e.id}>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox checked={selectedEventIds.includes(e.id)} onCheckedChange={() => toggleEvent(e.id)} />
                    <span className={isParent ? "font-semibold" : ""}>{e.name}</span>
                    {isParent && <span className="text-xs text-muted-foreground">(consolidado)</span>}
                  </label>
                  {isParent && (
                    <div className="ml-6 mt-1 flex flex-col gap-1">
                      {children.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox checked={selectedEventIds.includes(c.id)} onCheckedChange={() => toggleEvent(c.id)} />
                          <span className="text-muted-foreground">↳ {c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {events.length === 0 && <p className="text-xs text-muted-foreground">Sem eventos registados.</p>}
          </div>
          {selectedEventIds.length === 0 && events.length > 0 && (
            <p className="text-xs text-muted-foreground">Nenhum evento selecionado — a mostrar todos.</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => exportPLToPDF(activeEvents, events, forecasts, transactions, categories, ticketZones, ticketLots, ticketSales, mode, allCacheConfigs, allCacheDeductions)}
          disabled={activeEvents.length === 0}
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive transition-all hover:bg-destructive/20 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar PDF</span>
        </button>
        <button
          onClick={() => exportPLToExcel(activeEvents, events, forecasts, transactions, categories, ticketZones, ticketLots, ticketSales, mode, allCacheConfigs, allCacheDeductions)}
          disabled={activeEvents.length === 0}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar Excel</span>
        </button>
      </div>

      {/* Global summary cards */}
      <div className={`grid gap-4 sm:grid-cols-2 ${mode === "comparison" ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas Previstas</p>
          <p className="mt-1 text-lg font-bold text-muted-foreground">{formatCurrency(gFInc)}</p>
        </div>
        {mode === "comparison" && (
          <div className="glass rounded-xl p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas Reais</p>
            <p className="mt-1 text-lg font-bold text-success">{formatCurrency(gTInc)}</p>
          </div>
        )}
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado Previsto</p>
          <p className={`mt-1 text-lg font-bold ${gFResult >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(gFResult)}</p>
        </div>
        {mode === "comparison" && (
          <div className="glass rounded-xl p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resultado Real</p>
            <p className={`mt-1 text-lg font-bold ${gTResult >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(gTResult)}</p>
          </div>
        )}
      </div>

      {/* Per-event expandable */}
      <div className="space-y-3">
        {eventSummaries.map((evt) => {
          const isOpen = expandedEvent === evt.id;
          const { evtF, evtT } = getEffectiveData(evt.id);
          const evtTicketEventIds = getTicketEventIds(evt.id);
          const evtTicketZones = ticketZones.filter((z: any) => evtTicketEventIds.includes(z.event_id));
          const pl = isOpen ? buildPL(evtF, evtT, categories, evtTicketZones, ticketLots, ticketSales, evt.id, allCacheConfigs, allCacheDeductions, evtTicketEventIds) : [];

          return (
            <div key={evt.id} className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(evt.id)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/30"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <BarChart3 className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{evt.name}</p>
                  <p className="text-xs text-muted-foreground">{evt.forecastCount} previsões · {evt.txCount} transações</p>
                </div>
                <div className="hidden sm:flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Previsto</p>
                    <span className={`font-mono font-bold ${evt.fResult >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(evt.fResult)}</span>
                  </div>
                  {mode === "comparison" && (
                    <>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Real</p>
                        <span className={`font-mono font-bold ${evt.tResult >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(evt.tResult)}</span>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Variação</p>
                        <span className={`font-mono font-bold ${evt.tResult - evt.fResult >= 0 ? "text-success" : "text-destructive"}`}>
                          {evt.tResult - evt.fResult >= 0 ? "+" : ""}{formatCurrency(evt.tResult - evt.fResult)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border/30 px-4 pb-4">
                  {evtF.length === 0 && evtT.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sem previsões ou transações para este evento.</p>
                  ) : (
                    <Table>
                     <TableHeader>
                         <TableRow>
                          <TableHead>Rubrica</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Preço Unit. (€)</TableHead>
                          <TableHead className="text-right">Valor s/ IVA (€)</TableHead>
                          <TableHead className="text-right">IVA (€)</TableHead>
                          <TableHead className="text-right">Total (€)</TableHead>
                          {mode === "comparison" && <TableHead className="text-right">Real s/ IVA (€)</TableHead>}
                          {mode === "comparison" && <TableHead className="text-right">Variação (€)</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pl.map((line, i) => {
                          const rowClass = line.isGrandTotal
                            ? "border-t-2 border-primary/30 bg-primary/5"
                            : line.isTotal ? "bg-secondary/20"
                            : line.isGroupHeader ? "bg-secondary/10 border-t border-border/20"
                            : line.isSubTotal ? "bg-muted/20 border-t border-border/20"
                            : line.subIndent ? "bg-muted/10" : "";
                          const labelClass = `${line.subIndent ? "pl-12 text-xs" : line.indent ? "pl-10" : line.isGroupHeader ? "pl-5" : ""} ${line.isSubTotal ? "pl-12 text-xs font-semibold" : ""} ${!line.isSubTotal && line.subIndent ? "italic" : ""} ${line.isTotal || line.isGrandTotal ? "font-bold text-xs uppercase tracking-wider" : line.isGroupHeader ? "font-semibold text-sm" : "text-sm"}`;
                          const valClass = `text-right font-mono ${line.isGrandTotal ? "text-base font-bold" : line.isTotal ? "font-semibold" : line.isGroupHeader ? "font-semibold text-sm" : line.isSubTotal ? "text-xs font-semibold" : line.subIndent ? "text-xs text-muted-foreground" : "text-muted-foreground"}`;
                          const ivaClass = `text-right font-mono text-xs ${line.isGrandTotal ? "font-bold" : line.isTotal ? "font-semibold" : line.isGroupHeader ? "font-semibold" : "text-muted-foreground"}`;

                          const showAbs = !line.isGrandTotal && !line.subIndent;
                          const fBase = showAbs ? Math.abs(line.forecast) : line.forecast;
                          const fIva = showAbs ? Math.abs(line.forecastIva) : line.forecastIva;
                          const fTotal = showAbs ? Math.abs(line.forecastTotal) : line.forecastTotal;

                          return (
                            <TableRow key={i} className={rowClass}>
                              <TableCell className={labelClass}>{line.label}</TableCell>
                              <TableCell className={`text-right font-mono ${line.isSubTotal ? "text-xs font-semibold" : line.subIndent ? "text-xs text-muted-foreground" : "text-muted-foreground"}`}>
                                {line.quantity != null ? line.quantity.toLocaleString("pt-PT") : ""}
                              </TableCell>
                              <TableCell className={`text-right font-mono ${line.isSubTotal ? "text-xs font-semibold" : line.subIndent ? "text-xs text-muted-foreground" : "text-muted-foreground"}`}>
                                {line.unitPrice != null ? formatCurrency(line.unitPrice) : ""}
                              </TableCell>
                              <TableCell className={valClass}>{formatCurrency(fBase)}</TableCell>
                              <TableCell className={ivaClass}>{formatCurrency(fIva)}</TableCell>
                              <TableCell className={valClass}>{formatCurrency(fTotal)}</TableCell>
                              {mode === "comparison" && (
                                <TableCell className={valClass}>{line.subIndent ? (line.actual > 0 ? formatCurrency(line.actual) : "—") : (line.isGrandTotal ? formatCurrency(line.actual) : formatCurrency(Math.abs(line.actual)))}</TableCell>
                              )}
                              {mode === "comparison" && (
                                <TableCell className={`text-right font-mono ${line.isGrandTotal ? "text-base font-bold" : line.isTotal ? "font-semibold" : line.isSubTotal ? "text-xs font-semibold" : line.subIndent ? "text-xs" : ""} ${line.variance >= 0 ? "text-success" : "text-destructive"}`}>
                                  {line.subIndent ? "—" : `${line.variance >= 0 ? "+" : ""}${formatCurrency(line.variance)}`}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {eventSummaries.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">Sem eventos registados.</p>
        )}
      </div>
    </div>
  );
}
