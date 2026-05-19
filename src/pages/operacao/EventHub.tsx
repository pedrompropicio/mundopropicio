import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PHASE_ORDER } from "@/components/operacao/event/PhaseBadge";
import { EventTeamSection } from "@/components/operacao/event/EventTeamSection";
import { FrentesPanel } from "@/components/operacao/event/FrentesPanel";
import { PlanejamentoPhase } from "@/components/operacao/event/PlanejamentoPhase";

import { ArrowLeft, BarChart3, Users, ChevronRight, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function fmtRange(date?: string | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
}

type Phase = "setup" | "planning" | "montagem" | "evento" | "post";

export default function EventHub() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, hasPermission } = useAuth();
  const canManagePhase = isAdmin || hasPermission("manage_operacao_etapas") || hasPermission("manage_operacao_frentes");
  const canManage = isAdmin || hasPermission("manage_operacao_frentes");

  const { data: event, isLoading } = useQuery({
    queryKey: ["op-hub-event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id,name,date,location,operacao_mode,company_id,status")
        .eq("id", eventId!).maybeSingle();
      return data;
    },
  });

  const currentPhase: Phase = (event?.operacao_mode as Phase) ?? "setup";
  const [viewPhase, setViewPhase] = useState<Phase | null>(null);
  const activePhase: Phase = viewPhase ?? currentPhase;

  const changePhase = async (next: Phase) => {
    if (!canManagePhase || !event) return;
    // simple guard for advanced phases
    if ((next === "montagem" || next === "evento") && !confirm(`Avançar evento para fase "${next.toUpperCase()}"?`)) return;
    const { error } = await supabase.from("events").update({ operacao_mode: next }).eq("id", event.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Fase actualizada" });
    setViewPhase(null);
    qc.invalidateQueries({ queryKey: ["op-hub-event", eventId] });
    qc.invalidateQueries({ queryKey: ["op-events-list"] });
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">A carregar…</div>;
  if (!event) return <div className="p-6 text-sm text-muted-foreground">Evento não encontrado.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="sticky top-14 z-20 bg-background/95 backdrop-blur -mx-4 md:-mx-6 px-4 md:px-6 py-3 border-b mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <button
              onClick={() => navigate("/operacao")}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1"
            >
              <ArrowLeft className="h-3 w-3" /> Eventos
            </button>
            <h1 className="text-xl md:text-2xl font-bold leading-tight truncate">{event.name}</h1>
            <p className="text-xs text-muted-foreground">{fmtRange(event.date)} · {event.location || "—"}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {PHASE_ORDER.map((p) => {
              const isActive = activePhase === p.key;
              const isCurrent = currentPhase === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => {
                    if (p.key === currentPhase) { setViewPhase(null); return; }
                    if (canManagePhase) changePhase(p.key as Phase);
                    else setViewPhase(p.key as Phase);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:bg-muted",
                  )}
                  title={isCurrent ? "Fase actual" : canManagePhase ? "Mudar para esta fase" : "Pré-visualizar"}
                >
                  {p.label}
                  {isCurrent && !isActive && <span className="ml-1 opacity-60">•</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Phase content */}
      {activePhase === "setup" && (
        <SetupPhase eventId={event.id} companyId={event.company_id} canManage={canManage} canManagePhase={canManagePhase} onAdvance={() => changePhase("planning")} />
      )}

      {activePhase === "planning" && (
        <PlanejamentoPhase
          eventId={event.id}
          companyId={event.company_id}
          canManage={canManage}
          onBackToSetup={() => setViewPhase("setup")}
        />
      )}


      {activePhase === "montagem" && (
        <PlaceholderPhase title="Montagem" text="Em breve: Gantt + acompanhamento no terreno." eventId={event.id} />
      )}

      {activePhase === "evento" && (
        <Card className="p-6 text-center space-y-3">
          <h3 className="font-semibold">Evento — Live ops</h3>
          <p className="text-sm text-muted-foreground">Em breve: Live ops dashboard.</p>
          <Link to="/operacao/dashboard" className="inline-block">
            <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 mr-1" /> Ver Dashboard actual</Button>
          </Link>
        </Card>
      )}

      {activePhase === "post" && (
        <PlaceholderPhase title="Fecho" text="Em breve: Pendências operacionais e lições." eventId={event.id} />
      )}
    </div>
  );
}

function SetupPhase({
  eventId, companyId, canManage, canManagePhase, onAdvance,
}: { eventId: string; companyId: string; canManage: boolean; canManagePhase: boolean; onAdvance: () => void }) {
  const navigate = useNavigate();
  const { data: counts } = useQuery({
    queryKey: ["op-hub-setup-counts", eventId],
    queryFn: async () => {
      const [{ count: teamCount }, { count: zoneCount }, { count: serviceCount }] = await Promise.all([
        supabase.from("event_team_members").select("id", { count: "exact", head: true }).eq("event_id", eventId),
        supabase.from("operacao_frentes").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("type", "zone").neq("status", "cancelled"),
        supabase.from("operacao_frentes").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("type", "service").neq("status", "cancelled"),
      ]);
      return { team: teamCount ?? 0, zones: zoneCount ?? 0, services: serviceCount ?? 0 };
    },
  });

  const filled = [counts?.team, counts?.zones, counts?.services].filter((n) => (n ?? 0) > 0).length;
  const complete = filled === 3;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <Card className="p-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Setup {filled}/3</span>
            {complete && <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Setup completo
            </Badge>}
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(filled / 3) * 100}%` }} />
          </div>
        </div>
        {complete && canManagePhase && (
          <Button size="sm" onClick={onAdvance}>Avançar para Planeamento <ChevronRight className="h-3 w-3 ml-1" /></Button>
        )}
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => navigate("/operacao/staff")}>
            <Users className="h-4 w-4 mr-1" /> Gerir Staff
          </Button>
        )}
      </Card>

      <EventTeamSection eventId={eventId} companyId={companyId} />
      <FrentesPanel eventId={eventId} companyId={companyId} type="zone" canManage={canManage} />
      <FrentesPanel eventId={eventId} companyId={companyId} type="service" canManage={canManage} />
    </div>
  );
}

function PlaceholderPhase({ title, text, eventId }: { title: string; text: string; eventId: string }) {
  const { data: zones } = useQuery({
    queryKey: ["op-hub-placeholder-zones", eventId],
    queryFn: async () => {
      const { data } = await supabase.from("operacao_frentes")
        .select("id,name,color,type")
        .eq("event_id", eventId).neq("status", "cancelled").order("display_order");
      return data ?? [];
    },
  });
  return (
    <div className="space-y-4">
      <Card className="p-6 text-center">
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{text}</p>
      </Card>
      {(zones ?? []).length > 0 && (
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Zonas & Serviços</p>
          <div className="space-y-1">
            {(zones ?? []).map((z: any) => (
              <Link key={z.id} to={`/operacao/frente/${z.id}`} className="flex items-center gap-3 p-2 rounded border hover:bg-muted/40">
                <div className="w-1 h-6 rounded-full" style={{ backgroundColor: z.color ?? "#6b7280" }} />
                <span className="text-sm flex-1">{z.name}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{z.type === "service" ? "Serviço" : "Zona"}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
