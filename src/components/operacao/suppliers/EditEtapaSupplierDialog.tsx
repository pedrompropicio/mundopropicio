import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const IVA_OPTS = [0, 6, 13, 23];

interface Props {
  row: any;
  onClose: () => void;
}

export function EditEtapaSupplierDialog({ row, onClose }: Props) {
  const qc = useQueryClient();
  const [role, setRole] = useState<"principal" | "secundario">(row.role);
  const [decidedAmount, setDecidedAmount] = useState(row.decided_amount != null ? String(row.decided_amount) : "");
  const [ivaRate, setIvaRate] = useState<string>(row.iva_rate != null ? String(row.iva_rate) : "23");
  const [contactName, setContactName] = useState(row.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(row.contact_phone ?? "");
  const [contactRole, setContactRole] = useState(row.contact_role ?? "");
  const [contactEmail, setContactEmail] = useState(row.contact_email ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { error } = await supabase.from("operacao_etapa_suppliers").update({
      role,
      decided_amount: decidedAmount ? Number(decidedAmount) : null,
      iva_rate: decidedAmount ? Number(ivaRate) : null,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_role: contactRole.trim() || null,
      contact_email: contactEmail.trim() || null,
    } as any).eq("id", row.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Atualizado" });
    qc.invalidateQueries({ queryKey: ["op-etapa-suppliers", row.etapa_id] });
    qc.invalidateQueries({ queryKey: ["op-etapas-table"] });
    qc.invalidateQueries({ queryKey: ["op-etapa", row.etapa_id] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar {row.supplier?.name ?? "fornecedor"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Papel</Label>
            <RadioGroup value={role} onValueChange={(v) => setRole(v as any)} className="flex gap-3">
              <Label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <RadioGroupItem value="principal" /> Principal
              </Label>
              <Label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <RadioGroupItem value="secundario" /> Secundário
              </Label>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Valor decidido (€)</Label>
              <Input type="number" step="0.01" value={decidedAmount} onChange={(e) => setDecidedAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">IVA</Label>
              <Select value={ivaRate} onValueChange={setIvaRate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IVA_OPTS.map((i) => <SelectItem key={i} value={String(i)}>{i}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-2 border-t space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Contacto operacional no terreno</p>
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Telefone</Label>
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+351 9XX XXX XXX" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Função</Label>
                <Input value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "A guardar..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
