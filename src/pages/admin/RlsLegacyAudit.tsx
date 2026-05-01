import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { ShieldAlert, ShieldCheck, RefreshCw, Loader2, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

interface PolicyDetail {
  schemaname: string;
  tablename: string;
  policyname: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

interface AuditReport {
  id: string;
  ran_at: string;
  environment: string;
  legacy_count: number;
  total_policies: number;
  status: "green" | "red";
  details: PolicyDetail[];
  triggered_by: "cron" | "manual";
  triggered_by_user: string | null;
  notes: string | null;
}

export default function RlsLegacyAudit() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const isAuthorized = role === "admin" || role === ("platform_admin" as any);
  const [running, setRunning] = useState(false);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["rls_legacy_audit_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rls_legacy_audit_reports")
        .select("*")
        .order("ran_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as AuditReport[];
    },
    enabled: isAuthorized,
  });

  if (!isAuthorized) {
    return <Navigate to="/" replace />;
  }

  const latest = reports?.[0];

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-rls-legacy-audit", {
        body: { source: "manual" },
      });
      if (error) throw error;
      toast({
        title: "Auditoria executada",
        description:
          data?.report?.legacy_count === 0
            ? "Sem policies legacy. Tudo limpo."
            : `Encontradas ${data?.report?.legacy_count} policies legacy.`,
      });
      qc.invalidateQueries({ queryKey: ["rls_legacy_audit_reports"] });
    } catch (e: any) {
      toast({
        title: "Erro a executar auditoria",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-primary" />
            Auditoria RLS Legacy
          </h1>
          <p className="text-muted-foreground mt-1">
            Conta diariamente as policies em <code>public</code> que ainda usam o padrão antigo{" "}
            <code>auth.uid() IS NOT NULL</code>. Execução automática às 02:30 UTC.
          </p>
        </div>
        <Button onClick={runNow} disabled={running}>
          {running ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Executar agora
        </Button>
      </div>

      {/* Estado atual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {latest?.status === "green" ? (
              <ShieldCheck className="h-5 w-5 text-green-500" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            )}
            Estado atual
          </CardTitle>
          <CardDescription>
            Última verificação:{" "}
            {latest
              ? format(parseISO(latest.ran_at), "dd/MM/yyyy HH:mm:ss", { locale: pt })
              : "—"}{" "}
            ({latest?.triggered_by ?? "—"})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {latest ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Stat label="Policies legacy" value={latest.legacy_count} highlight={latest.status === "red"} />
              <Stat label="Total policies (public)" value={latest.total_policies} />
              <div className="flex items-center">
                <Badge
                  variant={latest.status === "green" ? "default" : "destructive"}
                  className="text-base px-3 py-1"
                >
                  {latest.status === "green" ? "VERDE — limpo" : "VERMELHO — corrigir"}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Sem relatórios ainda. Carrega <strong>Executar agora</strong> para criar o primeiro.
            </p>
          )}

          {latest && latest.details && latest.details.length > 0 && (
            <Collapsible className="mt-6">
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  Ver {latest.details.length} policies legacy
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Tabela</th>
                        <th className="text-left p-2">Policy</th>
                        <th className="text-left p-2">CMD</th>
                        <th className="text-left p-2">Critério</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latest.details.map((p, i) => (
                        <tr key={i} className="border-t align-top">
                          <td className="p-2 font-mono">{p.tablename}</td>
                          <td className="p-2">{p.policyname}</td>
                          <td className="p-2">
                            <Badge variant="outline">{p.cmd}</Badge>
                          </td>
                          <td className="p-2 font-mono text-xs text-muted-foreground">
                            {p.qual ?? p.with_check ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico ({reports?.length ?? 0} execuções)</CardTitle>
          <CardDescription>Últimos 60 relatórios</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : !reports || reports.length === 0 ? (
            <p className="text-muted-foreground">Sem histórico ainda.</p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Quando</th>
                    <th className="text-left p-2">Origem</th>
                    <th className="text-right p-2">Legacy</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-left p-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">
                        {format(parseISO(r.ran_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline">{r.triggered_by}</Badge>
                      </td>
                      <td className="p-2 text-right font-mono">{r.legacy_count}</td>
                      <td className="p-2 text-right font-mono">{r.total_policies}</td>
                      <td className="p-2">
                        <Badge variant={r.status === "green" ? "default" : "destructive"}>
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div
        className={`text-3xl font-bold mt-1 ${highlight ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
