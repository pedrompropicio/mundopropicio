import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  Crown,
  UserCog,
  Users,
  ListChecks,
  Bell,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { frenteLabel } from "@/lib/operacao-labels";
import {
  roleEventLabel,
  roleFrenteLabel,
  initialsOf,
} from "@/lib/operacao-equipa-labels";

export default function PessoaDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const eventId = params.get("event");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pessoa-detail", id, eventId],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async () => {
      // 1) profile
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, profile_type")
        .eq("id", id!)
        .maybeSingle();
      if (pErr) throw pErr;

      // 2) papéis no evento
      let evtRoles: any[] = [];
      if (eventId) {
        const { data, error } = await supabase
          .from("event_team_members")
          .select("role")
          .eq("event_id", eventId)
          .eq("profile_id", id!);
        if (error) throw error;
        evtRoles = data ?? [];
      }

      // 3) frentes onde é lead OU está no team
      let leadFrentes: any[] = [];
      let teamFrentes: any[] = [];
      let scopeFrenteIds = new Set<string>();
      if (eventId) {
        const [leadsRes, teamsRes] = await Promise.all([
          supabase
            .from("operacao_frentes")
            .select("id, name, color, type, status")
            .eq("event_id", eventId)
            .eq("current_lead_id", id!)
            .neq("status", "cancelled"),
          supabase
            .from("operacao_frente_team")
            .select("frente_id, role_in_frente, is_permanent_lead")
            .eq("profile_id", id!)
            .eq("active", true),
        ]);
        if (leadsRes.error) throw leadsRes.error;
        if (teamsRes.error) throw teamsRes.error;
        leadFrentes = leadsRes.data ?? [];
        leadFrentes.forEach((f: any) => scopeFrenteIds.add(f.id));

        const teamFrenteIds = (teamsRes.data ?? []).map((t: any) => t.frente_id);
        if (teamFrenteIds.length > 0) {
          const { data: frs, error: fErr } = await supabase
            .from("operacao_frentes")
            .select("id, name, color, type, status, event_id")
            .in("id", teamFrenteIds)
            .eq("event_id", eventId);
          if (fErr) throw fErr;
          teamFrentes = (frs ?? [])
            .filter((f: any) => !leadFrentes.some((l: any) => l.id === f.id))
            .map((f: any) => ({
              ...f,
              role: (teamsRes.data ?? []).find((t: any) => t.frente_id === f.id)?.role_in_frente,
            }));
          teamFrentes.forEach((f: any) => scopeFrenteIds.add(f.id));
        }
      }

      // 4) etapas owner/helper/responsible
      let etapasOwner: any[] = [];
      let etapasHelper: any[] = [];
      if (eventId && scopeFrenteIds.size > 0) {
        const { data: assignedRaw, error: aErr } = await supabase
          .from("operacao_etapa_assignees")
          .select("role, etapa_id")
          .eq("profile_id", id!);
        if (aErr) throw aErr;

        const { data: respRaw, error: rErr } = await supabase
          .from("operacao_etapas")
          .select("id, name, status, planned_start, planned_end, frente_id")
          .eq("responsible_profile_id", id!);
        if (rErr) throw rErr;

        const assignedIds = (assignedRaw ?? []).map((a: any) => a.etapa_id);
        let etapaById = new Map<string, any>();
        if (assignedIds.length > 0) {
          const { data: etapasData, error: eErr } = await supabase
            .from("operacao_etapas")
            .select("id, name, status, planned_start, planned_end, frente_id")
            .in("id", assignedIds);
          if (eErr) throw eErr;
          (etapasData ?? []).forEach((e: any) => etapaById.set(e.id, e));
        }

        const ownerSet = new Set<string>();
        (assignedRaw ?? []).forEach((a: any) => {
          const e = etapaById.get(a.etapa_id);
          if (!e || !scopeFrenteIds.has(e.frente_id)) return;
          if (a.role === "owner") {
            etapasOwner.push(e);
            ownerSet.add(e.id);
          } else {
            etapasHelper.push(e);
          }
        });
        (respRaw ?? []).forEach((e: any) => {
          if (!scopeFrenteIds.has(e.frente_id)) return;
          if (!ownerSet.has(e.id)) {
            etapasOwner.push(e);
            ownerSet.add(e.id);
          }
        });
      }

      // 5) chamados (autor) no scope
      let chamados: any[] = [];
      if (eventId && scopeFrenteIds.size > 0) {
        const { data, error } = await supabase
          .from("operacao_registros")
          .select("id, text, status, priority, created_at, frente_id")
          .eq("kind", "chamado")
          .eq("author_profile_id", id!)
          .in("frente_id", Array.from(scopeFrenteIds))
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        chamados = data ?? [];
      }

      return { profile, evtRoles, leadFrentes, teamFrentes, etapasOwner, etapasHelper, chamados };
    },
  });

  const backTo = eventId ? "/operacao/equipa" : "/operacao/equipa";

  const totalCounts = useMemo(() => {
    if (!data) return 0;
    return (
      data.evtRoles.length +
      data.leadFrentes.length +
      data.teamFrentes.length +
      data.etapasOwner.length +
      data.etapasHelper.length +
      data.chamados.length
    );
  }, [data]);

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(backTo)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar à equipa
      </Button>

      {isLoading ? (
        <>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro a carregar pessoa</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Tenta novamente."}</AlertDescription>
        </Alert>
      ) : !data?.profile ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Pessoa não encontrada.
        </Card>
      ) : (
        <>
          {/* Header */}
          <Card className="p-4 flex items-center gap-3">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-base">
                {initialsOf(data.profile.full_name, data.profile.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold leading-tight truncate">
                {data.profile.full_name || data.profile.email || "—"}
              </h1>
              {data.profile.email && (
                <p className="text-xs text-muted-foreground truncate">{data.profile.email}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {data.profile.profile_type && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {data.profile.profile_type}
                  </Badge>
                )}
                {data.evtRoles.map((r: any, i: number) => (
                  <Badge key={i} className="text-[10px] h-4 px-1">
                    <Crown className="h-3 w-3 mr-1" />
                    {roleEventLabel(r.role)}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>

          {!eventId && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sem contexto de evento</AlertTitle>
              <AlertDescription className="text-xs">
                Volta à lista e abre a partir de um evento para ver detalhes operacionais.
              </AlertDescription>
            </Alert>
          )}

          {eventId && totalCounts === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Esta pessoa não tem atribuições neste evento.
            </Card>
          )}

          {/* Lidera */}
          {data.leadFrentes.length > 0 && (
            <Section
              icon={<UserCog className="h-3.5 w-3.5" />}
              title="Lidera"
              count={data.leadFrentes.length}
            >
              {data.leadFrentes.map((f: any) => (
                <FrenteRow
                  key={f.id}
                  frente={f}
                  label="Produtor da Frente"
                  onClick={() => navigate(`/operacao/frente/${f.id}`)}
                />
              ))}
            </Section>
          )}

          {/* Staff em */}
          {data.teamFrentes.length > 0 && (
            <Section
              icon={<Users className="h-3.5 w-3.5" />}
              title="Staff em"
              count={data.teamFrentes.length}
            >
              {data.teamFrentes.map((f: any) => (
                <FrenteRow
                  key={f.id}
                  frente={f}
                  label={roleFrenteLabel(f.role)}
                  onClick={() => navigate(`/operacao/frente/${f.id}`)}
                />
              ))}
            </Section>
          )}

          {/* Owner em */}
          {data.etapasOwner.length > 0 && (
            <Section
              icon={<ListChecks className="h-3.5 w-3.5" />}
              title="Responsável por etapas"
              count={data.etapasOwner.length}
            >
              {data.etapasOwner.map((e: any) => (
                <EtapaRow key={e.id} etapa={e} onClick={() => navigate(`/operacao/etapa/${e.id}`)} />
              ))}
            </Section>
          )}

          {/* Helper em */}
          {data.etapasHelper.length > 0 && (
            <Section
              icon={<ListChecks className="h-3.5 w-3.5" />}
              title="Auxiliar em etapas"
              count={data.etapasHelper.length}
            >
              {data.etapasHelper.map((e: any) => (
                <EtapaRow key={e.id} etapa={e} onClick={() => navigate(`/operacao/etapa/${e.id}`)} />
              ))}
            </Section>
          )}

          {/* Chamados */}
          {data.chamados.length > 0 && (
            <Section
              icon={<Bell className="h-3.5 w-3.5" />}
              title="Chamados abertos"
              count={data.chamados.length}
            >
              {data.chamados.map((c: any) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/operacao/chamado/${c.id}`)}
                  className={cn(
                    "min-h-[44px] rounded-md border p-3 hover:bg-accent/40 transition cursor-pointer",
                    "flex items-center gap-3",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{c.text || "(sem texto)"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.status} · {c.priority ?? "—"} ·{" "}
                      {new Date(c.created_at).toLocaleDateString("pt-PT")}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pt-1">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <Badge variant="outline" className="text-[10px] h-4 px-1">
          {count}
        </Badge>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function FrenteRow({
  frente,
  label,
  onClick,
}: {
  frente: any;
  label: string;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className="min-h-[44px] rounded-md border p-3 hover:bg-accent/40 transition cursor-pointer flex items-center gap-3"
    >
      <span
        className="h-8 w-1 rounded-sm shrink-0"
        style={{ background: frente.color || "hsl(var(--muted-foreground))" }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{frente.name}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px] h-4 px-1">
            {frenteLabel(frente.type)}
          </Badge>
          <span>{label}</span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

function EtapaRow({ etapa, onClick }: { etapa: any; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className="min-h-[44px] rounded-md border p-3 hover:bg-accent/40 transition cursor-pointer flex items-center gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{etapa.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {etapa.status ?? "—"}
          {etapa.planned_start
            ? ` · ${new Date(etapa.planned_start).toLocaleDateString("pt-PT")}`
            : ""}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}
