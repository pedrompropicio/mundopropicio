import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type AppRole, ROLE_LABELS } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const ASSIGNABLE_ROLES: AppRole[] = ["admin", "manager", "producer", "editor", "viewer", "partner"];

export const NEW_PROFILE_SENTINEL = "__new__";

export function NewProfileInlineDialog({
  companyId, defaultRole, onClose, onCreated, invalidateKeys = [],
}: {
  companyId: string;
  defaultRole: AppRole;
  onClose: () => void;
  onCreated: (id: string) => void;
  invalidateKeys?: (string | unknown[])[];
}) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AppRole>(defaultRole);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast({ title: "Nome e email são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email: email.trim(), full_name: fullName.trim(), role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.trim())
        .maybeSingle();
      if (!prof?.id) throw new Error("Perfil criado mas não encontrado");

      if (phone.trim()) {
        await supabase.from("profiles").update({ phone: phone.trim() }).eq("id", prof.id);
      }

      toast({
        title: data?.status === "attached" ? "Pessoa adicionada à empresa" : "Pessoa criada",
        description: data?.status === "created" ? "Email de definição de senha enviado." : undefined,
      });
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] }));
      qc.invalidateQueries({ queryKey: ["users-with-roles"] });
      onCreated(prof.id);
    } catch (err: any) {
      toast({ title: "Erro a criar pessoa", description: err?.message ?? "Falha", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova pessoa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome completo *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João Silva" />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+351 …" />
          </div>
          <div>
            <Label>Nível de acesso</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={saving} className="w-full">
            {saving && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
            Criar e seleccionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
