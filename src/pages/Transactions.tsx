import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, calcIvaAmount } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { Plus, ShieldCheck, Filter, ArrowRightLeft, CalendarDays, ClipboardList, Search, X, EyeOff } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";
import { moveToTrash } from "@/lib/trash";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import { TransactionAuditModal } from "@/components/TransactionAuditModal";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { TransactionRow } from "@/components/TransactionRow";
import { TransferFormModal } from "@/components/TransferFormModal";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";

export default function Transactions() {
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
  const [viewMode, setViewMode] = useState<"open" | "paid">("open");
  const [duePeriod, setDuePeriod] = useState<"day" | "week" | "month" | "range">("week");
  const [paidPeriod, setPaidPeriod] = useState<"all" | "yesterday" | "week" | "month" | "range">("all");
  const [periodDateField, setPeriodDateField] = useState<"due_date" | "date">("due_date");
  const [periodPopoverOpen, setPeriodPopoverOpen] = useState(false);
  const [paidPeriodPopoverOpen, setPaidPeriodPopoverOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState<Date | undefined>(undefined);
  const [rangeTo, setRangeTo] = useState<Date | undefined>(undefined);
  const [rangeFromOpen, setRangeFromOpen] = useState(false);
  const [rangeToOpen, setRangeToOpen] = useState(false);
  const [paidRangeFrom, setPaidRangeFrom] = useState<Date | undefined>(undefined);
  const [paidRangeTo, setPaidRangeTo] = useState<Date | undefined>(undefined);
  const [paidRangeFromOpen, setPaidRangeFromOpen] = useState(false);
  const [paidRangeToOpen, setPaidRangeToOpen] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [onlyNoDueDate, setOnlyNoDueDate] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPaymentId, setShowPaymentId] = useState<string | null>(null);
  const [showAuditId, setShowAuditId] = useState<string | null>(null);
  const [showDocsId, setShowDocsId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showTransfer, setShowTransfer] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const highlightRef = useRef<HTMLTableRowElement>(null);

  // When highlight param is set, switch to a view that shows the transaction
  useEffect(() => {
    if (!highlightId) return;
    // Show all transactions (paid view shows everything)
    setViewMode("paid");
    setPaidPeriod("all");
    // Clean up the URL param after a delay
    const timer = setTimeout(() => {
      setSearchParams({}, { replace: true });
    }, 5000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const { data: events = [] } = useQuery({
    queryKey: ["events-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name, parent_event_id").order("name");
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
        .select("*, events(name, status), account_categories(code, name), suppliers(name), financial_accounts(name)")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedEventScopeIds = useMemo(() => {
    if (selectedEventIds.size === 0) return new Set<string>();

    const next = new Set<string>(selectedEventIds);
    events.forEach((event: any) => {
      if (event.parent_event_id && selectedEventIds.has(event.parent_event_id)) {
        next.add(event.id);
      }
    });

    return next;
  }, [selectedEventIds, events]);

  const visibleParentSplitIds = useMemo(() => {
    if (selectedEventScopeIds.size === 0) return new Set<string>();

    const next = new Set<string>();
    transactions.forEach((transaction: any) => {
      if (transaction.parent_transaction_id && transaction.event_id && selectedEventScopeIds.has(transaction.event_id)) {
        next.add(transaction.parent_transaction_id);
      }
    });

    return next;
  }, [transactions, selectedEventScopeIds]);

  const matchesEventFilter = (transaction: any) => {
    if (selectedEventIds.size === 0) return true;
    if (transaction.event_id && selectedEventScopeIds.has(transaction.event_id)) return true;

    return !transaction.event_id && !transaction.parent_transaction_id && visibleParentSplitIds.has(transaction.id);
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("approve-transaction", {
        body: { transaction_ids: [id] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (data?.approved_count > 0) {
        toast({
          title: "Transação aprovada!",
          description: data?.skipped_count > 0 ? "Alguns itens já não estavam pendentes e foram ignorados." : undefined,
        });
        return;
      }

      toast({
        title: "Nenhuma transação aprovada",
        description: data?.message ?? "A transação já não estava pendente.",
        variant: "destructive",
      });
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setSelectedIds(new Set());

      if (data?.approved_count > 0 && data?.skipped_count > 0) {
        toast({
          title: `${data.approved_count} transação(ões) aprovada(s)!`,
          description: `${data.skipped_count} já não estavam pendentes e foram ignoradas.`,
        });
        return;
      }

      if (data?.approved_count > 0) {
        toast({ title: `${data.approved_count} transação(ões) aprovada(s)!` });
        return;
      }

      toast({
        title: "Nenhuma transação aprovada",
        description: data?.message ?? "As transações selecionadas já não estavam pendentes.",
        variant: "destructive",
      });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao aprovar em lote", description: err.message, variant: "destructive" });
    },
  });

  // Check for dependent records before deleting
  const checkDependencies = async (id: string) => {
    const warnings: string[] = [];
    const { data: payItems } = await supabase.from("payment_list_items").select("id, payment_list_id").eq("transaction_id", id);
    if (payItems && payItems.length > 0) {
      warnings.push(`Presente em ${payItems.length} lista(s) de pagamento — será removida da(s) lista(s)`);
    }
    const { data: reimbItems } = await supabase.from("reimbursement_note_items").select("id").eq("transaction_id", id);
    if (reimbItems && reimbItems.length > 0) {
      warnings.push(`Vinculada a ${reimbItems.length} nota(s) de reembolso — será desvinculada`);
    }
    const { data: partnerExp } = await supabase.from("partner_paid_expenses").select("id").eq("transaction_id", id);
    if (partnerExp && partnerExp.length > 0) {
      warnings.push(`Registada como despesa paga por parceiro — o registo será removido`);
    }
    const { data: creditUsages } = await supabase.from("supplier_credit_usages").select("id, amount").eq("transaction_id", id);
    if (creditUsages && creditUsages.length > 0) {
      const total = creditUsages.reduce((s, c) => s + Number(c.amount), 0);
      warnings.push(`Tem ${creditUsages.length} uso(s) de crédito de fornecedor (${total.toFixed(2)} €) — serão revertidos`);
    }
    const { data: children } = await supabase.from("transactions").select("id").eq("parent_transaction_id", id);
    if (children && children.length > 0) {
      warnings.push(`Tem ${children.length} transação(ões) filha(s) de split — serão eliminadas em conjunto`);
    }
    return warnings;
  };

  const handleDeleteRequest = async (id: string) => {
    setDeletingId(id);
    setDeleteChecked(false);
    setDeleteWarnings([]);
    const warnings = await checkDependencies(id);
    setDeleteWarnings(warnings);
    setDeleteChecked(true);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Fetch transaction data before deleting for audit + trash
      const { data: txData } = await supabase.from("transactions").select("*").eq("id", id).single();
      // Fetch child splits
      const { data: childTxs } = await supabase.from("transactions").select("*").eq("parent_transaction_id", id);

      // Move to trash before hard delete
      if (txData) {
        await moveToTrash({
          entity_type: "transaction",
          entity_id: id,
          entity_data: txData,
          related_data: childTxs && childTxs.length > 0 ? { transactions: childTxs } : null,
          deleted_by: getAuditUser(user),
        });
      }

      // Remove dependent records safely
      await supabase.from("payment_list_items").delete().eq("transaction_id", id);
      await supabase.from("reimbursement_note_items").delete().eq("transaction_id", id);
      await supabase.from("partner_paid_expenses").delete().eq("transaction_id", id);
      await supabase.from("supplier_credit_usages").delete().eq("transaction_id", id);
      // Delete child split transactions first
      await supabase.from("transactions").delete().eq("parent_transaction_id", id);
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

  // Search helper
  const matchesSearch = (t: any) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.description?.toLowerCase().includes(term) ||
      t.specification?.toLowerCase().includes(term) ||
      (t.events as any)?.name?.toLowerCase().includes(term) ||
      (t.suppliers as any)?.name?.toLowerCase().includes(term)
    );
  };

  // Base filter (type, event, account, open only, search, hidden)
  const baseFiltered = (filter === "all" ? transactions : transactions.filter((t) => t.type === filter))
    .filter((t: any) => showHidden || !t.is_hidden) // hide hidden transactions unless toggle is on
    .filter(matchesSearch)
    .filter(matchesEventFilter)
    .filter((t) => selectedAccountIds.size === 0 || (t.account_id && selectedAccountIds.has(t.account_id)))
    .filter((t) => {
      if (t.status === "paid") return false;
      const paidAmount = Number(t.paid_amount ?? 0);
      const amount = Number(t.amount);
      return paidAmount < amount - 0.01;
    })
    .filter((t) => !onlyPending || t.status === "pending");

  // Group transactions: overdue, period, no-date
  const { overdueGroup, periodGroup, noDateGroup } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue: typeof baseFiltered = [];
    const inPeriod: typeof baseFiltered = [];
    const noDate: typeof baseFiltered = [];

    // If "only no due date" filter is active, show only those
    if (onlyNoDueDate) {
      baseFiltered.forEach((t) => {
        if (!t.due_date) noDate.push(t);
      });
      return {
        overdueGroup: [],
        periodGroup: [],
        noDateGroup: sortByDueDate(noDate),
      };
    }

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

    const getDateValue = (t: any): string | null => {
      if (periodDateField === "due_date") return t.due_date;
      return t.date; // data de lançamento — always present
    };

    baseFiltered.forEach((t) => {
      // When "Aprovação" filter is active, show ALL pending regardless of period
      if (onlyPending) {
        if (!t.due_date) {
          noDate.push(t);
        } else {
          const due = new Date(t.due_date);
          if (due < today) {
            overdue.push(t);
          } else {
            inPeriod.push(t);
          }
        }
        return;
      }

      const dateVal = getDateValue(t);
      if (!dateVal) {
        noDate.push(t);
        return;
      }
      const dateObj = new Date(dateVal);
      const paidAmount = Number(t.paid_amount ?? 0);
      const amount = Number(t.amount);
      const isPaid = t.status === "paid" || paidAmount >= amount - 0.01;

      // Overdue only makes sense for due_date
      if (periodDateField === "due_date" && !isPaid && dateObj < today) {
        overdue.push(t);
      } else if (dateObj >= periodStart && dateObj <= periodEnd) {
        inPeriod.push(t);
      }
      // else: outside period — excluded
    });

    return {
      overdueGroup: sortByDueDate(overdue),
      periodGroup: sortByDueDate(inPeriod),
      noDateGroup: sortByDueDate(noDate),
    };
  }, [baseFiltered, duePeriod, rangeFrom, rangeTo, periodDateField, onlyNoDueDate]);

  const filtered = [...overdueGroup, ...periodGroup, ...noDateGroup];

  // Paid transactions filtered by payment_date period
  const paidTransactions = useMemo(() => {
    const base = (filter === "all" ? transactions : transactions.filter((t) => t.type === filter))
      .filter((t: any) => showHidden || !t.is_hidden)
      .filter(matchesSearch)
      .filter(matchesEventFilter)
      .filter((t) => selectedAccountIds.size === 0 || (t.account_id && selectedAccountIds.has(t.account_id)))
      .filter((t) => {
        const paidAmount = Number(t.paid_amount ?? 0);
        const amount = Number(t.amount);
        return paidAmount >= amount - 0.01 || t.status === "paid";
      });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let periodStart: Date;
    let periodEnd: Date;

    if (paidPeriod === "all") {
      periodStart = new Date(2000, 0, 1);
      periodEnd = new Date(today.getFullYear() + 10, 0, 1);
      periodEnd.setHours(23, 59, 59, 999);
    } else if (paidPeriod === "yesterday") {
      periodStart = new Date(today);
      periodStart.setDate(periodStart.getDate() - 1);
      periodEnd = new Date(periodStart);
      periodEnd.setHours(23, 59, 59, 999);
    } else if (paidPeriod === "week") {
      periodStart = new Date(today);
      periodStart.setDate(periodStart.getDate() - 7);
      periodEnd = new Date(today);
      periodEnd.setHours(23, 59, 59, 999);
    } else if (paidPeriod === "month") {
      periodStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
      periodEnd = new Date(today);
      periodEnd.setHours(23, 59, 59, 999);
    } else {
      periodStart = paidRangeFrom ? new Date(paidRangeFrom) : new Date(2000, 0, 1);
      periodEnd = paidRangeTo ? new Date(paidRangeTo) : new Date(today.getFullYear() + 10, 0, 1);
      periodEnd.setHours(23, 59, 59, 999);
    }
    periodStart.setHours(0, 0, 0, 0);

    const result = base.filter((t) => {
      const paymentDate = t.payment_date ? new Date(t.payment_date) : null;
      // If no payment_date, include only in "all" period so they don't disappear
      if (!paymentDate) return paidPeriod === "all";
      return paymentDate >= periodStart && paymentDate <= periodEnd;
    });
    return [...result].sort((a, b) => {
      const aDate = a.payment_date ?? a.date;
      const bDate = b.payment_date ?? b.date;
      return bDate.localeCompare(aDate); // mais recente primeiro
    });
  }, [transactions, filter, selectedEventIds, selectedAccountIds, paidPeriod, paidRangeFrom, paidRangeTo, showHidden]);

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

  const toggleHiddenMutation = useMutation({
    mutationFn: async ({ id, currentlyHidden }: { id: string; currentlyHidden: boolean }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ is_hidden: !currentlyHidden } as any)
        .eq("id", id);
      if (error) throw error;
      const auditUser = getAuditUser(user);
      await logAudit({
        entity_type: "transaction",
        entity_id: id,
        action: currentlyHidden ? "unhide" : "hide",
        changed_by: auditUser,
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: vars.currentlyHidden ? "Transação tornada visível" : "Transação ocultada" });
    },
    onError: () => toast({ title: "Erro ao alterar visibilidade", variant: "destructive" }),
  });

  const handleToggleHidden = (id: string, currentlyHidden: boolean) => {
    toggleHiddenMutation.mutate({ id, currentlyHidden });
  };

  const editingTransaction = transactions.find((t) => t.id === editingId);
  const paymentTransaction = transactions.find((t) => t.id === showPaymentId);

  return (
    <div className="space-y-6">
      {/* Header: title + action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">Transações <HelpTooltip text={helpTexts.transactions} /></h1>
          <p className="text-sm text-muted-foreground">Todas as movimentações financeiras</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar…"
              className="w-44 rounded-lg border border-border bg-background pl-8 pr-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => navigate("/relatorios/listas-pagamento")}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Listas de Pagamento</span>
          </button>
          <button
            onClick={() => setShowTransfer(true)}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Transferência</span>
            <HelpTooltip text={helpTexts.transferBetweenAccounts} size={13} />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Transação</span>
            <HelpTooltip text={helpTexts.newTransaction} size={13} className="text-primary-foreground/60 hover:text-primary-foreground" />
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

      {/* Search + Filters + Bulk Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "income", "expense"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              filter === f ? "bg-primary text-primary-foreground glow-primary" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {f === "all" ? "Todas" : f === "income" ? "Receitas" : "Despesas"}
          </button>
        ))}

        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setViewMode("open")}
            className={cn(
              "px-3 py-1.5 text-[13px] font-medium transition-colors",
              viewMode === "open" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            Em Aberto
          </button>
          <button
            onClick={() => setViewMode("paid")}
            className={cn(
              "px-3 py-1.5 text-[13px] font-medium transition-colors",
              viewMode === "paid" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            Liquidadas
          </button>
        </div>

        {/* Show hidden toggle (admin only) */}
        {isAdmin && (
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all",
              showHidden ? "bg-warning/15 text-warning ring-1 ring-warning/30" : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
            title={showHidden ? "A mostrar transações ocultas" : "Mostrar transações ocultas"}
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ocultas</span>
          </button>
        )}

        {/* Event multi-select filter */}
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-[13px] font-normal h-8 px-3">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              {selectedEventIds.size === 0
                ? "Todos os eventos"
                : `${selectedEventIds.size} evento(s)`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-h-72 overflow-y-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
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
            <div className="border-t border-border/50 pt-2 mt-2 sticky bottom-0 bg-popover">
              <PopoverClose asChild>
                <Button variant="outline" size="sm" className="w-full">Fechar</Button>
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>

        {/* Account multi-select filter */}
        <Popover modal={false}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-[13px] font-normal h-8 px-3">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              {selectedAccountIds.size === 0
                ? "Todas as contas"
                : `${selectedAccountIds.size} conta(s)`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-h-72 overflow-y-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
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
            <div className="border-t border-border/50 pt-2 mt-2 sticky bottom-0 bg-popover">
              <PopoverClose asChild>
                <Button variant="outline" size="sm" className="w-full">Fechar</Button>
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>

        {/* Period filter (open view only) */}
        {viewMode === "open" && (
          <Popover modal={false} open={periodPopoverOpen} onOpenChange={setPeriodPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-[13px] font-normal h-8 px-3">
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                {periodDateField === "date" ? "Lançamento: " : ""}
                {duePeriod === "day" ? "Hoje" : duePeriod === "week" ? "Semana" : duePeriod === "month" ? "Mês" : "Período"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="flex flex-col gap-1">
                {/* Date field selector */}
                <div className="flex items-center gap-1 mb-1 pb-1 border-b border-border/50">
                  <button
                    onClick={() => setPeriodDateField("due_date")}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      periodDateField === "due_date" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    Dt. Vencimento
                  </button>
                  <button
                    onClick={() => setPeriodDateField("date")}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      periodDateField === "date" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    Dt. Lançamento
                  </button>
                </div>
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
                      <Popover open={rangeFromOpen} onOpenChange={setRangeFromOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !rangeFrom && "text-muted-foreground")}>
                            {rangeFrom ? format(rangeFrom, "dd/MM/yyyy") : "Início"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={rangeFrom} onSelect={(d) => { setRangeFrom(d); setRangeFromOpen(false); }} locale={pt} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Até</label>
                      <Popover open={rangeToOpen} onOpenChange={setRangeToOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !rangeTo && "text-muted-foreground")}>
                            {rangeTo ? format(rangeTo, "dd/MM/yyyy") : "Fim"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={rangeTo} onSelect={(d) => { setRangeTo(d); setRangeToOpen(false); setPeriodPopoverOpen(false); }} locale={pt} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Filter: only no due date */}
        {viewMode === "open" && (
          <Button
            variant={onlyNoDueDate ? "default" : "outline"}
            size="sm"
            className="text-[13px] font-normal h-8 px-3"
            onClick={() => setOnlyNoDueDate(!onlyNoDueDate)}
          >
            Sem Vencimento
          </Button>
        )}

        {/* Filtro Aprovação (open view only) */}
        {viewMode === "open" && (
          <Button
            variant={onlyPending ? "default" : "outline"}
            size="sm"
            className="text-[13px] font-normal h-8 px-3"
            onClick={() => setOnlyPending(!onlyPending)}
          >
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Aprovação
          </Button>
        )}

        {/* Period filter for paid view */}
        {viewMode === "paid" && (
          <Popover modal={false} open={paidPeriodPopoverOpen} onOpenChange={setPaidPeriodPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-[13px] font-normal h-8 px-3">
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                {paidPeriod === "all" ? "Todas" : paidPeriod === "yesterday" ? "Ontem" : paidPeriod === "week" ? "Última Semana" : paidPeriod === "month" ? "Último Mês" : "Período"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="flex flex-col gap-1">
                {([["all", "Todas"], ["yesterday", "Ontem"], ["week", "Última Semana"], ["month", "Último Mês"], ["range", "Período personalizado"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => { setPaidPeriod(val); if (val !== "range") setPaidPeriodPopoverOpen(false); }}
                    className={cn(
                      "rounded px-3 py-1.5 text-sm text-left transition-colors",
                      paidPeriod === val ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    )}
                  >
                    {label}
                  </button>
                ))}
                {paidPeriod === "range" && (
                  <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border/50">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">De</label>
                      <Popover open={paidRangeFromOpen} onOpenChange={setPaidRangeFromOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !paidRangeFrom && "text-muted-foreground")}>
                            {paidRangeFrom ? format(paidRangeFrom, "dd/MM/yyyy") : "Início"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={paidRangeFrom} onSelect={(d) => { setPaidRangeFrom(d); setPaidRangeFromOpen(false); }} locale={pt} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Até</label>
                      <Popover open={paidRangeToOpen} onOpenChange={setPaidRangeToOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !paidRangeTo && "text-muted-foreground")}>
                            {paidRangeTo ? format(paidRangeTo, "dd/MM/yyyy") : "Fim"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={paidRangeTo} onSelect={(d) => { setPaidRangeTo(d); setPaidRangeToOpen(false); setPaidPeriodPopoverOpen(false); }} locale={pt} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}




        {isAdmin && selectedPendingCount > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={bulkApproveMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
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
        ) : viewMode === "open" ? (
          /* ===== OPEN TRANSACTIONS VIEW ===== */
          filtered.length === 0 ? (
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
                      onDelete={(id) => handleDeleteRequest(id)}
                      onToggleHidden={isAdmin ? handleToggleHidden : undefined}
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
                      onDelete={(id) => handleDeleteRequest(id)}
                      onToggleHidden={isAdmin ? handleToggleHidden : undefined}
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
                      onDelete={(id) => handleDeleteRequest(id)}
                      onToggleHidden={isAdmin ? handleToggleHidden : undefined}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* ===== PAID TRANSACTIONS VIEW ===== */
          paidTransactions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Sem transações liquidadas no período selecionado.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-center justify-end mb-3">
                <span className="text-xs text-muted-foreground">{paidTransactions.length} transação(ões)</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 text-left font-medium">Descrição</th>
                    <th className="hidden pb-3 text-left font-medium sm:table-cell">Evento</th>
                    <th className="hidden pb-3 text-left font-medium md:table-cell">Fornecedor</th>
                    
                    <th className="pb-3 text-left font-medium">Estado</th>
                    <th className="pb-3 text-left font-medium">Data Pgto</th>
                    <th className="pb-3 text-right font-medium">Pago</th>
                    <th className="pb-3 text-right font-medium">Valor c/IVA</th>
                    <th className="pb-3 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {paidTransactions.map((t) => (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      isAdmin={isAdmin}
                      selectable={false}
                      selected={false}
                      onToggleSelect={() => {}}
                      showSelectColumn={false}
                      eventCompleted={(t.events as any)?.status === "completed"}
                      showPaymentDate={true}
                      onEdit={(id) => setEditingId(id)}
                      onApprove={(id) => approveMutation.mutate(id)}
                      onPayment={(id) => setShowPaymentId(id)}
                      onDocs={(id) => setShowDocsId(id)}
                      onAudit={(id) => setShowAuditId(id)}
                      onDelete={(id) => handleDeleteRequest(id)}
                      onToggleHidden={isAdmin ? handleToggleHidden : undefined}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) { setDeletingId(null); setDeleteWarnings([]); setDeleteChecked(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar transação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Esta ação é irreversível. A transação será permanentemente eliminada e registada no log de auditoria.</p>
                {!deleteChecked && <p className="text-muted-foreground text-xs">A verificar dependências…</p>}
                {deleteChecked && deleteWarnings.length > 0 && (
                  <div className="rounded-md border border-warning/30 bg-warning/10 p-3 space-y-1">
                    <p className="text-xs font-semibold text-warning">⚠️ Atenção — esta transação tem vínculos:</p>
                    <ul className="text-xs text-warning list-disc pl-4 space-y-0.5">
                      {deleteWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteChecked}
              onClick={() => { if (deletingId) deleteMutation.mutate(deletingId); setDeletingId(null); setDeleteWarnings([]); setDeleteChecked(false); }}
            >
              {deleteWarnings.length > 0 ? "Eliminar Mesmo Assim" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
