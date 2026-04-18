import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, BarChart3, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ActivityRow {
  user_id: string;
  page: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string | null;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function UserActivityLog() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const { data: profiles = [] } = useQuery<ProfileRow[]>({
    queryKey: ["profiles-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data;
    },
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: activities = [], isLoading } = useQuery<ActivityRow[]>({
    queryKey: ["user-activity-log-7d"],
    queryFn: async () => {
      // Paginate to bypass default 1000-row limit
      const PAGE_SIZE = 1000;
      let all: ActivityRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await (supabase as any)
          .from("user_activity_log")
          .select("user_id, page, created_at")
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const batch = (data ?? []) as ActivityRow[];
        all = all.concat(batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
    refetchInterval: 60_000,
  });

  if (!isAdmin) return <Navigate to="/" replace />;

  // Build profile map
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // Calculate per-user usage time by summing intervals between consecutive logs.
  // If the gap exceeds MAX_GAP_SECONDS, treat as inactive and count only a base interval.
  const BASE_INTERVAL_SECONDS = 30; // assumed activity per isolated log
  const MAX_GAP_SECONDS = 5 * 60; // cap gaps > 5 min (user likely went away)
  const userTimeMap = new Map<string, number>(); // user_id -> total seconds (7d)
  const userTodayMap = new Map<string, number>(); // user_id -> total seconds (today)
  const pageTimeMap = new Map<string, number>(); // page -> total seconds

  // Local "today" boundary (Europe/Lisbon — uses browser local time)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  // Group activities by user (already sorted ascending by created_at)
  const byUser = new Map<string, ActivityRow[]>();
  for (const act of activities) {
    const arr = byUser.get(act.user_id) ?? [];
    arr.push(act);
    byUser.set(act.user_id, arr);
  }

  for (const [userId, logs] of byUser) {
    let prevTimeMs: number | null = null;
    for (const log of logs) {
      const tMs = new Date(log.created_at).getTime();
      let increment: number;
      if (prevTimeMs === null) {
        increment = BASE_INTERVAL_SECONDS;
      } else {
        const gapSec = (tMs - prevTimeMs) / 1000;
        increment = gapSec > MAX_GAP_SECONDS ? BASE_INTERVAL_SECONDS : gapSec;
      }
      userTimeMap.set(userId, (userTimeMap.get(userId) ?? 0) + increment);
      pageTimeMap.set(log.page, (pageTimeMap.get(log.page) ?? 0) + increment);
      if (tMs >= startOfTodayMs) {
        userTodayMap.set(userId, (userTodayMap.get(userId) ?? 0) + increment);
      }
      prevTimeMs = tMs;
    }
  }

  // Sort users by usage time desc
  const userStats = Array.from(userTimeMap.entries())
    .map(([userId, totalSec]) => ({
      userId,
      name: profileMap.get(userId)?.full_name || profileMap.get(userId)?.email || userId.slice(0, 8),
      email: profileMap.get(userId)?.email ?? "",
      totalMinutes: totalSec / 60,
      todayMinutes: (userTodayMap.get(userId) ?? 0) / 60,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  // Top 5 sections
  const topSections = Array.from(pageTimeMap.entries())
    .map(([page, totalSec]) => ({ page, totalMinutes: totalSec / 60 }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 5);

  const maxSectionMinutes = topSections[0]?.totalMinutes ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <button
            onClick={() => navigate("/admin")}
            className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          Atividade dos Utilizadores
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tempo de utilização nos últimos 7 dias
        </p>
      </div>

      {/* Top 5 Sections */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Top 5 Secções Mais Utilizadas
        </h2>
        {topSections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados de atividade.</p>
        ) : (
          <div className="space-y-2">
            {topSections.map((s, i) => (
              <div key={s.page} className="flex items-center gap-3">
                <Badge variant="outline" className="w-6 justify-center text-xs">
                  {i + 1}
                </Badge>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{s.page}</span>
                    <span className="text-muted-foreground text-xs">{formatDuration(s.totalMinutes)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(s.totalMinutes / maxSectionMinutes) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Tempo por Utilizador
        </h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : userStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem atividade registada nos últimos 7 dias.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilizador</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Hoje</TableHead>
                <TableHead className="text-right">7 Dias</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userStats.map((u) => (
                <TableRow key={u.userId}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-sm">{u.todayMinutes > 0 ? formatDuration(u.todayMinutes) : "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-sm">{formatDuration(u.totalMinutes)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
