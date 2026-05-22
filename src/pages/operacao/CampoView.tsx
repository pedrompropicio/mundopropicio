import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedEventIds } from "@/hooks/useScopedEventIds";
import { useOperacaoMode, type OperacaoMode } from "@/hooks/useOperacaoMode";
import {
  AlertTriangle,
  Clock,
  PlayCircle,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  MapPin,
  Plus,
  Bell,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================================
// Helpers
// ============================================================================

function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 6) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 19) return "Boa tarde";
  return "Boa noite";
}

function firstName(full?: string | null, email?: string | null): string {
  if (full) return full.trim().split(/\s+/)[0];
  if (email) return email.split("@")[0];
  return "";
}

function daysBetween(target: Date, from = new Date()): number {
  const ms = target.getTime() - from.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatRelativeDay(d: Date): string {
  const diff = daysBetween(d);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff > 1) return `daqui a ${diff} dias`;
  if (diff === -1) return "ontem";
  return `há ${Math.abs(diff)} dias`;
}

type PhaseConfig = {
  label: string;
  tone: string;
  pulse?: boolean;
  message?: string;
};

function phaseConfig(mode: OperacaoMode, eventDate?: string | null): PhaseConfig {
  const target = eventDate ? new Date(eventDate + "T00:00:00") : null;
  const countdown = target ? formatRelativeDay(target) : "";
  switch (mode) {
    case "planning":
      return {
        label: "Em planeamento",
        tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
        message: countdown ? `Evento ${countdown}` : "A montagem ainda não começou.",
      };
    case "montagem":
      return {
        label: "Montagem em curso",
        tone: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
        message: countdown ? `Evento ${countdown}` : "Foco nas etapas de montagem.",
      };
    case "evento":
      return {
        label: "Ao vivo",
        tone: "bg-red-500/15 text-red-700 dark:text-red-300",
        pulse: true,
        message: "Evento em curso — abre chamados se algo correr mal.",
      };
    case "post":
      return {
        label: "Fecho",
        tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        message: "Confirma os registos finais e fecha as tuas etapas.",
      };
  }
}

type EtapaRow = {
  id: string;
  name: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  frente_id: string;
  frente_name?: string;
  frente_color?: string | null;
};

type FrenteMini = {
  id: string;
  name: string;
  color?: string | null;
  type?: string | null;
  is_lead: boolean;
  etapas_count: number;
};

type ChamadoRow = {
  id: string;
  text: string | null;
  priority: string | null;
  status: string;
  sla_due_at: string | null;
  frente_id: string | null;
  frente_name?: string;
};

// ============================================================================
// CampoView
// ============================================================================

export default function CampoView() {
  const { user } = useAuth();
  const { eventIds, isLoading: scopeLoading } = useScopedEventIds();

  // Pick "evento principal": activo (montagem|evento) mais próximo de hoje,
  // senão o próximo planeado.
  const { data: scopeEvents } = useQuery({
    queryKey: ["campo-scope-events", eventIds.join(",")],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id,name,date,status,operacao_mode")
        .in("id", eventIds)
        .order("date", { ascending: true });
      return data ?? [];
    },
  });

  const sortedEvents = useMemo(() => {
    if (!scopeEvents) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weight = (m: string | null) =>
      m === "evento" ? 0 : m === "montagem" ? 1 : m === "post" ? 3 : 2;
    return [...scopeEvents].sort((a: any, b: any) => {
      const wa = weight(a.operacao_mode);
      const wb = weight(b.operacao_mode);
      if (wa !== wb) return wa - wb;
      const da = a.date ? new Date(a.date).getTime() : Infinity;
      const db = b.date ? new Date(b.date).getTime() : Infinity;
      const fa = da >= today.getTime() ? 0 : 1;
      const fb = db >= today.getTime() ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return da - db;
    });
  }, [scopeEvents]);

  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const activeId = activeEventId ?? sortedEvents[0]?.id ?? null;
  const activeEvent = sortedEvents.find((e: any) => e.id === activeId) ?? null;

  const mode = useOperacaoMode(activeId) ?? "planning";

  // Profile (nome)
  const { data: profile } = useQuery({
    queryKey: ["campo-profile", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name,email")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["campo-view", user?.id, activeId],
    enabled: !!user?.id && !!activeId,
    staleTime: 20_000,
    queryFn: async () => {
      // 1) Frentes do user neste evento (team + current_lead)
      const [{ data: teams }, { data: leadFrs }] = await Promise.all([
        supabase
          .from("operacao_frente_team")
          .select("frente_id, role_in_frente, is_permanent_lead, frente:operacao_frentes!inner(id,name,color,type,event_id,current_lead_id)")
          .eq("profile_id", user!.id)
          .eq("active", true),
        supabase
          .from("operacao_frentes")
          .select("id,name,color,type,event_id,current_lead_id")
          .eq("current_lead_id", user!.id)
          .eq("event_id", activeId!),
      ]);

      const frenteMap = new Map<string, FrenteMini>();
      for (const t of teams ?? []) {
        const f: any = (t as any).frente;
        if (!f || f.event_id !== activeId) continue;
        const teamRole = (t as any).role_in_frente;
        const isPermLead = (t as any).is_permanent_lead;
        frenteMap.set(f.id, {
          id: f.id,
          name: f.name,
          color: f.color,
          type: f.type,
          is_lead: teamRole === "lead" || isPermLead === true || f.current_lead_id === user!.id,
          etapas_count: 0,
        });
      }
      for (const f of (leadFrs ?? []) as any[]) {
        const prev = frenteMap.get(f.id);
        frenteMap.set(f.id, {
          id: f.id,
          name: f.name,
          color: f.color,
          type: f.type,
          is_lead: true,
          etapas_count: prev?.etapas_count ?? 0,
        });
      }
      const minhasFrentes = Array.from(frenteMap.values());
      const frenteIds = minhasFrentes.map((f) => f.id);

      // 2) Etapas atribuídas a mim no evento (assignees + responsible)
      const assigneesP = supabase
        .from("operacao_etapa_assignees")
        .select(
          "etapa_id, etapa:operacao_etapas!inner(id,name,status,planned_start,planned_end,frente_id,frente:operacao_frentes!inner(id,name,color,event_id))",
        )
        .eq("profile_id", user!.id);
      const respP = supabase
        .from("operacao_etapas")
        .select(
          "id,name,status,planned_start,planned_end,frente_id,frente:operacao_frentes!inner(id,name,color,event_id)",
        )
        .eq("responsible_profile_id", user!.id);

      const [{ data: assignRows }, { data: respRows }] = await Promise.all([assigneesP, respP]);

      const etapaMap = new Map<string, EtapaRow>();
      const pushEtapa = (e: any) => {
        if (!e) return;
        const fr = e.frente;
        if (!fr || fr.event_id !== activeId) return;
        if (etapaMap.has(e.id)) return;
        etapaMap.set(e.id, {
          id: e.id,
          name: e.name,
          status: e.status,
          planned_start: e.planned_start,
          planned_end: e.planned_end,
          frente_id: e.frente_id,
          frente_name: fr.name,
          frente_color: fr.color,
        });
      };
      for (const a of (assignRows ?? []) as any[]) pushEtapa(a.etapa);
      for (const r of (respRows ?? []) as any[]) pushEtapa(r);
      const minhasEtapas = Array.from(etapaMap.values());

      // contar etapas por frente
      for (const e of minhasEtapas) {
        const f = frenteMap.get(e.frente_id);
        if (f) f.etapas_count += 1;
      }

      // 3) Chamados abertos onde sou author OU pertenço à frente
      let chamados: ChamadoRow[] = [];
      if (frenteIds.length > 0) {
        const { data: ch } = await supabase
          .from("operacao_registros")
          .select("id,text,priority,status,sla_due_at,frente_id,author_profile_id,frente:operacao_frentes!inner(id,name,event_id)")
          .eq("kind", "chamado")
          .in("status", ["open", "in_progress"])
          .in("frente_id", frenteIds);
        chamados = ((ch ?? []) as any[])
          .filter((c) => c.frente?.event_id === activeId)
          .map((c) => ({
            id: c.id,
            text: c.text,
            priority: c.priority,
            status: c.status,
            sla_due_at: c.sla_due_at,
            frente_id: c.frente_id,
            frente_name: c.frente?.name,
          }));
      }

      return {
        minhasFrentes: Array.from(frenteMap.values()),
        minhasEtapas,
        chamados,
      };
    },
  });

  // Categorizar etapas
  const buckets = useMemo(() => {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const atrasadas: EtapaRow[] = [];
    const emCurso: EtapaRow[] = [];
    const lookahead: EtapaRow[] = [];
    for (const e of data?.minhasEtapas ?? []) {
      if (e.status === "done") continue;
      const end = e.planned_end ? new Date(e.planned_end) : null;
      const start = e.planned_start ? new Date(e.planned_start) : null;
      if (e.status === "in_progress") {
        emCurso.push(e);
      } else if (end && end < now) {
        atrasadas.push(e);
      } else if (start && start >= now && start <= in48h) {
        lookahead.push(e);
      } else if (e.status === "in_progress") {
        emCurso.push(e);
      }
    }
    return { atrasadas, emCurso, lookahead };
  }, [data]);

  const leadFrentes = (data?.minhasFrentes ?? []).filter((f) => f.is_lead);
  const staffFrentes = (data?.minhasFrentes ?? []).filter((f) => !f.is_lead);

  const cfg = phaseConfig(mode, activeEvent?.date);

  // ---- Render --------------------------------------------------------------
  if (scopeLoading) {
    return <FullScreenLoader />;
  }

  return (
    <div
      className="min-h-[calc(100vh-3.5rem)] bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 6rem)",
      }}
    >
      <div className="mx-auto w-full max-w-2xl px-4 pt-4">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                {greetingFor()}, {firstName(profile?.full_name, profile?.email) || "👋"}
              </h1>
              {activeEvent ? (
                <p className="text-sm text-muted-foreground truncate">{(activeEvent as any).name}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => refetch()}
              aria-label="Atualizar"
            >
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
            </Button>
          </div>

          {/* Phase badge */}
          {activeEvent && (
            <div
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold",
                cfg.tone,
                cfg.pulse && "animate-pulse",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              {cfg.label}
              {cfg.message ? <span className="opacity-80 font-normal">· {cfg.message}</span> : null}
            </div>
          )}

          {/* Event picker (se >1) */}
          {sortedEvents.length > 1 && (
            <Select
              value={activeId ?? undefined}
              onValueChange={(v) => setActiveEventId(v)}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Escolhe o evento" />
              </SelectTrigger>
              <SelectContent>
                {sortedEvents.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </header>

        {/* Body */}
        <main className="mt-6 space-y-6">
          {!activeEvent ? (
            <EmptyState
              title="Não estás em nenhum evento"
              body="Pede a alguém da produção para te adicionar a uma zona."
            />
          ) : isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* Phase-specific guidance */}
              {mode === "planning" && (data?.minhasEtapas.length ?? 0) === 0 && (
                <PhaseHero
                  emoji="🌱"
                  title="Ainda nada para fazer no terreno"
                  body="A montagem ainda não começou. Vais ver aqui as tuas tarefas assim que arrancar."
                />
              )}

              {/* Chamados primeiro durante evento ao vivo */}
              {mode === "evento" && (data?.chamados.length ?? 0) > 0 && (
                <Section
                  title="Chamados em curso"
                  icon={<Bell className="h-4 w-4 text-red-600" />}
                >
                  {data!.chamados.map((c) => (
                    <ChamadoCard key={c.id} chamado={c} />
                  ))}
                </Section>
              )}

              {/* Etapas atrasadas */}
              {buckets.atrasadas.length > 0 && (
                <Section
                  title={`${buckets.atrasadas.length} ${buckets.atrasadas.length === 1 ? "etapa atrasada" : "etapas atrasadas"}`}
                  icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
                >
                  {buckets.atrasadas.map((e) => (
                    <EtapaCard key={e.id} etapa={e} variant="atrasada" />
                  ))}
                </Section>
              )}

              {/* Em curso */}
              {buckets.emCurso.length > 0 && (
                <Section
                  title={`${buckets.emCurso.length} em curso`}
                  icon={<PlayCircle className="h-4 w-4 text-blue-600" />}
                >
                  {buckets.emCurso.map((e) => (
                    <EtapaCard key={e.id} etapa={e} variant="em_curso" />
                  ))}
                </Section>
              )}

              {/* Lookahead 48h */}
              {(mode === "montagem" || mode === "evento") && buckets.lookahead.length > 0 && (
                <Section
                  title="Próximas 48 horas"
                  icon={<Clock className="h-4 w-4 text-slate-500" />}
                >
                  {buckets.lookahead.map((e) => (
                    <EtapaCard key={e.id} etapa={e} variant="lookahead" />
                  ))}
                </Section>
              )}

              {/* Chamados em outras fases (mais discreto) */}
              {mode !== "evento" && (data?.chamados.length ?? 0) > 0 && (
                <Section
                  title={`${data!.chamados.length} chamado(s) aberto(s)`}
                  icon={<Bell className="h-4 w-4 text-muted-foreground" />}
                >
                  {data!.chamados.map((c) => (
                    <ChamadoCard key={c.id} chamado={c} />
                  ))}
                </Section>
              )}

              {/* Zonas que lidero */}
              {leadFrentes.length > 0 && (
                <Section title="Zonas que lideras" icon={<MapPin className="h-4 w-4" />}>
                  {leadFrentes.map((f) => (
                    <FrenteMiniCard key={f.id} frente={f} />
                  ))}
                </Section>
              )}

              {/* Zonas onde sou staff */}
              {staffFrentes.length > 0 && (
                <Section title="Zonas onde és staff" icon={<MapPin className="h-4 w-4 text-muted-foreground" />}>
                  {staffFrentes.map((f) => (
                    <FrenteMiniCard key={f.id} frente={f} />
                  ))}
                </Section>
              )}

              {/* Fecho */}
              {mode === "post" && (
                <PhaseHero
                  emoji="✅"
                  title="Fecho do evento"
                  body="Confirma os teus registos finais. Marca as tuas etapas como concluídas."
                />
              )}

              {/* Empty general */}
              {(data?.minhasFrentes.length ?? 0) === 0 &&
                (data?.minhasEtapas.length ?? 0) === 0 &&
                (data?.chamados.length ?? 0) === 0 && (
                  <EmptyState
                    title="Nada atribuído (ainda)"
                    body="Quando te adicionarem a uma zona ou tarefa, aparece aqui."
                  />
                )}
            </>
          )}
        </main>
      </div>

      {/* FAB */}
      <Link
        to="/operacao/chamado/novo"
        className="fixed left-1/2 -translate-x-1/2 z-30 h-14 px-6 rounded-full bg-primary text-primary-foreground font-semibold shadow-lg active:scale-95 transition-transform flex items-center gap-2"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
      >
        <Plus className="h-5 w-5" />
        {mode === "evento" ? "Abrir chamado" : "Registar"}
      </Link>

      {/* TODO OP-15 fase 2 (pós-Coala): permitir login via telefone (SMS OTP)
       * Requer:
       * 1. Configurar Supabase Auth → enable Phone provider
       * 2. Configurar SMS provider (Twilio recomendado, já temos `_shared/twilio.ts`)
       * 3. UI em Auth.tsx com tab "Telefone" + input internacional + OTP de 6 dígitos
       * 4. Linkar profile.phone ao auth.user.phone (trigger ou edge function)
       * Decisão: não fazer agora para não arriscar quebrar auth de produção. */}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        {icon}
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EtapaCard({
  etapa,
  variant,
}: {
  etapa: EtapaRow;
  variant: "atrasada" | "em_curso" | "lookahead" | "concluida";
}) {
  const variantClass = {
    atrasada: "border-l-4 border-l-red-500 bg-red-50/60 dark:bg-red-950/20",
    em_curso: "border-l-4 border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20",
    lookahead: "border-l-4 border-l-slate-400 bg-card",
    concluida: "border-l-4 border-l-emerald-500 opacity-60 bg-card",
  }[variant];

  const when = (() => {
    if (variant === "atrasada" && etapa.planned_end) {
      const d = new Date(etapa.planned_end);
      return `Devia ter terminado ${formatRelativeDay(d)}`;
    }
    if (variant === "lookahead" && etapa.planned_start) {
      const d = new Date(etapa.planned_start);
      return `Começa ${formatRelativeDay(d)}`;
    }
    if (variant === "em_curso" && etapa.planned_end) {
      const d = new Date(etapa.planned_end);
      return `Termina ${formatRelativeDay(d)}`;
    }
    return null;
  })();

  return (
    <Link
      to={`/operacao/etapa/${etapa.id}`}
      className={cn(
        "block rounded-lg border p-3 min-h-[44px] transition-all duration-200 active:scale-[0.99] hover:bg-accent/40",
        variantClass,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{etapa.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground truncate">
            {etapa.frente_name}
            {when ? <> · {when}</> : null}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

function ChamadoCard({ chamado }: { chamado: ChamadoRow }) {
  const priorityTone =
    chamado.priority === "high" || chamado.priority === "critical"
      ? "border-l-red-500 bg-red-50/60 dark:bg-red-950/20"
      : chamado.priority === "low"
        ? "border-l-slate-400 bg-card"
        : "border-l-orange-500 bg-orange-50/60 dark:bg-orange-950/20";

  return (
    <Link
      to={`/operacao/chamado/${chamado.id}`}
      className={cn(
        "block rounded-lg border-l-4 border p-3 min-h-[44px] transition-all duration-200 active:scale-[0.99] hover:bg-accent/40",
        priorityTone,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium line-clamp-2">{chamado.text ?? "(sem descrição)"}</div>
          <div className="mt-0.5 text-xs text-muted-foreground truncate">
            {chamado.frente_name}
            {chamado.priority ? <> · {chamado.priority}</> : null}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

function FrenteMiniCard({ frente }: { frente: FrenteMini }) {
  return (
    <Link
      to={`/operacao/frente/${frente.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border p-3 min-h-[44px] bg-card hover:bg-accent/40 active:scale-[0.99] transition-all duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: frente.color ?? "hsl(var(--muted-foreground))" }}
        />
        <div className="min-w-0">
          <div className="font-medium truncate">{frente.name}</div>
          <div className="text-xs text-muted-foreground">
            {frente.is_lead ? "Lead" : "Staff"}
            {frente.etapas_count > 0 ? ` · ${frente.etapas_count} etapa(s) tua(s)` : ""}
          </div>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function PhaseHero({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-card p-6 text-center">
      <div className="text-4xl mb-2">{emoji}</div>
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{body}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <CheckCircle2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{body}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 rounded-lg border bg-muted/30 animate-pulse" />
      ))}
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
