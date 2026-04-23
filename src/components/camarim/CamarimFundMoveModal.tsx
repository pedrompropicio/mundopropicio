import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { FUND_MOVE_LABELS, type CamarimFundMoveType } from "@/lib/camarim-helpers";

interface Account {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onSaved?: () => void;
}

export function CamarimFundMoveModal({ open, onOpenChange, sessionId, onSaved }: Props) {
  const { user } = useAuth();
  const [moveType, setMoveType] = useState<CamarimFundMoveType>("advance");
  const [amount, setAmount] = useState("");
  const [moveDate, setMoveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void supabase
      .from("financial_accounts")
      .select("id,name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setAccounts((data ?? []) as Account[]));
  }, [open]);

  const handleSubmit = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast({ variant: "destructive", title: "Valor inválido" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("camarim_fund_moves" as any).insert({
        session_id: sessionId,
        move_type: moveType,
        amount: Number(amount),
        move_date: moveDate,
        currency: "EUR",
        financial_account_id: accountId || null,
        notes: notes || null,
        created_by: user?.id ?? null,
      } as any);
      if (error) throw error;
      toast({ title: "Movimento registado" });
      onSaved?.();
      onOpenChange(false);
      setAmount("");
      setNotes("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimento de caixa do camarim</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={moveType} onValueChange={(v) => setMoveType(v as CamarimFundMoveType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FUND_MOVE_LABELS) as CamarimFundMoveType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {FUND_MOVE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (€)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Conta de origem (opcional)</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
