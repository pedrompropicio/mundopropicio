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

  // Primary source: transactions with payment_date in the period
  const { data: paidTransactions = [] } = useQuery({
    queryKey: ["movement-reconciliation-paid-tx", dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*, events(name, parent_event_id), suppliers(name), financial_accounts(name)")
        .gt("paid_amount", 0)
        .order("payment_date", { ascending: true });
      if (dateFrom) q = q.gte("payment_date", dateFrom);
      if (dateTo) q = q.lte("payment_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: generated,
  });

  // Secondary source: audit log entries for account details (partial payments)
  const txIds = useMemo(() => paidTransactions.map((t: any) => t.id), [paidTransactions]);

  const { data: auditEntries = [] } = useQuery({
    queryKey: ["movement-reconciliation-audit-details", txIds],
    queryFn: async () => {
      if (txIds.length === 0) return [];
      const { data, error } = await supabase
        .from("transaction_audit_log")
        .select("*")
        .in("transaction_id", txIds)
        .in("field_name", [
          "Conta de pagamento", "Conta de recebimento",
          "Pagamento parcial", "Recebimento parcial",
          "Nota de pagamento", "Nota de recebimento",
        ])
        .order("changed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: generated && txIds.length > 0,
  });

  const accountNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((a: any) => { map[a.id] = a.name; });
    return map;
  }, [accounts]);

  // Build movement lines - combine transaction data with audit details
  const movements = useMemo(() => {
    // Group audit entries by transaction
    const auditByTx = new Map<string, any[]>();
    auditEntries.forEach((e: any) => {
      const list = auditByTx.get(e.transaction_id) || [];
      list.push(e);
      auditByTx.set(e.transaction_id, list);
    });

    // Compute expanded event IDs (selected + their sub-events)
    const expandedEventIds = selectedEventIds.length > 0
      ? [
          ...selectedEventIds,
          ...events.filter((e: any) => selectedEventIds.includes(e.parent_event_id)).map((e: any) => e.id),
        ]
      : [];

    // Selected account names
    const selectedAccNames = selectedAccountIds.map((id) => accountNameMap[id]).filter(Boolean);

    const result: any[] = [];

    paidTransactions.forEach((tx: any) => {
      const isExpense = tx.type === "expense";
      const eventId = tx.event_id;
      const eventName = tx.events?.name ?? "—";
      const supplierName = tx.suppliers?.name ?? "—";

      // Event filter
      if (expandedEventIds.length > 0 && (!eventId || !expandedEventIds.includes(eventId))) return;

      const txAudit = auditByTx.get(tx.id) || [];
      const accountEntries = txAudit.filter((a) =>
        a.field_name === "Conta de pagamento" || a.field_name === "Conta de recebimento"
      );

      if (accountEntries.length > 0) {
        // We have detailed audit entries - show each partial payment
        accountEntries.forEach((accEntry) => {
          const accountName = parseAccountName(accEntry.new_value);
          const movementAmount = parseAmount(accEntry.new_value);

          // Account filter
          if (selectedAccNames.length > 0 && !selectedAccNames.includes(accountName)) return;

          // Find associated note
          const noteEntry = txAudit.find(
            (a) => (a.field_name === "Nota de pagamento" || a.field_name === "Nota de recebimento") &&
              a.changed_at === accEntry.changed_at
          );

          result.push({
            id: accEntry.id,
            date: accEntry.changed_at,
            accountName,
            movementAmount,
            isPayment: isExpense,
            type: isExpense ? "Pagamento" : "Recebimento",
            transactionDescription: tx.description,
            eventId,
            eventName,
            supplierName,
            totalAmount: Number(tx.amount),
            paidAmount: Number(tx.paid_amount),
            invoiceRef: tx.invoice_ref ?? "",
            changedBy: accEntry.changed_by,
            note: noteEntry?.new_value ?? "",
            ivaRate: tx.iva_rate ?? 0,
          });
        });
      } else {
        // No audit entries - show transaction directly using account_id
        const accountName = tx.financial_accounts?.name ?? "—";

        // Account filter
        if (selectedAccNames.length > 0 && !selectedAccNames.includes(accountName)) return;

        result.push({
          id: tx.id,
          date: tx.payment_date ? `${tx.payment_date}T00:00:00` : tx.updated_at,
          accountName,
          movementAmount: Number(tx.paid_amount),
          isPayment: isExpense,
          type: isExpense ? "Pagamento" : "Recebimento",
          transactionDescription: tx.description,
          eventId,
          eventName,
          supplierName,
          totalAmount: Number(tx.amount),
          paidAmount: Number(tx.paid_amount),
          invoiceRef: tx.invoice_ref ?? "",
          changedBy: "—",
          note: "",
          ivaRate: tx.iva_rate ?? 0,
        });
      }
    });

    // Sort by date
    result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return result;
  }, [paidTransactions, auditEntries, selectedAccountIds, selectedEventIds, accountNameMap, events]);

  const totalPayments = movements.filter((m) => m.isPayment).reduce((s, m) => s + m.movementAmount, 0);
  const totalReceipts = movements.filter((m) => !m.isPayment).reduce((s, m) => s + m.movementAmount, 0);

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
              disabled={!dateFrom || !dateTo}
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
              {movements.length} movimento{movements.length !== 1 ? "s" : ""} encontrado{movements.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={() => exportMovementReconciliationToExcel(
                movements,
                selectedAccountIds.length > 0
                  ? selectedAccountIds.map((id) => accountNameMap[id]).join(", ")
                  : "Todas",
                dateFrom,
                dateTo,
                totalPayments,
                totalReceipts
              )}
              disabled={movements.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar Excel</span>
            </button>
          </div>

          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Pagamentos</p>
              <p className="mt-1 text-lg font-bold text-warning">{formatCurrency(totalPayments)}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Recebimentos</p>
              <p className="mt-1 text-lg font-bold text-success">{formatCurrency(totalReceipts)}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo Movimentos</p>
              <p className={`mt-1 text-lg font-bold ${totalReceipts - totalPayments >= 0 ? "text-success" : "text-destructive"}`}>
                {formatCurrency(totalReceipts - totalPayments)}
              </p>
            </div>
          </div>

          {/* Table */}
          {movements.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <ArrowLeftRight className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Sem movimentações para o período selecionado.</p>
            </div>
          ) : (
            <div className="glass rounded-xl overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="hidden md:table-cell">Evento</TableHead>
                    <TableHead className="hidden lg:table-cell">Fornecedor</TableHead>
                    <TableHead className="hidden lg:table-cell">Nº Doc</TableHead>
                    <TableHead className="text-right">Valor Mov.</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Valor Total</TableHead>
                    <TableHead className="hidden lg:table-cell">IVA</TableHead>
                    <TableHead className="hidden xl:table-cell">Nota</TableHead>
                    <TableHead className="hidden xl:table-cell">Utilizador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(m.date).toLocaleDateString("pt-PT")}
                        <span className="block text-[10px] text-muted-foreground">
                          {new Date(m.date).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.isPayment ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
                        }`}>
                          {m.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{m.accountName}</TableCell>
                      <TableCell>
                        <p className="text-sm">{m.transactionDescription}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{m.eventName}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{m.supplierName}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{m.invoiceRef || "—"}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${m.isPayment ? "text-warning" : "text-success"}`}>
                        {m.isPayment ? "-" : "+"}{formatCurrency(m.movementAmount)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right font-mono text-sm text-muted-foreground">
                        {formatCurrency(m.totalAmount)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-center text-xs">{m.ivaRate}%</TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground max-w-[150px] truncate">{m.note || "—"}</TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">{m.changedBy}</TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="border-t-2 border-primary/30 bg-primary/5 font-bold">
                    <TableCell colSpan={7} className="text-xs uppercase tracking-wider">Totais</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <div className="text-warning">{formatCurrency(totalPayments)}</div>
                      <div className="text-success">{formatCurrency(totalReceipts)}</div>
                    </TableCell>
                    <TableCell colSpan={4} />
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

function parseAmount(newValue: string | null): number {
  if (!newValue) return 0;
  const parts = newValue.split(" — ");
  if (parts.length < 2) return 0;
  const raw = parts[1].replace(/[^\d,.-]/g, "").replace(".", "").replace(",", ".");
  return parseFloat(raw) || 0;
}
