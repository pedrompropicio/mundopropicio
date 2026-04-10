import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, AlertTriangle, Handshake, ReceiptText, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildCategoryLookup, type CategoryNode } from "@/lib/category-hierarchy";
import { compareHierarchicalCodes } from "@/lib/utils";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportBPTransactionsToPDF, type BPTransactionsPDFData } from "@/lib/export-bp-transactions";

interface TransactionWithMeta {
  id: string;
  description: string;
  specification: string | null;
  amount: number;
  iva_rate: number;
  paid_amount: number;
  status: string;
  date: string;
  due_date: string | null;
  payment_date: string | null;
  category_id: string | null;
  supplier_id: string | null;
  event_id: string | null;
  pl_override_note: string | null;
  is_reimbursement: boolean;
  reimbursement_to: string | null;
  invoice_ref: string | null;
  supplierName?: string;
  isPartnerPaid?: boolean;
  partnerName?: string;
}

interface CategoryGroup {
  groupName: string;
  groupCode: string;
  categories: CategoryLine[];
  totalForecast: number;
  totalActual: number;
}

interface CategoryLine {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  forecastAmount: number;
  actualAmount: number;
  transactions: TransactionWithMeta[];
}

export default function ReportBPTransactions() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
      const { data, error } = await supabase.from("event_forecasts").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions-with-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, suppliers(name)")
        .in("status", ["approved", "paid"])
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

  const { data: partnerPaidExpenses = [] } = useQuery({
    queryKey: ["partner-paid-expenses-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("*, event_partners(supplier_id, suppliers(name))");
      if (error) throw error;
      return data;
    },
  });

  const { data: reimbursementItems = [] } = useQuery({
    queryKey: ["reimbursement-note-items-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_note_items")
        .select("*, reimbursement_notes(code, employee_name, status)");
      if (error) throw error;
      return data;
    },
  });

  // Build lookup maps
  const partnerPaidMap = useMemo(() => {
    const map: Record<string, { partnerName: string }> = {};
    partnerPaidExpenses.forEach((ppe: any) => {
      const name = ppe.event_partners?.suppliers?.name ?? "Sócio";
      map[ppe.transaction_id] = { partnerName: name };
    });
    return map;
  }, [partnerPaidExpenses]);

  const reimbursementMap = useMemo(() => {
    const map: Record<string, { code: string; employeeName: string }> = {};
    reimbursementItems.forEach((ri: any) => {
      if (ri.reimbursement_notes) {
        map[ri.transaction_id] = {
          code: ri.reimbursement_notes.code,
          employeeName: ri.reimbursement_notes.employee_name,
        };
      }
    });
    return map;
  }, [reimbursementItems]);

  // Get relevant event IDs (including child events for tours)
  const selectedEvent = events.find((e: any) => e.id === selectedEventId);
  const relevantEventIds = useMemo(() => {
    if (!selectedEventId) return [];
    const childIds = events
      .filter((e: any) => e.parent_event_id === selectedEventId)
      .map((e: any) => e.id);
    return [selectedEventId, ...childIds];
  }, [selectedEventId, events]);

  // Filter and enrich data for selected event
  const { groupedData, outOfBPTransactions, totalForecast, totalActual } = useMemo(() => {
    if (!selectedEventId || relevantEventIds.length === 0) {
      return { groupedData: [], outOfBPTransactions: [], totalForecast: 0, totalActual: 0 };
    }

    const lookup = buildCategoryLookup(categories as CategoryNode[]);

    // Filter forecasts for this event (expenses only)
    const eventForecasts = forecasts.filter(
      (f: any) => relevantEventIds.includes(f.event_id) && f.type === "expense"
    );

    // Filter transactions for this event (expenses only, approved or paid)
    const eventTransactions: TransactionWithMeta[] = transactions
      .filter((t: any) => relevantEventIds.includes(t.event_id) && t.type === "expense")
      .map((t: any) => {
        const pp = partnerPaidMap[t.id];
        const ri = reimbursementMap[t.id];
        return {
          ...t,
          supplierName: t.suppliers?.name ?? null,
          isPartnerPaid: !!pp,
          partnerName: pp?.partnerName,
          reimbursementCode: ri?.code,
          reimbursementEmployee: ri?.employeeName,
        };
      });

    // Separate "Fora do BP" transactions
    const normalTransactions = eventTransactions.filter((t) => !t.pl_override_note);
    const outOfBP = eventTransactions.filter((t) => !!t.pl_override_note);

    // Group forecasts by L2 category
    const forecastByCategory: Record<string, number> = {};
    eventForecasts.forEach((f: any) => {
      const catId = f.category_id;
      if (!catId) return;
      forecastByCategory[catId] = (forecastByCategory[catId] ?? 0) + Number(f.amount);
    });

    // Group transactions by category
    const transByCategory: Record<string, TransactionWithMeta[]> = {};
    normalTransactions.forEach((t) => {
      const catId = t.category_id ?? "_none";
      if (!transByCategory[catId]) transByCategory[catId] = [];
      transByCategory[catId].push(t);
    });

    // Build all category IDs that have either forecasts or transactions
    const allCatIds = new Set([
      ...Object.keys(forecastByCategory),
      ...Object.keys(transByCategory).filter((k) => k !== "_none"),
    ]);

    // Group by L2
    const groupMap: Record<string, CategoryGroup> = {};
    allCatIds.forEach((catId) => {
      const catInfo = lookup[catId];
      const groupName = catInfo?.groupName ?? "Sem categoria";
      const groupCode = catInfo?.groupCode ?? "Z";
      const catName = catInfo ? `${catInfo.code} ${catInfo.name}` : "Sem categoria";
      const catCode = catInfo?.code ?? "Z.Z";
      const forecast = forecastByCategory[catId] ?? 0;
      const catTrans = transByCategory[catId] ?? [];
      const actual = catTrans.reduce((s, t) => s + Number(t.amount), 0);

      if (!groupMap[groupName]) {
        groupMap[groupName] = {
          groupName,
          groupCode,
          categories: [],
          totalForecast: 0,
          totalActual: 0,
        };
      }

      // Check if category already exists in group (from different catId mapping)
      const existingCat = groupMap[groupName].categories.find((c) => c.categoryId === catId);
      if (existingCat) {
        existingCat.forecastAmount += forecast;
        existingCat.actualAmount += actual;
        existingCat.transactions.push(...catTrans);
      } else {
        groupMap[groupName].categories.push({
          categoryId: catId,
          categoryName: catName,
          categoryCode: catCode,
          forecastAmount: forecast,
          actualAmount: actual,
          transactions: catTrans,
        });
      }
      groupMap[groupName].totalForecast += forecast;
      groupMap[groupName].totalActual += actual;
    });

    // Handle transactions without category
    if (transByCategory["_none"]?.length) {
      const noCatTrans = transByCategory["_none"];
      const actual = noCatTrans.reduce((s, t) => s + Number(t.amount), 0);
      if (!groupMap["Sem categoria"]) {
        groupMap["Sem categoria"] = {
          groupName: "Sem categoria",
          groupCode: "Z",
          categories: [],
          totalForecast: 0,
          totalActual: 0,
        };
      }
      groupMap["Sem categoria"].categories.push({
        categoryId: "_none",
        categoryName: "Sem categoria",
        categoryCode: "Z.Z",
        forecastAmount: 0,
        actualAmount: actual,
        transactions: noCatTrans,
      });
      groupMap["Sem categoria"].totalActual += actual;
    }

    // Sort groups and categories within
    const sorted = Object.values(groupMap)
      .map((g) => ({
        ...g,
        categories: g.categories.sort((a, b) => compareHierarchicalCodes(a.categoryCode, b.categoryCode)),
      }))
      .sort((a, b) => compareHierarchicalCodes(a.groupCode, b.groupCode));

    const tf = sorted.reduce((s, g) => s + g.totalForecast, 0);
    const ta = sorted.reduce((s, g) => s + g.totalActual, 0);

    return { groupedData: sorted, outOfBPTransactions: outOfBP, totalForecast: tf, totalActual: ta };
  }, [selectedEventId, relevantEventIds, forecasts, transactions, categories, partnerPaidMap, reimbursementMap]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allGroups = new Set(groupedData.map((g) => g.groupName));
    const allCats = new Set(groupedData.flatMap((g) => g.categories.map((c) => c.categoryId)));
    setExpandedGroups(allGroups);
    setExpandedCategories(new Set([...allCats, "_outofbp"]));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
    setExpandedCategories(new Set());
  };

  const statusLabel = (status: string) => {
    if (status === "paid") return "Pago";
    if (status === "approved") return "A pagar";
    return status;
  };

  const renderTransactionRow = (t: TransactionWithMeta) => {
    const totalWithIva = Number(t.amount) * (1 + Number(t.iva_rate) / 100);
    const ri = reimbursementMap[t.id];
    return (
      <TableRow key={t.id} className="bg-muted/30 text-xs">
        <TableCell className="pl-12">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{t.description}</span>
            {t.specification && (
              <span className="text-muted-foreground">({t.specification})</span>
            )}
            {t.isPartnerPaid && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0">
                    <Handshake className="h-3 w-3" /> Sócio
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{t.partnerName}</TooltipContent>
              </Tooltip>
            )}
            {t.is_reimbursement && (
              <Badge variant="outline" className="text-[10px] gap-0.5 px-1 py-0">
                <ReceiptText className="h-3 w-3" /> Reembolso
                {ri && <span className="ml-0.5">({(ri as any).code})</span>}
              </Badge>
            )}
            {t.pl_override_note && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[10px] text-warning border-warning gap-0.5 px-1 py-0">
                    <AlertTriangle className="h-3 w-3" /> Fora do BP
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{t.pl_override_note}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{t.supplierName ?? "—"}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{format(new Date(t.date), "dd/MM/yyyy")}</TableCell>
        <TableCell className="text-right font-mono text-xs">{formatCurrency(Number(t.amount))}</TableCell>
        <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatCurrency(totalWithIva)}</TableCell>
        <TableCell className="text-center">
          <Badge variant={t.status === "paid" ? "default" : "secondary"} className="text-[10px]">
            {statusLabel(t.status)}
          </Badge>
        </TableCell>
      </TableRow>
    );
  };

  const outOfBPActual = outOfBPTransactions.reduce((s, t) => s + Number(t.amount), 0);
  const grandTotalForecast = totalForecast;
  const grandTotalActual = totalActual + outOfBPActual;

  const handleExportPDF = (mode: "synthetic" | "analytical") => {
    if (!selectedEvent) return;
    const pdfData: BPTransactionsPDFData = {
      eventName: selectedEvent.name,
      eventDate: selectedEvent.date,
      groupedData: groupedData as any,
      outOfBPTransactions: outOfBPTransactions as any,
      totalForecast,
      totalActual,
    };
    exportBPTransactionsToPDF(pdfData, mode);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Selecionar evento…" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e: any) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name} — {format(new Date(e.date), "dd/MM/yyyy")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedEventId && (
          <div className="flex gap-2 items-center">
            <button onClick={expandAll} className="text-xs text-primary hover:underline">Expandir tudo</button>
            <button onClick={collapseAll} className="text-xs text-primary hover:underline">Colapsar tudo</button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-2 gap-1.5">
                  <FileDown className="h-4 w-4" /> PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExportPDF("synthetic")}>
                  Sintético — Apenas totais por categoria
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPDF("analytical")}>
                  Analítico — Com detalhe das transações
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {selectedEventId && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria / Transação</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Previsto (s/IVA)</TableHead>
                <TableHead className="text-right">Realizado (s/IVA)</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedData.map((group) => {
                const isGroupExpanded = expandedGroups.has(group.groupName);
                const variance = group.totalActual - group.totalForecast;
                return (
                  <React.Fragment key={group.groupName}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 font-semibold bg-muted/20"
                      onClick={() => toggleGroup(group.groupName)}
                    >
                      <TableCell className="flex items-center gap-1">
                        {isGroupExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {group.groupCode} {group.groupName}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-right font-mono">{formatCurrency(group.totalForecast)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(group.totalActual)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs font-medium ${variance > 0 ? "text-destructive" : variance < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {variance > 0 ? "+" : ""}{formatCurrency(variance)}
                        </span>
                      </TableCell>
                    </TableRow>
                    {isGroupExpanded &&
                      group.categories.map((cat) => {
                        const isCatExpanded = expandedCategories.has(cat.categoryId);
                        const catVariance = cat.actualAmount - cat.forecastAmount;
                        return (
                          <React.Fragment key={cat.categoryId}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/30"
                              onClick={() => toggleCategory(cat.categoryId)}
                            >
                              <TableCell className="pl-8 flex items-center gap-1 font-medium text-sm">
                                {cat.transactions.length > 0 ? (
                                  isCatExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                                ) : (
                                  <span className="w-3.5" />
                                )}
                                {cat.categoryName}
                                {cat.transactions.length > 0 && (
                                  <span className="text-xs text-muted-foreground ml-1">({cat.transactions.length})</span>
                                )}
                              </TableCell>
                              <TableCell />
                              <TableCell />
                              <TableCell className="text-right font-mono text-sm">{formatCurrency(cat.forecastAmount)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatCurrency(cat.actualAmount)}</TableCell>
                              <TableCell className="text-center">
                                <span className={`text-xs ${catVariance > 0 ? "text-destructive" : catVariance < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                  {catVariance > 0 ? "+" : ""}{formatCurrency(catVariance)}
                                </span>
                              </TableCell>
                            </TableRow>
                            {isCatExpanded && cat.transactions.map(renderTransactionRow)}
                          </React.Fragment>
                        );
                      })}
                  </React.Fragment>
                );
              })}

              {/* Fora do BP section */}
              {outOfBPTransactions.length > 0 && (
                <>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50 font-semibold bg-warning/10 border-l-4 border-l-warning"
                    onClick={() => toggleCategory("_outofbp")}
                  >
                    <TableCell className="flex items-center gap-1">
                      {expandedCategories.has("_outofbp") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      Fora do BP ({outOfBPTransactions.length})
                    </TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right font-mono">—</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(outOfBPActual)}</TableCell>
                    <TableCell />
                  </TableRow>
                  {expandedCategories.has("_outofbp") && outOfBPTransactions.map(renderTransactionRow)}
                </>
              )}

              {/* Grand total */}
              <TableRow className="font-bold border-t-2">
                <TableCell>TOTAL DESPESAS</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-mono">{formatCurrency(grandTotalForecast)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(grandTotalActual)}</TableCell>
                <TableCell className="text-center">
                  <span className={`text-sm font-bold ${grandTotalActual - grandTotalForecast > 0 ? "text-destructive" : grandTotalActual - grandTotalForecast < 0 ? "text-green-600" : ""}`}>
                    {grandTotalActual - grandTotalForecast > 0 ? "+" : ""}{formatCurrency(grandTotalActual - grandTotalForecast)}
                  </span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {selectedEventId && groupedData.length === 0 && outOfBPTransactions.length === 0 && (
        <p className="text-center text-muted-foreground py-10">Nenhuma previsão ou transação de despesa encontrada para este evento.</p>
      )}
    </div>
  );
}
