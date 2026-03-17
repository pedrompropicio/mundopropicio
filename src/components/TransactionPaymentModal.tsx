import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  transaction: any;
  onClose: () => void;
}

export function TransactionPaymentModal({ transaction, onClose }: Props) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const queryClient = useQueryClient();

  const amount = Number(transaction.amount);
  const currentPaid = Number(transaction.paid_amount ?? 0);
  const balance = amount - currentPaid;

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const addAmount = parseFloat(paymentAmount);
      if (!addAmount || addAmount <= 0) throw new Error("Insira um valor válido");
      const newPaid = currentPaid + addAmount;
      if (newPaid > amount) throw new Error("O valor excede o saldo em aberto");

      // Log the payment
      await supabase.from("transaction_audit_log").insert({
        transaction_id: transaction.id,
        changed_by: "utilizador",
        field_name: "Pagamento parcial",
        old_value: String(currentPaid),
        new_value: String(newPaid),
      });

      const newStatus = newPaid >= amount ? "paid" : "pending";
      const { error } = await supabase
        .from("transactions")
        .update({ paid_amount: newPaid, status: newStatus })
        .eq("id", transaction.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onClose();
      toast({ title: "Pagamento registado com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-sm rounded-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Registar Pagamento</h2>
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
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor a pagar (€)</label>
          <input type="number" step="0.01" min="0.01" max={balance} value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="0.00" />
        </div>

        <button onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50">
          {paymentMutation.isPending ? "A processar…" : "Confirmar Pagamento"}
        </button>
      </div>
    </div>
  );
}
