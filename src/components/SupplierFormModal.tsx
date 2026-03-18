import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";

interface SupplierFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}

export function SupplierFormModal({ open, onOpenChange, onCreated }: SupplierFormModalProps) {
  const [categoryValue, setCategoryValue] = useState("");
  const queryClient = useQueryClient();

  const { data: accountCategories = [] } = useQuery({
    queryKey: ["account_categories_expense"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("id, name, code, type, parent_id")
        .eq("is_active", true)
        .eq("type", "expense")
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const categoryOptions = accountCategories.map(c => ({
    value: c.name,
    label: `${c.code} - ${c.name}`,
  }));

  const createMutation = useMutation({
    mutationFn: async (supplier: {
      name: string; trade_name?: string; nif?: string; contact_name?: string; email?: string;
      phone?: string; address?: string; iban?: string; swift_bic?: string;
      payment_terms?: string; category?: string; notes?: string;
    }) => {
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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name") as string,
      trade_name: (fd.get("trade_name") as string) || undefined,
      nif: (fd.get("nif") as string) || undefined,
      contact_name: (fd.get("contact_name") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      iban: (fd.get("iban") as string) || undefined,
      swift_bic: (fd.get("swift_bic") as string) || undefined,
      payment_terms: (fd.get("payment_terms") as string) || undefined,
      category: (fd.get("category") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg z-[60]">
        <DialogHeader>
          <DialogTitle>Novo Fornecedor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-name">Nome da Entidade *</Label>
              <Input id="sup-name" name="name" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-trade-name">Nome Fantasia</Label>
              <Input id="sup-trade-name" name="trade_name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-nif">NIF</Label>
              <Input id="sup-nif" name="nif" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-category">Categoria</Label>
              <Select name="category">
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
              <Input id="sup-contact" name="contact_name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-email">Email</Label>
              <Input id="sup-email" name="email" type="email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-phone">Telefone</Label>
              <Input id="sup-phone" name="phone" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-payment">Condições pgto</Label>
              <Input id="sup-payment" name="payment_terms" placeholder="ex: 30 dias" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sup-address">Morada</Label>
            <Input id="sup-address" name="address" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sup-iban">IBAN</Label>
              <Input id="sup-iban" name="iban" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-swift">SWIFT/BIC</Label>
              <Input id="sup-swift" name="swift_bic" placeholder="ex: CGDIPTPL" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sup-notes">Notas</Label>
            <Textarea id="sup-notes" name="notes" rows={2} />
          </div>
          <button type="submit" disabled={createMutation.isPending}
            className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {createMutation.isPending ? "A criar…" : "Criar Fornecedor"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
