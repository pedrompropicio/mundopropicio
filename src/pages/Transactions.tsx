import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, calcIvaAmount } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { Plus, ShieldCheck, Filter, Eye, ArrowRightLeft, CalendarDays } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import { TransactionAuditModal } from "@/components/TransactionAuditModal";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { TransactionRow } from "@/components/TransactionRow";
import { TransferFormModal } from "@/components/TransferFormModal";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Transactions() {
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [duePeriod, setDuePeriod] = useState<"day" | "week" | "month" | "range">("week");
  const [rangeFrom, setRangeFrom] = useState<Date | undefined>(undefined);
  const [rangeTo, setRangeTo] = useState<Date | undefined>(undefined);
  const [onlyPending, setOnlyPending] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPaymentId, setShowPaymentId] = useState<string | null>(null);
  const [showAuditId, setShowAuditId] = useState<string | null>(null);
  const [showDocsId, setShowDocsId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPaidDialog, setShowPaidDialog] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [paidDateFrom, setPaidDateFrom] = useState<Date | undefined>(undefined);
  const [paidDateTo, setPaidDateTo] = useState<Date | undefined>(undefined);
  const queryClient = useQueryClient();
  const { isAdmin, user } = useAuth();

  const { data: events = [] } = useQuery({
    queryKey: ["events-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllAccounts = () => {
    if (selectedAccountIds.size === accounts.length) setSelectedAccountIds(new Set());
    else setSelectedAccountIds(new Set(accounts.map((a: any) => a.id)));
  };

  const toggleEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllEvents = () => {
    if (selectedEventIds.size === events.length) setSelectedEventIds(new Set());
    else setSelectedEventIds(new Set(events.map((e: any) => e.id)));
  };

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name, status), account_categories(name), suppliers(name), financial_accounts(name)")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("approve-transaction", {
        body: { transaction_ids: [id] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Transação aprovada!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.functions.invoke("approve-transaction", {
        body: { transaction_ids: ids },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setSelectedIds(new Set());
      toast({ title: `${ids.length} transação(ões) aprovada(s)!` });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar em lote", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Fetch transaction data before deleting for audit
      const { data: txData } = await supabase.from("transactions").select("*").eq("id", id).single();
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await logAudit({
        entity_type: "transaction",
        entity_id: id,
        action: "delete",
        changed_by: getAuditUser(user),
        old_data: txData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Transação eliminada!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao eliminar", description: err.message, variant: "destructive" });
    },
  });

  const sortByDueDate = <T extends { due_date: string | null; date: string; created_at: string }>(items: T[]) => {
    return [...items].sort((a, b) => {
      const aPrimary = a.due_date ?? a.date;
      const bPrimary = b.due_date ?? b.date;
      if (aPrimary !== bPrimary) return aPrimary.localeCompare(bPrimary);
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.created_at.localeCompare(b.created_at);
    });
  };

  // Base filter (type, event, account, open only)
  const baseFiltered = (filter === "all" ? transactions : transactions.filter((t) => t.type === filter))
    .filter((t) => selectedEventIds.size === 0 || selectedEventIds.has(t.event_id))
    .filter((t) => selectedAccountIds.size === 0 || (t.account_id && selectedAccountIds.has(t.account_id)))
    .filter((t) => {
      const paidAmount = Number(t.paid_amount ?? 0);
      const amount = Number(t.amount);
      return paidAmount < amount || t.status !== "paid";
    })
    .filter((t) => !onlyPending || t.status === "pending");

  // Group transactions: overdue, period, no-date
  const { overdueGroup, periodGroup, noDateGroup } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue: typeof baseFiltered = [];
    const inPeriod: typeof baseFiltered = [];
    const noDate: typeof baseFiltered = [];
    const outOfPeriod: typeof baseFiltered = []; // not shown but needed for separation

    // Compute period end date
    let periodEnd: Date;
    if (duePeriod === "day") {
      periodEnd = new Date(today);
      periodEnd.setHours(23, 59, 59, 999);
    } else if (duePeriod === "week") {
      periodEnd = new Date(today);
      periodEnd.setDate(periodEnd.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);
    } else if (duePeriod === "month") {
      periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      // range
      periodEnd = rangeTo ? new Date(rangeTo) : new Date(today.getFullYear() + 10, 0, 1);
      periodEnd.setHours(23, 59, 59, 999);
    }

    const periodStart = duePeriod === "range" && rangeFrom ? new Date(rangeFrom) : today;
    if (duePeriod === "range" && rangeFrom) periodStart.setHours(0, 0, 0, 0);

    baseFiltered.forEach((t) => {
      if (!t.due_date) {
        noDate.push(t);
        return;
      }
      const due = new Date(t.due_date);
      const paidAmount = Number(t.paid_amount ?? 0);
      const amount = Number(t.amount);
      const isPaid = t.status === "paid" || paidAmount >= amount;

      if (!isPaid && due < today) {
        overdue.push(t);
      } else if (due >= periodStart && due <= periodEnd) {
        inPeriod.push(t);
      } else {
        // Outside selected period — exclude from view
      }
    });

    return {
      overdueGroup: sortByDueDate(overdue),
      periodGroup: sortByDueDate(inPeriod),
      noDateGroup: sortByDueDate(noDate),
    };
  }, [baseFiltered, duePeriod, rangeFrom, rangeTo]);

  const filtered = [...overdueGroup, ...periodGroup, ...noDateGroup];
  const paidTransactions = sortByDueDate(
    (filter === "all" ? transactions : transactions.filter((t) => t.type === filter))
      .filter((t) => selectedEventIds.size === 0 || selectedEventIds.has(t.event_id))
      .filter((t) => selectedAccountIds.size === 0 || (t.account_id && selectedAccountIds.has(t.account_id)))
      .filter((t) => {
        const paidAmount = Number(t.paid_amount ?? 0);
        const amount = Number(t.amount);
        if (paidAmount < amount && t.status !== "paid") return false;
        if (!paidDateFrom && !paidDateTo) return true;
        const paymentDate = t.payment_date ? new Date(t.payment_date) : null;
        if (!paymentDate) return false;
        if (paidDateFrom && paymentDate < paidDateFrom) return false;
        if (paidDateTo) {
          const endOfDay = new Date(paidDateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (paymentDate > endOfDay) return false;
        }
        return true;
      })
  );

  // Pending transactions in current filtered view
  const pendingInView = filtered.filter((t) => t.status === "pending");
  const selectedPendingCount = [...selectedIds].filter((id) =>
    pendingInView.some((t) => t.id === id)
  ).length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPendingCount === pendingInView.length && pendingInView.length > 0) {
      // Deselect all pending
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingInView.forEach((t) => next.delete(t.id));
        return next;
      });
    } else {
      // Select all pending
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pendingInView.forEach((t) => next.add(t.id));
        return next;
      });
    }
  };

  const handleBulkApprove = () => {
    const ids = [...selectedIds].filter((id) => pendingInView.some((t) => t.id === id));
    if (ids.length === 0) return;
    bulkApproveMutation.mutate(ids);
  };

  const editingTransaction = transactions.find((t) => t.id === editingId);
  const paymentTransaction = transactions.find((t) => t.id === showPaymentId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Transações</h1>
          <p className="text-sm text-muted-foreground">Todas as movimentações financeiras</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTransfer(true)}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Transferência</span>
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Transação</span>
          </button>
        </div>
      </div>

      {showTransfer && (
        <TransferFormModal onClose={() => setShowTransfer(false)} />
      )}

      {showForm && (
        <TransactionFormModal onClose={() => setShowForm(false)} />
      )}

      {editingTransaction && (
        <TransactionEditModal
          transaction={editingTransaction}
          onClose={() => setEditingId(null)}
          isAdmin={isAdmin}
        />
      )}

      {paymentTransaction && (
        <TransactionPaymentModal
          transaction={paymentTransaction}
          onClose={() => setShowPaymentId(null)}
        />
      )}

      {showAuditId && (
        <TransactionAuditModal
          transactionId={showAuditId}
          onClose={() => setShowAuditId(null)}
        />
      )}

      {showDocsId && (
        <TransactionDocumentsModal
          transactionId={showDocsId}
          transactionDescription={transactions.find((t) => t.id === showDocsId)?.description ?? ""}
          onClose={() => setShowDocsId(null)}
        />
      )}

      {/* Filters + Bulk Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "income", "expense"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              filter === f ? "bg-primary text-primary-foreground glow-primary" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {f === "all" ? "Todas" : f === "income" ? "Receitas" : "Despesas"}
          </button>
        ))}

        {/* Event multi-select filter */}
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-sm font-normal">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              {selectedEventIds.size === 0
                ? "Todos os eventos"
                : `${selectedEventIds.size} evento(s)`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-h-60 overflow-y-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-2">
              <Checkbox
                checked={selectedEventIds.size === events.length && events.length > 0}
                onCheckedChange={toggleAllEvents}
              />
              <span className="text-sm font-medium">Selecionar todos</span>
            </div>
            {events.map((e: any) => (
              <div
                key={e.id}
                className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-muted/50 cursor-pointer"
                onClick={() => toggleEvent(e.id)}
              >
                <Checkbox checked={selectedEventIds.has(e.id)} onCheckedChange={() => toggleEvent(e.id)} />
                <span className="text-sm">{e.name}</span>
              </div>
            ))}
          </PopoverContent>
        </Popover>

        {/* Account multi-select filter */}
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-sm font-normal">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              {selectedAccountIds.size === 0
                ? "Todas as contas"
                : `${selectedAccountIds.size} conta(s)`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-h-60 overflow-y-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-2">
              <Checkbox
                checked={selectedAccountIds.size === accounts.length && accounts.length > 0}
                onCheckedChange={toggleAllAccounts}
              />
              <span className="text-sm font-medium">Selecionar todas</span>
            </div>
            {accounts.map((a: any) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-muted/50 cursor-pointer"
                onClick={() => toggleAccount(a.id)}
              >
                <Checkbox checked={selectedAccountIds.has(a.id)} onCheckedChange={() => toggleAccount(a.id)} />
                <span className="text-sm">{a.name}</span>
              </div>
            ))}
          </PopoverContent>
        </Popover>

        {/* Period filter */}
        <Popover modal={false} open={periodPopoverOpen} onOpenChange={setPeriodPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-sm font-normal">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              {duePeriod === "day" ? "Hoje" : duePeriod === "week" ? "Semana" : duePeriod === "month" ? "Mês" : "Período"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="flex flex-col gap-1">
              {([["day", "Hoje"], ["week", "Semana"], ["month", "Mês"], ["range", "Período personalizado"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => { setDuePeriod(val); if (val !== "range") setPeriodPopoverOpen(false); }}
                  className={cn(
                    "rounded px-3 py-1.5 text-sm text-left transition-colors",
                    duePeriod === val ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
              {duePeriod === "range" && (
                <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border/50">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">De</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !rangeFrom && "text-muted-foreground")}>
                          {rangeFrom ? format(rangeFrom, "dd/MM/yyyy") : "Início"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={rangeFrom} onSelect={setRangeFrom} locale={pt} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Até</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !rangeTo && "text-muted-foreground")}>
                          {rangeTo ? format(rangeTo, "dd/MM/yyyy") : "Fim"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={rangeTo} onSelect={setRangeTo} locale={pt} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Filtro Aguardando */}
        <Button
          variant={onlyPending ? "default" : "outline"}
          size="sm"
          className="text-sm font-normal"
          onClick={() => setOnlyPending(!onlyPending)}
        >
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
          Aguardando
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="text-sm font-normal"
          onClick={() => setShowPaidDialog(true)}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Ver Liquidadas
        </Button>

        {isAdmin && selectedPendingCount > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={bulkApproveMutation.isPending}
            className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Aprovar {selectedPendingCount} selecionada{selectedPendingCount > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass rounded-xl p-5">
        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">A carregar transações…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Sem transações registadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  {isAdmin && pendingInView.length > 0 && (
                    <th className="pb-3 pr-2 text-center font-medium w-8">
                      <input
                        type="checkbox"
                        checked={selectedPendingCount === pendingInView.length && pendingInView.length > 0}
                        onChange={toggleSelectAll}
                        className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                        title="Selecionar todas pendentes"
                      />
                    </th>
                  )}
                  <th className="pb-3 text-left font-medium">Descrição</th>
                  <th className="hidden pb-3 text-left font-medium sm:table-cell">Evento</th>
                  <th className="hidden pb-3 text-left font-medium md:table-cell">Fornecedor</th>
                  <th className="hidden pb-3 text-center font-medium lg:table-cell">IVA</th>
                  <th className="pb-3 text-left font-medium">Estado</th>
                  <th className="pb-3 text-left font-medium">Data Vcto</th>
                  <th className="pb-3 text-right font-medium">Pago</th>
                  <th className="pb-3 text-right font-medium">Valor c/IVA</th>
                  <th className="pb-3 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {overdueGroup.length > 0 && (
                  <tr>
                    <td colSpan={10} className="pt-4 pb-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs font-semibold text-destructive">
                          🔴 Vencidas ({overdueGroup.length})
                        </span>
                        <div className="flex-1 border-t border-destructive/20" />
                      </div>
                    </td>
                  </tr>
                )}
                {overdueGroup.map((t) => (
                  <TransactionRow
                    key={t.id}
                    transaction={t}
                    isAdmin={isAdmin}
                    selectable={isAdmin && t.status === "pending"}
                    selected={selectedIds.has(t.id)}
                    onToggleSelect={() => toggleSelect(t.id)}
                    showSelectColumn={isAdmin && pendingInView.length > 0}
                    eventCompleted={(t.events as any)?.status === "completed"}
                    onEdit={(id) => setEditingId(id)}
                    onApprove={(id) => approveMutation.mutate(id)}
                    onPayment={(id) => setShowPaymentId(id)}
                    onDocs={(id) => setShowDocsId(id)}
                    onAudit={(id) => setShowAuditId(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}

                {periodGroup.length > 0 && (
                  <tr>
                    <td colSpan={10} className="pt-4 pb-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                          📅 {duePeriod === "day" ? "Hoje" : duePeriod === "week" ? "Esta semana" : duePeriod === "month" ? "Este mês" : "Período"} ({periodGroup.length})
                        </span>
                        <div className="flex-1 border-t border-primary/20" />
                      </div>
                    </td>
                  </tr>
                )}
                {periodGroup.map((t) => (
                  <TransactionRow
                    key={t.id}
                    transaction={t}
                    isAdmin={isAdmin}
                    selectable={isAdmin && t.status === "pending"}
                    selected={selectedIds.has(t.id)}
                    onToggleSelect={() => toggleSelect(t.id)}
                    showSelectColumn={isAdmin && pendingInView.length > 0}
                    eventCompleted={(t.events as any)?.status === "completed"}
                    onEdit={(id) => setEditingId(id)}
                    onApprove={(id) => approveMutation.mutate(id)}
                    onPayment={(id) => setShowPaymentId(id)}
                    onDocs={(id) => setShowDocsId(id)}
                    onAudit={(id) => setShowAuditId(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}

                {noDateGroup.length > 0 && (
                  <tr>
                    <td colSpan={10} className="pt-4 pb-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                          ➖ Sem data de vencimento ({noDateGroup.length})
                        </span>
                        <div className="flex-1 border-t border-border/30" />
                      </div>
                    </td>
                  </tr>
                )}
                {noDateGroup.map((t) => (
                  <TransactionRow
                    key={t.id}
                    transaction={t}
                    isAdmin={isAdmin}
                    selectable={isAdmin && t.status === "pending"}
                    selected={selectedIds.has(t.id)}
                    onToggleSelect={() => toggleSelect(t.id)}
                    showSelectColumn={isAdmin && pendingInView.length > 0}
                    eventCompleted={(t.events as any)?.status === "completed"}
                    onEdit={(id) => setEditingId(id)}
                    onApprove={(id) => approveMutation.mutate(id)}
                    onPayment={(id) => setShowPaymentId(id)}
                    onDocs={(id) => setShowDocsId(id)}
                    onAudit={(id) => setShowAuditId(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog de Contas Pagas */}
      <Dialog open={showPaidDialog} onOpenChange={setShowPaidDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Transações Liquidadas</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data pgto. de</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-36 justify-start text-left font-normal", !paidDateFrom && "text-muted-foreground")}>
                    {paidDateFrom ? format(paidDateFrom, "dd/MM/yyyy") : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={paidDateFrom} onSelect={setPaidDateFrom} locale={pt} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data pgto. até</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-36 justify-start text-left font-normal", !paidDateTo && "text-muted-foreground")}>
                    {paidDateTo ? format(paidDateTo, "dd/MM/yyyy") : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={paidDateTo} onSelect={setPaidDateTo} locale={pt} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            {(paidDateFrom || paidDateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setPaidDateFrom(undefined); setPaidDateTo(undefined); }} className="mt-5 text-xs">
                Limpar datas
              </Button>
            )}
            <span className="ml-auto mt-5 text-xs text-muted-foreground">
              {paidTransactions.length} transação(ões)
            </span>
          </div>

          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {paidTransactions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Sem transações pagas no período selecionado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 text-left font-medium">Descrição</th>
                    <th className="hidden pb-3 text-left font-medium sm:table-cell">Evento</th>
                    <th className="hidden pb-3 text-left font-medium md:table-cell">Fornecedor</th>
                    <th className="pb-3 text-left font-medium">Dt. Pgto</th>
                    <th className="pb-3 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {paidTransactions.map((t) => {
                    const isExpense = t.type === "expense";
                    return (
                      <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-2.5 pr-4">
                          <p className="font-medium">{t.description}</p>
                          {t.specification && <p className="text-xs text-muted-foreground">{t.specification}</p>}
                          {(t.financial_accounts as any)?.name && <p className="text-xs text-primary/70">📌 {(t.financial_accounts as any).name}</p>}
                        </td>
                        <td className="hidden py-2.5 pr-4 text-muted-foreground sm:table-cell">{(t.events as any)?.name ?? "—"}</td>
                        <td className="hidden py-2.5 pr-4 text-muted-foreground md:table-cell">{(t.suppliers as any)?.name ?? "—"}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">
                          {t.payment_date ? new Date(t.payment_date).toLocaleDateString("pt-PT") : "—"}
                        </td>
                        <td className={`py-2.5 text-right font-mono font-semibold whitespace-nowrap ${isExpense ? "text-warning" : "text-success"}`}>
                          {isExpense ? "-" : "+"}{formatCurrency(Number(t.amount))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
