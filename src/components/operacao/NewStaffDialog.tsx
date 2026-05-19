import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (profileId: string) => void;
}

export function NewStaffDialog({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setFullName(""); setPhone(""); setEmail(""); };

  const submit = async () => {
    if (!fullName.trim() || !phone.trim()) {
      toast({ title: "Nome e telefone obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-staff", {
        body: { full_name: fullName.trim(), phone: phone.trim(), email: email.trim() || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const newId = (data as any).profile_id;
      if ((data as any).twilio_error) {
        toast({ title: "Staff criado", description: "Falha no WhatsApp — reenvia manualmente." });
      } else {
        toast({ title: "Convite enviado por WhatsApp" });
      }
      qc.invalidateQueries({ queryKey: ["op-staff-list"] });
      reset();
      onCreated?.(newId);
      onClose();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Staff de Campo</DialogTitle>
          <DialogDescription>
            Cria conta de produção. Recebe link por WhatsApp para entrar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label>Telefone (com prefixo)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+351 9XX XXX XXX" />
          </div>
          <div>
            <Label>Email (opcional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "A criar…" : "Criar e enviar convite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
