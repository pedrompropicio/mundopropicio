import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, ArrowRightLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";

const TRANSFER_CATEGORY_CODE = "10.3";

interface TransferFormModalProps {
  onClose: () => void;
}

export function TransferFormModal({ onClose }: TransferFormModalProps) {
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Transferência entre contas");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name, initial_balance")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: transferCategory } = useQuery({
    queryKey: ["transfer-category"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id")
        .eq("code", TRANSFER_CATEGORY_CODE)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Calculate available balance for source account
  const { data: sourceBalance } = useQuery({
    queryKey: ["account-balance", fromAccountId],
    enabled: !!fromAccountId,
    queryFn: async () => {
      const account = accounts.find((a) => a.id === fromAccountId);
      if (!account) return 0;

      const { data: txns, error } = await supabase
        .from("transactions")
        .select("type, paid_amount")
        .eq("account_id", fromAccountId)
        .in("status", ["paid", "approved", "pending"]);
      if (error) throw error;

      let balance = Number(account.initial_balance ?? 0);
      for (const t of txns || []) {
        const paid = Number(t.paid_amount ?? 0);
        if (t.type === "income") balance += paid;
        else balance -= paid;
      }
      return balance;
    },
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!transferCategory) throw new Error("Categoria de transferência não encontrada.");
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) throw new Error("Valor inválido.");
      if (fromAccountId === toAccountId) throw new Error("As contas devem ser diferentes.");
      if (!fromAccountId || !toAccountId) throw new Error("Selecione ambas as contas.");

      if (sourceBalance !== undefined && numAmount > sourceBalance) {
        throw new Error(`Saldo insuficiente. Disponível: €${sourceBalance.toFixed(2)}`);
      }

      const fromAccount = accounts.find((a) => a.id === fromAccountId);
      const toAccount = accounts.find((a) => a.id === toAccountId);
      const changedBy = user?.user_metadata?.full_name ?? user?.email ?? "sistema";

      // Create expense (outgoing from source)
      const { data: expenseTx, error: expError } = await supabase
        .from("transactions")
        .insert({
          description: `${description} (${fromAccount?.name} → ${toAccount?.name})`,
          type: "expense",
          amount: numAmount,
          iva_rate: 0,
          category_id: transferCategory.id,
          account_id: fromAccountId,
          date,
          status: "paid",
          paid_amount: numAmount,
          payment_date: date,
        })
        .select("id")
        .single();
      if (expError) throw expError;

      // Create income (incoming to destination)
      const { data: incomeTx, error: incError } = await supabase
        .from("transactions")
        .insert({
          description: `${description} (${fromAccount?.name} → ${toAccount?.name})`,
          type: "income",
          amount: numAmount,
          iva_rate: 0,
          category_id: transferCategory.id,
          account_id: toAccountId,
          date,
          status: "paid",
          paid_amount: numAmount,
          payment_date: date,
        })
        .select("id")
        .single();
      if (incError) throw incError;

      // Audit logs
      const auditEntries = [
        {
          transaction_id: expenseTx.id,
          changed_by: changedBy,
          field_name: "transferência",
          old_value: null,
          new_value: `Saída: ${fromAccount?.name} → ${toAccount?.name} | €${numAmount.toFixed(2)}`,
        },
        {
          transaction_id: incomeTx.id,
          changed_by: changedBy,
          field_name: "transferência",
          old_value: null,
          new_value: `Entrada: ${fromAccount?.name} ← ${fromAccount?.name} | €${numAmount.toFixed(2)}`,
        },
      ];
      await supabase.from("transaction_audit_log").insert(auditEntries);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
      toast({ title: "Transferência registada com sucesso!" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: a.name,
  }));

  const toAccountOptions = accountOptions.filter((a) => a.value !== fromAccountId);

  const numAmount = parseFloat(amount);
  const insufficientBalance =
    sourceBalance !== undefined && !isNaN(numAmount) && numAmount > sourceBalance;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass w-full max-w-md rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Transferência entre Contas</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            transferMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Conta de Origem
            </label>
            <SearchableSelect
              options={accountOptions}
              value={fromAccountId}
              onValueChange={(v) => {
                setFromAccountId(v);
                if (v === toAccountId) setToAccountId("");
              }}
              placeholder="Selecionar conta…"
            />
            {fromAccountId && sourceBalance !== undefined && (
              <p className="mt-1 text-xs text-muted-foreground">
                Saldo disponível: <span className={insufficientBalance ? "text-destructive font-medium" : "text-emerald-400 font-medium"}>
                  €{sourceBalance.toFixed(2)}
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Conta de Destino
            </label>
            <SearchableSelect
              options={toAccountOptions}
              value={toAccountId}
              onValueChange={setToAccountId}
              placeholder="Selecionar conta…"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor (€)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                insufficientBalance ? "border-destructive" : "border-border"
              }`}
              placeholder="0.00"
            />
            {insufficientBalance && (
              <p className="mt-1 text-xs text-destructive">Saldo insuficiente na conta de origem.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Data Movimento
            </label>
            <DatePicker value={date} onChange={setDate} placeholder="Data…" />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={transferMutation.isPending || insufficientBalance || !fromAccountId || !toAccountId}
              className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 glow-primary"
            >
              {transferMutation.isPending ? "A processar…" : "Transferir"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
