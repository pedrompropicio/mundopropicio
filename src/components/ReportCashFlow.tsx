import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Filter, CalendarIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CashFlowRow {
  period: string;
  income: number;
  expense: number;
  net: number;
  cumulative: number;
}

interface EventCashFlow {
  eventId: string;
  eventName: string;
  rows: CashFlowRow[];
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
}

type Granularity = "monthly" | "weekly";

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-S${String(week).padStart(2, "0")}`;
}

function formatPeriodLabel(key: string, granularity: Granularity): string {
  if (granularity === "weekly") return key;
  const [y, m] = key.split("-");
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${monthNames[parseInt(m) - 1]} ${y}`;
}

export default function ReportCashFlow() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [groupByEvent, setGroupByEvent] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["cf-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["cf-transactions", dateFrom, dateTo, selectedAccountId],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*, events(name)")
        .in("status", ["approved", "paid"])
        .order("date", { ascending: true });
      if (dateFrom) q = q.gte("date", dateFrom);
      if (dateTo) q = q.lte("date", dateTo);
      if (selectedAccountId) q = q.eq("account_id", selectedAccountId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: generated,
  });

  function handleGenerate() {
    setGenerated(true);
  }

  const getPeriodKey = granularity === "monthly" ? getMonthKey : getWeekKey;

  // Build aggregated data
  const { consolidatedRows, eventBreakdown } = useMemo(() => {
    if (!generated || transactions.length === 0) return { consolidatedRows: [], eventBreakdown: [] };

    // Consolidated
    const periodMap: Record<string, { income: number; expense: number }> = {};
    // Per event
    const eventMap: Record<string, { name: string; periods: Record<string, { income: number; expense: number }> }> = {};

    transactions.forEach((t: any) => {
      const key = getPeriodKey(t.date);
      if (!periodMap[key]) periodMap[key] = { income: 0, expense: 0 };
      const amount = Number(t.amount);
      if (t.type === "income") periodMap[key].income += amount;
      else periodMap[key].expense += amount;

      // Event breakdown
      const eid = t.event_id || "__sem_evento__";
      const ename = (t as any).events?.name || "Sem evento";
      if (!eventMap[eid]) eventMap[eid] = { name: ename, periods: {} };
      if (!eventMap[eid].periods[key]) eventMap[eid].periods[key] = { income: 0, expense: 0 };
      if (t.type === "income") eventMap[eid].periods[key].income += amount;
      else eventMap[eid].periods[key].expense += amount;
    });

    const sortedKeys = Object.keys(periodMap).sort();

    let cumulative = 0;
    const consolidatedRows: CashFlowRow[] = sortedKeys.map((key) => {
      const { income, expense } = periodMap[key];
      const net = income - expense;
      cumulative += net;
      return { period: key, income, expense, net, cumulative };
    });

    // Event breakdown
    const eventBreakdown: EventCashFlow[] = Object.entries(eventMap)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([eventId, { name, periods }]) => {
        let totalIncome = 0;
        let totalExpense = 0;
        let cum = 0;
        const rows: CashFlowRow[] = sortedKeys
          .filter((k) => periods[k])
          .map((key) => {
            const { income, expense } = periods[key];
            const net = income - expense;
            cum += net;
            totalIncome += income;
            totalExpense += expense;
            return { period: key, income, expense, net, cumulative: cum };
          });
        return { eventId, eventName: name, rows, totalIncome, totalExpense, totalNet: totalIncome - totalExpense };
      });

    return { consolidatedRows, eventBreakdown };
  }, [transactions, generated, granularity]);

  const totalIncome = consolidatedRows.reduce((s, r) => s + r.income, 0);
  const totalExpense = consolidatedRows.reduce((s, r) => s + r.expense, 0);
  const totalNet = totalIncome - totalExpense;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="glass rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data Início</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setGenerated(false); }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setGenerated(false); }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Conta</label>
            <select
              value={selectedAccountId}
              onChange={(e) => { setSelectedAccountId(e.target.value); setGenerated(false); }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-[180px]"
            >
              <option value="">Todas as contas</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Granularidade</label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as Granularity)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="monthly">Mensal</option>
              <option value="weekly">Semanal</option>
            </select>
          </div>
          <button
            onClick={handleGenerate}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Gerar
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="group-event" checked={groupByEvent} onCheckedChange={setGroupByEvent} />
          <Label htmlFor="group-event" className="text-sm">Separar por evento</Label>
        </div>
      </div>

      {generated && isLoading && (
        <p className="py-8 text-center text-muted-foreground">A carregar dados…</p>
      )}

      {generated && !isLoading && consolidatedRows.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">Sem transações no período selecionado.</p>
      )}

      {/* Consolidated Table */}
      {generated && !isLoading && consolidatedRows.length > 0 && (
        <div className="space-y-6">
          <div className="glass rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border/50">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Fluxo de Caixa Consolidado
              </h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Receitas</TableHead>
                    <TableHead className="text-right">Despesas</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Acumulado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consolidatedRows.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell className="font-medium">{formatPeriodLabel(row.period, granularity)}</TableCell>
                      <TableCell className="text-right text-success">{formatCurrency(row.income)}</TableCell>
                      <TableCell className="text-right text-warning">{formatCurrency(row.expense)}</TableCell>
                      <TableCell className={`text-right font-semibold ${row.net >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(row.net)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${row.cumulative >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(row.cumulative)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals */}
                  <TableRow className="border-t-2 border-border font-bold bg-muted/30">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(totalIncome)}</TableCell>
                    <TableCell className="text-right text-warning">{formatCurrency(totalExpense)}</TableCell>
                    <TableCell className={`text-right ${totalNet >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(totalNet)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Per-event breakdown */}
          {groupByEvent && eventBreakdown.length > 0 && (
            <div className="space-y-4">
              {eventBreakdown.map((evt) => (
                <div key={evt.eventId} className="glass rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-border/50 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{evt.eventName}</h3>
                    <span className={`text-sm font-mono font-semibold ${evt.totalNet >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(evt.totalNet)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Período</TableHead>
                          <TableHead className="text-right">Receitas</TableHead>
                          <TableHead className="text-right">Despesas</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {evt.rows.map((row) => (
                          <TableRow key={row.period}>
                            <TableCell className="font-medium">{formatPeriodLabel(row.period, granularity)}</TableCell>
                            <TableCell className="text-right text-success">{formatCurrency(row.income)}</TableCell>
                            <TableCell className="text-right text-warning">{formatCurrency(row.expense)}</TableCell>
                            <TableCell className={`text-right font-semibold ${row.net >= 0 ? "text-success" : "text-destructive"}`}>
                              {formatCurrency(row.net)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t border-border font-bold bg-muted/30">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right text-success">{formatCurrency(evt.totalIncome)}</TableCell>
                          <TableCell className="text-right text-warning">{formatCurrency(evt.totalExpense)}</TableCell>
                          <TableCell className={`text-right ${evt.totalNet >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(evt.totalNet)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
