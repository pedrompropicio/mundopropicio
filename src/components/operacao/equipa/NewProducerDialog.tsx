import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (profileId: string) => void;
}

/**
 * Cadastra um Produtor Operação: role 'producer' + is_operacao_only=true.
 * Para gestão completa de conta/permissões usar /admin.
 */
export function NewProducerDialog({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast({ title: "Nome e email são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: email.trim(),
          full_name: fullName.trim(),
          role: "producer",
          is_operacao_only: true,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();

      if (prof?.id && phone.trim()) {
        await supabase.from("profiles").update({ phone: phone.trim() }).eq("id", prof.id);
      }

      toast({
        title:
          (data as any)?.status === "attached"
            ? "Produtor adicionado à empresa"
            : "Produtor criado",
        description:
          (data as any)?.status === "created"
            ? "Email de definição de senha enviado."
            : undefined,
      });
      qc.invalidateQueries({ queryKey: ["equipa-pessoas-list"] });
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
      setFullName("");
      setEmail("");
      setPhone("");
      if (prof?.id) onCreated?.(prof.id);
      onClose();
    } catch (e: any) {
      toast({ title: "Erro a criar produtor", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar produtor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome completo *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João Silva" />
          </div>
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+351 …" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Esta pessoa terá acesso apenas ao módulo Operação. Para conceder acesso a outros
            módulos (BP, Audience, etc.) cria a partir do Admin do Sistema.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
            Convidar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
