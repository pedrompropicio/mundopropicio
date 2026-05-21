import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  UserCog,
  Users,
  ListChecks,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { frenteLabel } from "@/lib/operacao-labels";
import {
  roleEventLabel,
  roleFrenteLabel,
  etapaRoleLabel,
  initialsOf,
} from "@/lib/operacao-equipa-labels";

interface Props {
  eventId: string;
}

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  profile_type: string | null;
  avatar_url: string | null;
};

export function EquipaEventoTab({ eventId }: Props) {
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["equipa-evento", eventId],
    enabled: !!eventId,
    staleTime: 30_000,
    queryFn: async () => {
      // 1) IDs primários (sem nested filters)
      const [evtTeamRes, frentesRes] = await Promise.all([
        supabase
          .from("event_team_members")
          .select("profile_id, role")
          .eq("event_id", eventId),
        supabase
          .from("operacao_frentes")
          .select("id, name, color, type, current_lead_id, status")
          .eq("event_id", eventId)
          .neq("status", "cancelled")
          .order("display_order", { ascending: true }),
      ]);
      if (evtTeamRes.error) throw evtTeamRes.error;
      if (frentesRes.error) throw frentesRes.error;

      const frentes = frentesRes.data ?? [];
      const frenteIds = frentes.map((f: any) => f.id);

      // 2) Etapas + 3) frente_team + 4) assignees (todos via IN)
      let etapas: any[] = [];
      let teamMembers: any[] = [];
      let assignees: any[] = [];

      if (frenteIds.length > 0) {
        const [etapasRes, teamRes] = await Promise.all([
          supabase
            .from("operacao_etapas")
            .select("id, name, frente_id, responsible_profile_id, status, planned_start, planned_end")
            .in("frente_id", frenteIds),
          supabase
            .from("operacao_frente_team")
            .select("profile_id, frente_id, role_in_frente, is_permanent_lead")
            .in("frente_id", frenteIds)
            .eq("active", true),
        ]);
        if (etapasRes.error) throw etapasRes.error;
        if (teamRes.error) throw teamRes.error;
        etapas = etapasRes.data ?? [];
        teamMembers = teamRes.data ?? [];

        const etapaIds = etapas.map((e: any) => e.id);
        if (etapaIds.length > 0) {
          const { data: assignData, error: assignErr } = await supabase
            .from("operacao_etapa_assignees")
            .select("profile_id, etapa_id, role")
            .in("etapa_id", etapaIds);
          if (assignErr) throw assignErr;
          assignees = assignData ?? [];
        }
      }

      // 5) Hidratar profiles
      const profileIds = new Set<string>();
      (evtTeamRes.data ?? []).forEach((r: any) => r.profile_id && profileIds.add(r.profile_id));
      frentes.forEach((f: any) => f.current_lead_id && profileIds.add(f.current_lead_id));
      teamMembers.forEach((t: any) => t.profile_id && profileIds.add(t.profile_id));
      assignees.forEach((a: any) => a.profile_id && profileIds.add(a.profile_id));
      etapas.forEach((e: any) => e.responsible_profile_id && profileIds.add(e.responsible_profile_id));

      const profilesById = new Map<string, ProfileLite>();
      if (profileIds.size > 0) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, email, profile_type, avatar_url")
          .in("id", Array.from(profileIds));
        if (pErr) throw pErr;
        (profs ?? []).forEach((p: any) => profilesById.set(p.id, p));
      }

      return {
        evtTeam: evtTeamRes.data ?? [],
        frentes,
        teamMembers,
        etapas,
        assignees,
        profilesById,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="m-3">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Erro a carregar equipa</AlertTitle>
        <AlertDescription>{(error as any)?.message ?? "Tenta novamente."}</AlertDescription>
      </Alert>
    );
  }

  const { evtTeam, frentes, teamMembers, etapas, assignees, profilesById } = data!;

  const frenteById = new Map(frentes.map((f: any) => [f.id, f]));

  const onClickPessoa = (profileId: string) => {
    navigate(`/operacao/equipa/pessoa/${profileId}?event=${eventId}`);
  };

  // Secção 1 ------------------------------------------------------------
  const evtItems = evtTeam.map((r: any) => ({
    profileId: r.profile_id,
    profile: profilesById.get(r.profile_id),
    badge: roleEventLabel(r.role),
  }));

  // Secção 2 ------------------------------------------------------------
  const produtoresPorFrente = frentes.map((f: any) => ({
    frente: f,
    leadId: f.current_lead_id as string | null,
    leadProfile: f.current_lead_id ? profilesById.get(f.current_lead_id) : undefined,
  }));

  // Secção 3 ------------------------------------------------------------
  // Group team members per frente excluindo leads (current_lead_id ou is_permanent_lead)
  const staffPorFrente = useMemo(() => {
    const map = new Map<string, Array<{ profileId: string; role: string }>>();
    teamMembers.forEach((t: any) => {
      const frente: any = frenteById.get(t.frente_id);
      if (!frente) return;
      const isLead =
        t.is_permanent_lead === true ||
        t.role_in_frente === "lead" ||
        frente.current_lead_id === t.profile_id;
      if (isLead) return;
      const arr = map.get(t.frente_id) ?? [];
      arr.push({ profileId: t.profile_id, role: t.role_in_frente });
      map.set(t.frente_id, arr);
    });
    return map;
  }, [teamMembers, frenteById]);

  // Secção 4 ------------------------------------------------------------
  // Etapas com responsável (responsible_profile_id OU assignees)
  type EtapaItem = {
    etapa: any;
    pessoas: Array<{ profileId: string; role: string }>;
  };
  const etapasComResponsaveis: EtapaItem[] = useMemo(() => {
    const assigneesByEtapa = new Map<string, Array<{ profileId: string; role: string }>>();
    assignees.forEach((a: any) => {
      const arr = assigneesByEtapa.get(a.etapa_id) ?? [];
      arr.push({ profileId: a.profile_id, role: a.role });
      assigneesByEtapa.set(a.etapa_id, arr);
    });
    return etapas
      .map((e: any) => {
        const pessoas = assigneesByEtapa.get(e.id) ?? [];
        if (e.responsible_profile_id) {
          if (!pessoas.some((p) => p.profileId === e.responsible_profile_id)) {
            pessoas.unshift({ profileId: e.responsible_profile_id, role: "owner" });
          }
        }
        return { etapa: e, pessoas };
      })
      .filter((it) => it.pessoas.length > 0);
  }, [etapas, assignees]);

  return (
    <div className="space-y-6 p-3">
      {/* SECÇÃO 1 — Equipa do Evento */}
      <SectionHeader
        icon={<Crown className="h-3.5 w-3.5" />}
        title="Equipa do Evento"
        count={evtItems.length}
      />
      {evtItems.length === 0 ? (
        <EmptyHint>
          Sem produtor geral ou diretor atribuídos. Atribui no Hub do Evento.
        </EmptyHint>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {evtItems.map((it) => (
            <PessoaCard
              key={`evt-${it.profileId}`}
              profile={it.profile}
              profileId={it.profileId}
              badge={it.badge}
              onClick={() => onClickPessoa(it.profileId)}
            />
          ))}
        </div>
      )}

      {/* SECÇÃO 2 — Produtores de Zona/Serviço */}
      <SectionHeader
        icon={<UserCog className="h-3.5 w-3.5" />}
        title="Produtores de Zona/Serviço"
        count={produtoresPorFrente.length}
      />
      {produtoresPorFrente.length === 0 ? (
        <EmptyHint>Sem zonas ou serviços criados.</EmptyHint>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {produtoresPorFrente.map(({ frente, leadId, leadProfile }) => (
            <div
              key={`prod-${frente.id}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                leadId
                  ? onClickPessoa(leadId)
                  : navigate(`/operacao/${eventId}`)
              }
              className={cn(
                "min-h-[44px] rounded-md border p-3 hover:bg-accent/40 transition",
                "cursor-pointer flex items-center gap-3",
              )}
            >
              <span
                className="h-8 w-1 rounded-sm shrink-0"
                style={{ background: frente.color || "hsl(var(--muted-foreground))" }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{frente.name}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {frenteLabel(frente.type)}
                  </Badge>
                </div>
                {leadId && leadProfile ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">
                        {initialsOf(leadProfile.full_name, leadProfile.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">
                      {leadProfile.full_name || leadProfile.email || "—"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1 text-amber-600 text-xs font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Sem produtor atribuído
                  </div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* SECÇÃO 3 — Staff das Zonas/Serviços */}
      <SectionHeader
        icon={<Users className="h-3.5 w-3.5" />}
        title="Staff das Zonas/Serviços"
        count={Array.from(staffPorFrente.values()).reduce((acc, arr) => acc + arr.length, 0)}
      />
      {staffPorFrente.size === 0 ? (
        <EmptyHint>Nenhum staff atribuído às zonas/serviços (além dos produtores).</EmptyHint>
      ) : (
        <div className="space-y-3">
          {frentes
            .filter((f: any) => (staffPorFrente.get(f.id)?.length ?? 0) > 0)
            .map((f: any) => {
              const items = staffPorFrente.get(f.id)!;
              return (
                <Card key={`staff-${f.id}`} className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="h-3 w-3 rounded-sm shrink-0"
                      style={{ background: f.color || "hsl(var(--muted-foreground))" }}
                    />
                    <span className="text-sm font-medium truncate">{f.name}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 ml-auto">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {items.map((it) => (
                      <PessoaCard
                        key={`staff-${f.id}-${it.profileId}`}
                        compact
                        profile={profilesById.get(it.profileId)}
                        profileId={it.profileId}
                        badge={roleFrenteLabel(it.role)}
                        onClick={() => onClickPessoa(it.profileId)}
                      />
                    ))}
                  </div>
                </Card>
              );
            })}
        </div>
      )}

      {/* SECÇÃO 4 — Responsáveis de Etapas */}
      <SectionHeader
        icon={<ListChecks className="h-3.5 w-3.5" />}
        title="Responsáveis de Etapas"
        count={etapasComResponsaveis.length}
      />
      {etapasComResponsaveis.length === 0 ? (
        <EmptyHint>Nenhuma etapa tem responsável atribuído.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {etapasComResponsaveis.map(({ etapa, pessoas }) => {
            const frente: any = frenteById.get(etapa.frente_id);
            return (
              <Card key={`etapa-${etapa.id}`} className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => navigate(`/operacao/etapa/${etapa.id}`)}
                    className="text-sm font-medium hover:underline truncate text-left"
                  >
                    {etapa.name}
                  </button>
                  {frente && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      {frente.name}
                    </Badge>
                  )}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {pessoas.map((p) => (
                    <PessoaCard
                      key={`etapa-${etapa.id}-${p.profileId}-${p.role}`}
                      compact
                      profile={profilesById.get(p.profileId)}
                      profileId={p.profileId}
                      badge={etapaRoleLabel(p.role)}
                      onClick={() => onClickPessoa(p.profileId)}
                    />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- UI bits

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <Badge variant="outline" className="text-[10px] h-4 px-1">
        {count}
      </Badge>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-4 text-xs text-muted-foreground text-center border-dashed">
      {children}
    </Card>
  );
}

function PessoaCard({
  profile,
  profileId,
  badge,
  onClick,
  compact = false,
}: {
  profile?: ProfileLite;
  profileId: string;
  badge?: string;
  onClick: () => void;
  compact?: boolean;
}) {
  const name = profile?.full_name || profile?.email || "(desconhecido)";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "rounded-md border bg-card hover:bg-accent/40 transition cursor-pointer",
        "flex items-center gap-3",
        compact ? "p-2 min-h-[44px]" : "p-3 min-h-[56px]",
      )}
    >
      <Avatar className={compact ? "h-8 w-8" : "h-10 w-10"}>
        <AvatarFallback className="text-[11px]">
          {initialsOf(profile?.full_name, profile?.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{name}</div>
        {badge && (
          <div className="text-[11px] text-muted-foreground truncate">{badge}</div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}
