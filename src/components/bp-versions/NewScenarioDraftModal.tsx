import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Info } from "lucide-react";
import { useCreateScenarioDraft } from "@/hooks/useBPVersions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  isMaster: boolean;
}

export function NewScenarioDraftModal({ open, onOpenChange, eventId, isMaster }: Props) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateScenarioDraft(eventId);

  const handleCreate = async () => {
    if (!label.trim()) return;
    try {
      await create.mutateAsync({
        scenarioLabel: label.trim(),
        description: description.trim() || null,
      });
      setLabel("");
      setDescription("");
      onOpenChange(false);
    } catch {
      // toast já tratado no hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Novo cenário de planeamento
          </DialogTitle>
          <DialogDescription>
            O cenário começa como uma cópia da versão Ativa e fica isolado dela. Pode
            editá-lo durante dias sem afetar o BP em produção.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="scenario-label">Nome do cenário *</Label>
            <Input
              id="scenario-label"
              placeholder="Ex.: Pessimista, Otimista, Sem Porto…"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="scenario-desc">Pressupostos / observações</Label>
            <Textarea
              id="scenario-desc"
              placeholder="Ex.: Considera quebra de 30% na bilheteira e aumento de 15% nos cachês."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="flex gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>
                O cenário cria uma <strong>cópia editável</strong> de todas as linhas do BP
                Ativo {isMaster ? "(Master e Splits)" : "deste evento"}.
              </p>
              <p>
                Quando estiver pronto, pode <strong>promovê-lo a Ativa</strong> (substitui o BP em
                produção) ou simplesmente <strong>descartá-lo</strong>.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={!label.trim() || create.isPending}>
            {create.isPending ? "A criar…" : "Criar cenário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
