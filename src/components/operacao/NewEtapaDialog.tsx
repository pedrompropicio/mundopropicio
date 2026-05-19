import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

export function NewEtapaDialog({ frenteId, companyId, onClose }: { frenteId: string; companyId: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [escopo, setEscopo] = useState("");
  const [zoneId, setZoneId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: frente } = useQuery({
    queryKey: ["op-new-etapa-frente", frenteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,type,event_id")
        .eq("id", frenteId)
        .maybeSingle();
      return data;
    },
  });

  const isService = (frente as any)?.type === "service";

  const { data: zones } = useQuery({
    queryKey: ["op-zones-for-event", (frente as any)?.event_id],
    enabled: isService && !!(frente as any)?.event_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color")
        .eq("event_id", (frente as any).event_id)
        .eq("type", "zone")
        .neq("status", "cancelled")
        .order("name");
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("operacao_etapas").insert({
      frente_id: frenteId,
      company_id: companyId,
      name: name.trim(),
      escopo: escopo.trim() || null,
      status: "pending",
      zone_id: isService && zoneId ? zoneId : null,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Etapa criada" });
    qc.invalidateQueries({ queryKey: ["op-etapas", frenteId] });
    qc.invalidateQueries({ queryKey: ["op-etapas-table", frenteId] });
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
          {isService && (
            <div>
              <Label>Zona que atende</Label>
              <Select value={zoneId || "__none__"} onValueChange={(v) => setZoneId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma (etapa geral do serviço) —</SelectItem>
                  {(zones ?? []).map((z: any) => (
                    <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={submit} disabled={saving || !name.trim()} className="w-full">
            {saving ? "A guardar..." : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
