import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { addDays, format, startOfDay, addMonths } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAccountTrueBalancesAsOf } from "@/lib/account-balance-rpc";

export default function ReportTreasuryProjection() {
  const [horizon, setHorizon] = useState("3");

  const { data: accounts = [] } = useQuery({
    queryKey: ["treasury-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, initial_balance, initial_balance_date, skip_balance_check, is_active, type")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  /**
   * D-ERP36: o saldo de partida vem do SERVIDOR (`account_true_balances_asof`,
   * `_as_of = NULL` = hoje). Somado no cliente ficava acima do real para quem
   * não tem `view_confidential`, porque a policy RESTRICTIVE esconde as linhas
   * confidenciais.
   */
  const accountIds = (accounts as any[]).map((a) => a.id);

  const { data: serverBalances } = useQuery({
    queryKey: ["treasury-server-balances", accountIds.join(",")],
    enabled: accountIds.length > 0,
    queryFn: () => fetchAccountTrueBalancesAsOf(accountIds, null),
  });

  // Contas "Sem controlo de saldo" não entram no saldo de partida: o seu saldo
  // não é número (issue #90). Ficam sinalizadas no interface.
  const uncontrolledAccounts = (accounts as any[]).filter((a) => a.skip_balance_check);

  // Contas cujo saldo o utilizador não pode ver: ficam FORA da projeção (não
  // podem contribuir zero para um total, que pareceria certo e estaria errado).
  const hiddenAccounts = (accounts as any[]).filter(
    (a) => !a.skip_balance_check && serverBalances && (serverBalances.get(a.id) ?? null) === null,
  );

  const { data: pendingTxs = [] } = useQuery({
    queryKey: ["treasury-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, type, due_date, date, status")
        .in("status", ["pending", "approved"]);
      if (error) throw error;
      return data;
    },
  });

  const projection = useMemo(() => {
    // Saldo de partida pela fonte única (respeita skip_balance_check e a data
    // de corte do saldo inicial). Contas sem controlo devolvem null e ficam
    // fora da soma.
    let currentBalance = 0;
    for (const acc of accounts as any[]) {
      const bal = computeAccountBalance(acc, paidTxs as any, cashAdjustments);
      if (bal === null) continue;
      currentBalance += bal;
    }

    const today = startOfDay(new Date());
    const endDate = addMonths(today, Number(horizon));
    const days: { date: string; balance: number; label: string }[] = [];

    // Group pending by date
    const pendingByDate = new Map<string, number>();
    for (const tx of pendingTxs) {
      const d = tx.due_date ?? tx.date;
      if (!d) continue;
      const key = d;
      const impact = tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
      pendingByDate.set(key, (pendingByDate.get(key) ?? 0) + impact);
    }

    let runningBalance = currentBalance;
    let current = today;
    while (current <= endDate) {
      const key = format(current, "yyyy-MM-dd");
      const impact = pendingByDate.get(key) ?? 0;
      runningBalance += impact;
      // Only add weekly points to avoid clutter
      if (current.getDay() === 1 || current.getTime() === today.getTime()) {
        days.push({ date: key, balance: runningBalance, label: format(current, "dd/MM") });
      }
      current = addDays(current, 1);
    }

    return days;
  }, [accounts, paidTxs, pendingTxs, horizon, cashAdjustments]);

  const chartConfig = { balance: { label: "Saldo Projetado", color: "hsl(var(--primary))" } };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Horizonte:</span>
        <Select value={horizon} onValueChange={setHorizon}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 mês</SelectItem>
            <SelectItem value="3">3 meses</SelectItem>
            <SelectItem value="6">6 meses</SelectItem>
            <SelectItem value="12">12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {uncontrolledAccounts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {uncontrolledAccounts.length === 1 ? "1 conta sem controlo de saldo" : `${uncontrolledAccounts.length} contas sem controlo de saldo`} — saldo não controlado, fora desta projeção
          {": "}
          {uncontrolledAccounts.map((a: any) => a.name).join(", ")}.
        </p>
      )}



      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Saldo Atual</p>
          <p className={`text-lg font-bold font-mono ${(projection[0]?.balance ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(projection[0]?.balance ?? 0)}
          </p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Mínimo Projetado</p>
          <p className={`text-lg font-bold font-mono ${Math.min(...projection.map((d) => d.balance)) >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(Math.min(...projection.map((d) => d.balance)))}
          </p>
        </div>
        <div className="glass rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Saldo Final</p>
          <p className={`text-lg font-bold font-mono ${(projection[projection.length - 1]?.balance ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(projection[projection.length - 1]?.balance ?? 0)}
          </p>
        </div>
      </div>

      {projection.length > 0 && (
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <AreaChart data={projection}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
            <ChartTooltip content={<ChartTooltipContent formatter={(val) => formatCurrency(Number(val))} />} />
            <Area type="monotone" dataKey="balance" stroke="hsl(var(--primary))" fill="url(#balanceGradient)" strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
