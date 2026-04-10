import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function ReimbursementNoteFormModal({ onClose, onCreated }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-collaborators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, category")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedSupplier = suppliers.find((s: any) => s.id === supplierId);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSupplier) throw new Error("Selecione um funcionário/fornecedor");
      const { data, error } = await supabase
        .from("reimbursement_notes")
        .insert({
          employee_name: selectedSupplier.name,
          supplier_id: supplierId,
          notes: notes.trim() || null,
          created_by: user?.email || "system",
          code: "", // trigger will generate
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["reimbursement-notes"] });
      toast({ title: "Nota de reembolso criada" });
      onCreated(id);
    },
    onError: (err: any) => toast({ title: "Erro ao criar", description: err.message, variant: "destructive" }),
  });

  const supplierOptions = suppliers.map((s: any) => ({
    value: s.id,
    label: `${s.name}${s.category ? ` (${s.category})` : ""}`,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass w-full max-w-md rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nova Nota de Reembolso</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Funcionário / Beneficiário *</Label>
            <SearchableSelect
              options={supplierOptions}
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder="Selecionar funcionário…"
              searchPlaceholder="Pesquisar fornecedor…"
            />
            <p className="text-[10px] text-muted-foreground">
              O funcionário deve estar cadastrado como fornecedor. Recomenda-se a categoria "Colaborador".
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas opcionais…"
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={!supplierId || createMutation.isPending}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Criar
          </Button>
        </div>
      </div>
    </div>
  );
}
