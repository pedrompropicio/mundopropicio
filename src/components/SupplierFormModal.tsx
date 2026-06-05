import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supplierSchema, validateForm } from "@/lib/validations";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit, getAuditUser } from "@/lib/audit";
import { cn } from "@/lib/utils";
import { IbanWarning } from "@/components/IbanWarning";

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
  defaultIsPartner?: boolean;
  overlayClassName?: string;
  contentClassName?: string;
}

export function SupplierFormModal({ open, onOpenChange, onCreated, editingSupplier, defaultIsPartner, overlayClassName, contentClassName }: SupplierFormModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEditing = !!editingSupplier;
  const [iban1, setIban1] = useState<string>(editingSupplier?.iban ?? "");
  const [iban2, setIban2] = useState<string>(editingSupplier?.iban_2 ?? "");
  const [iban3, setIban3] = useState<string>(editingSupplier?.iban_3 ?? "");

  const createMutation = useMutation({
    mutationFn: async (supplier: Record<string, any>) => {
      const { data, error } = await supabase.from("suppliers").insert(supplier as any).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-active"] });
      onOpenChange(false);
      toast.success("Fornecedor criado com sucesso");
      onCreated?.(data.id);
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      const code = String(err?.code ?? "");
      if (msg.includes("suppliers_company_name_unique") || msg.includes("suppliers_name_unique")) {
        toast.error("Já existe um fornecedor/parceiro com este nome nesta empresa");
      } else if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
        toast.error("Sem permissão para criar fornecedores", {
          description: "A tua role não tem permissão. Pede a um admin/manager.",
        });
      } else if (code === "P0001" && /company_id/i.test(msg)) {
        toast.error("Empresa ativa não definida", {
          description: "Seleciona a empresa no canto superior antes de criar o fornecedor.",
        });
      } else if (code === "23503") {
        toast.error("Referência inválida", { description: msg });
      } else {
        toast.error("Erro ao criar fornecedor", { description: msg || code || "Erro desconhecido" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (supplier: Record<string, any>) => {
      // Track IBAN/SWIFT changes for audit
      const bankFields = ["iban", "swift_bic", "iban_2", "swift_bic_2", "iban_3", "swift_bic_3"];
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
      iban_2: (fd.get("iban_2") as string) || null,
      swift_bic_2: (fd.get("swift_bic_2") as string) || null,
      iban_3: (fd.get("iban_3") as string) || null,
      swift_bic_3: (fd.get("swift_bic_3") as string) || null,
      payment_terms: (fd.get("payment_terms") as string) || null,
      category: (fd.get("category") as string) || null,
      notes: (fd.get("notes") as string) || null,
      is_partner: fd.get("is_partner") === "on",
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
      <DialogContent overlayClassName={overlayClassName ?? "z-[60]"} className={cn("max-h-[90vh] overflow-y-auto sm:max-w-lg", contentClassName ?? "z-[61]")}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Fornecedor / Parceiro" : "Novo Fornecedor / Parceiro"}</DialogTitle>
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
            {!defaultIsPartner && (
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
            )}
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
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Dados Bancários (até 3 IBANs)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sup-iban">IBAN 1</Label>
                <Input id="sup-iban" name="iban" value={iban1} onChange={(e) => setIban1(e.target.value)} />
                <IbanWarning value={iban1} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sup-swift">SWIFT/BIC 1</Label>
                <Input id="sup-swift" name="swift_bic" placeholder="ex: CGDIPTPL" defaultValue={s?.swift_bic ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sup-iban-2">IBAN 2</Label>
                <Input id="sup-iban-2" name="iban_2" value={iban2} onChange={(e) => setIban2(e.target.value)} />
                <IbanWarning value={iban2} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sup-swift-2">SWIFT/BIC 2</Label>
                <Input id="sup-swift-2" name="swift_bic_2" placeholder="ex: CGDIPTPL" defaultValue={s?.swift_bic_2 ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sup-iban-3">IBAN 3</Label>
                <Input id="sup-iban-3" name="iban_3" value={iban3} onChange={(e) => setIban3(e.target.value)} />
                <IbanWarning value={iban3} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sup-swift-3">SWIFT/BIC 3</Label>
                <Input id="sup-swift-3" name="swift_bic_3" placeholder="ex: CGDIPTPL" defaultValue={s?.swift_bic_3 ?? ""} />
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sup-notes">Notas</Label>
            <Textarea id="sup-notes" name="notes" rows={2} defaultValue={s?.notes ?? ""} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="sup-is-partner" name="is_partner" defaultChecked={s?.is_partner ?? defaultIsPartner ?? false} className="h-4 w-4 rounded border-border" />
            <Label htmlFor="sup-is-partner" className="cursor-pointer">Parceiro / Sócio (não aparece nos relatórios de fornecedores)</Label>
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
