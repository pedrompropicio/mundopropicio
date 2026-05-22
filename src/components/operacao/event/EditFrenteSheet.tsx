import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { Trash2, Plus, Crown, Search } from "lucide-react";
import { frenteLabel } from "@/lib/operacao-labels";
import { addFrenteLead, removeFrenteLead, setPrimaryLead } from "@/lib/operacao-frente-lead";
import { NewProfileInlineDialog } from "@/components/operacao/shared/NewProfileInlineDialog";

function initials(n?: string | null) {
  if (!n) return "?";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

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
  const [saving, setSaving] = useState(false);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  useEffect(() => {
    if (!frente) return;
    setName(frente.name ?? "");
    setColor(frente.color ?? PALETTE[5]);
    setType((frente.type as any) === "service" ? "service" : "zone");
  }, [frente?.id]);

  // Equipa actual de leads (multi-produtor)
  const { data: leads } = useQuery({
    queryKey: ["op-edit-frente-leads", frenteId],
    enabled: !!frenteId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frente_team")
        .select("profile_id, role_in_frente, is_permanent_lead, active, profiles:profile_id(id,full_name)")
        .eq("frente_id", frenteId!)
        .eq("role_in_frente", "lead")
        .eq("active", true);
      return data ?? [];
    },
  });

  // Profiles candidatos (roles elegíveis)
  const { data: profiles } = useQuery({
    queryKey: ["op-edit-frente-profiles", frente?.company_id],
    enabled: !!frente?.company_id,
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", frente!.company_id)
        .in("role", ELIGIBLE_LEAD_ROLES as any);
      const eligibleIds = new Set((roleRows ?? []).map((r: any) => r.user_id));
      const ids = Array.from(eligibleIds);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("company_id", frente!.company_id)
        .is("archived_at", null)
        .in("id", ids)
        .order("full_name");
      return data ?? [];
    },
  });

  const leadIds = new Set((leads ?? []).map((l: any) => l.profile_id));
  const candidates = (profiles ?? [])
    .filter((p: any) => !leadIds.has(p.id))
    .filter((p: any) => pickerSearch ? (p.full_name ?? "").toLowerCase().includes(pickerSearch.toLowerCase()) : true);

  const leadFieldLabel = type === "service" ? "Produtores de Serviço" : "Produtores de Zona";

  const invalidateLeads = () => {
    qc.invalidateQueries({ queryKey: ["op-edit-frente-leads", frenteId] });
    qc.invalidateQueries({ queryKey: ["op-edit-frente", frenteId] });
    qc.invalidateQueries({ queryKey: ["op-hub-frentes"] });
  };

  const handleAdd = async (profileId: string) => {
    if (!frente) return;
    const { error } = await addFrenteLead({ frenteId: frente.id, profileId, companyId: frente.company_id });
    if (error) return toast({ title: "Erro", description: error, variant: "destructive" });
    invalidateLeads();
    setPickerOpen(false);
    setPickerSearch("");
  };

  const handleRemove = async (profileId: string) => {
    if (!frente) return;
    const { error } = await removeFrenteLead({ frenteId: frente.id, profileId });
    if (error) return toast({ title: "Erro", description: error, variant: "destructive" });
    invalidateLeads();
  };

  const handleSetPrimary = async (profileId: string) => {
    if (!frente) return;
    const { error } = await setPrimaryLead({ frenteId: frente.id, profileId });
    if (error) return toast({ title: "Erro", description: error, variant: "destructive" });
    invalidateLeads();
  };

  const save = async () => {
    if (!frente || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("operacao_frentes").update({
      name: name.trim(), color, type,
    }).eq("id", frente.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
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
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{leadFieldLabel}</Label>
                {canManage && (
                  <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7">
                        <Plus className="h-3 w-3 mr-1" /> Adicionar produtor
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2" align="end">
                      <div className="relative mb-2">
                        <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                        <Input
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                          placeholder="Procurar..."
                          className="h-7 pl-7 text-xs"
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {candidates.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-3 text-center">Sem candidatos</p>
                        )}
                        {candidates.map((p: any) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleAdd(p.id)}
                            className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs rounded"
                          >
                            {p.full_name}
                          </button>
                        ))}
                        {canCreateProfile && (
                          <button
                            type="button"
                            onClick={() => { setPickerOpen(false); setShowNewProfile(true); }}
                            className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs rounded text-primary font-medium border-t mt-1"
                          >
                            + Nova pessoa…
                          </button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="space-y-1">
                {(leads ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic px-1">Sem produtores atribuídos.</p>
                )}
                {(leads ?? []).map((l: any) => {
                  const isPrimary = l.profile_id === frente.current_lead_id;
                  return (
                    <div key={l.profile_id} className="flex items-center gap-2 p-2 rounded border bg-card">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px]">{initials(l.profiles?.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate flex items-center gap-1.5">
                          {l.profiles?.full_name ?? "—"}
                          {isPrimary && <Crown className="h-3 w-3 text-amber-500 fill-amber-500" />}
                        </p>
                      </div>
                      {isPrimary ? (
                        <Badge variant="default" className="text-[10px]">Primário</Badge>
                      ) : canManage ? (
                        <Button
                          size="sm" variant="ghost" className="h-7 text-[11px]"
                          onClick={() => handleSetPrimary(l.profile_id)}
                        >
                          Tornar primário
                        </Button>
                      ) : null}
                      {canManage && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => handleRemove(l.profile_id)}
                          title="Remover produtor (passa a auxiliar)"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 italic">
                Pode haver vários produtores. Remover passa a pessoa a auxiliar (mantém na equipa).
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
            onCreated={(id) => { void handleAdd(id); setShowNewProfile(false); }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
