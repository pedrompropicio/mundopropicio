import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Crown, HardHat, Plus, Trash2, Search, UserPlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { NewStaffDialog } from "@/components/operacao/NewStaffDialog";
import { setPrimaryLead } from "@/lib/operacao-frente-lead";

interface Props {
  frenteId: string;
  companyId: string;
  canEdit: boolean;
}

const ROLES = [
  { value: "lead", label: "Produtor" },
  { value: "auxiliary", label: "Staff" },
  { value: "observer", label: "Observador" },
];

export function FrenteTeamEditor({ frenteId, companyId, canEdit }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [newStaffOpen, setNewStaffOpen] = useState(false);

  const { data: frente } = useQuery({
    queryKey: ["op-frente-team-editor-frente", frenteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("current_lead_id")
        .eq("id", frenteId)
        .maybeSingle();
      return data;
    },
  });

  const { data: team } = useQuery({
    queryKey: ["op-frente-team-editor", frenteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frente_team")
        .select("id,profile_id,role_in_frente,is_permanent_lead,active, profiles:profile_id(id,full_name,profile_type)")
        .eq("frente_id", frenteId)
        .eq("active", true);
      return data ?? [];
    },
  });

  const teamIds = useMemo(() => new Set((team ?? []).map((t: any) => t.profile_id)), [team]);

  const { data: allProfiles } = useQuery({
    queryKey: ["op-frente-team-candidates", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,profile_type")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .order("full_name");
      return data ?? [];
    },
  });

  const candidates = useMemo(
    () =>
      (allProfiles ?? [])
        .filter((p: any) => !teamIds.has(p.id))
        .filter((p: any) =>
          search ? (p.full_name ?? "").toLowerCase().includes(search.toLowerCase()) : true,
        ),
    [allProfiles, teamIds, search],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["op-frente-team-editor", frenteId] });
    qc.invalidateQueries({ queryKey: ["op-frente-team-editor-frente", frenteId] });
  };

  const makePrimary = async (profileId: string) => {
    const { error } = await setPrimaryLead({ frenteId, profileId });
    if (error) toast({ title: "Erro", description: error, variant: "destructive" });
    else invalidate();
  };

  const addMember = async (profileId: string) => {
    const { error } = await supabase.from("operacao_frente_team").insert({
      frente_id: frenteId,
      company_id: companyId,
      profile_id: profileId,
      role_in_frente: "auxiliary",
      active: true,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Membro adicionado" }); invalidate(); }
  };

  const updateRow = async (id: string, patch: { role_in_frente?: string; is_permanent_lead?: boolean }) => {
    const { error } = await supabase.from("operacao_frente_team").update(patch as any).eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else invalidate();
  };

  const removeRow = async (id: string) => {
    const { error } = await supabase.from("operacao_frente_team").update({ active: false }).eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Membro removido" }); invalidate(); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Equipa</h3>
        {canEdit && (
          <div className="flex gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7">
                  <Plus className="h-3 w-3 mr-1" /> Membro
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="end">
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Procurar..."
                    className="h-7 pl-7 text-xs"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {candidates.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-3 text-center">Sem resultados</p>
                  )}
                  {candidates.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addMember(p.id)}
                      className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs rounded flex items-center gap-2"
                    >
                      {p.profile_type === "field_staff" && <HardHat className="h-3 w-3 text-amber-600" />}
                      <span>{p.full_name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setNewStaffOpen(true)}>
              <UserPlus className="h-3 w-3 mr-1" /> Staff
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        {(team ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground italic">Sem membros.</p>
        )}
        {(team ?? []).map((m: any) => {
          const isPrimary = m.profile_id === frente?.current_lead_id;
          const isLead = m.role_in_frente === "lead";
          return (
          <div key={m.id} className="flex items-center gap-2 p-2 rounded border bg-card">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm">
                {isLead && <Crown className={"h-3 w-3 " + (isPrimary ? "text-amber-500 fill-amber-500" : "text-primary")} />}
                {m.profiles?.profile_type === "field_staff" && (
                  <HardHat className="h-3 w-3 text-amber-600" />
                )}
                <span className="truncate">{m.profiles?.full_name ?? "—"}</span>
                {isPrimary && <Badge variant="default" className="text-[9px] h-4 px-1">Primário</Badge>}
              </div>
            </div>
            <Select
              value={m.role_in_frente}
              onValueChange={(v) => updateRow(m.id, { role_in_frente: v })}
              disabled={!canEdit}
            >
              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
              <Checkbox
                checked={!!m.is_permanent_lead}
                onCheckedChange={(c) => updateRow(m.id, { is_permanent_lead: !!c })}
                disabled={!canEdit || !isLead}
              />
              Perm.
            </label>
            {canEdit && isLead && !isPrimary && (
              <Button
                variant="ghost" size="sm" className="h-7 text-[10px] px-2"
                onClick={() => makePrimary(m.profile_id)}
                title="Tornar produtor primário desta frente"
              >
                Tornar 1º
              </Button>
            )}
            {canEdit && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(m.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {newStaffOpen && (
        <NewStaffDialog
          open={newStaffOpen}
          onClose={() => setNewStaffOpen(false)}
          onCreated={(profileId: string) => { void addMember(profileId); }}
        />
      )}
    </div>
  );
}
