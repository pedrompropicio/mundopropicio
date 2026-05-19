import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { frenteLabel } from "@/lib/operacao-labels";
import { setFrenteLead } from "@/lib/operacao-frente-lead";
import { NewProfileInlineDialog, NEW_PROFILE_SENTINEL } from "@/components/operacao/shared/NewProfileInlineDialog";

const PALETTE = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#6b7280"];
const ELIGIBLE_LEAD_ROLES = ["platform_admin", "admin", "manager", "producer"];

export function EditFrenteSheet({
  frenteId, open, onClose, onChanged,
}: { frenteId: string | null; open: boolean; onClose: () => void; onChanged?: () => void }) {
  const qc = useQueryClient();
  const { isAdmin, hasPermission } = useAuth();
  const canManage = isAdmin || hasPermission("manage_operacao_frentes");
  const canCreateProfile = isAdmin || hasPermission("manage_users");

  const { data: frente } = useQuery({
    queryKey: ["op-edit-frente", frenteId],
    enabled: !!frenteId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color,type,current_lead_id,event_id,company_id")
        .eq("id", frenteId!).maybeSingle();
      return data;
    },
  });

  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[5]);
  const [type, setType] = useState<"zone" | "service">("zone");
  const [leadId, setLeadId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [showNewProfile, setShowNewProfile] = useState(false);

  useEffect(() => {
    if (!frente) return;
    setName(frente.name ?? "");
    setColor(frente.color ?? PALETTE[5]);
    setType((frente.type as any) === "service" ? "service" : "zone");
    setLeadId(frente.current_lead_id ?? "");
  }, [frente?.id]);

  // Profiles filtrados por roles elegíveis (admin/manager/producer)
  const { data: profiles } = useQuery({
    queryKey: ["op-edit-frente-profiles", frente?.company_id],
    enabled: !!frente?.company_id,
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", frente!.company_id)
        .in("role", ELIGIBLE_LEAD_ROLES as any);
      const eligibleIds = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
      if (eligibleIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("company_id", frente!.company_id)
        .is("archived_at", null)
        .in("id", eligibleIds)
        .order("full_name");
      return data ?? [];
    },
  });

  const leadFieldLabel = type === "service" ? "Produtor de Serviço" : "Produtor de Zona";

  const handleLeadSelect = (v: string) => {
    if (v === NEW_PROFILE_SENTINEL) { setShowNewProfile(true); return; }
    if (v === "__none__") { setLeadId(""); return; }
    setLeadId(v);
  };

  const save = async () => {
    if (!frente || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("operacao_frentes").update({
      name: name.trim(), color, type,
    }).eq("id", frente.id);
    if (error) {
      setSaving(false);
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    // (helper já importado no topo do ficheiro)
    const { error: leadErr } = await setFrenteLead({
      frenteId: frente.id,
      profileId: leadId || null,
      companyId: frente.company_id,
    });
    if (leadErr) {
      setSaving(false);
      toast({ title: "Erro a atribuir produtor", description: leadErr, variant: "destructive" });
      return;
    }

    setSaving(false);
    toast({ title: "Atualizado" });
    qc.invalidateQueries({ queryKey: ["op-hub-frentes"] });
    qc.invalidateQueries({ queryKey: ["op-hub-setup-counts"] });
    qc.invalidateQueries({ queryKey: ["op-hub-planning"] });
    qc.invalidateQueries({ queryKey: ["op-edit-frente", frente.id] });
    onChanged?.();
    onClose();
  };

  const remove = async () => {
    if (!frente) return;
    const { count } = await supabase.from("operacao_etapas").select("id", { count: "exact", head: true }).eq("frente_id", frente.id);
    const n = count ?? 0;
    const msg = n > 0
      ? `Esta ${frenteLabel(frente.type).toLowerCase()} tem ${n} etapas que serão eliminadas em cascata. Continuar?`
      : `Eliminar esta ${frenteLabel(frente.type).toLowerCase()}?`;
    if (!confirm(msg)) return;
    setSaving(true);
    const { error } = await supabase.from("operacao_frentes").delete().eq("id", frente.id);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Eliminada" });
    qc.invalidateQueries({ queryKey: ["op-hub-frentes"] });
    qc.invalidateQueries({ queryKey: ["op-hub-setup-counts"] });
    qc.invalidateQueries({ queryKey: ["op-hub-planning"] });
    onChanged?.();
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar {frenteLabel(frente?.type)}</SheetTitle>
        </SheetHeader>
        {!frente ? (
          <p className="text-sm text-muted-foreground mt-4">A carregar…</p>
        ) : (
          <div className="space-y-4 mt-4">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
            </div>
            <div>
              <Label>Tipo</Label>
              <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="flex gap-3 mt-1" disabled={!canManage}>
                <Label className="flex items-center gap-2 border rounded p-2 flex-1 cursor-pointer">
                  <RadioGroupItem value="zone" /> Zona
                </Label>
                <Label className="flex items-center gap-2 border rounded p-2 flex-1 cursor-pointer">
                  <RadioGroupItem value="service" /> Serviço
                </Label>
              </RadioGroup>
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap mt-1">
                {PALETTE.map((c) => (
                  <button key={c} type="button" onClick={() => canManage && setColor(c)}
                    className={"h-7 w-7 rounded-full border-2 " + (color === c ? "border-foreground" : "border-transparent")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div>
              <Label>{leadFieldLabel}</Label>
              <Select value={leadId || "__none__"} onValueChange={handleLeadSelect} disabled={!canManage}>
                <SelectTrigger><SelectValue placeholder="Sem produtor responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem produtor responsável —</SelectItem>
                  {(profiles ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                  {canCreateProfile && (
                    <SelectItem value={NEW_PROFILE_SENTINEL} className="text-primary font-medium">
                      + Nova pessoa…
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1 italic">
                Só admins, managers e producers podem ser produtores responsáveis.
              </p>
            </div>
            <div className="flex gap-2 pt-3 border-t">
              <Button onClick={save} disabled={saving || !canManage || !name.trim()} className="flex-1">
                {saving ? "A guardar…" : "Guardar"}
              </Button>
              {canManage && (
                <Button variant="destructive" size="icon" onClick={remove} disabled={saving} title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {showNewProfile && frente && (
          <NewProfileInlineDialog
            companyId={frente.company_id}
            defaultRole="producer"
            invalidateKeys={[["op-edit-frente-profiles", frente.company_id]]}
            onClose={() => setShowNewProfile(false)}
            onCreated={(id) => { setLeadId(id); setShowNewProfile(false); }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
