import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";

interface Props {
  open: boolean;
  onClose: () => void;
  officeId: string;
  officeName: string;
  eventId: string;
}

/**
 * Quick "Novo Adiantamento" modal — pre-fills office + event from settlement context.
 * Creates a paid transfer transaction (optional) and an event_ticket_office_advances row.
 */
export function QuickAdvanceModal({ open, onClose, officeId, officeName, eventId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [targetAccountId, setTargetAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [createTransaction, setCreateTransaction] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["advance_target_accounts", officeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_accounts")
        .select("id, name, type")
        .eq("type", "bank")
        .eq("is_active", true)
        .neq("id", officeId)
        .order("name");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!value || value <= 0) throw new Error("Indique um valor válido");
      if (!advanceDate) throw new Error("Indique a data");
      if (createTransaction && !targetAccountId) throw new Error("Selecione a conta destino");

      let transactionId: string | null = null;

      if (createTransaction) {
        const { data: txn, error: txErr } = await (supabase as any)
          .from("transactions")
          .insert({
            type: "transfer",
            description: `Adiantamento bilheteira ${officeName}`,
            amount: value,
            paid_amount: value,
            status: "paid",
            payment_date: advanceDate,
            account_id: officeId,
            target_account_id: targetAccountId,
            event_id: eventId,
          })
          .select("id")
          .single();
        if (txErr) throw txErr;
        transactionId = txn.id;
      }

      const payload: any = {
        event_id: eventId,
        financial_account_id: officeId,
        target_account_id: targetAccountId || null,
        transaction_id: transactionId,
        amount: value,
        advance_date: advanceDate,
        notes: notes || null,
        created_by: getAuditUser(user),
      };

      const { data, error } = await (supabase as any)
        .from("event_ticket_office_advances")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      await logAudit({
        entity_type: "ticket_office_advance",
        entity_id: data.id,
        action: "create",
        changed_by: getAuditUser(user),
        new_data: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_office_advances"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_office_balances"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["settlement_eligible_txns"] });
      queryClient.invalidateQueries({ queryKey: ["settlement_event_advances"] });
      toast.success("Adiantamento registado");
      handleClose();
    },
    onError: (err: any) => toast.error("Erro", { description: err.message }),
  });

  const handleClose = () => {
    setAmount("");
    setNotes("");
    setTargetAccountId("");
    setAdvanceDate(new Date().toISOString().slice(0, 10));
    setCreateTransaction(true);
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await saveMutation.mutateAsync();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="z-[100] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Adiantamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <div><span className="font-medium text-foreground">Bilheteira:</span> {officeName}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <DatePicker value={advanceDate} onChange={(v) => setAdvanceDate(v ?? "")} />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border p-3">
            <Checkbox
              checked={createTransaction}
              onCheckedChange={(v) => setCreateTransaction(!!v)}
              id="create_txn"
              className="mt-0.5"
            />
            <Label htmlFor="create_txn" className="text-sm font-normal cursor-pointer">
              Criar transação de transferência (liquidada) para a conta destino
            </Label>
          </div>

          {createTransaction && (
            <div className="space-y-1.5">
              <Label>Conta destino</Label>
              <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Observações"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
