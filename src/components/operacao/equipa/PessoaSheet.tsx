import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Star,
  StarOff,
  X,
  Plus,
  Loader2,
  Archive,
  ArchiveRestore,
  HardHat,
  UserCog,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  removeFrenteLead,
  removeFrenteAuxiliary,
  setPrimaryLead,
} from "@/lib/operacao-frente-lead";
import { FrenteAssociationPicker } from "./FrenteAssociationPicker";

interface Props {
  profileId: string | null;
  eventId: string | null;
  companyId: string;
  open: boolean;
  onClose: () => void;
}

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profile_type: string | null;
  archived_at: string | null;
  is_operacao_only: boolean | null;
};

type FrenteAssoc = {
  team_id: string;
  frente_id: string;
  frente_name: string;
  frente_type: "zone" | "service" | string;
  role_in_frente: "lead" | "auxiliary" | "observer" | string;
  is_primary: boolean;
};

export function PessoaSheet({ profileId, eventId, companyId, open, onClose }: Props) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pessoa-sheet", profileId, eventId],
    enabled: open && !!profileId,
    queryFn: async () => {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, profile_type, archived_at, is_operacao_only")
        .eq("id", profileId!)
        .maybeSingle();
      if (pErr) throw pErr;

      // Frentes da pessoa: se há evento, limitar; senão, todas as do company
      let frentesQuery = supabase
        .from("operacao_frente_team")
        .select(
          "id, frente_id, role_in_frente, operacao_frentes!inner(id, name, type, event_id, current_lead_id, status)",
        )
        .eq("profile_id", profileId!);
      if (eventId) {
        frentesQuery = frentesQuery.eq("operacao_frentes.event_id", eventId);
      }
      const { data: teams, error: tErr } = await frentesQuery;
      if (tErr) throw tErr;

      const assoc: FrenteAssoc[] = (teams ?? [])
        .filter((r: any) => r.operacao_frentes?.status !== "cancelled")
        .map((r: any) => ({
          team_id: r.id,
          frente_id: r.frente_id,
          frente_name: r.operacao_frentes?.name ?? "—",
          frente_type: r.operacao_frentes?.type ?? "zone",
          role_in_frente: r.role_in_frente,
          is_primary: r.operacao_frentes?.current_lead_id === profileId,
        }));

      return { profile: profile as Profile, assoc };
    },
  });

  useEffect(() => {
    if (data?.profile) {
      setFullName(data.profile.full_name ?? "");
      setPhone(data.profile.phone ?? "");
    }
  }, [data?.profile?.id]);

  const profile = data?.profile;
  const leads = (data?.assoc ?? []).filter((a) => a.role_in_frente === "lead");
  const auxs = (data?.assoc ?? []).filter((a) => a.role_in_frente === "auxiliary");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pessoa-sheet"] });
    qc.invalidateQueries({ queryKey: ["equipa-pessoas-list"] });
    qc.invalidateQueries({ queryKey: ["operacao-frentes"] });
    qc.invalidateQueries({ queryKey: ["equipa-evento"] });
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
        .eq("id", profile.id);
      if (error) throw error;
      toast({ title: "Pessoa atualizada" });
      invalidate();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSetPrimary = async (frenteId: string) => {
    const { error } = await setPrimaryLead({ frenteId, profileId: profile!.id });
    if (error) {
      toast({ title: "Erro", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Marcada como primária" });
    invalidate();
  };

  const handleRemoveLead = async (frenteId: string) => {
    const { error } = await removeFrenteLead({ frenteId, profileId: profile!.id });
    if (error) {
      toast({ title: "Erro", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Produtor removido (passou a auxiliar)" });
    invalidate();
  };

  const handleRemoveAux = async (frenteId: string) => {
    const { error } = await removeFrenteAuxiliary({ frenteId, profileId: profile!.id });
    if (error) {
      toast({ title: "Erro", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Auxiliar removido" });
    invalidate();
  };

  const toggleArchive = async () => {
    if (!profile) return;
    const archived = !!profile.archived_at;
    const { error } = await supabase
      .from("profiles")
      .update({ archived_at: archived ? null : new Date().toISOString() })
      .eq("id", profile.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: archived ? "Restaurado" : "Arquivado" });
    invalidate();
  };

  const renderAssocRow = (a: FrenteAssoc, isLead: boolean) => (
    <div key={a.team_id} className="flex items-center gap-2 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{a.frente_name}</div>
        <Badge variant="outline" className="text-[10px] mt-0.5">
          {a.frente_type === "zone" ? "Zona" : "Serviço"}
        </Badge>
      </div>
      {isLead && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => handleSetPrimary(a.frente_id)}
          title={a.is_primary ? "Primária" : "Marcar como primária"}
          disabled={a.is_primary}
        >
          {a.is_primary ? (
            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
          ) : (
            <StarOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive"
        onClick={() => (isLead ? handleRemoveLead(a.frente_id) : handleRemoveAux(a.frente_id))}
        title="Remover"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  const isFieldStaff = profile?.profile_type === "field_staff";

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {isFieldStaff ? <HardHat className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
              Pessoa
            </SheetTitle>
          </SheetHeader>

          {isLoading || !profile ? (
            <div className="py-10 text-center text-sm text-muted-foreground">A carregar…</div>
          ) : (
            <div className="space-y-5 mt-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant={isFieldStaff ? "secondary" : "default"} className="text-[10px]">
                    {isFieldStaff ? "Staff de Campo" : "Produtor"}
                  </Badge>
                  {profile.archived_at && (
                    <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                      Arquivado
                    </Badge>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Nome</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input value={profile.email ?? ""} readOnly disabled className="bg-muted/50" />
                </div>
                <div>
                  <Label className="text-xs">Telefone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+351 …" />
                </div>
                <Button onClick={saveProfile} disabled={savingProfile} size="sm" className="w-full">
                  {savingProfile && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                  Guardar alterações
                </Button>
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Zonas e Serviços — Produtor
                  </h4>
                </div>
                {leads.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sem associações como produtor.</p>
                ) : (
                  <div className="divide-y border rounded-md px-3">
                    {leads.map((a) => renderAssocRow(a, true))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Zonas e Serviços — Auxiliar
                  </h4>
                </div>
                {auxs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Sem associações como auxiliar.</p>
                ) : (
                  <div className="divide-y border rounded-md px-3">
                    {auxs.map((a) => renderAssocRow(a, false))}
                  </div>
                )}
              </div>

              {eventId ? (
                <Button variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Associar a zona/serviço
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground italic text-center">
                  Escolhe um evento na barra de topo para associar a zonas/serviços.
                </p>
              )}

              <Separator />

              <div className="pt-2">
                {isFieldStaff ? (
                  <Button variant="outline" className="w-full" onClick={toggleArchive}>
                    {profile.archived_at ? (
                      <>
                        <ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4 mr-2" /> Arquivar
                      </>
                    )}
                  </Button>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Gestão de conta e permissões no Admin do Sistema.
                  </p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {eventId && profile && (
        <FrenteAssociationPicker
          eventId={eventId}
          profileId={profile.id}
          companyId={companyId}
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
