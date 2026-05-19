import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RegistroSheet } from "@/components/operacao/RegistroSheet";
import { OperacaoStatusBadge } from "@/components/operacao/OperacaoStatusBadge";
import {
  Bell, Play, CheckCircle2, AlertTriangle, Phone, MessageCircle,
  BarChart3, ChevronDown, ChevronRight, MoreVertical, Siren, RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Props = { eventId: string; companyId: string };

function normalizePhone(p?: string | null) {
  if (!p) return null;
  const cleaned = p.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export function EventoPhase({ eventId, companyId }: Props) {
  const qc = useQueryClient();
  const { user, isAdmin, hasPermission } = useAuth();
  const [fabOpen, setFabOpen] = useState(false);

  const canManageBase =
    isAdmin || hasPermission("manage_operacao_etapas") || hasPermission("manage_operacao_frentes");

  // ---------- Frentes do evento (para mapear chamados) ----------
  const {
    data: frentes,
    error: frentesError,
    dataUpdatedAt: frentesUpdated,
    refetch: refetchFrentes,
  } = useQuery({
    queryKey: ["op-evento-frentes", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color,type,current_lead_id")
        .eq("event_id", eventId)
        .neq("status", "cancelled");
      return data ?? [];
    },
  });

  const frenteIds = useMemo(() => (frentes ?? []).map((f: any) => f.id), [frentes]);
  const frentesById = useMemo(
    () => Object.fromEntries((frentes ?? []).map((f: any) => [f.id, f])),
    [frentes],
  );

  // ---------- Chamados abertos ----------
  const {
    data: chamados,
    error: chamadosError,
    dataUpdatedAt: chamadosUpdated,
    refetch: refetchChamados,
  } = useQuery({
    queryKey: ["op-evento-chamados", eventId, frenteIds],
    enabled: frenteIds.length > 0,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_registros")
        .select("id,kind,status,text,priority,created_at,acked_at,etapa_id,frente_id,author_profile_id")
        .in("frente_id", frenteIds)
        .eq("kind", "chamado")
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Autores + leads (profiles)
  const profileIds = useMemo(() => {
    const ids = new Set<string>();
    (chamados ?? []).forEach((c: any) => c.author_profile_id && ids.add(c.author_profile_id));
    (frentes ?? []).forEach((f: any) => f.current_lead_id && ids.add(f.current_lead_id));
    return Array.from(ids);
  }, [chamados, frentes]);

  const { data: profiles } = useQuery({
    queryKey: ["op-evento-profiles", profileIds],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,phone")
        .in("id", profileIds);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
    },
  });

  // Etapas relacionadas (para nome) + etapas em curso
  const etapaIds = useMemo(
    () => Array.from(new Set((chamados ?? []).map((c: any) => c.etapa_id).filter(Boolean))),
    [chamados],
  );
  const { data: etapasOfChamados } = useQuery({
    queryKey: ["op-evento-etapas-chamados", etapaIds],
    enabled: etapaIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapas")
        .select("id,name")
        .in("id", etapaIds);
      return Object.fromEntries((data ?? []).map((e: any) => [e.id, e]));
    },
  });

  const {
    data: etapasInProgress,
    error: etapasError,
    dataUpdatedAt: etapasUpdated,
    refetch: refetchEtapas,
  } = useQuery({
    queryKey: ["op-evento-etapas-progress", eventId, frenteIds],
    enabled: frenteIds.length > 0,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapas")
        .select("id,name,status,planned_start,planned_end,frente_id,responsible_profile_id,updated_at")
        .in("frente_id", frenteIds)
        .eq("status", "in_progress")
        .order("planned_start", { ascending: true });
      return data ?? [];
    },
  });

  const {
    data: kpiDoneToday,
    error: kpiError,
    dataUpdatedAt: kpiUpdated,
    refetch: refetchKpi,
  } = useQuery({
    queryKey: ["op-evento-kpi-donetoday", eventId, frenteIds],
    enabled: frenteIds.length > 0,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("operacao_etapas")
        .select("id", { count: "exact", head: true })
        .in("frente_id", frenteIds)
        .eq("status", "done")
        .gte("updated_at", todayStart.toISOString());
      return count ?? 0;
    },
  });

  // ---------- Freshness banner state ----------
  const [now, setNow] = useState(Date.now());
  useMemo(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  // Re-render tick para envelhecer o "atualizado há Xs"
  const stamps = [chamadosUpdated, etapasUpdated, kpiUpdated, frentesUpdated].filter(Boolean) as number[];
  const oldest = stamps.length ? Math.min(...stamps) : Date.now();
  const ageSec = Math.max(0, Math.round((now - oldest) / 1000));
  const hasError = !!(chamadosError || etapasError || kpiError || frentesError);
  const freshTone: "ok" | "stale" | "error" = hasError ? "error" : ageSec > 60 ? "stale" : "ok";
  const refreshAll = () => {
    toast({ title: "A atualizar…" });
    void Promise.all([refetchChamados(), refetchEtapas(), refetchKpi(), refetchFrentes()]);
  };


  const openCount = (chamados ?? []).filter((c: any) => c.status === "open").length;
  const inProgressChamadoCount = (chamados ?? []).filter((c: any) => c.status === "in_progress").length;
  const totalOpen = openCount + inProgressChamadoCount;
  const zonesWithIssues = new Set((chamados ?? []).map((c: any) => c.frente_id)).size;

  // ---------- Ações ----------
  const canActOn = (c: any) => {
    if (canManageBase) return true;
    if (c.author_profile_id === user?.id) return true;
    const frente = frentesById[c.frente_id];
    if (frente?.current_lead_id === user?.id) return true;
    return false;
  };

  const markChamado = async (c: any, nextStatus: "in_progress" | "resolved") => {
    const payload: any = { status: nextStatus };
    if (nextStatus === "in_progress" && !c.acked_at) {
      payload.acked_at = new Date().toISOString();
      payload.acked_by_profile_id = user?.id;
    }
    if (nextStatus === "resolved") {
      payload.resolved_at = new Date().toISOString();
      payload.resolved_by_profile_id = user?.id;
    }
    const { error } = await supabase.from("operacao_registros").update(payload).eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: nextStatus === "resolved" ? "Chamado resolvido" : "Chamado em curso" });
    qc.invalidateQueries({ queryKey: ["op-evento-chamados"] });
  };

  const markEtapaDone = async (e: any) => {
    const { error } = await supabase.from("operacao_etapas")
      .update({ status: "done", actual_end: new Date().toISOString() })
      .eq("id", e.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Etapa concluída" });
    qc.invalidateQueries({ queryKey: ["op-evento-etapas-progress"] });
    qc.invalidateQueries({ queryKey: ["op-evento-kpi-donetoday"] });
  };

  // Agrupar etapas em curso por frente
  const etapasByFrente = useMemo(() => {
    const map: Record<string, any[]> = {};
    (etapasInProgress ?? []).forEach((e: any) => {
      (map[e.frente_id] ||= []).push(e);
    });
    return map;
  }, [etapasInProgress]);

  return (
    <div className="space-y-4 pb-24">
      {/* Top bar: link analítico */}
      <div className="flex justify-end">
        <Link to="/operacao/dashboard">
          <Button variant="ghost" size="sm" className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" /> Ver Dashboard analítico
          </Button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiMini
          icon={Bell}
          label="Chamados abertos"
          value={totalOpen}
          tone={totalOpen > 0 ? "danger" : "neutral"}
        />
        <KpiMini icon={Play} label="Etapas em curso" value={(etapasInProgress ?? []).length} />
        <KpiMini icon={CheckCircle2} label="Concluídas hoje" value={kpiDoneToday ?? 0} />
        <KpiMini icon={AlertTriangle} label="Zonas com problemas" value={zonesWithIssues} />
      </div>

      {/* Feed de chamados */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4" /> Chamados abertos
        </h3>
        {(chamados ?? []).length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            🎉 Tudo sob controlo. Nenhum chamado aberto.
          </Card>
        ) : (
          <div className="space-y-2">
            {(chamados ?? [])
              .slice()
              .sort((a: any, b: any) => {
                if (a.status === b.status) return 0;
                return a.status === "open" ? -1 : 1;
              })
              .map((c: any) => {
                const frente = frentesById[c.frente_id];
                const etapa = c.etapa_id ? etapasOfChamados?.[c.etapa_id] : null;
                const author = profiles?.[c.author_profile_id];
                const lead = frente?.current_lead_id ? profiles?.[frente.current_lead_id] : null;
                const leadPhone = normalizePhone(lead?.phone);
                const canAct = canActOn(c);

                return (
                  <Card key={c.id} className="overflow-hidden">
                    <div className="flex">
                      <div
                        className="w-1.5 shrink-0"
                        style={{ backgroundColor: frente?.color ?? "#6b7280" }}
                      />
                      <div className="flex-1 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                              <span className="font-semibold text-foreground">{frente?.name ?? "—"}</span>
                              {etapa && <><ChevronRight className="h-3 w-3" /><span>{etapa.name}</span></>}
                              {c.status === "in_progress" && (
                                <Badge variant="default" className="ml-1 h-4 text-[10px]">Em curso</Badge>
                              )}
                            </div>
                            <p className="text-sm leading-snug">{c.text || "(sem descrição)"}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              há {formatDistanceToNow(new Date(c.created_at), { locale: pt })}
                              {author && <> · por {author.full_name}</>}
                            </p>
                          </div>
                          {canAct && (
                            <div className="flex gap-1 shrink-0">
                              {c.status === "open" && (
                                <Button size="sm" variant="secondary" onClick={() => markChamado(c, "in_progress")}>
                                  Em curso
                                </Button>
                              )}
                              <Button size="sm" onClick={() => markChamado(c, "resolved")}>
                                Resolver
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Contacto do lead */}
                        <div className="flex items-center gap-2 text-xs">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px]">{initials(lead?.full_name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-muted-foreground">
                            Lead: <span className="text-foreground">{lead?.full_name ?? "Sem lead"}</span>
                          </span>
                          {leadPhone ? (
                            <div className="flex gap-1 ml-auto">
                              <a href={`tel:${leadPhone}`}>
                                <Button size="sm" variant="outline" className="h-7 px-2">
                                  <Phone className="h-3 w-3 mr-1" /> Ligar
                                </Button>
                              </a>
                              <a href={`https://wa.me/${leadPhone}`} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="outline" className="h-7 px-2">
                                  <MessageCircle className="h-3 w-3 mr-1" /> WhatsApp
                                </Button>
                              </a>
                            </div>
                          ) : (
                            <span className="ml-auto text-muted-foreground italic">Sem contacto registado</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
        )}
      </div>

      {/* Etapas em curso — collapsible */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-muted/40">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              <span className="text-sm font-semibold">Etapas em curso ({(etapasInProgress ?? []).length})</span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-3 pt-0 space-y-3">
              {(etapasInProgress ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground py-2">Nenhuma etapa em curso.</p>
              )}
              {Object.entries(etapasByFrente).map(([fid, etapas]) => {
                const f = frentesById[fid];
                return (
                  <div key={fid} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <div className="w-1 h-3 rounded-full" style={{ backgroundColor: f?.color ?? "#6b7280" }} />
                      {f?.name ?? "—"}
                    </div>
                    {etapas.map((e: any) => {
                      const resp = e.responsible_profile_id ? profiles?.[e.responsible_profile_id] : null;
                      return (
                        <div key={e.id} className="flex items-center gap-2 p-2 rounded border bg-card/40">
                          <Link to={`/operacao/etapa/${e.id}`} className="flex-1 min-w-0 hover:underline">
                            <p className="text-sm truncate">{e.name}</p>
                            {(e.planned_start || e.planned_end) && (
                              <p className="text-[10px] text-muted-foreground">
                                {e.planned_start ? new Date(e.planned_start).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                                {" → "}
                                {e.planned_end ? new Date(e.planned_end).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </p>
                            )}
                          </Link>
                          <OperacaoStatusBadge status={e.status} />
                          {resp && (
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px]">{initials(resp.full_name)}</AvatarFallback>
                            </Avatar>
                          )}
                          {canManageBase && (
                            <Button size="sm" variant="outline" onClick={() => markEtapaDone(e)}>
                              Concluir
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* FAB Novo incidente */}
      {(isAdmin || hasPermission("open_chamado") || hasPermission("register_operacao")) && (
        <button
          onClick={() => setFabOpen(true)}
          className={cn(
            "fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full shadow-lg",
            "bg-destructive text-destructive-foreground flex items-center justify-center",
            "hover:scale-105 active:scale-95 transition-transform",
          )}
          aria-label="Novo incidente"
          title="Novo incidente"
        >
          <Siren className="h-6 w-6" />
        </button>
      )}

      {fabOpen && (
        <RegistroSheet
          open
          initialKind="chamado"
          eventFilterId={eventId}
          onClose={() => {
            setFabOpen(false);
            qc.invalidateQueries({ queryKey: ["op-evento-chamados"] });
          }}
        />
      )}
    </div>
  );
}

function KpiMini({
  icon: Icon, label, value, tone = "neutral",
}: { icon: any; label: string; value: number; tone?: "neutral" | "danger" }) {
  return (
    <Card className={cn(
      "p-2.5 flex items-center gap-2",
      tone === "danger" && value > 0 && "border-destructive/60 bg-destructive/5",
    )}>
      <Icon className={cn("h-4 w-4 shrink-0", tone === "danger" && value > 0 ? "text-destructive" : "text-muted-foreground")} />
      <div className="min-w-0">
        <p className={cn("text-lg font-bold leading-none", tone === "danger" && value > 0 && "text-destructive")}>{value}</p>
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      </div>
    </Card>
  );
}
