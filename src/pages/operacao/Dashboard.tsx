import { useMemo, useState } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
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
import { ListChecks, Play, AlertTriangle, Bell, CheckCircle2, ShieldAlert, FileDown, ArrowLeft } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";

const PERIODS = [
  { id: "today", label: "Hoje", days: 1 },
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "30 dias", days: 30 },
  { id: "all", label: "Tudo", days: 9999 },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(var(--muted-foreground))",
  in_progress: "hsl(217 91% 60%)",
  blocked: "hsl(38 92% 50%)",
  done: "hsl(142 71% 45%)",
};

export default function Dashboard() {
  const { hasPermission, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOperacaoFilters();
  const [period, setPeriod] = useState("7d");
  const days = PERIODS.find((p) => p.id === period)?.days ?? 7;
  const periodStart = useMemo(() => startOfDay(subDays(new Date(), days - 1)).toISOString(), [days]);

  const canView = isAdmin || hasPermission("view_operacao");

  const { data: frentes } = useQuery({
    queryKey: ["dash-frentes", filters.event, filters.frentes.join(",")],
    enabled: !!filters.event && canView,
    queryFn: async () => {
      let q = supabase.from("operacao_frentes").select("id,name,color,status").eq("event_id", filters.event!).neq("status", "cancelled");
      const { data } = await q;
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
      const { data } = await supabase.from("operacao_etapas").select("id,frente_id,status").in("frente_id", ids);
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
      const { data } = await supabase
        .from("operacao_registros")
        .select("id,kind,created_at")
        .in("frente_id", ids).neq("kind", "chamado").gte("created_at", periodStart);
      return data ?? [];
    },
  });

  // KPIs
  const totalEtapas = (etapas ?? []).length;
  const doneEtapas = (etapas ?? []).filter((e: any) => e.status === "done").length;
  const inProgress = (etapas ?? []).filter((e: any) => e.status === "in_progress").length;
  const blocked = (etapas ?? []).filter((e: any) => e.status === "blocked").length;
  const openCh = (chamados ?? []).filter((c: any) => c.status === "open" || c.status === "in_progress");
  const byPrio: Record<string, number> = { crit: 0, high: 0, med: 0, low: 0 };
  openCh.forEach((c: any) => { if (byPrio[c.priority] != null) byPrio[c.priority]++; });
  const resolvedInPeriod = (chamados ?? []).filter((c: any) => c.resolved_at && c.resolved_at >= periodStart).length;
  const breaches = (chamados ?? []).filter((c: any) => (c.escalation_level ?? 0) >= 2 && c.created_at >= periodStart).length;
  const donePct = totalEtapas > 0 ? Math.round((doneEtapas / totalEtapas) * 100) : 0;

  // Chart: progresso por frente
  const progressData = (frentes ?? []).map((f: any) => {
    const fEt = (etapas ?? []).filter((e: any) => e.frente_id === f.id);
    const fDone = fEt.filter((e: any) => e.status === "done").length;
    return { name: f.name, pct: fEt.length ? Math.round((fDone / fEt.length) * 100) : 0, fill: f.color ?? "#6b7280" };
  });

  // Chart: atividade
  const actByDay: Record<string, number> = {};
  for (let i = 0; i < days && i < 60; i++) {
    const d = format(subDays(new Date(), i), "yyyy-MM-dd");
    actByDay[d] = 0;
  }
  (registos ?? []).forEach((r: any) => {
    const d = format(new Date(r.created_at), "yyyy-MM-dd");
    if (actByDay[d] != null) actByDay[d]++;
  });
  const actData = Object.entries(actByDay).map(([d, c]) => ({ day: d.slice(5), count: c })).reverse();

  // Donut
  const statusData = (["pending", "in_progress", "blocked", "done"] as const).map((s) => ({
    name: s, value: (etapas ?? []).filter((e: any) => e.status === s).length, color: STATUS_COLORS[s],
  }));

  const last10 = (chamados ?? []).slice(0, 10);

  if (!canView) return <div className="p-6">Sem permissão.</div>;

  return (
    <div>
      <OperacaoFiltersBar />
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
        <KpiCard label="Etapas totais" value={totalEtapas} subLabel={`${donePct}% concluídas`} icon={ListChecks} />
        <KpiCard label="Em curso" value={inProgress} icon={Play} tone="blue" />
        <KpiCard label="Bloqueadas" value={blocked} icon={AlertTriangle} tone="amber" />
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
        <KpiCard label="Resolvidos no período" value={resolvedInPeriod} icon={CheckCircle2} tone="green" />
        <KpiCard label="SLA breaches" value={breaches} icon={ShieldAlert} tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <UICard className="p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-2">Progresso por Frente</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, progressData.length * 32)}>
            <BarChart data={progressData} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="name" width={120} />
              <RTooltip />
              <Bar dataKey="pct">
                {progressData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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
    </div>
  );
}
