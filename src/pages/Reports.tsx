import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { events, transactions, formatCurrency, categoryLabels } from "@/lib/mock-data";

const PIE_COLORS = ["hsl(262 80% 60%)", "hsl(170 70% 45%)", "hsl(38 90% 55%)", "hsl(0 72% 55%)", "hsl(210 70% 55%)", "hsl(300 60% 55%)"];

export default function Reports() {
  // Revenue by event
  const eventProfitData = events.map((e) => ({
    name: e.name.length > 18 ? e.name.slice(0, 18) + "…" : e.name,
    receitas: e.totalIncome,
    despesas: e.totalExpenses,
    lucro: e.totalIncome - e.totalExpenses,
  }));

  // Income by category
  const incomeByCategory: Record<string, number> = {};
  const expenseByCategory: Record<string, number> = {};
  transactions.forEach((t) => {
    if (t.type === "income") incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
    else expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
  });

  const incomePie = Object.entries(incomeByCategory).map(([k, v]) => ({ name: categoryLabels[k as keyof typeof categoryLabels], value: v }));
  const expensePie = Object.entries(expenseByCategory).map(([k, v]) => ({ name: categoryLabels[k as keyof typeof categoryLabels], value: v }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Análise financeira detalhada</p>
      </div>

      {/* Profit by event */}
      <div className="glass rounded-xl p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Lucro por Evento</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={eventProfitData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 12% 16%)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "hsl(215 12% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fill: "hsl(215 12% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={{ background: "hsl(225 15% 10%)", border: "1px solid hsl(225 12% 16%)", borderRadius: 8, fontSize: 12 }} formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="receitas" fill="hsl(170 70% 45%)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="despesas" fill="hsl(38 90% 55%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[
          { title: "Receitas por Categoria", data: incomePie },
          { title: "Despesas por Categoria", data: expensePie },
        ].map(({ title, data }) => (
          <div key={title} className="glass rounded-xl p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                    {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(225 15% 10%)", border: "1px solid hsl(225 12% 16%)", borderRadius: 8, fontSize: 12 }} formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1.5">
              {data.map((d, i) => (
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
        ))}
      </div>
    </div>
  );
}
