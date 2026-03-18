import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import type { IvaRate } from "@/lib/mock-data";
import { Pencil, ShieldCheck, CreditCard, Paperclip, History, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

interface Props {
  transaction: any;
  isAdmin: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  showSelectColumn?: boolean;
  onEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onPayment: (id: string) => void;
  onDocs: (id: string) => void;
  onAudit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TransactionRow({ transaction: t, isAdmin, selectable, selected, onToggleSelect, showSelectColumn, onEdit, onApprove, onPayment, onDocs, onAudit, onDelete }: Props) {
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

  const eventName = (t.events as any)?.name ?? "—";
  const supplierName = (t.suppliers as any)?.name ?? "—";
  const ivaRate = (t.iva_rate ?? 23) as IvaRate;
  const amount = Number(t.amount);
  const paidAmount = Number(t.paid_amount ?? 0);
  const balance = amount - paidAmount;
  const isExpense = t.type === "expense";

  // Compute effective status for expenses
  const computedStatus = (() => {
    if (t.status === "paid" || paidAmount >= amount) return "paid";
    if (t.status === "approved") return "approved"; // A Pagar
    if (isExpense && t.due_date && new Date(t.due_date) < new Date() && t.status !== "paid") return "overdue";
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
              <p className="font-medium">{t.description}</p>
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
          {isExpense && balance > 0 && computedStatus !== "paid" && (
            <p className="mt-0.5 text-[10px] text-warning">Aberto: {formatCurrency(balance)}</p>
          )}
        </td>
        <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{t.due_date ? new Date(t.due_date).toLocaleDateString("pt-PT") : "—"}</td>
        <td className="py-3 text-right font-mono text-muted-foreground whitespace-nowrap">
          {formatCurrency(paidAmount)}
        </td>
        <td className={`py-3 text-right font-mono font-semibold whitespace-nowrap ${isExpense ? "text-warning" : "text-success"}`}>
          {isExpense ? "-" : "+"}{formatCurrency(amount)}
        </td>
        <td className="py-3">
          <div className="flex items-center justify-center gap-1">
            {/* Edit: always available except when paid; for approved, anyone can edit non-value fields */}
            {computedStatus !== "paid" && (
              <button onClick={() => onEdit(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Approve: admin only, pending only */}
            {isAdmin && computedStatus === "pending" && (
              <button onClick={() => onApprove(t.id)} className="rounded-lg p-1.5 text-blue-400 hover:bg-blue-500/15 transition-colors" title="Aprovar">
                <ShieldCheck className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Payment: only after approved, never on pending */}
            {isExpense && balance > 0 && (computedStatus === "approved" || computedStatus === "overdue") && (
              <button onClick={() => onPayment(t.id)} className="rounded-lg p-1.5 text-success hover:bg-success/15 transition-colors" title="Registar pagamento">
                <CreditCard className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Delete: pending=anyone; approved=admin only; paid=no one */}
            {(computedStatus === "pending" || (isAdmin && (computedStatus === "approved" || computedStatus === "overdue"))) && (
              <button onClick={() => onDelete(t.id)} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/15 transition-colors" title="Eliminar">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => onDocs(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Documentos">
              <Paperclip className="h-3.5 w-3.5" />
            </button>
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
                      Lançamento criado — {formatCurrency(amount)}
                    </span>
                  </div>
                  {movements.length === 0 && paidAmount > 0 && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="whitespace-nowrap font-mono text-muted-foreground">
                        {new Date(t.updated_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" "}
                        {new Date(t.updated_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="inline-flex rounded-full px-2 py-0.5 font-medium bg-success/15 text-success">
                        Pagamento
                      </span>
                      <span className="text-muted-foreground">
                        Pago: {formatCurrency(paidAmount)} de {formatCurrency(amount)}
                      </span>
                    </div>
                  )}
                  {movements.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 text-xs">
                      <span className="whitespace-nowrap font-mono text-muted-foreground">
                        {new Date(m.changed_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" "}
                        {new Date(m.changed_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                        m.field_name === "Pagamento parcial"
                          ? "bg-success/15 text-success"
                          : m.field_name === "status"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {m.field_name === "Pagamento parcial" ? "Pagamento" : m.field_name === "status" ? "Estado" : m.field_name}
                      </span>
                      <span className="text-muted-foreground">
                        {m.field_name === "Pagamento parcial" ? (
                          <>
                            {formatCurrency(Number(m.old_value ?? 0))} → {formatCurrency(Number(m.new_value ?? 0))}
                          </>
                        ) : (
                          <>
                            {m.old_value ?? "—"} → {m.new_value ?? "—"}
                          </>
                        )}
                      </span>
                      <span className="ml-auto text-muted-foreground/70">{m.changed_by}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
