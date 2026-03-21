import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supplierSchema, validateForm } from "@/lib/validations";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";

const supplierCategories = [
  "Som e Iluminação",
  "Palco e Estruturas",
  "Vídeo e LED",
  "Backline e Instrumentos",
  "Catering e Alimentação",
  "Segurança e Controlo de Acessos",
  "Transportes e Logística",
  "Alojamento e Hotelaria",
  "Artistas e Agências",
  "Produção e Técnicos",
  "Marketing e Comunicação",
  "Assessoria de Imprensa",
  "Design e Sinalização",
  "Bilhética e Plataformas",
  "Seguros",
  "Direitos Autorais e Licenças",
  "Decoração e Cenografia",
  "Limpeza e Manutenção",
  "Locação de Espaços",
  "Serviços Jurídicos e Contabilidade",
  "Outro",
];

interface SupplierFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
  editingSupplier?: any;
}

export function SupplierFormModal({ open, onOpenChange, onCreated, editingSupplier }: SupplierFormModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditing = !!editingSupplier;

  const createMutation = useMutation({
    mutationFn: async (supplier: Record<string, any>) => {
      const { data, error } = await supabase.from("suppliers").insert(supplier as any).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      onOpenChange(false);
      toast.success("Fornecedor criado com sucesso");
      onCreated?.(data.id);
    },
    onError: () => toast.error("Erro ao criar fornecedor"),
  });

  const updateMutation = useMutation({
    mutationFn: async (supplier: Record<string, any>) => {
      // Track IBAN/SWIFT changes for audit
      const bankFields = ["iban", "swift_bic"];
      const changedBankFields: Record<string, { old: any; new: any }> = {};
      for (const field of bankFields) {
        const oldVal = editingSupplier?.[field] ?? null;
        const newVal = supplier[field] ?? null;
        if (oldVal !== newVal) {
          changedBankFields[field] = { old: oldVal, new: newVal };
        }
      }

      const { error } = await supabase
        .from("suppliers")
        .update(supplier as any)
        .eq("id", editingSupplier?.id);
      if (error) throw error;

      if (Object.keys(changedBankFields).length > 0) {
        await logAudit({
          entity_type: "supplier",
          entity_id: editingSupplier?.id,
          action: "update_bank_details",
          changed_by: getAuditUser(user),
          old_data: Object.fromEntries(Object.entries(changedBankFields).map(([k, v]) => [k, v.old])),
          new_data: Object.fromEntries(Object.entries(changedBankFields).map(([k, v]) => [k, v.new])),
          metadata: { supplier_name: editingSupplier?.name },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      onOpenChange(false);
      toast.success("Fornecedor atualizado com sucesso");
    },
    onError: () => toast.error("Erro ao atualizar fornecedor"),
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      name: fd.get("name") as string,
      trade_name: (fd.get("trade_name") as string) || null,
      nif: (fd.get("nif") as string) || null,
      contact_name: (fd.get("contact_name") as string) || null,
      email: (fd.get("email") as string) || null,
      phone: (fd.get("phone") as string) || null,
      address: (fd.get("address") as string) || null,
      iban: (fd.get("iban") as string) || null,
      swift_bic: (fd.get("swift_bic") as string) || null,
      payment_terms: (fd.get("payment_terms") as string) || null,
      category: (fd.get("category") as string) || null,
      notes: (fd.get("notes") as string) || null,
    };
    const result = validateForm(supplierSchema, raw);
    if (result.success === false) {
      setValidationErrors(result.errors);
      toast.error("Corrija os erros de validação");
      return;
    }
    setValidationErrors({});
    if (isEditing) {
      updateMutation.mutate(raw);
    } else {
      createMutation.mutate(raw);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const s = editingSupplier;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg z-[60]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-name">Nome da Entidade *</Label>
              <Input id="sup-name" name="name" required defaultValue={s?.name ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-trade-name">Nome Fantasia</Label>
              <Input id="sup-trade-name" name="trade_name" defaultValue={s?.trade_name ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-nif">NIF</Label>
              <Input id="sup-nif" name="nif" defaultValue={s?.nif ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-category">Categoria</Label>
              <Select name="category" defaultValue={s?.category ?? undefined}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {supplierCategories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-contact">Pessoa de contacto</Label>
              <Input id="sup-contact" name="contact_name" defaultValue={s?.contact_name ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-email">Email</Label>
              <Input id="sup-email" name="email" type="email" defaultValue={s?.email ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-phone">Telefone</Label>
              <Input id="sup-phone" name="phone" defaultValue={s?.phone ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-payment">Condições pgto</Label>
              <Input id="sup-payment" name="payment_terms" placeholder="ex: 30 dias" defaultValue={s?.payment_terms ?? ""} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sup-address">Morada</Label>
            <Input id="sup-address" name="address" defaultValue={s?.address ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-iban">IBAN</Label>
              <Input id="sup-iban" name="iban" defaultValue={s?.iban ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-swift">SWIFT/BIC</Label>
              <Input id="sup-swift" name="swift_bic" placeholder="ex: CGDIPTPL" defaultValue={s?.swift_bic ?? ""} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sup-notes">Notas</Label>
            <Textarea id="sup-notes" name="notes" rows={2} defaultValue={s?.notes ?? ""} />
          </div>
          <button type="submit" disabled={isPending}
            className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {isPending ? "A guardar…" : isEditing ? "Guardar Alterações" : "Criar Fornecedor"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
