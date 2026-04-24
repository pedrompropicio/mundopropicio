import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  initial: {
    title: string;
    budget_amount: number;
    notes: string | null;
  };
  onSaved?: () => void;
}

export function EditSessionModal({ open, onOpenChange, sessionId, initial, onSaved }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [budget, setBudget] = useState(String(initial.budget_amount ?? 0));
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initial.title);
      setBudget(String(initial.budget_amount ?? 0));
      setNotes(initial.notes ?? "");
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "Título obrigatório" });
      return;
    }
    const budgetNum = Number(budget);
    if (isNaN(budgetNum) || budgetNum < 0) {
      toast({ variant: "destructive", title: "Orçamento inválido" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("camarim_sessions" as any)
        .update({
          title: title.trim(),
          budget_amount: budgetNum,
          notes: notes.trim() || null,
        } as any)
        .eq("id", sessionId);
      if (error) throw error;
      toast({ title: "Sessão atualizada" });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao gravar", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar sessão</DialogTitle>
          <DialogDescription>Ajusta título, orçamento e notas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ses-title">Título</Label>
            <Input id="ses-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ses-budget">Orçamento (€)</Label>
            <Input
              id="ses-budget"
              type="number"
              step="0.01"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ses-notes">Notas</Label>
            <Textarea
              id="ses-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
