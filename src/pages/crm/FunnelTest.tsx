import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import {
  Play, FileDown, RefreshCw, CheckCircle2, XCircle, Loader2, Clock,
  ChevronDown, ChevronRight, Activity, Target, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { printFunnelTestReport } from "@/lib/audience-pdf";
import { toast } from "sonner";

// Fase 2 multi-bilheteira: tipos para o seletor de eventos.
interface PlatformEvent {
  id: string;
  name: string;
  date: string | null;
  location: string | null;
  status: string;
  event_type: string;
  parent_event_id: string | null;
  ticketing_url: string | null;
  ticketing_provider: string | null;
}

// Master events não-selecionáveis (a URL de bilheteira é sempre por sessão).
const MASTER_EVENT_TYPES = new Set(["multi_day", "festival", "tour"]);

// G.1: STEP_LABELS contém AMBOS conjuntos (novos pós-G.1 + legados pré-G.1)
// para que runs históricas no histórico continuem a renderizar com o label correto
// sem precisar de migrar registos antigos em BD.
const STEP_LABELS: Record<string, string> = {
  // Novos (pós-G.1, fluxo Ticketline real)
  navigate_home: "Navegar para sessão",
  select_zone: "Selecionar zona",
  select_quantity: "Selecionar quantidade",
  add_to_cart: "Adicionar ao carrinho",
  open_cart_page: "Validar carrinho",
  initiate_checkout: "Iniciar checkout",
  // Legados (pré-G.1, mantidos para runs históricas)
  click_event: "Clicar no evento",
  select_ticket: "Selecionar bilhete",
  open_cart: "Abrir carrinho",
  begin_checkout: "Iniciar checkout",
};

// Template para o estado pending (run ainda não inseriu step rows).
// Em runs activas/completas, STEP_ORDER vem dinamicamente da BD (ver render).
const STEP_ORDER_TEMPLATE = [
  "navigate_home", "select_zone", "select_quantity",
  "add_to_cart", "open_cart_page", "initiate_checkout",
];

const EXPECTED_PIXEL_EVENTS = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout"];

function fmtMs(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function severityClass(s?: string) {
  switch (s) {
    case "info": return "bg-blue-500/15 text-blue-300 border-blue-500/40";
    case "healthy": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    case "warning": return "bg-amber-500/15 text-amber-300 border-amber-500/40";
    case "critical": return "bg-red-500/15 text-red-300 border-red-500/40";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

// Formata timestamp com fallback defensivo (PATCH 2.5).
// Aceita started_at OU created_at — render "—" se ambos inválidos.
function fmtHistoryDate(startedAt?: string | null, createdAt?: string | null): string {
  const candidate = startedAt ?? createdAt;
  if (!candidate) return "—";
  const t = new Date(candidate).getTime();
  if (isNaN(t)) return "—";
  return new Date(t).toLocaleString("pt-PT");
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [targetUrl, setTargetUrl] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<any | null>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // PATCH 4: distinguir "info" (HTTP 400 validação — ex: bilheteira não
  // suportada) de "error" (técnico — Browserless 500, timeout, etc.).
  const [errorKind, setErrorKind] = useState<"info" | "error">("error");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [candidateUrls, setCandidateUrls] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  // Fase 2: seletor de eventos da plataforma MP.
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const pollRef = useRef<number | null>(null);
  const autoTriggeredRef = useRef(false);

  const isActiveRun = run && (run.status === "queued" || run.status === "running");

  const urlValid = useMemo(() => /^https:\/\//i.test(targetUrl.trim()), [targetUrl]);

  // Load history
  const loadHistory = useCallback(async () => {
    const { data } = await (supabase as any)
      .schema("crm")
      .from("funnel_test_runs")
      .select("id, target_url, status, severity, started_at, completed_at, created_at")
      // PATCH 2.5: ordenar por created_at (sempre populado) em vez de started_at
      // (NULL em rows do path unsupported_provider).
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory(data ?? []);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Fase 2: lazy-load events da plataforma MP (status=active). RLS filtra por
  // company. Fetch once on mount — JS faz filtros (date) e hierarquia.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEventsLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("events")
          .select("id, name, date, location, status, event_type, parent_event_id, ticketing_url, ticketing_provider")
          .eq("status", "active")
          .order("date", { ascending: true })
          .limit(500);
        if (cancelled) return;
        if (error) {
          console.warn("[funnel-test] events load error:", error);
          setEvents([]);
        } else {
          setEvents((data ?? []) as PlatformEvent[]);
        }
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fase 2: build do array de options do SearchableSelect — incluindo
  // hierarquia master→sub e filtros de data.
  const eventOptions = useMemo<SearchableSelectOption[]>(() => {
    if (events.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const passesDateFilter = (e: PlatformEvent): boolean => {
      if (!e.date) return false;
      const d = new Date(e.date);
      if (showAllPast) return true;
      if (showPast) return d >= sixMonthsAgo;
      return d >= today;
    };

    // Map children por parent_event_id
    const childrenByParent = new Map<string, PlatformEvent[]>();
    for (const e of events) {
      if (e.parent_event_id) {
        const arr = childrenByParent.get(e.parent_event_id) ?? [];
        arr.push(e);
        childrenByParent.set(e.parent_event_id, arr);
      }
    }

    const isMaster = (e: PlatformEvent): boolean =>
      MASTER_EVENT_TYPES.has(e.event_type) || (childrenByParent.get(e.id)?.length ?? 0) > 0;

    // visibleIds: eventos que passam o filtro + masters de subs visíveis
    const visibleIds = new Set<string>();
    for (const e of events) if (passesDateFilter(e)) visibleIds.add(e.id);
    for (const e of events) {
      if (visibleIds.has(e.id) && e.parent_event_id) visibleIds.add(e.parent_event_id);
    }

    // Sort top-level: futures ASC, depois past DESC (mais recente primeiro)
    const sortedTopLevel = events
      .filter((e) => !e.parent_event_id && visibleIds.has(e.id))
      .sort((a, b) => {
        const da = a.date ?? "";
        const db = b.date ?? "";
        const aFuture = da >= today.toISOString().slice(0, 10);
        const bFuture = db >= today.toISOString().slice(0, 10);
        if (aFuture && !bFuture) return -1;
        if (!aFuture && bFuture) return 1;
        return aFuture ? da.localeCompare(db) : db.localeCompare(da);
      });

    const fmtDate = (d: string | null): string => {
      if (!d) return "—";
      try {
        return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
      } catch { return d; }
    };

    const buildOption = (e: PlatformEvent, indent: number): SearchableSelectOption => {
      const providerBadge = e.ticketing_provider ? ` · [${e.ticketing_provider}]` : "";
      const noUrl = !e.ticketing_url;
      return {
        value: e.id,
        label: `${e.name}${providerBadge}`,
        description: `${fmtDate(e.date)}${e.location ? " · " + e.location : ""}`,
        searchText: [e.name, e.location, e.ticketing_provider].filter(Boolean).join(" "),
        indentLevel: indent,
        disabled: noUrl,
        disabledReason: noUrl ? "URL de bilheteira não configurada" : undefined,
      };
    };

    const out: SearchableSelectOption[] = [];
    for (const top of sortedTopLevel) {
      const children = (childrenByParent.get(top.id) ?? [])
        .filter((c) => visibleIds.has(c.id))
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

      if (isMaster(top) || children.length > 0) {
        // Header não-clicável
        out.push({
          value: `header:${top.id}`,
          label: top.name + (top.location ? ` · ${top.location}` : ""),
          isHeader: true,
          indentLevel: 0,
        });
        for (const c of children) out.push(buildOption(c, 1));
      } else {
        // Standalone flat
        out.push(buildOption(top, 0));
      }
    }
    return out;
  }, [events, showPast, showAllPast]);

  // Fase 2: ao selecionar evento, auto-popular URL alvo. User pode editar
  // o input manualmente depois (override permitido).
  useEffect(() => {
    if (!selectedEventId) return;
    const evt = events.find((e) => e.id === selectedEventId);
    if (evt?.ticketing_url) {
      setTargetUrl(evt.ticketing_url);
      setError(null);
      setErrorKind("error");
    }
  }, [selectedEventId, events]);

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

  const startRun = useCallback(async (urlOverride?: string) => {
    const url = (urlOverride ?? targetUrl).trim();
    if (!/^https:\/\//i.test(url)) {
      setError("URL deve começar com https://");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-funnel-test-run", {
        // Fase 2: passar event_id se houver evento da plataforma seleccionado.
        // Backend valida que event.company_id == active company antes de gravar.
        body: {
          target_url: url,
          connection_id: active?.connection_id ?? null,
          event_id: selectedEventId ?? undefined,
        },
      });
      if (error) throw error;
      if (data?.run_id) {
        setRun(null);
        setSteps([]);
        setExpanded({});
        setCandidateUrls([]);
        setRunId(data.run_id);
      } else {
        throw new Error("Sem run_id na resposta");
      }
    } catch (e: any) {
      // PATCH 1: supabase-js v2.99.x — FunctionsHttpError tem .context = Response.
      // Tentar extrair detail/error_message do body JSON antes do fallback genérico.
      let msg = e?.message ?? "Erro ao iniciar teste";
      let kind: "info" | "error" = "error";
      if (e?.context && typeof e.context.json === "function") {
        try {
          const body = await e.context.json();
          // Prioridade: error_message > detail > error
          if (body?.error_message) msg = body.error_message;
          else if (body?.detail) msg = body.detail;
          else if (body?.error) msg = body.error;
          // HTTP 400 com error="unsupported_provider" → validação, não erro técnico
          if (e?.context?.status === 400 && body?.error === "unsupported_provider") {
            kind = "info";
          }
        } catch (_) { /* parse fail → mantém msg genérico */ }
      }
      setError(msg);
      setErrorKind(kind);
    } finally {
      setSubmitting(false);
    }
  }, [targetUrl, active?.connection_id, selectedEventId]);

  // Auto-flow via query string: ?url=, ?campaign_id=, ?event_id=
  useEffect(() => {
    if (autoTriggeredRef.current) return;
    const qUrl = searchParams.get("url");
    const qCampaign = searchParams.get("campaign_id");
    const qEvent = searchParams.get("event_id");
    if (!qUrl && !qCampaign && !qEvent) return;
    autoTriggeredRef.current = true;

    const consumeParams = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("url"); next.delete("campaign_id"); next.delete("event_id");
      setSearchParams(next, { replace: true });
    };

    if (qUrl) {
      setTargetUrl(qUrl);
      toast.message("Iniciando teste automaticamente", { description: qUrl });
      consumeParams();
      window.setTimeout(() => startRun(qUrl), 1000);
      return;
    }

    (async () => {
      setExtracting(true);
      try {
        const { data, error } = await supabase.functions.invoke("crm-meta-extract-landing-urls", {
          body: qCampaign ? { campaign_id: qCampaign } : { event_id: qEvent },
        });
        if (error) throw error;
        const urls: string[] = data?.urls ?? [];
        const primary: string | null = data?.primary ?? null;
        consumeParams();
        if (urls.length === 0) {
          toast.error(qEvent
            ? "Este evento não tem landing URL configurada. Cole manualmente."
            : "Nenhuma landing URL encontrada nesta campanha. Cole manualmente.");
          return;
        }
        if (urls.length === 1 && primary) {
          setTargetUrl(primary);
          toast.message("Iniciando teste automaticamente", { description: primary });
          window.setTimeout(() => startRun(primary), 1000);
          return;
        }
        setCandidateUrls(urls);
        if (primary) setTargetUrl(primary);
        toast.message("Várias URLs detectadas — escolhe abaixo");
      } catch (e: any) {
        toast.error(e?.message ?? "Erro a extrair URLs da campanha");
        consumeParams();
      } finally {
        setExtracting(false);
      }
    })();
  }, [searchParams, setSearchParams, startRun]);


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

  // Patch 3: a tabela "Eventos Pixel" e o Veredicto IA vêm AGORA do mesmo array.
  // `run.detected_pixel_events` é a fonte autoritária (já anotada com step pelo backend)
  // — mesmo array enviado ao LLM. Fallback para o flatmap dos steps enquanto a run
  // ainda está a correr (run.detected_pixel_events só é gravado no fim).
  const allPixelEvents = useMemo(() => {
    if (Array.isArray(run?.detected_pixel_events) && run.detected_pixel_events.length > 0) {
      return run.detected_pixel_events.map((e: any) => ({
        ...e,
        step: e.step ?? e.step_name ?? null,
      }));
    }
    return steps.flatMap((s: any) => (s.pixel_events ?? []).map((e: any) => ({ ...e, step: s.step_name })));
  }, [run, steps]);

  const allConsoleErrors = useMemo(() => {
    if (Array.isArray(run?.console_errors) && run.console_errors.length > 0) {
      return run.console_errors.map((e: any) => ({
        ...e,
        step: e.step ?? e.step_name ?? null,
      }));
    }
    return steps.flatMap((s: any) => (s.console_errors ?? []).map((e: any) => ({ ...e, step: s.step_name })));
  }, [run, steps]);

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

      {/* (banner BETA removido — Browserless real activo) */}

      {/* Input card */}
      {!isActiveRun && !run && (
        <Card className="p-6 space-y-4">
          {/* Fase 2: seletor de eventos da plataforma MP. Auto-popula URL alvo
              quando seleccionado. Input manual continua disponível (override). */}
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Evento da plataforma <span className="text-muted-foreground/60 normal-case">(opcional)</span>
            </label>
            <div className="mt-1">
              <SearchableSelect
                options={eventOptions}
                value={selectedEventId ?? ""}
                onValueChange={(v) => setSelectedEventId(v || null)}
                placeholder={
                  eventsLoading
                    ? "A carregar eventos…"
                    : eventOptions.length === 0
                      ? (events.length === 0 ? "Nenhum evento activo" : "Nenhum evento no filtro actual")
                      : "Selecionar evento…"
                }
                searchPlaceholder="Pesquisar por nome, local, bilheteira…"
                emptyMessage={events.length === 0 ? "Nenhum evento activo nesta company." : "Nenhum resultado."}
                disabled={eventsLoading || submitting || extracting}
              />
            </div>
            <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPast}
                  onChange={(e) => {
                    setShowPast(e.target.checked);
                    if (!e.target.checked) setShowAllPast(false);
                  }}
                  className="rounded border-border"
                />
                Ver passados (≤ 6 meses)
              </label>
              <label className={cn("flex items-center gap-1.5 select-none", showPast ? "cursor-pointer" : "opacity-50 cursor-not-allowed")}>
                <input
                  type="checkbox"
                  checked={showAllPast}
                  onChange={(e) => setShowAllPast(e.target.checked)}
                  disabled={!showPast}
                  className="rounded border-border"
                />
                Mostrar todos os passados
              </label>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground italic">
              Selecionar um evento auto-preenche o URL abaixo. Eventos sem URL de bilheteira aparecem desactivados.
            </p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">URL alvo</label>
            <Input
              value={targetUrl}
              onChange={(e) => {
                const next = e.target.value;
                setTargetUrl(next);
                setError(null);
                setErrorKind("error");
                // Fase 2: se o user editou a URL manualmente e já não bate certo com
                // o evento seleccionado, limpar a ligação para não gravar event_id
                // dessincronizado da target_url efectiva.
                if (selectedEventId) {
                  const evt = events.find((ev) => ev.id === selectedEventId);
                  if (evt && evt.ticketing_url !== next) setSelectedEventId(null);
                }
              }}
              placeholder="https://www.ticketline.pt/evento/..."
              className="mt-1"
              disabled={submitting || extracting}
            />
            {targetUrl && !urlValid && (
              <p className="text-xs text-red-400 mt-1">URL deve começar com https://</p>
            )}
            {error && (
              errorKind === "info" ? (
                // PATCH 4: caixa info azul para validações (ex: bilheteira não suportada)
                <div className="mt-2 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-blue-500/20 border-blue-500/40 text-blue-100 shrink-0">Info</span>
                    <span>{error}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-red-400 mt-1">{error}</p>
              )
            )}
          </div>
          {candidateUrls.length > 1 && (
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                URLs detectadas ({candidateUrls.length})
              </label>
              <select
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              >
                {candidateUrls.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => startRun()}
            disabled={!urlValid || submitting || extracting}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-700 dark:text-cyan-200 hover:bg-cyan-500/25 transition-colors disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed font-semibold" /* a11y: WCAG AA contrast — 14/05/2026 */
          >
            {submitting || extracting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            {extracting ? "A extrair URLs…" : "Iniciar teste 360"}
          </button>
          <p className="text-xs text-muted-foreground text-center">
            O teste percorre 6 passos: home → evento → bilhete → carrinho → cart → checkout. Sem compra real.
          </p>
          <p className="text-[11px] text-muted-foreground text-center">
            ℹ️ O teste demora ~30–60s. Browserless.io executa navegação real.
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
            {(steps.length > 0
              ? steps
              : STEP_ORDER_TEMPLATE.map((id) => ({ step_name: id, step_status: "pending" }))
            ).map((step: any, idx: number) => {
              const stepName: string = step.step_name;
              const status = step.step_status ?? "pending";
              const isExpanded = !!expanded[stepName];
              const canExpand = (status === "passed" || status === "failed") && !!step.id;
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
                      <div className="text-sm font-medium">{STEP_LABELS[stepName] ?? stepName}</div>
                      {step.url_at_step && (
                        <div className="text-[11px] text-muted-foreground truncate font-mono">{step.url_at_step}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">{fmtMs(step.duration_ms)}</div>
                    {canExpand && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                  </button>

                  {isExpanded && step.id && (
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
                  {/* PATCH 2.5: fallback h.started_at ?? h.created_at + guard contra NaN */}
                  {fmtHistoryDate(h.started_at, h.created_at)}
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
