import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, HardHat } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  etapaId: string;
  frenteId: string;
  companyId: string;
  frenteLeadId: string | null;
  canEdit: boolean;
}

interface DraftRow {
  profile_id: string;
  full_name: string | null;
  profile_type: string | null;
  role_in_frente: string;
  included: boolean;
  role: "owner" | "helper";
}

function initials(n?: string | null) {
  if (!n) return "?";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function EtapaAssigneeSheet({
  open, onClose, etapaId, frenteId, companyId, frenteLeadId, canEdit,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: team } = useQuery({
    queryKey: ["op-frente-team-full", frenteId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frente_team")
        .select("profile_id, role_in_frente, active, profiles:profile_id(id, full_name, profile_type)")
        .eq("frente_id", frenteId)
        .eq("active", true);
      return data ?? [];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["op-etapa-assignees-edit", etapaId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapa_assignees")
        .select("profile_id, role")
        .eq("etapa_id", etapaId);
      return data ?? [];
    },
  });

  const [draft, setDraft] = useState<DraftRow[]>([]);

  useEffect(() => {
    if (!team) return;
    const existingMap = new Map<string, "owner" | "helper">();
    (existing ?? []).forEach((e: any) => existingMap.set(e.profile_id, e.role));
    const rows: DraftRow[] = team.map((t: any) => ({
      profile_id: t.profile_id,
      full_name: t.profiles?.full_name ?? null,
      profile_type: t.profiles?.profile_type ?? null,
      role_in_frente: t.role_in_frente,
      included: existingMap.has(t.profile_id),
      role: existingMap.get(t.profile_id) ?? "helper",
    }));
    // Ordenar: incluídos primeiro, owner antes
    rows.sort((a, b) => {
      if (a.included !== b.included) return a.included ? -1 : 1;
      if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
    setDraft(rows);
  }, [team, existing]);

  const ownerCount = useMemo(
    () => draft.filter((r) => r.included && r.role === "owner").length,
    [draft],
  );

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const existingMap = new Map<string, "owner" | "helper">();
      (existing ?? []).forEach((e: any) => existingMap.set(e.profile_id, e.role));

      const toInsert: any[] = [];
      const toUpdate: { profile_id: string; role: "owner" | "helper" }[] = [];
      const toDelete: string[] = [];

      for (const r of draft) {
        const had = existingMap.get(r.profile_id);
        if (r.included && !had) {
          toInsert.push({
            etapa_id: etapaId,
            profile_id: r.profile_id,
            role: r.role,
            company_id: companyId,
            created_by_profile_id: user.id,
          });
        } else if (r.included && had && had !== r.role) {
          toUpdate.push({ profile_id: r.profile_id, role: r.role });
        } else if (!r.included && had) {
          toDelete.push(r.profile_id);
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from("operacao_etapa_assignees").insert(toInsert);
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase
          .from("operacao_etapa_assignees")
          .update({ role: u.role })
          .eq("etapa_id", etapaId)
          .eq("profile_id", u.profile_id);
        if (error) throw error;
      }
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("operacao_etapa_assignees")
          .delete()
          .eq("etapa_id", etapaId)
          .in("profile_id", toDelete);
        if (error) throw error;
      }
      toast({ title: "Responsáveis atualizados" });
      qc.invalidateQueries({ queryKey: ["op-etapa-assignees", etapaId] });
      qc.invalidateQueries({ queryKey: ["op-etapa-assignees-list", frenteId] });
      onClose();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Responsáveis da etapa</SheetTitle>
          <SheetDescription>
            {canEdit
              ? "Inclui membros da Zona/Serviço e define o seu papel."
              : "Só o líder da Zona/Serviço pode atribuir responsáveis."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Esta Frente ainda não tem equipa.
            </p>
          )}
          {draft.map((r) => (
            <div
              key={r.profile_id}
              className="flex items-center gap-3 p-2 rounded border"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initials(r.full_name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                  {r.full_name ?? "—"}
                  {r.profile_type === "field_staff" && (
                    <HardHat className="h-3 w-3 text-muted-foreground" />
                  )}
                  {r.profile_id === frenteLeadId && (
                    <Crown className="h-3 w-3 text-amber-500 fill-amber-500" />
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground capitalize">{r.role_in_frente}</p>
              </div>
              {r.included && canEdit && (
                <Select
                  value={r.role}
                  onValueChange={(v) =>
                    setDraft((d) =>
                      d.map((x) =>
                        x.profile_id === r.profile_id ? { ...x, role: v as "owner" | "helper" } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-[100px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Produtor</SelectItem>
                    <SelectItem value="helper">Staff</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {r.included && !canEdit && (
                <Badge variant="secondary" className="text-[10px]">
                  {r.role === "owner" ? "Dono" : "Auxiliar"}
                </Badge>
              )}
              <Switch
                checked={r.included}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setDraft((d) =>
                    d.map((x) => (x.profile_id === r.profile_id ? { ...x, included: checked } : x)),
                  )
                }
              />
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="mt-4 flex items-center gap-2">
            <p className="text-[11px] text-muted-foreground flex-1">
              {ownerCount === 0
                ? "Sem dono — fica responsável herdado"
                : `${ownerCount} dono${ownerCount > 1 ? "s" : ""}`}
            </p>
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "A guardar…" : "Guardar"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
