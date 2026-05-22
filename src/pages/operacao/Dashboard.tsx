import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperacaoFilters } from "@/hooks/useOperacaoFilters";
import { OperacaoFiltersBar } from "@/components/operacao/desktop/OperacaoFiltersBar";
import { KpiCard } from "@/components/operacao/desktop/KpiCard";
import { Card as UICard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { PriorityBadge } from "@/components/operacao/PriorityBadge";
import {
  ListChecks, Play, AlertTriangle, Bell, CheckCircle2, ShieldAlert,
  FileDown, ArrowLeft, Filter, Users, Clock, TrendingDown, UserX,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import { format, subDays, startOfDay, differenceInMilliseconds, eachDayOfInterval, parseISO } from "date-fns";

const PERIODS: { id: string; label: string; days: number | null }[] = [
  { id: "today", label: "Hoje", days: 1 },
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "30 dias", days: 30 },
  { id: "all", label: "Desde início", days: null },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(var(--muted-foreground))",
  in_progress: "hsl(217 91% 60%)",
  blocked: "hsl(38 92% 50%)",
  done: "hsl(142 71% 45%)",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em curso",
  blocked: "Bloqueada",
  done: "Concluída",
};

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}min`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days} dia${days > 1 ? "s" : ""} ${remHours}h`;
}

export default function Dashboard() {
  const { hasPermission, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOperacaoFilters();
  const [period, setPeriod] = useState("7d");
  const days = PERIODS.find((p) => p.id === period)?.days ?? null;
  const periodStart = useMemo(
    () => (days == null ? null : startOfDay(subDays(new Date(), days - 1)).toISOString()),
    [days],
  );

  const canView = isAdmin || hasPermission("view_operacao");

  const { data: frentes } = useQuery({
    queryKey: ["dash-frentes", filters.event, filters.frentes.join(",")],
    enabled: !!filters.event && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color,status,current_lead_id")
        .eq("event_id", filters.event!)
        .neq("status", "cancelled");
      let list = data ?? [];
      if (filters.frentes.length > 0) list = list.filter((f: any) => filters.frentes.includes(f.id));
      return list;
    },
  });

  const ids = (frentes ?? []).map((f: any) => f.id);

  const { data: etapas } = useQuery({
    queryKey: ["dash-etapas", ids],
    enabled: ids.length > 0 && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapas")
        .select("id,frente_id,status,responsible_profile_id,supplier_id,planned_start,planned_end,actual_end,updated_at")
        .in("frente_id", ids);
      return data ?? [];
    },
  });

  const etapaIds = (etapas ?? []).map((e: any) => e.id);

  const { data: assignees } = useQuery({
    queryKey: ["dash-assignees", etapaIds],
    enabled: etapaIds.length > 0 && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapa_assignees")
        .select("etapa_id,profile_id,role")
        .in("etapa_id", etapaIds);
      return data ?? [];
    },
  });

  const { data: etapaSuppliers } = useQuery({
    queryKey: ["dash-etapa-suppliers", etapaIds],
    enabled: etapaIds.length > 0 && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_etapa_suppliers")
        .select("etapa_id")
        .in("etapa_id", etapaIds);
      return data ?? [];
    },
  });

  const { data: chamados } = useQuery({
    queryKey: ["dash-chamados", ids, periodStart],
    enabled: ids.length > 0 && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_registros")
        .select("id,frente_id,status,priority,escalation_level,resolved_at,created_at,text,author:profiles!operacao_registros_author_profile_id_fkey(full_name)")
        .in("frente_id", ids).eq("kind", "chamado").order("created_at", { ascending: false }).limit(500);
      return data ?? [];
    },
  });

  const { data: registos } = useQuery({
    queryKey: ["dash-registos", ids, periodStart],
    enabled: ids.length > 0 && canView,
    queryFn: async () => {
      let q = supabase
        .from("operacao_registros")
        .select("id,kind,created_at")
        .in("frente_id", ids).neq("kind", "chamado");
      if (periodStart) q = q.gte("created_at", periodStart);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: profilesMap } = useQuery({
    queryKey: ["dash-profiles", etapaIds, ids],
    enabled: (etapaIds.length > 0 || ids.length > 0) && canView,
    queryFn: async () => {
      const ownerIds = new Set<string>();
      (etapas ?? []).forEach((e: any) => e.responsible_profile_id && ownerIds.add(e.responsible_profile_id));
      (assignees ?? []).forEach((a: any) => a.role === "owner" && ownerIds.add(a.profile_id));
      (frentes ?? []).forEach((f: any) => f.current_lead_id && ownerIds.add(f.current_lead_id));
      const arr = Array.from(ownerIds);
      if (arr.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("profiles").select("id,full_name").in("id", arr);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p.full_name ?? p.id.slice(0, 8); });
      return map;
    },
  });

  const { data: eventInfo } = useQuery({
    queryKey: ["dash-event-info", filters.event],
    enabled: !!filters.event && canView,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id,name,date").eq("id", filters.event!).maybeSingle();
      return data;
    },
  });

  // ===== KPIs existentes =====
  const totalEtapas = (etapas ?? []).length;
  const doneEtapas = (etapas ?? []).filter((e: any) => e.status === "done").length;
  const inProgress = (etapas ?? []).filter((e: any) => e.status === "in_progress").length;
  const blocked = (etapas ?? []).filter((e: any) => e.status === "blocked").length;
  const openCh = (chamados ?? []).filter((c: any) => c.status === "open" || c.status === "in_progress");
  const byPrio: Record<string, number> = { crit: 0, high: 0, med: 0, low: 0 };
  openCh.forEach((c: any) => { if (byPrio[c.priority] != null) byPrio[c.priority]++; });
  const resolvedInPeriod = (chamados ?? []).filter((c: any) => {
    if (!c.resolved_at) return false;
    return periodStart == null || c.resolved_at >= periodStart;
  }).length;
  const breaches = (chamados ?? []).filter((c: any) => {
    if ((c.escalation_level ?? 0) < 2) return false;
    return periodStart == null || c.created_at >= periodStart;
  }).length;
  const donePct = totalEtapas > 0 ? Math.round((doneEtapas / totalEtapas) * 100) : 0;

  // ===== Widget 1: Cobertura =====
  const ownerAssigneeByEtapa = useMemo(() => {
    const set = new Set<string>();
    (assignees ?? []).forEach((a: any) => { if (a.role === "owner") set.add(a.etapa_id); });
    return set;
  }, [assignees]);
  const supplierByEtapa = useMemo(() => {
    const set = new Set<string>();
    (etapaSuppliers ?? []).forEach((s: any) => set.add(s.etapa_id));
    return set;
  }, [etapaSuppliers]);

  const semResponsavel = (etapas ?? []).filter((e: any) => !e.responsible_profile_id && !ownerAssigneeByEtapa.has(e.id)).length;
  const semFornecedor = (etapas ?? []).filter((e: any) => !e.supplier_id && !supplierByEtapa.has(e.id)).length;
  const semDatas = (etapas ?? []).filter((e: any) => !e.planned_start || !e.planned_end).length;
  const comGaps = (etapas ?? []).filter((e: any) => {
    const r = !e.responsible_profile_id && !ownerAssigneeByEtapa.has(e.id);
    const s = !e.supplier_id && !supplierByEtapa.has(e.id);
    const d = !e.planned_start || !e.planned_end;
    return r || s || d;
  }).length;

  // ===== Widget 2: Carga por produtor =====
  const cargaData = useMemo(() => {
    const map = new Map<string, { in_progress: number; pending: number; blocked: number; done: number; total: number }>();
    const pmap = profilesMap ?? {};
    const ensure = (pid: string) => {
      if (!map.has(pid)) map.set(pid, { in_progress: 0, pending: 0, blocked: 0, done: 0, total: 0 });
      return map.get(pid)!;
    };
    const ownersByEtapa = new Map<string, Set<string>>();
    (assignees ?? []).forEach((a: any) => {
      if (a.role !== "owner") return;
      if (!ownersByEtapa.has(a.etapa_id)) ownersByEtapa.set(a.etapa_id, new Set());
      ownersByEtapa.get(a.etapa_id)!.add(a.profile_id);
    });
    (etapas ?? []).forEach((e: any) => {
      const owners = ownersByEtapa.get(e.id) ?? new Set<string>();
      if (e.responsible_profile_id) owners.add(e.responsible_profile_id);
      owners.forEach((pid) => {
        const slot = ensure(pid);
        if (slot[e.status as keyof typeof slot] != null) (slot as any)[e.status]++;
        slot.total++;
      });
    });
    const rows = Array.from(map.entries())
      .filter(([, v]) => v.total > 0)
      .map(([pid, v]) => ({ name: pmap[pid] ?? pid.slice(0, 8), ...v }))
      .sort((a, b) => b.total - a.total);
    const top = rows.slice(0, 10);
    const rest = rows.length - top.length;
    return { rows: top, rest };
  }, [etapas, assignees, profilesMap]);

  // ===== Widget 3: Tempo médio resolução =====
  const resolvedForAvg = (chamados ?? []).filter((c: any) => c.status === "resolved" && c.resolved_at && (periodStart == null || c.created_at >= periodStart));
  const avgMs = resolvedForAvg.length === 0
    ? 0
    : resolvedForAvg.reduce((acc: number, c: any) => acc + differenceInMilliseconds(new Date(c.resolved_at), new Date(c.created_at)), 0) / resolvedForAvg.length;
  const avgLabel = resolvedForAvg.length === 0 ? "—" : formatDuration(avgMs);

  // ===== Chart: Progresso por frente =====
  const progressData = (frentes ?? []).map((f: any) => {
    const fEt = (etapas ?? []).filter((e: any) => e.frente_id === f.id);
    const fDone = fEt.filter((e: any) => e.status === "done").length;
    return { name: f.name, pct: fEt.length ? Math.round((fDone / fEt.length) * 100) : 0, fill: f.color ?? "#6b7280" };
  });

  // ===== Chart: atividade =====
  const actData = useMemo(() => {
    let rangeDays = days ?? 30;
    if (days == null && (registos ?? []).length > 0) {
      const oldest = (registos ?? []).reduce((min: string, r: any) => (r.created_at < min ? r.created_at : min), (registos ?? [])[0].created_at);
      rangeDays = Math.max(1, Math.min(90, Math.ceil((Date.now() - new Date(oldest).getTime()) / 86400000) + 1));
    }
    const byDay: Record<string, number> = {};
    for (let i = 0; i < rangeDays; i++) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      byDay[d] = 0;
    }
    (registos ?? []).forEach((r: any) => {
      const d = format(new Date(r.created_at), "yyyy-MM-dd");
      if (byDay[d] != null) byDay[d]++;
    });
    return Object.entries(byDay).map(([d, c]) => ({ day: d.slice(5), count: c })).reverse();
  }, [registos, days]);

  // ===== Donut =====
  const statusData = (["pending", "in_progress", "blocked", "done"] as const).map((s) => ({
    name: STATUS_LABEL[s], value: (etapas ?? []).filter((e: any) => e.status === s).length, color: STATUS_COLORS[s],
  }));

  // ===== Widget 4: Burndown =====
  const burndownData = useMemo(() => {
    if (!eventInfo?.date || (etapas ?? []).length === 0) return null;
    const eventDate = parseISO(eventInfo.date);
    const planStarts = (etapas ?? []).map((e: any) => e.planned_start).filter(Boolean).map((s: string) => new Date(s));
    const startBase = planStarts.length > 0
      ? new Date(Math.min(...planStarts.map((d: Date) => d.getTime())))
      : startOfDay(subDays(eventDate, 14));
    const start = startOfDay(startBase);
    const end = startOfDay(eventDate);
    if (end.getTime() < start.getTime()) return null;
    const range = eachDayOfInterval({ start, end });
    if (range.length > 180) return null; // safety
    const total = (etapas ?? []).length;
    const rows = range.map((d) => {
      const dEnd = new Date(d.getTime() + 86400000 - 1);
      const planDone = (etapas ?? []).filter((e: any) => e.planned_end && new Date(e.planned_end) <= dEnd).length;
      const realDone = (etapas ?? []).filter((e: any) => {
        if (e.status !== "done") return false;
        const t = e.actual_end ?? e.updated_at;
        return t && new Date(t) <= dEnd;
      }).length;
      // Remaining: total - done (mais legível como "burndown")
      return {
        day: format(d, "dd/MM"),
        plano: Math.max(0, total - planDone),
        real: Math.max(0, total - realDone),
      };
    });
    const todayLabel = format(startOfDay(new Date()), "dd/MM");
    const todayInRange = range.some((d) => format(d, "dd/MM") === todayLabel);
    return { rows, todayLabel: todayInRange ? todayLabel : null, total };
  }, [eventInfo, etapas]);

  const last10 = (chamados ?? []).slice(0, 10);

  if (!canView) return <div className="p-6">Sem permissão.</div>;

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar
      </button>
      <OperacaoFiltersBar />

      {!filters.event ? (
        <UICard className="p-8 text-center mt-4">
          <Filter className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <h3 className="font-medium mb-1">Escolhe um evento</h3>
          <p className="text-sm text-muted-foreground">
            Seleciona um evento na barra de filtros acima para ver os dados.
          </p>
        </UICard>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <Button key={p.id} size="sm" variant={period === p.id ? "default" : "outline"} onClick={() => setPeriod(p.id)}>
                  {p.label}
                </Button>
              ))}
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><Button size="sm" variant="outline" disabled><FileDown className="h-3 w-3 mr-1" /> Exportar PDF</Button></span>
                </TooltipTrigger>
                <TooltipContent>Em breve</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Link to={`/operacao/etapas?event=${filters.event}`} className="block hover:opacity-90 transition">
              <KpiCard label="Etapas totais" value={totalEtapas} subLabel={`${donePct}% concluídas`} icon={ListChecks} />
            </Link>
            <Link to={`/operacao/etapas?event=${filters.event}&status=in_progress`} className="block hover:opacity-90 transition">
              <KpiCard label="Em curso" value={inProgress} icon={Play} tone="blue" />
            </Link>
            <Link to={`/operacao/etapas?event=${filters.event}&status=blocked`} className="block hover:opacity-90 transition">
              <KpiCard label="Bloqueadas" value={blocked} icon={AlertTriangle} tone="amber" />
            </Link>
            <Link to={`/operacao/chamados?event=${filters.event}&status=open,in_progress`} className="block hover:opacity-90 transition">
              <KpiCard
                label="Chamados abertos"
                value={openCh.length}
                subLabel={
                  <span className="flex gap-1.5">
                    <span className="text-red-500">{byPrio.crit}c</span>
                    <span className="text-orange-500">{byPrio.high}h</span>
                    <span className="text-yellow-600">{byPrio.med}m</span>
                    <span className="text-blue-500">{byPrio.low}b</span>
                  </span>
                }
                icon={Bell}
              />
            </Link>
            <KpiCard label="Resolvidos no período" value={resolvedInPeriod} icon={CheckCircle2} tone="green" />
            <KpiCard label="Atrasados" value={breaches} icon={ShieldAlert} tone="red" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <UICard className="p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold mb-2">Progresso por Frente</h3>
              {progressData.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">Sem frentes para mostrar.</div>
              ) : (() => {
                const rowH = 36;
                const chartH = Math.max(180, progressData.length * rowH + 40);
                // Em mobile, limita a altura visível e activa scroll vertical interno
                const maxVisible = 520;
                const needsScroll = chartH > maxVisible;
                return (
                  <div
                    className="w-full"
                    style={needsScroll ? { maxHeight: maxVisible, overflowY: "auto" } : undefined}
                  >
                    <ResponsiveContainer width="100%" height={chartH}>
                      <BarChart
                        data={progressData}
                        layout="vertical"
                        margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
                        barCategoryGap={6}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={170}
                          interval={0}
                          tick={(props: any) => {
                            const { x, y, payload } = props;
                            const raw = String(payload.value ?? "");
                            const max = 22;
                            const label = raw.length > max ? raw.slice(0, max - 1) + "…" : raw;
                            return (
                              <g transform={`translate(${x},${y})`}>
                                <title>{raw}</title>
                                <text
                                  x={-6}
                                  y={0}
                                  dy={4}
                                  textAnchor="end"
                                  fontSize={11}
                                  fill="currentColor"
                                  className="fill-muted-foreground"
                                >
                                  {label}
                                </text>
                              </g>
                            );
                          }}
                        />
                        <RTooltip formatter={(v: any) => [`${v}%`, "Concluído"]} />
                        <Bar dataKey="pct" minPointSize={2} radius={[0, 4, 4, 0]}>
                          {progressData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </UICard>

            <UICard className="p-4">
              <h3 className="text-sm font-semibold mb-2">Distribuição de status</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                    {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            </UICard>
          </div>

          <UICard className="p-4 mb-6">
            <h3 className="text-sm font-semibold mb-2">Atividade no período</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={actData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" />
                <YAxis allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </UICard>

          {/* ===== Widget 1: Cobertura ===== */}
          <UICard className="p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <UserX className="h-4 w-4" /> Cobertura de etapas
              </h3>
              <Link
                to={filters.event
                  ? `/operacao/etapas?event=${filters.event}&responsibility=sem_responsavel`
                  : "/operacao/etapas"}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Ver detalhes →
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link
                to={filters.event
                  ? `/operacao/etapas?event=${filters.event}&responsibility=sem_responsavel`
                  : "/operacao/etapas"}
                className="block hover:opacity-90 transition"
              >
                <KpiCard label="Sem responsável" value={semResponsavel} tone={semResponsavel > 0 ? "amber" : "default"} />
              </Link>
              <KpiCard label="Sem fornecedor" value={semFornecedor} tone={semFornecedor > 0 ? "amber" : "default"} />
              <KpiCard label="Sem datas" value={semDatas} tone={semDatas > 0 ? "amber" : "default"} />
              <KpiCard label="Total com gaps" value={comGaps} tone={comGaps > 0 ? "red" : "green"} subLabel={`de ${totalEtapas} etapas`} />
            </div>
          </UICard>

          {/* ===== Widget 2: Carga por produtor ===== */}
          <UICard className="p-4 mb-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" /> Carga por produtor
            </h3>
            {cargaData.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Sem produtores atribuídos.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(180, cargaData.rows.length * 36 + 60)}>
                  <BarChart data={cargaData.rows} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={140} />
                    <RTooltip />
                    <Legend />
                    <Bar dataKey="in_progress" stackId="a" fill={STATUS_COLORS.in_progress} name="Em curso" />
                    <Bar dataKey="pending" stackId="a" fill={STATUS_COLORS.pending} name="Pendente" />
                    <Bar dataKey="blocked" stackId="a" fill={STATUS_COLORS.blocked} name="Bloqueada" />
                    <Bar dataKey="done" stackId="a" fill={STATUS_COLORS.done} name="Concluída" />
                  </BarChart>
                </ResponsiveContainer>
                {cargaData.rest > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">+ {cargaData.rest} outro(s) produtor(es) não exibidos.</p>
                )}
              </>
            )}
          </UICard>

          {/* ===== Widget 3: Tempo médio de resolução ===== */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <KpiCard
              label="Tempo médio resolução"
              value={avgLabel}
              subLabel={`n=${resolvedForAvg.length}`}
              icon={Clock}
              tone="purple"
            />
          </div>

          {/* ===== Widget 4: Burndown ===== */}
          {burndownData && (
            <UICard className="p-4 mb-6">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" /> Burndown da montagem
                {eventInfo?.date && (
                  <span className="text-xs font-normal text-muted-foreground">
                    até {format(parseISO(eventInfo.date), "dd/MM/yyyy")}
                  </span>
                )}
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={burndownData.rows}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" />
                  <YAxis allowDecimals={false} domain={[0, burndownData.total]} />
                  <RTooltip />
                  <Legend />
                  {burndownData.todayLabel && (
                    <ReferenceLine x={burndownData.todayLabel} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: "Hoje", fill: "hsl(var(--primary))", fontSize: 11 }} />
                  )}
                  <Line type="monotone" dataKey="plano" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={2} name="Plano" dot={false} />
                  <Line type="monotone" dataKey="real" stroke="hsl(217 91% 60%)" strokeWidth={2} name="Real" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </UICard>
          )}

          <UICard className="p-4">
            <h3 className="text-sm font-semibold mb-2">Últimos chamados</h3>
            <div className="divide-y">
              {last10.length === 0 && <p className="text-sm text-muted-foreground py-3">Sem chamados.</p>}
              {last10.map((c: any) => (
                <Link key={c.id} to={`/operacao/chamado/${c.id}`} className="flex items-center gap-2 py-1.5 text-sm hover:bg-muted/40 rounded px-1">
                  <PriorityBadge priority={c.priority} />
                  <span className="truncate flex-1">{c.text ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{c.author?.full_name ?? ""}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(c.created_at), "dd/MM HH:mm")}</span>
                </Link>
              ))}
            </div>
          </UICard>
        </>
      )}
    </div>
  );
}
