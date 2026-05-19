import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { toast } from "@/hooks/use-toast";

const IVA_OPTS = [0, 6, 13, 23];

interface Props {
  etapaId: string;
  onClose: () => void;
}

export function AddSupplierToEtapaDialog({ etapaId, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [supplierId, setSupplierId] = useState("");
  const [role, setRole] = useState<"principal" | "secundario">("principal");
  const [decidedAmount, setDecidedAmount] = useState("");
  const [ivaRate, setIvaRate] = useState<string>("23");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);

  const { data: suppliers } = useQuery({
    queryKey: ["op-etapa-add-suppliers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id,name")
        .eq("is_active", true)
        .order("name")
        .limit(2000);
      return data ?? [];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["op-etapa-suppliers-existing", etapaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapa_suppliers")
        .select("supplier_id")
        .eq("etapa_id", etapaId);
      return new Set((data ?? []).map((r: any) => r.supplier_id));
    },
  });

  const filteredSuppliers = useMemo(
    () => (suppliers ?? []).filter((s: any) => !existing?.has(s.id)),
    [suppliers, existing],
  );

  const submit = async () => {
    if (!supplierId) {
      toast({ title: "Selecciona um fornecedor", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("operacao_etapa_suppliers").insert({
      etapa_id: etapaId,
      supplier_id: supplierId,
      role,
      decided_amount: decidedAmount ? Number(decidedAmount) : null,
      iva_rate: decidedAmount ? Number(ivaRate) : null,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_role: contactRole.trim() || null,
      contact_email: contactEmail.trim() || null,
      created_by: user?.id ?? null,
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fornecedor adicionado" });
    qc.invalidateQueries({ queryKey: ["op-etapa-suppliers", etapaId] });
    qc.invalidateQueries({ queryKey: ["op-etapas-table"] });
    qc.invalidateQueries({ queryKey: ["op-etapa", etapaId] });
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar fornecedor à etapa</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Fornecedor</Label>
              <Select value={supplierId} onValueChange={(v) => {
                if (v === "__new__") setNewSupplierOpen(true);
                else setSupplierId(v);
              }}>
                <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                <SelectContent>
                  {filteredSuppliers.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                  <SelectItem value="__new__" className="text-primary">+ Novo fornecedor</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                <Input
                  type="number" step="0.01" placeholder="opcional"
                  value={decidedAmount} onChange={(e) => setDecidedAmount(e.target.value)}
                />
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
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="ex: João Silva" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Telefone</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+351 9XX XXX XXX" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Função</Label>
                  <Input value={contactRole} onChange={(e) => setContactRole(e.target.value)} placeholder="Coord. Montagem" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="opcional" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || !supplierId}>
              {saving ? "A guardar..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {newSupplierOpen && (
        <SupplierFormModal
          open={newSupplierOpen}
          onOpenChange={setNewSupplierOpen}
          onCreated={(id) => {
            setSupplierId(id);
            setNewSupplierOpen(false);
            qc.invalidateQueries({ queryKey: ["op-etapa-add-suppliers"] });
          }}
        />
      )}
    </>
  );
}
