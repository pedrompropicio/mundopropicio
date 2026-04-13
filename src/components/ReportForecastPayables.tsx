import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, FileDown } from "lucide-react";
import { buildCategoryLookup, type CategoryNode } from "@/lib/category-hierarchy";
import { compareHierarchicalCodes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { utils, writeFile } from "xlsx";
import { applyPTNumberFormat } from "@/lib/excel-format";
import { format } from "date-fns";

interface CategoryLine {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  forecastAmount: number;
  transactedAmount: number;
  paidAmount: number;
  openAmount: number; // transacted - paid
  unlaunchedAmount: number; // forecast - transacted (>0 only)
  totalPayable: number; // openAmount + unlaunchedAmount
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

export default function ReportForecastPayables() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  const selectedEvent = events.find((e: any) => e.id === selectedEventId);
  const relevantEventIds = useMemo(() => {
    if (!selectedEventId) return [];
    const childIds = events
      .filter((e: any) => e.parent_event_id === selectedEventId)
      .map((e: any) => e.id);
    return [selectedEventId, ...childIds];
  }, [selectedEventId, events]);

  const { groupedData, grandTotals } = useMemo(() => {
    if (!selectedEventId || relevantEventIds.length === 0) {
      return { groupedData: [], grandTotals: { forecast: 0, transacted: 0, paid: 0, open: 0, unlaunched: 0, payable: 0 } };
    }

    const lookup = buildCategoryLookup(categories as CategoryNode[]);

    // Filter forecasts: expenses only, non-transitory
    const eventForecasts = forecasts.filter(
      (f: any) => relevantEventIds.includes(f.event_id) && f.type === "expense" && !f.is_transitory
    );

    // Filter transactions: expenses for these events
    const eventTransactions = transactions.filter(
      (t: any) => relevantEventIds.includes(t.event_id)
    );

    // Build category-level aggregation
    const catMap: Record<string, { forecast: number; transacted: number; paid: number; catInfo: any }> = {};

    eventForecasts.forEach((f: any) => {
      const catId = f.category_id || "uncategorized";
      if (!catMap[catId]) catMap[catId] = { forecast: 0, transacted: 0, paid: 0, catInfo: lookup[catId] };
      catMap[catId].forecast += Number(f.amount);
    });

    eventTransactions.forEach((t: any) => {
      const catId = t.category_id || "uncategorized";
      if (!catMap[catId]) catMap[catId] = { forecast: 0, transacted: 0, paid: 0, catInfo: lookup[catId] };
      catMap[catId].transacted += Number(t.amount);
      catMap[catId].paid += Number(t.paid_amount ?? 0);
    });

    // Group by L2
    const groupMap: Record<string, GroupData> = {};

    Object.entries(catMap).forEach(([catId, data]) => {
      const catInfo = data.catInfo ?? lookup[catId];
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

      const line: CategoryLine = {
        categoryId: catId,
        categoryName: catName,
        categoryCode: catCode,
        forecastAmount: data.forecast,
        transactedAmount: data.transacted,
        paidAmount: data.paid,
        openAmount,
        unlaunchedAmount,
        totalPayable,
      };

      groupMap[groupCode].categories.push(line);
      groupMap[groupCode].totalForecast += data.forecast;
      groupMap[groupCode].totalTransacted += data.transacted;
      groupMap[groupCode].totalPaid += data.paid;
      groupMap[groupCode].totalOpen += openAmount;
      groupMap[groupCode].totalUnlaunched += unlaunchedAmount;
      groupMap[groupCode].totalPayable += totalPayable;
    });

    // Sort
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
      { forecast: 0, transacted: 0, paid: 0, open: 0, unlaunched: 0, payable: 0 }
    );

    return { groupedData: sorted, grandTotals };
  }, [selectedEventId, relevantEventIds, forecasts, transactions, categories]);

  const toggleGroup = (code: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const expandAll = () => setExpandedGroups(new Set(groupedData.map((g) => g.groupCode)));
  const collapseAll = () => setExpandedGroups(new Set());

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const eventName = selectedEvent?.name ?? "Evento";
    doc.setFontSize(14);
    doc.text(`Previsão de Contas a Pagar — ${eventName}`, 14, 18);
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

    // Grand total row
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

    doc.save(`previsao-contas-pagar-${eventName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  const exportToExcel = () => {
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
    utils.book_append_sheet(wb, ws, "Contas a Pagar");
    writeFile(wb, `previsao-contas-pagar-${eventName.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <label className="text-sm font-medium text-muted-foreground mb-1 block">Evento</label>
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

        {selectedEventId && groupedData.length > 0 && (
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

      {!selectedEventId && (
        <p className="text-muted-foreground text-sm py-8 text-center">Selecione um evento para visualizar a previsão de contas a pagar.</p>
      )}

      {selectedEventId && groupedData.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">Nenhuma despesa prevista ou lançada para este evento.</p>
      )}

      {selectedEventId && groupedData.length > 0 && (
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
                            <span className="text-red-600">{formatCurrency(cat.openAmount)}</span>
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

              {/* Grand total */}
              <TableRow className="bg-muted font-bold border-t-2">
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right">{formatCurrency(grandTotals.forecast)}</TableCell>
                <TableCell className="text-right">{formatCurrency(grandTotals.transacted)}</TableCell>
                <TableCell className="text-right">{formatCurrency(grandTotals.paid)}</TableCell>
                <TableCell className="text-right text-red-600">{formatCurrency(grandTotals.open)}</TableCell>
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
