import { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  Receipt,
  Ticket,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/StatCard";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { formatCurrency, formatDate, calcIvaAmount } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";

export default function Dashboard() {
  // Fetch events
  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["dashboard_events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch transactions
  const { data: transactions = [], isLoading: loadingTxns } = useQuery({
    queryKey: ["dashboard_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name), account_categories(code, name)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingEvents || loadingTxns;

  // Compute stats
  const stats = useMemo(() => {
    const eventTotals: Record<string, { income: number; expense: number }> = {};
    transactions.forEach((t) => {
      if (!eventTotals[t.event_id]) eventTotals[t.event_id] = { income: 0, expense: 0 };
      if (t.type === "income") eventTotals[t.event_id].income += Number(t.amount);
      else eventTotals[t.event_id].expense += Number(t.amount);
    });

    const totalIncome = Object.values(eventTotals).reduce((s, e) => s + e.income, 0);
    const totalExpenses = Object.values(eventTotals).reduce((s, e) => s + e.expense, 0);
    const profit = totalIncome - totalExpenses;

    const upcomingEvents = events
      .filter((e) => e.status === "planning" || e.status === "active")
      .map((e) => ({
        ...e,
        totalIncome: eventTotals[e.id]?.income ?? 0,
        totalExpenses: eventTotals[e.id]?.expense ?? 0,
      }));

    const completedCount = events.filter((e) => e.status === "completed").length;

    const totalIvaLiquidado = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + calcIvaAmount(Number(t.amount), t.iva_rate as IvaRate), 0);
    const totalIvaDedutivel = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + calcIvaAmount(Number(t.amount), t.iva_rate as IvaRate), 0);
    const ivaSaldo = totalIvaLiquidado - totalIvaDedutivel;

    const recentTransactions = transactions.slice(0, 6);

    // Monthly chart data
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const currentYear = new Date().getFullYear();
    const monthlyMap: Record<number, { receitas: number; despesas: number }> = {};
    for (let i = 0; i < 12; i++) monthlyMap[i] = { receitas: 0, despesas: 0 };

    transactions.forEach((t) => {
      const d = new Date(t.date);
      if (d.getFullYear() === currentYear) {
        const m = d.getMonth();
        if (t.type === "income") monthlyMap[m].receitas += Number(t.amount);
        else monthlyMap[m].despesas += Number(t.amount);
      }
    });

    const monthlyData = Object.entries(monthlyMap)
      .filter(([_, v]) => v.receitas > 0 || v.despesas > 0)
      .map(([m, v]) => ({ month: monthNames[Number(m)], ...v }));

    // If no data for any month, show at least current month
    if (monthlyData.length === 0) {
      const cm = new Date().getMonth();
      monthlyData.push({ month: monthNames[cm], receitas: 0, despesas: 0 });
    }

    return { totalIncome, totalExpenses, profit, upcomingEvents, completedCount, ivaSaldo, recentTransactions, monthlyData };
  }, [events, transactions]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral financeira dos seus eventos</p>
        </div>
        <p className="py-8 text-center text-muted-foreground">A carregar dados…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral financeira dos seus eventos</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Receitas Totais"
          value={formatCurrency(stats.totalIncome)}
          icon={TrendingUp}
          variant="accent"
        />
        <StatCard
          title="Despesas Totais"
          value={formatCurrency(stats.totalExpenses)}
          icon={TrendingDown}
          variant="warning"
        />
        <StatCard
          title="Lucro Líquido"
          value={formatCurrency(stats.profit)}
          icon={Wallet}
          variant="primary"
          subtitle={stats.totalIncome > 0 ? `Margem: ${((stats.profit / stats.totalIncome) * 100).toFixed(1)}%` : undefined}
        />
        <StatCard
          title="Eventos Ativos"
          value={String(stats.upcomingEvents.length)}
          icon={Calendar}
          subtitle={`${stats.completedCount} concluídos`}
        />
        <Link to="/iva" className="contents">
          <StatCard
            title={stats.ivaSaldo >= 0 ? "IVA a Entregar" : "IVA a Recuperar"}
            value={formatCurrency(Math.abs(stats.ivaSaldo))}
            icon={Receipt}
            subtitle="Ver gestão de IVA →"
          />
        </Link>
      </div>

      {/* Chart + Recent */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Chart */}
        <div className="glass rounded-xl p-5 lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Receitas vs Despesas ({new Date().getFullYear()})
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthlyData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 12% 16%)" />
                <XAxis dataKey="month" tick={{ fill: "hsl(215 12% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(215 12% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(225 15% 10%)", border: "1px solid hsl(225 12% 16%)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="receitas" fill="hsl(170 70% 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" fill="hsl(38 90% 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="glass rounded-xl p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Próximos Eventos</h2>
            <Link to="/eventos" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {stats.upcomingEvents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem eventos próximos.</p>
          ) : (
            <div className="space-y-3">
              {stats.upcomingEvents.map((event) => (
                <Link
                  key={event.id}
                  to={`/eventos/${event.id}`}
                  className="block rounded-lg border border-border/50 bg-secondary/30 p-3 transition-colors hover:bg-secondary/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{event.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(event.date)}</p>
                    </div>
                    <EventStatusBadge status={event.status as any} />
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Ticket className="h-3 w-3" />
                      {event.tickets_sold.toLocaleString()}/{event.tickets_total.toLocaleString()}
                    </span>
                    <span className="text-success font-medium">{formatCurrency(event.totalIncome)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="glass rounded-xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Últimas Transações</h2>
          <Link to="/transacoes" className="text-xs text-primary hover:underline flex items-center gap-1">
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {stats.recentTransactions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sem transações registadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Descrição</th>
                  <th className="hidden pb-3 text-left font-medium sm:table-cell">Evento</th>
                  <th className="hidden pb-3 text-left font-medium md:table-cell">Categoria</th>
                  <th className="pb-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {stats.recentTransactions.map((t) => (
                  <tr key={t.id} className="group">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{t.description}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">
                        {(t as any).events?.name ?? "—"}
                      </p>
                    </td>
                    <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">
                      {(t as any).events?.name ?? "—"}
                    </td>
                    <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">
                      {(t as any).account_categories
                        ? `${(t as any).account_categories.code} - ${(t as any).account_categories.name}`
                        : "—"}
                    </td>
                    <td className={`py-3 text-right font-mono font-semibold ${t.type === "income" ? "text-success" : "text-warning"}`}>
                      {t.type === "income" ? "+" : "-"}{formatCurrency(Number(t.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
