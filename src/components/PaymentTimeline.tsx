import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { calcWithIva, formatDatePT, isFullyPaid } from "@/lib/utils";
import {
  Receipt,
  ListChecks,
  Wallet,
  HandCoins,
  Users,
  Loader2,
  Pencil,
  Check,
  X as XIcon,
} from "lucide-react";
import { TransactionPaymentsListModal } from "@/components/TransactionPaymentsListModal";
import { MarkInstallmentPaidModal } from "@/components/MarkInstallmentPaidModal";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Clock, Ban } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  transaction: any;
  isAdmin?: boolean;
}

/**
 * Timeline unificado de pagamento de uma transação.
 * Agrega em vista única:
 *  - Parcelas individuais (transaction_payments)
 *  - Lista de pagamento (payment_list_items + payment_lists)
 *  - Nota de reembolso (reimbursement_note_items + reimbursement_notes)
 *  - Crédito de fornecedor utilizado (supplier_credit_usages)
 *  - Pago por sócio (partner_paid_expenses)
 *
 * Se `isAdmin` for true, expõe edição direta do valor pago:
 *  - Quando existem parcelas em `transaction_payments`, abre o modal de parcelas.
 *  - Caso contrário, permite ajustar `paid_amount` (e data/conta) inline.
 */
export function PaymentTimeline({ transaction, isAdmin = false }: Props) {
  const txId = transaction.id;
  const baseAmount = Number(transaction.amount ?? 0);
  const ivaRate = Number(transaction.iva_rate ?? 0);
  const totalWithIva = calcWithIva(baseAmount, ivaRate);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);
  const [editingDirect, setEditingDirect] = useState(false);
  const [directForm, setDirectForm] = useState<{ paid_amount: string; payment_date: Date | null; account_id: string }>({
    paid_amount: "",
    payment_date: null,
    account_id: "",
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [markInstallment, setMarkInstallment] = useState<any | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseRelease, setReverseRelease] = useState(false);
  const [reverseReason, setReverseReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["payment-timeline", txId],
    queryFn: async () => {
      const [
        paymentsRes,
        plItemsRes,
        rnItemsRes,
        creditUsagesRes,
        partnerPaidRes,
      ] = await Promise.all([
        supabase
          .from("transaction_payments" as any)
          .select("id, amount, payment_date, scheduled_date, status, payment_method, account_id, invoice_ref, financial_accounts:account_id(name)")
          .eq("transaction_id", txId)
          .order("scheduled_date", { ascending: true, nullsFirst: false })
          .order("payment_date", { ascending: true }),
        supabase
          .from("payment_list_items")
          .select("id, payment_list_id, manually_marked_paid, payment_lists:payment_list_id(id, title, status, payment_date)")
          .eq("transaction_id", txId),
        supabase
          .from("reimbursement_note_items")
          .select("id, reimbursement_note_id, reimbursement_notes:reimbursement_note_id(id, code, status, employee_name, paid_at, total_amount)")
          .eq("transaction_id", txId),
        supabase
          .from("supplier_credit_usages")
          .select("id, amount, used_by, created_at, credit_id, supplier_credits:credit_id(reason, document_ref)")
          .eq("transaction_id", txId),
        supabase
          .from("partner_paid_expenses")
          .select("id, partner_id, notes, created_at, event_partners:partner_id(supplier_id, suppliers:supplier_id(name))")
          .eq("transaction_id", txId),
      ]);

      return {
        payments: (paymentsRes.data ?? []) as any[],
        paymentListItems: (plItemsRes.data ?? []) as any[],
        reimbursementItems: (rnItemsRes.data ?? []) as any[],
        creditUsages: (creditUsagesRes.data ?? []) as any[],
        partnerPaid: (partnerPaidRes.data ?? []) as any[],
      };
    },
  });

  // Contas financeiras para o seletor (apenas se admin vai editar inline)
  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["payment-timeline-accounts"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const accountOptions = (financialAccounts as any[]).map((a) => ({ value: a.id, label: a.name }));

  // Mutação: edição direta do paid_amount da transação (caso sem parcelas registadas)
  const directPaidMutation = useMutation({
    mutationFn: async () => {
      const newPaid = parseFloat(directForm.paid_amount);
      if (isNaN(newPaid) || newPaid < 0) throw new Error("Valor pago inválido");
      if (newPaid > totalWithIva + 0.05) {
        throw new Error("O valor pago não pode exceder o total da transação");
      }
      const newDate = directForm.payment_date ? format(directForm.payment_date, "yyyy-MM-dd") : null;
      const newStatus = newPaid <= 0
        ? "approved"
        : isFullyPaid(newPaid, baseAmount, ivaRate)
          ? "paid"
          : "approved";
      // Se ficar 'paid' garante que o valor armazenado é pelo menos o totalWithIva
      const finalPaid = newStatus === "paid" ? Math.max(newPaid, totalWithIva) : newPaid;

      const { error } = await supabase
        .from("transactions")
        .update({
          paid_amount: finalPaid,
          status: newStatus,
          payment_date: newPaid > 0 ? newDate : null,
          account_id: directForm.account_id || null,
        } as any)
        .eq("id", txId);
      if (error) throw error;

      // Audit log granular
      const callerName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
      const auditEntries: any[] = [];
      const oldPaid = Number(transaction.paid_amount ?? 0);
      if (oldPaid !== finalPaid) {
        auditEntries.push({
          transaction_id: txId,
          changed_by: callerName,
          field_name: "Valor pago (ajuste admin)",
          old_value: formatCurrency(oldPaid),
          new_value: formatCurrency(finalPaid),
        });
      }
      if ((transaction.payment_date ?? null) !== newDate) {
        auditEntries.push({
          transaction_id: txId,
          changed_by: callerName,
          field_name: "Data pgto (ajuste admin)",
          old_value: transaction.payment_date ?? "—",
          new_value: newDate ?? "—",
        });
      }
      if ((transaction.account_id ?? "") !== (directForm.account_id || "")) {
        const oldName = (financialAccounts as any[]).find((a) => a.id === transaction.account_id)?.name ?? "—";
        const newName = (financialAccounts as any[]).find((a) => a.id === directForm.account_id)?.name ?? "—";
        auditEntries.push({
          transaction_id: txId,
          changed_by: callerName,
          field_name: "Conta (ajuste admin)",
          old_value: oldName,
          new_value: newName,
        });
      }
      if (transaction.status !== newStatus) {
        auditEntries.push({
          transaction_id: txId,
          changed_by: callerName,
          field_name: "Estado (ajuste admin)",
          old_value: transaction.status,
          new_value: newStatus,
        });
      }
      if (auditEntries.length > 0) {
        await supabase.from("transaction_audit_log").insert(auditEntries);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["payment-timeline", txId] });
      setEditingDirect(false);
      toast({ title: "Valor pago atualizado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const cancelInstallmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transaction_payments" as any)
        .update({ status: "cancelled" } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-timeline", txId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Parcela cancelada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Admin: desfazer liquidação (caso TX paga via lista de pagamento ou direto sem parcelas)
  const undoSettlementMutation = useMutation({
    mutationFn: async () => {
      // 1) Remover ligação a payment_list_items (se houver)
      const { error: delErr } = await supabase
        .from("payment_list_items")
        .delete()
        .eq("transaction_id", txId);
      if (delErr) throw delErr;

      // 2) Reverter TX para 'approved' sem valor pago
      const { error: updErr } = await supabase
        .from("transactions")
        .update({
          paid_amount: 0,
          payment_date: null,
          status: "approved",
        } as any)
        .eq("id", txId);
      if (updErr) throw updErr;

      // 3) Audit log
      const callerName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
      await supabase.from("transaction_audit_log").insert([{
        transaction_id: txId,
        changed_by: callerName,
        field_name: "Desfazer liquidação (admin)",
        old_value: `${formatCurrency(Number(transaction.paid_amount ?? 0))} · ${transaction.payment_date ?? "—"}`,
        new_value: "0,00 € · aguardando pagamento",
      }]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["payment-timeline", txId] });
      queryClient.invalidateQueries({ queryKey: ["payment-lists"] });
      toast({ title: "Liquidação revertida", description: "Transação voltou a 'Aprovada / aguarda pagamento'." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });



  function startDirectEdit() {
    const [y, m, d] = (transaction.payment_date ?? "").split("-").map(Number);
    setDirectForm({
      paid_amount: String(transaction.paid_amount ?? totalWithIva),
      payment_date: y && m && d ? new Date(y, m - 1, d, 12, 0, 0) : new Date(),
      account_id: transaction.account_id ?? "",
    });
    setEditingDirect(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-secondary/30 p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allPayments = data?.payments ?? [];
  const paidPayments = allPayments.filter((p: any) => p.status === "paid" || !p.status);
  const plannedPayments = allPayments.filter((p: any) => p.status === "planned");
  const cancelledPayments = allPayments.filter((p: any) => p.status === "cancelled");
  const hasSchedule = plannedPayments.length > 0 || cancelledPayments.length > 0 ||
    allPayments.some((p: any) => p.scheduled_date);
  const payments = paidPayments;
  const paymentListItems = data?.paymentListItems ?? [];
  const reimbursementItems = data?.reimbursementItems ?? [];
  const creditUsages = data?.creditUsages ?? [];
  const partnerPaid = data?.partnerPaid ?? [];

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalCredit = creditUsages.reduce((s, c) => s + Number(c.amount), 0);
  const openBalance = Math.max(0, totalWithIva - totalPaid - totalCredit);
  const totalPlanned = plannedPayments.reduce((s, p) => s + Number(p.amount), 0);

  const hasAny =
    allPayments.length > 0 ||
    paymentListItems.length > 0 ||
    reimbursementItems.length > 0 ||
    creditUsages.length > 0 ||
    partnerPaid.length > 0;

  // Pagamento direto (sem parcelas em transaction_payments) — admin pode ajustar.
  const isDirectPaid = !hasAny && (transaction.status === "paid" || Number(transaction.paid_amount ?? 0) > 0);

  if (!hasAny && !isDirectPaid && !isAdmin) {
    return (
      <div className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
        Esta transação ainda não tem pagamentos, listas, reembolsos, créditos ou registos de pagamento por sócio.
      </div>
    );
  }

  const methodLabels: Record<string, string> = {
    transfer: "Transferência",
    service_payment: "Pag. Serviços",
    state_payment: "Pag. Estado",
  };

  return (
    <div className="space-y-3">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
        <div>
          <div className="text-muted-foreground">Total c/ IVA</div>
          <div className="font-mono font-semibold">{formatCurrency(totalWithIva)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Pago + Crédito</div>
          <div className="font-mono font-semibold text-success">
            {formatCurrency(totalPaid + totalCredit)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Saldo aberto</div>
          <div className={`font-mono font-semibold ${openBalance > 0.01 ? "text-warning" : "text-muted-foreground"}`}>
            {formatCurrency(openBalance)}
          </div>
        </div>
      </div>

      {/* Admin: Desfazer liquidação */}
      {isAdmin && (transaction.status === "paid" || Number(transaction.paid_amount ?? 0) > 0) && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
          <div className="text-muted-foreground">
            <span className="font-semibold text-destructive">Admin:</span> reverter esta liquidação devolve a transação a "aprovada / aguarda pagamento" e remove a ligação a listas de pagamento.
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm("Desfazer a liquidação desta transação?\n\nIsto vai:\n• Zerar o valor pago e a data de pagamento\n• Remover o item das listas de pagamento\n• Voltar o estado a 'Aprovada'\n\nContinuar?")) {
                undoSettlementMutation.mutate();
              }
            }}
            disabled={undoSettlementMutation.isPending}
            className="shrink-0 rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {undoSettlementMutation.isPending ? "A reverter…" : "Desfazer liquidação"}
          </button>
        </div>
      )}

      {/* Cronograma de parcelas (planned + cancelled) */}
      {hasSchedule && (
        <Section
          icon={<Clock className="h-3.5 w-3.5" />}
          title={`Cronograma de parcelas (${plannedPayments.length} agendada${plannedPayments.length === 1 ? "" : "s"}${cancelledPayments.length > 0 ? ` · ${cancelledPayments.length} cancelada${cancelledPayments.length === 1 ? "" : "s"}` : ""})`}
        >
          <ul className="divide-y divide-border/40">
            {[...plannedPayments, ...cancelledPayments].map((p: any, i: number) => {
              const isPlanned = p.status === "planned";
              const isCancelled = p.status === "cancelled";
              return (
                <li key={p.id} className="flex items-center justify-between py-1.5 text-xs gap-2">
                  <div className={`flex items-center gap-2 min-w-0 ${isCancelled ? "line-through opacity-60" : ""}`}>
                    <span className="font-medium text-muted-foreground">#{i + 1}</span>
                    <span>{p.scheduled_date ? formatDatePT(p.scheduled_date) : "—"}</span>
                    {isPlanned && (
                      <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">⏳ Planeada</span>
                    )}
                    {isCancelled && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">❌ Cancelada</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-semibold">{formatCurrency(Number(p.amount))}</span>
                    {isAdmin && isPlanned && (
                      <>
                        <button
                          type="button"
                          onClick={() => setMarkInstallment(p)}
                          className="rounded px-1.5 py-0.5 text-[10px] text-success hover:bg-success/10"
                          title="Marcar como paga"
                        >
                          ✅ Pagar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Cancelar esta parcela?")) cancelInstallmentMutation.mutate(p.id);
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/10"
                          title="Cancelar parcela"
                        >
                          <Ban className="h-3 w-3 inline" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {plannedPayments.length > 0 && (
            <div className="mt-1 border-t border-border/40 pt-1 text-[10px] text-muted-foreground text-right">
              Soma planeada: <span className="font-mono font-semibold">{formatCurrency(totalPlanned)}</span>
            </div>
          )}
        </Section>
      )}

      {/* Parcelas */}
      {payments.length > 0 && (
        <Section
          icon={<Receipt className="h-3.5 w-3.5" />}
          title={`Parcelas pagas (${payments.length})`}
          action={isAdmin ? (
            <button
              type="button"
              onClick={() => setShowPaymentsModal(true)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10"
              title="Editar parcelas"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          ) : undefined}
        >
          <ul className="divide-y divide-border/40">
            {payments.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">#{i + 1}</span>
                  <span>{formatDatePT(p.payment_date)}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {methodLabels[p.payment_method] ?? p.payment_method}
                  </span>
                  {p.financial_accounts?.name && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground truncate max-w-[120px]">
                        {p.financial_accounts.name}
                      </span>
                    </>
                  )}
                </div>
                <span className="font-mono font-semibold">{formatCurrency(Number(p.amount))}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Listas de pagamento */}
      {paymentListItems.length > 0 && (
        <Section icon={<ListChecks className="h-3.5 w-3.5" />} title={`Em lista de pagamento (${paymentListItems.length})`}>
          <ul className="divide-y divide-border/40">
            {paymentListItems.map((it) => {
              const list = it.payment_lists;
              return (
                <li key={it.id} className="flex items-center justify-between py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{list?.title ?? "—"}</span>
                    <StatusPill status={list?.status} />
                    {it.manually_marked_paid && (
                      <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] text-success">
                        Marcado pago
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {list?.payment_date ? formatDatePT(list.payment_date) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Notas de reembolso */}
      {reimbursementItems.length > 0 && (
        <Section icon={<Wallet className="h-3.5 w-3.5" />} title={`Em nota de reembolso (${reimbursementItems.length})`}>
          <ul className="divide-y divide-border/40">
            {reimbursementItems.map((it) => {
              const note = it.reimbursement_notes;
              return (
                <li key={it.id} className="flex items-center justify-between py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono">{note?.code ?? "—"}</span>
                    <span className="text-muted-foreground truncate">{note?.employee_name ?? ""}</span>
                    <StatusPill status={note?.status} />
                  </div>
                  <span className="text-muted-foreground">
                    {note?.paid_at ? formatDatePT(note.paid_at.split("T")[0]) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Créditos de fornecedor */}
      {creditUsages.length > 0 && (
        <Section icon={<HandCoins className="h-3.5 w-3.5" />} title={`Crédito de fornecedor aplicado (${creditUsages.length})`}>
          <ul className="divide-y divide-border/40">
            {creditUsages.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">
                    {u.supplier_credits?.reason ?? "Crédito"}
                  </span>
                  {u.supplier_credits?.document_ref && (
                    <span className="text-muted-foreground">· {u.supplier_credits.document_ref}</span>
                  )}
                </div>
                <span className="font-mono font-semibold text-primary">
                  −{formatCurrency(Number(u.amount))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Pago por sócio */}
      {partnerPaid.length > 0 && (
        <Section icon={<Users className="h-3.5 w-3.5" />} title="Pago por sócio">
          <ul className="divide-y divide-border/40">
            {partnerPaid.map((pp) => (
              <li key={pp.id} className="flex items-center justify-between py-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">🤝 Sócio</span>
                  <span className="truncate">
                    {pp.event_partners?.suppliers?.name ?? "Sócio"}
                  </span>
                  {pp.notes && <span className="text-muted-foreground truncate">· {pp.notes}</span>}
                </div>
                <span className="text-muted-foreground">
                  {pp.created_at ? formatDatePT(pp.created_at.split("T")[0]) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Pagamento direto (sem parcelas em transaction_payments) — admin pode ajustar valor pago */}
      {isDirectPaid && (
        <Section
          icon={<Receipt className="h-3.5 w-3.5" />}
          title="Pagamento direto"
          action={isAdmin && !editingDirect ? (
            <button
              type="button"
              onClick={startDirectEdit}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10"
              title="Editar valor pago"
            >
              <Pencil className="h-3 w-3" /> Editar valor pago
            </button>
          ) : undefined}
        >
          {editingDirect ? (
            <div className="space-y-2 py-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Valor pago (€)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={directForm.paid_amount}
                    onChange={(e) => setDirectForm({ ...directForm, paid_amount: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Data</label>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button type="button" className="w-full flex items-center justify-between rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                        {directForm.payment_date ? format(directForm.payment_date, "dd/MM/yyyy") : "—"}
                        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[100]" align="start">
                      <Calendar
                        mode="single"
                        selected={directForm.payment_date ?? undefined}
                        onSelect={(d) => {
                          if (d) setDirectForm({ ...directForm, payment_date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0) });
                          setDatePickerOpen(false);
                        }}
                        initialFocus className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Conta</label>
                <SearchableSelect
                  options={accountOptions}
                  value={directForm.account_id}
                  onValueChange={(v) => setDirectForm({ ...directForm, account_id: v })}
                  placeholder="Selecionar…"
                  searchPlaceholder="Pesquisar…"
                />
              </div>
              <div className="flex justify-end gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingDirect(false)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                >
                  <XIcon className="h-3 w-3" /> Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => directPaidMutation.mutate()}
                  disabled={directPaidMutation.isPending}
                  className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" /> Guardar
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Ajuste administrativo do valor liquidado. Será registado no histórico de auditoria.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span>{transaction.payment_date ? formatDatePT(transaction.payment_date) : "—"}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  Conta: {(financialAccounts as any[]).find((a) => a.id === transaction.account_id)?.name ?? "—"}
                </span>
              </div>
              <span className="font-mono font-semibold">{formatCurrency(Number(transaction.paid_amount ?? 0))}</span>
            </div>
          )}
        </Section>
      )}

      {showPaymentsModal && (
        <TransactionPaymentsListModal
          transaction={transaction}
          isAdmin={isAdmin}
          onClose={() => setShowPaymentsModal(false)}
        />
      )}

      <MarkInstallmentPaidModal
        open={!!markInstallment}
        onOpenChange={(v) => { if (!v) setMarkInstallment(null); }}
        installment={markInstallment}
        transactionId={txId}
      />
    </div>
  );
}

function Section({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background/50">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {icon}
          {title}
        </div>
        {action}
      </div>
      <div className="px-3 py-1">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
    pending: { label: "Pendente", cls: "bg-warning/15 text-warning" },
    approved: { label: "Aprovada", cls: "bg-blue-500/15 text-blue-500" },
    paid: { label: "Paga", cls: "bg-success/15 text-success" },
    cancelled: { label: "Cancelada", cls: "bg-destructive/15 text-destructive" },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${cfg.cls}`}>{cfg.label}</span>;
}
