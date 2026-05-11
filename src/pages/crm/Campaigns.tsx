import { useEffect, useMemo, useState, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO, subDays, differenceInDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Calendar as CalendarIcon,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Sparkles,
  Target,
  CheckCircle2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { computeScore } from "@/lib/campaign-score";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================
interface CampaignRow {
  id: string;
  connection_id: string;
  ad_account_id: string;
  external_campaign_id: string;
  name: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget_cents: number | null;
  lifetime_budget_cents: number | null;
  start_time: string | null;
  stop_time: string | null;
  updated_time: string | null;
  last_synced_at: string;
  linked_event_id: string | null;
  currency: string | null;
}

interface InsightRow {
  external_campaign_id: string;
  date_start: string;
  spend_cents: number | null;
  cpc_cents: number | null;
  ctr: number | null;
  impressions: number | null;
  clicks: number | null;
  purchases_count: number | null;
  purchases_value_cents: number | null;
  frequency: number | null;
  currency: string | null;
}

interface ConnectionRow {
  id: string;
  status: string;
  selected_ad_account_id: string | null;
  selected_ad_account_name: string | null;
  selected_ad_account_currency: string | null;
  last_validated_at: string | null;
}

interface EventRow {
  id: string;
  name: string;
  date: string | null;
  status: string;
  tickets_total: number | null;
  tickets_sold: number | null;
}

type PeriodMode = "yesterday" | "7d" | "30d" | "custom";
interface PeriodState {
  mode: PeriodMode;
  from: Date;
  to: Date;
}

// ============================================================
// Helpers
// ============================================================
function formatCurrency(cents: number | null | undefined, currency = "EUR"): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function formatPercent(decimal: number | null | undefined, withSign = true): string {
  if (decimal === null || decimal === undefined || !Number.isFinite(decimal)) return "—";
  const pct = decimal * 100;
  const sign = withSign && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
function formatRoas(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}x`;
}
function roasColor(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "text-muted-foreground";
  if (roas >= 2) return "text-emerald-500";
  if (roas >= 1) return "text-amber-500";
  return "text-red-500";
}
function roasBadgeClass(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "bg-muted text-muted-foreground";
  if (roas >= 2) return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (roas >= 1) return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  return "bg-red-500/15 text-red-500 border border-red-500/30";
}

// ============================================================
// Sparkline (inline SVG, currentColor)
// ============================================================
function Sparkline({
  data,
  width = 80,
  height = 20,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!data || data.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  const first = data[0];
  const trend = last >= first ? "text-emerald-500" : "text-red-500";
  return (
    <svg width={width} height={height} className={cn(trend, className)}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// ============================================================
// KPI Card
// ============================================================
interface KpiProps {
  label: string;
  big: string;
  delta?: number | null; // signed decimal
  subtitle: string;
  accent?: "default" | "primary";
  invertDelta?: boolean; // for "spend" where increase isn't necessarily good
}
function KpiCard({ label, big, delta, subtitle, accent = "default", invertDelta = false }: KpiProps) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const positive = hasDelta && (invertDelta ? delta! < 0 : delta! > 0);
  const negative = hasDelta && (invertDelta ? delta! > 0 : delta! < 0);
  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        accent === "primary" &&
          "border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.04] to-transparent",
      )}
    >
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-4xl font-bold tabular-nums tracking-tight">{big}</div>
          {hasDelta && (
            <div
              className={cn(
                "flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                positive && "text-emerald-500",
                negative && "text-red-500",
                !positive && !negative && "text-muted-foreground",
              )}
            >
              {positive ? (
                <TrendingUp className="h-3 w-3" />
              ) : negative ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              {formatPercent(delta!)}
            </div>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Period selector
// ============================================================
function periodFromMode(mode: PeriodMode, custom?: { from: Date; to: Date }): PeriodState {
  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);
  if (mode === "yesterday") return { mode, from: yesterday, to: yesterday };
  if (mode === "7d") return { mode, from: subDays(today, 6), to: today };
  if (mode === "30d") return { mode, from: subDays(today, 29), to: today };
  return {
    mode: "custom",
    from: custom?.from ?? subDays(today, 6),
    to: custom?.to ?? today,
  };
}

// ============================================================
// Aggregation helpers
// ============================================================
interface Aggregate {
  spendCents: number;
  revenueCents: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number | null;
}
function emptyAgg(): Aggregate {
  return { spendCents: 0, revenueCents: 0, conversions: 0, impressions: 0, clicks: 0, roas: null };
}
function aggregate(rows: InsightRow[]): Aggregate {
  const a = emptyAgg();
  for (const r of rows) {
    a.spendCents += r.spend_cents ?? 0;
    a.revenueCents += r.purchases_value_cents ?? 0;
    a.conversions += r.purchases_count ?? 0;
    a.impressions += r.impressions ?? 0;
    a.clicks += r.clicks ?? 0;
  }
  a.roas = a.spendCents > 0 ? a.revenueCents / a.spendCents : null;
  return a;
}
function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return (curr - prev) / prev;
}

// ============================================================
// Campaign Row
// ============================================================
function CampaignTableRow({
  c,
  insights,
  prevInsights,
  days,
  currency,
  spark,
  onAnalyze,
  onCoach,
}: {
  c: CampaignRow;
  insights: InsightRow[];
  prevInsights: InsightRow[];
  days: number;
  currency: string;
  spark: number[];
  onAnalyze?: (id: string, name: string) => void;
  onCoach?: (id: string) => void;
}) {
  const agg = useMemo(() => aggregate(insights), [insights]);
  const aggPrev = useMemo(() => aggregate(prevInsights), [prevInsights]);
  const cpcAvg = agg.clicks > 0 ? Math.round(agg.spendCents / agg.clicks) : null;
  const ctrAvg = agg.impressions > 0 ? agg.clicks / agg.impressions : null;

  // Weighted-average frequency (weighted by impressions); fall back to simple mean.
  const freqAvg = useMemo(() => {
    let wf = 0;
    let wi = 0;
    let simpleSum = 0;
    let simpleN = 0;
    for (const r of insights) {
      const f = r.frequency;
      if (f == null || !Number.isFinite(f)) continue;
      simpleSum += f;
      simpleN += 1;
      const imp = r.impressions ?? 0;
      if (imp > 0) {
        wf += f * imp;
        wi += imp;
      }
    }
    if (wi > 0) return wf / wi;
    if (simpleN > 0) return simpleSum / simpleN;
    return null;
  }, [insights]);

  const score = useMemo(
    () =>
      computeScore({
        roas: agg.roas,
        ctr: ctrAvg,
        cpcCents: cpcAvg,
        frequency: freqAvg,
        spendCurrentCents: agg.spendCents,
        spendPrevCents: aggPrev.spendCents,
      }),
    [agg, aggPrev, ctrAvg, cpcAvg, freqAvg],
  );

  const spendPerDay = agg.spendCents / days;
  const prevSpendPerDay = aggPrev.spendCents / days;
  const velRatio = prevSpendPerDay > 0 ? spendPerDay / prevSpendPerDay : null;
  const velIcon =
    velRatio == null ? (
      <Minus className="h-3 w-3 text-muted-foreground" />
    ) : velRatio >= 1.05 ? (
      <ArrowUp className="h-3 w-3 text-emerald-500" />
    ) : velRatio <= 0.95 ? (
      <ArrowDown className="h-3 w-3 text-red-500" />
    ) : (
      <Minus className="h-3 w-3 text-muted-foreground" />
    );

  const breakdownText =
    `ROAS ${formatRoas(agg.roas)} → ${score.breakdown.roasPts}pts · ` +
    `CTR ${ctrAvg != null ? (ctrAvg * 100).toFixed(2) + "%" : "—"} → ${score.breakdown.ctrPts}pts · ` +
    `CPC ${formatCurrency(cpcAvg, currency)} → ${score.breakdown.cpcPts}pts · ` +
    `Freq ${freqAvg != null ? freqAvg.toFixed(1) : "—"} → ${score.breakdown.freqPts}pts · ` +
    `Vel ${velRatio != null ? velRatio.toFixed(2) + "x" : "—"} → ${score.breakdown.velPts}pts`;

  return (
    <tr
      className="border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer"
      onClick={() => console.log("[campaign click]", c.external_campaign_id, c.name)}
    >
      <td className="py-2.5 px-3 max-w-[280px] font-medium text-sm">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{c.name}</span>
          {onAnalyze && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAnalyze(c.external_campaign_id, c.name);
              }}
              className="opacity-60 hover:opacity-100 transition-opacity p-1 rounded hover:bg-cyan-500/10 shrink-0"
              title="Analisar com IA"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            </button>
          )}
          {onCoach && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCoach(c.external_campaign_id);
              }}
              className="opacity-60 hover:opacity-100 transition-opacity p-1 rounded hover:bg-purple-500/10 shrink-0"
              title="AI Audience Coach"
            >
              <Target className="h-3.5 w-3.5 text-purple-400" />
            </button>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span
          className={cn(
            "inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-semibold",
            roasBadgeClass(agg.roas),
          )}
        >
          {formatRoas(agg.roas)}
        </span>
      </td>
      <td className="py-2.5 px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-mono font-semibold cursor-help",
                score.gradeClass,
              )}
            >
              {score.grade} · {score.score}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">
            {breakdownText}
          </TooltipContent>
        </Tooltip>
      </td>
      <td className="py-2.5 px-3 text-sm font-mono tabular-nums">
        {formatCurrency(agg.spendCents, currency)}
      </td>
      <td className="py-2.5 px-3 text-sm font-mono tabular-nums text-emerald-500/90">
        {agg.revenueCents > 0 ? formatCurrency(agg.revenueCents, currency) : "—"}
      </td>
      <td className="py-2.5 px-3 text-sm font-mono tabular-nums text-muted-foreground">
        {formatCurrency(cpcAvg, currency)}
      </td>
      <td className="py-2.5 px-3 text-sm font-mono tabular-nums text-muted-foreground">
        {formatCompact(agg.impressions)}
      </td>
      <td className="py-2.5 px-3 text-sm font-mono tabular-nums">
        {agg.conversions > 0 ? agg.conversions : "—"}
      </td>
      <td className="py-2.5 px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-sm font-mono tabular-nums cursor-help">
              {formatCurrency(Math.round(spendPerDay), currency)}
              {velIcon}
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            Spend médio diário no período
            {velRatio != null && ` · vs anterior: ${(velRatio * 100).toFixed(0)}%`}
          </TooltipContent>
        </Tooltip>
      </td>
      <td className="py-2.5 px-3">
        <Sparkline data={spark} />
      </td>
    </tr>
  );
}

function CampaignTableHeader() {
  return (
    <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
      <tr>
        <th className="py-2 px-3 text-left font-medium">Campanha</th>
        <th className="py-2 px-3 text-left font-medium">ROAS</th>
        <th className="py-2 px-3 text-left font-medium">Score</th>
        <th className="py-2 px-3 text-left font-medium">Gasto</th>
        <th className="py-2 px-3 text-left font-medium">Receita</th>
        <th className="py-2 px-3 text-left font-medium">CPC</th>
        <th className="py-2 px-3 text-left font-medium">Impr.</th>
        <th className="py-2 px-3 text-left font-medium">Conv.</th>
        <th className="py-2 px-3 text-left font-medium">Verba/dia</th>
        <th className="py-2 px-3 text-left font-medium">Tend. 14d</th>
      </tr>
    </thead>
  );
}

// ============================================================
// Event Group Card
// ============================================================
function EventGroupCard({
  event,
  campaigns,
  insightsByCampaign,
  prevInsightsByCampaign,
  spark14ByCampaign,
  days,
  currency,
  onAnalyze,
  onCoach,
}: {
  event: EventRow;
  campaigns: CampaignRow[];
  insightsByCampaign: Map<string, InsightRow[]>;
  prevInsightsByCampaign: Map<string, InsightRow[]>;
  spark14ByCampaign: Map<string, number[]>;
  days: number;
  currency: string;
  onAnalyze?: (id: string, name: string) => void;
  onCoach?: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const allInsights = useMemo(
    () => campaigns.flatMap((c) => insightsByCampaign.get(c.external_campaign_id) ?? []),
    [campaigns, insightsByCampaign],
  );
  const agg = aggregate(allInsights);
  const dailyBudget = campaigns.reduce((s, c) => s + (c.daily_budget_cents ?? 0), 0);
  const lifetimeBudget = campaigns.reduce((s, c) => s + (c.lifetime_budget_cents ?? 0), 0);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{event.name}</h3>
                  {event.date && (
                    <Badge variant="outline" className="text-xs font-mono">
                      {format(parseISO(event.date), "dd/MM/yyyy")}
                    </Badge>
                  )}
                  {event.tickets_total !== null && event.tickets_total > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {event.tickets_sold ?? 0}/{event.tickets_total} bilhetes
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {campaigns.length} {campaigns.length === 1 ? "campanha" : "campanhas"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  ROAS{" "}
                  <span className={cn("font-semibold font-mono", roasColor(agg.roas))}>
                    {formatRoas(agg.roas)}
                  </span>{" "}
                  · Gasto {formatCurrency(agg.spendCents, currency)} · Receita{" "}
                  <span className="text-emerald-500/90">{formatCurrency(agg.revenueCents, currency)}</span>{" "}
                  · Conv. {agg.conversions}
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground tabular-nums hidden md:block">
              {dailyBudget > 0 && (
                <div>{formatCurrency(dailyBudget, currency)}/dia ativo</div>
              )}
              {lifetimeBudget > 0 && (
                <div>{formatCurrency(lifetimeBudget, currency)} lifetime</div>
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full">
              <CampaignTableHeader />
              <tbody>
                {campaigns.map((c) => (
                  <CampaignTableRow
                    key={c.id}
                    c={c}
                    insights={insightsByCampaign.get(c.external_campaign_id) ?? []}
                    prevInsights={prevInsightsByCampaign.get(c.external_campaign_id) ?? []}
                    days={days}
                    spark={spark14ByCampaign.get(c.external_campaign_id) ?? []}
                    currency={currency}
                    onAnalyze={onAnalyze}
                    onCoach={onCoach}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ============================================================
// Main Page
// ============================================================
export default function CrmCampaigns() {
  const { role, hasPermission, loading: authLoading } = useAuth();
  const { companyId, isLoading: companyLoading } = useCompany();
  const qc = useQueryClient();

  const [period, setPeriod] = useState<PeriodState>(periodFromMode("7d"));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [syncing, setSyncing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastFetchRef = useRef<number>(Date.now());

  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeData, setAnalyzeData] = useState<any>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const analyzeCampaign = async (campaignId: string, _campaignName: string) => {
    setAnalyzeOpen(true);
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setAnalyzeData(null);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-campaign-analyze", {
        body: { campaign_id: campaignId, days_back: 30 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setAnalyzeData(data);
    } catch (e: any) {
      setAnalyzeError(e?.message || "Erro desconhecido");
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const [coachOpen, setCoachOpen] = useState(false);
  const [coachData, setCoachData] = useState<any>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

  const coachCampaign = async (campaignId: string) => {
    setCoachOpen(true);
    setCoachLoading(true);
    setCoachError(null);
    setCoachData(null);
    try {
      if (!connection?.id || !connection?.selected_ad_account_id) {
        throw new Error("Sem conexão Meta ativa ou conta de anúncios selecionada.");
      }
      const { data, error } = await supabase.functions.invoke("crm-meta-audience-coach", {
        body: {
          connection_id: connection.id,
          ad_account_id: connection.selected_ad_account_id,
          campaign_id: campaignId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setCoachData(data);
    } catch (e: any) {
      setCoachError(e?.message || "Erro desconhecido");
    } finally {
      setCoachLoading(false);
    }
  };

  const isAuthorized =
    role === "admin" ||
    role === ("platform_admin" as any) ||
    role === ("marketing_manager" as any) ||
    hasPermission("crm.campaign.create");

  // ---------- Connection ----------
  const { data: connection } = useQuery({
    queryKey: ["crm-connection-meta-active", companyId],
    enabled: isAuthorized && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("ad_platform_connections")
        .select(
          "id, status, selected_ad_account_id, selected_ad_account_name, selected_ad_account_currency, last_validated_at",
        )
        .eq("platform", "meta")
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as ConnectionRow | null;
    },
  });
  const currency = connection?.selected_ad_account_currency || "EUR";

  // ---------- Campaigns ----------
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["crm-meta-campaigns", companyId],
    enabled: isAuthorized && !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_snapshot")
        .select("*")
        .order("updated_time", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  // ---------- Insights (last 60d to support sparkline + period + previous period) ----------
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ["crm-meta-insights", companyId],
    enabled: isAuthorized && !!companyId,
    queryFn: async () => {
      const sixtyAgo = subDays(startOfDay(new Date()), 60);
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_insights_daily")
        .select(
          "external_campaign_id, date_start, spend_cents, cpc_cents, ctr, impressions, clicks, purchases_count, purchases_value_cents, frequency, currency",
        )
        .gte("date_start", format(sixtyAgo, "yyyy-MM-dd"));
      if (error) throw error;
      lastFetchRef.current = Date.now();
      setSecondsAgo(0);
      return (data ?? []) as InsightRow[];
    },
  });

  // ---------- Events for active campaigns ----------
  const linkedEventIds = useMemo(
    () =>
      Array.from(
        new Set(
          (campaigns ?? [])
            .filter((c) => c.status === "ACTIVE" && c.linked_event_id)
            .map((c) => c.linked_event_id as string),
        ),
      ),
    [campaigns],
  );
  const { data: events } = useQuery({
    queryKey: ["crm-campaigns-events", linkedEventIds.sort().join(",")],
    enabled: isAuthorized && linkedEventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, tickets_total, tickets_sold")
        .in("id", linkedEventIds);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
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

  const previousInsights = useMemo(() => {
    if (!insights) return [];
    const days = differenceInDays(period.to, period.from) + 1;
    const prevTo = subDays(period.from, 1);
    const prevFrom = subDays(prevTo, days - 1);
    const fromStr = format(prevFrom, "yyyy-MM-dd");
    const toStr = format(prevTo, "yyyy-MM-dd");
    return insights.filter((r) => r.date_start >= fromStr && r.date_start <= toStr);
  }, [insights, period]);

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

  // 14-day spend sparkline per campaign
  const spark14ByCampaign = useMemo(() => {
    const m = new Map<string, number[]>();
    if (!insights) return m;
    const today = startOfDay(new Date());
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
  const kpis = useMemo(() => {
    return {
      roas: {
        value: aggCurrent.roas,
        delta:
          aggCurrent.roas !== null && aggPrev.roas !== null && aggPrev.roas > 0
            ? (aggCurrent.roas - aggPrev.roas) / aggPrev.roas
            : null,
      },
      spend: {
        value: aggCurrent.spendCents,
        delta: deltaPct(aggCurrent.spendCents, aggPrev.spendCents),
      },
      revenue: {
        value: aggCurrent.revenueCents,
        delta: deltaPct(aggCurrent.revenueCents, aggPrev.revenueCents),
      },
      conv: {
        value: aggCurrent.conversions,
        delta: deltaPct(aggCurrent.conversions, aggPrev.conversions),
      },
    };
  }, [aggCurrent, aggPrev]);

  // ---------- Group active campaigns by event ----------
  const eventsById = useMemo(() => {
    const m = new Map<string, EventRow>();
    (events ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [events]);

  const activeCampaigns = useMemo(
    () => (campaigns ?? []).filter((c) => c.status === "ACTIVE"),
    [campaigns],
  );

  const campaignsByEvent = useMemo(() => {
    const m = new Map<string, CampaignRow[]>();
    for (const c of activeCampaigns) {
      if (c.linked_event_id && eventsById.get(c.linked_event_id)?.status === "active") {
        const arr = m.get(c.linked_event_id) ?? [];
        arr.push(c);
        m.set(c.linked_event_id, arr);
      }
    }
    return m;
  }, [activeCampaigns, eventsById]);

  const orphanCampaigns = useMemo(
    () =>
      activeCampaigns.filter(
        (c) => !c.linked_event_id || eventsById.get(c.linked_event_id)?.status !== "active",
      ),
    [activeCampaigns, eventsById],
  );

  // ---------- Header counters ----------
  const lastSyncMeta = useMemo(() => {
    if (!campaigns || campaigns.length === 0) return null;
    const latest = campaigns
      .map((c) => c.last_synced_at)
      .filter(Boolean)
      .sort()
      .pop();
    if (!latest) return null;
    return formatDistanceToNow(parseISO(latest), { locale: ptBR, addSuffix: true });
  }, [campaigns]);

  const adAccountsCount = useMemo(() => {
    const set = new Set((campaigns ?? []).map((c) => c.ad_account_id));
    return set.size;
  }, [campaigns]);

  // ---------- Sync ----------
  const handleSync = async () => {
    if (!connection) {
      toast.error("Nenhuma conexão Meta ativa encontrada");
      return;
    }
    if (!connection.selected_ad_account_id) {
      toast.error("Selecione uma conta de anúncios primeiro em Conexões");
      return;
    }
    setSyncing(true);
    try {
      const params = {
        connection_id: connection.id,
        ad_account_id: connection.selected_ad_account_id,
      };
      const { data: cData, error: cErr } = await supabase.functions.invoke(
        "crm-meta-sync-campaigns",
        { body: params },
      );
      if (cErr) throw cErr;
      const { data: iData, error: iErr } = await supabase.functions.invoke(
        "crm-meta-sync-insights",
        { body: { ...params, days_back: 30 } },
      );
      if (iErr) throw iErr;
      toast.success(
        `Sync OK: ${cData?.synced_count ?? 0} campanhas, ${iData?.synced_rows ?? 0} insights`,
        {
          description:
            cData?.auto_linked_count
              ? `${cData.auto_linked_count} campanha(s) vinculada(s) a evento`
              : undefined,
        },
      );
      qc.invalidateQueries({ queryKey: ["crm-meta-campaigns"] });
      qc.invalidateQueries({ queryKey: ["crm-meta-insights"] });
    } catch (e: any) {
      console.error("[crm/campaigns] sync failed:", e);
      toast.error("Falha ao sincronizar", {
        description: e?.message ?? String(e),
      });
    } finally {
      setSyncing(false);
    }
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

  const loadingAny = campaignsLoading || insightsLoading;

  return (
    <div className="space-y-5">
      {/* Sticky header */}
      <div className="sticky top-16 z-30 -mx-6 px-6 py-4 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Dashboard Meta Live</h1>
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
            <p className="text-xs text-muted-foreground mt-1">
              Última sync Meta: {lastSyncMeta ?? "—"} · campanhas: {campaigns?.length ?? 0} · contas: {adAccountsCount}
            </p>
          </div>
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar agora
          </Button>
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
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="ROAS"
          big={formatRoas(kpis.roas.value)}
          delta={kpis.roas.delta}
          subtitle="Receita / Gasto"
          accent="primary"
        />
        <KpiCard
          label="Gasto total"
          big={formatCurrency(kpis.spend.value, currency)}
          delta={kpis.spend.delta}
          subtitle="Soma do período"
          invertDelta
        />
        <KpiCard
          label="Receita total"
          big={formatCurrency(kpis.revenue.value, currency)}
          delta={kpis.revenue.delta}
          subtitle="Compras × valor"
        />
        <KpiCard
          label="Conversões"
          big={kpis.conv.value > 0 ? String(kpis.conv.value) : "0"}
          delta={kpis.conv.delta}
          subtitle="Compras no período"
        />
      </div>

      {/* By active event */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Por evento ativo
        </h2>
        {loadingAny ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : campaignsByEvent.size === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhum evento ativo com campanhas Meta vinculadas neste período.
            </CardContent>
          </Card>
        ) : (
          Array.from(campaignsByEvent.entries()).map(([eventId, ec]) => {
            const event = eventsById.get(eventId);
            if (!event) return null;
            return (
              <EventGroupCard
                key={eventId}
                event={event}
                campaigns={ec}
                insightsByCampaign={insightsByCampaign}
                prevInsightsByCampaign={previousInsightsByCampaign}
                spark14ByCampaign={spark14ByCampaign}
                days={periodDays}
                currency={currency}
                onAnalyze={analyzeCampaign}
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
                  {orphanCampaigns.map((c) => (
                    <CampaignTableRow
                      key={c.id}
                      c={c}
                      insights={insightsByCampaign.get(c.external_campaign_id) ?? []}
                      prevInsights={previousInsightsByCampaign.get(c.external_campaign_id) ?? []}
                      days={periodDays}
                      spark={spark14ByCampaign.get(c.external_campaign_id) ?? []}
                      currency={currency}
                      onAnalyze={analyzeCampaign}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <Sheet open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              Análise IA da Campanha
            </SheetTitle>
            <SheetDescription>
              {analyzeData?.campaign?.name ?? "A processar…"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {analyzeLoading && (
              <div className="flex flex-col items-center gap-3 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                <p className="text-sm text-muted-foreground">A analisar dados...</p>
                <p className="text-xs text-muted-foreground/70">Pode demorar 10-20s</p>
              </div>
            )}

            {analyzeError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm text-red-400">{analyzeError}</p>
              </div>
            )}

            {analyzeData && analyzeData.analysis && (
              <>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded",
                      analyzeData.analysis.verdict === "excelente" ? "bg-emerald-500/15 text-emerald-400" :
                      analyzeData.analysis.verdict === "bom" ? "bg-green-500/15 text-green-400" :
                      analyzeData.analysis.verdict === "regular" ? "bg-amber-500/15 text-amber-400" :
                      analyzeData.analysis.verdict === "fraco" ? "bg-orange-500/15 text-orange-400" :
                      "bg-red-500/15 text-red-400"
                    )}>
                      {analyzeData.analysis.verdict}
                    </span>
                  </div>
                  <p className="text-sm">{analyzeData.analysis.summary}</p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Pontos fortes
                  </h4>
                  <ul className="space-y-1.5">
                    {analyzeData.analysis.strengths?.map((s: string, i: number) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-emerald-400 mt-0.5">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-orange-400" /> Pontos fracos
                  </h4>
                  <ul className="space-y-1.5">
                    {analyzeData.analysis.weaknesses?.map((w: string, i: number) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-orange-400 mt-0.5">•</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> Recomendações
                  </h4>
                  <div className="space-y-2">
                    {analyzeData.analysis.recommendations?.map((r: any, i: number) => (
                      <div key={i} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start gap-2">
                          <span className={cn(
                            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                            r.priority === "high" ? "bg-red-500/15 text-red-400" :
                            r.priority === "medium" ? "bg-amber-500/15 text-amber-400" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {r.priority}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{r.action}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{r.rationale}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Análise baseada em {analyzeData.period?.days_with_data ?? 0} dias de dados · Gerada {new Date(analyzeData.generated_at).toLocaleString("pt-PT")}
                  </p>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
