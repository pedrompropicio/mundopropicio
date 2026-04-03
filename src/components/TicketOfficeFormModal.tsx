import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  office: any | null;
  onClose: () => void;
}

export function TicketOfficeFormModal({ office, onClose }: Props) {
  const isEditing = !!office;
  const queryClient = useQueryClient();

  const [name, setName] = useState(office?.name ?? "");
  const [contactName, setContactName] = useState(office?.contact_name ?? "");
  const [email, setEmail] = useState(office?.email ?? "");
  const [phone, setPhone] = useState(office?.phone ?? "");
  const [notes, setNotes] = useState(office?.notes ?? "");
  const [isActive, setIsActive] = useState(office?.is_active ?? true);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome é obrigatório");

      if (isEditing) {
        const { error } = await supabase
          .from("ticket_offices")
          .update({
            name: name.trim(),
            contact_name: contactName.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
            notes: notes.trim() || null,
            is_active: isActive,
          })
          .eq("id", office.id);
        if (error) throw error;
      } else {
        // Create financial account first
        const { data: account, error: accError } = await supabase
          .from("financial_accounts")
          .insert({
            name: `Bilheteira: ${name.trim()}`,
            type: "ticket_office",
            description: `Conta de movimentação da bilheteira ${name.trim()}`,
            initial_balance: 0,
          })
          .select()
          .single();
        if (accError) throw accError;

        // Create ticket office linked to the account
        const { error } = await supabase
          .from("ticket_offices")
          .insert({
            name: name.trim(),
            contact_name: contactName.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
            notes: notes.trim() || null,
            is_active: isActive,
            financial_account_id: account.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_offices"] });
      queryClient.invalidateQueries({ queryKey: ["financial_accounts"] });
      toast.success(isEditing ? "Bilheteira atualizada" : "Bilheteira criada");
      onClose();
    },
    onError: (err: any) => {
      toast.error("Erro", { description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Bilheteira" : "Nova Bilheteira"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="to-name">Nome *</Label>
            <Input id="to-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Ticketline" />
          </div>
          <div>
            <Label htmlFor="to-contact">Contacto</Label>
            <Input id="to-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nome do contacto" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="to-email">Email</Label>
              <Input id="to-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to-phone">Telefone</Label>
              <Input id="to-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="to-notes">Notas</Label>
            <Textarea id="to-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="to-active" />
            <Label htmlFor="to-active">Ativa</Label>
          </div>
        </div>

        <DialogFooter>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? "A guardar…" : isEditing ? "Guardar" : "Criar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
