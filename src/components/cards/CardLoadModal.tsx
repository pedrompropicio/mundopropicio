import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { X, Plus } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { performCardLoad } from "./cardLoadHelpers";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  cardAccountId: string;
  cardName: string;
}

export function CardLoadModal({ open, onOpenChange, sessionId, cardAccountId, cardName }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const { data: sourceAccounts = [] } = useQuery({
    queryKey: ["source-accounts-for-load"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .in("type", ["bank", "cash"])
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) throw new Error("Valor inválido.");
      if (!sourceId) throw new Error("Conta de origem obrigatória.");
      await performCardLoad({
        sessionId,
        cardAccountId,
        cardName,
        sourceAccountId: sourceId,
        sourceAccountName: sourceAccounts.find((a: any) => a.id === sourceId)?.name ?? "Conta",
        amount: amt,
        loadDate: date,
        userId: user?.id ?? null,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Recarga registada." });
      qc.invalidateQueries({ queryKey: ["card-session", sessionId] });
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      onOpenChange(false);
      setAmount(""); setSourceId(""); setNotes("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass w-full max-w-md rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Recarregar cartão</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor (€)</label>
            <input
              type="number" step="0.01" min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="input-base"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta de origem</label>
            <SearchableSelect
              options={sourceAccounts.map((a: any) => ({ value: a.id, label: a.name }))}
              value={sourceId}
              onValueChange={setSourceId}
              placeholder="Selecionar conta…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Notas</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-base" />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={mut.isPending} className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {mut.isPending ? "A registar…" : "Recarregar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
