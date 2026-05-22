import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  addFrenteLead,
  addFrenteAuxiliary,
} from "@/lib/operacao-frente-lead";

interface Props {
  eventId: string;
  profileId: string;
  companyId: string;
  open: boolean;
  onClose: () => void;
}

type RoleChoice = "lead" | "auxiliary";

export function FrenteAssociationPicker({
  eventId,
  profileId,
  companyId,
  open,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const [role, setRole] = useState<RoleChoice>("lead");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: frentes, isLoading } = useQuery({
    queryKey: ["pessoa-frente-picker", eventId, profileId],
    enabled: open && !!eventId && !!profileId,
    queryFn: async () => {
      const [frentesRes, teamRes] = await Promise.all([
        supabase
          .from("operacao_frentes")
          .select("id, name, type, color, status")
          .eq("event_id", eventId)
          .neq("status", "cancelled")
          .order("display_order", { ascending: true }),
        supabase
          .from("operacao_frente_team")
          .select("frente_id")
          .eq("profile_id", profileId),
      ]);
      if (frentesRes.error) throw frentesRes.error;
      if (teamRes.error) throw teamRes.error;
      const taken = new Set((teamRes.data ?? []).map((r: any) => r.frente_id));
      return (frentesRes.data ?? []).filter((f: any) => !taken.has(f.id));
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.size === 0) {
      toast({ title: "Escolhe pelo menos uma frente", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const ids = Array.from(selected);
      for (const frenteId of ids) {
        const { error } =
          role === "lead"
            ? await addFrenteLead({ frenteId, profileId, companyId })
            : await addFrenteAuxiliary({ frenteId, profileId, companyId });
        if (error) throw new Error(error);
      }
      toast({ title: `Associada a ${ids.length} ${ids.length === 1 ? "frente" : "frentes"}` });
      qc.invalidateQueries({ queryKey: ["pessoa-sheet", profileId] });
      qc.invalidateQueries({ queryKey: ["pessoa-frente-picker"] });
      qc.invalidateQueries({ queryKey: ["operacao-frentes"] });
      qc.invalidateQueries({ queryKey: ["equipa-pessoas-list"] });
      setSelected(new Set());
      onClose();
    } catch (e: any) {
      toast({ title: "Erro a associar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Associar a zona/serviço</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Papel</Label>
            <RadioGroup value={role} onValueChange={(v) => setRole(v as RoleChoice)} className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="lead" /> Produtor
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="auxiliary" /> Auxiliar
              </label>
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Zonas / Serviços disponíveis</Label>
            <div className="mt-2 max-h-72 overflow-y-auto border rounded-md divide-y">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">A carregar…</div>
              ) : (frentes ?? []).length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Sem frentes disponíveis para esta pessoa.
                </div>
              ) : (
                (frentes ?? []).map((f: any) => (
                  <label
                    key={f.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30"
                  >
                    <Checkbox
                      checked={selected.has(f.id)}
                      onCheckedChange={() => toggle(f.id)}
                    />
                    <span className="flex-1 text-sm">{f.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {f.type === "zone" ? "Zona" : "Serviço"}
                    </Badge>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || selected.size === 0}>
            {saving && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
            Associar ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
