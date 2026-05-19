import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UserPlus, Users, X, Crown, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";

function initials(n?: string | null) {
  if (!n) return "?";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function EventTeamSection({ eventId, companyId }: { eventId: string; companyId: string }) {
  const { isAdmin, hasPermission } = useAuth();
  const qc = useQueryClient();
  const canManage = isAdmin || hasPermission("manage_operacao_frentes");
  const [addRole, setAddRole] = useState<"director" | "general_producer" | null>(null);

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

  const remove = async (id: string) => {
    if (!confirm("Remover membro?")) return;
    const { error } = await supabase.from("event_team_members").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Removido" }); qc.invalidateQueries({ queryKey: ["event-team", eventId] }); }
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
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(m.id)}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {addRole && (
        <AddMemberDialog
          eventId={eventId}
          companyId={companyId}
          role={addRole}
          onClose={() => setAddRole(null)}
        />
      )}
    </Card>
  );
}

function AddMemberDialog({
  eventId, companyId, role, onClose,
}: { eventId: string; companyId: string; role: "director" | "general_producer"; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [profileId, setProfileId] = useState("");
  const [scope, setScope] = useState<"full" | "zones">("full");
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ["event-team-profiles", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name").eq("company_id", companyId).is("archived_at", null).order("full_name");
      return data ?? [];
    },
  });

  const { data: zones } = useQuery({
    queryKey: ["event-team-zones", eventId],
    enabled: role === "general_producer",
    queryFn: async () => {
      const { data } = await supabase.from("operacao_frentes").select("id,name").eq("event_id", eventId).eq("type", "zone").neq("status", "cancelled").order("name");
      return data ?? [];
    },
  });

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
      toast({ title: "Erro", description: error?.message ?? "Falha", variant: "destructive" });
      return;
    }
    if (role === "general_producer" && scope === "zones" && zoneIds.length > 0) {
      await supabase.from("event_team_member_zones").insert(
        zoneIds.map((zid) => ({ member_id: inserted.id, zone_id: zid })),
      );
    }
    toast({ title: "Membro adicionado" });
    qc.invalidateQueries({ queryKey: ["event-team", eventId] });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{role === "director" ? "Adicionar Diretor" : "Adicionar Produtor Geral"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Pessoa</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue placeholder="Escolhe…" /></SelectTrigger>
              <SelectContent>
                {(profiles ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
  );
}
