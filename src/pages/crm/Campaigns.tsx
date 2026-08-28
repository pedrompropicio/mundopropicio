import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO, subDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Calendar as CalendarIcon,
  AlertCircle,
  Sparkles,
  Target,
  CheckCircle2,
  FileDown,
  DownloadCloud,
  Wand2,
  Pause,
  Play,
  AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReactivateCampaignDialog } from "@/components/crm/ReactivateCampaignDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { printCampaignAnalysis, printAudienceCoach } from "@/lib/audience-pdf";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { lisbonToday } from "@/lib/date-lisbon";

import type { PeriodMode, PeriodState } from "@/lib/crm/period";
import { periodFromMode } from "@/lib/crm/period";
import { CampaignAnalysisSheet } from "@/components/crm/dashboard/CampaignAnalysisSheet";
import { AudienceCoachSheet } from "@/components/crm/dashboard/AudienceCoachSheet";
import { useConfirmMetaAction, type PendingMetaAction } from "@/components/crm/ConfirmMetaActionDialog";

// Dashboard Meta Live — composição. Componentes e queries vivem em
// src/components/crm/dashboard/ e src/lib/crm/ (Fase 0 do redesenho).
import { BudgetModeContext } from "@/components/crm/dashboard/budget-mode-context";
import type { CampaignRow, EventRow, InsightRow, DashboardGroup, SimpleGroup, TourGroup } from "@/components/crm/dashboard/types";
import { KpiCard } from "@/components/crm/dashboard/KpiCard";
import { CampaignTableHeader } from "@/components/crm/dashboard/CampaignTableHeader";
import { ColumnPicker } from "@/components/crm/dashboard/ColumnPicker";
import { ConversionFunnelPanel } from "@/components/crm/dashboard/ConversionFunnelPanel";
import { DashboardTableContext } from "@/components/crm/dashboard/dashboard-table-context";
import { useDashboardColumns } from "@/lib/crm/columns";
import { CampaignTableRow } from "@/components/crm/dashboard/CampaignTableRow";
import { EventGroupCard } from "@/components/crm/dashboard/EventGroupCard";
import { TourFamilyCard } from "@/components/crm/dashboard/TourFamilyCard";
import { AlertsBar } from "@/components/crm/dashboard/AlertsBar";
import { DailyPerformanceChart } from "@/components/crm/dashboard/DailyPerformanceChart";
import {
  aggregate,
  emptyAgg,
  deltaPct,
  computeCpm,
  computeCpa,
  computeTicket,
  computeCtrAvg,
} from "@/lib/crm/aggregate";
import { dataStartISO, previousWindow, safeDelta } from "@/lib/crm/kpi-deltas";
import { NO_SORT, nextSort, sortCampaigns, type SortKey, type SortState } from "@/lib/crm/table-sort";
import { computeDashboardAlerts } from "@/lib/crm/alerts";
import { buildDashboardCsv, downloadCsv, type CsvExportRow } from "@/lib/crm/csv-export";
import {
  formatCurrency,
  formatCompact,
  formatRoas,
  DEFAULT_TARGET_ROAS,
} from "@/lib/crm/dashboard-format";
import {
  PLATFORM_COLOR_VAR,
  PLATFORM_LABEL,
  matchesPlatform,
  type PlatformFilter,
} from "@/lib/crm/platform";
import { useGoogleCampaignsQuery, useGoogleInsightsQuery } from "@/lib/crm/google-queries";

import {
  useCampaignsQuery,
  useAdsetBudgetsQuery,
  useInsightsQuery,
  useDashboardEventsQuery,
  buildBudgetModeMap,
} from "@/lib/crm/dashboard-queries";

// ============================================================
// Main Page
// ============================================================
export default function CrmCampaigns() {
  const { role, hasPermission, loading: authLoading } = useAuth();
  const { companyId, isLoading: companyLoading } = useCompany();
  const qc = useQueryClient();
  const { confirm: confirmMetaAction } = useConfirmMetaAction();
  const { active } = useAdAccountSelection();
  const displayCurrency = useDisplayCurrency();

  const [period, setPeriod] = useState<PeriodState>(periodFromMode("30d"));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [syncing, setSyncing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastFetchRef = useRef<number>(Date.now());
  const [statusFilter, setStatusFilter] = useState<"active" | "paused" | "all" | "replaced">("active");
  // Fase 3B — filtro de plataforma: manda em KPIs, gráficos, funil, cards e tabela.
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");

  // Reactivate dialog (substitui window.confirm para activate; pause mantém confirm).
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [reactivateCampaign, setReactivateCampaign] = useState<CampaignRow | null>(null);

  // Painéis de IA (componentes em src/components/crm/dashboard/) — Fase 1.
  const [analyzeTarget, setAnalyzeTarget] = useState<{ id: string; name: string } | null>(null);
  const [coachCampaignId, setCoachCampaignId] = useState<string | null>(null);
  const navigate = useNavigate();

  const analyzeCampaign = (campaignId: string, campaignName: string) => {
    setAnalyzeTarget({ id: campaignId, name: campaignName });
  };
  const coachCampaign = (campaignId: string) => setCoachCampaignId(campaignId);

  // Colunas configuráveis da tabela (persistidas em localStorage).
  const { visible: visibleColumns, ordered: orderedColumns, toggle: toggleColumn, reset: resetColumns } =
    useDashboardColumns();


  const isAuthorized =
    role === "admin" ||
    role === ("platform_admin" as any) ||
    role === ("marketing_manager" as any) ||
    hasPermission("crm.campaign.create");

  // ---------- Active ad account (multi-account support) ----------
  const adAccountId = active?.ad_account_id ?? null;
  const connectionId = active?.connection_id ?? null;
  // Hierarquia: ad account → empresa ativa → "EUR" (defesa em profundidade no formatMoney).
  const currency = active?.ad_account_currency || displayCurrency;

  // ---------- Toggle status (Pause/Activate) ----------
  const [togglingCampaignId, setTogglingCampaignId] = useState<string | null>(null);
  const toggleCampaignStatus = async (c: CampaignRow, target: "ACTIVE" | "PAUSED", reasonText?: string) => {
    if (!connectionId) {
      toast.error("Sem ligação Meta ativa.");
      return;
    }
    // ATIVAR campanha → guard de confirmação partilhado (vai gastar).
    if (target === "ACTIVE") {
      const r = await confirmMetaAction(
        [{
          connection_id: connectionId,
          entity_type: "campaign",
          external_id: c.external_campaign_id,
          ad_account_id: c.ad_account_id,
          action: "activate",
          label: `Campanha «${c.name}»`,
          triggered_by: "user_manual",
          reason_text: reasonText ?? null,
        }],
        { title: "Ativar campanha", description: "A campanha vai começar a gastar imediatamente." },
      );
      if (r.ok > 0) {
        qc.invalidateQueries({ queryKey: ["crm-meta-campaigns", companyId, adAccountId] });
      }
      return;
    }

    setTogglingCampaignId(c.external_campaign_id);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: connectionId,
          entity_type: "campaign",
          external_id: c.external_campaign_id,
          action: "pause",
          ad_account_id: c.ad_account_id,
          ...(reasonText ? { reason_text: reasonText, triggered_by: "user_manual" } : {}),
        },
      });
      if (error) {
        let detail = error.message;
        if ((error as any).context) {
          try {
            const ctx = (error as any).context;
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      if (data?.ok === false) throw new Error(data?.detail ?? data?.error ?? "Falha");
      toast.success(`Campanha "${c.name}" pausada`);
      qc.invalidateQueries({ queryKey: ["crm-meta-campaigns", companyId, adAccountId] });
    } catch (e: any) {
      toast.error("Falha a alterar status no Meta", { description: e?.message ?? String(e) });
    } finally {
      setTogglingCampaignId(null);
    }
  };

  // Abre dialog de reactivação (substitui chamada directa para evitar reactivação acidental).
  const openReactivateDialog = (c: CampaignRow) => {
    setReactivateCampaign(c);
    setReactivateDialogOpen(true);
  };

  // ---------- Campaigns / adset budgets (hooks em src/lib/crm/dashboard-queries.ts) ----------
  const { data: metaCampaigns, isLoading: campaignsLoading } = useCampaignsQuery({
    companyId,
    adAccountId,
    enabled: isAuthorized,
  });

  const { data: adsetBudgetRows } = useAdsetBudgetsQuery({
    companyId,
    adAccountId,
    enabled: isAuthorized,
  });

  const budgetModeByCampaign = useMemo(
    () => buildBudgetModeMap(metaCampaigns, adsetBudgetRows),
    [metaCampaigns, adsetBudgetRows],
  );

  const { data: metaInsights, isLoading: insightsLoading } = useInsightsQuery({
    companyId,
    adAccountId,
    enabled: isAuthorized,
    onFetched: () => {
      lastFetchRef.current = Date.now();
      setSecondsAgo(0);
    },
  });

  // ---------- Google Ads (Fase 3B) — normalizado para a mesma forma do Meta ----------
  const { data: googleCampaignsRaw, isLoading: googleCampaignsLoading } = useGoogleCampaignsQuery({
    companyId,
    enabled: isAuthorized,
  });
  const { data: googleInsightsRaw, isLoading: googleInsightsLoading } = useGoogleInsightsQuery({
    companyId,
    enabled: isAuthorized,
  });

  // Universo unificado das duas plataformas, já filtrado pelo selector de plataforma.
  const campaigns = useMemo(() => {
    const all = [...(metaCampaigns ?? []), ...(googleCampaignsRaw ?? [])];
    return all.filter((c) => matchesPlatform(c, platformFilter));
  }, [metaCampaigns, googleCampaignsRaw, platformFilter]);

  const insights = useMemo(() => {
    const all = [...(metaInsights ?? []), ...(googleInsightsRaw ?? [])];
    return all.filter((r) => matchesPlatform(r, platformFilter));
  }, [metaInsights, googleInsightsRaw, platformFilter]);

  // Sinal para a dialog de activação: campanha já gastou no período seleccionado?
  const reactivateHasRunBefore = useMemo(() => {
    if (!reactivateCampaign) return true;
    const rows = (insights ?? []).filter(
      (r) => r.external_campaign_id === reactivateCampaign.external_campaign_id,
    );
    return rows.some((r) => (r.spend_cents ?? 0) > 0);
  }, [insights, reactivateCampaign]);


  // ---------- Events for displayed campaigns (independente de status filter) ----------
  // Inclui linked_event_ids de TODAS as campanhas (ACTIVE + PAUSED) para que o dashboard
  // possa mostrar paused via statusFilter sem ter de re-fetch events.
  const linkedEventIds = useMemo(
    () =>
      Array.from(
        new Set(
          (campaigns ?? [])
            .filter((c) => c.linked_event_id)
            .map((c) => c.linked_event_id as string),
        ),
      ),
    [campaigns],
  );
  const { data: events } = useDashboardEventsQuery({
    linkedEventIds,
    enabled: isAuthorized,
  });

  // ---------- Auto-refresh ----------
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      qc.invalidateQueries({ queryKey: ["crm-meta-insights"] });
      qc.invalidateQueries({ queryKey: ["crm-meta-campaigns"] });
    }, 30_000);
    return () => clearInterval(interval);
  }, [qc]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(Math.round((Date.now() - lastFetchRef.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // ---------- Period filter ----------
  const periodInsights = useMemo(() => {
    if (!insights) return [];
    const fromStr = format(period.from, "yyyy-MM-dd");
    const toStr = format(period.to, "yyyy-MM-dd");
    return insights.filter((r) => r.date_start >= fromStr && r.date_start <= toStr);
  }, [insights, period]);

  // Janela anterior de igual duração. Só é comparável quando o histórico
  // carregado cobre a janela inteira (ver src/lib/crm/kpi-deltas.ts).
  const dataStart = useMemo(() => dataStartISO(insights), [insights]);
  const prevWindow = useMemo(
    () => previousWindow(period.from, period.to, dataStart),
    [period, dataStart],
  );
  const previousInsights = useMemo(() => {
    if (!insights) return [];
    const fromStr = format(prevWindow.from, "yyyy-MM-dd");
    const toStr = format(prevWindow.to, "yyyy-MM-dd");
    return insights.filter((r) => r.date_start >= fromStr && r.date_start <= toStr);
  }, [insights, prevWindow]);

  const insightsByCampaign = useMemo(() => {
    const m = new Map<string, InsightRow[]>();
    for (const r of periodInsights) {
      const arr = m.get(r.external_campaign_id) ?? [];
      arr.push(r);
      m.set(r.external_campaign_id, arr);
    }
    return m;
  }, [periodInsights]);

  const previousInsightsByCampaign = useMemo(() => {
    const m = new Map<string, InsightRow[]>();
    for (const r of previousInsights) {
      const arr = m.get(r.external_campaign_id) ?? [];
      arr.push(r);
      m.set(r.external_campaign_id, arr);
    }
    return m;
  }, [previousInsights]);

  const periodDays = useMemo(
    () => Math.max(1, differenceInDays(period.to, period.from) + 1),
    [period],
  );

  // Ordenação do nível de campanha (Fase 2) — partilhada por todas as tabelas.
  const [sort, setSort] = useState<SortState>(NO_SORT);
  const handleSort = useCallback((key: SortKey) => setSort((s) => nextSort(s, key)), []);

  // Contexto da tabela: colunas visíveis + drill-down preguiçoso + ordenação.
  const tableCtx = useMemo(
    () => ({
      columns: orderedColumns,
      companyId,
      adAccountId,
      currency,
      from: format(period.from, "yyyy-MM-dd"),
      to: format(period.to, "yyyy-MM-dd"),
      sort,
      onSort: handleSort,
    }),
    [orderedColumns, companyId, adAccountId, currency, period, sort, handleSort],
  );


  // 14-day spend sparkline per campaign
  const spark14ByCampaign = useMemo(() => {
    const m = new Map<string, number[]>();
    if (!insights) return m;
    const today = lisbonToday();
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) days.push(format(subDays(today, i), "yyyy-MM-dd"));
    const byKey = new Map<string, Map<string, number>>();
    for (const r of insights) {
      let inner = byKey.get(r.external_campaign_id);
      if (!inner) {
        inner = new Map();
        byKey.set(r.external_campaign_id, inner);
      }
      inner.set(r.date_start, (inner.get(r.date_start) ?? 0) + (r.spend_cents ?? 0));
    }
    for (const [cid, inner] of byKey) {
      m.set(
        cid,
        days.map((d) => inner.get(d) ?? 0),
      );
    }
    return m;
  }, [insights]);

  // ---------- KPIs ----------
  const aggCurrent = useMemo(() => aggregate(periodInsights), [periodInsights]);
  const aggPrev = useMemo(() => aggregate(previousInsights), [previousInsights]);
  const comparable = prevWindow.complete;
  const kpis = useMemo(() => {
    const cpmCur = computeCpm(aggCurrent);
    const cpmPrev = computeCpm(aggPrev);
    const cpaCur = computeCpa(aggCurrent);
    const cpaPrev = computeCpa(aggPrev);
    const tkCur = computeTicket(aggCurrent);
    const tkPrev = computeTicket(aggPrev);
    return {
      roas: {
        value: aggCurrent.roas,
        delta: safeDelta(aggCurrent.roas, aggPrev.roas, comparable),
      },
      spend: {
        value: aggCurrent.spendCents,
        delta: safeDelta(aggCurrent.spendCents, aggPrev.spendCents, comparable),
      },
      revenue: {
        value: aggCurrent.revenueCents,
        delta: safeDelta(aggCurrent.revenueCents, aggPrev.revenueCents, comparable),
      },
      conv: {
        value: aggCurrent.conversions,
        delta: safeDelta(aggCurrent.conversions, aggPrev.conversions, comparable),
      },
      ticket: { value: tkCur, delta: safeDelta(tkCur, tkPrev, comparable) },
      cpm: { value: cpmCur, delta: safeDelta(cpmCur, cpmPrev, comparable) },
      cpa: { value: cpaCur, delta: safeDelta(cpaCur, cpaPrev, comparable) },
      ctr: { value: computeCtrAvg(aggCurrent) },
      impressions: {
        value: aggCurrent.impressions,
        delta: safeDelta(aggCurrent.impressions, aggPrev.impressions, comparable),
      },
      reach: {
        value: aggCurrent.reachSum,
        delta: safeDelta(aggCurrent.reachSum, aggPrev.reachSum, comparable),
      },
    };
  }, [aggCurrent, aggPrev, comparable]);

  // A série diária é construída dentro do DailyPerformanceChart (recebe os insights).



  // ---------- Group active campaigns by event ----------
  const eventsById = useMemo(() => {
    const m = new Map<string, EventRow>();
    (events ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [events]);

  // Filtro por status (sticky header): "active" (default), "paused", "all" ou "replaced".
  // Substituídas (replaced_by_strategy_id != null) só aparecem em statusFilter='replaced' ou 'all'.
  // Em 'active'/'paused' são excluídas (podem estar ACTIVE no modo delayed_7d/manual).
  const displayedCampaigns = useMemo(
    () => (campaigns ?? []).filter((c) => {
      const isReplaced = c.replaced_by_strategy_id != null;
      if (statusFilter === "replaced") return isReplaced;
      if (statusFilter === "all") return true;
      if (isReplaced) return false;
      if (statusFilter === "active") return c.status === "ACTIVE";
      return c.status === "PAUSED";
    }),
    [campaigns, statusFilter],
  );

  // Splits indexados pelo id do master (a partir dos events carregados — independente
  // de haver campanhas linkadas; permite renderizar sub-cards "Cidade · sem campanhas").
  const splitsByMaster = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    (events ?? []).forEach((e) => {
      if (e.event_type === "tour_split" && e.parent_event_id) {
        const arr = m.get(e.parent_event_id) ?? [];
        arr.push(e);
        m.set(e.parent_event_id, arr);
      }
    });
    for (const [, arr] of m) arr.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    return m;
  }, [events]);

  // Grupos hierárquicos do dashboard: simple events vs tour families (master+splits).
  const dashboardGroups = useMemo<DashboardGroup[]>(() => {
    const byKey = new Map<string, DashboardGroup>();
    for (const c of displayedCampaigns) {
      if (!c.linked_event_id) continue;
      const e = eventsById.get(c.linked_event_id);
      if (!e || e.status !== "active") continue;

      if (e.event_type === "tour_split" && e.parent_event_id) {
        const master = eventsById.get(e.parent_event_id);
        if (!master) {
          // Master não carregado (improvável após family-fetch) — fallback simples.
          const key = `simple:${e.id}`;
          let g = byKey.get(key) as SimpleGroup | undefined;
          if (!g) { g = { kind: "simple", event: e, campaigns: [] }; byKey.set(key, g); }
          g.campaigns.push(c);
          continue;
        }
        const key = `tour:${master.id}`;
        let g = byKey.get(key) as TourGroup | undefined;
        if (!g) {
          g = {
            kind: "tour", master,
            splits: splitsByMaster.get(master.id) ?? [],
            campaignsBySplit: new Map(),
            masterCampaigns: [],
          };
          byKey.set(key, g);
        }
        const arr = g.campaignsBySplit.get(e.id) ?? [];
        arr.push(c);
        g.campaignsBySplit.set(e.id, arr);
      } else if (e.event_type === "tour_master") {
        const key = `tour:${e.id}`;
        let g = byKey.get(key) as TourGroup | undefined;
        if (!g) {
          g = {
            kind: "tour", master: e,
            splits: splitsByMaster.get(e.id) ?? [],
            campaignsBySplit: new Map(),
            masterCampaigns: [],
          };
          byKey.set(key, g);
        }
        g.masterCampaigns.push(c);
      } else {
        const key = `simple:${e.id}`;
        let g = byKey.get(key) as SimpleGroup | undefined;
        if (!g) { g = { kind: "simple", event: e, campaigns: [] }; byKey.set(key, g); }
        g.campaigns.push(c);
      }
    }
    return [...byKey.values()];
  }, [displayedCampaigns, eventsById, splitsByMaster]);

  const orphanCampaigns = useMemo(
    () =>
      displayedCampaigns.filter(
        (c) => !c.linked_event_id || eventsById.get(c.linked_event_id)?.status !== "active",
      ),
    [displayedCampaigns, eventsById],
  );

  // ---------- Alertas accionáveis do período ----------
  const eventsSectionRef = useRef<HTMLElement | null>(null);
  const alerts = useMemo(
    () =>
      computeDashboardAlerts({
        periodInsights,
        adsets: adsetBudgetRows ?? [],
        campaigns: displayedCampaigns,
        eventsById,
        insightsByCampaign,
        currencyFormat: (cents) => formatCurrency(cents, currency),
        roasFormat: formatRoas,
      }),
    [periodInsights, adsetBudgetRows, displayedCampaigns, eventsById, insightsByCampaign, currency],
  );

  // ---------- Exportação CSV do que está no ecrã ----------
  const exportCsv = useCallback(() => {
    const rows: CsvExportRow[] = [];
    const push = (group: string, city: string | undefined, list: CampaignRow[]) => {
      for (const c of sortCampaigns(list, insightsByCampaign, sort)) {
        const insightRows = insightsByCampaign.get(c.external_campaign_id) ?? [];
        rows.push({
          group,
          city,
          campaign: c.name ?? "",
          status: c.effective_status ?? c.status ?? "",
          agg: aggregate(insightRows),
          rows: insightRows,
          dailyBudgetCents: c.daily_budget_cents ?? null,
        });
      }
    };
    for (const g of dashboardGroups) {
      if (g.kind === "tour") {
        push(g.master.name ?? "", undefined, g.masterCampaigns);
        for (const s of g.splits) {
          push(g.master.name ?? "", s.name ?? "", g.campaignsBySplit.get(s.id) ?? []);
        }
      } else {
        push(g.event.name ?? "", undefined, g.campaigns);
      }
    }
    push("Sem evento activo", undefined, orphanCampaigns);

    const from = format(period.from, "yyyy-MM-dd");
    const to = format(period.to, "yyyy-MM-dd");
    downloadCsv(
      buildDashboardCsv({ rows, columns: orderedColumns, currency, from, to }),
      `mp-audience-${from}_${to}.csv`,
    );
  }, [
    dashboardGroups,
    orphanCampaigns,
    insightsByCampaign,
    sort,
    orderedColumns,
    currency,
    period,
  ]);



  // ---------- Header counters ----------
  // Frescura por plataforma: max(last_synced_at) de cada tabela de insights.
  // >48h ⇒ estado de alerta com o nº de dias. Nunca esconder dados velhos.
  const freshness = useMemo(() => {
    const build = (rows: InsightRow[] | undefined, key: "meta" | "google") => {
      const latest = (rows ?? [])
        .map((i) => i.last_synced_at)
        .filter(Boolean)
        .sort()
        .pop();
      if (!latest) return { key, label: "sem dados", stale: false, days: null as number | null };
      const d = parseISO(latest);
      const hours = (Date.now() - d.getTime()) / 3_600_000;
      return {
        key,
        label: formatDistanceToNow(d, { locale: ptBR, addSuffix: true }),
        stale: hours > 48,
        days: Math.floor(hours / 24),
      };
    };
    return [build(metaInsights, "meta"), build(googleInsightsRaw, "google")];
  }, [metaInsights, googleInsightsRaw]);

  const adAccountsCount = useMemo(() => {
    const set = new Set((campaigns ?? []).map((c) => c.ad_account_id));
    return set.size;
  }, [campaigns]);

  // ---------- Sync ----------
  const handleSync = async (mode: "incremental" | "full" = "incremental") => {
    if (!connectionId || !adAccountId) {
      toast.error("Sem ad account ativa");
      return;
    }
    setSyncing(true);
    const params = { connection_id: connectionId, ad_account_id: adAccountId, mode };
    const errors: string[] = [];
    const modeLabel = mode === "full" ? "completa" : "incremental";

    // Step 1: campaigns
    let cData: any = null;
    const t1 = toast.loading(`A sincronizar campanhas (${modeLabel})…`);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-sync-campaigns", { body: params });
      if (error) throw error;
      cData = data;
      toast.success(`${data?.synced_count ?? 0} campanhas`, { id: t1 });
    } catch (e: any) {
      console.error("[crm/campaigns] sync campaigns failed:", e);
      toast.error("Falha em campanhas", { id: t1, description: e?.message ?? String(e) });
      errors.push(`campanhas: ${e?.message ?? String(e)}`);
    }

    // Step 2: adsets
    let asData: any = null;
    const t2 = toast.loading(`A sincronizar adsets (${modeLabel})…`);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-sync-adsets", { body: params });
      if (error) throw error;
      asData = data;
      toast.success(`${data?.synced_count ?? 0} adsets`, { id: t2 });
    } catch (e: any) {
      console.error("[crm/campaigns] sync adsets failed:", e);
      toast.error("Falha em adsets", { id: t2, description: e?.message ?? String(e) });
      errors.push(`adsets: ${e?.message ?? String(e)}`);
    }

    // Step 3: ads
    let adData: any = null;
    const t3 = toast.loading(`A sincronizar ads (${modeLabel})…`);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-sync-ads", { body: params });
      if (error) throw error;
      adData = data;
      toast.success(`${data?.synced_count ?? 0} ads`, { id: t3 });
    } catch (e: any) {
      console.error("[crm/campaigns] sync ads failed:", e);
      toast.error("Falha em ads", { id: t3, description: e?.message ?? String(e) });
      errors.push(`ads: ${e?.message ?? String(e)}`);
    }

    // Step 4: insights (3 níveis)
    let iData: any = null;
    const t4 = toast.loading(`A sincronizar insights (${modeLabel})…`);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-sync-insights", {
        body: { ...params, days_back: 30, levels: ["campaign", "adset", "ad"] },
      });
      if (error) throw error;
      iData = data;
      toast.success(`${data?.synced_rows ?? 0} linhas de insights`, { id: t4 });
    } catch (e: any) {
      console.error("[crm/campaigns] sync insights failed:", e);
      toast.error("Falha em insights", { id: t4, description: e?.message ?? String(e) });
      errors.push(`insights: ${e?.message ?? String(e)}`);
    }

    // Step 5: criativos (depende de meta_ad_snapshot já preenchido por Step 3).
    // Incluído no Full Sync para conexões novas não ficarem à espera do cron
    // diário (cap 100/dia). Cap por run = 2000 (máximo aceite pela função).
    let crData: any = null;
    const t5 = toast.loading(`A sincronizar criativos (${modeLabel})…`);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-sync-creatives", {
        body: {
          ...params,
          mode: "incremental",
          max_creatives_per_run: 2000,
          triggered_by: "full-sync-ui",
        },
      });
      if (error) throw error;
      crData = data;
      const remaining = data?.remaining_to_sync ?? 0;
      toast.success(
        remaining > 0
          ? `${data?.synced_count ?? 0} criativos · ${remaining} em fila`
          : `${data?.synced_count ?? 0} criativos`,
        { id: t5 },
      );
    } catch (e: any) {
      console.error("[crm/campaigns] sync creatives failed:", e);
      toast.error("Falha em criativos", { id: t5, description: e?.message ?? String(e) });
      errors.push(`criativos: ${e?.message ?? String(e)}`);
    }

    // Step 6: Google Ads (campanhas + insights diários na mesma função).
    let gData: any = null;
    const t6 = toast.loading("A sincronizar Google Ads…");
    try {
      const { data, error } = await supabase.functions.invoke("crm-google-sync-campaigns", {
        body: mode === "full" ? { mode: "full" } : { days_back: 30 },
      });
      if (error) throw error;
      gData = data;
      toast.success(`${data?.synced_rows ?? data?.synced_count ?? 0} linhas Google`, { id: t6 });
    } catch (e: any) {
      console.error("[crm/campaigns] sync google failed:", e);
      toast.error("Falha em Google Ads", { id: t6, description: e?.message ?? String(e) });
      errors.push(`google: ${e?.message ?? String(e)}`);
    }

    if (errors.length === 0) {
      const creativesPart = crData
        ? ` · ${crData?.synced_count ?? 0} criativos${(crData?.remaining_to_sync ?? 0) > 0 ? ` (${crData.remaining_to_sync} em fila)` : ""}`
        : "";
      toast.success(`Sync ${modeLabel} completa`, {
        description: `${cData?.synced_count ?? 0} campanhas · ${asData?.synced_count ?? 0} adsets · ${adData?.synced_count ?? 0} ads · ${iData?.synced_rows ?? 0} insights${creativesPart}${gData ? ` · Google: ${gData?.synced_rows ?? 0} linhas` : ""}${cData?.auto_linked_count ? ` · ${cData.auto_linked_count} vinculadas a evento` : ""}`,
      });
    } else {
      toast.error(`Sync com ${errors.length} erro(s)`, { description: errors.join(" · ") });
    }


    qc.invalidateQueries({ queryKey: ["crm-meta-campaigns"] });
    qc.invalidateQueries({ queryKey: ["crm-meta-insights"] });
    qc.invalidateQueries({ queryKey: ["crm-google-campaigns"] });
    qc.invalidateQueries({ queryKey: ["crm-google-insights"] });
    setSyncing(false);
  };

  const handleFullSync = () => {
    if (!window.confirm(
      "Tens a certeza? Vai puxar todos os dados elegíveis dos últimos 30 dias do Meta, demora minutos e consome quota. Continuar?"
    )) return;
    void handleSync("full");
  };

  // ---------- Period helpers ----------
  const setMode = (mode: PeriodMode) => {
    if (mode === "custom") {
      setPeriod(periodFromMode("custom", customRange.from && customRange.to ? { from: customRange.from, to: customRange.to } : undefined));
    } else {
      setPeriod(periodFromMode(mode));
    }
  };

  if (authLoading || companyLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAuthorized) return <Navigate to="/" replace />;

  const loadingAny =
    campaignsLoading || insightsLoading || googleCampaignsLoading || googleInsightsLoading;

  return (
    <BudgetModeContext.Provider value={budgetModeByCampaign}>
    <DashboardTableContext.Provider value={tableCtx}>
    <div className="space-y-5">
      {/* Sticky header */}
      <div className="sticky top-16 z-30 -mx-6 px-6 py-4 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Tráfego Pago</h1>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Live
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                Atualizado há {secondsAgo}s
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-xs">
              {freshness.map((f) => (
                <span
                  key={f.key}
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    f.stale ? "text-amber-500 font-medium" : "text-muted-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: PLATFORM_COLOR_VAR[f.key] }}
                  />
                  {PLATFORM_LABEL[f.key]}: {f.label}
                  {f.stale && f.days != null && ` · desactualizado há ${f.days}d`}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Campanhas: {campaigns?.length ?? 0}
              {" "}({(campaigns ?? []).filter((c) => c.status === "ACTIVE" && c.replaced_by_strategy_id == null).length} activas,
              {" "}{(campaigns ?? []).filter((c) => c.status === "PAUSED" && c.replaced_by_strategy_id == null).length} pausadas,
              {" "}{(campaigns ?? []).filter((c) => c.replaced_by_strategy_id != null).length} substituídas)
              {" "}· contas: {adAccountsCount}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => handleSync("incremental")} disabled={syncing}>
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sincronizar agora
            </Button>
            <Button
              onClick={handleFullSync}
              disabled={syncing}
              variant="outline"
              size="sm"
              title="Sync histórico completo (últimos 30 dias) — consome quota"
            >
              <DownloadCloud className="mr-2 h-4 w-4" />
              Sync histórico
            </Button>
          </div>
        </div>

        {/* Period tabs */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {([
            { k: "yesterday", l: "Ontem" },
            { k: "7d", l: "7 dias" },
            { k: "30d", l: "30 dias" },
          ] as const).map((p) => (
            <Button
              key={p.k}
              size="sm"
              variant={period.mode === p.k ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setMode(p.k)}
            >
              {p.l}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant={period.mode === "custom" ? "default" : "outline"}
                className="h-7 text-xs"
              >
                <CalendarIcon className="mr-1.5 h-3 w-3" />
                {period.mode === "custom"
                  ? `${format(period.from, "dd/MM")} – ${format(period.to, "dd/MM")}`
                  : "Personalizado"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{ from: customRange.from, to: customRange.to }}
                onSelect={(range) => {
                  setCustomRange({ from: range?.from, to: range?.to });
                  if (range?.from && range?.to) {
                    setPeriod({ mode: "custom", from: range.from, to: range.to });
                  }
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground/40 mx-1">·</span>

          {([
            { k: "all", l: "Todas" },
            { k: "meta", l: "Meta" },
            { k: "google", l: "Google" },
          ] as const).map((p) => (
            <Button
              key={`plat-${p.k}`}
              size="sm"
              variant={platformFilter === p.k ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setPlatformFilter(p.k)}
              title="Filtro de plataforma — afecta KPIs, gráficos, funil, cards e tabela"
            >
              {p.l}
            </Button>
          ))}

          <span className="text-muted-foreground/40 mx-1">·</span>

          {([
            { k: "active", l: "Activas" },
            { k: "paused", l: "Pausadas" },
            { k: "all", l: "Todas" },
            { k: "replaced", l: "Substituídas" },
          ] as const).map((s) => (
            <Button
              key={s.k}
              size="sm"
              variant={statusFilter === s.k ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setStatusFilter(s.k)}
            >
              {s.l}
            </Button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="ROAS"
          big={formatRoas(kpis.roas.value)}
          delta={kpis.roas.delta}
          subtitle={`Receita / Gasto · meta do evento ${DEFAULT_TARGET_ROAS}x por omissão`}
          accent="primary"
          direction="up-good"
          comparable={comparable}
        />
        <KpiCard
          label="Investimento"
          big={formatCurrency(kpis.spend.value, currency)}
          delta={kpis.spend.delta}
          subtitle="Soma do período"
          direction="neutral"
          comparable={comparable}
        />
        <KpiCard
          label="Receita atribuída"
          big={formatCurrency(kpis.revenue.value, currency)}
          delta={kpis.revenue.delta}
          subtitle="Compras × valor"
          direction="up-good"
          comparable={comparable}
        />
        <KpiCard
          label="Conversões"
          big={kpis.conv.value > 0 ? String(kpis.conv.value) : "0"}
          delta={kpis.conv.delta}
          subtitle="Compras no período"
          direction="up-good"
          comparable={comparable}
          secondary={`CPA ${formatCurrency(kpis.cpa.value, currency)}`}
        />
        <KpiCard
          label="Ticket médio"
          big={formatCurrency(kpis.ticket.value, currency)}
          delta={kpis.ticket.delta}
          subtitle="Receita / compra"
          direction="up-good"
          comparable={comparable}
        />
        <KpiCard
          label="CPM"
          big={formatCurrency(kpis.cpm.value, currency)}
          delta={kpis.cpm.delta}
          subtitle="Custo por mil impressões"
          direction="up-bad"
          comparable={comparable}
          secondary={`CTR ${kpis.ctr.value != null ? (kpis.ctr.value * 100).toFixed(2) + "%" : "—"}`}
        />
        <KpiCard
          label="Impressões"
          big={formatCompact(kpis.impressions.value)}
          delta={kpis.impressions.delta}
          subtitle="Soma do período"
          direction="neutral"
          comparable={comparable}
        />
        <KpiCard
          label="Alcance"
          big={formatCompact(kpis.reach.value)}
          delta={kpis.reach.delta}
          subtitle="Soma não deduplicada por dia"
          direction="neutral"
          comparable={comparable}
        />
      </div>

      {/* Alertas accionáveis do período */}
      <AlertsBar
        alerts={alerts}
        onReviewBudgets={() =>
          eventsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      />

      {/* Investimento vs receita por dia + ROAS diário */}
      <DailyPerformanceChart insights={periodInsights} from={period.from} to={period.to} currency={currency} />

      {/* Funil de conversão do período */}
      <ConversionFunnelPanel insights={periodInsights} />

      {/* By active event */}
      <section className="space-y-3" ref={eventsSectionRef}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Por evento ativo
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportCsv}>
              <FileDown className="mr-1.5 h-3 w-3" />
              Exportar CSV
            </Button>
            <ColumnPicker visible={visibleColumns} onToggle={toggleColumn} onReset={resetColumns} />
          </div>
        </div>

        {loadingAny ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : dashboardGroups.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhum evento ativo com campanhas Meta vinculadas neste período.
            </CardContent>
          </Card>
        ) : (
          dashboardGroups.map((g) => {
            const onEdited = () => qc.invalidateQueries({ queryKey: ["crm-meta-campaigns", companyId, adAccountId] });
            if (g.kind === "tour") {
              return (
                <TourFamilyCard
                  key={`tour:${g.master.id}`}
                  master={g.master}
                  splits={g.splits}
                  campaignsBySplit={g.campaignsBySplit}
                  masterCampaigns={g.masterCampaigns}
                  insightsByCampaign={insightsByCampaign}
                  prevInsightsByCampaign={previousInsightsByCampaign}
                  spark14ByCampaign={spark14ByCampaign}
                  days={periodDays}
                  currency={currency}
                  onAnalyze={analyzeCampaign}
                  onCoach={coachCampaign}
                  onToggleStatus={toggleCampaignStatus}
                  onActivate={openReactivateDialog}
                  togglingCampaignId={togglingCampaignId}
                  onEdited={onEdited}
                />
              );
            }
            return (
              <EventGroupCard
                key={`simple:${g.event.id}`}
                event={g.event}
                campaigns={g.campaigns}
                insightsByCampaign={insightsByCampaign}
                prevInsightsByCampaign={previousInsightsByCampaign}
                spark14ByCampaign={spark14ByCampaign}
                days={periodDays}
                currency={currency}
                onAnalyze={analyzeCampaign}
                onCoach={coachCampaign}
                onToggleStatus={toggleCampaignStatus}
                onActivate={openReactivateDialog}
                togglingCampaignId={togglingCampaignId}
                onEdited={onEdited}
              />
            );
          })
        )}
      </section>

      {/* Orphan campaigns */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Campanhas sem evento ativo vinculado
          </h2>
          <Badge variant="secondary" className="text-xs">
            {orphanCampaigns.length}
          </Badge>
        </div>
        {orphanCampaigns.length > 0 && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Estas campanhas não foram associadas automaticamente a nenhum evento ativo. Pode atribuir manualmente clicando na linha.
          </p>
        )}
        {loadingAny ? (
          <Skeleton className="h-32 w-full" />
        ) : orphanCampaigns.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-xs text-muted-foreground">
              Todas as campanhas ativas estão vinculadas a um evento.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <CampaignTableHeader />
                <tbody>
                  {sortCampaigns(orphanCampaigns, insightsByCampaign, sort).map((c) => (
                    <CampaignTableRow
                      key={c.id}
                      c={c}
                      insights={insightsByCampaign.get(c.external_campaign_id) ?? []}
                      prevInsights={previousInsightsByCampaign.get(c.external_campaign_id) ?? []}
                      days={periodDays}
                      spark={spark14ByCampaign.get(c.external_campaign_id) ?? []}
                      currency={currency}
                      onAnalyze={analyzeCampaign}
                      onCoach={coachCampaign}
                      onToggleStatus={toggleCampaignStatus}
                      onActivate={openReactivateDialog}
                      toggling={togglingCampaignId === c.external_campaign_id}
                      onEdited={() => qc.invalidateQueries({ queryKey: ["crm-meta-campaigns", companyId, adAccountId] })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <CampaignAnalysisSheet
        open={!!analyzeTarget}
        onOpenChange={(o) => {
          if (!o) setAnalyzeTarget(null);
        }}
        campaignId={analyzeTarget?.id ?? null}
        campaignName={analyzeTarget?.name ?? ""}
        campaigns={campaigns ?? []}
        currency={currency}
        period={period}
        periodDays={periodDays}
      />

      <AudienceCoachSheet
        open={!!coachCampaignId}
        onOpenChange={(o) => {
          if (!o) setCoachCampaignId(null);
        }}
        campaignId={coachCampaignId}
        connectionId={connectionId}
        adAccountId={adAccountId}
      />


      <ReactivateCampaignDialog
        open={reactivateDialogOpen}
        onOpenChange={setReactivateDialogOpen}
        campaignName={reactivateCampaign?.name}
        hasRunBefore={reactivateHasRunBefore}
        onConfirm={(reason) =>
          reactivateCampaign
            ? toggleCampaignStatus(reactivateCampaign, "ACTIVE", reason)
            : Promise.resolve()
        }
      />

    </div>
    </DashboardTableContext.Provider>
    </BudgetModeContext.Provider>
  );
}

