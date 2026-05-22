import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EditFrenteSheet } from "@/components/operacao/event/EditFrenteSheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OperacaoStatusBadge } from "@/components/operacao/OperacaoStatusBadge";
import { PriorityBadge } from "@/components/operacao/PriorityBadge";
import { RegistroFeed } from "@/components/operacao/RegistroFeed";
import { EtapaAssigneeAvatars } from "@/components/operacao/EtapaAssigneeAvatars";
import { FrenteTeamSheet } from "@/components/operacao/FrenteTeamSheet";
import { FrenteLeadsAvatars } from "@/components/operacao/shared/FrenteLeadsAvatars";
import { Plus, ChevronRight, ArrowLeft, Users, UserCog } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { NewEtapaDialog } from "@/components/operacao/NewEtapaDialog";
import { RegistroSheet } from "@/components/operacao/RegistroSheet";
import { useOperacaoMode } from "@/hooks/useOperacaoMode";

export default function FrenteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasPermission, isAdmin } = useAuth();
  const [chamadoStatus, setChamadoStatus] = useState<string>("open");
  const [newEtapaOpen, setNewEtapaOpen] = useState(false);
  const [teamSheetOpen, setTeamSheetOpen] = useState(false);
  const [newRegistroOpen, setNewRegistroOpen] = useState(false);
  const [editFrenteOpen, setEditFrenteOpen] = useState(false);
  const queryClient = useQueryClient();
  const canManageFrente = isAdmin || hasPermission("manage_operacao_frentes");

  const { data: frente } = useQuery({
    queryKey: ["op-frente", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("*, lead:profiles!operacao_frentes_current_lead_id_fkey(id,full_name), events(name)")
        .eq("id", id!).maybeSingle();
      return data;
    },
  });

  const { data: etapas } = useQuery({
    queryKey: ["op-etapas", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapas")
        .select("*, supplier:suppliers(name)")
        .eq("frente_id", id!)
        .order("display_order");
      return data ?? [];
    },
  });

  const { data: chamados } = useQuery({
    queryKey: ["op-chamados", id, chamadoStatus],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_registros")
        .select("*, author:profiles!operacao_registros_author_profile_id_fkey(full_name)")
        .eq("frente_id", id!)
        .eq("kind", "chamado")
        .eq("status", chamadoStatus)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const etapaIds = (etapas ?? []).map((e: any) => e.id);
  const { data: assigneesByEtapa } = useQuery({
    queryKey: ["op-etapa-assignees-list", id, etapaIds.join(",")],
    enabled: etapaIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapa_assignees")
        .select("etapa_id, profile_id, role, profiles:profile_id(full_name)")
        .in("etapa_id", etapaIds);
      const map: Record<string, { profile_id: string; full_name: string | null; role: "owner" | "helper" }[]> = {};
      (data ?? []).forEach((a: any) => {
        if (!map[a.etapa_id]) map[a.etapa_id] = [];
        map[a.etapa_id].push({
          profile_id: a.profile_id,
          full_name: a.profiles?.full_name ?? null,
          role: a.role,
        });
      });
      return map;
    },
  });

  const { data: teamSummary } = useQuery({
    queryKey: ["op-frente-team-summary", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frente_team")
        .select("profile_id, role_in_frente, profiles:profile_id(full_name)")
        .eq("frente_id", id!)
        .eq("active", true);
      return data ?? [];
    },
  });

  const isLead = frente?.current_lead_id === user?.id;
  const canManageEtapas = isAdmin || hasPermission("manage_operacao_etapas") || isLead;
  const isInTeam = !!(teamSummary ?? []).find((t: any) => t.profile_id === user?.id);
  const canCreateRegisto = isAdmin || hasPermission("register_operacao") || isLead || isInTeam;
  const mode = useOperacaoMode(frente?.event_id);
  const hasOpenChamados = (chamados ?? []).some((c: any) => c.status === "open" || c.status === "in_progress");
  const showChamadosTab = mode === "evento" || mode === "post" || hasOpenChamados;
  const openChamadosCount = (chamados ?? []).filter((c: any) => c.status === "open" || c.status === "in_progress").length;

  if (!frente) return <div className="p-6">A carregar...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-24">
      <Link to="/operacao/equipa" className="inline-flex items-center text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Link>
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-14 w-2 rounded-full" style={{ backgroundColor: frente.color ?? "#6b7280" }} />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{frente.name}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {(frente as any).events?.name}
            </p>
            {(() => {
              const leads = ((teamSummary ?? []) as any[])
                .filter((t) => t.role_in_frente === "lead")
                .map((t) => ({ profile_id: t.profile_id, full_name: t.profiles?.full_name ?? null }));
              if (leads.length === 0) {
                return <p className="text-xs text-muted-foreground italic mt-0.5">Sem produtor</p>;
              }
              const label = leads.length > 1 ? "Produtores" : "Produtor";
              return (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <FrenteLeadsAvatars
                    leads={leads}
                    currentLeadId={frente.current_lead_id}
                    max={3}
                    size="xs"
                  />
                  <span className="text-xs text-muted-foreground">
                    <span className="text-muted-foreground/70">{label}: </span>
                    {leads.map((l, i) => (
                      <span key={l.profile_id}>
                        {l.full_name ?? "—"}
                        {l.profile_id === frente.current_lead_id && leads.length > 1 && (
                          <Badge variant="default" className="ml-1 text-[9px] h-3.5 px-1">Primário</Badge>
                        )}
                        {i < leads.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })()}
          </div>
          <OperacaoStatusBadge status={frente.status} kind="etapa" />
        </div>
        {canManageFrente && (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setEditFrenteOpen(true)}>
              <UserCog className="h-4 w-4 mr-1.5" /> Gerir produtores
            </Button>
          </div>
        )}
        {teamSummary && teamSummary.length > 0 && (
          <button
            type="button"
            onClick={() => setTeamSheetOpen(true)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Users className="h-3.5 w-3.5" />
            <span>
              {teamSummary.filter((t: any) => t.role_in_frente === "lead" || t.role_in_frente === "auxiliary").length} na equipa
              {teamSummary.filter((t: any) => t.role_in_frente === "observer").length > 0 &&
                ` · ${teamSummary.filter((t: any) => t.role_in_frente === "observer").length} observers`}
            </span>
          </button>
        )}
      </header>

      <Tabs defaultValue="registros">
        <TabsList className={"grid w-full " + (showChamadosTab ? "grid-cols-3" : "grid-cols-2")}>
          <TabsTrigger value="registros">Registos</TabsTrigger>
          <TabsTrigger value="etapas">Etapas</TabsTrigger>
          {showChamadosTab && (
            <TabsTrigger value="chamados" className="gap-1.5">
              Chamados
              {openChamadosCount > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{openChamadosCount}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="registros" className="mt-3 space-y-2">
          {canCreateRegisto && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setNewRegistroOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Novo Registo
              </Button>
            </div>
          )}
          <RegistroFeed filter={{ frente_id: id!, kindNot: "chamado" }} />
        </TabsContent>


        <TabsContent value="etapas" className="space-y-2 mt-3">
          {canManageEtapas && (
            <Button onClick={() => setNewEtapaOpen(true)} className="w-full" size="sm">
              <Plus className="h-4 w-4 mr-2" /> Nova etapa
            </Button>
          )}
          {(etapas ?? []).length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Sem etapas.</p>}
          {(etapas ?? []).map((e: any) => {
            const list = assigneesByEtapa?.[e.id] ?? [];
            const inheritedProfile = list.length === 0
              ? (e.responsible_profile_id
                  ? null /* nome não temos aqui, mostra iniciais via fallback */
                  : frente.current_lead_id
                    ? { id: frente.current_lead_id, full_name: (frente as any).lead?.full_name ?? null }
                    : null)
              : null;
            const inheritedFrom: "responsible" | "frente_lead" | null = list.length === 0
              ? (e.responsible_profile_id ? "responsible" : frente.current_lead_id ? "frente_lead" : null)
              : null;
            return (
              <Link key={e.id} to={`/operacao/etapa/${e.id}`}>
                <Card className="p-3 flex items-center gap-3 active:scale-[0.99]">
                  <EtapaAssigneeAvatars
                    size="sm"
                    assignees={list}
                    inheritedFrom={inheritedFrom}
                    inheritedProfile={inheritedProfile}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.supplier?.name ?? "—"} {e.escopo ? `· ${e.escopo}` : ""}
                    </p>
                  </div>
                  <OperacaoStatusBadge status={e.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Card>
              </Link>
            );
          })}
        </TabsContent>

        {showChamadosTab && (
          <TabsContent value="chamados" className="space-y-2 mt-3">
            <Tabs value={chamadoStatus} onValueChange={setChamadoStatus}>
              <TabsList className="grid grid-cols-4 w-full text-xs">
                <TabsTrigger value="open">Abertos</TabsTrigger>
                <TabsTrigger value="in_progress">Em curso</TabsTrigger>
                <TabsTrigger value="resolved">Resolvidos</TabsTrigger>
                <TabsTrigger value="closed">Fechados</TabsTrigger>
              </TabsList>
            </Tabs>
            {(chamados ?? []).length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Sem chamados.</p>}
            {(chamados ?? []).map((c: any) => (
              <Link key={c.id} to={`/operacao/chamado/${c.id}`}>
                <Card className="p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={c.priority} />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm">{c.text}</p>
                  <p className="text-xs text-muted-foreground">por {c.author?.full_name}</p>
                </Card>
              </Link>
            ))}
          </TabsContent>
        )}
      </Tabs>

      {newEtapaOpen && (
        <NewEtapaDialog
          frenteId={id!}
          companyId={frente.company_id}
          onClose={() => setNewEtapaOpen(false)}
        />
      )}

      {teamSheetOpen && (
        <FrenteTeamSheet
          open={teamSheetOpen}
          onClose={() => setTeamSheetOpen(false)}
          frenteId={id!}
          currentLeadId={frente.current_lead_id}
        />
      )}

      {newRegistroOpen && (
        <RegistroSheet
          open
          initialFrenteId={id!}
          onClose={() => setNewRegistroOpen(false)}
        />
      )}

      <EditFrenteSheet
        frenteId={editFrenteOpen ? id! : null}
        open={editFrenteOpen}
        onClose={() => setEditFrenteOpen(false)}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["op-frente", id] });
          queryClient.invalidateQueries({ queryKey: ["op-frente-team-summary", id] });
        }}
      />
    </div>
  );
}
