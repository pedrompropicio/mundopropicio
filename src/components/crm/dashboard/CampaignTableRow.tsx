import { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Loader2, Minus, Pause, Play, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { computeScore } from "@/lib/campaign-score";
import { cn } from "@/lib/utils";
import {
  aggregate,
  computeCpcAvg,
  computeCtrAvg,
  computeFreqAvg,
  computeSpendPerDay,
  computeVelRatio,
} from "@/lib/crm/aggregate";
import {
  formatCompact,
  formatCurrency,
  formatRoas,
  roasBadgeClass,
} from "@/lib/crm/dashboard-format";
import { BudgetModeContext } from "@/components/crm/dashboard/budget-mode-context";
import { EditCampaignPopover } from "@/components/crm/dashboard/EditCampaignPopover";
import { ReassignCampaignToSplit } from "@/components/crm/dashboard/ReassignCampaignToSplit";
import { Sparkline } from "@/components/crm/dashboard/Sparkline";
import type { CampaignRow, EventRow, InsightRow } from "@/components/crm/dashboard/types";

// ============================================================
// Campaign Row
// ============================================================
export function CampaignTableRow({
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
  const budgetModeByCampaign = useContext(BudgetModeContext);
  const agg = useMemo(() => aggregate(insights), [insights]);
  const aggPrev = useMemo(() => aggregate(prevInsights), [prevInsights]);
  const cpcAvg = computeCpcAvg(agg);
  const ctrAvg = computeCtrAvg(agg);

  // Weighted-average frequency (weighted by impressions); fall back to simple mean.
  const freqAvg = useMemo(() => computeFreqAvg(insights), [insights]);

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

  const spendPerDay = computeSpendPerDay(agg, days);
  const velRatio = computeVelRatio(agg, aggPrev, days);
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
          {onEdited && (
            <EditCampaignPopover
              c={c}
              onSaved={onEdited}
              budgetMode={budgetModeByCampaign.get(c.external_campaign_id)}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
