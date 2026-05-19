import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export function NewEtapaDialog({ frenteId, companyId, onClose }: { frenteId: string; companyId: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [escopo, setEscopo] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("operacao_etapas").insert({
      frente_id: frenteId,
      company_id: companyId,
      name: name.trim(),
      escopo: escopo.trim() || null,
      status: "pending",
    });
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Etapa criada" });
    qc.invalidateQueries({ queryKey: ["op-etapas", frenteId] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova etapa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Escopo (opcional)</Label>
            <Input value={escopo} onChange={(e) => setEscopo(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={saving || !name.trim()} className="w-full">
            {saving ? "A guardar..." : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
