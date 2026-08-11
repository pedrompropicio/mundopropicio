import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/mock-data";
import { applySupplierCredit, creditRemaining } from "@/lib/supplier-credits";
import { useAvailableSupplierCredits } from "@/hooks/useAvailableSupplierCredits";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplierId?: string | null;
  transactionId: string;
  /** Valor máximo abatível (normalmente o valor em aberto da transação). */
  maxAmount: number;
  /** Pagamento a preencher com credit_amount (opcional). */
  paymentId?: string | null;
  supplierName?: string | null;
};

/** Abate de crédito confirmado pela financeira (nunca automático). */
export function ApplySupplierCreditDialog({
  open, onOpenChange, supplierId, transactionId, maxAmount, paymentId, supplierName,
}: Props) {
  const queryClient = useQueryClient();
  const { data: credits = [] } = useAvailableSupplierCredits(supplierId, open);
  const [creditId, setCreditId] = useState("");
  const [amount, setAmount] = useState("");

  const selected = credits.find((c) => c.id === creditId);

  const mut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Escolhe um crédito");
      const val = Math.round((parseFloat(amount) || 0) * 100) / 100;
      if (val <= 0) throw new Error("Valor inválido");
      await applySupplierCredit({ creditId: selected.id, transactionId, amount: val, paymentId });
    },
    onSuccess: () => {
      toast.success("Crédito abatido");
      queryClient.invalidateQueries({ queryKey: ["supplier-credits-available"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits-all"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payment-timeline", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Abater crédito de fornecedor</DialogTitle>
          <DialogDescription>
            {supplierName ? `${supplierName} · ` : ""}O crédito reduz apenas a saída de caixa — o custo mantém-se no evento de origem.
          </DialogDescription>
        </DialogHeader>

        {credits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem créditos disponíveis para este fornecedor.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs text-muted-foreground">Crédito</label>
              <select
                value={creditId}
                onChange={(e) => {
                  const c = credits.find((x) => x.id === e.target.value);
                  setCreditId(e.target.value);
                  if (c) setAmount(Math.min(creditRemaining(c), maxAmount > 0 ? maxAmount : creditRemaining(c)).toFixed(2));
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
              >
                <option value="">— escolher —</option>
                {credits.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.reason}{c.document_ref ? ` (${c.document_ref})` : ""} — {formatCurrency(creditRemaining(c))}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Valor a abater (€){selected ? ` · máx ${formatCurrency(Math.min(creditRemaining(selected), maxAmount || creditRemaining(selected)))}` : ""}
              </label>
              <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-right font-mono" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !creditId}>
            {mut.isPending ? "A abater…" : "Abater crédito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
