import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileSpreadsheet, Landmark, Lock, CalendarIcon, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { exportBankStatementToPDF, exportBankStatementToExcel } from "@/lib/export-bank-statement";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn, formatDatePT } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";

export default function ReportBankStatement() {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(searchParams.get("conta") ?? "");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [docsModal, setDocsModal] = useState<{ id: string; description: string } | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const dateFromStr = dateFrom ? format(dateFrom, "yyyy-MM-dd") : "";
  const dateToStr = dateTo ? format(dateTo, "yyyy-MM-dd") : "";

  const { data: transactions = [] } = useQuery({
    queryKey: ["bank-statement-tx", selectedAccountId, dateFromStr, dateToStr],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      let q = supabase
        .from("transactions")
        .select("*, events(name), suppliers(name)")
        .eq("account_id", selectedAccountId)
        .order("date", { ascending: true });
      if (dateFromStr) q = q.gte("date", dateFromStr);
      if (dateToStr) q = q.lte("date", dateToStr);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: generated && !!selectedAccountId,
  });

  const selectedAccount = accounts.find((a: any) => a.id === selectedAccountId);
  const canSeeBalance = selectedAccount && (isAdmin || selectedAccount.balance_visible_to_all);
  const isUncontrolledBalance = selectedAccount?.skip_balance_check ?? false;

  function handleGenerate() {
    if (!selectedAccountId) return;
    setGenerated(true);
  }

  // Compute running balance
  const statementLines = (() => {
    if (!generated || !canSeeBalance) return [];
    const initialBalance = Number(selectedAccount?.initial_balance ?? 0);

    // Get ALL transactions for this account before the start date to compute opening balance
    // For simplicity, we compute from initial balance + filtered transactions
    let runningBalance = initialBalance;

    // We need pre-period transactions to get correct opening balance
    // The query only returns filtered transactions, so we'll fetch all for this account
    return transactions.map((t: any) => {
      const amount = Number(t.amount);
      const isIncome = t.type === "income";
      if (isIncome) {
        runningBalance += amount;
      } else {
        runningBalance -= amount;
      }
      return {
        ...t,
        runningBalance,
        signedAmount: isIncome ? amount : -amount,
      };
    });
  })();

  // Fetch all transactions for opening balance calculation
  const { data: allAccountTx = [] } = useQuery({
    queryKey: ["bank-statement-all-tx", selectedAccountId, dateFromStr],
    queryFn: async () => {
      if (!selectedAccountId || !dateFromStr) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("type, amount")
        .eq("account_id", selectedAccountId)
        .lt("date", dateFromStr);
      if (error) throw error;
      return data;
    },
    enabled: generated && !!selectedAccountId && !!dateFromStr,
  });

  const txIdsForDocs = useMemo(() => transactions.map((t: any) => t.id), [transactions]);

  const { data: docCounts = {} } = useQuery({
    queryKey: ["tx-doc-counts-bs", txIdsForDocs],
    queryFn: async () => {
      if (txIdsForDocs.length === 0) return {};
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("transaction_id")
        .in("transaction_id", txIdsForDocs);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((d: any) => { counts[d.transaction_id] = (counts[d.transaction_id] || 0) + 1; });
      return counts;
    },
    enabled: generated && txIdsForDocs.length > 0,
  });

  const openingBalance = (() => {
    if (!canSeeBalance || !selectedAccount) return 0;
    let bal = Number(selectedAccount.initial_balance ?? 0);
    if (dateFromStr) {
      allAccountTx.forEach((t: any) => {
        const amt = Number(t.amount);
        if (t.type === "income") bal += amt;
        else bal -= amt;
      });
    }
    return bal;
  })();

  // Recompute running balance with correct opening
  const lines = (() => {
    if (!generated || !canSeeBalance) return [];
    let runningBalance = openingBalance;
    return transactions.map((t: any) => {
      const amount = Number(t.amount);
      const isIncome = t.type === "income";
      if (isIncome) runningBalance += amount;
      else runningBalance -= amount;
      return {
        ...t,
        runningBalance,
        signedAmount: isIncome ? amount : -amount,
      };
    });
  })();

  const closingBalance = lines.length > 0 ? lines[lines.length - 1].runningBalance : openingBalance;
  const totalIncome = lines.filter((l) => l.signedAmount > 0).reduce((s, l) => s + l.signedAmount, 0);
  const totalExpense = lines.filter((l) => l.signedAmount < 0).reduce((s, l) => s + Math.abs(l.signedAmount), 0);

  return (
    <>
    <div className="space-y-6">
      {/* Filters */}
      <div className="glass rounded-xl p-4 space-y-4">
        <p className="text-sm font-medium">Parâmetros do Extrato</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta *</label>
            <select
              value={selectedAccountId}
              onChange={(e) => { setSelectedAccountId(e.target.value); setGenerated(false); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Selecionar conta…</option>
              {accounts.filter((a: any) => a.is_active).map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Início</label>
            <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecionar…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setGenerated(false); setDateFromOpen(false); }} locale={pt} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Fim</label>
            <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecionar…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setGenerated(false); setDateToOpen(false); }} locale={pt} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={!selectedAccountId}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              Consultar
            </button>
          </div>
        </div>
      </div>

      {/* Not authorized message */}
      {generated && selectedAccount && !canSeeBalance && (
        <div className="glass rounded-xl p-8 text-center space-y-3">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground font-medium">Sem autorização para visualizar o saldo desta conta</p>
          <p className="text-xs text-muted-foreground">
            O saldo desta conta está restrito. Contacte um administrador para obter acesso.
          </p>
        </div>
      )}

      {/* Results */}
      {generated && canSeeBalance && (
        <>
          {/* Export buttons */}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportBankStatementToExcel(selectedAccount!, lines, openingBalance, closingBalance, dateFromStr, dateToStr)}
              disabled={lines.length === 0}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportBankStatementToPDF(selectedAccount!, lines, openingBalance, closingBalance, dateFromStr, dateToStr)}
              disabled={lines.length === 0}
            >
              <FileText className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo Inicial</p>
              {isUncontrolledBalance ? (
                <p className="mt-1 text-sm italic text-muted-foreground">Saldo não controlado</p>
              ) : (
                <p className={`mt-1 text-lg font-bold ${openingBalance >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(openingBalance)}
                </p>
              )}
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Entradas</p>
              <p className="mt-1 text-lg font-bold text-success">{formatCurrency(totalIncome)}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Saídas</p>
              <p className="mt-1 text-lg font-bold text-warning">{formatCurrency(totalExpense)}</p>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo Final</p>
              {isUncontrolledBalance ? (
                <p className="mt-1 text-sm italic text-muted-foreground">Saldo não controlado</p>
              ) : (
                <p className={`mt-1 text-lg font-bold ${closingBalance >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(closingBalance)}
                </p>
              )}
            </div>
          </div>

          {/* Statement table */}
          {lines.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Landmark className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Sem movimentos para o período selecionado.</p>
            </div>
          ) : (
            <div className="glass rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead className="text-center w-10">
                      <Paperclip className="h-3.5 w-3.5 mx-auto" />
                    </TableHead>
                    <TableHead className="text-right">Entrada (€)</TableHead>
                    <TableHead className="text-right">Saída (€)</TableHead>
                    <TableHead className="text-right">Saldo (€)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening balance row */}
                  <TableRow className="bg-secondary/20">
                    <TableCell className="font-medium text-xs">{dateFromStr || "—"}</TableCell>
                    <TableCell colSpan={2} className="font-bold text-xs uppercase tracking-wider">Saldo Inicial</TableCell>
                    <TableCell />
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${isUncontrolledBalance ? "text-muted-foreground italic text-xs" : openingBalance >= 0 ? "text-success" : "text-destructive"}`}>
                      {isUncontrolledBalance ? "N/C" : formatCurrency(openingBalance)}
                    </TableCell>
                  </TableRow>

                  {lines.map((line: any, i: number) => (
                    <TableRow key={line.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDatePT(line.date)}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{line.description}</p>
                        {line.suppliers?.name && (
                          <p className="text-xs text-muted-foreground">{line.suppliers.name}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {line.events?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {(docCounts as Record<string, number>)[line.id] ? (
                          <button
                            onClick={() => setDocsModal({ id: line.id, description: line.description })}
                            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10 transition-colors"
                            title="Ver documentos anexados"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            <span className="font-medium">{(docCounts as Record<string, number>)[line.id]}</span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {line.signedAmount > 0 ? (
                          <span className="text-success">{formatCurrency(line.signedAmount)}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {line.signedAmount < 0 ? (
                          <span className="text-warning">{formatCurrency(Math.abs(line.signedAmount))}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${isUncontrolledBalance ? "text-muted-foreground italic text-xs" : line.runningBalance >= 0 ? "text-success" : "text-destructive"}`}>
                        {isUncontrolledBalance ? "N/C" : formatCurrency(line.runningBalance)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Closing balance row */}
                  <TableRow className="border-t-2 border-primary/30 bg-primary/5">
                    <TableCell className="font-medium text-xs">{dateToStr || "—"}</TableCell>
                    <TableCell colSpan={2} className="font-bold text-xs uppercase tracking-wider">Saldo Final</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono font-semibold text-success">{formatCurrency(totalIncome)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-warning">{formatCurrency(totalExpense)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${isUncontrolledBalance ? "text-muted-foreground italic text-xs" : closingBalance >= 0 ? "text-success" : "text-destructive"}`}>
                      {isUncontrolledBalance ? "N/C" : formatCurrency(closingBalance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>

    {docsModal && (
      <TransactionDocumentsModal
        transactionId={docsModal.id}
        transactionDescription={docsModal.description}
        onClose={() => setDocsModal(null)}
      />
    )}
  </>
  );
}
