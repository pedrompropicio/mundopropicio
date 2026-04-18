import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, calcIvaAmount } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { Plus, ShieldCheck, Filter, ArrowRightLeft, CalendarDays, ClipboardList, Search, X, EyeOff, FileText, SlidersHorizontal } from "lucide-react";
import { TransactionFiltersPanel } from "@/components/TransactionFiltersPanel";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";
import { moveToTrash } from "@/lib/trash";
import { deleteTransactionCascade } from "@/lib/delete-transaction-cascade";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import { TransactionAuditModal } from "@/components/TransactionAuditModal";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { TransactionPaymentsListModal } from "@/components/TransactionPaymentsListModal";
import { TransactionRow } from "@/components/TransactionRow";
import { TransferFormModal } from "@/components/TransferFormModal";
import { BatchPaymentModal } from "@/components/BatchPaymentModal";
import { TicketOfficeSettlementLauncher } from "@/components/TicketOfficeSettlementLauncher";
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
  const [onlyGrouped, setOnlyGrouped] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPaymentId, setShowPaymentId] = useState<string | null>(null);
  const [showAuditId, setShowAuditId] = useState<string | null>(null);
  const [showDocsId, setShowDocsId] = useState<string | null>(null);
  const [showPaymentsListId, setShowPaymentsListId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showTransfer, setShowTransfer] = useState(false);
  const [showBatchPayment, setShowBatchPayment] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin, isManager, user, hasPermission } = useAuth();
  const canApprove = isAdmin || isManager;
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

  const { data: suppliersList = [] } = useQuery({
    queryKey: ["suppliers-list-filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
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
        .select("*, events(name, status, parent_event_id, event_type), account_categories(code, name), suppliers(name), financial_accounts(name)")
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
      // Capture previous status for undo
      const { data: prev } = await supabase
        .from("transactions")
        .select("id, status, payment_date, paid_amount, account_id, description")
        .eq("id", id)
        .maybeSingle();
      const { data, error } = await supabase.functions.invoke("approve-transaction", {
        body: { transaction_ids: [id] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { data, prev };
    },
    onSuccess: async ({ data, prev }) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (data?.approved_count > 0) {
        // Record undo
        if (prev && user) {
          const { recordUndo } = await import("@/lib/undo");
          const { showUndoToast } = await import("@/hooks/useUndoToast");
          const undoRec = await recordUndo({
            action_type: "approve_transaction",
            entity_type: "transaction",
            entity_id: prev.id,
            payload: {
              previousStatus: prev.status ?? "pending",
              previousPaymentDate: prev.payment_date,
              previousPaidAmount: prev.paid_amount ?? 0,
              previousAccountId: prev.account_id,
            },
            description: `Aprovação: ${prev.description ?? ""}`.slice(0, 200),
            performed_by: user.id,
            performed_by_name: user.user_metadata?.full_name ?? user.email ?? undefined,
          });
          if (undoRec) {
            showUndoToast({
              message: "Transação aprovada",
              description: data?.skipped_count > 0
                ? "Alguns itens já não estavam pendentes e foram ignorados. Toque em Desfazer para reverter."
                : undefined,
              undoId: undoRec.id,
              user: { id: user.id, name: user.user_metadata?.full_name ?? user.email ?? undefined },
              onUndone: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
            });
            return;
          }
        }
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
      await deleteTransactionCascade({ transactionId: id, user });
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
    return [...items].sort((a: any, b: any) => {
      // 1) Data de Vencimento (mais próxima primeiro)
      const aPrimary = a.due_date ?? a.date;
      const bPrimary = b.due_date ?? b.date;
      if (aPrimary !== bPrimary) return aPrimary.localeCompare(bPrimary);
      // 2) Evento (alfabético)
      const aEvent = a.events?.name ?? "";
      const bEvent = b.events?.name ?? "";
      if (aEvent !== bEvent) return aEvent.localeCompare(bEvent, "pt", { sensitivity: "base" });
      // 3) Categoria (por código hierárquico)
      const aCatCode = a.account_categories?.code ?? "";
      const bCatCode = b.account_categories?.code ?? "";
      if (aCatCode !== bCatCode) return aCatCode.localeCompare(bCatCode, undefined, { numeric: true });
      // 4) Fornecedor (alfabético)
      const aSupp = a.suppliers?.name ?? "";
      const bSupp = b.suppliers?.name ?? "";
      if (aSupp !== bSupp) return aSupp.localeCompare(bSupp, "pt", { sensitivity: "base" });
      // 5) Nº Fatura
      const aInv = a.invoice_ref ?? "";
      const bInv = b.invoice_ref ?? "";
      return aInv.localeCompare(bInv, undefined, { numeric: true });
    });
  };

  // Compute all invoice_refs in use (any transaction with invoice_ref counts as "grouped by invoice")
  const groupedInvoiceRefs = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const ref = (t as any).invoice_ref?.trim();
      if (ref) set.add(ref);
    }
    return set;
  }, [transactions]);

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
    .filter((t: any) => !t.parent_transaction_id) // hide child splits — shown via master expand
    .filter((t: any) => showHidden || !t.is_hidden) // hide hidden transactions unless toggle is on
    .filter(matchesSearch)
    .filter(matchesEventFilter)
    .filter((t) => selectedAccountIds.size === 0 || (t.account_id && selectedAccountIds.has(t.account_id)))
    .filter((t) => selectedSupplierIds.size === 0 || (t.supplier_id && selectedSupplierIds.has(t.supplier_id)))
    .filter((t) => {
      if (t.status === "paid") return false;
      const paidAmount = Number(t.paid_amount ?? 0);
      const amount = Number(t.amount);
      return paidAmount < amount - 0.01;
    })
    .filter((t) => !onlyPending || t.status === "pending")
    .filter((t: any) => !onlyGrouped || groupedInvoiceRefs.has(t.invoice_ref?.trim()));

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
      .filter((t: any) => !t.parent_transaction_id) // hide child splits — shown via master expand
      .filter((t: any) => showHidden || !t.is_hidden)
      .filter(matchesSearch)
      .filter(matchesEventFilter)
      .filter((t) => selectedAccountIds.size === 0 || (t.account_id && selectedAccountIds.has(t.account_id)))
      .filter((t) => selectedSupplierIds.size === 0 || (t.supplier_id && selectedSupplierIds.has(t.supplier_id)))
      .filter((t) => {
        const paidAmount = Number(t.paid_amount ?? 0);
        const amount = Number(t.amount);
        return paidAmount >= amount - 0.01 || t.status === "paid";
      })
      .filter((t: any) => !onlyGrouped || groupedInvoiceRefs.has(t.invoice_ref?.trim()));

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
    return [...result].sort((a: any, b: any) => {
      // 1) Data de Pagamento (mais recente primeiro) — normalizar para YYYY-MM-DD
      const aDate = (a.payment_date ?? a.date ?? "").slice(0, 10);
      const bDate = (b.payment_date ?? b.date ?? "").slice(0, 10);
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      // 2) Evento (alfabético)
      const aEvent = a.events?.name ?? "";
      const bEvent = b.events?.name ?? "";
      if (aEvent !== bEvent) return aEvent.localeCompare(bEvent, "pt", { sensitivity: "base" });
      // 3) Categoria (por código hierárquico)
      const aCatCode = a.account_categories?.code ?? "";
      const bCatCode = b.account_categories?.code ?? "";
      if (aCatCode !== bCatCode) return aCatCode.localeCompare(bCatCode, undefined, { numeric: true });
      // 4) Fornecedor (alfabético)
      const aSupp = a.suppliers?.name ?? "";
      const bSupp = b.suppliers?.name ?? "";
      if (aSupp !== bSupp) return aSupp.localeCompare(bSupp, "pt", { sensitivity: "base" });
      // 5) Nº Fatura
      const aInv = a.invoice_ref ?? "";
      const bInv = b.invoice_ref ?? "";
      return aInv.localeCompare(bInv, undefined, { numeric: true });
    });
  }, [transactions, filter, selectedEventIds, selectedAccountIds, selectedSupplierIds, paidPeriod, paidRangeFrom, paidRangeTo, showHidden, onlyGrouped, groupedInvoiceRefs]);

  // Pending transactions in current filtered view
  const pendingInView = filtered.filter((t) => t.status === "pending");
  const selectedPendingCount = [...selectedIds].filter((id) =>
    pendingInView.some((t) => t.id === id)
  ).length;

  // Approved (payable) transactions in current filtered view
  const approvedInView = filtered.filter((t) => t.status === "approved" || t.status === "overdue" || (t.due_date && t.due_date < new Date().toISOString().slice(0, 10) && t.status !== "paid" && t.status !== "pending"));
  const selectedApprovedCount = [...selectedIds].filter((id) =>
    approvedInView.some((t) => t.id === id)
  ).length;

  const selectableInView = [...pendingInView, ...approvedInView];
  const hasSelectableItems = canApprove && selectableInView.length > 0;

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

  const handleBatchPayment = () => {
    const ids = [...selectedIds].filter((id) =>
      approvedInView.some((t) => t.id === id)
    );
    if (ids.length === 0) {
      toast({ title: "Selecione transações aprovadas para liquidar", variant: "destructive" });
      return;
    }
    // Validate that all selected transactions share the same invoice_ref (or all empty)
    const selectedTxs = transactions.filter((t: any) => ids.includes(t.id));
    const refs = new Set(selectedTxs.map((t: any) => (t.invoice_ref ?? "").trim()));
    if (refs.size > 1) {
      const list = [...refs].map((r) => r || "(sem fatura)").join(", ");
      toast({
        title: "Faturas diferentes na seleção",
        description: `Para liquidar em lote, todas as transações devem ter o mesmo nº de fatura. Encontradas: ${list}`,
        variant: "destructive",
      });
      return;
    }
    setShowBatchPayment(true);
  };

  const batchPaymentTransactions = transactions.filter((t: any) =>
    [...selectedIds].some((id) => id === t.id && approvedInView.some((a) => a.id === id))
  );

  const batchInitialInvoiceRef = (() => {
    const refs = new Set(batchPaymentTransactions.map((t: any) => (t.invoice_ref ?? "").trim()));
    if (refs.size === 1) {
      const only = [...refs][0];
      return only || "";
    }
    return "";
  })();

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
          {(isAdmin || isManager || hasPermission("manage_ticket_offices")) && (
            <TicketOfficeSettlementLauncher />
          )}
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

      {showBatchPayment && batchPaymentTransactions.length > 0 && (
        <BatchPaymentModal
          transactions={batchPaymentTransactions}
          initialInvoiceRef={batchInitialInvoiceRef}
          onClose={() => { setShowBatchPayment(false); setSelectedIds(new Set()); }}
        />
      )}

      {showForm && (
        <TransactionFormModal onClose={() => setShowForm(false)} />
      )}

      {editingTransaction && (
        <TransactionEditModal
          transaction={editingTransaction}
          onClose={() => setEditingId(null)}
          isAdmin={canApprove}
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

      {showPaymentsListId && (
        <TransactionPaymentsListModal
          transaction={transactions.find((t) => t.id === showPaymentsListId) ?? { id: showPaymentsListId }}
          isAdmin={canApprove}
          onClose={() => setShowPaymentsListId(null)}
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

        {/* Unified Filters button (Sheet) */}
        {(() => {
          const activeCount =
            (selectedEventIds.size > 0 ? 1 : 0) +
            (selectedAccountIds.size > 0 ? 1 : 0) +
            (selectedSupplierIds.size > 0 ? 1 : 0) +
            (onlyPending ? 1 : 0) +
            (onlyNoDueDate ? 1 : 0) +
            (onlyGrouped ? 1 : 0) +
            (showHidden ? 1 : 0);
          return (
            <Button
              variant={activeCount > 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltersOpen(true)}
              className="text-[13px] font-normal h-8 px-3"
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Filtros
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 rounded-full px-1.5 text-[10px]">{activeCount}</Badge>
              )}
            </Button>
          );
        })()}

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

        {/* Toggles "Sem Vencimento", "Aprovação" e "Agrupadas" foram movidos para o painel Filtros */}

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




        {canApprove && selectedPendingCount > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={bulkApproveMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            Aprovar {selectedPendingCount} selecionada{selectedPendingCount > 1 ? "s" : ""}
          </button>
        )}

        {canApprove && selectedApprovedCount > 0 && (
          <button
            onClick={handleBatchPayment}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-sky-700"
          >
            <FileText className="h-4 w-4" />
            Liquidar {selectedApprovedCount} como Fatura
          </button>
        )}

      </div>

      {/* Active filter chips */}
      {(() => {
        const chips: { key: string; label: string; onRemove: () => void }[] = [];
        if (selectedEventIds.size > 0) {
          const names = events.filter((e: any) => selectedEventIds.has(e.id)).map((e: any) => e.name);
          const label = names.length <= 2 ? names.join(", ") : `${names.length} eventos`;
          chips.push({ key: "events", label: `Evento: ${label}`, onRemove: () => setSelectedEventIds(new Set()) });
        }
        if (selectedAccountIds.size > 0) {
          const names = accounts.filter((a: any) => selectedAccountIds.has(a.id)).map((a: any) => a.name);
          const label = names.length <= 2 ? names.join(", ") : `${names.length} contas`;
          chips.push({ key: "accounts", label: `Conta: ${label}`, onRemove: () => setSelectedAccountIds(new Set()) });
        }
        if (selectedSupplierIds.size > 0) {
          const names = suppliersList.filter((s: any) => selectedSupplierIds.has(s.id)).map((s: any) => s.name);
          const label = names.length <= 2 ? names.join(", ") : `${names.length} fornecedores`;
          chips.push({ key: "suppliers", label: `Fornecedor: ${label}`, onRemove: () => setSelectedSupplierIds(new Set()) });
        }
        if (onlyPending) chips.push({ key: "pending", label: "Aprovação pendente", onRemove: () => setOnlyPending(false) });
        if (onlyNoDueDate) chips.push({ key: "nodue", label: "Sem vencimento", onRemove: () => setOnlyNoDueDate(false) });
        if (onlyGrouped) chips.push({ key: "grouped", label: "Agrupadas por fatura", onRemove: () => setOnlyGrouped(false) });
        if (showHidden) chips.push({ key: "hidden", label: "Ocultas visíveis", onRemove: () => setShowHidden(false) });
        if (chips.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={c.onRemove}
                className="group inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                {c.label}
                <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
              </button>
            ))}
            <button
              onClick={() => {
                setSelectedEventIds(new Set());
                setSelectedAccountIds(new Set());
                setSelectedSupplierIds(new Set());
                setOnlyPending(false);
                setOnlyNoDueDate(false);
                setOnlyGrouped(false);
                setShowHidden(false);
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
            >
              Limpar tudo
            </button>
          </div>
        );
      })()}

      {/* Filters Sheet */}
      <TransactionFiltersPanel
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        selectedEventIds={selectedEventIds}
        setSelectedEventIds={setSelectedEventIds}
        selectedAccountIds={selectedAccountIds}
        setSelectedAccountIds={setSelectedAccountIds}
        selectedSupplierIds={selectedSupplierIds}
        setSelectedSupplierIds={setSelectedSupplierIds}
        viewMode={viewMode}
        onlyPending={onlyPending}
        setOnlyPending={setOnlyPending}
        onlyNoDueDate={onlyNoDueDate}
        setOnlyNoDueDate={setOnlyNoDueDate}
        onlyGrouped={onlyGrouped}
        setOnlyGrouped={setOnlyGrouped}
        showHidden={showHidden}
        setShowHidden={setShowHidden}
        isAdmin={isAdmin}
        onClearAll={() => {
          setSelectedEventIds(new Set());
          setSelectedAccountIds(new Set());
          setSelectedSupplierIds(new Set());
          setOnlyPending(false);
          setOnlyNoDueDate(false);
          setOnlyGrouped(false);
          setShowHidden(false);
        }}
      />

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
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {canApprove && pendingInView.length > 0 && (
                      <th className="pb-2 pr-1 text-center font-medium w-6">
                        <input
                          type="checkbox"
                          checked={selectedPendingCount === pendingInView.length && pendingInView.length > 0}
                          onChange={toggleSelectAll}
                          className="h-3 w-3 rounded border-border accent-primary cursor-pointer"
                          title="Selecionar todas pendentes"
                        />
                      </th>
                    )}
                    <th className="pb-2 pr-2 text-left font-medium">Descrição</th>
                    <th className="hidden pb-2 pr-2 text-left font-medium sm:table-cell">Evento</th>
                    <th className="hidden pb-2 pr-2 text-left font-medium md:table-cell">Fornecedor</th>
                    <th className="hidden pb-2 pr-2 text-left font-medium lg:table-cell">Categoria</th>
                    <th className="pb-2 pr-2 text-left font-medium">Estado</th>
                    <th className="pb-2 pr-2 text-left font-medium">Data Vcto</th>
                    <th className="pb-2 pr-2 text-right font-medium">Pago</th>
                    <th className="pb-2 pr-2 text-right font-medium">Valor c/IVA</th>
                    <th className="pb-2 text-center font-medium">Ações</th>
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
                      isAdmin={canApprove}
                      selectable={canApprove && (t.status === "pending" || t.status === "approved")}
                      selected={selectedIds.has(t.id)}
                      onToggleSelect={() => toggleSelect(t.id)}
                      showSelectColumn={hasSelectableItems}
                      eventCompleted={(t.events as any)?.status === "completed"}
                      onEdit={(id) => setEditingId(id)}
                      onApprove={(id) => approveMutation.mutate(id)}
                      onPayment={(id) => setShowPaymentId(id)}
                      onDocs={(id) => setShowDocsId(id)}
                      onAudit={(id) => setShowAuditId(id)}
                      onDelete={(id) => handleDeleteRequest(id)}
                      onToggleHidden={isAdmin ? handleToggleHidden : undefined}
                      onViewPayments={(id) => setShowPaymentsListId(id)}
                      highlightId={highlightId}
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
                      isAdmin={canApprove}
                      selectable={canApprove && (t.status === "pending" || t.status === "approved")}
                      selected={selectedIds.has(t.id)}
                      onToggleSelect={() => toggleSelect(t.id)}
                      showSelectColumn={hasSelectableItems}
                      eventCompleted={(t.events as any)?.status === "completed"}
                      onEdit={(id) => setEditingId(id)}
                      onApprove={(id) => approveMutation.mutate(id)}
                      onPayment={(id) => setShowPaymentId(id)}
                      onDocs={(id) => setShowDocsId(id)}
                      onAudit={(id) => setShowAuditId(id)}
                      onDelete={(id) => handleDeleteRequest(id)}
                      onToggleHidden={isAdmin ? handleToggleHidden : undefined}
                      onViewPayments={(id) => setShowPaymentsListId(id)}
                      highlightId={highlightId}
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
                      isAdmin={canApprove}
                      selectable={canApprove && (t.status === "pending" || t.status === "approved")}
                      selected={selectedIds.has(t.id)}
                      onToggleSelect={() => toggleSelect(t.id)}
                      showSelectColumn={hasSelectableItems}
                      eventCompleted={(t.events as any)?.status === "completed"}
                      onEdit={(id) => setEditingId(id)}
                      onApprove={(id) => approveMutation.mutate(id)}
                      onPayment={(id) => setShowPaymentId(id)}
                      onDocs={(id) => setShowDocsId(id)}
                      onAudit={(id) => setShowAuditId(id)}
                      onDelete={(id) => handleDeleteRequest(id)}
                      onToggleHidden={isAdmin ? handleToggleHidden : undefined}
                      onViewPayments={(id) => setShowPaymentsListId(id)}
                      highlightId={highlightId}
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
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-2 text-left font-medium">Descrição</th>
                    <th className="hidden pb-2 pr-2 text-left font-medium sm:table-cell">Evento</th>
                    <th className="hidden pb-2 pr-2 text-left font-medium md:table-cell">Fornecedor</th>
                    <th className="hidden pb-2 pr-2 text-left font-medium lg:table-cell">Categoria</th>
                    <th className="pb-2 pr-2 text-left font-medium">Estado</th>
                    <th className="pb-2 pr-2 text-left font-medium">Data Pgto</th>
                    <th className="pb-2 pr-2 text-right font-medium">Pago</th>
                    <th className="pb-2 pr-2 text-right font-medium">Valor c/IVA</th>
                    <th className="pb-2 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {paidTransactions.map((t) => (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      isAdmin={canApprove}
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
                      onViewPayments={(id) => setShowPaymentsListId(id)}
                      highlightId={highlightId}
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
