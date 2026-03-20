import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ArrowLeftRight } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { exportMovementReconciliationToExcel } from "@/lib/export-movement-reconciliation";

export default function ReportMovementReconciliation() {
  const { isAdmin } = useAuth();
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fullPeriod, setFullPeriod] = useState(false);
  const [generated, setGenerated] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-list-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, parent_event_id").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch ALL transactions for the period (not just paid)
  const { data: allTransactions = [] } = useQuery({
    queryKey: ["movement-report-tx", dateFrom, dateTo, fullPeriod],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*, events(name, parent_event_id), suppliers(name), financial_accounts(name)")
        .order("date", { ascending: true });
      if (!fullPeriod) {
        if (dateFrom) q = q.gte("date", dateFrom);
        if (dateTo) q = q.lte("date", dateTo);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: generated,
  });

  // Audit log for account details on paid transactions
  const txIds = useMemo(() => allTransactions.map((t: any) => t.id), [allTransactions]);

  const { data: auditEntries = [] } = useQuery({
    queryKey: ["movement-report-audit", txIds],
    queryFn: async () => {
      if (txIds.length === 0) return [];
      // Supabase has a limit, batch if needed
      const batchSize = 200;
      const results: any[] = [];
      for (let i = 0; i < txIds.length; i += batchSize) {
        const batch = txIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("transaction_audit_log")
          .select("*")
          .in("transaction_id", batch)
          .in("field_name", [
            "Conta de pagamento", "Conta de recebimento",
            "Nota de pagamento", "Nota de recebimento",
          ])
          .order("changed_at", { ascending: true });
        if (error) throw error;
        if (data) results.push(...data);
      }
      return results;
    },
    enabled: generated && txIds.length > 0,
  });

  const accountNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((a: any) => { map[a.id] = a.name; });
    return map;
  }, [accounts]);

  // Build movement lines
  const movements = useMemo(() => {
    const auditByTx = new Map<string, any[]>();
    auditEntries.forEach((e: any) => {
      const list = auditByTx.get(e.transaction_id) || [];
      list.push(e);
      auditByTx.set(e.transaction_id, list);
    });

    const expandedEventIds = selectedEventIds.length > 0
      ? [
          ...selectedEventIds,
          ...events.filter((e: any) => selectedEventIds.includes(e.parent_event_id)).map((e: any) => e.id),
        ]
      : [];

    const selectedAccNames = selectedAccountIds.map((id) => accountNameMap[id]).filter(Boolean);

    const result: any[] = [];

    allTransactions.forEach((tx: any) => {
      const isExpense = tx.type === "expense";
      const eventId = tx.event_id;
      const eventName = tx.events?.name ?? "—";
      const supplierName = tx.suppliers?.name ?? "—";

      // Event filter
      if (expandedEventIds.length > 0 && (!eventId || !expandedEventIds.includes(eventId))) return;

      // Account filter (by transaction's account_id or audit account name)
      const txAccountName = tx.financial_accounts?.name ?? null;
      const txAudit = auditByTx.get(tx.id) || [];
      const accountEntries = txAudit.filter((a: any) =>
        a.field_name === "Conta de pagamento" || a.field_name === "Conta de recebimento"
      );
      const auditAccNames = accountEntries.map((a: any) => parseAccountName(a.new_value));

      if (selectedAccNames.length > 0) {
        const hasMatch = (txAccountName && selectedAccNames.includes(txAccountName)) ||
          auditAccNames.some((n: string) => selectedAccNames.includes(n));
        if (!hasMatch) return;
      }

      const amount = Number(tx.amount);
      const paidAmount = Number(tx.paid_amount ?? 0);
      const balance = amount - paidAmount;
      const isPaid = paidAmount >= amount;

      const status = (() => {
        if (tx.status === "paid" || isPaid) return "Liquidado";
        if (tx.status === "approved") return isExpense ? "A Pagar" : "Aprovado";
        if (isExpense && tx.due_date && new Date(tx.due_date) < new Date() && tx.status !== "paid") return "Atrasado";
        return "Aguardando";
      })();

      const statusClass = (() => {
        if (status === "Liquidado") return "bg-success/15 text-success";
        if (status === "A Pagar" || status === "Aprovado") return "bg-blue-500/15 text-blue-400";
        if (status === "Atrasado") return "bg-destructive/15 text-destructive";
        return "bg-warning/15 text-warning";
      })();

      // Get account info
      let accountDisplay = txAccountName ?? "—";
      if (accountEntries.length > 0) {
        accountDisplay = auditAccNames.join(", ");
      }

      // Get notes from audit
      const noteEntries = txAudit.filter((a: any) =>
        a.field_name === "Nota de pagamento" || a.field_name === "Nota de recebimento"
      );
      const notes = noteEntries.map((n: any) => n.new_value).filter(Boolean).join("; ");

      result.push({
        id: tx.id,
        date: tx.date,
        dueDate: tx.due_date,
        paymentDate: tx.payment_date,
        accountName: accountDisplay,
        isExpense,
        type: isExpense ? "Despesa" : "Receita",
        description: tx.description,
        specification: tx.specification,
        eventId,
        eventName,
        supplierName,
        amount,
        paidAmount,
        balance,
        status,
        statusClass,
        invoiceRef: tx.invoice_ref ?? "",
        ivaRate: tx.iva_rate ?? 0,
        note: notes,
      });
    });

    return result;
  }, [allTransactions, auditEntries, selectedAccountIds, selectedEventIds, accountNameMap, events]);

  const totalExpenses = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.amount, 0);
  const totalIncome = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.amount, 0);
  const totalPaid = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.paidAmount, 0);
  const totalReceived = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.paidAmount, 0);
  const totalOpenExpenses = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.balance, 0);
  const totalOpenIncome = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.balance, 0);

  const activeAccounts = accounts.filter((a: any) => a.is_active);

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setGenerated(false);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="glass rounded-xl p-4 space-y-4">
        <p className="text-sm font-medium">Parâmetros do Relatório</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fullPeriod}
                onChange={(e) => { setFullPeriod(e.target.checked); setGenerated(false); }}
                className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
              <span className="text-sm font-medium">Período Completo</span>
              <span className="text-xs text-muted-foreground">(todas as transações sem filtro de data)</span>
            </label>
          </div>
          {!fullPeriod && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Início *</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setGenerated(false); }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Fim *</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setGenerated(false); }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Contas (opcional)</label>
            <div className="flex flex-wrap gap-1.5">
              {activeAccounts.map((a: any) => {
                const isSelected = selectedAccountIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAccount(a.id)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
            {selectedAccountIds.length === 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">Todas as contas serão incluídas</p>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento (opcional)</label>
            <SearchableSelect
              options={events.filter((e: any) => !e.parent_event_id).map((e: any) => ({ value: e.id, label: e.name }))}
              value={selectedEventIds.length === 1 ? selectedEventIds[0] : ""}
              onValueChange={(val) => { setSelectedEventIds(val ? [val] : []); setGenerated(false); }}
              placeholder="Todos os eventos"
              searchPlaceholder="Pesquisar evento…"
            />
            {selectedEventIds.length > 0 && (
              <button onClick={() => { setSelectedEventIds([]); setGenerated(false); }} className="mt-1 text-[10px] text-primary hover:underline">
                Limpar filtro de evento
              </button>
            )}
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setGenerated(true)}
              disabled={!fullPeriod && (!dateFrom || !dateTo)}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              Consultar
            </button>
          </div>
        </div>
      </div>

      {generated && (
        <>
          {/* Export */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {movements.length} transaç{movements.length !== 1 ? "ões" : "ão"} encontrada{movements.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={() => exportMovementReconciliationToExcel(
                movements,
                selectedAccountIds.length > 0
                  ? selectedAccountIds.map((id) => accountNameMap[id]).join(", ")
                  : "Todas",
                fullPeriod ? "" : dateFrom,
                fullPeriod ? "" : dateTo,
                totalPaid,
                totalReceived
              )}
              disabled={movements.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar Excel</span>
            </button>
          </div>

          {/* Summary */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <div className="glass rounded-xl p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Despesas</p>
              <p className="mt-1 text-lg font-bold text-warning">{formatCurrency(totalExpenses)}</p>
              <p className="text-[10px] text-muted-foreground">Pago: {formatCurrency(totalPaid)}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Receitas</p>
              <p className="mt-1 text-lg font-bold text-success">{formatCurrency(totalIncome)}</p>
              <p className="text-[10px] text-muted-foreground">Recebido: {formatCurrency(totalReceived)}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Em Aberto (Desp.)</p>
              <p className={`mt-1 text-lg font-bold ${totalOpenExpenses > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {formatCurrency(totalOpenExpenses)}
              </p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Em Aberto (Rec.)</p>
              <p className={`mt-1 text-lg font-bold ${totalOpenIncome > 0 ? "text-warning" : "text-muted-foreground"}`}>
                {formatCurrency(totalOpenIncome)}
              </p>
            </div>
          </div>

          {/* Table */}
          {movements.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <ArrowLeftRight className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Sem transações para os filtros selecionados.</p>
            </div>
          ) : (
            <div className="glass rounded-xl overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="hidden md:table-cell">Evento</TableHead>
                    <TableHead className="hidden lg:table-cell">Fornecedor</TableHead>
                    <TableHead className="hidden lg:table-cell">Conta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Pago</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Aberto</TableHead>
                    <TableHead className="hidden lg:table-cell">IVA</TableHead>
                    <TableHead className="hidden xl:table-cell">Nº Doc</TableHead>
                    <TableHead className="hidden xl:table-cell">Vcto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id} className={m.status === "Liquidado" ? "opacity-70" : ""}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(m.date).toLocaleDateString("pt-PT")}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.isExpense ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
                        }`}>
                          {m.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{m.description}</p>
                        {m.specification && <p className="text-[10px] text-muted-foreground">{m.specification}</p>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{m.eventName}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{m.supplierName}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{m.accountName}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m.statusClass}`}>
                          {m.status}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${m.isExpense ? "text-warning" : "text-success"}`}>
                        {m.isExpense ? "-" : "+"}{formatCurrency(m.amount)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right font-mono text-sm text-muted-foreground">
                        {formatCurrency(m.paidAmount)}
                      </TableCell>
                      <TableCell className={`hidden sm:table-cell text-right font-mono text-sm ${m.balance > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        {formatCurrency(m.balance)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-center text-xs">{m.ivaRate}%</TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">{m.invoiceRef || "—"}</TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {m.dueDate ? new Date(m.dueDate).toLocaleDateString("pt-PT") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals */}
                  <TableRow className="border-t-2 border-primary/30 bg-primary/5 font-bold">
                    <TableCell colSpan={7} className="text-xs uppercase tracking-wider">Totais</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <div className="text-warning">{formatCurrency(totalExpenses)}</div>
                      <div className="text-success">{formatCurrency(totalIncome)}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                      <div className="text-warning">{formatCurrency(totalPaid)}</div>
                      <div className="text-success">{formatCurrency(totalReceived)}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                      <div className="text-destructive">{formatCurrency(totalOpenExpenses)}</div>
                      <div className="text-warning">{formatCurrency(totalOpenIncome)}</div>
                    </TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function parseAccountName(newValue: string | null): string {
  if (!newValue) return "";
  const parts = newValue.split(" — ");
  return parts[0] ?? "";
}
