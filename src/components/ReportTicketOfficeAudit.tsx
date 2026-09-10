import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import TicketOfficeAuditPdfDialog, { type TicketOfficeAuditPdfFormat } from "@/components/TicketOfficeAuditPdfDialog";
import {
  Store,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  List,
  LayoutList,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { exportTicketOfficeAuditToExcel, exportTicketOfficeAuditToPDF } from "@/lib/export-ticket-office-audit";
import {
  computeTicketOfficeBalance,
  isCountedTicketOfficeTxn,
  isOpenTicketOfficeAdvance,
} from "@/lib/ticket-office-balance";
import { ticketSaleRevenue } from "@/lib/ticket-sales-revenue";


type ViewMode = "synthetic" | "analytical";
type AnalyticalGroupBy = "event" | "type";

interface AnalyticalLine {
  date: string;
  type: "sale" | "expense" | "transfer" | "income";
  description: string;
  eventName: string;
  eventId?: string;
  amount: number;
  runningBalance?: number;
}

export default function ReportTicketOfficeAudit() {
  const [selectedOffice, setSelectedOffice] = useState<string>("all");
  const [expandedOffices, setExpandedOffices] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("synthetic");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [analyticalGroupBy, setAnalyticalGroupBy] = useState<AnalyticalGroupBy>("type");
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfOfficeFilter, setPdfOfficeFilter] = useState<string>("all");
  const [pdfExportFormat, setPdfExportFormat] = useState<TicketOfficeAuditPdfFormat>("synthetic");
  const [pdfAnalyticalGroupBy, setPdfAnalyticalGroupBy] = useState<AnalyticalGroupBy>("type");

  // Fetch ticket offices
  const { data: offices = [], isLoading: loadingOffices } = useQuery({
    queryKey: ["report_ticket_offices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, is_active")
        .eq("type", "ticket_office")
        .order("name");
      if (error) throw error;
      // Map to expected shape: financial_account_id is the id itself
      return (data || []).map((fa: any) => ({ ...fa, financial_account_id: fa.id }));
    },
  });

  // Fetch all assignments
  const { data: assignments = [] } = useQuery({
    queryKey: ["report_to_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("financial_account_id, event_id, is_conciliated, events(id, name, status)");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all ticket zones
  const { data: allZones = [] } = useQuery({
    queryKey: ["report_to_zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id, name");
      if (error) throw error;
      return data;
    },
  });

  const zoneIds = allZones.map((z: any) => z.id);

  // Fetch sales with date for analytical view (paginado: o PostgREST corta em 1.000 linhas)
  const { data: allSales = [] } = useQuery({
    queryKey: ["report_to_sales", zoneIds.length],
    enabled: zoneIds.length > 0,
    queryFn: async () => {
      const batchSize = 500;
      const pageSize = 1000;
      let allData: any[] = [];
      for (let i = 0; i < zoneIds.length; i += batchSize) {
        const batch = zoneIds.slice(i, i + batchSize);
        let from = 0;
        for (;;) {
          const { data, error } = await supabase
            .from("ticket_sales")
            .select("zone_id, quantity, unit_price, total_value, financial_account_id, sale_date, notes")
            .in("zone_id", batch)
            .order("id")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          allData = allData.concat(data || []);
          if (!data || data.length < pageSize) break;
          from += pageSize;
        }
      }
      return allData;
    },
  });

  // Vendas por bilheteira/evento somadas na base de dados — fonte única do saldo (issue #129)
  const officeIdsForSales = offices.map((o: any) => o.id);
  const { data: rpcSales = [] } = useQuery({
    queryKey: ["report_to_sales_rpc", officeIdsForSales],
    enabled: officeIdsForSales.length > 0,
    queryFn: async () => {
      const rows: any[] = [];
      for (const accountId of officeIdsForSales) {
        const { data, error } = await (supabase as any).rpc("get_ticket_office_sales", {
          p_account_id: accountId,
        });
        if (error) throw error;
        (data || []).forEach((r: any) =>
          rows.push({
            event_id: r.event_id,
            financial_account_id: accountId,
            quantity: Number(r.quantity || 0),
            unit_price: 0,
            total_value: Number(r.revenue || 0),
          }),
        );
      }
      return rows;
    },
  });


  // Fetch transactions on ticket office financial accounts
  const accountIds = offices
    .filter((o: any) => o.financial_account_id)
    .map((o: any) => o.financial_account_id);

  const { data: accountTxns = [] } = useQuery({
    queryKey: ["report_to_txns", accountIds.length],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, account_id, type, amount, paid_amount, event_id, description, status, date, reversed_at, is_hidden, supplier_id, suppliers(name), events(name)")
        .in("account_id", accountIds)
        .in("status", ["approved", "paid"])
        .order("date");
      if (error) throw error;
      return data;
    },
  });

  const { data: allAdvances = [] } = useQuery({
    queryKey: ["report_to_advances", accountIds.length],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("event_ticket_office_advances")
        .select("financial_account_id, event_id, amount, transaction_id, settlement_id, advance_date")
        .in("financial_account_id", accountIds);
      if (error) throw error;
      return data || [];
    },
  });


  // Build zone-to-event map
  const zoneEventMap = useMemo(() => {
    const map: Record<string, string> = {};
    allZones.forEach((z: any) => { map[z.id] = z.event_id; });
    return map;
  }, [allZones]);

  // Event name map from assignments
  const eventNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    assignments.forEach((a: any) => {
      if (a.events) map[a.event_id] = a.events.name;
    });
    return map;
  }, [assignments]);

  // Zone name map
  const zoneNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    allZones.forEach((z: any) => { map[z.id] = z.name; });
    return map;
  }, [allZones]);

  // Build synthetic audit data — fonte única em src/lib/ticket-office-balance.ts
  // Vendas vêm da RPC get_ticket_office_sales (somadas na BD), nunca do cliente.
  const auditData = useMemo(() => {
    const salesWithEvent = rpcSales as any[];

    return offices.map((office: any) => {
      const officeAssignments = assignments.filter(
        (a: any) => a.financial_account_id === office.id
      );
      const accountId = office.financial_account_id;
      const assignedEventIds = officeAssignments.filter((a: any) => a.events).map((a: any) => a.event_id);
      const officeAdvances = (allAdvances as any[]).filter((a: any) => a.financial_account_id === office.id);

      const { total, byEvent } = computeTicketOfficeBalance({
        officeId: office.id,
        assignedEventIds,
        sales: salesWithEvent,
        transactions: accountTxns as any[],
        advances: officeAdvances,
      });

      const events = officeAssignments.map((a: any) => {
        const ev = a.events;
        if (!ev) return null;

        const officeSales = salesWithEvent
          .filter((s: any) => s.event_id === a.event_id && s.financial_account_id === office.id)
          .reduce((sum: number, s: any) => sum + ticketSaleRevenue(s), 0);

        // Receitas lançadas como transação também entram na coluna Vendas (como na linha da bilheteira)
        const eventIncome = accountTxns
          .filter((t: any) => isCountedTicketOfficeTxn(t, office.id) && t.type === "income" && t.event_id === a.event_id)
          .reduce((sum: number, t: any) => sum + Number(t.paid_amount || 0), 0);

        // Cada transação entra numa coluna só: expense → despesas, transfer → transferências
        const eventExpenses = accountTxns
          .filter((t: any) => isCountedTicketOfficeTxn(t, office.id) && t.type === "expense" && t.event_id === a.event_id)
          .reduce((sum: number, t: any) => sum + Number(t.paid_amount || 0), 0);

        const eventTransfers = accountTxns
          .filter((t: any) => isCountedTicketOfficeTxn(t, office.id) && t.type === "transfer" && t.event_id === a.event_id)
          .reduce((sum: number, t: any) => sum + Number(t.paid_amount || 0), 0);

        const eventAdvances = officeAdvances
          .filter((adv: any) => isOpenTicketOfficeAdvance(adv) && adv.event_id === a.event_id)
          .reduce((sum: number, adv: any) => sum + Number(adv.amount || 0), 0);

        return {
          eventId: a.event_id,
          eventName: ev.name,
          eventStatus: ev.status,
          isConciliated: a.is_conciliated,
          totalSales: officeSales + eventIncome,

          totalExpenses: eventExpenses,
          totalTransfers: eventTransfers,
          totalAdvances: eventAdvances,
          balance: byEvent[a.event_id] ?? 0,
        };
      }).filter(Boolean);

      const countedTxns = accountTxns.filter((t: any) => isCountedTicketOfficeTxn(t, office.id));

      // Totais da bilheteira — cada movimento numa coluna só, para reconciliar com o Saldo Previsto
      const totalSales = salesWithEvent
        .filter((s: any) => s.financial_account_id === office.id)
        .reduce((sum: number, s: any) => sum + ticketSaleRevenue(s), 0);

      const totalIncome = countedTxns
        .filter((t: any) => t.type === "income")
        .reduce((sum: number, t: any) => sum + Number(t.paid_amount || 0), 0);

      const totalDirectExpenses = countedTxns
        .filter((t: any) => t.type === "expense")
        .reduce((sum: number, t: any) => sum + Number(t.paid_amount || 0), 0);

      const transfers = countedTxns
        .filter((t: any) => t.type === "transfer")
        .reduce((sum: number, t: any) => sum + Number(t.paid_amount || 0), 0);

      const totalAdvances = officeAdvances
        .filter((adv: any) => isOpenTicketOfficeAdvance(adv))
        .reduce((sum: number, adv: any) => sum + Number(adv.amount || 0), 0);

      const noEventOut = countedTxns
        .filter((t: any) => !t.event_id && (t.type === "transfer" || t.type === "expense"))
        .reduce((sum: number, t: any) => sum + Number(t.paid_amount || 0), 0);

      return {
        officeId: office.id,
        officeName: office.name,
        financialAccountId: accountId,
        totalSales: totalSales + totalIncome,
        totalDirectExpenses,
        totalTransfers: transfers,
        totalAdvances,
        noEventOut,
        expectedBalance: total,
        events,
      };

    });
  }, [offices, assignments, rpcSales, accountTxns, allAdvances]);


  // Build analytical lines per office
  const analyticalData = useMemo(() => {
    // Always compute analytical data so PDF export works from any view mode
    const result: Record<string, AnalyticalLine[]> = {};

    const salesWithEvent = allSales.map((s: any) => ({ ...s, event_id: zoneEventMap[s.zone_id] }));

    offices.forEach((office: any) => {
      const lines: AnalyticalLine[] = [];
      const officeAssignments = assignments.filter((a: any) => a.financial_account_id === office.id);
      const assignedEventIds = officeAssignments.filter((a: any) => a.events).map((a: any) => a.event_id);
      const assigned = new Set<string>(assignedEventIds);

      // Sales lines — mesma base da vista sintética (igualdade estrita + ticketSaleRevenue)
      salesWithEvent
        .filter((s: any) => s.financial_account_id === office.id && s.event_id && assigned.has(s.event_id))
        .forEach((s: any) => {
          const zoneName = zoneNameMap[s.zone_id] || "";
          lines.push({
            date: s.sale_date,
            type: "sale",
            description: `Venda ${s.quantity}x ${formatCurrency(Number(s.unit_price))} — ${zoneName}`,
            eventName: eventNameMap[s.event_id] || "",
            eventId: s.event_id,
            amount: ticketSaleRevenue(s),
          });
        });

      // Transaction lines
      accountTxns
        .filter((t: any) => isCountedTicketOfficeTxn(t, office.id))
        .forEach((t: any) => {
          const amt = Number(t.paid_amount || 0);
          if (!amt) return;
          const evName = t.events?.name || eventNameMap[t.event_id] || "—";
          const supplierName = t.suppliers?.name ? ` — ${t.suppliers.name}` : "";

          if (t.type === "expense") {
            lines.push({
              date: t.date,
              type: t.event_id ? "expense" : "transfer",
              description: `${t.description}${supplierName}`,
              eventName: t.event_id ? evName : "—",
              eventId: t.event_id || undefined,
              amount: -amt,
            });
          } else if (t.type === "transfer") {
            lines.push({
              date: t.date,
              type: "transfer",
              description: `${t.description}${supplierName}`,
              eventName: t.event_id ? evName : "—",
              eventId: t.event_id || undefined,
              amount: -amt,
            });
          } else if (t.type === "income") {
            lines.push({
              date: t.date,
              type: "income",
              description: `${t.description}${supplierName}`,
              eventName: t.event_id ? evName : "—",
              eventId: t.event_id || undefined,
              amount: amt,
            });
          }
        });

      // Adiantamentos em aberto (sem transação e sem fecho)
      (allAdvances as any[])
        .filter((a: any) => a.financial_account_id === office.id && isOpenTicketOfficeAdvance(a))
        .forEach((a: any) => {
          lines.push({
            date: a.advance_date || "",
            type: "transfer",
            description: "Adiantamento à empresa",
            eventName: eventNameMap[a.event_id] || "—",
            eventId: a.event_id || undefined,
            amount: -Number(a.amount || 0),
          });
        });

      // Sort by date, then type (sales first, then expenses)
      lines.sort((a, b) => {
        const d = (a.date || "").localeCompare(b.date || "");
        if (d !== 0) return d;
        const typeOrder = { sale: 0, income: 1, expense: 2, transfer: 3 };
        return typeOrder[a.type] - typeOrder[b.type];
      });

      // Add running balance
      let balance = 0;
      lines.forEach((l) => {
        balance += l.amount;
        l.runningBalance = balance;
      });

      result[office.id] = lines;
    });

    return result;
  }, [offices, assignments, allSales, accountTxns, allAdvances, zoneNameMap, eventNameMap, zoneEventMap]);


  const filteredData = selectedOffice === "all"
    ? auditData
    : auditData.filter((d: any) => d.officeId === selectedOffice);

  const toggleExpand = (id: string) => {
    setExpandedOffices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const grandTotals = useMemo(() => {
    return filteredData.reduce(
      (acc: any, d: any) => ({
        sales: acc.sales + d.totalSales,
        expenses: acc.expenses + d.totalDirectExpenses,
        transfers: acc.transfers + d.totalTransfers,
        advances: acc.advances + (d.totalAdvances || 0),
        balance: acc.balance + d.expectedBalance,
      }),
      { sales: 0, expenses: 0, transfers: 0, advances: 0, balance: 0 }
    );
  }, [filteredData]);


  const buildExportData = (officeFilter = selectedOffice) => {
    const exportSource = officeFilter === "all"
      ? auditData
      : auditData.filter((d: any) => d.officeId === officeFilter);

    const syntheticExport = exportSource.map((d: any) => ({
      officeName: d.officeName,
      totalSales: d.totalSales,
      totalDirectExpenses: d.totalDirectExpenses,
      totalTransfers: d.totalTransfers,
      totalAdvances: d.totalAdvances || 0,
      expectedBalance: d.expectedBalance,
      events: d.events.map((e: any) => ({
        eventName: e.eventName,
        eventStatus: e.eventStatus,
        isConciliated: e.isConciliated,
        totalSales: e.totalSales,
        totalExpenses: e.totalExpenses,
        totalTransfers: e.totalTransfers || 0,
        totalAdvances: e.totalAdvances || 0,
        balance: e.balance,
      })),
    }));


    const analyticalExport = exportSource.map((d: any) => ({
      officeName: d.officeName,
      expectedBalance: d.expectedBalance,
      lines: analyticalData[d.officeId] || [],
    }));

    return { syntheticExport, analyticalExport };
  };

  const handleExportExcel = () => {
    const { syntheticExport, analyticalExport } = buildExportData();
    exportTicketOfficeAuditToExcel(syntheticExport, analyticalExport, viewMode, analyticalGroupBy);
  };

  const openPDFDialog = () => {
    setPdfOfficeFilter(selectedOffice);
    setPdfAnalyticalGroupBy(analyticalGroupBy);
    setPdfExportFormat(viewMode === "synthetic" ? "synthetic" : "analytical-3");
    setPdfDialogOpen(true);
  };

  const handleConfirmPDFExport = () => {
    const { syntheticExport, analyticalExport } = buildExportData(pdfOfficeFilter);
    const pdfViewMode = pdfExportFormat === "synthetic" ? "synthetic" : "analytical";
    const detailLevel = pdfExportFormat === "analytical-2" ? 2 : 3;

    exportTicketOfficeAuditToPDF(syntheticExport, analyticalExport, {
      viewMode: pdfViewMode,
      groupBy: pdfViewMode === "analytical" ? pdfAnalyticalGroupBy : undefined,
      detailLevel: pdfViewMode === "analytical" ? detailLevel : undefined,
    });
    setPdfDialogOpen(false);
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "sale": return "Venda";
      case "expense": return "Despesa";
      case "transfer": return "Transferência";
      case "income": return "Receita";
      default: return type;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "sale": return "text-emerald-500";
      case "income": return "text-emerald-500";
      case "expense": return "text-amber-500";
      case "transfer": return "text-muted-foreground";
      default: return "";
    }
  };

  if (loadingOffices) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedOffice} onValueChange={setSelectedOffice}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Todas as bilheteiras" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as bilheteiras</SelectItem>
            {offices.map((o: any) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center border rounded-lg overflow-hidden">
          <Button
            variant={viewMode === "synthetic" ? "default" : "ghost"}
            size="sm"
            className="rounded-none gap-1.5"
            onClick={() => setViewMode("synthetic")}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Sintético
          </Button>
          <Button
            variant={viewMode === "analytical" ? "default" : "ghost"}
            size="sm"
            className="rounded-none gap-1.5"
            onClick={() => setViewMode("analytical")}
          >
            <List className="h-3.5 w-3.5" />
            Analítico
          </Button>
        </div>

        {viewMode === "analytical" && (
          <div className="flex items-center border rounded-lg overflow-hidden">
            <Button
              variant={analyticalGroupBy === "type" ? "default" : "ghost"}
              size="sm"
              className="rounded-none gap-1.5 text-xs"
              onClick={() => { setAnalyticalGroupBy("type"); setExpandedCategories(new Set()); }}
            >
              Por Categoria
            </Button>
            <Button
              variant={analyticalGroupBy === "event" ? "default" : "ghost"}
              size="sm"
              className="rounded-none gap-1.5 text-xs"
              onClick={() => { setAnalyticalGroupBy("event"); setExpandedCategories(new Set()); }}
            >
              Por Evento
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={openPDFDialog}>
            <FileText className="h-4 w-4 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Total Vendas
            </div>
            <p className="text-lg font-mono font-bold text-emerald-500">
              {formatCurrency(grandTotals.sales)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingDown className="h-3.5 w-3.5" />
              Despesas Diretas
            </div>
            <p className="text-lg font-mono font-bold text-amber-500">
              {formatCurrency(grandTotals.expenses)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Transferências
            </div>
            <p className="text-lg font-mono font-bold">
              {formatCurrency(grandTotals.transfers)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Adiantamentos
            </div>
            <p className="text-lg font-mono font-bold">
              {formatCurrency(grandTotals.advances)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5" />
              Saldo Previsto
            </div>
            <p className={cn(
              "text-lg font-mono font-bold",
              grandTotals.balance >= 0 ? "text-emerald-500" : "text-red-400"
            )}>
              {formatCurrency(grandTotals.balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* === SYNTHETIC VIEW === */}
      {viewMode === "synthetic" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Bilheteira</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Desp. Diretas</TableHead>
                  <TableHead className="text-right">Transferências</TableHead>
                  <TableHead className="text-right">Adiantamentos</TableHead>
                  <TableHead className="text-right">Saldo Previsto</TableHead>
                  <TableHead className="text-center">Eventos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma bilheteira encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((office: any) => {
                    const isExpanded = expandedOffices.has(office.officeId);
                    return (
                      <>{/* office row */}
                        <TableRow
                          key={office.officeId}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleExpand(office.officeId)}
                        >
                          <TableCell className="w-8 px-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4 text-muted-foreground" />
                              {office.officeName}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-emerald-500">{formatCurrency(office.totalSales)}</TableCell>
                          <TableCell className="text-right font-mono text-amber-500">{formatCurrency(office.totalDirectExpenses)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(office.totalTransfers)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(office.totalAdvances || 0)}</TableCell>
                          <TableCell className={cn("text-right font-mono font-semibold", office.expectedBalance >= 0 ? "text-emerald-500" : "text-red-400")}>
                            {formatCurrency(office.expectedBalance)}
                          </TableCell>
                          <TableCell className="text-center"><Badge variant="secondary">{office.events.length}</Badge></TableCell>
                        </TableRow>

                        {isExpanded && office.events.length > 0 && (
                          <>
                            <TableRow className="bg-muted/20">
                              <TableCell></TableCell>
                              <TableCell className="text-xs font-semibold text-muted-foreground">Evento</TableCell>
                              <TableCell className="text-xs font-semibold text-muted-foreground text-right">Vendas</TableCell>
                              <TableCell className="text-xs font-semibold text-muted-foreground text-right">Despesas</TableCell>
                              <TableCell className="text-xs font-semibold text-muted-foreground text-right">Transf.</TableCell>
                              <TableCell className="text-xs font-semibold text-muted-foreground text-right">Adiant.</TableCell>
                              <TableCell className="text-xs font-semibold text-muted-foreground text-right">Saldo</TableCell>
                              <TableCell className="text-xs font-semibold text-muted-foreground text-center">Estado</TableCell>
                            </TableRow>
                            {office.events.map((ev: any) => (
                              <TableRow key={`${office.officeId}-${ev.eventId}`} className="bg-muted/10">
                                <TableCell></TableCell>
                                <TableCell className="text-sm pl-6">
                                  <div className="flex items-center gap-2">
                                    {ev.isConciliated ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                                    {ev.eventName}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm text-emerald-500">{formatCurrency(ev.totalSales)}</TableCell>
                                <TableCell className="text-right font-mono text-sm text-amber-500">{formatCurrency(ev.totalExpenses)}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{formatCurrency(ev.totalTransfers || 0)}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{formatCurrency(ev.totalAdvances || 0)}</TableCell>
                                <TableCell className={cn("text-right font-mono text-sm font-medium", ev.balance >= 0 ? "text-emerald-500" : "text-red-400")}>
                                  {formatCurrency(ev.balance)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={ev.eventStatus === "completed" ? "default" : "secondary"} className="text-[10px]">
                                    {ev.eventStatus === "completed" ? "Finalizado" : ev.eventStatus === "confirmed" ? "Confirmado" : ev.eventStatus === "cancelled" ? "Cancelado" : "Planeamento"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                            {office.noEventOut > 0 && (
                              <TableRow className="bg-muted/10 border-t">
                                <TableCell></TableCell>
                                <TableCell className="text-sm pl-6 text-muted-foreground italic">Saídas sem evento associado</TableCell>
                                <TableCell></TableCell>
                                <TableCell className="text-right font-mono text-sm">{formatCurrency(office.noEventOut)}</TableCell>
                                <TableCell colSpan={4}></TableCell>
                              </TableRow>
                            )}
                          </>
                        )}
                      </>
                    );
                  })
                )}
                {filteredData.length > 1 && (
                  <TableRow className="border-t-2 font-semibold bg-muted/30">
                    <TableCell></TableCell>
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right font-mono text-emerald-500">{formatCurrency(grandTotals.sales)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-500">{formatCurrency(grandTotals.expenses)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(grandTotals.transfers)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(grandTotals.advances)}</TableCell>
                    <TableCell className={cn("text-right font-mono", grandTotals.balance >= 0 ? "text-emerald-500" : "text-red-400")}>
                      {formatCurrency(grandTotals.balance)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{filteredData.reduce((s: number, d: any) => s + d.events.length, 0)}</Badge>
                    </TableCell>
                  </TableRow>
                )}

              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* === ANALYTICAL VIEW === */}
      {viewMode === "analytical" && (
        <div className="space-y-4">
          {filteredData.map((office: any) => {
            const lines: AnalyticalLine[] = analyticalData[office.officeId] || [];

            const toggleKey = (key: string) => {
              const fullKey = `${office.officeId}-${key}`;
              setExpandedCategories((prev) => {
                const next = new Set(prev);
                if (next.has(fullKey)) next.delete(fullKey);
                else next.add(fullKey);
                return next;
              });
            };

            return (
              <Card key={office.officeId}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                    <div className="flex items-center gap-2 font-semibold">
                      <Store className="h-4 w-4 text-muted-foreground" />
                      {office.officeName}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">Saldo:</span>
                      <span className={cn("font-mono font-bold", office.expectedBalance >= 0 ? "text-emerald-500" : "text-red-400")}>
                        {formatCurrency(office.expectedBalance)}
                      </span>
                    </div>
                  </div>

                  {lines.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">Sem movimentações</div>
                  ) : analyticalGroupBy === "type" ? (
                    /* ── GROUP BY TYPE (Categoria) ── */
                    <AnalyticalByType
                      officeId={office.officeId}
                      lines={lines}
                      expandedCategories={expandedCategories}
                      toggleKey={toggleKey}
                    />
                  ) : (
                    /* ── GROUP BY EVENT ── */
                    <AnalyticalByEvent
                      officeId={office.officeId}
                      lines={lines}
                      expandedCategories={expandedCategories}
                      toggleKey={toggleKey}
                    />
                  )}

                  {/* Balance summary */}
                  {lines.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t-2 bg-muted/30">
                      <span className="font-semibold text-sm">SALDO PREVISTO</span>
                      <span className={cn(
                        "font-mono font-bold text-base",
                        office.expectedBalance >= 0 ? "text-emerald-500" : "text-red-400"
                      )}>
                        {formatCurrency(office.expectedBalance)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TicketOfficeAuditPdfDialog
        open={pdfDialogOpen}
        onOpenChange={setPdfDialogOpen}
        format={pdfExportFormat}
        onFormatChange={setPdfExportFormat}
        officeFilter={pdfOfficeFilter}
        onOfficeFilterChange={setPdfOfficeFilter}
        analyticalGroupBy={pdfAnalyticalGroupBy}
        onAnalyticalGroupByChange={setPdfAnalyticalGroupBy}
        offices={offices.map((office: any) => ({ id: office.id, name: office.name }))}
        onConfirm={handleConfirmPDFExport}
      />
    </div>
  );
}

// ─── Analytical sub-components ───

function AnalyticalByType({ officeId, lines, expandedCategories, toggleKey }: {
  officeId: string;
  lines: AnalyticalLine[];
  expandedCategories: Set<string>;
  toggleKey: (key: string) => void;
}) {
  // Group by event for sales + expenses; transfers stay generic
  const transferLines = lines.filter((l) => l.type === "transfer");
  const eventLines = lines.filter((l) => l.type !== "transfer");

  const byEvent: Record<string, { sales: AnalyticalLine[]; expenses: AnalyticalLine[] }> = {};
  eventLines.forEach((l) => {
    const evKey = l.eventName || "Sem evento";
    if (!byEvent[evKey]) byEvent[evKey] = { sales: [], expenses: [] };
    if (l.type === "sale" || l.type === "income") byEvent[evKey].sales.push(l);
    else if (l.type === "expense") byEvent[evKey].expenses.push(l);
  });

  const subCategories = [
    { key: "sales", label: "Bilhetes Vendidos", color: "text-emerald-500", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { key: "expenses", label: "Despesas e Custos", color: "text-amber-500", icon: <TrendingDown className="h-3.5 w-3.5" /> },
  ];

  function renderLineTable(tableLines: AnalyticalLine[], colorClass: string) {
    return (
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/10">
            <TableHead className="w-24 text-xs">Data</TableHead>
            <TableHead className="text-xs">Descrição</TableHead>
            <TableHead className="text-right w-28 text-xs">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableLines.map((line, idx) => (
            <TableRow key={idx} className="bg-muted/5">
              <TableCell className="text-xs font-mono">
                {format(new Date(line.date + "T00:00:00"), "dd/MM/yyyy")}
              </TableCell>
              <TableCell className="text-sm max-w-[300px] truncate" title={line.description}>
                {line.description}
              </TableCell>
              <TableCell className={cn("text-right font-mono text-sm", colorClass)}>
                {formatCurrency(Math.abs(line.amount))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div>
      {/* Per-event grouping with sales + expenses inside */}
      {Object.entries(byEvent).map(([evName, data]) => {
        const evSalesTotal = data.sales.reduce((s, l) => s + Math.abs(l.amount), 0);
        const evExpTotal = data.expenses.reduce((s, l) => s + Math.abs(l.amount), 0);
        const evBalance = evSalesTotal - evExpTotal;
        const evLineCount = data.sales.length + data.expenses.length;
        const isOpen = expandedCategories.has(`${officeId}-ev-${evName}`);

        return (
          <div key={evName}>
            <div
              className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors border-b"
              onClick={() => toggleKey(`ev-${evName}`)}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium text-sm">{evName}</span>
                <Badge variant="secondary" className="text-[10px] ml-1">{evLineCount}</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span className="text-emerald-500">{formatCurrency(evSalesTotal)}</span>
                <span className="text-amber-500">{formatCurrency(evExpTotal)}</span>
                <span className={cn("font-semibold", evBalance >= 0 ? "text-emerald-500" : "text-red-400")}>{formatCurrency(evBalance)}</span>
              </div>
            </div>

            {isOpen && (
              <div>
                {subCategories.map((sc) => {
                  const scLines = sc.key === "sales" ? data.sales : data.expenses;
                  if (scLines.length === 0) return null;
                  const scTotal = scLines.reduce((s, l) => s + Math.abs(l.amount), 0);
                  const subKey = `ev-${evName}-${sc.key}`;
                  const isSubOpen = expandedCategories.has(`${officeId}-${subKey}`);

                  return (
                    <div key={sc.key}>
                      <div
                        className="flex items-center justify-between px-6 py-2 cursor-pointer hover:bg-muted/20 transition-colors border-b bg-muted/5"
                        onClick={() => toggleKey(subKey)}
                      >
                        <div className="flex items-center gap-2">
                          {isSubOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className={cn("", sc.color)}>{sc.icon}</span>
                          <span className={cn("text-sm", sc.color)}>{sc.label}</span>
                          <Badge variant="outline" className="text-[10px]">{scLines.length}</Badge>
                        </div>
                        <span className={cn("font-mono text-sm", sc.color)}>{formatCurrency(scTotal)}</span>
                      </div>
                      {isSubOpen && renderLineTable(scLines, sc.color)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Transfers: flat generic list */}
      {transferLines.length > 0 && (() => {
        const isOpen = expandedCategories.has(`${officeId}-transfers`);
        const total = transferLines.reduce((s, l) => s + Math.abs(l.amount), 0);
        return (
          <div>
            <div
              className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors border-b"
              onClick={() => toggleKey("transfers")}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm text-muted-foreground">Adiantamentos / Transferências</span>
                <Badge variant="secondary" className="text-[10px] ml-1">{transferLines.length}</Badge>
              </div>
              <span className="font-mono font-semibold text-sm text-muted-foreground">{formatCurrency(total)}</span>
            </div>
            {isOpen && renderLineTable(transferLines, "text-muted-foreground")}
          </div>
        );
      })()}
    </div>
  );
}

function AnalyticalByEvent({ officeId, lines, expandedCategories, toggleKey }: {
  officeId: string;
  lines: AnalyticalLine[];
  expandedCategories: Set<string>;
  toggleKey: (key: string) => void;
}) {
  const byEvent: Record<string, { lines: AnalyticalLine[]; sales: number; expenses: number; transfers: number }> = {};
  const noEventLines: AnalyticalLine[] = [];

  lines.forEach((l) => {
    if (l.type === "transfer") {
      noEventLines.push(l);
      return;
    }
    const evKey = l.eventName || "Sem evento";
    if (!byEvent[evKey]) byEvent[evKey] = { lines: [], sales: 0, expenses: 0, transfers: 0 };
    byEvent[evKey].lines.push(l);
    if (l.type === "sale" || l.type === "income") byEvent[evKey].sales += l.amount;
    else if (l.type === "expense") byEvent[evKey].expenses += Math.abs(l.amount);
  });

  const typeCategories = [
    { key: "sales", label: "Bilhetes Vendidos", types: ["sale", "income"], color: "text-emerald-500" },
    { key: "expenses", label: "Despesas e Custos", types: ["expense"], color: "text-amber-500" },
  ];

  return (
    <div>
      {Object.entries(byEvent).map(([evName, data]) => {
        const evBalance = data.sales - data.expenses;
        const isOpen = expandedCategories.has(`${officeId}-ev-${evName}`);

        return (
          <div key={evName}>
            <div
              className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors border-b"
              onClick={() => toggleKey(`ev-${evName}`)}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium text-sm">{evName}</span>
                <Badge variant="secondary" className="text-[10px] ml-1">{data.lines.length}</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span className="text-emerald-500">{formatCurrency(data.sales)}</span>
                <span className="text-amber-500">{formatCurrency(data.expenses)}</span>
                <span className={cn("font-semibold", evBalance >= 0 ? "text-emerald-500" : "text-red-400")}>{formatCurrency(evBalance)}</span>
              </div>
            </div>

            {isOpen && (
              <div>
                {typeCategories.map((tc) => {
                  const tcLines = data.lines.filter((l) => tc.types.includes(l.type));
                  if (tcLines.length === 0) return null;
                  const tcTotal = tcLines.reduce((s, l) => s + Math.abs(l.amount), 0);
                  const subKey = `ev-${evName}-${tc.key}`;
                  const isSubOpen = expandedCategories.has(`${officeId}-${subKey}`);

                  return (
                    <div key={tc.key}>
                      <div
                        className="flex items-center justify-between px-6 py-2 cursor-pointer hover:bg-muted/20 transition-colors border-b bg-muted/5"
                        onClick={() => toggleKey(subKey)}
                      >
                        <div className="flex items-center gap-2">
                          {isSubOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className={cn("text-sm", tc.color)}>{tc.label}</span>
                          <Badge variant="outline" className="text-[10px]">{tcLines.length}</Badge>
                        </div>
                        <span className={cn("font-mono text-sm", tc.color)}>{formatCurrency(tcTotal)}</span>
                      </div>
                      {isSubOpen && (
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/10">
                              <TableHead className="w-24 text-xs">Data</TableHead>
                              <TableHead className="text-xs">Descrição</TableHead>
                              <TableHead className="text-right w-28 text-xs">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tcLines.map((line, idx) => (
                              <TableRow key={idx} className="bg-muted/5">
                                <TableCell className="text-xs font-mono">
                                  {format(new Date(line.date + "T00:00:00"), "dd/MM/yyyy")}
                                </TableCell>
                                <TableCell className="text-sm max-w-[300px] truncate" title={line.description}>
                                  {line.description}
                                </TableCell>
                                <TableCell className={cn("text-right font-mono text-sm", tc.color)}>
                                  {formatCurrency(Math.abs(line.amount))}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {noEventLines.length > 0 && (() => {
        const isOpen = expandedCategories.has(`${officeId}-ev-no-event`);
        const total = noEventLines.reduce((s, l) => s + Math.abs(l.amount), 0);
        return (
          <div>
            <div
              className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors border-b"
              onClick={() => toggleKey("ev-no-event")}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium text-sm text-muted-foreground">Adiantamentos / Transferências (sem evento)</span>
                <Badge variant="secondary" className="text-[10px] ml-1">{noEventLines.length}</Badge>
              </div>
              <span className="font-mono font-semibold text-sm text-muted-foreground">{formatCurrency(total)}</span>
            </div>
            {isOpen && (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10">
                    <TableHead className="w-24 text-xs">Data</TableHead>
                    <TableHead className="text-xs">Descrição</TableHead>
                    <TableHead className="text-right w-28 text-xs">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {noEventLines.map((line, idx) => (
                    <TableRow key={idx} className="bg-muted/5">
                      <TableCell className="text-xs font-mono">
                        {format(new Date(line.date + "T00:00:00"), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate" title={line.description}>
                        {line.description}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {formatCurrency(Math.abs(line.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        );
      })()}
    </div>
  );
}
