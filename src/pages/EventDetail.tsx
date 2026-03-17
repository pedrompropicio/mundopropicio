import { useParams, Link } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Wallet, Ticket } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { StatCard } from "@/components/StatCard";
import { EventStatusBadge } from "@/components/EventStatusBadge";
import { events, transactions, formatCurrency, formatDate, categoryLabels } from "@/lib/mock-data";

const PIE_COLORS = [
  "hsl(262 80% 60%)",
  "hsl(170 70% 45%)",
  "hsl(38 90% 55%)",
  "hsl(0 72% 55%)",
  "hsl(210 70% 55%)",
  "hsl(300 60% 55%)",
];

export default function EventDetail() {
  const { id } = useParams();
  const event = events.find((e) => e.id === id);

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p>Evento não encontrado.</p>
        <Link to="/eventos" className="mt-2 text-primary hover:underline">Voltar</Link>
      </div>
    );
  }

  const eventTransactions = transactions.filter((t) => t.eventId === event.id);
  const incomeTransactions = eventTransactions.filter((t) => t.type === "income");
  const expenseTransactions = eventTransactions.filter((t) => t.type === "expense");
  const profit = event.totalIncome - event.totalExpenses;

  // Pie data by category
  const expenseByCategory = expenseTransactions.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount;
    return acc;
  }, {});
  const pieData = Object.entries(expenseByCategory).map(([key, value]) => ({
    name: categoryLabels[key as keyof typeof categoryLabels],
    value,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link to="/eventos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Voltar aos eventos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{event.name}</h1>
          <EventStatusBadge status={event.status} />
        </div>
        <p className="text-sm text-muted-foreground">{event.location} · {formatDate(event.date)}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Receitas" value={formatCurrency(event.totalIncome)} icon={TrendingUp} variant="accent" />
        <StatCard title="Despesas" value={formatCurrency(event.totalExpenses)} icon={TrendingDown} variant="warning" />
        <StatCard title="Lucro" value={formatCurrency(profit)} icon={Wallet} variant="primary" subtitle={`Margem: ${((profit / event.totalIncome) * 100).toFixed(1)}%`} />
        <StatCard title="Bilhetes" value={`${event.ticketsSold.toLocaleString()}`} icon={Ticket} subtitle={`de ${event.ticketsTotal.toLocaleString()} (${((event.ticketsSold / event.ticketsTotal) * 100).toFixed(0)}%)`} />
      </div>

      {/* Pie chart + transactions */}
      <div className="grid gap-6 lg:grid-cols-5">
        {pieData.length > 0 && (
          <div className="glass rounded-xl p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Despesas por Categoria</h2>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(225 15% 10%)", border: "1px solid hsl(225 12% 16%)", borderRadius: 8, fontSize: 12 }} formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1.5">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-mono font-medium">{formatCurrency(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transactions list */}
        <div className={`glass rounded-xl p-5 ${pieData.length > 0 ? "lg:col-span-3" : "lg:col-span-5"}`}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Transações do Evento</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Descrição</th>
                  <th className="hidden pb-3 text-left font-medium sm:table-cell">Categoria</th>
                  <th className="pb-3 text-left font-medium">Estado</th>
                  <th className="pb-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {eventTransactions.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium">{t.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                    </td>
                    <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">{categoryLabels[t.category]}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.status === "paid" ? "bg-success/15 text-success" : t.status === "pending" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
                      }`}>
                        {t.status === "paid" ? "Pago" : t.status === "pending" ? "Pendente" : "Atrasado"}
                      </span>
                    </td>
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
    </div>
  );
}
