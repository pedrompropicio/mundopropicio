import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, FileDown, Globe, Building2 } from "lucide-react";
import { buildCategoryLookup, type CategoryNode } from "@/lib/category-hierarchy";
import { compareHierarchicalCodes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { utils, writeFile } from "xlsx";
import { applyPTNumberFormat } from "@/lib/excel-format";
import { format } from "date-fns";
import { calculateCacheLinesForPL, type CacheConfig, type CacheDeduction } from "@/lib/cache-pl-helper";

interface CategoryLine {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  forecastAmount: number;
  transactedAmount: number;
  paidAmount: number;
  openAmount: number;
  unlaunchedAmount: number;
  totalPayable: number;
}

interface GroupData {
  groupName: string;
  groupCode: string;
  categories: CategoryLine[];
  totalForecast: number;
  totalTransacted: number;
  totalPaid: number;
  totalOpen: number;
  totalUnlaunched: number;
  totalPayable: number;
}

interface Totals {
  forecast: number;
  transacted: number;
  paid: number;
  open: number;
  unlaunched: number;
  payable: number;
}

const EMPTY_TOTALS: Totals = { forecast: 0, transacted: 0, paid: 0, open: 0, unlaunched: 0, payable: 0 };

export default function ReportForecastPayables() {
  const [viewMode, setViewMode] = useState<"event" | "global">("event");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedGlobalEvents, setExpandedGlobalEvents] = useState<Set<string>>(new Set());

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const groupedEventOptions = useMemo(() => {
    const parentEvents = events.filter((e: any) => !e.parent_event_id);
    const childMap: Record<string, any[]> = {};
    events.filter((e: any) => e.parent_event_id).forEach((e: any) => {
      if (!childMap[e.parent_event_id]) childMap[e.parent_event_id] = [];
      childMap[e.parent_event_id].push(e);
    });
    Object.values(childMap).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));

    const result: { id: string; name: string; date: string; isTour: boolean; isChild: boolean }[] = [];
    parentEvents.forEach((p: any) => {
      const children = childMap[p.id];
      const isTour = !!children && children.length > 0;
      result.push({ id: p.id, name: p.name, date: p.date, isTour, isChild: false });
      if (children) {
        children.forEach((c: any) => {
          result.push({ id: c.id, name: c.name, date: c.date, isTour: false, isChild: true });
        });
      }
    });
    return result;
  }, [events]);

  const { data: forecasts = [] } = useQuery({
    queryKey: ["all-forecasts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_forecasts").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["all-transactions-payables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("type", "expense")
        .in("status", ["approved", "paid", "pending"])
        .order("date", { ascending: true });
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

  const { data: cacheConfigs = [] } = useQuery({
    queryKey: ["all-cache-configs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_configs").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: cacheDeductions = [] } = useQuery({
    queryKey: ["all-cache-deductions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_deductions").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: cacheTiers = [] } = useQuery({
    queryKey: ["all-cache-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_tiers").select("*");
      if (error) throw error;
      return data;
    },
  });

  const categoryLookup = useMemo(() => buildCategoryLookup(categories as CategoryNode[]), [categories]);

  // Helper: compute grouped data for a set of event IDs
  const computeForEventIds = (eventIds: string[]): { groupedData: GroupData[]; grandTotals: Totals } => {
    if (eventIds.length === 0) return { groupedData: [], grandTotals: { ...EMPTY_TOTALS } };

    const allEventForecasts = forecasts.filter(
      (f: any) => eventIds.includes(f.event_id) && !f.is_transitory
    );
    const eventForecasts = allEventForecasts.filter((f: any) => f.type === "expense");

    const eventCacheConfigs = cacheConfigs.filter((c: any) => eventIds.includes(c.event_id));
    const configIds = new Set(eventCacheConfigs.map((c: any) => c.id));
    const eventCacheDeductions = cacheDeductions.filter((d: any) => configIds.has(d.cache_config_id));

    const configsWithTiers: CacheConfig[] = eventCacheConfigs.map((c: any) => ({
      ...c,
      tiers: cacheTiers
        .filter((t: any) => t.cache_config_id === c.id)
        .map((t: any) => ({ occupancy_threshold: Number(t.occupancy_threshold), percentage: Number(t.percentage) })),
    }));

    const revenueForecasts = allEventForecasts.filter((f: any) => f.type === "revenue");
    const ticketRevenueNet = revenueForecasts.reduce((s: number, f: any) => s + Number(f.amount), 0);
    const ticketRevenueGross = revenueForecasts.reduce((s: number, f: any) => {
      const amt = Number(f.amount);
      const iva = Number(f.iva_rate ?? 0);
      return s + amt * (1 + iva / 100);
    }, 0);

    const cacheLines = configsWithTiers.length > 0
      ? calculateCacheLinesForPL(
          configsWithTiers,
          eventCacheDeductions as CacheDeduction[],
          ticketRevenueNet,
          allEventForecasts.map((f: any) => ({
            type: f.type,
            category_id: f.category_id,
            amount: Number(f.amount),
            iva_rate: Number(f.iva_rate ?? 0),
          })),
          ticketRevenueGross,
          100
        )
      : [];

    const cacheAmountByConfigId = new Map<string, number>();
    configsWithTiers.forEach((config, idx) => {
      const line = cacheLines[idx];
      if (line) cacheAmountByConfigId.set(config.id, line.amount);
    });

    const eventTransactions = transactions.filter((t: any) => eventIds.includes(t.event_id));

    const catMap: Record<string, { forecast: number; transacted: number; paid: number; catInfo: any }> = {};

    eventForecasts.forEach((f: any) => {
      const catId = f.category_id || "uncategorized";
      if (!catMap[catId]) catMap[catId] = { forecast: 0, transacted: 0, paid: 0, catInfo: categoryLookup[catId] };
      if (f.cache_config_id && cacheAmountByConfigId.has(f.cache_config_id)) {
        catMap[catId].forecast += cacheAmountByConfigId.get(f.cache_config_id)!;
        cacheAmountByConfigId.delete(f.cache_config_id);
      } else {
        catMap[catId].forecast += Number(f.amount);
      }
    });

    eventTransactions.forEach((t: any) => {
      const catId = t.category_id || "uncategorized";
      if (!catMap[catId]) catMap[catId] = { forecast: 0, transacted: 0, paid: 0, catInfo: categoryLookup[catId] };
      catMap[catId].transacted += Number(t.amount);
      catMap[catId].paid += Number(t.paid_amount ?? 0);
    });

    const groupMap: Record<string, GroupData> = {};

    Object.entries(catMap).forEach(([catId, data]) => {
      const catInfo = data.catInfo ?? categoryLookup[catId];
      const groupName = catInfo?.groupName ?? "Sem categoria";
      const groupCode = catInfo?.groupCode ?? "Z";
      const catName = catInfo?.name ?? "Sem categoria";
      const catCode = catInfo?.code ?? "Z.Z";

      if (!groupMap[groupCode]) {
        groupMap[groupCode] = {
          groupName, groupCode, categories: [],
          totalForecast: 0, totalTransacted: 0, totalPaid: 0,
          totalOpen: 0, totalUnlaunched: 0, totalPayable: 0,
        };
      }

      const openAmount = Math.max(data.transacted - data.paid, 0);
      const unlaunchedAmount = Math.max(data.forecast - data.transacted, 0);
      const totalPayable = openAmount + unlaunchedAmount;

      groupMap[groupCode].categories.push({
        categoryId: catId, categoryName: catName, categoryCode: catCode,
        forecastAmount: data.forecast, transactedAmount: data.transacted,
        paidAmount: data.paid, openAmount, unlaunchedAmount, totalPayable,
      });
      groupMap[groupCode].totalForecast += data.forecast;
      groupMap[groupCode].totalTransacted += data.transacted;
      groupMap[groupCode].totalPaid += data.paid;
      groupMap[groupCode].totalOpen += openAmount;
      groupMap[groupCode].totalUnlaunched += unlaunchedAmount;
      groupMap[groupCode].totalPayable += totalPayable;
    });

    const sorted = Object.values(groupMap)
      .map((g) => ({ ...g, categories: g.categories.sort((a, b) => compareHierarchicalCodes(a.categoryCode, b.categoryCode)) }))
      .sort((a, b) => compareHierarchicalCodes(a.groupCode, b.groupCode));

    const grandTotals = sorted.reduce(
      (acc, g) => ({
        forecast: acc.forecast + g.totalForecast,
        transacted: acc.transacted + g.totalTransacted,
        paid: acc.paid + g.totalPaid,
        open: acc.open + g.totalOpen,
        unlaunched: acc.unlaunched + g.totalUnlaunched,
        payable: acc.payable + g.totalPayable,
      }),
      { ...EMPTY_TOTALS }
    );

    return { groupedData: sorted, grandTotals };
  };

  // --- Single event view data ---
  const selectedEvent = events.find((e: any) => e.id === selectedEventId);
  const relevantEventIds = useMemo(() => {
    if (!selectedEventId) return [];
    const childIds = events.filter((e: any) => e.parent_event_id === selectedEventId).map((e: any) => e.id);
    return [selectedEventId, ...childIds];
  }, [selectedEventId, events]);

  const { groupedData, grandTotals } = useMemo(
    () => computeForEventIds(relevantEventIds),
    [relevantEventIds, forecasts, transactions, categories, cacheConfigs, cacheDeductions, cacheTiers, categoryLookup]
  );

  // --- Global view data ---
  const globalData = useMemo(() => {
    if (viewMode !== "global") return [];

    // Only parent events (or standalone events without parent)
    const parentEvents = events.filter((e: any) => !e.parent_event_id);

    return parentEvents.map((event: any) => {
      const childIds = events.filter((e: any) => e.parent_event_id === event.id).map((e: any) => e.id);
      const allIds = [event.id, ...childIds];
      const { grandTotals: totals } = computeForEventIds(allIds);
      return {
        eventId: event.id,
        eventName: event.name,
        eventDate: event.date,
        eventStatus: event.status,
        ...totals,
      };
    }).filter((row) => row.forecast > 0 || row.transacted > 0);
  }, [viewMode, events, forecasts, transactions, categories, cacheConfigs, cacheDeductions, cacheTiers, categoryLookup]);

  const globalGrandTotals = useMemo(() => {
    return globalData.reduce(
      (acc, row) => ({
        forecast: acc.forecast + row.forecast,
        transacted: acc.transacted + row.transacted,
        paid: acc.paid + row.paid,
        open: acc.open + row.open,
        unlaunched: acc.unlaunched + row.unlaunched,
        payable: acc.payable + row.payable,
      }),
      { ...EMPTY_TOTALS }
    );
  }, [globalData]);

  // --- Global view: expand to show category groups per event ---
  const globalEventDetail = useMemo(() => {
    const details: Record<string, { groupedData: GroupData[]; grandTotals: Totals }> = {};
    expandedGlobalEvents.forEach((eventId) => {
      const childIds = events.filter((e: any) => e.parent_event_id === eventId).map((e: any) => e.id);
      details[eventId] = computeForEventIds([eventId, ...childIds]);
    });
    return details;
  }, [expandedGlobalEvents, events, forecasts, transactions, categories, cacheConfigs, cacheDeductions, cacheTiers, categoryLookup]);

  const toggleGroup = (code: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const toggleGlobalEvent = (eventId: string) => {
    setExpandedGlobalEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId); else next.add(eventId);
      return next;
    });
  };

  const expandAll = () => {
    if (viewMode === "global") {
      setExpandedGlobalEvents(new Set(globalData.map((r) => r.eventId)));
    } else {
      setExpandedGroups(new Set(groupedData.map((g) => g.groupCode)));
    }
  };
  const collapseAll = () => {
    if (viewMode === "global") {
      setExpandedGlobalEvents(new Set());
    } else {
      setExpandedGroups(new Set());
    }
  };

  // --- Export: single event ---
  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    if (viewMode === "global") {
      doc.setFontSize(14);
      doc.text("Exposição Financeira — Visão Global", 14, 18);
      doc.setFontSize(9);
      doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 24);

      const rows: any[] = [];
      globalData.forEach((r) => {
        rows.push([
          r.eventName,
          { content: formatCurrency(r.forecast), styles: { halign: "right" } },
          { content: formatCurrency(r.transacted), styles: { halign: "right" } },
          { content: formatCurrency(r.paid), styles: { halign: "right" } },
          { content: formatCurrency(r.open), styles: { halign: "right" } },
          { content: formatCurrency(r.unlaunched), styles: { halign: "right" } },
          { content: formatCurrency(r.payable), styles: { halign: "right" } },
        ]);
      });
      rows.push([
        { content: "TOTAL", styles: { fontStyle: "bold" } },
        { content: formatCurrency(globalGrandTotals.forecast), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(globalGrandTotals.transacted), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(globalGrandTotals.paid), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(globalGrandTotals.open), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(globalGrandTotals.unlaunched), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(globalGrandTotals.payable), styles: { fontStyle: "bold", halign: "right" } },
      ]);

      autoTable(doc, {
        startY: 28,
        head: [["Evento", "Previsto (BP)", "Lançado", "Pago", "Em Aberto", "Saldo BP", "Total a Pagar"]],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [60, 60, 60] },
      });

      doc.save("exposicao-financeira-global.pdf");
    } else {
      const eventName = selectedEvent?.name ?? "Evento";
      doc.setFontSize(14);
      doc.text(`Exposição Financeira — ${eventName}`, 14, 18);
      doc.setFontSize(9);
      doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 24);

      const rows: any[] = [];
      groupedData.forEach((g) => {
        rows.push([
          { content: `${g.groupCode} ${g.groupName}`, styles: { fontStyle: "bold" } },
          { content: formatCurrency(g.totalForecast), styles: { fontStyle: "bold", halign: "right" } },
          { content: formatCurrency(g.totalTransacted), styles: { fontStyle: "bold", halign: "right" } },
          { content: formatCurrency(g.totalPaid), styles: { fontStyle: "bold", halign: "right" } },
          { content: formatCurrency(g.totalOpen), styles: { fontStyle: "bold", halign: "right" } },
          { content: formatCurrency(g.totalUnlaunched), styles: { fontStyle: "bold", halign: "right" } },
          { content: formatCurrency(g.totalPayable), styles: { fontStyle: "bold", halign: "right" } },
        ]);
        g.categories.forEach((c) => {
          rows.push([
            `   ${c.categoryCode} ${c.categoryName}`,
            { content: formatCurrency(c.forecastAmount), styles: { halign: "right" } },
            { content: formatCurrency(c.transactedAmount), styles: { halign: "right" } },
            { content: formatCurrency(c.paidAmount), styles: { halign: "right" } },
            { content: formatCurrency(c.openAmount), styles: { halign: "right" } },
            { content: formatCurrency(c.unlaunchedAmount), styles: { halign: "right" } },
            { content: formatCurrency(c.totalPayable), styles: { halign: "right" } },
          ]);
        });
      });

      rows.push([
        { content: "TOTAL", styles: { fontStyle: "bold" } },
        { content: formatCurrency(grandTotals.forecast), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(grandTotals.transacted), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(grandTotals.paid), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(grandTotals.open), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(grandTotals.unlaunched), styles: { fontStyle: "bold", halign: "right" } },
        { content: formatCurrency(grandTotals.payable), styles: { fontStyle: "bold", halign: "right" } },
      ]);

      autoTable(doc, {
        startY: 28,
        head: [["Categoria", "Previsto (BP)", "Lançado", "Pago", "Em Aberto", "Saldo BP", "Total a Pagar"]],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [60, 60, 60] },
      });

      doc.save(`exposicao-financeira-${eventName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    }
  };

  const exportToExcel = () => {
    if (viewMode === "global") {
      const rows: any[] = [];
      globalData.forEach((r) => {
        rows.push({
          Evento: r.eventName,
          "Previsto (BP)": r.forecast,
          Lançado: r.transacted,
          Pago: r.paid,
          "Em Aberto": r.open,
          "Saldo BP": r.unlaunched,
          "Total a Pagar": r.payable,
        });
      });
      rows.push({
        Evento: "TOTAL",
        "Previsto (BP)": globalGrandTotals.forecast,
        Lançado: globalGrandTotals.transacted,
        Pago: globalGrandTotals.paid,
        "Em Aberto": globalGrandTotals.open,
        "Saldo BP": globalGrandTotals.unlaunched,
        "Total a Pagar": globalGrandTotals.payable,
      });

      const ws = utils.json_to_sheet(rows);
      applyPTNumberFormat(ws);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Exposição Financeira");
      writeFile(wb, "exposicao-financeira-global.xlsx");
    } else {
      const eventName = selectedEvent?.name ?? "Evento";
      const rows: any[] = [];
      groupedData.forEach((g) => {
        rows.push({
          Categoria: `${g.groupCode} ${g.groupName}`,
          "Previsto (BP)": g.totalForecast,
          Lançado: g.totalTransacted,
          Pago: g.totalPaid,
          "Em Aberto": g.totalOpen,
          "Saldo BP": g.totalUnlaunched,
          "Total a Pagar": g.totalPayable,
        });
        g.categories.forEach((c) => {
          rows.push({
            Categoria: `   ${c.categoryCode} ${c.categoryName}`,
            "Previsto (BP)": c.forecastAmount,
            Lançado: c.transactedAmount,
            Pago: c.paidAmount,
            "Em Aberto": c.openAmount,
            "Saldo BP": c.unlaunchedAmount,
            "Total a Pagar": c.totalPayable,
          });
        });
      });
      rows.push({
        Categoria: "TOTAL",
        "Previsto (BP)": grandTotals.forecast,
        Lançado: grandTotals.transacted,
        Pago: grandTotals.paid,
        "Em Aberto": grandTotals.open,
        "Saldo BP": grandTotals.unlaunched,
        "Total a Pagar": grandTotals.payable,
      });

      const ws = utils.json_to_sheet(rows);
      applyPTNumberFormat(ws);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Exposição Financeira");
      writeFile(wb, `exposicao-financeira-${eventName.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
    }
  };

  const showExportButtons = viewMode === "global" ? globalData.length > 0 : (selectedEventId && groupedData.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-3 flex-wrap">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "event" | "global")}>
            <TabsList>
              <TabsTrigger value="event" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Por Evento
              </TabsTrigger>
              <TabsTrigger value="global" className="gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Visão Global
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {viewMode === "event" && (
            <div className="w-full sm:w-auto sm:min-w-[220px]">
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um evento" />
                </SelectTrigger>
                <SelectContent>
                  {groupedEventOptions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className={e.isChild ? "pl-4" : ""}>
                        {e.isTour && "🎤 "}
                        {e.isChild && "↳ "}
                        {e.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {showExportButtons && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>Expandir</Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>Recolher</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileDown className="h-4 w-4 mr-1" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={exportToPDF}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportToExcel}>Excel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* --- GLOBAL VIEW --- */}
      {viewMode === "global" && globalData.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">Nenhum evento com previsões ou transações de despesa registadas.</p>
      )}

      {viewMode === "global" && globalData.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[30%]">Evento</TableHead>
                <TableHead className="text-right">Previsto (BP)</TableHead>
                <TableHead className="text-right">Lançado</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Em Aberto</TableHead>
                <TableHead className="text-right">Saldo BP</TableHead>
                <TableHead className="text-right font-bold">Total a Pagar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {globalData.map((row) => {
                const isExpanded = expandedGlobalEvents.has(row.eventId);
                const detail = globalEventDetail[row.eventId];
                return (
                  <React.Fragment key={row.eventId}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/30 font-medium"
                      onClick={() => toggleGlobalEvent(row.eventId)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {row.eventName}
                          <span className="text-xs text-muted-foreground ml-1">
                            ({format(new Date(row.eventDate + "T00:00:00"), "dd/MM/yyyy")})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(row.forecast)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.transacted)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.paid)}</TableCell>
                      <TableCell className="text-right">
                        {row.open > 0 ? (
                          <span className="text-destructive">{formatCurrency(row.open)}</span>
                        ) : formatCurrency(0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.unlaunched > 0 ? (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">
                            {formatCurrency(row.unlaunched)}
                          </Badge>
                        ) : formatCurrency(0)}
                      </TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(row.payable)}</TableCell>
                    </TableRow>

                    {isExpanded && detail && detail.groupedData.map((group) => (
                      <TableRow key={`${row.eventId}-${group.groupCode}`} className="text-sm bg-muted/10">
                        <TableCell className="pl-10">
                          <span className="text-xs text-muted-foreground mr-1">{group.groupCode}</span>
                          {group.groupName}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(group.totalForecast)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(group.totalTransacted)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(group.totalPaid)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(group.totalOpen)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(group.totalUnlaunched)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(group.totalPayable)}</TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}

              <TableRow className="bg-muted font-bold border-t-2">
                <TableCell>TOTAL GERAL</TableCell>
                <TableCell className="text-right">{formatCurrency(globalGrandTotals.forecast)}</TableCell>
                <TableCell className="text-right">{formatCurrency(globalGrandTotals.transacted)}</TableCell>
                <TableCell className="text-right">{formatCurrency(globalGrandTotals.paid)}</TableCell>
                <TableCell className="text-right text-destructive">{formatCurrency(globalGrandTotals.open)}</TableCell>
                <TableCell className="text-right text-orange-600">{formatCurrency(globalGrandTotals.unlaunched)}</TableCell>
                <TableCell className="text-right text-lg">{formatCurrency(globalGrandTotals.payable)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* --- SINGLE EVENT VIEW --- */}
      {viewMode === "event" && !selectedEventId && (
        <p className="text-muted-foreground text-sm py-8 text-center">Selecione um evento para visualizar a exposição financeira.</p>
      )}

      {viewMode === "event" && selectedEventId && groupedData.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">Nenhuma despesa prevista ou lançada para este evento.</p>
      )}

      {viewMode === "event" && selectedEventId && groupedData.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[30%]">Categoria</TableHead>
                <TableHead className="text-right">Previsto (BP)</TableHead>
                <TableHead className="text-right">Lançado</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Em Aberto</TableHead>
                <TableHead className="text-right">Saldo BP</TableHead>
                <TableHead className="text-right font-bold">Total a Pagar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedData.map((group) => {
                const isExpanded = expandedGroups.has(group.groupCode);
                return (
                  <React.Fragment key={group.groupCode}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/30 font-medium bg-muted/20"
                      onClick={() => toggleGroup(group.groupCode)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="text-xs text-muted-foreground mr-1">{group.groupCode}</span>
                          {group.groupName}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(group.totalForecast)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(group.totalTransacted)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(group.totalPaid)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(group.totalOpen)}</TableCell>
                      <TableCell className="text-right">
                        {group.totalUnlaunched > 0 && (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">
                            {formatCurrency(group.totalUnlaunched)}
                          </Badge>
                        )}
                        {group.totalUnlaunched === 0 && formatCurrency(0)}
                      </TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(group.totalPayable)}</TableCell>
                    </TableRow>

                    {isExpanded && group.categories.map((cat) => (
                      <TableRow key={cat.categoryId} className="text-sm">
                        <TableCell className="pl-10">
                          <span className="text-xs text-muted-foreground mr-1">{cat.categoryCode}</span>
                          {cat.categoryName}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(cat.forecastAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cat.transactedAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cat.paidAmount)}</TableCell>
                        <TableCell className="text-right">
                          {cat.openAmount > 0 ? (
                            <span className="text-destructive">{formatCurrency(cat.openAmount)}</span>
                          ) : formatCurrency(0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {cat.unlaunchedAmount > 0 ? (
                            <span className="text-orange-600">{formatCurrency(cat.unlaunchedAmount)}</span>
                          ) : formatCurrency(0)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(cat.totalPayable)}</TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}

              <TableRow className="bg-muted font-bold border-t-2">
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right">{formatCurrency(grandTotals.forecast)}</TableCell>
                <TableCell className="text-right">{formatCurrency(grandTotals.transacted)}</TableCell>
                <TableCell className="text-right">{formatCurrency(grandTotals.paid)}</TableCell>
                <TableCell className="text-right text-destructive">{formatCurrency(grandTotals.open)}</TableCell>
                <TableCell className="text-right text-orange-600">{formatCurrency(grandTotals.unlaunched)}</TableCell>
                <TableCell className="text-right text-lg">{formatCurrency(grandTotals.payable)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
