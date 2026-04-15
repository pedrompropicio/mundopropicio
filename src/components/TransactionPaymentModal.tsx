import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { X, CalendarIcon, Paperclip, CreditCard, Building, FileText, Landmark } from "lucide-react";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import { toast } from "@/hooks/use-toast";
import { TransactionDocumentsModal } from "@/components/TransactionDocumentsModal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, calcWithIva, isFullyPaid } from "@/lib/utils";

type PaymentMethod = "transfer" | "service_payment" | "state_payment";

interface Props {
  transaction: any;
  onClose: () => void;
}

export function TransactionPaymentModal({ transaction, onClose }: Props) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(() => {
    if (transaction.payment_date) {
      const [y, m, d] = transaction.payment_date.split("-").map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  });
  const [showDocuments, setShowDocuments] = useState(false);
  const [paymentDateOpen, setPaymentDateOpen] = useState(false);
  const [invoiceRef, setInvoiceRef] = useState(transaction.invoice_ref ?? "");
  const [withholdingAmount, setWithholdingAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState(transaction.account_id ?? "");
  const [creditAllocations, setCreditAllocations] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    (transaction.payment_method as PaymentMethod) || "transfer"
  );
  const [paymentEntity, setPaymentEntity] = useState(transaction.payment_entity ?? "");
  const [paymentReference, setPaymentReference] = useState(transaction.payment_reference ?? "");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: categoryCode } = useQuery({
    queryKey: ["category-code", transaction.category_id],
    queryFn: async () => {
      if (!transaction.category_id) return null;
      const { data } = await supabase.from("account_categories").select("code").eq("id", transaction.category_id).single();
      return data?.code ?? null;
    },
    enabled: !!transaction.category_id,
  });

  const isStateCategory = categoryCode?.startsWith("10.4") || categoryCode?.startsWith("10.5");

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
        .select("id, split_percentage, split_amount, amount, iva_rate, paid_amount, status")
        .eq("parent_transaction_id", transaction.id);
      if (error) throw error;
      return data;
    },
  });

  const hasChildren = childTransactions.length > 0;

  const isExpense = transaction.type === "expense";
  const { data: availableCredits = [] } = useQuery({
    queryKey: ["supplier-credits-available", transaction.supplier_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_credits" as any)
        .select("id, amount, used_amount, reason, document_ref, valid_until")
        .eq("supplier_id", transaction.supplier_id)
        .eq("status", "active");
      if (error) throw error;
      // Filter out expired and fully used
      return (data as any[]).filter((c: any) => {
        const remaining = Number(c.amount) - Number(c.used_amount);
        if (remaining <= 0) return false;
        if (c.valid_until) {
          const [y, m, d] = c.valid_until.split("-").map(Number);
          const now = new Date();
          const todayNum = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
          const expiryNum = y * 10000 + m * 100 + d;
          if (expiryNum < todayNum) return false;
        }
        return true;
      });
    },
    enabled: !!transaction.supplier_id && isExpense,
  });

  const totalCreditApplied = Object.values(creditAllocations).reduce((s, v) => s + (parseFloat(v) || 0), 0);

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
  const rawBalance = Math.round((amount - currentPaid) * 100) / 100;
  // If remaining balance is within rounding tolerance, treat as fully paid
  const balance = Math.abs(rawBalance) <= 0.05 ? 0 : rawBalance;

  // Pre-fill payment amount with remaining balance
  useEffect(() => {
    if (balance > 0 && !paymentAmount) {
      setPaymentAmount(String(balance));
    }
  }, [balance]);

  const accountOptions = financialAccounts.map((a: any) => ({ value: a.id, label: a.name }));

  // isExpense already declared above
  const modalTitle = isExpense ? "Registar Pagamento" : "Registar Recebimento";
  const confirmLabel = isExpense ? "Confirmar Pagamento" : "Confirmar Recebimento";
  const successMsg = isExpense ? "Pagamento registado com sucesso!" : "Recebimento registado com sucesso!";
  const accountLabel = isExpense ? "Conta de origem *" : "Conta de destino *";

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const addAmount = parseFloat(paymentAmount);
      if (!addAmount || addAmount <= 0) throw new Error("Insira um valor válido");
      if (!accountId && totalCreditApplied < addAmount) throw new Error("Selecione a conta");
      if (paymentMethod === "service_payment" && (!paymentEntity.trim() || !paymentReference.trim())) throw new Error("Preencha Entidade e Referência");
      if (paymentMethod === "state_payment" && !paymentReference.trim()) throw new Error("Preencha a Referência de Pagamento");
      const withholding = parseFloat(withholdingAmount) || 0;
      if (withholding < 0) throw new Error("O valor de retenção não pode ser negativo");
      if (withholding >= addAmount) throw new Error("A retenção deve ser inferior ao valor total");
      const newPaid = Math.round((currentPaid + addAmount) * 100) / 100;
      if (newPaid > amount + 0.05) throw new Error("O valor excede o saldo em aberto");

      // Validate credit allocations
      for (const [creditId, valStr] of Object.entries(creditAllocations)) {
        const val = parseFloat(valStr) || 0;
        if (val <= 0) continue;
        const credit = availableCredits.find((c: any) => c.id === creditId);
        if (!credit) throw new Error("Crédito inválido");
        const remaining = Number(credit.amount) - Number(credit.used_amount);
        if (val > remaining + 0.01) throw new Error(`Crédito "${credit.reason}" tem apenas ${formatCurrency(remaining)} disponível`);
      }
      if (totalCreditApplied > addAmount + 0.01) throw new Error("Créditos aplicados excedem o valor do pagamento");

      // Validate that credit + cash out + withholding = payment amount
      const netCashOut = addAmount - withholding - totalCreditApplied;
      if (netCashOut < -0.01) throw new Error("A soma do crédito e retenção excede o valor do pagamento");

      // Validate: credit usage must match payment (credit + cash + withholding = total)
      const totalComponents = Math.round((totalCreditApplied + netCashOut + withholding) * 100) / 100;
      if (Math.abs(totalComponents - addAmount) > 0.02) {
        throw new Error(`Inconsistência: crédito (${formatCurrency(totalCreditApplied)}) + saída de caixa (${formatCurrency(netCashOut)}) + retenção (${formatCurrency(withholding)}) ≠ valor pago (${formatCurrency(addAmount)})`);
      }

      // Check account balance for expenses (net amount after withholding and credits)
      if (isExpense && netCashOut > 0) {
        const selectedAcc = financialAccounts.find((a: any) => a.id === accountId);
        if (!accountId) throw new Error("Selecione a conta para o valor de saída de caixa");
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
      if (totalCreditApplied > 0) {
        auditEntries.push({
          transaction_id: transaction.id,
          changed_by: user?.user_metadata?.full_name ?? user?.email ?? "utilizador",
          field_name: "Crédito fornecedor",
          old_value: null,
          new_value: `${formatCurrency(totalCreditApplied)} aplicado via crédito (saída de caixa: ${formatCurrency(netCashOut)})`,
        });
      }
      await supabase.from("transaction_audit_log").insert(auditEntries);

      const newStatus = isFullyPaid(newPaid, baseAmount, ivaRate) ? "paid" : "approved";
      const finalPaid = newStatus === "paid" ? Math.max(newPaid, amount) : newPaid;
      const updateData: any = {
        paid_amount: finalPaid, status: newStatus,
        payment_date: format(paymentDate, "yyyy-MM-dd"),
        account_id: accountId || null,
        payment_method: paymentMethod,
        payment_entity: paymentMethod === "service_payment" ? paymentEntity.trim() : null,
        payment_reference: paymentMethod !== "transfer" ? paymentReference.trim() : null,
      };
      if (invoiceRef.trim()) updateData.invoice_ref = invoiceRef.trim();
      if (paymentMethod !== "transfer") {
        const methodLabel = paymentMethod === "service_payment" ? "Pag. Serviços" : "Pag. Estado";
        const refInfo = paymentMethod === "service_payment"
          ? `Ent: ${paymentEntity.trim()} / Ref: ${paymentReference.trim()}`
          : `Ref: ${paymentReference.trim()}`;
        auditEntries.push({
          transaction_id: transaction.id,
          changed_by: user?.user_metadata?.full_name ?? user?.email ?? "utilizador",
          field_name: "Método de pagamento",
          old_value: null,
          new_value: `${methodLabel} — ${refInfo}`,
        });
      }
      const { error } = await supabase
        .from("transactions")
        .update(updateData)
        .eq("id", transaction.id);
      if (error) throw error;

      // Record credit usages
      const userName = user?.user_metadata?.full_name ?? user?.email ?? "sistema";
      for (const [creditId, valStr] of Object.entries(creditAllocations)) {
        const val = parseFloat(valStr) || 0;
        if (val <= 0) continue;
        await supabase.from("supplier_credit_usages" as any).insert({
          credit_id: creditId,
          transaction_id: transaction.id,
          amount: val,
          used_by: userName,
        });
        // Update used_amount on the credit
        const credit = availableCredits.find((c: any) => c.id === creditId);
        if (credit) {
          const newUsed = Math.round((Number(credit.used_amount) + val) * 100) / 100;
          const newStatus = newUsed >= Number(credit.amount) ? "exhausted" : "active";
          await supabase.from("supplier_credits" as any).update({ used_amount: newUsed, status: newStatus }).eq("id", creditId);
        }
      }

      // Propagate payment to child transactions (split/rateio)
      if (hasChildren) {
        for (const child of childTransactions) {
          const childSplitAmt = child.split_amount != null ? Number(child.split_amount) : null;
          const childPct = Number(child.split_percentage ?? 0);
          const childPayment = childSplitAmt != null
            ? +(addAmount * childSplitAmt / Number(transaction.amount)).toFixed(2)
            : +(addAmount * childPct / 100).toFixed(2);
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
      queryClient.invalidateQueries({ queryKey: ["supplier-credits"] });
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

          {/* Método de Pagamento */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Método de Pagamento</label>
            <div className={cn("grid gap-1.5", isStateCategory ? "grid-cols-3" : "grid-cols-2")}>
              {([
                { value: "transfer" as const, label: "Transferência", icon: Building },
                { value: "service_payment" as const, label: "Pag. Serviços", icon: FileText },
                ...(isStateCategory ? [{ value: "state_payment" as const, label: "Pag. Estado", icon: Landmark }] : []),
              ]).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-all",
                    paymentMethod === m.value
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-background text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <m.icon className="h-4 w-4" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Campos condicionais: Entidade + Referência */}
          {paymentMethod === "service_payment" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Entidade *</label>
                <input type="text" value={paymentEntity}
                  onChange={(e) => setPaymentEntity(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: 10611" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Referência *</label>
                <input type="text" value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Referência MB" />
              </div>
            </div>
          )}

          {paymentMethod === "state_payment" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Referência de Pagamento *</label>
              <input type="text" value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Referência AT / SS" />
            </div>
          )}

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

          {/* Supplier Credits */}
          {isExpense && availableCredits.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <CreditCard className="h-3.5 w-3.5" /> Créditos disponíveis
              </label>
              {availableCredits.map((c: any) => {
                const remaining = Number(c.amount) - Number(c.used_amount);
                return (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{c.reason}</span>
                      {c.document_ref && <span className="text-muted-foreground ml-1">({c.document_ref})</span>}
                      <span className="text-muted-foreground ml-1">— Disp: {formatCurrency(remaining)}</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={remaining}
                      value={creditAllocations[c.id] ?? ""}
                      onChange={(e) => setCreditAllocations(prev => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="0.00"
                      className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs text-right"
                    />
                  </div>
                );
              })}
              {totalCreditApplied > 0 && (
                <p className="text-xs font-medium text-primary">
                  Total crédito aplicado: {formatCurrency(totalCreditApplied)}
                  {parseFloat(paymentAmount) > 0 && (
                    <span className="text-muted-foreground font-normal"> · Saída de caixa: {formatCurrency(Math.max(0, parseFloat(paymentAmount) - (parseFloat(withholdingAmount) || 0) - totalCreditApplied))}</span>
                  )}
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
