import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { X, CalendarIcon, Paperclip } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface Props {
  transaction: any;
  onClose: () => void;
}

export function TransactionPaymentModal({ transaction, onClose }: Props) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [showDocuments, setShowDocuments] = useState(false);
  const [paymentDateOpen, setPaymentDateOpen] = useState(false);
  const [invoiceRef, setInvoiceRef] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState(transaction.account_id ?? "");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name, type, initial_balance").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: txSummary = [] } = useQuery({
    queryKey: ["financial-accounts-tx-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, amount, status")
        .not("account_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  function computeAccountBalance(accId: string) {
    const acc = financialAccounts.find((a: any) => a.id === accId);
    if (!acc) return 0;
    let bal = Number(acc.initial_balance ?? 0);
    txSummary.filter((t: any) => t.account_id === accId).forEach((t: any) => {
      const amt = Number(t.amount);
      if (t.type === "income") bal += amt;
      else bal -= amt;
    });
    return bal;
  }

  const selectedAccountBalance = accountId ? computeAccountBalance(accountId) : null;

  const amount = Number(transaction.amount);
  const currentPaid = Number(transaction.paid_amount ?? 0);
  const balance = amount - currentPaid;

  const accountOptions = financialAccounts.map((a: any) => ({ value: a.id, label: a.name }));

  const isExpense = transaction.type === "expense";
  const modalTitle = isExpense ? "Registar Pagamento" : "Registar Recebimento";
  const confirmLabel = isExpense ? "Confirmar Pagamento" : "Confirmar Recebimento";
  const successMsg = isExpense ? "Pagamento registado com sucesso!" : "Recebimento registado com sucesso!";
  const accountLabel = isExpense ? "Conta de origem *" : "Conta de destino *";

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const addAmount = parseFloat(paymentAmount);
      if (!addAmount || addAmount <= 0) throw new Error("Insira um valor válido");
      if (!accountId) throw new Error("Selecione a conta");
      const newPaid = currentPaid + addAmount;
      if (newPaid > amount) throw new Error("O valor excede o saldo em aberto");

      // Check account balance for expenses
      if (isExpense) {
        const accBalance = computeAccountBalance(accountId);
        if (addAmount > accBalance) {
          throw new Error(`Saldo insuficiente na conta. Disponível: ${formatCurrency(accBalance)}`);
        }
      }

      // Get the account name for audit log
      const selectedAccount = financialAccounts.find((a: any) => a.id === accountId);
      const accountNameForLog = selectedAccount?.name ?? "—";

      const auditEntries: any[] = [{
        transaction_id: transaction.id,
        changed_by: user?.user_metadata?.full_name ?? user?.email ?? "utilizador",
        field_name: isExpense ? "Pagamento parcial" : "Recebimento parcial",
        old_value: String(currentPaid),
        new_value: String(newPaid),
      }];
      // Log account used for this specific payment/receipt
      auditEntries.push({
        transaction_id: transaction.id,
        changed_by: user?.user_metadata?.full_name ?? user?.email ?? "utilizador",
        field_name: isExpense ? "Conta de pagamento" : "Conta de recebimento",
        old_value: null,
        new_value: `${accountNameForLog} — ${formatCurrency(addAmount)}`,
      });
      if (notes.trim()) {
        auditEntries.push({
          transaction_id: transaction.id,
          changed_by: user?.user_metadata?.full_name ?? user?.email ?? "utilizador",
          field_name: isExpense ? "Nota de pagamento" : "Nota de recebimento",
          old_value: null,
          new_value: notes.trim(),
        });
      }
      await supabase.from("transaction_audit_log").insert(auditEntries);

      const newStatus = newPaid >= amount ? "paid" : "approved";
      const updateData: any = { paid_amount: newPaid, status: newStatus, payment_date: format(paymentDate, "yyyy-MM-dd") };
      if (invoiceRef.trim()) updateData.invoice_ref = invoiceRef.trim();
      const { error } = await supabase
        .from("transactions")
        .update(updateData)
        .eq("id", transaction.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onClose();
      toast({ title: successMsg });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

   return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="glass w-full max-w-sm rounded-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{modalTitle}</h2>
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
          </div>

          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">{transaction.description}</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor total:</span>
              <span className="font-semibold">{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Já pago:</span>
              <span className="font-semibold text-success">{formatCurrency(currentPaid)}</span>
            </div>
            <div className="flex justify-between border-t border-border/50 pt-2">
              <span className="text-muted-foreground">Saldo em aberto:</span>
              <span className="font-bold text-warning">{formatCurrency(balance)}</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{accountLabel}</label>
            <SearchableSelect
              options={accountOptions}
              value={accountId}
              onValueChange={setAccountId}
              placeholder="Selecionar conta…"
              searchPlaceholder="Pesquisar conta…"
            />
            {accountId && selectedAccountBalance !== null && (
              <p className={`mt-1 text-xs font-medium ${selectedAccountBalance <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                Saldo disponível: <span className="font-mono font-semibold">{formatCurrency(selectedAccountBalance)}</span>
                {selectedAccountBalance <= 0 && " — Sem saldo!"}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data de Pagamento *</label>
            <Popover open={paymentDateOpen} onOpenChange={setPaymentDateOpen}>
              <PopoverTrigger asChild>
                <button className={cn(
                  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary/50",
                  !paymentDate && "text-muted-foreground"
                )}>
                  {paymentDate ? format(paymentDate, "dd/MM/yyyy", { locale: pt }) : "Selecionar data…"}
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[80]" align="start">
                <Calendar
                  mode="single"
                  selected={paymentDate}
                  onSelect={(d) => { if (d) setPaymentDate(d); setPaymentDateOpen(false); }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nº Doc/Fatura</label>
            <input type="text" value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Ex: FT 2026/001" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor a {isExpense ? "pagar" : "receber"} (€)</label>
            <input type="number" step="0.01" min="0.01" max={balance} value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="0.00" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nota / Observação</label>
            <textarea value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" placeholder="Observação sobre este pagamento…" />
          </div>

          <div className="flex gap-2">
            <button onClick={() => setShowDocuments(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-secondary/80">
              <Paperclip className="h-4 w-4" />
              Anexar
            </button>
            <button onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
              {paymentMutation.isPending ? "A processar…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>

      {showDocuments && (
        <TransactionDocumentsModal
          transactionId={transaction.id}
          transactionDescription={transaction.description}
          onClose={() => setShowDocuments(false)}
        />
      )}
    </>
  );
}
