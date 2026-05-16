import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";

type Row = {
  sync_name: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_duration_sec: number | null;
  seconds_since_last_run: number | null;
  runs_needing_action_24h: number;
  runs_success_24h: number;
  expected_runs_24h: number;
  is_stale: boolean;
  health: "ok" | "warning" | "critical";
};

const urlFor = (name: string) =>
  name.startsWith("Coala") ? "/admin/sync-coala" : "/admin/fever-sync";

function fmtSince(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `há ${sec}s`;
  if (sec < 3600) return `há ${Math.round(sec / 60)} min`;
  if (sec < 86400) return `há ${Math.round(sec / 3600)} h`;
  return `há ${Math.round(sec / 86400)} d`;
}

function healthBadge(h: Row["health"]) {
  if (h === "critical") return <Badge variant="destructive">Critical</Badge>;
  if (h === "warning")
    return <Badge className="bg-yellow-500 text-black hover:bg-yellow-500/90">Warning</Badge>;
  return <Badge className="bg-green-600 hover:bg-green-600/90">OK</Badge>;
}

export default function SyncHealth() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["vw_sync_health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_sync_health" as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("sync-health-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "coala_sync_runs" },
        () => qc.invalidateQueries({ queryKey: ["vw_sync_health"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fever_sync_runs" },
        () => qc.invalidateQueries({ queryKey: ["vw_sync_health"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const rows = q.data ?? [];
  const okCount = rows.filter((r) => r.health === "ok").length;
  const warnCount = rows.filter((r) => r.health === "warning").length;
  const critCount = rows.filter((r) => r.health === "critical").length;
  const hasCrit = critCount > 0;
  const hasWarn = warnCount > 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7" /> Sync Health
          </h1>
          <p className="text-muted-foreground">Estado consolidado de todos os syncs automáticos.</p>
        </div>
        <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
        </Button>
      </div>

      {hasCrit && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-medium">
              {critCount} sync{critCount > 1 ? "s" : ""} em estado crítico. Intervenção necessária.
            </span>
          </CardContent>
        </Card>
      )}
      {!hasCrit && hasWarn && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <span className="font-medium">
              {warnCount} sync{warnCount > 1 ? "s" : ""} com avisos. Verifica quando puderes.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>OK</CardDescription>
            <CardTitle className="text-3xl text-green-600 flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6" /> {okCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Warnings</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{warnCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Critical</CardDescription>
            <CardTitle className="text-3xl text-destructive">{critCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Syncs</CardTitle>
          <CardDescription>Refresh automático a cada 30s (+ realtime).</CardDescription>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sync</TableHead>
                  <TableHead>Saúde</TableHead>
                  <TableHead>Última run</TableHead>
                  <TableHead>24h (✓ / a rever / ✗)</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.sync_name}>
                    <TableCell className="font-medium">{r.sync_name}</TableCell>
                    <TableCell>{healthBadge(r.health)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-mono">{r.last_run_status ?? "—"}</span>
                        <span className="text-muted-foreground"> · {fmtSince(r.seconds_since_last_run)}</span>
                        {r.is_stale && (
                          <Badge variant="outline" className="ml-2 text-yellow-600 border-yellow-600">
                            stale
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-green-600">{r.runs_success_24h}</span>
                      {" / "}
                      <span className="text-yellow-600">{r.runs_needing_action_24h}</span>
                      <span className="text-muted-foreground"> (esperadas {r.expected_runs_24h})</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(urlFor(r.sync_name))}
                      >
                        Abrir admin <ExternalLink className="ml-1 h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nenhum sync configurado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
