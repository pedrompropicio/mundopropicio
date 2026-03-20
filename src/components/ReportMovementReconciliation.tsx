import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { FileSpreadsheet, FileText, ArrowLeftRight } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { exportMovementReconciliationToExcel, exportMovementReconciliationToPDF } from "@/lib/export-movement-reconciliation";

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

  const txIds = useMemo(() => allTransactions.map((t: any) => t.id), [allTransactions]);

  const { data: auditEntries = [] } = useQuery({
    queryKey: ["movement-report-audit", txIds],
    queryFn: async () => {
      if (txIds.length === 0) return [];
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

  const movements = useMemo(() => {
    const auditByTx = new Map<string, any[]>();
    auditEntries.forEach((e: any) => {
      const list = auditByTx.get(e.transaction_id) || [];
      list.push(e);
      auditByTx.set(e.transaction_id, list);
    });

    const expandedEventIds = selectedEventIds.length > 0
      ? [...selectedEventIds, ...events.filter((e: any) => selectedEventIds.includes(e.parent_event_id)).map((e: any) => e.id)]
      : [];

    const selectedAccNames = selectedAccountIds.map((id) => accountNameMap[id]).filter(Boolean);
    const result: any[] = [];

    allTransactions.forEach((tx: any) => {
      const isExpense = tx.type === "expense";
      const eventId = tx.event_id;
      const eventName = tx.events?.name ?? "—";
      const supplierName = tx.suppliers?.name ?? "—";

      if (expandedEventIds.length > 0 && (!eventId || !expandedEventIds.includes(eventId))) return;

      const txAccountName = tx.financial_accounts?.name ?? null;
      const txAudit = auditByTx.get(tx.id) || [];
      const accountEntries = txAudit.filter((a: any) => a.field_name === "Conta de pagamento" || a.field_name === "Conta de recebimento");
      const auditAccNames = accountEntries.map((a: any) => parseAccountName(a.new_value));

      if (selectedAccNames.length > 0) {
        const hasMatch = (txAccountName && selectedAccNames.includes(txAccountName)) || auditAccNames.some((n: string) => selectedAccNames.includes(n));
        if (!hasMatch) return;
      }

      const amount = Number(tx.amount);
      const ivaRate = Number(tx.iva_rate ?? 0);
      const netAmount = ivaRate > 0 ? amount / (1 + ivaRate / 100) : amount;
      const ivaAmount = amount - netAmount;
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

      let accountDisplay = txAccountName ?? "—";
      if (accountEntries.length > 0) accountDisplay = auditAccNames.join(", ");

      const noteEntries = txAudit.filter((a: any) => a.field_name === "Nota de pagamento" || a.field_name === "Nota de recebimento");
      const notes = noteEntries.map((n: any) => n.new_value).filter(Boolean).join("; ");

      result.push({
        id: tx.id, date: tx.date, dueDate: tx.due_date, paymentDate: tx.payment_date,
        accountName: accountDisplay, isExpense, type: isExpense ? "Despesa" : "Receita",
        description: tx.description, specification: tx.specification,
        eventId, eventName, supplierName,
        amount, netAmount, ivaAmount, ivaRate, paidAmount, balance,
        status, statusClass, invoiceRef: tx.invoice_ref ?? "", note: notes,
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
  const totalNetExpenses = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.netAmount, 0);
  const totalNetIncome = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.netAmount, 0);
  const totalIvaExpenses = movements.filter((m) => m.isExpense).reduce((s, m) => s + m.ivaAmount, 0);
  const totalIvaIncome = movements.filter((m) => !m.isExpense).reduce((s, m) => s + m.ivaAmount, 0);

  const activeAccounts = accounts.filter((a: any) => a.is_active);

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    setGenerated(false);
  }

  const exportParams = {
    movements, accountLabel: accountsLabel, eventLabel, dateFrom: fullPeriod ? "" : dateFrom,
    dateTo: fullPeriod ? "" : dateTo, totalPaid, totalReceived,
  };

  const periodLabel = fullPeriod ? "Período Completo" : `${dateFrom ? new Date(dateFrom).toLocaleDateString("pt-PT") : "—"} a ${dateTo ? new Date(dateTo).toLocaleDateString("pt-PT") : "—"}`;
  const accountsLabel = selectedAccountIds.length > 0 ? selectedAccountIds.map((id) => accountNameMap[id]).join(", ") : "Todas";
  const eventLabel = selectedEventIds.length > 0 ? events.find((e: any) => e.id === selectedEventIds[0])?.name ?? "—" : "Todos";

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          header, nav, .no-print, .glass { display: none !important; }
          .print-area { display: block !important; }
          .print-table { font-size: 7.5pt !important; }
          .print-table th, .print-table td { padding: 2px 4px !important; border: 0.5px solid #ccc !important; }
          .print-table th { background: #f0f0f0 !important; color: #333 !important; font-weight: 700 !important; }
          .print-header { display: block !important; margin-bottom: 8px; }
          .print-summary { display: flex !important; gap: 12px; margin-bottom: 8px; }
          .print-summary-item { border: 1px solid #ccc; padding: 4px 8px; font-size: 8pt; }
          * { color: #000 !important; background: transparent !important; }
          .print-type-expense { color: #b45309 !important; }
          .print-type-income { color: #16a34a !important; }
          .print-status { padding: 1px 4px; border-radius: 3px; font-size: 7pt; }
          .print-open { color: #dc2626 !important; font-weight: 700 !important; }
        }
      `}</style>

      <div className="space-y-6">
        {/* Filters - hidden on print */}
        <div className="glass rounded-xl p-4 space-y-4 no-print">
          <p className="text-sm font-medium">Parâmetros do Relatório</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={fullPeriod}
                  onChange={(e) => { setFullPeriod(e.target.checked); setGenerated(false); }}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer" />
                <span className="text-sm font-medium">Período Completo</span>
                <span className="text-xs text-muted-foreground">(todas as transações)</span>
              </label>
            </div>
            {!fullPeriod && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Início *</label>
                  <input type="date" value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setGenerated(false); }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Fim *</label>
                  <input type="date" value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setGenerated(false); }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </>
            )}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Contas (opcional)</label>
              <div className="flex flex-wrap gap-1.5">
                {activeAccounts.map((a: any) => {
                  const isSelected = selectedAccountIds.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => toggleAccount(a.id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                      {a.name}
                    </button>
                  );
                })}
              </div>
              {selectedAccountIds.length === 0 && <p className="mt-1 text-[10px] text-muted-foreground">Todas as contas</p>}
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Evento (opcional)</label>
              <SearchableSelect
                options={events.filter((e: any) => !e.parent_event_id).map((e: any) => ({ value: e.id, label: e.name }))}
                value={selectedEventIds.length === 1 ? selectedEventIds[0] : ""}
                onValueChange={(val) => { setSelectedEventIds(val ? [val] : []); setGenerated(false); }}
                placeholder="Todos os eventos" searchPlaceholder="Pesquisar evento…" />
              {selectedEventIds.length > 0 && (
                <button onClick={() => { setSelectedEventIds([]); setGenerated(false); }} className="mt-1 text-[10px] text-primary hover:underline">Limpar</button>
              )}
            </div>
            <div className="flex items-end">
              <button onClick={() => setGenerated(true)} disabled={!fullPeriod && (!dateFrom || !dateTo)}
                className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
                Consultar
              </button>
            </div>
          </div>
        </div>

        {generated && (
          <>
            {/* Action buttons */}
            <div className="flex items-center justify-between no-print">
              <p className="text-sm text-muted-foreground">
                {movements.length} transaç{movements.length !== 1 ? "ões" : "ão"}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportMovementReconciliationToExcel(exportParams)} disabled={movements.length === 0}>
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportMovementReconciliationToPDF(exportParams)} disabled={movements.length === 0}>
                  <FileText className="mr-1.5 h-4 w-4" /> PDF
                </Button>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-6 no-print">
              <SummaryCard label="Total Despesas" value={formatCurrency(totalExpenses)} sub={`Líq: ${formatCurrency(totalNetExpenses)}`} color="text-warning" />
              <SummaryCard label="Total Receitas" value={formatCurrency(totalIncome)} sub={`Líq: ${formatCurrency(totalNetIncome)}`} color="text-success" />
              <SummaryCard label="Pago" value={formatCurrency(totalPaid)} color="text-warning" />
              <SummaryCard label="Recebido" value={formatCurrency(totalReceived)} color="text-success" />
              <SummaryCard label="Aberto (Desp.)" value={formatCurrency(totalOpenExpenses)} color={totalOpenExpenses > 0 ? "text-destructive" : "text-muted-foreground"} />
              <SummaryCard label="Aberto (Rec.)" value={formatCurrency(totalOpenIncome)} color={totalOpenIncome > 0 ? "text-warning" : "text-muted-foreground"} />
            </div>

            {/* Print header (hidden on screen) */}
            <div className="print-header hidden" ref={printRef}>
              <div style={{ fontWeight: 700, fontSize: "12pt", marginBottom: 2 }}>RELATÓRIO DE MOVIMENTAÇÕES</div>
              <div style={{ fontSize: "8pt" }}>Período: {periodLabel} | Contas: {accountsLabel} | Evento: {eventLabel}</div>
              <div className="print-summary" style={{ display: "none" }}>
                <span className="print-summary-item">Despesas: {formatCurrency(totalExpenses)} (Líq: {formatCurrency(totalNetExpenses)})</span>
                <span className="print-summary-item">Receitas: {formatCurrency(totalIncome)} (Líq: {formatCurrency(totalNetIncome)})</span>
                <span className="print-summary-item">Pago: {formatCurrency(totalPaid)}</span>
                <span className="print-summary-item">Recebido: {formatCurrency(totalReceived)}</span>
                <span className="print-summary-item">Aberto Desp: {formatCurrency(totalOpenExpenses)}</span>
                <span className="print-summary-item">Aberto Rec: {formatCurrency(totalOpenIncome)}</span>
              </div>
            </div>

            {/* Table */}
            {movements.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center no-print">
                <ArrowLeftRight className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Sem transações para os filtros selecionados.</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden overflow-x-auto glass print-area">
                <table className="w-full text-left print-table" style={{ borderCollapse: "collapse" }}>
                  {(() => {
                    const grouped = new Map<string, { eventName: string; items: typeof movements }>();
                    movements.forEach((m) => {
                      const key = m.eventId || "__no_event__";
                      if (!grouped.has(key)) grouped.set(key, { eventName: m.eventName, items: [] });
                      grouped.get(key)!.items.push(m);
                    });

                    const colHeaders = (
                      <tr className="border-b border-border bg-secondary/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 px-2">Data</th>
                        <th className="py-2 px-2">Tipo</th>
                        <th className="py-2 px-2">Descrição</th>
                        <th className="py-2 px-2">Fornecedor</th>
                        <th className="py-2 px-1">Conta</th>
                        <th className="py-2 px-1">Estado</th>
                        <th className="py-2 px-1 text-center">IVA</th>
                        <th className="py-2 px-1 text-right">Líquido</th>
                        <th className="py-2 px-1 text-right">IVA (€)</th>
                        <th className="py-2 px-1 text-right">Bruto</th>
                        <th className="py-2 px-1 text-right">Pago</th>
                        <th className="py-2 px-1 text-right">Aberto</th>
                        <th className="py-2 px-1">Vcto</th>
                        <th className="py-2 px-1">Dt Pgto</th>
                        <th className="py-2 px-1">Nº Doc</th>
                      </tr>
                    );

                    const totalCols = 15;
                    const groupEntries = Array.from(grouped.entries());

                    return (
                      <tbody className="text-xs">
                        {groupEntries.map(([key, group], gi) => (
                          <>
                            <tr key={`hdr-${key}`}>
                              <td colSpan={totalCols} className={`py-2 px-2 font-bold text-sm bg-primary/10 border-b border-primary/20 ${gi > 0 ? "pt-6" : ""}`}>
                                {group.eventName === "—" ? "Sem Evento" : group.eventName}
                              </td>
                            </tr>
                            {colHeaders}
                            {group.items.map((m) => (
                              <tr key={m.id} className={`hover:bg-secondary/20 transition-colors border-b border-border/30 ${m.status === "Liquidado" ? "opacity-70" : ""}`}>
                                <td className="py-1.5 px-2 whitespace-nowrap">{new Date(m.date).toLocaleDateString("pt-PT")}</td>
                                <td className="py-1.5 px-2">
                                  <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${m.isExpense ? "bg-warning/15 text-warning print-type-expense" : "bg-success/15 text-success print-type-income"}`}>
                                    {m.type}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 font-medium max-w-[200px]">
                                  <span className="block truncate" title={m.description}>{m.description}</span>
                                </td>
                                <td className="py-1.5 px-2 text-muted-foreground max-w-[120px]">
                                  <span className="block truncate" title={m.supplierName}>{m.supplierName}</span>
                                </td>
                                <td className="py-1.5 px-1 text-muted-foreground max-w-[90px]">
                                  <span className="block truncate" title={m.accountName}>{m.accountName}</span>
                                </td>
                                <td className="py-1.5 px-1">
                                  <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold print-status ${m.statusClass}`}>
                                    {m.status}
                                  </span>
                                </td>
                                <td className="py-1.5 px-1 text-center font-mono">{m.ivaRate}%</td>
                                <td className="py-1.5 px-1 text-right font-mono text-muted-foreground">{formatCurrency(m.netAmount)}</td>
                                <td className="py-1.5 px-1 text-right font-mono text-muted-foreground">{formatCurrency(m.ivaAmount)}</td>
                                <td className={`py-1.5 px-1 text-right font-mono font-semibold ${m.isExpense ? "text-warning" : "text-success"}`}>
                                  {m.isExpense ? "-" : "+"}{formatCurrency(m.amount)}
                                </td>
                                <td className="py-1.5 px-1 text-right font-mono text-muted-foreground">{formatCurrency(m.paidAmount)}</td>
                                <td className={`py-1.5 px-1 text-right font-mono ${m.balance > 0 ? "text-destructive font-semibold print-open" : "text-muted-foreground"}`}>
                                  {formatCurrency(m.balance)}
                                </td>
                                <td className="py-1.5 px-1 whitespace-nowrap text-muted-foreground">{m.dueDate ? new Date(m.dueDate).toLocaleDateString("pt-PT") : "—"}</td>
                                <td className="py-1.5 px-1 whitespace-nowrap text-muted-foreground">{m.paymentDate ? new Date(m.paymentDate).toLocaleDateString("pt-PT") : "—"}</td>
                                <td className="py-1.5 px-1 text-muted-foreground">{m.invoiceRef || "—"}</td>
                              </tr>
                            ))}
                          </>
                        ))}
                        {/* Totals */}
                        <tr className="border-t-2 border-primary/30 bg-primary/5 font-bold text-[10px]">
                          <td colSpan={7} className="py-2 px-2 uppercase tracking-wider">Totais Despesas</td>
                          <td className="py-2 px-1 text-right font-mono text-warning">{formatCurrency(totalNetExpenses)}</td>
                          <td className="py-2 px-1 text-right font-mono text-warning">{formatCurrency(totalIvaExpenses)}</td>
                          <td className="py-2 px-1 text-right font-mono text-warning">{formatCurrency(totalExpenses)}</td>
                          <td className="py-2 px-1 text-right font-mono">{formatCurrency(totalPaid)}</td>
                          <td className="py-2 px-1 text-right font-mono text-destructive">{formatCurrency(totalOpenExpenses)}</td>
                          <td colSpan={3} />
                        </tr>
                        <tr className="bg-primary/5 font-bold text-[10px]">
                          <td colSpan={7} className="py-2 px-2 uppercase tracking-wider">Totais Receitas</td>
                          <td className="py-2 px-1 text-right font-mono text-success">{formatCurrency(totalNetIncome)}</td>
                          <td className="py-2 px-1 text-right font-mono text-success">{formatCurrency(totalIvaIncome)}</td>
                          <td className="py-2 px-1 text-right font-mono text-success">{formatCurrency(totalIncome)}</td>
                          <td className="py-2 px-1 text-right font-mono">{formatCurrency(totalReceived)}</td>
                          <td className="py-2 px-1 text-right font-mono text-warning">{formatCurrency(totalOpenIncome)}</td>
                          <td colSpan={3} />
                        </tr>
                        <tr className="bg-primary/10 font-bold text-[10px] border-t border-primary/30">
                          <td colSpan={7} className="py-2 px-2 uppercase tracking-wider">Saldo</td>
                          <td className="py-2 px-1 text-right font-mono">{formatCurrency(totalNetIncome - totalNetExpenses)}</td>
                          <td className="py-2 px-1 text-right font-mono">{formatCurrency(totalIvaIncome - totalIvaExpenses)}</td>
                          <td className="py-2 px-1 text-right font-mono">{formatCurrency(totalIncome - totalExpenses)}</td>
                          <td className="py-2 px-1 text-right font-mono">{formatCurrency(totalReceived - totalPaid)}</td>
                          <td className="py-2 px-1 text-right font-mono">{formatCurrency(totalOpenIncome - totalOpenExpenses)}</td>
                          <td colSpan={3} />
                        </tr>
                      </tbody>
                    );
                  })()}
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="glass rounded-xl p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-base font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function parseAccountName(newValue: string | null): string {
  if (!newValue) return "";
  const parts = newValue.split(" — ");
  return parts[0] ?? "";
}
