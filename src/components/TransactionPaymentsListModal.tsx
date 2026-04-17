import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { calcWithIva, isFullyPaid, formatDatePT } from "@/lib/utils";
import { X, Pencil, Trash2, Check, XCircle, CalendarIcon, Building, FileText, Landmark } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type PaymentMethod = "transfer" | "service_payment" | "state_payment";

interface Props {
  transaction: any;
  isAdmin: boolean;
  onClose: () => void;
}

const methodLabels: Record<string, string> = {
  transfer: "Transferência",
  service_payment: "Pag. Serviços",
  state_payment: "Pag. Estado",
};

export function TransactionPaymentsListModal({ transaction, isAdmin, onClose }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editDateOpen, setEditDateOpen] = useState(false);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["transaction_payments", transaction.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("transaction_payments")
        .select("*, financial_accounts:account_id(name)")
        .eq("transaction_id", transaction.id)
        .order("payment_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const accountOptions = financialAccounts.map((a: any) => ({ value: a.id, label: a.name }));

  const baseAmount = Number(transaction.amount);
  const ivaRate = Number(transaction.iva_rate ?? 0);
  const totalWithIva = calcWithIva(baseAmount, ivaRate);
  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const isExpense = transaction.type === "expense";

  function startEdit(payment: any) {
    const [y, m, d] = payment.payment_date.split("-").map(Number);
    setEditForm({
      amount: String(payment.amount),
      payment_date: new Date(y, m - 1, d, 12, 0, 0),
      account_id: payment.account_id ?? "",
      payment_method: payment.payment_method ?? "transfer",
      payment_entity: payment.payment_entity ?? "",
      payment_reference: payment.payment_reference ?? "",
      invoice_ref: payment.invoice_ref ?? "",
      notes: payment.notes ?? "",
    });
    setEditingId(payment.id);
  }

  const updateMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const newAmount = parseFloat(editForm.amount);
      if (!newAmount || newAmount <= 0) throw new Error("Valor inválido");

      // Calculate what the total would be with this change
      const otherPaymentsTotal = payments
        .filter((p: any) => p.id !== paymentId)
        .reduce((s: number, p: any) => s + Number(p.amount), 0);
      if (otherPaymentsTotal + newAmount > totalWithIva + 0.05) {
        throw new Error("O valor total dos pagamentos excede o montante da transação");
      }

      const updateData: any = {
        amount: newAmount,
        payment_date: format(editForm.payment_date, "yyyy-MM-dd"),
        account_id: editForm.account_id || null,
        payment_method: editForm.payment_method,
        payment_entity: editForm.payment_method === "service_payment" ? editForm.payment_entity.trim() : null,
        payment_reference: editForm.payment_method !== "transfer" ? editForm.payment_reference.trim() : null,
        invoice_ref: editForm.invoice_ref.trim() || null,
        notes: editForm.notes.trim() || null,
      };

      const { error } = await (supabase as any)
        .from("transaction_payments")
        .update(updateData)
        .eq("id", paymentId);
      if (error) throw error;

      // Recalculate transaction paid_amount
      const newTotalPaid = Math.round((otherPaymentsTotal + newAmount) * 100) / 100;
      const newStatus = isFullyPaid(newTotalPaid, baseAmount, ivaRate) ? "paid" : "approved";
      const finalPaid = newStatus === "paid" ? Math.max(newTotalPaid, totalWithIva) : newTotalPaid;

      // Update the latest payment info on the transaction
      const { error: txError } = await supabase
        .from("transactions")
        .update({
          paid_amount: finalPaid,
          status: newStatus,
          payment_date: format(editForm.payment_date, "yyyy-MM-dd"),
          account_id: editForm.account_id || null,
          payment_method: editForm.payment_method,
          payment_entity: editForm.payment_method === "service_payment" ? editForm.payment_entity.trim() : null,
          payment_reference: editForm.payment_method !== "transfer" ? editForm.payment_reference.trim() : null,
        } as any)
        .eq("id", transaction.id);
      if (txError) throw txError;

      // Granular audit log — one entry per changed field
      const callerName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
      const originalPayment = payments.find((p: any) => p.id === paymentId);
      const parcela = `Parcela #${payments.findIndex((p: any) => p.id === paymentId) + 1}`;
      const auditEntries: any[] = [];

      if (originalPayment) {
        if (Number(originalPayment.amount) !== newAmount) {
          auditEntries.push({ transaction_id: transaction.id, changed_by: callerName, field_name: `${parcela} — Valor`, old_value: formatCurrency(Number(originalPayment.amount)), new_value: formatCurrency(newAmount) });
        }
        const oldDate = originalPayment.payment_date;
        const newDate = format(editForm.payment_date, "yyyy-MM-dd");
        if (oldDate !== newDate) {
          auditEntries.push({ transaction_id: transaction.id, changed_by: callerName, field_name: `${parcela} — Data pgto`, old_value: oldDate, new_value: newDate });
        }
        const oldAccId = originalPayment.account_id ?? "";
        const newAccId = editForm.account_id || "";
        if (oldAccId !== newAccId) {
          const oldAccName = financialAccounts.find((a: any) => a.id === oldAccId)?.name ?? "—";
          const newAccName = financialAccounts.find((a: any) => a.id === newAccId)?.name ?? "—";
          auditEntries.push({ transaction_id: transaction.id, changed_by: callerName, field_name: `${parcela} — Conta`, old_value: oldAccName, new_value: newAccName });
        }
        if ((originalPayment.payment_method ?? "transfer") !== editForm.payment_method) {
          auditEntries.push({ transaction_id: transaction.id, changed_by: callerName, field_name: `${parcela} — Método`, old_value: methodLabels[originalPayment.payment_method] ?? originalPayment.payment_method, new_value: methodLabels[editForm.payment_method] ?? editForm.payment_method });
        }
        if ((originalPayment.payment_entity ?? "") !== (editForm.payment_entity?.trim() ?? "")) {
          auditEntries.push({ transaction_id: transaction.id, changed_by: callerName, field_name: `${parcela} — Entidade`, old_value: originalPayment.payment_entity ?? "—", new_value: editForm.payment_entity?.trim() || "—" });
        }
        if ((originalPayment.payment_reference ?? "") !== (editForm.payment_reference?.trim() ?? "")) {
          auditEntries.push({ transaction_id: transaction.id, changed_by: callerName, field_name: `${parcela} — Referência`, old_value: originalPayment.payment_reference ?? "—", new_value: editForm.payment_reference?.trim() || "—" });
        }
        if ((originalPayment.invoice_ref ?? "") !== (editForm.invoice_ref?.trim() ?? "")) {
          auditEntries.push({ transaction_id: transaction.id, changed_by: callerName, field_name: `${parcela} — Nº Fatura`, old_value: originalPayment.invoice_ref ?? "—", new_value: editForm.invoice_ref?.trim() || "—" });
        }
        if ((originalPayment.notes ?? "") !== (editForm.notes?.trim() ?? "")) {
          auditEntries.push({ transaction_id: transaction.id, changed_by: callerName, field_name: `${parcela} — Nota`, old_value: originalPayment.notes ?? "—", new_value: editForm.notes?.trim() || "—" });
        }
      }

      if (auditEntries.length === 0) {
        auditEntries.push({ transaction_id: transaction.id, changed_by: callerName, field_name: "Edição de pagamento", old_value: parcela, new_value: `${formatCurrency(newAmount)} — ${format(editForm.payment_date, "dd/MM/yyyy")}` });
      }

      await supabase.from("transaction_audit_log").insert(auditEntries);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction_payments", transaction.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setEditingId(null);
      toast({ title: "Pagamento atualizado com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const payment = payments.find((p: any) => p.id === paymentId);
      if (!payment) throw new Error("Pagamento não encontrado");

      const { error } = await (supabase as any)
        .from("transaction_payments")
        .delete()
        .eq("id", paymentId);
      if (error) throw error;

      // Recalculate transaction paid_amount
      const remainingTotal = payments
        .filter((p: any) => p.id !== paymentId)
        .reduce((s: number, p: any) => s + Number(p.amount), 0);
      const newTotalPaid = Math.round(remainingTotal * 100) / 100;
      const newStatus = newTotalPaid <= 0 ? "approved" : isFullyPaid(newTotalPaid, baseAmount, ivaRate) ? "paid" : "approved";

      // Find the last remaining payment for date/account
      const remainingPayments = payments.filter((p: any) => p.id !== paymentId);
      const lastPayment = remainingPayments.length > 0 ? remainingPayments[remainingPayments.length - 1] : null;

      const { error: txError } = await supabase
        .from("transactions")
        .update({
          paid_amount: newTotalPaid,
          status: newStatus,
          payment_date: lastPayment?.payment_date ?? null,
          account_id: lastPayment?.account_id ?? null,
        } as any)
        .eq("id", transaction.id);
      if (txError) throw txError;

      // Audit log
      const callerName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
      await supabase.from("transaction_audit_log").insert({
        transaction_id: transaction.id,
        changed_by: callerName,
        field_name: "Reversão de pagamento",
        old_value: `${formatCurrency(Number(payment.amount))}`,
        new_value: `Pagamento removido. Novo total pago: ${formatCurrency(newTotalPaid)}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction_payments", transaction.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Pagamento revertido com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Histórico de Pagamentos</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">{transaction.description}</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Valor total:</span>
            <span className="font-semibold">{formatCurrency(totalWithIva)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total pago:</span>
            <span className="font-semibold text-success">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="flex justify-between border-t border-border/50 pt-1">
            <span className="text-muted-foreground">Saldo em aberto:</span>
            <span className="font-bold text-warning">{formatCurrency(Math.max(0, totalWithIva - totalPaid))}</span>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem pagamentos registados.</p>
        ) : (
          <div className="space-y-3">
            {payments.map((p: any, idx: number) => (
              <div key={p.id} className="rounded-lg bg-secondary/30 p-3 space-y-2">
                {editingId === p.id ? (
                  /* Edit mode */
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">Parcela #{idx + 1} — Editar</span>
                      <div className="flex gap-1">
                        <button onClick={() => updateMutation.mutate(p.id)} disabled={updateMutation.isPending}
                          className="rounded p-1 text-success hover:bg-success/15"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setEditingId(null)}
                          className="rounded p-1 text-muted-foreground hover:bg-secondary"><XCircle className="h-4 w-4" /></button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Valor (€)</label>
                        <input type="number" step="0.01" min="0.01"
                          value={editForm.amount}
                          onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Data</label>
                        <Popover open={editDateOpen} onOpenChange={setEditDateOpen}>
                          <PopoverTrigger asChild>
                            <button className="w-full flex items-center justify-between rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                              {format(editForm.payment_date, "dd/MM/yyyy")}
                              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 z-[100]" align="start">
                            <Calendar mode="single" selected={editForm.payment_date}
                              onSelect={(d) => { if (d) setEditForm({ ...editForm, payment_date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0) }); setEditDateOpen(false); }}
                              initialFocus className="p-3" />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground">Conta</label>
                      <SearchableSelect options={accountOptions} value={editForm.account_id}
                        onValueChange={(v) => setEditForm({ ...editForm, account_id: v })}
                        placeholder="Selecionar…" searchPlaceholder="Pesquisar…" />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground">Método</label>
                      <div className="grid grid-cols-2 gap-1">
                        {([
                          { value: "transfer", label: "Transferência", icon: Building },
                          { value: "service_payment", label: "Pag. Serviços", icon: FileText },
                        ] as const).map((m) => (
                          <button key={m.value} type="button"
                            onClick={() => setEditForm({ ...editForm, payment_method: m.value })}
                            className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                              editForm.payment_method === m.value ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"
                            )}>
                            <m.icon className="h-3 w-3" />{m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {editForm.payment_method === "service_payment" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Entidade</label>
                          <input type="text" value={editForm.payment_entity}
                            onChange={(e) => setEditForm({ ...editForm, payment_entity: e.target.value })}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Referência</label>
                          <input type="text" value={editForm.payment_reference}
                            onChange={(e) => setEditForm({ ...editForm, payment_reference: e.target.value })}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-muted-foreground">Nº Fatura</label>
                      <input type="text" value={editForm.invoice_ref}
                        onChange={(e) => setEditForm({ ...editForm, invoice_ref: e.target.value })}
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground">Nota</label>
                      <input type="text" value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">Parcela #{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {formatDatePT(p.payment_date)}
                        </span>
                        {isAdmin && (
                          <>
                            <button onClick={() => startEdit(p)}
                              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => { if (confirm("Reverter este pagamento?")) deleteMutation.mutate(p.id); }}
                              className="rounded p-1 text-destructive/60 hover:bg-destructive/10 hover:text-destructive" title="Reverter">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor:</span>
                        <span className="font-semibold">{formatCurrency(Number(p.amount))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Conta:</span>
                        <span>{p.financial_accounts?.name ?? "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Método:</span>
                        <span>{methodLabels[p.payment_method] ?? p.payment_method}</span>
                      </div>
                      {p.invoice_ref && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Fatura:</span>
                          <span>{p.invoice_ref}</span>
                        </div>
                      )}
                      {p.payment_entity && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Entidade:</span>
                          <span>{p.payment_entity}</span>
                        </div>
                      )}
                      {p.payment_reference && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Referência:</span>
                          <span>{p.payment_reference}</span>
                        </div>
                      )}
                      {Number(p.withholding_amount) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Retenção IRS:</span>
                          <span className="text-warning">{formatCurrency(Number(p.withholding_amount))}</span>
                        </div>
                      )}
                      {Number(p.credit_amount) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Crédito:</span>
                          <span className="text-primary">{formatCurrency(Number(p.credit_amount))}</span>
                        </div>
                      )}
                    </div>

                    {p.notes && (
                      <p className="text-xs text-muted-foreground italic">{p.notes}</p>
                    )}

                    <p className="text-[10px] text-muted-foreground/60">
                      Registado por {p.created_by} em {new Date(p.created_at).toLocaleString("pt-PT")}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
