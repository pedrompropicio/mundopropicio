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
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { StatCard } from "@/components/StatCard";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { events, transactions, monthlyData, formatCurrency, formatDate, categoryLabels, calcIvaAmount } from "@/lib/mock-data";

const totalIncome = events.reduce((s, e) => s + e.totalIncome, 0);
const totalExpenses = events.reduce((s, e) => s + e.totalExpenses, 0);
const profit = totalIncome - totalExpenses;
const upcomingEvents = events.filter((e) => e.status === "planning" || e.status === "active");
const recentTransactions = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
const totalIvaLiquidado = transactions.filter(t => t.type === "income").reduce((s, t) => s + calcIvaAmount(t.amount, t.ivaRate), 0);
const totalIvaDedutivel = transactions.filter(t => t.type === "expense").reduce((s, t) => s + calcIvaAmount(t.amount, t.ivaRate), 0);
const ivaSaldo = totalIvaLiquidado - totalIvaDedutivel;

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral financeira dos seus eventos</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Receitas Totais"
          value={formatCurrency(totalIncome)}
          icon={TrendingUp}
          variant="accent"
          trend={{ value: "+12% vs ano anterior", positive: true }}
        />
        <StatCard
          title="Despesas Totais"
          value={formatCurrency(totalExpenses)}
          icon={TrendingDown}
          variant="warning"
        />
        <StatCard
          title="Lucro Líquido"
          value={formatCurrency(profit)}
          icon={Wallet}
          variant="primary"
          subtitle={`Margem: ${((profit / totalIncome) * 100).toFixed(1)}%`}
        />
        <StatCard
          title="Eventos Ativos"
          value={String(upcomingEvents.length)}
          icon={Calendar}
          subtitle={`${events.filter((e) => e.status === "completed").length} concluídos`}
        />
      </div>

      {/* Chart + Recent */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Chart */}
        <div className="glass rounded-xl p-5 lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Receitas vs Despesas (2026)
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} barGap={4}>
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
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
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
                  <EventStatusBadge status={event.status} />
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Ticket className="h-3 w-3" />
                    {event.ticketsSold.toLocaleString()}/{event.ticketsTotal.toLocaleString()}
                  </span>
                  <span className="text-success font-medium">{formatCurrency(event.totalIncome)}</span>
                </div>
              </Link>
            ))}
          </div>
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
              {recentTransactions.map((t) => (
                <tr key={t.id} className="group">
                  <td className="py-3 pr-4">
                    <p className="font-medium">{t.description}</p>
                    <p className="text-xs text-muted-foreground sm:hidden">{t.eventName}</p>
                  </td>
                  <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">{t.eventName}</td>
                  <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{categoryLabels[t.category]}</td>
                  <td className={`py-3 text-right font-mono font-semibold ${t.type === "income" ? "text-success" : "text-warning"}`}>
                    {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
