import { useEffect, useMemo, useState, useRef } from "react";

import { Navigate, useNavigate } from "react-router-dom";
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
  FileDown,
  DownloadCloud,
  Wand2,
  Pause,
  Play,
  AlertTriangle,
  Pencil,
  MapPin,
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
import { computeScore } from "@/lib/campaign-score";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRoleBudgetCap } from "@/hooks/useRoleBudgetCap";
import { useCompany } from "@/hooks/useCompany";
import { useAdAccountSelection } from "@/hooks/useAdAccountSelection";
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
export interface CampaignRow {
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
  linked_event_locked: boolean | null;
  currency: string | null;
  bid_strategy: string | null;
  replaced_by_strategy_id: string | null; // Sprint 3a-1 — marca campanha substituída por redesign
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
  event_type: string | null;       // 'simple' | 'tour_master' | 'tour_split'
  parent_event_id: string | null;  // null for simple/master; master id for split
}

// Dashboard hierárquico: simple events vs tour families (master + splits).
type SimpleGroup = { kind: "simple"; event: EventRow; campaigns: CampaignRow[] };
type TourGroup = {
  kind: "tour";
  master: EventRow;
  splits: EventRow[];
  campaignsBySplit: Map<string, CampaignRow[]>;
  masterCampaigns: CampaignRow[]; // campanhas linkadas ao master directamente (não atribuídas a split)
};
type DashboardGroup = SimpleGroup | TourGroup;

import type { PeriodMode, PeriodState } from "@/lib/crm/period";
import { periodFromMode } from "@/lib/crm/period";

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
// Bandas para CAMPANHA INDIVIDUAL (avaliação por fase do funil — ROAS individual não é a meta principal).
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

// Banda do ROAS BLENDED por EVENTO (target Mundo Propício = 8x agregado).
const EVENT_TARGET_ROAS = 8;
function roasColorByEvent(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "text-muted-foreground";
  if (roas >= 8) return "text-emerald-500";
  if (roas >= 6) return "text-amber-500";
  if (roas >= 4) return "text-orange-500";
  return "text-red-500";
}
function roasBadgeClassByEvent(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "bg-muted text-muted-foreground";
  if (roas >= 8) return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (roas >= 6) return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (roas >= 4) return "bg-orange-500/15 text-orange-500 border border-orange-500/30";
  return "bg-red-500/15 text-red-500 border border-red-500/30";
}
function roasBarBgByEvent(roas: number | null | undefined): string {
  if (roas === null || roas === undefined) return "bg-muted-foreground";
  if (roas >= 8) return "bg-emerald-500";
  if (roas >= 6) return "bg-amber-500";
  if (roas >= 4) return "bg-orange-500";
  return "bg-red-500";
}

// Range de datas a partir das splits de um tour_master.
// Devolve "dd-dd MMM yyyy · N datas" quando há mais de uma data; "dd MMM yyyy" para uma só.
function formatTourDateRange(splits: EventRow[]): string | null {
  const datesIso = splits.map((s) => s.date).filter((d): d is string => !!d);
  if (datesIso.length === 0) return null;
  const dates = datesIso.map((d) => parseISO(d)).sort((a, b) => a.getTime() - b.getTime());
  const count = dates.length;
  const first = dates[0];
  const last = dates[count - 1];
  if (count === 1) return `${format(first, "dd MMM yyyy", { locale: ptBR })} · 1 data`;
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${format(first, "dd", { locale: ptBR })}–${format(last, "dd MMM yyyy", { locale: ptBR })} · ${count} datas`;
  }
  return `${format(first, "dd MMM", { locale: ptBR })} → ${format(last, "dd MMM yyyy", { locale: ptBR })} · ${count} datas`;
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

// Period selector helpers extraídos para src/lib/crm/period.ts

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
// Edit Campaign Popover (inline)
// ============================================================
export function EditCampaignPopover({ c, onSaved }: { c: CampaignRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(c.name);
  const [dailyEur, setDailyEur] = useState(
    c.daily_budget_cents ? (c.daily_budget_cents / 100).toFixed(2) : "",
  );
  const [endDate, setEndDate] = useState(c.stop_time ? c.stop_time.slice(0, 10) : "");
  const [roasGoal, setRoasGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const { capEur } = useRoleBudgetCap();

  const supportsRoas = c.bid_strategy === "LOWEST_COST_WITH_MIN_ROAS";

  const handleApply = async () => {
    const updates: any = {};
    if (name.trim() && name.trim() !== c.name) updates.name = name.trim();
    if (dailyEur) {
      const n = parseFloat(dailyEur.replace(",", "."));
      if (Number.isFinite(n) && n > 0) {
        const cents = Math.round(n * 100);
        if (cents !== c.daily_budget_cents) updates.daily_budget_cents = cents;
      }
    }
    if (endDate) updates.end_time = `${endDate}T23:59:59Z`;
    if (supportsRoas && roasGoal) {
      const r = parseFloat(roasGoal.replace(",", "."));
      if (Number.isFinite(r) && r > 0) updates.roas_average_floor = r;
    }
    if (Object.keys(updates).length === 0) {
      toast.info("Nada para alterar.");
      return;
    }
    // Guardrail client-side (1ª linha; o servidor revalida). Só bloqueia se já
    // sabemos o cap (number). null = sem limite; undefined = a carregar → deixa
    // passar e confia no servidor.
    if (typeof updates.daily_budget_cents === "number" && typeof capEur === "number") {
      if (capEur === 0) {
        toast.error("Sem autoridade para alterar verba", {
          description: "O teu role não está autorizado a definir orçamentos. Pede a um admin.",
        });
        return;
      }
      const attemptedEur = updates.daily_budget_cents / 100;
      if (attemptedEur > capEur) {
        toast.error("Verba diária excede o limite", {
          description: `Verba diária €${attemptedEur} excede o limite de €${capEur}/dia para o teu role. Pede revisão a um admin.`,
        });
        return;
      }
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: c.connection_id,
          entity_type: "campaign",
          external_id: c.external_campaign_id,
          action: "update",
          ad_account_id: c.ad_account_id,
          updates,
        },
      });
      if (error) {
        let detail = error.message;
        if ((error as any).context) {
          try {
            const ctx = (error as any).context;
            const b = await (ctx.clone ? ctx.clone() : ctx).json();
            detail = b?.message || b?.detail || b?.error || detail;
          } catch {}
        }
        throw new Error(detail);
      }
      if (data?.ok === false) throw new Error(data?.message ?? data?.detail ?? data?.error ?? "Falha");
      toast.success(`Campanha "${c.name}" actualizada.`);
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error("Falha a actualizar no Meta", { description: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          title="Editar campanha"
          onClick={(e) => e.stopPropagation()}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 z-[100]"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`edit-name-${c.id}`} className="text-xs">Nome</Label>
            <Input id={`edit-name-${c.id}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`edit-daily-${c.id}`} className="text-xs">Verba diária (€)</Label>
            <Input
              id={`edit-daily-${c.id}`}
              type="number"
              step="0.01"
              min="0"
              value={dailyEur}
              onChange={(e) => setDailyEur(e.target.value)}
            />
            {capEur === null ? (
              <p className="text-[11px] text-muted-foreground">Limite: sem restrição</p>
            ) : capEur === 0 ? (
              <p className="text-[11px] text-destructive">Sem autoridade para alterar verba</p>
            ) : typeof capEur === "number" ? (
              <p className="text-[11px] text-muted-foreground">Limite: €{capEur}/dia</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data de fim (opcional)</Label>
            <DatePicker value={endDate} onChange={setEndDate} />
          </div>
          {supportsRoas && (
            <div className="space-y-1">
              <Label htmlFor={`edit-roas-${c.id}`} className="text-xs">ROAS goal (ex: 4.5)</Label>
              <Input
                id={`edit-roas-${c.id}`}
                type="number"
                step="0.1"
                min="0"
                placeholder="—"
                value={roasGoal}
                onChange={(e) => setRoasGoal(e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleApply} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// Reassign Campaign to Split (popover) — para tour_master families
// ============================================================
function ReassignCampaignToSplit({
  campaign,
  master,
  splits,
  onReassigned,
}: {
  campaign: CampaignRow;
  master: EventRow;
  splits: EventRow[];
  onReassigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initialId = campaign.linked_event_id ?? master.id;
  const [pendingId, setPendingId] = useState<string>(initialId);
  // Default lock=true: reassignment manual deve ficar pegado contra auto-linker.
  // Se a campanha já estava locked, mantém-se locked; se não estava, fica locked após Apply.
  const [lock, setLock] = useState<boolean>(campaign.linked_event_locked ?? true);
  const [saving, setSaving] = useState(false);

  // Re-sincroniza estado quando a popover abre (caso o user mude a campanha entretanto)
  useEffect(() => {
    if (open) {
      setPendingId(campaign.linked_event_id ?? master.id);
      setLock(campaign.linked_event_locked ?? true);
    }
  }, [open, campaign.linked_event_id, campaign.linked_event_locked, master.id]);

  const apply = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_snapshot")
        .update({ linked_event_id: pendingId, linked_event_locked: lock })
        .eq("id", campaign.id);
      if (error) throw error;
      toast.success("Linkage actualizado");
      setOpen(false);
      onReassigned();
    } catch (e: any) {
      toast.error(e?.message || "Falha a actualizar linkage");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="opacity-60 hover:opacity-100 transition-opacity p-1 rounded hover:bg-cyan-500/10"
          title="Apontar a uma cidade (split) ou ao master"
        >
          <MapPin className="h-3.5 w-3.5 text-cyan-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold mb-2">Apontar campanha a:</p>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="radio"
              name={`reassign-${campaign.id}`}
              checked={pendingId === master.id}
              onChange={() => setPendingId(master.id)}
              disabled={saving}
            />
            <span><strong>Master / blended</strong> · {master.name}</span>
          </label>
          {splits.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name={`reassign-${campaign.id}`}
                checked={pendingId === s.id}
                onChange={() => setPendingId(s.id)}
                disabled={saving}
              />
              <span>{s.name}{s.date && ` · ${format(parseISO(s.date), "dd MMM", { locale: ptBR })}`}</span>
            </label>
          ))}
        </div>
        <hr className="my-2 border-border" />
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={lock}
            onChange={(e) => setLock(e.target.checked)}
            disabled={saving}
          />
          <span>Bloquear contra auto-linker</span>
        </label>
        <Button size="sm" className="w-full mt-3" onClick={apply} disabled={saving || pendingId === initialId && lock === (campaign.linked_event_locked ?? false)}>
          {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
          Aplicar
        </Button>
      </PopoverContent>
    </Popover>
  );
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
  onToggleStatus,
  onActivate,
  toggling,
  onEdited,
  tourContext,
}: {
  c: CampaignRow;
  insights: InsightRow[];
  prevInsights: InsightRow[];
  days: number;
  currency: string;
  spark: number[];
  onAnalyze?: (id: string, name: string) => void;
  onCoach?: (id: string) => void;
  onToggleStatus?: (c: CampaignRow, target: "ACTIVE" | "PAUSED") => void;
  onActivate?: (c: CampaignRow) => void; // opens reactivate confirm dialog (substitui flow direct)
  toggling?: boolean;
  onEdited?: () => void;
  tourContext?: { master: EventRow; splits: EventRow[]; onReassigned: () => void };
}) {
  const isPaused = (c.effective_status ?? c.status) === "PAUSED";
  const isReplaced = c.replaced_by_strategy_id != null;
  const navigate = useNavigate();
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
      className={cn(
        "border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer",
        (isPaused || isReplaced) && "opacity-60",
      )}
      onClick={() => navigate(`/audience/campaigns/${c.external_campaign_id}`)}
    >
      <td className="py-2.5 px-3 max-w-[280px] font-medium text-sm">
        <div className="flex items-center gap-1.5 min-w-0">
          {isReplaced && (
            <Badge
              variant="outline"
              className="text-[9px] uppercase shrink-0 bg-cyan-500/10 text-cyan-300 border-cyan-500/30 px-1.5 py-0"
            >
              Substituída
            </Badge>
          )}
          {isPaused && (
            <Badge
              variant="secondary"
              className="text-[9px] uppercase shrink-0 bg-muted text-muted-foreground border-muted-foreground/30 px-1.5 py-0"
            >
              Pausada
            </Badge>
          )}
          <span className="truncate">{c.name}</span>
          {isReplaced && c.replaced_by_strategy_id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/audience/strategies/${c.replaced_by_strategy_id}`);
              }}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 underline shrink-0"
              title="Abrir nova strategy"
            >
              Ver nova strategy →
            </button>
          )}
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
        <Sparkline data={spark} className={(isPaused || isReplaced) ? "opacity-40" : undefined} />
      </td>
      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          {(() => {
            const eff = c.effective_status ?? c.status ?? null;
            const isActive = eff === "ACTIVE";
            const isPaused = eff === "PAUSED";
            if (isReplaced) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 rounded px-2 py-0.5 cursor-help">
                      gerida por strategy
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Esta campanha foi substituída por uma nova strategy. Acção via "Ver nova strategy →" ao lado do nome.</TooltipContent>
                </Tooltip>
              );
            }
            if (!isActive && !isPaused) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-muted-foreground border border-border rounded px-2 py-0.5 cursor-help">
                      {eff ?? "—"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Status não permite ação direta no Meta.</TooltipContent>
                </Tooltip>
              );
            }
            return (
              <Button
                size="sm"
                variant="outline"
                disabled={toggling || !onToggleStatus}
                onClick={() => {
                  if (isActive) {
                    if (!onToggleStatus) return;
                    if (!confirm(`Pausar campanha "${c.name}" no Meta? Pode reactivar depois.`)) return;
                    onToggleStatus(c, "PAUSED");
                  } else {
                    // Reactivate via Dialog dedicado (substitui chamada directa para minimizar pausa-acidental).
                    if (onActivate) { onActivate(c); return; }
                    if (onToggleStatus) onToggleStatus(c, "ACTIVE");
                  }
                }}
                className={cn(
                  "h-7 px-2 text-[11px]",
                  isActive
                    ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                    : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10",
                )}
              >
                {toggling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isActive ? (
                  <><Pause className="h-3 w-3 mr-1" />Pausar</>
                ) : (
                  <><Play className="h-3 w-3 mr-1" />Activar</>
                )}
              </Button>
            );
          })()}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px] border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
            onClick={(e) => {
              e.stopPropagation();
              window.location.assign(`/audience/audit/funnel-test?campaign_id=${encodeURIComponent(c.external_campaign_id)}`);
            }}
            title="Testar funil 360 desta campanha"
          >
            <Target className="h-3 w-3 mr-1" />Testar funil
          </Button>
          {tourContext && !isReplaced && (
            <ReassignCampaignToSplit
              campaign={c}
              master={tourContext.master}
              splits={tourContext.splits}
              onReassigned={tourContext.onReassigned}
            />
          )}
          {onEdited && <EditCampaignPopover c={c} onSaved={onEdited} />}
        </div>
      </td>
    </tr>
  );
}

function CampaignTableHeader() {
  return (
    <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
      <tr>
        <th className="py-2 px-3 text-left font-medium">Campanha</th>
        <th className="py-2 px-3 text-left font-medium">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                ROAS
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Avaliação por fase do funil — ROAS individual não é a meta principal. Meta = ROAS 8x blended por evento.
            </TooltipContent>
          </Tooltip>
        </th>
        <th className="py-2 px-3 text-left font-medium">Score</th>
        <th className="py-2 px-3 text-left font-medium">Gasto</th>
        <th className="py-2 px-3 text-left font-medium">Receita</th>
        <th className="py-2 px-3 text-left font-medium">CPC</th>
        <th className="py-2 px-3 text-left font-medium">Impr.</th>
        <th className="py-2 px-3 text-left font-medium">Conv.</th>
        <th className="py-2 px-3 text-left font-medium">Verba/dia</th>
        <th className="py-2 px-3 text-left font-medium">Tend. 14d</th>
        <th className="py-2 px-3 text-left font-medium">Status</th>
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
  onToggleStatus,
  onActivate,
  togglingCampaignId,
  onEdited,
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
  onToggleStatus?: (c: CampaignRow, target: "ACTIVE" | "PAUSED") => void;
  onActivate?: (c: CampaignRow) => void;
  togglingCampaignId?: string | null;
  onEdited?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const allInsights = useMemo(
    () => campaigns.flatMap((c) => insightsByCampaign.get(c.external_campaign_id) ?? []),
    [campaigns, insightsByCampaign],
  );
  const agg = aggregate(allInsights);
  const dailyBudget = campaigns.reduce((s, c) => s + (c.daily_budget_cents ?? 0), 0);
  const lifetimeBudget = campaigns.reduce((s, c) => s + (c.lifetime_budget_cents ?? 0), 0);

  // Projecção linear conservadora do ROAS blended até à data do evento.
  // (currentRevenue + roas14 × dailySpend14 × daysUntil) / (currentSpend + dailySpend14 × daysUntil)
  // Conservadora: não inclui uplift de urgência típico das últimas 3-4 semanas pré-evento.
  const projection = useMemo(() => {
    if (!event.date) return null;
    const eventDay = startOfDay(parseISO(event.date));
    const today = startOfDay(new Date());
    const daysUntilEvent = differenceInDays(eventDay, today);
    if (daysUntilEvent <= 0) return null;

    const fourteenAgo = subDays(today, 14).getTime();
    let spend14 = 0;
    let revenue14 = 0;
    for (const r of allInsights) {
      if (!r.date_start) continue;
      if (parseISO(r.date_start).getTime() < fourteenAgo) continue;
      spend14 += r.spend_cents ?? 0;
      revenue14 += r.purchases_value_cents ?? 0;
    }
    if (spend14 <= 0) return null;

    const dailySpendAvg = spend14 / 14;
    const roas14 = revenue14 / spend14;
    const projectedRevenue = agg.revenueCents + roas14 * dailySpendAvg * daysUntilEvent;
    const projectedSpend = agg.spendCents + dailySpendAvg * daysUntilEvent;
    if (projectedSpend <= 0) return null;
    return { daysUntilEvent, projectedBlended: projectedRevenue / projectedSpend };
  }, [allInsights, agg.revenueCents, agg.spendCents, event.date]);

  const progressPct = agg.roas != null && Number.isFinite(agg.roas)
    ? Math.min(100, Math.max(0, (agg.roas / EVENT_TARGET_ROAS) * 100))
    : null;

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
                  <span className={cn("font-semibold font-mono", roasColorByEvent(agg.roas))}>
                    {formatRoas(agg.roas)}
                  </span>{" "}
                  · Gasto {formatCurrency(agg.spendCents, currency)} · Receita{" "}
                  <span className="text-emerald-500/90">{formatCurrency(agg.revenueCents, currency)}</span>{" "}
                  · Conv. {agg.conversions}
                </div>
                {progressPct != null && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <div className="h-1.5 rounded bg-muted overflow-hidden w-[180px] shrink-0">
                      <div
                        className={cn("h-full transition-all", roasBarBgByEvent(agg.roas))}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatRoas(agg.roas)} / {EVENT_TARGET_ROAS}x → {progressPct.toFixed(0)}%
                    </span>
                  </div>
                )}
                {projection && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Projecção linear conservadora (não inclui uplift de urgência):{" "}
                    <span className={cn("font-mono font-semibold", roasColorByEvent(projection.projectedBlended))}>
                      {formatRoas(projection.projectedBlended)}
                    </span>{" "}
                    em {projection.daysUntilEvent}d
                    {projection.projectedBlended < EVENT_TARGET_ROAS && (
                      <span className="text-amber-500"> · Risco de não atingir meta — analisar</span>
                    )}
                  </div>
                )}
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
                    onToggleStatus={onToggleStatus}
                    onActivate={onActivate}
                    toggling={togglingCampaignId === c.external_campaign_id}
                    onEdited={onEdited}
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
// Tour Family Card (master + splits hierárquico)
// ============================================================
function TourFamilyCard({
  master,
  splits,
  campaignsBySplit,
  masterCampaigns,
  insightsByCampaign,
  prevInsightsByCampaign,
  spark14ByCampaign,
  days,
  currency,
  onAnalyze,
  onCoach,
  onToggleStatus,
  onActivate,
  togglingCampaignId,
  onEdited,
}: {
  master: EventRow;
  splits: EventRow[];
  campaignsBySplit: Map<string, CampaignRow[]>;
  masterCampaigns: CampaignRow[];
  insightsByCampaign: Map<string, InsightRow[]>;
  prevInsightsByCampaign: Map<string, InsightRow[]>;
  spark14ByCampaign: Map<string, number[]>;
  days: number;
  currency: string;
  onAnalyze?: (id: string, name: string) => void;
  onCoach?: (id: string) => void;
  onToggleStatus?: (c: CampaignRow, target: "ACTIVE" | "PAUSED") => void;
  onActivate?: (c: CampaignRow) => void;
  togglingCampaignId?: string | null;
  onEdited?: () => void;
}) {
  const [open, setOpen] = useState(true);

  const allCampaigns = useMemo(() => {
    const arr: CampaignRow[] = [...masterCampaigns];
    for (const [, cs] of campaignsBySplit) arr.push(...cs);
    return arr;
  }, [campaignsBySplit, masterCampaigns]);

  const allInsights = useMemo(
    () => allCampaigns.flatMap((c) => insightsByCampaign.get(c.external_campaign_id) ?? []),
    [allCampaigns, insightsByCampaign],
  );
  const aggAll = aggregate(allInsights);

  const tourContext = { master, splits, onReassigned: () => onEdited?.() };

  const dailyBudget = allCampaigns.reduce((s, c) => s + (c.daily_budget_cents ?? 0), 0);
  const lifetimeBudget = allCampaigns.reduce((s, c) => s + (c.lifetime_budget_cents ?? 0), 0);

  const tourDateLabel = formatTourDateRange(splits);

  const progressPct = aggAll.roas != null && Number.isFinite(aggAll.roas)
    ? Math.min(100, Math.max(0, (aggAll.roas / EVENT_TARGET_ROAS) * 100))
    : null;

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
                  <h3 className="font-semibold truncate">{master.name}</h3>
                  <Badge variant="outline" className="text-xs uppercase border-cyan-500/40 text-cyan-300">
                    Tour · {splits.length} {splits.length === 1 ? "cidade" : "cidades"}
                  </Badge>
                  {tourDateLabel && (
                    <Badge variant="outline" className="text-xs font-mono">{tourDateLabel}</Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {allCampaigns.length} {allCampaigns.length === 1 ? "campanha" : "campanhas"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  ROAS{" "}
                  <span className={cn("font-semibold font-mono", roasColorByEvent(aggAll.roas))}>
                    {formatRoas(aggAll.roas)}
                  </span>{" "}
                  · Gasto {formatCurrency(aggAll.spendCents, currency)} · Receita{" "}
                  <span className="text-emerald-500/90">{formatCurrency(aggAll.revenueCents, currency)}</span>{" "}
                  · Conv. {aggAll.conversions}
                </div>
                {progressPct != null && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <div className="h-1.5 rounded bg-muted overflow-hidden w-[180px] shrink-0">
                      <div
                        className={cn("h-full transition-all", roasBarBgByEvent(aggAll.roas))}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatRoas(aggAll.roas)} / {EVENT_TARGET_ROAS}x → {progressPct.toFixed(0)}% (blended tour)
                    </span>
                  </div>
                )}
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
          <div className="border-t border-border divide-y divide-border">
            {splits.map((s) => {
              const cs = campaignsBySplit.get(s.id) ?? [];
              const splitInsights = cs.flatMap((c) => insightsByCampaign.get(c.external_campaign_id) ?? []);
              const aggSplit = aggregate(splitInsights);
              return (
                <div key={s.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                    <h4 className="text-sm font-semibold">{s.name}</h4>
                    {s.date && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {format(parseISO(s.date), "dd MMM yyyy", { locale: ptBR })}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {cs.length} {cs.length === 1 ? "campanha" : "campanhas"}
                    </Badge>
                    {cs.length > 0 && (
                      <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                        ROAS{" "}
                        <span className={cn("font-semibold font-mono", roasColorByEvent(aggSplit.roas))}>
                          {formatRoas(aggSplit.roas)}
                        </span>{" "}
                        · {formatCurrency(aggSplit.spendCents, currency)} · {formatCurrency(aggSplit.revenueCents, currency)} · {aggSplit.conversions} conv.
                      </span>
                    )}
                  </div>
                  {cs.length === 0 ? (
                    <p className="text-xs text-muted-foreground/80 italic">Sem campanhas atribuídas a esta cidade. Re-aponta uma campanha do master abaixo via 📍.</p>
                  ) : (
                    <div className="overflow-x-auto rounded border border-border/40">
                      <table className="w-full">
                        <CampaignTableHeader />
                        <tbody>
                          {cs.map((c) => (
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
                              onToggleStatus={onToggleStatus}
                              onActivate={onActivate}
                              toggling={togglingCampaignId === c.external_campaign_id}
                              onEdited={onEdited}
                              tourContext={tourContext}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {masterCampaigns.length > 0 && (
              <div className="p-4 space-y-2 bg-amber-500/5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-300">
                      Master / blended · {masterCampaigns.length} {masterCampaigns.length === 1 ? "campanha não atribuída" : "campanhas não atribuídas"}
                    </p>
                    <p className="text-[11px] text-amber-200/80 mt-0.5">
                      Estas campanhas estão linkadas ao master — re-aponta a uma cidade (📍) para ver ROAS por split.
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto rounded border border-amber-500/30">
                  <table className="w-full">
                    <CampaignTableHeader />
                    <tbody>
                      {masterCampaigns.map((c) => (
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
                          onToggleStatus={onToggleStatus}
                          onActivate={onActivate}
                          toggling={togglingCampaignId === c.external_campaign_id}
                          onEdited={onEdited}
                          tourContext={tourContext}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
  const { active } = useAdAccountSelection();

  const [period, setPeriod] = useState<PeriodState>(periodFromMode("30d"));
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [syncing, setSyncing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastFetchRef = useRef<number>(Date.now());
  const [statusFilter, setStatusFilter] = useState<"active" | "paused" | "all" | "replaced">("active");

  // Reactivate dialog (substitui window.confirm para activate; pause mantém confirm).
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [reactivateCampaign, setReactivateCampaign] = useState<CampaignRow | null>(null);

  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeData, setAnalyzeData] = useState<any>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeCampaignId, setAnalyzeCampaignId] = useState<string | null>(null);
  const [analyzeCampaignName, setAnalyzeCampaignName] = useState<string>("");
  const [analyzeHistory, setAnalyzeHistory] = useState<any[]>([]);
  const [analyzeTab, setAnalyzeTab] = useState<string>("resumo");

  // Audit trail meta_campaign_changes — tab "Mudanças" + apply-action dialog
  const [changes, setChanges] = useState<any[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyAction, setApplyAction] = useState<{ idx: number; action: any } | null>(null);
  const [applyMeasureImpact, setApplyMeasureImpact] = useState(false);
  const [applyActionType, setApplyActionType] = useState<"pause" | "activate">("pause");
  const [applyAutoDetected, setApplyAutoDetected] = useState(false);
  const [applyReason, setApplyReason] = useState("");
  const [applyLoading, setApplyLoading] = useState(false);

  const loadHistory = async (campaignId: string) => {
    try {
      const { data } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_diagnoses")
        .select("id, created_at, overall_score, severity, summary_text, period_from, period_to, ai_model, diagnosis_jsonb")
        .eq("external_campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(5);
      setAnalyzeHistory(data ?? []);
    } catch {
      setAnalyzeHistory([]);
    }
  };

  const loadChanges = async (campaignId: string) => {
    setChangesLoading(true);
    try {
      const { data } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_changes")
        .select("id, applied_at, change_type, reason_text, triggered_by, applied_action_index, measure_impact_requested, before_jsonb, after_jsonb, impact_measured_at, impact_metrics_jsonb")
        .eq("external_campaign_id", campaignId)
        .order("applied_at", { ascending: false })
        .limit(10);
      setChanges(data ?? []);
    } catch {
      setChanges([]);
    } finally {
      setChangesLoading(false);
    }
  };

  const openApplyDialog = (idx: number, action: any, measureImpact: boolean) => {
    setApplyAction({ idx, action });
    setApplyMeasureImpact(measureImpact);
    // Auto-detect tipo de acção a partir do texto livre da IA (override no dialog).
    const txt = String(action?.action ?? "").toLowerCase();
    const isPause = /pausar|pause|stop|parar|desactivar|desativar/.test(txt);
    const isActivate = /ativar|activar|reativar|reactivar|activate|resume|retomar/.test(txt);
    setApplyActionType(isPause ? "pause" : isActivate ? "activate" : "pause");
    setApplyAutoDetected(isPause || isActivate);
    setApplyReason("");
    setApplyDialogOpen(true);
  };

  const submitApplyAction = async () => {
    if (!applyAction || !analyzeCampaignId) return;
    const a = applyAction.action;
    const entityType: string = a?.target_type;
    const externalId: string = a?.target_external_id;
    if (!entityType || !externalId || !["campaign", "adset", "ad"].includes(entityType)) {
      toast.error("Acção inválida: target_type/target_external_id em falta.");
      return;
    }
    const camp = campaigns?.find((c) => c.external_campaign_id === analyzeCampaignId);
    const connectionId = camp?.connection_id;
    if (!connectionId) {
      toast.error("Connection da campanha não encontrada.");
      return;
    }
    setApplyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: connectionId,
          entity_type: entityType,
          external_id: externalId,
          action: applyActionType,
          diagnosis_id: analyzeData?.diagnosis_id ?? null,
          applied_action_index: applyAction.idx + 1,
          triggered_by: "user_manual",
          reason_text: applyReason.trim() || null,
          measure_impact_requested: applyMeasureImpact,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      toast.success(
        applyActionType === "pause"
          ? (applyMeasureImpact ? "Entidade pausada. Medição de impacto agendada para D+7." : "Entidade pausada.")
          : (applyMeasureImpact ? "Entidade reactivada. Medição de impacto agendada para D+7." : "Entidade reactivada.")
      );
      setApplyDialogOpen(false);
      await loadChanges(analyzeCampaignId);
    } catch (e: any) {
      toast.error(e?.message || "Falha a aplicar acção");
    } finally {
      setApplyLoading(false);
    }
  };

  const analyzeCampaign = async (campaignId: string, campaignName: string) => {
    setAnalyzeOpen(true);
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setAnalyzeData(null);
    setAnalyzeCampaignId(campaignId);
    setAnalyzeCampaignName(campaignName);
    setAnalyzeTab("resumo");
    void loadHistory(campaignId);
    void loadChanges(campaignId);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-campaign-analyze", {
        body: {
          campaign_id: campaignId,
          days_back: periodDays,
          from: format(period.from, "yyyy-MM-dd"),
          to: format(period.to, "yyyy-MM-dd"),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setAnalyzeData(data);
      void loadHistory(campaignId);
    } catch (e: any) {
      setAnalyzeError(e?.message || "Erro desconhecido");
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const reanalyzeCampaign = () => {
    if (analyzeCampaignId) void analyzeCampaign(analyzeCampaignId, analyzeCampaignName);
  };

  const navigate = useNavigate();
  const [redesignLoading, setRedesignLoading] = useState(false);
  const [redesignDialogOpen, setRedesignDialogOpen] = useState(false);
  const [rdKeepBudget, setRdKeepBudget] = useState(true);
  const [rdDailyEur, setRdDailyEur] = useState<string>("");
  const [rdRoasGoal, setRdRoasGoal] = useState<string>("");
  const [rdEndTime, setRdEndTime] = useState<string>("");

  const openRedesignDialog = () => {
    if (!analyzeCampaignId) return;
    if (!analyzeData?.diagnosis_id) {
      toast.error("Faz primeiro um diagnóstico desta campanha.");
      return;
    }
    // Pré-popula com valor actual
    const camp = campaigns?.find((c) => c.external_campaign_id === analyzeCampaignId);
    const dailyEur = camp?.daily_budget_cents ? (camp.daily_budget_cents / 100).toFixed(2) : "";
    setRdKeepBudget(true);
    setRdDailyEur(dailyEur);
    setRdRoasGoal("");
    setRdEndTime("");
    setRedesignDialogOpen(true);
  };

  const submitRedesign = async () => {
    if (!analyzeCampaignId) return;
    const diagId = analyzeData?.diagnosis_id;
    if (!diagId) {
      toast.error("Faz primeiro um diagnóstico desta campanha.");
      return;
    }
    const constraints: any = { keep_original_budget: rdKeepBudget };
    if (!rdKeepBudget && rdDailyEur) {
      const n = parseFloat(rdDailyEur.replace(",", "."));
      if (Number.isFinite(n) && n > 0) constraints.daily_budget_cents = Math.round(n * 100);
    }
    if (rdRoasGoal) {
      const r = parseFloat(rdRoasGoal.replace(",", "."));
      if (Number.isFinite(r) && r > 0) constraints.roas_floor = r;
    }
    if (rdEndTime) constraints.end_time = `${rdEndTime}T23:59:59Z`;

    setRedesignLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-campaign-redesign", {
        body: { campaign_id: analyzeCampaignId, diagnosis_id: diagId, period_days: periodDays, constraints },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      if (!data?.strategy_id) throw new Error("Resposta inválida do servidor");
      toast.success("Re-design gerado. A abrir nova estratégia…");
      setRedesignDialogOpen(false);
      navigate(`/audience/strategies/${data.strategy_id}`);
    } catch (e: any) {
      toast.error(e?.message || "Falha a re-desenhar campanha");
    } finally {
      setRedesignLoading(false);
    }
  };

  const loadHistoricalDiagnosis = (h: any) => {
    // Reconstrói shape compatível com o sheet a partir do registo persistido
    setAnalyzeData({
      diagnosis_id: h.id,
      campaign: { name: analyzeCampaignName, external_campaign_id: analyzeCampaignId },
      period: { from: h.period_from, to: h.period_to },
      diagnosis: h.diagnosis_jsonb,
      severity: h.severity,
      overall_score: Number(h.overall_score) || 0,
      ai_model: h.ai_model,
      generated_at: h.created_at,
    });
    setAnalyzeTab("resumo");
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
      if (!connectionId || !adAccountId) {
        throw new Error("Sem ad account ativa.");
      }
      const { data, error } = await supabase.functions.invoke("crm-meta-audience-coach", {
        body: {
          connection_id: connectionId,
          ad_account_id: adAccountId,
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

  // ---------- Active ad account (multi-account support) ----------
  const adAccountId = active?.ad_account_id ?? null;
  const connectionId = active?.connection_id ?? null;
  const currency = active?.ad_account_currency || "EUR";

  // ---------- Toggle status (Pause/Activate) ----------
  const [togglingCampaignId, setTogglingCampaignId] = useState<string | null>(null);
  const toggleCampaignStatus = async (c: CampaignRow, target: "ACTIVE" | "PAUSED", reasonText?: string) => {
    if (!connectionId) {
      toast.error("Sem ligação Meta ativa.");
      return;
    }
    setTogglingCampaignId(c.external_campaign_id);
    try {
      const { data, error } = await supabase.functions.invoke("crm-meta-entity-action", {
        body: {
          connection_id: connectionId,
          entity_type: "campaign",
          external_id: c.external_campaign_id,
          action: target === "ACTIVE" ? "activate" : "pause",
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
      toast.success(
        target === "ACTIVE"
          ? `Campanha "${c.name}" activada (${data?.effective_status ?? "ACTIVE"})`
          : `Campanha "${c.name}" pausada`,
      );
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

  // ---------- Campaigns ----------
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["crm-meta-campaigns", companyId, adAccountId],
    enabled: isAuthorized && !!companyId && !!adAccountId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_snapshot")
        .select("*")
        .eq("ad_account_id", adAccountId)
        .order("updated_time", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  // ---------- Insights (last 60d to support sparkline + period + previous period) ----------
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ["crm-meta-insights", companyId, adAccountId],
    enabled: isAuthorized && !!companyId && !!adAccountId,
    queryFn: async () => {
      const sixtyAgo = subDays(startOfDay(new Date()), 60);
      const { data, error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_insights_daily")
        .select(
          "external_campaign_id, date_start, spend_cents, cpc_cents, ctr, impressions, clicks, purchases_count, purchases_value_cents, frequency, currency",
        )
        .eq("ad_account_id", adAccountId)
        .gte("date_start", format(sixtyAgo, "yyyy-MM-dd"));
      if (error) throw error;
      lastFetchRef.current = Date.now();
      setSecondsAgo(0);
      return (data ?? []) as InsightRow[];
    },
  });

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
  const { data: events } = useQuery({
    queryKey: ["crm-campaigns-events-tour", linkedEventIds.sort().join(",")],
    enabled: isAuthorized && linkedEventIds.length > 0,
    queryFn: async () => {
      const eventCols = "id, name, date, status, tickets_total, tickets_sold, event_type, parent_event_id";
      // Stage 1: events diretamente linkados às campanhas
      const { data: linkedData, error: err1 } = await supabase
        .from("events").select(eventCols).in("id", linkedEventIds);
      if (err1) throw err1;
      const linkedRows = (linkedData ?? []) as EventRow[];

      // Identificar masters envolvidos (linkados directamente OU pais de splits linkados)
      const masterIds = new Set<string>();
      for (const e of linkedRows) {
        if (e.event_type === "tour_master") masterIds.add(e.id);
        if (e.event_type === "tour_split" && e.parent_event_id) masterIds.add(e.parent_event_id);
      }
      if (masterIds.size === 0) return linkedRows;

      // Stage 2: para cada master envolvido, trazer o próprio master + TODAS as splits filhas
      // (mesmo as que não têm campanhas linkadas — para renderizar sub-card "Cidade Y · sem campanhas").
      const masterArr = [...masterIds];
      const masterArrCsv = masterArr.map((id) => `"${id}"`).join(",");
      const { data: familyData, error: err2 } = await supabase
        .from("events").select(eventCols)
        .or(`id.in.(${masterArrCsv}),parent_event_id.in.(${masterArrCsv})`);
      if (err2) throw err2;
      const familyRows = (familyData ?? []) as EventRow[];

      // Dedupe por id
      const m = new Map<string, EventRow>();
      for (const e of [...linkedRows, ...familyRows]) m.set(e.id, e);
      return [...m.values()];
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

    if (errors.length === 0) {
      toast.success(`Sync ${modeLabel} completa`, {
        description: `${cData?.synced_count ?? 0} campanhas · ${asData?.synced_count ?? 0} adsets · ${adData?.synced_count ?? 0} ads · ${iData?.synced_rows ?? 0} insights${cData?.auto_linked_count ? ` · ${cData.auto_linked_count} vinculadas a evento` : ""}`,
      });
    } else {
      toast.error(`Sync com ${errors.length} erro(s)`, { description: errors.join(" · ") });
    }

    qc.invalidateQueries({ queryKey: ["crm-meta-campaigns"] });
    qc.invalidateQueries({ queryKey: ["crm-meta-insights"] });
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

  const loadingAny = campaignsLoading || insightsLoading;

  return (
    <div className="space-y-5">

      {/* Toggle plataforma (Meta ↔ Google) */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        <div className="px-3 py-1.5 rounded-md text-xs font-medium bg-sky-500/10 text-sky-600 border border-sky-500/30">
          <Sparkles className="h-3.5 w-3.5 inline-block mr-1.5" />
          Meta Live
        </div>
        <a
          href="/crm/google-ads"
          className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5 inline-block mr-1.5" />
          Google Ads
        </a>
      </div>

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
              Última sync Meta: {lastSyncMeta ?? "—"} · campanhas: {campaigns?.length ?? 0}
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

      <Sheet open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              Diagnóstico IA da Campanha
            </SheetTitle>
            <SheetDescription>
              {analyzeData?.campaign?.name ?? analyzeCampaignName ?? "A processar…"}
            </SheetDescription>
          </SheetHeader>

          {analyzeCampaignId && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 mb-1"
              onClick={() => navigate(`/audience/campaigns/${analyzeCampaignId}`)}
            >
              Ver detalhe completo
            </Button>
          )}

          <div className="mt-6 space-y-6">
            {analyzeLoading && (
              <div className="flex flex-col items-center gap-3 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                <p className="text-sm text-muted-foreground">A analisar campanha + adsets + ads + criativos…</p>
                <p className="text-xs text-muted-foreground/70">Pode demorar 15-30s</p>
              </div>
            )}

            {analyzeError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm text-red-400">{analyzeError}</p>
              </div>
            )}

            {analyzeData && analyzeData.diagnosis && (() => {
              const d = analyzeData.diagnosis;
              const sev: string = analyzeData.severity ?? d.severity ?? "warning";
              const score: number = Number(analyzeData.overall_score ?? d.overall_score ?? 0);
              const sevColor =
                sev === "critical" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                sev === "warning" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
              const sevLabel = sev === "critical" ? "crítica" : sev === "warning" ? "atenção" : "saudável";
              const verdictColor = (v: string) =>
                v === "pause" ? "bg-red-500/15 text-red-400" :
                v === "scale" ? "bg-emerald-500/15 text-emerald-400" :
                v === "optimize" ? "bg-amber-500/15 text-amber-400" :
                "bg-muted text-muted-foreground";
              const prioColor = (p: string) =>
                p === "high" ? "bg-red-500/15 text-red-400" :
                p === "medium" ? "bg-amber-500/15 text-amber-400" :
                "bg-muted text-muted-foreground";

              return (
                <>
                  <div className={cn("rounded-lg border p-4 flex flex-col gap-4", sevColor)}>
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="text-3xl font-bold tabular-nums">{Math.round(score)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border border-current">
                            {sevLabel}
                          </span>
                        </div>
                        <p className="text-sm break-words">{d.summary_pt ?? ""}</p>
                      </div>
                    </div>
                    <div className="flex flex-row gap-2 sm:flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={reanalyzeCampaign} disabled={analyzeLoading || redesignLoading} className="flex-1 sm:flex-initial sm:w-auto">
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-analisar
                      </Button>
                      {analyzeData?.diagnosis_id && (() => {
                        const drawerCampaign = campaigns?.find((cc) => cc.external_campaign_id === analyzeCampaignId);
                        const drawerIsReplaced = drawerCampaign?.replaced_by_strategy_id != null;
                        return (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={openRedesignDialog}
                              disabled={analyzeLoading || redesignLoading || drawerIsReplaced}
                              className="flex-1 sm:flex-initial sm:w-auto border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                              title={drawerIsReplaced ? "Campanha já substituída" : "Re-design rápido (defaults da IA)"}
                            >
                              {redesignLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
                              Re-desenhar<span className="hidden sm:inline">&nbsp;(rápido)</span>
                            </Button>
                            {!drawerIsReplaced && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setAnalyzeOpen(false);
                                  navigate(`/audience/strategies/redesign/${analyzeCampaignId}`);
                                }}
                                disabled={analyzeLoading || redesignLoading}
                                className="flex-1 sm:flex-initial sm:w-auto border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                                title="Wizard 4 passos com revisão manual do inventário"
                              >
                                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                                Com herança<span className="hidden sm:inline">&nbsp;(wizard)</span>
                              </Button>
                            )}
                            {drawerIsReplaced && drawerCampaign && isAuthorized && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  if (!confirm("Reverter substituição? A campanha volta a contar como activa no dashboard.")) return;
                                  const { error } = await (supabase as any)
                                    .schema("crm")
                                    .from("meta_campaign_snapshot")
                                    .update({ replaced_by_strategy_id: null })
                                    .eq("id", drawerCampaign.id);
                                  if (error) {
                                    toast.error("Falha a reverter substituição: " + error.message);
                                    return;
                                  }
                                  toast.success("Substituição revertida.");
                                  qc.invalidateQueries({ queryKey: ["crm-meta-campaigns", companyId, adAccountId] });
                                }}
                                disabled={analyzeLoading || redesignLoading}
                                className="flex-1 sm:flex-initial sm:w-auto border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                                title="Limpa a flag replaced_by_strategy_id desta campanha"
                              >
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                Reverter substituição
                              </Button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <Tabs value={analyzeTab} onValueChange={setAnalyzeTab}>
                    <TabsList className="grid grid-cols-4 w-full">
                      <TabsTrigger value="resumo">Resumo</TabsTrigger>
                      <TabsTrigger value="detalhe">Detalhe</TabsTrigger>
                      <TabsTrigger value="historico">Histórico ({analyzeHistory.length})</TabsTrigger>
                      <TabsTrigger value="mudancas">Mudanças ({changes.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="resumo" className="space-y-5 mt-4">
                      {d.landing_concern?.suspected && (
                        <button
                          type="button"
                          onClick={() => { setAnalyzeOpen(false); navigate(`/audience/audit/campaign/${analyzeCampaignId}`); }}
                          className="w-full text-left rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 hover:bg-amber-500/20 transition-colors flex items-start gap-2"
                        >
                          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-amber-300">⚠️ Possível problema na landing page — Investigar</p>
                            {d.landing_concern.evidence && (
                              <p className="text-xs text-amber-200/80 mt-0.5">{d.landing_concern.evidence}</p>
                            )}
                          </div>
                          <span className="text-[10px] uppercase font-bold text-amber-300 self-center">Auditar →</span>
                        </button>
                      )}
                      {Array.isArray(d.top_3_actions) && d.top_3_actions.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> Top 3 ações prioritárias
                          </h4>
                          <div className="grid gap-2">
                            {d.top_3_actions.map((a: any, i: number) => {
                              const canApply = ["campaign","adset","ad"].includes(a?.target_type) && !!a?.target_external_id;
                              return (
                                <div key={i} className="rounded-lg border border-border bg-card p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
                                      #{i + 1}
                                    </span>
                                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                      {a.target_type}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/70 truncate">{a.target_external_id}</span>
                                  </div>
                                  <p className="text-sm font-medium">{a.action}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{a.rationale}</p>
                                  {a.expected_impact && (
                                    <p className="text-xs text-cyan-400/80 mt-1">→ {a.expected_impact}</p>
                                  )}
                                  {canApply && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() => openApplyDialog(i, a, false)}
                                      >
                                        Aplicar agora
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[11px] border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                                        onClick={() => openApplyDialog(i, a, true)}
                                      >
                                        Aplicar e medir 7d
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {d.campaign_diagnosis && (
                        <>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Pontos fortes
                            </h4>
                            <ul className="space-y-1.5">
                              {(d.campaign_diagnosis.strengths ?? []).map((s: string, i: number) => (
                                <li key={i} className="text-sm flex gap-2">
                                  <span className="text-emerald-400 mt-0.5">•</span><span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5 text-orange-400" /> Pontos fracos
                            </h4>
                            <ul className="space-y-1.5">
                              {(d.campaign_diagnosis.weaknesses ?? []).map((w: string, i: number) => (
                                <li key={i} className="text-sm flex gap-2">
                                  <span className="text-orange-400 mt-0.5">•</span><span>{w}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          {d.campaign_diagnosis.key_metrics_analysis && (
                            <div className="rounded-lg border border-border bg-card p-3">
                              <p className="text-xs uppercase text-muted-foreground mb-1">Análise de métricas</p>
                              <p className="text-sm whitespace-pre-line">{d.campaign_diagnosis.key_metrics_analysis}</p>
                            </div>
                          )}
                        </>
                      )}

                      {d.creative_insights && (
                        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                          <p className="text-xs uppercase text-cyan-400 mb-1">Cruzamento criativos × performance</p>
                          <p className="text-sm whitespace-pre-line">{d.creative_insights}</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="detalhe" className="space-y-6 mt-4">
                      {Array.isArray(d.adset_breakdown) && d.adset_breakdown.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Adsets ({d.adset_breakdown.length})
                          </h4>
                          <div className="rounded-lg border border-border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Nome</TableHead>
                                  <TableHead>Verdict</TableHead>
                                  <TableHead>Prioridade</TableHead>
                                  <TableHead>Razão / ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {d.adset_breakdown.map((a: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs font-medium align-top max-w-[180px] truncate" title={a.name}>{a.name}</TableCell>
                                    <TableCell className="align-top">
                                      <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded", verdictColor(a.verdict))}>
                                        {a.verdict}
                                      </span>
                                    </TableCell>
                                    <TableCell className="align-top">
                                      <span className={cn("text-[10px] uppercase px-1.5 py-0.5 rounded", prioColor(a.priority))}>
                                        {a.priority}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-xs align-top">
                                      <p className="text-foreground">{a.reason}</p>
                                      {Array.isArray(a.suggested_actions) && a.suggested_actions.length > 0 && (
                                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                          {a.suggested_actions.map((s: string, j: number) => (
                                            <li key={j}>→ {s}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      {Array.isArray(d.ad_breakdown) && d.ad_breakdown.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Ads ({d.ad_breakdown.length})
                          </h4>
                          <div className="rounded-lg border border-border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Nome</TableHead>
                                  <TableHead>Score criativo</TableHead>
                                  <TableHead>Verdict</TableHead>
                                  <TableHead>Razão / ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {d.ad_breakdown.map((a: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs font-medium align-top max-w-[180px] truncate" title={a.name}>{a.name}</TableCell>
                                    <TableCell className="text-xs align-top tabular-nums">
                                      {a.creative_score != null ? Math.round(a.creative_score) : "—"}
                                    </TableCell>
                                    <TableCell className="align-top">
                                      <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded", verdictColor(a.verdict))}>
                                        {a.verdict}
                                      </span>
                                      <div className="mt-0.5">
                                        <span className={cn("text-[10px] uppercase px-1.5 py-0.5 rounded", prioColor(a.priority))}>
                                          {a.priority}
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs align-top">
                                      <p className="text-foreground">{a.reason}</p>
                                      {Array.isArray(a.suggested_actions) && a.suggested_actions.length > 0 && (
                                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                          {a.suggested_actions.map((s: string, j: number) => (
                                            <li key={j}>→ {s}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="historico" className="mt-4">
                      {analyzeHistory.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem diagnósticos anteriores para esta campanha.</p>
                      ) : (
                        <div className="space-y-2">
                          {analyzeHistory.map((h) => (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => loadHistoricalDiagnosis(h)}
                              className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent/40 p-3 transition"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  "text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded",
                                  h.severity === "critical" ? "bg-red-500/15 text-red-400" :
                                  h.severity === "warning" ? "bg-amber-500/15 text-amber-400" :
                                  "bg-emerald-500/15 text-emerald-400"
                                )}>
                                  {h.severity === "critical" ? "crítica" : h.severity === "warning" ? "atenção" : "saudável"}
                                </span>
                                <span className="text-xs font-bold tabular-nums">{Math.round(Number(h.overall_score) || 0)}</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {new Date(h.created_at).toLocaleString("pt-PT")}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">{h.summary_text}</p>
                              <p className="text-[10px] text-muted-foreground/70 mt-1">
                                {h.period_from} → {h.period_to} · {h.ai_model}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="mudancas" className="mt-4">
                      {changesLoading ? (
                        <div className="py-8 flex justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : changes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sem mudanças registadas para esta campanha (mostra as últimas 10).</p>
                      ) : (
                        <div className="space-y-2">
                          {changes.map((c) => {
                            const impact = c.impact_metrics_jsonb?.delta;
                            return (
                              <div key={c.id} className="rounded-lg border border-border bg-card p-3 text-xs">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">
                                    {c.change_type}
                                  </span>
                                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    {c.triggered_by}
                                  </span>
                                  {c.applied_action_index != null && (
                                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                      acção #{c.applied_action_index}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                                    {new Date(c.applied_at).toLocaleString("pt-PT")}
                                  </span>
                                </div>
                                {c.reason_text && (
                                  <p className="text-foreground mb-1">{c.reason_text}</p>
                                )}
                                <div className="text-[10px] text-muted-foreground/80 font-mono">
                                  {c.before_jsonb?.status ?? "?"} → {c.after_jsonb?.status ?? "?"}
                                  {c.before_jsonb?.daily_budget_cents !== c.after_jsonb?.daily_budget_cents && (
                                    <> · budget {((c.before_jsonb?.daily_budget_cents ?? 0) / 100).toFixed(2)}€ → {((c.after_jsonb?.daily_budget_cents ?? 0) / 100).toFixed(2)}€</>
                                  )}
                                </div>
                                {impact ? (
                                  <p className="text-emerald-400 mt-1">
                                    Impacto D+7: ΔROAS {(impact.roas_abs ?? 0).toFixed(2)}x · ΔSpend €{(impact.spend_eur ?? 0).toFixed(2)} · ΔPurchases {impact.purchases_abs ?? 0}
                                  </p>
                                ) : c.measure_impact_requested ? (
                                  <p className="text-muted-foreground/70 mt-1">A aguardar medição de impacto (D+7)…</p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>

                  <div className="pt-4 border-t border-border flex items-center gap-2">
                    <p className="text-xs text-muted-foreground flex-1">
                      Gerado {new Date(analyzeData.generated_at).toLocaleString("pt-PT")}
                      {analyzeData.counts && (
                        <> · {analyzeData.counts.adsets ?? 0} adsets · {analyzeData.counts.ads ?? 0} ads · {analyzeData.counts.creatives_analyzed ?? 0}/{analyzeData.counts.creatives_total ?? 0} criativos analisados</>
                      )}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => printCampaignAnalysis(analyzeData)}
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>


      <Sheet open={coachOpen} onOpenChange={setCoachOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-400" />
              AI Audience Coach
            </SheetTitle>
            <SheetDescription>{coachData?.campaign?.name ?? "A processar..."}</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {coachLoading && (
              <div className="flex flex-col items-center gap-3 py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                <p className="text-sm text-muted-foreground">A analisar audiência...</p>
                <p className="text-xs text-muted-foreground/70">Pode demorar 15-30s</p>
              </div>
            )}

            {coachError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm text-red-400">{coachError}</p>
              </div>
            )}

            {coachData && coachData.coach && (
              <>
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Artista detetado:</span>
                    <span className="text-sm font-semibold text-purple-300">{coachData.detected_artist || "—"}</span>
                    <span className={cn(
                      "ml-auto text-xs font-semibold uppercase px-2 py-0.5 rounded",
                      coachData.coach.verdict === "excelente" ? "bg-emerald-500/15 text-emerald-400" :
                      coachData.coach.verdict === "bom" ? "bg-green-500/15 text-green-400" :
                      coachData.coach.verdict === "regular" ? "bg-amber-500/15 text-amber-400" :
                      coachData.coach.verdict === "fraco" ? "bg-orange-500/15 text-orange-400" :
                      "bg-red-500/15 text-red-400"
                    )}>{coachData.coach.verdict}</span>
                  </div>
                  <p className="text-sm">{coachData.coach.summary}</p>
                </div>

                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">🔍 Diagnóstico do targeting atual</h4>
                  <ul className="space-y-1.5">
                    {coachData.coach.diagnostic?.map((d: string, i: number) => (
                      <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">•</span><span>{d}</span></li>
                    ))}
                  </ul>
                </div>

                {coachData.coach.missed_opportunities?.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">💡 Oportunidades perdidas</h4>
                    <ul className="space-y-1.5">
                      {coachData.coach.missed_opportunities.map((o: string, i: number) => (
                        <li key={i} className="text-sm flex gap-2"><span className="text-amber-400">•</span><span>{o}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">🎯 Recomendações priorizadas</h4>
                  <div className="space-y-2">
                    {coachData.coach.recommendations?.map((r: any, i: number) => (
                      <div key={i} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start gap-2 mb-1.5">
                          <span className={cn(
                            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                            r.priority === "high" ? "bg-red-500/15 text-red-400" :
                            r.priority === "medium" ? "bg-amber-500/15 text-amber-400" :
                            "bg-muted text-muted-foreground"
                          )}>{r.priority}</span>
                          <p className="text-sm font-medium flex-1">{r.action}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1.5">{r.rationale}</p>
                        {r.how && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300">Como implementar →</summary>
                            <p className="mt-1.5 text-foreground/80 pl-3 border-l-2 border-cyan-500/30">{r.how}</p>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {coachData.coach.suggested_audiences?.length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">✨ Audiências sugeridas para testar</h4>
                    <div className="grid grid-cols-1 gap-2">
                      {coachData.coach.suggested_audiences.map((a: any, i: number) => (
                        <div key={i} className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-semibold">{a.name}</span>
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">{a.type}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{a.spec}</p>
                          <p className="text-xs text-cyan-400">{a.estimated_size}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-border text-xs text-muted-foreground">
                  Análise baseada em: {coachData.context_used.current_adsets} adsets · {coachData.context_used.top_performers_count} top performers · {coachData.context_used.interests_found} interesses · {coachData.context_used.custom_audiences_count} custom audiences. Gerada {new Date(coachData.generated_at).toLocaleString("pt-PT")}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printAudienceCoach(coachData)}
                  className="w-full"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Exportar análise como PDF
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialog: constraints pré-redesign */}
      <Dialog open={redesignDialogOpen} onOpenChange={setRedesignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-desenhar campanha</DialogTitle>
            <DialogDescription>
              Define as constraints. A IA vai respeitá-las exactamente em vez de inventar valores.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded border border-border p-3">
              <div>
                <Label htmlFor="rd-keep" className="text-sm font-medium">Manter verba actual</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Usa a verba diária/lifetime já configurada na campanha original.
                </p>
              </div>
              <Switch id="rd-keep" checked={rdKeepBudget} onCheckedChange={setRdKeepBudget} />
            </div>
            {!rdKeepBudget && (
              <div className="space-y-1.5">
                <Label htmlFor="rd-daily" className="text-xs">Verba diária (€)</Label>
                <Input
                  id="rd-daily"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="50.00"
                  value={rdDailyEur}
                  onChange={(e) => setRdDailyEur(e.target.value)}
                />
              </div>
            )}
            {(() => {
              const camp = campaigns?.find((c) => c.external_campaign_id === analyzeCampaignId);
              if (camp?.bid_strategy !== "LOWEST_COST_WITH_MIN_ROAS") return null;
              return (
                <div className="space-y-1.5">
                  <Label htmlFor="rd-roas" className="text-xs">ROAS goal (ex: 4.5 = 450%)</Label>
                  <Input
                    id="rd-roas"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="4.5"
                    value={rdRoasGoal}
                    onChange={(e) => setRdRoasGoal(e.target.value)}
                  />
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <Label className="text-xs">Data de fim (opcional)</Label>
              <DatePicker value={rdEndTime} onChange={setRdEndTime} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRedesignDialogOpen(false)} disabled={redesignLoading}>
              Cancelar
            </Button>
            <Button
              onClick={submitRedesign}
              disabled={redesignLoading}
              className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
              variant="outline"
            >
              {redesignLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
              Re-desenhar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aplicar acção #{(applyAction?.idx ?? 0) + 1}</DialogTitle>
            <DialogDescription className="space-y-1">
              <span className="block">{applyAction?.action?.action}</span>
              <span className="block text-[10px] text-muted-foreground/80">
                Target: {applyAction?.action?.target_type} · {applyAction?.action?.target_external_id}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Tipo de mudança</Label>
              <div className="mt-2 flex gap-2">
                <Button
                  variant={applyActionType === "pause" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setApplyActionType("pause")}
                  disabled={applyLoading}
                >
                  Pausar
                </Button>
                <Button
                  variant={applyActionType === "activate" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setApplyActionType("activate")}
                  disabled={applyLoading}
                >
                  Reactivar
                </Button>
              </div>
              {!applyAutoDetected && (
                <p className="text-[10px] text-amber-400 mt-1">
                  Não foi possível identificar o tipo de acção automaticamente — escolhe acima.
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/80 mt-1">
                Mudanças mais complexas (verba, end_time, targeting) ainda passam pela tabela de campanhas / re-design.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="apply-measure" className="text-sm">Medir impacto em D+7</Label>
              <Switch
                id="apply-measure"
                checked={applyMeasureImpact}
                onCheckedChange={setApplyMeasureImpact}
                disabled={applyLoading}
              />
            </div>
            <div>
              <Label htmlFor="apply-reason" className="text-xs uppercase text-muted-foreground">Razão (opcional)</Label>
              <Input
                id="apply-reason"
                value={applyReason}
                onChange={(e) => setApplyReason(e.target.value)}
                placeholder="ex: ROAS abaixo do floor por 3 dias consecutivos"
                disabled={applyLoading}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setApplyDialogOpen(false)} disabled={applyLoading}>
              Cancelar
            </Button>
            <Button size="sm" onClick={submitApplyAction} disabled={applyLoading}>
              {applyLoading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReactivateCampaignDialog
        open={reactivateDialogOpen}
        onOpenChange={setReactivateDialogOpen}
        campaignName={reactivateCampaign?.name}
        onConfirm={(reason) =>
          reactivateCampaign
            ? toggleCampaignStatus(reactivateCampaign, "ACTIVE", reason)
            : Promise.resolve()
        }
      />
    </div>
  );
}

