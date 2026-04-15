import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { StatCard } from "@/components/StatCard";
import {
  formatCurrency,
  formatCurrencyDecimal,
  calcIvaAmount,
  calcBaseAmount,
  getQuarter,
  getQuarterLabel,
  ivaRateLabels,
  type IvaRate,
} from "@/lib/mock-data";

interface QuarterIva {
  label: string;
  year: number;
  quarter: number;
  ivaLiquidado: number;
  ivaDedutivel: number;
  saldo: number;
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

interface DbTransaction {
  id: string;
  event_id: string | null;
  type: string;
  amount: number;
  iva_rate: number;
  date: string;
  status: string;
}

interface TicketSaleRow {
  sale_date: string;
  quantity: number;
  unit_price: number;
  iva_rate: number;
  event_id: string;
}

/** Extract IVA from a gross (IVA-inclusive) amount */
function ivaFromGross(grossAmount: number, ivaRate: number): number {
  if (ivaRate === 0) return 0;
  return Math.round(grossAmount * ivaRate / (100 + ivaRate) * 100) / 100;
}

/** Extract base from a gross (IVA-inclusive) amount */
function baseFromGross(grossAmount: number, ivaRate: number): number {
  if (ivaRate === 0) return grossAmount;
  return Math.round(grossAmount * 100 / (100 + ivaRate) * 100) / 100;
}

function computeQuarterlyIva(txns: DbTransaction[], sales: TicketSaleRow[]): QuarterIva[] {
  const map = new Map<string, QuarterIva>();

  const ensureEntry = (dateStr: string) => {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const q = getQuarter(dateStr);
    const key = `${year}-Q${q}`;
    if (!map.has(key)) {
      map.set(key, { label: getQuarterLabel(q, year), year, quarter: q, ivaLiquidado: 0, ivaDedutivel: 0, saldo: 0 });
    }
    return map.get(key)!;
  };

  // Expense transactions (IVA Dedutível)
  txns.forEach((t) => {
    if (t.type !== "expense") return;
    const entry = ensureEntry(t.date);
    entry.ivaDedutivel += calcIvaAmount(t.amount, t.iva_rate as IvaRate);
  });

  // Income transactions (IVA Liquidado) — non-ticket revenue
  txns.forEach((t) => {
    if (t.type !== "income") return;
    const entry = ensureEntry(t.date);
    entry.ivaLiquidado += calcIvaAmount(t.amount, t.iva_rate as IvaRate);
  });

  // Ticket sales (IVA Liquidado) — prices are gross (with IVA)
  sales.forEach((s) => {
    const entry = ensureEntry(s.sale_date);
    const gross = s.quantity * s.unit_price;
    entry.ivaLiquidado += ivaFromGross(gross, s.iva_rate);
  });

  map.forEach((entry) => {
    entry.saldo = entry.ivaLiquidado - entry.ivaDedutivel;
  });

  return Array.from(map.values()).sort((a, b) => a.year - b.year || a.quarter - b.quarter);
}

function computeEventIva(txns: DbTransaction[], sales: TicketSaleRow[], eventsMap: Map<string, string>): EventIva[] {
  const map = new Map<string, EventIva>();

  const ensureEntry = (eventId: string) => {
    if (!map.has(eventId)) {
      map.set(eventId, { eventId, eventName: eventsMap.get(eventId) || "Sem evento", ivaLiquidado: 0, ivaDedutivel: 0, saldo: 0 });
    }
    return map.get(eventId)!;
  };

  txns.forEach((t) => {
    if (!t.event_id) return;
    const entry = ensureEntry(t.event_id);
    const iva = calcIvaAmount(t.amount, t.iva_rate as IvaRate);
    if (t.type === "income") entry.ivaLiquidado += iva;
    else entry.ivaDedutivel += iva;
  });

  sales.forEach((s) => {
    const entry = ensureEntry(s.event_id);
    const gross = s.quantity * s.unit_price;
    entry.ivaLiquidado += ivaFromGross(gross, s.iva_rate);
  });

  map.forEach((entry) => {
    entry.saldo = entry.ivaLiquidado - entry.ivaDedutivel;
  });

  return Array.from(map.values());
}

function computeRateBreakdown(txns: DbTransaction[], sales: TicketSaleRow[]): RateBreakdown[] {
  const rates: IvaRate[] = [23, 13, 6, 0];
  return rates.map((rate) => {
    // Expense transactions
    const expTxns = txns.filter((t) => t.type === "expense" && t.iva_rate === rate);
    // Income transactions (non-ticket)
    const incTxns = txns.filter((t) => t.type === "income" && t.iva_rate === rate);
    // Ticket sales
    const rateSales = sales.filter((s) => s.iva_rate === rate);

    const baseIncomeFromTxns = incTxns.reduce((s, t) => s + calcBaseAmount(t.amount, t.iva_rate as IvaRate), 0);
    const ivaIncomeFromTxns = incTxns.reduce((s, t) => s + calcIvaAmount(t.amount, t.iva_rate as IvaRate), 0);

    const grossSales = rateSales.reduce((s, t) => s + t.quantity * t.unit_price, 0);
    const baseIncomeFromSales = baseFromGross(grossSales, rate);
    const ivaIncomeFromSales = ivaFromGross(grossSales, rate);

    return {
      rate,
      baseIncome: baseIncomeFromTxns + baseIncomeFromSales,
      ivaIncome: ivaIncomeFromTxns + ivaIncomeFromSales,
      baseExpense: expTxns.reduce((s, t) => s + calcBaseAmount(t.amount, t.iva_rate as IvaRate), 0),
      ivaExpense: expTxns.reduce((s, t) => s + calcIvaAmount(t.amount, t.iva_rate as IvaRate), 0),
    };
  });
}

export default function IvaManagement() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const years = [currentYear - 1, currentYear];

  const { data: transactions = [] } = useQuery({
    queryKey: ["iva-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, amount, iva_rate, date, status")
        .order("date", { ascending: false });
      if (error) throw error;
      return data as DbTransaction[];
    },
  });

  const { data: ticketSales = [] } = useQuery({
    queryKey: ["iva-ticket-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("sale_date, quantity, unit_price, lot_id")
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ticketLots = [] } = useQuery({
    queryKey: ["iva-ticket-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("id, iva_rate, zone_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ticketZones = [] } = useQuery({
    queryKey: ["iva-ticket-zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["iva-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  // Build lookup maps
  const eventsMap = useMemo(() => {
    const m = new Map<string, string>();
    events.forEach((e) => m.set(e.id, e.name));
    return m;
  }, [events]);

  const enrichedSales: TicketSaleRow[] = useMemo(() => {
    const lotMap = new Map<string, { iva_rate: number; zone_id: string }>();
    ticketLots.forEach((l) => lotMap.set(l.id, { iva_rate: l.iva_rate, zone_id: l.zone_id }));
    const zoneMap = new Map<string, string>();
    ticketZones.forEach((z) => zoneMap.set(z.id, z.event_id));

    return ticketSales
      .map((s: any) => {
        const lot = lotMap.get(s.lot_id);
        if (!lot) return null;
        const eventId = zoneMap.get(lot.zone_id);
        if (!eventId) return null;
        return {
          sale_date: s.sale_date,
          quantity: s.quantity,
          unit_price: s.unit_price,
          iva_rate: lot.iva_rate,
          event_id: eventId,
        } as TicketSaleRow;
      })
      .filter(Boolean) as TicketSaleRow[];
  }, [ticketSales, ticketLots, ticketZones]);

  const yearTxns = useMemo(() => transactions.filter((t) => new Date(t.date).getFullYear() === selectedYear), [transactions, selectedYear]);
  const yearSales = useMemo(() => enrichedSales.filter((s) => new Date(s.sale_date).getFullYear() === selectedYear), [enrichedSales, selectedYear]);

  const quarterly = useMemo(() => computeQuarterlyIva(yearTxns, yearSales), [yearTxns, yearSales]);
  const eventIva = useMemo(() => computeEventIva(yearTxns, yearSales, eventsMap), [yearTxns, yearSales, eventsMap]);
  const rateBreakdown = useMemo(() => computeRateBreakdown(yearTxns, yearSales), [yearTxns, yearSales]);

  const totalLiquidado = quarterly.reduce((s, q) => s + q.ivaLiquidado, 0);
  const totalDedutivel = quarterly.reduce((s, q) => s + q.ivaDedutivel, 0);
  const totalSaldo = totalLiquidado - totalDedutivel;

  const pendingIva = yearTxns
    .filter((t) => t.status === "pending")
    .reduce((s, t) => s + calcIvaAmount(t.amount, t.iva_rate as IvaRate), 0);

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
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">Gestão de IVA <HelpTooltip text={helpTexts.ivaManagement} /></h1>
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
        {chartData.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Sem transações para este ano</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="liquidado" name="IVA Liquidado" fill="hsl(170 70% 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dedutivel" name="IVA Dedutível" fill="hsl(38 90% 55%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saldo" name="Saldo" fill="hsl(262 80% 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quarterly Detail Table */}
        <div className="glass rounded-xl p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Detalhe Trimestral</h2>
          {quarterly.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sem dados</p>
          ) : (
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
          )}
        </div>

        {/* IVA by Event */}
        <div className="glass rounded-xl p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">IVA por Evento</h2>
          {eventIva.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sem dados</p>
          ) : (
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
          )}
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
