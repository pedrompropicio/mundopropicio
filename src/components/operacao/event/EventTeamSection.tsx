import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserPlus, Users, MoreVertical, Crown, Eye, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NewProfileInlineDialog, NEW_PROFILE_SENTINEL } from "@/components/operacao/shared/NewProfileInlineDialog";

function initials(n?: string | null) {
  if (!n) return "?";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function EventTeamSection({ eventId, companyId }: { eventId: string; companyId: string }) {
  const { isAdmin, hasPermission } = useAuth();
  const qc = useQueryClient();
  const canManage = isAdmin || hasPermission("manage_operacao_frentes") || hasPermission("manage_operacao_etapas");
  const [addRole, setAddRole] = useState<"director" | "general_producer" | null>(null);
  const [editMember, setEditMember] = useState<any | null>(null);

  const { data: members } = useQuery({
    queryKey: ["event-team", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_team_members")
        .select("id, role, scope, profile_id, profiles:profile_id(id,full_name), zones:event_team_member_zones(zone_id, zone:operacao_frentes(id,name))")
        .eq("event_id", eventId);
      return data ?? [];
    },
  });

  const remove = async (m: any) => {
    if (!confirm(`Remover ${m.profiles?.full_name ?? "membro"}?`)) return;
    const { error } = await supabase.from("event_team_members").delete().eq("id", m.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Removido" });
      qc.invalidateQueries({ queryKey: ["event-team", eventId] });
      qc.invalidateQueries({ queryKey: ["op-hub-setup-counts", eventId] });
    }
  };

  return (
    <Card className="p-5 glass">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Users className="h-4 w-4" /> Equipa do Evento
        </h2>
        {canManage && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setAddRole("director")}>
              <UserPlus className="h-3 w-3 mr-1" /> Diretor
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddRole("general_producer")}>
              <UserPlus className="h-3 w-3 mr-1" /> Produtor Geral
            </Button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground italic mb-2">
        Diretores e Produtores Gerais supervisionam o evento. Produtores de Zona/Serviço são definidos dentro de cada zona/serviço.
      </p>

      <div className="space-y-1.5">
        {(members ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground italic">Sem membros atribuídos.</p>
        )}
        {(members ?? []).map((m: any) => (
          <div key={m.id} className="flex items-center gap-3 p-2 rounded border">
            <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{initials(m.profiles?.full_name)}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{m.profiles?.full_name ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground">
                {m.scope === "zones" && m.zones?.length > 0
                  ? m.zones.map((z: any) => z.zone?.name).filter(Boolean).join(", ")
                  : "Todo o evento"}
              </p>
            </div>
            <Badge variant={m.role === "director" ? "secondary" : "default"} className="gap-1 text-[10px]">
              {m.role === "director" ? <><Eye className="h-3 w-3" /> Diretor</> : <><Crown className="h-3 w-3" /> Produtor Geral</>}
            </Badge>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7">
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditMember(m)}>
                    <Pencil className="h-3 w-3 mr-2" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => remove(m)} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-3 w-3 mr-2" /> Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>

      {addRole && (
        <AddMemberDialog
          eventId={eventId}
          companyId={companyId}
          role={addRole}
          assignedProfileIds={new Set((members ?? []).filter((m: any) => m.role === addRole).map((m: any) => m.profile_id))}
          onClose={() => setAddRole(null)}
        />
      )}

      {editMember && (
        <EditMemberSheet
          eventId={eventId}
          member={editMember}
          onClose={() => setEditMember(null)}
          onRemoved={() => { setEditMember(null); }}
        />
      )}
    </Card>
  );
}

function AddMemberDialog({
  eventId, companyId, role, assignedProfileIds, onClose,
}: { eventId: string; companyId: string; role: "director" | "general_producer"; assignedProfileIds: Set<string>; onClose: () => void }) {
  const { user, isAdmin, hasPermission } = useAuth();
  const qc = useQueryClient();
  const canCreateProfile = isAdmin || hasPermission("manage_users");
  const [profileId, setProfileId] = useState("");
  const [scope, setScope] = useState<"full" | "zones">("full");
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNewProfile, setShowNewProfile] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ["event-team-profiles", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name").eq("company_id", companyId).is("archived_at", null).order("full_name");
      return data ?? [];
    },
  });

  const candidates = (profiles ?? []).filter((p: any) => !assignedProfileIds.has(p.id));
  const roleLabel = role === "director" ? "Diretor" : "Produtor Geral";

  const { data: zones } = useQuery({
    queryKey: ["event-team-zones", eventId],
    enabled: role === "general_producer",
    queryFn: async () => {
      const { data } = await supabase.from("operacao_frentes").select("id,name").eq("event_id", eventId).eq("type", "zone").neq("status", "cancelled").order("name");
      return data ?? [];
    },
  });

  const handleSelect = (v: string) => {
    if (v === NEW_PROFILE_SENTINEL) {
      setShowNewProfile(true);
      return;
    }
    setProfileId(v);
  };

  const submit = async () => {
    if (!profileId || !user) return;
    setSaving(true);
    const effectiveScope = role === "director" ? "full" : scope;
    const { data: inserted, error } = await supabase.from("event_team_members").insert({
      event_id: eventId, company_id: companyId, profile_id: profileId,
      role, scope: effectiveScope, created_by: user.id,
    }).select("id").single();
    if (error || !inserted) {
      setSaving(false);
      const name = candidates.find((p: any) => p.id === profileId)?.full_name ?? "Pessoa";
      if ((error as any)?.code === "23505" || error?.message?.includes("duplicate key")) {
        toast({ title: "Já atribuído", description: `${name} já é ${roleLabel} neste evento.`, variant: "destructive" });
        qc.invalidateQueries({ queryKey: ["event-team", eventId] });
      } else {
        toast({ title: "Erro", description: error?.message ?? "Falha", variant: "destructive" });
      }
      return;
    }
    if (role === "general_producer" && scope === "zones" && zoneIds.length > 0) {
      await supabase.from("event_team_member_zones").insert(
        zoneIds.map((zid) => ({ member_id: inserted.id, zone_id: zid })),
      );
    }
    toast({ title: "Membro adicionado" });
    qc.invalidateQueries({ queryKey: ["event-team", eventId] });
    qc.invalidateQueries({ queryKey: ["op-hub-setup-counts", eventId] });
    setSaving(false);
    onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{role === "director" ? "Adicionar Diretor" : "Adicionar Produtor Geral"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Pessoa</Label>
              <Select value={profileId} onValueChange={handleSelect}>
                <SelectTrigger>
                  <SelectValue placeholder={candidates.length === 0 ? `Todas as pessoas já são ${roleLabel}` : "Escolhe…"} />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                  {canCreateProfile && (
                    <SelectItem value={NEW_PROFILE_SENTINEL} className="text-primary font-medium">
                      + Nova pessoa…
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {candidates.length === 0 && !canCreateProfile && (
                <p className="text-[11px] text-muted-foreground italic mt-1">
                  Todas as pessoas já estão atribuídas como {roleLabel}.
                </p>
              )}
            </div>
            {role === "general_producer" && (
              <>
                <div>
                  <Label>Escopo</Label>
                  <RadioGroup value={scope} onValueChange={(v) => setScope(v as any)} className="space-y-1 mt-1">
                    <Label className="flex items-center gap-2 border rounded p-2 cursor-pointer">
                      <RadioGroupItem value="full" /> <span className="text-sm">Todo o evento</span>
                    </Label>
                    <Label className="flex items-center gap-2 border rounded p-2 cursor-pointer">
                      <RadioGroupItem value="zones" /> <span className="text-sm">Zonas específicas</span>
                    </Label>
                  </RadioGroup>
                </div>
                {scope === "zones" && (
                  <div>
                    <Label>Zonas</Label>
                    <div className="space-y-1 mt-1 max-h-48 overflow-y-auto border rounded p-2">
                      {(zones ?? []).length === 0 && (
                        <p className="text-xs text-muted-foreground italic">Sem zonas no evento.</p>
                      )}
                      {(zones ?? []).map((z: any) => (
                        <label key={z.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={zoneIds.includes(z.id)}
                            onCheckedChange={(c) => setZoneIds((p) => c ? [...p, z.id] : p.filter((x) => x !== z.id))}
                          />
                          {z.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <Button onClick={submit} disabled={saving || !profileId} className="w-full">
              {saving ? "A guardar…" : "Adicionar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showNewProfile && (
        <NewProfileInlineDialog
          companyId={companyId}
          defaultRole={role === "director" ? "viewer" : "producer"}
          invalidateKeys={[["event-team-profiles", companyId]]}
          onClose={() => setShowNewProfile(false)}
          onCreated={(newProfileId) => {
            setProfileId(newProfileId);
            setShowNewProfile(false);
          }}
        />
      )}
    </>
  );
}


function EditMemberSheet({
  eventId, member, onClose, onRemoved,
}: { eventId: string; member: any; onClose: () => void; onRemoved: () => void }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<"full" | "zones">(member.scope === "zones" ? "zones" : "full");
  const [zoneIds, setZoneIds] = useState<string[]>(
    (member.zones ?? []).map((z: any) => z.zone_id).filter(Boolean),
  );
  const [saving, setSaving] = useState(false);

  const { data: zones } = useQuery({
    queryKey: ["event-team-zones", eventId],
    enabled: member.role === "general_producer",
    queryFn: async () => {
      const { data } = await supabase.from("operacao_frentes").select("id,name").eq("event_id", eventId).eq("type", "zone").neq("status", "cancelled").order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    setScope(member.scope === "zones" ? "zones" : "full");
    setZoneIds((member.zones ?? []).map((z: any) => z.zone_id).filter(Boolean));
  }, [member.id]);

  const save = async () => {
    setSaving(true);
    try {
      if (member.role === "general_producer") {
        const { error: uErr } = await supabase.from("event_team_members").update({ scope }).eq("id", member.id);
        if (uErr) throw uErr;
        await supabase.from("event_team_member_zones").delete().eq("member_id", member.id);
        if (scope === "zones" && zoneIds.length > 0) {
          const { error: zErr } = await supabase.from("event_team_member_zones").insert(
            zoneIds.map((zid) => ({ member_id: member.id, zone_id: zid })),
          );
          if (zErr) throw zErr;
        }
      }
      toast({ title: "Atualizado" });
      qc.invalidateQueries({ queryKey: ["event-team", eventId] });
      onClose();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message ?? "Falha", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remover ${member.profiles?.full_name ?? "membro"}?`)) return;
    const { error } = await supabase.from("event_team_members").delete().eq("id", member.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removido" });
    qc.invalidateQueries({ queryKey: ["event-team", eventId] });
    qc.invalidateQueries({ queryKey: ["op-hub-setup-counts", eventId] });
    onRemoved();
  };

  const isDirector = member.role === "director";

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{member.profiles?.full_name ?? "Membro"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="text-xs text-muted-foreground">
            Função: <Badge variant="outline" className="ml-1">{isDirector ? "Diretor" : "Produtor Geral"}</Badge>
          </div>

          {!isDirector && (
            <>
              <div>
                <Label>Escopo</Label>
                <RadioGroup value={scope} onValueChange={(v) => setScope(v as any)} className="space-y-1 mt-1">
                  <Label className="flex items-center gap-2 border rounded p-2 cursor-pointer">
                    <RadioGroupItem value="full" /> <span className="text-sm">Todo o evento</span>
                  </Label>
                  <Label className="flex items-center gap-2 border rounded p-2 cursor-pointer">
                    <RadioGroupItem value="zones" /> <span className="text-sm">Zonas específicas</span>
                  </Label>
                </RadioGroup>
              </div>
              {scope === "zones" && (
                <div>
                  <Label>Zonas</Label>
                  <div className="space-y-1 mt-1 max-h-64 overflow-y-auto border rounded p-2">
                    {(zones ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Sem zonas no evento.</p>
                    )}
                    {(zones ?? []).map((z: any) => (
                      <label key={z.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={zoneIds.includes(z.id)}
                          onCheckedChange={(c) => setZoneIds((p) => c ? [...p, z.id] : p.filter((x) => x !== z.id))}
                        />
                        {z.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2 border-t">
            {!isDirector && (
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving && <Loader2 className="h-3 w-3 mr-2 animate-spin" />} Guardar
              </Button>
            )}
            <Button onClick={remove} variant="destructive" className={isDirector ? "flex-1" : ""}>
              <Trash2 className="h-3 w-3 mr-2" /> Remover
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
