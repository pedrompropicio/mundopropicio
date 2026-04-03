import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EventBreakdown {
  eventId: string;
  eventName: string;
  eventStatus: string;
  isConciliated: boolean;
  totalSales: number;
  totalExpenses: number;
  balance: number;
}

interface OfficeAudit {
  officeId: string;
  officeName: string;
  financialAccountId: string | null;
  totalSales: number;
  totalDirectExpenses: number;
  totalTransfers: number;
  expectedBalance: number;
  events: EventBreakdown[];
}

export default function ReportTicketOfficeAudit() {
  const [selectedOffice, setSelectedOffice] = useState<string>("all");
  const [expandedOffices, setExpandedOffices] = useState<Set<string>>(new Set());

  // Fetch ticket offices
  const { data: offices = [], isLoading: loadingOffices } = useQuery({
    queryKey: ["report_ticket_offices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_offices")
        .select("id, name, financial_account_id, is_active")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all assignments
  const { data: assignments = [] } = useQuery({
    queryKey: ["report_to_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("ticket_office_id, event_id, is_conciliated, events(id, name, status)");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all ticket zones and sales
  const { data: allZones = [] } = useQuery({
    queryKey: ["report_to_zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id");
      if (error) throw error;
      return data;
    },
  });

  const zoneIds = allZones.map((z: any) => z.id);
  const { data: allSales = [] } = useQuery({
    queryKey: ["report_to_sales", zoneIds.length],
    enabled: zoneIds.length > 0,
    queryFn: async () => {
      // Fetch in batches if needed
      const batchSize = 500;
      let allData: any[] = [];
      for (let i = 0; i < zoneIds.length; i += batchSize) {
        const batch = zoneIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("ticket_sales")
          .select("zone_id, quantity, unit_price, ticket_office_id")
          .in("zone_id", batch);
        if (error) throw error;
        allData = allData.concat(data || []);
      }
      return allData;
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
        .select("account_id, type, amount, paid_amount, event_id, description, status, date, supplier_id, suppliers(name)")
        .in("account_id", accountIds)
        .in("status", ["approved", "paid"]);
      if (error) throw error;
      return data;
    },
  });

  // Build zone-to-event map
  const zoneEventMap = useMemo(() => {
    const map: Record<string, string> = {};
    allZones.forEach((z: any) => {
      map[z.id] = z.event_id;
    });
    return map;
  }, [allZones]);

  // Build office-to-account map
  const officeAccountMap = useMemo(() => {
    const map: Record<string, string> = {};
    offices.forEach((o: any) => {
      if (o.financial_account_id) map[o.id] = o.financial_account_id;
    });
    return map;
  }, [offices]);

  // Build complete audit data
  const auditData: OfficeAudit[] = useMemo(() => {
    return offices.map((office: any) => {
      const officeAssignments = assignments.filter(
        (a: any) => a.ticket_office_id === office.id
      );
      const accountId = office.financial_account_id;

      // Build event breakdown
      const events: EventBreakdown[] = officeAssignments.map((a: any) => {
        const ev = a.events;
        if (!ev) return null;

        // Sales for this event from this office
        const eventZoneIds = allZones
          .filter((z: any) => z.event_id === a.event_id)
          .map((z: any) => z.id);

        const officeSales = allSales
          .filter(
            (s: any) =>
              eventZoneIds.includes(s.zone_id) &&
              (!s.ticket_office_id || s.ticket_office_id === office.id)
          )
          .reduce((sum: number, s: any) => sum + s.quantity * Number(s.unit_price), 0);

        // Direct expenses for this event from the office account
        const eventExpenses = accountId
          ? accountTxns
              .filter(
                (t: any) =>
                  t.account_id === accountId &&
                  t.type === "expense" &&
                  t.event_id === a.event_id
              )
              .reduce((sum: number, t: any) => sum + Number(t.paid_amount || t.amount), 0)
          : 0;

        return {
          eventId: a.event_id,
          eventName: ev.name,
          eventStatus: ev.status,
          isConciliated: a.is_conciliated,
          totalSales: officeSales,
          totalExpenses: eventExpenses,
          balance: officeSales - eventExpenses,
        } as EventBreakdown;
      }).filter(Boolean) as EventBreakdown[];

      // Transfers out (expenses without event_id on the office account)
      const transfers = accountId
        ? accountTxns
            .filter(
              (t: any) =>
                t.account_id === accountId &&
                t.type === "expense" &&
                !t.event_id
            )
            .reduce((sum: number, t: any) => sum + Number(t.paid_amount || t.amount), 0)
        : 0;

      // Income on account (transfers in)
      const incomeOnAccount = accountId
        ? accountTxns
            .filter(
              (t: any) => t.account_id === accountId && t.type === "income"
            )
            .reduce((sum: number, t: any) => sum + Number(t.paid_amount || t.amount), 0)
        : 0;

      const totalSales = events.reduce((s, e) => s + e.totalSales, 0);
      const totalDirectExpenses = events.reduce((s, e) => s + e.totalExpenses, 0);

      return {
        officeId: office.id,
        officeName: office.name,
        financialAccountId: accountId,
        totalSales,
        totalDirectExpenses,
        totalTransfers: transfers,
        expectedBalance: totalSales - totalDirectExpenses - transfers + incomeOnAccount,
        events,
      };
    });
  }, [offices, assignments, allZones, allSales, accountTxns]);

  const filteredData = selectedOffice === "all"
    ? auditData
    : auditData.filter((d) => d.officeId === selectedOffice);

  const toggleExpand = (id: string) => {
    setExpandedOffices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Grand totals
  const grandTotals = useMemo(() => {
    return filteredData.reduce(
      (acc, d) => ({
        sales: acc.sales + d.totalSales,
        expenses: acc.expenses + d.totalDirectExpenses,
        transfers: acc.transfers + d.totalTransfers,
        balance: acc.balance + d.expectedBalance,
      }),
      { sales: 0, expenses: 0, transfers: 0, balance: 0 }
    );
  }, [filteredData]);

  if (loadingOffices) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {/* Office-level table */}
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
                <TableHead className="text-right">Saldo Previsto</TableHead>
                <TableHead className="text-center">Eventos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhuma bilheteira encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((office) => {
                  const isExpanded = expandedOffices.has(office.officeId);
                  return (
                    <>
                      <TableRow
                        key={office.officeId}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(office.officeId)}
                      >
                        <TableCell className="w-8 px-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-muted-foreground" />
                            {office.officeName}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-emerald-500">
                          {formatCurrency(office.totalSales)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-amber-500">
                          {formatCurrency(office.totalDirectExpenses)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(office.totalTransfers)}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-mono font-semibold",
                          office.expectedBalance >= 0 ? "text-emerald-500" : "text-red-400"
                        )}>
                          {formatCurrency(office.expectedBalance)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{office.events.length}</Badge>
                        </TableCell>
                      </TableRow>

                      {isExpanded && office.events.length > 0 && (
                        <>
                          <TableRow className="bg-muted/20">
                            <TableCell></TableCell>
                            <TableCell className="text-xs font-semibold text-muted-foreground">Evento</TableCell>
                            <TableCell className="text-xs font-semibold text-muted-foreground text-right">Vendas</TableCell>
                            <TableCell className="text-xs font-semibold text-muted-foreground text-right">Despesas</TableCell>
                            <TableCell className="text-xs font-semibold text-muted-foreground text-right">Saldo</TableCell>
                            <TableCell className="text-xs font-semibold text-muted-foreground text-center">Estado</TableCell>
                            <TableCell className="text-xs font-semibold text-muted-foreground text-center">Conciliado</TableCell>
                          </TableRow>
                          {office.events.map((ev) => (
                            <TableRow key={`${office.officeId}-${ev.eventId}`} className="bg-muted/10">
                              <TableCell></TableCell>
                              <TableCell className="text-sm pl-6">{ev.eventName}</TableCell>
                              <TableCell className="text-right font-mono text-sm text-emerald-500">
                                {formatCurrency(ev.totalSales)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-amber-500">
                                {formatCurrency(ev.totalExpenses)}
                              </TableCell>
                              <TableCell className={cn(
                                "text-right font-mono text-sm font-medium",
                                ev.balance >= 0 ? "text-emerald-500" : "text-red-400"
                              )}>
                                {formatCurrency(ev.balance)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={ev.eventStatus === "completed" ? "default" : "secondary"} className="text-[10px]">
                                  {ev.eventStatus === "completed" ? "Finalizado" : ev.eventStatus === "confirmed" ? "Confirmado" : ev.eventStatus === "cancelled" ? "Cancelado" : "Planeamento"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {ev.isConciliated ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Subtotal row for transfers */}
                          {office.totalTransfers > 0 && (
                            <TableRow className="bg-muted/10 border-t">
                              <TableCell></TableCell>
                              <TableCell className="text-sm pl-6 text-muted-foreground italic">
                                Transferências para contas bancárias
                              </TableCell>
                              <TableCell></TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(office.totalTransfers)}
                              </TableCell>
                              <TableCell colSpan={3}></TableCell>
                            </TableRow>
                          )}
                        </>
                      )}
                    </>
                  );
                })
              )}

              {/* Grand total row */}
              {filteredData.length > 1 && (
                <TableRow className="border-t-2 font-semibold bg-muted/30">
                  <TableCell></TableCell>
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right font-mono text-emerald-500">
                    {formatCurrency(grandTotals.sales)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-amber-500">
                    {formatCurrency(grandTotals.expenses)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(grandTotals.transfers)}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-mono",
                    grandTotals.balance >= 0 ? "text-emerald-500" : "text-red-400"
                  )}>
                    {formatCurrency(grandTotals.balance)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">
                      {filteredData.reduce((s, d) => s + d.events.length, 0)}
                    </Badge>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
