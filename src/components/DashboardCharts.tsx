import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/mock-data";

const COLORS = [
  "hsl(170 70% 45%)",
  "hsl(38 90% 55%)",
  "hsl(262 80% 60%)",
  "hsl(200 70% 50%)",
  "hsl(340 75% 55%)",
  "hsl(150 60% 40%)",
  "hsl(25 85% 55%)",
  "hsl(280 60% 50%)",
];

interface DashboardChartsProps {
  transactions: any[];
  events: any[];
  categories: any[];
  ticketSales?: any[];
}

export function DashboardCharts({ transactions, events, categories, ticketSales = [] }: DashboardChartsProps) {
  const { marginData, categoryData, cumulativeData } = useMemo(() => {
    // 1. Margin per event (top 10 by volume)
    const eventTotals: Record<string, { name: string; income: number; expense: number; hasTicketSales: boolean }> = {};
    transactions.forEach((t) => {
      if (!t.event_id) return;
      if (!eventTotals[t.event_id]) {
        const evt = events.find((e) => e.id === t.event_id);
        eventTotals[t.event_id] = { name: evt?.name ?? "Sem evento", income: 0, expense: 0, hasTicketSales: false };
      }
      if (t.type === "income") eventTotals[t.event_id].income += Number(t.amount);
      else eventTotals[t.event_id].expense += Number(t.amount);
    });

    // Add ticket sales revenue to event totals
    const ticketRevenueByEvent: Record<string, number> = {};
    ticketSales.forEach((ts: any) => {
      const eventId = ts.event_ticket_zones?.event_id;
      if (!eventId) return;
      ticketRevenueByEvent[eventId] = (ticketRevenueByEvent[eventId] || 0) + (ts.total_value != null ? Number(ts.total_value) : Number(ts.quantity) * Number(ts.unit_price));
    });
    Object.entries(ticketRevenueByEvent).forEach(([eventId, revenue]) => {
      if (!eventTotals[eventId]) {
        const evt = events.find((e: any) => e.id === eventId);
        eventTotals[eventId] = { name: evt?.name ?? "Sem evento", income: 0, expense: 0, hasTicketSales: true };
      }
      eventTotals[eventId].income += revenue;
      eventTotals[eventId].hasTicketSales = true;
    });

    const marginData = Object.values(eventTotals)
      .map((e) => ({
        name: e.name.length > 20 ? e.name.slice(0, 18) + "…" : e.name,
        fullName: e.name,
        margem: e.income - e.expense,
        receitas: e.income,
        despesas: e.expense,
      }))
      .sort((a, b) => Math.abs(b.margem) - Math.abs(a.margem))
      .slice(0, 8);

    // 2. Expense distribution by category (level 1)
    const catLookup = new Map(categories.map((c: any) => [c.id, c]));
    const catTotals: Record<string, { name: string; value: number }> = {};

    transactions
      .filter((t: any) => t.type === "expense" && t.category_id)
      .forEach((t: any) => {
        let cat = catLookup.get(t.category_id);
        // Walk up to root
        while (cat?.parent_id) {
          const parent = catLookup.get(cat.parent_id);
          if (parent) cat = parent;
          else break;
        }
        const key = cat?.id ?? "other";
        const name = cat?.name ?? "Outros";
        if (!catTotals[key]) catTotals[key] = { name, value: 0 };
        catTotals[key].value += Number(t.amount);
      });

    const categoryData = Object.values(catTotals)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // 3. Cumulative income/expense by month (current year)
    const currentYear = new Date().getFullYear();
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const monthly: { receitas: number; despesas: number }[] = Array.from({ length: 12 }, () => ({
      receitas: 0,
      despesas: 0,
    }));

    transactions.forEach((t: any) => {
      const d = new Date(t.date);
      if (d.getFullYear() === currentYear) {
        const m = d.getMonth();
        if (t.type === "income") {
          monthly[m].receitas += Number(t.amount);
        } else {
          monthly[m].despesas += Number(t.amount);
        }
      }
    });

    // Add ticket sales revenue to cumulative chart
    ticketSales.forEach((ts: any) => {
      const d = new Date(ts.sale_date);
      if (d.getFullYear() === currentYear) {
        const m = d.getMonth();
        monthly[m].receitas += ts.total_value != null ? Number(ts.total_value) : Number(ts.quantity) * Number(ts.unit_price);
      }
    });

    let cumInc = 0;
    let cumExp = 0;
    const lastMonthWithData = monthly.reduce((last, m, i) => (m.receitas > 0 || m.despesas > 0 ? i : last), 0);

    const cumulativeData = monthly
      .slice(0, lastMonthWithData + 1)
      .map((m, i) => {
        cumInc += m.receitas;
        cumExp += m.despesas;
        return {
          month: monthNames[i],
          receitas: cumInc,
          despesas: cumExp,
          resultado: cumInc - cumExp,
        };
      });

    return { marginData, categoryData, cumulativeData };
  }, [transactions, events, categories, ticketSales]);

  const CustomTooltipPie = ({ active, payload }: any) => {
    if (active && payload?.[0]) {
      const d = payload[0];
      return (
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg">
          <p className="font-medium">{d.name}</p>
          <p className="text-muted-foreground">{formatCurrency(d.value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Margin per event */}
      {marginData.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Margem por Evento
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marginData} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 12% 16%)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "hsl(215 12% 55%)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fill: "hsl(215 12% 55%)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(225 15% 10%)",
                    border: "1px solid hsl(225 12% 16%)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === "margem" ? "Margem" : name,
                  ]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName ?? label}
                />
                <Bar
                  dataKey="margem"
                  radius={[0, 4, 4, 0]}
                  fill="hsl(170 70% 45%)"
                >
                  {marginData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.margem >= 0 ? "hsl(170 70% 45%)" : "hsl(0 70% 55%)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Expense by category donut */}
      {categoryData.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Despesas por Categoria
          </h2>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius="45%"
                  outerRadius="75%"
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltipPie />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) =>
                    <span className="text-xs text-muted-foreground">{value}</span>
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Cumulative evolution */}
      {cumulativeData.length > 1 && (
        <div className="glass rounded-xl p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Evolução Acumulada ({new Date().getFullYear()})
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeData}>
                <defs>
                  <linearGradient id="gradInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(170 70% 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(170 70% 45%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(38 90% 55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(38 90% 55%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(262 80% 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(262 80% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 12% 16%)" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "hsl(215 12% 55%)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "hsl(215 12% 55%)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(225 15% 10%)",
                    border: "1px solid hsl(225 12% 16%)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === "receitas" ? "Receitas" : name === "despesas" ? "Despesas" : "Resultado",
                  ]}
                />
                <Area type="monotone" dataKey="receitas" stroke="hsl(170 70% 45%)" fill="url(#gradInc)" strokeWidth={2} />
                <Area type="monotone" dataKey="despesas" stroke="hsl(38 90% 55%)" fill="url(#gradExp)" strokeWidth={2} />
                <Area type="monotone" dataKey="resultado" stroke="hsl(262 80% 60%)" fill="url(#gradRes)" strokeWidth={2} />
                <Legend
                  iconType="line"
                  formatter={(value: string) => {
                    const labels: Record<string, string> = { receitas: "Receitas", despesas: "Despesas", resultado: "Resultado" };
                    return <span className="text-xs text-muted-foreground">{labels[value] ?? value}</span>;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
