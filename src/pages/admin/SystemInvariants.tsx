import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, RefreshCw, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";

interface InvariantRow {
  code: string;
  severity: "error" | "warn";
  title: string;
  offenders: number;
  sample: unknown;
  checked_at: string;
}

interface SmokeRow {
  code: string;
  ok: boolean;
  error: string | null;
  checked_at: string;
}

export default function SystemInvariants() {
  const { role } = useCompany();
  const allowed = role === "admin" || role === "manager" || role === "platform_admin";
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const invariants = useQuery({
    queryKey: ["system-invariants"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("check_system_invariants");
      if (error) throw error;
      return (data ?? []) as InvariantRow[];
    },
  });

  const smoke = useQuery({
    queryKey: ["rpc-smoke"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("check_rpc_smoke");
      if (error) throw error;
      return (data ?? []) as SmokeRow[];
    },
  });

  if (!allowed) {
    return <p className="text-sm text-muted-foreground">Sem permissão para ver esta página.</p>;
  }

  const rerun = () => {
    invariants.refetch();
    smoke.refetch();
  };

  const failing = (smoke.data ?? []).filter((r) => !r.ok);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Verificador de Invariantes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Diagnóstico apenas — nada é corrigido automaticamente. Verde = zero casos.
          </p>
        </div>
        <Button variant="outline" onClick={rerun} disabled={invariants.isFetching || smoke.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${invariants.isFetching || smoke.isFetching ? "animate-spin" : ""}`} />
          Reexecutar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invariantes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {invariants.isLoading && <p className="text-sm text-muted-foreground">A verificar…</p>}
          {invariants.error && (
            <p className="text-sm text-destructive">{(invariants.error as Error).message}</p>
          )}
          {(invariants.data ?? []).map((row) => {
            const clean = Number(row.offenders) === 0;
            const isOpen = !!open[row.code];
            return (
              <div key={row.code} className="rounded-lg border p-3">
                <button
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => setOpen((o) => ({ ...o, [row.code]: !o[row.code] }))}
                >
                  {clean ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                  ) : row.severity === "error" ? (
                    <XCircle className="h-5 w-5 shrink-0 text-destructive" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
                      <Badge variant={row.severity === "error" ? "destructive" : "secondary"}>
                        {row.severity}
                      </Badge>
                      <span className="font-semibold">{Number(row.offenders)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{row.title}</p>
                  </div>
                  {!clean && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                </button>
                {isOpen && !clean && (
                  <pre className="mt-3 overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(row.sample, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Smoke test de RPCs {smoke.data ? `— ${failing.length} falha(s) em ${smoke.data.length}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {smoke.isLoading && <p className="text-sm text-muted-foreground">A chamar RPCs…</p>}
          {smoke.error && <p className="text-sm text-destructive">{(smoke.error as Error).message}</p>}
          {(smoke.data ?? []).map((row) => (
            <div key={row.code} className="flex items-start gap-3 rounded border p-2">
              {row.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <span className="font-mono text-xs">{row.code}</span>
                {row.error && <p className="text-xs text-destructive break-all">{row.error}</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
