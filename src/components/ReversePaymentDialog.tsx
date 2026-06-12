import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onClose: () => void;
  payment: {
    id: string;
    amount: number;
    payment_date?: string | null;
    account_name?: string | null;
  } | null;
  transactionId?: string;
  /** opcional — se a TX não tem supplier_id, esconder V2 */
  supplierAvailable?: boolean;
}

const REASON_PRESETS = [
  "Pagamento indevido",
  "Serviço cancelado",
  "Pagamento duplicado",
  "Outro",
];

export function ReversePaymentDialog({ open, onClose, payment, transactionId, supplierAvailable = true }: Props) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"cash_refund" | "supplier_credit">("cash_refund");
  const [reasonPreset, setReasonPreset] = useState("Pagamento indevido");
  const [reasonText, setReasonText] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!payment) throw new Error("Sem parcela");
      const reason = reasonPreset === "Outro"
        ? reasonText.trim()
        : `${reasonPreset}${reasonText.trim() ? " — " + reasonText.trim() : ""}`;
      if (!reason) throw new Error("Motivo é obrigatório");

      const { data, error } = await supabase.rpc("reverse_payment" as any, {
        p_payment_id: payment.id,
        p_kind: kind,
        p_reason: reason,
        p_valid_until: kind === "supplier_credit" && validUntil ? validUntil : null,
      } as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Pagamento estornado",
        description: kind === "cash_refund"
          ? "Saldo da conta reposto. Transação voltou a aguardar pagamento."
          : "Crédito do fornecedor criado. Transação mantém-se paga.",
      });
      // invalidar tudo que possa depender de saldos / pagamentos
      queryClient.invalidateQueries({ queryKey: ["payment-timeline", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts-tx-summary"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts-cash-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-payments", transactionId] });
      queryClient.invalidateQueries({ queryKey: ["supplier-credits"] });
      handleClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao estornar", description: err?.message ?? String(err), variant: "destructive" });
    },
  });

  function handleClose() {
    setKind("cash_refund");
    setReasonPreset("Pagamento indevido");
    setReasonText("");
    setValidUntil("");
    onClose();
  }

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Estornar pagamento</DialogTitle>
          <DialogDescription>
            Parcela de <span className="font-mono font-semibold">{formatCurrency(payment.amount)}</span>
            {payment.payment_date ? ` — pago em ${payment.payment_date}` : ""}
            {payment.account_name ? ` · ${payment.account_name}` : ""}
          </DialogDescription>
        </DialogHeader>

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
            <Label>Tipo de estorno</Label>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as any)}>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="cash_refund" id="kind-cash" className="mt-0.5" />
                  <Label htmlFor="kind-cash" className="cursor-pointer font-medium">
                    Devolução em dinheiro
                  </Label>
                </div>
                <p className="ml-6 text-xs text-muted-foreground">
                  O fornecedor devolveu o dinheiro. <strong>Saldo da conta sobe</strong> {formatCurrency(payment.amount)} e a transação volta a "aguarda pagamento".
                </p>
              </div>
              <div className={`rounded-lg border border-border p-3 space-y-1 ${!supplierAvailable ? "opacity-50" : ""}`}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="supplier_credit" id="kind-credit" className="mt-0.5" disabled={!supplierAvailable} />
                  <Label htmlFor="kind-credit" className="cursor-pointer font-medium">
                    Converter em crédito do fornecedor
                  </Label>
                </div>
                <p className="ml-6 text-xs text-muted-foreground">
                  Dinheiro fica como haver no fornecedor. <strong>Saldo da conta não muda</strong>. Transação continua paga. Crédito de {formatCurrency(payment.amount)} disponível para usar num próximo pagamento ao mesmo fornecedor.
                </p>
                {!supplierAvailable && (
                  <p className="ml-6 text-xs text-destructive">A transação não tem fornecedor associado — esta opção não está disponível.</p>
                )}
              </div>
            </RadioGroup>
          </div>

          {kind === "supplier_credit" && (
            <div className="space-y-2">
              <Label htmlFor="validUntil">Validade do crédito (opcional)</Label>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (reasonPreset === "Outro" && !reasonText.trim())}
            variant={kind === "cash_refund" ? "destructive" : "default"}
          >
            {mutation.isPending ? "A estornar…" : "Confirmar estorno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
