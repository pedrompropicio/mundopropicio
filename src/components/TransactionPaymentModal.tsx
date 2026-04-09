import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { X, CalendarIcon, Paperclip } from "lucide-react";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import { toast } from "@/hooks/use-toast";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, calcWithIva, isFullyPaid } from "@/lib/utils";

interface Props {
  transaction: any;
  onClose: () => void;
}

export function TransactionPaymentModal({ transaction, onClose }: Props) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  });
  const [showDocuments, setShowDocuments] = useState(false);
  const [paymentDateOpen, setPaymentDateOpen] = useState(false);
  const [invoiceRef, setInvoiceRef] = useState("");
  const [withholdingAmount, setWithholdingAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState(transaction.account_id ?? "");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name, type, initial_balance, skip_balance_check").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: supplierData } = useQuery({
    queryKey: ["supplier-bank-details", transaction.supplier_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("name, nif, iban, swift_bic, iban_2, swift_bic_2, iban_3, swift_bic_3").eq("id", transaction.supplier_id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!transaction.supplier_id,
  });

  const { data: txSummary = [] } = useQuery({
    queryKey: ["financial-accounts-tx-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, amount, paid_amount, status")
        .not("account_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  // Fetch child transactions for split propagation
  const { data: childTransactions = [] } = useQuery({
    queryKey: ["child-transactions", transaction.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, split_percentage, amount, iva_rate, paid_amount, status")
        .eq("parent_transaction_id", transaction.id);
      if (error) throw error;
      return data;
    },
  });

  const hasChildren = childTransactions.length > 0;

  function computeAccountBalance(accId: string) {
    const acc = financialAccounts.find((a: any) => a.id === accId);
    if (!acc) return 0;
    let bal = Number(acc.initial_balance ?? 0);
    txSummary.filter((t: any) => t.account_id === accId).forEach((t: any) => {
      const amt = Number(t.paid_amount ?? 0);
      if (t.type === "income") bal += amt;
      else bal -= amt;
    });
    return bal;
  }

  const selectedAccountBalance = accountId ? computeAccountBalance(accountId) : null;

  const baseAmount = Number(transaction.amount);
  const ivaRate = Number(transaction.iva_rate ?? 0);
  const amount = calcWithIva(baseAmount, ivaRate);
  const currentPaid = Number(transaction.paid_amount ?? 0);
  const balance = Math.round((amount - currentPaid) * 100) / 100;

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
      const withholding = parseFloat(withholdingAmount) || 0;
      if (withholding < 0) throw new Error("O valor de retenção não pode ser negativo");
      if (withholding >= addAmount) throw new Error("A retenção deve ser inferior ao valor total");
      const newPaid = Math.round((currentPaid + addAmount) * 100) / 100;
      if (newPaid > amount + 0.01) throw new Error("O valor excede o saldo em aberto");

      // Check account balance for expenses (net amount after withholding)
      const netCashOut = addAmount - withholding;
      if (isExpense) {
        const selectedAcc = financialAccounts.find((a: any) => a.id === accountId);
        const skipCheck = selectedAcc?.skip_balance_check ?? false;
        if (!skipCheck) {
          const accBalance = computeAccountBalance(accountId);
          if (netCashOut > accBalance) {
            throw new Error(`Saldo insuficiente na conta. Disponível: ${formatCurrency(accBalance)}`);
          }
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
        new_value: `${formatCurrency(addAmount)} — ${accountNameForLog}`,
      }];
      if (notes.trim()) {
        auditEntries.push({
          transaction_id: transaction.id,
          changed_by: user?.user_metadata?.full_name ?? user?.email ?? "utilizador",
          field_name: isExpense ? "Nota de pagamento" : "Nota de recebimento",
          old_value: null,
          new_value: notes.trim(),
        });
      }
      if (withholding > 0) {
        auditEntries.push({
          transaction_id: transaction.id,
          changed_by: user?.user_metadata?.full_name ?? user?.email ?? "utilizador",
          field_name: "Retenção IRS",
          old_value: null,
          new_value: `${formatCurrency(withholding)} (pago ao fornecedor: ${formatCurrency(addAmount - withholding)})`,
        });
      }
      await supabase.from("transaction_audit_log").insert(auditEntries);

      const newStatus = isFullyPaid(newPaid, baseAmount, ivaRate) ? "paid" : "approved";
      const finalPaid = newStatus === "paid" ? Math.max(newPaid, amount) : newPaid;
      const updateData: any = { paid_amount: finalPaid, status: newStatus, payment_date: format(paymentDate, "yyyy-MM-dd"), account_id: accountId };
      if (invoiceRef.trim()) updateData.invoice_ref = invoiceRef.trim();
      const { error } = await supabase
        .from("transactions")
        .update(updateData)
        .eq("id", transaction.id);
      if (error) throw error;

      // Propagate payment to child transactions (split/rateio)
      if (hasChildren) {
        for (const child of childTransactions) {
          const childPct = Number(child.split_percentage ?? 0);
          const childPayment = +(addAmount * childPct / 100).toFixed(2);
          const childTotal = calcWithIva(Number(child.amount), Number(child.iva_rate ?? 0));
          const childCurrentPaid = Number(child.paid_amount ?? 0);
          const childNewPaid = Math.min(Math.round((childCurrentPaid + childPayment) * 100) / 100, childTotal);
          const childStatus = isFullyPaid(childNewPaid, Number(child.amount), Number(child.iva_rate ?? 0)) ? "paid" : "approved";

          await supabase
            .from("transactions")
            .update({
              paid_amount: childNewPaid,
              status: childStatus,
              payment_date: format(paymentDate, "yyyy-MM-dd"),
            } as any)
            .eq("id", child.id);
        }
      }
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="glass w-full max-w-sm rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
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

          {supplierData && (
            <SupplierBankDetails supplier={supplierData} defaultExpanded />
          )}
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
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="dd/mm/aaaa"
                    value={format(paymentDate, "dd/MM/yyyy", { locale: pt })}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const digits = raw.replace(/\D/g, "");
                      if (digits.length === 8) {
                        const day = parseInt(digits.slice(0, 2), 10);
                        const month = parseInt(digits.slice(2, 4), 10);
                        const year = parseInt(digits.slice(4, 8), 10);
                        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                          setPaymentDate(new Date(year, month - 1, day, 12, 0, 0));
                        }
                      }
                    }}
                    className={cn(
                      "w-full rounded-lg border border-border bg-background px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50",
                      !paymentDate && "text-muted-foreground"
                    )}
                  />
                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[80]" align="start">
                <Calendar
                  mode="single"
                  selected={paymentDate}
                  onSelect={(d) => { if (d) { setPaymentDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)); } setPaymentDateOpen(false); }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {isExpense && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Retenção IRS (€) <span className="text-muted-foreground/60">— opcional</span></label>
              <input type="number" step="0.01" min="0" value={withholdingAmount}
                onChange={(e) => setWithholdingAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="0.00" />
              {parseFloat(withholdingAmount) > 0 && parseFloat(paymentAmount) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Pago ao fornecedor: <span className="font-semibold font-mono">{formatCurrency(parseFloat(paymentAmount) - parseFloat(withholdingAmount))}</span>
                  {" · "}Retido: <span className="font-semibold font-mono text-warning">{formatCurrency(parseFloat(withholdingAmount))}</span>
                </p>
              )}
            </div>
          )}

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
