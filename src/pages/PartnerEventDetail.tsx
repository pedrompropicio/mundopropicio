import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, Ticket, Calendar, Layers, Route, TrendingUp, TrendingDown, BarChart3, FileText, Paperclip } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";
import { buildCategoryLookup, type CategoryNode } from "@/lib/category-hierarchy";
import { compareHierarchicalCodes } from "@/lib/utils";

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

  // ── Batch 1: parallel independent queries ──
  const { data: accessList = [], isLoading: isLoadingAccess } = useQuery({
    queryKey: ["partner_access_ids", user?.id],
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

  const { data: allCategories = [] } = useQuery({
    queryKey: ["all_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("id, code, name, parent_id");
      if (error) throw error;
      return data as CategoryNode[];
    },
    staleTime: 5 * 60_000, // categories rarely change
  });

  // Fetch event + sub-events in one query to eliminate waterfall
  const { data: eventBundle, isLoading } = useQuery({
    queryKey: ["partner_event_bundle", id],
    queryFn: async () => {
      const [eventRes, subRes] = await Promise.all([
        supabase.from("events").select("*").eq("id", id!).single(),
        supabase.from("events").select("*").eq("parent_event_id", id!).order("date", { ascending: true }),
      ]);
      if (eventRes.error) throw eventRes.error;
      return { event: eventRes.data as any, subEvents: (subRes.data ?? []) as any[] };
    },
    enabled: !!id,
  });

  const event = eventBundle?.event;
  const eventType = event?.event_type || "simple";
  const subEvents = eventType === "multi_day" ? (eventBundle?.subEvents ?? []) : [];

  const authorizedSubEvents = subEvents.filter((s: any) => accessList.includes(s.id));
  const hasParentAccess = accessList.includes(id!);
  const visibleSubEvents = hasParentAccess ? subEvents : authorizedSubEvents;

  const activeEventId = selectedSubEvent || (eventType === "multi_day" && !hasParentAccess && visibleSubEvents.length > 0 ? visibleSubEvents[0]?.id : id!);

  // ── Batch 2: all event-specific data in parallel ──
  const shouldFetchEventData = !!activeEventId && (activeEventId !== id || eventType !== "multi_day" || hasParentAccess);

  const { data: eventData } = useQuery({
    queryKey: ["partner_event_data", activeEventId],
    queryFn: async () => {
      const [zonesRes, forecastsRes, txRes] = await Promise.all([
        supabase.from("event_ticket_zones").select("*, event_ticket_lots(*)").eq("event_id", activeEventId),
        supabase.from("event_forecasts").select("*, account_categories(id, code, name, parent_id)").eq("event_id", activeEventId).order("created_at"),
        supabase.from("transactions").select("*, account_categories(id, code, name, parent_id)").eq("event_id", activeEventId).order("date", { ascending: false }),
      ]);
      if (zonesRes.error) throw zonesRes.error;
      if (forecastsRes.error) throw forecastsRes.error;
      if (txRes.error) throw txRes.error;

      const zones = (zonesRes.data ?? []) as any[];
      const txs = (txRes.data ?? []) as any[];

      // Fetch dependent data in parallel
      const zoneIds = zones.map((z: any) => z.id);
      const txIds = txs.map((t: any) => t.id);

      const [salesRes, docsRes] = await Promise.all([
        zoneIds.length > 0
          ? supabase.from("ticket_sales").select("zone_id, quantity, unit_price, lot_id, ticket_office_id").in("zone_id", zoneIds)
          : Promise.resolve({ data: [], error: null }),
        txIds.length > 0
          ? supabase.from("transaction_documents").select("id, transaction_id, name, file_url, doc_type").in("transaction_id", txIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      return {
        ticketZones: zones,
        ticketSales: (salesRes.data ?? []) as any[],
        forecasts: (forecastsRes.data ?? []) as any[],
        transactions: txs,
        transactionDocs: (docsRes.data ?? []) as any[],
      };
    },
    enabled: shouldFetchEventData,
  });

  const ticketZones = eventData?.ticketZones ?? [];
  const ticketSales = eventData?.ticketSales ?? [];
  const forecasts = eventData?.forecasts ?? [];
  const transactions = eventData?.transactions ?? [];
  const transactionDocs = eventData?.transactionDocs ?? [];

  // Group docs by transaction
  const docsByTx = useMemo(() => {
    const map: Record<string, any[]> = {};
    transactionDocs.forEach((d: any) => {
      if (!map[d.transaction_id]) map[d.transaction_id] = [];
      map[d.transaction_id].push(d);
    });
    return map;
  }, [transactionDocs]);

  // Category lookup
  const catLookup = useMemo(() => buildCategoryLookup(allCategories), [allCategories]);

  // Build hierarchical BP groups
  const bpGroups = useMemo(() => {
    const byId: Record<string, CategoryNode> = {};
    allCategories.forEach((c) => { byId[c.id] = c; });

    const getParentChain = (catId: string | null): { l1: CategoryNode | null; l2: CategoryNode | null } => {
      if (!catId || !byId[catId]) return { l1: null, l2: null };
      const cat = byId[catId];
      const pid = cat.parent_id ?? null;
      if (!pid) return { l1: cat, l2: null }; // this IS L1
      const parent = byId[pid];
      if (!parent) return { l1: null, l2: cat };
      const gpid = parent.parent_id ?? null;
      if (!gpid) return { l1: parent, l2: cat }; // cat is L2
      const gp = byId[gpid];
      return { l1: gp || null, l2: parent }; // cat is L3
    };

    type BPItem = { id: string; description: string; amount: number; catCode: string; catName: string };
    type L2Group = { code: string; name: string; items: BPItem[]; total: number };
    type L1Group = { code: string; name: string; l2Groups: L2Group[]; total: number };

    const buildForType = (type: "income" | "expense"): L1Group[] => {
      const items = forecasts.filter((f: any) => f.type === type);
      const l1Map: Record<string, L1Group> = {};

      items.forEach((f: any) => {
        const catId = f.category_id;
        const cat = catId ? byId[catId] : null;
        const chain = getParentChain(catId);
        const l1Name = chain.l1?.name ?? "Sem Grupo";
        const l1Code = chain.l1?.code ?? "Z";
        const l2Name = chain.l2?.name ?? cat?.name ?? "Geral";
        const l2Code = chain.l2?.code ?? cat?.code ?? "Z.Z";
        const catCode = cat?.code ?? "";
        const catName = cat?.name ?? f.description;

        if (!l1Map[l1Name]) l1Map[l1Name] = { code: l1Code, name: l1Name, l2Groups: [], total: 0 };
        let l2 = l1Map[l1Name].l2Groups.find((g) => g.name === l2Name);
        if (!l2) {
          l2 = { code: l2Code, name: l2Name, items: [], total: 0 };
          l1Map[l1Name].l2Groups.push(l2);
        }
        const amt = Number(f.amount);
        l2.items.push({ id: f.id, description: f.description, amount: amt, catCode, catName });
        l2.total += amt;
        l1Map[l1Name].total += amt;
      });

      return Object.values(l1Map)
        .map((g) => ({
          ...g,
          l2Groups: g.l2Groups.sort((a, b) => compareHierarchicalCodes(a.code, b.code)),
        }))
        .sort((a, b) => compareHierarchicalCodes(a.code, b.code));
    };

    return { income: buildForType("income"), expense: buildForType("expense") };
  }, [forecasts, allCategories]);

  // ─── Transaction hierarchy groups ───
  const txGrouped = useMemo(() => {
    type TxItem = { id: string; date: string; description: string; amount: number; status: string; type: string; docs: any[] };
    type TxGroup = { code: string; name: string; items: TxItem[]; total: number };

    const buildForType = (type: "income" | "expense"): TxGroup[] => {
      const items = transactions.filter((t: any) => t.type === type);
      const groupMap: Record<string, TxGroup> = {};
      items.forEach((t: any) => {
        const info = catLookup[t.category_id];
        const groupName = info?.groupName ?? "Sem categoria";
        const groupCode = info?.groupCode ?? "Z";
        if (!groupMap[groupName]) groupMap[groupName] = { code: groupCode, name: groupName, items: [], total: 0 };
        const amt = Number(t.amount);
        groupMap[groupName].items.push({
          id: t.id, date: t.date, description: t.description, amount: amt, status: t.status, type: t.type,
          docs: docsByTx[t.id] || [],
        });
        groupMap[groupName].total += amt;
      });
      return Object.values(groupMap).sort((a, b) => compareHierarchicalCodes(a.code, b.code));
    };

    return { income: buildForType("income"), expense: buildForType("expense") };
  }, [transactions, catLookup, docsByTx]);

  if (isLoading || isLoadingAccess) {
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

  // ─── Hierarchical BP section renderer ───
  const renderBPSection = (
    groups: typeof bpGroups.income,
    type: "income" | "expense",
    icon: React.ReactNode,
    title: string,
    colorClass: string,
    total: number,
  ) => {
    if (groups.length === 0) return null;
    return (
      <Card>
        <CardHeader className="pb-0 px-4 pt-4">
          <CardTitle className={`text-sm ${colorClass} flex items-center gap-1.5`}>{icon} {title}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {groups.map((l1) => (
            <div key={l1.name} className="mb-2">
              <div className="bg-muted/40 px-4 py-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">{l1.code} - {l1.name}</span>
                <span className={`text-[11px] font-bold font-mono ${colorClass}`}>{formatCurrency(l1.total)}</span>
              </div>
              {l1.l2Groups.map((l2) => (
                <div key={l2.name}>
                  <div className="bg-muted/20 px-4 py-1 flex items-center justify-between border-b border-border/50">
                    <span className="text-[10px] font-semibold text-muted-foreground">{l2.code} - {l2.name}</span>
                    <span className={`text-[10px] font-semibold font-mono ${colorClass}`}>{formatCurrency(l2.total)}</span>
                  </div>
                  {l2.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-1.5 border-b border-border/30">
                      <div className="min-w-0 flex-1 mr-2">
                        <span className="text-xs text-foreground block truncate">{item.description}</span>
                        {item.catCode && <span className="text-[10px] text-muted-foreground">{item.catCode} - {item.catName}</span>}
                      </div>
                      <span className={`text-xs font-mono font-semibold whitespace-nowrap ${colorClass}`}>{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-t">
            <span className="text-xs font-bold">Total {title}</span>
            <span className={`text-sm font-bold font-mono ${colorClass}`}>{formatCurrency(total)}</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/parceiro" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Voltar ao portal
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{event.name}</h1>
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
        <TabsList className="w-full">
          <TabsTrigger value="ticketing" className="gap-1.5 flex-1"><Ticket className="h-3.5 w-3.5" /> Bilhetes</TabsTrigger>
          <TabsTrigger value="forecast" className="gap-1.5 flex-1"><BarChart3 className="h-3.5 w-3.5" /> Business Plan</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5 flex-1"><TrendingDown className="h-3.5 w-3.5" /> Transações</TabsTrigger>
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
              {/* Summary cards - responsive text */}
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Capacidade</p>
                    <p className="text-lg sm:text-2xl font-bold font-mono">{totalCapacity.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Vendidos</p>
                    <p className="text-lg sm:text-2xl font-bold font-mono text-emerald-500">{totalSoldQty.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Receita Real</p>
                    <p className="text-sm sm:text-xl font-bold font-mono text-emerald-500">{formatCurrency(totalSoldRevenue)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ocupação</p>
                    <p className="text-lg sm:text-2xl font-bold font-mono">{occupancyPct}%</p>
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
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-sm font-semibold">{zone.name}</CardTitle>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{zoneCapacity} lug.</span>
                          <Badge variant={zoneOccupancy >= 80 ? "default" : "secondary"} className="text-[10px]">{zoneOccupancy}%</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {lots.length > 0 && (
                        <div className="mb-3 overflow-x-auto">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Planeamento (Lotes)</p>
                          <Table>
                            <TableHeader>
                              <TableRow className="text-[10px]">
                                <TableHead className="h-8 px-2">Lote</TableHead>
                                <TableHead className="h-8 px-2 text-right">Qtd</TableHead>
                                <TableHead className="h-8 px-2 text-right">Preço</TableHead>
                                <TableHead className="h-8 px-2 text-right hidden sm:table-cell">IVA</TableHead>
                                <TableHead className="h-8 px-2 text-right">Subtotal</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lots.map((lot: any) => (
                                <TableRow key={lot.id}>
                                  <TableCell className="py-1.5 px-2 text-xs">{lot.name}</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs">{lot.quantity}</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs">{formatCurrency(Number(lot.price))}</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs hidden sm:table-cell">{lot.iva_rate}%</TableCell>
                                  <TableCell className="py-1.5 px-2 text-right font-mono text-xs font-semibold">{formatCurrency(Number(lot.price) * lot.quantity)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow className="text-xs bg-muted/30">
                                <TableCell className="py-1.5 px-2 font-semibold">Total</TableCell>
                                <TableCell className="py-1.5 px-2 text-right font-mono font-semibold">{zonePlannedQty}</TableCell>
                                <TableCell className="py-1.5 px-2" />
                                <TableCell className="py-1.5 px-2 hidden sm:table-cell" />
                                <TableCell className="py-1.5 px-2 text-right font-mono font-semibold">{formatCurrency(zonePlannedRevenue)}</TableCell>
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </div>
                      )}

                      {/* Real sales */}
                      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold mb-1">Vendas Reais</p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground">Vendidos</p>
                            <p className="text-sm sm:text-lg font-bold font-mono text-emerald-500">{zoneSales.qty.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">Receita</p>
                            <p className="text-sm sm:text-lg font-bold font-mono text-emerald-500">{formatCurrency(zoneSales.revenue)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">vs. Plan</p>
                            <p className={`text-sm sm:text-lg font-bold font-mono ${zoneSales.revenue >= zonePlannedRevenue ? "text-emerald-500" : "text-amber-500"}`}>
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
                      <p className="text-xs font-mono">{totalLotQty.toLocaleString()} bilhetes</p>
                      <p className="text-sm sm:text-base font-bold font-mono">{formatCurrency(totalLotRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Vendido</p>
                      <p className="text-xs font-mono">{totalSoldQty.toLocaleString()} bilhetes</p>
                      <p className="text-sm sm:text-base font-bold font-mono text-emerald-500">{formatCurrency(totalSoldRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Diferença</p>
                      <p className={`text-sm sm:text-base font-bold font-mono ${totalSoldRevenue - totalLotRevenue >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {formatCurrency(totalSoldRevenue - totalLotRevenue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Execução</p>
                      <p className="text-sm sm:text-base font-bold font-mono">
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
              <div className="grid gap-2 sm:gap-3 grid-cols-3">
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3 shrink-0" /> Receitas</p>
                    <p className="text-[11px] sm:text-xl font-bold font-mono text-emerald-500 truncate">{formatCurrency(forecastIncome)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-center gap-1"><TrendingDown className="h-3 w-3 shrink-0" /> Despesas</p>
                    <p className="text-[11px] sm:text-xl font-bold font-mono text-amber-500 truncate">{formatCurrency(forecastExpense)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Resultado</p>
                    <p className={`text-[11px] sm:text-xl font-bold font-mono truncate ${forecastResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {formatCurrency(forecastResult)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {renderBPSection(
                bpGroups.income, "income",
                <TrendingUp className="h-4 w-4" />, "Receitas Previstas", "text-emerald-500", forecastIncome
              )}
              {renderBPSection(
                bpGroups.expense, "expense",
                <TrendingDown className="h-4 w-4" />, "Despesas Previstas", "text-amber-500", forecastExpense
              )}

              {/* Result card */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 flex items-center justify-between">
                  <span className="text-sm font-bold">Resultado Previsto</span>
                  <span className={`text-lg font-bold font-mono ${forecastResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                    {formatCurrency(forecastResult)}
                  </span>
                </CardContent>
              </Card>
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
              <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-4">
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Receitas</p>
                    <p className="text-[11px] sm:text-xl font-bold font-mono text-emerald-500 truncate">{formatCurrency(transactionIncome)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Despesas</p>
                    <p className="text-[11px] sm:text-xl font-bold font-mono text-amber-500 truncate">{formatCurrency(transactionExpense)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pago</p>
                    <p className="text-[11px] sm:text-xl font-bold font-mono truncate">{formatCurrency(paidExpenses)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2 sm:p-4 text-center">
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Resultado</p>
                    <p className={`text-[11px] sm:text-xl font-bold font-mono truncate ${transactionResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {formatCurrency(transactionResult)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Income transactions */}
              {txGrouped.income.length > 0 && (
                <Card>
                  <CardHeader className="pb-0 px-4 pt-4">
                    <CardTitle className="text-sm text-emerald-500 flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> Receitas</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    {txGrouped.income.map((g) => (
                      <div key={g.name}>
                        <div className="bg-muted/30 px-4 py-1.5 flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.code} - {g.name}</span>
                          <span className="text-[10px] font-bold font-mono text-emerald-500">{formatCurrency(g.total)}</span>
                        </div>
                        {g.items.map((t) => (
                          <div key={t.id} className="flex items-center justify-between px-4 py-2 border-b border-border/30 gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium truncate">{t.description}</span>
                                <Badge variant={t.status === "paid" ? "default" : "secondary"} className="text-[9px] shrink-0">
                                  {statusLabels[t.status] || t.status}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{formatDate(t.date)}</span>
                              {t.docs.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {t.docs.map((d: any) => (
                                    <a key={d.id} href={d.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[9px] text-primary hover:underline">
                                      <Paperclip className="h-2.5 w-2.5" />{d.name}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-mono font-semibold text-emerald-500 whitespace-nowrap">+{formatCurrency(t.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Expense transactions */}
              {txGrouped.expense.length > 0 && (
                <Card>
                  <CardHeader className="pb-0 px-4 pt-4">
                    <CardTitle className="text-sm text-amber-500 flex items-center gap-1.5"><TrendingDown className="h-4 w-4" /> Despesas</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    {txGrouped.expense.map((g) => (
                      <div key={g.name}>
                        <div className="bg-muted/30 px-4 py-1.5 flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.code} - {g.name}</span>
                          <span className="text-[10px] font-bold font-mono text-amber-500">{formatCurrency(g.total)}</span>
                        </div>
                        {g.items.map((t) => (
                          <div key={t.id} className="flex items-center justify-between px-4 py-2 border-b border-border/30 gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium truncate">{t.description}</span>
                                <Badge variant={t.status === "paid" ? "default" : "secondary"} className="text-[9px] shrink-0">
                                  {statusLabels[t.status] || t.status}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{formatDate(t.date)}</span>
                              {t.docs.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {t.docs.map((d: any) => (
                                    <a key={d.id} href={d.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[9px] text-primary hover:underline">
                                      <Paperclip className="h-2.5 w-2.5" />{d.name}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-mono font-semibold text-amber-500 whitespace-nowrap">-{formatCurrency(t.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Result */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 flex items-center justify-between">
                  <span className="text-sm font-bold">Resultado</span>
                  <span className={`text-lg font-bold font-mono ${transactionResult >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                    {formatCurrency(transactionResult)}
                  </span>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
