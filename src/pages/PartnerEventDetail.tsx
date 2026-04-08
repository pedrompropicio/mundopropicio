import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, Ticket, Calendar, Layers, Route, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";

const eventTypeLabels: Record<string, string> = {
  simple: "Evento Simples",
  festival: "Festival",
  multi_day: "Múltiplos Dias / Turnê",
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  approved: "A Pagar",
  paid: "Pago",
  draft: "Rascunho",
};

export default function PartnerEventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [selectedSubEvent, setSelectedSubEvent] = useState<string | null>(null);

  const { data: accessList = [] } = useQuery({
    queryKey: ["partner_access", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_event_access")
        .select("event_id")
        .eq("user_id", user!.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []).map((a: any) => a.event_id);
    },
    enabled: !!user,
  });

  const { data: event, isLoading } = useQuery({
    queryKey: ["partner_event", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const eventType = event?.event_type || "simple";

  const { data: subEvents = [] } = useQuery({
    queryKey: ["partner_sub_events", id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("events").select("*") as any)
        .eq("parent_event_id", id!)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!id && eventType === "multi_day",
  });

  const authorizedSubEvents = subEvents.filter((s: any) => accessList.includes(s.id));
  const hasParentAccess = accessList.includes(id!);
  const visibleSubEvents = hasParentAccess ? subEvents : authorizedSubEvents;

  const activeEventId = selectedSubEvent || (eventType === "multi_day" && !hasParentAccess && visibleSubEvents.length > 0 ? visibleSubEvents[0]?.id : id!);

  // Ticketing data with lots
  const { data: ticketZones = [] } = useQuery({
    queryKey: ["partner_ticket_zones", activeEventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("*, event_ticket_lots(*)").eq("event_id", activeEventId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!activeEventId && (activeEventId !== id || eventType !== "multi_day" || hasParentAccess),
  });

  // Ticket sales (real sales)
  const zoneIds = ticketZones.map((z: any) => z.id);
  const { data: ticketSales = [] } = useQuery({
    queryKey: ["partner_ticket_sales", zoneIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("zone_id, quantity, unit_price, lot_id, ticket_office_id")
        .in("zone_id", zoneIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: zoneIds.length > 0,
  });

  // Forecast data (BP)
  const { data: forecasts = [] } = useQuery({
    queryKey: ["partner_forecasts", activeEventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_forecasts").select("*, account_categories(code, name)").eq("event_id", activeEventId).order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!activeEventId,
  });

  // Transactions
  const { data: transactions = [] } = useQuery({
    queryKey: ["partner_transactions", activeEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, account_categories(code, name)")
        .eq("event_id", activeEventId)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!activeEventId,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return <div className="p-8 text-center text-muted-foreground">Evento não encontrado.</div>;
  }

  const hasAccess = hasParentAccess || visibleSubEvents.length > 0;
  if (!hasAccess) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-muted-foreground">Não tem autorização para ver este evento.</p>
        <Link to="/parceiro" className="text-sm text-primary hover:underline">Voltar ao portal</Link>
      </div>
    );
  }

  const EventTypeIcon = eventType === "festival" ? Layers : eventType === "multi_day" ? Route : Calendar;

  // ─── Ticket calculations ───
  // Build sales map per zone
  const salesByZone: Record<string, { qty: number; revenue: number }> = {};
  ticketSales.forEach((s: any) => {
    if (!salesByZone[s.zone_id]) salesByZone[s.zone_id] = { qty: 0, revenue: 0 };
    salesByZone[s.zone_id].qty += s.quantity;
    salesByZone[s.zone_id].revenue += s.quantity * Number(s.unit_price);
  });

  const totalCapacity = ticketZones.reduce((s: number, z: any) => s + (z.total_capacity || 0), 0);
  const totalLotQty = ticketZones.reduce((s: number, z: any) => s + (z.event_ticket_lots || []).reduce((ls: number, l: any) => ls + l.quantity, 0), 0);
  const totalLotRevenue = ticketZones.reduce((s: number, z: any) => s + (z.event_ticket_lots || []).reduce((ls: number, l: any) => ls + l.quantity * Number(l.price), 0), 0);
  const totalSoldQty = Object.values(salesByZone).reduce((s, v) => s + v.qty, 0);
  const totalSoldRevenue = Object.values(salesByZone).reduce((s, v) => s + v.revenue, 0);
  const occupancyPct = totalCapacity > 0 ? Math.round((totalSoldQty / totalCapacity) * 100) : 0;

  // ─── Forecast calculations ───
  const forecastIncome = forecasts.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
  const forecastExpense = forecasts.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);
  const forecastResult = forecastIncome - forecastExpense;

  // ─── Transaction calculations ───
  const transactionIncome = transactions.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const transactionExpense = transactions.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const transactionResult = transactionIncome - transactionExpense;
  const paidExpenses = transactions.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.paid_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/parceiro" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Voltar ao portal
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
          <EventStatusBadge status={event.status} />
          <Badge variant="outline" className="gap-1 text-[10px]">
            <EventTypeIcon className="h-3 w-3" />
            {eventTypeLabels[eventType]}
          </Badge>
        </div>
        {event.location && <p className="text-sm text-muted-foreground mt-1">{event.location} · {formatDate(event.date)}</p>}
      </div>

      {/* Sub-event selector for multi-day */}
      {eventType === "multi_day" && visibleSubEvents.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cidades / Datas</p>
            <div className="flex flex-wrap gap-2">
              {hasParentAccess && (
                <button
                  onClick={() => setSelectedSubEvent(null)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    !selectedSubEvent ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Visão Geral
                </button>
              )}
              {visibleSubEvents.map((sub: any) => (
                <button
                  key={sub.id}
                  onClick={() => setSelectedSubEvent(sub.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    selectedSubEvent === sub.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {sub.name} ({formatDate(sub.date)})
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="ticketing" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ticketing" className="gap-1.5"><Ticket className="h-3.5 w-3.5" /> Bilhetes</TabsTrigger>
          <TabsTrigger value="forecast" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Business Plan</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5"><TrendingDown className="h-3.5 w-3.5" /> Transações</TabsTrigger>
        </TabsList>

        {/* ═══════ BILHETES ═══════ */}
        <TabsContent value="ticketing">
          {eventType === "multi_day" && !selectedSubEvent && hasParentAccess ? (
            <Card className="p-8 text-center">
              <Ticket className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Selecione uma data acima para ver a bilheteira.</p>
            </Card>
          ) : ticketZones.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Sem bilheteira configurada para este evento.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Capacidade</p>
                    <p className="text-2xl font-bold font-mono">{totalCapacity.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Vendidos</p>
                    <p className="text-2xl font-bold font-mono text-emerald-500">{totalSoldQty.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Receita Real</p>
                    <p className="text-xl font-bold font-mono text-emerald-500">{formatCurrency(totalSoldRevenue)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ocupação</p>
                    <p className="text-2xl font-bold font-mono">{occupancyPct}%</p>
                    <Progress value={occupancyPct} className="h-1.5 mt-2" />
                  </CardContent>
                </Card>
              </div>

              {/* Per-zone detail */}
              {ticketZones.map((zone: any) => {
                const lots = zone.event_ticket_lots || [];
                const zoneSales = salesByZone[zone.id] || { qty: 0, revenue: 0 };
                const zoneCapacity = zone.total_capacity || 0;
                const zonePlannedRevenue = lots.reduce((s: number, l: any) => s + l.quantity * Number(l.price), 0);
                const zonePlannedQty = lots.reduce((s: number, l: any) => s + l.quantity, 0);
                const zoneOccupancy = zoneCapacity > 0 ? Math.round((zoneSales.qty / zoneCapacity) * 100) : 0;

                return (
                  <Card key={zone.id}>
                    <CardHeader className="pb-2 px-4 pt-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{zone.name}</CardTitle>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{zoneCapacity} lugares</span>
                          <Badge variant={zoneOccupancy >= 80 ? "default" : "secondary"} className="text-[10px]">{zoneOccupancy}% ocupação</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {/* Planning: lots */}
                      {lots.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Planeamento (Lotes)</p>
                          <Table>
                            <TableHeader>
                              <TableRow className="text-[10px]">
                                <TableHead className="h-8 px-2">Lote</TableHead>
                                <TableHead className="h-8 px-2 text-right">Qtd</TableHead>
                                <TableHead className="h-8 px-2 text-right">Preço</TableHead>
                                <TableHead className="h-8 px-2 text-right">IVA</TableHead>
                                <TableHead className="h-8 px-2 text-right">Subtotal</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lots.map((lot: any) => (
                                <TableRow key={lot.id}>
                                  <TableCell className="py-1.5 px-2 text-xs">{lot.name}</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs">{lot.quantity}</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs">{formatCurrency(Number(lot.price))}</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs">{lot.iva_rate}%</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs font-semibold">{formatCurrency(Number(lot.price) * lot.quantity)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow className="text-xs bg-muted/30">
                                <TableCell className="py-1.5 px-2 font-semibold">Total Planeado</TableCell>
                                <TableCell className="py-1.5 px-2 text-right font-mono font-semibold">{zonePlannedQty}</TableCell>
                                <TableCell className="py-1.5 px-2" colSpan={2} />
                                <TableCell className="py-1.5 px-2 text-right font-mono font-semibold">{formatCurrency(zonePlannedRevenue)}</TableCell>
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </div>
                      )}

                      {/* Real sales */}
                      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold mb-1">Vendas Reais</p>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Bilhetes Vendidos</p>
                            <p className="text-lg font-bold font-mono text-emerald-500">{zoneSales.qty.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Receita</p>
                            <p className="text-lg font-bold font-mono text-emerald-500">{formatCurrency(zoneSales.revenue)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">vs. Planeado</p>
                            <p className={`text-lg font-bold font-mono ${zoneSales.revenue >= zonePlannedRevenue ? "text-emerald-500" : "text-amber-500"}`}>
                              {zonePlannedRevenue > 0 ? `${Math.round((zoneSales.revenue / zonePlannedRevenue) * 100)}%` : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Grand total */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Planeado</p>
                      <p className="text-sm font-mono">{totalLotQty.toLocaleString()} bilhetes</p>
                      <p className="text-base font-bold font-mono">{formatCurrency(totalLotRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Vendido</p>
                      <p className="text-sm font-mono">{totalSoldQty.toLocaleString()} bilhetes</p>
                      <p className="text-base font-bold font-mono text-emerald-500">{formatCurrency(totalSoldRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Diferença</p>
                      <p className={`text-base font-bold font-mono ${totalSoldRevenue - totalLotRevenue >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {formatCurrency(totalSoldRevenue - totalLotRevenue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Execução</p>
                      <p className="text-base font-bold font-mono">
                        {totalLotRevenue > 0 ? `${Math.round((totalSoldRevenue / totalLotRevenue) * 100)}%` : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══════ BUSINESS PLAN ═══════ */}
        <TabsContent value="forecast">
          {forecasts.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Sem previsões registadas.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 grid-cols-3">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" /> Receitas</p>
                    <p className="text-xl font-bold font-mono text-emerald-500">{formatCurrency(forecastIncome)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-center gap-1"><TrendingDown className="h-3 w-3" /> Despesas</p>
                    <p className="text-xl font-bold font-mono text-amber-500">{formatCurrency(forecastExpense)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Resultado</p>
                    <p className={`text-xl font-bold font-mono ${forecastResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {formatCurrency(forecastResult)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Income table */}
              {forecasts.some((f: any) => f.type === "income") && (
                <Card>
                  <CardHeader className="pb-0 px-4 pt-4">
                    <CardTitle className="text-sm text-emerald-500 flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> Receitas Previstas</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[10px]">
                          <TableHead className="h-8 px-4">Descrição</TableHead>
                          <TableHead className="h-8 px-4 hidden sm:table-cell">Categoria</TableHead>
                          <TableHead className="h-8 px-4 text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {forecasts.filter((f: any) => f.type === "income").map((f: any) => (
                          <TableRow key={f.id}>
                            <TableCell className="px-4 py-2 text-xs">{f.description}</TableCell>
                            <TableCell className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                              {f.account_categories ? `${f.account_categories.code} - ${f.account_categories.name}` : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-2 text-right font-mono text-xs font-semibold text-emerald-500">{formatCurrency(Number(f.amount))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell className="px-4 font-semibold text-xs" colSpan={2}>Total Receitas</TableCell>
                          <TableCell className="px-4 text-right font-mono font-bold text-xs text-emerald-500">{formatCurrency(forecastIncome)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Expense table */}
              {forecasts.some((f: any) => f.type === "expense") && (
                <Card>
                  <CardHeader className="pb-0 px-4 pt-4">
                    <CardTitle className="text-sm text-amber-500 flex items-center gap-1.5"><TrendingDown className="h-4 w-4" /> Despesas Previstas</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[10px]">
                          <TableHead className="h-8 px-4">Descrição</TableHead>
                          <TableHead className="h-8 px-4 hidden sm:table-cell">Categoria</TableHead>
                          <TableHead className="h-8 px-4 text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {forecasts.filter((f: any) => f.type === "expense").map((f: any) => (
                          <TableRow key={f.id}>
                            <TableCell className="px-4 py-2 text-xs">{f.description}</TableCell>
                            <TableCell className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                              {f.account_categories ? `${f.account_categories.code} - ${f.account_categories.name}` : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-2 text-right font-mono text-xs font-semibold text-amber-500">{formatCurrency(Number(f.amount))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell className="px-4 font-semibold text-xs" colSpan={2}>Total Despesas</TableCell>
                          <TableCell className="px-4 text-right font-mono font-bold text-xs text-amber-500">{formatCurrency(forecastExpense)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══════ TRANSAÇÕES ═══════ */}
        <TabsContent value="transactions">
          {transactions.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Sem transações registadas.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Receitas</p>
                    <p className="text-xl font-bold font-mono text-emerald-500">{formatCurrency(transactionIncome)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Despesas</p>
                    <p className="text-xl font-bold font-mono text-amber-500">{formatCurrency(transactionExpense)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pago</p>
                    <p className="text-xl font-bold font-mono">{formatCurrency(paidExpenses)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Resultado</p>
                    <p className={`text-xl font-bold font-mono ${transactionResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {formatCurrency(transactionResult)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="px-0 pb-0 pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-[10px]">
                        <TableHead className="h-8 px-4">Data</TableHead>
                        <TableHead className="h-8 px-4">Descrição</TableHead>
                        <TableHead className="h-8 px-4 hidden sm:table-cell">Categoria</TableHead>
                        <TableHead className="h-8 px-4 text-center">Estado</TableHead>
                        <TableHead className="h-8 px-4 text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t: any) => (
                        <TableRow key={t.id}>
                          <TableCell className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</TableCell>
                          <TableCell className="px-4 py-2 text-xs font-medium">{t.description}</TableCell>
                          <TableCell className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                            {t.account_categories ? `${t.account_categories.code} - ${t.account_categories.name}` : "—"}
                          </TableCell>
                          <TableCell className="px-4 py-2 text-center">
                            <Badge variant={t.status === "paid" ? "default" : "secondary"} className="text-[10px]">
                              {statusLabels[t.status] || t.status}
                            </Badge>
                          </TableCell>
                          <TableCell className={`px-4 py-2 text-right font-mono text-xs font-semibold ${t.type === "income" ? "text-emerald-500" : "text-amber-500"}`}>
                            {t.type === "income" ? "+" : "-"}{formatCurrency(Number(t.amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="px-4 font-semibold text-xs" colSpan={4}>Total</TableCell>
                        <TableCell className={`px-4 text-right font-mono font-bold text-xs ${transactionResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                          {formatCurrency(transactionResult)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
