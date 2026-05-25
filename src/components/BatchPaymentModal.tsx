import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { calcWithIva, isFullyPaid } from "@/lib/utils";
import { X, FileText, Loader2, RefreshCw } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CurrencyBadge } from "@/components/CurrencyBadge";
import {
  CurrencyCode,
  isSupportedCurrency,
  formatInCurrency,
  fetchSuggestedFxRate,
} from "@/lib/currency";
import { computeNetPayable, getDeclaredWithholding } from "@/lib/withholding";
import { useInstallmentTxIds } from "@/hooks/useInstallmentTxIds";

interface Props {
  transactions: any[];
  onClose: () => void;
  initialInvoiceRef?: string;
}

export function BatchPaymentModal({ transactions, onClose, initialInvoiceRef = "" }: Props) {
  const [invoiceRef, setInvoiceRef] = useState(initialInvoiceRef);
  const [accountId, setAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  // FX rate per non-EUR currency present in the batch (string for input control)
  const [fxRates, setFxRates] = useState<Record<CurrencyCode, string>>({} as any);
  const [loadingFx, setLoadingFx] = useState<CurrencyCode | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, type, initial_balance, skip_balance_check")
        .eq("is_active", true)
        .eq("is_hidden", false)
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

  // Build per-row info incl. foreign-currency reference
  const items = useMemo(() => {
    return transactions.map((t) => {
      const base = Number(t.amount);
      const iva = t.iva_rate ?? 23;
      const total = calcWithIva(base, iva);
      const paid = Number(t.paid_amount ?? 0);
      const remainingEurOriginal =
        Math.round((total - paid) * 100) / 100;
      const remainingEurClean =
        Math.abs(remainingEurOriginal) <= 0.05 ? 0 : remainingEurOriginal;

      const ccy: CurrencyCode = isSupportedCurrency(t.currency)
        ? t.currency
        : "EUR";
      const isForeign = ccy !== "EUR";
      const origAmt = Number(t.original_amount) || 0;
      const origRate = Number(t.fx_rate) || 0;
      // Outstanding portion of the original (foreign) amount
      const remainingFx = isForeign && total > 0
        ? +(origAmt * (remainingEurClean / total)).toFixed(2)
        : 0;
      return {
        ...t,
        total,
        paid,
        currency: ccy,
        isForeign,
        origAmt,
        origRate,
        remainingFx,
        // Will be recomputed below if FX day rate provided
        remainingEurOriginal: remainingEurClean,
      };
    });
  }, [transactions]);

  // Currencies present in batch (non-EUR)
  const foreignCurrencies = useMemo(() => {
    const set = new Set<CurrencyCode>();
    items.forEach((i) => {
      if (i.isForeign) set.add(i.currency);
    });
    return Array.from(set);
  }, [items]);

  // Compute the actual EUR to settle per item, applying day-rate when available
  const computed = useMemo(() => {
    return items.map((i) => {
      if (!i.isForeign) {
        return { ...i, remainingEurFinal: i.remainingEurOriginal, dayRate: 0 };
      }
      const dayRateStr = fxRates[i.currency];
      const dayRate = parseFloat(dayRateStr ?? "") || 0;
      if (dayRate <= 0 || i.remainingFx <= 0) {
        return {
          ...i,
          remainingEurFinal: i.remainingEurOriginal,
          dayRate: 0,
        };
      }
      const newEur = +(i.remainingFx * dayRate).toFixed(2);
      return { ...i, remainingEurFinal: newEur, dayRate };
    });
  }, [items, fxRates]);

  const totalRemaining = computed.reduce((s, i) => s + i.remainingEurFinal, 0);
  const totalRemainingOriginal = computed.reduce(
    (s, i) => s + i.remainingEurOriginal,
    0
  );
  const fxDelta = +(totalRemaining - totalRemainingOriginal).toFixed(2);
  const totalWithIva = computed.reduce((s, i) => s + i.total, 0);
  const allExpenses = computed.every((i) => i.type === "expense");
  const allIncomes = computed.every((i) => i.type === "income");

  const selectedBalance = accountId ? computeAccountBalance(accountId) : null;
  const accountOptions = financialAccounts.map((a: any) => ({
    value: a.id,
    label: a.name,
  }));

  async function suggestRate(ccy: CurrencyCode) {
    setLoadingFx(ccy);
    const r = await fetchSuggestedFxRate(ccy, supabase);
    setLoadingFx(null);
    if (r) setFxRates((prev) => ({ ...prev, [ccy]: r.toFixed(6) }));
  }

  const paymentMutation = useMutation({
    mutationFn: async () => {
      // Guarda: reembolsos só podem ser liquidados via Nota de Reembolso
      const reimb = transactions.filter((t: any) => t.is_reimbursement);
      if (reimb.length > 0) {
        throw new Error(`${reimb.length} transação(ões) marcada(s) como reembolso. Liquide-as via Nota de Reembolso.`);
      }
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
      for (const item of computed) {
        const settleEur = item.remainingEurFinal;
        if (settleEur <= 0) continue;

        const baseAmount = Number(item.amount);
        const ivaRate = item.iva_rate ?? 23;
        const totalEur = calcWithIva(baseAmount, ivaRate);
        const newPaid = Math.round((item.paid + settleEur) * 100) / 100;
        // For foreign-currency items, "fully paid" means we settled all the
        // outstanding original-currency amount, not necessarily reaching the
        // original EUR total (which may differ due to fx variation).
        const closesForeign =
          item.isForeign &&
          item.dayRate > 0 &&
          Math.abs(settleEur - item.remainingEurFinal) < 0.01 &&
          item.remainingFx > 0 &&
          // settling the entire outstanding foreign balance
          Math.abs(item.remainingFx * item.dayRate - settleEur) < 0.02;
        const newStatus =
          closesForeign || isFullyPaid(newPaid, baseAmount, ivaRate)
            ? "paid"
            : "approved";
        const finalPaid =
          newStatus === "paid" && !item.isForeign
            ? Math.max(newPaid, totalEur)
            : newPaid;

        // Audit entries
        const auditEntries: any[] = [
          {
            transaction_id: item.id,
            changed_by: userName,
            field_name:
              item.type === "expense"
                ? "Pagamento parcial"
                : "Recebimento parcial",
            old_value: String(item.paid),
            new_value: `${formatCurrency(settleEur)} — ${accountName}`,
          },
        ];
        if (item.isForeign && item.dayRate > 0) {
          auditEntries.push({
            transaction_id: item.id,
            changed_by: userName,
            field_name: `Câmbio do dia (${item.currency}) — lote`,
            old_value: item.origRate ? item.origRate.toFixed(6) : null,
            new_value: `${item.dayRate.toFixed(6)} (variação: ${
              item.origRate
                ? (item.dayRate - item.origRate).toFixed(6)
                : "—"
            })`,
          });
        }
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

        // Propagate to child splits if parent — proportional to the EUR settled
        const { data: children } = await supabase
          .from("transactions")
          .select(
            "id, split_percentage, split_amount, amount, iva_rate, paid_amount, status, currency, fx_rate"
          )
          .eq("parent_transaction_id", item.id);

        if (children && children.length > 0) {
          const parentBaseEur = Number(item.amount);
          for (const child of children) {
            const childSplitAmt =
              (child as any).split_amount != null
                ? Number((child as any).split_amount)
                : null;
            const childPct = Number(child.split_percentage ?? 0);
            const childSettle =
              childSplitAmt != null && parentBaseEur > 0
                ? +((settleEur * childSplitAmt) / parentBaseEur).toFixed(2)
                : +((settleEur * childPct) / 100).toFixed(2);
            const childBase = Number(child.amount);
            const childIva = child.iva_rate ?? 23;
            const childTotal = calcWithIva(childBase, childIva);
            const childCurrentPaid = Number(child.paid_amount ?? 0);
            const childNewPaid = Math.min(
              Math.round((childCurrentPaid + childSettle) * 100) / 100,
              childTotal
            );
            const childStatus = isFullyPaid(
              childNewPaid,
              childBase,
              childIva
            )
              ? "paid"
              : "approved";
            await supabase
              .from("transactions")
              .update({
                paid_amount: childNewPaid,
                status: childStatus,
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

      return { count: computed.filter((i) => i.remainingEurFinal > 0).length };
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

  const payableCount = computed.filter((i) => i.remainingEurFinal > 0).length;

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
            {computed.length} transação(ões) selecionada(s)
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {computed.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs gap-2"
              >
                <span className="truncate flex-1">{item.description}</span>
                <span className="font-mono whitespace-nowrap inline-flex items-center gap-1">
                  {item.remainingEurFinal > 0
                    ? formatCurrency(item.remainingEurFinal)
                    : "✓ Pago"}
                  <CurrencyBadge
                    currency={item.currency}
                    originalAmount={item.origAmt}
                    fxRate={item.origRate}
                  />
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
          {foreignCurrencies.length > 0 && Math.abs(fxDelta) >= 0.01 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Variação cambial vs. câmbio original
              </span>
              <span
                className={`font-mono font-semibold ${
                  fxDelta >= 0 ? "text-warning" : "text-success"
                }`}
              >
                {fxDelta >= 0 ? "+" : ""}
                {formatCurrency(fxDelta)}
              </span>
            </div>
          )}
        </div>

        {!allExpenses && !allIncomes && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning">
            ⚠️ Seleção mista (receitas e despesas). Todas serão liquidadas pela
            mesma conta.
          </div>
        )}

        {/* Per-currency FX day rate inputs */}
        {foreignCurrencies.map((ccy) => {
          const totalFx = computed
            .filter((i) => i.currency === ccy)
            .reduce((s, i) => s + i.remainingFx, 0);
          const rate = parseFloat(fxRates[ccy] ?? "") || 0;
          const eurNow = rate > 0 ? +(totalFx * rate).toFixed(2) : 0;
          return (
            <div
              key={ccy}
              className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2"
            >
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Total contratado em {ccy}:</span>
                <span className="font-semibold text-foreground">
                  {formatInCurrency(totalFx, ccy)}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Câmbio do dia (1 {ccy} = X €)
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={fxRates[ccy] ?? ""}
                    onChange={(e) =>
                      setFxRates((prev) => ({ ...prev, [ccy]: e.target.value }))
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Ex.: 0.18"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => suggestRate(ccy)}
                  disabled={loadingFx === ccy}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      loadingFx === ccy ? "animate-spin" : ""
                    }`}
                  />
                  Sugerir
                </button>
              </div>
              {rate > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {formatInCurrency(totalFx, ccy)} × {rate.toFixed(6)} ={" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(eurNow)}
                  </span>
                </p>
              )}
              {rate <= 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Sem câmbio do dia: usa-se o câmbio original de cada linha.
                </p>
              )}
            </div>
          );
        })}

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
