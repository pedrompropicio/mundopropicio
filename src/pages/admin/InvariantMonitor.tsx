import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  XCircle,
  Play,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface CheckRow {
  name: string;
  description: string;
  severity: "error" | "warn";
  scope: "empresa" | "global";
  current_count: number;
  reference_count: number;
  conforme: boolean;
  notes: string | null;
  sample: unknown;
}

interface RunRow {
  id: string;
  ran_at: string;
  drift_count: number;
  results: CheckRow[] | null;
}

interface SmokeRow {
  code: string;
  ok: boolean;
  error: string | null;
  checked_at: string;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

export default function InvariantMonitor() {
  const { role } = useAuth();
  const allowed = role === "admin" || role === "platform_admin";
  const qc = useQueryClient();
  const [accepting, setAccepting] = useState<CheckRow | null>(null);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const checks = useQuery({
    queryKey: ["invariant-checks"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("run_invariant_checks");
      if (error) throw error;
      return (data ?? []) as CheckRow[];
    },
  });

  const runs = useQuery({
    queryKey: ["invariant-runs"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invariant_runs")
        .select("id, ran_at, drift_count, results")
        .order("ran_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as RunRow[];
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

  const runNow = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("run_invariant_checks_and_log");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verificação executada e registada.");
      qc.invalidateQueries({ queryKey: ["invariant-checks"] });
      qc.invalidateQueries({ queryKey: ["invariant-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptRef = useMutation({
    mutationFn: async ({ row, text }: { row: CheckRow; text: string }) => {
      const { error } = await (supabase as any).rpc("accept_invariant_reference", {
        _name: row.name,
        _new_reference: row.current_count,
        _note: text,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nova referência aceite.");
      setAccepting(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["invariant-checks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) {
    return <p className="text-sm text-muted-foreground">Sem permissão para ver esta página.</p>;
  }

  const rows = checks.data ?? [];
  const drift = rows.filter((r) => !r.conforme);
  const lastRun = runs.data?.[0];
  const failingSmoke = (smoke.data ?? []).filter((r) => !r.ok);

  const renderRow = (row: CheckRow) => {
    const hasSample = Array.isArray(row.sample) && (row.sample as unknown[]).length > 0;
    const isOpen = !!open[row.name];
    return (
      <div key={row.name} className="rounded-lg border p-3">
        <div className="flex items-start gap-3">
          {row.conforme ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          ) : row.severity === "error" ? (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{row.name}</span>
              <Badge variant={row.severity === "error" ? "destructive" : "secondary"}>
                {row.severity === "error" ? "grave" : "aviso"}
              </Badge>
              <span className="text-sm font-semibold">
                {row.current_count}
                <span className="ml-1 font-normal text-muted-foreground">
                  (referência {row.reference_count})
                </span>
              </span>
            </div>
            <p className="text-sm text-foreground/90">{row.description}</p>
            {row.notes && (
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{row.notes}</p>
            )}
            {hasSample && (
              <button
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setOpen((o) => ({ ...o, [row.name]: !o[row.name] }))}
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Amostra ({(row.sample as unknown[]).length} de {row.current_count})
              </button>
            )}
            {isOpen && hasSample && (
              <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(row.sample, null, 2)}
              </pre>
            )}
          </div>
          {!row.conforme && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAccepting(row);
                setNote("");
              }}
            >
              Aceitar {row.current_count} como referência
            </Button>
          )}
        </div>
      </div>
    );
  };

  const familia = (scope: "empresa" | "global") => rows.filter((r) => r.scope === scope);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Verificador de Invariantes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conta linhas e compara com o valor de referência. Só alerta quando um número se afasta da
            referência — nunca corrige nada.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => checks.refetch()} disabled={checks.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${checks.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            <Play className="mr-2 h-4 w-4" />
            Correr agora
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Última execução registada</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {lastRun ? (
            <span>
              {fmtDate(lastRun.ran_at)} —{" "}
              {lastRun.drift_count === 0
                ? "todas as verificações na referência"
                : `${lastRun.drift_count} fora da referência`}
            </span>
          ) : (
            "Ainda sem execuções registadas."
          )}
        </CardContent>
      </Card>

      {checks.isLoading && <p className="text-sm text-muted-foreground">A verificar…</p>}
      {checks.error && <p className="text-sm text-destructive">{(checks.error as Error).message}</p>}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Fronteira entre empresas e integridade estrutural
            {familia("global").length > 0 &&
              ` — ${familia("global").filter((r) => !r.conforme).length} fora da referência em ${familia("global").length}`}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            «O sistema deixou vazar entre empresas» — atravessa todas as empresas.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">{familia("global").map(renderRow)}</CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Regras de negócio dentro de cada empresa
            {familia("empresa").length > 0 &&
              ` — ${familia("empresa").filter((r) => !r.conforme).length} fora da referência em ${familia("empresa").length}`}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            «Há dados mal formados» — a amostra traz a empresa de cada linha infratora.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">{familia("empresa").map(renderRow)}</CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico de execuções</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {runs.isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
          {(runs.data ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span className="text-muted-foreground">{fmtDate(r.ran_at)}</span>
              {r.drift_count === 0 ? (
                <Badge variant="secondary">na referência</Badge>
              ) : (
                <Badge variant="destructive">{r.drift_count} fora da referência</Badge>
              )}
            </div>
          ))}
          {!runs.isLoading && (runs.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Sem execuções registadas.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Smoke test de consultas
            {smoke.data ? ` — ${failingSmoke.length} falha(s) em ${smoke.data.length}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {smoke.isLoading && <p className="text-sm text-muted-foreground">A chamar consultas…</p>}
          {smoke.error && <p className="text-sm text-destructive">{(smoke.error as Error).message}</p>}
          {(smoke.data ?? []).map((r) => (
            <div key={r.code} className="flex items-start gap-3 rounded border p-2">
              {r.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <span className="font-mono text-xs">{r.code}</span>
                {r.error && <p className="break-all text-xs text-destructive">{r.error}</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!accepting} onOpenChange={(o) => !o && setAccepting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aceitar contagem atual como referência</DialogTitle>
            <DialogDescription>
              {accepting?.description} — a referência passa de {accepting?.reference_count} para{" "}
              {accepting?.current_count}. A nota é obrigatória e fica registada com o seu nome.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Porque é que esta contagem passa a ser aceitável…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccepting(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!note.trim() || acceptRef.isPending}
              onClick={() => accepting && acceptRef.mutate({ row: accepting, text: note })}
            >
              Aceitar referência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
