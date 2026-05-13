import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play, FileDown, RefreshCw, CheckCircle2, XCircle, Loader2, Clock,
  ChevronDown, ChevronRight, Activity, Target, AlertTriangle, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { printFunnelTestReport } from "@/lib/audience-pdf";

const STEP_LABELS: Record<string, string> = {
  navigate_home: "Navegar para home",
  click_event: "Clicar no evento",
  select_ticket: "Selecionar bilhete",
  add_to_cart: "Adicionar ao carrinho",
  open_cart: "Abrir carrinho",
  begin_checkout: "Iniciar checkout",
};

const STEP_ORDER = [
  "navigate_home", "click_event", "select_ticket",
  "add_to_cart", "open_cart", "begin_checkout",
];

const EXPECTED_PIXEL_EVENTS = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout"];

function fmtMs(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function severityClass(s?: string) {
  switch (s) {
    case "healthy": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    case "warning": return "bg-amber-500/15 text-amber-300 border-amber-500/40";
    case "critical": return "bg-red-500/15 text-red-300 border-red-500/40";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function statusBadgeClass(s?: string) {
  switch (s) {
    case "completed": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    case "failed": return "bg-red-500/15 text-red-300 border-red-500/40";
    case "running": return "bg-cyan-500/15 text-cyan-300 border-cyan-500/40";
    case "queued": return "bg-amber-500/15 text-amber-300 border-amber-500/40";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function StepStatusIcon({ status }: { status: string }) {
  if (status === "passed") return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (status === "failed") return <XCircle className="h-5 w-5 text-red-400" />;
  if (status === "running") return <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />;
  if (status === "skipped") return <AlertTriangle className="h-5 w-5 text-amber-400" />;
  return <Clock className="h-5 w-5 text-muted-foreground" />;
}

function lhStatus(metric: string, v: number | null | undefined): "good" | "warn" | "bad" | "unknown" {
  if (v == null) return "unknown";
  switch (metric) {
    case "lcp": return v <= 2500 ? "good" : v <= 4000 ? "warn" : "bad";
    case "tbt": return v <= 200 ? "good" : v <= 600 ? "warn" : "bad";
    case "tti": return v <= 3800 ? "good" : v <= 7300 ? "warn" : "bad";
    case "cls": return v <= 0.1 ? "good" : v <= 0.25 ? "warn" : "bad";
    case "perf": return v >= 0.9 ? "good" : v >= 0.5 ? "warn" : "bad";
  }
  return "unknown";
}

function lhColor(s: string) {
  if (s === "good") return "text-emerald-400";
  if (s === "warn") return "text-amber-400";
  if (s === "bad") return "text-red-400";
  return "text-muted-foreground";
}

export default function FunnelTest() {
  const navigate = useNavigate();
  const { active } = useAdAccountSelection();

  const [targetUrl, setTargetUrl] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<any | null>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pollRef = useRef<number | null>(null);

  const isActiveRun = run && (run.status === "queued" || run.status === "running");

  const urlValid = useMemo(() => /^https:\/\//i.test(targetUrl.trim()), [targetUrl]);

  // Load history
  const loadHistory = useCallback(async () => {
    const { data } = await (supabase as any)
      .schema("crm")
      .from("funnel_test_runs")
      .select("id, target_url, status, severity, started_at, completed_at")
      .order("started_at", { ascending: false })
      .limit(10);
    setHistory(data ?? []);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Polling
  const pollStatus = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-funnel-test-status", {
        body: { run_id: id },
      });
      if (error) throw error;
      if (data?.run) setRun(data.run);
      if (data?.steps) setSteps(data.steps);
      if (data?.run?.status === "completed" || data?.run?.status === "failed") {
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
        loadHistory();
      }
    } catch (e: any) {
      console.error("poll error", e);
    }
  }, [loadHistory]);

  useEffect(() => {
    if (!runId) return;
    pollStatus(runId);
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => pollStatus(runId), 2000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [runId, pollStatus]);

  const startRun = async () => {
    if (!urlValid) {
      setError("URL deve começar com https://");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-funnel-test-run", {
        body: {
          target_url: targetUrl.trim(),
          connection_id: active?.connection_id ?? null,
        },
      });
      if (error) throw error;
      if (data?.run_id) {
        setRun(null);
        setSteps([]);
        setExpanded({});
        setRunId(data.run_id);
      } else {
        throw new Error("Sem run_id na resposta");
      }
    } catch (e: any) {
      setError(e?.message ?? "Erro ao iniciar teste");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForNew = () => {
    setRun(null);
    setSteps([]);
    setRunId(null);
    setError(null);
    setExpanded({});
  };

  const loadHistoryRun = (id: string) => {
    setRun(null);
    setSteps([]);
    setExpanded({});
    setRunId(id);
  };

  // Build aggregate pixel events for verdict table
  const allPixelEvents = useMemo(() => {
    return steps.flatMap((s: any) => (s.pixel_events ?? []).map((e: any) => ({ ...e, step: s.step_name })));
  }, [steps]);

  const allConsoleErrors = useMemo(() => {
    return steps.flatMap((s: any) => (s.console_errors ?? []).map((e: any) => ({ ...e, step: s.step_name })));
  }, [steps]);

  const elapsed = useMemo(() => {
    if (!run?.started_at) return null;
    const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now();
    const start = new Date(run.started_at).getTime();
    return Math.max(0, end - start);
  }, [run]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-cyan-400" />
            Funnel Test 360
            <span className="text-[10px] uppercase font-bold px-2 py-1 rounded border bg-cyan-500/15 text-cyan-300 border-cyan-500/40">
              navegação real
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auditoria automatizada do funil Meta Pixel — navega, clica, valida cada evento ponto a ponto.
          </p>
        </div>
      </div>

      {/* BETA banner */}
      <Card className="p-3 border-amber-500/30 bg-amber-500/5">
        <p className="text-xs text-amber-200 flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <strong>Modo BETA:</strong> o motor de browser real (Browserless.io) será activado em breve.
            Por agora os resultados são simulados para validar o fluxo.
          </span>
        </p>
      </Card>

      {/* Input card */}
      {!isActiveRun && !run && (
        <Card className="p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">URL alvo</label>
            <Input
              value={targetUrl}
              onChange={(e) => { setTargetUrl(e.target.value); setError(null); }}
              placeholder="https://www.ticketline.pt/evento/..."
              className="mt-1"
              disabled={submitting}
            />
            {targetUrl && !urlValid && (
              <p className="text-xs text-red-400 mt-1">URL deve começar com https://</p>
            )}
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
          <button
            onClick={startRun}
            disabled={!urlValid || submitting}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/25 transition-colors disabled:opacity-50 font-semibold"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            Iniciar teste 360
          </button>
          <p className="text-xs text-muted-foreground text-center">
            O teste percorre 6 passos: home → evento → bilhete → carrinho → cart → checkout. Sem compra real.
          </p>
        </Card>
      )}

      {/* Progress card */}
      {run && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold">
                Run #<span className="font-mono">{run.id?.slice(0, 8)}</span>
              </h2>
              <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded border", statusBadgeClass(run.status))}>
                {run.status}
              </span>
              {elapsed != null && (
                <span className="text-xs text-muted-foreground">
                  {isActiveRun ? "a correr há " : "duração "}{fmtMs(elapsed)}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate max-w-md" title={run.target_url}>
              {run.target_url}
            </div>
          </div>

          <div className="space-y-2">
            {STEP_ORDER.map((stepName, idx) => {
              const step = steps.find((s: any) => s.step_name === stepName);
              const status = step?.step_status ?? (isActiveRun ? "pending" : "pending");
              const isExpanded = !!expanded[stepName];
              const canExpand = step && (status === "passed" || status === "failed");
              return (
                <div key={stepName} className="rounded-md border border-border bg-card/40">
                  <button
                    onClick={() => canExpand && setExpanded((p) => ({ ...p, [stepName]: !p[stepName] }))}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 text-left",
                      canExpand && "hover:bg-muted/30 cursor-pointer"
                    )}
                    disabled={!canExpand}
                  >
                    <div className="text-xs text-muted-foreground font-mono w-6">{idx + 1}.</div>
                    <StepStatusIcon status={status} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{STEP_LABELS[stepName]}</div>
                      {step?.url_at_step && (
                        <div className="text-[11px] text-muted-foreground truncate font-mono">{step.url_at_step}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">{fmtMs(step?.duration_ms)}</div>
                    {canExpand && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                  </button>

                  {isExpanded && step && (
                    <div className="border-t border-border p-3 space-y-3 bg-background/40">
                      {step.screenshot_url && (
                        <img src={step.screenshot_url} alt={stepName} className="w-full max-w-md rounded border border-border" />
                      )}
                      {step.pixel_events?.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pixel events</div>
                          <div className="flex flex-wrap gap-1.5">
                            {step.pixel_events.map((ev: any, i: number) => (
                              <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                {ev.event}
                                {ev.value != null && ` · ${ev.value} ${ev.currency ?? ""}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {step.console_errors?.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Console</div>
                          <ul className="text-xs space-y-1">
                            {step.console_errors.map((e: any, i: number) => (
                              <li key={i} className={e.level === "error" ? "text-red-400" : "text-amber-400"}>
                                [{e.level}] {e.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {step.lighthouse && (
                        <div className="grid grid-cols-5 gap-2">
                          {(["lcp", "tbt", "tti", "cls", "perf"] as const).map((m) => {
                            const v = m === "perf" ? step.lighthouse.performance : step.lighthouse[m];
                            const s = lhStatus(m, v);
                            return (
                              <div key={m} className="rounded border border-border bg-card/50 p-2 text-center">
                                <div className="text-[9px] uppercase text-muted-foreground">{m}</div>
                                <div className={cn("text-sm font-bold tabular-nums", lhColor(s))}>
                                  {v == null ? "—" : m === "cls" ? v.toFixed(2) : m === "perf" ? Math.round(v * 100) : `${v}`}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Result card */}
      {run && (run.status === "completed" || run.status === "failed") && (
        <Card className="p-5 space-y-5">
          {run.ai_summary && (
            <div className="rounded-md border border-border bg-card/50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold">Veredicto IA</span>
                {run.severity && (
                  <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded border", severityClass(run.severity))}>
                    {run.severity}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{run.ai_summary}</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2">Eventos Pixel: esperados vs detectados</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 px-2">Evento</th>
                    <th className="py-2 px-2 text-center">Esperado</th>
                    <th className="py-2 px-2 text-center">Detectado</th>
                    <th className="py-2 px-2">Quando (step)</th>
                    <th className="py-2 px-2 text-right">Value</th>
                    <th className="py-2 px-2">Currency</th>
                    <th className="py-2 px-2">Content IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPECTED_PIXEL_EVENTS.map((evName) => {
                    const found = allPixelEvents.find((e: any) => e.event === evName);
                    return (
                      <tr key={evName} className="border-b border-border/50">
                        <td className="py-2 px-2 font-medium">{evName}</td>
                        <td className="py-2 px-2 text-center"><CheckCircle2 className="h-4 w-4 text-emerald-400 inline" /></td>
                        <td className="py-2 px-2 text-center">
                          {found
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-400 inline" />
                            : <XCircle className="h-4 w-4 text-red-400 inline" />}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{found ? STEP_LABELS[found.step] ?? found.step : "—"}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{found?.value ?? "—"}</td>
                        <td className="py-2 px-2">{found?.currency ?? "—"}</td>
                        <td className="py-2 px-2 font-mono text-[10px]">{found?.content_ids?.join(", ") ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {allConsoleErrors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Console errors ({allConsoleErrors.length})</h3>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {allConsoleErrors.slice(0, 10).map((e: any, i: number) => (
                  <li key={i} className={e.level === "error" ? "text-red-400" : "text-amber-400"}>
                    [{e.level}] [{STEP_LABELS[e.step] ?? e.step}] {e.message}
                  </li>
                ))}
              </ul>
              {allConsoleErrors.length > 10 && (
                <p className="text-[11px] text-muted-foreground mt-1">… e mais {allConsoleErrors.length - 10} entradas no PDF.</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => printFunnelTestReport(run, steps)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/25 transition-colors"
            >
              <FileDown className="h-4 w-4" />
              Gerar PDF defensável
            </button>
            <button
              onClick={resetForNew}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted/40 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Novo teste
            </button>
          </div>
        </Card>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card className="p-4">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Histórico (últimos {history.length})</h3>
          <div className="space-y-1">
            {history.map((h: any) => (
              <button
                key={h.id}
                onClick={() => loadHistoryRun(h.id)}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded text-xs hover:bg-muted/40 text-left"
              >
                <span className="text-muted-foreground tabular-nums">
                  {new Date(h.started_at).toLocaleString("pt-PT")}
                </span>
                <span className="flex-1 truncate font-mono text-[11px]">{h.target_url}</span>
                {h.severity && (
                  <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", severityClass(h.severity))}>
                    {h.severity}
                  </span>
                )}
                <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", statusBadgeClass(h.status))}>
                  {h.status}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
