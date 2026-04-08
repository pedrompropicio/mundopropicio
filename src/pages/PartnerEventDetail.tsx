import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, Ticket, Calendar, Layers, Route } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { formatCurrency, formatDate } from "@/lib/mock-data";

const eventTypeLabels: Record<string, string> = {
  simple: "Evento Simples",
  festival: "Festival",
  multi_day: "Múltiplos Dias / Turnê",
};

export default function PartnerEventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [selectedSubEvent, setSelectedSubEvent] = useState<string | null>(null);

  // Check access
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

  // Sub-events for multi-day
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

  // Filter sub-events by partner access
  const authorizedSubEvents = subEvents.filter((s: any) => accessList.includes(s.id));
  const hasParentAccess = accessList.includes(id!);
  const visibleSubEvents = hasParentAccess ? subEvents : authorizedSubEvents;

  const activeEventId = selectedSubEvent || (eventType === "multi_day" && !hasParentAccess && visibleSubEvents.length > 0 ? visibleSubEvents[0]?.id : id!);

  // Ticketing data
  const { data: ticketZones = [] } = useQuery({
    queryKey: ["partner_ticket_zones", activeEventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("*, event_ticket_lots(*)").eq("event_id", activeEventId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!activeEventId && (activeEventId !== id || eventType !== "multi_day" || hasParentAccess),
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

  // Check if user has access to this event or any of its sub-events
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

  const statusLabels: Record<string, string> = {
    pending: "Aguardando",
    approved: "A Pagar",
    paid: "Pago",
  };

  const totalTicketCapacity = ticketZones.reduce((s: number, z: any) => s + (z.total_capacity || 0), 0);
  const totalLots = ticketZones.reduce((s: number, z: any) => s + (z.event_ticket_lots?.length || 0), 0);

  const forecastIncome = forecasts.filter((f: any) => f.type === "income").reduce((s: number, f: any) => s + Number(f.amount), 0);
  const forecastExpense = forecasts.filter((f: any) => f.type === "expense").reduce((s: number, f: any) => s + Number(f.amount), 0);

  const transactionIncome = transactions.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const transactionExpense = transactions.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/parceiro" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Voltar ao portal
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
          <EventStatusBadge status={event.status} />
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <EventTypeIcon className="h-3 w-3" />
            {eventTypeLabels[eventType]}
          </span>
        </div>
      </div>

      {/* Sub-event selector for multi-day */}
      {eventType === "multi_day" && visibleSubEvents.length > 0 && (
        <div className="glass rounded-xl p-4">
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
        </div>
      )}

      {/* Tabs: Bilhetes, BP, Transações */}
      <Tabs defaultValue="ticketing" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ticketing">Bilhetes</TabsTrigger>
          <TabsTrigger value="forecast">Business Plan</TabsTrigger>
          <TabsTrigger value="transactions">Transações</TabsTrigger>
        </TabsList>

        {/* BILHETES */}
        <TabsContent value="ticketing">
          {eventType === "multi_day" && !selectedSubEvent && hasParentAccess ? (
            <div className="glass rounded-xl p-8 text-center space-y-2">
              <Ticket className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Selecione uma data acima para ver a bilheteira.</p>
            </div>
          ) : ticketZones.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-muted-foreground">Sem bilheteira configurada para este evento.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Zonas</p>
                  <p className="text-2xl font-bold">{ticketZones.length}</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Lotes</p>
                  <p className="text-2xl font-bold">{totalLots}</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Capacidade Total</p>
                  <p className="text-2xl font-bold">{totalTicketCapacity.toLocaleString()}</p>
                </div>
              </div>
              {ticketZones.map((zone: any) => (
                <div key={zone.id} className="glass rounded-xl p-4">
                  <h3 className="font-semibold mb-3">{zone.name} <span className="text-xs text-muted-foreground font-normal">({zone.total_capacity} lugares)</span></h3>
                  {zone.event_ticket_lots?.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 text-left font-medium">Lote</th>
                          <th className="pb-2 text-right font-medium">Qtd</th>
                          <th className="pb-2 text-right font-medium">Preço</th>
                          <th className="pb-2 text-right font-medium">IVA</th>
                          <th className="pb-2 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {zone.event_ticket_lots.map((lot: any) => (
                          <tr key={lot.id}>
                            <td className="py-2">{lot.name}</td>
                            <td className="py-2 text-right font-mono">{lot.quantity}</td>
                            <td className="py-2 text-right font-mono">{formatCurrency(Number(lot.price))}</td>
                            <td className="py-2 text-right font-mono">{lot.iva_rate}%</td>
                            <td className="py-2 text-right font-mono font-semibold">{formatCurrency(Number(lot.price) * lot.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem lotes configurados.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* BUSINESS PLAN */}
        <TabsContent value="forecast">
          {forecasts.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-muted-foreground">Sem previsões registadas.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Receitas Previstas</p>
                  <p className="text-xl font-bold text-success">{formatCurrency(forecastIncome)}</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Despesas Previstas</p>
                  <p className="text-xl font-bold text-warning">{formatCurrency(forecastExpense)}</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Resultado Previsto</p>
                  <p className={`text-xl font-bold ${forecastIncome - forecastExpense >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(forecastIncome - forecastExpense)}
                  </p>
                </div>
              </div>

              <div className="glass rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground bg-muted/30">
                      <th className="px-4 py-3 text-left font-medium">Descrição</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Categoria</th>
                      <th className="px-4 py-3 text-left font-medium">Tipo</th>
                      <th className="px-4 py-3 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {forecasts.map((f: any) => (
                      <tr key={f.id}>
                        <td className="px-4 py-3">{f.description}</td>
                        <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                          {f.account_categories ? `${f.account_categories.code} - ${f.account_categories.name}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            f.type === "income" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                          }`}>
                            {f.type === "income" ? "Receita" : "Despesa"}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${f.type === "income" ? "text-success" : "text-warning"}`}>
                          {formatCurrency(Number(f.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* TRANSAÇÕES */}
        <TabsContent value="transactions">
          {transactions.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-muted-foreground">Sem transações registadas.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Receitas</p>
                  <p className="text-xl font-bold text-success">{formatCurrency(transactionIncome)}</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Despesas</p>
                  <p className="text-xl font-bold text-warning">{formatCurrency(transactionExpense)}</p>
                </div>
                <div className="glass rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">Resultado</p>
                  <p className={`text-xl font-bold ${transactionIncome - transactionExpense >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(transactionIncome - transactionExpense)}
                  </p>
                </div>
              </div>

              <div className="glass rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground bg-muted/30">
                      <th className="px-4 py-3 text-left font-medium">Descrição</th>
                      <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Categoria</th>
                      <th className="px-4 py-3 text-left font-medium">Estado</th>
                      <th className="px-4 py-3 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {transactions.map((t: any) => (
                      <tr key={t.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{t.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                          {t.account_categories ? `${t.account_categories.code} - ${t.account_categories.name}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.status === "paid" ? "bg-success/15 text-success" : t.status === "pending" ? "bg-warning/15 text-warning" : "bg-blue-500/15 text-blue-400"
                          }`}>
                            {statusLabels[t.status] || t.status}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${t.type === "income" ? "text-success" : "text-warning"}`}>
                          {t.type === "income" ? "+" : "-"}{formatCurrency(Number(t.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
