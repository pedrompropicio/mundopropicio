import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { X } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onClose: () => void;
  transaction: {
    id: string;
    description?: string | null;
    paid_amount?: number | null;
    supplier_id?: string | null;
  } | null;
}

const REASON_PRESETS = [
  "Pagamento duplicado",
  "Pagamento indevido",
  "Serviço cancelado",
  "Outro",
];

export function ReverseTransactionDialog({ open, onClose, transaction }: Props) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"cash_refund" | "supplier_credit">("cash_refund");
  const [reasonPreset, setReasonPreset] = useState("Pagamento duplicado");
  const [reasonText, setReasonText] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const supplierAvailable = !!transaction?.supplier_id;
  const amount = Number(transaction?.paid_amount ?? 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!transaction) throw new Error("Sem transação");
      const reason = reasonPreset === "Outro"
        ? reasonText.trim()
        : `${reasonPreset}${reasonText.trim() ? " — " + reasonText.trim() : ""}`;
      if (!reason) throw new Error("Motivo é obrigatório");

      const { data, error } = await supabase.rpc("reverse_transaction" as any, {
        p_tx_id: transaction.id,
        p_kind: kind,
        p_reason: reason,
        p_valid_until: kind === "supplier_credit" && validUntil ? validUntil : null,
      } as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Transação estornada",
        description: kind === "cash_refund"
          ? "Saldo da conta reposto. Transação marcada como Estornada."
          : "Crédito do fornecedor criado. Transação marcada como Estornada.",
      });
      queryClient.invalidateQueries({ queryKey: ["payment-timeline", transaction?.id] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts-tx-summary"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts-cash-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-payments", transaction?.id] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits"] });
      handleClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao estornar", description: err?.message ?? String(err), variant: "destructive" });
    },
  });

  function handleClose() {
    setKind("cash_refund");
    setReasonPreset("Pagamento duplicado");
    setReasonText("");
    setValidUntil("");
    onClose();
  }

  if (!open || !transaction) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Estornar transação</h2>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium">{transaction.description ?? "—"}</span> — pago{" "}
              <span className="font-mono font-semibold">{formatCurrency(amount)}</span>.
              <br />
              A transação ficará marcada como <strong className="text-orange-500">Estornada</strong> (não volta a "A Pagar").
            </p>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={reasonPreset} onValueChange={setReasonPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASON_PRESETS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea
              placeholder={reasonPreset === "Outro" ? "Descreve o motivo (obrigatório)" : "Notas adicionais (opcional)"}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Destino do dinheiro</Label>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as any)}>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="cash_refund" id="tx-kind-cash" className="mt-0.5" />
                  <Label htmlFor="tx-kind-cash" className="cursor-pointer font-medium">
                    Devolução em dinheiro
                  </Label>
                </div>
                <p className="ml-6 text-xs text-muted-foreground">
                  O fornecedor devolveu o dinheiro. <strong>Saldo da conta sobe</strong> {formatCurrency(amount)}.
                </p>
              </div>
              <div className={`rounded-lg border border-border p-3 space-y-1 ${!supplierAvailable ? "opacity-50" : ""}`}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="supplier_credit" id="tx-kind-credit" className="mt-0.5" disabled={!supplierAvailable} />
                  <Label htmlFor="tx-kind-credit" className="cursor-pointer font-medium">
                    Crédito do fornecedor
                  </Label>
                </div>
                <p className="ml-6 text-xs text-muted-foreground">
                  Dinheiro fica como haver no fornecedor. <strong>Saldo da conta não muda</strong>. Crédito de {formatCurrency(amount)} fica disponível para um próximo pagamento.
                </p>
                {!supplierAvailable && (
                  <p className="ml-6 text-xs text-destructive">A transação não tem fornecedor associado — esta opção não está disponível.</p>
                )}
              </div>
            </RadioGroup>
          </div>

          {kind === "supplier_credit" && (
            <div className="space-y-2">
              <Label htmlFor="tx-validUntil">Validade do crédito (opcional)</Label>
              <Input
                id="tx-validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (reasonPreset === "Outro" && !reasonText.trim())}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {mutation.isPending ? "A estornar…" : "Confirmar estorno"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
