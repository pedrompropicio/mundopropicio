import { useState } from "react";
import { Receipt, TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { StatCard } from "@/components/StatCard";
import {
  transactions,
  events,
  formatCurrency,
  formatCurrencyDecimal,
  formatDate,
  calcIvaAmount,
  calcBaseAmount,
  getQuarter,
  getQuarterLabel,
  categoryLabels,
  ivaRateLabels,
  type IvaRate,
  type Transaction,
} from "@/lib/mock-data";

interface QuarterIva {
  label: string;
  year: number;
  quarter: number;
  ivaLiquidado: number; // IVA cobrado nas vendas (a pagar ao estado)
  ivaDedutivel: number; // IVA pago nas compras (a recuperar)
  saldo: number;        // Liquidado - Dedutível (positivo = pagar, negativo = recuperar)
}

interface EventIva {
  eventId: string;
  eventName: string;
  ivaLiquidado: number;
  ivaDedutivel: number;
  saldo: number;
}

interface RateBreakdown {
  rate: IvaRate;
  baseIncome: number;
  ivaIncome: number;
  baseExpense: number;
  ivaExpense: number;
}

function computeQuarterlyIva(txns: Transaction[]): QuarterIva[] {
  const map = new Map<string, QuarterIva>();
  txns.forEach((t) => {
    const d = new Date(t.date);
    const year = d.getFullYear();
    const q = getQuarter(t.date);
    const key = `${year}-Q${q}`;
    if (!map.has(key)) {
      map.set(key, { label: getQuarterLabel(q, year), year, quarter: q, ivaLiquidado: 0, ivaDedutivel: 0, saldo: 0 });
    }
    const entry = map.get(key)!;
    const iva = calcIvaAmount(t.amount, t.ivaRate);
    if (t.type === "income") entry.ivaLiquidado += iva;
    else entry.ivaDedutivel += iva;
    entry.saldo = entry.ivaLiquidado - entry.ivaDedutivel;
  });
  return Array.from(map.values()).sort((a, b) => a.year - b.year || a.quarter - b.quarter);
}

function computeEventIva(txns: Transaction[]): EventIva[] {
  const map = new Map<string, EventIva>();
  txns.forEach((t) => {
    if (!map.has(t.eventId)) {
      map.set(t.eventId, { eventId: t.eventId, eventName: t.eventName, ivaLiquidado: 0, ivaDedutivel: 0, saldo: 0 });
    }
    const entry = map.get(t.eventId)!;
    const iva = calcIvaAmount(t.amount, t.ivaRate);
    if (t.type === "income") entry.ivaLiquidado += iva;
    else entry.ivaDedutivel += iva;
    entry.saldo = entry.ivaLiquidado - entry.ivaDedutivel;
  });
  return Array.from(map.values());
}

function computeRateBreakdown(txns: Transaction[]): RateBreakdown[] {
  const rates: IvaRate[] = [23, 13, 6, 0];
  return rates.map((rate) => {
    const rateTxns = txns.filter((t) => t.ivaRate === rate);
    const incTxns = rateTxns.filter((t) => t.type === "income");
    const expTxns = rateTxns.filter((t) => t.type === "expense");
    return {
      rate,
      baseIncome: incTxns.reduce((s, t) => s + calcBaseAmount(t.amount, t.ivaRate), 0),
      ivaIncome: incTxns.reduce((s, t) => s + calcIvaAmount(t.amount, t.ivaRate), 0),
      baseExpense: expTxns.reduce((s, t) => s + calcBaseAmount(t.amount, t.ivaRate), 0),
      ivaExpense: expTxns.reduce((s, t) => s + calcIvaAmount(t.amount, t.ivaRate), 0),
    };
  });
}

export default function IvaManagement() {
  const [selectedYear, setSelectedYear] = useState(2026);
  const years = [2025, 2026];

  const yearTxns = transactions.filter((t) => new Date(t.date).getFullYear() === selectedYear);
  const quarterly = computeQuarterlyIva(yearTxns);
  const eventIva = computeEventIva(yearTxns);
  const rateBreakdown = computeRateBreakdown(yearTxns);

  const totalLiquidado = quarterly.reduce((s, q) => s + q.ivaLiquidado, 0);
  const totalDedutivel = quarterly.reduce((s, q) => s + q.ivaDedutivel, 0);
  const totalSaldo = totalLiquidado - totalDedutivel;

  const pendingIva = transactions
    .filter((t) => t.status === "pending" && new Date(t.date).getFullYear() === selectedYear)
    .reduce((s, t) => s + calcIvaAmount(t.amount, t.ivaRate), 0);

  const chartData = quarterly.map((q) => ({
    name: q.label,
    liquidado: Math.round(q.ivaLiquidado),
    dedutivel: Math.round(q.ivaDedutivel),
    saldo: Math.round(q.saldo),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Gestão de IVA</h1>
          <p className="text-sm text-muted-foreground">Previsão e controlo do IVA — taxas de Portugal Continental</p>
        </div>
        <div className="flex gap-2">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                selectedYear === y ? "bg-primary text-primary-foreground glow-primary" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="IVA Liquidado"
          value={formatCurrency(totalLiquidado)}
          subtitle="IVA cobrado nas vendas"
          icon={TrendingUp}
          variant="accent"
        />
        <StatCard
          title="IVA Dedutível"
          value={formatCurrency(totalDedutivel)}
          subtitle="IVA pago nas compras"
          icon={TrendingDown}
          variant="warning"
        />
        <StatCard
          title={totalSaldo >= 0 ? "IVA a Entregar" : "IVA a Recuperar"}
          value={formatCurrency(Math.abs(totalSaldo))}
          subtitle={totalSaldo >= 0 ? "A pagar ao Estado" : "A recuperar do Estado"}
          icon={Receipt}
          variant="primary"
        />
        <StatCard
          title="IVA Pendente"
          value={formatCurrency(pendingIva)}
          subtitle="Em transações por liquidar"
          icon={AlertTriangle}
        />
      </div>

      {/* Info box about PT rates */}
      <div className="glass rounded-xl border-primary/20 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-1">Taxas de IVA em vigor — Portugal Continental</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
              <span><strong className="text-foreground">23%</strong> — Taxa normal (serviços, bens gerais)</span>
              <span><strong className="text-foreground">13%</strong> — Taxa intermédia (alimentação, bebidas)</span>
              <span><strong className="text-foreground">6%</strong> — Taxa reduzida (espetáculos, bilheteira)</span>
              <span><strong className="text-foreground">0%</strong> — Isento (seguros, exportações)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quarterly Chart */}
      <div className="glass rounded-xl p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">IVA Trimestral — {selectedYear}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 12% 16%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215 12% 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(215 12% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(225 15% 10%)", border: "1px solid hsl(225 12% 16%)", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Bar dataKey="liquidado" name="IVA Liquidado" fill="hsl(170 70% 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="dedutivel" name="IVA Dedutível" fill="hsl(38 90% 55%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="saldo" name="Saldo" fill="hsl(262 80% 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quarterly Detail Table */}
        <div className="glass rounded-xl p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Detalhe Trimestral</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Trimestre</th>
                  <th className="pb-3 text-right font-medium">Liquidado</th>
                  <th className="pb-3 text-right font-medium">Dedutível</th>
                  <th className="pb-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {quarterly.map((q) => (
                  <tr key={q.label}>
                    <td className="py-3 font-medium">{q.label}</td>
                    <td className="py-3 text-right font-mono text-success">{formatCurrencyDecimal(q.ivaLiquidado)}</td>
                    <td className="py-3 text-right font-mono text-warning">{formatCurrencyDecimal(q.ivaDedutivel)}</td>
                    <td className={`py-3 text-right font-mono font-semibold ${q.saldo >= 0 ? "text-destructive" : "text-success"}`}>
                      {q.saldo >= 0 ? "" : "-"}{formatCurrencyDecimal(Math.abs(q.saldo))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-3">Total Anual</td>
                  <td className="py-3 text-right font-mono text-success">{formatCurrencyDecimal(totalLiquidado)}</td>
                  <td className="py-3 text-right font-mono text-warning">{formatCurrencyDecimal(totalDedutivel)}</td>
                  <td className={`py-3 text-right font-mono ${totalSaldo >= 0 ? "text-destructive" : "text-success"}`}>
                    {totalSaldo >= 0 ? "" : "-"}{formatCurrencyDecimal(Math.abs(totalSaldo))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* IVA by Event */}
        <div className="glass rounded-xl p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">IVA por Evento</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Evento</th>
                  <th className="pb-3 text-right font-medium">Liquidado</th>
                  <th className="pb-3 text-right font-medium">Dedutível</th>
                  <th className="pb-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {eventIva.map((e) => (
                  <tr key={e.eventId}>
                    <td className="py-3 font-medium">{e.eventName}</td>
                    <td className="py-3 text-right font-mono text-success">{formatCurrencyDecimal(e.ivaLiquidado)}</td>
                    <td className="py-3 text-right font-mono text-warning">{formatCurrencyDecimal(e.ivaDedutivel)}</td>
                    <td className={`py-3 text-right font-mono font-semibold ${e.saldo >= 0 ? "text-destructive" : "text-success"}`}>
                      {e.saldo >= 0 ? "" : "-"}{formatCurrencyDecimal(Math.abs(e.saldo))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Rate Breakdown */}
      <div className="glass rounded-xl p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Desagregação por Taxa de IVA</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 text-left font-medium">Taxa</th>
                <th className="pb-3 text-right font-medium">Base Receitas</th>
                <th className="pb-3 text-right font-medium">IVA Receitas</th>
                <th className="pb-3 text-right font-medium">Base Despesas</th>
                <th className="pb-3 text-right font-medium">IVA Despesas</th>
                <th className="pb-3 text-right font-medium">Saldo IVA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {rateBreakdown.map((r) => {
                const saldo = r.ivaIncome - r.ivaExpense;
                return (
                  <tr key={r.rate}>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex h-6 w-10 items-center justify-center rounded bg-primary/15 text-xs font-bold text-primary">{r.rate}%</span>
                        <span className="text-muted-foreground hidden sm:inline">{ivaRateLabels[r.rate]}</span>
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono">{formatCurrencyDecimal(r.baseIncome)}</td>
                    <td className="py-3 text-right font-mono text-success">{formatCurrencyDecimal(r.ivaIncome)}</td>
                    <td className="py-3 text-right font-mono">{formatCurrencyDecimal(r.baseExpense)}</td>
                    <td className="py-3 text-right font-mono text-warning">{formatCurrencyDecimal(r.ivaExpense)}</td>
                    <td className={`py-3 text-right font-mono font-semibold ${saldo >= 0 ? "text-destructive" : "text-success"}`}>
                      {saldo >= 0 ? "" : "-"}{formatCurrencyDecimal(Math.abs(saldo))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
