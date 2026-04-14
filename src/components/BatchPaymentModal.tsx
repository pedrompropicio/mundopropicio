import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { calcWithIva, isFullyPaid } from "@/lib/utils";
import { X, FileText, Loader2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Props {
  transactions: any[];
  onClose: () => void;
}

export function BatchPaymentModal({ transactions, onClose }: Props) {
  const [invoiceRef, setInvoiceRef] = useState("");
  const [accountId, setAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, type, initial_balance, skip_balance_check")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
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

  function computeAccountBalance(accId: string) {
    const acc = financialAccounts.find((a: any) => a.id === accId);
    if (!acc) return 0;
    let bal = Number(acc.initial_balance ?? 0);
    txSummary
      .filter((t: any) => t.account_id === accId)
      .forEach((t: any) => {
        const amt = Number(t.paid_amount ?? 0);
        if (t.type === "income") bal += amt;
        else bal -= amt;
      });
    return bal;
  }

  // Calculate totals
  const items = transactions.map((t) => {
    const base = Number(t.amount);
    const iva = t.iva_rate ?? 23;
    const total = calcWithIva(base, iva);
    const paid = Number(t.paid_amount ?? 0);
    const remaining = Math.round((total - paid) * 100) / 100;
    return { ...t, total, paid, remaining: Math.abs(remaining) <= 0.05 ? 0 : remaining };
  });

  const totalRemaining = items.reduce((s, i) => s + i.remaining, 0);
  const totalWithIva = items.reduce((s, i) => s + i.total, 0);
  const allExpenses = items.every((i) => i.type === "expense");
  const allIncomes = items.every((i) => i.type === "income");

  const selectedBalance = accountId ? computeAccountBalance(accountId) : null;
  const accountOptions = financialAccounts.map((a: any) => ({
    value: a.id,
    label: a.name,
  }));

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("Selecione a conta");
      if (!paymentDate) throw new Error("Selecione a data de pagamento");

      // Validate balance for expenses
      if (allExpenses) {
        const acc = financialAccounts.find((a: any) => a.id === accountId);
        const skipCheck = acc?.skip_balance_check ?? false;
        if (!skipCheck) {
          const accBal = computeAccountBalance(accountId);
          if (totalRemaining > accBal + 0.05) {
            throw new Error(
              `Saldo insuficiente. Disponível: ${formatCurrency(accBal)}, Necessário: ${formatCurrency(totalRemaining)}`
            );
          }
        }
      }

      const userName =
        user?.user_metadata?.full_name ?? user?.email ?? "utilizador";
      const selectedAccount = financialAccounts.find(
        (a: any) => a.id === accountId
      );
      const accountName = selectedAccount?.name ?? "—";

      // Process each transaction
      for (const item of items) {
        if (item.remaining <= 0) continue;

        const newPaid = Math.round((item.paid + item.remaining) * 100) / 100;
        const baseAmount = Number(item.amount);
        const ivaRate = item.iva_rate ?? 23;
        const newStatus = isFullyPaid(newPaid, baseAmount, ivaRate)
          ? "paid"
          : "approved";
        const finalPaid =
          newStatus === "paid"
            ? Math.max(newPaid, calcWithIva(baseAmount, ivaRate))
            : newPaid;

        // Audit entry
        const auditEntries: any[] = [
          {
            transaction_id: item.id,
            changed_by: userName,
            field_name:
              item.type === "expense"
                ? "Pagamento parcial"
                : "Recebimento parcial",
            old_value: String(item.paid),
            new_value: `${formatCurrency(item.remaining)} — ${accountName}`,
          },
        ];
        if (notes.trim()) {
          auditEntries.push({
            transaction_id: item.id,
            changed_by: userName,
            field_name:
              item.type === "expense"
                ? "Nota de pagamento"
                : "Nota de recebimento",
            old_value: null,
            new_value: notes.trim(),
          });
        }
        await supabase.from("transaction_audit_log").insert(auditEntries);

        // Update transaction
        const updateData: any = {
          paid_amount: finalPaid,
          status: newStatus,
          payment_date: paymentDate,
          account_id: accountId,
        };
        if (invoiceRef.trim()) updateData.invoice_ref = invoiceRef.trim();

        const { error } = await supabase
          .from("transactions")
          .update(updateData)
          .eq("id", item.id);
        if (error) throw error;

        // Propagate to child splits if parent
        const { data: children } = await supabase
          .from("transactions")
          .select("id, split_percentage, amount, iva_rate, paid_amount, status")
          .eq("parent_transaction_id", item.id);

        if (children && children.length > 0) {
          for (const child of children) {
            const childBase = Number(child.amount);
            const childIva = child.iva_rate ?? 23;
            const childTotal = calcWithIva(childBase, childIva);
            const childNewStatus = "paid";
            await supabase
              .from("transactions")
              .update({
                paid_amount: childTotal,
                status: childNewStatus,
                payment_date: paymentDate,
                account_id: accountId,
                ...(invoiceRef.trim()
                  ? { invoice_ref: invoiceRef.trim() }
                  : {}),
              } as any)
              .eq("id", child.id);
          }
        }
      }

      return { count: items.filter((i) => i.remaining > 0).length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({
        title: `${data.count} transação(ões) liquidada(s)!`,
        description: invoiceRef.trim()
          ? `Fatura: ${invoiceRef.trim()}`
          : undefined,
      });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Erro na liquidação em lote",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const payableCount = items.filter((i) => i.remaining > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Liquidação em Lote
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
          <p className="text-sm font-medium">
            {items.length} transação(ões) selecionada(s)
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="truncate flex-1 mr-2">
                  {item.description}
                </span>
                <span className="font-mono whitespace-nowrap">
                  {item.remaining > 0
                    ? formatCurrency(item.remaining)
                    : "✓ Pago"}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
            <span>Total a liquidar</span>
            <span className="font-mono text-primary">
              {formatCurrency(totalRemaining)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total bruto (c/ IVA)</span>
            <span className="font-mono">{formatCurrency(totalWithIva)}</span>
          </div>
        </div>

        {!allExpenses && !allIncomes && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning">
            ⚠️ Seleção mista (receitas e despesas). Todas serão liquidadas pela
            mesma conta.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Nº Fatura
            </label>
            <input
              type="text"
              value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
              placeholder="Ex: FT 002/5944"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Todas as transações receberão este nº de fatura
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {allIncomes ? "Conta de destino *" : "Conta de pagamento *"}
            </label>
            <SearchableSelect
              options={accountOptions}
              value={accountId}
              onValueChange={setAccountId}
              placeholder="Selecionar conta…"
              searchPlaceholder="Pesquisar conta…"
            />
            {selectedBalance !== null && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Saldo atual: {formatCurrency(selectedBalance)}
                {allExpenses && totalRemaining > selectedBalance && (
                  <span className="ml-1 text-destructive font-semibold">
                    — Saldo insuficiente!
                  </span>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Data de pagamento *
            </label>
            <DatePicker
              value={paymentDate}
              onChange={setPaymentDate}
              placeholder="Data…"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nota comum a todas as transações"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <button
          onClick={() => paymentMutation.mutate()}
          disabled={
            paymentMutation.isPending ||
            payableCount === 0 ||
            !accountId ||
            !paymentDate
          }
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {paymentMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />A liquidar…
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Liquidar {payableCount} transação(ões) —{" "}
              {formatCurrency(totalRemaining)}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
