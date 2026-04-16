import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { calcWithIva, isFullyPaid } from "@/lib/utils";
import { Pencil, ShieldCheck, CreditCard, Paperclip, History, ChevronDown, ChevronRight, Trash2, AlertTriangle, UserCheck, EyeOff, Eye, Layers } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LocalReinforcementBadge } from "@/components/LocalReinforcementBadge";
import { toast } from "@/hooks/use-toast";

interface Props {
  transaction: any;
  isAdmin: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  showSelectColumn?: boolean;
  eventCompleted?: boolean;
  showPaymentDate?: boolean;
  onEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onPayment: (id: string) => void;
  onDocs: (id: string) => void;
  onAudit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleHidden?: (id: string, currentlyHidden: boolean) => void;
  onViewPayments?: (id: string) => void;
  highlightId?: string | null;
}

function DocsBadgeButton({ transactionId, onClick }: { transactionId: string; onClick: () => void }) {
  const { data: docs = [] } = useQuery({
    queryKey: ["transaction_documents_summary", transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("id, file_url")
        .eq("transaction_id", transactionId);
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const refDocs = docs.filter((d) => d.file_url.startsWith("ref://"));
  const realDocs = docs.filter((d) => !d.file_url.startsWith("ref://"));
  const hasPendingRef = refDocs.length > 0 && realDocs.length === 0;
  const hasRealDocs = realDocs.length > 0;
  const count = realDocs.length;

  return (
    <button onClick={onClick} className="relative rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Documentos">
      <Paperclip className="h-3.5 w-3.5" />
      {hasPendingRef && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-warning text-[7px] font-bold text-warning-foreground">!</span>
      )}
      {hasRealDocs && !hasPendingRef && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-success text-[7px] font-bold text-success-foreground">{count > 9 ? "+" : count}</span>
      )}
    </button>
  );
}

export function TransactionRow({ transaction: t, isAdmin, selectable, selected, onToggleSelect, showSelectColumn, eventCompleted, showPaymentDate, onEdit, onApprove, onPayment, onDocs, onAudit, onDelete, onToggleHidden, onViewPayments, highlightId }: Props) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [childrenExpanded, setChildrenExpanded] = useState(false);
  const isHidden = !!t.is_hidden;
  const isHighlighted = highlightId === t.id;
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (isHighlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  // Only consider as potential parent split if no parent and no event
  const mightBeParentSplit = !t.parent_transaction_id && !t.event_id && t.split_percentage === null;

  const { data: movements = [] } = useQuery({
    queryKey: ["transaction-movements", t.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_audit_log")
        .select("*")
        .eq("transaction_id", t.id)
        .order("changed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: expanded,
  });

  // For potential parent split transactions, fetch child event names
  const { data: childEventNames = [] } = useQuery({
    queryKey: ["split-child-events", t.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("event_id, events(name), split_percentage, split_amount")
        .eq("parent_transaction_id", t.id);
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        name: c.events?.name ?? "—",
        pct: c.split_percentage != null ? Number(c.split_percentage) : null,
        absAmount: c.split_amount != null ? Number(c.split_amount) : null,
      }));
    },
    enabled: mightBeParentSplit,
    staleTime: 60_000,
  });

  // Fetch full child transactions for expandable sub-rows
  const { data: childTransactions = [] } = useQuery({
    queryKey: ["split-children-full", t.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, events(name, status, parent_event_id, event_type), account_categories(code, name), suppliers(name), financial_accounts(name)")
        .eq("parent_transaction_id", t.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: mightBeParentSplit && childrenExpanded,
    staleTime: 60_000,
  });

  // Only mark as parent split if it actually has child transactions
  const isParentSplit = mightBeParentSplit && childEventNames.length > 0;

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("email, full_name");
      if (error) throw error;
      return data;
    },
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
  });

  const resolveUserName = (changedBy: string) => {
    if (!changedBy || changedBy === "sistema") return "Sistema";
    if (changedBy === "utilizador") {
      return profiles.length > 0 ? profiles[0]?.full_name || changedBy : changedBy;
    }
    // Check if it's an email and try to find the name
    const profile = profiles.find((p) => p.email === changedBy);
    if (profile?.full_name) return profile.full_name;
    return changedBy;
  };

  // Check if this expense is paid by a partner
  const { data: partnerPaidInfo } = useQuery({
    queryKey: ["partner-paid-check", t.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("id, event_partners(suppliers(name))")
        .eq("transaction_id", t.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  // Invoice grouping: count sibling transactions with same invoice_ref
  const invoiceRef = t.invoice_ref;
  const { data: invoiceSiblings } = useQuery({
    queryKey: ["invoice-group", invoiceRef],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, iva_rate, type")
        .eq("invoice_ref", invoiceRef!)
        .order("description");
      if (error) throw error;
      return data;
    },
    enabled: !!invoiceRef,
    staleTime: 60_000,
  });
  const invoiceGroupCount = invoiceSiblings?.length ?? 0;
  const invoiceGroupTotal = invoiceSiblings?.reduce((sum, s) => {
    const base = Number(s.amount);
    const iva = base * ((s.iva_rate ?? 23) / 100);
    return sum + base + iva;
  }, 0) ?? 0;

  // Local reinforcement detection: expense in tour sub-event with category in Master BP but not linked
  const isTourSubEvent = !!t.event_id && !!(t.events as any)?.parent_event_id;
  const parentTourEventId = isTourSubEvent ? (t.events as any)?.parent_event_id : null;
  const { data: localReinforcementInfo } = useQuery({
    queryKey: ["local-reinforcement-check", t.id, parentTourEventId, t.category_id],
    queryFn: async () => {
      // Check if category exists in Master BP
      const { data: masterFc } = await supabase
        .from("event_forecasts")
        .select("id")
        .eq("event_id", parentTourEventId!)
        .eq("type", "expense")
        .eq("category_id", t.category_id!)
        .limit(1);
      if (!masterFc?.length) return { isLocal: false };
      // Check if this transaction is linked to a master forecast
      const { data: linkedFc } = await supabase
        .from("event_forecasts")
        .select("master_forecast_id")
        .eq("transaction_id", t.id)
        .not("master_forecast_id", "is", null)
        .limit(1);
      return { isLocal: !linkedFc?.length };
    },
    enabled: isTourSubEvent && t.type === "expense" && !!t.category_id,
    staleTime: 60_000,
  });
  const isLocalReinforcement = localReinforcementInfo?.isLocal ?? false;

  const eventName = isParentSplit ? "" : ((t.events as any)?.name ?? "—");
  const supplierName = (t.suppliers as any)?.name ?? "—";
  const accountName = (t.financial_accounts as any)?.name ?? null;
  const ivaRate = (t.iva_rate ?? 23) as IvaRate;
  const amount = Number(t.amount); // valor base (sem IVA)
  const totalWithIva = calcWithIva(amount, ivaRate);
  const ivaValue = totalWithIva - amount;
  const paidAmount = Number(t.paid_amount ?? 0);
  const balance = Math.round((totalWithIva - paidAmount) * 100) / 100;
  const isExpense = t.type === "expense";
  const isChildSplit = !!t.parent_transaction_id;
  const splitPct = t.split_percentage != null ? Number(t.split_percentage) : null;
  const splitAmt = (t as any).split_amount != null ? Number((t as any).split_amount) : null;

  // Compute effective status
  const computedStatus = (() => {
    if (t.status === "paid" || isFullyPaid(paidAmount, amount, ivaRate)) return "paid";
    // Check overdue before approved — only overdue if due_date is strictly before today (not today itself)
    const todayStr = new Date().toISOString().slice(0, 10);
    if (t.due_date && t.due_date.slice(0, 10) < todayStr && t.status !== "paid" && t.status !== "pending") return "overdue";
    if (t.status === "approved") return "approved"; // A Pagar
    return "pending"; // Aguardando
  })();

  const statusLabel = isExpense
    ? { pending: "Aguardando", approved: "A Pagar", paid: "Pago", overdue: "Atrasado" }[computedStatus] ?? computedStatus
    : { pending: "Pendente", approved: "Aprovado", paid: "Pago", overdue: "Atrasado" }[computedStatus] ?? computedStatus;

  const statusClass = {
    pending: "bg-warning/15 text-warning",
    approved: "bg-blue-500/15 text-blue-400",
    paid: "bg-success/15 text-success",
    overdue: "bg-destructive/15 text-destructive",
  }[computedStatus] ?? "bg-secondary text-muted-foreground";

  return (
    <>
      <tr ref={rowRef} className={`hover:bg-secondary/20 transition-colors ${computedStatus === "paid" ? "opacity-80" : ""} ${selected ? "bg-primary/5" : ""} ${isHidden ? "opacity-50 bg-muted/20" : ""} ${isHighlighted ? "ring-2 ring-primary ring-inset bg-primary/10 animate-pulse" : ""}`}>
        {showSelectColumn && (
          <td className="py-3 pr-2 text-center w-8">
            {selectable ? (
              <input
                type="checkbox"
                checked={!!selected}
                onChange={onToggleSelect}
                className={`h-3.5 w-3.5 rounded cursor-pointer ${
                  computedStatus === "pending"
                    ? "accent-emerald-500 border-emerald-500"
                    : "accent-sky-500 border-sky-500"
                }`}
                title={computedStatus === "pending" ? "Selecionar para aprovar" : "Selecionar para liquidar"}
              />
            ) : null}
          </td>
        )}
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => isParentSplit ? setChildrenExpanded(!childrenExpanded) : setExpanded(!expanded)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              title={isParentSplit ? "Ver subeventos" : "Ver movimentos"}
            >
              {(isParentSplit ? childrenExpanded : expanded) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-medium">{t.description}</p>
                {isHidden && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <EyeOff className="h-2.5 w-2.5" /> Oculta
                  </span>
                )}
                {t.pl_override_note && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning cursor-help">
                        Fora do BP
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs font-medium">Justificação:</p>
                      <p className="text-xs">{t.pl_override_note}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {isChildSplit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 rounded border border-muted-foreground/30 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground cursor-help">
                        Split {splitAmt != null ? `${splitAmt.toFixed(2)}€` : splitPct != null ? `${splitPct}%` : ""}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <p>Transação split vinculada a um rateio multi-evento.</p>
                      <p className="mt-1 text-muted-foreground">A liquidação é feita na transação master e propagada automaticamente.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {isParentSplit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary cursor-help">
                        Master
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <p>Transação master de rateio multi-evento.</p>
                      <p className="mt-1 text-muted-foreground">A liquidação aqui propaga automaticamente para todas as transações split.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {partnerPaidInfo && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 rounded border border-accent/50 bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground cursor-help">
                        <UserCheck className="h-2.5 w-2.5" />
                        Sócio
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <p>Despesa paga pelo sócio: {(partnerPaidInfo as any)?.event_partners?.suppliers?.name ?? "—"}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {t.is_transitory && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400 cursor-help">
                        🔄 Transitória
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <p>Transação transitória (caução/depósito) — não impacta o resultado do evento.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {t.exclude_from_result && !t.is_transitory && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400 cursor-help">
                        📋 Fora do Resultado
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <p>Despesa registada para histórico — não impacta o resultado financeiro (DRE/PL).</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {invoiceRef && invoiceGroupCount > 1 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary cursor-help">
                        📄 {invoiceRef} ({invoiceGroupCount}) — {formatCurrency(invoiceGroupTotal)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm text-xs space-y-1">
                      <p className="font-medium">Fatura agrupada: {invoiceRef}</p>
                      <p>{invoiceGroupCount} transações — Total: {formatCurrency(invoiceGroupTotal)}</p>
                      <div className="mt-1 space-y-0.5">
                        {invoiceSiblings?.map((s) => (
                          <p key={s.id} className={`${s.id === t.id ? "font-semibold" : "text-muted-foreground"}`}>
                            {s.description}: {formatCurrency(Number(s.amount) * (1 + (s.iva_rate ?? 23) / 100))}
                          </p>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
                {invoiceRef && invoiceGroupCount <= 1 && (
                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    📄 {invoiceRef}
                  </span>
                )}
                {isLocalReinforcement && <LocalReinforcementBadge />}
              </div>
              {t.specification && (
                <p className="text-xs text-muted-foreground">{t.specification}</p>
              )}
              {!isParentSplit && eventName && (
                <p className="text-xs text-muted-foreground sm:hidden">{eventName}</p>
              )}
              {isParentSplit && childEventNames.length > 0 && (
                <p className="text-xs text-muted-foreground sm:hidden">
                  {childEventNames.map((c) => c.name).join(", ")}
                </p>
              )}
              {(t.account_categories as any)?.name && (
                <p className="text-xs text-muted-foreground lg:hidden">
                  <span className="text-muted-foreground/70">{(t.account_categories as any)?.code}</span>{" "}
                  {(t.account_categories as any)?.name}
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="hidden py-3 pr-4 sm:table-cell">
          {isParentSplit ? (
            <div>
              {childEventNames.length > 0 ? (
                <div className="space-y-0.5">
                  {childEventNames.map((c, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {c.name}{c.pct != null ? ` (${c.pct}%)` : ""}
                    </p>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/50 italic">Master</span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{eventName}</span>
          )}
        </td>
        <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{supplierName}</td>
        <td className="hidden py-3 pr-4 text-muted-foreground lg:table-cell">
          {(t.account_categories as any)?.name ? (
            <span className="text-xs">
              <span className="text-muted-foreground/70">{(t.account_categories as any)?.code}</span>{" "}
              {(t.account_categories as any)?.name}
            </span>
          ) : (
            <span className="text-muted-foreground/50 italic text-xs">—</span>
          )}
        </td>
        <td className="py-3 pr-4">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
            {statusLabel}
          </span>
          {balance > 0 && computedStatus !== "paid" && (
            <p className="mt-0.5 text-[10px] text-warning">Aberto: {formatCurrency(balance)}</p>
          )}
        </td>
        <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {showPaymentDate ? (
              t.payment_date ? (
                <span>{new Date(t.payment_date).toLocaleDateString("pt-PT")}</span>
              ) : (
                <span className="text-muted-foreground/50 italic text-xs">—</span>
              )
            ) : t.due_date ? (
              <>
                <span>{new Date(t.due_date).toLocaleDateString("pt-PT")}</span>
                {computedStatus !== "paid" && t.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Vencido há {Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86400000)} dia(s)
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            ) : (
              <span className="text-muted-foreground/50 italic text-xs">Indefinido</span>
            )}
          </div>
        </td>
        <td className="py-3 text-right font-mono text-muted-foreground whitespace-nowrap">
          {formatCurrency(paidAmount)}
        </td>
        <td className={`py-3 text-right whitespace-nowrap ${isExpense ? "text-warning" : "text-success"}`}>
          <span className="font-mono font-semibold">{isExpense ? "-" : "+"}{formatCurrency(totalWithIva)}</span>
          {ivaRate > 0 && (
            <p className="text-[10px] text-muted-foreground font-mono">
              Base: {formatCurrency(amount)} + IVA {ivaRate}%
            </p>
          )}
        </td>
        <td className="py-3">
          <div className="flex items-center justify-center gap-1">
            {/* Child split transactions: only docs + audit */}
            {isChildSplit ? (
              <>
                {/* Payment on child: opens parent for full settlement */}
                {!eventCompleted && balance > 0 && (computedStatus === "approved" || computedStatus === "overdue") && t.parent_transaction_id && !t.is_reimbursement && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => onPayment(t.parent_transaction_id)} className="rounded-lg p-1.5 text-success hover:bg-success/15 transition-colors" title="Liquidar via transação master">
                        <CreditCard className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Abre a transação master para liquidação completa
                    </TooltipContent>
                  </Tooltip>
                )}
                <DocsBadgeButton transactionId={t.id} onClick={() => onDocs(t.id)} />
                <button onClick={() => onAudit(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Histórico de alterações">
                  <History className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                {/* Edit: blocked if event completed; paid = limited edit mode */}
                {!eventCompleted && computedStatus !== "paid" && (
                  <button onClick={() => onEdit(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {!eventCompleted && computedStatus === "paid" && (
                  <button onClick={() => onEdit(t.id)} className="rounded-lg p-1.5 text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors" title="Editar especificação / fornecedor">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Approve: admin only, pending/overdue only, not completed */}
                {!eventCompleted && isAdmin && (computedStatus === "pending" || computedStatus === "overdue") && (
                  <button onClick={() => onApprove(t.id)} className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-500/15 transition-colors" title="Aprovar">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Payment/Receipt: only after approved, not completed, not linked to reimbursement note */}
                {!eventCompleted && balance > 0 && (computedStatus === "approved" || computedStatus === "overdue") && !t.is_reimbursement && (
                  <button onClick={() => onPayment(t.id)} className="rounded-lg p-1.5 text-success hover:bg-success/15 transition-colors" title={isExpense ? "Registar pagamento" : "Registar recebimento"}>
                    <CreditCard className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* View Payments History: when there's any paid amount */}
                {onViewPayments && paidAmount > 0 && (
                  <button onClick={() => onViewPayments(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Ver pagamentos">
                    <History className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Reimbursement transactions: show info that payment is via note */}
                {!eventCompleted && balance > 0 && (computedStatus === "approved" || computedStatus === "overdue") && t.is_reimbursement && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="rounded-lg p-1.5 text-muted-foreground cursor-default">
                        <CreditCard className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Pagamento apenas via Nota de Reembolso
                    </TooltipContent>
                  </Tooltip>
                )}
                {/* Delete: blocked if event completed */}
                {!eventCompleted && (computedStatus === "pending" || (isAdmin && (computedStatus === "approved" || computedStatus === "overdue"))) && (
                  <button onClick={() => onDelete(t.id)} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/15 transition-colors" title="Eliminar">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Hide/Show: admin only */}
                {isAdmin && onToggleHidden && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onToggleHidden(t.id, isHidden)}
                        className={`rounded-lg p-1.5 transition-colors ${isHidden ? "text-warning hover:bg-warning/15" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                        title={isHidden ? "Tornar visível" : "Ocultar transação"}
                      >
                        {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {isHidden ? "Tornar visível" : "Ocultar transação"}
                    </TooltipContent>
                  </Tooltip>
                )}
                {/* Reclassify: toggle local reinforcement vs Master rateio */}
                {isTourSubEvent && t.type === "expense" && t.category_id && (isLocalReinforcement || localReinforcementInfo) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={async () => {
                          try {
                            if (isLocalReinforcement) {
                              // Currently local → link to Master
                              const { data: masterFc } = await supabase
                                .from("event_forecasts")
                                .select("id")
                                .eq("event_id", parentTourEventId!)
                                .eq("type", "expense")
                                .eq("category_id", t.category_id!)
                                .limit(1);
                              if (!masterFc?.length) {
                                toast({ title: "Linha Master não encontrada para esta categoria", variant: "destructive" });
                                return;
                              }
                              await supabase.from("event_forecasts").insert({
                                event_id: t.event_id,
                                type: "expense",
                                description: t.description || "(sem descrição)",
                                category_id: t.category_id,
                                amount: Number(t.amount),
                                iva_rate: t.iva_rate ?? 23,
                                status: "approved",
                                transaction_id: t.id,
                                master_forecast_id: masterFc[0].id,
                              } as any);
                              toast({ title: "Reclassificado como Rateio Master" });
                            } else {
                              // Currently linked to Master → remove the forecast link
                              const { data: linkedFc } = await supabase
                                .from("event_forecasts")
                                .select("id")
                                .eq("transaction_id", t.id)
                                .not("master_forecast_id", "is", null);
                              if (linkedFc?.length) {
                                await supabase.from("event_forecasts").delete().in("id", linkedFc.map(f => f.id));
                              }
                              toast({ title: "Reclassificado como Reforço local" });
                            }
                            queryClient.invalidateQueries({ queryKey: ["local-reinforcement-check", t.id] });
                            queryClient.invalidateQueries({ queryKey: ["event_forecasts"] });
                            queryClient.invalidateQueries({ queryKey: ["adopted_forecasts"] });
                          } catch (err: any) {
                            toast({ title: "Erro ao reclassificar", description: err.message, variant: "destructive" });
                          }
                        }}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        title={isLocalReinforcement ? "Vincular ao Rateio Master" : "Marcar como Reforço local"}
                      >
                        <Layers className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {isLocalReinforcement ? "Vincular ao Rateio Master" : "Marcar como Reforço local"}
                    </TooltipContent>
                  </Tooltip>
                )}
                <DocsBadgeButton transactionId={t.id} onClick={() => onDocs(t.id)} />
                <button onClick={() => onAudit(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Histórico de alterações">
                  <History className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={showSelectColumn ? 10 : 9} className="px-4 pb-3 pt-0">
            <div className="ml-6 rounded-lg border border-border/40 bg-secondary/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Movimentos</p>
              {movements.length === 0 && paidAmount === 0 ? (
                <p className="text-xs text-muted-foreground">Sem movimentos registados para este lançamento.</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="whitespace-nowrap font-mono text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      {" "}
                      {new Date(t.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="inline-flex rounded-full px-2 py-0.5 font-medium bg-secondary text-muted-foreground">
                      Criação
                    </span>
                    <span className="text-muted-foreground">
                      Lançamento criado — {formatCurrency(totalWithIva)}
                    </span>
                  </div>
                  {/* Payment info: date + invoice */}
                  {paidAmount > 0 && !movements.some((m) => m.field_name === "Pagamento parcial" || m.field_name === "Recebimento parcial") && (
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="whitespace-nowrap font-mono text-muted-foreground">
                        {new Date(t.updated_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" "}
                        {new Date(t.updated_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="inline-flex rounded-full px-2 py-0.5 font-medium bg-success/15 text-success">
                        {isExpense ? "Pagamento" : "Recebimento"}
                      </span>
                      <span className="text-muted-foreground">
                        {isExpense ? "Pago" : "Recebido"}: {formatCurrency(paidAmount)} de {formatCurrency(totalWithIva)}
                      </span>
                      {accountName && (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          🏦 {accountName}
                        </span>
                      )}
                      {t.payment_date && (
                        <span className="text-muted-foreground/70">
                          Dt. pgto: {new Date(t.payment_date).toLocaleDateString("pt-PT")}
                        </span>
                      )}
                      {t.invoice_ref && (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          📄 {t.invoice_ref}
                        </span>
                      )}
                    </div>
                  )}
                  {movements.map((m) => {
                    const isPaymentEntry = m.field_name === "Pagamento parcial" || m.field_name === "Recebimento parcial";
                    const isAccountEntry = m.field_name === "Conta de pagamento" || m.field_name === "Conta de recebimento";
                    const isNoteEntry = m.field_name === "Nota de pagamento" || m.field_name === "Nota de recebimento";

                    // Parse new_value for payment entries: could be "1.000,00 € — Banco X" or just a number
                    let paymentDisplayAmount = "";
                    let paymentAccountName = "";
                    if (isPaymentEntry && m.new_value) {
                      const parts = m.new_value.split(" — ");
                      if (parts.length >= 2) {
                        // New format: "1.000,00 € — Banco Santander Totta"
                        paymentDisplayAmount = parts[0].trim();
                        paymentAccountName = parts.slice(1).join(" — ").trim();
                      } else {
                        // Old format: just a number (total paid)
                        const diff = Number(m.new_value ?? 0) - Number(m.old_value ?? 0);
                        paymentDisplayAmount = formatCurrency(diff);
                      }
                    }

                    return (
                    <div key={m.id} className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="whitespace-nowrap font-mono text-muted-foreground">
                        {new Date(m.changed_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" "}
                        {new Date(m.changed_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                        isPaymentEntry
                          ? "bg-success/15 text-success"
                          : isAccountEntry
                          ? "bg-primary/15 text-primary"
                          : m.field_name === "status"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {isPaymentEntry ? (isExpense ? "Pagamento" : "Recebimento") 
                          : isAccountEntry ? "Conta"
                          : m.field_name === "status" ? "Estado" 
                          : m.field_name}
                      </span>
                      <span className="text-muted-foreground">
                        {isPaymentEntry ? (
                          <>
                            {isExpense ? "Pago" : "Recebido"}: {paymentDisplayAmount} de {formatCurrency(totalWithIva)}
                          </>
                        ) : isAccountEntry ? (
                          <>{m.new_value}</>
                        ) : isNoteEntry ? (
                          <>{m.new_value}</>
                        ) : (
                          <>
                            {m.old_value ?? "—"} → {m.new_value ?? "—"}
                          </>
                        )}
                      </span>
                      {isPaymentEntry && paymentAccountName && (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          🏦 {paymentAccountName}
                        </span>
                      )}
                      {isPaymentEntry && t.payment_date && (
                        <span className="text-muted-foreground/70">
                          Dt. pgto: {new Date(t.payment_date).toLocaleDateString("pt-PT")}
                        </span>
                      )}
                      {isPaymentEntry && t.invoice_ref && (
                        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          📄 {t.invoice_ref}
                        </span>
                      )}
                      <span className="ml-auto text-muted-foreground/70">{resolveUserName(m.changed_by)}</span>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
      {/* Child split sub-rows for parent split transactions */}
      {isParentSplit && childrenExpanded && (
        <tr>
          <td colSpan={showSelectColumn ? 10 : 9} className="px-2 pb-3 pt-1">
            <div className="ml-6 space-y-0.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subeventos ({childTransactions.length})</span>
                <div className="flex-1 border-t border-border/30" />
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expanded ? "▾ Ocultar movimentos" : "▸ Ver movimentos"}
                </button>
              </div>
              {childTransactions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">A carregar subeventos…</p>
              ) : (
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border/20">
                      {childTransactions.map((child: any) => {
                        const childEvent = (child.events as any)?.name ?? "—";
                        const childAmount = Number(child.amount);
                        const childIva = (child.iva_rate ?? 23) as IvaRate;
                        const childTotal = calcWithIva(childAmount, childIva);
                        const childPaid = Number(child.paid_amount ?? 0);
                        const childSplitPct = child.split_percentage != null ? Number(child.split_percentage) : null;
                        const childSplitAmt = child.split_amount != null ? Number(child.split_amount) : null;
                        const childIsExpense = child.type === "expense";
                        return (
                          <tr key={child.id} className="hover:bg-secondary/10 text-xs">
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-0.5 rounded border border-muted-foreground/30 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Split {childSplitAmt != null ? `${childSplitAmt.toFixed(2)}€` : childSplitPct != null ? `${childSplitPct}%` : ""}
                                </span>
                                <span className="font-medium text-foreground">{childEvent}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                              {formatCurrency(childPaid)}
                            </td>
                            <td className={`py-2 px-3 text-right font-mono font-semibold whitespace-nowrap ${childIsExpense ? "text-warning" : "text-success"}`}>
                              {childIsExpense ? "-" : "+"}{formatCurrency(childTotal)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                <DocsBadgeButton transactionId={child.id} onClick={() => onDocs(child.id)} />
                                <button onClick={() => onAudit(child.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Histórico">
                                  <History className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
      {/* Audit movements (for parent splits, nested inside children expand) */}
      {expanded && isParentSplit && childrenExpanded && (
        <tr>
          <td colSpan={showSelectColumn ? 10 : 9} className="px-4 pb-3 pt-0">
            <div className="ml-6 rounded-lg border border-border/40 bg-secondary/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Movimentos</p>
              {movements.length === 0 && paidAmount === 0 ? (
                <p className="text-xs text-muted-foreground">Sem movimentos registados para este lançamento.</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="whitespace-nowrap font-mono text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      {" "}
                      {new Date(t.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="inline-flex rounded-full px-2 py-0.5 font-medium bg-secondary text-muted-foreground">
                      Criação
                    </span>
                    <span className="text-muted-foreground">
                      Lançamento criado — {formatCurrency(totalWithIva)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
