import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { Pencil, ShieldCheck, CreditCard, Paperclip, History, ChevronDown, ChevronRight, Trash2, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  transaction: any;
  isAdmin: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  showSelectColumn?: boolean;
  eventCompleted?: boolean;
  onEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onPayment: (id: string) => void;
  onDocs: (id: string) => void;
  onAudit: (id: string) => void;
  onDelete: (id: string) => void;
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

export function TransactionRow({ transaction: t, isAdmin, selectable, selected, onToggleSelect, showSelectColumn, eventCompleted, onEdit, onApprove, onPayment, onDocs, onAudit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);

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

  const eventName = (t.events as any)?.name ?? "—";
  const supplierName = (t.suppliers as any)?.name ?? "—";
  const accountName = (t.financial_accounts as any)?.name ?? null;
  const ivaRate = (t.iva_rate ?? 23) as IvaRate;
  const amount = Number(t.amount); // valor base (sem IVA)
  const totalWithIva = amount * (1 + ivaRate / 100);
  const ivaValue = totalWithIva - amount;
  const paidAmount = Number(t.paid_amount ?? 0);
  const balance = totalWithIva - paidAmount;
  const isExpense = t.type === "expense";
  const isChildSplit = !!t.parent_transaction_id;
  const isParentSplit = !t.parent_transaction_id && t.split_percentage === null && false; // parent detected by children query below
  const splitPct = t.split_percentage != null ? Number(t.split_percentage) : null;

  // Compute effective status
  const computedStatus = (() => {
    if (t.status === "paid" || paidAmount >= totalWithIva) return "paid";
    // Check overdue before approved — any approved transaction with past due_date is overdue
    if (t.due_date && new Date(t.due_date) < new Date() && t.status !== "paid" && t.status !== "pending") return "overdue";
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
      <tr className={`hover:bg-secondary/20 transition-colors ${computedStatus === "paid" ? "opacity-80" : ""} ${selected ? "bg-primary/5" : ""}`}>
        {showSelectColumn && (
          <td className="py-3 pr-2 text-center w-8">
            {selectable ? (
              <input
                type="checkbox"
                checked={!!selected}
                onChange={onToggleSelect}
                className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
              />
            ) : null}
          </td>
        )}
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Ver movimentos"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-medium">{t.description}</p>
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
                      <span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary cursor-help">
                        Rateio {splitPct != null ? `${splitPct}%` : ""}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Sub-transação de rateio multi-evento
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              {isExpense && t.specification && (
                <p className="text-xs text-muted-foreground">{t.specification}</p>
              )}
              <p className="text-xs text-muted-foreground sm:hidden">{eventName}</p>
            </div>
          </div>
        </td>
        <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">{eventName}</td>
        <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{supplierName}</td>
        <td className="hidden py-3 pr-4 text-center lg:table-cell">
          <span className="inline-flex h-6 w-10 items-center justify-center rounded bg-primary/15 text-xs font-bold text-primary">{ivaRate}%</span>
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
            {t.due_date ? (
              <>
                <span>{new Date(t.due_date).toLocaleDateString("pt-PT")}</span>
                {computedStatus !== "paid" && new Date(t.due_date) < new Date() && (
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
            {/* Edit: blocked if event completed or paid */}
            {!eventCompleted && computedStatus !== "paid" && (
              <button onClick={() => onEdit(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Approve: admin only, pending/overdue only, not completed */}
            {!eventCompleted && isAdmin && (computedStatus === "pending" || computedStatus === "overdue") && (
              <button onClick={() => onApprove(t.id)} className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-500/15 transition-colors" title="Aprovar">
                <ShieldCheck className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Payment/Receipt: only after approved, not completed */}
            {!eventCompleted && balance > 0 && (computedStatus === "approved" || computedStatus === "overdue") && (
              <button onClick={() => onPayment(t.id)} className="rounded-lg p-1.5 text-success hover:bg-success/15 transition-colors" title={isExpense ? "Registar pagamento" : "Registar recebimento"}>
                <CreditCard className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Delete: blocked if event completed */}
            {!eventCompleted && (computedStatus === "pending" || (isAdmin && (computedStatus === "approved" || computedStatus === "overdue"))) && (
              <button onClick={() => onDelete(t.id)} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/15 transition-colors" title="Eliminar">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <DocsBadgeButton transactionId={t.id} onClick={() => onDocs(t.id)} />
            <button onClick={() => onAudit(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Histórico de alterações">
              <History className="h-3.5 w-3.5" />
            </button>
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
    </>
  );
}
